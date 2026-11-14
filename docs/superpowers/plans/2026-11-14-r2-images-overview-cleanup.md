# Cloudflare R2 Asset Storage & Admin Overview Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the demo data banner from the admin overview dashboard, automate syncing all catalog images to Cloudflare R2 object storage, update database/seed image URLs to `/api/images/catalog/...`, and document deployment steps.

**Architecture:** Cloudflare R2 (`kinetic-images`) stores all media assets under `catalog/` and `products/`, served through the worker at `/api/images/:key{.+}` with long-lived immutable cache headers. Relational transactional data remains in Cloudflare D1. Admin Overview UI is cleaned up for production.

**Tech Stack:** Cloudflare Workers, Hono, Cloudflare R2, Cloudflare D1, React, Vite, Node.js.

**Spec:** `docs/superpowers/specs/2026-11-14-r2-images-overview-cleanup-design.md`

## Global Constraints
- Do not break local development or offline capability.
- All R2 image keys must be served via the existing Worker endpoint `/api/images/:key{.+}`.
- Transactional SQL tables remain in Cloudflare D1 (`kinetic-db`).
- Codebase must pass `npm run typecheck` in `worker/` and build cleanly in `frontend/`.

## Review Focus
- Local R2 simulation vs remote production deployment: ensure the sync script works with `--local` and `--remote`.
- Content-Type handling for all image formats (JPEG, PNG, WebP) in R2 objects.
- Image fallback resilience if an image key is missing or not yet uploaded.
- Ensure no orphaned state or unused functions remain in `Overview.jsx`.
- Verify storefront product grids, category cards, and hero carousel correctly display images loaded from `/api/images/catalog/...`.

---

### Task 1: Clean Up Overview Dashboard Header

**Files:**
- Modify: `frontend/src/pages/admin/Overview.jsx:34-60,84-118`

**Interfaces:**
- Consumes: `Overview.jsx` component state
- Produces: Clean production header in Admin Overview without `DEMO DATA ENVIRONMENT` banner or reset button

- [ ] **Step 1: Check existing banner in `Overview.jsx`**
Inspect lines 34-118 of `frontend/src/pages/admin/Overview.jsx`.

- [ ] **Step 2: Remove demo banner and reset handlers**
Remove `confirmReset` state, `handleReset` handler, and lines 84-118 (`data-testid="demo-data-banner"` container and its children).

