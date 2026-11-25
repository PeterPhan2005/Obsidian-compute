import { test, expect } from "@playwright/test";
import { navigateWithToken } from "./sensitive-navigation.js";

const fixtures = {
  first: {
    id: "first-customer",
    role: "CUSTOMER",
    fullName: "First Customer",
    email: "first@example.test",
    pointsBalance: 12,
  },
  second: {
    id: "second-customer",
    role: "CUSTOMER",
    fullName: "Second Customer",
    email: "second@example.test",
    pointsBalance: 2,
  },
  admin: {
    id: "fixture-admin",
    role: "ADMIN",
    fullName: "Fixture Admin",
    email: "admin@example.test",
  },
};
const firstAddress = {
  id: "first-address",
  recipientName: "First delivery recipient",
  line1: "First delivery address",
  ward: "Ward",
  district: "District",
  city: "City",
  phone: "0900000000",
};
const secondAddress = {
  ...firstAddress,
  id: "second-address",
  recipientName: "Second delivery recipient",
  line1: "Second delivery address",
};
const order = {
  id: "order-fixture",
  orderNumber: "FIRST-FIXTURE-ORDER",
  status: "pending",
  createdAt: "2026-01-12T07:00:00.000Z",
  totalPaidVnd: 400000,
  shippingAddress: firstAddress,
  buyerEmail: fixtures.first.email,
  items: [],
  statusHistory: [],
};
const meta = { page: 1, totalPages: 1, totalItems: 1, pageSize: 12 };

async function signIn(page, user) {
  await page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic fixture only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("Identity changes and denied requests do not display retained private reads", async ({ page }) => {
  const delayedAddress = Promise.withResolvers();
  const releaseAddress = Promise.withResolvers();
  let user = fixtures.first;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice("/api/v1".length);
    const ok = (data) => route.fulfill({ json: { data } });
    switch (path) {
      case "/auth/session":
        return ok({ user, googleEnabled: false });
      case "/auth/csrf":
        return ok({ csrfToken: "test-fixture" });
      case "/auth/login/password":
        user = Object.values(fixtures).find((u) => u.email === route.request().postDataJSON().email);
        return ok({ user });
      case "/auth/logout":
        user = null;
        return route.fulfill({ status: 204 });
      case "/cart":
        return ok({ id: user?.id ?? "guest-cart", items: [], itemCount: 0 });
      case "/home":
        return ok({ sections: [] });
      case "/me/orders":
        return route.fulfill({
          json: {
            data: [user === fixtures.first ? order : { ...order, orderNumber: "SECOND-FIXTURE-SUMMARY" }],
            meta,
          },
        });
      case "/me/orders/order-fixture":
        return user === fixtures.first
          ? ok(order)
          : route.fulfill({
              status: 404,
              json: { error: { code: "NOT_FOUND", message: "Order unavailable" } },
            });
      case "/me/addresses":
        if (user === fixtures.first) {
          delayedAddress.resolve();
          await releaseAddress.promise;
          return ok([firstAddress]).catch(() => {});
        }
        return ok([secondAddress]);
      case "/me/addresses/second-address":
        return route.fulfill({
          status: 403,
          json: {
            error: { code: "FORBIDDEN", message: "Address access denied" },
          },
        });
      case "/admin/dashboard/summary":
        return route.fulfill({
          status: 403,
          json: { error: { code: "FORBIDDEN", message: "Dashboard unavailable" } },
        });
      default:
        return route.continue();
    }
  });

  try {
    await page.goto("/account/orders");
    await page.getByRole("link", { name: /FIRST-FIXTURE-ORDER/ }).click();
    await expect(page.getByText(firstAddress.recipientName)).toBeVisible();
    await page.getByRole("link", { name: "Addresses", exact: true }).click();
    await delayedAddress.promise;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await signIn(page, fixtures.second);
    await expect(page.getByRole("heading", { name: "Hello, Second." })).toBeVisible();
    releaseAddress.resolve();
    await page.getByRole("link", { name: "Addresses", exact: true }).click();
    await expect(page.getByText(secondAddress.recipientName)).toBeVisible();
    await expect(page.getByText(firstAddress.recipientName)).toHaveCount(0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Street address")).toHaveValue(secondAddress.line1);
    await page.getByRole("button", { name: "Save address", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(/Address access denied/);
    await expect(page.getByLabel("Street address")).toHaveCount(0);
    await expect(page.getByText(secondAddress.recipientName)).toHaveCount(0);
    await page.getByRole("link", { name: "Orders", exact: true }).click();
    await page.getByRole("link", { name: /SECOND-FIXTURE-SUMMARY/ }).click();
    await expect(page.getByRole("alert")).toHaveText(/Order unavailable/);
    await expect(page.getByText(firstAddress.recipientName)).toHaveCount(0);
    await expect(page.getByText(order.orderNumber)).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await signIn(page, fixtures.admin);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("alert")).toHaveText(/Dashboard unavailable/);
    await expect(page.getByText(secondAddress.recipientName)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Shopping bag", exact: true })).toHaveCount(0);
  } finally {
    releaseAddress.resolve();
  }
});

test("A session change in another tab hides old private data before the new session loads", async ({ page, context }) => {
  let user = fixtures.first;
  const loadingSession = Promise.withResolvers();
  const releaseSession = Promise.withResolvers();
  const sessions = new Map();
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice("/api/v1".length);
    const ok = (data) => route.fulfill({ json: { data } });
    if (path === "/auth/session") {
      if (request.frame().page() === page && user === fixtures.second) {
        loadingSession.resolve();
        await releaseSession.promise;
      }
      return ok({ user, googleEnabled: false });
    }
    if (path === "/auth/csrf") return ok({ csrfToken: "fixture" });
    if (path === "/auth/login/password") {
      user = fixtures.second;
      return ok({ user });
    }
    if (path === "/cart") return ok({ id: user.id, items: [], itemCount: 0 });
    if (path === "/me/addresses") {
      sessions.set(request.frame().page(), request.headers()["x-session-identity"]);
      return ok([user === fixtures.first ? firstAddress : secondAddress]);
    }
    return route.continue();
  });

  try {
    await page.goto("/account/addresses");
    await expect(page.getByText(firstAddress.recipientName)).toBeVisible();
    expect(sessions.get(page)).toBe(fixtures.first.id);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const other = await context.newPage();
    await other.goto("/login");
    await other.getByLabel("Email address", { exact: true }).fill(fixtures.second.email);
    await other.getByLabel("Password", { exact: true }).fill("Synthetic fixture only");
    await other.getByRole("button", { name: "Sign in", exact: true }).click();
    await loadingSession.promise;
    await expect(page.getByText(firstAddress.recipientName)).toHaveCount(0);
    await expect(page.getByLabel("Street address")).toHaveCount(0);
    releaseSession.resolve();
    await expect(page.getByText(secondAddress.recipientName)).toBeVisible();
    expect(sessions.get(page)).toBe(fixtures.second.id);
  } finally {
    releaseSession.resolve();
  }
});

