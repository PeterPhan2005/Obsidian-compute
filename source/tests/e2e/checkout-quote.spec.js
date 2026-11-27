import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off", video: "off" });

async function reviewGuestOrder(page) {
  await page.goto("/products?category=ram");
  const cards = page.locator(".product-card").filter({ hasNotText: "Sold out" });
  await cards.first().click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("link", { name: "View your bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await reviewGuestDelivery(page);
}

async function reviewGuestDelivery(page) {
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  for (const [label, value] of [
    ["Full name", "Checkout Fixture"],
    ["Email address", `checkout-${randomUUID()}@example.com`],
    ["Recipient name", "Checkout Fixture"],
    ["Phone number", "0901234567"],
    ["Street address", "12 Nguyen Hue"],
    ["Ward", "Ben Nghe"],
    ["District", "District 1"],
    ["City", "Ho Chi Minh City"],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByLabel("Test payment code").fill("DEMO-APPROVE");
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page.getByText("Qty 1", { exact: false })).toBeVisible();
}

test("A refreshed quote cannot replace the reviewed bag until the customer reviews again", async ({
  page, context,
}) => {
  await reviewGuestOrder(page);
  const placeOrder = page.getByRole("button", { name: "Place order & pay" });
  const secondTab = await context.newPage();
  await secondTab.goto("/cart");
  await secondTab.getByRole("button", { name: /Increase / }).click();
  await expect(secondTab.locator(".quantity")).toContainText("2");

  const refresh = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/checkout/quote") && response.ok());
  await page.bringToFront();
  // Headless pages may both be visible, so notify the focused quote observer explicitly.
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  const refreshed = await (await refresh).json();
  expect(refreshed.data.cart.itemCount).toBe(2);
  await expect(page.locator(".checkout-item")).toContainText("Qty 1");
  await expect(page.locator(".cart-summary")).toContainText("1 items");

  const reject = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/checkout/orders"));
  await placeOrder.click();
  expect((await reject).status()).toBe(409);
  await expect(page.getByText(/Your bag or totals changed/)).toBeVisible();
  await expect(placeOrder).toHaveCount(0);
  await expect(page.locator(".cart-summary")).toContainText("2 items");

  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page.locator(".checkout-item")).toContainText("Qty 2");
  await placeOrder.click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  await secondTab.close();
});

test("Retry after a lost committed response replays the same order with a now-empty cart", async ({ page }) => {
  await reviewGuestOrder(page);
  let first;
  let second;
  await page.route("**/api/v1/checkout/orders", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const attempt = {
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
      status: response.status(),
      orderId: payload.data?.order?.id,
    };
    if (!first) {
      first = attempt;
      await route.abort("failed");
    } else {
      second = attempt;
      await route.fulfill({ response });
    }
  });

  await page.getByRole("button", { name: "Place order & pay" }).click();
  const retry = page.getByRole("button", { name: "Retry this order" });
  await expect(retry).toBeVisible();
  expect(first?.status).toBe(201);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  const empty = await page.request.get("/api/v1/cart");
  expect((await empty.json()).data.itemCount).toBe(0);
  await retry.click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  expect(second?.status).toBe(201);
  expect(Boolean(first.orderId && first.orderId === second.orderId)).toBe(true);
  expect(first.key === second.key && first.body === second.body).toBe(true);
});

test("Reload after a committed checkout recovers the original receipt without resubmitting", async ({ page }) => {
  await reviewGuestOrder(page);
  let submissions = 0;
  let committed;
  await page.route("**/api/v1/checkout/orders", async (route) => {
    submissions++;
    const response = await route.fetch();
    committed = {
      status: response.status(),
      orderNumber: (await response.json()).data?.order?.orderNumber,
    };
    await route.abort("failed");
  });

  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(page.getByRole("button", { name: "Retry this order" })).toBeVisible();
  expect(committed?.status).toBe(201);
  expect(Boolean(committed?.orderNumber)).toBe(true);
  const storedValues = () => page.evaluate(() =>
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith("obsidian-checkout:"))
      .map((key) => sessionStorage.getItem(key)),
  );
  const stored = await storedValues();
  expect(stored).toHaveLength(1);
  expect(/^[a-f0-9-]{36}$/.test(stored[0])).toBe(true);

  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.getByRole("button", { name: "Check order status" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Check order status" }).click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  await expect(page.getByText(committed.orderNumber, { exact: true })).toBeVisible();
  expect(submissions).toBe(1);
  expect(await storedValues()).toHaveLength(0);
});

test("Uncommitted checkout after reload requires a fresh review and reuses the submitted key", async ({ page }) => {
  await reviewGuestOrder(page);
  const keys = [];
  await page.route("**/api/v1/checkout/orders", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) await route.abort("failed");
    else await route.continue();
  });

  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(page.getByRole("button", { name: "Retry this order" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Check order status" }).click();
  await expect(page.getByText(/No completed order was found/)).toBeVisible();
  expect(keys).toHaveLength(1);

  await reviewGuestDelivery(page);
  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(Boolean(keys[0] && keys[0] === keys[1])).toBe(true);
});

test("A new guest cart and a signed-in Customer do not inherit checkout recovery", async ({ page, context }) => {
  await reviewGuestOrder(page);
  await page.route("**/api/v1/checkout/orders", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(page.getByRole("button", { name: "Retry this order" })).toBeVisible();

  await context.clearCookies({ name: "guest_cart" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your bag is empty" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check order status" })).toHaveCount(0);

  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("alex@example.com");
  await page.getByLabel("Password", { exact: true }).fill("ObsidianCustomer!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: /Your bag is empty|Make it yours/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check order status" })).toHaveCount(0);
});

test("Checkout retries in the same page when sessionStorage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() { throw new DOMException("Access denied", "SecurityError"); },
    });
  });
  await page.clock.install();
  await reviewGuestOrder(page);
  const attempts = [];
  await page.route("**/api/v1/checkout/orders", async (route) => {
    const response = await route.fetch();
    attempts.push({
      key: route.request().headers()["idempotency-key"],
      orderId: (await response.json()).data?.order?.id,
    });
    if (attempts.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });

  await page.getByRole("button", { name: "Place order & pay" }).click();
  const retry = page.getByRole("button", { name: "Retry this order" });
  await expect(retry).toBeVisible();
  let failedCartReads = 0;
  const cartRoute = "**/api/v1/cart";
  await page.route(cartRoute, (route) => {
    failedCartReads++;
    return route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } });
  });
  const now = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(now + 16_000);
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => failedCartReads).toBe(2);
  await expect(retry).toBeVisible();
  await page.unroute(cartRoute);

  await retry.click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(Boolean(attempts[0].orderId && attempts[0].orderId === attempts[1].orderId)).toBe(true);
  expect(Boolean(attempts[0].key && attempts[0].key === attempts[1].key)).toBe(true);
});

