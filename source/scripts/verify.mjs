import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { globSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const project = `obsidian-test-${randomUUID().replaceAll("-", "")}`;
const loopback = "127.0.0.1";
const baseURL = "http://localhost:8081";
const databaseName = "obsidian_test";
const databaseURL = `postgres://obsidian:local-db-password@${loopback}:15433/${databaseName}`;
const expectedPorts = {
  postgres: [5432, 15433],
  nginx: [80, 8081],
  mailpit: [8025, 8026],
  "api-a": [3000, 3101],
  "api-b": [3000, 3102],
};
const useImages = process.argv.includes("--images");
const backendServices = ["init", "api-a", "api-b", "worker", "realtime"];
const applicationImages = {
  ...Object.fromEntries(backendServices.map((service) => [service, process.env.OBSIDIAN_BACKEND_IMAGE])),
  frontend: process.env.OBSIDIAN_FRONTEND_IMAGE,
};
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  "docker-compose.yml",
  "-f",
  "compose.test.yaml",
  ...(useImages ? ["-f", "compose.images.yaml"] : []),
];
const dockerEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^COMPOSE_/i.test(key)),
);
dockerEnv.COMPOSE_DISABLE_ENV_FILE = "1";
dockerEnv.JWT_SECRET = randomUUID() + randomUUID();
const testEnv = {
  ...process.env,
  DATABASE_URL: databaseURL,
  TEST_BASE_URL: baseURL,
  OBSIDIAN_VERIFY_PROJECT: project,
};

function run(command, args, { capture = false, env = dockerEnv } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0]} failed (${result.status ?? result.signal}).`,
    );
  }
  return result.stdout?.trim();
}

function docker(...args) {
  return run("docker", args, { capture: true });
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function checkDockerEndpoint() {
  const local = (endpoint) =>
    endpoint.startsWith("unix:///") || endpoint.startsWith("npipe:////./pipe/");
  const configured = dockerEnv.DOCKER_HOST;
  const contextHost = JSON.parse(
    docker("context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"),
  );
  requireCondition(
    (!configured || local(configured)) &&
      typeof contextHost === "string" &&
      local(contextHost),
    "Verification requires a local Docker Engine with loopback port publishing.",
  );
}

function checkComposeConfig() {
  const config = JSON.parse(docker(...compose, "config", "--format", "json"));
  requireCondition(config.name === project, "Unexpected Compose project name.");
  if (useImages) {
    for (const [service, expected] of Object.entries(applicationImages)) {
      requireCondition(
        expected && config.services[service].image === expected &&
          !config.services[service].build,
        `Expected the specified prebuilt image and no build for ${service}.`,
      );
    }
  }
  const realtime = config.services.realtime.environment;
  requireCondition(
    realtime.APP_BASE_URL === baseURL &&
      realtime.REDIS_URL === "redis://redis:6379" &&
      realtime.CORE_INTERNAL_URL === "http://nginx:8082" &&
      Object.keys(realtime).length === 3,
    "Unexpected Realtime Gateway environment.",
  );
  for (const [service, { ports = [] }] of Object.entries(config.services)) {
    const expected = expectedPorts[service];
    const [binding] = ports;
    requireCondition(
      expected
        ? ports.length === 1 &&
            binding.host_ip === loopback &&
            binding.protocol === "tcp" &&
            Number(binding.target) === expected[0] &&
            Number(binding.published) === expected[1]
        : ports.length === 0,
      `Unexpected Compose port mapping for ${service}.`,
    );
  }
  requireCondition(
    config.services.postgres.environment.POSTGRES_DB === databaseName,
    "Unexpected Compose PostgreSQL database.",
  );
  for (const service of ["init", "api-a", "api-b", "worker"]) {
    const env = config.services[service].environment;
    const url = new URL(env.DATABASE_URL);
    requireCondition(
      url.protocol === "postgres:" &&
        url.hostname === "postgres" &&
        url.port === "5432" &&
        url.pathname === `/${databaseName}` &&
        env.REDIS_URL === "redis://redis:6379" &&
        env.APP_BASE_URL === baseURL &&
        !env.GOOGLE_CLIENT_ID &&
        !env.GOOGLE_CLIENT_SECRET &&
        !env.GOOGLE_CALLBACK_URL,
      `Unexpected isolated database, Redis, origin or OAuth configuration for ${service}.`,
    );
  }
  const smtp = config.services.worker.environment;
  requireCondition(
    smtp.SMTP_HOST === "mailpit" &&
      smtp.SMTP_PORT === "1025" &&
      smtp.SMTP_SECURE === "false" &&
      !smtp.SMTP_USER &&
      !smtp.SMTP_PASSWORD,
    "Verification must deliver email to the isolated Mailpit service.",
  );
  const volumes = docker("volume", "ls", "--format", "{{.Name}}").split(
    /\r?\n/,
  );
  const networks = docker("network", "ls", "--format", "{{.Name}}").split(
    /\r?\n/,
  );
  for (const [kind, resources, existing] of [
    ["volume", config.volumes, volumes],
    ["network", config.networks, networks],
  ]) {
    for (const [key, resource] of Object.entries(resources)) {
      requireCondition(
        !resource.external &&
          resource.name === `${project}_${key}` &&
          !existing.includes(resource.name),
        `Unexpected or retained ${kind} for ${key}.`,
      );
    }
  }
  requireCondition(
    !docker(
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ),
    "The generated Compose project already has containers.",
  );
}

function checkFreePort(host, port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (
        host === "::1" &&
        ["EADDRNOTAVAIL", "EAFNOSUPPORT"].includes(error.code)
      ) {
        resolve();
      } else {
        reject(
          new Error(
            `Cannot reserve test port ${host}:${port} (${error.code}).`,
          ),
        );
      }
    });
    server.listen({ host, port, exclusive: true }, () => server.close(resolve));
  });
}

async function verifyRunningProject() {
  if (useImages) {
    const imageIds = new Map(
      [...new Set(Object.values(applicationImages))].map((image) => [
        image,
        docker("image", "inspect", "--format", "{{.Id}}", image),
      ]),
    );
    for (const [service, image] of Object.entries(applicationImages)) {
      const container = docker(...compose, "ps", "--all", "--quiet", service);
      requireCondition(
        container && docker("container", "inspect", "--format", "{{.Image}}", container) === imageIds.get(image),
        `Unexpected running image ID for ${service}.`,
      );
    }
    console.log("Verified all six application container image IDs.");
  }
  for (const [service, [containerPort, hostPort]] of Object.entries(
    expectedPorts,
  )) {
    requireCondition(
      docker(...compose, "port", service, String(containerPort)) ===
        `${loopback}:${hostPort}`,
      `Unexpected published port for ${service}.`,
    );
  }
  const sql =
    "select current_database(), system_identifier::text from pg_control_system()";
  const actual = docker(
    ...compose,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "obsidian",
    "-d",
    databaseName,
    "-Atc",
    sql,
  );
  const client = new pg.Client({
    connectionString: databaseURL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const {
      rows: [identity],
    } = await client.query(sql);
    requireCondition(
      identity.current_database === databaseName &&
        actual === `${databaseName}|${identity.system_identifier}`,
      "The loopback PostgreSQL connection does not match the isolated Compose database.",
    );
  } finally {
    await client.end();
  }
  for (const service of ["nginx", "api-a", "api-b"]) {
    await verifyHealth(service);
  }
  const gateway = docker(...compose, "ps", "--quiet", "realtime");
  requireCondition(gateway, "Realtime Gateway did not start.");
  for (let attempt = 0; ; attempt++) {
    if (docker("container", "inspect", "--format", "{{.State.Health.Status}}", gateway) === "healthy") break;
    requireCondition(attempt < 20, "Realtime Gateway is not subscribed to Redis.");
    await delay(500);
  }
  console.log(
    `Verified ${project} and PostgreSQL ${loopback}:15433/${databaseName}.`,
  );
}

async function verifyHealth(service) {
  const url = `http://${loopback}:${expectedPorts[service][1]}/api/v1/health`;
  const deadline = Date.now() + 10_000;
  do {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1000),
    }).catch(() => null);
    if (response) {
      const instance = response.headers.get("x-instance-id");
      await response.body?.cancel();
      if (response.ok) {
        requireCondition(
          service === "nginx"
            ? ["api-a", "api-b"].includes(instance)
            : instance === service,
          `Unexpected instance on the port for ${service}.`,
        );
        return;
      }
    }
    await delay(250);
  } while (Date.now() < deadline);
  throw new Error(`No healthy response for ${service}.`);
}

