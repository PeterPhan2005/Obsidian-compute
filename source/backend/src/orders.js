import { Router } from "express";
import { z } from "zod";
import { db, camel, json } from "./db.js";
import {
  check,
  id,
  text,
  email,
  addressSchema,
  paging,
  meta,
  ok,
  hash,
  keyedHash,
} from "./lib.js";
import { resolveCart, cartDto } from "./cart-service.js";
import { quoteTotals } from "./pricing.js";
import { requireCustomer } from "./auth.js";
export async function orderDto(row, conn = db, admin = false) {
  const [items, history] = await Promise.all([
    conn("order_items").where({ order_id: row.id }).orderBy("id"),
    conn("order_status_history")
      .where({ order_id: row.id })
      .orderBy("changed_at", "desc"),
  ]);
  const result = {
    ...camel(row),
    shippingAddress: row.shipping_snapshot,
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      variantId: i.variant_id,
      name: i.name_snapshot,
      sku: i.sku_snapshot,
      attributes: i.attributes_snapshot,
      imageUrl: i.image_url,
      thumbnailUrl: i.image_url,
      unitPriceVnd: i.unit_price_vnd,
      quantity: i.quantity,
      lineTotalVnd: i.line_total_vnd,
      ...(admin ? { unitCostVnd: i.unit_cost_vnd } : {}),
    })),
    statusHistory: camel(history),
    couponApplied: !!row.coupon_code,
  };
  delete result.shippingSnapshot;
  if (!admin) delete result.paymentReference;
  return result;
}
export async function listOrders(query, filter, conn = db, admin = false) {
  const { page, pageSize } = paging(query, admin ? 20 : 10);
  const q = conn("orders");
  if (filter) filter(q);
  if (query.status)
    q.where(
      "status",
      z
        .enum(["pending", "confirmed", "shipping", "delivered"])
        .parse(query.status),
    );
  const { count } = await q.clone().count().first();
  const rows = await q
    .orderBy("created_at", "desc")
    .orderBy("id")
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    data: await Promise.all(rows.map((o) => orderDto(o, conn, admin))),
    meta: meta(page, pageSize, count),
  };
}
const couponInput = z
  .string()
  .trim()
  .max(80)
  .transform((v) => v.toUpperCase())
  .optional();
const quoteSchema = z
  .object({
    shippingAddress: addressSchema.optional(),
    addressId: id.optional().nullable(),
    couponCode: couponInput,
    pointsToRedeem: z.number().int().min(0).default(0),
  })
  .strict()
  .refine((b) => !(b.shippingAddress && b.addressId), {
    message: "Choose a saved address or enter a new one.",
  });
const orderSchema = z
  .object({
    buyer: z
      .object({ fullName: text(1, 120), email })
      .strict()
      .optional(),
    shippingAddress: addressSchema.optional(),
    addressId: id.optional().nullable(),
    couponCode: couponInput,
    pointsToRedeem: z.number().int().min(0).default(0),
    paymentMethod: z.literal("DEMO"),
    demoPaymentOutcome: z.enum(["success", "failure"]).default("success"),
  })
  .strict()
  .refine((b) => !!b.shippingAddress !== !!b.addressId, {
    message: "Choose exactly one shipping address.",
  });
