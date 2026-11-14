# Design Document: Real-Time Coupon Lifecycle Validation & Single-Use Security

## 1. Intent & Context
Coupons currently suffer from two distinct issues:
1. **Cart Lifecycle Persistence**: When a coupon is applied to a cart, removing products or reducing the subtotal below the coupon's minimum order requirement (`min_order`) does not remove or re-evaluate the coupon. Emptying the cart leaves the coupon in active state.
2. **Missing Per-User Usage Limits**: The store lacks coupon abuse prevention. Customers can reuse promo codes across multiple orders without restriction. The store owner needs coupons to be strictly single-use per customer (1 order per user/email) to prevent fraud.

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Automatic Cart Re-validation**:
  - Immediately clear the applied coupon whenever `items.length === 0`.
  - Automatically re-validate active coupons whenever cart items or subtotal change. If the subtotal drops below `min_order` or all items are promotional sale items, auto-remove the coupon and notify the user with a descriptive toast.
  - Return clear validation error details from `/api/coupons/validate` (e.g. `Minimum order amount of ₹X required for coupon CODE`).
- **Single-Use per Customer Security**:
  - Add `single_use_per_user` (integer `1` or `0`, default `1`) to the `coupons` table.
  - In `/api/coupons/validate` and `POST /api/orders`, verify that no existing non-cancelled order (`status != 'cancelled'`) exists with that `coupon_code` matching the buyer's `user_id`, `email`, or `phone`.
  - Return HTTP 400 with detail: `"You have already used this coupon code."` if reuse is attempted.
- **Admin Coupon Management**:
  - Add a "Single use per user" toggle/checkbox in the Add/Edit Coupon modal in `frontend/src/pages/admin/Coupons.jsx` (default: checked).
  - Display the single-use status in the admin coupons table.
  - Support `single_use_per_user` in `GET /api/admin/coupons`, `POST /api/admin/coupons`, and `PATCH /api/admin/coupons/:id`.

### Non-Goals
- Complex multi-tiered coupon rules (e.g., product-specific coupon restrictions beyond the existing sale product exclusion).
- Changing the checkout drawer layout.

### Anti-Goals
- Sluggish cart typing: Debounce or synchronize cart re-validation so it does not trigger redundant network calls on rapid increment/decrement clicks.

## 3. Approaches Considered

### Approach 1: Reactive Cart Re-validation + Order History Enforcement (Selected)
- **Frontend**: Add an automatic sync effect in `CartContext.jsx`. When `items.length === 0`, coupon is immediately set to `null`. When items or eligible subtotal change, re-validate with `/api/coupons/validate`.
- **Backend**: Update `/api/coupons/validate` to check `min_order` and check previous orders for coupon redemption by that user/email. Update `POST /api/orders` to lock and enforce the same check in database transaction.
- **Admin**: Add `single_use_per_user` field to admin UI and endpoints.

### Approach 2: Validate Only at Checkout Submission
- *Rejected*: Leaving an invalid or previously used coupon visible in the cart drawer until the final "Place Order" button is clicked creates a frustrating user experience.

## 4. Implementation Details

1. **Database Migration (`worker/migrations/0003_coupon_single_use.sql`)**:
   - `ALTER TABLE coupons ADD COLUMN single_use_per_user INTEGER NOT NULL DEFAULT 1 CHECK (single_use_per_user IN (0, 1));`
   - Apply migration to active SQLite database and update `001_catalog.sql` and `wrangler.jsonc`.

2. **Backend Admin Endpoints (`worker/src/routes/admin.ts`)**:
   - Update `CouponRow` and `toCoupon` to include `single_use_per_user: number`.
   - Update `POST /admin/coupons` and `PATCH /admin/coupons/:id` to accept and persist `single_use_per_user`.

3. **Backend Order & Validation Endpoints (`worker/src/routes/orders.ts`)**:
   - Enhance `/api/coupons/validate`:
     - Accept optional `email` and resolve signed-in `user_id` from session cookie if present.
     - Check `min_order` against `eligibleSubtotal` and `subtotal`. Return descriptive detail if not met: `"Minimum cart subtotal of ₹X required for coupon CODE"`.
     - If `coupon.single_use_per_user == 1` and user/email is provided:
       Query `SELECT id FROM orders WHERE coupon_code = ? AND (user_id = ? OR LOWER(email) = LOWER(?) OR phone = ?) AND status != 'cancelled' LIMIT 1`.
       If found, return `{ valid: false, detail: "You have already used this coupon code." }`.
   - Enhance `POST /api/orders`:
     - Enforce `single_use_per_user` check before inserting order. Reject with 400 if already used.

4. **Frontend Cart Revalidation (`frontend/src/context/CartContext.jsx`)**:
   - Add an effect that monitors `items`, `subtotal`, and `eligibleSubtotal`:
     - If `coupon` exists and `items.length === 0`, call `setCoupon(null)`.
     - If `coupon` exists and `eligibleSubtotal === 0` while items exist, call `setCoupon(null)` and show toast: `"Coupon removed: Products on sale are not eligible for coupon discounts."`
     - When subtotal or eligibleSubtotal changes, re-validate with `/api/coupons/validate`. If invalid, remove coupon and toast detail reason (e.g. minimum order not met).

5. **Admin UI (`frontend/src/pages/admin/Coupons.jsx`)**:
   - In form state, add `single_use_per_user: "1"` (default true).
   - In Add/Edit Coupon modal, render a checkbox / toggle: "Single use per user (each customer can only use this coupon once)".
   - In coupons table, show a column or badge: "1 use/user" vs "Multi-use".

## 5. Verification
- Verify cart: Add product > apply coupon > remove product to 0 -> coupon is removed.
- Verify minimum: Add product ₹2000 > apply coupon (min ₹1500) > reduce qty to ₹800 -> coupon automatically unapplies with warning.
- Verify per-user reuse: Place order with coupon > attempt to use same coupon on next order with same email/account -> rejected with clear error.
- Verify admin coupons: Create coupon with single_use_per_user toggle, edit coupon, check list.
- Run `npm run test` in worker (all tests green) and `npm run build` in frontend.

