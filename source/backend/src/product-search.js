import { db } from "./db.js";

const endpoint = process.env.ELASTICSEARCH_URL;
const alias = "products-v1";
const index = `${alias}-data`;
const batchSize = 256;
const matchLimit = 50000;
const syncLock = 171604;

async function elastic(path, options = {}) {
  const { method = "GET", body, ndjson, missing = false, signal } = options;
  const response = await fetch(`${endpoint}${path}`, {
    method,
    signal: signal ?? AbortSignal.timeout(5000),
    ...(body !== undefined && {
      headers: {
        "Content-Type": ndjson ? "application/x-ndjson" : "application/json",
      },
      body: ndjson ? body : JSON.stringify(body),
    }),
  });
  if (missing && response.status === 404) return false;
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Elasticsearch ${method} ${path} returned ${response.status}`,
    );
  }
  return method === "HEAD" ? true : response.json();
}

async function findMatches(path, body, signal) {
  const result = await elastic(`${path}?allow_partial_search_results=false`, {
    method: "POST",
    body,
    signal,
  });
  if (result.timed_out || result._shards?.failed) {
    throw new Error("Elasticsearch returned an incomplete search response");
  }
  return result;
}

export async function searchProductText(keyword) {
  if (!endpoint) return null;

  const signal = AbortSignal.timeout(1500);
  const search = {
    size: batchSize,
    _source: false,
    track_scores: true,
    track_total_hits: matchLimit,
    query: {
      bool: {
        must: {
          multi_match: {
            query: keyword,
            type: "cross_fields",
            operator: "and",
            fields: ["name^4", "brand^2", "short_description", "tags^2"],
          },
        },
        should: { match_phrase: { name: { query: keyword, boost: 3 } } },
      },
    },
  };
  let pitId;
  try {
    const first = (await findMatches(`/${alias}/_search`, search, signal)).hits;
    if (first.total.relation !== "eq") return null;
    if (first.hits.length === first.total.value) return first.hits;

    // The database must receive every match to filter and paginate correctly.
    // Walk a fixed Elasticsearch snapshot when one response cannot hold them.
    const keepAlive = "10s";
    ({ id: pitId } = await elastic(`/${alias}/_pit?keep_alive=${keepAlive}`, {
      method: "POST",
      signal,
    }));
    const matches = [];
    let searchAfter;
    let total;
    do {
      const result = await findMatches(
        "/_search",
        {
          ...search,
          track_total_hits: searchAfter ? false : matchLimit,
          pit: { id: pitId, keep_alive: keepAlive },
          sort: ["_shard_doc"],
          search_after: searchAfter,
        },
        signal,
      );
      pitId = result.pit_id ?? pitId;
      if (!searchAfter) {
        if (result.hits.total.relation !== "eq") return null;
        total = result.hits.total.value;
      }
      const hits = result.hits.hits;
      matches.push(...hits);
      searchAfter = hits.at(-1)?.sort;
    } while (searchAfter && matches.length < total);
    return matches.length === total ? matches : null;
  } catch {
    return null;
  } finally {
    if (pitId) {
      void elastic("/_pit", {
        method: "DELETE",
        body: { id: pitId },
        signal: AbortSignal.timeout(1000),
      }).catch(() => {});
    }
  }
}

async function updateSearchIndex() {
  await db.transaction(async (lock) => {
    const { rows } = await lock.raw(
      "SELECT pg_try_advisory_xact_lock(?) AS acquired",
      [syncLock],
    );
    if (!rows[0].acquired) return;

    // This transaction holds only the advisory lock. Queue statements use
    // committed data on separate connections and never hold a business lock
    // while Elasticsearch is processing a request.
    const ready = await elastic(`/_alias/${alias}`, {
      method: "HEAD",
      missing: true,
    });
    if (
      !ready &&
      !(await elastic(`/${index}`, { method: "HEAD", missing: true }))
    ) {
      // Commit the full backfill before creating the index so a process crash
      // cannot leave a new index with neither documents nor queued work.
      await db.raw(`
        INSERT INTO product_search_changes (product_id) SELECT id FROM products
        ON CONFLICT (product_id) DO NOTHING
      `);
      await elastic(`/${index}`, {
        method: "PUT",
        body: {
          settings: { number_of_shards: 1, number_of_replicas: 0 },
          mappings: {
            dynamic: "strict",
            properties: {
              name: { type: "text" },
              brand: { type: "text" },
              short_description: { type: "text" },
              tags: { type: "text" },
            },
          },
        },
      });
    }

    const changes = await db("product_search_changes as change")
      .leftJoin("products as p", "p.id", "change.product_id")
      .select(
        "change.product_id",
        "change.revision",
        "p.id",
        "p.name",
        "p.brand",
        "p.short_description",
        "p.tags",
      )
      .orderBy("change.revision")
      .limit(batchSize);
    if (changes.length) {
      const lines = changes.flatMap(({ product_id, revision, id, ...text }) => [
        JSON.stringify({
          index: {
            _id: product_id,
            version: revision,
            version_type: "external_gte",
          },
        }),
        // An empty document keeps the revision for physical deletes without
        // exposing a match or relying on Elasticsearch's delete retention.
        JSON.stringify(id ? text : {}),
      ]);
      const result = await elastic(
        `/${index}/_bulk?refresh=wait_for&timeout=3s`,
        {
          method: "POST",
          body: `${lines.join("\n")}\n`,
          ndjson: true,
        },
      );
      if (
        result.errors &&
        result.items.some(
          ({ index: item }) =>
            item.error &&
            item.error.type !== "version_conflict_engine_exception",
        )
      )
        throw new Error(
          "Elasticsearch could not index all queued product changes",
        );

      // A newer committed edit may have replaced the queued revision while
      // the bulk request was in flight. Leave that edit for the next pass.
      await db.raw(
        `
        DELETE FROM product_search_changes AS pending
        USING unnest(?::uuid[], ?::bigint[]) AS indexed(product_id, revision)
        WHERE pending.product_id = indexed.product_id AND pending.revision = indexed.revision
      `,
        [
          changes.map((change) => change.product_id),
          changes.map((change) => change.revision),
        ],
      );
    }
    if (!ready && changes.length < batchSize) {
      await elastic(`/${index}/_alias/${alias}`, { method: "PUT" });
    }
  });
}

export function startProductSearchSync() {
  if (!endpoint) return async () => {};
  let stopped = false;
  let unavailable = false;
  let timer;
  let current;
  function run() {
    current = updateSearchIndex()
      .then(() => {
        unavailable = false;
      })
      .catch((error) => {
        if (!unavailable)
          console.warn("Product search indexing will retry:", error.message);
        unavailable = true;
      })
      .finally(() => {
        if (!stopped) timer = setTimeout(run, 2000).unref();
      });
  }
  run();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await current;
  };
}
