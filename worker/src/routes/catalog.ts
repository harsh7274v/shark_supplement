/**
 * The public catalog: the categories, the product list with its search, its
 * filter and its sort, and the product detail.
 *
 * Mounted at `/api` by `src/index.ts`, so the routes answer on
 * `/api/categories`, `/api/products` and `/api/products/:id`.
 *
 * Parity with the old `backend/server.py`:
 * - only active products are listed; an inactive product is a 404;
 * - the sort keys are `most_ordered`, `top_rated`, `price_asc`, `price_desc`
 *   and `newest`, and an unknown key falls back to `most_ordered`;
 * - the search covers the name and the brand, case insensitively;
 * - `category=all` filters nothing.
 *
 * Money is paise in and paise out; the discount percent is computed from the
 * prices on every read, so a stale stored value can never reach the client.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../env";
import {
  effectiveVariantPrice,
  isOnSale,
  parseOptionMaps,
  regularVariantPrice,
  type SaleProductColumns,
} from "../lib/sale";

type CatalogEnv = { Bindings: Env };
type CatalogContext = Context<CatalogEnv>;

export const catalogRoutes = new Hono<CatalogEnv>();

/**
 * The SQL predicate of a product whose sale window is open right now. The
 * catalog evaluates sales against the clock on every read, so a sale starts
 * and ends by itself and no scheduled job ever has to run.
 */
const ON_SALE_SQL = `
  p.sale_starts_at IS NOT NULL AND p.sale_ends_at IS NOT NULL
  AND datetime(p.sale_starts_at) <= datetime('now') AND datetime(p.sale_ends_at) > datetime('now')
  AND (p.sale_percentage > 0 OR p.sale_price_override IS NOT NULL)`;

/**
 * The effective base price of a product: the exact base override when one is
 * set, the percentage math otherwise — or simply the regular price when no
 * sale is running. The price sorts rank by this, so a ₹499 sale item sorts
 * as ₹499 next to genuinely ₹499 products. (Per-size overrides do not take
 * part in the sort: a sized product is ranked by its base price.)
 */
const EFFECTIVE_BASE_SQL = `
  CASE WHEN ${ON_SALE_SQL} AND p.sale_price_override IS NOT NULL THEN p.sale_price_override
       WHEN ${ON_SALE_SQL} AND p.sale_percentage > 0
         THEN CAST(ROUND(p.sale_price * (100 - p.sale_percentage) / 100.0) AS INTEGER)
       ELSE p.sale_price END`;

/** The order of the default sort; the most ordered products come first. */
const DEFAULT_ORDER = "p.orders_count DESC, p.id ASC";

/** The sort keys the storefront sends, mapped to a fixed SQL order. */
const SORT_SQL = new Map<string, string>([
  ["most_ordered", DEFAULT_ORDER],
  ["top_rated", "p.rating DESC, p.id ASC"],
  ["price_asc", `${EFFECTIVE_BASE_SQL} ASC, p.id ASC`],
  ["price_desc", `${EFFECTIVE_BASE_SQL} DESC, p.id ASC`],
  ["newest", "p.created_at DESC, p.id ASC"],
]);

/** The page size of the product list, and its bounds. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** The message of a product that is not there (or not active any more). */
const NOT_FOUND = "Product not found";

/**
 * The product columns of every query, with the discount percent computed from
 * the prices. The `MAX(0, ...)` keeps the discount at zero when a sale price
 * sits above the MRP, like the shared `discountPercent` util does.
 */
const PRODUCT_COLUMNS = `
  p.id,
  p.name,
  p.slug,
  p.description,
  p.brand,
  p.category_id,
  c.slug AS category,
  c.name AS category_name,
  p.mrp,
  p.sale_price,
  CASE WHEN p.mrp > 0
    THEN MAX(0, CAST(ROUND((p.mrp - p.sale_price) * 100.0 / p.mrp) AS INTEGER))
    ELSE 0 END AS discount_percent,
  p.stock,
  p.images,
  p.flavors,
  p.weight_options,
  p.flavor_images,
  p.weight_images,
  p.weight_prices,
  p.contents,
  p.nutrition,
  p.sale_percentage,
  p.sale_price_override,
  p.sale_overrides,
  p.sale_starts_at,
  p.sale_ends_at,
  p.badge,
  p.is_new_arrival,
  p.rating,
  p.orders_count,
  p.created_at`;

