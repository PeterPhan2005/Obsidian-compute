import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const compose = [
  "compose",
  "-p",
  "obsidian-test",
  "-f",
  "compose.yaml",
  "-f",
  "compose.test.yaml",
];
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  "Recreating only the isolated obsidian-test stack. The main demo is preserved.",
);
run("docker", [...compose, "down", "--volumes", "--remove-orphans"]);
run("docker", [...compose, "up", "-d", "--build"]);
const env = {
  ...process.env,
  DATABASE_URL:
    "postgres://obsidian:local-db-password@localhost:15433/obsidian_test",
  TEST_BASE_URL: "http://localhost:8081",
};
run(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    "backend/tests/pricing.test.js",
    "backend/tests/integration.test.js",
  ],
  env,
);
if (!process.argv.includes("--api-only"))
  run(process.execPath, ["node_modules/playwright/cli.js", "test"], env);
console.log(
  "Validation complete. The isolated stack remains available at http://localhost:8081.",
);
