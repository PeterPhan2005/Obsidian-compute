OBSIDIAN COMPUTE
Computer e-commerce final project — JavaScript / Node.js

RUN THE APPLICATION
-------------------
Prerequisite: Docker Desktop (or Docker Engine with Compose v2) running.
From this source/ directory, run:

    docker compose up -d

No npm install, manual database creation, migrations or seed command is needed.
Compose automatically uses docker-compose.yml in this directory.
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

ADMIN_EMAIL / ADMIN_PASSWORD override the initial Administrator credentials.
With SEED_DEMO_DATA=false, a database without an Administrator requires both
values explicitly, using a valid non-demo email and a non-demo password of
10–128 characters. Startup creates the sole Administrator and skips demo data.
An existing Administrator and password are preserved on subsequent starts.
The seed never resets existing orders or stock on restart.

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
Enter DEMO-APPROVE or DEMO-DECLINE in the test payment field, then review and
place the order. Use only synthetic codes. Never enter real card details.
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
Google OIDC uses state, browser binding, nonce, PKCE and signed ID tokens.
Configure the following in source/.env:

    GOOGLE_CLIENT_ID=...
    GOOGLE_CLIENT_SECRET=...
    GOOGLE_CALLBACK_URL=http://localhost:8080/api/v1/auth/google/callback

Use a Web application OAuth client and register the exact callback URI.
For a different public origin set APP_BASE_URL and register that origin's
/api/v1/auth/google/callback. GOOGLE_CALLBACK_URL can be omitted to derive it
from APP_BASE_URL.
The detailed guide is ../docs/GOOGLE_OAUTH_SETUP.md.
After setting credentials, run docker compose up -d.
The frontend never receives the client secret. .env is excluded from Git and
Docker build contexts. The core website boots without Google credentials;
Google sign-in explains that it is unavailable in that case.
The final real Google account consent/callback must be verified in a browser.

EMAIL DELIVERY
--------------
By default the worker delivers to Mailpit at http://localhost:8025. To use an
approved external SMTP provider, set the following in source/.env:

    SMTP_HOST=your-provider-hostname
    SMTP_PORT=587
    SMTP_SECURE=false
    SMTP_USER=your-smtp-user
    SMTP_PASSWORD=your-smtp-password
    MAIL_FROM=your-provider-approved-sender

Use SMTP_PORT=465 and SMTP_SECURE=true if the provider requires implicit TLS.
The worker requires STARTTLS for external SMTP when SMTP_SECURE=false.
Set both authentication variables when the provider requires credentials.
Set APP_BASE_URL to the URL recipients can reach for password reset links.
Run docker compose up -d after editing the file. The worker sends to recipients
in the outbox, including messages pending before a configuration change. Use an
isolated, clean queue and an approved test inbox to check external delivery.

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
  New order items also retain the category ID at sale. Older items without an
  ID appear in legacy groups by their original snapshot names. Their precise
  category identities are unknown and count as separate reported groups.
- Responsive English interface, dark minimal design and VND formatting.

ARCHITECTURE
------------
Nginx routes one origin to frontend static files and two Express API replicas.
PostgreSQL is the persistent source of truth. Redis shares rate limits, OAuth
state and Socket.IO events. Access cookies use signed short-lived tokens; refresh
sessions and guest carts persist in PostgreSQL. An independent worker drains the
email outbox to Mailpit. Uploaded images live in a shared volume.

The application is a modular monolith with horizontal scaling, not a microservice
bonus claim.

API base: /api/v1
Health: /api/v1/health (X-Instance-Id header identifies the responding replica)
API contracts and business rules: ../BLUEPRINT_NODEJS_ECOMMERCE.md
Guest API clients should start with GET /api/v1/cart and keep its guest_cart
cookie before changing items or requesting a checkout quote. A cart mutation
without that identity returns CART_NOT_INITIALIZED.

TESTS
-----
Development prerequisites: Node.js 24 LTS, npm and Docker.
From source/:

    npm ci
    npx playwright install chromium
    npm test
    npm run verify

npm test runs focused calculation/calendar tests.
npm run verify requires a local Docker Engine. It creates a fresh project named
obsidian-test-<random-id>, confirms its dedicated PostgreSQL database and port
bindings, then discovers backend tests and runs all Playwright specifications.
The Google OAuth fixture runs with isolated Redis/PostgreSQL and synthetic
configuration. Test email stays inside the project's Mailpit instance.
The verifier exits if the ports are already in use or the new project would
reuse existing resources. On completion or test failure it stops the test
project, preserving its volumes. To run backend tests only, use
npm run verify -- --api-only.

