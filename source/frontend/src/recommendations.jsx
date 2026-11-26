import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { api, money, queryString } from "./api";
import { ErrorBox, Field, Pagination, useSession } from "./ui";
import "./recommendations.css";

const maxCandidates = 64;
const requestTimeout = 120_000;
const negativeRequirement =
  /\b(?:not|no|without|don['’]t|exclude|avoid)\b|(?<!\p{L})(?:không(?!\s+(?:gian|dây|chỉ)\b)|chẳng|đừng|ngoại trừ|loại trừ)(?!\p{L})/iu;
const capacityRequirement = /\b\d+(?:[.,]\d+)?\s*(?:gb|tb|gib|tib)\b/iu;

function eligibleVariant(product, category, maxPrice) {
  if (
    !product.isActive ||
    !product.category.isActive ||
    (category && product.category.slug !== category)
  )
    return;
  // The API returns active variants in ascending price order.
  return product.variants.find(
    (variant) =>
      variant.isAvailable &&
      (maxPrice === undefined || Number(variant.priceVnd) <= maxPrice),
  );
}

function productText(product) {
  const tags = product.tags.join(", ");
  return {
    id: product.id,
    category: product.category.slug,
    catalogLabels: [product.category.name, tags].filter(Boolean).join(". "),
    overview: [product.category.name, product.shortDescription, tags].join(
      ". ",
    ),
    details: product.descriptionLines.slice(0, 5),
  };
}

function rank(worker, payload, signal, onStatus) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      worker.removeEventListener("message", message);
      worker.removeEventListener("error", fail);
      worker.removeEventListener("messageerror", fail);
      signal.removeEventListener("abort", abort);
    }
    function fail() {
      cleanup();
      reject(new Error("Recommendation inference failed."));
    }
    function abort() {
      cleanup();
      reject(signal.reason);
    }
    function message({ data }) {
      if (data.status === "failed") fail();
      else if (data.status === "done") {
        cleanup();
        resolve(data.ids);
      } else onStatus(data.status);
    }
    if (signal.aborted) return abort();
    worker.addEventListener("message", message);
    worker.addEventListener("error", fail);
    worker.addEventListener("messageerror", fail);
    signal.addEventListener("abort", abort, { once: true });
    try {
      worker.postMessage(payload);
    } catch {
      fail();
    }
  });
}

export function Recommendations({ categories }) {
  const [open, setOpen] = useState(false);
  const { isPending } = useSession();
  return (
    <section
      className="recommendation-panel"
      aria-label="AI product recommendations"
    >
      <button
        type="button"
        className="button secondary"
        aria-expanded={open}
        aria-controls="recommendation-form"
        disabled={isPending}
        onClick={() => setOpen(!open)}
      >
        <Sparkles size={17} aria-hidden="true" /> AI product recommendations
      </button>
      <div id="recommendation-form" hidden={!open}>
        {open && <RecommendationForm categories={categories} />}
      </div>
    </section>
  );
}

