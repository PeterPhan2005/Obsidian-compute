import { test, expect } from "@playwright/test";

for (const fallback of [false, true]) {
test(`A delayed first cart read and a concurrent add keep one bag (${fallback ? "IndexedDB" : "Web Locks"})`, async ({
  page,
  context,
}) => {
  if (fallback) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "locks", { value: undefined });
    });
  }
  const { data: products } = await (
    await page.request.get("/api/v1/products?category=ram")
  ).json();
  const product = products.find((p) => p.variants.some((v) => v.isAvailable));
  expect(product).toBeDefined();
  const path = `/products/${product.slug}`;
  const firstRead = Promise.withResolvers();
  const releaseRead = Promise.withResolvers();
  let cartReads = 0;
  let adds = 0;
  await context.route("**/api/v1/cart", async (route) => {
    cartReads += 1;
    if (cartReads === 1) {
      firstRead.resolve();
      await releaseRead.promise;
    }
    await route.continue();
  });
  await context.route("**/api/v1/cart/items", async (route) => {
    adds += 1;
    await route.continue();
  });
  const other = await context.newPage();
  try {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await firstRead.promise;
    await other.goto(path, { waitUntil: "domcontentloaded" });
    await other.getByRole("button", { name: "Add to bag", exact: true }).click();
    await expect(other.getByRole("button", { name: "Adding…" })).toBeVisible();
    expect(cartReads).toBe(1);
    expect(adds).toBe(0);
  } finally {
    releaseRead.resolve();
  }
  await expect(other.getByRole("button", { name: "Added to your bag" })).toBeVisible();
  const { data: placed } = await (await other.request.get("/api/v1/cart")).json();
  expect(placed.itemCount).toBe(1);
  await page.reload();
  await page.getByRole("link", { name: "Shopping bag", exact: true }).click();
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  const { data: reloaded } = await (await page.request.get("/api/v1/cart")).json();
  expect(reloaded.id).toBe(placed.id);
  expect(reloaded.itemCount).toBe(1);
});
}