for (const google of [false, true]) {
test(`A cart refresh finishes before another tab changes identity (${google ? "Google" : "password"})`, async ({ page, context }) => {
  if (google) {
    test.info().annotations.push({ type: "provider", description: "Synthetic OAuth completion" });
  }
  const refreshing = Promise.withResolvers();
  const releaseRefresh = Promise.withResolvers();
  let user = fixtures.first;
  let loginStarted = false;
  let expired = true;
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice("/api/v1".length);
    const ok = (data) => route.fulfill({ json: { data } });
    if (path === "/auth/session") return ok({ user, googleEnabled: false });
    if (path === "/auth/csrf") return ok({ csrfToken: "fixture" });
    if (path === "/auth/refresh") {
      expect(request.headers()["x-session-identity"]).toBe(fixtures.first.id);
      refreshing.resolve();
      await releaseRefresh.promise;
      return ok({ user: fixtures.first });
    }
    if (path === (google ? "/auth/google/callback" : "/auth/login/password") &&
        request.method() === "POST") {
      loginStarted = true;
      user = fixtures.second;
      return ok(google ? { returnTo: "/account" } : { user });
    }
    if (path === "/cart") {
      if (expired) {
        expired = false;
        return route.fulfill({ status: 401, json: { error: { code: "ACCESS_EXPIRED" } } });
      }
      return ok({ id: user.id, items: [], itemCount: 0 });
    }
    if (path === "/me/addresses") return ok([secondAddress]);
    return route.continue();
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await refreshing.promise;
    const other = await context.newPage();
    if (google) {
      await other.goto("/login");
      await navigateWithToken(other, "/api/v1/auth/google/callback?code=fixture-code&state=fixture-state");
      await expect(other).toHaveURL(/\/oauth\/google$/);
      await expect(other.getByRole("status")).toBeVisible();
    } else {
      await other.goto("/login");
      await other.getByLabel("Email address", { exact: true }).fill(fixtures.second.email);
      await other.getByLabel("Password", { exact: true }).fill("Synthetic fixture only");
      await other.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(other.getByRole("button", { name: "Please wait…" })).toBeDisabled();
    }
    expect(loginStarted).toBe(false);
    releaseRefresh.resolve();
    await expect(other.getByRole("heading", { name: "Hello, Second." })).toBeVisible();
    expect(loginStarted).toBe(true);
  } finally {
    releaseRefresh.resolve();
  }
});
}
