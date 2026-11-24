import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export const BASE = process.env.TEST_BASE_URL || "http://localhost:8081";
export const ORIGIN = "http://localhost:8081";
export class Client {
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
export const shipping = {
  recipientName: "Integration Customer",
  phone: "0901234567",
  line1: "12 Nguyen Hue",
  ward: "Ben Nghe",
  district: "District 1",
  city: "Ho Chi Minh City",
  country: "VN",
};
export function purchase(email, extra = {}) {
  return {
    buyer: { email, fullName: "Integration Customer" },
    shippingAddress: shipping,
    paymentMethod: "DEMO",
    demoPaymentToken: "DEMO-APPROVE",
    ...extra,
  };
}
export async function submit(c, body, key = randomUUID()) {
  return c.request("/checkout/orders", "POST", body, {
    "Idempotency-Key": key,
  });
}
export async function review(c, body) {
  const quote = await c.request("/checkout/quote", "POST", {
    couponCode: body.couponCode,
    pointsToRedeem: body.pointsToRedeem,
  });
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  assert.match(quote.body.data.quoteFingerprint, /^[a-f0-9]{64}$/);
  return { ...body, reviewedQuote: quote.body.data.quoteFingerprint };
}