Test website: http://localhost:8081
Test inbox: http://localhost:8026
Test database port: 15433 (loopback only)
Test APIs: 3101 / 3102 (loopback only)
All test-stack ports must be free. Use modern Compose with !override support.

Test artifacts and HTML reports are written to test-results/<project>/ and
playwright-report/<project>/ respectively. A direct Playwright run uses the
manual subdirectories. Existing demonstration screenshots stay in docs/evidence/.
The default browser is Playwright Chromium. To use an already installed
Chromium browser instead, set PLAYWRIGHT_CHROMIUM_EXECUTABLE to its absolute path.

CONTINUOUS INTEGRATION AND DELIVERY
----------------------------------
The CI and GHCR delivery workflow runs on GitHub-hosted Ubuntu runners for
pushes to fix-issue and main, and pull requests targeting either branch. The
progress and backup-main branches are excluded. From source/, CI runs npm ci,
npx playwright install --with-deps chromium, npm run build, and
npm run verify -- --images. The last command uses the existing verifier and
isolated test settings while running prebuilt images through compose.images.yaml.

CI builds Linux amd64 Backend and Frontend images from the checked-out commit.
After the full verifier succeeds, an image archive from that same run is passed
to the delivery job on pushes to fix-issue or main in the original repository.
The delivery job uses GITHUB_TOKEN with packages: write to push the verified
images to GHCR without rebuilding. Pull requests validate only. The full
commit SHA is the tag and the image revision label. The delivery job summary
records the digest reported by GHCR for each image.

Actions: https://github.com/PeterPhan2005/Obsidian-compute/actions/workflows/ci-cd.yml
Packages: https://github.com/PeterPhan2005?tab=packages
Open the workflow run for the intended SHA, check both jobs, and copy the two
image references with @sha256 digests from its summary. Inspect the same SHA
versions under Packages. GHCR versions are available after a successful publish.

RUN DELIVERED IMAGES
--------------------
Check out the matching commit for the Compose files, Nginx configuration and
catalog media. Run the following from source/ using modern Compose v2 and Docker
with Linux amd64 support. Ports 8080 and 8025 must be free. If the packages are
private, sign in to ghcr.io with a classic PAT that has read:packages and
access to both packages. Public packages can be pulled anonymously.

PowerShell example. Replace the placeholders with the actual digest references.

    $env:OBSIDIAN_BACKEND_IMAGE = '<backend image reference with digest>'
    $env:OBSIDIAN_FRONTEND_IMAGE = '<frontend image reference with digest>'
    docker compose -p obsidian-delivered -f docker-compose.yml -f compose.images.yaml up -d --no-build
    docker compose -p obsidian-delivered -f docker-compose.yml -f compose.images.yaml ps --all
    curl.exe --fail http://localhost:8080/api/v1/health

After startup, open http://localhost:8080 and check that catalog images load.
The override removes application build definitions. Init, both API replicas and
the email worker use the same Backend image. The Frontend uses its own image.
Named volumes keep the delivered stack's data separate from the source stack.
To use the normal submission, run docker compose up -d without the override
or any GHCR sign-in. The pipeline provides Continuous Delivery through GHCR.
Starting the delivered stack is explicit. The workflow does not deploy to a server.

Before the first publishing push, confirm Actions are enabled, GITHUB_TOKEN can
create or write both package names, the intended pull audience can read them,
and the applicable Actions and GHCR billing terms are approved. The image
archive is retained as an Actions artifact for one day and uses artifact storage.
Newly created GHCR packages start private. Package visibility is managed separately.

CI/CD BONUS EVIDENCE
--------------------
After remote verification, put a short description and evidence in Bonus/:
the successful development-push Actions run for a specific commit, both GHCR
SHA tags and digests, and a clean Compose startup showing init completion,
API health and the storefront from those digest references. Also capture the
source-based one-command startup. Link the evidence in Readme.txt and record
the verified result in Rubrik.docx. Show the Actions run, published versions
and delivered storefront in the narrated 1080p demo.mp4. Keep credentials,
test traces and private data out of the submission evidence.

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
- No real charges, refunds, order cancellation or extra admin modules are
  implemented outside the specified scope.
- The narrated demo.mp4, actual Git teamwork history and instructor-provided
  Rubrik.docx must be completed by the team before submission.