test("A recovery response cannot redirect after the user leaves checkout", async ({ page }) => {
  await reviewGuestOrder(page);
  await page.route("**/api/v1/checkout/orders", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(page.getByRole("button", { name: "Retry this order" })).toBeVisible();
  await page.reload();

  const requested = Promise.withResolvers();
  const release = Promise.withResolvers();
  const recoveryRoute = "**/api/v1/checkout/recovery";
  await page.route(recoveryRoute, async (route) => {
    const response = await route.fetch();
    requested.resolve();
    await release.promise;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Check order status" }).click();
    await requested.promise;
    await page.getByRole("link", { name: "All products", exact: true }).click();
    await expect(page).toHaveURL(/\/products$/);
    const refreshedCart = page.waitForResponse((response) =>
      response.ok() && new URL(response.url()).pathname === "/api/v1/cart",
    );
    release.resolve();
    await refreshedCart;
    await expect.poll(() => page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith("obsidian-checkout:")).length,
    )).toBe(1);
    await expect(page).toHaveURL(/\/products$/);
  } finally {
    release.resolve();
    await page.unroute(recoveryRoute);
  }

  await page.goto("/checkout");
  await page.getByRole("button", { name: "Check order status" }).click();
  await expect(page.getByRole("heading", { name: "Order placed" })).toBeVisible();
});
