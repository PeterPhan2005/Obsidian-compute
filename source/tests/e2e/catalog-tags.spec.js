import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const seedCatalog = JSON.parse(
  readFileSync(
    new URL("../../backend/seeds/catalog.json", import.meta.url),
    "utf8",
  ),
);

test("Product tag links open a tagged catalog with route-specific metadata", async ({
  page,
}) => {
  const product = seedCatalog.find((item) => item.tags.includes("portable"));
  const tag = "portable";
  const description = page.locator('head meta[name="description"]');
  await page.goto(`/products/${product.slug}`);
  await expect(page).toHaveTitle(`${product.name} | Obsidian Compute`);
  await expect(description).toHaveAttribute(
    "content",
    product.shortDescription,
  );
  const tagLink = page
    .getByRole("navigation", { name: "Product tags" })
    .getByRole("link", { name: tag, exact: true });
  await expect(tagLink).toHaveAttribute("href", `/products?tag=${tag}`);
  await tagLink.click();
  await expect(page).toHaveURL(`/products?tag=${tag}`);
  await expect(page).toHaveTitle(/Computers & Components tagged “portable”/);
  await expect(description).toHaveAttribute("content", /tagged “portable”/);
  await expect(description).toHaveCount(1);
  await expect(page.getByLabel("Tag", { exact: true })).toHaveValue(tag);

  const expectedLinks = seedCatalog
    .filter((item) => item.tags.includes(tag))
    .map((item) => `/products/${item.slug}`)
    .sort();
  const results = page.locator(".product-card");
  await expect(results).toHaveCount(expectedLinks.length);
  expect(
    await results.evaluateAll((links) =>
      links.map((link) => link.pathname).sort(),
    ),
  ).toEqual(expectedLinks);
  await page.reload();
  await expect(page.locator(".product-card")).toHaveCount(expectedLinks.length);
  await page.goBack();
  await expect(page).toHaveTitle(`${product.name} | Obsidian Compute`);
  await page.getByRole("link", { name: "Collection", exact: true }).click();
  await expect(page).toHaveTitle("Computers & Components | Obsidian Compute");
  await page.locator(".breadcrumb").getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveTitle(
    "OBSIDIAN COMPUTE — Power, without the noise.",
  );
  await expect(description).toHaveAttribute(
    "content",
    /considered computers and components/,
  );
});

test("Tag selection, empty results and pagination preserve other catalog filters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const url = new URLSearchParams({
    q: "Obsidian",
    category: "laptop",
    brand: "Obsidian",
    minPrice: "16000000",
    maxPrice: "26000000",
    ratingMin: "4",
    sort: "price_desc",
    pageSize: "1",
    page: "2",
  });
  await page.goto(`/products?${url}`);
  const result = page.locator(".product-card");
  const lowerPrice = "/products/obsidian-studio-16-laptop";
  const higherPrice = "/products/obsidian-slate-13-laptop";
  await expect(result).toHaveAttribute("href", lowerPrice);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const tagSelect = page.getByLabel("Tag", { exact: true });
  await tagSelect.selectOption("portable");
  url.delete("page");
  url.set("tag", "portable");
  await expect(page).toHaveURL(`/products?${url}`);
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(result).toHaveAttribute("href", higherPrice);
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  url.set("page", "2");
  await expect(page).toHaveURL(`/products?${url}`);
  await expect(result).toHaveAttribute("href", lowerPrice);
  await page.getByRole("button", { name: "Clear tag" }).click();
  url.delete("page");
  url.delete("tag");
  await expect(page).toHaveURL(`/products?${url}`);
  await expect(result).toHaveAttribute("href", higherPrice);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await tagSelect.selectOption("desktop");
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(
    page.getByRole("heading", { name: "No products found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Page 1", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test("Catalog shows the effective sort and preserves explicit choices through navigation", async ({
  page,
}) => {
  const sort = page.getByLabel("Sort products");
  const cases = [
    ["", "newest"],
    ["?tag=portable", "newest"],
    ["?q=Obsidian", "relevance"],
    ["?collection=best_sellers", "best_selling"],
    ["?q=Obsidian&tag=portable", "relevance"],
    ["?collection=best_sellers&tag=portable", "best_selling"],
    ["?collection=best_sellers&tag=portable&sort=relevance", "newest"],
  ];
  for (const [query, expectedSort] of cases) {
    await page.goto(`/products${query}`);
    await expect(sort).toHaveValue(expectedSort);
  }

  const query = "collection=best_sellers&q=Obsidian&tag=portable&pageSize=1";
  await page.goto(`/products?${query}&page=2`);
  await expect(sort).toHaveValue("best_selling");
  await sort.selectOption("relevance");
  await expect(page).toHaveURL(`/products?${query}&sort=relevance`);
  await expect(sort).toHaveValue("relevance");
  await page.getByRole("button", { name: "Clear tag" }).click();
  await expect(page).toHaveURL(
    "/products?collection=best_sellers&q=Obsidian&pageSize=1&sort=relevance",
  );
  await expect(sort).toHaveValue("relevance");
  await page.goBack();
  await expect(page).toHaveURL(`/products?${query}&sort=relevance`);
  await page.goBack();
  await expect(page).toHaveURL(`/products?${query}&page=2`);
  await expect(sort).toHaveValue("best_selling");
  await sort.selectOption("newest");
  await expect(page).toHaveURL(`/products?${query}&sort=newest`);
  await expect(sort).toHaveValue("newest");
});
