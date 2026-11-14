# Storefront categories, variant images, and sale engine — design

Date: 2026-11-13
Status: awaiting owner approval

## Intent and why

The store sells supplements today and is growing into apparel and gym gear. The
owner wants the storefront to reflect that: more categories, product options
(flavor, size) that the admin configures — with per-option photos and
**per-size prices** — a sale engine the admin controls (category-wide % sales
with a duration and exact per-size price overrides), and richer product cards
(details popup with box contents and nutrition). Everything must keep working
on the Cloudflare free tier, and every interactive element keeps its
`data-testid`.

## Goals

1. Three new seeded categories: **Apparel**, **Aminos**, **Gym Gear** — visible
   in the home page category row and usable as shop filters. Admin can manage
   them like any category (photo upload included).
2. Product options: admin sets **flavors** and **weights** as two separate
   lists per product; each option may carry its **own photo**. Storefront
   product cards show flavor and weight chips when present; selecting an option
   swaps the card photo to that option's photo when it has one, otherwise the
   base photo stays. The chosen flavor/weight flows into the cart and the order
   (the cart already keys items by `flavor|weight` — wire the card to it).
3. Sale engine (prices are per size — see the variant pricing model):
   - Admin page "Sales" with: **create category sale** (category + percentage +
     start/end datetime) applied to every active product of that category.
   - A list of on-sale products (regular vs sale price per size, %, ends at).
     Per product the admin can **edit**: exact sale price per size, the %, the
     end date, or remove it from the sale.
   - "On sale" is evaluated at read time against the clock (`starts_at <= now <
     ends_at`), so sales expire **automatically** with no scheduled jobs.
   - Home page **Sale section** listing on-sale products with the % badge, the
     regular price struck through, and the sale price.
   - Server-side pricing applies the same sale price at checkout (the server
     already recomputes totals; it must use the effective sale price).
4. Product details: admin adds **"What's inside"** (box contents) and
   **nutrition** text when creating/editing a product; every product card gets
   a small **details button** opening a popup that shows exactly those texts.

## Non-goals

- Real payment processing (the demo checkout stays).
- Scheduled jobs / cron for sale expiry (free-tier constraint; read-time
  evaluation covers it).
- Scheduled price change previewing or sale history audit log.
- Replacing the existing MRP-vs-price discount badge logic for non-sale
  products.

## Anti-goals (a failure even if it "works")

- Storing image **bytes** in D1 rows (bloated database, slow queries). Images
  are uploaded to the R2 bucket `kinetic-images` (the deployment cloud), and
  their URLs are what the database stores. This is the existing pattern for
  product photos and stays true for category, flavor and weight photos.
- Any price the client computes being trusted. The server recomputes every
  total; sale prices are no exception.
- Money in floats anywhere. Paise integers end to end, rupees only at display.

## Constraints

- Cloudflare free tier: no Durable Objects, no cron triggers; bounded queries.
- D1 migration style follows `0001_schema.sql` (plain SQLite; a new
  `0002_*.sql` migration; applied locally with `wrangler d1 execute --local`
  and on deploy).
- The admin product form already uploads images via `POST /api/admin/uploads`
  (multipart, ≤10 MB, image-only, R2-backed, served by the worker at
  `/api/images/<key>` with immutable caching). Reuse it everywhere.
- Dark sidebar `#090D16` + light content per design guidelines; every
  interactive element needs a `data-testid`.
- The user's file `frontend/src/data/defaultCatalog.js` is never touched by
  this work. (The offline fallback stays as-is; the API wins when it answers.)

## Decided (owner's words → decisions)

- **Flavor and weight are separate option lists**, both admin-configurable;
  the home page product area shows name, brand, flavor, weight.
- **"Size" means these option lists** (weight for supplements, and the same
  mechanism serves apparel/gear sizes — the admin just types "S, M, L, XL" as
  weights or flavors for those products).
- **A category sale hits every product in the category**; individual product
  price override is available; sales revert automatically after the duration.
- **Sale percentage** — MY CALL (flagged to owner): percentage applies to the
  product's regular selling price (`sale_price`), not to MRP. An exact override
  always wins over the percentage.
- **Per-variant pricing** — OWNER'S ANSWER (2026-11-13): **each size has its
  own price** (XL shirt vs M, 5 kg vs 10 kg dumbbell). Flavors never change
  price (MY CALL: a taste variant is the same product; only sizes carry
  prices). See the variant pricing model below.
