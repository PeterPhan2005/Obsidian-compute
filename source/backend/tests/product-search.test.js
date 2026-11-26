import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/db.js";
import { BASE, Client } from "./checkout-fixtures.js";
import { isolatedServices } from "./isolated-services.js";

const enabled = Boolean(process.env.OBSIDIAN_VERIFY_PROJECT);
const apiA = new Client("http://127.0.0.1:3101");
const apiB = new Client("http://127.0.0.1:3102");
const alias = "products-v1";
const physicalIndex = `${alias}-data`;
const token = `batchsearch${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const commonTag = `fixture-cohort-${token.slice(-12)}`;
const commonBrand = "Search fixture brand";
const ids = (result) => result.data.map(({ id }) => id);
const tests = { skip: !enabled, timeout: 150_000 };

async function eventually(label, read, matches, timeout = 60_000) {
  const deadline = performance.now() + timeout;
  let lastError;
  do {
    try {
      const result = await read();
      if (matches(result)) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  } while (performance.now() < deadline);
  throw new Error(`Timed out waiting for ${label}.`, { cause: lastError });
}

async function catalog(parameters, base = BASE) {
  const response = await fetch(
    `${base}/api/v1/products?${new URLSearchParams(parameters)}`,
    { signal: AbortSignal.timeout(8_000) },
  );
  assert.equal(response.status, 200);
  return {
    backend: response.headers.get("x-search-backend"),
    body: await response.json(),
  };
}

async function search(parameters, expectedBackend = "elasticsearch", base) {
  const { backend, body } = await catalog(parameters, base);
  assert.equal(backend, expectedBackend);
  return body;
}

function elasticsearch() {
  const { docker, container } = isolatedServices();
  const node = container("elasticsearch");
  return {
    lifecycle: (...args) => docker(...args, node),
    request: (path, method = "GET") =>
      JSON.parse(
        docker(
          "exec",
          node,
          "curl",
          "-fsS",
          "--max-time",
          "4",
          "-X",
          method,
          `http://127.0.0.1:9200${path}`,
        ),
      ),
  };
}

async function withIndexingPaused(callback) {
  const connection = await db.client.acquireConnection();
  try {
    await eventually(
      "the search reconciliation lock",
      () =>
        db
          .raw("SELECT pg_try_advisory_lock(171604) AS locked")
          .connection(connection),
      ({ rows }) => rows[0].locked,
    );
    try {
      return await callback();
    } finally {
      await db.raw("SELECT pg_advisory_unlock(171604)").connection(connection);
    }
  } finally {
    await db.client.releaseConnection(connection);
  }
}

async function mutation(client, path, method, status, body) {
  const response = await client.request(path, method, body);
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(
    response.headers.get("x-instance-id"),
    client === apiA ? "api-a" : "api-b",
  );
  return response.body?.data;
}

async function createProduct(
  client,
  template,
  label,
  fields = {},
  activePrice = 1200,
) {
  const slug = `${token}-${label}`;
  return mutation(client, "/admin/products", "POST", 201, {
    name: `${label} workstation`,
    slug,
    brand: commonBrand,
    categoryId: template.category.id,
    shortDescription: "A calibrated product for search verification.",
    descriptionLines: template.descriptionLines,
    tags: [commonTag],
    images: template.imageDetails,
    variants: [100, activePrice, activePrice + 1200].map((priceVnd, index) => ({
      sku: `${slug}-${index}`,
      attributes: { Edition: `Search ${index}` },
      priceVnd,
      costPriceVnd: 50,
      stock: 0,
      isActive: index > 0,
    })),
    ...fields,
  });
}

function matchingProduct(q, id, base) {
  return eventually(
    `indexed product ${id} for ${q}`,
    () => catalog({ q }, base),
    ({ backend, body }) =>
      backend === "elasticsearch" && ids(body).includes(id),
  );
}

function indexUuid(es) {
  return es.request(`/${physicalIndex}/_settings?flat_settings=true`)[
    physicalIndex
  ].settings["index.uuid"];
}

let template;
let recovered;
let searchCategory;

after(async () => db.destroy());

