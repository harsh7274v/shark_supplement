# Storefront categories, variant images, and sale engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Apparel/Aminos/Gym-Gear categories, admin-configured flavors & sizes with per-option photos and per-size prices, an admin-controlled sale engine (category % sales with a window, exact per-size price overrides, auto-expiry), a home-page Sale section, richer product cards (size/flavor chips that swap photo + price, details popup), and honest cart pricing.

**Architecture:** Migration `0002` adds columns to `products` and seeds the categories. A new pure lib `worker/src/lib/sale.ts` is the single pricing authority (regular/effective price per size, on-sale predicate); the catalog, orders recompute and admin routes all call it. The storefront receives ready-rendered price maps and never computes sale math. Cart re-hydrates unit prices from a new bounded `ids=` catalog filter.

**Tech Stack:** Cloudflare Workers + D1 + R2 (existing), Hono, vitest cloudflare pool, React 18 + Vite, axios.

**Spec:** `docs/superpowers/specs/2026-11-13-storefront-categories-variants-sales-design.md` (read both; the spec's decided/anti-goal sections bind).

## Global Constraints

- Money is integer paise in every worker and cart computation; rupees only at display (`inr()`), form fields in rupees converted with `toPaise()`.
- Auth stays cookie-only; no tokens in bodies, headers or localStorage (the Bearer-header fallback for curl/Postman stays as-is).
- Every interactive element gets a `data-testid` (existing patterns: `product-card-<id>`, `admin-nav-<key>`, `cart-*`).
- `frontend/src/data/defaultCatalog.js` is never opened, edited or committed by this plan; fallback products lack the new fields, so every storefront reader must treat them as optional.
- D1 binds ≤ 100 parameters per statement; bulk sale ops are one bounded statement each; no cron triggers (sale expiry is read-time).
- Worker style: TypeScript, short sentence comments explaining why, existing helper names (`readMoney`, `readStringList`, `readText`, `readFlag`, `discountPercent`, `kebabCase`).
- Commits: Task 1 Step 0 makes a **baseline commit** of the current uncommitted tree (excluding `frontend/src/data/defaultCatalog.js`) so task diffs stay reviewable; every task then commits only its own files.
- Local D1 already has `0001` applied; `0002` is applied by hand like `0001` (`npx wrangler d1 execute kinetic-db --local --file=...`). Tests pick up all `migrations/*.sql` automatically via the `TEST_MIGRATIONS` binding.

## Review Focus

Failure modes the spec implies but no single task's happy path exercises:

1. **Stale option-map keys** — a `weight_prices`/`sale_overrides`/`weight_images` key naming a size that is no longer in `weight_options` must be ignored, never crash rendering or pricing; the product shows its base price. Pinned by Task 2's stale-key test.
2. **A sale that expired (or has not started)** — every reader must show regular prices the moment the clock passes the window; catalog list, product detail, order recompute. Pinned by Task 2 and Task 3's expired-window tests.
3. **A cart persisted before a sale or a price change** — re-hydration must refresh unit prices (per size) and drop a line whose size/flavor vanished, with a visible toast. Pinned by Task 2's `ids=` filter test (server side) and Task 7's re-hydration step (frontend smoke).
4. **Sizeless products on sale via exact override** — the base override must price the card, cart line and checkout. Pinned by Task 2 and Task 3 override tests.
5. **Sale validation boundaries** — percentage 0/91/non-integer, `ends_at <= starts_at`, unparseable datetime, override ≥ its variant's regular price, map key not in `weight_options` → all 400, nothing stored. Pinned by Task 4's validation tests.

---

### Task 1: Migration 0002 + the sale/variant pricing lib

**Files:**
- Create: `worker/migrations/0002_storefront_variants_sales.sql`
- Create: `worker/src/lib/sale.ts`
- Test: `worker/test/sale.test.ts`

**Interfaces:**
- Consumes: nothing new (pure TS; D1 columns arrive via the migration).
- Produces (later tasks import from `../lib/sale`):

```ts
export interface SaleProductColumns {
  sale_price: number;             // base regular price, paise
  weight_options: string | null;  // JSON array of size labels
  weight_prices: string | null;   // JSON {sizeLabel: paise}
  sale_percentage: number;        // 0..90, 0 = none
  sale_price_override: number | null; // exact base sale price (sizeless case), paise
  sale_overrides: string | null;  // JSON {sizeLabel: paise}
  sale_starts_at: string | null;  // UTC
  sale_ends_at: string | null;    // UTC
}
export interface OptionMaps { weightPrices: Record<string, number>; saleOverrides: Record<string, number>; }
export function parseOptionMaps(cols: Pick<SaleProductColumns, "weight_prices" | "sale_overrides">): OptionMaps;
export function isOnSale(cols: Pick<SaleProductColumns, "sale_percentage" | "sale_price_override" | "sale_starts_at" | "sale_ends_at">, now: Date): boolean;
export function regularVariantPrice(cols: SaleProductColumns, maps: OptionMaps, size: string | null): number;
export function effectiveVariantPrice(cols: SaleProductColumns, maps: OptionMaps, size: string | null, now: Date): number;
```

Semantics pinned (spec "Variant pricing model"):
- `regularVariantPrice` = `weightPrices[size] ?? sale_price`; a null/unknown size falls back to `sale_price` (unknown size = legacy cart line, never a 400).
- `isOnSale` = both timestamps present, parseable by `Date.parse`, `starts <= now < ends`, and (`sale_percentage > 0` OR `sale_price_override != null` OR `saleOverrides` has ≥1 entry with a numeric value).
- `effectiveVariantPrice` = `!isOnSale` → regular; else `saleOverrides[size]` ?? (`size === null ? sale_price_override : undefined`) ?? `Math.round(regular × (100 − sale_percentage) / 100)`.
- `parseOptionMaps`: non-map JSON or invalid JSON → `{}` for that map; numeric-string values are not accepted (number only).

- [ ] **Step 0: Baseline commit of the current tree**

```bash
git add -A ':!frontend/src/data/defaultCatalog.js'
git commit -m "chore: local-testing fix round (cookie-only auth, cart drawer fix, same-origin dev proxy)"
```

- [ ] **Step 1: Write the failing tests** in `worker/test/sale.test.ts` (pure unit tests, no app import needed): cases for each pinned semantic above — invalid JSON maps → `{}`; on-sale window active/not-started/expired; percentage 0 with override set → on sale; per-size price overrides base; override beats percentage; expired → regular; sizeless override applies only at `size === null`; unknown size falls back to base regular.
- [ ] **Step 2: Run** `cd worker && npx vitest run test/sale.test.ts` — expect FAIL (module `../src/lib/sale` not found).
- [ ] **Step 3: Write the migration** `worker/migrations/0002_storefront_variants_sales.sql`:

```sql
ALTER TABLE products ADD COLUMN flavor_images TEXT;
ALTER TABLE products ADD COLUMN weight_images TEXT;
ALTER TABLE products ADD COLUMN weight_prices TEXT;
ALTER TABLE products ADD COLUMN contents TEXT;
ALTER TABLE products ADD COLUMN nutrition TEXT;
ALTER TABLE products ADD COLUMN sale_percentage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN sale_price_override INTEGER;
ALTER TABLE products ADD COLUMN sale_overrides TEXT;
ALTER TABLE products ADD COLUMN sale_starts_at TEXT;
ALTER TABLE products ADD COLUMN sale_ends_at TEXT;

INSERT OR IGNORE INTO categories (id, slug, name, icon, image_url, tagline, sort_order) VALUES
  ('cat_apparel',  'apparel',  'Apparel',  NULL, NULL, 'Train hard, look harder.', 90),
  ('cat_aminos',   'aminos',   'Aminos',   NULL, NULL, 'Recovery starts here.',    91),
  ('cat_gym_gear', 'gym-gear', 'Gym Gear', NULL, NULL, 'Gear that keeps up.',      92);
```

- [ ] **Step 4: Implement `worker/src/lib/sale.ts`** to the pinned signatures and semantics (no other file changes).
- [ ] **Step 5: Run** `npx vitest run test/sale.test.ts` — expect PASS; then `npm run typecheck` — clean.
- [ ] **Step 6: Commit**

```bash
git add worker/migrations/0002_storefront_variants_sales.sql worker/src/lib/sale.ts worker/test/sale.test.ts
git commit -m "feat(worker): sale/variant pricing lib and 0002 migration"
```

---

### Task 2: Catalog — sale fields, `on_sale=1`, per-size price maps, effective price sort, `ids=` filter

**Files:**
- Modify: `worker/src/routes/catalog.ts` (PRODUCT_COLUMNS ~line 52, ProductRow/ProductJson, toProduct ~line 144, SORT_SQL ~line 32, GET /products ~line 208)
- Test: `worker/test/catalog.test.ts` (extend)

**Interfaces:**
- Consumes: `sale.ts` (Task 1 signatures).
- Produces (storefront + admin read): each product JSON gains
  `is_on_sale: 0|1`, `sale_percentage: number`, `sale_ends_at: string|null`,
  `sale_price_effective: number` (base effective price, paise),
  `size_prices: Record<string, number>` and `size_prices_regular: Record<string, number>`
  (keyed by each label in `weight_options`; entries folded from `weight_prices`/base; absent when the product has no sizes),
  `flavor_images: Record<string,string>`, `weight_images: Record<string,string>` (parsed, {} on garbage),
  `contents: string|null`, `nutrition: string|null`.

Pinned SQL — reuse in the three places via one TS const `ON_SALE_SQL`:

```sql
p.sale_starts_at IS NOT NULL AND p.sale_ends_at IS NOT NULL
AND datetime(p.sale_starts_at) <= datetime('now') AND datetime(p.sale_ends_at) > datetime('now')
AND (p.sale_percentage > 0 OR p.sale_price_override IS NOT NULL)
```

- `on_sale=1` query param → `AND ${ON_SALE_SQL}` in the WHERE.
- `price_asc`/`price_desc` ORDER BY → effective **base** price:
  `CASE WHEN ${ON_SALE_SQL} AND p.sale_price_override IS NOT NULL THEN p.sale_price_override WHEN ${ON_SALE_SQL} AND p.sale_percentage > 0 THEN CAST(ROUND(p.sale_price * (100 - p.sale_percentage) / 100.0) AS INTEGER) ELSE p.sale_price END` (per-size `sale_overrides` do not affect sort — comment why).
- `ids=` query param: comma-separated ≤ 50 ids → `AND p.id IN (placeholders)` (with `is_active=1` kept); more than 50 → 400 `{"detail":"ids must list at most 50 products"}`; non-empty but zero valid ids → empty array.
- `toProduct` computes the JSON fields with `parseOptionMaps` + `isOnSale(col, new Date())` + `effectiveVariantPrice`.

- [ ] **Step 1: Write the failing tests** in `worker/test/catalog.test.ts`: (a) product with `weight_prices {"2 kg": 199900}` and active 20% sale serves `size_prices {"2 kg": 159920}` + `size_prices_regular {"2 kg": 199900}` + `sale_price_effective` = pct-off base + `is_on_sale 1`; (b) expired window serves `is_on_sale 0` and regular prices; (c) `on_sale=1` lists only the on-sale product; (d) stale map key (`"9 L"` not in `weight_options`) ignored, no crash, base price intact; (e) `price_asc` ranks the on-sale product by its effective base price; (f) `ids=` returns exactly the requested active products, 400 over 50 ids; (g) `contents`/`nutrition`/image maps round-trip; (h) sizeless product with `sale_price_override` serves `sale_price_effective` = override. Fixture products are INSERTed directly with the new columns.
- [ ] **Step 2: Run** `npx vitest run test/catalog.test.ts` — expect FAIL (no `is_on_sale` in JSON).
- [ ] **Step 3: Implement** the columns, maps, filter, sort and `ids=` per the pins.
- [ ] **Step 4: Run** the file — PASS; then `npm test` — whole suite green (no regressions), `npm run typecheck` clean.
- [ ] **Step 5: Commit**

```bash
git add worker/src/routes/catalog.ts worker/test/catalog.test.ts
git commit -m "feat(worker): catalog serves sale state, per-size price maps, ids filter"
```

---

### Task 3: Orders — per-variant recompute

**Files:**
- Modify: `worker/src/routes/orders.ts` (ProductRow interface ~line 73, product SELECT ~line 426, unit_price assignment ~line 447)
- Test: `worker/test/orders.test.ts` (extend)

**Interfaces:**
- Consumes: `sale.ts` signatures.
- Produces: order lines priced per variant; order JSON unchanged (line `unit_price` simply reflects the variant).

Pinned: the product SELECT gains `weight_options, weight_prices, sale_percentage, sale_price_override, sale_overrides, sale_starts_at, sale_ends_at`; each cart line's `unit_price` = `effectiveVariantPrice(product, parseOptionMaps(product), item.weight, new Date())`.

- [ ] **Step 1: Write the failing tests** in `worker/test/orders.test.ts`: (a) sized product with `weight_prices {"2 kg": 199900}` — a line with `weight "2 kg"` prices at 199900 and a line with `weight "800 g"` at base `sale_price`; (b) active 20% sale → both sizes at pct-off **of their own regular price**; (c) `sale_overrides {"2 kg": 149900}` → that size at 149900, other size pct-off; (d) expired sale → regular prices; (e) sizeless product with `sale_price_override` → line without `weight` prices at the override. Each asserts the created order's `subtotal` and the `order_items.unit_price` via `GET /api/orders` fixtures or direct DB read as the existing tests do.
- [ ] **Step 2: Run** `npx vitest run test/orders.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the SELECT + per-line pricing.
- [ ] **Step 4: Run** file — PASS; `npm test` whole suite green; `npm run typecheck` clean.
- [ ] **Step 5: Commit**

```bash
git add worker/src/routes/orders.ts worker/test/orders.test.ts
git commit -m "feat(worker): order recompute prices each line by its size variant"
```

---

### Task 4: Admin — product new fields + sale endpoints

**Files:**
- Modify: `worker/src/routes/admin.ts` (PRODUCT_COLUMNS ~line 101, toProduct ~line 171, POST /products ~line 334, PATCH /products/:id ~line 458; new sale routes after the products section)
- Test: `worker/test/admin.products.test.ts` (extend), Create: `worker/test/admin.sales.test.ts`

**Interfaces:**
- Consumes: `sale.ts`; existing admin helpers.
- Produces:
  - Admin product JSON gains parsed `flavor_images`, `weight_images`, `weight_prices`, `sale_overrides` (each `Record<string, number>` or `Record<string,string>`; `{}`/`null` on garbage), plus `contents`, `nutrition`, `sale_percentage`, `sale_price_override`, `sale_starts_at`, `sale_ends_at`.
  - POST/PATCH `/admin/products` accept: `flavor_images`, `weight_images`, `weight_prices`, `sale_overrides` (objects: image values must match `/^\/api\/images\//` URL paths; money values integers > 0 paise; `weight_prices`/`sale_overrides` keys must each be a label present in the saved `weight_options` — stale keys are pruned silently on PATCH when `weight_options` changes), `contents`, `nutrition` (plain text), `sale_percentage` (integer 0–90), `sale_price_override` (integer > 0 paise, < that product's base `sale_price`), `sale_starts_at`/`sale_ends_at` (both-or-neither; `Date.parse` must succeed for each; `ends > starts`).
  - `POST /admin/sales/category` `{category_id, percentage, starts_at, ends_at}`: category must exist, percentage integer 1–90, window valid → one `UPDATE products SET sale_percentage=?, sale_price_override=NULL, sale_overrides=NULL, sale_starts_at=?, sale_ends_at=? WHERE category_id=? AND is_active=1` → `{updated: n}`. (A new category sale resets prior per-product tweaks — spec's sale write model.)
  - `POST /admin/sales/end` `{category_id}`: one UPDATE clearing percentage/override/overrides/timestamps on the category's active products → `{updated: n}`.
  - `GET /admin/sales?limit=`: products where `sale_percentage > 0 OR sale_price_override IS NOT NULL OR (sale_overrides IS NOT NULL AND sale_overrides != '{}')`, newest `sale_starts_at` first, LIMIT default 50 max 100; each row gains `sale_status: "upcoming"|"active"|"ended"` computed in TS against `new Date()`.

- [ ] **Step 1: Write the failing tests** — admin.products: create with all new fields round-trips; PATCH prunes stale keys; 400 matrix per Review Focus item 5 (pct 0/91/1.5, end ≤ start, garbage datetime, override ≥ base sale_price, map key not in weight_options). admin.sales (new file; fixture category + two products): bulk start returns `{updated: 2}` and a pre-existing override is cleared (read product back); expired/active/upcoming statuses; bulk end clears everything; per-product PATCH sale fields still work for individual edits; both sale routes 401 without token / 403 for a customer (copy the guard assertions from admin.products.test.ts).
- [ ] **Step 2: Run** both files — expect FAIL.
- [ ] **Step 3: Implement** per the pins.
- [ ] **Step 4: Run** — PASS; `npm test` whole suite green; `npm run typecheck` clean.
- [ ] **Step 5: Commit**

```bash
git add worker/src/routes/admin.ts worker/test/admin.products.test.ts worker/test/admin.sales.test.ts
git commit -m "feat(worker): admin product variant fields and sale endpoints"
```

---

### Task 5: Admin ProductForm — flavor/size editors with per-size prices, photos, contents/nutrition

**Files:**
- Modify: `frontend/src/pages/admin/ProductForm.jsx` (form state `blankForm`/`loadForm` ~lines 14–45, editors, submit payload)

**Interfaces:**
- Consumes: `API`, `toPaise`, `formatApiError` from `../../lib/api`; the existing image-upload flow already in this form (multipart to `/admin/uploads` → `{url}`); Task 4's accepted fields.
- Produces: submit payload carries `flavors` (labels), `weight_options` (labels), `flavor_images` `{label: url}` (only non-empty), `weight_images`, `weight_prices` `{label: toPaise(rupees)}` (only filled), `contents`, `nutrition`.

Pinned form state: `flavorRows: [{label: "", image: ""}]`, `sizeRows: [{label: "", price: "", image: ""}]` (price in ₹, blank = inherit product price), `contents: ""`, `nutrition: ""`; `loadForm` rebuilds rows from the API maps (label order follows `flavors`/`weight_options`); validation: every row label required, price if present must parse > 0; submit strips rows with empty labels.

- [ ] **Step 1: Extend the editors** — replace the two comma-text inputs with row lists: add/remove buttons, per-row label input, per-row photo button (opens the same hidden file-input pattern used by the gallery — the useRef click fix already in this file), per-size price input. Every control gets its `data-testid`: `flavor-add-btn`, `flavor-label-<i>`, `flavor-photo-btn-<i>`, `flavor-remove-<i>`, `size-add-btn`, `size-label-<i>`, `size-price-<i>`, `size-photo-btn-<i>`, `size-remove-<i>`; textareas `contents-input`, `nutrition-input`; section headings "Flavors", "Sizes", "What's inside", "Nutrition".
- [ ] **Step 2: Wire submit/load** per the pins (payload + loadForm reverse mapping).
- [ ] **Step 3: Verify** `cd frontend && npm run build` — green; hand-check in the running dev app: create a product with two sizes + prices + one flavor + photo on one size, save, reopen edit — rows rebuilt correctly.
- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/ProductForm.jsx
git commit -m "feat(admin): structured flavor/size editors with per-size prices and photos"
```

---

### Task 6: Admin Sales page + nav + Categories upload control; IST helpers

**Files:**
- Create: `frontend/src/pages/admin/Sales.jsx`
- Modify: `frontend/src/pages/admin/AdminLayout.jsx` (NAV array ~line 48, Routes ~line 160–166; add an inline SVG icon function like the existing ones)
- Modify: `frontend/src/pages/admin/Categories.jsx` (image field area)
- Modify: `frontend/src/lib/api.js` (add two helpers)

**Interfaces:**
- Consumes: Task 4 endpoints (`POST /admin/sales/category`, `POST /admin/sales/end`, `GET /admin/sales`, `PATCH /admin/products/:id`), `GET /admin/categories`, `POST /admin/uploads`.
- Produces: `export function istToUtc(local: string): string` — `datetime-local` value "2026-11-20T23:59" read as IST, returns ISO UTC (`new Date(local + ":00+05:30").toISOString()`); `export function fmtIst(iso: string): string` — UTC ISO → "20 Nov 2026, 11:59 PM IST" via `toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ... })`; null/garbage in → "" out.

Pinned Sales.jsx structure: create-sale card (category select `sales-category-select`, percentage number input `sales-pct-input` 1–90, `sales-start-input`/`sales-end-input` datetime-local, submit `sales-create-btn`, confirm text exactly: "Starting a new sale resets any per-size sale prices on these products."); list from `GET /admin/sales` rendered as rows `sales-row-<id>` with `sale_status` badge, per-size override rows `sales-override-<id>-<sizeIndex>` (label + regular ₹ + sale ₹ input, placeholder = auto), `sales-pct-edit-<id>`, `sales-enddate-edit-<id>`, save `sales-save-<id>` (PATCH sale fields, rupees → paise), remove `sales-remove-<id>` (PATCH zeroing), per-category End sale button `sales-end-category-btn`. Money display via `inr(x/100)`.

- [ ] **Step 1: Add the IST helpers** to `frontend/src/lib/api.js` with the pinned signatures.
- [ ] **Step 2: Build Sales.jsx** to the pinned structure (sonner toasts on success/error; loading and empty states).
- [ ] **Step 3: Wire nav + route** in AdminLayout: `import Sales from "./Sales"`, NAV entry `{ key: "sales", label: "Sales", to: "/admin/sales", icon: <TagIcon /> }` placed after "New Arrivals", `<Route path="sales" element={<Sales />} />` (reuse `TagIcon`; no new icon needed).
- [ ] **Step 4: Categories upload control** — next to the Image URL field add a button `data-testid="category-photo-btn"` + hidden file input (same useRef pattern as ProductForm) uploading to `/admin/uploads` and filling the URL field with the returned `/api/images/...` path.
- [ ] **Step 5: Verify** `npm run build` — green; hand-check: nav shows Sales, create a 24h 10% sale on Aminos in the running app, list shows the row `active`, End sale clears it.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/Sales.jsx frontend/src/pages/admin/AdminLayout.jsx frontend/src/pages/admin/Categories.jsx frontend/src/lib/api.js
git commit -m "feat(admin): sales page, category photo upload, IST datetime helpers"
```

