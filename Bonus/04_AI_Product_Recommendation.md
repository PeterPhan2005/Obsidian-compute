# Bonus 04 · AI Product Recommendation for Obsidian Compute

## Objective

Page 6 of `NodeJS Final Project.pdf` lists product suggestions relevant to the system as an example of an AI-related feature. Batch 08 introduced a single-turn recommendation assistant for guests and Customers in the Catalog. Users describe their intended use in English or Vietnamese and may select a category and maximum budget. The storefront interface remains in English.

## Architecture and data sources

1. On a valid request, the storefront retrieves a snapshot from the public Catalog API with a maximum of 64 candidates. If the total exceeds 64, it asks the user to narrow the category or budget before inference. Price and in-stock status must belong to the same eligible variant.
2. A Web Worker runs Transformers.js `3.8.1` and ONNX Runtime Web `1.22.0-dev.20250409-89f8206ba4` using single-threaded CPU WASM. It embeds the user's request and public catalog content and ranks candidates by cosine similarity. The Worker and model load only when recommendations are requested. While the panel remains open, the Worker can reuse the model and the corresponding embeddings for the current catalog content.
3. The storefront checks current data through product-detail APIs before displaying at most three products, with name, image, eligible price, availability and detail link. It returns no result when there is no eligible or sufficiently relevant candidate, or when the competing categories have very similar scores. Certain unsupported negations and exact-capacity requests prompt clarification instead. The API and checkout remain authoritative for price, inventory and sale status.
4. The final release displays numbered Page 1 for the recommendation list without resubmitting the form, rerunning inference or changing the Catalog page. It refreshes rendered recommendation availability when the browser returns to the tab or a recommendation is selected, without reranking. Archived or ineligible recommendations are removed; transient availability failures require checking current details rather than falsely guaranteeing stock. The Vietnamese affirmative phrase `không chỉ` (not only) no longer triggers the unsupported-negation guard. The guard remains limited to supported patterns. Vite dependency pre-optimization prevents the first AI request from being interrupted by a cold optimizer reload in development.

The model is `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, q8, revision `2c4055b12046f11709e9df2c122e59ffbdc2f900`. Xenova converted the Sentence Transformers model to ONNX. The original model is licensed Apache-2.0. The build downloads and verifies SHA-256 checksums for five artifacts. The ONNX file matches `66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc`. The Frontend image includes the model card, Apache-2.0 and MIT licenses and ONNX Runtime third-party notices. The two ONNX Runtime notice files were compared against Git blobs at the exact development revision during Batch 08. [Pinned model](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/tree/2c4055b12046f11709e9df2c122e59ffbdc2f900) · [Original model](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2).

## Running the released version

Use the Compose files, Nginx configuration and catalog media from [commit `068bb1eca89283241544310186b3da95e122abee`](https://github.com/PeterPhan2005/Obsidian-compute/commit/068bb1eca89283241544310186b3da95e122abee). Use Docker with Linux amd64 support and modern Compose v2. Ensure ports 8080 and 8025 are available; stop only a demo stack that you own before starting a different stack. In PowerShell, from `source/`:

```powershell
$env:OBSIDIAN_BACKEND_IMAGE = 'ghcr.io/peterphan2005/obsidian-compute-backend@sha256:14ed59c43493822c49e35d6d7da430e55507292f1df9241870c782dd01dd3d61'
$env:OBSIDIAN_FRONTEND_IMAGE = 'ghcr.io/peterphan2005/obsidian-compute-frontend@sha256:58777cd5614050c915acbef7e180ba1f85cafb469f0c6560d564c08e12363e14'
$compose = @('-p', 'obsidian-ai-demo', '-f', 'docker-compose.yml', '-f', 'compose.images.yaml')
docker pull --platform linux/amd64 $env:OBSIDIAN_BACKEND_IMAGE
docker pull --platform linux/amd64 $env:OBSIDIAN_FRONTEND_IMAGE
docker compose @compose up -d --no-build
docker compose @compose ps --all
curl.exe --fail http://localhost:8080/api/v1/health
```

Open `http://localhost:8080` (storefront) and `http://localhost:8025` (Mailpit on the Docker host). Init, `api-a`, `api-b`, `realtime` and `worker` share the Backend image; `frontend` uses the Frontend image. If the packages are private, authenticate with GHCR using a classic PAT with `read:packages` and permission to read both packages. Public packages support anonymous pulls. Never display credentials. For the normal source-based submission, run **`docker compose up -d`** from `source/` without the image override; no GHCR login is required. [Source deployment instructions](https://github.com/PeterPhan2005/Obsidian-compute/blob/068bb1eca89283241544310186b3da95e122abee/source/README.txt)

