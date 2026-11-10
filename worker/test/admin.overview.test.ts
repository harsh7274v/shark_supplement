/**
 * The admin overview: the aggregates of the dashboard and the demo reset.
 *
 * The D1 database of a test file starts empty, so the fixtures below are
 * inserted straight into the tables the routes read.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

const PROD_WHEY = "prod_admin_overview_whey"; // stock 5: low stock
const PROD_PLANT = "prod_admin_overview_plant"; // stock 20

const ORD_DAY1_A = "ord_admin_overview_day1_a";
const ORD_DAY1_B = "ord_admin_overview_day1_b";
const ORD_DAY2 = "ord_admin_overview_day2";
const ORD_DAY3 = "ord_admin_overview_day3";
const ORD_DAY3_CANCELLED = "ord_admin_overview_day3_cancelled";
const ORD_OLD = "ord_admin_overview_old";

interface OverviewJson {
  stats: { revenue: number; orders: number; avg_order: number; low_stock: number };
  revenue_by_day: { date: string; total: number }[];
  orders_by_status: { status: string; count: number }[];
  top_products: { name: string; qty: number }[];
}

async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "admin_overview", role: "admin" }, env.JWT_SECRET);
}

async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_overview", role: "customer" }, env.JWT_SECRET);
}

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

async function insertProduct(id: string, name: string, stock: number): Promise<void> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  await db
    .prepare(
      `INSERT INTO products (id, name, slug, stock, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, '2026-11-01 00:00:00')`,
    )
    .bind(id, name, slug, stock)
    .run();
}

async function insertOrder({
  id,
  orderNumber,
  status,
  createdAt,
  items,
  total,
}: {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  items: { name: string; unitPrice: number; qty: number }[];
  total: number;
}): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO orders (id, order_number, name, email, status, total, created_at, updated_at)
         VALUES (?, ?, 'Buyer', 'buyer@example.com', ?, ?, ?, ?)`,
      )
      .bind(id, orderNumber, status, total, createdAt, createdAt),
  ];
  for (const [index, item] of items.entries()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO order_items (id, order_id, name, unit_price, qty)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(`item_${id}_${index}`, id, item.name, item.unitPrice, item.qty),
    );
  }
  await db.batch(statements);
}

async function count(table: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function overview(query = ""): Promise<OverviewJson> {
  const res = await call("GET", `/api/admin/overview${query}`, {
    token: await adminToken(),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as OverviewJson;
}

beforeAll(async () => {
  await db.prepare("DELETE FROM email_log").run();
  await db.prepare("DELETE FROM order_status_history").run();
  await db.prepare("DELETE FROM order_items").run();
  await db.prepare("DELETE FROM payments").run();
  await db.prepare("DELETE FROM orders").run();
  await db.prepare("DELETE FROM products").run();

  await insertProduct(PROD_WHEY, "Kinetic Gold Whey", 5);
  await insertProduct(PROD_PLANT, "Kinetic Plant Protein", 20);

  // Two orders on day one.
  await insertOrder({
    id: ORD_DAY1_A,
    orderNumber: "KN-4001",
    status: "placed",
    createdAt: "2026-11-05 10:00:00",
    items: [{ name: "Kinetic Gold Whey", unitPrice: 299_900, qty: 2 }],
    total: 599_800,
  });
  await insertOrder({
    id: ORD_DAY1_B,
    orderNumber: "KN-4002",
    status: "confirmed",
    createdAt: "2026-11-05 12:00:00",
    items: [{ name: "Kinetic Plant Protein", unitPrice: 199_900, qty: 1 }],
    total: 199_900,
  });

  // One order on day two.
  await insertOrder({
    id: ORD_DAY2,
    orderNumber: "KN-4003",
    status: "shipped",
    createdAt: "2026-11-06 09:00:00",
    items: [{ name: "Kinetic Gold Whey", unitPrice: 299_900, qty: 3 }],
    total: 899_700,
  });

  // One order on day three, and a cancelled one next to it.
  await insertOrder({
    id: ORD_DAY3,
    orderNumber: "KN-4004",
    status: "delivered",
    createdAt: "2026-11-07 10:00:00",
    items: [
      { name: "Kinetic Gold Whey", unitPrice: 299_900, qty: 1 },
      { name: "Kinetic Plant Protein", unitPrice: 199_900, qty: 1 },
    ],
    total: 499_800,
  });
  await insertOrder({
    id: ORD_DAY3_CANCELLED,
    orderNumber: "KN-4005",
    status: "cancelled",
    createdAt: "2026-11-07 11:00:00",
    items: [{ name: "Kinetic Plant Protein", unitPrice: 199_900, qty: 3 }],
    total: 599_700,
  });

  // An order from before the 30-day window: it must not be aggregated.
  await insertOrder({
    id: ORD_OLD,
    orderNumber: "KN-4000",
    status: "placed",
    createdAt: "2026-10-01 10:00:00",
    items: [{ name: "Kinetic Gold Whey", unitPrice: 299_900, qty: 1 }],
    total: 299_900,
  });
});

describe("admin overview", () => {
  describe("guards", () => {
    it("answers 401 without a token", async () => {
      const res = await call("GET", "/api/admin/overview");
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });

    it("answers 403 to a customer", async () => {
      const res = await call("GET", "/api/admin/overview", {
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/overview", () => {
    it("aggregates the orders of the last 30 days and leaves out the cancelled one", async () => {
      const view = await overview("?days=30");
      expect(view.stats).toEqual({
        revenue: 2_199_200,
        orders: 4,
        avg_order: 549_800,
        low_stock: 1,
      });
      expect(view.revenue_by_day).toEqual([
        { date: "2026-11-05", total: 799_700 },
        { date: "2026-11-06", total: 899_700 },
        { date: "2026-11-07", total: 499_800 },
      ]);
      expect(view.orders_by_status).toEqual([
        { status: "confirmed", count: 1 },
        { status: "delivered", count: 1 },
        { status: "placed", count: 1 },
        { status: "shipped", count: 1 },
      ]);
      expect(view.top_products).toEqual([
        { name: "Kinetic Gold Whey", qty: 6 },
        { name: "Kinetic Plant Protein", qty: 2 },
      ]);
    });

    it("defaults to 30 days", async () => {
      const view = await overview();
      expect(view.stats).toEqual({
        revenue: 2_199_200,
        orders: 4,
        avg_order: 549_800,
        low_stock: 1,
      });
    });

    it("answers zeroed aggregates outside the window", async () => {
      const view = await overview("?days=1");
      expect(view.stats).toEqual({ revenue: 0, orders: 0, avg_order: 0, low_stock: 1 });
      expect(view.revenue_by_day).toEqual([]);
      expect(view.orders_by_status).toEqual([]);
      expect(view.top_products).toEqual([]);
    });
  });

  describe("POST /api/admin/demo-data/reset", () => {
    it("empties the five tables and answers ok, also the second time", async () => {
      const first = await call("POST", "/api/admin/demo-data/reset", {
        token: await adminToken(),
      });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ ok: true });

      expect(await count("orders")).toBe(0);
      expect(await count("order_items")).toBe(0);
      expect(await count("payments")).toBe(0);
      expect(await count("order_status_history")).toBe(0);
      expect(await count("email_log")).toBe(0);

      // Products and coupons are not demo data: they stay untouched.
      expect(await count("products")).toBe(2);

      const second = await call("POST", "/api/admin/demo-data/reset", {
        token: await adminToken(),
      });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ ok: true });

      // The aggregates are zeroed after the reset.
      const view = await overview("?days=30");
      expect(view.stats).toEqual({ revenue: 0, orders: 0, avg_order: 0, low_stock: 1 });
      expect(view.revenue_by_day).toEqual([]);
      expect(view.orders_by_status).toEqual([]);
      expect(view.top_products).toEqual([]);
    });

    it("refuses a customer and a caller without a token", async () => {
      const asCustomer = await call("POST", "/api/admin/demo-data/reset", {
        token: await customerToken(),
      });
      expect(asCustomer.status).toBe(403);

      const anonymous = await call("POST", "/api/admin/demo-data/reset");
      expect(anonymous.status).toBe(401);
    });
  });
});
