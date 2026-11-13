/**
 * The admin sale routes: the category-wide sale, the bulk end and the list
 * of the sales with their status.
 *
 * The D1 database of a test file starts empty, so the fixtures below are the
 * only category and products the routes can see.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

/** The one category of the fixture. */
const CAT_ID = "cat_admin_sales";

/** The two active products of the fixture (and one inactive bystander). */
const PROD_A = "prod_sales_a";
const PROD_B = "prod_sales_b";
const PROD_OFF = "prod_sales_off";

/** The statuses of a listed sale. */
type SaleStatus = "upcoming" | "active" | "ended";

/** A listed sale, as the API serves it. */
interface SaleJson {
  id: string;
  name: string;
  sale_percentage: number;
  sale_price_override: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  sale_status: SaleStatus;
}

/** An access token of an admin. */
async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "admin_sales", role: "admin" }, env.JWT_SECRET);
}

/** An access token of a customer. */
async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_sales", role: "customer" }, env.JWT_SECRET);
}

/** Calls the API with a JSON body and an access token. */
async function call(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  return app.request(
    path,
    {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    env,
  );
}

/** The sale columns a fixture product can carry. */
interface SaleFixture {
  isActive?: number;
  weightPrices?: Record<string, number>;
  salePercentage?: number;
  salePriceOverride?: number;
  saleOverrides?: Record<string, number>;
  saleStartsAt?: string;
  saleEndsAt?: string;
}

/** Inserts a product of the fixture, with the sale columns it asks for. */
async function insertProduct(id: string, overrides: SaleFixture = {}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO products
         (id, name, slug, brand, category_id, mrp, sale_price, discount_percent,
          stock, images, flavors, weight_options, badge, is_new_arrival,
          is_active, rating, orders_count, created_at,
          weight_prices, sale_percentage, sale_price_override, sale_overrides,
          sale_starts_at, sale_ends_at)
       VALUES (?, ?, ?, 'Kinetic', ?, 399900, 299900, 0, 10, '[]', '[]', '[]', NULL, 0,
               ?, 4.5, 0, '2026-01-05 10:00:00', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      `Sale Product ${id}`,
      `sale-product-${id}`,
      CAT_ID,
      overrides.isActive ?? 1,
      overrides.weightPrices ? JSON.stringify(overrides.weightPrices) : null,
      overrides.salePercentage ?? 0,
      overrides.salePriceOverride ?? null,
      overrides.saleOverrides ? JSON.stringify(overrides.saleOverrides) : null,
      overrides.saleStartsAt ?? null,
      overrides.saleEndsAt ?? null,
    )
    .run();
}

/** Reads the sale columns of a product of the database. */
async function readSaleColumns(id: string) {
  return db
    .prepare(
      `SELECT sale_percentage, sale_price_override, sale_overrides, sale_starts_at, sale_ends_at
       FROM products WHERE id = ?`,
    )
    .bind(id)
    .first<{
      sale_percentage: number;
      sale_price_override: number | null;
      sale_overrides: string | null;
      sale_starts_at: string | null;
      sale_ends_at: string | null;
    }>();
}

/** The body of a category sale that is valid in every way. */
function saleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category_id: CAT_ID,
    percentage: 25,
    starts_at: new Date(Date.now() - 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    ...overrides,
  };
}

