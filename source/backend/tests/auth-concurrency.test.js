import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import argon2 from "argon2";
import cookieParser from "cookie-parser";
import express from "express";
import { db } from "../src/db.js";
import { Client, ORIGIN } from "./checkout-fixtures.js";

let server, api, hash;

before(async () => {
  assert.match(
    process.env.OBSIDIAN_VERIFY_PROJECT || "",
    /^obsidian-test-[a-f0-9]{32}$/,
  );
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.protocol, "postgres:");
  assert.equal(database.host, "127.0.0.1:15433");
  assert.equal(database.pathname, "/obsidian_test");
  const {
    rows: [identity],
  } = await db.raw(
    "select current_database() as name, inet_server_port() as port",
  );
  assert.deepEqual(identity, { name: "obsidian_test", port: 5432 });

  process.env.APP_BASE_URL = ORIGIN;
  const { authenticate, csrf, authRoutes } = await import("../src/auth.js");
  ({ hash } = await import("../src/lib.js"));
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(
    "/api/v1",
    authenticate,
    csrf,
    authRoutes(null, () => (_req, _res, next) => next()),
  );
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: { code: err.code } });
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  api = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await db.destroy();
});

async function makeAccount() {
  const password = randomUUID();
  const [user] = await db("users")
    .insert({
      email: `auth-check-${randomUUID()}@example.com`,
      full_name: "Auth concurrency fixture",
      password_hash: await argon2.hash(password),
      email_verified: true,
    })
    .returning(["id", "email"]);
  return { ...user, password };
}

function pauseVerifiedPasswords(t, password, count) {
  const realVerify = argon2.verify;
  const reached = Promise.withResolvers();
  const release = Promise.withResolvers();
  let verified = 0;
  t.mock.method(argon2, "verify", async (passwordHash, input) => {
    const valid = await realVerify(passwordHash, input);
    if (valid && input === password) {
      verified += 1;
      if (verified === count) reached.resolve();
      await release.promise;
    }
    return valid;
  });
  return {
    ready: () =>
      Promise.race([
        reached.promise,
        delay(10000, null, { ref: false }).then(() =>
          assert.fail("Expected password checks did not arrive"),
        ),
      ]),
    resume: release.resolve,
  };
}

test("Failed profile reads and guest-cart merges do not issue authentication cookies", async (t) => {
  for (const table of ["addresses", "carts"]) {
    await t.test(`${table} query fails after session creation`, async (fault) => {
      const account = await makeAccount();
      const client = new Client(api);
      const guestToken = randomUUID();
      await db("carts").insert({ guest_token_hash: hash(guestToken) });
      client.cookies.set("guest_cart", guestToken);
      const dialect = Object.getPrototypeOf(db.client);
      const query = dialect._query;
      let injected = false;
      const stub = fault.mock.method(dialect, "_query", function (connection, statement) {
        if (statement.sql.includes(`from "${table}"`)) {
          injected = true;
          throw new Error("Controlled sign-in query failure");
        }
        return query.call(this, connection, statement);
      });

      const result = await client.request("/auth/login/password", "POST", {
        email: account.email,
        password: account.password,
      });
      assert.equal(result.status, 500);
      assert.equal(injected, true);
      assert.equal(
        result.headers.getSetCookie().filter((cookie) => /^(access|refresh)_token=/.test(cookie)).length,
        0,
      );
      assert.equal(client.cookies.get("guest_cart"), guestToken);

      stub.mock.restore();
      const success = await client.login(account.email, account.password);
      assert.equal(success.body.data.user.id, account.id);
      assert.ok(client.cookies.get("access_token"));
      assert.ok(client.cookies.get("refresh_token"));
      assert.ok(await db("carts").where({ user_id: account.id }).first());
    });
  }
});

test("Identity-scoped reads, writes and refresh only use their intended principal", async () => {
  const original = await makeAccount();
  const next = await makeAccount();
  const client = new Client(api);
  const prior = await client.login(next.email, next.password);
  const oldScope = { "X-Session-Identity": original.id };
  const response = await client.request("/me", "GET", undefined, oldScope);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "SESSION_CHANGED");
  const mutation = await client.request("/me", "PATCH", { fullName: "Other scope fixture" }, oldScope);
  assert.equal(mutation.status, 409);
  const passwordChange = await client.request("/auth/password/change", "POST", {
    currentPassword: next.password,
    newPassword: randomUUID(),
  }, oldScope);
  assert.equal(passwordChange.status, 409);
  const refresh = await client.request("/auth/refresh", "POST", undefined, oldScope);
  assert.equal(refresh.status, 409);
  assert.equal(refresh.headers.getSetCookie().length, 0);

  const ownScope = { "X-Session-Identity": next.id };
  const own = await client.request("/me", "GET", undefined, ownScope);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.fullName, prior.body.data.user.fullName);
  assert.equal((await client.request("/auth/refresh", "POST", undefined, ownScope)).status, 200);

  const invalid = new Client(api);
  invalid.cookies.set("refresh_token", randomUUID());
  const unrecognized = await invalid.request("/me", "GET", undefined, ownScope);
  assert.equal(unrecognized.status, 409);
  assert.equal(unrecognized.headers.getSetCookie().length, 0);
});

