/**
 * The demo data seed: the catalog (categories, products, coupons, users)
 * plus ~30 deterministic demo orders, and the
 * `POST /api/admin/demo-data/seed` endpoint behind `requireAdmin`.
 *
 * The seed SQL files are executed in the setup below. Every statement uses
 * `INSERT OR IGNORE` on the unique keys, so re-running the seed (and the
 * endpoint) is a no-op: idempotent and reset-safe.
 *
 * `worker/test/seed.test.ts` — RED → GREEN: Step 1 runs the seed in the
 * setup, then asserts against the catalog routes, the admin login route,
 * `GET /api/admin/overview` and the new seed endpoint itself.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

const ADMIN_EMAIL = "admin@kineticnutrition.com";
const ADMIN_PASSWORD = "KinetiAdmin@2026";

function seedBinding(name: string): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  if (typeof value !== "string") {
    throw new Error(`Missing seed binding ${name}`);
  }
  return value;
}

/** Splits a seed file on semicolons and runs every statement.
 *
 * Full-line comments (starting with `--`) are stripped first, so a comment
 * block never reaches D1 as a statement.
 */
async function runSeedFile(name: string): Promise<void> {
  const statements = seedBinding(name)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

async function count(table: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function call(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
) {
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

async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "user_admin", role: "admin" }, env.JWT_SECRET);
}

async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_customer", role: "customer" }, env.JWT_SECRET);
}

beforeAll(async () => {
  await runSeedFile("SEED_CATALOG");
  await runSeedFile("SEED_DEMO_ORDERS");
});

describe("seed data", () => {
  describe("catalog", () => {
    it("seeds the ten categories with taglines and seed image URLs", async () => {
      const res = await app.request("/api/categories", {}, env);
      expect(res.status).toBe(200);
      const categories = (await res.json()) as { slug: string; image_url: string | null; tagline: string | null }[];
      // Seven seed categories plus the three growth categories migration 0002
      // seeds (apparel, aminos, gym-gear at sort_order 90/91/92).
      expect(categories).toHaveLength(10);
      expect(categories.map((c) => c.slug)).toEqual([
        "proteins",
        "gainers",
        "pre_post",
        "ayurveda",
        "fit_foods",
        "vitamins",
        "fat_loss",
        "apparel",
        "aminos",
        "gym-gear",
      ]);
      expect(categories.find((c) => c.slug === "proteins")).toMatchObject({
        slug: "proteins",
        image_url: "/api/images/catalog/whey_isolate.jpg",
        tagline: "Whey, isolate & plant protein",
      });
    });

    it("GET /api/products returns all 18 active products with uppercase badges", async () => {
      const res = await app.request("/api/products", {}, env);
      expect(res.status).toBe(200);
      const products = (await res.json()) as { id: string; slug: string; badge: string | null; mrp: number; sale_price: number }[];
      expect(products).toHaveLength(18);

      const whey = products.find((p) => p.id === "prod_whey_isolate");
      expect(whey).toBeDefined();
      expect(whey?.badge).toBe("HOT");
      expect(whey?.mrp).toBe(399900);
      expect(whey?.sale_price).toBe(299900);

      const plant = products.find((p) => p.id === "prod_plant_protein");
      expect(plant).toBeDefined();
      expect(plant?.badge).toBe("NEW");
    });

    it("marks NEW products as new arrivals", async () => {
      const plant = await app.request("/api/products/prod_plant_protein", {}, env);
      expect(plant.status).toBe(200);
      const body = (await plant.json()) as { badge: string | null; is_new_arrival: number };
      expect(body.badge).toBe("NEW");
      expect(body.is_new_arrival).toBe(1);

      const whey = await app.request("/api/products/prod_whey_isolate", {}, env);
      expect(whey.status).toBe(200);
      const wheyBody = (await whey.json()) as { badge: string | null; is_new_arrival: number };
      expect(wheyBody.badge).toBe("HOT");
      expect(wheyBody.is_new_arrival).toBe(0);
    });
  });

  describe("coupons", () => {
    it("seeds KINETIC10, WELCOME15, MUSCLE500 with min_order in paise", async () => {
      const res = await call("GET", "/api/admin/coupons", { token: await adminToken() });
      expect(res.status).toBe(200);
      const coupons = (await res.json()) as { code: string; discount_type: string; discount_value: number; min_order: number }[];
      const byCode = Object.fromEntries(coupons.map((c) => [c.code, c]));
      expect(byCode["KINETIC10"]).toMatchObject({ code: "KINETIC10", discount_type: "percent", discount_value: 10, min_order: 149900, active: 1 });
      expect(byCode["WELCOME15"]).toMatchObject({ code: "WELCOME15", discount_type: "percent", discount_value: 15, min_order: 199900, active: 1 });
      expect(byCode["MUSCLE500"]).toMatchObject({ code: "MUSCLE500", discount_type: "flat", discount_value: 50000, min_order: 299900, active: 1 });
    });
  });

  describe("admin login", () => {
    it("lets the seeded admin log in via POST /api/auth/login", async () => {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      }, env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { role: string; email: string };
      expect(body.role).toBe("admin");
      expect(body.email).toBe(ADMIN_EMAIL);
      const cookies = res.headers.getSetCookie();
      expect(cookies.some((cookie) => cookie.startsWith("access_token="))).toBe(true);
    });

    it("rejects a wrong password for the seeded admin", async () => {
      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: "wrong-password" }),
      }, env);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/admin/demo-data/seed", () => {
    it("answers 401 without a token", async () => {
      const res = await call("POST", "/api/admin/demo-data/seed");
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });

    it("answers 403 to a customer", async () => {
      const res = await call("POST", "/api/admin/demo-data/seed", {
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ detail: "Admin access required" });
    });

    it("seeds idempotently for an admin", async () => {
      const first = await call("POST", "/api/admin/demo-data/seed", {
        token: await adminToken(),
      });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ ok: true });

      expect(await count("categories")).toBe(10);
      expect(await count("products")).toBe(18);
      expect(await count("coupons")).toBe(3);
      expect(await count("users")).toBe(2);
      expect(await count("orders")).toBe(30);
      expect(await count("order_items")).toBeGreaterThan(0);
      expect(await count("payments")).toBe(30);
      expect(await count("order_status_history")).toBeGreaterThan(0);

      // Running again changes nothing: idempotent.
      const second = await call("POST", "/api/admin/demo-data/seed", {
        token: await adminToken(),
      });
      expect(second.status).toBe(200);
      expect(await count("orders")).toBe(30);
      expect(await count("products")).toBe(18);
      expect(await count("users")).toBe(2);
    });
  });

  describe("GET /api/admin/overview", () => {
    it("reports orders > 20, revenue > 0 and at least 14 days of revenue", async () => {
      const res = await call("GET", "/api/admin/overview", {
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      const view = (await res.json()) as {
        stats: { orders: number; revenue: number };
        revenue_by_day: { date: string; total: number }[];
      };
      expect(view.stats.orders).toBeGreaterThan(20);
      expect(view.stats.revenue).toBeGreaterThan(0);
      expect(view.revenue_by_day.length).toBeGreaterThanOrEqual(14);
    });
  });
});
