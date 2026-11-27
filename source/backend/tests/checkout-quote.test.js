import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/db.js";
import { Client, purchase, review, shipping, submit } from "./checkout-fixtures.js";

let admin, template;

before(async () => {
  assert.equal(new URL(process.env.DATABASE_URL).pathname, "/obsidian_test");
  const { rows: [{ name }] } = await db.raw("SELECT current_database() AS name");
  assert.equal(name, "obsidian_test");
  admin = new Client();
  await admin.login();
  const products = await admin.request("/products?category=ssd");
  const { body } = await admin.request(`/admin/products/${products.body.data[0].id}`);
  template = body.data;
});
after(() => db.destroy());

async function changeCart(client, method, body, itemId) {
  if (method === "POST" && !client.cookies.get("guest_cart")) {
    assert.equal((await client.request("/cart")).status, 200);
  }
  const result = await client.request(
    `/cart/items${itemId ? `/${itemId}` : ""}`,
    method,
    body,
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.data;
}

async function snapshot(client, variantIds, couponCode, email) {
  const [cart, variants, coupon, points, ...counts] = await Promise.all([
    client.request("/cart"),
    db("product_variants").whereIn("id", variantIds).orderBy("id")
      .select("id", "stock", "stock_version", "price_vnd"),
    db("coupons").where({ code: couponCode }).first("used_count"),
    db("users").where({ email }).first("points_balance"),
    ...["orders", "order_items", "payment_attempts", "coupon_redemptions", "loyalty_ledger", "email_outbox", "checkout_idempotency"]
      .map((table) => db(table).count().first()),
  ]);
  return { cart: cart.body.data, variants, coupon, points, counts };
}

test("Checkout recovery reads only the current cart's committed receipt within its original lifetime", async () => {
  const client = new Client();
  const otherCart = new Client();
  const key = randomUUID();
  const email = `recovery-${key}@example.com`;
  const couponCode = key.replaceAll("-", "").slice(0, 5).toUpperCase();
  assert.equal((await admin.request("/admin/coupons", "POST", {
    code: couponCode, discountAmountVnd: 10000, usageLimit: 3,
  })).status, 201);
  const variant = template.variants.find((item) => item.isActive && item.stock > 1);
  assert.ok(variant);
  await changeCart(client, "POST", { variantId: variant.id, quantity: 1 });
  assert.equal((await otherCart.request("/cart")).status, 200);
  const recover = (owner) => owner.request("/checkout/recovery", "POST", undefined, {
    "Idempotency-Key": key,
  });
  assert.deepEqual((await recover(client)).body.data, { state: "unconfirmed" });

  const request = await review(client, purchase(email, { couponCode }));
  async function waitingFor(pid, query) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { rows } = await db.raw(
        "SELECT pid FROM pg_stat_activity WHERE query LIKE ? AND ? = ANY(pg_blocking_pids(pid))",
        [query, pid],
      );
      if (rows.length) return rows[0].pid;
      await delay(20);
    }
    assert.fail("Expected checkout lock wait was not observed");
  }
  let submission, concurrentRecovery;
  try {
    await db.transaction(async (editor) => {
      const { rows: [{ pid }] } = await editor.raw("SELECT pg_backend_pid() AS pid");
      await editor("product_variants").where({ id: variant.id }).forUpdate().first();
      submission = submit(client, request, key);
      const checkoutPid = await waitingFor(pid, '%"product_variants"%for update%');
      concurrentRecovery = recover(client);
      await waitingFor(checkoutPid, "%pg_advisory_xact_lock%");
    });
  } finally {
    await Promise.allSettled([submission, concurrentRecovery]);
  }
  const committed = await submission;
  assert.equal(committed.status, 201, committed.body.error?.code);
  const { order, receiptToken } = committed.body.data;
  assert.ok((await concurrentRecovery).body.data.receiptToken === receiptToken);
  const beforeRecovery = await snapshot(client, [variant.id], couponCode, email);
  const response = await recover(client);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.body.data.state, "complete");
  assert.equal(response.body.data.receiptToken === receiptToken, true);
  assert.deepEqual((await recover(otherCart)).body.data, { state: "unconfirmed" });
  assert.deepEqual(await snapshot(client, [variant.id], couponCode, email), beforeRecovery);

  assert.equal(await db("receipt_tokens").where({ order_id: order.id })
    .update({ expires_at: new Date(0) }), 1);
  assert.deepEqual((await recover(client)).body.data, { state: "expired" });
});

