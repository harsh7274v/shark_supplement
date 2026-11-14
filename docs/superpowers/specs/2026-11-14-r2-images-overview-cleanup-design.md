# Design Document: Cloudflare R2 Asset Storage & Admin Overview Cleanup

## 1. Intent & Context
The project is being prepared for production deployment on Cloudflare (Cloudflare Workers API + Cloudflare D1 for SQLite database + Cloudflare Pages for React frontend).
- The admin dashboard currently displays a "DEMO DATA ENVIRONMENT" warning banner with a reset button in the Overview tab, which should not appear in production.
- Catalog and category images currently reside in `frontend/public/images/` as local static assets. For scalable production deployment, all images must reside in Cloudflare R2 object storage (`kinetic-images`) and be served dynamically or uploaded via the Cloudflare Worker API.
- Live relational data (orders, users, catalog, pricing, sales) remains securely managed in Cloudflare D1.

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Remove Demo Data Banner**: Completely remove the amber "DEMO DATA ENVIRONMENT" banner and reset button from `frontend/src/pages/admin/Overview.jsx`.
- **R2 Image Storage & Sync**:
  - Store all catalog, category, and hero images in Cloudflare R2 bucket `kinetic-images`.
  - Provide an automated sync script (`worker/scripts/upload-images-to-r2.mjs`) that can upload all local assets to R2 for local emulation (`--local`) as well as production remote (`--remote`).
  - Provide or ensure backend endpoint/utility in `worker/src/routes/uploads.ts` to cleanly serve R2 objects with appropriate cache headers and content types.
- **Update Database & Seed References**:
  - Update `worker/seed/001_catalog.sql` and the active SQLite/D1 database so product images and category `image_url` fields point to `/api/images/...` (or fallbacks).
  - Ensure fallback handling in frontend components (`ProductDetailDrawer.jsx`, `Categories.jsx`, `ProductCard.jsx`, `defaultCatalog.js`) cleanly handles both `/api/images/...` and existing paths.
- **Deployment Documentation & Scripts**:
  - Add npm script in `worker/package.json` (`npm run sync:images`) to easily push images to R2.
  - Verify and document production deployment steps for D1 and R2.

### Non-Goals
- Migrating the relational database away from Cloudflare D1 (Cloudflare D1 is the intended relational store; R2 is specifically for objects/images).
- Modifying the existing admin image upload UI (which already writes to R2 via `POST /api/admin/uploads`).

### Anti-Goals
- Breaking local development: the local Miniflare R2 simulation (`.wrangler/state/v3/r2`) must work seamlessly with the synced images.
- Hardcoding proprietary remote URLs that break offline local testing.

## 3. Approaches Considered

### Approach 1: Serve images directly via Cloudflare Worker `/api/images/:key` from R2 (Recommended & Selected)
- **Mechanism**: Store images in R2 bucket `kinetic-images` under `catalog/<filename>` or `products/<uuid>.<ext>`. The existing worker route `GET /api/images/:key{.+}` in `uploads.ts` streams the image from `c.env.IMAGES.get(key)`.
- **Pros**:
  - Consistent origin: frontend always requests `/api/images/...` without CORS issues.
  - Works identically in local development (`wrangler dev` local R2 bucket) and production.
  - Bucket does not require public internet exposure; access is controlled via the Worker.
  - Built-in caching headers (`max-age=31536000, immutable`).
- **Cons**: Minor CPU time in Worker to stream bytes, but negligible and standard for Cloudflare Worker setups.

### Approach 2: Public R2 Bucket Custom Domain (e.g. `images.kineticnutrition.com`)
- **Mechanism**: Enable public access or attach a custom domain to the Cloudflare R2 bucket directly.
- **Pros**: Offloads image serving completely from Worker CPU.
- **Cons**: Requires active custom domain DNS setup and Cloudflare account credentials that may not be configured in local development; breaks offline dev without fallback.

### Decision
**Approach 1** was selected because it works out-of-the-box locally and in production, unifies local and remote workflows, and matches the existing `uploads.ts` architecture.

## 4. Implementation Details

1. **Frontend Overview Cleanup**:
   - In `frontend/src/pages/admin/Overview.jsx`, remove lines 84-118 (the `demo-data-banner` wrapper containing the text "DEMO DATA ENVIRONMENT", the explanation, and the Resetting button).
   - Keep the clean header: title "Overview" and subtitle "Key store aggregates over the last 30 days · Signed in as {email}".

2. **R2 Image Sync Script (`worker/scripts/upload-images-to-r2.mjs`)**:
   - Reads files from `frontend/public/images/`.
   - Uses `wrangler r2 object put` or direct Miniflare/Worker API to put each image into bucket `kinetic-images` under key `catalog/<filename>`.
   - Supports `--local` (for local wrangler dev simulation) and `--remote` (for production Cloudflare deployment).

3. **Catalog Seed & Database URLs**:
   - In `worker/seed/001_catalog.sql`, update product and category image paths:
     - Categories: `/api/images/catalog/proteins.jpg` (or respective image)
     - Products: `["/api/images/catalog/whey_isolate.jpg"]`
   - Run SQL update on the active local D1 database so existing products reflect `/api/images/catalog/...`.
   - Ensure `worker/src/routes/uploads.ts` serves `catalog/:filename` with correct MIME type detection.

4. **Frontend Fallbacks**:
   - Update `Categories.jsx`, `defaultCatalog.js`, `Hero.jsx`, and `ProductDetailDrawer.jsx` to default to `/api/images/catalog/...` while gracefully handling local `/images/...` if ever requested.

5. **Deployment Guide**:
   - Update `README.md` to document:
     - `npx wrangler r2 bucket create kinetic-images`
     - `npm run sync:images`
     - `wrangler d1 execute kinetic-db --remote ...`

## 5. Verification
- Verify `Overview.jsx` renders cleanly without the demo banner.
- Run `upload-images-to-r2.mjs --local` and verify all 17 images exist in local R2 storage.
- Request `/api/images/catalog/whey_isolate.jpg` and verify HTTP 200 with `image/jpeg` content-type.
- Check storefront and admin products/categories render images properly from `/api/images/catalog/...`.

