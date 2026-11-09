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
    !req.path.startsWith("/auth/")
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
    res.clearCookie("access_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);
  }
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
async function signIn(req, res, user) {
  check(!user.is_banned, 403, "BANNED", "This account is suspended.");
  const refresh = token();
  const [session] = await db("refresh_sessions")
    .insert({
      user_id: user.id,
      token_hash: hash(refresh),
      expires_at: new Date(Date.now() + 14 * 86400000),
    })
    .returning("*");
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
async function sendOtp(user, tx = db) {
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
      googleEnabled: !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
    }),
  );
  router.post("/auth/register", limiter("auth", 20, 60), async (req, res) => {
    const a = addressSchema.omit({ recipientName: true, phone: true });
    const body = z
      .object({ email, fullName: text(1, 120), shippingAddress: a })
      .strict()
      .parse(req.body);
    const user = await db.transaction(async (tx) => {
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
      const u = await db("users")
        .where({ email: b.email, is_banned: false })
        .first();
      if (u) await db.transaction((tx) => sendOtp(u, tx));
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
      const u = await db.transaction(async (tx) => {
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
        await tx("login_otps")
          .where({ id: otp.id })
          .update({ consumed_at: new Date() });
        const [user] = await tx("users")
          .where({ email: b.email })
          .update({ email_verified: true })
          .returning("*");
        return user;
      });
      check(u, 401, "INVALID_CODE", "The code is invalid or expired.");
      ok(res, { user: await signIn(req, res, u) });
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
      ok(res, { user: await signIn(req, res, u) });
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
      const s = await tx("refresh_sessions")
        .where({ token_hash: oldHash })
        .forUpdate()
        .first();
      if (!s || s.revoked_at || new Date(s.expires_at) < new Date())
        return null;
      const u = await tx("users").where({ id: s.user_id }).first();
      if (u.is_banned) return null;
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
    if (req.session)
      await db("refresh_sessions")
        .where({ id: req.session.id })
        .update({ revoked_at: new Date() });
    else if (req.cookies.refresh_token)
      await db("refresh_sessions")
        .where({ token_hash: hash(req.cookies.refresh_token) })
        .update({ revoked_at: new Date() });
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
    if (req.user.password_hash)
      check(
        b.currentPassword &&
          (await argon2.verify(req.user.password_hash, b.currentPassword)),
        401,
        "INVALID_PASSWORD",
        "Current password is incorrect.",
      );
    else
      check(
        req.user.email_verified &&
          Date.now() - new Date(req.session.created_at).getTime() < 15 * 60000,
        401,
        "REAUTH_REQUIRED",
        "Sign in with an email code or Google again before setting your password.",
      );
    const passwordHash = await argon2.hash(b.newPassword);
    await db.transaction(async (tx) => {
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
      const u = await db("users")
        .where({ email: b.email, is_banned: false })
        .first();
      if (u) {
        const t = token();
        await db.transaction(async (tx) => {
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
            `Reset your password within 30 minutes: ${baseUrl}/reset-password?token=${t}\nIgnore this message if you did not request it.`,
          );
        });
      }
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
        const t = await tx("password_reset_tokens")
          .where({ token_hash: hash(b.token) })
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
        const u = await tx("users").where({ id: t.user_id }).first();
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
  router.get("/auth/google/start", async (req, res) => {
    check(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
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
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri:
        process.env.GOOGLE_CALLBACK_URL ||
        `${baseUrl}/api/v1/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: Buffer.from(hash(verifier), "hex").toString("base64url"),
      code_challenge_method: "S256",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });
  router.get("/auth/google/callback", async (req, res) => {
    check(
      typeof req.query.state === "string" && typeof req.query.code === "string",
      400,
      "OAUTH_FAILED",
      "Google sign-in was cancelled or invalid.",
    );
    const raw = await redis.getdel(`oauth:${req.query.state}`);
    check(
      raw && req.cookies.oauth_binding,
      401,
      "OAUTH_STATE",
      "Google sign-in expired. Please try again.",
    );
    const state = JSON.parse(raw);
    check(
      equal(state.binding, hash(req.cookies.oauth_binding)),
      401,
      "OAUTH_STATE",
      "Google sign-in session does not match.",
    );
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:
          process.env.GOOGLE_CALLBACK_URL ||
          `${baseUrl}/api/v1/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: state.verifier,
      }),
    });
    check(
      response.ok,
      401,
      "OAUTH_FAILED",
      "Google could not verify this sign-in.",
    );
    const tokens = await response.json();
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    check(
      p.email_verified && p.nonce === state.nonce,
      401,
      "OAUTH_IDENTITY",
      "Google email is not verified.",
    );
    const u = await db.transaction(async (tx) => {
      const identity = await tx("auth_identities")
        .where({ provider: "google", provider_subject: p.sub })
        .first();
      if (identity) return tx("users").where({ id: identity.user_id }).first();
      await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
        p.email.toLowerCase(),
      ]);
      let user = await tx("users")
        .where({ email: p.email.toLowerCase() })
        .first();
      check(
        !user || user.role === "CUSTOMER",
        403,
        "CUSTOMER_REQUIRED",
        "Use the administrator password to sign in.",
      );
      if (!user)
        [user] = await tx("users")
          .insert({
            email: p.email.toLowerCase(),
            full_name: p.name || p.email,
            email_verified: true,
          })
          .returning("*");
      else
        [user] = await tx("users")
          .where({ id: user.id })
          .update({ email_verified: true })
          .returning("*");
      await tx("auth_identities").insert({
        user_id: user.id,
        provider: "google",
        provider_subject: p.sub,
      });
      return user;
    });
    await signIn(req, res, u);
    res.clearCookie("oauth_binding", cookieOptions);
    const hasAddress = await db("addresses").where({ user_id: u.id }).first();
    res.redirect(hasAddress ? state.returnTo : "/account/addresses?welcome=1");
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
