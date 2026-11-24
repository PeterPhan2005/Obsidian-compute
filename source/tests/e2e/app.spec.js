import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
async function login(page, admin = false) {
  await page.goto("/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(admin ? "admin@obsidian.local" : "alex@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill(admin ? "ObsidianAdmin!2026" : "ObsidianCustomer!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(admin ? /\/admin$/ : /\/account$/);
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
async function addProduct(page) {
  await page.goto("/products?category=ram");
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page
    .locator(".product-card")
    .filter({ hasNotText: "Sold out" })
    .first()
    .click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Added to your bag" }),
  ).toBeVisible();
}
test("Homepage has working numbered sections, local imagery and responsive layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Power, without the noise." }),
  ).toBeVisible();
  await expect(page.locator(".collection-section")).toHaveCount(5);
  const section = page.locator(".collection-section").first();
  const first = await section
    .locator(".product-card")
    .first()
    .getAttribute("href");
  await section.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(section.locator(".product-card").first()).not.toHaveAttribute(
    "href",
    first,
  );
  for (const width of [1440, 1280, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(root, `../docs/evidence/home-${width}.png`),
      fullPage: width === 1440,
    });
  }
  expect(errors).toEqual([]);
});
test("Catalog combines category, brand and price with sorts, pagination and empty state", async ({
  page,
}) => {
  await page.goto("/products");
  await page.getByLabel("Category", { exact: true }).selectOption("ssd");
  await page.getByLabel("Brand", { exact: true }).selectOption("Obsidian");
  await page.getByLabel("Minimum", { exact: true }).fill("1");
  await page.getByLabel("Maximum", { exact: true }).fill("100000000");
  await page.getByLabel("Sort products").selectOption("price_desc");
  await expect(page).toHaveURL(/sort=price_desc/);
  await expect(page.locator(".product-card").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Page 1", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search collection").fill("no-product-with-this-name");
  await expect(
    page.getByRole("heading", { name: "No products found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
});
test("Guest checkout preserves stock when Admin saves an already open product form", async ({
  page,
  browser,
}) => {
  await addProduct(page);
  const productUrl = new URL(page.url()).pathname;
  const readProduct = async () =>
    (await (await page.request.get(`/api/v1${productUrl}`)).json()).data;
  const product = await readProduct();
  const variant = product.variants[0];
  const adminContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const adminPage = await adminContext.newPage();
  await login(adminPage, true);
  await adminPage.goto(`/admin/products/${product.id}/edit`);
  const editor = adminPage.locator(".variant-editor").first();
  await expect(editor.getByLabel("Stock", { exact: true })).toHaveValue(
    String(variant.stock),
  );
  await page.getByRole("link", { name: "View your bag" }).click();
  await expect(page.getByRole("heading", { name: "Your bag." })).toBeVisible();
  await page.getByRole("button", { name: /Increase / }).click();
  await expect(page.locator(".quantity")).toContainText("2");
  await page.getByRole("button", { name: /Decrease / }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Browser Customer");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`browser-${Date.now()}@example.com`);
  await page
    .getByLabel("Recipient name", { exact: true })
    .fill("Browser Customer");
  await page.getByLabel("Phone number", { exact: true }).fill("0901234567");
  await page
    .getByLabel("Street address", { exact: true })
    .fill("12 Nguyen Hue");
  await page.getByLabel("Ward", { exact: true }).fill("Ben Nghe");
  await page.getByLabel("District", { exact: true }).fill("District 1");
  await page.getByLabel("City", { exact: true }).fill("Ho Chi Minh City");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  const payment = page.getByLabel("Test payment code");
  const review = page.getByRole("button", { name: "Review order" });
  await expect(review).toBeDisabled();
  await payment.fill("WRONG-CODE");
  await expect(review).toBeDisabled();
  await payment.fill("DEMO-DECLINE");
  await review.click();
  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(page.getByText(/Sandbox payment declined/)).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await payment.fill("DEMO-APPROVE");
  await page.getByLabel("Discount code", { exact: true }).fill("ZZ999");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Code not found.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review order" }),
  ).toBeDisabled();
  await page.getByLabel("Discount code", { exact: true }).fill("BUILD");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText(/Discount applied/)).toBeVisible();
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("button", { name: "Place order & pay" }).click();
  await expect(
    page.getByRole("heading", { name: "Order placed" }),
  ).toBeVisible();
  await expect(page.locator(".order-layout")).toContainText("Browser Customer");
  await expect(page.locator(".order-layout")).toContainText("pending");
  const readStock = async () =>
    (await readProduct()).variants.find((v) => v.id === variant.id).stock;
  expect(await readStock()).toBe(variant.stock - 1);
  await adminPage
    .getByLabel("Short description", { exact: true })
    .fill("Browser regression metadata edit.");
  await adminPage
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await expect(adminPage).toHaveURL(/\/admin\/products$/);
  expect(await readStock()).toBe(variant.stock - 1);

  await adminContext.close();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Order placed" }),
  ).toBeVisible();
});
test("Checkout success requires a receipt and handles an unavailable receipt", async ({
  page,
}) => {
  const success = page.getByRole("heading", { name: "Order placed" });
  const unavailable = page.getByRole("heading", {
    name: "Order receipt unavailable",
  });

  await page.goto("/checkout/success");
  await expect(unavailable).toBeVisible();
  await expect(success).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);

  for (const receipt of ["invalid-receipt", "0".repeat(64)]) {
    const response = page.waitForResponse((r) =>
      r.url().endsWith(`/api/v1/checkout/receipts/${receipt}`),
    );
    await page.goto(`/checkout/success?receipt=${receipt}`);
    expect((await response).status()).toBe(404);
    await expect(unavailable).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(success).toHaveCount(0);
  }

  let releaseRequest;
  const pending = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/v1/checkout/receipts/**", async (route) => {
    await pending;
    await route.abort("failed");
  });
  try {
    await page.goto(`/checkout/success?receipt=${"1".repeat(64)}`);
    await expect(page.getByRole("status")).toBeVisible();
    await expect(success).toHaveCount(0);
  } finally {
    releaseRequest();
  }
  await expect(unavailable).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(success).toHaveCount(0);
});
test("Customer account shows persisted purchases, address editing and rewards", async ({
  page,
}) => {
  await login(page);
  await page.context().clearCookies({ name: "access_token" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Hello, Alex." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Addresses", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Delivery addresses" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByLabel("Recipient name", { exact: true }).fill("Alex Test");
  await page.getByLabel("Phone number", { exact: true }).fill("0909876543");
  await page
    .getByLabel("Street address", { exact: true })
    .fill("42 Test Street");
  await page.getByLabel("Ward", { exact: true }).fill("Test Ward");
  await page.getByLabel("District", { exact: true }).fill("District 3");
  await page.getByLabel("City", { exact: true }).fill("Ho Chi Minh City");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(
    page.getByText("42 Test Street", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.locator(".history-card").first()).toBeVisible();
  await page.locator(".history-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Order timeline" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Rewards", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your rewards history" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 900 });
  await noOverflow(page);
});
test("Admin dashboards and time filters render actual data; coupon form saves", async ({
  page,
}) => {
  await login(page, true);
  await expect(
    page.getByRole("heading", { name: "Your store, at a glance." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Advanced analytics", exact: true })
    .click();
  await page.getByLabel("Chart grouping").selectOption("quarter");
  await expect(
    page.getByRole("heading", { name: "Performance by product type" }),
  ).toBeVisible();
  await page.getByLabel("Period", { exact: true }).selectOption("month");
  await expect(page.locator(".metrics")).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByLabel("Time range").selectOption("this_month");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.getByRole("link", { name: "Discount codes", exact: true }).click();
  await page.getByRole("link", { name: "Create code" }).click();
  const code = Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()
    .padEnd(5, "A");
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByLabel("Discount amount (VND)").fill("50000");
  await page.getByLabel("Total usage limit").fill("3");
  await page.getByRole("button", { name: "Create code" }).click();
  await expect(
    page.getByRole("heading", { name: code, exact: true }),
  ).toBeVisible();
  await page.goto("/admin");
  await page.setViewportSize({ width: 375, height: 900 });
  await noOverflow(page);
  await page.screenshot({
    path: path.join(root, "../docs/evidence/admin-mobile.png"),
    fullPage: true,
  });
});
test("Admin can create, edit and archive a product with uploaded photos and variant stock", async ({
  page,
}) => {
  await login(page, true);
  await page.goto("/admin/products/new");
  const name = `Test Workstation ${Date.now()}`;
  await page.getByLabel("Product name", { exact: true }).fill(name);
  await page.getByLabel("URL slug").fill(`test-workstation-${Date.now()}`);
  await page.getByLabel("Brand", { exact: true }).fill("Obsidian");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Desktop PCs" });
  await page
    .getByLabel("Short description", { exact: true })
    .fill("An integration test configuration for the academic store.");
  await page
    .getByLabel("Description details (at least five lines)")
    .fill(
      "A capable desktop for daily work.\nA quiet cooling configuration.\nTwo independent configurations available.\nPractical connectivity for your desk.\nIllustrative product photography.",
    );
  await page.getByLabel("Tags (comma separated)").fill("workstation, test");
  for (let i = 1; i <= 3; i++) {
    await page
      .getByLabel("Upload a photo", { exact: true })
      .setInputFiles(path.join(root, `media/catalog/desktop-${i}.webp`));
    await expect(page.locator(".image-editor img")).toHaveCount(i);
  }
  const variants = page.locator(".variant-editor");
  await variants
    .nth(0)
    .getByLabel("SKU", { exact: true })
    .fill(`TEST-A-${Date.now()}`);
  await variants
    .nth(1)
    .getByLabel("SKU", { exact: true })
    .fill(`TEST-B-${Date.now()}`);
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await page
    .locator(".workspace-content")
    .getByLabel("Search products", { exact: true })
    .fill(name);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page
    .locator(".variant-editor")
    .first()
    .getByLabel("Stock", { exact: true })
    .fill("23");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await page
    .locator(".workspace-content")
    .getByLabel("Search products", { exact: true })
    .fill(name);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Archive ${name}` }).click();
  await expect(page.locator("tbody")).toContainText("archived");
});
test("Mobile catalog, product, cart and navigation fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/products");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("laptop");
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await noOverflow(page);
  await page.locator(".product-card").first().click();
  await expect(page.locator(".product-description h1")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: path.join(root, "../docs/evidence/product-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
});