- **Where images live** — MY CALL (flagged): bytes in R2, URLs in D1.
- **Sale section placement** — MY CALL: on the home page between New Arrivals
  and the shop section.

## Data model (migration `0002_storefront_variants_sales.sql`)

```sql
ALTER TABLE products ADD COLUMN flavor_images TEXT;   -- JSON: {"<flavor>": "<url>"}
ALTER TABLE products ADD COLUMN weight_images TEXT;   -- JSON: {"<size>": "<url>"}
ALTER TABLE products ADD COLUMN weight_prices TEXT;   -- JSON: {"<size>": <paise>} — per-size regular price
ALTER TABLE products ADD COLUMN contents TEXT;        -- what's inside (free text)
ALTER TABLE products ADD COLUMN nutrition TEXT;       -- nutrition details (free text)
ALTER TABLE products ADD COLUMN sale_percentage INTEGER NOT NULL DEFAULT 0;   -- 0..90, 0 = none
ALTER TABLE products ADD COLUMN sale_overrides TEXT;  -- JSON: {"<size or "">": <paise>} — exact per-size sale prices
ALTER TABLE products ADD COLUMN sale_starts_at TEXT;  -- ISO or SQL datetime, like other timestamps
ALTER TABLE products ADD COLUMN sale_ends_at TEXT;
```

Seed the three categories in the same migration (`INSERT OR IGNORE` on slug).
Existing rows keep working: no `weight_prices` entry → the product's base
`sale_price` applies; no `sale_overrides` entry → percentage math applies.

## Variant pricing model (single source of truth)

For a product with sizes list `S` (from `weight_options`) and a chosen size
`s` (or no size for products without sizes):

- **Regular variant price** — MY CALL: `weight_prices[s] ?? products.sale_price`
  (base). A size without its own price inherits the product price; a product
  without sizes is just the base price. Paise integers.
- **On sale** ⇔ `sale_starts_at <= now < sale_ends_at AND (sale_percentage > 0
  OR any sale_overrides entry exists)`. Evaluated at read time against the
  clock — sales expire automatically, no jobs.
- **Effective sale price** — first of: `sale_overrides[s]` (exact per-size
  override, admin typed ₹), else `sale_overrides[""]` for the base/no-size
  case, else `ROUND(regularVariantPrice × (100 − sale_percentage) / 100)`
  (paise, integer). The percentage therefore applies **per size**: 20% off a
  5 kg variant prices that variant off its own price.
- The server (pricing lib + orders recompute + catalog responses) owns this
  rule. The storefront receives ready-to-render per-size regular and effective
  prices and never computes sale math itself.
- Admin UI consequence: the Sales page's per-product editor lists each size
  row as `[size] regular ₹X → sale ₹[input, placeholder = auto from %]`, with
  one plain "base" row for sizeless products.

## API

- `GET /api/products` gains per product: `is_on_sale` (0|1),
  `sale_percentage`, `sale_ends_at`, and the two ready-to-render variant maps
  `size_prices` / `size_prices_regular` (`{"<size>": <paise>}`, sizes without
  an explicit entry folded in from the base price; sizeless products carry the
  base under the same shape the card already reads), plus `flavor_images`,
  `weight_images`, `contents`, `nutrition`. New query param `on_sale=1`
  filters to currently-on-sale products; existing sort keys keep working
  (price sorts rank by effective price — see Storefront).
- `GET /api/products/:id` same fields (the details popup and card both read it).
- Admin product create/update accept the new fields: `flavor_images`,
  `weight_images`, `weight_prices`, `contents`, `nutrition`. Validation:
  price maps keyed by existing `weight_options` labels, values > 0 paise;
  image URLs must be worker-served image paths.
- `POST /api/admin/sales/category` `{category_id, percentage, starts_at,
  ends_at}` → one bounded `UPDATE ... WHERE category_id = ? AND is_active = 1`
  setting the sale fields on that category's products. Answers with the count.

  **Sale write model (ruled, reviewer-checked):** a "sale" is not a durable
  entity — the per-product sale fields are the only truth, and a category sale
  is a bulk write onto them.
  - Starting a category sale **overwrites percentage + window and clears any
    per-product override** on that category's active products: a new category
    sale is a fresh start, never silently beaten by stale overrides. The Sales
    page states this on the button's confirmation.
  - Products moved into the category after the sale starts do not auto-join
    (fields were copied once); the admin can start the sale again to include
    them, or set a sale on the product directly.
  - Products moved out of the category keep their sale; the admin removes it
    per product.
  - The Sales page lists every product that has sale fields set, with a status
    badge (`upcoming` / `active` / `ended` computed against the clock), so
    scheduled and expired sales are visible.
  - A bulk **"End sale"** button per category clears the sale fields on that
    category's products now (the off switch; per-product removal still works).
