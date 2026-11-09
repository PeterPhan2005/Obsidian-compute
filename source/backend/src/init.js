import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import argon2 from "argon2";
import { DateTime } from "luxon";
import { db, json } from "./db.js";
const migrations = fileURLToPath(new URL("../migrations", import.meta.url));
try {
  await db.migrate.latest({ directory: migrations });
  if (process.env.SEED_DEMO_DATA !== "false")
    await db.transaction(async (tx) => {
      await tx.raw(
        "SELECT pg_advisory_xact_lock(hashtext('obsidian-seed-v1'))",
      );
      if (await tx("seed_versions").where({ version: "demo-v1" }).first())
        return;
      const passwordHash = await argon2.hash("ObsidianCustomer!2026");
      const [admin] = await tx("users")
        .insert({
          email: (
            process.env.ADMIN_EMAIL || "admin@obsidian.local"
          ).toLowerCase(),
          full_name: "Store Administrator",
          role: "ADMIN",
          email_verified: true,
          password_hash: await argon2.hash(
            process.env.ADMIN_PASSWORD || "ObsidianAdmin!2026",
          ),
        })
        .returning("*");
      const users = await tx("users")
        .insert([
          {
            email: "alex@example.com",
            full_name: "Alex Morgan",
            password_hash: passwordHash,
            email_verified: true,
          },
          {
            email: "sam@example.com",
            full_name: "Sam Rivera",
            password_hash: null,
          },
          {
            email: "jordan@example.com",
            full_name: "Jordan Lee",
            password_hash: passwordHash,
            email_verified: true,
          },
        ])
        .returning("*");
      const address = {
        recipientName: "Alex Morgan",
        phone: "0901234567",
        line1: "12 Nguyen Hue",
        ward: "Ben Nghe",
        district: "District 1",
        city: "Ho Chi Minh City",
        country: "VN",
      };
      for (const u of users)
        await tx("addresses").insert({
          user_id: u.id,
          recipient_name: u.full_name,
          phone: address.phone,
          line1: address.line1,
          ward: address.ward,
          district: address.district,
          city: address.city,
          country: "VN",
          is_default: true,
        });
      await tx("addresses").insert({
        user_id: users[0].id,
        recipient_name: users[0].full_name,
        phone: address.phone,
        line1: "80 Le Loi",
        ward: "Ben Thanh",
        district: "District 1",
        city: address.city,
        country: "VN",
      });
      const cats = await tx("categories")
        .insert(
          Object.entries({
            laptop: "Laptops",
            desktop: "Desktop PCs",
            monitor: "Monitors",
            gpu: "Graphics cards",
            ram: "Memory",
            ssd: "Storage",
          }).map(([slug, name]) => ({ slug, name })),
        )
        .returning("*");
      const catalog = JSON.parse(
        await readFile(
          new URL("../seeds/catalog.json", import.meta.url),
          "utf8",
        ),
      );
      const products = [];
      for (let n = 0; n < catalog.length; n++) {
        const p = catalog[n];
        const [row] = await tx("products")
          .insert({
            name: p.name,
            slug: p.slug,
            brand: p.brand,
            category_id: cats.find((c) => c.slug === p.categorySlug).id,
            short_description: p.shortDescription,
            description_lines: json(p.descriptionLines),
            tags: json(p.tags),
            created_at: new Date(
              Date.now() -
                (catalog.length - ((n * 17) % catalog.length)) * 86400000,
            ),
          })
          .returning("*");
        await tx("product_images").insert(
          p.images.map((image, index) => ({
            product_id: row.id,
            url: image.url,
            alt: image.alt || p.name,
            sort_order: index,
          })),
        );
        const variants = await tx("product_variants")
          .insert(
            p.variants.map((v) => ({
              product_id: row.id,
              sku: v.sku,
              attributes: json(v.attributes),
              price_vnd: v.priceVnd,
              cost_price_vnd: v.costPriceVnd,
              stock: v.stock,
            })),
          )
          .returning("*");
        products.push({
          ...row,
          variants,
          image: p.images[0].url,
          category: cats.find((c) => c.slug === p.categorySlug).name,
        });
        for (let k = 0; k < 3; k++)
          await tx("ratings").insert({
            product_id: row.id,
            user_id: users[k].id,
            stars: Math.min(5, 2 + (n % 4) + (k % 2)),
          });
        await tx("comments").insert([
          {
            product_id: row.id,
            user_id: users[n % 3].id,
            body: "A thoughtful option for my next setup. The configuration details are easy to compare.",
          },
          {
            product_id: row.id,
            guest_name: "Casey",
            body: "Love the understated look. Helpful to see each configuration and stock level.",
          },
        ]);
      }
      await tx("coupons").insert([
        { code: "HELLO", discount_amount_vnd: 100000, usage_limit: 10 },
        { code: "BUILD", discount_amount_vnd: 250000, usage_limit: 10 },
        { code: "LAST1", discount_amount_vnd: 50000, usage_limit: 1 },
        { code: "ALLIN", discount_amount_vnd: 999000000, usage_limit: 2 },
        { code: "TAKE5", discount_amount_vnd: 500000, usage_limit: 5 },
        { code: "EMPTY", discount_amount_vnd: 10000, usage_limit: 1 },
      ]);
      for (let n = 0; n < 40; n++) {
        const p = products[(n * 7) % products.length],
          v = p.variants[0],
          u = n === 1 ? users[1] : users[n % 2 === 0 ? 0 : 2],
          quantity = (n % 3) + 1;
        const created = DateTime.now()
          .setZone("Asia/Ho_Chi_Minh")
          .minus({ days: n < 10 ? n : 30 * (n - 8) })
          .toJSDate();
        const status = ["pending", "confirmed", "shipping", "delivered"][n % 4];
        // One small historical purchase gives the passwordless customer exactly 100 usable points.
        const subtotal = n === 1 ? 970000 : v.price_vnd * quantity,
          discount = n === 0 ? 10000 : 0,
          total = subtotal + 30000 - discount,
          earned = Math.floor(total / 10000);
        const [o] = await tx("orders")
          .insert({
            user_id: u.id,
            buyer_name: u.full_name,
            buyer_email: u.email,
            shipping_snapshot: json({ ...address, recipientName: u.full_name }),
            subtotal_vnd: subtotal,
            shipping_fee_vnd: 30000,
            coupon_code: n === 0 ? "EMPTY" : null,
            coupon_discount_vnd: discount,
            total_paid_vnd: total,
            points_earned: earned,
            payment_reference: `seed_${n}`,
            status,
            created_at: created,
            paid_at: created,
          })
          .returning("*");
        await tx("order_items").insert({
          order_id: o.id,
          product_id: p.id,
          variant_id: v.id,
          name_snapshot: p.name,
          sku_snapshot: v.sku,
          attributes_snapshot: json(v.attributes),
          image_url: p.image,
          unit_price_vnd: subtotal / quantity,
          unit_cost_vnd: Math.floor((subtotal / quantity) * 0.72),
          quantity,
          line_total_vnd: subtotal,
          category_name_snapshot: p.category,
        });
        for (const state of [
          "pending",
          "confirmed",
          "shipping",
          "delivered",
        ].slice(0, (n % 4) + 1))
          await tx("order_status_history").insert({
            order_id: o.id,
            status: state,
            changed_by: state === "pending" ? "system" : admin.id,
            changed_at: new Date(
              created.getTime() +
                ["pending", "confirmed", "shipping", "delivered"].indexOf(
                  state,
                ) *
                  1000,
            ),
          });
        await tx("loyalty_ledger").insert({
          user_id: u.id,
          order_id: o.id,
          type: "EARN",
          points_delta: earned,
          created_at: created,
        });
        await tx("users")
          .where({ id: u.id })
          .increment("points_balance", earned);
        if (n === 0) {
          await tx("coupons")
            .where({ code: "EMPTY" })
            .update({ used_count: 1 });
          await tx("coupon_redemptions").insert({
            coupon_code: "EMPTY",
            order_id: o.id,
            discount_applied_vnd: 10000,
          });
        }
      }
      await tx("seed_versions").insert({ version: "demo-v1" });
    });
  console.log("Database ready: migrations and idempotent demo seed complete.");
} finally {
  await db.destroy();
}