test(
  "Fresh seed is searchable through both Core replicas and Elasticsearch records their queries",
  tests,
  async (t) => {
    const es = elasticsearch();
    for (const { base } of [apiA, apiB]) {
      await eventually(
        `indexed seed through ${base}`,
        () => catalog({ q: "Obsidian" }, base),
        ({ backend, body }) =>
          backend === "elasticsearch" && body.data.length > 0,
      );
    }
    const cluster = es.request("/");
    assert.equal(
      cluster.version.number,
      process.env.OBSIDIAN_VERIFY_SEARCH_VERSION,
    );
    assert.equal(es.request(`/${alias}/_count`).count, 60);
    const queryCount = () =>
      es.request(`/${alias}/_stats/search`)._all.total.search.query_total;
    const initial = queryCount();
    for (const { base } of [apiA, apiB]) {
      const body = await search(
        { q: "Studio 16", category: "laptop" },
        "elasticsearch",
        base,
      );
      assert.ok(
        body.data.some(({ slug }) => slug === "obsidian-studio-16-laptop"),
      );
      const indexed = es.request(`/${alias}/_doc/${body.data[0].id}`)._source;
      assert.deepEqual(Object.keys(indexed).sort(), [
        "brand",
        "name",
        "short_description",
        "tags",
      ]);
    }
    const queries = queryCount() - initial;
    assert.ok(queries >= 2);
    t.diagnostic(
      `Elasticsearch ${cluster.version.number}, 60 documents, ${queries} recorded search shard queries for two Core requests.`,
    );

    const best = { brand: "Obsidian", sort: "best_selling", pageSize: 100 };
    const rankedBySales = await search({ ...best, q: "Obsidian" });
    assert.deepEqual(ids(rankedBySales), ids(await search(best, null)));
    const section = await new Client().request(
      "/home/sections/best_sellers/products?q=Obsidian&brand=Obsidian&pageSize=100",
    );
    assert.equal(section.status, 200);
    assert.equal(section.headers.get("x-search-backend"), "elasticsearch");
    assert.deepEqual(ids(section.body), ids(rankedBySales));

    await Promise.all([apiA.login(), apiB.login()]);
    const seeded = (await search({ q: "Obsidian", category: "laptop" }))
      .data[0];
    template = (await apiA.request(`/admin/products/${seeded.id}`)).body.data;
  },
);

test(
  "Timeout and stopped-node fallback preserve results, and missed writes catch up after Elasticsearch restarts",
  tests,
  async (t) => {
    const es = elasticsearch();
    const persistedUuid = indexUuid(es);
    const cohort = ["Obsidian", "Forma", "Northstar"].map((q) => ({
      q,
      brand: q,
      sort: "name_asc",
      pageSize: 12,
    }));
    async function sample(backend) {
      const times = [];
      const pages = [];
      for (let n = 0; n < 12; n++) {
        for (const query of cohort) {
          const started = performance.now();
          const body = await search(query, backend);
          if (n >= 2) times.push(performance.now() - started);
          if (n === 2) pages.push({ meta: body.meta, ids: ids(body) });
        }
      }
      times.sort((a, b) => a - b);
      return { pages, median: (times[14] + times[15]) / 2, p95: times[28] };
    }
    const esSample = await sample("elasticsearch");

    es.lifecycle("pause");
    try {
      const body = await search(cohort[0], "postgresql", apiA.base);
      assert.deepEqual(ids(body), esSample.pages[0].ids);
    } finally {
      es.lifecycle("unpause");
    }

    es.lifecycle("stop", "--time", "5");
    try {
      const sqlSample = await sample("postgresql");
      assert.deepEqual(sqlSample.pages, esSample.pages);
      t.diagnostic(
        `60 products, same three sequential warmed storefront queries, page size 12, 30 timed full JSON responses each. Elasticsearch median ${esSample.median.toFixed(1)} ms / p95 ${esSample.p95.toFixed(1)} ms. PostgreSQL fallback with node stopped median ${sqlSample.median.toFixed(1)} ms / p95 ${sqlSample.p95.toFixed(1)} ms.`,
      );

      recovered = await createProduct(apiB, template, "recovered", {
        brand: `${token} brand`,
      });
      assert.deepEqual(
        ids(await search({ q: token }, "postgresql", apiA.base)),
        [recovered.id],
      );
    } finally {
      es.lifecycle("start");
    }

    await matchingProduct(token, recovered.id, apiA.base);
    await matchingProduct(token, recovered.id, apiB.base);
    assert.equal(indexUuid(es), persistedUuid);
  },
);

