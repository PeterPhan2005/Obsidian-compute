import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { BASE, Client } from "../../backend/tests/checkout-fixtures.js";
import { isolatedServices } from "../../backend/tests/isolated-services.js";

test.skip(
  !process.env.OBSIDIAN_VERIFY_PROJECT,
  "Requires the isolated verifier for category and address changes",
);
test.use({ trace: "off" });

test("Home fills available category slots and keeps fallback pagination in the matching section", async ({ page, baseURL }) => {
  expect(baseURL).toBe("http://localhost:8081");
  const { docker, container } = isolatedServices();
  const identityQuery = "SELECT current_database(), system_identifier FROM pg_control_system()";
  const expectedIdentity = docker(
    "exec", container("postgres"), "psql", "-U", "obsidian",
    "-d", "obsidian_test", "-Atc", identityQuery,
  );
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let disabledVariants = [];
  let disabledCategories = [];
  try {
    const { rows: [identity] } = await db.query(identityQuery);
    expect([identity.current_database, identity.system_identifier].join("|")).toBe(expectedIdentity);

    async function homeData() {
      const response = await page.request.get("/api/v1/home");
      expect(response.status()).toBe(200);
      return (await response.json()).data;
    }

    const starting = await homeData();
    expect(starting.sections.map(({ key }) => key)).toEqual([
      "new", "best_sellers", "category:laptop", "category:monitor", "category:gpu",
    ]);
    // Simulate a preferred category with active product records but no active offers.
    ({ rows: disabledVariants } = await db.query(
      `UPDATE product_variants v SET is_active = false
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE v.product_id = p.id AND c.slug = 'laptop' AND v.is_active RETURNING v.id`,
    ));
    expect(disabledVariants.length).toBeGreaterThan(0);

    const replaced = await homeData();
    expect(replaced.sections.slice(0, 4).map(({ key, title }) => [key, title])).toEqual(
      starting.sections.filter(({ key }) => key !== "category:laptop").map(({ key, title }) => [key, title]),
    );
    const fallback = replaced.sections[4];
    const fallbackSlug = fallback.key.slice("category:".length);
    expect(["laptop", "monitor", "gpu"]).not.toContain(fallbackSlug);
    expect(fallback.title).toBe(replaced.categories.find(({ slug }) => slug === fallbackSlug).name);
    for (const section of replaced.sections.slice(2)) {
      expect(section.products.length).toBeGreaterThan(0);
      expect(section.products.every(({ category }) => `category:${category.slug}` === section.key)).toBe(true);
    }

    await page.goto("/");
    const section = page.locator(".collection-section").filter({
      has: page.getByRole("heading", { name: fallback.title, exact: true }),
    });
    await expect(section.getByRole("link", { name: "View collection" })).toHaveAttribute(
      "href", `/products?category=${fallbackSlug}`,
    );
    await expect(section.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
    const pageTwo = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return decodeURIComponent(url.pathname) === `/api/v1/home/sections/${fallback.key}/products` &&
        url.searchParams.get("page") === "2";
    });
    await section.getByRole("button", { name: "Page 2", exact: true }).click();
    const next = await pageTwo;
    expect(next.status()).toBe(200);
    const { data: nextRows, meta } = await next.json();
    expect(meta.page).toBe(2);
    expect(nextRows.length).toBeGreaterThan(0);
    expect(nextRows.every(({ category }) => category.slug === fallbackSlug)).toBe(true);
    await expect(section.locator(".product-card").first()).toHaveAttribute("href", `/products/${nextRows[0].slug}`);
    await expect(page).toHaveURL("/");
    expect((await page.request.get("/api/v1/home/sections/category%3Aunknown-fixture/products")).status()).toBe(404);

    ({ rows: disabledCategories } = await db.query(
      "UPDATE categories SET is_active = false WHERE is_active AND slug NOT IN ('monitor', 'gpu') RETURNING id",
    ));
    expect((await homeData()).sections.map(({ key }) => key)).toEqual([
      "new", "best_sellers", "category:monitor", "category:gpu",
    ]);
  } finally {
    try {
      if (disabledCategories.length)
        await db.query("UPDATE categories SET is_active = true WHERE id = ANY($1::uuid[])", [disabledCategories.map(({ id }) => id)]);
      if (disabledVariants.length)
        await db.query("UPDATE product_variants SET is_active = true WHERE id = ANY($1::uuid[])", [disabledVariants.map(({ id }) => id)]);
    } finally {
      await db.end();
    }
  }
});

