import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client, shipping } from "../../backend/tests/checkout-fixtures.js";

test.skip(
  !/^obsidian-test-[a-f0-9]{32}$/.test(
    process.env.OBSIDIAN_VERIFY_PROJECT ?? "",
  ),
  "Requires the isolated verifier for catalog mutations",
);

async function createProduct(baseURL) {
  expect(baseURL).toBe("http://localhost:8081");
  const admin = new Client(baseURL);
  await admin.login();
  const categories = await admin.request("/categories");
  expect(categories.status).toBe(200);
  const slug = `catalog-availability-${randomUUID()}`;
  const response = await admin.request("/admin/products", "POST", {
    name: "Availability fixture desktop",
    slug,
    brand: "Obsidian",
    categoryId: categories.body.data.find(({ slug }) => slug === "desktop").id,
    shortDescription:
      "Desktop used in the isolated catalog availability tests.",
    descriptionLines: [
      "Desktop chassis",
      "Local storage",
      "Two memory channels",
      "Air cooling",
      "Replaceable components",
    ],
    tags: ["desktop"],
    images: [1, 2, 3].map((index) => ({
      url: `/media/catalog/desktop-${index}.webp`,
    })),
    variants: ["Standard", "Premium"].map((configuration, index) => ({
      sku: `${slug}-${index}`,
      attributes: { configuration },
      priceVnd: 1_000_000 + 100_000 * index,
      costPriceVnd: 700_000,
      stock: 7,
    })),
  });
  expect(response.status).toBe(201);
  return { admin, product: response.body.data };
}

async function setStock(admin, variant, stock) {
  const response = await admin.request(
    `/admin/variants/${variant.id}/inventory`,
    "PATCH",
    { stock, expectedStockVersion: variant.stockVersion },
  );
  expect(response.status).toBe(200);
  expect(response.body.data.stock).toBe(stock);
  return response.body.data;
}

