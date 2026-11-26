import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/db.js";
import { Client, purchase, review, submit } from "./checkout-fixtures.js";

const admin = new Client();
let template;

before(async () => {
  assert.match(process.env.DATABASE_URL || "", /obsidian_test$/);
  await admin.login();
  const sample = await admin.request("/products?category=ssd");
  assert.equal(sample.status, 200);
  const selected = sample.body.data[0];
  const response = await admin.request(`/admin/products/${selected.id}`);
  assert.equal(response.status, 200);
  template = response.body.data;
});

after(() => db.destroy());

function testProductPayload() {
  const slug = `inventory-regression-${randomUUID()}`;
  return {
    name: "Inventory regression fixture",
    slug,
    brand: template.brand,
    categoryId: template.category.id,
    shortDescription: template.shortDescription,
    descriptionLines: template.descriptionLines,
    tags: template.tags,
    images: template.imageDetails,
    variants: template.variants.map(({ id, ...variant }, index) => ({
      ...variant,
      sku: `${slug}-${index}`,
      stock: 20,
    })),
  };
}

async function archive(id) {
  const response = await admin.request(`/admin/products/${id}`, "DELETE");
  assert.equal(response.status, 204);
}

async function add(client, variant) {
  assert.equal((await client.request("/cart")).status, 200);
  const response = await client.request("/cart/items", "POST", {
    variantId: variant.id,
    quantity: 1,
  });
  assert.equal(response.status, 200);
}

