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
