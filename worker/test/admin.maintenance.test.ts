/**
 * Tests for 90-day user order retention, tracking logistics, and database maintenance cleanup.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "user_admin", role: "admin" }, env.JWT_SECRET);
}

async function customerToken(userId: string): Promise<string> {
  return signAccessToken({ sub: userId, role: "customer" }, env.JWT_SECRET);
}

async function call(
  method: string,
  path: string,
  options?: { body?: unknown; token?: string; cookie?: string },
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options?.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  if (options?.cookie) {
    headers["Cookie"] = options.cookie;
  }
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }

  return app.request(
    `http://localhost${path}`,
    {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    },
    env,
  );
}

describe("Data Retention & Logistics Tracking", () => {
  const USER_ID = "user_retention_test";
  const USER_EMAIL = "retention@example.com";

  beforeAll(async () => {
    // Insert user
    await db.prepare(
      "INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, 'customer')",
    ).bind(USER_ID, USER_EMAIL, "Retention Test User").run();

    // Insert a recent order (5 days ago)
    await db.prepare(
      `INSERT INTO orders (id, order_number, user_id, name, email, phone, address,
         subtotal, discount, coupon_code, gst, shipping, total, status,
         courier_name, tracking_number, tracking_url, created_at, updated_at)
       VALUES (?, ?, ?, 'Recent Buyer', ?, '9999999999', '{"city":"Jamshedpur"}',
         200000, 0, NULL, 10000, 0, 210000, 'shipped',
         'Blue Dart', 'BD123456789', 'https://bluedart.com/track/BD123456789',
         datetime('now', '-5 days'), datetime('now', '-5 days'))`,
    ).bind("ord_recent_1", "KN-REC-001", USER_ID, USER_EMAIL).run();

    // Insert payment for recent order
    await db.prepare(
      "INSERT INTO payments (id, order_id, method, amount, status, created_at) VALUES (?, ?, 'upi', 210000, 'paid', datetime('now', '-5 days'))",
    ).bind("pay_rec_1", "ord_recent_1").run();

    // Insert an old order (100 days ago, >90 days)
    await db.prepare(
      `INSERT INTO orders (id, order_number, user_id, name, email, phone, address,
         subtotal, discount, coupon_code, gst, shipping, total, status,
         courier_name, tracking_number, tracking_url, created_at, updated_at)
       VALUES (?, ?, ?, 'Old Buyer', ?, '9999999999', '{"city":"Jamshedpur"}',
         150000, 0, NULL, 7500, 0, 157500, 'delivered',
         'Delhivery', 'DEL987654', 'https://delhivery.com/track/DEL987654',
         datetime('now', '-100 days'), datetime('now', '-100 days'))`,
    ).bind("ord_old_1", "KN-OLD-001", USER_ID, USER_EMAIL).run();

    // Insert payment for old order
    await db.prepare(
      "INSERT INTO payments (id, order_id, method, amount, status, created_at) VALUES (?, ?, 'cod', 157500, 'paid', datetime('now', '-100 days'))",
    ).bind("pay_old_1", "ord_old_1").run();

    // Insert old email log (>90 days)
    await db.prepare(
      "INSERT INTO email_log (id, order_id, to_email, template, status, created_at) VALUES (?, ?, ?, 'placed', 'sent', datetime('now', '-95 days'))",
    ).bind("mail_old_1", "ord_old_1", USER_EMAIL).run();

    // Insert recent email log (<90 days)
    await db.prepare(
      "INSERT INTO email_log (id, order_id, to_email, template, status, created_at) VALUES (?, ?, ?, 'placed', 'sent', datetime('now', '-2 days'))",
    ).bind("mail_rec_1", "ord_recent_1", USER_EMAIL).run();

    // Insert expired session
    await db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '-1 days'))",
    ).bind("sess_expired_1", USER_ID).run();
  });

  it("filters out orders older than 90 days from the customer view", async () => {
    const token = await customerToken(USER_ID);
    const res = await call("GET", "/api/orders", { token });
    expect(res.status).toBe(200);

    const orders = (await res.json()) as any[];
    // Customer should only see the recent order, not the 100-day old order
    expect(orders.map((o) => o.id)).toContain("ord_recent_1");
    expect(orders.map((o) => o.id)).not.toContain("ord_old_1");
  });

  it("returns payment and courier tracking details on customer order", async () => {
    const token = await customerToken(USER_ID);
    const res = await call("GET", "/api/orders", { token });
    expect(res.status).toBe(200);

    const orders = (await res.json()) as any[];
    const order = orders.find((o) => o.id === "ord_recent_1");
    expect(order).toBeDefined();
    expect(order.courier_name).toBe("Blue Dart");
    expect(order.tracking_number).toBe("BD123456789");
    expect(order.tracking_url).toBe("https://bluedart.com/track/BD123456789");
    expect(order.payment).toBeDefined();
    expect(order.payment.method).toBe("upi");
    expect(order.payment.status).toBe("paid");
  });

  it("retains all orders (both recent and >90 days) for the admin", async () => {
    const token = await adminToken();
    const res = await call("GET", "/api/admin/orders", { token });
    expect(res.status).toBe(200);

    const orders = (await res.json()) as any[];
    // Admin must retain 100% of historical orders for accounting/GST!
    expect(orders.map((o) => o.id)).toContain("ord_recent_1");
    expect(orders.map((o) => o.id)).toContain("ord_old_1");
  });

  it("allows admin to update courier tracking fields on an order", async () => {
    const token = await adminToken();
    const res = await call("PATCH", "/api/admin/orders/ord_recent_1", {
      body: {
        courier_name: "DTDC Express",
        tracking_number: "DTDC998877",
        tracking_url: "https://dtdc.in/track/DTDC998877",
      },
      token,
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as any;
    expect(updated.courier_name).toBe("DTDC Express");
    expect(updated.tracking_number).toBe("DTDC998877");
    expect(updated.tracking_url).toBe("https://dtdc.in/track/DTDC998877");
  });

  it("returns retention stats via GET /api/admin/maintenance/stats", async () => {
    const token = await adminToken();
    const res = await call("GET", "/api/admin/maintenance/stats", { token });
    expect(res.status).toBe(200);

    const stats = (await res.json()) as any;
    expect(stats.retention_policy_days).toBe(90);
    expect(stats.total_orders_in_database).toBeGreaterThanOrEqual(2);
    expect(stats.user_orders_pending_anonymization).toBeGreaterThanOrEqual(1);
    expect(stats.email_logs_older_than_90_days).toBeGreaterThanOrEqual(1);
    expect(stats.expired_sessions).toBeGreaterThanOrEqual(1);
  });

  it("performs 90-day retention cleanup via POST /api/admin/maintenance/cleanup", async () => {
    const token = await adminToken();
    const res = await call("POST", "/api/admin/maintenance/cleanup", { token });
    expect(res.status).toBe(200);

    const result = (await res.json()) as any;
    expect(result.success).toBe(true);
    expect(result.orders_anonymized).toBeGreaterThanOrEqual(1);
    expect(result.email_logs_purged).toBeGreaterThanOrEqual(1);
    expect(result.sessions_purged).toBeGreaterThanOrEqual(1);

    // Verify in DB that old order has user_id = NULL
    const oldOrder = await db.prepare("SELECT user_id, order_number FROM orders WHERE id = 'ord_old_1'").first<{ user_id: string | null }>();
    expect(oldOrder?.user_id).toBeNull();

    // Verify recent order still has user_id
    const recentOrder = await db.prepare("SELECT user_id FROM orders WHERE id = 'ord_recent_1'").first<{ user_id: string | null }>();
    expect(recentOrder?.user_id).toBe(USER_ID);

    // Verify admin STILL has both orders in admin list!
    const adminRes = await call("GET", "/api/admin/orders", { token });
    const adminOrders = (await adminRes.json()) as any[];
    expect(adminOrders.map((o) => o.id)).toContain("ord_recent_1");
    expect(adminOrders.map((o) => o.id)).toContain("ord_old_1");

    // Verify old email log is deleted and recent email log is preserved
    const oldMail = await db.prepare("SELECT id FROM email_log WHERE id = 'mail_old_1'").first();
    expect(oldMail).toBeNull();
    const recentMail = await db.prepare("SELECT id FROM email_log WHERE id = 'mail_rec_1'").first();
    expect(recentMail).not.toBeNull();
  });
});