test("Variant attributes retain distinct JSON keys through product and inventory DTOs", async (t) => {
  const payload = await testProductPayload();
  const attributes = { memory_type: "DDR5", memoryType: "ECC" };
  payload.variants[0].attributes = attributes;
  const created = await admin.request("/admin/products", "POST", payload);
  assert.equal(created.status, 201);
  const product = created.body.data;
  t.after(() => archive(product.id));
  const saved = product.variants.find((v) => v.sku === payload.variants[0].sku);
  assert.deepEqual(saved.attributes, attributes);
  const read = (response) =>
    response.body.data.variants.find((v) => v.id === saved.id);
  const productPath = `/admin/products/${product.id}`;
  const publicPath = `/products/${product.slug}`;
  assert.deepEqual(
    read(await new Client().request(publicPath)).attributes,
    attributes,
  );
  assert.deepEqual(
    read(await admin.request(productPath)).attributes,
    attributes,
  );

  const updated = await admin.request(productPath, "PATCH", {
    expectedRevision: product.revision,
    shortDescription: "Partial product edit without variants.",
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(read(updated).attributes, attributes);
  const inventory = await admin.request(
    `/admin/variants/${saved.id}/inventory`,
    "PATCH",
    {
      stock: saved.stock + 1,
      expectedStockVersion: saved.stockVersion,
    },
  );
  assert.equal(inventory.status, 200);
  assert.deepEqual(inventory.body.data.attributes, attributes);
  assert.deepEqual(
    read(await new Client().request(publicPath)).attributes,
    attributes,
  );
  assert.deepEqual(
    (await db("product_variants").where({ id: saved.id }).first()).attributes,
    attributes,
  );
});

test("Cost edits fence stale product and inventory writes and preserve order profit snapshots", async (t) => {
  const response = await admin.request(
    "/admin/products",
    "POST",
    await testProductPayload(),
  );
  assert.equal(response.status, 201);
  const original = response.body.data;
  t.after(() => archive(original.id));
  const initial = original.variants.find((v) => v.stock >= 3);
  assert.ok(initial);
  const productPath = `/admin/products/${original.id}`;
  const inventoryPath = `/admin/variants/${initial.id}/inventory`;
  const inventory = (v, changes) =>
    admin.request(inventoryPath, "PATCH", {
      stock: v.stock,
      expectedStockVersion: v.stockVersion,
      ...changes,
    });
  const findVariant = (p) => p.variants.find((v) => v.id === initial.id);
  const readProduct = async () => (await admin.request(productPath)).body.data;
  const sell = async () => {
    const guest = new Client();
    await add(guest, initial);
    const order = await submit(
      guest,
      await review(guest, purchase(`cost-${randomUUID()}@example.com`)),
    );
    assert.equal(order.status, 201);
    return order.body.data.order;
  };

  const beforeSale = await sell();
  const productBefore = await readProduct();
  const before = findVariant(productBefore);
  const firstCost = initial.costPriceVnd + 100;
  const firstEdit = await inventory(before, { costPriceVnd: firstCost });
  assert.equal(firstEdit.status, 200);
  assert.equal(firstEdit.body.data.stockVersion, before.stockVersion + 1);
  assert.equal(firstEdit.body.data.stock, before.stock);
  assert.equal((await readProduct()).revision, productBefore.revision + 1);
  const staleForm = await admin.request(productPath, "PATCH", {
    expectedRevision: productBefore.revision,
    variants: productBefore.variants,
    shortDescription: "Stale cost form.",
  });
  assert.equal(staleForm.status, 409);
  assert.equal(staleForm.body.error.code, "PRODUCT_CONFLICT");

  const competing = await Promise.all([
    inventory(firstEdit.body.data, { costPriceVnd: firstCost + 200 }),
    inventory(firstEdit.body.data, { costPriceVnd: firstCost + 300 }),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    competing.find((r) => r.status === 409).body.error.code,
    "STOCK_CONFLICT",
  );
  const winner = competing.find((r) => r.status === 200).body.data;
  const afterCompetition = await readProduct();
  const stockOnly = await inventory(winner, { stock: winner.stock + 1 });
  assert.equal(stockOnly.status, 200);
  assert.equal(stockOnly.body.data.costPriceVnd, winner.costPriceVnd);
  assert.equal((await readProduct()).revision, afterCompetition.revision);

  const combined = await inventory(stockOnly.body.data, {
    stock: stockOnly.body.data.stock + 1,
    costPriceVnd: winner.costPriceVnd + 50,
  });
  assert.equal(combined.status, 200);
  assert.equal(
    combined.body.data.stockVersion,
    stockOnly.body.data.stockVersion + 1,
  );
  assert.equal(combined.body.data.stock, stockOnly.body.data.stock + 1);
  assert.equal(combined.body.data.costPriceVnd, winner.costPriceVnd + 50);
  const afterCombined = await readProduct();
  assert.equal(afterCombined.revision, afterCompetition.revision + 1);
  const current = findVariant(afterCombined);
  const latestCost = winner.costPriceVnd + 400;
  const productEdit = await admin.request(productPath, "PATCH", {
    expectedRevision: afterCombined.revision,
    variants: afterCombined.variants.map((v) =>
      v.id === current.id ? { ...v, costPriceVnd: latestCost } : v,
    ),
  });
  assert.equal(productEdit.status, 200);
  const edited = findVariant(productEdit.body.data);
  assert.equal(edited.stockVersion, current.stockVersion + 1);
  assert.equal(
    (await inventory(current, { costPriceVnd: latestCost + 1 })).status,
    409,
  );

  const beforeAnalytics = (await admin.request("/admin/dashboard/analytics"))
    .body.data;
  const afterSale = await sell();
  const afterAnalytics = (await admin.request("/admin/dashboard/analytics"))
    .body.data;
  const orderCost = async (order) =>
    (await admin.request(`/admin/orders/${order.id}`)).body.data.items[0]
      .unitCostVnd;
  assert.equal(await orderCost(beforeSale), initial.costPriceVnd);
  assert.equal(await orderCost(afterSale), latestCost);
  assert.equal(
    afterAnalytics.totals.grossProfitVnd -
      beforeAnalytics.totals.grossProfitVnd,
    initial.priceVnd - latestCost,
  );
});
