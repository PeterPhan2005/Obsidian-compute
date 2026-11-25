import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import argon2 from "argon2";
import cookieParser from "cookie-parser";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import Redis from "ioredis";
import { SignJWT } from "jose";
import { authenticate, authRoutes, csrf, requireAdmin } from "../src/auth.js";
import { db } from "../src/db.js";
import { baseUrl } from "../src/lib.js";

const clientId = "obsidian-oauth-fixture.apps.googleusercontent.com";
const redirectUri = new URL("/api/v1/auth/google/callback", baseUrl).href;
const issuer = "https://accounts.google.com";

function browser(initialCookies) {
  const cookies = new Map(initialCookies);
  return {
    cookies,
    async request(api, path, options = {}) {
      const response = await fetch(`${api}/api/v1${path}`, {
        ...options,
        redirect: "manual",
        headers: {
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          ...options.headers,
        },
      });
      for (const header of response.headers.getSetCookie()) {
        const [key, value] = header.split(";")[0].split("=");
        if (value) cookies.set(key, value);
        else cookies.delete(key);
      }
      return response;
    },
  };
}

async function listen(t, redis) {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(
    "/api/v1",
    authenticate,
    csrf,
    authRoutes(redis, () => (_req, _res, next) => next()),
  );
  app.get("/api/v1/admin/probe", requireAdmin, (_req, res) => res.sendStatus(204));
  app.use((err, _req, res, _next) =>
    res.status(err.status || 500).json({ code: err.code }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test(
  "Google OAuth with fixture-signed tokens, real token validation and shared test storage",
  { skip: process.env.TEST_GOOGLE_OAUTH !== "1" },
  async (t) => {
    assert.equal(new URL(process.env.DATABASE_URL).pathname, "/obsidian_test");
    t.after(() => db.destroy());
    const result = await db.raw("SELECT current_database() AS name");
    assert.equal(result.rows[0].name, "obsidian_test");
    assert.ok(process.env.REDIS_URL);
    const redisA = new Redis(process.env.REDIS_URL);
    const redisB = redisA.duplicate();
    t.after(() => Promise.all([redisA.quit(), redisB.quit()]));

    process.env.GOOGLE_CLIENT_ID = clientId;
    process.env.GOOGLE_CLIENT_SECRET = "fixture-only";
    delete process.env.GOOGLE_CALLBACK_URL;
    const apiA = await listen(t, redisA);
    process.env.GOOGLE_CALLBACK_URL = redirectUri;
    const apiB = await listen(t, redisB);
    process.env.GOOGLE_CALLBACK_URL = `${redirectUri}?unexpected=true`;
    const invalidConfigApi = await listen(t, redisA);

    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    t.mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async () => ({
      certs: { fixture: publicKey.export({ type: "spki", format: "pem" }) },
      format: "PEM",
    }));
    const issued = new Map();
    const realFetch = fetch;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (url !== "https://oauth2.googleapis.com/token")
        return realFetch(url, options);
      const body = options.body;
      const attempt = issued.get(body.get("code"));
      issued.delete(body.get("code"));
      assert.ok(attempt);
      assert.equal(options.method, "POST");
      assert.equal(body.get("client_id"), clientId);
      assert.equal(body.get("client_secret"), "fixture-only");
      assert.equal(body.get("redirect_uri"), redirectUri);
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(
        createHash("sha256").update(body.get("code_verifier")).digest("base64url"),
        attempt.challenge,
      );
      return Response.json({ id_token: attempt.token });
    });

    async function begin(client, claims = {}, signingKey = privateKey) {
      const start = await client.request(
        apiA,
        "/auth/google/start?returnTo=%2F%2Fexternal.example",
      );
      assert.equal(start.status, 302);
      const authorization = new URL(start.headers.get("location"));
      const params = authorization.searchParams;
      assert.equal(authorization.origin, "https://accounts.google.com");
      assert.equal(params.get("client_id"), clientId);
      assert.equal(params.get("redirect_uri"), redirectUri);
      assert.equal(params.get("response_type"), "code");
      assert.equal(params.get("code_challenge_method"), "S256");
      assert.match(params.get("state"), /^[\w-]{43}$/);
      assert.match(params.get("nonce"), /^[\w-]{43}$/);
      assert.match(start.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
      const code = randomUUID();
      const state = params.get("state");
      issued.set(code, {
        challenge: params.get("code_challenge"),
        token: await new SignJWT({
          iss: issuer,
          aud: clientId,
          nonce: params.get("nonce"),
          iat: Math.floor(Date.now() / 1000) - 3600,
          exp: Math.floor(Date.now() / 1000) + 600,
          sub: randomUUID(),
          email: `oauth-${randomUUID()}@gmail.com`,
          email_verified: true,
          ...claims,
        }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(signingKey),
      });
      return { code, state, path: `/auth/google/callback?code=${code}&state=${state}` };
    }

    async function finish(client, api, attempt) {
      const csrfToken = (await (await client.request(api, "/auth/csrf")).json()).data.csrfToken;
      return client.request(api, "/auth/google/callback", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
        body: JSON.stringify({ code: attempt.code, state: attempt.state }),
      });
    }

    async function reject(client, path, status, code) {
      const response = typeof path === "string"
        ? await client.request(apiB, path)
        : await finish(client, apiB, path);
      assert.equal(response.status, status);
      assert.equal((await response.json()).code, code);
    }

    await t.test("invalid configuration is disabled and callback state is one-use", async () => {
      const first = browser();
      assert.equal((await first.request(invalidConfigApi, "/auth/google/start")).status, 503);
      const attempt = await begin(first);
      const key = `oauth:${attempt.state}`;
      assert.ok(await redisB.ttl(key) > 0);
      await reject(browser([["oauth_binding", "mismatch"]]), attempt, 401, "OAUTH_STATE");
      assert.equal(issued.has(attempt.code), true);
      const replay = browser(first.cookies);
      const callback = await first.request(apiB, attempt.path);
      assert.equal(callback.status, 302);
      assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
      assert.equal(callback.headers.getSetCookie().length, 0);
      const handoff = new URL(callback.headers.get("location"), baseUrl);
      assert.equal(handoff.pathname, "/oauth/google");
      assert.equal(handoff.search, "");
      const params = new URLSearchParams(handoff.hash.slice(1));
      assert.ok(params.get("code") === attempt.code && params.get("state") === attempt.state);
      const completed = await finish(first, apiA, attempt);
      assert.equal(completed.status, 200);
      assert.equal((await completed.json()).data.returnTo, "/account/addresses?welcome=1");
      assert.equal(await redisA.get(key), null);
      await reject(replay, attempt, 401, "OAUTH_STATE");
      const session = (await (await first.request(apiA, "/auth/session")).json()).data;
      assert.equal(session.user.role, "CUSTOMER");
      assert.equal(session.user.emailVerified, true);
      assert.equal((await first.request(apiB, "/me")).status, 200);
      await reject(first, "/admin/probe", 403, "FORBIDDEN");
      const csrfToken = (await (await first.request(apiA, "/auth/csrf")).json()).data.csrfToken;
      const post = { method: "POST", headers: { "X-CSRF-Token": csrfToken } };
      assert.equal((await first.request(apiB, "/auth/refresh", post)).status, 200);
      assert.equal((await first.request(apiA, "/auth/logout", post)).status, 204);
      assert.equal((await first.request(apiB, "/me")).status, 401);

      const expired = await begin(first);
      await redisA.expire(`oauth:${expired.state}`, 0);
      await reject(first, expired, 401, "OAUTH_STATE");
      assert.equal(issued.has(expired.code), true);
    });

    await t.test("invalid tokens and claims fail without writes", async () => {
      const email = `oauth-${randomUUID()}@gmail.com`;
      const failures = [
        [{ aud: "different-client" }, privateKey, "OAUTH_FAILED"],
        [{ iss: "https://untrusted.example" }, privateKey, "OAUTH_FAILED"],
        [{ exp: Math.floor(Date.now() / 1000) - 1200 }, privateKey, "OAUTH_FAILED"],
        [{}, otherKey, "OAUTH_FAILED"],
        [{ nonce: "x".repeat(43) }, privateKey, "OAUTH_IDENTITY"],
        [{ email_verified: "true" }, privateKey, "OAUTH_IDENTITY"],
        [{ sub: "" }, privateKey, "OAUTH_IDENTITY"],
        [{ email: undefined }, privateKey, "OAUTH_IDENTITY"],
      ];
      for (const [claims, key, code] of failures) {
        const client = browser();
        const attempt = await begin(client, { email, ...claims }, key);
        await reject(client, attempt, 401, code);
        assert.equal(issued.has(attempt.code), false);
        assert.equal(client.cookies.has("access_token"), false);
      }
      assert.equal(await db("users").where({ email }).first(), undefined);
    });

    await t.test("first callbacks serialize and do not rebind an existing subject", async () => {
      const first = browser(), second = browser();
      const email = `oauth-${randomUUID()}@gmail.com`;
      const sub = randomUUID();
      const a = await begin(first, { email, sub });
      const b = await begin(second, { email, sub });
      const responses = await Promise.all([
        finish(first, apiA, a),
        finish(second, apiB, b),
      ]);
      assert.deepEqual(responses.map((response) => response.status), [200, 200]);
      const [identity] = await db("auth_identities").where({ provider_subject: sub });
      const [user] = await db("users").where({ email });
      assert.equal(identity.user_id, user.id);
      const bob = browser();
      const changed = await begin(bob, { email });
      await reject(bob, changed, 409, "GOOGLE_ALREADY_LINKED");
      assert.equal((await db("auth_identities").where({ user_id: user.id })).length, 1);
      await db("users").where({ id: user.id }).update({ is_banned: true });
      const banned = await begin(bob, { email, sub });
      await reject(bob, banned, 403, "BANNED");
      const admin = await db("users").where({ role: "ADMIN" }).first("email");
      const forbidden = await begin(bob, { email: admin.email });
      await reject(bob, forbidden, 403, "CUSTOMER_REQUIRED");
    });

    await t.test("third-party Google email needs an active matching verified session to link", async () => {
      const email = `oauth-${randomUUID()}@example.test`;
      const sub = randomUUID();
      const client = browser();
      const missing = await begin(client, { email, sub });
      await reject(client, missing, 403, "GOOGLE_EMAIL_PROOF_REQUIRED");
      assert.equal(await db("users").where({ email }).first(), undefined);
      const password = "fixture-password";
      const [user] = await db("users")
        .insert({
          email,
          full_name: "OAuth test customer",
          email_verified: true,
          password_hash: await argon2.hash(password),
        })
        .returning("*");
      const unsigned = await begin(client, { email, sub });
      await reject(client, unsigned, 403, "GOOGLE_EMAIL_PROOF_REQUIRED");
      assert.equal(await db("auth_identities").where({ user_id: user.id }).first(), undefined);
      const csrfToken = (await (await client.request(apiA, "/auth/csrf")).json()).data.csrfToken;
      const login = await client.request(apiA, "/auth/login/password", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(login.status, 200);
      const link = await begin(client, { email, sub });
      assert.equal((await finish(client, apiB, link)).status, 200);
      const identity = await db("auth_identities").where({ provider_subject: sub }).first();
      assert.equal(identity.user_id, user.id);
      const next = browser();
      const returning = await begin(next, { email, sub });
      assert.equal((await finish(next, apiB, returning)).status, 200);
      const session = (await (await next.request(apiA, "/auth/session")).json()).data;
      assert.equal(session.user.id, user.id);
    });
  },
);
