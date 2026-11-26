import { env, pipeline } from "@huggingface/transformers";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import { MODEL_ID, RECOMMENDATION_ASSETS } from "./recommendation-model.js";

const assets = new URL(RECOMMENDATION_ASSETS, self.location.origin).href;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = assets + "models/";
env.useBrowserCache = false;
// Resolve the same pinned binary in both Vite dev and the production worker.
env.backends.onnx.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.origin).href,
};
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

const batchSize = 4;
const options = { pooling: "mean", normalize: true };
let extractor;
let catalogEmbeddings = new Map();

function cosine(a, b) {
  // Both vectors have unit length.
  return a.reduce((score, value, index) => score + value * b[index], 0);
}

self.onmessage = async ({ data: { query, candidates } }) => {
  try {
    if (!extractor) {
      self.postMessage({ status: "loading" });
      extractor = await pipeline("feature-extraction", MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        session_options: { enableCpuMemArena: false, enableMemPattern: false },
      });
    }
    self.postMessage({ status: "ranking" });
    const [queryVector] = (await extractor(query, options)).tolist();
    const texts = [
      ...new Set(
        candidates.flatMap(({ overview, catalogLabels, details }) => [
          overview,
          catalogLabels,
          ...details,
        ]),
      ),
    ];
    const embeddings = new Map();
    const uncached = [];
    for (const text of texts) {
      if (catalogEmbeddings.has(text))
        embeddings.set(text, catalogEmbeddings.get(text));
      else uncached.push(text);
    }
    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      const vectors = (await extractor(batch, options)).tolist();
      batch.forEach((text, index) => embeddings.set(text, vectors[index]));
    }
    catalogEmbeddings = embeddings;

    const ranked = candidates
      .flatMap(({ id, category, overview, catalogLabels, details }) => {
        const summaryScore = cosine(queryVector, embeddings.get(overview));
        const labelScore = cosine(queryVector, embeddings.get(catalogLabels));
        const detailScore = Math.max(
          summaryScore,
          ...details.map((line) => cosine(queryVector, embeddings.get(line))),
        );
        const score = 0.5 * summaryScore + 0.3 * labelScore + 0.2 * detailScore;
        // An incidental mention in a detail line alone is weak product-level evidence.
        return summaryScore >= 0.34 && score >= 0.37
          ? [{ id, category, score }]
          : [];
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const alternative =
      best && ranked.find(({ category }) => category !== best.category);
    // When categories are nearly tied, the customer can clarify the request or select a category.
    const ids =
      !best || (alternative && best.score - alternative.score < 0.025)
        ? []
        : ranked
            .filter(
              ({ category, score }) =>
                category === best.category && score >= best.score - 0.055,
            )
            .map(({ id }) => id);
    self.postMessage({ status: "done", ids });
  } catch {
    self.postMessage({ status: "failed" });
  }
};
