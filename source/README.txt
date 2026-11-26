OBSIDIAN COMPUTE
Computer e-commerce final project — JavaScript / Node.js

RUN THE APPLICATION
-------------------
Prerequisite: Docker Desktop (or Docker Engine with Compose v2) running Linux
containers. Allocate at least 4 GB of memory to Docker Desktop.
From this source/ directory, run:

    docker compose up -d

No npm install, manual database creation, migrations or seed command is needed.
Compose automatically uses docker-compose.yml in this directory.
The first run downloads images and builds the app. A clean build needs access
to the image registries, npm and Hugging Face for the pinned AI model assets.
Open http://localhost:8080
Email inbox: http://localhost:8025

To inspect readiness: docker compose ps
To inspect a startup issue: docker compose logs --tail=100 init api-a api-b realtime worker elasticsearch
After changing source code: docker compose up -d --build
To stop without deleting data: docker compose down
Database, uploaded media and the search index persist in named volumes.

CONTROLLED LAN DEMONSTRATION
----------------------------
The default one-command setup uses http://localhost:8080. To demonstrate
interactively from another device on the LAN, find the Docker host's LAN IP
or hostname. Add its exact browser origin to source/.env, for example:

    APP_BASE_URL=http://192.168.1.25:8080

Run docker compose up -d from source/ again, then open that exact URL in all
storefront windows. API writes and WebSocket connections validate the Origin
against APP_BASE_URL. For localhost mode, remove that override and run the
same Compose command. Keep 8080:80 and leave Mailpit at 127.0.0.1:8025 on the
Docker host. Use HTTP LAN mode with synthetic demo data on a controlled network.
Production hosting needs HTTPS and private credentials.

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
- Browser-side English and Vietnamese product recommendations from the Catalog.
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
Nginx routes one origin to frontend static files, the two Core API replicas
and the Realtime Gateway. After comment and rating writes, Core API publishes
events on Redis Pub/Sub. The Gateway delivers them to product rooms over
Socket.IO and asks Core API whether a product is active through a private
HTTP listener. Browsers refresh product state through REST after reconnect or
subscriber recovery. Redis also shares rate limits and OAuth state.

PostgreSQL is the persistent source of truth for Core transactions and the
email outbox. The independent Notification Worker drains the outbox to
Mailpit. Uploaded images live in a shared volume. Core API, Realtime Gateway
and Notification Worker share one Backend image with separate entrypoints.

API base: /api/v1
Health: /api/v1/health (X-Instance-Id header identifies the responding replica)
API contracts and business rules: ../BLUEPRINT_NODEJS_ECOMMERCE.md
Guest API clients should start with GET /api/v1/cart and keep its guest_cart
cookie before changing items or requesting a checkout quote. A cart mutation
without that identity returns CART_NOT_INITIALIZED.

PRODUCT SEARCH
--------------
Public catalog keyword searches use an Elasticsearch 9.5.7 single node.
Core API uses the REST API through Node.js 24 fetch. PostgreSQL holds catalog
data and applies visibility, filters, explicit sorting and pagination to the
matching products. It also remains authoritative for checkout. Catalog requests
with no keyword and Admin catalog queries use PostgreSQL directly.

The index contains product UUIDs and searchable names, brands, short
descriptions and tags. Elasticsearch analyzes typed text into case-insensitive
tokens and requires all tokens across these fields. Relevance favors product
names and phrase matches. Partial words that matched the SQL substring search
may require complete tokens in Elasticsearch. The existing exact tag filter
still applies independently of the keyword.

The search node has a 1 GiB container memory limit and automatically sizes its
JVM heap. The local stack disables mmap to run without changing host sysctl
settings. The search network contains only Elasticsearch and the two Core API
replicas. The node runs without authentication on that private Compose network
and publishes no host port. Keep the search network private.

These commands show search readiness and the active keyword backend. Use
curl.exe for the last command in Windows PowerShell.

    docker compose ps elasticsearch
    docker compose exec -T elasticsearch curl -fsS "http://127.0.0.1:9200/_cluster/health?wait_for_status=yellow&timeout=3s"
    docker compose exec -T elasticsearch curl -fsS http://127.0.0.1:9200/products-v1/_count
    curl -sS -D - "http://localhost:8080/api/v1/products?q=gaming"

