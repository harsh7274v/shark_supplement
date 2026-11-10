/**
 * The admin orders: the list, the detail, the status pipeline and the
 * payments list.
 *
 * The D1 database of a test file starts empty, so every fixture below is
 * inserted straight into the tables the routes read and write. Orders that
 * flow through the pipeline are placed through `POST /api/orders` so the
 * stock, the payment and the history are created the real way.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

/** The products of the fixture. */
const PROD_WHEY = "prod_admin_orders_whey";
const PROD_PLANT = "prod_admin_orders_plant";

/** The orders of the fixture, in the order the list must serve them. */
const ORD_PLACED = "ord_admin_orders_placed";
const ORD_SHIPPED = "ord_admin_orders_shipped";
const ORD_CANCELLED = "ord_admin_orders_cancelled";
const ORD_DELIVERED = "ord_admin_orders_delivered";

/** The buyer of the fixture orders. */
const BUYER_EMAIL = "buyer@example.com";
const BUYER_NAME = "Buyer Person";
const BUYER_PHONE = "9999999999";
const BUYER_ADDRESS = {
  full_name: "Buyer Person",
  phone: "9999999999",
  email: "buyer@example.com",
  address: "42 Gym Road",
  city: "Mumbai",
  pincode: "400001",
};

/** An order row of the database, without the computed admin columns. */
interface OrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  subtotal: number;
  discount: number;
  coupon_code: string | null;
  gst: number;
  shipping: number;
  total: number;
  status: string;
  estimated_delivery_date: string | null;
  created_at: string;
  updated_at: string;
}

/** An order row of the admin list, with the computed columns. */
interface AdminOrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  subtotal: number;
  discount: number;
  coupon_code: string | null;
  gst: number;
  shipping: number;
  total: number;
  status: string;
  estimated_delivery_date: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  payment_method: string | null;
  payment_status: string | null;
}

/** A row of the log of the mails. */
interface MailRow {
  order_id: string | null;
  to_email: string;
  template: string;
  status: string;
  error: string | null;
}

async function insertProduct(
  id: string,
  name: string,
  salePrice: number,
  stock: number,
): Promise<void> {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  await db
    .prepare(
      `INSERT INTO products
         (id, name, slug, brand, category_id, mrp, sale_price, discount_percent,
          stock, images, flavors, weight_options, badge, is_new_arrival,
          is_active, rating, orders_count, created_at)
       VALUES (?, ?, ?, 'Kinetic', NULL, ?, ?, 0, ?, '[]', '[]', '[]', NULL, 0, 1, 4.5, 0, '2026-11-01 00:00:00')`,
    )
    .bind(id, name, slug, salePrice, salePrice, stock)
    .run();
}

async function insertOrder({
  id,
  orderNumber,
  status,
  createdAt,
  items = [],
  payment = null,
  history = [],
  emails = [],
  address = BUYER_ADDRESS,
}: {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  items?: { productId: string; qty: number }[];
  payment: { method: string; status: string; amount: number } | null;
  history?: { status: string; note: string | null; createdAt?: string }[];
  emails?: { template: string; status?: string; to_email?: string }[];
  address?: Record<string, string>;
}): Promise<void> {
  // The prices come from the database, like a real order does.
  const priced: { productId: string; unitPrice: number }[] = [];
  let total = 0;
  for (const item of items) {
    const row = await db
      .prepare("SELECT sale_price FROM products WHERE id = ?")
      .bind(item.productId)
      .first<{ sale_price: number }>();
    const unitPrice = row?.sale_price ?? 0;
    priced.push({ productId: item.productId, unitPrice });
    total += unitPrice * item.qty;
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO orders (id, order_number, user_id, name, email, phone, address,
           subtotal, discount, coupon_code, gst, shipping, total, status,
           estimated_delivery_date, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, NULL, 0, 0, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        id,
        orderNumber,
        BUYER_NAME,
        BUYER_EMAIL,
        BUYER_PHONE,
        JSON.stringify(address),
        total,
        total,
        status,
        createdAt,
        createdAt,
      ),
  ];

  for (const [index, item] of items.entries()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO order_items (id, order_id, product_id, name, unit_price, qty, flavor, weight)
           VALUES (?, ?, ?, 'Fixture item', ?, ?, NULL, NULL)`,
        )
        .bind(`item_${id}_${index}`, id, item.productId, priced[index].unitPrice, item.qty),
    );
  }

  if (payment) {
    statements.push(
      db
        .prepare(
          "INSERT INTO payments (id, order_id, method, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(`pay_${id}`, id, payment.method, payment.amount, payment.status, createdAt),
    );
  }

  for (const [index, entry] of history.entries()) {
    statements.push(
      db
        .prepare(
          "INSERT INTO order_status_history (id, order_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          `hist_${index}_${id}`,
          id,
          entry.status,
          entry.note,
          entry.createdAt ?? createdAt,
        ),
    );
  }

  for (const [index, mail] of emails.entries()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO email_log (id, order_id, to_email, template, status, error, created_at)
           VALUES (?, ?, ?, ?, 'skipped', NULL, ?)`,
        )
        .bind(
          `mail_${id}_${index}`,
          id,
          mail.to_email ?? BUYER_EMAIL,
          mail.template,
          createdAt,
        ),
    );
  }

  await db.batch(statements);
}