test("Checkout recovery follows the Customer cart through login, logout and guest-cart merging", async () => {
  const customer = new Client();
  const email = "alex@example.com";
  const password = "ObsidianCustomer!2026";
  const variant = template.variants.find((item) => item.isActive && item.stock > 1);
  assert.ok(variant);
  const recovery = (client, key) => client.request("/checkout/recovery", "POST", undefined, {
    "Idempotency-Key": key,
  });

  await customer.login(email, password);
  await changeCart(customer, "POST", { variantId: variant.id, quantity: 1 });
  const key = randomUUID();
  const request = await review(customer, {
    shippingAddress: shipping,
    paymentMethod: "DEMO",
    demoPaymentToken: "DEMO-APPROVE",
  });
  const committed = await submit(customer, request, key);
  assert.equal(committed.status, 201);
  assert.ok((await recovery(customer, key)).body.data.receiptToken === committed.body.data.receiptToken);
  assert.equal((await customer.request("/auth/logout", "POST")).status, 204);
  assert.deepEqual((await recovery(customer, key)).body.data, { state: "unconfirmed" });

  const guest = new Client();
  await changeCart(guest, "POST", { variantId: variant.id, quantity: 1 });
  const guestKey = randomUUID();
  const guestRequest = await review(guest, purchase(`merge-${guestKey}@example.com`));
  const guestOrder = await submit(guest, guestRequest, guestKey);
  assert.equal(guestOrder.status, 201);
  assert.ok((await recovery(guest, guestKey)).body.data.receiptToken === guestOrder.body.data.receiptToken);
  await changeCart(guest, "POST", { variantId: variant.id, quantity: 1 });
  await guest.login(email, password);
  const merged = await guest.request("/cart");
  assert.equal(merged.body.data.itemCount, 1);
  assert.deepEqual((await recovery(guest, guestKey)).body.data, { state: "unconfirmed" });
  assert.ok((await recovery(guest, key)).body.data.receiptToken === committed.body.data.receiptToken);
  await changeCart(guest, "DELETE", undefined, merged.body.data.items[0].id);
});