test(
  "Lexical matching composes with exact filters, all sorts and stable numbered pages",
  tests,
  async () => {
    const alpha = await createProduct(apiA, template, "alpha", {
      name: `${token} Alpha`,
    });
    const bravo = await createProduct(apiB, template, "bravo", {
      shortDescription: `Calibrated for ${token} testing.`,
    });
    const charlie = await createProduct(
      apiA,
      template,
      "charlie",
      { tags: [commonTag, token] },
      800,
    );
    const customer = new Client();
    await customer.login("alex@example.com", "ObsidianCustomer!2026");
    for (const [product, stars] of [
      [alpha, 5],
      [bravo, 4],
      [charlie, 3],
    ]) {
      const rating = await customer.request(
        `/products/${product.slug}/rating`,
        "PUT",
        { stars },
      );
      assert.equal(rating.status, 200);
    }
    for (const product of [alpha, bravo, charlie])
      await matchingProduct(token, product.id);

    try {
      const result = await search({ q: token, pageSize: 100 });
      assert.equal(result.data[0].id, alpha.id);
      assert.deepEqual(
        ids(result).sort(),
        [alpha.id, bravo.id, charlie.id, recovered.id].sort(),
      );
      assert.deepEqual(
        ids(await search({ q: `(${token}):+` })).sort(),
        ids(result).sort(),
      );
      assert.equal(
        (await search({ q: token.slice(0, -3) })).meta.totalItems,
        0,
      );
      const adminResult = await apiA.request(
        `/admin/products?q=${token.slice(0, -3)}`,
      );
      assert.equal(adminResult.status, 200);
      assert.equal(adminResult.headers.get("x-search-backend"), null);
      assert.deepEqual(ids(adminResult.body).sort(), ids(result).sort());

      const filters = {
        category: template.category.slug,
        brand: commonBrand,
        tag: commonTag,
        minPrice: 1000,
        maxPrice: 1500,
        ratingMin: 4,
      };
      const combined = { q: token, ...filters, sort: "price_asc", pageSize: 1 };
      const ordered = [alpha.id, bravo.id].sort();
      for (const page of [1, 2, 3]) {
        const body = await search({ ...combined, page });
        assert.deepEqual(ids(body), ordered.slice(page - 1, page));
        assert.deepEqual(body.meta, {
          page,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        });
        if (page < 3) {
          assert.equal(body.data[0].minPriceVnd, 1200);
          assert.equal(body.data[0].variants.length, 2);
          assert.ok(
            body.data[0].variants.every(
              (v) => v.stock === 0 && !v.isAvailable && !("costPriceVnd" in v),
            ),
          );
        }
        assert.deepEqual(body.filters.selected, {
          q: token,
          ...filters,
          sort: "price_asc",
        });
      }
      assert.equal(
        (await search({ ...combined, maxPrice: 900, minPrice: 0 })).meta
          .totalItems,
        0,
      );
      assert.equal(
        (await search({ ...combined, tag: commonTag.toUpperCase() })).meta
          .totalItems,
        0,
      );

      for (const sort of [
        "name_asc",
        "name_desc",
        "price_asc",
        "price_desc",
        "newest",
        "best_selling",
      ]) {
        const parameters = { tag: commonTag, sort, pageSize: 100 };
        const sql = await search(parameters, null);
        const es = await search({ ...parameters, q: token });
        assert.deepEqual(ids(es), ids(sql), sort);
        assert.deepEqual(es.meta, sql.meta, sort);
      }
      const bestSellers = { q: "Obsidian", collection: "best_sellers" };
      assert.deepEqual(
        ids(await search(bestSellers)),
        ids(await search({ ...bestSellers, sort: "best_selling" })),
      );
      assert.deepEqual(
        ids(await search({ ...bestSellers, sort: "relevance" })),
        ids(await search({ q: "Obsidian" })),
      );
      assert.deepEqual(
        ids(await search({ q: token, sort: "relevance" })),
        ids(result),
      );
    } finally {
      for (const product of [alpha, bravo, charlie]) {
        await mutation(apiA, `/admin/products/${product.id}`, "DELETE", 204);
      }
    }
  },
);

