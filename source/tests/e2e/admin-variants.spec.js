import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("Admin product editing preserves untouched tags, saves typed tags and excludes archived inventory", async ({
  page,
}) => {
  const {
    data: { csrfToken },
  } = await (await page.request.get("/api/v1/auth/csrf")).json();
  const headers = { "X-CSRF-Token": csrfToken };
  await expect(
    await page.request.post("/api/v1/auth/login/password", {
      headers,
      data: { email: "admin@obsidian.local", password: "ObsidianAdmin!2026" },
    }),
  ).toBeOK();

  const { data: categories } = await (
    await page.request.get("/api/v1/categories")
  ).json();
  const fixtureId = randomUUID();
  const response = await page.request.post("/api/v1/admin/products", {
    headers,
    data: {
      name: "Variant editor test desktop",
      slug: `variant-editor-${fixtureId}`,
      brand: "Obsidian",
      categoryId: categories.find((category) => category.slug === "desktop").id,
      shortDescription:
        "Desktop product used to verify the active variant boundary.",
      descriptionLines: [
        "Desktop chassis",
        "Local storage",
        "Two memory channels",
        "Air cooling",
        "Replaceable components",
      ],
      tags: ["desktop", "GPU, compact"],
      images: [1, 2, 3].map((i) => ({
        url: `/media/catalog/desktop-${i}.webp`,
      })),
      variants: [true, true, true, false].map((isActive, i) => ({
        sku: `${fixtureId}-${i}`,
        attributes: { configuration: `Configuration ${i}` },
        priceVnd: isActive ? 1000000 + i * 100000 : 100000,
        costPriceVnd: 700000,
        stock: 7 + i,
        isActive,
      })),
    },
  });
  await expect(response).toBeOK();
  const { data: product } = await response.json();
  const editPath = `/admin/products/${product.id}/edit`;
  const editors = page.locator(".variant-editor");
  const remove = page.getByRole("button", {
    name: "Remove variant",
    exact: true,
  });
  const tags = page.getByLabel("Tags (comma separated)");

  await page.goto(editPath);
  await expect(tags).toHaveValue("desktop, GPU, compact");
  const description = "Updated desktop description for the unchanged tag test.";
  await page.getByLabel("Short description", { exact: true }).fill(description);
  const editResponse = page.waitForResponse((result) =>
    result.url().endsWith(`/api/v1/admin/products/${product.id}`) &&
    result.request().method() === "PATCH",
  );
  const submit = page.getByRole("button", { name: "Save product", exact: true });
  expect(await submit.evaluate((button) => button.form.checkValidity())).toBe(true);
  await submit.evaluate((button) => button.form.requestSubmit(button));
  expect((await editResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/admin\/products$/);
  const { data: unchangedTags } = await (
    await page.request.get(`/api/v1/admin/products/${product.id}`)
  ).json();
  expect(unchangedTags.shortDescription).toBe(description);
  expect(unchangedTags.tags).toEqual(["desktop", "GPU, compact"]);

  await page.goto(editPath);
  await expect(editors).toHaveCount(3);
  await expect(editors.getByLabel("SKU", { exact: true }).last()).toHaveValue(
    `${fixtureId}-2`,
  );
  await remove.last().click();
  await expect(editors).toHaveCount(2);
  await expect(remove.first()).toBeDisabled();
  await expect(remove.last()).toBeDisabled();
  await expect(tags).toHaveValue("desktop, GPU, compact");
  await tags.fill("desktop");
  await tags.press("End");
  await tags.pressSequentially(", gaming gear");
  await expect(tags).toHaveValue("desktop, gaming gear");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await page.getByPlaceholder("Name, brand or description").fill(product.name);
  const row = page.getByRole("row", { name: new RegExp(product.name) });
  await expect(row.getByRole("cell").nth(1)).toHaveText("1,000,000₫");
  await expect(row.getByRole("cell").nth(2)).toHaveText("15");
  expect(product.minPriceVnd).toBe(1000000);

  await page.goto(editPath);
  await expect(editors).toHaveCount(2);
  await expect(remove.first()).toBeDisabled();
  await expect(remove.last()).toBeDisabled();
  const { data: persisted } = await (
    await page.request.get(`/api/v1/admin/products/${product.id}`)
  ).json();
  expect(persisted.tags).toEqual(["desktop", "gaming gear"]);
  expect(persisted.variants).toEqual(
    product.variants.map((variant) => ({
      ...variant,
      isActive: [`${fixtureId}-0`, `${fixtureId}-1`].includes(variant.sku),
      isAvailable: [`${fixtureId}-0`, `${fixtureId}-1`].includes(variant.sku),
    })),
  );

  await page.goto("/admin/products");
  await page.getByPlaceholder("Name, brand or description").fill(product.name);
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Archive ${product.name}` }).click();
  await expect(row.getByRole("cell").nth(1)).toHaveText("—");
  await expect(row.getByRole("cell").nth(2)).toHaveText("0");
});
