import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const seed = JSON.parse(
  readFileSync(new URL("../../backend/seeds/catalog.json", import.meta.url)),
);
const portability = "A portable notebook for reading documents while I travel";
const gpuNeed = "Tôi muốn chơi trò chơi và dựng cảnh ba chiều";
const panel = (page) =>
  page.getByRole("region", { name: "AI product recommendations" });
const results = (page) =>
  panel(page).getByRole("list", { name: "Recommended products" });
const status = (page) => panel(page).getByRole("status");

async function open(page) {
  await page.goto("/products");
  await expect(page.locator(".product-card").first()).toBeVisible();
  const toggle = panel(page).getByRole("button", {
    name: "AI product recommendations",
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

async function ask(page, query) {
  await panel(page).getByRole("textbox").fill(query);
  await panel(page)
    .getByRole("button", { name: "Get recommendations" })
    .click();
}

test("English and Vietnamese needs rank different real catalog products without remote inference", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const external = [];
  const requested = [];
  const origin = new URL(baseURL).origin;
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) {
      external.push(url);
      return route.abort();
    }
    requested.push(url);
    return route.continue();
  });
  await page.goto("/products");
  await expect(page.locator(".product-card").first()).toBeVisible();
  expect(
    requested.some((url) =>
      /recommendation.worker|recommendation-assets|\.wasm$/.test(url),
    ),
  ).toBe(false);
  await panel(page)
    .getByRole("button", { name: "AI product recommendations" })
    .click();

  const examples = [
    [portability, "laptop"],
    ["I fly often and need a portable notebook for documents", "laptop"],
    ["Tôi cần một chiếc laptop nhỏ nhẹ để làm việc khi đi xa", "laptop"],
    ["A screen with more room for several windows side by side", "monitor"],
    ["Một màn hình lớn để đặt nhiều cửa sổ làm việc cạnh nhau", "monitor"],
    ["Tôi muốn xem phim trên một màn hình lớn", "monitor"],
    ["I need storage to keep lots of large project files", "ssd"],
    ["Tôi cần thêm dung lượng để lưu nhiều tệp dự án lớn", "ssd"],
    [gpuNeed, "gpu"],
  ];
  for (const [query, category] of examples) {
    await ask(page, query);
    await expect(status(page), query).toHaveText(/^[1-3] recommended product/, {
      timeout: 45_000,
    });
    const paths = await results(page)
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.pathname));
    expect(paths.length).toBeLessThanOrEqual(3);
    if (query === portability) {
      const pagination = panel(page).getByRole("navigation", { name: "Recommendation pagination" });
      const currentPage = pagination.getByRole("button", { name: "Page 1" });
      await expect(currentPage).toHaveAttribute("aria-current", "page");
      await expect(pagination.getByRole("button", { name: "Previous page" })).toBeDisabled();
      await expect(pagination.getByRole("button", { name: "Next page" })).toBeDisabled();
      const catalogUrl = page.url();
      const requestsBeforeClick = requested.filter((url) => url.includes("/api/v1/products")).length;
      await currentPage.click();
      await expect(status(page)).toHaveText(/^[1-3] recommended product/);
      expect(requested.filter((url) => url.includes("/api/v1/products"))).toHaveLength(requestsBeforeClick);
      expect(page.url()).toBe(catalogUrl);
    }
    const response = await page.request.get("/api/v1" + paths[0]);
    expect(response.ok()).toBe(true);
    const { data: product } = await response.json();
    expect(product.category.slug, `${query}: ${paths.join(", ")}`).toBe(
      category,
    );
    expect(
      paths.some((path) =>
        seed.some(
          (item) =>
            item.categorySlug === category && path === `/products/${item.slug}`,
        ),
      ),
    ).toBe(true);
  }
  for (const query of [
    "Where can I buy a cake for a birthday party?",
    "Tôi muốn đặt bánh sinh nhật vị sô cô la",
    "I need a keyboard for my computer",
    "Tôi cần chuột không dây làm việc văn phòng",
  ]) {
    await ask(page, query);
    await expect(status(page)).toHaveText(/No suitable products available/);
    await expect(results(page)).toHaveCount(0);
    await expect(panel(page).getByRole("navigation", { name: "Recommendation pagination" })).toHaveCount(0);
  }
  for (const query of [
    "Not a desktop or laptop, I want a lightweight mouse for office work",
    "Không cần máy tính, tôi cần một máy in cho tài liệu văn phòng",
    "I need a 64GB RAM laptop for virtualization",
    "Tôi muốn máy tính xách tay RAM 64 GB để phân tích dữ liệu",
  ]) {
    await ask(page, query);
    await expect(status(page)).toHaveText(
      /Describe the intended use in positive terms/,
    );
    await expect(results(page)).toHaveCount(0);
  }
  expect(
    requested.some((url) => url.endsWith("/onnx/model_quantized.onnx")),
  ).toBe(true);
  expect(requested.some((url) => url.endsWith(".wasm"))).toBe(true);
  expect(external).toEqual([]);
});

