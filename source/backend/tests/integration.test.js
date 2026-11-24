import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/db.js";
import { BASE, Client, ORIGIN, shipping, purchase, submit, review } from "./checkout-fixtures.js";
let admin, product, variant;
async function add(c, v = variant, quantity = 1) {
  const r = await c.request("/cart/items", "POST", {
    variantId: v.id,
    quantity,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}
async function lastMail(email, subject, notBefore = 0) {
  for (let n = 0; n < 30; n++) {
    const r = await fetch("http://localhost:8026/api/v1/messages");
    const data = await r.json();
    const mail = data.messages?.find(
      (m) =>
        m.To?.some((t) => t.Address === email) &&
        (!subject || m.Subject.includes(subject)) &&
        new Date(m.Created).getTime() >= notBefore,
    );
    if (mail) {
      const full = await fetch(
        `http://localhost:8026/api/v1/message/${mail.ID}`,
      );
      return full.json();
    }
    await delay(300);
  }
  throw new Error(`No email for ${email}`);
}
before(async () => {
  assert.match(
    process.env.DATABASE_URL || "",
    /obsidian_test$/,
    "Integration tests require the isolated obsidian_test database.",
  );
  admin = new Client();
  await admin.login();
  const r = await admin.request("/products?category=ssd");
  product = r.body.data.find((p) => p.variants.some((v) => v.stock >= 10));
  variant = product.variants.find((v) => v.stock >= 10);
});
after(async () => {
  await db.destroy();
});
test("Catalog pagination, image/variant requirements, brand/price/category filtering and four sorts", async () => {
  const c = new Client();
  const a = await c.request("/products?page=1"),
    b = await c.request("/products?page=2");
  assert.equal(a.status, 200);
  assert.equal(a.body.data.length, 12);
  assert.equal(a.body.meta.totalItems, 60);
  assert.equal(
    a.body.data.filter((p) => b.body.data.some((x) => x.id === p.id)).length,
    0,
  );
  for (const p of a.body.data) {
    assert.ok(p.images.length >= 3);
    assert.ok(p.variants.length >= 2);
    assert.ok(p.descriptionLines.length >= 5);
    assert.ok(!("costPriceVnd" in p.variants[0]));
  }
  const r = await c.request(
    `/products?category=ssd&brand=${encodeURIComponent(product.brand)}&minPrice=0&maxPrice=100000000&ratingMin=3`,
  );
  assert.ok(r.body.data.length);
  assert.ok(
    r.body.data.every(
      (p) => p.category.slug === "ssd" && p.brand === product.brand,
    ),
  );
  for (const sort of ["name_asc", "name_desc", "price_asc", "price_desc"]) {
    const r = await c.request(`/products?sort=${sort}`);
    const values = r.body.data.map((p) =>
      sort.startsWith("name") ? p.name : p.minPriceVnd,
    );
    for (let i = 1; i < values.length; i++)
      assert.ok(
        sort.endsWith("asc")
          ? values[i] >= values[i - 1]
          : values[i] <= values[i - 1],
      );
  }
  assert.equal((await c.request("/products?page=-1")).status, 400);
  const home = await c.request("/home");
  assert.equal(home.body.data.sections.length, 5);
  assert.ok(home.body.data.sections.every((s) => s.meta.totalPages >= 2));
});
test("CSRF and RBAC reject unauthorized mutations and admin access", async () => {
  const c = new Client();
  assert.equal((await c.request("/admin/users")).status, 401);
  const r = await fetch(BASE + "/api/v1/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variantId: variant.id, quantity: 1 }),
  });
  assert.equal(r.status, 403);
  const login = new Client();
  await login.login("alex@example.com", "ObsidianCustomer!2026");
  assert.equal((await login.request("/admin/users")).status, 403);
  assert.equal(
    (await c.request(`/products/${product.slug}/rating`, "PUT", { stars: 5 }))
      .status,
    401,
  );
});
test("Guest comments and authenticated ratings persist without purchase requirement", async () => {
  const c = new Client(),
    body = `An integration review ${randomUUID()}`;
  assert.equal(
    (
      await c.request(`/products/${product.slug}/comments`, "POST", {
        guestName: "Guest Tester",
        body,
      })
    ).status,
    201,
  );
  const comments = await c.request(`/products/${product.slug}/comments`);
  assert.equal(comments.body.data[0].body, body);
  await c.login("jordan@example.com", "ObsidianCustomer!2026");
  assert.equal(
    (await c.request(`/products/${product.slug}/rating`, "PUT", { stars: 4 }))
      .status,
    200,
  );
  assert.equal(
    (await c.request(`/products/${product.slug}/rating`, "PUT", { stars: 5 }))
      .status,
    200,
  );
  const { count } = await db("ratings")
    .join("users", "users.id", "ratings.user_id")
    .where("users.email", "jordan@example.com")
    .where("product_id", product.id)
    .count()
    .first();
  assert.equal(Number(count), 1);
});
test("Missing, legacy-only, mixed, invalid and declined payments leave checkout data intact", async () => {
  const c = new Client();
  await add(c);
  const bad = await c.request("/checkout/quote", "POST", {
    couponCode: "ZZ999",
  });
  assert.equal(bad.status, 200);
  assert.equal(bad.body.data.coupon.valid, false);
  const email = `failure-${randomUUID()}@example.com`;
  const body = purchase(email, {
    couponCode: "HELLO",
    demoPaymentToken: undefined,
  });
  const snapshot = () =>
    Promise.all([
      db("product_variants")
        .where({ id: variant.id })
        .first("stock", "stock_version"),
      db("coupons").where({ code: "HELLO" }).first("used_count"),
      ...["carts", "loyalty_ledger", "email_outbox"].map((table) =>
        db(table).count().first(),
      ),
    ]);
  const before = await snapshot();
  const cartBefore = (await c.request("/cart")).body.data;
  const key = randomUUID();
  const cases = [
    [{}, "PAYMENT_TOKEN_REQUIRED"],
    [{ demoPaymentOutcome: "success" }, "PAYMENT_TOKEN_REQUIRED"],
    [{ demoPaymentToken: "invalid" }, "VALIDATION_ERROR"],
    [
      { demoPaymentToken: "DEMO-DECLINE", demoPaymentOutcome: "success" },
      "VALIDATION_ERROR",
    ],
  ];
  for (const [payment, code] of cases) {
    const result = await submit(c, { ...body, ...payment }, key);
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(result.body.error.code, code);
  }
  const withoutCart = new Client();
  const missing = await submit(withoutCart, body);
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, "PAYMENT_TOKEN_REQUIRED");
  assert.equal(withoutCart.cookies.has("guest_cart"), false);
  const result = await submit(
    c,
    await review(c, { ...body, demoPaymentToken: "DEMO-DECLINE" }),
    key,
  );
  assert.equal(result.status, 402);
  assert.equal(result.body.error.code, "PAYMENT_FAILED");
  assert.deepEqual(await snapshot(), before);
  assert.equal(await db("users").where({ email }).first(), undefined);
  assert.equal(
    await db("orders").where({ buyer_email: email }).first(),
    undefined,
  );
  assert.equal(
    await db("payment_attempts").where({ checkout_key: key }).first(),
    undefined,
  );
  assert.equal(await db("checkout_idempotency").where({ key }).first(), undefined);
  assert.deepEqual((await c.request("/cart")).body.data, cartBefore);
  assert.equal(
    (await c.request("/checkout/quote", "POST", { pointsToRedeem: 1 })).status,
    422,
  );
  const item = (await c.request("/cart")).body.data.items[0];
  assert.equal(
    (await c.request(`/cart/items/${item.id}`, "PATCH", { quantity: 999 }))
      .status,
    409,
  );
  assert.equal(
    (await c.request(`/cart/items/${item.id}`, "DELETE")).status,
    200,
  );
});
test("Concurrent identical guest checkout creates one order, one coupon use, one outbox row; receipt is private", async () => {
  const c = new Client();
  await add(c);
  const email = `guest-${randomUUID()}@example.com`,
    key = randomUUID();
  const body = await review(c, purchase(email, { couponCode: "HELLO" }));
  // Use the baseline schema's parsed field order and defaults for the stored hash.
  const legacy = {
    buyer: { fullName: body.buyer.fullName, email },
    shippingAddress: shipping,
    couponCode: "HELLO",
    pointsToRedeem: 0,
    paymentMethod: "DEMO",
    demoPaymentOutcome: "success",
  };
  const before = await db("coupons").where({ code: "HELLO" }).first();
  const results = await Promise.all([
    submit(c, body, key),
    submit(c, body, key),
  ]);
  for (const r of results) assert.equal(r.status, 201, r.body.error?.code);
  assert.equal(results[0].body.data.order.id, results[1].body.data.order.id);
  const { order, receiptToken } = results[0].body.data;
  const historicalHash = createHash("sha256")
    .update(JSON.stringify(legacy))
    .digest("hex");
  const stored = await db("checkout_idempotency").where({ key }).first();
  assert.notEqual(stored.request_hash, historicalHash);
  assert.equal(
    (await submit(c, { ...body, reviewedQuote: "0".repeat(64) }, key)).body.error.code,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    (await submit(c, { ...body, demoPaymentToken: "DEMO-DECLINE" }, key)).body.error.code,
    "IDEMPOTENCY_CONFLICT",
  );
  // Represent a completed record from before quote binding on the isolated database.
  await db("checkout_idempotency").where({ key }).update({ request_hash: historicalHash });
  const preQuoteRetry = await submit(c, purchase(email, { couponCode: "HELLO" }), key);
  assert.equal(preQuoteRetry.status, 201);
  assert.equal(preQuoteRetry.body.data.order.id, order.id);
  for (const outcome of ["success", undefined]) {
    const legacyRetry = await submit(
      c,
      { ...legacy, demoPaymentOutcome: outcome },
      key,
    );
    assert.equal(legacyRetry.status, 201);
    assert.equal(legacyRetry.body.data.order.id, order.id);
    assert.ok(legacyRetry.body.data.receiptToken === receiptToken);
  }
  const wrongCart = new Client();
  await wrongCart.request("/cart");
  const conflict = await submit(wrongCart, legacy, key);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(
    (await submit(c, { ...legacy, pointsToRedeem: 1 }, key)).status,
    409,
  );
  assert.equal(
    (await submit(c, { ...legacy, demoPaymentOutcome: "failure" }, key))
      .status,
    409,
  );
  assert.equal(
    (await db("email_outbox").where({ order_id: order.id }).count().first())
      .count,
    1,
  );
  assert.equal(
    (await db("coupons").where({ code: "HELLO" }).first()).used_count,
    before.used_count + 1,
  );
  assert.equal((await c.request("/auth/session")).body.data.user, null);
  assert.equal(
    (await c.request(`/checkout/receipts/${receiptToken}`)).status,
    200,
  );
  assert.equal(
    (await new Client().request(`/me/orders/${order.id}`)).status,
    401,
  );
  assert.equal(
    (await submit(c, { ...body, pointsToRedeem: 1 }, key)).status,
    409,
  );
  const mail = await lastMail(email, order.orderNumber);
  assert.equal(mail.Subject, `Your order ${order.orderNumber} has been received`);
  assert.ok(mail.Text.includes(order.orderNumber));
  assert.match(mail.Text, /Status: pending/);
});
test("Guest using existing email does not gain session; OTP grants access to saved order", async () => {
  const c = new Client();
  await add(c);
  const r = await submit(c, await review(c, purchase("sam@example.com")));
  assert.equal(r.status, 201);
  assert.equal((await c.request("/auth/session")).body.data.user, null);
  const requestedAt = Date.now();
  const otpReq = await c.request("/auth/login/request-code", "POST", {
    email: "sam@example.com",
  });
  assert.equal(otpReq.status, 202);
  const mail = await lastMail("sam@example.com", "sign-in code", requestedAt),
    code = mail.Text.match(/\b\d{6}\b/)[0];
  assert.equal(
    (
      await c.request("/auth/login/verify-code", "POST", {
        email: "sam@example.com",
        code,
      })
    ).status,
    200,
  );
  assert.equal(
    (await c.request(`/me/orders/${r.body.data.order.id}`)).status,
    200,
  );
  assert.equal(
    (
      await c.request("/auth/login/verify-code", "POST", {
        email: "sam@example.com",
        code,
      })
    ).status,
    401,
  );
});
test("Two checkouts contend for one remaining stock unit without overselling", async () => {
  const c1 = new Client(),
    c2 = new Client();
  const other = product.variants.find((v) => v.id !== variant.id);
  const current = await db("product_variants").where({ id: other.id }).first();
  const inventory = await admin.request(
    `/admin/variants/${other.id}/inventory`,
    "PATCH",
    { stock: 1, expectedStockVersion: current.stock_version },
  );
  assert.equal(inventory.status, 200);
  await add(c1, other);
  await add(c2, other);
  const bodyA = await review(c1, purchase(`stock-a-${randomUUID()}@example.com`));
  const bodyB = await review(c2, purchase(`stock-b-${randomUUID()}@example.com`));
  const r = await Promise.all([
    submit(c1, bodyA),
    submit(c2, bodyB),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    (await db("product_variants").where({ id: other.id }).first()).stock,
    0,
  );
});
test("Inventory revisions protect product edits, checkout and concurrent stock updates", async () => {
  const suffix = randomUUID();
  const template = (await admin.request(`/admin/products/${product.id}`)).body.data;
  const created = await admin.request("/admin/products", "POST", {
    name: "Inventory regression product",
    slug: `inventory-${suffix}`,
    brand: template.brand,
    categoryId: template.category.id,
    shortDescription: template.shortDescription,
    descriptionLines: template.descriptionLines,
    tags: template.tags,
    images: template.imageDetails,
    variants: template.variants.map(({ id, ...v }, index) => ({
      ...v,
      sku: `INV-${suffix}-${index}`,
      stock: 20,
    })),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const initial = created.body.data;
  const [first, second] = initial.variants;
  const productPath = `/admin/products/${initial.id}`;
  const inventoryPath = `/admin/variants/${first.id}/inventory`;
  const readVariant = (id) => db("product_variants").where({ id }).first();
  const setStock = (v, stock) => ({
    ...v,
    stock,
    expectedStockVersion: v.stockVersion,
  });

  assert.equal(first.stock, 20);
  const guest = new Client();
  await add(guest, first);
  const checkout = await submit(guest, await review(guest, purchase(`inventory-${suffix}@example.com`)));
  assert.equal(checkout.status, 201);
  assert.equal((await readVariant(first.id)).stock, 19);
  const metadata = {
    shortDescription: "Description edited after checkout.",
    variants: initial.variants,
  };
  assert.equal((await admin.request(productPath, "PATCH", metadata)).status, 200);
  assert.equal((await readVariant(first.id)).stock, 19);

  const stale = await admin.request(productPath, "PATCH", {
    variants: [setStock(first, 30), second],
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "STOCK_CONFLICT");
  const current = (await admin.request(productPath)).body.data;
  const currentFirst = current.variants.find((v) => v.id === first.id);
  const intentional = await admin.request(productPath, "PATCH", {
    variants: [setStock(currentFirst, 25), second],
  });
  assert.equal(intentional.status, 200);
  const afterEdit = intentional.body.data.variants.find((v) => v.id === first.id);
  assert.equal(afterEdit.stock, 25);
  assert.equal(afterEdit.stockVersion, currentFirst.stockVersion + 1);

  const results = await Promise.all([
    admin.request(productPath, "PATCH", {
      variants: [setStock(afterEdit, 31), second],
    }),
    admin.request(inventoryPath, "PATCH", {
      stock: 32,
      expectedStockVersion: afterEdit.stockVersion,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(results.find((r) => r.status === 409).body.error.code, "STOCK_CONFLICT");
  const winner = await readVariant(first.id);
  assert.equal(winner.stock, results[0].status === 200 ? 31 : 32);
  assert.equal(winner.stock_version, afterEdit.stockVersion + 1);

  // Return the stock quantity to its earlier value without reviving that revision.
  const restored = await admin.request(inventoryPath, "PATCH", {
    stock: afterEdit.stock,
    expectedStockVersion: winner.stock_version,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.stock, 25);
  const beforeRollback = (await admin.request(productPath)).body.data;
  const rollback = await admin.request(productPath, "PATCH", {
    shortDescription: "This conflicting edit should roll back.",
    images: initial.imageDetails.map((image) => ({ ...image, alt: "Rollback image" })),
    variants: [setStock(second, 17), setStock(afterEdit, 35)],
  });
  assert.equal(rollback.status, 409);
  assert.equal(rollback.body.error.code, "STOCK_CONFLICT");
  assert.deepEqual((await admin.request(productPath)).body.data, beforeRollback);

  const customer = new Client();
  await customer.login("alex@example.com", "ObsidianCustomer!2026");
  const inventoryEdit = { stock: 26, expectedStockVersion: restored.body.data.stockVersion };
  assert.equal((await customer.request(inventoryPath, "PATCH", inventoryEdit)).status, 403);
  assert.equal((await admin.request(inventoryPath, "PATCH", { ...inventoryEdit, stock: -1 })).status, 400);
  assert.equal((await admin.request(inventoryPath, "PATCH", { stock: 26 })).status, 400);
  assert.equal((await readVariant(first.id)).stock, 25);

  const { id: existingId, ...newVariant } = second;
  const added = await admin.request(productPath, "PATCH", {
    variants: [
      ...beforeRollback.variants,
      { ...newVariant, sku: `INV-${suffix}-NEW`, stock: 7 },
    ],
  });
  assert.equal(added.status, 200);
  const fresh = added.body.data.variants.find((v) => v.sku.endsWith("-NEW"));
  assert.equal(fresh.stock, 7);
  assert.equal(fresh.stockVersion, 0);

  const nextGuest = new Client();
  await add(nextGuest, first);
  const reviewed = await review(nextGuest, purchase(`inventory-race-${suffix}@example.com`));
  const [sale, adjustment] = await Promise.all([
    submit(nextGuest, reviewed),
    admin.request(productPath, "PATCH", {
      variants: added.body.data.variants.map((v) =>
        v.id === first.id ? setStock(v, 40) : v,
      ),
    }),
  ]);
  assert.equal(sale.status, 201);
  assert.ok([200, 409].includes(adjustment.status));
  if (adjustment.status === 409) {
    assert.equal(adjustment.body.error.code, "STOCK_CONFLICT");
  }
  assert.equal((await readVariant(first.id)).stock, adjustment.status === 200 ? 39 : 24);
});

async function testProductPayload(categoryId) {
  const { body } = await admin.request(`/admin/products/${product.id}`);
  const template = body.data;
  const slug = `catalog-${randomUUID()}`;
  return {
    name: "Catalog regression product",
    slug,
    brand: template.brand,
    categoryId: categoryId ?? template.category.id,
    shortDescription: template.shortDescription,
    descriptionLines: template.descriptionLines,
    tags: template.tags,
    images: template.imageDetails,
    variants: template.variants.map(({ id, ...v }, index) => ({
      ...v,
      sku: `${slug}-${index}`,
    })),
  };
}

async function createTestProduct(categoryId) {
  const response = await admin.request(
    "/admin/products",
    "POST",
    await testProductPayload(categoryId),
  );
  assert.equal(response.status, 201);
  return response.body.data;
}

test("Product saves require distinct active variants and roll back invalid edits", async () => {
  const original = await createTestProduct();
  const path = `/admin/products/${original.id}`;
  const [first, second] = original.variants;
  const assertActiveVariants = async () => {
    const { count } = await db("product_variants")
      .where({ product_id: original.id, is_active: true })
      .count()
      .first();
    assert.equal(count, 2);
  };
  await assertActiveVariants();

  const duplicate = await admin.request(path, "PATCH", {
    variants: [first, first],
  });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.error.code, "DUPLICATE_VARIANT_ID");

  const duplicateSku = await admin.request(path, "PATCH", {
    variants: [first, { ...second, sku: first.sku }],
  });
  assert.equal(duplicateSku.status, 400);
  assert.equal(duplicateSku.body.error.code, "DUPLICATE_SKU");

  const insufficient = await admin.request(path, "PATCH", {
    variants: [first, { ...second, isActive: false }],
  });
  assert.equal(insufficient.status, 400);
  assert.equal(insufficient.body.error.code, "VARIANTS_REQUIRED");

  const invalid = await admin.request(path, "PATCH", {
    shortDescription: "This edit must roll back.",
    variants: [
      {
        ...first,
        stock: first.stock + 1,
        expectedStockVersion: first.stockVersion,
      },
      { ...second, id: randomUUID() },
    ],
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_VARIANT");
  assert.deepEqual((await admin.request(path)).body.data, original);
  await assertActiveVariants();

  const { id, ...replacement } = second;
  const changed = await admin.request(path, "PATCH", {
    variants: [first, { ...replacement, sku: `${original.slug}-replacement` }],
  });
  assert.equal(changed.status, 200);
  await assertActiveVariants();
  assert.equal(
    (await db("product_variants").where({ id }).first()).is_active,
    false,
  );
  const retained = changed.body.data.variants.find((v) => v.id === first.id);
  assert.equal(retained.stockVersion, first.stockVersion);
});

test("Category creation reuses archived slugs and rejects concurrent duplicates", async () => {
  const create = (name, slug = "cpu") =>
    admin.request("/admin/categories", "POST", { name, slug });
  const invalid = await create("Invalid taxonomy", "invalid-taxonomy");
  assert.equal(invalid.status, 400);

  const initials = await Promise.all([create("Processors"), create("CPUs")]);
  assert.deepEqual(initials.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    initials.find((r) => r.status === 409).body.error.code,
    "ALREADY_EXISTS",
  );
  const original = initials.find((r) => r.status === 201).body.data;
  const linked = await createTestProduct(original.id);
  const path = `/admin/categories/${original.id}`;
  const inUse = await admin.request(path, "DELETE");
  assert.equal(inUse.status, 409);
  assert.equal(inUse.body.error.code, "CATEGORY_IN_USE");
  const archived = await admin.request(`/admin/products/${linked.id}`, "DELETE");
  assert.equal(archived.status, 204);
  assert.equal((await admin.request(path, "DELETE")).status, 204);
  assert.equal(
    (await db("categories").where({ id: original.id }).first()).is_active,
    false,
  );

  const reactivations = await Promise.all([
    create("Processor catalog"),
    create("CPU catalog"),
  ]);
  assert.deepEqual(reactivations.map((r) => r.status).sort(), [201, 409]);
  const reopened = reactivations.find((r) => r.status === 201).body.data;
  assert.equal(reopened.id, original.id);
  assert.equal(reopened.createdAt, original.createdAt);
  assert.equal(reopened.isActive, true);
  assert.ok(["Processor catalog", "CPU catalog"].includes(reopened.name));

  const categories = await db("categories").where({ slug: "cpu" });
  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, reopened.name);
  const archivedProduct = await db("products").where({ id: linked.id }).first();
  assert.equal(archivedProduct.category_id, original.id);
  assert.equal(archivedProduct.is_active, false);
  const duplicate = await create("This name must not replace an active category");
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "ALREADY_EXISTS");
  const active = await db("categories").where({ id: original.id }).first();
  assert.equal(active.name, reopened.name);
});

async function waitForBlockedQuery(blockerPid, queryPattern) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await db.raw(
      `SELECT pid FROM pg_stat_activity
       WHERE datname = current_database() AND query LIKE ?
         AND ? = ANY(pg_blocking_pids(pid))`,
      [queryPattern, blockerPid],
    );
    if (rows.length) return rows[0].pid;
    await delay(20);
  }
  assert.fail(`No query matching ${queryPattern} blocked by PID ${blockerPid}`);
}

test("Product create and reassignment serialize with category archive", async (t) => {
  async function openCategory() {
    const response = await admin.request("/admin/categories", "POST", {
      slug: "motherboard",
      name: "Motherboards",
    });
    assert.equal(response.status, 201);
    return response.body.data;
  }
  const archive = (category) =>
    admin.request(`/admin/categories/${category.id}`, "DELETE");

  for (const mode of ["create", "reassign"]) {
    await t.test(`${mode} commits first and archive sees the active product`, async () => {
      const category = await openCategory();
      const source = mode === "reassign" ? await createTestProduct() : null;
      const body = source
        ? { categoryId: category.id }
        : await testProductPayload(category.id);
      const save = () =>
        source
          ? admin.request(`/admin/products/${source.id}`, "PATCH", body)
          : admin.request("/admin/products", "POST", body);
      const writePattern = source
        ? 'update "products"%'
        : 'insert into "products"%';
      let saving, archiving;
      try {
        // Pause the product write after category validation. SHARE permits
        // archive's product lookup, so it is the category lock that blocks it.
        await db.transaction(async (gate) => {
          await gate.raw("LOCK TABLE products IN SHARE MODE");
          const { rows: [{ pid }] } = await gate.raw(
            "SELECT pg_backend_pid() AS pid",
          );
          saving = save();
          const savePid = await waitForBlockedQuery(pid, writePattern);
          archiving = archive(category);
          await waitForBlockedQuery(savePid, 'select%from "categories"%for update');
        });
        const [saved, archived] = await Promise.all([saving, archiving]);
        assert.equal(saved.status, source ? 200 : 201);
        assert.equal(archived.status, 409);
        assert.equal(archived.body.error.code, "CATEGORY_IN_USE");
        const record = await db("products")
          .where({ id: saved.body.data.id })
          .first();
        assert.equal(record.category_id, category.id);
        assert.equal(record.is_active, true);
        const current = await db("categories").where({ id: category.id }).first();
        assert.equal(current.is_active, true);
        const removed = await admin.request(`/admin/products/${record.id}`, "DELETE");
        assert.equal(removed.status, 204);
        assert.equal((await archive(category)).status, 204);
      } finally {
        await Promise.allSettled([saving, archiving]);
      }
    });
  }

  await t.test("archive commits first and product create fails validation", async () => {
    const category = await openCategory();
    const body = await testProductPayload(category.id);
    let saving, archiving;
    try {
      // Hold the archive at its product lookup after it locks the category.
      await db.transaction(async (gate) => {
        await gate.raw("LOCK TABLE products IN ACCESS EXCLUSIVE MODE");
        const { rows: [{ pid }] } = await gate.raw(
          "SELECT pg_backend_pid() AS pid",
        );
        archiving = archive(category);
        const archivePid = await waitForBlockedQuery(pid, 'select%from "products"%');
        saving = admin.request("/admin/products", "POST", body);
        await waitForBlockedQuery(archivePid, 'select%from "categories"%for share');
      });
      const [saved, archived] = await Promise.all([saving, archiving]);
      assert.equal(archived.status, 204);
      assert.equal(saved.status, 400);
      assert.equal(saved.body.error.code, "INVALID_CATEGORY");
      assert.equal(
        await db("products").where({ slug: body.slug }).first(),
        undefined,
      );
      const current = await db("categories").where({ id: category.id }).first();
      assert.equal(current.is_active, false);
    } finally {
      await Promise.allSettled([saving, archiving]);
    }
  });
});

test("Two checkouts contend for one coupon use without over-redemption", async () => {
  const code = randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
  assert.equal(
    (
      await admin.request("/admin/coupons", "POST", {
        code,
        discountAmountVnd: 1000,
        usageLimit: 1,
      })
    ).status,
    201,
  );
  const a = new Client(),
    b = new Client();
  await add(a);
  await add(b);
  const orderA = await review(a, purchase(`coupon-a-${randomUUID()}@example.com`, { couponCode: code }));
  const orderB = await review(b, purchase(`coupon-b-${randomUUID()}@example.com`, { couponCode: code }));
  const r = await Promise.all([
    submit(a, orderA),
    submit(b, orderB),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 422]);
  assert.equal(r.find((x) => x.status === 422).body.error.code, "INVALID_COUPON");
  assert.equal((await db("coupons").where({ code }).first()).used_count, 1);
});
test("Registration only allows email/name/address; recovery tokens single-use; addresses support defaults", async () => {
  const c = new Client(),
    email = `register-${randomUUID()}@example.com`;
  const { recipientName, phone, ...shippingAddress } = shipping;
  assert.equal(
    (
      await c.request("/auth/register", "POST", {
        email,
        fullName: "New Customer",
        shippingAddress,
        password: "not-allowed",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await c.request("/auth/register", "POST", {
        email,
        fullName: "New Customer",
        shippingAddress,
      })
    ).status,
    201,
  );
  const otp = await lastMail(email, "sign-in code");
  assert.equal(
    (
      await c.request("/auth/login/verify-code", "POST", {
        email,
        code: otp.Text.match(/\b\d{6}\b/)[0],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await c.request("/auth/password/change", "POST", {
        newPassword: "FirstPassword!2026",
      })
    ).status,
    204,
  );
  const a = await c.request("/me/addresses", "POST", {
    ...shipping,
    line1: "99 Second Street",
    isDefault: true,
  });
  assert.equal(a.status, 201);
  let addresses = (await c.request("/me/addresses")).body.data;
  assert.equal(addresses.length, 2);
  assert.equal(addresses.filter((a) => a.isDefault).length, 1);
  assert.equal(
    (await c.request(`/me/addresses/${a.body.data.id}`, "DELETE")).status,
    204,
  );
  addresses = (await c.request("/me/addresses")).body.data;
  assert.equal(addresses[0].isDefault, true);
  await c.request("/auth/password/recover/request", "POST", { email });
  const mail = await lastMail(email, "Reset"),
    t = mail.Text.match(/token=([\w-]+)/)[1];
  assert.equal(
    (
      await c.request("/auth/password/recover/confirm", "POST", {
        token: t,
        newPassword: "ResetPassword!2026",
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await c.request("/auth/password/recover/confirm", "POST", {
        token: t,
        newPassword: "AgainPassword!2026",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await c.request("/auth/login/password", "POST", {
        email,
        password: "FirstPassword!2026",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await c.request("/auth/login/password", "POST", {
        email,
        password: "ResetPassword!2026",
      })
    ).status,
    200,
  );
});
test("Admin sequential status transitions, coupon limits, user bans and actual analytics", async () => {
  const orders = await admin.request("/admin/orders");
  assert.equal(orders.body.meta.pageSize, 20);
  assert.equal(orders.body.data.length, 20);
  const pending = orders.body.data.find((o) => o.status === "pending");
  let r = await admin.request(`/admin/orders/${pending.id}/status`, "PATCH", {
    expectedCurrentStatus: "pending",
    newStatus: "shipping",
  });
  assert.equal(r.status, 409);
  for (const [from, to] of [
    ["pending", "confirmed"],
    ["confirmed", "shipping"],
    ["shipping", "delivered"],
  ]) {
    r = await admin.request(`/admin/orders/${pending.id}/status`, "PATCH", {
      expectedCurrentStatus: from,
      newStatus: to,
    });
    assert.equal(r.status, 200);
  }
  const detail = (await admin.request(`/admin/orders/${pending.id}`)).body.data;
  assert.equal(detail.statusHistory[0].status, "delivered");
  assert.equal(detail.statusHistory.length, 4);
  assert.equal(
    (
      await admin.request("/admin/coupons", "POST", {
        code: "ABC12",
        discountAmountVnd: 1000,
        usageLimit: 11,
      })
    ).status,
    400,
  );
  const stats = await admin.request(
    "/admin/dashboard/analytics?period=year&groupBy=quarter",
  );
  assert.equal(stats.status, 200);
  assert.equal(stats.body.data.series.length, 4);
  assert.equal(
    stats.body.data.series.reduce((s, r) => s + r.revenueVnd, 0),
    stats.body.data.totals.revenueVnd,
  );
  const customer = new Client();
  await customer.login("jordan@example.com", "ObsidianCustomer!2026");
  const u = (await customer.request("/me")).body.data;
  assert.equal(
    (await admin.request(`/admin/users/${u.id}`, "PATCH", { isBanned: true }))
      .status,
    200,
  );
  assert.ok([401, 403].includes((await customer.request("/me")).status));
  const bannedGuest = new Client();
  await add(bannedGuest);
  assert.equal(
    (await submit(bannedGuest, await review(bannedGuest, purchase("jordan@example.com")))).status,
    403,
  );
  await admin.request(`/admin/users/${u.id}`, "PATCH", { isBanned: false });
});
test("Two API replicas share sessions and carts; both are healthy", async () => {
  const a = new Client("http://localhost:3101");
  await a.login("alex@example.com", "ObsidianCustomer!2026");
  await add(a);
  const b = new Client("http://localhost:3102");
  b.cookies = new Map(a.cookies);
  b.csrf = a.csrf;
  const [ra, rb] = await Promise.all([a.request("/cart"), b.request("/cart")]);
  assert.equal(ra.body.data.id, rb.body.data.id);
  assert.deepEqual(ra.body.data.items, rb.body.data.items);
  assert.equal(ra.headers.get("x-instance-id"), "api-a");
  assert.equal(rb.headers.get("x-instance-id"), "api-b");
});
test("Loyalty redemption and zero-amount payments reconcile exactly with the ledger", async () => {
  const c = new Client();
  await c.login("alex@example.com", "ObsidianCustomer!2026");
  const cart = (await c.request("/cart")).body.data;
  for (const i of cart.items) await c.request(`/cart/items/${i.id}`, "DELETE");
  await add(c);
  const before = (await c.request("/me")).body.data;
  const order = {
    shippingAddress: shipping,
    paymentMethod: "DEMO",
    couponCode: "ALLIN",
    pointsToRedeem: 30,
  };
  const missing = await submit(c, order);
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, "PAYMENT_TOKEN_REQUIRED");
  assert.equal(
    (await c.request("/me")).body.data.pointsBalance,
    before.pointsBalance,
  );
  const r = await submit(c, await review(c, {
    ...order,
    demoPaymentToken: "DEMO-APPROVE",
  }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.order.totalPaidVnd, 0);
  assert.equal(r.body.data.order.pointsEarned, 0);
  const after = (await c.request("/me")).body.data;
  assert.equal(after.pointsBalance, before.pointsBalance - 30);
  const { sum } = await db("loyalty_ledger")
    .where({ user_id: before.id })
    .sum("points_delta")
    .first();
  assert.equal(Number(sum), after.pointsBalance);
  await add(c);
  const body = await review(c, {
    shippingAddress: shipping,
    paymentMethod: "DEMO",
    demoPaymentToken: "DEMO-APPROVE",
    pointsToRedeem: 1,
  });
  const results = await Promise.all([submit(c, body), submit(c, body)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
  const final = (await c.request("/me")).body.data;
  const ledger = await db("loyalty_ledger")
    .where({ user_id: before.id })
    .sum("points_delta as total")
    .first();
  assert.equal(final.pointsBalance, Number(ledger.total));
  assert.ok(final.pointsBalance >= 0);
});
test("Cross-replica WebSocket comments and ratings arrive without reload", async () => {
  const { io } = await import("socket.io-client");
  const sockets = [
    io("http://localhost:3101", {
      transports: ["websocket"],
      extraHeaders: { Origin: ORIGIN },
    }),
    io("http://localhost:3102", {
      transports: ["websocket"],
      extraHeaders: { Origin: ORIGIN },
    }),
  ];
  try {
    await Promise.all(
      sockets.map(
        (s) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Socket connection timed out")),
              5000,
            );
            s.on("connect", () => {
              clearTimeout(timer);
              s.emit("product.join", { productId: product.id });
              resolve();
            });
            s.on("connect_error", reject);
          }),
      ),
    );
    await delay(150);
    const body = `Cross-replica event ${randomUUID()}`;
    const received = Promise.all(
      sockets.map(
        (s) =>
          new Promise((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error("Cross-instance event timed out")),
              5000,
            );
            s.on("comment.created", (event) => {
              if (event.comment.body === body) {
                clearTimeout(t);
                resolve(event);
              }
            });
          }),
      ),
    );
    const c = new Client("http://localhost:3101");
    assert.equal(
      (
        await c.request(`/products/${product.slug}/comments`, "POST", {
          guestName: "Realtime tester",
          body,
        })
      ).status,
      201,
    );
    const events = await received;
    assert.equal(events[0].comment.id, events[1].comment.id);
    const rating = Promise.all(
      sockets.map(
        (s) =>
          new Promise((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error("Rating event timed out")),
              5000,
            );
            s.once("rating.updated", (event) => {
              clearTimeout(t);
              resolve(event);
            });
          }),
      ),
    );
    await c.login("alex@example.com", "ObsidianCustomer!2026");
    await c.request(`/products/${product.slug}/rating`, "PUT", { stars: 4 });
    assert.equal((await rating)[0].productId, product.id);
  } finally {
    sockets.forEach((s) => s.disconnect());
  }
});
test("Refresh tokens rotate, foreign Origin fails, another customer cannot read an order", async () => {
  const c = new Client();
  await c.login("alex@example.com", "ObsidianCustomer!2026");
  const old = c.cookies.get("refresh_token");
  c.cookies.delete("access_token");
  assert.equal((await c.request("/cart")).status, 401);
  const r = await c.request("/auth/refresh", "POST");
  assert.equal(r.status, 200);
  assert.notEqual(c.cookies.get("refresh_token"), old);
  const replay = new Client();
  replay.cookies = new Map(c.cookies);
  replay.csrf = c.csrf;
  replay.cookies.set("refresh_token", old);
  assert.equal((await replay.request("/auth/refresh", "POST")).status, 401);
  assert.equal(
    (
      await c.request(
        "/me",
        "PATCH",
        { fullName: "Unwanted change" },
        { Origin: "https://untrusted.example" },
      )
    ).status,
    403,
  );
  const foreign = await db("orders")
    .whereNot({ buyer_email: "alex@example.com" })
    .first();
  assert.equal((await c.request(`/me/orders/${foreign.id}`)).status, 404);
  const unauth = new Client();
  assert.equal(
    (await unauth.request("/auth/google/callback?code=invalid&state=invalid"))
      .status,
    401,
  );
});
