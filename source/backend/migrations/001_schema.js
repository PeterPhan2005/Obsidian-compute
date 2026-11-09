export async function up(knex) {
  await knex.raw(`
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK(email=lower(email)), full_name text NOT NULL,
 role text NOT NULL DEFAULT 'CUSTOMER' CHECK(role IN ('CUSTOMER','ADMIN')), password_hash text, email_verified boolean NOT NULL DEFAULT false,
 is_banned boolean NOT NULL DEFAULT false, points_balance integer NOT NULL DEFAULT 0 CHECK(points_balance>=0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_admin ON users(role) WHERE role='ADMIN';
CREATE TABLE auth_identities (user_id uuid NOT NULL REFERENCES users(id), provider text NOT NULL, provider_subject text NOT NULL, PRIMARY KEY(provider,provider_subject));
CREATE TABLE refresh_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text UNIQUE NOT NULL, previous_hash text, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE login_otps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX otp_lookup ON login_otps(email,created_at DESC);
CREATE TABLE password_reset_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE addresses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), recipient_name text NOT NULL, phone text, line1 text NOT NULL, ward text NOT NULL, district text NOT NULL, city text NOT NULL, country text NOT NULL DEFAULT 'VN' CHECK(country='VN'), is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX one_default_address ON addresses(user_id) WHERE is_default;
CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE CHECK(slug IN ('laptop','desktop','monitor','gpu','ram','ssd','cpu','motherboard')), is_active boolean NOT NULL DEFAULT true);
CREATE TABLE products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES categories(id), name text NOT NULL, slug text UNIQUE NOT NULL, brand text NOT NULL, short_description text NOT NULL, description_lines jsonb NOT NULL CHECK(jsonb_array_length(description_lines)>=5), tags jsonb NOT NULL DEFAULT '[]', is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX product_category ON products(category_id,is_active,created_at DESC);
CREATE TABLE product_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id), url text NOT NULL, alt text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE product_variants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id), sku text NOT NULL UNIQUE, attributes jsonb NOT NULL, price_vnd bigint NOT NULL CHECK(price_vnd>=0 AND price_vnd<=1000000000), cost_price_vnd bigint NOT NULL CHECK(cost_price_vnd>=0 AND cost_price_vnd<=1000000000), stock integer NOT NULL CHECK(stock>=0), is_active boolean NOT NULL DEFAULT true);
CREATE INDEX variant_product ON product_variants(product_id);
CREATE TABLE comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id), user_id uuid REFERENCES users(id), guest_name text, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX comment_product ON comments(product_id,created_at DESC);
CREATE TABLE ratings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id), user_id uuid NOT NULL REFERENCES users(id), stars integer NOT NULL CHECK(stars BETWEEN 1 AND 5), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_id,user_id));
CREATE TABLE carts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE REFERENCES users(id), guest_token_hash text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), CHECK((user_id IS NULL) <> (guest_token_hash IS NULL)));
CREATE TABLE cart_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE, variant_id uuid NOT NULL REFERENCES product_variants(id), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999), UNIQUE(cart_id,variant_id));
CREATE TABLE coupons (code text PRIMARY KEY CHECK(code ~ '^[A-Z0-9]{5}$'), discount_amount_vnd bigint NOT NULL CHECK(discount_amount_vnd>0 AND discount_amount_vnd<=1000000000), usage_limit integer NOT NULL CHECK(usage_limit BETWEEN 1 AND 10), used_count integer NOT NULL DEFAULT 0 CHECK(used_count>=0 AND used_count<=usage_limit), created_at timestamptz NOT NULL DEFAULT now());
CREATE SEQUENCE order_number_seq;
CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text UNIQUE NOT NULL DEFAULT ('OBS-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text,6,'0')), user_id uuid NOT NULL REFERENCES users(id), buyer_name text NOT NULL, buyer_email text NOT NULL, shipping_snapshot jsonb NOT NULL, subtotal_vnd bigint NOT NULL CHECK(subtotal_vnd>=0), tax_vnd bigint NOT NULL DEFAULT 0, shipping_fee_vnd bigint NOT NULL, coupon_code text REFERENCES coupons(code), coupon_discount_vnd bigint NOT NULL DEFAULT 0, points_redeemed integer NOT NULL DEFAULT 0, points_discount_vnd bigint NOT NULL DEFAULT 0, total_paid_vnd bigint NOT NULL CHECK(total_paid_vnd>=0), points_earned integer NOT NULL DEFAULT 0, payment_method text NOT NULL DEFAULT 'DEMO', payment_status text NOT NULL DEFAULT 'PAID' CHECK(payment_status='PAID'), payment_reference text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipping','delivered')), paid_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX order_user ON orders(user_id,created_at DESC);
CREATE INDEX order_time ON orders(created_at DESC);
CREATE TABLE order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), product_id uuid REFERENCES products(id), variant_id uuid REFERENCES product_variants(id), name_snapshot text NOT NULL, sku_snapshot text NOT NULL, attributes_snapshot jsonb NOT NULL, image_url text, unit_price_vnd bigint NOT NULL, unit_cost_vnd bigint NOT NULL, quantity integer NOT NULL CHECK(quantity>0), line_total_vnd bigint NOT NULL, category_name_snapshot text NOT NULL);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE TABLE order_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), status text NOT NULL, changed_by text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,status));
CREATE TABLE coupon_redemptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coupon_code text NOT NULL REFERENCES coupons(code), order_id uuid UNIQUE NOT NULL REFERENCES orders(id), discount_applied_vnd bigint NOT NULL);
CREATE TABLE loyalty_ledger (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), order_id uuid NOT NULL REFERENCES orders(id), type text NOT NULL CHECK(type IN ('EARN','REDEEM')), points_delta integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,type), CHECK((type='EARN' AND points_delta>=0) OR (type='REDEEM' AND points_delta<0)));
CREATE TABLE payment_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), checkout_key uuid NOT NULL UNIQUE, user_id uuid REFERENCES users(id), provider text NOT NULL DEFAULT 'DEMO', status text NOT NULL, provider_reference text NOT NULL, amount_vnd bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE checkout_idempotency (key uuid PRIMARY KEY, cart_id uuid NOT NULL REFERENCES carts(id), request_hash text NOT NULL, order_id uuid NOT NULL REFERENCES orders(id), result_status integer NOT NULL DEFAULT 201);
CREATE TABLE receipt_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE email_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL, payload jsonb NOT NULL, order_id uuid REFERENCES orders(id), status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, last_error text, UNIQUE(type,order_id));
CREATE TABLE seed_versions (version text PRIMARY KEY, created_at timestamptz DEFAULT now());
`);
}
export async function down() {
  throw new Error(
    "Destructive down migration intentionally disabled. Use a separate test database.",
  );
}