/** A product row as D1 returns it. */
interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  category_id: string | null;
  category: string | null;
  category_name: string | null;
  mrp: number;
  sale_price: number;
  discount_percent: number;
  stock: number;
  images: string | null;
  flavors: string | null;
  weight_options: string | null;
  flavor_images: string | null;
  weight_images: string | null;
  weight_prices: string | null;
  contents: string | null;
  nutrition: string | null;
  sale_percentage: number;
  sale_price_override: number | null;
  sale_overrides: string | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  badge: string | null;
  is_new_arrival: number;
  rating: number;
  orders_count: number;
  created_at: string;
}

/** The product as the API serves it. */
interface ProductJson {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  category_id: string | null;
  category: string | null;
  category_name: string | null;
  mrp: number;
  sale_price: number;
  discount_percent: number;
  stock: number;
  images: string[];
  flavors: string[];
  weight_options: string[];
  badge: string | null;
  is_new_arrival: number;
  rating: number;
  orders_count: number;
  created_at: string;
  is_on_sale: 0 | 1;
  sale_percentage: number;
  sale_ends_at: string | null;
  sale_price_effective: number;
  size_prices: Record<string, number> | null;
  size_prices_regular: Record<string, number> | null;
  flavor_images: Record<string, string>;
  weight_images: Record<string, string>;
  contents: string | null;
  nutrition: string | null;
}

/**
 * Parses a JSON array column of the products table. A column that is not a
 * JSON array of strings reads as an empty array.
 */
function parseArray(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * Parses a JSON image-map column of the products table: an object whose
 * values are strings. A column that is not one reads as an empty map, so a
 * stale or corrupt key can never break a product page.
 */
function parseImageMap(value: string | null): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === "string") {
        out[key] = val;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Turns a product row into the JSON the API serves. */
function toProduct(row: ProductRow): ProductJson {
  const maps = parseOptionMaps(row);
  const now = new Date();
  const weightOptions = parseArray(row.weight_options);
  const onSale = isOnSale(row, now) ? 1 : 0;

  // The ready-to-render per-size price maps: only the sizes the product
  // actually lists take part, so a stale map key is simply ignored. A
  // sizeless product serves no maps — the card falls back to the base price.
  const sizePrices = weightOptions.map((size) => [
    size,
    effectiveVariantPrice(row, maps, size, now),
  ]);
  const sizePricesRegular = weightOptions.map((size) => [
    size,
    regularVariantPrice(row, maps, size),
  ]);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    brand: row.brand,
    category_id: row.category_id,
    category: row.category,
    category_name: row.category_name,
    mrp: row.mrp,
    sale_price: row.sale_price,
    discount_percent: row.discount_percent,
    stock: row.stock,
    images: parseArray(row.images),
    flavors: parseArray(row.flavors),
    weight_options: weightOptions,
    badge: row.badge,
    is_new_arrival: row.is_new_arrival,
    rating: row.rating,
    orders_count: row.orders_count,
    created_at: row.created_at,
    is_on_sale: onSale,
    sale_percentage: row.sale_percentage,
    sale_ends_at: row.sale_ends_at,
    sale_price_effective: effectiveVariantPrice(row, maps, null, now),
    size_prices: weightOptions.length > 0 ? Object.fromEntries(sizePrices) : null,
    size_prices_regular: weightOptions.length > 0 ? Object.fromEntries(sizePricesRegular) : null,
    flavor_images: parseImageMap(row.flavor_images),
    weight_images: parseImageMap(row.weight_images),
    contents: row.contents,
    nutrition: row.nutrition,
  };
}

