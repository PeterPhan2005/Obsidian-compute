import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { db, json } from "../src/db.js";
import { hash } from "../src/lib.js";
import { BASE, Client, shipping } from "./checkout-fixtures.js";

let admin, customer, customerRow, product, variant;
const subtotal = 157431;
const unitCost = 100000;

before(async () => {
  assert.match(process.env.OBSIDIAN_VERIFY_PROJECT, /^obsidian-test-[a-f0-9]{32}$/);
  assert.equal(BASE, "http://localhost:8081");
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.host, "127.0.0.1:15433");
  assert.equal(url.pathname, "/obsidian_test");
  assert.equal(url.search, "");
  const { rows: [{ name }] } = await db.raw("SELECT current_database() AS name");
  assert.equal(name, "obsidian_test");

  admin = new Client();
  await admin.login();
  customer = new Client();
  const { body } = await customer.login("alex@example.com", "ObsidianCustomer!2026");
  customerRow = body.data.user;
  variant = await db("product_variants").where({ is_active: true }).first();
  product = await db("products").where({ id: variant.product_id }).first();
});

after(() => db.destroy());

function fixture(t) {
  const id = randomUUID();
  const email = "snapshot-" + id + "@example.com";
  t.after(() => db.transaction(async (conn) => {
    await conn("receipt_tokens").where({ order_id: id }).delete();
    await conn("order_status_history").where({ order_id: id }).delete();
    await conn("order_items").where({ order_id: id }).delete();
    await conn("orders").where({ id }).delete();
    await conn("users").where({ email }).delete();
  }));
  return { id, email };
}

async function insertOrder(conn, { id, email }, owner) {
  const category = await conn("categories").where({ id: product.category_id }).first();
  await conn("orders").insert({
    id,
    user_id: owner.id,
    buyer_name: owner.fullName,
    buyer_email: email,
    shipping_snapshot: json(shipping),
    subtotal_vnd: subtotal,
    shipping_fee_vnd: 30000,
    total_paid_vnd: subtotal + 30000,
    payment_reference: "snapshot-" + id,
  });
  await conn("order_items").insert({
    order_id: id,
    product_id: product.id,
    variant_id: variant.id,
    name_snapshot: product.name,
    sku_snapshot: variant.sku,
    attributes_snapshot: json(variant.attributes),
    unit_price_vnd: subtotal,
    unit_cost_vnd: unitCost,
    quantity: 1,
    line_total_vnd: subtotal,
    category_id_snapshot: category.id,
    category_name_snapshot: category.name,
  });
  await conn("order_status_history").insert({
    order_id: id, status: "pending", changed_by: "system",
  });
}

async function waitForBlockedReads(pid, fromTable, count) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const { rows } = await db.raw(
      'SELECT pid FROM pg_stat_activity WHERE datname = current_database() ' +
      'AND query LIKE ? AND ? = ANY(pg_blocking_pids(pid))',
      ['select * from "' + fromTable + '"%', pid],
    );
    if (rows.length === count) return;
    await delay(30);
  }
  assert.fail("Expected HTTP reads did not reach the " + fromTable + " barrier");
}