test("Recommendations respect the category and show the available variant price and detail link on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await open(page);
  await panel(page).getByLabel("Product category").selectOption("laptop");
  const budget = panel(page).getByLabel("Maximum budget (VND)");
  await budget.fill("15000000");
  await ask(page, portability);
  const links = results(page).getByRole("link");
  await expect(links.first()).toBeVisible({ timeout: 45_000 });
  for (const link of await links.all()) {
    const href = await link.getAttribute("href");
    const response = await page.request.get("/api/v1" + href);
    expect(response.ok()).toBe(true);
    const { data: product } = await response.json();
    expect(product.category.slug).toBe("laptop");
    const variant = product.variants.find((item) => item.isAvailable);
    expect(variant.priceVnd).toBeLessThanOrEqual(15_000_000);
    await expect(link).toContainText(
      `${variant.priceVnd.toLocaleString("en-US")}₫ · In stock`,
    );
    await expect(link.getByRole("img")).toHaveAttribute(
      "src",
      product.thumbnailUrl,
    );
    await expect(link).toContainText(product.name);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await budget.fill("0");
  await ask(page, portability);
  await expect(status(page)).toHaveText(/No suitable products available/);
  await budget.fill("15000000");
  await ask(page, portability);
  await expect(links.first()).toBeVisible();
  const href = await links.first().getAttribute("href");
  await links.first().click();
  await expect(page).toHaveURL(href);
});

