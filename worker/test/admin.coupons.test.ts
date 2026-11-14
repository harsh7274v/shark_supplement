/**
 * The admin coupons: create, list, change and delete.
 *
 * Coupon codes are stored uppercased and unique; the money of a coupon
 * (discount value and min order) is integer paise, like everywhere else.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

interface CouponJson {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  min_order: number;
  active: number;
  single_use_per_user?: number;
}

async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "admin_coupons", role: "admin" }, env.JWT_SECRET);
}

async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_coupons", role: "customer" }, env.JWT_SECRET);
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

async function couponList(): Promise<CouponJson[]> {
  const res = await call("GET", "/api/admin/coupons", { token: await adminToken() });
  expect(res.status).toBe(200);
  return (await res.json()) as CouponJson[];
}

async function createCoupon(body: Record<string, unknown>): Promise<CouponJson> {
  const res = await call("POST", "/api/admin/coupons", {
    body,
    token: await adminToken(),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CouponJson;
}

async function readCouponRow(id: string): Promise<CouponJson | null> {
  return db
    .prepare(
      `SELECT id, code, discount_type, discount_value, min_order, active
       FROM coupons WHERE id = ?`,
    )
    .bind(id)
    .first<CouponJson>();
}

beforeAll(async () => {
  await db.prepare("DELETE FROM coupons").run();
});

describe("admin coupons", () => {
  describe("guards", () => {
    it("answers 401 to coupon creation without a token", async () => {
      const res = await call("POST", "/api/admin/coupons", {
        body: { code: "NEW", discount_type: "percent", discount_value: 10, min_order: 0 },
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });

    it("answers 403 to a customer on coupon creation", async () => {
      const res = await call("POST", "/api/admin/coupons", {
        body: { code: "NEW", discount_type: "percent", discount_value: 10, min_order: 0 },
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });

    it("answers 401 to the coupons list without a token", async () => {
      const res = await call("GET", "/api/admin/coupons");
      expect(res.status).toBe(401);
    });

    it("answers 403 to a customer on the coupons list", async () => {
      const res = await call("GET", "/api/admin/coupons", {
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });

    it("answers 401 to a coupon change without a token", async () => {
      const res = await call("PATCH", "/api/admin/coupons/coup_any", {
        body: { discount_value: 5 },
      });
      expect(res.status).toBe(401);
    });

    it("answers 403 to a customer on a coupon change", async () => {
      const res = await call("PATCH", "/api/admin/coupons/coup_any", {
        body: { discount_value: 5 },
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });

    it("answers 401 to a coupon delete without a token", async () => {
      const res = await call("DELETE", "/api/admin/coupons/coup_any");
      expect(res.status).toBe(401);
    });

    it("answers 403 to a customer on a coupon delete", async () => {
      const res = await call("DELETE", "/api/admin/coupons/coup_any", {
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/admin/coupons", () => {
    it("creates a percent coupon and uppercases the code", async () => {
      const coupon = await createCoupon({
        code: "launch-20",
        discount_type: "percent",
        discount_value: 20,
        min_order: 50_000,
      });

      expect(coupon.code).toBe("LAUNCH-20");
      expect(coupon.discount_type).toBe("percent");
      expect(coupon.discount_value).toBe(20);
      expect(coupon.min_order).toBe(50_000);
      expect(coupon.active).toBe(1);

      const row = await readCouponRow(coupon.id);
      expect(row).not.toBeNull();
      expect(row?.code).toBe("LAUNCH-20");
      expect(row?.discount_value).toBe(20);
      expect(row?.min_order).toBe(50_000);
    });

    it("creates a flat coupon", async () => {
      const coupon = await createCoupon({
        code: "FLAT-500",
        discount_type: "flat",
        discount_value: 500,
        min_order: 0,
      });

      expect(coupon.code).toBe("FLAT-500");
      expect(coupon.discount_type).toBe("flat");
      expect(coupon.discount_value).toBe(500);
      expect(coupon.active).toBe(1);
    });

    it("defaults single_use_per_user to 1 when creating coupon", async () => {
      const coupon = await createCoupon({
        code: "DEFAULT-SINGLE",
        discount_type: "flat",
        discount_value: 100,
        min_order: 0,
      });

      expect(coupon.single_use_per_user).toBe(1);
    });

    it("allows creating a multi-use coupon when single_use_per_user is 0", async () => {
      const coupon = await createCoupon({
        code: "MULTI-USE",
        discount_type: "flat",
        discount_value: 100,
        min_order: 0,
        single_use_per_user: 0,
      });

      expect(coupon.single_use_per_user).toBe(0);
    });

    it("defaults the active flag to 1", async () => {
      const coupon = await createCoupon({
        code: "FREE-SHIP",
        discount_type: "flat",
        discount_value: 10_000,
        min_order: 0,
        active: 1,
      });
      expect(coupon.active).toBe(1);
    });

    it("refuses a duplicate code, case is ignored", async () => {
      await createCoupon({ code: "DUP", discount_type: "percent", discount_value: 10, min_order: 0 });

      const res = await call("POST", "/api/admin/coupons", {
        body: { code: "dup", discount_type: "flat", discount_value: 100, min_order: 0 },
        token: await adminToken(),
      });
      expect(res.status).toBe(409);
    });

    it("refuses a coupon without a code", async () => {
      const res = await call("POST", "/api/admin/coupons", {
        body: { discount_type: "percent", discount_value: 10, min_order: 0 },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    });

    it("refuses a coupon with an empty code", async () => {
      const res = await call("POST", "/api/admin/coupons", {
        body: { code: "   ", discount_type: "percent", discount_value: 10, min_order: 0 },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    });

    it("refuses an unknown discount type", async () => {
      const res = await call("POST", "/api/admin/coupons", {
        body: { code: "BAD", discount_type: "cashback", discount_value: 10, min_order: 0 },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    });

    it("refuses a negative discount value", async () => {
      const res = await call("POST", "/api/admin/coupons", {
        body: { code: "NEG", discount_type: "percent", discount_value: -5, min_order: 0 },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    });

    it("refuses a negative min order", async () => {
      const res = await call("POST", "/api/admin/coupons", {
        body: { code: "NEG2", discount_type: "percent", discount_value: 10, min_order: -100 },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/admin/coupons", () => {
    it("lists the coupons the store has", async () => {
      await db.prepare("DELETE FROM coupons").run();
      await createCoupon({ code: "ALPHA", discount_type: "percent", discount_value: 10, min_order: 0 });
      await createCoupon({ code: "bravo", discount_type: "flat", discount_value: 200, min_order: 0 });

      const list = await couponList();
      expect(list.map((coupon) => coupon.code)).toEqual(["ALPHA", "BRAVO"]);
      expect(list.every((coupon) => typeof coupon.id === "string" && coupon.id.length > 0)).toBe(true);
    });
  });

  describe("PATCH /api/admin/coupons/:id", () => {
    it("changes the fields it is given", async () => {
      const coupon = await createCoupon({
        code: "before",
        discount_type: "percent",
        discount_value: 10,
        min_order: 0,
      });

      const res = await call("PATCH", `/api/admin/coupons/${coupon.id}`, {
        body: { discount_value: 25, active: 0 },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);

      const changed = (await res.json()) as CouponJson;
      expect(changed.code).toBe("BEFORE");
      expect(changed.discount_value).toBe(25);
      expect(changed.active).toBe(0);

      const row = await readCouponRow(coupon.id);
      expect(row?.discount_value).toBe(25);
      expect(row?.active).toBe(0);
    });

    it("uppercases a changed code", async () => {
      const coupon = await createCoupon({ code: "changed", discount_type: "percent", discount_value: 10, min_order: 0 });

      const res = await call("PATCH", `/api/admin/coupons/${coupon.id}`, {
        body: { code: "Changed-99" },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      expect((await res.json()) as CouponJson).toMatchObject({ code: "CHANGED-99" });
    });

    it("refuses a changed code another coupon took", async () => {
      const first = await createCoupon({ code: "one", discount_type: "percent", discount_value: 10, min_order: 0 });
      const second = await createCoupon({ code: "two", discount_type: "percent", discount_value: 10, min_order: 0 });

      const res = await call("PATCH", `/api/admin/coupons/${second.id}`, {
        body: { code: "ONE" },
        token: await adminToken(),
      });
      expect(res.status).toBe(409);
    });

    it("keeps a coupon when its code is confirmed unchanged", async () => {
      const coupon = await createCoupon({ code: "KEEP", discount_type: "percent", discount_value: 10, min_order: 0 });

      const res = await call("PATCH", `/api/admin/coupons/${coupon.id}`, {
        body: { code: "keep" },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      expect((await res.json()) as CouponJson).toMatchObject({ code: "KEEP" });
    });

    it("answers 404 for a coupon that is not there", async () => {
      const res = await call("PATCH", "/api/admin/coupons/coup_does_not_exist", {
        body: { discount_value: 5 },
        token: await adminToken(),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Coupon not found" });
    });
  });

  describe("DELETE /api/admin/coupons/:id", () => {
    it("removes the coupon", async () => {
      const coupon = await createCoupon({ code: "gone", discount_type: "percent", discount_value: 10, min_order: 0 });

      const res = await call("DELETE", `/api/admin/coupons/${coupon.id}`, {
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      expect(await readCouponRow(coupon.id)).toBeNull();

      const list = await couponList();
      expect(list.map((entry) => entry.id)).not.toContain(coupon.id);
    });

    it("answers 404 for a coupon that is not there", async () => {
      const res = await call("DELETE", "/api/admin/coupons/coup_does_not_exist", {
        token: await adminToken(),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Coupon not found" });
    });
  });
});
