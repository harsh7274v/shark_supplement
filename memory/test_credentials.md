# Test Credentials

## Admin (seeded via catalog seed)
- Email: admin@kineticnutrition.com
- Password: KineticAdmin@2026
- Role: admin

The admin account is created by the idempotent D1 catalog seed
(`worker/seed/001_catalog.sql`) and applied on Worker deploy or via
`POST /api/admin/demo-data/seed` (data now lives in D1, not MongoDB).

## Test user (email/password auth)
- Email: athlete.test@kineticnutrition.com
- Password: Test@1234
- Role: customer

## Google auth
- Emergent-managed Google OAuth (no app-managed passwords). Trigger via "Continue with Google" in the auth modal.
- The Google button stays hidden until the frontend is built with `REACT_APP_GOOGLE_ENABLED=true`.

## Coupon codes (seeded)
- KINETIC10 — 10% off, min order ₹1,499
- WELCOME15 — 15% off, min order ₹1,999
- MUSCLE500 — flat ₹500 off, min order ₹2,999

## Auth endpoints (proxied through Pages `/api/*` → Worker)
- POST /api/auth/register · POST /api/auth/login · POST /api/auth/logout
- GET /api/auth/me · POST /api/auth/refresh · POST /api/auth/forgot-password
- POST /api/auth/google/session (X-Session-ID header)
- POST /api/coupons/validate · POST /api/orders · GET /api/orders