- [ ] **Step 3: Verify Overview renders cleanly**
Run build test:
```bash
cd frontend && npm run build
```
Expected: PASS with 0 build errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/admin/Overview.jsx
git commit -m "feat(admin): remove demo data environment banner from overview dashboard"
```

---

### Task 2: Build R2 Image Sync Script and Enhance Upload Routes

**Files:**
- Create: `worker/scripts/upload-images-to-r2.mjs`
- Modify: `worker/src/routes/uploads.ts`
- Modify: `worker/package.json`

**Interfaces:**
- Consumes: Local image files in `frontend/public/images/`
- Produces: Uploaded objects in R2 bucket `kinetic-images` under key `catalog/<filename>` and streaming via `/api/images/catalog/<filename>`

- [ ] **Step 1: Create `worker/scripts/upload-images-to-r2.mjs`**
Write a Node.js script that:
1. Iterates over all `.jpg`, `.jpeg`, `.png`, `.webp` files in `frontend/public/images/`.
2. Infers correct MIME type (`image/jpeg`, etc.).
3. Executes `npx wrangler r2 object put kinetic-images/catalog/<file> --file=<path> [--local]` depending on CLI flag `--local` (default) or `--remote`.
4. Outputs status for each uploaded object.

- [ ] **Step 2: Add npm script in `worker/package.json`**
Add `"sync:images": "node scripts/upload-images-to-r2.mjs"` and `"sync:images:remote": "node scripts/upload-images-to-r2.mjs --remote"`.

- [ ] **Step 3: Verify and run local image sync**
Run:
```bash
cd worker && npm run sync:images
```
Expected: All 17 images uploaded to local R2 simulation under `catalog/`.

- [ ] **Step 4: Verify R2 image serving route**
Ensure `worker/src/routes/uploads.ts` handles `catalog/:filename` keys properly with `Content-Type` and `Cache-Control`.
Test with `npm run typecheck` in `worker/`.

- [ ] **Step 5: Commit**
```bash
git add worker/scripts/upload-images-to-r2.mjs worker/package.json worker/src/routes/uploads.ts
git commit -m "feat(r2): add automated R2 image upload script and sync catalog images"
```

---

### Task 3: Update Catalog Seed, Active Database & Frontend Fallbacks

**Files:**
- Modify: `worker/seed/001_catalog.sql`
- Modify: `frontend/src/data/defaultCatalog.js`
- Modify: `frontend/src/components/Categories.jsx`
- Modify: `frontend/src/components/Hero.jsx`
- Modify: `frontend/src/components/ProductDetailDrawer.jsx`
- Modify: Active local SQLite database in `.wrangler/state/v3/d1/...`

**Interfaces:**
- Consumes: R2 image keys `catalog/<name>.jpg`
- Produces: Category `image_url` and Product `images` pointing to `/api/images/catalog/<name>.jpg`

- [ ] **Step 1: Update `worker/seed/001_catalog.sql`**
Replace `/images/` with `/api/images/catalog/` across category `image_url` values and product `images` JSON arrays.
Also update category image mappings so each category has its distinct image (e.g., `proteins` -> `/api/images/catalog/whey_isolate.jpg`, `gainers` -> `/api/images/catalog/mass_gainer.jpg`, `pre_post` -> `/api/images/catalog/pre_workout.jpg`, `ayurveda` -> `/api/images/catalog/ashwagandha.jpg`, `fit_foods` -> `/api/images/catalog/peanut_butter.jpg`, `vitamins` -> `/api/images/catalog/multivitamin.jpg`, `fat_loss` -> `/api/images/catalog/fat_burner.jpg`, `apparel` -> `/api/images/catalog/apparel.jpg`, `aminos` -> `/api/images/catalog/aminos.jpg`, `gym_gear` -> `/api/images/catalog/gym_gear.jpg`).

- [ ] **Step 2: Update active local SQLite database**
Run SQL statements on active SQLite database to update existing categories and products:
```sql
UPDATE categories SET image_url = REPLACE(image_url, '/images/', '/api/images/catalog/');
UPDATE products SET images = REPLACE(images, '/images/', '/api/images/catalog/');
```

- [ ] **Step 3: Update frontend fallback constants**
Update `CATEGORY_FALLBACK_IMAGES` in `frontend/src/components/Categories.jsx`, default catalog in `frontend/src/data/defaultCatalog.js`, `Hero.jsx`, and `ProductDetailDrawer.jsx` to use `/api/images/catalog/...` while gracefully falling back to `/images/...` if needed.

- [ ] **Step 4: Commit**
```bash
git add worker/seed/001_catalog.sql frontend/src/components/Categories.jsx frontend/src/data/defaultCatalog.js frontend/src/components/Hero.jsx frontend/src/components/ProductDetailDrawer.jsx
git commit -m "feat(catalog): update product and category image URLs to R2 endpoint"
```

---

### Task 4: Deployment Documentation & End-to-End Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Cloudflare D1 and R2 deployment configuration
- Produces: Complete deployment guide with verified commands

- [ ] **Step 1: Update `README.md` deployment steps**
Document:
1. Creating R2 bucket: `npx wrangler r2 bucket create kinetic-images`
2. Syncing images to remote R2: `cd worker && npm run sync:images:remote`
3. Executing migrations on remote D1: `npx wrangler d1 execute kinetic-db --remote --file=migrations/0001_schema.sql`
4. Seeding remote catalog: `npx wrangler d1 execute kinetic-db --remote --file=seed/001_catalog.sql`
5. Deploying worker: `npx wrangler deploy`
6. Deploying pages: `cd frontend && npx wrangler pages deploy build`

- [ ] **Step 2: Full Verification**
1. Check `npm run typecheck` in `worker/`.
2. Check `npm run build` in `frontend/`.
3. Check that the admin overview page does not show the demo banner.
4. Check that database categories and products have `/api/images/catalog/...` URLs.

- [ ] **Step 3: Commit**
```bash
git add README.md
git commit -m "docs: add cloudflare R2 image sync and D1 deployment instructions"
```