---

### Task 7: Storefront — product card variants + details popup, Sale section, cart re-hydration

**Files:**
- Modify: `frontend/src/components/ProductCard.jsx`
- Create: `frontend/src/components/SaleSection.jsx`
- Modify: `frontend/src/pages/Home.jsx` (insert `<SaleSection />` between `<NewArrivals />` line 40 and `<ShopSection ...>` line 41)
- Modify: `frontend/src/context/CartContext.jsx`
- Modify: `frontend/src/components/CheckoutModal.jsx` (one-line call on open)

**Interfaces:**
- Consumes: Task 2's product JSON fields; `addItem(product, opts)` (already keyed `id|flavor|weight`); `inr`, `API`, `formatApiError`.
- Produces: `ProductCard({ product, index })` unchanged signature; CartContext value gains `refreshCartPrices: () => Promise<void>` (also invoked by `CheckoutModal` on open — include that one-line call in this task).

Pinned ProductCard behavior:
- Local state `selSize` (default `product.weight_options?.[0] ?? null`), `selFlavor` (default `product.flavors?.[0] ?? null`).
- Displayed price: `selSize ? (product.size_prices?.[selSize] ?? basePrice) : (product.sale_price_effective ?? basePrice)` where `basePrice = apiShape ? product.sale_price : product.price * 100` (fallback catalog unaffected — all new fields optional).
- Strikethrough row: when `is_on_sale === 1` show struck **regular** price (`selSize ? size_prices_regular?.[selSize] ?? product.sale_price : product.sale_price`) and a red `{sale_percentage}% OFF` badge; otherwise today's MRP-strike + `discount_percent` display.
- Image priority: `product.weight_images?.[selSize] ?? product.flavor_images?.[selFlavor] ?? product.images?.[0] ?? product.image`.
- Chips: "Size" row only when `weight_options?.length`, testid `size-chip-${product.id}-${slug(label)}` (slug = lowercase, non-alphanumerics → `-`); "Flavor" row likewise `flavor-chip-...`; selected chip gets the filled style; chip click updates state (photo + price follow).
- Details: small text button `details-btn-${product.id}` under the price row ("Details"); opens popup `details-modal-${product.id}` with sections "What's inside" / "Nutrition" (fallback line "Not provided" when empty), close button `details-close-${product.id}`, overlay click closes, popup content wrapper gets `data-lenis-prevent` (Lenis swallows wheel events without it).
- Add/Buy call `addItem(product, { flavor: selFlavor, weight: selSize })`.

