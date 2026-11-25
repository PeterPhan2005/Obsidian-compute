import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import knex from "knex";
import { analytics } from "../src/analytics.js";
import { productDto } from "../src/catalog.js";
import { db } from "../src/db.js";

const project = process.env.OBSIDIAN_VERIFY_PROJECT;
const migrations = fileURLToPath(new URL("../migrations", import.meta.url));
const init = fileURLToPath(new URL("../src/init.js", import.meta.url));
after(() => db.destroy());

async function isolatedSchema(t) {
  assert.match(project, /^obsidian-test-[\da-f]{32}$/);
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.host, "127.0.0.1:15433");
  assert.equal(url.pathname, "/obsidian_test");
  assert.equal(url.search, "");
  const identity = await db.raw("SELECT current_database() AS db");
  assert.equal(identity.rows[0].db, "obsidian_test");
  const schema = `core_data_${randomUUID().replaceAll("-", "")}`;
  await db.raw("CREATE SCHEMA ??", [schema]);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const conn = knex({ client: "pg", connection: url.href });
  t.after(() => conn.destroy());
  const { rows } = await conn.raw(
    "SELECT current_database() AS db, current_schema() AS schema",
  );
  assert.deepEqual(rows, [{ db: "obsidian_test", schema }]);
  return { conn, url };
}

const dateRange = {
  period: "custom",
  from: "2025-01-01",
  to: "2025-03-31",
  groupBy: "month",
};

function sale(orderId, productId, categoryId, categoryName, quantity, month) {
  return {
    order: {
      id: orderId,
      created_at: new Date(`2025-0${month}-15T12:00:00Z`),
      subtotal_vnd: quantity * 100,
      coupon_discount_vnd: 0,
      points_discount_vnd: 0,
    },
    item: {
      id: randomUUID(),
      order_id: orderId,
      product_id: productId,
      category_id_snapshot: categoryId,
      category_name_snapshot: categoryName,
      quantity,
      line_total_vnd: quantity * 100,
      unit_cost_vnd: 60,
    },
  };
}

test("Analytics preserves separate category IDs, snapshot renames and legacy totals", async () => {
  const first = randomUUID(),
    second = randomUUID(),
    product = randomUUID();
  const fixtures = [
    sale(randomUUID(), product, null, "Hardware", 4, 1),
    sale(randomUUID(), product, first, "Hardware", 1, 1),
    sale(randomUUID(), product, second, "Hardware", 2, 2),
    sale(randomUUID(), product, first, "Components", 3, 3),
  ];
  const output = await analytics(dateRange, (table) => {
    if (table === "orders") {
      return { where: () => ({ where: () => fixtures.map((f) => f.order) }) };
    }
    assert.equal(table, "order_items");
    return { whereIn: () => fixtures.map((f) => f.item) };
  });
  assert.deepEqual(output.totals, {
    ordersSold: 4,
    revenueVnd: 1000,
    grossProfitVnd: 400,
    unitsSold: 10,
    distinctProductCount: 1,
    distinctCategoryCount: 3,
    legacyCategoryNameCount: 1,
  });
  assert.deepEqual(
    output.byCategory.map((c) => [c.categoryKey, c.categoryName, c.unitsSold]),
    [
      [first, "Components", 4],
      [second, "Hardware", 2],
      ["legacy:Hardware", "Hardware", 4],
    ],
  );
  assert.equal(
    output.series[0].categoryUnits.find((c) => c.categoryId === first)
      .categoryName,
    "Hardware",
  );
  assert.equal(output.series[1].categoryUnits[0].categoryId, second);
  assert.equal(output.series[2].categoryUnits[0].categoryId, first);
});

