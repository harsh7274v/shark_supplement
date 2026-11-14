# Coupon Real-Time Cart Validation & Single-Use Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix coupon cart persistence so coupons automatically clear on empty cart or when subtotal falls below minimum order, and enforce single-use per customer security across the backend and admin coupon manager.

**Architecture:** CartContext watches items and eligible subtotal, clearing or revalidating active coupons with `/api/coupons/validate`. The backend verifies `min_order` and queries previous non-cancelled orders for customer coupon redemption. Admin dashboard allows toggling `single_use_per_user` per coupon.

**Tech Stack:** Cloudflare Workers, Hono, Cloudflare D1 (SQLite), React, TailwindCSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-coupon-validation-single-use-security-design.md`

## Global Constraints
- Do not break existing valid coupon applications (`KINETIC10`, `WELCOME15`, `MUSCLE500`).
- Cancelled orders do not count as used (customers can re-use their coupon if their previous order was cancelled).
- Cart re-validation must be resilient and must not flicker or throw unhandled exceptions.
- Codebase must pass `npm run typecheck` and `npm run test` in `worker/`, and `npm run build` in `frontend/`.

## Review Focus
- Empty cart: clearing all items must immediately unset coupon.
- Subtotal reduction: decreasing quantity below `min_order` must remove coupon and display minimum amount toast.
- Sale items: cart containing only promotional sale items must reject/remove coupon.
- Repeat redemption: placing order with email A and coupon X, then attempting to checkout with email A and coupon X again must be blocked with 400.
- Case sensitivity: email comparison must be case-insensitive (`LOWER(email)`).

---

### Task 1: Database Migration & Schema Update for Single-Use Coupons

**Files:**
- Create: `worker/migrations/0003_coupon_single_use.sql`
- Modify: `worker/seed/001_catalog.sql`
- Modify: `worker/src/lib/pricing.ts`
- Modify: Active local SQLite database in `.wrangler/state/v3/d1/...`

**Interfaces:**
- Consumes: Existing `coupons` table
- Produces: `single_use_per_user` integer column (`1` or `0`, default `1`) on `coupons` table and in `Coupon` type

- [ ] **Step 1: Create migration file `worker/migrations/0003_coupon_single_use.sql`**
```sql
ALTER TABLE coupons ADD COLUMN single_use_per_user INTEGER NOT NULL DEFAULT 1 CHECK (single_use_per_user IN (0, 1));
```

- [ ] **Step 2: Update `worker/src/lib/pricing.ts`**
Add `single_use_per_user: number;` to `CouponRow` and `Coupon` interfaces, and update `toCoupon` helper to map `single_use_per_user: row.single_use_per_user ?? 1`.

- [ ] **Step 3: Update `worker/seed/001_catalog.sql`**
Add `single_use_per_user` to the `INSERT INTO coupons` column list and values (all seeded coupons default to `1`). Run `node worker/scripts/sync-seed-vars.mjs`.

- [ ] **Step 4: Apply migration to local SQLite database**
Run `ALTER TABLE coupons ADD COLUMN single_use_per_user INTEGER NOT NULL DEFAULT 1 CHECK (single_use_per_user IN (0, 1));` via `sqlite3`.

- [ ] **Step 5: Verify types**
Run `cd worker && npm run typecheck`. Expected: PASS.

---

### Task 2: Backend Validation & Order Placement Single-Use Enforcement

**Files:**
- Modify: `worker/src/routes/orders.ts`
- Test: `worker/test/orders.test.ts`

**Interfaces:**
- Consumes: `single_use_per_user` from `coupons` and past customer orders from `orders`
- Produces: Dynamic `min_order` failure reasons and single-use rejection in `/api/coupons/validate` and `POST /api/orders`

- [ ] **Step 1: Write failing test in `worker/test/orders.test.ts`**
Add test:
1. "refuses coupon if customer has already used it in a previous non-cancelled order".
2. "rejects coupon validation with detailed message if subtotal is below minimum order".

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/orders.test.ts`