test("New checkout must match the reviewed product configuration, quantities and locked selling prices", async (t) => {
  const client = new Client();
  const suffix = randomUUID();
  const email = `review-${suffix}@example.com`;
  const couponCode = suffix.replaceAll("-", "").slice(0, 5).toUpperCase();
  const coupon = await admin.request("/admin/coupons", "POST", {
    code: couponCode, discountAmountVnd: 10000, usageLimit: 3,
  });
  assert.equal(coupon.status, 201);
  const product = await admin.request("/admin/products", "POST", {
    name: "Checkout quote regression product",
    slug: `quote-${suffix}`,
    brand: template.brand,
    categoryId: template.category.id,
    shortDescription: template.shortDescription,
    descriptionLines: template.descriptionLines,
    tags: template.tags,
    images: template.imageDetails,
    variants: template.variants.map(({ id, ...v }, index) => ({
      ...v, sku: `quote-${suffix}-${index}`, stock: 20, priceVnd: 1050000,
    })),
  });
  assert.equal(product.status, 201, JSON.stringify(product.body));
  const productPath = `/admin/products/${product.body.data.id}`;
  t.after(async () => {
    assert.equal((await admin.request(productPath, "DELETE")).status, 204);
  });
  const [first, second] = product.body.data.variants;
  const variantIds = [first.id, second.id];
  const body = purchase(email, { couponCode });
  let cart = await changeCart(client, "POST", { variantId: first.id, quantity: 1 });

  const assertRejectedWithoutWrites = async (request, status, code) => {
    const beforeSubmit = await snapshot(client, variantIds, couponCode, email);
    const result = await submit(client, request);
    assert.equal(result.status, status, result.body.error?.code);
    assert.equal(result.body.error.code, code);
    assert.deepEqual(await snapshot(client, variantIds, couponCode, email), beforeSubmit);
  };
  await assertRejectedWithoutWrites(body, 400, "QUOTE_REQUIRED");

  const reviewedQuantity = await review(client, body);
  cart = await changeCart(client, "PATCH", { quantity: 2 }, cart.items[0].id);
  await assertRejectedWithoutWrites(reviewedQuantity, 409, "QUOTE_CHANGED");

  const reviewedContents = await review(client, body);
  const sameSubtotal = cart.subtotalVnd;
  await changeCart(client, "DELETE", undefined, cart.items[0].id);
  cart = await changeCart(client, "POST", { variantId: second.id, quantity: 2 });
  assert.equal(cart.subtotalVnd, sameSubtotal);
  assert.equal(cart.items[0].variantId, second.id);
  await assertRejectedWithoutWrites(reviewedContents, 409, "QUOTE_CHANGED");

  let selected = second;
  let revision = product.body.data.revision;
  for (const changes of [
    { name: "Updated checkout quote product" },
    { variants: [first, { ...second, sku: `${second.sku}-updated` }] },
    { attributes: { ...second.attributes, Configuration: "Fixture configuration" } },
  ]) {
    const reviewedConfiguration = await review(client, body);
    const update = changes.attributes
      ? { variants: [first, { ...selected, ...changes }] }
      : changes;
    const saved = await admin.request(productPath, "PATCH", {
      ...update,
      expectedRevision: revision,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    revision = saved.body.data.revision;
    selected = saved.body.data.variants.find((variant) => variant.id === second.id);
    assert.equal(selected.priceVnd, second.priceVnd);
    await assertRejectedWithoutWrites(reviewedConfiguration, 409, "QUOTE_CHANGED");
  }

  // Make checkout wait for the price row; its validation must use the committed price.
  const reviewedPrice = await review(client, body);
  const beforePriceChange = await snapshot(client, variantIds, couponCode, email);
  const updatedPrice = 1100000;
  let ordering;
  try {
    await db.transaction(async (editor) => {
      const { rows: [{ pid }] } = await editor.raw("SELECT pg_backend_pid() AS pid");
      await editor("product_variants").where({ id: second.id }).update({ price_vnd: updatedPrice });
      ordering = submit(client, reviewedPrice);
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const { rows } = await db.raw(
          `SELECT pid FROM pg_stat_activity
           WHERE datname = current_database() AND query LIKE 'select%from "product_variants"%for update'
             AND ? = ANY(pg_blocking_pids(pid))`,
          [pid],
        );
        if (rows.length) return;
        await delay(20);
      }
      assert.fail("Checkout did not wait for the price row");
    });
    const rejected = await ordering;
    assert.equal(rejected.status, 409, rejected.body.error?.code);
    assert.equal(rejected.body.error.code, "QUOTE_CHANGED");
  } finally {
    await Promise.allSettled([ordering]);
  }
  const { variants, cart: currentCart, ...unchanged } = await snapshot(client, variantIds, couponCode, email);
  assert.deepEqual(unchanged, {
    coupon: beforePriceChange.coupon,
    points: beforePriceChange.points,
    counts: beforePriceChange.counts,
  });
  assert.deepEqual(variants, beforePriceChange.variants.map((v) =>
    v.id === second.id ? { ...v, price_vnd: updatedPrice } : v));
  assert.equal(currentCart.items[0].variantId, second.id);
  assert.equal(currentCart.items[0].quantity, 2);
  assert.equal(currentCart.subtotalVnd, updatedPrice * 2);

  const refreshed = await review(client, body);
  const key = randomUUID();
  const order = await submit(client, refreshed, key);
  assert.equal(order.status, 201, order.body.error?.code);
  assert.equal(order.body.data.order.items[0].quantity, 2);
  assert.equal(order.body.data.order.items[0].unitPriceVnd, updatedPrice);
  const replay = await submit(client, refreshed, key);
  assert.equal(replay.status, 201);
  assert.equal(replay.body.data.order.id, order.body.data.order.id);

  const zeroPrice = await admin.request(productPath, "PATCH", {
    expectedRevision: revision,
    variants: [first, { ...selected, priceVnd: 0 }],
  });
  assert.equal(zeroPrice.status, 200);
  const freeCart = await changeCart(client, "POST", { variantId: second.id, quantity: 1 });
  assert.equal(freeCart.subtotalVnd, 0);
  const newCouponCode = randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
  const invalidCoupon = await review(client, { ...body, couponCode: newCouponCode });
  const createdCoupon = await admin.request("/admin/coupons", "POST", {
    code: newCouponCode, discountAmountVnd: 10000, usageLimit: 1,
  });
  assert.equal(createdCoupon.status, 201);
  const rejected = await submit(client, invalidCoupon);
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.error.code, "QUOTE_CHANGED");
  assert.equal((await db("coupons").where({ code: newCouponCode }).first()).used_count, 0);
});

