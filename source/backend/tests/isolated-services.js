import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The verifier checks actual database identity and port bindings before tests.
// Target Docker container IDs from that unique Compose project only.
export function isolatedServices() {
  const project = process.env.OBSIDIAN_VERIFY_PROJECT;
  assert.match(project || "", /^obsidian-test-[a-f0-9]{32}$/);
  assert.equal(process.env.TEST_BASE_URL, "http://localhost:8081");
  const dbUrl = new URL(process.env.DATABASE_URL);
  assert.equal(dbUrl.protocol, "postgres:");
  assert.equal(dbUrl.hostname, "127.0.0.1");
  assert.equal(dbUrl.port, "15433");
  assert.equal(dbUrl.pathname, "/obsidian_test");
  const docker = (...args) => execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 15_000,
  }).trim();
  const container = (service) => {
    const id = docker("ps", "-aq",
      "--filter", `label=com.docker.compose.project=${project}`,
      "--filter", `label=com.docker.compose.service=${service}`);
    assert.match(id, /^[a-f0-9]{12,64}$/);
    return id;
  };
  return { docker, container };
}
