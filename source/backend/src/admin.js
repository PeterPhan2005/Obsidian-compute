import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import sharp from "sharp";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, camel, json } from "./db.js";
import { check, id, text, money, ok, paging, meta } from "./lib.js";
import { requireAdmin } from "./auth.js";
import { listProducts, getProduct } from "./catalog.js";
import { listOrders, orderDto } from "./orders.js";
import { analytics, summary, timeRange } from "./analytics.js";
const mediaDir = process.env.MEDIA_DIR || path.resolve("media");
const categoryNames = {
  laptop: "Laptops",
  desktop: "Desktop PCs",
  monitor: "Monitors",
  gpu: "Graphics cards",
  ram: "Memory",
  ssd: "Storage",
  cpu: "Processors",
  motherboard: "Motherboards",
};
const variantSchema = z
  .object({
    id: id.optional(),
    sku: text(1, 80),
    attributes: z
      .record(z.string().max(50), text(1, 120))
      .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 10),
    priceVnd: money,
    costPriceVnd: money,
    stock: z.number().int().min(0).max(1000000),
    isActive: z.boolean().optional(),
  })
  .strip();
const productSchema = z
  .object({
    name: text(2, 150),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(180),
    brand: text(1, 80),
    categoryId: id,
    shortDescription: text(5, 500),
    descriptionLines: z.array(text(2, 500)).min(5).max(30),
    tags: z.array(text(1, 40)).max(15),
    images: z
      .array(
        z.object({
          url: z
            .string()
            .regex(
              /^\/media\/(catalog|uploads)\/[a-zA-Z0-9_-]+\.(webp|png|jpg|jpeg)$/,
            ),
          alt: text(0, 300).optional(),
          sortOrder: z.number().int().optional(),
        }),
      )
      .min(3)
      .max(12),
    variants: z.array(variantSchema).min(2).max(30),
    isActive: z.boolean().optional(),
  })
  .strict();