function resetTestRateLimits() {
  const redis = [...compose, "exec", "-T", "redis", "redis-cli", "--raw"];
  const keys = docker(...redis, "--scan", "--pattern", "rate:*")
    .split(/\r?\n/)
    .filter(Boolean);
  if (keys.length) {
    docker(...redis, "UNLINK", ...keys);
    console.log(
      `Reset ${keys.length} ephemeral rate-limit keys in ${project} between suites.`,
    );
  }
}

let startAttempted = false;
try {
  checkDockerEndpoint();
  checkComposeConfig();
  await Promise.all(
    Object.values(expectedPorts).flatMap(([, port]) => [
      checkFreePort(loopback, port),
      checkFreePort("::1", port),
    ]),
  );
  const tests = globSync("backend/tests/**/*.test.js", { cwd }).sort();
  const oauth = tests.find(
    (file) => file.split(/[\\/]/).at(-1) === "google-oauth.test.js",
  );
  const localTests = tests.filter((file) => file !== oauth);
  requireCondition(
    oauth && localTests.length,
    "Expected backend test suites were not found.",
  );

  console.log(`Starting a fresh verification project: ${project}`);
  startAttempted = true;
  run("docker", [...compose, "up", "-d", useImages ? "--no-build" : "--build"]);
  await verifyRunningProject();

  for (const [index, file] of localTests.entries()) {
    if (index > 0) resetTestRateLimits();
    run(process.execPath, ["--test", "--test-concurrency=1", file], {
      env: testEnv,
    });
  }
  run("docker", [
    ...compose,
    "exec",
    "-T",
    "-e",
    "TEST_GOOGLE_OAUTH=1",
    "api-a",
    "node",
    "--test",
    oauth.replaceAll("\\", "/"),
  ]);
  if (!process.argv.includes("--api-only")) {
    resetTestRateLimits();
    run(process.execPath, ["node_modules/playwright/cli.js", "test"], {
      env: testEnv,
    });
  }
  console.log("Verification passed.");
} catch (error) {
  process.exitCode = 1;
  console.error(`Verification failed: ${error.message}`);
} finally {
  if (startAttempted) {
    try {
      run("docker", [...compose, "stop"]);
      console.log(
        `Stopped ${project}; its volumes and artifacts were retained.`,
      );
    } catch (error) {
      process.exitCode = 1;
      console.error(`Could not stop ${project}: ${error.message}`);
    }
  }
}