When finished, run `docker compose @compose stop` to stop only this demo stack and retain its volumes. A temporary IPAM override outside the repository may be required if the local Docker address pool is exhausted. Choose a non-overlapping subnet; do not delete unrelated networks or volumes.

Open `http://localhost:8080/products`. A clean source build requires access to npm and Hugging Face, as well as the base image registries. The released Frontend image packages the Worker, model and WASM for same-origin browser loading. No inference API key, GPU or manual model installation is required for the demonstration. Allow time for the first browser download (approximately 158 MB at the historical measurement).

## Demonstration sequence

1. Open Catalog and the browser Network panel before the first AI request. Open **AI product recommendations** and submit `A portable notebook for reading documents while I travel`. Show the recommendation cards, at most three results and numbered Page 1. Show the Worker/model/WASM loading from the storefront origin when inference is requested. Open one recommendation and inspect the real product details.
2. Submit `Tôi cần một chiếc laptop nhỏ nhẹ để làm việc khi đi xa` and `Một màn hình lớn để đặt nhiều cửa sổ làm việc cạnh nhau` to demonstrate English/Vietnamese support and changing product needs. Also try `Tôi muốn chơi trò chơi và dựng cảnh ba chiều` for graphics cards and `Tôi cần thêm dung lượng để lưu nhiều tệp dự án lớn` for storage. Compare the latter sentence with ordinary keyword search in the Catalog. Show the actual response rather than assuming the historical ranking or result count.
3. Submit the notebook request with **Laptops** and a **15,000,000 VND** maximum budget (adjust to the actual current catalog if necessary). Open a result to verify the eligible variant's current price and stock. A zero budget on the historical seed produced no result. Click Page 1 and confirm that it does not resubmit the form or change the Catalog page.
4. With a recommendation displayed, change its availability from a separate Admin session on an isolated demo stack, then return to the storefront tab. Show the refreshed eligibility without a new ranking request. Restore the original demo stock/status after this check, or use a disposable demo product. The normal recording can use the final tests as evidence if this additional scenario is not reproduced live.
5. Submit `Tôi muốn đặt bánh sinh nhật vị sô cô la` to demonstrate no suitable product. Submit `I need a 64GB RAM laptop for virtualization` (or the Vietnamese equivalent in the recording script) to demonstrate the unsupported exact-capacity prompt. Submit `Tôi cần laptop nhẹ không chỉ để làm việc mà còn để mang đi du lịch` to demonstrate the supported affirmative phrase. Show actual responses; stock and ranking can change with the catalog.
6. Use the Network panel to show local ONNX/WASM loading from the website and the absence of requests sending the user's description to an external inference service during the observed run. Keep the query text synthetic. Stop the demo stack while retaining volumes.

## Verification evidence and limitations

### Historical Batch 08 evidence and measurements

