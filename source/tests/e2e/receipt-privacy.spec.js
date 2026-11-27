import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { navigateWithToken } from "./sensitive-navigation.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

const receiptPath = "/checkout/success";
const receiptApi = "/api/v1/checkout/receipts";

async function checkReceiptResponse(response, token) {
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).search).toBe("");
  expect(response.url().includes(token)).toBe(false);
  expect((await response.request().headerValue("x-receipt-token")) === token).toBe(true);
  expect(await response.headerValue("cache-control")).toBe("no-store");
  expect(Boolean(await response.request().headerValue("referer"))).toBe(false);
}

async function placeGuestOrder(page) {
  await page.goto("/products?category=ram");
  await page
    .locator(".product-card")
    .filter({ hasNotText: "Sold out" })
    .first()
    .click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View your bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  for (const [label, value] of Object.entries({
    "Full name": "Receipt Fixture",
    "Email address": `receipt-${randomUUID()}@example.com`,
    "Recipient name": "Receipt Fixture",
    "Phone number": "0901234567",
    "Street address": "12 Nguyen Hue",
    Ward: "Ben Nghe",
    District: "District 1",
    City: "Ho Chi Minh City",
  })) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByLabel("Test payment code").fill("DEMO-APPROVE");
  await page.getByRole("button", { name: "Review order" }).click();
}

test("Guest receipt sends no referrer after SPA and legacy navigation", async ({
  page,
}) => {
  await placeGuestOrder(page);

  const receiptResponse = () =>
    page.waitForResponse((r) =>
      new URL(r.url()).pathname === receiptApi,
    );
  const fromCheckout = receiptResponse();
  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(
    page.getByRole("heading", { name: "Order placed" }),
  ).toBeVisible();
  const success = new URL(page.url());
  expect(success.pathname).toBe(receiptPath);
  expect(Boolean(success.search)).toBe(false);
  const token = new URLSearchParams(success.hash.slice(1)).get("receipt");
  expect(Boolean(token && /^[a-f0-9]{64}$/.test(token))).toBe(true);
  await checkReceiptResponse(await fromCheckout, token);

  const imagePath = `/media/catalog/desktop-1.webp?receipt-check=${randomUUID()}`;
  const imageResponse = page.waitForResponse((r) =>
    r.url().endsWith(imagePath),
  );
  await page.evaluate(
    (url) =>
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then(() => {}),
    imagePath,
  );
  const image = await imageResponse;
  expect(image.status()).toBe(200);
  expect(Boolean(await image.request().headerValue("referer"))).toBe(false);

  const navigationPath = `/products?receipt-check=${randomUUID()}`;
  const outgoing = page.waitForRequest(
    (rq) => rq.isNavigationRequest() && rq.url().endsWith(navigationPath),
  );
  await page.evaluate((url) => {
    window.location.assign(url);
  }, navigationPath);
  expect(Boolean(await (await outgoing).headerValue("referer"))).toBe(false);
  await expect(page.locator(".product-card").first()).toBeVisible();

  const fromLegacy = receiptResponse();
  const document = page.waitForResponse((response) =>
    response.request().isNavigationRequest() &&
    new URL(response.url()).pathname === receiptPath,
  );
  await navigateWithToken(page, `${receiptPath}?${new URLSearchParams({ receipt: token })}`);
  const legacy = await document;
  expect(legacy.status()).toBe(200);
  expect(await legacy.headerValue("referrer-policy")).toBe("no-referrer");
  await checkReceiptResponse(await fromLegacy, token);
  await expect(
    page.getByRole("heading", { name: "Order placed" }),
  ).toBeVisible();
});

function recentAccessLogs(project, service) {
  const container = `${project}-${service}-1`;
  const inspect = [
    "inspect",
    "--format",
    '{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}}',
    container,
  ];
  try {
    const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
    if (
      execFileSync("docker", inspect, options).trim() !==
      `${project} ${service}`
    )
      throw new Error("Unexpected Compose container identity.");
    return execFileSync(
      "docker",
      ["logs", "--tail", "100", container],
      options,
    );
  } catch {
    throw new Error(
      `Cannot inspect fresh ${service} access logs in the isolated test project.`,
    );
  }
}

async function probe(baseURL, path, referer) {
  try {
    const response = await fetch(new URL(path, baseURL), {
      headers: referer ? { referer } : {},
    });
    await response.arrayBuffer();
    return response.status;
  } catch {
    throw new Error("Sensitive-page access-log probe request failed.");
  }
}

test("Both Nginx access logs omit synthetic receipt tokens", async ({
  baseURL,
}) => {
  const project = process.env.OBSIDIAN_VERIFY_PROJECT;
  test.skip(
    !project,
    "Run the isolated verifier to include the Nginx log check.",
  );
  expect(/^obsidian-test-[a-f0-9]{32}$/.test(project)).toBe(true);

  const token = randomBytes(32).toString("hex");
  const legacy = `${receiptPath}?receipt=${token}`;
  const apiPath = `${receiptApi}/${token}`;
  const marker = `receipt-log-check-${randomUUID()}`;
  expect(await probe(baseURL, legacy)).toBe(200);
  expect(await probe(baseURL, apiPath)).toBe(404);
  const headerResponse = await fetch(new URL(receiptApi, baseURL), {
    headers: { "X-Receipt-Token": token },
  });
  expect(headerResponse.status).toBe(404);
  await headerResponse.arrayBuffer();
  for (const [index, path] of [legacy, apiPath].entries()) {
    const ordinary = `/products?verify=${marker}-${index}`;
    expect(await probe(baseURL, ordinary, new URL(path, baseURL).href)).toBe(
      200,
    );
  }

  for (const service of ["nginx", "frontend"]) {
    let logs;
    await expect
      .poll(
        () => {
          logs = recentAccessLogs(project, service);
          return logs.includes(`${marker}-0`) && logs.includes(`${marker}-1`);
        },
        { message: `Ordinary requests logged by ${service}` },
      )
      .toBe(true);
    expect(
      logs.includes(token),
      `Receipt token absent from ${service} logs`,
    ).toBe(false);
  }
});

