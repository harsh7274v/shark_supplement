/**
 * The sale/variant pricing lib: the single authority for per-size regular and
 * effective prices and the on-sale predicate.
 *
 * Pure unit tests: no app import, no database — the catalog and the order
 * recompute consume these functions (plan Tasks 2 and 3).
 */

import { describe, expect, it } from "vitest";
import {
  effectiveVariantPrice,
  isOnSale,
  parseOptionMaps,
  regularVariantPrice,
  type SaleProductColumns,
} from "../src/lib/sale";

/** A window that is open around the test clock. */
const NOW = new Date("2026-11-13T10:00:00.000Z");
const STARTS = "2026-11-13T00:00:00.000Z";
const ENDS = "2026-11-20T00:00:00.000Z";
const STARTS_FUTURE = "2026-12-01T00:00:00.000Z";
const ENDS_PAST = "2026-11-01T00:00:00.000Z";

/** The base fixture: a product with two sizes priced apart, on a 20% sale. */
const base: SaleProductColumns = {
  sale_price: 100_000,
  weight_options: JSON.stringify(["800 g", "2 kg"]),
  weight_prices: JSON.stringify({ "800 g": 80_000, "2 kg": 180_000 }),
  sale_percentage: 20,
  sale_price_override: null,
  sale_overrides: null,
  sale_starts_at: STARTS,
  sale_ends_at: ENDS,
};

describe("parseOptionMaps", () => {
  it("reads both maps from valid JSON", () => {
    const maps = parseOptionMaps({
      weight_prices: JSON.stringify({ "2 kg": 199_900 }),
      sale_overrides: JSON.stringify({ "2 kg": 149_900 }),
    });
    expect(maps.weightPrices).toEqual({ "2 kg": 199_900 });
    expect(maps.saleOverrides).toEqual({ "2 kg": 149_900 });
  });

  it("reads null columns as empty maps", () => {
    expect(parseOptionMaps({ weight_prices: null, sale_overrides: null })).toEqual({
      weightPrices: {},
      saleOverrides: {},
    });
  });

  it("reads invalid JSON as empty maps", () => {
    const maps = parseOptionMaps({ weight_prices: "{oops", sale_overrides: "[1,2]" });
    expect(maps.weightPrices).toEqual({});
    expect(maps.saleOverrides).toEqual({});
  });

  it("reads non-map JSON (arrays, strings, numbers) as empty maps", () => {
    const maps = parseOptionMaps({
      weight_prices: JSON.stringify(["800 g", "2 kg"]),
      sale_overrides: JSON.stringify("cheap"),
    });
    expect(maps.weightPrices).toEqual({});
    expect(maps.saleOverrides).toEqual({});
  });

  it("rejects numeric-string and other non-number values", () => {
    const maps = parseOptionMaps({
      weight_prices: JSON.stringify({ "2 kg": "199900", trash: null }),
      sale_overrides: JSON.stringify({ "2 kg": 149_900, junk: {} }),
    });
    expect(maps.weightPrices).toEqual({});
    expect(maps.saleOverrides).toEqual({ "2 kg": 149_900 });
  });
});

describe("isOnSale", () => {
  it("is true inside the window with a percentage", () => {
    expect(isOnSale(base, NOW)).toBe(true);
  });

  it("is false before the window starts", () => {
    expect(isOnSale({ ...base, sale_starts_at: STARTS_FUTURE }, NOW)).toBe(false);
  });

  it("is false after the window ends", () => {
    expect(isOnSale({ ...base, sale_ends_at: ENDS_PAST }, NOW)).toBe(false);
  });

  it("is false with missing timestamps", () => {
    expect(isOnSale({ ...base, sale_starts_at: null, sale_ends_at: null }, NOW)).toBe(false);
  });

  it("is false with unparseable timestamps", () => {
    expect(isOnSale({ ...base, sale_starts_at: "not-a-date" }, NOW)).toBe(false);
    expect(isOnSale({ ...base, sale_ends_at: "" }, NOW)).toBe(false);
  });

  it("is false when nothing is set even inside the window", () => {
    expect(
      isOnSale(
        { ...base, sale_percentage: 0, sale_price_override: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("is true with percentage 0 but a base override set", () => {
    expect(
      isOnSale(
        { ...base, sale_percentage: 0, sale_price_override: 79_000 },
        NOW,
      ),
    ).toBe(true);
  });

  it("is true with percentage 0 but a per-size override present", () => {
    expect(
      isOnSale(
        {
          ...base,
          sale_percentage: 0,
          sale_overrides: JSON.stringify({ "2 kg": 149_900 }),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("is false at the exact end instant (window is half-open)", () => {
    const atEnd = new Date(ENDS);
    expect(isOnSale(base, atEnd)).toBe(false);
  });
});

describe("regularVariantPrice", () => {
  it("returns the per-size price when the size carries one", () => {
    expect(regularVariantPrice(base, parseOptionMaps(base), "2 kg")).toBe(180_000);
    expect(regularVariantPrice(base, parseOptionMaps(base), "800 g")).toBe(80_000);
  });

  it("falls back to the base price for an unknown size", () => {
    expect(regularVariantPrice(base, parseOptionMaps(base), "9 L")).toBe(100_000);
  });

  it("falls back to the base price for a null size", () => {
    expect(regularVariantPrice(base, parseOptionMaps(base), null)).toBe(100_000);
  });

  it("falls back to the base price when no size prices exist", () => {
    const noMap = { ...base, weight_prices: null };
    expect(regularVariantPrice(noMap, parseOptionMaps(noMap), "2 kg")).toBe(100_000);
  });
});

describe("effectiveVariantPrice", () => {
  it("prices each size off its own regular price during a percentage sale", () => {
    const maps = parseOptionMaps(base);
    expect(effectiveVariantPrice(base, maps, "2 kg", NOW)).toBe(144_000);
    expect(effectiveVariantPrice(base, maps, "800 g", NOW)).toBe(64_000);
  });

  it("prices the base off sale_price during a percentage sale", () => {
    expect(effectiveVariantPrice(base, parseOptionMaps(base), null, NOW)).toBe(80_000);
  });

  it("lets a per-size override beat the percentage", () => {
    const cols = { ...base, sale_overrides: JSON.stringify({ "2 kg": 149_900 }) };
    const maps = parseOptionMaps(cols);
    expect(effectiveVariantPrice(cols, maps, "2 kg", NOW)).toBe(149_900);
    // The other size keeps the percentage math.
    expect(effectiveVariantPrice(cols, maps, "800 g", NOW)).toBe(64_000);
  });

  it("lets the base override apply only when there is no size", () => {
    const cols = { ...base, sale_price_override: 79_000 };
    const maps = parseOptionMaps(cols);
    expect(effectiveVariantPrice(cols, maps, null, NOW)).toBe(79_000);
    // A chosen size ignores the base override and keeps percentage math.
    expect(effectiveVariantPrice(cols, maps, "2 kg", NOW)).toBe(144_000);
  });

  it("returns the regular price once the sale has expired", () => {
    const expired = { ...base, sale_ends_at: ENDS_PAST };
    const maps = parseOptionMaps(expired);
    expect(effectiveVariantPrice(expired, maps, "2 kg", NOW)).toBe(180_000);
    expect(effectiveVariantPrice(expired, maps, null, NOW)).toBe(100_000);
  });

  it("returns the regular price when no sale is configured", () => {
    const plain = { ...base, sale_percentage: 0, sale_starts_at: null, sale_ends_at: null };
    const maps = parseOptionMaps(plain);
    expect(effectiveVariantPrice(plain, maps, "2 kg", NOW)).toBe(180_000);
  });
});