test(
  "An indexed candidate obeys authoritative visibility and prices while indexing is paused",
  tests,
  async () => {
    const category = await mutation(apiA, "/admin/categories", "POST", 201, {
      name: "Search fixture motherboard",
      slug: "motherboard",
    });
    searchCategory = category;
    const categoryPath = `/admin/categories/${category.id}`;
    const path = `/admin/products/${recovered.id}`;
    await withIndexingPaused(async () => {
      const es = elasticsearch();
      assert.equal(
        es.request(`/${alias}/_doc/${recovered.id}`)._source.brand,
        `${token} brand`,
      );
      assert.deepEqual(ids(await search({ q: token })), [recovered.id]);

      await mutation(apiB, path, "PATCH", 200, {
        categoryId: category.id,
        expectedRevision: recovered.revision,
      });
      assert.deepEqual(
        ids(await search({ q: token, category: category.slug })),
        [recovered.id],
      );
      assert.equal(
        (await search({ q: token, category: template.category.slug })).meta
          .totalItems,
        0,
      );

      await mutation(apiA, path, "DELETE", 204);
      assert.equal((await search({ q: token })).meta.totalItems, 0);
      await mutation(apiB, categoryPath, "DELETE", 204);
      // Establish an active product in an inactive category, which normal Admin writes prevent.
      await db("products")
        .where({ id: recovered.id })
        .update({ is_active: true });
      assert.equal((await search({ q: token })).meta.totalItems, 0);
      await db("products")
        .where({ id: recovered.id })
        .update({ is_active: false });
      const reopened = await mutation(apiA, "/admin/categories", "POST", 201, {
        name: category.name,
        slug: category.slug,
      });
      assert.equal(reopened.id, category.id);
      const product = await mutation(apiB, path, "PATCH", 200, {
        isActive: true,
        expectedRevision: (await apiB.request(path)).body.data.revision,
      });
      assert.deepEqual(ids(await search({ q: token })), [recovered.id]);

      const activeVariants = product.variants
        .filter((v) => v.isActive)
        .map((v) => v.id);
      await db("product_variants")
        .whereIn("id", activeVariants)
        .update({ is_active: false });
      try {
        assert.equal((await search({ q: token })).meta.totalItems, 0);
      } finally {
        await db("product_variants")
          .whereIn("id", activeVariants)
          .update({ is_active: true });
      }

      await mutation(apiA, path, "PATCH", 200, {
        expectedRevision: product.revision,
        variants: product.variants.map((v) => ({
          ...v,
          priceVnd: v.isActive ? v.priceVnd + 1000 : v.priceVnd,
        })),
      });
      assert.equal(
        (await search({ q: token, maxPrice: 2000 })).meta.totalItems,
        0,
      );
      assert.equal((await search({ q: token })).data[0].minPriceVnd, 2200);
    });
  },
);

