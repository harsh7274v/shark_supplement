# Task 13 Report — Seed + demo data

## Status
DONE — committed on master as `9b872fe` "feat(worker): idempotent catalog seed and 3 weeks of demo orders".

## What was implemented

**New files**
- `worker/seed/001_catalog.sql` — idempotent catalog seed: 7 categories (`image_url = '/api/images/seed/<slug>.jpg'`, taglines verbatim from `backend/server.py`), all 18 products from `seed_products()` (names, brands, flavors, weights, badges, ratings, orders_count verbatim; rupee prices × 100 paise; `is_new_arrival = 1` exactly where badge `NEW`), coupons KINETIC10/WELCOME15/MUSCLE500 (`min_order` in paise: 149900/199900/299900; `MUSCLE500` flat `discount_value` = 50000 paise), and seed users `admin` (`admin@kineticnutrition.com`) + `athlete.test@kineticnutrition.com`. All statements `INSERT OR IGNORE`.
- `worker/seed/002_demo_orders.sql` — 30 deterministic orders over `date('now', '-21..0 days')` (2 cancelled, rest distributed placed/confirmed/shipped/delivered with delivered the majority), fixed ids/amounts/dates, items referencing seeded products, payments matching order totals (`paid` unless undelivered COD → `on_delivery`), status history per transition, `estimated_delivery_date = created_at + 5 days` (fixed, never `datetime('now')`). All `INSERT OR IGNORE`.
- `worker/scripts/hash-password.mjs` — PBKDF2-SHA256 (`pbkdf2$100000$<salt>$<hash>`, 100k iterations, same format as `src/lib/passwords.ts`); hashes pre-generated and pasted as literals into `001_catalog.sql` (`KinetiAdmin@2026` for admin, `AthleteTest@2026` for athlete test).
- `worker/test/seed.test.ts` — TDD test file (RED run observed during development, then GREEN).

**Modified files**
- `worker/src/routes/admin.ts` — new `POST /api/admin/demo-data/seed` behind the existing `requireAdmin` guard (401 without token, 403 for customer, both asserted in tests). Resets the five demo tables first, then runs both seed files. SQL run statement-by-statement with `--` comment lines stripped.
- `worker/src/env.ts` — optional `SEED_CATALOG` / `SEED_DEMO_ORDERS` bindings.
- `worker/test/env.d.ts` — binding augmentations + `node:fs` module declaration (no `@types/node` in project).
- `worker/vitest.config.ts` — reads both seed SQL files in Node and passes them as `SEED_CATALOG`/`SEED_DEMO_ORDERS` miniflare bindings (tests run in workerd, where `fs` is unavailable). Only `seed.test.ts` executes them; every other file still starts from an empty DB.
- `worker/wrangler.jsonc` — same two bindings added as `vars` for runtime.

**Verified locally against the real schema (sqlite3):** seed applies cleanly, is fully idempotent across repeated runs (7 categories, 18 products, 3 coupons, 2 users, 30 orders, 51 items, 30 payments, 97 history rows), and computed amounts match `src/lib/pricing.ts` exactly (e.g. KINETIC10 → 10% of subtotal when `subtotal >= min_order`, MUSCLE500 → 50000 paise flat, GST 5%, free shipping from 99900 paise).

## Test results
- `cd worker && npm test`: **292 passed / 17 files** (was 282/16; +10 seed tests)
- `tsc --noEmit`: clean
- Seed endpoint asserts: 401 anonymous, 403 customer, 200 + idempotent re-seed for admin; catalog returns 18 active products with uppercase badges; seeded admin logs in via `POST /api/auth/login`; `GET /api/admin/overview` reports orders > 20, revenue > 0, `revenue_by_day` length ≥ 14.

## Rulings honored
- R2 badge casing: seed stores `NEW`/`HOT`/`none` uppercase, matching Task 10 admin and the storefront comparison.
- R1 coupon units: `min_order` in paise, compared `subtotal >= coupon.min_order`; flat `discount_value` in paise (50000).

## Notes / concerns
- Pre-existing uncommitted partner edits (`docker-compose.yml` trailing newline, `frontend/src/data/defaultCatalog.js` trailing newline) were deliberately left out of the commit.
- `db.batch()` surfaced a miniflare ZodError during development; seed execution uses sequential `prepare(...).run()` calls in both test setup and the endpoint, which is deterministic and gave real SQL errors. Batch is retained only for the five-table reset (existing pattern, covered by other tests).
- The endpoint answers 500 when the seed bindings are absent (e.g. a worker without wrangler vars); tests provide them via vitest config, runtime via `wrangler.jsonc` vars.

## Fix round 1

**Problem (task review Important finding):** `worker/wrangler.jsonc` duplicated the full seed SQL as `SEED_CATALOG` / `SEED_DEMO_ORDERS` wrangler vars. Tests execute `worker/seed/*.sql` (tested) but production executes the wrangler-var copies (untested). If the `.sql` files are edited and `wrangler.jsonc` isn't mirrored, untested SQL runs in production.

**Fix:** Added `worker/scripts/sync-seed-vars.mjs`, a dependency-free Node script that reads `worker/seed/001_catalog.sql` and `worker/seed/002_demo_orders.sql` as source of truth, escapes their full contents as JSON strings, and replaces the `SEED_CATALOG` / `SEED_DEMO_ORDERS` var values in `worker/wrangler.jsonc` while preserving the rest of the file verbatim (comments and other vars). It is idempotent: if a var already matches its `.sql` file it is left untouched, so running twice changes nothing.

**Result:** Ran `node worker/scripts/sync-seed-vars.mjs` — `worker/wrangler.jsonc`'s two seed vars already matched the `.sql` files (no diff), so no production SQL changed; the two are now single-source-of-truth (`worker/seed/*.sql`).

**Invariant going forward:** any future edit to a seed `.sql` file must be followed by running `node worker/scripts/sync-seed-vars.mjs` and committing both the `.sql` and `worker/wrangler.jsonc` together, so production never executes untested SQL.

Report: .superpowers/sdd/2026-11-10-cloudflare-migration-admin-dashboard/task-13-report.md