Pinned SaleSection: fetch `/products?on_sale=1&sort=newest&limit=8` on mount (abort on unmount like NewArrivals); render nothing when the list is empty; section `data-testid="sale-section"`, heading "Sale", per-card `sale-ends-<id>` chip showing `fmtIst(sale_ends_at)` date; reuse ProductCard.

Pinned cart re-hydration (CartContext): on mount (and via `refreshCartPrices`), collect distinct `item.product.id` (≤ 50, else fetch in chunks of 50), `API.get("/products", { params: { ids } })`, then per line: reprice `product.price` = `size_prices[weight] ?? sale_price_effective ?? sale_price` (api-shape only; fallback-shape lines untouched); drop lines whose `weight`/`flavor` no longer exists in the served product with `toast.warning(`${product.name}: an option is no longer available`)`; keep keys, order and qty. Price maps absent (fallback/offline) → leave the line as stored.

- [ ] **Step 1: Implement the ProductCard changes** per the pins (chips, price/display logic, details popup with `data-lenis-prevent`, opts to addItem).
- [ ] **Step 2: Implement SaleSection + Home.jsx insertion** per the pins.
- [ ] **Step 3: Implement the cart re-hydration + `refreshCartPrices`**, call it from `CheckoutModal` when it opens.
- [ ] **Step 4: Verify** `npm run build` — green; headless smoke against the dev servers with the Playwright rig in `/private/var/folders/b0/l8dj98_j0_x6wz8pc8smyk8m0000gp/T/opencode/cart-repro`: card shows chips when the product has sizes, chip click swaps photo+price, details popup opens/closes, add-to-cart uses the chosen size, sale section renders when a sale is active and disappears after End sale.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProductCard.jsx frontend/src/components/SaleSection.jsx frontend/src/pages/Home.jsx frontend/src/context/CartContext.jsx frontend/src/components/CheckoutModal.jsx
git commit -m "feat(storefront): variant-aware product cards, sale section, honest cart prices"
```

---

### Task 8: Local apply + whole-branch verification

**Files:** none created; local D1 + running processes.

- [ ] **Step 1: Apply the migration locally** `cd worker && npx wrangler d1 execute kinetic-db --local --file=migrations/0002_storefront_variants_sales.sql` — expect no errors; verify with `npx wrangler d1 execute kinetic-db --local --command="SELECT slug FROM categories ORDER BY sort_order"` showing the three new slugs.
- [ ] **Step 2: Full suites** — `cd worker && npm test` (all files, expect 293 + new ones green) and `npm run typecheck`; `cd frontend && npm run build`.
- [ ] **Step 3: Restart** `npx wrangler dev --local` (port 8787) so the local worker picks up the new schema, then curl smoke: admin-login → POST product with sizes `{ "weight_options": ["500 g", "1 kg"], "weight_prices": {"1 kg": 199900} }` → `GET /api/products` shows `size_prices`; `POST /api/admin/sales/category` 20%/24h → `GET /api/products?on_sale=1` lists it with pct-off `sale_price_effective`; POST an order with `weight: "1 kg"` → order line `unit_price` 159920; `POST /api/admin/sales/end` → `on_sale=1` empty and order pricing back to regular on a second order.
- [ ] **Step 4: Update the SDD ledger** `.superpowers/sdd/2026-11-10-cloudflare-migration-admin-dashboard/progress.md` with the round's outcome and commit:

```bash
git add .superpowers/sdd/2026-11-10-cloudflare-migration-admin-dashboard/progress.md
git commit -m "docs: ledger the storefront variants/sales round"
```