/** Reads the page size of a request, clamped to the bounds of the list. */
function readLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

/** The new arrivals filter of a request is on when it asks for it. */
function wantsNewArrivals(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/** The most ids one `ids=` filter may carry (the same bound the cart uses). */
const MAX_IDS = 50;

catalogRoutes.get("/categories", async (c: CatalogContext) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id,
            c.slug,
            c.name,
            c.image_url,
            c.tagline,
            COUNT(p.id) AS product_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
     GROUP BY c.id, c.slug, c.name, c.image_url, c.tagline
     ORDER BY c.sort_order ASC, c.name ASC`,
  ).all<{
    id: string;
    slug: string;
    name: string;
    image_url: string | null;
    tagline: string | null;
    product_count: number;
  }>();

  return c.json(results);
});

catalogRoutes.get("/products", async (c: CatalogContext) => {
  const query = c.req.query();

  const where = ["p.is_active = 1"];
  const binds: unknown[] = [];

  const category = query.category?.trim();
  if (category && category !== "all") {
    where.push("c.slug = ?");
    binds.push(category);
  }

  const search = query.search?.trim();
  if (search) {
    where.push("(LOWER(p.name) LIKE ? OR LOWER(p.brand) LIKE ?)");
    const pattern = `%${search.toLowerCase()}%`;
    binds.push(pattern, pattern);
  }

  if (wantsNewArrivals(query.new_arrivals)) {
    where.push("p.is_new_arrival = 1");
  }

  if (wantsNewArrivals(query.on_sale)) {
    where.push(ON_SALE_SQL);
  }

  // The `ids=` filter: the cart re-hydration asks for the products it holds
  // by id. The ids are deduped and bounded, like every other query here.
  const idList = [...new Set((query.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean))];
  if (idList.length > MAX_IDS) {
    return c.json({ detail: "ids must list at most 50 products" }, 400);
  }
  if (idList.length > 0) {
    where.push(`p.id IN (${idList.map(() => "?").join(", ")})`);
    binds.push(...idList);
  }

  const order = SORT_SQL.get(query.sort ?? "") ?? DEFAULT_ORDER;
  binds.push(readLimit(query.limit));

  const { results } = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT ?`,
  )
    .bind(...binds)
    .all<ProductRow>();

  return c.json(results.map(toProduct));
});

catalogRoutes.get("/sales/banner", async (c: CatalogContext) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.name, p.sale_percentage, p.sale_starts_at, p.sale_ends_at
       FROM products p
       WHERE p.is_active = 1
         AND p.sale_starts_at IS NOT NULL
         AND p.sale_ends_at IS NOT NULL
         AND datetime(p.sale_ends_at) > datetime('now')
         AND (p.sale_percentage > 0 OR p.sale_price_override IS NOT NULL)
       ORDER BY
         CASE WHEN datetime(p.sale_starts_at) <= datetime('now') THEN 0 ELSE 1 END ASC,
         p.sale_percentage DESC,
         p.sale_starts_at ASC
       LIMIT 1`,
    )
    .all<{
      id: string;
      name: string;
      sale_percentage: number;
      sale_starts_at: string;
      sale_ends_at: string;
    }>();

  if (results.length === 0) {
    return c.json({ active: false });
  }

  const sale = results[0];
  const now = new Date();
  const startsAt = new Date(sale.sale_starts_at);
  const isLive = startsAt <= now;

  return c.json({
    active: true,
    isLive,
    startsAt: sale.sale_starts_at,
    endsAt: sale.sale_ends_at,
    percentage: sale.sale_percentage,
    title: isLive ? "FLASH SALE IS LIVE" : "UPCOMING FLASH SALE",
  });
});

catalogRoutes.get("/products/:id", async (c: CatalogContext) => {
  const row = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = ? AND p.is_active = 1`,
  )
    .bind(c.req.param("id"))
    .first<ProductRow>();

  if (!row) {
    return c.json({ detail: NOT_FOUND }, 404);
  }

  return c.json(toProduct(row));
});