async function couponQuote(code, conn = db) {
  if (!code) return null;
  const coupon = /^[A-Z0-9]{5}$/.test(code)
    ? await conn("coupons").where({ code }).first()
    : null;
  return coupon;
}
export function shopRoutes(limiter) {
  const router = Router();
  router.get("/cart", async (req, res) =>
    ok(res, await cartDto(await resolveCart(req, res))),
  );
  router.post("/cart/items", async (req, res) => {
    const b = z
      .object({ variantId: id, quantity: z.number().int().min(1).max(999) })
      .strict()
      .parse(req.body);
    const cart = await resolveCart(req, res);
    await db.transaction(async (tx) => {
      await tx("carts").where({ id: cart.id }).forUpdate().first();
      const v = await tx("product_variants as v")
        .join("products as p", "p.id", "v.product_id")
        .where("v.id", b.variantId)
        .where("v.is_active", true)
        .where("p.is_active", true)
        .select("v.*")
        .first();
      check(v, 404, "NOT_FOUND", "Variant not available.");
      const old = await tx("cart_items")
        .where({ cart_id: cart.id, variant_id: b.variantId })
        .first();
      const quantity = (old?.quantity || 0) + b.quantity;
      check(
        quantity <= v.stock && quantity <= 999,
        409,
        "INSUFFICIENT_STOCK",
        `Only ${v.stock} available.`,
      );
      await tx("cart_items")
        .insert({ cart_id: cart.id, variant_id: b.variantId, quantity })
        .onConflict(["cart_id", "variant_id"])
        .merge({ quantity });
    });
    ok(res, await cartDto(cart));
  });
  router.patch("/cart/items/:itemId", async (req, res) => {
    id.parse(req.params.itemId);
    const b = z
      .object({ quantity: z.number().int().min(1).max(999) })
      .strict()
      .parse(req.body);
    const cart = await resolveCart(req, res);
    await db.transaction(async (tx) => {
      await tx("carts").where({ id: cart.id }).forUpdate().first();
      const item = await tx("cart_items")
        .where({ id: req.params.itemId, cart_id: cart.id })
        .first();
      check(item, 404, "NOT_FOUND", "Cart item not found.");
      const v = await tx("product_variants")
        .where({ id: item.variant_id })
        .first();
      check(
        v.is_active && b.quantity <= v.stock,
        409,
        "INSUFFICIENT_STOCK",
        `Only ${v.stock} available.`,
      );
      await tx("cart_items")
        .where({ id: item.id })
        .update({ quantity: b.quantity });
    });
    ok(res, await cartDto(cart));
  });
  router.delete("/cart/items/:itemId", async (req, res) => {
    id.parse(req.params.itemId);
    const cart = await resolveCart(req, res);
    await db.transaction(async (tx) => {
      await tx("carts").where({ id: cart.id }).forUpdate().first();
      check(
        await tx("cart_items")
          .where({ id: req.params.itemId, cart_id: cart.id })
          .delete(),
        404,
        "NOT_FOUND",
        "Cart item not found.",
      );
    });
    ok(res, await cartDto(cart));
  });
  router.post("/checkout/quote", async (req, res) => {
    const b = quoteSchema.parse(req.body);
    if (b.addressId)
      check(
        req.user &&
          (await db("addresses")
            .where({ id: b.addressId, user_id: req.user.id })
            .first()),
        404,
        "NOT_FOUND",
        "Address not found.",
      );
    const cart = await cartDto(await resolveCart(req, res));
    const coupon = await couponQuote(b.couponCode);
    const totals = quoteTotals({
      subtotalVnd: cart.subtotalVnd,
      coupon,
      balancePoints: req.user?.points_balance || 0,
      pointsToRedeem: b.pointsToRedeem,
      hasItems: !!cart.items.length,
    });
    ok(res, {
      cart,
      ...totals,
      coupon: b.couponCode
        ? {
            code: b.couponCode,
            valid: !!coupon && coupon.used_count < coupon.usage_limit,
            message: !coupon
              ? "Code not found."
              : coupon.used_count >= coupon.usage_limit
                ? "This code has been fully used."
                : "Discount applied.",
            discountVnd: totals.couponDiscountVnd,
            remainingUses: coupon ? coupon.usage_limit - coupon.used_count : 0,
          }
        : null,
    });
  });
  router.post(
    "/checkout/orders",
    limiter("checkout", 30, 60),
    async (req, res) => {
      check(
        process.env.DEMO_PAYMENT_ENABLED === "true",
        503,
        "PAYMENT_UNAVAILABLE",
        "Sandbox payments are disabled.",
      );
      const b = orderSchema.parse(req.body),
        key = id.parse(req.get("Idempotency-Key"));
      const cart = await resolveCart(req, res);
      const requestHash = hash(JSON.stringify(b));
      const result = await db.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
          `checkout:${key}`,
        ]);
        await tx("carts").where({ id: cart.id }).forUpdate().first();
        const previous = await tx("checkout_idempotency")
          .where({ key })
          .first();
        if (previous) {
          check(
            previous.cart_id === cart.id &&
              previous.request_hash === requestHash,
            409,
            "IDEMPOTENCY_CONFLICT",
            "This checkout key was already used for a different request.",
          );
          const row = await tx("orders")
            .where({ id: previous.order_id })
            .first();
          return {
            order: await orderDto(row, tx),
            receiptToken: keyedHash(`receipt:${key}:${row.id}`),
          };
        }
        let shippingAddress = b.shippingAddress;
        if (b.addressId) {
          check(
            req.user,
            401,
            "LOGIN_REQUIRED",
            "Sign in to use a saved address.",
          );
          const a = await tx("addresses")
            .where({ id: b.addressId, user_id: req.user.id })
            .first();
          check(a, 404, "NOT_FOUND", "Address not found.");
          shippingAddress = camel(a);
          delete shippingAddress.userId;
        }
        check(
          shippingAddress.phone?.trim(),
          400,
          "PHONE_REQUIRED",
          "A delivery phone number is required.",
        );
        const buyer = req.user
          ? { email: req.user.email, fullName: req.user.full_name }
          : b.buyer;
        check(buyer, 400, "BUYER_REQUIRED", "Enter your name and email.");
        const lines = await tx("cart_items")
          .where({ cart_id: cart.id })
          .orderBy("variant_id");
        check(lines.length, 400, "EMPTY_CART", "Your bag is empty.");
        const variants = await tx("product_variants")
          .whereIn(
            "id",
            lines.map((i) => i.variant_id),
          )
          .orderBy("id")
          .forUpdate();
        const snapshots = [];
        for (const line of lines) {
          const v = variants.find((v) => v.id === line.variant_id);
          const p = await tx("products").where({ id: v.product_id }).first();
          check(
            v.is_active && p.is_active && v.stock >= line.quantity,
            409,
            "INSUFFICIENT_STOCK",
            `${p.name}: only ${v.stock} available.`,
          );
          const category = await tx("categories")
            .where({ id: p.category_id })
            .first();
          const image = await tx("product_images")
            .where({ product_id: p.id })
            .orderBy("sort_order")
            .first();
          snapshots.push({
            product_id: p.id,
            variant_id: v.id,
            name_snapshot: p.name,
            sku_snapshot: v.sku,
            attributes_snapshot: json(v.attributes),
            image_url: image?.url,
            unit_price_vnd: v.price_vnd,
            unit_cost_vnd: v.cost_price_vnd,
            quantity: line.quantity,
            line_total_vnd: v.price_vnd * line.quantity,
            category_name_snapshot: category.name,
          });
        }
        await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
          buyer.email,
        ]);
        let user = await tx("users")
          .where({ email: buyer.email })
          .forUpdate()
          .first();
        if (!user)
          [user] = await tx("users")
            .insert({ email: buyer.email, full_name: buyer.fullName })
            .returning("*");
        check(
          !user.is_banned && user.role === "CUSTOMER",
          403,
          "ACCOUNT_UNAVAILABLE",
          "This email cannot be used for checkout.",
        );
        check(
          req.user || b.pointsToRedeem === 0,
          401,
          "LOGIN_REQUIRED",
          "Sign in to use your points.",
        );
        const coupon = b.couponCode
          ? await tx("coupons")
              .where({ code: b.couponCode })
              .forUpdate()
              .first()
          : null;
        if (b.couponCode)
          check(
            coupon && coupon.used_count < coupon.usage_limit,
            422,
            "INVALID_COUPON",
            "This discount code is invalid or exhausted.",
          );
        const totals = quoteTotals({
          subtotalVnd: snapshots.reduce((s, i) => s + i.line_total_vnd, 0),
          coupon,
          balancePoints: req.user ? user.points_balance : 0,
          pointsToRedeem: b.pointsToRedeem,
        });
        check(
          b.demoPaymentOutcome === "success",
          402,
          "PAYMENT_FAILED",
          "Sandbox payment declined. No money or points were taken.",
        );
        const reference = `sandbox_${key}`;
        await tx("payment_attempts").insert({
          checkout_key: key,
          user_id: user.id,
          status: "SUCCEEDED",
          provider_reference: reference,
          amount_vnd: totals.totalPayableVnd,
        });
        const [order] = await tx("orders")
          .insert({
            user_id: user.id,
            buyer_name: buyer.fullName,
            buyer_email: buyer.email,
            shipping_snapshot: json(shippingAddress),
            subtotal_vnd: totals.subtotalVnd,
            tax_vnd: totals.taxVnd,
            shipping_fee_vnd: totals.shippingFeeVnd,
            coupon_code: coupon?.code || null,
            coupon_discount_vnd: totals.couponDiscountVnd,
            points_redeemed: b.pointsToRedeem,
            points_discount_vnd: totals.pointsDiscountVnd,
            total_paid_vnd: totals.totalPayableVnd,
            points_earned: totals.estimatedEarnedPoints,
            payment_reference: reference,
          })
          .returning("*");
        await tx("order_items").insert(
          snapshots.map((i) => ({ ...i, order_id: order.id })),
        );
        for (const line of lines)
          await tx("product_variants")
            .where({ id: line.variant_id })
            .decrement("stock", line.quantity);
        if (coupon) {
          await tx("coupons")
            .where({ code: coupon.code })
            .increment("used_count", 1);
          await tx("coupon_redemptions").insert({
            coupon_code: coupon.code,
            order_id: order.id,
            discount_applied_vnd: totals.couponDiscountVnd,
          });
        }
        if (b.pointsToRedeem)
          await tx("loyalty_ledger").insert({
            user_id: user.id,
            order_id: order.id,
            type: "REDEEM",
            points_delta: -b.pointsToRedeem,
          });
        await tx("loyalty_ledger").insert({
          user_id: user.id,
          order_id: order.id,
          type: "EARN",
          points_delta: totals.estimatedEarnedPoints,
        });
        await tx("users")
          .where({ id: user.id })
          .update({
            points_balance:
              user.points_balance -
              b.pointsToRedeem +
              totals.estimatedEarnedPoints,
          });
        await tx("order_status_history").insert({
          order_id: order.id,
          status: "pending",
          changed_by: "system",
        });
        await tx("cart_items").where({ cart_id: cart.id }).delete();
        await tx("checkout_idempotency").insert({
          key,
          cart_id: cart.id,
          request_hash: requestHash,
          order_id: order.id,
        });
        const receiptToken = keyedHash(`receipt:${key}:${order.id}`);
        await tx("receipt_tokens").insert({
          order_id: order.id,
          token_hash: hash(receiptToken),
          expires_at: new Date(Date.now() + 86400000),
        });
        const dto = await orderDto(order, tx);
        await tx("email_outbox").insert({
          type: "ORDER_CONFIRMATION",
          order_id: order.id,
          payload: json({ to: buyer.email, order: dto }),
        });
        return { order: dto, receiptToken };
      });
      ok(res, result, 201);
    },
  );
  router.get("/checkout/receipts/:token", async (req, res) => {
    check(
      /^[a-f0-9]{64}$/.test(req.params.token),
      404,
      "NOT_FOUND",
      "Receipt not found.",
    );
    const t = await db("receipt_tokens")
      .where({ token_hash: hash(req.params.token) })
      .where("expires_at", ">", new Date())
      .first();
    check(
      t,
      404,
      "NOT_FOUND",
      "Receipt expired. Sign in to view your order history.",
    );
    res.set("Cache-Control", "no-store");
    ok(
      res,
      await orderDto(await db("orders").where({ id: t.order_id }).first()),
    );
  });
  router.get("/me/orders", requireCustomer, async (req, res) =>
    res.json(
      await listOrders(req.query, (q) => q.where("user_id", req.user.id)),
    ),
  );
  router.get("/me/orders/:orderId", requireCustomer, async (req, res) => {
    id.parse(req.params.orderId);
    const o = await db("orders")
      .where({ id: req.params.orderId, user_id: req.user.id })
      .first();
    check(o, 404, "NOT_FOUND", "Order not found.");
    ok(res, await orderDto(o));
  });
  return router;
}
