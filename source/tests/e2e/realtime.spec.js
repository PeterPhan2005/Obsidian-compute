import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Client } from "../../backend/tests/checkout-fixtures.js";
import { isolatedServices } from "../../backend/tests/isolated-services.js";

test("Product reviews recover after Gateway restart and after Redis loses its subscriber", async ({ page }) => {
  test.skip(!process.env.OBSIDIAN_VERIFY_PROJECT, "Requires the verifier's isolated Compose stack");
  test.setTimeout(60_000);
  const { docker, container } = isolatedServices();
  const gateway = container("realtime");
  const redis = container("redis");
  const writer = new Client();
  const { body } = await writer.request("/products");
  const product = body.data[0];
  const sendComment = async () => {
    const text = `Gateway recovery ${randomUUID()}`;
    const response = await writer.request(`/products/${product.slug}/comments`, "POST", {
      guestName: "Realtime tester",
      body: text,
    });
    expect(response.status).toBe(201);
    return text;
  };
  let joined = 0;
  let disconnects = 0;
  let resyncs = 0;
  let failedJoins = 0;
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.startsWith("/socket.io/")) return;
    let established = false;
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      if (payload.startsWith("0{")) established = true;
      if (/^43\d+\[true\]$/.test(payload)) joined++;
      if (payload === '42["product.resync"]') resyncs++;
      if (payload.includes("Unable to join product updates.")) failedJoins++;
    });
    socket.on("close", () => {
      if (established) disconnects++;
    });
  });
  await page.goto(`/products/${product.slug}`);
  await expect.poll(() => joined).toBe(1);
  await expect(page.getByText(await sendComment(), { exact: true })).toBeVisible();

  docker("stop", gateway);
  let whileStopped;
  const paused = [];
  try {
    await expect.poll(() => disconnects).toBe(1);
    whileStopped = await sendComment();
    for (const service of ["api-a", "api-b"]) {
      const replica = container(service);
      docker("pause", replica);
      paused.push(replica);
    }
    docker("start", gateway);
    await expect.poll(() => failedJoins).toBeGreaterThan(0);
  } finally {
    for (const replica of paused) docker("unpause", replica);
    if (docker("inspect", "--format", "{{.State.Running}}", gateway) !== "true") {
      docker("start", gateway);
    }
  }
  await expect.poll(() => joined).toBe(2);
  await expect(page.getByText(whileStopped, { exact: true })).toBeVisible();

  const subscriber = docker("exec", redis, "redis-cli", "CLIENT", "LIST", "TYPE", "PUBSUB")
    .split(/\r?\n/).find((line) => line.includes("name=obsidian-realtime-subscriber "));
  const subscriberId = subscriber?.match(/^id=(\d+)/)?.[1];
  expect(subscriberId).toBeTruthy();
  const priorResyncs = resyncs;
  docker("pause", gateway);
  let whileUnsubscribed;
  try {
    expect(docker("exec", redis, "redis-cli", "CLIENT", "KILL", "ID", subscriberId)).toBe("1");
    whileUnsubscribed = await sendComment();
  } finally {
    docker("unpause", gateway);
  }
  await expect.poll(() => resyncs).toBeGreaterThan(priorResyncs);
  await expect(page.getByText(whileUnsubscribed, { exact: true })).toBeVisible();
  expect(disconnects).toBe(1);
  expect(joined).toBe(2);
});