- Sale removal per product = the normal product PATCH with percentage 0 /
  overrides NULL / timestamps NULL.
- Checkout (`POST /api/orders`) and the pricing lib resolve each order line's
  unit price through the variant pricing model (per-size regular → override →
  percentage), then apply coupons exactly as today. Order line JSON stores the
  size/flavor (already does) so the recompute picks the right variant price.
- `GET /api/categories` unchanged (new rows make them appear).

## Storefront

- **ProductCard**: brand, name, price (sale-aware: regular price struck
  through when on sale, red % badge), **flavor chips and size chips** when the
  product has them — the second option group is labeled generically as
  **"Size"** (covers supplement weights "2 kg" and apparel "XL" without
  nonsense labels), flavors keep their "Flavor" label. Selecting a size also
  switches the displayed **price** to that size's regular/effective price
  from the ready-rendered maps. Per-option photo swap on selection, and a
  small **details button** (bottom of the info block) opening a popup with
  "What's inside" + "Nutrition". Selected options go into
  `addItem(product, {flavor, weight})` — the cart line's unit price is the
  chosen size's effective price.
- **Sale section**: new component below New Arrivals; fetches
  `/products?on_sale=1&sort=newest&limit=8`; shows the % badge, struck-through
  regular price, sale price, and "Ends <date>"; same ProductCard.
- **Price sorting orders by the effective price** (ruled): during a sale,
  `price_asc`/`price_desc` rank a ₹499 sale item as ₹499 next to genuinely
  ₹499 products — the ORDER BY uses the same COALESCE expression the pricing
  rule defines, not the raw regular column.
- **Cart / checkout**: the cart **displays sale prices**, not stale snapshots —
  when the cart loads (and on the checkout screen), item prices are re-hydrated
  from the catalog API so an on-sale product shows its effective price and the
  "Place Order · ₹X" button matches what the server will charge. Coupon
  `min_order` and free-shipping progress evaluate against that refreshed
  subtotal. Re-hydration resolves per size; a size that no longer exists on
  the product is dropped with a toast, never silently re-priced. The server's
  recompute at order time stays the only authority — the refresh is
  display-honesty, not a second pricing source.

## Admin dashboard

- **ProductForm**: flavor list editor (label + optional per-flavor photo
  upload + remove), size list editor — each size row carries **label +
  optional per-size price in ₹ (blank = product price) + optional photo +
  remove**, "What's inside" and "Nutrition" textareas; the existing
  badge/new-arrival/active controls stay. Sale fields are NOT in the product
  form — the Sales page owns all sale editing.
- **New "Sales" page** in the admin nav: create-category-sale form (category
  select, % input, start/end datetime pickers) and the on-sale products table
  with per-row edit — per-size sale price rows (the override map: each size
  listed with its regular price and an editable sale price, placeholder =
  auto from %; one plain "base" row for sizeless products), per-product %
  change, end date change, remove — plus the bulk **End sale** button per
  category.
- **Datetimes are entered as IST and stored as UTC** (ruled): the admin UI
  converts on write (IST = UTC+5:30), the database and every comparison stay
  UTC like all existing timestamps (`parseTimestamp` conventions), and the
  admin sees the values back in IST with a small "IST" label. Prevents the
  5½-hour skew between what the admin typed and when the sale actually runs.
- **Categories page**: gets a photo **upload control** wired to the shared
  `POST /api/admin/uploads` endpoint (today it only has an Image URL field);
  the upload returns a `/api/images/<key>` URL that fills the field. The new
  seed rows appear with no other change.

## What's left to the builder

- Exact popup/section visual styling within the existing design language.
- SQL timestamp comparison details (ISO vs `datetime('now')` — the codebase
  already handles both; follow `parseTimestamp` conventions).
- Test plan: worker tests for sale computation (pricing lib, catalog filter,
  orders recompute, bulk sale endpoint validation, per-product override), and
  the migration; frontend verified by build + headless smoke.
- Free-tier care: the bulk sale UPDATE is a single bounded statement; the
  catalog list query gains only computed columns (no extra queries).