beforeAll(async () => {
  await db
    .prepare(
      `INSERT INTO categories (id, slug, name, image_url, tagline, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(CAT_ID, "sales-cats", "Sales Cats", null, "The category of the sale tests", 1)
    .run();

  // The second product carries tweaks a category sale has to clear.
  await insertProduct(PROD_A, {
    weightPrices: { "2 kg": 199_900 },
    salePriceOverride: 199_900,
    saleOverrides: { "2 kg": 149_900 },
  });
  await insertProduct(PROD_B);
  await insertProduct(PROD_OFF, { isActive: 0 });
});

describe("admin sales", () => {
  describe("POST /api/admin/sales/category", () => {
    it("starts a category sale on the active products and clears their tweaks", async () => {
      const res = await call("POST", "/api/admin/sales/category", {
        body: saleBody(),
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ updated: 2 });

      // The window and the percentage landed on both active products, and
      // the per-product tweaks of PROD_A are gone.
      for (const id of [PROD_A, PROD_B]) {
        const row = await readSaleColumns(id);
        expect(row?.sale_percentage).toBe(25);
        expect(row?.sale_price_override).toBeNull();
        expect(row?.sale_overrides).toBeNull();
        expect(row?.sale_starts_at).not.toBeNull();
        expect(row?.sale_ends_at).not.toBeNull();
      }

      // The inactive bystander is untouched.
      const off = await readSaleColumns(PROD_OFF);
      expect(off?.sale_percentage).toBe(0);
      expect(off?.sale_starts_at).toBeNull();
    });

    it("refuses a percentage that is 0, above 90 or fractional", async () => {
      for (const percentage of [0, 91, 1.5]) {
        const res = await call("POST", "/api/admin/sales/category", {
          body: saleBody({ percentage }),
          token: await adminToken(),
        });
        expect(res.status).toBe(400);
      }
    });

    it("refuses a category that is not there", async () => {
      const res = await call("POST", "/api/admin/sales/category", {
        body: saleBody({ category_id: "cat_missing" }),
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Category not found" });
    });

    it("refuses a window that is backwards or unparseable", async () => {
      const starts = new Date(Date.now() - 3_600_000).toISOString();
      const ends = new Date(Date.now() + 3_600_000).toISOString();

      const backwards = await call("POST", "/api/admin/sales/category", {
        body: saleBody({ starts_at: ends, ends_at: starts }),
        token: await adminToken(),
      });
      expect(backwards.status).toBe(400);

      const garbage = await call("POST", "/api/admin/sales/category", {
        body: saleBody({ starts_at: "not-a-date" }),
        token: await adminToken(),
      });
      expect(garbage.status).toBe(400);
    });

    it("refuses a customer and an anonymous caller", async () => {
      const customer = await call("POST", "/api/admin/sales/category", {
        body: saleBody(),
        token: await customerToken(),
      });
      expect(customer.status).toBe(403);

      const anonymous = await call("POST", "/api/admin/sales/category", {
        body: saleBody(),
      });
      expect(anonymous.status).toBe(401);
    });
  });

  describe("POST /api/admin/sales/end", () => {
    it("clears every sale field of the active products of the category", async () => {
      const res = await call("POST", "/api/admin/sales/end", {
        body: { category_id: CAT_ID },
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ updated: 2 });

      for (const id of [PROD_A, PROD_B]) {
        const row = await readSaleColumns(id);
        expect(row?.sale_percentage).toBe(0);
        expect(row?.sale_price_override).toBeNull();
        expect(row?.sale_overrides).toBeNull();
        expect(row?.sale_starts_at).toBeNull();
        expect(row?.sale_ends_at).toBeNull();
      }
    });

    it("refuses a customer and an anonymous caller", async () => {
      const customer = await call("POST", "/api/admin/sales/end", {
        body: { category_id: CAT_ID },
        token: await customerToken(),
      });
      expect(customer.status).toBe(403);

      const anonymous = await call("POST", "/api/admin/sales/end", {
        body: { category_id: CAT_ID },
      });
      expect(anonymous.status).toBe(401);
    });
  });

  describe("GET /api/admin/sales", () => {
    const PROD_UPCOMING = "prod_sales_upcoming";
    const PROD_ACTIVE = "prod_sales_active";
    const PROD_ENDED = "prod_sales_ended";

    beforeAll(async () => {
      // Newest start first in the list: the upcoming sale starts last.
      await insertProduct(PROD_UPCOMING, {
        salePercentage: 20,
        saleStartsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        saleEndsAt: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      });
      await insertProduct(PROD_ACTIVE, {
        salePercentage: 30,
        saleStartsAt: new Date(Date.now() - 86_400_000).toISOString(),
        saleEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      await insertProduct(PROD_ENDED, {
        salePercentage: 40,
        saleStartsAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        saleEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
      });
    });

    it("lists the products with a sale and the status of each", async () => {
      const res = await call("GET", "/api/admin/sales", { token: await adminToken() });

      expect(res.status).toBe(200);
      const sales = (await res.json()) as SaleJson[];

      // Newest start first; the fixture products with no sale are not listed.
      expect(sales.map((sale) => sale.id)).toEqual([
        PROD_UPCOMING,
        PROD_ACTIVE,
        PROD_ENDED,
      ]);
      expect(sales.map((sale) => sale.sale_status)).toEqual([
        "upcoming",
        "active",
        "ended",
      ]);
      // The category sale of the earlier describe is on the active pair too —
      // it was ended again, so those two do not come back here.
      expect(sales.map((sale) => sale.id)).not.toContain(PROD_B);
    });

    it("refuses a customer and an anonymous caller", async () => {
      const customer = await call("GET", "/api/admin/sales", {
        token: await customerToken(),
      });
      expect(customer.status).toBe(403);

      const anonymous = await call("GET", "/api/admin/sales");
      expect(anonymous.status).toBe(401);
    });
  });

  describe("per-product sale edits", () => {
    it("still let the admin set the sale of one product alone", async () => {
      const starts = new Date(Date.now() - 3_600_000).toISOString();
      const ends = new Date(Date.now() + 3_600_000).toISOString();

      const res = await call("PATCH", `/api/admin/products/${PROD_B}`, {
        body: {
          sale_percentage: 10,
          sale_price_override: 99_900,
          sale_starts_at: starts,
          sale_ends_at: ends,
        },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);

      const row = await readSaleColumns(PROD_B);
      expect(row?.sale_percentage).toBe(10);
      expect(row?.sale_price_override).toBe(99_900);
      expect(row?.sale_starts_at).toBe(starts);
      expect(row?.sale_ends_at).toBe(ends);
    });
  });
});
