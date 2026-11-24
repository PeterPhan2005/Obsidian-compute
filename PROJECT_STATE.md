# Obsidian Compute — Project State

Checkpoint recorded 2026-11-25. Phase 1 of 6 (Batch 01 and ISSUE 18 follow-up) remains accepted. Phase 2 of 6 (Batch 02, TASK 07–09) passed independent acceptance review after the ISSUE 08 remediation, received technical advisor acceptance, and was finalized on `origin/fix-issue`. Phase 3 of 6 (Batch 03, TASK 10–12 and 12.1) passed independent review and focused re-reviews, received technical advisor acceptance, and was finalized on `origin/fix-issue`. External verification remains open as recorded below.

## Repository and decisions

- The implementation checkout stays on `fix-issue`. The previous linked worktree was removed after verifying the accepted Git tree and local-file hashes.
- HEAD and verified remote `refs/heads/fix-issue` are `65d5f5392a49501a2b773f183a0c58114e50cc55`. Upstream `origin/fix-issue` is 0 ahead / 0 behind at checkpoint. [GitHub commit](https://github.com/PeterPhan2005/Obsidian-compute/commit/65d5f5392a49501a2b773f183a0c58114e50cc55)
- GitHub repository visibility was verified as public. Remote `main` remains at `47a62730a071a316d61ee089fdfb435c5100abfc` (Batch 01 baseline). Local `main` remains at `f135e63e3bf48aadff564db22773c877b9c5660b` (TASK 01/02 runtime baseline). Checkpoint authorization covers the accepted `fix-issue` implementation and the two progress documents on `progress`.
- Owner approved fixing the core issues on the shared `fix-issue` branch, completing mandatory requirements, then implementing all four Bonus groups. Category recreation with an archived slug reactivates that record and preserves its identity. Restore as a separate Admin feature was excluded.
- Keep changes task-scoped, use an isolated DB for mutating tests, and stop on unexpected Git state. Stage exact files only when authorized. Keep secrets and other local-only documents out of Git.

## Owner-approved workflow conventions

- The implementation target is two days.
- Every implementation batch requires a mandatory independent Batch Acceptance Review. Follow the detailed procedure in local `WORKFLOW_RULES.md`. Remediate material findings and independently re-review affected changes. Track initial implementation and verification, independent review, technical advisor acceptance, Git finalization, and outstanding external verification as distinct checkpoints.
- Apply Selective Context Loading as defined in local `WORKFLOW_RULES.md`. Read relevant sections of the authoritative requirements PDF and affected source, and reuse valid evidence. Reconcile the full requirements during initial audit, Core Acceptance, Final Acceptance, or when requirements change. Maintain the full mandatory Batch Acceptance Review coverage.
- Use Conventional Commits in English for future commits. Commit and push accepted implementation only when authorized.
- Maintain `PROJECT_STATE.md` and `log_fix_issue.md` on the dedicated remote `progress` branch. Keep both progress documents out of `main` and `fix-issue` commits, and keep `WORKFLOW_RULES.md` local-only.
- Use `log_fix_issue.md` for accepted fixes from the initial audit and additional application defects identified during implementation, testing, or acceptance review. This includes pre-existing defects and newly introduced regressions. Keep unresolved findings in the project state.
- Keep sequential entry numbers, original ISSUE IDs, descriptive titles, and the `Vấn đề` and `Khắc phục` labels. Explain the cause, practical impact, and corrective mechanism concisely. Additional accepted fixes may have separate entries under an existing ISSUE ID. New canonical IDs require Owner approval.
- Update the issue log only after the technical advisor accepts the corresponding fix. Update the project checkpoint after acceptance and authorized Git finalization.
- Batch 03 finalization clarified the seven existing issue log entries while preserving their facts, order, and accepted scope, and appended eight accepted entries.
- Prefer fresh sessions at stable checkpoints when they improve context management.

## Roadmap and commit history

- Phase 0 preparation: **TASK 00** completed, repository declared ready. **TASK 01** produced the requirements audit (`TASK_01_REQUIREMENTS_COMPLIANCE_AUDIT.md`). **TASK 02** produced the runtime report (`TASK_02_RUNTIME_VERIFICATION.md`). **TASK 02.1** did not independently reproduce the pre-fix duplicate-ID behavior over HTTP. The patched endpoint was subsequently verified in TASK 04.
- Phase 1/6 **Batch 01**: **TASK 03–06**, covering ISSUE 01, 02, 03 and 14, accepted by independent review. **TASK 06.1** followed Batch 01, fixed ISSUE 18 and was separately accepted and committed.
- Phase 2/6 **Batch 02, TASK 07–09** is accepted in the implementation scope and finalized. The original blueprint's construction phases are historical.
- Phase 3/6 **Batch 03, TASK 10–12 and 12.1**, covering ISSUE 05, 06, 07, 19 and 20, is accepted and finalized. The next task is Phase 4/6 **Batch 04, TASK 13 — Core Acceptance**.

| Phase | Batch | Tasks | Issues / Scope |
|---|---|---|---|
| 0 | Preparation | TASK 00 | Repository preparation |
| 1 | 01 | TASK 03–06, 06.1 | ISSUE 01, 02, 03, 14, 18 — accepted and committed |
| 2 | 02 | TASK 07–09 | ISSUE 04: Google Authentication; ISSUE 08: Checkout; ISSUE 09: Email |
| 3 | 03 | TASK 10–12, 12.1 | ISSUE 05: Product Tags; ISSUE 06: Simple Dashboard; ISSUE 07: Advanced Dashboard; ISSUE 19: Catalog Sort; ISSUE 20: Dashboard Tooltip Resize — accepted and committed |
| 4 | 04 | TASK 13 | Core Acceptance, including ISSUE 10–13 |
| 5 | 05 | TASK 14 | ISSUE 17.1: CI/CD |
| 5 | 06 | TASK 15 | ISSUE 17.2: Microservices |
| 5 | 07 | TASK 16 | ISSUE 17.4: Elasticsearch |
| 5 | 08 | TASK 17 | ISSUE 17.3: AI Features |
| 6 | 09 | TASK 18 | Final System Acceptance |
| 6 | Delivery | TASK 19 | ISSUE 15: Teamworking evidence, tracked throughout development |
| 6 | Delivery | TASK 20 | ISSUE 16: Report, Demo and Submission |

| Accepted work | Commit | Message |
|---|---|---|
| TASK 03 / ISSUE 01 | `fb2777395250b1bf950e5da93500adec1d331a3e` | Prevent lost inventory updates during product edits |
| TASK 04–06 / ISSUE 02, 03 and 14 | `afa2cc959bff0baf3c535fe242cced535345e510` | Validate variants, gate receipt success, and reactivate categories |
| TASK 06.1 / ISSUE 18 | `a42d857694f597554ffc5adba64b88e5c226b2e7` | Serialize product saves with category archiving |
| TASK 07–09 / ISSUE 04, 08 and 09 | `4e2b9a34b37aa22c2834b43f74f8ba1651a238c3` | fix(core): harden authentication, checkout, and email delivery |
| TASK 10–12, 12.1 / ISSUE 05, 06, 07, 19 and 20 | `65d5f5392a49501a2b773f183a0c58114e50cc55` | fix(core): complete catalog navigation and dashboard analytics |

## Issue register

| Issue | State | Evidence and remaining work |
|---|---|---|
| 01 Inventory lost update | **ACCEPTED / FIXED** | Metadata-only save preserved 20 → 19 → 19. Tested stale revision, competing writers, rollback and authorization. |
| 02 Duplicate variant IDs | **ACCEPTED / FIXED** | Product save rejects repeated existing IDs, verifies at least two persisted active variants in the transaction, and keeps ownership, SKU and inventory revision checks. Patched HTTP rejection and rollback passed. |
| 03 Receipt / Success Screen | **ACCEPTED / FIXED** | Success requires a loaded receipt. Browser checks covered valid guest receipt with `pending` shown separately, missing/invalid receipt, loading and network error. |
| 04 Google Login | **PARTIAL / LOCAL IMPLEMENTATION ACCEPTED** | Default Compose reported `GOOGLE_NOT_CONFIGURED`. Batch 02 accepted the local OAuth implementation after four fixture test groups and independent review. Real Google consent and callback still require an approved Web OAuth client, exact callback URL, local credentials and a consenting test user. Verify forwarded client IP if deploying behind an HTTPS gateway. |
| 05 Product Tags | **ACCEPTED / FIXED in verified storefront scope** | TASK 02 verified keyword search and direct tag filtering. Batch 03 adds active-catalog tag discovery, a URL-based Catalog filter and Product Details links, and route-specific SPA titles and descriptions. Filtering, pagination, history and browser metadata were verified. Search-engine indexing remains unverified. |
| 06 Simple Dashboard | **ACCEPTED / FIXED** | Best Sellers now plots units sold while preserving product names, ranking and revenue. The ranked result was checked against order-item snapshots. Mobile proportions and an empty response were verified in Chromium. |
| 07 Advanced Dashboard | **ACCEPTED / FIXED** | Charts show distinct categories and units by snapshot category per bucket, preserving metrics and the aggregate breakdown. `Map` avoids collisions with inherited object properties. Defaults use `Asia/Ho_Chi_Minh`, matching the analytics API. A focused re-review closed the Batch 03 P2 regression by moving the category legend below the fixed-height plot. Four long names across three nonempty buckets render 12 nonzero bars at 375 and 1440 px. |
| 08 Payment Sandbox | **ACCEPTED / FIXED in sandbox scope** | TASK 02 verified success, decline and order, stock, coupon and loyalty effects. Batch 02 added synthetic payment input. The focused remediation requires a valid token for every new order and allows legacy replay only with a matching key, cart and historical hash. Instructor acceptance of simulated payment remains unverified. |
| 09 Email Mailpit | **ACCEPTED in local and configuration scope** | TASK 02 and Batch 02 verified order confirmation, OTP and recovery in Mailpit. Batch 02 verified retry after a Mailpit outage and added worker-scoped SMTP configuration with TLS. External delivery requires an approved SMTP provider, sender and test inbox, a reachable `APP_BASE_URL`, an isolated outbox and authorization to send. Instructor acceptance of the local demo remains unverified. |
| 10 Horizontal Scaling | **VERIFIED in test scope** | TASK 02 observed 24/24 health responses through Nginx, split 12/12 over API replicas, plus shared session/cart and cross-replica WebSocket integration. Production load capacity remains unmeasured. |
| 11 Docker Compose | **VERIFIED in test scope** | TASK 02 started a fresh project and volumes using `docker compose up -d`, verified migrations, seed and demo logins. Final submission-package reproducibility remains to be checked. |
| 12 UI/UX and Responsive | **VERIFIED for sampled paths** | TASK 02 used 7 E2E tests and 18 viewport checks. Full device coverage and instructor quality scoring remain unverified. |
| 13 Catalog Scope | **VERIFIED for seeded catalog** | All 60 seed products matched the DB and were within the PDF scope. Catalog content outside that seed snapshot was not verified. |
| 14 Category Lifecycle | **ACCEPTED / FIXED** | Recreate reopens the archived same-slug row. Concurrent POST tests verify one success and one conflict, stable ID and unchanged archived product status. |
| 15 Teamworking | **NOT VERIFIED** | TASK 02 excluded this issue. TASK 01 local Git was insufficient for the PDF requirements. Confirm actual team roster, GitHub Insights, at least a month and at least two commits per member per week. |
| 16 Submission Package | **NOT VERIFIED** | `Report_Chapter1-3.docx` exists and can be revised. The demo video has not been recorded. Confirm PDF outputs, including video coverage, completed instructor Rubrik, Git evidence, the final ZIP and exact naming, demo access and e-learning submission. |
| 17 Bonus Features | **APPROVED FOR LATER / PLANNED** | No Bonus implementation or award accepted at this checkpoint. See the four subtasks below. |
| 18 Product save / category archive race | **ACCEPTED / FIXED** | Save holds a category row `FOR SHARE` through commit. Archive uses `FOR UPDATE`; application-level concurrency tests cover create/reassign first and archive first. Isolated DB had zero inconsistent rows before and after. |
| 19 Catalog sort selection | **ACCEPTED / FIXED** | Pre-existing P3 identified during Batch 03 review. The selector now follows the API's effective sort and offers Relevance for keyword searches. Eleven search, collection, tag and explicit-sort combinations matched the actual API result order. URL state, pagination reset and Back behavior were verified. |
| 20 Dashboard tooltip resize overflow | **ACCEPTED / FIXED** | Pre-existing P3 reproduced on the accepted baseline and Batch 03 candidate. Recharts retained the desktop transform on a hidden revenue tooltip when the viewport narrowed. Scoped CSS removes the hidden box from layout. The targeted resize fixture measured 798 px before and 375 px after the fix at a 375 px viewport. Visible hover and keyboard behavior and shared charts were verified. |

**ISSUE 17 subtasks** per p. 6 of `NodeJS Final Project.pdf`: CI/CD Pipeline, Microservices Architecture (at least three additional services and evidence of asynchronous decoupling), AI-related Features, and Elasticsearch Product Search. Each is planned and unverified. Public repo status does not imply an application deployment or working CI/CD. Verify provider access, costs and grading evidence before external actions.

## Implementation invariants and verification

- `NodeJS Final Project.pdf` controls scope. Computers/components only, exactly one Admin role holder, guest ordering without manual registration, registration limited to the specified fields, 5-character alphanumeric coupons with no expiration and at most 10 uses, and no extra Admin modules. Treat the requirements audit as historical where implementation has since changed.
- Node.js/Express, React/Vite, PostgreSQL/Knex, Redis/Socket.IO, Nginx, two API replicas, and Mailpit/email worker under Compose. Checkout retains existing payment-state and transaction semantics. Guest receipt is token-based and time-limited; private Customer history is account-scoped. Neither the payment nor the order state machine changed in Batch 01.
- [Stock migration](https://github.com/PeterPhan2005/Obsidian-compute/blob/4e2b9a34b37aa22c2834b43f74f8ba1651a238c3/source/backend/migrations/002_variant_stock_version.js) adds `stock_version` default 0 without changing existing stock. Admin reads receive `stockVersion`. Inventory PATCH requires `expectedStockVersion`; Product PATCH updates existing variant stock only when that field is present. Stale versions return `409 STOCK_CONFLICT`. Checkout updates stock and version together.
- [Admin transactions](https://github.com/PeterPhan2005/Obsidian-compute/blob/4e2b9a34b37aa22c2834b43f74f8ba1651a238c3/source/backend/src/admin.js) lock the destination category before locking the product and variant rows. Product save and category archive serialize on the category row. Variant row locking follows ascending ID as in checkout. Category reactivation uses conditional upsert on unique slug. Keep seed and test DB separation.
- Verification tied to candidates: TASK 02 `f135e63…` had 6 unit, 14 integration and 7 E2E passes. TASK 03 changes on `47a62730…`, later committed as `fb27773…`, had 6 unit, 15 integration and 7 E2E passes across runs; an initial E2E login rate-limit failure passed on the separate rerun. Batch 01 combined candidate `afa2cc9…` had 9 targeted integration and 4 targeted E2E passes. ISSUE 18 candidate `a42d857…` had 10 selected integration test results pass, including three lock-ordered HTTP scenarios. Independent acceptance reused each matching candidate's evidence. Checkpoint push introduced no tracked changes or test run.
- Batch 02 initial verification covered four OAuth fixture groups, 10 targeted API tests, two Playwright tests, all three Mailpit message types, and outbox recovery from `pending` to `sent`. Initial independent review found that legacy-only requests with fresh keys could create orders. After ISSUE 08 remediation, 8 focused API tests and 2 Playwright tests passed on an isolated `obsidian_test` database. Independent re-review verified token validation, replay compatibility, concurrency and transaction invariants. Google and Email content matched their reviewed hashes and reused the initial evidence. The technical advisor accepted the implementation before Git finalization.
- Batch 03 initial verification passed 7 focused Chromium, 13 targeted API and 6 unit checks. On isolated `obsidian_test`, sales figures matched `order_items` for all five period modes and groupings, including Vietnam time boundaries, empty periods, invalid ranges and Admin authorization checks. Independent review cleared ISSUE 05 and 06, identified the mobile legend regression in ISSUE 07, and reproduced the pre-existing sort mismatch later tracked as ISSUE 19.
- After the ISSUE 07 and 19 remediations, 7 focused Chromium checks passed. The independent re-review confirmed 22 nonzero bars with 11 historical category names, including eight names of 80 characters, and verified keyboard tooltips and sort history. TASK 12.1 then passed 4 focused Chromium Dashboard checks for ISSUE 20. Independent A/B testing isolated the hidden tooltip as the cause of overflow, and shared chart checks covered 375 and 1440 px.
- The technical advisor accepted all five Batch 03 issues before Git finalization. Finalization matched the approved source and reused the targeted evidence. Full-suite testing and search-engine indexing verification remain outstanding.
- Email delivery remains at least once. The baseline worker can retry the same Message-ID if SMTP accepts a message before the database records `sent`. This is a non-blocking local/configuration acceptance risk.
- The prior validation stacks were isolated and stopped after verification, with their volumes retained. Treat retained volumes as previously used. For future mutation tests verify the actual candidate, Compose project, DB identity and ports. The repository's full verifier removes test volumes; use a fresh named project or secure explicit authorization before any deletion.
- Open decisions include real Google OAuth and external SMTP prerequisites, instructor acceptance of payment sandbox and Mailpit, actual teamwork and submission evidence, and delivery gates and vendor selection for Bonus. Search-engine indexing of the storefront metadata remains unverified.
