# PRD — KINETIC NUTRITION (Gym Supplement Store)

## Original Problem Statement
User wants a website for a gym supplement store to sell supplements online. Homepage order: header (logo, cart icon, login/signup) → hero carousel of supplement photos → circular category row (Proteins, Gainers, Pre/Post Workout, Ayurveda, Fit Foods, Vitamin Supplements, Fat Loss) → recently added / new arrivals → products row with a sort button (most ordered etc.) → product cards with rounded corners, Buy Now + Add to Cart → right-side panel opens with product details, coupon, pricing and checkout button. Premium, user-friendly design.

## User Choices (from ask_human)
- Checkout: UI flow only now, payments later
- Auth: both email+password (JWT) and Google sign-in (Emergent-managed OAuth)
- Catalog: seeded with realistic demo products
- Design: clean light premium

## Architecture
- Backend: FastAPI (port 8000, /api prefix) + MongoDB (motor). server.py holds auth, catalog, coupons, orders, seeding.
- Auth: JWT access/refresh httpOnly cookies (bcrypt hashes, brute-force lockout via login_attempts) + Emergent Google OAuth (session exchanged server-side, session_token cookie, 7-day TTL).
- Frontend: React 18/19 (CRA/craco) + Tailwind + framer-motion + lenis smooth scroll + sonner toasts.
- Cart: client-side (localStorage) with server-validated coupons and server-priced orders; orders stored in `orders` collection; product `orders_count` increments on purchase (feeds "Most Ordered").

## Data
- 7 categories, 18 seeded products (generated studio packshots), 3 coupons, admin + test user.
- Seed is idempotent (runs only when collections are empty).

## Implemented
- Sticky header with announcement bar, logo SVG mark + favicon, cart badge, login/signup, user menu, mobile menu
- Kinetic hero: masked line-by-line reveal, 3-slide product carousel (auto-advance, dots), parallax, trust badges
- Dark editorial marquee (5 value claims)
- 7 circular category tiles with hover motion, active state, product counts; click filters shop section
- New Arrivals (4 newest), Best Sellers section with category chips + sort dropdown (Most Ordered / Top Rated / Price asc / Price desc / Newest)
- Product cards: rounded-3xl, NEW/HOT/% OFF badges, ratings, strike-through MRP, Add + Buy Now
- Cart drawer (right panel): qty steppers, remove, free-shipping progress (₹999), coupon validate flow, pricing summary (subtotal, discount, GST 5%, shipping), checkout button
- Checkout modal: shipping form validation → payment method (COD/UPI/Card mock) → order confirmation with order id; orders persisted server-side
- Auth modal: login/signup tabs, Google sign-in redirect, forgot-password, error formatting
- AuthCallback page for Google OAuth session exchange