test("Recovery navigation suppresses referrers and both Nginx access logs omit the legacy query", async ({
  page,
  baseURL,
}) => {
  const project = process.env.OBSIDIAN_VERIFY_PROJECT;
  test.skip(!project, "Run the isolated verifier for proxy log checks.");
  expect(/^obsidian-test-[a-f0-9]{32}$/.test(project)).toBe(true);

  const marker = `recovery-log-check-${randomUUID()}`;
  const fixture = randomBytes(32).toString("base64url");
  const legacy = `/reset-password?${new URLSearchParams({ token: fixture })}`;
  await page.goto(`/products?verify=${marker}-start`);
  const document = page.waitForResponse((response) =>
    response.request().isNavigationRequest() &&
    new URL(response.url()).pathname === "/reset-password",
  );
  await navigateWithToken(page, legacy);
  const response = await document;
  expect(response.status()).toBe(200);
  expect(await response.headerValue("referrer-policy")).toBe("no-referrer");
  expect(await response.headerValue("cache-control")).toBe("no-store");
  await expect(page.getByRole("heading", { name: /new password/i })).toBeVisible();
  await expect.poll(() => Boolean(new URL(page.url()).search)).toBe(false);

  const outgoing = page.waitForRequest((request) =>
    request.url().includes(`/products?verify=${marker}`),
  );
  const path = `/products?verify=${marker}`;
  await page.evaluate((url) => fetch(url).then((r) => r.text()).then(() => {}), path);
  expect(Boolean(await (await outgoing).headerValue("referer"))).toBe(false);
  expect(await probe(baseURL, `${path}-referer`, new URL(legacy, baseURL).href)).toBe(200);

  for (const service of ["nginx", "frontend"]) {
    let logs;
    await expect.poll(() => {
      logs = recentAccessLogs(project, service);
      return logs.includes(`${marker}-referer`);
    }).toBe(true);
    expect(logs.includes(fixture), `Recovery credential absent from ${service} logs`).toBe(false);
  }

  await page.route("**/api/v1/auth/password/recover/confirm", async (route) => {
    await route.fulfill({ status: 204 });
  });
  async function submitReset(expectedToken) {
    const request = page.waitForRequest((request) =>
      new URL(request.url()).pathname === "/api/v1/auth/password/recover/confirm",
    );
    await page.getByLabel("New password", { exact: true }).fill(randomUUID());
    await page.getByRole("button", { name: "Reset password" }).click();
    expect((await request).postDataJSON()?.token === expectedToken).toBe(true);
    await expect(page.getByText("Your password is updated.")).toBeVisible();
  }

  await submitReset(fixture);
  await page.goto(`/products?verify=${marker}-leave`);
  const fragment = randomBytes(32).toString("base64url");
  await navigateWithToken(page, `/reset-password#${new URLSearchParams({ token: fragment })}`);
  await expect(page.getByRole("heading", { name: /new password/i })).toBeVisible();
  await expect.poll(() => Boolean(new URL(page.url()).hash)).toBe(false);
  await submitReset(fragment);
});

test("Both running Nginx layers disable error logging for legacy reset pages", async () => {
  const project = process.env.OBSIDIAN_VERIFY_PROJECT;
  test.skip(!project, "Run the isolated verifier to inspect both proxy configurations.");
  expect(/^obsidian-test-[a-f0-9]{32}$/.test(project)).toBe(true);

  for (const service of ["nginx", "frontend"]) {
    const config = execFileSync("docker", [
      "exec", `${project}-${service}-1`, "nginx", "-T",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const resetLocations = [...config.matchAll(/location ~\* ([^{}\r\n]+) \{([^{}]+)\}/g)]
      .filter(([, pattern]) => new RegExp(pattern, "i").test("/reset-password"));

    expect(resetLocations, `Reset location in ${service}`).toHaveLength(1);
    const [, pattern, directives] = resetLocations[0];
    const match = new RegExp(pattern, "i");
    expect(match.test("/RESET-PASSWORD/")).toBe(true);
    expect(match.test("/reset-password/help")).toBe(false);
    expect(match.test("/products")).toBe(false);
    expect(directives).toMatch(/error_log\s+\/dev\/null\s*;/);
    const storefront = [...config.matchAll(/location \/ \{([^{}]+)\}/g)]
      .map(([, body]) => body)
      .find((body) => /proxy_pass http:\/\/frontend:80|try_files/.test(body));
    expect(storefront).toBeDefined();
    expect(storefront).not.toMatch(/error_log\s+\/dev\/null/);
  }
});
