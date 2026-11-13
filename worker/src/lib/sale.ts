/**
 * The sale and variant pricing of a product: the one authority for what a
 * size costs, regular and on sale.
 *
 * Every consumer — the catalog, the order recompute, the admin responses —
 * resolves prices through this file, so a sale can never mean two things.
 * All money is integer paise; `sale_price` stays the base regular price the
 * product already had, and the per-size prices live in JSON maps.
 *
 * The on-sale predicate is half-open: `starts_at <= now < ends_at`, so a
 * sale is running the instant it starts and stops the instant it ends.
 * Everything is evaluated against the clock at read time — sales expire
 * without a job.
 */

/** The sale-related columns of a product, as the database has them. */
export interface SaleProductColumns {
  /** The base regular price of the product, in paise. */
  sale_price: number;
  /** JSON array of the size labels the storefront can pick. */
  weight_options: string | null;
  /** JSON map of size label to its regular price, in paise. */
  weight_prices: string | null;
  /** The sale percentage, 0..90; 0 means the product carries no percentage. */
  sale_percentage: number;
  /** The exact sale price of the base (sizeless) case, in paise. */
  sale_price_override: number | null;
  /** JSON map of size label to its exact sale price, in paise. */
  sale_overrides: string | null;
  /** When the sale starts, in UTC. */
  sale_starts_at: string | null;
  /** When the sale ends, in UTC. */
  sale_ends_at: string | null;
}

/** The two JSON maps of a product, parsed. */
export interface OptionMaps {
  weightPrices: Record<string, number>;
  saleOverrides: Record<string, number>;
}

/** The columns `parseOptionMaps` needs. */
type MapColumns = Pick<SaleProductColumns, "weight_prices" | "sale_overrides">;

/** The columns the on-sale predicate needs. */
type WindowColumns = Pick<
  SaleProductColumns,
  "sale_percentage" | "sale_price_override" | "sale_overrides" | "sale_starts_at" | "sale_ends_at"
>;

/**
 * Reads one JSON map column: an object whose values are numbers. Anything
 * else — invalid JSON, arrays, strings, numeric-string values — reads as an
 * empty map, so one bad column can never break a product page or an order.
 */
function readMap(value: string | null): Record<string, number> {
  if (!value) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === "number" && Number.isFinite(val)) {
        out[key] = val;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Reads both option maps of a product. */
export function parseOptionMaps(cols: MapColumns): OptionMaps {
  return {
    weightPrices: readMap(cols.weight_prices),
    saleOverrides: readMap(cols.sale_overrides),
  };
}

/**
 * Whether a sale is running on the product at the given moment: the window
 * is set and parseable and holds the moment, and the product carries some
 * sale rule (a percentage, a base override, or a per-size override).
 */
export function isOnSale(cols: WindowColumns, now: Date): boolean {
  if (!cols.sale_starts_at || !cols.sale_ends_at) {
    return false;
  }

  const starts = Date.parse(cols.sale_starts_at);
  const ends = Date.parse(cols.sale_ends_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) {
    return false;
  }

  const moment = now.getTime();
  if (starts > moment || ends <= moment) {
    return false;
  }

  const overrides = readMap(cols.sale_overrides ?? null);
  const hasOverrides = Object.keys(overrides).length > 0;
  return cols.sale_percentage > 0 || cols.sale_price_override !== null || hasOverrides;
}

/**
 * The regular price of one size of the product, in paise. A size with its
 * own price uses it; a size without one (or a null size, or a size the
 * product no longer lists — a legacy cart line) inherits the base price.
 */
export function regularVariantPrice(
  cols: SaleProductColumns,
  maps: OptionMaps,
  size: string | null,
): number {
  if (size !== null && Object.prototype.hasOwnProperty.call(maps.weightPrices, size)) {
    return maps.weightPrices[size];
  }
  return cols.sale_price;
}

/**
 * The price of one size of the product right now, in paise: the exact
 * override of that size when the admin typed one, the base override when no
 * size is set, the percentage math over the size's own regular price
 * otherwise — or simply the regular price when no sale is running.
 */
export function effectiveVariantPrice(
  cols: SaleProductColumns,
  maps: OptionMaps,
  size: string | null,
  now: Date,
): number {
  const regular = regularVariantPrice(cols, maps, size);
  if (!isOnSale(cols, now)) {
    return regular;
  }

  if (size !== null && Object.prototype.hasOwnProperty.call(maps.saleOverrides, size)) {
    return maps.saleOverrides[size];
  }
  if (size === null && cols.sale_price_override !== null) {
    return cols.sale_price_override;
  }

  return Math.round((regular * (100 - cols.sale_percentage)) / 100);
}