test(
  "Overlapping replica writes converge after commit and an index rebuild retains existing data",
  tests,
  async () => {
    const es = elasticsearch();
    const path = `/admin/products/${recovered.id}`;
    const oldTerm = `${token}before`;
    const west = `${token}west`;
    const east = `${token}east`;
    const rejected = `${token}rejected`;
    const initial = await mutation(apiA, path, "PATCH", 200, {
      name: oldTerm,
      expectedRevision: (await apiA.request(path)).body.data.revision,
    });
    await matchingProduct(oldTerm, recovered.id);

    let finalName;
    await withIndexingPaused(async () => {
      const edits = [[apiA, west], [apiB, east]];
      const results = await Promise.all(edits.map(([client, name]) =>
        client.request(path, "PATCH", { name, expectedRevision: initial.revision }),
      ));
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      const stale = results.findIndex((result) => result.status === 409);
      assert.equal(results[stale].body.error.code, "PRODUCT_CONFLICT");
      const [retryingClient, retryName] = edits[stale];
      await mutation(retryingClient, path, "PATCH", 200, {
        name: retryName,
        expectedRevision: results[1 - stale].body.data.revision,
      });
      finalName = (
        await db("products").where({ id: recovered.id }).first("name")
      ).name;
      assert.ok([west, east].includes(finalName));
      const lastDoc = es.request(`/${alias}/_doc/${recovered.id}`)._source;
      assert.equal(lastDoc.name, oldTerm);
      assert.equal((await search({ q: oldTerm })).data[0].name, finalName);
      assert.equal((await search({ q: finalName })).meta.totalItems, 0);

      const { data: product } = (await apiB.request(path)).body;
      const variants = product.variants.filter((v) => v.isActive);
      await mutation(apiB, path, "PATCH", 400, {
        name: rejected,
        expectedRevision: product.revision,
        variants: [variants[0], { ...variants[1], id: randomUUID() }],
      });
      assert.equal(
        (await db("products").where({ id: recovered.id }).first("name")).name,
        finalName,
      );
    });

    await matchingProduct(finalName, recovered.id);
    for (const previous of [
      oldTerm,
      [west, east].find((name) => name !== finalName),
      rejected,
    ]) {
      assert.equal((await search({ q: previous })).meta.totalItems, 0);
    }

    const oldUuid = indexUuid(es);
    const existingProductCount = (await db("products").count().first()).count;
    await withIndexingPaused(async () => {
      assert.equal(
        es.request(`/${physicalIndex}`, "DELETE").acknowledged,
        true,
      );
      assert.deepEqual(ids(await search({ q: finalName }, "postgresql")), [
        recovered.id,
      ]);
    });
    await matchingProduct(finalName, recovered.id, apiA.base);
    await matchingProduct(finalName, recovered.id, apiB.base);
    assert.notEqual(indexUuid(es), oldUuid);
    assert.equal(es.request(`/${alias}/_count`).count, existingProductCount);
    assert.equal(
      (await db("products").count().first()).count,
      existingProductCount,
    );
    assert.equal(
      (await db("seed_versions").where({ version: "demo-v1" }).count().first())
        .count,
      1,
    );

    await mutation(apiA, path, "DELETE", 204);
    await mutation(
      apiB,
      `/admin/categories/${searchCategory.id}`,
      "DELETE",
      204,
    );
  },
);

test(
  "Filtering and totals cover more lexical matches than one Elasticsearch batch",
  tests,
  async () => {
    const es = elasticsearch();
    const keyword = `${token}boundary`;
    const fixtureBrand = `${keyword} fixture`;
    await db.raw(
      `
    WITH added AS (
      INSERT INTO products (category_id, name, slug, brand, short_description, description_lines)
      SELECT p.category_id, ?, ? || '-' || n, ?, p.short_description, p.description_lines
      FROM products p CROSS JOIN generate_series(1,260) AS n
      WHERE p.id = ? RETURNING id, slug
    )
    INSERT INTO product_variants (product_id, sku, attributes, price_vnd, cost_price_vnd, stock)
    SELECT id, slug, '{"Edition":"Search"}'::jsonb, split_part(slug, '-', 2)::integer, 0, 0
    FROM added
  `,
      [keyword, keyword, fixtureBrand, template.id],
    );
    try {
      await eventually(
        "260 fixture documents across Elasticsearch batches",
        () => es.request(`/${alias}/_count?q=name:${keyword}`),
        ({ count }) => count === 260,
      );
      const parameters = {
        q: keyword,
        brand: fixtureBrand,
        maxPrice: 258,
        sort: "price_asc",
        pageSize: 1,
      };
      const first = await search(parameters);
      const last = await search({ ...parameters, page: 258 });
      const past = await search({ ...parameters, page: 259 });
      assert.deepEqual(first.meta, {
        page: 1,
        pageSize: 1,
        totalItems: 258,
        totalPages: 258,
      });
      assert.deepEqual(last.meta, { ...first.meta, page: 258 });
      assert.deepEqual(past.meta, { ...first.meta, page: 259 });
      assert.equal(first.data[0].slug, `${keyword}-1`);
      assert.equal(last.data[0].slug, `${keyword}-258`);
      assert.deepEqual(past.data, []);
    } finally {
      await db("products")
        .where({ brand: fixtureBrand })
        .update({ is_active: false });
    }
  },
);