The last command reports `X-Search-Backend: elasticsearch` when Elasticsearch
handled the keyword. If the index is unavailable, Elasticsearch takes more than
1.5 seconds, or the keyword matches over 50,000 documents, Core uses the existing
SQL substring search and reports `X-Search-Backend: postgresql`. SQL can return
a different match set and relevance order.

The Core API syncs committed catalog data after init completes. PostgreSQL
coalesces changes and the API replicas check for work every two seconds using
one database advisory lock. Initial sync loads existing products and makes
the products-v1 search alias available once the index is ready. Text edits can
take additional time to appear in search, especially during an outage. Current
visibility, active-variant prices, ratings and sales are read from PostgreSQL
when serving search results.

Core API rebuilds a missing index from PostgreSQL with the configured mapping
and catches up after outages. Automatic index creation by document writes is
disabled so a write cannot recreate a missing index with a dynamic mapping.
If the search container is stopped, run docker compose up -d elasticsearch and
check that keyword requests return to Elasticsearch. Retain existing volumes.

See Elastic's Docker and virtual-memory documentation.
https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-basic
https://www.elastic.co/docs/deploy-manage/deploy/cloud-on-k8s/virtual-memory

AI PRODUCT RECOMMENDATIONS
--------------------------
Open Catalog, expand AI product recommendations and describe your intended use.
For example: "A portable notebook for reading documents while I travel" or
"Tôi cần một chiếc laptop nhẹ để đọc tài liệu khi đi xa". Category and maximum
budget are optional. The assistant ranks up to 64 public Catalog products and
shows up to three results on numbered page 1. Price and stock refer to the same
eligible variant and are checked again before display.

Inference runs in a browser Web Worker using WASM, with model assets served
from the storefront origin. A clean build downloads and verifies checksums for
the pinned multilingual MiniLM q8 model. The first recommendation downloads
about 158 MB from the storefront. It may take time and memory on slower devices.
Describe the intended use in positive terms. Semantic ranking can be weak for
similar products, negation and exact specifications. Use ordinary Catalog
search and filters when needed. Real mobile-device performance is unmeasured.
See ../Bonus/04_AI_Product_Recommendation.md for model and evidence details.

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
obsidian-test-<random-id>, confirms its dedicated PostgreSQL database, private
Elasticsearch instance and port bindings, then discovers backend tests and runs
all Playwright specifications.
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
The override removes application build definitions. Init, both API replicas,
the Realtime Gateway and the email worker use the same Backend image. The
Frontend uses its own image.
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
The accepted Batch 08 run is 45864609725 at 3c76f02021a4c123a456adc2ba53c0f41987dc39.
Its two GHCR digest references are in ../Bonus/04_AI_Product_Recommendation.md.
The four guides under ../Bonus/ cover CI/CD, Microservices, Elasticsearch and
AI. Include them with the final submission and cite the matching evidence in
Readme.txt, Rubrik.docx and the narrated 1080p demo.mp4. Capture the source-based
one-command startup. Keep credentials, test traces and private data outside
the submission evidence. The Batch 09 candidate uses local verification.

KNOWN BOUNDARIES
----------------
- Product specifications/prices are fictional academic configurations. Wikimedia
  photos are category illustrations, not exact model/product photography.
  Attribution: /media/catalog/credits.html and ../docs/ASSET_SOURCES.md.
- Mailpit captures email locally; it does not deliver to public email inboxes.
- Real Google consent/callback and external SMTP delivery still need verification.
- The Batch 08 frontend build/development audit recorded High Sharp advisories
  through Transformers.js. The browser bundle excludes native Sharp. The
  separate Backend upload dependency uses Sharp 0.35.5 at this checkpoint.
- The outbox retries transient SMTP failures with exponential backoff and a stable
  Message-ID. As with SMTP generally, a crash after server acceptance but before
  marking a message sent can cause redelivery; exactly-once external delivery is
  not claimed.
- No real charges, refunds, order cancellation or extra admin modules are
  implemented outside the specified scope.
- The narrated demo.mp4, actual Git teamwork history and instructor-provided
  Rubrik.docx must be completed by the team before submission.