test("A cart quantity above remaining inventory can be reduced and reviewed", async ({
  page,
  baseURL,
}) => {
  const { admin, product } = await createProduct(baseURL);
  try {
    await page.goto(`/products/${product.slug}`);
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.getByRole("link", { name: "View your bag" }).click();
    const decrease = page.getByRole("button", {
      name: `Decrease ${product.name}`,
    });
    const increase = page.getByRole("button", {
      name: `Increase ${product.name}`,
    });
    const quantity = page.locator(".cart-item .quantity span");
    await expect(quantity).toHaveText("1");
    await increase.click();
    await expect(quantity).toHaveText("2");
    await decrease.click();
    await expect(quantity).toHaveText("1");
    await increase.click();
    await expect(quantity).toHaveText("2");
    await increase.click();
    await expect(quantity).toHaveText("3");

    const reducedVariant = await setStock(admin, product.variants[0], 1);
    await expect(quantity).toHaveText("3");
    const cartUpdate = (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname.startsWith("/api/v1/cart/items/");
    const rejected = page.waitForResponse(cartUpdate);
    await decrease.click();
    expect((await rejected).status()).toBe(409);
    await expect(page.locator(".cart-item .danger")).toContainText(
      "Only 1 available",
    );
    await expect(increase).toBeDisabled();
    const reduced = page.waitForResponse(cartUpdate);
    await decrease.click();
    const response = await reduced;
    expect(response.status()).toBe(200);
    const { data: cart } = await response.json();
    expect(cart.items).toMatchObject([{ quantity: 1, availableStock: 1 }]);
    expect(cart.subtotalVnd).toBe(reducedVariant.priceVnd);
    await expect(quantity).toHaveText("1");
    await expect(decrease).toBeDisabled();
    await expect(page.locator(".cart-item-total strong")).toHaveText(
      "1,000,000₫",
    );

    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await page.getByRole("button", { name: "Continue to delivery" }).click();
    for (const [label, value] of [
      ["Full name", shipping.recipientName],
      ["Email address", `stock-review-${randomUUID()}@example.com`],
      ["Recipient name", shipping.recipientName],
      ["Phone number", shipping.phone],
      ["Street address", shipping.line1],
      ["Ward", shipping.ward],
      ["District", shipping.district],
      ["City", shipping.city],
    ]) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.getByLabel("Test payment code").fill("DEMO-APPROVE");
    await page.getByRole("button", { name: "Review order" }).click();
    await expect(page.locator(".checkout-item")).toContainText("Qty 1");
    await expect(page.locator(".checkout-item")).toContainText("1,000,000₫");

    await setStock(admin, reducedVariant, 0);
    await page.goto("/cart");
    await expect(
      page.getByText("This item is unavailable. Remove it to continue."),
    ).toBeVisible();
    await expect(decrease).toBeDisabled();
    await expect(increase).toBeDisabled();
    await page.getByRole("button", { name: `Remove ${product.name}` }).click();
    await expect(page.getByText(/Your bag is empty/)).toBeVisible();
  } finally {
    const archive = await admin.request(
      `/admin/products/${product.id}`,
      "DELETE",
    );
    expect(archive.status).toBe(204);
  }
});

test("Product Details discards stale actions only after a definitive not found response", async ({
  page,
  baseURL,
}) => {
  const { admin, product } = await createProduct(baseURL);
  const productPath = `/products/${product.slug}`;
  const detailApi = `**/api/v1${productPath}`;
  const sockets = [];
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname === "/socket.io/") sockets.push(socket);
  });
  let archived = false;
  try {
    await page.clock.install({ time: Date.now() });
    await page.goto(productPath);
    const add = page.getByRole("button", { name: "Add to bag" });
    const unavailable = page.getByRole("heading", {
      name: "Product unavailable",
    });
    await expect(add).toBeEnabled();
    await page.getByRole("button", { name: /Premium/ }).click();
    await expect(page.locator(".detail-price")).toHaveText("1,100,000₫");
    await expect
      .poll(() => sockets.some((socket) => !socket.isClosed()))
      .toBe(true);

    const refetchOnFocus = async () => {
      await page.bringToFront();
      const now = await page.evaluate(() => Date.now());
      await page.clock.setSystemTime(now + 16_000);
      await page.evaluate(() =>
        window.dispatchEvent(new Event("visibilitychange")),
      );
    };
    await page.route(detailApi, (route) => route.abort("failed"));
    await refetchOnFocus();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Showing the last loaded information/ }),
    ).toBeVisible();
    await expect(unavailable).toHaveCount(0);
    await expect(add).toBeEnabled();
    await page.unroute(detailApi);

    const archive = await admin.request(
      `/admin/products/${product.id}`,
      "DELETE",
    );
    expect(archive.status).toBe(204);
    archived = true;
    const notFound = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/v1${productPath}` &&
        response.status() === 404,
    );
    await refetchOnFocus();
    await notFound;
    await expect(unavailable).toBeVisible();
    await expect(add).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Post comment" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Sign in to rate" }),
    ).toHaveCount(0);
    await expect
      .poll(() => sockets.every((socket) => socket.isClosed()))
      .toBe(true);

    const serviceErrors = [];
    const collectServiceErrors = (response) => {
      if (
        new URL(response.url()).pathname === `/api/v1${productPath}` &&
        response.status() === 503
      )
        serviceErrors.push(response);
    };
    page.on("response", collectServiceErrors);
    await page.route(detailApi, (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "Temporarily unavailable" } },
      }),
    );
    await refetchOnFocus();
    await expect.poll(() => serviceErrors.length).toBe(2);
    await serviceErrors[1].finished();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    await expect(unavailable).toBeVisible();
    await expect(add).toHaveCount(0);
    expect(sockets.every((socket) => socket.isClosed())).toBe(true);
    await page.unroute(detailApi);
    page.off("response", collectServiceErrors);

    await page.goto(productPath);
    await expect(unavailable).toBeVisible();
    await expect(add).toHaveCount(0);
    await page.getByRole("link", { name: "Explore products" }).click();
    await expect(page).toHaveURL(/\/products$/);
  } finally {
    if (!archived) {
      const archive = await admin.request(
        `/admin/products/${product.id}`,
        "DELETE",
      );
      expect(archive.status).toBe(204);
    }
  }
});