test("Saved addresses accept blank phone numbers while checkout still requires one", async ({ page, browser, baseURL }) => {
  expect(baseURL).toBe(BASE);
  expect(baseURL).toBe("http://localhost:8081");
  const account = new Client(baseURL);
  await account.login("alex@example.com", "ObsidianCustomer!2026");
  const street = `Address fixture ${randomUUID()}`;
  let addressId;
  let guestContext;
  try {
    await page.goto("/register");
    await expect(page.getByLabel("Street address", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveCount(0);
    await page.goto("/login");
    await page.getByLabel("Email address", { exact: true }).fill("alex@example.com");
    await page.getByLabel("Password", { exact: true }).fill("ObsidianCustomer!2026");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/account");
    await page.getByRole("link", { name: "Addresses", exact: true }).click();
    await page.getByRole("button", { name: "Add address" }).click();
    const fields = [
      ["Recipient name", "Address fixture"],
      ["Street address", street],
      ["Ward", "Review Ward"],
      ["District", "Review District"],
      ["City", "Ho Chi Minh City"],
    ];
    for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
    const phone = page.getByLabel("Phone number", { exact: true });
    await expect(phone).toHaveValue("");
    const create = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/me/addresses") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save address" }).click();
    const response = await create;
    expect(response.status()).toBe(201);
    const { data: saved } = await response.json();
    addressId = saved.id;
    expect(saved.phone).toBeNull();

    const card = page.locator(".address-card").filter({ hasText: street });
    await expect(card.getByText("No phone saved")).toBeVisible();
    const edit = async (suffix, currentPhone, replacementPhone) => {
      await card.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(phone).toHaveValue(currentPhone);
      await page.getByLabel("Street address", { exact: true }).fill(street + suffix);
      if (replacementPhone !== undefined) await phone.fill(replacementPhone);
      const update = page.waitForResponse((res) =>
        res.url().endsWith(`/api/v1/me/addresses/${addressId}`) && res.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Save address" }).click();
      const updated = await update;
      expect(updated.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Edit address", exact: true })).toHaveCount(0);
      return (await updated.json()).data;
    };
    expect((await edit(" edit", "")).phone).toBeNull();
    const number = "0909876543";
    expect((await edit(" add phone", "", number)).phone).toBe(number);
    expect((await edit(" retain phone", number)).phone).toBe(number);

    guestContext = await browser.newContext({ baseURL });
    const guest = await guestContext.newPage();
    await guest.goto("/products?category=ram");
    await guest.locator(".product-card").filter({ hasNotText: "Sold out" }).first().click();
    await guest.getByRole("button", { name: "Add to bag", exact: true }).click();
    await guest.getByRole("link", { name: "View your bag" }).click();
    await guest.getByRole("link", { name: "Continue to checkout" }).click();
    await guest.getByRole("button", { name: "Continue to delivery" }).click();
    for (const [label, value] of [
      ...fields, ["Full name", "Address fixture"], ["Email address", "address-test@example.com"],
    ]) await guest.getByLabel(label, { exact: true }).fill(value);
    const continuePayment = guest.getByRole("button", { name: "Continue to payment" });
    await continuePayment.click();
    await expect(guest.getByLabel("Phone number", { exact: true })).toBeFocused();
    await expect(guest.getByLabel("Test payment code")).toHaveCount(0);
    await guest.getByLabel("Phone number", { exact: true }).fill(number);
    await continuePayment.click();
    await expect(guest.getByLabel("Test payment code")).toBeVisible();
  } finally {
    await guestContext?.close();
    if (addressId) expect((await account.request(`/me/addresses/${addressId}`, "DELETE")).status).toBe(204);
  }
});