async function readAcrossCommit(table, reads, write) {
  const responses = [];
  try {
    await db.transaction(async (conn) => {
      await conn.raw("SET LOCAL lock_timeout = '7s'");
      await conn.raw("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      const { rows: [{ pid }] } = await conn.raw("SELECT pg_backend_pid() AS pid");
      // Block later DTO queries after the HTTP handler has already read orders.
      await conn.raw("LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE", [table]);
      for (const read of reads) {
        const response = read();
        response.catch(() => {});
        responses.push(response);
      }
      await waitForBlockedReads(pid, table, reads.length);
      await write(conn);
    });
    return await Promise.all(responses);
  } finally {
    await Promise.allSettled(responses);
  }
}

test("Simple Dashboard metrics and revenue series share a snapshot across a committed sale", async (t) => {
  const order = fixture(t);
  const summary = () => admin.request("/admin/dashboard/summary");
  const beforeRead = await summary();
  assert.equal(beforeRead.status, 200);
  const beforeSummary = beforeRead.body.data;

  const [duringRead] = await readAcrossCommit("order_items", [summary], async (conn) => {
    const [{ id }] = await conn("users").insert({
      email: order.email, full_name: "Snapshot Test",
    }).returning("id");
    await insertOrder(conn, order, { id, fullName: "Snapshot Test" });
  });
  assert.equal(duringRead.status, 200);
  assert.deepEqual(duringRead.body.data, beforeSummary);

  const afterRead = await summary();
  assert.equal(afterRead.status, 200);
  const afterSummary = afterRead.body.data;
  for (const [key, difference] of Object.entries({
    totalOrders: 1, ordersSold: 1, totalUsers: 1, newUsers: 1,
    revenueVnd: subtotal, grossProfitVnd: subtotal - unitCost, unitsSold: 1,
  })) {
    assert.equal(afterSummary.totals[key] - beforeSummary.totals[key], difference, key);
  }
  const annualRevenue = ({ revenueSeries }) => revenueSeries
    .reduce((total, point) => total + point.revenueVnd, 0);
  assert.equal(annualRevenue(afterSummary) - annualRevenue(beforeSummary), subtotal);
  const pending = ({ ordersByStatus }) => ordersByStatus
    .find((entry) => entry.status === "pending").count;
  assert.equal(pending(afterSummary) - pending(beforeSummary), 1);
});

test("Admin, Customer and receipt reads keep order state and timeline on one snapshot", async (t) => {
  const order = fixture(t);
  const token = randomBytes(32).toString("hex");
  await db.transaction(async (conn) => {
    await insertOrder(conn, order, customerRow);
    await conn("receipt_tokens").insert({
      order_id: order.id,
      token_hash: hash(token),
      expires_at: new Date(Date.now() + 3600000),
    });
  });
  const guest = new Client();
  const adminPath = "/admin/orders/" + order.id;
  const customerPath = "/me/orders/" + order.id;
  const reads = [
    () => admin.request(adminPath),
    () => admin.request("/admin/orders?status=pending&pageSize=1"),
    () => customer.request(customerPath),
    () => customer.request("/me/orders?status=pending&pageSize=1"),
    () => guest.request("/checkout/receipts", "GET", undefined, { "X-Receipt-Token": token }),
  ];
  const during = await readAcrossCommit("order_status_history", reads, async (conn) => {
    await conn("orders").where({ id: order.id }).update({ status: "confirmed" });
    // Older releases could record a transaction-start time before the previous status.
    await conn("order_status_history").insert({
      order_id: order.id,
      status: "confirmed",
      changed_by: "fixture",
      changed_at: new Date(0),
    });
  });
  for (const { status, body } of during) {
    assert.equal(status, 200);
    const current = Array.isArray(body.data) ? body.data[0] : body.data;
    assert.equal(current.id, order.id);
    assert.equal(current.status, "pending");
    assert.deepEqual(current.statusHistory.map((entry) => entry.status), ["pending"]);
  }

  const afterRead = await customer.request(customerPath);
  assert.equal(afterRead.status, 200);
  assert.equal(afterRead.body.data.status, "confirmed");
  assert.deepEqual(afterRead.body.data.statusHistory.map((entry) => entry.status), ["confirmed", "pending"]);
  assert.equal((await guest.request(customerPath)).status, 401);

  const statusPath = adminPath + "/status";
  const rejected = await admin.request(statusPath, "PATCH", {
    expectedCurrentStatus: "confirmed", newStatus: "delivered",
  });
  assert.equal(rejected.status, 409);
  const updated = await admin.request(statusPath, "PATCH", {
    expectedCurrentStatus: "confirmed", newStatus: "shipping",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.order.status, "shipping");
  assert.deepEqual(updated.body.data.statusHistory.map((entry) => entry.status),
    ["shipping", "pending", "confirmed"]);
  assert.equal(updated.body.data.statusHistory[2].changedAt, new Date(0).toISOString());
  assert.deepEqual(updated.body.data.order.statusHistory, updated.body.data.statusHistory);
});
