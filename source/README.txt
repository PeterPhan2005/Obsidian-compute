OBSIDIAN COMPUTE
Computer e-commerce final project — JavaScript / Node.js

RUN THE APPLICATION
-------------------
Prerequisite: Docker Desktop (or Docker Engine with Compose v2) running.
From this source/ directory, run:

    docker compose up -d

No npm install, manual database creation, migrations or seed command is needed.
The first run downloads images and builds the app; allow several minutes.
Open http://localhost:8080
Email inbox: http://localhost:8025

To inspect readiness: docker compose ps
To inspect a startup issue: docker compose logs --tail=100 init api-a api-b worker
After changing source code: docker compose up -d --build
To stop without deleting data: docker compose down
Database and uploaded media persist in named volumes.

DEMO ACCOUNTS
-------------
Administrator: admin@obsidian.local / ObsidianAdmin!2026
Customer:      alex@example.com / ObsidianCustomer!2026
Customer:      jordan@example.com / ObsidianCustomer!2026
Passwordless:  sam@example.com (choose Email code; read code in Mailpit)

ADMIN_EMAIL / ADMIN_PASSWORD may override the initial admin seed. These values
only take effect when a new database is first seeded. The seed never resets
existing passwords, orders or stock on restart.

DEMO COUPONS
------------
HELLO: 100,000 VND off, 10 total uses.
BUILD: 250,000 VND off, 10 total uses.
LAST1: 50,000 VND off, 1 total use.
ALLIN: merchandise-covering discount, 2 total uses; shipping remains payable.
TAKE5: 500,000 VND off, 5 total uses.
EMPTY: exhausted code for invalid-code demonstration.
ZZ999: intentionally not in the database, for an unknown-code demonstration.

Discounts are fixed VND, capped at merchandise subtotal, with no expiry.
Each code has one store-wide usage limit. A maximum of one code per order.

PAYMENT AND LOYALTY
-------------------
Checkout uses an internal sandbox, not a third-party bank or payment gateway.
Choose Successful payment or Declined payment (test). No real card data is used.
An order is created only after sandbox success in the same database transaction
as stock, coupon usage, points and email-outbox writes. Failed payment leaves
those records unchanged. Idempotency keys protect repeated order submissions.

Shipping: 30,000 VND. Demo tax: 0 VND.
1 point = 1,000 VND. Earn floor(total actually paid / 10,000) points.
Example: 970,000 merchandise + 30,000 shipping = 1,000,000 paid = 100 points.
Existing points can cover merchandise, shipping and tax. Only whole points are
used; a remaining amount below 1,000 VND is paid normally. Earned points become
usable on the next order. Guests earn points but must sign in to redeem them.
Fresh demo seed gives Sam one historical 1,000,000 VND order and 100 points.

GOOGLE SIGN-IN
--------------
Google OIDC is implemented with state, browser binding, nonce, PKCE, verified ID
tokens and verified-email linking. Configure the following in source/.env:

    GOOGLE_CLIENT_ID=...
    GOOGLE_CLIENT_SECRET=...
    GOOGLE_CALLBACK_URL=http://localhost:8080/api/v1/auth/google/callback

Use a Web application OAuth client and register that exact callback URI.
The detailed guide is ../docs/GOOGLE_OAUTH_SETUP.md.
After setting credentials, run docker compose up -d.
The frontend never receives the client secret. .env is excluded from Git and
Docker build contexts. The core website boots without Google credentials;
Google sign-in explains that it is unavailable in that case.
The final real Google account consent/callback must be verified in a browser.

FEATURES
--------
- Separate landing page and catalog; every product list has numbered pagination.
- Search, category/brand/price/rating filters and name/price ascending/descending
  sorts; product variants with independent prices and stock.
- 60 fictional demo products, six categories, 120 variants, three local licensed
  illustrative images per product, five or more description lines per product.
- Guest comments; signed-in customer star ratings; cross-replica Socket.IO updates.
- Persistent carts, cart merging on sign-in, multistep guest/customer checkout,
  coupon previews, sandbox failure/success, order receipt and confirmation email.
- Email OTP, password login, initial password setup, password recovery, Google
  OIDC, profile, multiple/default shipping addresses, order history and rewards.
- Exactly one Administrator: products/categories/variant inventory/image upload,
  customers/ban, orders/status history, coupons, simple and advanced dashboards.
- Advanced dashboard calendar ranges and day/week/month/quarter/year grouping;
  merchandise revenue after discounts and gross profit using order cost snapshots.
- Responsive English interface, dark minimal design and VND formatting.

ARCHITECTURE
------------
Nginx routes one origin to frontend static files and two Express API replicas.
PostgreSQL is the persistent source of truth. Redis shares rate limits, OAuth
state and Socket.IO events. Access cookies use signed short-lived tokens; refresh
sessions and guest carts persist in PostgreSQL. An independent worker drains the
email outbox to Mailpit. Uploaded images live in a shared volume.

The application is a modular monolith with horizontal scaling, not a microservice
bonus claim. No bonus features are claimed in this delivery.

API base: /api/v1
Health: /api/v1/health (X-Instance-Id header identifies the responding replica)
API contracts and business rules: ../BLUEPRINT_NODEJS_ECOMMERCE.md

TESTS
-----
Development prerequisites: Node.js 24 LTS, npm and Docker.
From source/:

    npm ci
    npx playwright install chromium
    npm test
    npm run verify

npm test runs focused calculation/calendar tests.
npm run verify recreates ONLY the separate obsidian-test stack, including its
own database/media volumes, then runs backend integration and Playwright tests.
It does not reset the main obsidian-compute database.

Test website: http://localhost:8081
Test inbox: http://localhost:8026
Test database port: 15433 (loopback only)
Test APIs: 3101 / 3102 (loopback only)
All test-stack ports must be free. Use modern Compose with !override support.

The full verifier runs 20 backend tests and 7 browser tests, including concurrent
stock/coupon contention, idempotency, zero-payment and point reconciliation,
OTP/recovery, RBAC/CSRF, two-replica sessions and WebSockets, Admin CRUD/upload,
checkout, and responsive screenshots at 375/768/1280/1440px.
Reports/screenshots: ../docs/evidence/
To stop the test stack: docker compose -p obsidian-test -f compose.yaml -f compose.test.yaml down

KNOWN BOUNDARIES
----------------
- Product specifications/prices are fictional academic configurations. Wikimedia
  photos are category illustrations, not exact model/product photography.
  Attribution: /media/catalog/credits.html and ../docs/ASSET_SOURCES.md.
- Mailpit captures email locally; it does not deliver to public email inboxes.
- The outbox retries transient SMTP failures with exponential backoff and a stable
  Message-ID. As with SMTP generally, a crash after server acceptance but before
  marking a message sent can cause redelivery; exactly-once external delivery is
  not claimed.
- No real charges, refunds, order cancellation, extra admin modules or bonus
  features are implemented outside the specified scope.
- The narrated demo.mp4, actual Git teamwork history and instructor-provided
  Rubrik.docx must be completed by the team before submission.