function RecommendationForm({ categories }) {
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const worker = useRef(null);
  const request = useRef(null);
  const busy = ["catalog", "loading", "ranking"].includes(status);
  useEffect(
    () => () => {
      request.current?.abort();
      worker.current?.terminate();
    },
    [],
  );

  async function submit(event) {
    event.preventDefault();
    if (request.current) return;
    const form = new FormData(event.currentTarget);
    const query = form.get("need").trim().normalize("NFC");
    const category = form.get("category");
    const budget = form.get("budget");
    const maxPrice = budget === "" ? undefined : Number(budget);
    setResults([]);
    if (query.length < 5) {
      setStatus("invalid");
      return;
    }
    // Similarity does not enforce exclusions or exact hardware capacities.
    if (negativeRequirement.test(query) || capacityRequirement.test(query)) {
      setStatus("clarify");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const timeout = setTimeout(
      () =>
        controller.abort(
          new DOMException("Recommendation timed out.", "TimeoutError"),
        ),
      requestTimeout,
    );
    setStatus("catalog");
    try {
      // The existing maxPrice filter is a superset of purchasable offers at that
      // budget. A single list response keeps the bound and rows in one snapshot.
      const listing = await api(
        `/products?${queryString({
          category,
          maxPrice: budget,
          pageSize: maxCandidates,
          sort: "name_asc",
        })}`,
        { signal },
      );
      if (listing.meta.totalItems > maxCandidates) {
        setStatus("narrow");
        return;
      }
      const candidates = listing.data.filter((product) =>
        eligibleVariant(product, category, maxPrice),
      );
      if (candidates.length === 0) {
        setStatus("empty");
        return;
      }
      worker.current ??= new Worker(
        new URL("./recommendation.worker.js", import.meta.url),
        { type: "module" },
      );
      const byId = new Map(candidates.map((product) => [product.id, product]));
      const ids = await rank(
        worker.current,
        { query, candidates: candidates.map(productText) },
        signal,
        setStatus,
      );
      const current = await Promise.all(
        ids.slice(0, 3).map(async (id) => {
          const candidate = byId.get(id);
          try {
            const { data: product } = await api(`/products/${candidate.slug}`, {
              signal,
            });
            const variant = eligibleVariant(product, category, maxPrice);
            if (
              product.id === id &&
              variant &&
              JSON.stringify(productText(product)) ===
                JSON.stringify(productText(candidate))
            )
              return { product, variant };
          } catch (error) {
            if (error.status !== 404) throw error;
          }
        }),
      );
      signal.throwIfAborted();
      const available = current.filter(Boolean);
      setResults(available);
      setStatus(available.length ? "done" : "empty");
    } catch {
      if (signal.reason?.name !== "AbortError") {
        worker.current?.terminate();
        worker.current = null;
        setStatus("failed");
      }
    } finally {
      clearTimeout(timeout);
      request.current = null;
    }
  }

  return (
    <form className="recommendation-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <Field
          label="What will you use it for?"
          hint="Describe how you’ll use the product in English or Vietnamese. First use loads about 158 MB from this store."
        >
          <textarea
            name="need"
            rows={2}
            required
            minLength={5}
            maxLength={300}
            placeholder="A lightweight laptop for working while I travel"
          />
        </Field>
        <div className="recommendation-filters">
          <Field label="Product category">
            <select name="category">
              <option value="">All categories</option>
              {categories.map(({ id, name, slug }) => (
                <option key={id} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Maximum budget (VND)"
            name="budget"
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            placeholder="No limit"
          />
          <button className="button" type="submit">
            Get recommendations
          </button>
        </div>
      </fieldset>
      <div role="status" className="recommendation-status">
        {status === "catalog" && "Checking the catalog…"}
        {status === "loading" &&
          "Loading the on-device model. The first load may take a moment…"}
        {status === "ranking" && "Matching your needs to available products…"}
        {status === "narrow" &&
          `More than ${maxCandidates} products match these filters. Choose a category or lower your budget.`}
        {status === "empty" &&
          "No suitable products available. Try a different description or adjust your filters."}
        {status === "invalid" &&
          "Describe what you need in at least five characters."}
        {status === "clarify" &&
          "Describe the intended use in positive terms. Use the category and budget filters, and check exact specifications on product pages."}
        {status === "done" &&
          `${results.length} recommended ${results.length === 1 ? "product" : "products"}`}
      </div>
      {status === "failed" && (
        <ErrorBox
          error={{
            message:
              "Recommendations are temporarily unavailable. Try again or browse the catalog below.",
          }}
        />
      )}
      {results.length > 0 && (
        <>
          <ul
            className="recommendation-results"
            aria-label="Recommended products"
          >
            {results.map(({ product, variant }) => (
              <li key={product.id}>
                <Link
                  className="recommendation-result"
                  to={`/products/${product.slug}`}
                >
                  <img
                    src={product.thumbnailUrl}
                    alt={product.imageDetails?.[0]?.alt || product.name}
                    loading="lazy"
                  />
                  <span>
                    <strong>{product.name}</strong>
                    <small>{Object.values(variant.attributes).join(" · ")}</small>
                    <span>{money(variant.priceVnd)} · In stock</span>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            label="Recommendation pagination"
            meta={{ page: 1, totalPages: 1, totalItems: results.length }}
          />
        </>
      )}
    </form>
  );
}
