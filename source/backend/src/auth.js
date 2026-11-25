import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { OAuth2Client } from "google-auth-library";
import { randomInt } from "node:crypto";
import { db, camel, json } from "./db.js";
import {
  baseUrl,
  secret,
  hash,
  token,
  keyedHash,
  check,
  equal,
  cookieOptions,
  text,
  email,
  ok,
  addressSchema,
  addressDb,
  safeReturn,
  paging,
  meta,
} from "./lib.js";
import { mergeGuestCart } from "./cart-service.js";
const jwtKey = new TextEncoder().encode(secret);
const password = z.string().min(10).max(128);
const googleCallbackPath = "/api/v1/auth/google/callback";
const googleTimeoutMs = 10_000;
const oauthTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const googleClaims = z.object({
  sub: z.string().regex(/^[\x21-\x7e]{1,255}$/),
  email,
  email_verified: z.literal(true),
  nonce: z.string().regex(oauthTokenPattern),
  name: z.string().optional(),
  hd: z.string().optional(),
});

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const expectedCallback = new URL(googleCallbackPath, baseUrl).href;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL?.trim() || expectedCallback;
  if (redirectUri !== expectedCallback) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    client: new OAuth2Client({
      clientId,
      transporterOptions: { timeout: googleTimeoutMs },
    }),
  };
}

async function googleIdentity(google, code, verifier, nonce) {
  let payload;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      signal: AbortSignal.timeout(googleTimeoutMs),
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: google.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    if (response.ok) {
      const { id_token: idToken } = await response.json();
      if (typeof idToken === "string" && idToken) {
        const ticket = await google.client.verifyIdToken({
          idToken,
          audience: google.clientId,
        });
        payload = ticket.getPayload();
      }
    }
  } catch {
    // Provider errors can include token data. Return a generic response.
  }
  check(payload, 401, "OAUTH_FAILED", "Google could not verify this sign-in.");
  const claims = googleClaims.safeParse(payload);
  check(
    claims.success && equal(claims.data.nonce, nonce),
    401,
    "OAUTH_IDENTITY",
    "Google identity or sign-in session is invalid.",
  );
  return claims.data;
}
export async function self(user) {
  const address = await db("addresses")
    .where({ user_id: user.id, is_default: true })
    .first();
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    emailVerified: user.email_verified,
    hasPassword: !!user.password_hash,
    isBanned: user.is_banned,
    pointsBalance: user.points_balance,
    defaultAddress: address ? camel(address) : null,
    createdAt: user.created_at,
  };
}
function checkSessionIdentity(req, user = req.user) {
  const expected = req.get("X-Session-Identity");
  check(
    expected === undefined || expected === (user?.id ?? "guest"),
    409,
    "SESSION_CHANGED",
    "Your session changed. Please try again.",
  );
}

