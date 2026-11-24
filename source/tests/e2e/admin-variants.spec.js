import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("Product editor only shows active variants and prevents removing either of the last two", async ({
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
      tags: ["desktop"],
      images: [1, 2, 3].map((i) => ({
        url: `/media/catalog/desktop-${i}.webp`,
      })),
      variants: [true, true, true, false].map((isActive, i) => ({
        sku: `${fixtureId}-${i}`,
        attributes: { configuration: `Configuration ${i}` },
        priceVnd: 1000000 + i * 100000,
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

  await page.goto(editPath);
  await expect(editors).toHaveCount(3);
  await expect(editors.getByLabel("SKU", { exact: true }).last()).toHaveValue(
    `${fixtureId}-2`,
  );
  await remove.last().click();
  await expect(editors).toHaveCount(2);
  await expect(remove.first()).toBeDisabled();
  await expect(remove.last()).toBeDisabled();
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);

  await page.goto(editPath);
  await expect(editors).toHaveCount(2);
  await expect(remove.first()).toBeDisabled();
  await expect(remove.last()).toBeDisabled();
  const { data: persisted } = await (
    await page.request.get(`/api/v1/admin/products/${product.id}`)
  ).json();
  expect(persisted.variants).toEqual(
    product.variants.map((variant, i) => ({
      ...variant,
      isActive: i < 2,
      isAvailable: i < 2,
    })),
  );
});