/** The row of an order, read by its id. */
async function readOrder(id: string): Promise<OrderRow | null> {
  return db
    .prepare(
      `SELECT id, order_number, user_id, name, email, phone, address, subtotal,
              discount, coupon_code, gst, shipping, total, status,
              estimated_delivery_date, created_at, updated_at
       FROM orders WHERE id = ?`,
    )
    .bind(id)
    .first<OrderRow>();
}

/** The stock and the orders count of a product. */
async function readProduct(id: string): Promise<{ stock: number } | null> {
  return db
    .prepare("SELECT stock FROM products WHERE id = ?")
    .bind(id)
    .first<{ stock: number }>();
}

/** The last mail of the log of an order with a given template. */
async function readMail(
  orderId: string,
  template: string,
): Promise<MailRow | null> {
  return db
    .prepare(
      `SELECT order_id, to_email, template, status, error
       FROM email_log WHERE order_id = ? AND template = ?`,
    )
    .bind(orderId, template)
    .first<MailRow>();
}

/** The history of an order, the statuses in order. */
async function readHistory(orderId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT status FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, id ASC")
    .bind(orderId)
    .all<{ status: string }>();
  return results.map((row) => row.status);
}

async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "admin_orders", role: "admin" }, env.JWT_SECRET);
}

async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_orders", role: "customer" }, env.JWT_SECRET);
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