test("Changed discount and loyalty eligibility invalidate the reviewed totals without side effects", async () => {
  const client = new Client();
  const email = "alex@example.com";
  await client.login(email, "ObsidianCustomer!2026");
  const [{ id }] = template.variants.filter((v) => v.stock >= 2);
  await changeCart(client, "POST", { variantId: id, quantity: 1 });
  const couponCode = randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
  const coupon = await admin.request("/admin/coupons", "POST", {
    code: couponCode, discountAmountVnd: 10000, usageLimit: 2,
  });
  assert.equal(coupon.status, 201);
  const request = {
    shippingAddress: shipping,
    couponCode,
    pointsToRedeem: 1,
    paymentMethod: "DEMO",
    demoPaymentToken: "DEMO-APPROVE",
  };
  const staleDiscount = await review(client, request);
  await db("coupons").where({ code: couponCode }).update({ discount_amount_vnd: 20000 });
  const beforeDiscount = await snapshot(client, [id], couponCode, email);
  const discount = await submit(client, staleDiscount);
  assert.equal(discount.status, 409);
  assert.equal(discount.body.error.code, "QUOTE_CHANGED");
  assert.deepEqual(await snapshot(client, [id], couponCode, email), beforeDiscount);

  const freshDiscount = await review(client, request);
  const changedPoints = await submit(client, { ...freshDiscount, pointsToRedeem: 0 });
  assert.equal(changedPoints.status, 409);
  assert.equal(changedPoints.body.error.code, "QUOTE_CHANGED");
  assert.deepEqual(await snapshot(client, [id], couponCode, email), beforeDiscount);

  try {
    await db("users").where({ email }).update({ points_balance: 0 });
    const beforePoints = await snapshot(client, [id], couponCode, email);
    const points = await submit(client, freshDiscount);
    assert.equal(points.status, 422);
    assert.equal(points.body.error.code, "INVALID_POINTS");
    assert.deepEqual(await snapshot(client, [id], couponCode, email), beforePoints);
  } finally {
    await db("users").where({ email }).update(beforeDiscount.points);
  }
  const body = await review(client, request);
  const placed = await submit(client, body);
  assert.equal(placed.status, 201, placed.body.error?.code);
  assert.equal(placed.body.data.order.couponDiscountVnd, 20000);
  assert.equal(placed.body.data.order.pointsDiscountVnd, 1000);
});
