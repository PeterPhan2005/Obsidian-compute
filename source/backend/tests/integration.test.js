import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/db.js";
const BASE = process.env.TEST_BASE_URL || "http://localhost:8081";
const ORIGIN = "http://localhost:8081";
let admin, product, variant;
class Client {
  constructor(base = BASE) {
    this.base = base;
    this.cookies = new Map();
    this.csrf = null;
  }
  async request(path, method = "GET", body, headers = {}) {
    if (method !== "GET" && !this.csrf) {
      const r = await this.request("/auth/csrf");
      this.csrf = r.body.data.csrfToken;
    }
    const r = await fetch(this.base + "/api/v1" + path, {
      method,
      headers: {
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        Origin: ORIGIN,
        ...(method !== "GET" ? { "X-CSRF-Token": this.csrf } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const cookie of r.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return {
      status: r.status,
      body: r.status === 204 ? null : await r.json(),
      headers: r.headers,
    };
  }
  async login(email = "admin@obsidian.local", password = "ObsidianAdmin!2026") {
    const r = await this.request("/auth/login/password", "POST", {
      email,
      password,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r;
  }
}
const shipping = {
  recipientName: "Integration Customer",
  phone: "0901234567",
  line1: "12 Nguyen Hue",
  ward: "Ben Nghe",
  district: "District 1",
  city: "Ho Chi Minh City",
  country: "VN",
};
function purchase(email, extra = {}) {
  return {
    buyer: { email, fullName: "Integration Customer" },
    shippingAddress: shipping,
    paymentMethod: "DEMO",
    demoPaymentOutcome: "success",
    ...extra,
  };
}
async function add(c, v = variant, quantity = 1) {
  const r = await c.request("/cart/items", "POST", {
    variantId: v.id,
    quantity,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}
async function submit(c, body, key = randomUUID()) {
  return c.request("/checkout/orders", "POST", body, {
    "Idempotency-Key": key,
  });
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
test("Cart mutation and payment failure preserve stock/coupon/points; invalid coupon preview is explicit", async () => {
  const c = new Client();
  await add(c);
  const bad = await c.request("/checkout/quote", "POST", {
    couponCode: "ZZ999",
  });
  assert.equal(bad.status, 200);
  assert.equal(bad.body.data.coupon.valid, false);
  const before = await db("product_variants").where({ id: variant.id }).first();
  const result = await submit(
    c,
    purchase(`failure-${randomUUID()}@example.com`, {
      couponCode: "HELLO",
      demoPaymentOutcome: "failure",
    }),
  );
  assert.equal(result.status, 402);
  assert.equal(
    (await db("product_variants").where({ id: variant.id }).first()).stock,
    before.stock,
  );
  assert.equal((await c.request("/cart")).body.data.items.length, 1);
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
    key = randomUUID(),
    body = purchase(email, { couponCode: "HELLO" });
  const before = await db("coupons").where({ code: "HELLO" }).first();
  const results = await Promise.all([
    submit(c, body, key),
    submit(c, body, key),
  ]);
  for (const r of results) assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(results[0].body.data.order.id, results[1].body.data.order.id);
  const { order, receiptToken } = results[0].body.data;
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
  assert.ok(mail.Text.includes(order.orderNumber));
});
test("Guest using existing email does not gain session; OTP grants access to saved order", async () => {
  const c = new Client();
  await add(c);
  const r = await submit(c, purchase("sam@example.com"));
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
  await admin.request(`/admin/variants/${other.id}/inventory`, "PATCH", {
    stock: 1,
  });
  await add(c1, other);
  await add(c2, other);
  const r = await Promise.all([
    submit(c1, purchase(`stock-a-${randomUUID()}@example.com`)),
    submit(c2, purchase(`stock-b-${randomUUID()}@example.com`)),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    (await db("product_variants").where({ id: other.id }).first()).stock,
    0,
  );
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
  const r = await Promise.all([
    submit(
      a,
      purchase(`coupon-a-${randomUUID()}@example.com`, { couponCode: code }),
    ),
    submit(
      b,
      purchase(`coupon-b-${randomUUID()}@example.com`, { couponCode: code }),
    ),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 422]);
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
    (await submit(bannedGuest, purchase("jordan@example.com"))).status,
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
  const r = await submit(c, {
    shippingAddress: shipping,
    paymentMethod: "DEMO",
    demoPaymentOutcome: "success",
    couponCode: "ALLIN",
    pointsToRedeem: 30,
  });
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
  const body = {
    shippingAddress: shipping,
    paymentMethod: "DEMO",
    demoPaymentOutcome: "success",
    pointsToRedeem: 1,
  };
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