- [ ] **Step 3: Implement single-use check and descriptive min_order in `worker/src/routes/orders.ts`**
In `/api/coupons/validate`:
- Check if `subtotal < coupon.min_order` or `eligibleSubtotal < coupon.min_order`: return `{ valid: false, detail: "Minimum order of ₹" + (coupon.min_order / 100) + " required for coupon " + coupon.code }`.
- If `coupon.single_use_per_user === 1`: check optional `body.email` or session user. If order with same coupon_code and (user_id OR email OR phone) exists with `status != 'cancelled'`, return `{ valid: false, detail: "You have already used this coupon code." }`.

In `POST /api/orders`:
- If coupon is present and `single_use_per_user === 1`:
  Query `SELECT id FROM orders WHERE coupon_code = ? AND (user_id = ? OR LOWER(email) = LOWER(?) OR phone = ?) AND status != 'cancelled' LIMIT 1`.
  If row exists, return `c.json({ detail: "You have already used this coupon code." }, 400)`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/orders.test.ts`
Expected: PASS.

---

### Task 3: Backend Admin Coupon Management Endpoints

**Files:**
- Modify: `worker/src/routes/admin.ts`
- Test: `worker/test/admin.coupons.test.ts`

**Interfaces:**
- Consumes: Admin coupon requests
- Produces: CRUD endpoints supporting `single_use_per_user`

- [ ] **Step 1: Write failing test in `worker/test/admin.coupons.test.ts`**
Add test asserting `POST /api/admin/coupons` with `single_use_per_user: 0` saves and returns `single_use_per_user: 0`, and defaults to `1` when omitted.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/admin.coupons.test.ts`

- [ ] **Step 3: Update `worker/src/routes/admin.ts`**
In `GET /coupons`, `POST /coupons`, and `PATCH /coupons/:id`:
- Include `single_use_per_user` in SELECT, INSERT, and UPDATE queries.
- Read `single_use_per_user` as a flag (`readFlag(body.single_use_per_user ?? 1)`).

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run test/admin.coupons.test.ts`
Expected: PASS.

---

### Task 4: Frontend Cart Coupon Dynamic Re-validation

**Files:**
- Modify: `frontend/src/context/CartContext.jsx`
- Modify: `frontend/src/components/CartDrawer.jsx`

**Interfaces:**
- Consumes: `items`, `subtotal`, `eligibleSubtotal`, and `/api/coupons/validate`
- Produces: Self-cleaning, reactive coupon state in Cart

- [ ] **Step 1: Update `frontend/src/context/CartContext.jsx`**
Add reactive hook / effect:
1. When `items.length === 0 && coupon`: call `setCoupon(null)`.
2. When `items.length > 0 && coupon`:
   Call `/api/coupons/validate` with `{ code: coupon.code, subtotal, eligible_subtotal: eligibleSubtotal }`.
   If `!data.valid`:
   - Call `setCoupon(null)`
   - Call `toast.warning(data.detail || "Coupon removed: requirements not met")`.
3. In `applyCoupon(code)`: include customer email in validation body if available from AuthContext.

- [ ] **Step 2: Update `frontend/src/components/CartDrawer.jsx`**
Ensure coupon input errors and removal states render cleanly.

- [ ] **Step 3: Test Cart behavior**
Verify empty cart auto-clears coupon, and reducing qty below min_order removes coupon with toast.

---

### Task 5: Frontend Admin Coupons UI & Full Verification

**Files:**
- Modify: `frontend/src/pages/admin/Coupons.jsx`

**Interfaces:**
- Consumes: Admin coupon APIs with `single_use_per_user`
- Produces: UI toggle for single use per user in create/edit modal and table badge

- [ ] **Step 1: Update `frontend/src/pages/admin/Coupons.jsx`**
1. In initial form state: add `single_use_per_user: "1"`.
2. In edit handler: set `single_use_per_user: String(coupon.single_use_per_user ?? 1)`.
3. In payload: send `single_use_per_user: Number(form.single_use_per_user)`.
4. In table: add column / badge showing "1 use / user" or "Multi-use".
5. In modal form: add checkbox or select for "Usage Limit: Single use per customer (1 order per user/email)".

- [ ] **Step 2: Run worker test suite**
Run: `cd worker && npm run test`
Expected: 100% tests passing.

- [ ] **Step 3: Run frontend build**
Run: `cd frontend && npm run build`
Expected: 0 build errors.

