import { db, camel } from "./db.js";
import { hash, token, cookieOptions, check } from "./lib.js";
export async function resolveCart(req, res) {
  if (req.user) {
    check(!req.user.is_banned, 403, "BANNED", "This account is suspended.");
    check(
      req.user.role === "CUSTOMER",
      403,
      "CUSTOMER_REQUIRED",
      "Use a customer account to shop.",
    );
    const [c] = await db("carts")
      .insert({ user_id: req.user.id })
      .onConflict("user_id")
      .merge({ user_id: req.user.id })
      .returning("*");
    return c;
  }
  let c =
    req.cookies.guest_cart &&
    (await db("carts")
      .where({ guest_token_hash: hash(req.cookies.guest_cart) })
      .first());
  if (!c) {
    const t = token();
    [c] = await db("carts")
      .insert({ guest_token_hash: hash(t) })
      .returning("*");
    res.cookie("guest_cart", t, { ...cookieOptions, maxAge: 30 * 86400000 });
  }
  return c;
}
export async function cartDto(cart, conn = db) {
  const rows = await conn("cart_items as ci")
    .join("product_variants as v", "v.id", "ci.variant_id")
    .join("products as p", "p.id", "v.product_id")
    .join("categories as cat", "cat.id", "p.category_id")
    .where("ci.cart_id", cart.id)
    .select(
      "ci.*",
      "v.price_vnd",
      "v.cost_price_vnd",
      "v.stock",
      "v.attributes",
      "v.sku",
      "p.name",
      "p.slug",
      "p.id as product_id",
      "cat.name as category_name",
      "p.is_active as product_active",
      "v.is_active as variant_active",
      conn.raw(
        "(SELECT url FROM product_images WHERE product_id=p.id ORDER BY sort_order LIMIT 1) AS image_url",
      ),
    )
    .orderBy("ci.id");
  const items = rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    variantId: r.variant_id,
    name: r.name,
    slug: r.slug,
    sku: r.sku,
    attributes: r.attributes,
    imageUrl: r.image_url,
    unitPriceVnd: r.price_vnd,
    quantity: r.quantity,
    lineTotalVnd: r.price_vnd * r.quantity,
    availableStock: r.product_active && r.variant_active ? r.stock : 0,
  }));
  return {
    id: cart.id,
    items,
    itemCount: items.reduce((a, b) => a + b.quantity, 0),
    subtotalVnd: items.reduce((a, b) => a + b.lineTotalVnd, 0),
  };
}
export async function mergeGuestCart(req, res, user) {
  if (!req.cookies.guest_cart || user.role !== "CUSTOMER") return;
  await db.transaction(async (tx) => {
    const guest = await tx("carts")
      .where({ guest_token_hash: hash(req.cookies.guest_cart) })
      .forUpdate()
      .first();
    if (!guest) return;
    const [cart] = await tx("carts")
      .insert({ user_id: user.id })
      .onConflict("user_id")
      .merge({ user_id: user.id })
      .returning("*");
    await tx("carts").where({ id: cart.id }).forUpdate().first();
    const items = await tx("cart_items as c")
      .join("product_variants as v", "v.id", "c.variant_id")
      .where("cart_id", guest.id)
      .select("c.*", "v.stock");
    for (const i of items) {
      const old = await tx("cart_items")
        .where({ cart_id: cart.id, variant_id: i.variant_id })
        .first();
      const quantity = Math.min(
        999,
        i.stock,
        (old?.quantity || 0) + i.quantity,
      );
      if (quantity > 0)
        await tx("cart_items")
          .insert({ cart_id: cart.id, variant_id: i.variant_id, quantity })
          .onConflict(["cart_id", "variant_id"])
          .merge({ quantity });
    }
    await tx("cart_items").where({ cart_id: guest.id }).delete();
    // Keep historical cart row for idempotency records, but revoke its browser token.
    await tx("carts")
      .where({ id: guest.id })
      .update({ guest_token_hash: hash(token()) });
  });
  res.clearCookie("guest_cart", cookieOptions);
}