test("Real catalog entries outside the bound or without an eligible visible offer are not ranked", async ({
  page,
}) => {
  test.skip(
    !process.env.OBSIDIAN_VERIFY_PROJECT,
    "Requires the isolated verifier",
  );
  const dbURL = new URL(process.env.DATABASE_URL);
  expect(dbURL.hostname).toBe("127.0.0.1");
  expect(dbURL.port).toBe("15433");
  expect(dbURL.pathname).toBe("/obsidian_test");
  expect(process.env.OBSIDIAN_VERIFY_PROJECT).toMatch(
    /^obsidian-test-[a-f0-9]{32}$/,
  );
  const db = new pg.Client({ connectionString: dbURL.href });
  await db.connect();
  const fixtureSlug = `recommendation-bound-${randomUUID()}`;
  const archived = "obsidian-air-13-laptop";
  const soldOut = "forma-air-14-laptop";
  let inventory = [];
  let fixturesAuthorized = false;
  let previousVisibility;
  try {
    const {
      rows: [identity],
    } = await db.query("SELECT current_database() AS db");
    expect(identity.db).toBe("obsidian_test");
    fixturesAuthorized = true;
    await db.query(
      `
      INSERT INTO products (slug, name, brand, category_id, short_description, description_lines, tags)
      SELECT $1 || '-' || n, 'Bound fixture ' || n, brand, category_id, short_description, description_lines, tags
      FROM products CROSS JOIN generate_series(1, 65) AS n WHERE slug = $2
    `,
      [fixtureSlug, archived],
    );
    await db.query(
      `
      INSERT INTO product_variants (product_id, sku, attributes, price_vnd, cost_price_vnd, stock)
      SELECT id, slug, '{"test":"fixture"}', 1, 1, 1 FROM products WHERE slug LIKE $1
    `,
      [fixtureSlug + "-%"],
    );
    await open(page);
    const workers = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    await ask(page, portability);
    await expect(status(page)).toContainText("More than 64 products");
    expect(workers).toEqual([]);

    // The second laptop has a cheap sold-out offer and an expensive stocked offer.
    ({ rows: inventory } = await db.query(
      `
      SELECT v.id, v.stock, v.price_vnd FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.slug = $1 ORDER BY v.price_vnd
    `,
      [soldOut],
    ));
    expect(inventory).toHaveLength(2);
    const {
      rows: [original],
    } = await db.query("SELECT is_active FROM products WHERE slug = $1", [
      archived,
    ]);
    previousVisibility = original.is_active;
    await db.query("UPDATE products SET is_active = false WHERE slug = $1", [
      archived,
    ]);
    await db.query("UPDATE product_variants SET stock = 0 WHERE id = $1", [
      inventory[0].id,
    ]);
    await db.query("UPDATE product_variants SET stock = 1 WHERE id = $1", [
      inventory[1].id,
    ]);
    await db.query("UPDATE products SET is_active = false WHERE slug LIKE $1", [
      fixtureSlug + "-%",
    ]);
    const budget = Number(inventory[0].price_vnd);
    const listing = await page.request.get(
      `/api/v1/products?category=laptop&maxPrice=${budget}&pageSize=64`,
    );
    const { data } = await listing.json();
    expect(data.some((item) => item.slug === archived)).toBe(false);
    const offers = data.find((item) => item.slug === soldOut).variants;
    expect(offers.some((item) => item.priceVnd <= budget)).toBe(true);
    expect(offers.some((item) => item.isAvailable)).toBe(true);
    expect(
      data.every(
        (item) =>
          !item.variants.some(
            (offer) => offer.isAvailable && offer.priceVnd <= budget,
          ),
      ),
    ).toBe(true);
    await panel(page).getByLabel("Product category").selectOption("laptop");
    await panel(page).getByLabel("Maximum budget (VND)").fill(String(budget));
    await ask(page, portability);
    await expect(status(page)).toContainText("No suitable products available");
    expect(workers).toEqual([]);
  } finally {
    try {
      if (fixturesAuthorized) {
        for (const variant of inventory) {
          await db.query(
            "UPDATE product_variants SET stock = $2 WHERE id = $1",
            [variant.id, variant.stock],
          );
        }
        if (previousVisibility !== undefined) {
          await db.query("UPDATE products SET is_active = $2 WHERE slug = $1", [
            archived,
            previousVisibility,
          ]);
        }
        await db.query("DELETE FROM product_variants WHERE sku LIKE $1", [
          fixtureSlug + "-%",
        ]);
        await db.query("DELETE FROM products WHERE slug LIKE $1", [
          fixtureSlug + "-%",
        ]);
      }
    } finally {
      await db.end();
    }
  }
});

test("A model download failure leaves the storefront usable and a subsequent request can retry", async ({
  page,
  context,
}) => {
  const model = "**/onnx/model_quantized.onnx";
  await context.route(model, (route) => route.fulfill({ status: 404 }));
  await open(page);
  await ask(page, gpuNeed);
  await expect(panel(page).getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator(".product-card").first()).toBeVisible();
  await context.unroute(model);
  await ask(page, gpuNeed);
  await expect(results(page).getByRole("link").first()).toBeVisible({
    timeout: 35_000,
  });
});

test("An inference error after model initialization clears the loading state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (payload, ...transfer) {
      return post.call(this, { ...payload, query: null }, ...transfer);
    };
  });
  await open(page);
  await ask(page, gpuNeed);
  await expect(panel(page).getByRole("alert")).toContainText(
    "temporarily unavailable",
    { timeout: 35_000 },
  );
  await expect(
    panel(page).getByRole("button", { name: "Get recommendations" }),
  ).toBeEnabled();
  await expect(results(page)).toHaveCount(0);
});