export const admin = Router();
admin.use(requireAdmin);
admin.get("/dashboard/summary", async (req, res) =>
  ok(
    res,
    await summary(
      z.coerce
        .number()
        .int()
        .min(1)
        .max(365)
        .parse(req.query.newUsersWindowDays || 30),
    ),
  ),
);
admin.get("/dashboard/analytics", async (req, res) =>
  ok(res, await analytics(req.query)),
);
admin.get("/products", async (req, res) =>
  res.json(await listProducts(req.query, true)),
);
admin.get("/products/:productId", async (req, res) =>
  ok(res, await getProduct(id.parse(req.params.productId), db, true)),
);
async function saveProduct(req, res, update = false) {
  const productId = update ? id.parse(req.params.productId) : randomUUID();
  let input = req.body;
  if (update) {
    const p = await getProduct(productId, db, true);
    input = {
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      categoryId: p.category.id,
      shortDescription: p.shortDescription,
      descriptionLines: p.descriptionLines,
      tags: p.tags,
      images: p.imageDetails.map((i) => ({
        url: i.url,
        alt: i.alt,
        sortOrder: i.sortOrder,
      })),
      variants: p.variants,
      isActive: p.isActive,
      ...req.body,
    };
  }
  const b = productSchema.parse(input);
  check(
    b.variants.filter((v) => v.isActive !== false).length >= 2,
    400,
    "VARIANTS_REQUIRED",
    "At least two active variants are required.",
  );
  check(
    new Set(b.images.map((i) => i.url)).size >= 3,
    400,
    "IMAGES_REQUIRED",
    "Use at least three distinct images.",
  );
  check(
    new Set(b.variants.map((v) => v.sku)).size === b.variants.length,
    400,
    "DUPLICATE_SKU",
    "Variant SKUs must be unique.",
  );
  for (const image of b.images) {
    try {
      await access(path.join(mediaDir, image.url.slice("/media/".length)));
    } catch {
      check(
        false,
        400,
        "IMAGE_NOT_FOUND",
        "Upload the image before saving this product.",
      );
    }
  }
  await db.transaction(async (tx) => {
    const category = await tx("categories")
      .where({ id: b.categoryId, is_active: true })
      .first();
    check(
      category,
      400,
      "INVALID_CATEGORY",
      "Choose a computer or component category.",
    );
    const p = {
      name: b.name,
      slug: b.slug,
      brand: b.brand,
      category_id: b.categoryId,
      short_description: b.shortDescription,
      description_lines: json(b.descriptionLines),
      tags: json(b.tags),
      is_active: b.isActive ?? true,
      updated_at: new Date(),
    };
    if (update) {
      await tx("products").where({ id: productId }).forUpdate().first();
      await tx("products").where({ id: productId }).update(p);
      await tx("product_images").where({ product_id: productId }).delete();
    } else await tx("products").insert({ id: productId, ...p });
    await tx("product_images").insert(
      b.images.map((i, n) => ({
        product_id: productId,
        url: i.url,
        alt: i.alt || b.name,
        sort_order: n,
      })),
    );
    const retained = [];
    for (const v of b.variants) {
      const values = {
        sku: v.sku,
        attributes: json(v.attributes),
        price_vnd: v.priceVnd,
        cost_price_vnd: v.costPriceVnd,
        stock: v.stock,
        is_active: v.isActive ?? true,
      };
      if (v.id) {
        check(
          update &&
            (await tx("product_variants")
              .where({ id: v.id, product_id: productId })
              .first()),
          400,
          "INVALID_VARIANT",
          "Variant does not belong to this product.",
        );
        await tx("product_variants").where({ id: v.id }).update(values);
        retained.push(v.id);
      } else {
        const [row] = await tx("product_variants")
          .insert({ product_id: productId, ...values })
          .returning("id");
        retained.push(row.id);
      }
    }
    await tx("product_variants")
      .where({ product_id: productId })
      .whereNotIn("id", retained)
      .update({ is_active: false });
  });
  ok(res, await getProduct(productId, db, true), update ? 200 : 201);
}
admin.post("/products", (req, res) => saveProduct(req, res));
admin.patch("/products/:productId", (req, res) => saveProduct(req, res, true));
admin.delete("/products/:productId", async (req, res) => {
  check(
    await db("products")
      .where({ id: id.parse(req.params.productId) })
      .update({ is_active: false }),
    404,
    "NOT_FOUND",
    "Product not found.",
  );
  res.status(204).end();
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
admin.post("/product-images", upload.single("image"), async (req, res) => {
  check(req.file, 400, "IMAGE_REQUIRED", "Select an image.");
  let data;
  try {
    const processor = sharp(req.file.buffer, { limitInputPixels: 25000000 });
    const info = await processor.metadata();
    check(
      ["jpeg", "png", "webp"].includes(info.format),
      400,
      "INVALID_IMAGE",
      "Use a JPEG, PNG or WebP image.",
    );
    data = await processor
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    check(false, 400, "INVALID_IMAGE", "The image is invalid or too large.");
  }
  await mkdir(path.join(mediaDir, "uploads"), { recursive: true });
  const file = `${randomUUID()}.webp`;
  await sharp(data).toFile(path.join(mediaDir, "uploads", file));
  ok(res, { url: `/media/uploads/${file}` }, 201);
});
admin.patch("/variants/:variantId/inventory", async (req, res) => {
  const b = z
    .object({
      stock: z.number().int().min(0).max(1000000),
      costPriceVnd: money.optional(),
    })
    .strict()
    .parse(req.body);
  const [v] = await db("product_variants")
    .where({ id: id.parse(req.params.variantId) })
    .update({
      stock: b.stock,
      ...(b.costPriceVnd !== undefined
        ? { cost_price_vnd: b.costPriceVnd }
        : {}),
    })
    .returning("*");
  check(v, 404, "NOT_FOUND", "Variant not found.");
  ok(res, camel(v));
});
admin.get("/categories", async (req, res) => {
  const { page, pageSize } = paging(req.query, 20);
  const { count } = await db("categories")
    .where({ is_active: true })
    .count()
    .first();
  const rows = await db("categories")
    .where({ is_active: true })
    .orderBy("name")
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  res.json({
    data: camel(rows),
    meta: meta(page, pageSize, count),
    allowedTaxonomy: categoryNames,
  });
});
admin.post("/categories", async (req, res) => {
  const b = z
    .object({ name: text(1, 80), slug: z.enum(Object.keys(categoryNames)) })
    .strict()
    .parse(req.body);
  const [c] = await db("categories").insert(b).returning("*");
  ok(res, camel(c), 201);
});
admin.patch("/categories/:categoryId", async (req, res) => {
  const b = z
    .object({
      name: text(1, 80).optional(),
      slug: z.enum(Object.keys(categoryNames)).optional(),
    })
    .strict()
    .parse(req.body);
  check(
    Object.keys(b).length,
    400,
    "EMPTY_UPDATE",
    "Provide a category name or slug.",
  );
  const [c] = await db("categories")
    .where({ id: id.parse(req.params.categoryId) })
    .update(b)
    .returning("*");
  check(c, 404, "NOT_FOUND", "Category not found.");
  ok(res, camel(c));
});
admin.delete("/categories/:categoryId", async (req, res) => {
  const categoryId = id.parse(req.params.categoryId);
  await db.transaction(async (tx) => {
    const c = await tx("categories")
      .where({ id: categoryId })
      .forUpdate()
      .first();
    check(c, 404, "NOT_FOUND", "Category not found.");
    check(
      !(await tx("products")
        .where({ category_id: categoryId, is_active: true })
        .first()),
      409,
      "CATEGORY_IN_USE",
      "Move or archive active products first.",
    );
    await tx("categories")
      .where({ id: categoryId })
      .update({ is_active: false });
  });
  res.status(204).end();
});
admin.get("/users", async (req, res) => {
  const { page, pageSize } = paging(req.query, 20);
  const q = db("users").where({ role: "CUSTOMER" });
  if (req.query.q)
    q.whereRaw("(full_name || ' ' || email) ILIKE ?", [
      `%${String(req.query.q).slice(0, 100)}%`,
    ]);
  if (req.query.isBanned !== undefined)
    q.where(
      "is_banned",
      z.enum(["true", "false"]).parse(req.query.isBanned) === "true",
    );
  const { count } = await q.clone().count().first();
  const rows = await q
    .select(
      "id",
      "email",
      "full_name",
      "role",
      "is_banned",
      "created_at",
      db.raw(
        "(SELECT COUNT(*)::int FROM orders WHERE user_id=users.id) AS order_count",
      ),
    )
    .orderBy("created_at", "desc")
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  res.json({ data: camel(rows), meta: meta(page, pageSize, count) });
});
async function userDetail(userId) {
  const u = await db("users")
    .where({ id: userId, role: "CUSTOMER" })
    .select("id", "email", "full_name", "role", "is_banned", "created_at")
    .first();
  check(u, 404, "NOT_FOUND", "Customer not found.");
  const [addresses, total] = await Promise.all([
    db("addresses").where({ user_id: u.id }),
    db("orders")
      .where({ user_id: u.id })
      .sum("total_paid_vnd as spent")
      .count("* as count")
      .first(),
  ]);
  return {
    ...camel(u),
    addresses: camel(addresses),
    totalSpentVnd: total.spent || 0,
    orderCount: Number(total.count),
  };
}
admin.get("/users/:userId", async (req, res) =>
  ok(res, await userDetail(id.parse(req.params.userId))),
);
admin.patch("/users/:userId", async (req, res) => {
  const b = z
    .object({
      fullName: text(1, 120).optional(),
      isBanned: z.boolean().optional(),
    })
    .strict()
    .parse(req.body);
  check(Object.keys(b).length, 400, "EMPTY_UPDATE", "No changes provided.");
  const userId = id.parse(req.params.userId);
  await db.transaction(async (tx) => {
    const changed = await tx("users")
      .where({ id: userId, role: "CUSTOMER" })
      .update({
        ...(b.fullName ? { full_name: b.fullName } : {}),
        ...(b.isBanned !== undefined ? { is_banned: b.isBanned } : {}),
      });
    check(changed, 404, "NOT_FOUND", "Customer not found.");
    if (b.isBanned)
      await tx("refresh_sessions")
        .where({ user_id: userId })
        .update({ revoked_at: new Date() });
  });
  ok(res, await userDetail(userId));
});
admin.get("/orders", async (req, res) => {
  const r = req.query.timeRange ? timeRange(req.query) : null;
  res.json(
    await listOrders(
      req.query,
      (q) => {
        if (r)
          q.where("created_at", ">=", r.start.toJSDate()).where(
            "created_at",
            "<",
            r.end.toJSDate(),
          );
      },
      db,
      true,
    ),
  );
});
admin.get("/orders/:orderId", async (req, res) => {
  const row = await db("orders")
    .where({ id: id.parse(req.params.orderId) })
    .first();
  check(row, 404, "NOT_FOUND", "Order not found.");
  ok(res, await orderDto(row, db, true));
});
admin.patch("/orders/:orderId/status", async (req, res) => {
  const b = z
    .object({
      newStatus: z.enum(["confirmed", "shipping", "delivered"]),
      expectedCurrentStatus: z.enum(["pending", "confirmed", "shipping"]),
    })
    .strict()
    .parse(req.body);
  const orderId = id.parse(req.params.orderId);
  const order = await db.transaction(async (tx) => {
    const o = await tx("orders").where({ id: orderId }).forUpdate().first();
    check(o, 404, "NOT_FOUND", "Order not found.");
    if (o.status === b.newStatus) return o;
    check(
      o.status === b.expectedCurrentStatus &&
        { pending: "confirmed", confirmed: "shipping", shipping: "delivered" }[
          o.status
        ] === b.newStatus,
      409,
      "INVALID_TRANSITION",
      "The order status changed. Refresh and choose the next step.",
    );
    const [updated] = await tx("orders")
      .where({ id: o.id })
      .update({ status: b.newStatus })
      .returning("*");
    await tx("order_status_history").insert({
      order_id: o.id,
      status: b.newStatus,
      changed_by: req.user.id,
    });
    return updated;
  });
  const dto = await orderDto(order, db, true);
  ok(res, { order: dto, statusHistory: dto.statusHistory });
});
admin.get("/coupons", async (req, res) => {
  const { page, pageSize } = paging(req.query, 20);
  const { count } = await db("coupons").count().first();
  const rows = await db("coupons")
    .orderBy("created_at", "desc")
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  res.json({
    data: camel(rows).map((c) => ({
      ...c,
      remainingUses: c.usageLimit - c.usedCount,
    })),
    meta: meta(page, pageSize, count),
  });
});
admin.post("/coupons", async (req, res) => {
  const b = z
    .object({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{5}$/),
      discountAmountVnd: money.refine((n) => n > 0),
      usageLimit: z.number().int().min(1).max(10),
    })
    .strict()
    .parse(req.body);
  const [c] = await db("coupons")
    .insert({
      code: b.code,
      discount_amount_vnd: b.discountAmountVnd,
      usage_limit: b.usageLimit,
    })
    .returning("*");
  ok(res, { ...camel(c), remainingUses: c.usage_limit }, 201);
});
admin.get("/coupons/:code", async (req, res) => {
  const c = await db("coupons")
    .where({ code: req.params.code.toUpperCase() })
    .first();
  check(c, 404, "NOT_FOUND", "Coupon not found.");
  const orders = await db("coupon_redemptions as cr")
    .join("orders as o", "o.id", "cr.order_id")
    .where("cr.coupon_code", c.code)
    .select(
      "o.id",
      "o.order_number",
      "o.created_at",
      "o.buyer_email",
      "cr.discount_applied_vnd",
    )
    .orderBy("o.created_at", "desc");
  ok(res, {
    ...camel(c),
    remainingUses: c.usage_limit - c.used_count,
    orders: camel(orders),
  });
});
