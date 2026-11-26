import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  MODEL_ID,
  MODEL_REVISION,
  RECOMMENDATION_ASSETS,
} from "../src/recommendation-model.js";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const assets = resolve(frontend, "public", "." + RECOMMENDATION_ASSETS);
const hub = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/`;
const files = {
  "README.md":
    "1faca2377fb36a7c5ee603ffdd170cf93126be37e7b3b422d319b8ed34081e73",
  "config.json":
    "05b570bff786faa5c4604152aa16f19f77ed6dfc31e47dd0f3dd987078693ac7",
  "tokenizer_config.json":
    "3f5961b9ac86288cccdb97f32fb848d6187c78e1603958c53f3ea1f296b7d8a2",
  "tokenizer.json":
    "b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441",
  "onnx/model_quantized.onnx":
    "66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc",
};

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function acquire(name, expected) {
  const destination = resolve(assets, "models", MODEL_ID, name);
  const existing = await sha256(destination).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (existing === expected) return;
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    const response = await fetch(hub + name, {
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok || !response.body)
      throw new Error(`HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(temporary));
    if ((await sha256(temporary)) !== expected)
      throw new Error("SHA-256 mismatch");
    await rename(temporary, destination);
  } catch (error) {
    throw new Error(
      `Cannot acquire pinned model asset ${name}: ${error.message}`,
      { cause: error },
    );
  } finally {
    await rm(temporary, { force: true });
  }
}

for (const [name, checksum] of Object.entries(files))
  await acquire(name, checksum);

// These binaries and the browser bundle come from the same lockfile-verified package.
const transformers = fileURLToPath(
  import.meta.resolve("@huggingface/transformers"),
);
const jinja = fileURLToPath(import.meta.resolve("@huggingface/jinja"));
const notices = resolve(assets, "licenses");
await mkdir(notices, { recursive: true });
await copyFile(
  resolve(dirname(transformers), "../LICENSE"),
  resolve(notices, "Transformers.js-Apache-2.0.txt"),
);
await copyFile(
  resolve(dirname(jinja), "../LICENSE"),
  resolve(notices, "Hugging-Face-Jinja-LICENSE.txt"),
);
for (const name of [
  "README.txt",
  "ONNX-Runtime-LICENSE.txt",
  "ONNX-Runtime-ThirdPartyNotices.txt",
]) {
  await copyFile(
    resolve(frontend, "third-party", name),
    resolve(notices, name),
  );
}
console.log(
  `Verified ${Object.keys(files).length} assets for ${MODEL_ID}@${MODEL_REVISION}`,
);
