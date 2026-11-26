import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import Redis from "ioredis";
import { ZodError } from "zod";
import { db } from "./db.js";
import { authenticate, csrf, authRoutes, requireCustomer } from "./auth.js";
import { catalog, reviewRoutes } from "./catalog.js";
import { shopRoutes } from "./orders.js";
import { admin } from "./admin.js";
import { id, AppError } from "./lib.js";
import { productEventsChannel } from "./product-events.js";
import { startProductSearchSync } from "./product-search.js";
const app = express(),
  server = http.createServer(app),
  redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const publisher = redis.duplicate({
  enableOfflineQueue: false,
  autoResendUnfulfilledCommands: false,
  maxRetriesPerRequest: 0,
  commandTimeout: 1000,
});

function publishProductEvent(event, payload) {
  void publisher.publish(productEventsChannel, JSON.stringify({ event, payload }))
    .catch(() => console.warn("Could not publish product update."));
}
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
      useDefaults: true,
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res
    .set("X-Request-Id", req.requestId)
    .set("X-Instance-Id", process.env.INSTANCE_ID || "local");
  next();
});
app.use(
  "/media",
  express.static(process.env.MEDIA_DIR || path.resolve("media"), {
    dotfiles: "deny",
  }),
);
app.use(express.json({ limit: "200kb" }), cookieParser());
export function limiter(scope, max, seconds) {
  return async (req, res, next) => {
    const key = `rate:${scope}:${req.ip}`;
    const count = await redis.eval(
      "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]);end;return n",
      1,
      key,
      seconds,
    );
    if (count > max) {
      res.set("Retry-After", String(seconds));
      throw new AppError(
        429,
        "RATE_LIMIT",
        "Too many attempts. Please try again shortly.",
      );
    }
    next();
  };
}
app.get("/api/v1/health", async (req, res) => {
  await db.raw("SELECT 1");
  await redis.ping();
  res.json({
    data: {
      status: "ok",
      instanceId: process.env.INSTANCE_ID || "local",
      db: "up",
      redis: "up",
    },
  });
});
app.get("/internal/realtime/products/:productId", async (req, res) => {
  const productId = id.safeParse(req.params.productId);
  const product = productId.success &&
    await db("products").where({ id: productId.data, is_active: true }).first("id");
  res.status(product ? 204 : 404).end();
});
app.use(
  "/api/v1",
  authenticate,
  csrf,
  (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
  authRoutes(redis, limiter),
);
reviewRoutes(requireCustomer, limiter, publishProductEvent);
app.use("/api/v1", catalog, shopRoutes(limiter));
app.use("/api/v1/admin", admin);
app.use((req, res) =>
  res
    .status(404)
    .json({
      error: {
        code: "NOT_FOUND",
        message: "This endpoint does not exist.",
        requestId: req.requestId,
      },
    }),
);
app.use((err, req, res, next) => {
  let status = err.status || 500,
    code = err.code || "INTERNAL_ERROR",
    message =
      status === 500 ? "Something went wrong. Please try again." : err.message,
    details = err.details;
  if (err instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Please check the highlighted fields.";
    details = err.issues.map((i) => ({
      field: i.path.join("."),
      reason: i.message,
    }));
  } else if (err.code === "23505") {
    status = 409;
    code = "ALREADY_EXISTS";
    message = "This email, SKU, slug or code is already in use.";
  } else if (
    err.code === "23514" ||
    err.code === "23503" ||
    err.code === "22P02"
  ) {
    status = 400;
    code = "INVALID_DATA";
    message = "Some values are invalid or still in use.";
  } else if (err.code === "LIMIT_FILE_SIZE") {
    status = 400;
    code = "IMAGE_TOO_LARGE";
    message = "Images must be smaller than 5 MB.";
  }
  if (status >= 500)
    console.error(
      JSON.stringify({
        requestId: req.requestId,
        error: err.message,
        code: err.code,
      }),
    );
  res
    .status(status)
    .json({ error: { code, message, details, requestId: req.requestId } });
});
const stopProductSearchSync = startProductSearchSync();
server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(
    `Obsidian API listening on ${process.env.PORT || 3000} (${process.env.INSTANCE_ID || "local"})`,
  ),
);
async function shutdown() {
  server.close();
  publisher.disconnect();
  await redis.quit();
  await stopProductSearchSync();
  await db.destroy();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