- Local verifier and [Actions run 45864609725](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45864609725) at [commit `3c76f02`](https://github.com/PeterPhan2005/Obsidian-compute/commit/3c76f02021a4c123a456adc2ba53c0f41987dc39) passed **92/92** (58 Backend/OAuth and 34 Playwright), including five AI cases. Actions checked the exact SHA and model checksums on a clean runner, verified six image IDs and published from artifact `15139697801`. The historical delivered Backend digest was `sha256:4e3e8e92bc80bf4f9e7a3d28c26aac9ec2afc99c1e0a543decee9b09e5b316df`; the Frontend digest was `sha256:032c911cf8fc943948383b557433c0a342ff5c28f376593b1221cfeeac39346d`. The stack passed 2/2 Chromium smoke checks, retained mapping `8080:80`, had 60 seed products and returned 18 Elasticsearch results for `Northstar`.
- Historical observed notebook recommendations were Northstar Work Pro 16, Obsidian Nomad Pro 16 and Obsidian Studio 16. The monitor request returned Forma Canvas 27, Forma Studio 27 and Obsidian Flow 27; the graphics-card request ranked Forma Prism P1 first. The storage request returned Forma Archive S2, Forma Swift 1000 and Forma Velocity V1. The same storage sentence produced 0 results in a separate keyword-search probe with `X-Search-Backend: elasticsearch`. These observations describe the historical seed and are not guaranteed results for future requests. The isolated verifier also confirmed that archived products and products without an in-stock variant within the selected budget were excluded.
- Local Batch 08 measurements recorded ONNX **118.3 MB**, WASM **21.6 MB** and total first-use downloads of approximately **157.9 MB**. The Frontend image size reported by `docker image inspect` increased from **29.1 to 107.7 MB**. In headless Chromium, model initialization took **2.69 s**, first inference including catalog embeddings took **2.82 s**, total first use took **5.80 s** and inference with cached embeddings took **13–29 ms**. The working set of the entire Chromium process group increased from **0.53 to 1.28 GB** after first use. These are historical measurements, not final-checkpoint performance results. Physical mobile performance remains unmeasured.
- The historical `npm audit` reported two High findings in the Transformers.js `3.8.1` to Sharp `0.34.5` dependency chain, including a direct finding and a propagated finding from three advisories. The browser entry point excludes native Sharp. Build/development still installs this dependency, so invoking the Node entry point to decode images carries separate risk. Backend image processing used Sharp `0.35.5`; the separate Backend audit reported zero findings at that checkpoint. [libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) · [libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) · [librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). These documented build/development advisories remain an open limitation; no new dependency audit is claimed here.

### Current release evidence

Final Technical Acceptance: [`068bb1e`](https://github.com/PeterPhan2005/Obsidian-compute/commit/068bb1eca89283241544310186b3da95e122abee) on `fix-issue`. [GitHub Actions run 45983344230, attempt 1](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45983344230) passed the production build, both image builds and **112/112** verification results (66 Backend/OAuth and 46 Playwright). The [`verify` job 140452548674](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45983344230/job/140452548674) verified all six application container image IDs and exported `verified-images` (artifact ID `15190671043`, archive SHA-256 `fe31fdb75a6d3298fbd2d370b945efc854000df54855f698e55bed1a9d31eeef`). The [`publish` job 140455407773](https://github.com/PeterPhan2005/Obsidian-compute/actions/runs/45983344230/job/140455407773) loaded that artifact without rebuilding and published both full-commit-SHA tags. The technical advisor independently checked the remote commit, Actions jobs and test results, artifact metadata, and registry manifest digests against the publish logs. Codex performed and reported the local image configuration digest comparisons and delivered-image execution: both images were pulled by digest, run with `--no-build` using Compose from the exact commit, and passed **112/112** in the isolated verifier. Init exited `0`; all six application container image IDs matched. A temporary IPAM override addressed local Docker address-pool exhaustion; isolated stacks were stopped with volumes retained.

The final Playwright suite `source/tests/e2e/recommendations.spec.js` verifies real English/Vietnamese recommendations, category/budget and same-variant eligibility, candidate limits and failure recovery, Page 1 behavior, a cold Vite optimizer request using local WASM, and refresh of archived products/current offers without reranking. Codex reported real English and Vietnamese inference on the final delivered images. This documentation update does not remeasure latency, memory use or physical mobile performance.

### Known limitations

The model ranks the available public catalog text, not a general knowledge base. Similar seed descriptions can make within-category rankings less meaningful. Unsupported negations, specifications outside the recognized patterns and complex configuration requests remain limitations. This is a single-turn semantic recommendation feature, not a generative LLM chatbot. The initial download and browser memory use may be substantial on slower devices. The technical advisor accepted the tested implementation scope; the instructor determines Bonus credit.

### Screenshots to capture during the narrated demo

The following filenames are coordinated with the Vietnamese recording script. Save actual captures under `Bonus/evidence/`. The files listed here are capture targets, not a claim that the screenshots already exist. Retain the relevant commit, test result, service state, or visible application output; omit credentials, tokens and private information.

| Filename | Evidence to show |
|---|---|
| `ai-01-english.png` | English request, actual recommendations and numbered Page 1. |
| `ai-02-vietnamese.png` | Vietnamese request and matching product recommendations. |
| `ai-03-budget.png` | Selected category and maximum budget with eligible recommendation price and stock. |
| `ai-04-local-model.png` | Network panel showing ONNX and WASM requests from the website origin. |
| `ai-05-boundaries.png` | No-match request and unsupported exact-capacity clarification (separate captures if needed). |
| `ai-06-availability.png` | If the additional refresh scenario is recorded: before and after eligibility change without reranking. |