test("A successful reset revokes existing sessions and fences a login awaiting its verified credential", async (t) => {
  const account = await makeAccount();
  const existing = new Client(api);
  await existing.login(account.email, account.password);

  const resetToken = randomBytes(32).toString("base64url");
  await db("password_reset_tokens").insert({
    user_id: account.id,
    token_hash: hash(resetToken),
    expires_at: new Date(Date.now() + 60000),
  });
  const password = randomUUID();
  const gate = pauseVerifiedPasswords(t, account.password, 1);
  const waitingClient = new Client(api);
  const login = waitingClient.request("/auth/login/password", "POST", {
    email: account.email,
    password: account.password,
  });
  let reset;
  try {
    await gate.ready();
    reset = await new Client(api).request(
      "/auth/password/recover/confirm",
      "POST",
      {
        token: resetToken,
        newPassword: password,
      },
    );
  } finally {
    gate.resume();
  }
  assert.equal(reset.status, 204);
  assert.equal((await login).status, 401);
  assert.equal(waitingClient.cookies.has("access_token"), false);
  assert.equal((await existing.request("/auth/refresh", "POST")).status, 401);
  assert.equal((await existing.request("/auth/session")).body.data.user, null);
  assert.equal(
    await db("refresh_sessions")
      .where({ user_id: account.id })
      .whereNull("revoked_at")
      .first("id"),
    undefined,
  );
  await new Client(api).login(account.email, password);
});

test("Logout revokes its session after refresh rotation and preserves a separate session", async () => {
  const account = await makeAccount();
  const refreshing = new Client(api);
  const separate = new Client(api);
  await refreshing.login(account.email, account.password);
  await separate.login(account.email, account.password);

  const ending = new Client(api);
  // Reuse the same session before rotation, with no usable access cookie.
  ending.cookies = new Map(refreshing.cookies);
  ending.cookies.delete("access_token");
  assert.equal((await refreshing.request("/auth/refresh", "POST")).status, 200);
  assert.equal((await ending.request("/auth/refresh", "POST")).status, 401);
  assert.equal((await ending.request("/auth/logout", "POST")).status, 204);

  assert.equal((await refreshing.request("/me")).status, 401);
  assert.equal((await refreshing.request("/auth/refresh", "POST")).status, 401);
  assert.equal((await separate.request("/me")).status, 200);
});

test("Concurrent password changes from one session accept only one verified credential snapshot", async (t) => {
  const account = await makeAccount();
  const client = new Client(api);
  await client.login(account.email, account.password);
  const gate = pauseVerifiedPasswords(t, account.password, 2);
  const replacements = [randomUUID(), randomUUID()];
  const changes = Promise.all(
    replacements.map((newPassword) =>
      client.request("/auth/password/change", "POST", {
        currentPassword: account.password,
        newPassword,
      }),
    ),
  );
  try {
    await gate.ready();
  } finally {
    gate.resume();
  }
  const results = await changes;
  assert.deepEqual(results.map(({ status }) => status).sort(), [204, 401]);
  assert.equal(
    results.find(({ status }) => status === 401).body.error.code,
    "INVALID_PASSWORD",
  );
  assert.equal((await client.request("/me")).status, 200);
  await new Client(api).login(
    account.email,
    replacements[results.findIndex(({ status }) => status === 204)],
  );
});

async function waitForIssuersBlockedOnAccount() {
  const pattern = 'select % from "users" where "email" = % for update';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const {
      rows: [{ blocked }],
    } = await db.raw(
      `select count(*) as blocked from pg_stat_activity
        where datname = current_database()
          and wait_event_type = 'Lock'
          and query like ?`,
      [pattern],
    );
    if (blocked === 2) return;
    await delay(50);
  }
  assert.fail("Both issuance requests must wait for the account row");
}

test("Overlapping OTP and reset issuance each leave only one usable challenge", async () => {
  const account = await makeAccount();
  for (const [path, table, owner, retiredAt] of [
    [
      "/auth/login/request-code",
      "login_otps",
      { email: account.email },
      "consumed_at",
    ],
    [
      "/auth/password/recover/request",
      "password_reset_tokens",
      { user_id: account.id },
      "used_at",
    ],
  ]) {
    const lock = await db.transaction();
    let requests;
    try {
      await lock("users").where({ id: account.id }).forUpdate().first("id");
      requests = Promise.all(
        [new Client(api), new Client(api)].map((client) =>
          client.request(path, "POST", { email: account.email }),
        ),
      );
      await waitForIssuersBlockedOnAccount();
    } finally {
      await lock.rollback();
    }
    assert.deepEqual(
      (await requests).map(({ status }) => status),
      [202, 202],
    );
    const rows = await db(table).where(owner).select(retiredAt);
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row[retiredAt] === null).length, 1);
  }
});