/** Places an order through the storefront route and answers with its body. */
async function placeOrder(overrides: {
  items?: { productId: string; qty: number }[];
  payment_method?: "cod" | "upi" | "card";
}): Promise<{ order_id: string; order_number: string; total: number }> {
  const items = overrides.items ?? [{ productId: PROD_WHEY, qty: 1 }];
  const res = await call("POST", "/api/orders", {
    body: {
      items: items.map(({ productId, qty }) => ({
        product_id: productId,
        qty,
        flavor: null,
        weight: null,
      })),
      shipping: BUYER_ADDRESS,
      payment_method: overrides.payment_method ?? "cod",
    },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { order_id: string; order_number: string; total: number };
}

/** The date an order is expected to be delivered, five days out. */
function deliveryEstimate(): string {
  return new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
}

beforeAll(async () => {
  // The test database is shared and persistent across files and runs: start
  // every run from empty tables so the fixture is the only data there is.
  await db.prepare("DELETE FROM email_log").run();
  await db.prepare("DELETE FROM order_status_history").run();
  await db.prepare("DELETE FROM order_items").run();
  await db.prepare("DELETE FROM payments").run();
  await db.prepare("DELETE FROM orders").run();
  await db.prepare("DELETE FROM products").run();

  await insertProduct(PROD_WHEY, "Kinetic Gold Whey", 299_900, 10);
  await insertProduct(PROD_PLANT, "Kinetic Plant Protein", 199_900, 6);

  // Two orders on day one: the placed one must lead its day in the list.
  await insertOrder({
    id: ORD_PLACED,
    orderNumber: "KN-3001",
    status: "placed",
    createdAt: "2026-11-08 09:00:00",
    items: [{ productId: PROD_WHEY, qty: 2 }],
    payment: { method: "cod", status: "on_delivery", amount: 599_800 },
    history: [{ status: "placed", note: "Order placed" }],
    emails: [{ template: "placed" }],
  });

  await insertOrder({
    id: ORD_SHIPPED,
    orderNumber: "KN-3002",
    status: "shipped",
    createdAt: "2026-11-08 11:00:00",
    items: [{ productId: PROD_PLANT, qty: 1 }],
    payment: { method: "upi", status: "paid", amount: 199_900 },
    history: [
      { status: "placed", note: "Order placed" },
      { status: "shipped", note: "Order shipped" },
    ],
    emails: [{ template: "placed" }, { template: "shipped" }],
  });

  // Two orders on day two, newest first within the day.
  await insertOrder({
    id: ORD_CANCELLED,
    orderNumber: "KN-3004",
    status: "cancelled",
    createdAt: "2026-11-07 11:00:00",
    items: [{ productId: PROD_PLANT, qty: 3 }],
    payment: { method: "cod", status: "cancelled", amount: 599_700 },
    history: [
      { status: "placed", note: "Order placed" },
      { status: "cancelled", note: "Order cancelled" },
    ],
    emails: [{ template: "placed" }, { template: "cancelled" }],
  });

  await insertOrder({
    id: ORD_DELIVERED,
    orderNumber: "KN-3003",
    status: "delivered",
    createdAt: "2026-11-07 10:00:00",
    items: [{ productId: PROD_WHEY, qty: 1 }],
    payment: { method: "card", status: "paid", amount: 299_900 },
    history: [
      { status: "placed", note: "Order placed" },
      { status: "delivered", note: "Order delivered" },
    ],
    emails: [{ template: "placed" }, { template: "delivered" }],
  });
});

describe("admin orders", () => {
  describe("guards", () => {
    it("answers 401 to the orders list without a token", async () => {
      const res = await call("GET", "/api/admin/orders");
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });

    it("answers 403 to a customer on the orders list", async () => {
      const res = await call("GET", "/api/admin/orders", {
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });

    it("answers 401 to the order detail without a token", async () => {
      const res = await call("GET", `/api/admin/orders/${ORD_PLACED}`);
      expect(res.status).toBe(401);
    });

    it("answers 403 to a customer on the order detail", async () => {
      const res = await call("GET", `/api/admin/orders/${ORD_PLACED}`, {
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });

    it("answers 401 to a status change without a token", async () => {
      const res = await call("PATCH", `/api/admin/orders/${ORD_PLACED}`, {
        body: { status: "cancelled" },
      });
      expect(res.status).toBe(401);
    });

    it("answers 403 to a customer on a status change", async () => {
      const res = await call("PATCH", `/api/admin/orders/${ORD_PLACED}`, {
        body: { status: "cancelled" },
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });

    it("answers 401 to the payments list without a token", async () => {
      const res = await call("GET", "/api/admin/payments");
      expect(res.status).toBe(401);
    });

    it("answers 403 to a customer on the payments list", async () => {
      const res = await call("GET", "/api/admin/payments", {
        token: await customerToken(),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/orders", () => {
    it("lists all orders newest day first, placed rows first within their day", async () => {
      const res = await call("GET", "/api/admin/orders", {
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      const rows = (await res.json()) as AdminOrderRow[];
      expect(rows.map((row) => row.order_number)).toEqual([
        "KN-3001",
        "KN-3002",
        "KN-3004",
        "KN-3003",
      ]);
    });

    it("gives every row its item count and its payment summary", async () => {
      const res = await call("GET", "/api/admin/orders", {
        token: await adminToken(),
      });
      const rows = (await res.json()) as AdminOrderRow[];

      const placed = rows.find((row) => row.order_number === "KN-3001");
      expect(placed?.item_count).toBe(1);
      expect(placed?.payment_method).toBe("cod");
      expect(placed?.payment_status).toBe("on_delivery");

      const shipped = rows.find((row) => row.order_number === "KN-3002");
      expect(shipped?.item_count).toBe(1);
      expect(shipped?.payment_method).toBe("upi");
      expect(shipped?.payment_status).toBe("paid");
    });

    it("filters by status", async () => {
      const res = await call("GET", "/api/admin/orders?status=shipped", {
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      const rows = (await res.json()) as AdminOrderRow[];
      expect(rows.map((row) => row.order_number)).toEqual(["KN-3002"]);
    });

    it("matches the query against order number, name and email", async () => {
      const byNumber = await call("GET", "/api/admin/orders?q=KN-3001", {
        token: await adminToken(),
      });
      expect((await byNumber.json()) as AdminOrderRow[]).toHaveLength(1);

      const byBuyer = await call("GET", "/api/admin/orders?q=Buyer", {
        token: await adminToken(),
      });
      expect((await byBuyer.json()) as AdminOrderRow[]).toHaveLength(4);
    });
  });

  describe("GET /api/admin/orders/:id", () => {
    it("serves the customer, the address, the items, the payment, the history and the mail log", async () => {
      const res = await call("GET", `/api/admin/orders/${ORD_SHIPPED}`, {
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      const order = (await res.json()) as {
        id: string;
        order_number: string;
        name: string;
        email: string;
        phone: string | null;
        address: Record<string, string> | null;
        items: { product_id: string | null; qty: number }[];
        payment: { method: string; status: string; amount: number } | null;
        status_history: { status: string }[];
        email_log: { template: string }[];
      };

      expect(order.id).toBe(ORD_SHIPPED);
      expect(order.order_number).toBe("KN-3002");
      expect(order.name).toBe(BUYER_NAME);
      expect(order.email).toBe(BUYER_EMAIL);
      expect(order.phone).toBe(BUYER_PHONE);
      expect(order.address).toEqual({
        full_name: BUYER_NAME,
        phone: BUYER_PHONE,
        email: BUYER_EMAIL,
        address: "42 Gym Road",
        city: "Mumbai",
        pincode: "400001",
      });
      expect(order.items).toHaveLength(1);
      expect(order.items[0]?.product_id).toBe(PROD_PLANT);
      expect(order.items[0]?.qty).toBe(1);
      expect(order.payment).toMatchObject({
        method: "upi",
        status: "paid",
        amount: 199_900,
      });
      expect(order.status_history.map((entry) => entry.status)).toEqual([
        "placed",
        "shipped",
      ]);
      expect(order.email_log.map((entry) => entry.template)).toEqual([
        "placed",
        "shipped",
      ]);
    });

    it("answers 404 for an order that is not there", async () => {
      const res = await call("GET", "/api/admin/orders/order_does_not_exist", {
        token: await adminToken(),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Order not found" });
    });
  });

  describe("GET /api/admin/payments", () => {
    it("lists the payments with the order numbers, newest first", async () => {
      const res = await call("GET", "/api/admin/payments", {
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      const payments = (await res.json()) as {
        id: string;
        order_id: string;
        order_number: string;
        method: string;
        amount: number;
        status: string;
        created_at: string;
      }[];
      expect(payments.map((payment) => payment.order_number)).toEqual([
        "KN-3002",
        "KN-3001",
        "KN-3004",
        "KN-3003",
      ]);
      expect(payments[0]).toMatchObject({
        order_number: "KN-3002",
        method: "upi",
        amount: 199_900,
        status: "paid",
      });
    });
  });

  describe("PATCH /api/admin/orders/:id", () => {
    it("moves an order placed → confirmed → shipped and defaults the ETA to +5 days", async () => {
      const placed = await placeOrder({ items: [{ productId: PROD_WHEY, qty: 1 }] });

      const confirmed = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "confirmed" },
        token: await adminToken(),
      });
      expect(confirmed.status).toBe(200);
      expect((await confirmed.json()) as { status: string }).toMatchObject({
        status: "confirmed",
      });

      const eta = deliveryEstimate();
      const shipped = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "shipped" },
        token: await adminToken(),
      });
      expect(shipped.status).toBe(200);
      const shippedBody = (await shipped.json()) as {
        status: string;
        estimated_delivery_date: string | null;
      };
      expect(shippedBody.status).toBe("shipped");
      expect(shippedBody.estimated_delivery_date).toBe(eta);

      const order = await readOrder(placed.order_id);
      expect(order?.status).toBe("shipped");
      expect(order?.estimated_delivery_date).toBe(eta);
      const history = (await readHistory(placed.order_id)).slice().sort();
      expect(history).toEqual(["confirmed", "placed", "shipped"]);

      const mail = await readMail(placed.order_id, "shipped");
      expect(mail).not.toBeNull();
      expect(mail?.to_email).toBe(BUYER_EMAIL);
      expect(mail?.status).toBe("skipped");
    });

    it("uses the ETA from the body when the order is shipped", async () => {
      const placed = await placeOrder({ items: [{ productId: PROD_WHEY, qty: 1 }] });
      await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "confirmed" },
        token: await adminToken(),
      });

      const res = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "shipped", estimated_delivery_date: "2026-12-24" },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { estimated_delivery_date: string | null };
      expect(body.estimated_delivery_date).toBe("2026-12-24");
    });

    it("moves an order shipped → delivered", async () => {
      const placed = await placeOrder({ items: [{ productId: PROD_PLANT, qty: 1 }] });
      await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "confirmed" },
        token: await adminToken(),
      });
      await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "shipped" },
        token: await adminToken(),
      });

      const res = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "delivered" },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);
      expect((await readOrder(placed.order_id))?.status).toBe("delivered");
    });

    it("refuses to skip a step in the pipeline", async () => {
      const placed = await placeOrder({ items: [{ productId: PROD_WHEY, qty: 1 }] });

      const res = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "delivered" },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        detail: "Cannot change status from placed to delivered",
      });
      expect((await readOrder(placed.order_id))?.status).toBe("placed");
    });

    it("refuses to cancel an order after it has shipped", async () => {
      const placed = await placeOrder({ items: [{ productId: PROD_WHEY, qty: 1 }] });
      await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "confirmed" },
        token: await adminToken(),
      });
      const shipped = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "shipped" },
        token: await adminToken(),
      });
      expect(shipped.status).toBe(200);

      const res = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "cancelled" },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        detail: "Cannot cancel after shipping",
      });
      expect((await readOrder(placed.order_id))?.status).toBe("shipped");
    });

    it("cancels a placed order: stock back, payment cancelled, cancel mail logged", async () => {
      const before = await readProduct(PROD_WHEY);
      const placed = await placeOrder({
        items: [{ productId: PROD_WHEY, qty: 2 }],
        payment_method: "cod",
      });
      const afterOrder = await readProduct(PROD_WHEY);
      expect(afterOrder?.stock).toBe((before?.stock ?? 0) - 2);

      const res = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { status: "cancelled" },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);

      const restored = await readProduct(PROD_WHEY);
      expect(restored?.stock).toBe(before?.stock);

      const payment = await db
        .prepare("SELECT status FROM payments WHERE order_id = ?")
        .bind(placed.order_id)
        .first<{ status: string }>();
      expect(payment?.status).toBe("cancelled");

      const order = await readOrder(placed.order_id);
      expect(order?.status).toBe("cancelled");
      const history = (await readHistory(placed.order_id)).slice().sort();
      expect(history).toEqual(["cancelled", "placed"]);

      const mail = await readMail(placed.order_id, "cancelled");
      expect(mail).not.toBeNull();
      expect(mail?.to_email).toBe(BUYER_EMAIL);
    });

    it("refuses to replace the shipping block of a delivered order", async () => {
      const res = await call("PATCH", `/api/admin/orders/${ORD_DELIVERED}`, {
        body: { shipping: BUYER_ADDRESS },
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        detail: "Order can no longer be edited",
      });
    });

    it("replaces the whole contact and address block of a placed order", async () => {
      const placed = await placeOrder({ items: [{ productId: PROD_WHEY, qty: 1 }] });

      const updated = {
        ...BUYER_ADDRESS,
        full_name: "New Name",
        email: "new@example.com",
        phone: "1111111111",
        address: "7 New Street",
        city: "Pune",
        pincode: "411001",
      };
      const res = await call("PATCH", `/api/admin/orders/${placed.order_id}`, {
        body: { shipping: updated },
        token: await adminToken(),
      });
      expect(res.status).toBe(200);

      const order = await readOrder(placed.order_id);
      expect(order?.name).toBe("New Name");
      expect(order?.email).toBe("new@example.com");
      expect(order?.phone).toBe("1111111111");
      expect(JSON.parse(order?.address ?? "{}")).toMatchObject({
        full_name: "New Name",
        phone: "1111111111",
        email: "new@example.com",
        address: "7 New Street",
        city: "Pune",
        pincode: "411001",
      });
    });

    it("answers 404 for an order that is not there", async () => {
      const res = await call("PATCH", "/api/admin/orders/order_does_not_exist", {
        body: { status: "confirmed" },
        token: await adminToken(),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Order not found" });
    });
  });
});
