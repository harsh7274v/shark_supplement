# Test Credentials

## Admin (seeded on startup)
- Email: admin@kineticnutrition.com
- Password: KineticAdmin@2026
- Role: admin

## Test user (email/password auth)
- Email: athlete.test@kineticnutrition.com
- Password: Test@1234
- Role: customer

## Google auth
- Emergent-managed Google OAuth (no app-managed passwords). Trigger via "Continue with Google" in the auth modal.

## Coupon codes (seeded)
- KINETIC10 — 10% off, min order ₹1,499
- WELCOME15 — 15% off, min order ₹1,999
- MUSCLE500 — flat ₹500 off, min order ₹2,999

## Auth endpoints
- POST /api/auth/register · POST /api/auth/login · POST /api/auth/logout
- GET /api/auth/me · POST /api/auth/refresh · POST /api/auth/forgot-password
- POST /api/auth/google/session (X-Session-ID header)
- POST /api/coupons/validate · POST /api/orders · GET /api/orders