export async function authenticate(req, res, next) {
  req.user = null;
  if (req.cookies.access_token) {
    try {
      const { payload } = await jwtVerify(req.cookies.access_token, jwtKey, {
        issuer: "obsidian",
        audience: "obsidian-web",
      });
      const session = await db("refresh_sessions")
        .where({ id: payload.sid })
        .whereNull("revoked_at")
        .where("expires_at", ">", new Date())
        .first();
      if (session) {
        req.user = await db("users").where({ id: session.user_id }).first();
        req.session = session;
      }
    } catch (err) {
      if (!err.code?.startsWith("ERR_J") && !err.code?.startsWith("ERR_JWT"))
        return next(err);
    }
  }
  // Expired access must not silently turn an authenticated cart into a guest cart.
  if (
    !req.user &&
    req.cookies.refresh_token &&
    (!req.path.startsWith("/auth/") || req.path === "/auth/password/change")
  ) {
    const refreshSession = await db("refresh_sessions")
      .where({ token_hash: hash(req.cookies.refresh_token) })
      .whereNull("revoked_at")
      .where("expires_at", ">", new Date())
      .first();
    check(
      !refreshSession,
      401,
      "ACCESS_EXPIRED",
      "Refresh your session to continue.",
    );
    // Ordinary API responses must not clear cookies from a newer sign-in.
    // Invalid cookies confer no access and expire or are replaced by auth.
  }
  if (!["/auth/refresh", "/auth/logout"].includes(req.path)) checkSessionIdentity(req);
  next();
}
export function requireUser(req, res, next) {
  check(req.user, 401, "LOGIN_REQUIRED", "Please sign in to continue.");
  check(!req.user.is_banned, 403, "BANNED", "This account is suspended.");
  next();
}
export function requireCustomer(req, res, next) {
  requireUser(req, res, () => {
    check(
      req.user.role === "CUSTOMER",
      403,
      "FORBIDDEN",
      "A customer account is required.",
    );
    next();
  });
}
export function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    check(
      req.user.role === "ADMIN",
      403,
      "FORBIDDEN",
      "Administrator access is required.",
    );
    next();
  });
}
async function setCookies(res, user, session, refresh) {
  const access = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer("obsidian")
    .setAudience("obsidian-web")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(jwtKey);
  res.cookie("access_token", access, { ...cookieOptions, maxAge: 15 * 60000 });
  res.cookie("refresh_token", refresh, {
    ...cookieOptions,
    maxAge: 14 * 86400000,
  });
}
// Existing accounts are locked before challenge or session rows. This matches
// Admin suspension and Google linking. Cart merging happens after commit.
function lockUser(tx, where) {
  return tx("users").where(where).forUpdate().first();
}
function liveSession(tx, where) {
  return tx("refresh_sessions")
    .where(where)
    .whereNull("revoked_at")
    .where("expires_at", ">", new Date())
    .forUpdate()
    .first();
}
async function createSession(user, tx) {
  check(!user.is_banned, 403, "BANNED", "This account is suspended.");
  const refresh = token();
  const [session] = await tx("refresh_sessions")
    .insert({
      user_id: user.id,
      token_hash: hash(refresh),
      expires_at: new Date(Date.now() + 14 * 86400000),
    })
    .returning("*");
  return { session, refresh };
}
async function signIn(req, res, user, { session, refresh }) {
  await setCookies(res, user, session, refresh);
  await mergeGuestCart(req, res, user);
  return self(user);
}
export function csrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  check(
    !origin || origin === new URL(baseUrl).origin,
    403,
    "CSRF",
    "Request origin is not allowed.",
  );
  const cookie = req.cookies.csrf_token;
  check(
    cookie &&
      equal(req.get("X-CSRF-Token"), cookie) &&
      equal(cookie.split(".")[1], keyedHash(cookie.split(".")[0])),
    403,
    "CSRF",
    "Please refresh the page and try again.",
  );
  next();
}
async function enqueue(tx, type, to, subject, textBody) {
  await tx("email_outbox").insert({
    type,
    payload: json({ to, subject, text: textBody }),
  });
}
async function sendOtp(user, tx) {
  const code = String(randomInt(100000, 1000000));
  await tx("login_otps")
    .where({ email: user.email })
    .whereNull("consumed_at")
    .update({ consumed_at: new Date() });
  await tx("login_otps").insert({
    email: user.email,
    code_hash: keyedHash(`${user.email}:${code}`),
    expires_at: new Date(Date.now() + 600000),
  });
  await enqueue(
    tx,
    "OTP",
    user.email,
    "Your Obsidian sign-in code",
    `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
  );
}
export function authRoutes(redis, limiter) {
  const router = Router();
  const google = googleConfig();
  router.get("/auth/csrf", (req, res) => {
    const raw = token();
    const csrfToken = `${raw}.${keyedHash(raw)}`;
    res.cookie("csrf_token", csrfToken, { ...cookieOptions, maxAge: 86400000 });
    ok(res, { csrfToken });
  });
  router.get("/auth/session", async (req, res) =>
    ok(res, {
      user: req.user && !req.user.is_banned ? await self(req.user) : null,
      refreshAvailable: !req.user && !!req.cookies.refresh_token,
      googleEnabled: !!google,
    }),
  );
  router.post("/auth/register", limiter("auth", 20, 60), async (req, res) => {
    const a = addressSchema.omit({ recipientName: true, phone: true });
    const body = z
      .object({ email, fullName: text(1, 120), shippingAddress: a })
      .strict()
      .parse(req.body);
    const user = await db.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [body.email]);
      const exists = await tx("users").where({ email: body.email }).first();
      check(
        !exists,
        409,
        "EMAIL_EXISTS",
        "This email already has an account. Please sign in.",
      );
      const [u] = await tx("users")
        .insert({ email: body.email, full_name: body.fullName })
        .returning("*");
      await tx("addresses").insert({
        ...addressDb({ ...body.shippingAddress, recipientName: body.fullName }),
        user_id: u.id,
        is_default: true,
      });
      await sendOtp(u, tx);
      return u;
    });
    ok(res, { user: await self(user), verificationRequired: true }, 201);
  });
  router.post(
    "/auth/login/request-code",
    limiter("auth", 20, 60),
    async (req, res) => {
      const b = z.object({ email }).strict().parse(req.body);
      await db.transaction(async (tx) => {
        const user = await lockUser(tx, { email: b.email });
        if (user && !user.is_banned) await sendOtp(user, tx);
      });
      ok(
        res,
        {
          message: "If this account is eligible, a sign-in code has been sent.",
        },
        202,
      );
    },
  );
  router.post(
    "/auth/login/verify-code",
    limiter("verify", 20, 60),
    async (req, res) => {
      const b = z
        .object({ email, code: z.string().regex(/^\d{6}$/) })
        .strict()
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        const account = await lockUser(tx, { email: b.email });
        if (!account) return null;
        const otp = await tx("login_otps")
          .where({ email: b.email })
          .whereNull("consumed_at")
          .orderBy("created_at", "desc")
          .forUpdate()
          .first();
        if (!otp || otp.attempts >= 5 || new Date(otp.expires_at) <= new Date())
          return null;
        await tx("login_otps").where({ id: otp.id }).increment("attempts", 1);
        if (!equal(otp.code_hash, keyedHash(`${b.email}:${b.code}`)))
          return null;
        check(!account.is_banned, 403, "BANNED", "This account is suspended.");
        await tx("login_otps")
          .where({ id: otp.id })
          .update({ consumed_at: new Date() });
        const [user] = await tx("users")
          .where({ id: account.id })
          .update({ email_verified: true })
          .returning("*");
        return { user, credentials: await createSession(user, tx) };
      });
      check(result, 401, "INVALID_CODE", "The code is invalid or expired.");
      ok(res, { user: await signIn(req, res, result.user, result.credentials) });
    },
  );
  router.post(
    "/auth/login/password",
    limiter("auth", 20, 60),
    async (req, res) => {
      const b = z
        .object({ email, password: z.string().min(1).max(128) })
        .strict()
        .parse(req.body);
      const u = await db("users").where({ email: b.email }).first();
      check(
        u?.password_hash && (await argon2.verify(u.password_hash, b.password)),
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
      const result = await db.transaction(async (tx) => {
        const user = await lockUser(tx, { id: u.id });
        check(
          user?.password_hash === u.password_hash,
          401,
          "INVALID_CREDENTIALS",
          "Email or password is incorrect.",
        );
        return { user, credentials: await createSession(user, tx) };
      });
      ok(res, { user: await signIn(req, res, result.user, result.credentials) });
    },
  );
  router.post("/auth/refresh", async (req, res) => {
    check(
      req.cookies.refresh_token,
      401,
      "SESSION_EXPIRED",
      "Please sign in again.",
    );
    const oldHash = hash(req.cookies.refresh_token),
      refresh = token();
    const result = await db.transaction(async (tx) => {
      const owner = await tx("refresh_sessions")
        .where({ token_hash: oldHash })
        .first("user_id");
      if (!owner) return null;
      const u = await lockUser(tx, { id: owner.user_id });
      if (!u || u.is_banned) return null;
      checkSessionIdentity(req, u);
      const s = await liveSession(tx, { token_hash: oldHash, user_id: u.id });
      if (!s) return null;
      await tx("refresh_sessions")
        .where({ id: s.id })
        .update({ previous_hash: oldHash, token_hash: hash(refresh) });
      return { s, u };
    });
    check(result, 401, "SESSION_EXPIRED", "Please sign in again.");
    await setCookies(res, result.u, result.s, refresh);
    ok(res, { user: await self(result.u) });
  });
  router.post("/auth/logout", async (req, res) => {
    let session = req.session;
    if (!session && req.cookies.refresh_token) {
      const refreshHash = hash(req.cookies.refresh_token);
      // A refresh in another tab may have rotated the cookie before logout
      // arrived. Only logout may resolve the immediately previous hash.
      session = await db("refresh_sessions")
        .where({ token_hash: refreshHash })
        .orWhere({ previous_hash: refreshHash })
        .first("id", "user_id");
    }
    if (session) {
      checkSessionIdentity(req, { id: session.user_id });
      await db.transaction(async (tx) => {
        await lockUser(tx, { id: session.user_id });
        await tx("refresh_sessions")
          .where({ id: session.id, user_id: session.user_id })
          .update({ revoked_at: new Date() });
      });
    }
    res
      .clearCookie("access_token", cookieOptions)
      .clearCookie("refresh_token", cookieOptions)
      .status(204)
      .end();
  });
  router.post("/auth/password/change", requireCustomer, async (req, res) => {
    const b = z
      .object({
        currentPassword: z.string().max(128).optional(),
        newPassword: password,
      })
      .strict()
      .parse(req.body);
    check(
      !req.user.password_hash ||
        (b.currentPassword &&
          (await argon2.verify(req.user.password_hash, b.currentPassword))),
      401,
      "INVALID_PASSWORD",
      "Current password is incorrect.",
    );
    const passwordHash = await argon2.hash(b.newPassword);
    await db.transaction(async (tx) => {
      const user = await lockUser(tx, { id: req.user.id });
      check(user, 401, "LOGIN_REQUIRED", "Please sign in to continue.");
      check(!user.is_banned, 403, "BANNED", "This account is suspended.");
      check(
        user.role === "CUSTOMER",
        403,
        "FORBIDDEN",
        "A customer account is required.",
      );
      const session = await liveSession(tx, {
        id: req.session.id,
        user_id: user.id,
      });
      check(session, 401, "SESSION_EXPIRED", "Please sign in again.");
      check(
        user.password_hash === req.user.password_hash,
        401,
        "INVALID_PASSWORD",
        "Current password is incorrect.",
      );
      if (!user.password_hash)
        check(
          user.email_verified &&
            Date.now() - new Date(session.created_at).getTime() < 15 * 60000,
          401,
          "REAUTH_REQUIRED",
          "Sign in with an email code or Google again before setting your password.",
        );
      await tx("users")
        .where({ id: req.user.id })
        .update({ password_hash: passwordHash });
      await tx("refresh_sessions")
        .where({ user_id: req.user.id })
        .whereNot({ id: req.session.id })
        .update({ revoked_at: new Date() });
    });
    res.status(204).end();
  });
  router.post(
    "/auth/password/recover/request",
    limiter("auth", 20, 60),
    async (req, res) => {
      const b = z.object({ email }).strict().parse(req.body);
      await db.transaction(async (tx) => {
        const u = await lockUser(tx, { email: b.email });
        if (u && !u.is_banned) {
          const t = token();
          await tx("password_reset_tokens")
            .where({ user_id: u.id })
            .whereNull("used_at")
            .update({ used_at: new Date() });
          await tx("password_reset_tokens").insert({
            user_id: u.id,
            token_hash: hash(t),
            expires_at: new Date(Date.now() + 30 * 60000),
          });
          await enqueue(
            tx,
            "RESET",
            u.email,
            "Reset your Obsidian password",
            `Reset your password within 30 minutes: ${baseUrl}/reset-password#token=${t}\nIgnore this message if you did not request it.`,
          );
        }
      });
      ok(
        res,
        {
          message:
            "If this account exists, password reset instructions have been sent.",
        },
        202,
      );
    },
  );
  router.post(
    "/auth/password/recover/confirm",
    limiter("auth", 20, 60),
    async (req, res) => {
      const b = z
        .object({ token: z.string().min(20).max(200), newPassword: password })
        .strict()
        .parse(req.body);
      const passwordHash = await argon2.hash(b.newPassword);
      await db.transaction(async (tx) => {
        const tokenHash = hash(b.token);
        const owner = await tx("password_reset_tokens")
          .where({ token_hash: tokenHash })
          .first("user_id");
        const u = owner && (await lockUser(tx, { id: owner.user_id }));
        check(u, 400, "INVALID_TOKEN", "This reset link is invalid or expired.");
        const t = await tx("password_reset_tokens")
          .where({ token_hash: tokenHash, user_id: u.id })
          .whereNull("used_at")
          .where("expires_at", ">", new Date())
          .forUpdate()
          .first();
        check(
          t,
          400,
          "INVALID_TOKEN",
          "This reset link is invalid or expired.",
        );
        check(!u.is_banned, 403, "BANNED", "This account is suspended.");
        await tx("users")
          .where({ id: t.user_id })
          .update({ password_hash: passwordHash, email_verified: true });
        await tx("password_reset_tokens")
          .where({ id: t.id })
          .update({ used_at: new Date() });
        await tx("refresh_sessions")
          .where({ user_id: t.user_id })
          .update({ revoked_at: new Date() });
      });
      res.status(204).end();
    },
  );
  router.get("/auth/google/start", limiter("google-start", 20, 60), async (req, res) => {
    check(
      google,
      503,
      "GOOGLE_NOT_CONFIGURED",
      "Google sign-in is not configured yet.",
    );
    const state = token(),
      nonce = token(),
      verifier = token(),
      binding = token();
    await redis.set(
      `oauth:${state}`,
      json({
        nonce,
        verifier,
        binding: hash(binding),
        returnTo: safeReturn(req.query.returnTo),
      }),
      "EX",
      600,
    );
    res.cookie("oauth_binding", binding, { ...cookieOptions, maxAge: 600000 });
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: Buffer.from(hash(verifier), "hex").toString("base64url"),
      code_challenge_method: "S256",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });
  router.get("/auth/google/callback", limiter("google-callback", 30, 60), async (req, res) => {
    check(
      typeof req.query.state === "string" &&
        typeof req.query.code === "string" &&
        req.query.code.length > 0,
      400,
      "OAUTH_FAILED",
      "Google sign-in was cancelled or invalid.",
    );
    // Finish from the same-origin SPA so session cookies use its cross-tab lock.
    res.set("Referrer-Policy", "no-referrer");
    res.redirect(`/oauth/google#${new URLSearchParams({ code: req.query.code, state: req.query.state })}`);
  });
  router.post("/auth/google/callback", limiter("google-complete", 30, 60), async (req, res) => {
    const { code, state: stateToken } = z.object({
      code: z.string().min(1).max(4096),
      state: z.string(),
    }).strict().parse(req.body);
    const binding = req.cookies.oauth_binding;
    check(
      oauthTokenPattern.test(stateToken) && typeof binding === "string",
      401,
      "OAUTH_STATE",
      "Google sign-in expired. Please try again.",
    );
    const key = `oauth:${stateToken}`;
    const raw = await redis.get(key);
    check(
      raw,
      401,
      "OAUTH_STATE",
      "Google sign-in expired. Please try again.",
    );
    const state = JSON.parse(raw);
    check(
      equal(state.binding, hash(binding)) && (await redis.getdel(key)),
      401,
      "OAUTH_STATE",
      "Google sign-in session does not match.",
    );
    res.clearCookie("oauth_binding", cookieOptions);
    check(
      google,
      503,
      "GOOGLE_NOT_CONFIGURED",
      "Google sign-in is not configured yet.",
    );
    const profile = await googleIdentity(
      google,
      code,
      state.verifier,
      state.nonce,
    );
    const { user, credentials } = await db.transaction(async (tx) => {
      await tx.raw(
        "SELECT pg_advisory_xact_lock(hashtext('google-auth-subject'), hashtext(?))",
        [profile.sub],
      );
      const identity = await tx("auth_identities")
        .where({ provider: "google", provider_subject: profile.sub })
        .first();
      if (!identity)
        await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
          profile.email,
        ]);
      let user = await lockUser(
        tx,
        identity ? { id: identity.user_id } : { email: profile.email },
      );
      check(
        !user || user.role === "CUSTOMER",
        403,
        "CUSTOMER_REQUIRED",
        "Use the administrator password to sign in.",
      );
      check(!user?.is_banned, 403, "BANNED", "This account is suspended.");
      if (!identity) {
        const otherIdentity =
          user &&
          (await tx("auth_identities")
            .where({ user_id: user.id, provider: "google" })
            .first());
        check(
          !otherIdentity,
          409,
          "GOOGLE_ALREADY_LINKED",
          "Sign in with the Google account already linked or use an email code.",
        );
        const authoritativeEmail =
          profile.email.endsWith("@gmail.com") || !!profile.hd;
        if (!authoritativeEmail) {
          const session =
            user?.email_verified && user.id === req.user?.id && req.session
              ? await liveSession(tx, { id: req.session.id, user_id: user.id })
              : null;
          check(
            session,
            403,
            "GOOGLE_EMAIL_PROOF_REQUIRED",
            "Sign in with an email code for this address before linking Google. Register first if you do not have an account.",
          );
        }
        if (!user)
          [user] = await tx("users")
            .insert({
              email: profile.email,
              full_name: profile.name?.trim().slice(0, 120) || profile.email,
              email_verified: true,
            })
            .returning("*");
        else if (!user.email_verified)
          [user] = await tx("users")
            .where({ id: user.id })
            .update({ email_verified: true })
            .returning("*");
        await tx("auth_identities").insert({
          user_id: user.id,
          provider: "google",
          provider_subject: profile.sub,
        });
      }
      return { user, credentials: await createSession(user, tx) };
    });
    await signIn(req, res, user, credentials);
    const hasAddress = await db("addresses").where({ user_id: user.id }).first();
    ok(res, { returnTo: hasAddress ? state.returnTo : "/account/addresses?welcome=1" });
  });
  router.get("/me", requireCustomer, async (req, res) =>
    ok(res, await self(req.user)),
  );
  router.patch("/me", requireCustomer, async (req, res) => {
    const b = z
      .object({ fullName: text(1, 120) })
      .strict()
      .parse(req.body);
    const [u] = await db("users")
      .where({ id: req.user.id })
      .update({ full_name: b.fullName })
      .returning("*");
    ok(res, await self(u));
  });
  router.get("/me/addresses", requireCustomer, async (req, res) =>
    ok(
      res,
      camel(
        await db("addresses")
          .where({ user_id: req.user.id })
          .orderBy("is_default", "desc")
          .orderBy("created_at"),
      ),
    ),
  );
  router.post("/me/addresses", requireCustomer, async (req, res) => {
    const b = addressSchema
      .extend({ isDefault: z.boolean().optional() })
      .parse(req.body);
    const a = await db.transaction(async (tx) => {
      await tx("users").where({ id: req.user.id }).forUpdate().first();
      const existing = await tx("addresses")
        .where({ user_id: req.user.id })
        .first();
      const makeDefault = b.isDefault || !existing;
      if (makeDefault)
        await tx("addresses")
          .where({ user_id: req.user.id })
          .update({ is_default: false });
      const [a] = await tx("addresses")
        .insert({
          ...addressDb(b),
          user_id: req.user.id,
          is_default: !!makeDefault,
        })
        .returning("*");
      return a;
    });
    ok(res, camel(a), 201);
  });
  router.patch(
    "/me/addresses/:addressId",
    requireCustomer,
    async (req, res) => {
      z.uuid().parse(req.params.addressId);
      const b = addressSchema
        .extend({ isDefault: z.boolean().optional() })
        .partial()
        .parse(req.body);
      const a = await db.transaction(async (tx) => {
        await tx("users").where({ id: req.user.id }).forUpdate().first();
        const old = await tx("addresses")
          .where({ id: req.params.addressId, user_id: req.user.id })
          .first();
        check(old, 404, "NOT_FOUND", "Address not found.");
        if (b.isDefault)
          await tx("addresses")
            .where({ user_id: req.user.id })
            .update({ is_default: false });
        const combined = { ...camel(old), ...b };
        const [a] = await tx("addresses")
          .where({ id: old.id })
          .update({
            ...addressDb(combined),
            is_default: b.isDefault ?? old.is_default,
          })
          .returning("*");
        if (
          !(await tx("addresses")
            .where({ user_id: req.user.id, is_default: true })
            .first())
        ) {
          await tx("addresses")
            .where({ id: a.id })
            .update({ is_default: true });
          a.is_default = true;
        }
        return a;
      });
      ok(res, camel(a));
    },
  );
  router.delete(
    "/me/addresses/:addressId",
    requireCustomer,
    async (req, res) => {
      z.uuid().parse(req.params.addressId);
      await db.transaction(async (tx) => {
        await tx("users").where({ id: req.user.id }).forUpdate().first();
        const [a] = await tx("addresses")
          .where({ id: req.params.addressId, user_id: req.user.id })
          .delete()
          .returning("*");
        check(a, 404, "NOT_FOUND", "Address not found.");
        if (a.is_default) {
          const next = await tx("addresses")
            .where({ user_id: req.user.id })
            .orderBy("created_at")
            .first();
          if (next)
            await tx("addresses")
              .where({ id: next.id })
              .update({ is_default: true });
        }
      });
      res.status(204).end();
    },
  );
  router.get("/me/loyalty", requireCustomer, async (req, res) => {
    const { page, pageSize } = paging(req.query, 20);
    const { count } = await db("loyalty_ledger")
      .where({ user_id: req.user.id })
      .count()
      .first();
    const entries = await db("loyalty_ledger")
      .where({ user_id: req.user.id })
      .orderBy("created_at", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    res.json({
      data: {
        balancePoints: req.user.points_balance,
        pointValueVnd: 1000,
        entries: camel(entries),
      },
      meta: meta(page, pageSize, count),
    });
  });
  return router;
}