test(
  "Migration preserves an existing item's name and financial snapshot",
  { skip: !project },
  async (t) => {
    const { conn } = await isolatedSchema(t);
    await conn.migrate.up({ directory: migrations, name: "001_schema.js" });
    await conn.migrate.up({
      directory: migrations,
      name: "002_variant_stock_version.js",
    });
    const [{ id: buyer }] = await conn("users")
      .insert({
        email: "migration@example.test",
        full_name: "Migration fixture",
      })
      .returning("id");
    const [original, current] = await conn("categories")
      .insert([
        { name: "Historical category", slug: "laptop" },
        { name: "Current category", slug: "desktop" },
      ])
      .returning("*");
    const [{ id: product }] = await conn("products")
      .insert({
        category_id: original.id,
        name: "Original product",
        slug: "migration-product",
        brand: "Fixture",
        short_description: "Migration fixture",
        description_lines: '["one","two","three","four","five"]',
      })
      .returning("id");
    const [{ id: orderId }] = await conn("orders")
      .insert({
        user_id: buyer,
        buyer_name: "Migration fixture",
        buyer_email: "migration@example.test",
        shipping_snapshot: "{}",
        subtotal_vnd: 500,
        shipping_fee_vnd: 0,
        total_paid_vnd: 500,
        payment_reference: "migration-fixture",
        created_at: new Date("2025-01-15T12:00:00Z"),
      })
      .returning("id");
    const [old] = await conn("order_items")
      .insert({
        order_id: orderId,
        product_id: product,
        name_snapshot: "Original product",
        sku_snapshot: "ORIGINAL",
        attributes_snapshot: "{}",
        unit_price_vnd: 500,
        unit_cost_vnd: 300,
        quantity: 1,
        line_total_vnd: 500,
        category_name_snapshot: "Historical category",
      })
      .returning("*");
    await conn("products")
      .where({ id: product })
      .update({ category_id: current.id });
    await conn.migrate.latest({ directory: migrations });
    assert.deepEqual(await conn("order_items").where({ id: old.id }).first(), {
      ...old,
      category_id_snapshot: null,
    });
    const { totals, byCategory } = await analytics(dateRange, conn);
    assert.equal(totals.revenueVnd, 500);
    assert.equal(totals.grossProfitVnd, 200);
    assert.equal(totals.legacyCategoryNameCount, 1);
    assert.equal(byCategory[0].categoryKey, "legacy:Historical category");
  },
);

test(
  "Non-demo bootstrap requires explicit credentials and preserves its existing Administrator",
  { skip: !project },
  async (t) => {
    const { conn, url } = await isolatedSchema(t);
    const run = (email, password) =>
      spawnSync(process.execPath, [init], {
        env: {
          ...process.env,
          DATABASE_URL: url.href,
          SEED_DEMO_DATA: "false",
          ADMIN_EMAIL: email,
          ADMIN_PASSWORD: password,
        },
        encoding: "utf8",
        timeout: 20_000,
      });
    const missing = run("", "");
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Initial Admin requires ADMIN_EMAIL/);
    assert.equal((await conn("users").count().first()).count, 0);

    const demo = run("admin@obsidian.local", "ObsidianAdmin!2026");
    assert.equal(demo.status, 1);
    assert.match(demo.stderr, /Use non-demo credentials/);

    const email = "bootstrap@example.test";
    const password = `Test-${randomUUID()}`;
    const start = run(email, password);
    assert.equal(start.status, 0, start.stderr);
    const [admin] = await conn("users");
    assert.equal(admin.role, "ADMIN");
    assert.equal(admin.email, email);
    assert.equal(await argon2.verify(admin.password_hash, password), true);

    const restart = run("different@example.test", `New-${randomUUID()}`);
    assert.equal(restart.status, 0, restart.stderr);
    const noCredentials = run("", "");
    assert.equal(noCredentials.status, 0, noCredentials.stderr);
    assert.equal(
      await conn("users")
        .first("id")
        .then((row) => row.id),
      admin.id,
    );
    assert.equal((await conn("users").count().first()).count, 1);
    const unchanged = await conn("users").first();
    assert.equal(unchanged.email, email);
    assert.ok(unchanged.password_hash === admin.password_hash);
    for (const table of ["categories", "products", "orders", "seed_versions"]) {
      assert.equal((await conn(table).count().first()).count, 0);
    }
  },
);

test(
  "Fresh demo orders snapshot category IDs and DTO pricing ignores archived variants",
  { skip: !project },
  async () => {
    const admin = await db("users").where({ role: "ADMIN" }).first();
    assert.equal(admin.email, "admin@obsidian.local");
    const { count } = await db("order_items as i")
      .join("orders as o", "o.id", "i.order_id")
      .whereRaw("o.payment_reference ~ '^seed_[0-9]+$'")
      .whereNotNull("i.category_id_snapshot")
      .count()
      .first();
    assert.equal(count, 40);
    const row = await db("products").where({ is_active: true }).first();
    const mixed = [
      { price_vnd: 100_000, stock: 100, is_active: false, stock_version: 7 },
      { price_vnd: 800_000, stock: 3, is_active: true, stock_version: 1 },
      { price_vnd: 900_000, stock: 4, is_active: true, stock_version: 0 },
    ];
    const conn = (table) =>
      table === "product_variants"
        ? {
            where: () => ({
              modify: () => ({ orderBy: () => ({ orderBy: () => mixed }) }),
            }),
          }
        : db(table);
    conn.raw = db.raw.bind(db);
    const dto = await productDto(row, conn, true);
    assert.equal(dto.minPriceVnd, 800_000);
    assert.equal(dto.variants.length, 3);
    assert.equal(dto.variants[0].stockVersion, 7);
    mixed[1].is_active = false;
    mixed[2].is_active = false;
    const archived = await productDto({ ...row, is_active: false }, conn, true);
    assert.equal(archived.minPriceVnd, null);
    assert.equal(archived.variants.length, 3);
  },
);
