import { Router } from "express";
import { z } from "zod";
import { db, camel } from "./db.js";
import { check, paging, meta, ok, text } from "./lib.js";
export const catalog = Router();
export async function productDto(row, conn = db, admin = false) {
  const [variants, images, summary] = await Promise.all([
    conn("product_variants")
      .where({ product_id: row.id })
      .modify((q) => {
        if (!admin) q.where({ is_active: true });
      })
      .orderBy("price_vnd")
      .orderBy("id"),
    conn("product_images").where({ product_id: row.id }).orderBy("sort_order"),
    conn("ratings")
      .where({ product_id: row.id })
      .select(
        conn.raw(
          "COALESCE(ROUND(AVG(stars),1),0)::float AS average_rating, COUNT(*)::int AS rating_count",
        ),
      )
      .first(),
  ]);
  const [{ count }] = await conn("comments")
    .where({ product_id: row.id })
    .count();
  const category = await conn("categories")
    .where({ id: row.category_id })
    .first();
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: camel(category),
    shortDescription: row.short_description,
    descriptionLines: row.description_lines,
    tags: row.tags,
    images: images.map((i) => i.url),
    imageDetails: camel(images),
    thumbnailUrl: images[0]?.url,
    minPriceVnd: Math.min(...variants.map((v) => v.price_vnd)),
    variants: variants.map((v) => {
      const c = camel(v);
      if (!admin) delete c.costPriceVnd;
      return { ...c, isAvailable: row.is_active && v.is_active && v.stock > 0 };
    }),
    reviewSummary: { ...camel(summary), commentCount: Number(count) },
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function getProduct(slug, conn = db, admin = false) {
  const row = await conn("products")
    .where(admin ? { id: slug } : { slug, is_active: true })
    .first();
  check(row, 404, "NOT_FOUND", "Product not found.");
  return productDto(row, conn, admin);
}
export async function listProducts(input = {}, admin = false) {
  const { page, pageSize } = paging(input);
  const q = z
    .object({
      q: z.string().max(200).optional(),
      category: z.string().max(100).optional(),
      brand: z.string().max(100).optional(),
      minPrice: z.coerce.number().int().min(0).optional(),
      maxPrice: z.coerce.number().int().min(0).optional(),
      ratingMin: z.coerce.number().min(1).max(5).optional(),
      tag: z.string().max(80).optional(),
      collection: z.enum(["new", "best_sellers"]).optional(),
      sort: z
        .enum([
          "name_asc",
          "name_desc",
          "price_asc",
          "price_desc",
          "newest",
          "best_selling",
          "relevance",
        ])
        .optional(),
    })
    .parse(input);
  check(
    q.minPrice === undefined ||
      q.maxPrice === undefined ||
      q.minPrice <= q.maxPrice,
    400,
    "INVALID_RANGE",
    "Minimum price must not exceed maximum price.",
  );
  const query = db("products as p")
    .join("categories as c", "c.id", "p.category_id")
    .joinRaw(
      "JOIN (SELECT product_id, MIN(price_vnd) AS min_price FROM product_variants WHERE is_active=true GROUP BY product_id) v ON v.product_id=p.id",
    )
    .leftJoin(
      db("ratings")
        .select("product_id")
        .avg("stars as avg_rating")
        .groupBy("product_id")
        .as("r"),
      "r.product_id",
      "p.id",
    )
    .leftJoin(
      db("order_items")
        .select("product_id")
        .sum("quantity as sold")
        .groupBy("product_id")
        .as("sales"),
      "sales.product_id",
      "p.id",
    );
  if (!admin) query.where("p.is_active", true).where("c.is_active", true);
  if (q.category) query.where("c.slug", q.category);
  if (q.brand) query.where("p.brand", q.brand);
  if (q.minPrice !== undefined) query.where("v.min_price", ">=", q.minPrice);
  if (q.maxPrice !== undefined) query.where("v.min_price", "<=", q.maxPrice);
  if (q.ratingMin) query.whereRaw("COALESCE(r.avg_rating,0)>=?", [q.ratingMin]);
  if (q.tag) query.whereRaw("p.tags @> ?::jsonb", [JSON.stringify([q.tag])]);
  if (q.q)
    query.whereRaw(
      "(p.name || ' ' || p.brand || ' ' || p.short_description || ' ' || p.tags::text) ILIKE ?",
      [`%${q.q.replace(/[\\%_]/g, "\\$&")}%`],
    );
  const total = await query.clone().count("p.id as count").first();
  const sort =
    q.sort ||
    (q.collection === "best_sellers"
      ? "best_selling"
      : q.q
        ? "relevance"
        : "newest");
  if (sort === "name_asc" || sort === "name_desc")
    query.orderBy("p.name", sort === "name_asc" ? "asc" : "desc");
  else if (sort.startsWith("price"))
    query.orderBy("v.min_price", sort === "price_asc" ? "asc" : "desc");
  else if (sort === "best_selling")
    query.orderByRaw("COALESCE(sales.sold,0) DESC");
  else if (sort === "relevance" && q.q)
    query.orderByRaw("CASE WHEN p.name ILIKE ? THEN 0 ELSE 1 END", [
      `%${q.q}%`,
    ]);
  else query.orderBy("p.created_at", "desc");
  const rows = await query
    .select("p.*")
    .orderBy("p.id")
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    data: await Promise.all(rows.map((r) => productDto(r, db, admin))),
    meta: meta(page, pageSize, total.count),
    filters: { selected: q },
  };
}
export async function categories() {
  return camel(
    await db("categories as c")
      .leftJoin("products as p", function () {
        this.on("p.category_id", "=", "c.id").andOnVal("p.is_active", true);
      })
      .where("c.is_active", true)
      .groupBy("c.id")
      .select("c.*")
      .count("p.id as product_count")
      .orderBy("c.name"),
  );
}
const homeSections = [
  ["new", "Fresh arrivals"],
  ["best_sellers", "The crowd favourites"],
  ["category:laptop", "Take your work anywhere"],
  ["category:monitor", "See the bigger picture"],
  ["category:gpu", "A new level of performance"],
];
function sectionQuery(key, query = {}) {
  check(
    homeSections.some((s) => s[0] === key),
    404,
    "NOT_FOUND",
    "Collection not found.",
  );
  return {
    ...query,
    pageSize: query.pageSize || 8,
    ...(key.startsWith("category:")
      ? { category: key.split(":")[1] }
      : { collection: key }),
  };
}
catalog.get("/categories", async (req, res) => ok(res, await categories()));
catalog.get("/brands", async (req, res) =>
  ok(
    res,
    camel(
      await db("products")
        .where({ is_active: true })
        .select("brand as name")
        .count("* as product_count")
        .groupBy("brand")
        .orderBy("brand"),
    ),
  ),
);
catalog.get("/products", async (req, res) =>
  res.json(await listProducts(req.query)),
);
catalog.get("/products/:slug", async (req, res) =>
  ok(res, await getProduct(req.params.slug)),
);
catalog.get("/home/sections/:key/products", async (req, res) =>
  res.json(await listProducts(sectionQuery(req.params.key, req.query))),
);
catalog.get("/home", async (req, res) =>
  ok(res, {
    sections: await Promise.all(
      homeSections.map(async ([key, title]) => {
        const r = await listProducts(sectionQuery(key));
        return { key, title, products: r.data, meta: r.meta };
      }),
    ),
    categories: await categories(),
  }),
);
export function reviewRoutes(requireCustomer, limiter, io) {
  catalog.get("/products/:slug/comments", async (req, res) => {
    const p = await db("products")
      .where({ slug: req.params.slug, is_active: true })
      .first();
    check(p, 404, "NOT_FOUND", "Product not found.");
    const { page, pageSize } = paging(req.query, 10);
    const base = db("comments as c")
      .leftJoin("users as u", "u.id", "c.user_id")
      .where("c.product_id", p.id);
    const total = await base.clone().count("c.id as count").first();
    const rows = await base
      .select(
        "c.*",
        db.raw("COALESCE(u.full_name,c.guest_name) AS author_name"),
      )
      .orderBy("c.created_at", "desc")
      .orderBy("c.id")
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    res.json({ data: camel(rows), meta: meta(page, pageSize, total.count) });
  });
  catalog.post(
    "/products/:slug/comments",
    limiter("comments", 20, 60),
    async (req, res) => {
      check(!req.user?.is_banned, 403, "BANNED", "This account is suspended.");
      const body = z
        .object({ body: text(2, 3000), guestName: text(1, 100).optional() })
        .strict()
        .parse(req.body);
      check(
        req.user || body.guestName,
        400,
        "NAME_REQUIRED",
        "Please enter your name.",
      );
      const p = await db("products")
        .where({ slug: req.params.slug, is_active: true })
        .first();
      check(p, 404, "NOT_FOUND", "Product not found.");
      const [row] = await db("comments")
        .insert({
          product_id: p.id,
          user_id: req.user?.id,
          guest_name: req.user ? null : body.guestName,
          body: body.body,
        })
        .returning("*");
      const comment = {
        ...camel(row),
        authorName: req.user?.full_name || body.guestName,
      };
      const { count } = await db("comments")
        .where({ product_id: p.id })
        .count()
        .first();
      io.to(`product:${p.id}`).emit("comment.created", {
        productId: p.id,
        comment,
        commentCount: Number(count),
      });
      ok(res, comment, 201);
    },
  );
  catalog.put("/products/:slug/rating", requireCustomer, async (req, res) => {
    const { stars } = z
      .object({ stars: z.number().int().min(1).max(5) })
      .strict()
      .parse(req.body);
    const p = await db("products")
      .where({ slug: req.params.slug, is_active: true })
      .first();
    check(p, 404, "NOT_FOUND", "Product not found.");
    const [rating] = await db("ratings")
      .insert({ product_id: p.id, user_id: req.user.id, stars })
      .onConflict(["product_id", "user_id"])
      .merge({ stars, updated_at: db.fn.now() })
      .returning("*");
    const summary = (await productDto(p)).reviewSummary;
    io.to(`product:${p.id}`).emit("rating.updated", {
      productId: p.id,
      summary,
    });
    ok(res, { myRating: camel(rating), summary });
  });
}
