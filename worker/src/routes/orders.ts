/**
 * The commerce routes: the coupon validation, the order creation with the
 * mock payment and the buyer's own orders.
 *
 * Mounted at `/api` by `src/index.ts`, so the routes answer on
 * `/api/coupons/validate`, `/api/orders` and `/api/orders/:id/status-history`.
 *
 * The prices of an order are always recomputed from the database: a price
 * sent by the client is never trusted. Every amount is an integer number of
 * paise. Guest checkout stays: the user id of an order is empty when the
 * buyer is not signed in.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../env";
import { sendMail } from "../lib/email";
import { orderPlacedEmail } from "../lib/email-templates";
import { readJsonBody } from "../lib/http";
import type { CouponRow, PricedItem } from "../lib/pricing";
import { couponApplies, couponDiscount, priceOrder } from "../lib/pricing";
import { effectiveVariantPrice, isOnSale, parseOptionMaps, type SaleProductColumns } from "../lib/sale";
import { getOptionalUser, requireAuth } from "../middleware/auth";

type OrdersEnv = { Bindings: Env };
type OrdersContext = Context<OrdersEnv>;

export const ordersRoutes = new Hono<OrdersEnv>();

/** The smallest quantity a line of an order can have. */
const MIN_QTY = 1;
/** The biggest quantity a line of an order can have. */
const MAX_QTY = 20;

/**
 * The most lines a cart may have.
 *
 * The products of a cart are read in one query with a parameter for every
 * different product, and D1 binds at most a hundred parameters in a query, so
 * a cart of too many lines would break the query.
 */
const MAX_CART_ITEMS = 50;

/**
 * The most order ids one query of the buyer's list binds.
 *
 * D1 binds at most a hundred parameters in a query, so the ids of a buyer
 * with many orders go in chunks.
 */
const ID_CHUNK_SIZE = 50;

/** The number of the first order: `KN-` and 1000 plus the orders there are. */
const FIRST_ORDER_NUMBER = 1001;

/** The days an order takes; the estimate the buyer is given. */
const DELIVERY_DAYS = 5;

const INVALID_BODY = "Invalid request body";
const EMPTY_CART = "Cart is empty";
const CART_TOO_LARGE = `Cart cannot have more than ${MAX_CART_ITEMS} items`;
const INVALID_QUANTITY = `Quantity must be between ${MIN_QTY} and ${MAX_QTY}`;
const INVALID_PAYMENT_METHOD = "Invalid payment method";
const SHIPPING_REQUIRED = "Shipping details are required";
const PRODUCT_REQUIRED = "Product id is required";
const INSUFFICIENT_STOCK = "Insufficient stock";
const ORDER_NOT_FOUND = "Order not found";
const NOT_YOUR_ORDER = "Not your order";
const NOT_AUTHENTICATED = "Not authenticated";

/** The payment methods the mock payment knows. */
const PAYMENT_METHODS = new Set(["cod", "upi", "card"]);

/** A product of the cart, as the database has it. */
interface ProductRow extends SaleProductColumns {
  id: string;
  name: string;
  stock: number;
  is_active: number;
}

/** A line of the cart, as the client sends it. */
interface CartItem {
  product_id: string;
  qty: number;
  flavor: string | null;
  weight: string | null;
}

/** The shipping details of an order. */
interface ShippingDetails {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
  landmark?: string;
  state?: string;
}

/** An order row, as the database has it. */
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
  courier_name?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
}

/** A line of an order, as the database has it. */
interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  unit_price: number;
  qty: number;
  flavor: string | null;
  weight: string | null;
}

/** A status history row, as the database has it. */
interface HistoryRow {
  id: string;
  order_id: string;
  status: string;
  note: string | null;
  created_at: string;
}

/** A payment row, as the database has it. */
interface PaymentRow {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  status: string;
  created_at: string;
}

/** Reads a string of a body; anything else reads as an empty string. */
function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A fresh id for an order, a line, a payment or a history row. */
function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Splits a list into chunks of at most `size` items. */
function chunks<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }
  return parts;
}

/** The date an order is expected to be delivered, a few days out. */
function estimatedDeliveryDate(): string {
  return new Date(Date.now() + DELIVERY_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/** The shipping details of a body, or `null` when one of them is missing. */
function readShipping(value: unknown): ShippingDetails | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const details: ShippingDetails = {
    full_name: readString(raw.full_name),
    phone: readString(raw.phone),
    email: readString(raw.email),
    address: readString(raw.address),
    city: readString(raw.city),
    pincode: readString(raw.pincode),
    landmark: readString(raw.landmark),
    state: readString(raw.state),
  };

  const missing = [
    details.full_name,
    details.phone,
    details.email,
    details.address,
    details.city,
    details.pincode,
  ].some((field) => field === "");
  return missing ? null : details;
}

/** The coupon of a code; `null` when there is no coupon with that code. */
async function findCoupon(db: D1Database, code: string): Promise<CouponRow | null> {
  return db
    .prepare(
      "SELECT code, discount_type, discount_value, min_order, active, single_use_per_user FROM coupons WHERE code = ?",
    )
    .bind(code)
    .first<CouponRow>();
}

/**
 * Checks if a customer has already redeemed a single-use coupon in any non-cancelled order.
 */
async function hasUsedCoupon(
  db: D1Database,
  code: string,
  userId: string | null,
  email: string | null,
  phone: string | null,
): Promise<boolean> {
  const cleanPhone = phone ? phone.trim().replace(/[\s\-()]/g, "") : "";
  const identifiers = [
    userId ? `user:${userId}` : "__none__",
    email && email.trim() ? `email:${email.toLowerCase().trim()}` : "__none__",
    cleanPhone ? `phone:${cleanPhone}` : "__none__",
  ];

  try {
    const redemption = await db
      .prepare(
        "SELECT 1 FROM coupon_redemptions WHERE coupon_code = ? AND identifier IN (?, ?, ?) LIMIT 1",
      )
      .bind(code, ...identifiers)
      .first();
    if (redemption !== null) {
      return true;
    }
  } catch {
    // If table not migrated yet, continue to orders table fallback
  }

  const conditions: string[] = [];
  const params: unknown[] = [code];

  if (userId) {
    conditions.push("user_id = ?");
    params.push(userId);
  }
  if (email && email.trim()) {
    conditions.push("LOWER(email) = LOWER(?)");
    params.push(email.trim());
  }
  if (cleanPhone) {
    conditions.push("REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?");
    params.push(cleanPhone);
  }

  if (conditions.length === 0) {
    return false;
  }

  const query = `
    SELECT id FROM orders
    WHERE coupon_code = ?
      AND (${conditions.join(" OR ")})
      AND status != 'cancelled'
    LIMIT 1
  `;

  const found = await db.prepare(query).bind(...params).first<{ id: string }>();
  return found !== null;
}

/** The address of an order, read from the json blob of its column. */
function parseAddress(value: string | null): Record<string, string> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

/**
 * The orders of a buyer, oldest first, with their lines, history, and payment.
 *
 * Automatically filters orders within the last 90 days (3 months) to keep user
 * storage optimized. Orders older than 90 days are archived from the customer view
 * but preserved permanently in admin records for financial, tax and business audit.
 *
 * The lines, history, and payments come in queries of their own, so the list
 * never walks the orders one by one.
 */
async function listOrders(db: D1Database, userId: string) {
  const { results: orderRows } = await db
    .prepare(
      `SELECT id, order_number, user_id, name, email, phone, address, subtotal,
              discount, coupon_code, gst, shipping, total, status,
              estimated_delivery_date, created_at, updated_at,
              courier_name, tracking_number, tracking_url
       FROM orders
       WHERE user_id = ? AND datetime(created_at) >= datetime('now', '-90 days')
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(userId)
    .all<OrderRow>();

  if (orderRows.length === 0) {
    return [];
  }

  const ids = orderRows.map((order) => order.id);
  const itemRows: OrderItemRow[] = [];
  const historyRows: HistoryRow[] = [];
  const paymentRows: PaymentRow[] = [];

  // D1 binds at most a hundred parameters in a query, so the ids go in
  // chunks. Every order is in one chunk, so the lines and the history of an
  // order stay together. The chunks go one after the other, so a buyer with
  // many orders does not open a pile of queries at once.
  for (const chunk of chunks(ids, ID_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => "?").join(", ");

    const [items, history, payments] = await Promise.all([
      db
        .prepare(
          `SELECT id, order_id, product_id, name, unit_price, qty, flavor, weight
           FROM order_items WHERE order_id IN (${placeholders})
           ORDER BY id ASC`,
        )
        .bind(...chunk)
        .all<OrderItemRow>(),
      db
        .prepare(
          `SELECT id, order_id, status, note, created_at
           FROM order_status_history WHERE order_id IN (${placeholders})
           ORDER BY created_at ASC, id ASC`,
        )
        .bind(...chunk)
        .all<HistoryRow>(),
      db
        .prepare(
          `SELECT id, order_id, method, amount, status, created_at
           FROM payments WHERE order_id IN (${placeholders})
           ORDER BY created_at DESC, id DESC`,
        )
        .bind(...chunk)
        .all<PaymentRow>(),
    ]);

    itemRows.push(...items.results);
    historyRows.push(...history.results);
    paymentRows.push(...payments.results);
  }

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.order_id);
    if (list) {
      list.push(item);
    } else {
      itemsByOrder.set(item.order_id, [item]);
    }
  }

  const historyByOrder = new Map<string, HistoryRow[]>();
  for (const entry of historyRows) {
    const list = historyByOrder.get(entry.order_id);
    if (list) {
      list.push(entry);
    } else {
      historyByOrder.set(entry.order_id, [entry]);
    }
  }

  const paymentByOrder = new Map<string, PaymentRow>();
  for (const pay of paymentRows) {
    if (!paymentByOrder.has(pay.order_id)) {
      paymentByOrder.set(pay.order_id, pay);
    }
  }

  return orderRows.map((order) => {
    const payment = paymentByOrder.get(order.id) ?? null;
    return {
      id: order.id,
      order_number: order.order_number,
      user_id: order.user_id,
      name: order.name,
      email: order.email,
      phone: order.phone,
      address: parseAddress(order.address),
      subtotal: order.subtotal,
      discount: order.discount,
      coupon_code: order.coupon_code,
      gst: order.gst,
      shipping: order.shipping,
      total: order.total,
      status: order.status,
      estimated_delivery_date: order.estimated_delivery_date,
      created_at: order.created_at,
      updated_at: order.updated_at,
      courier_name: order.courier_name ?? null,
      tracking_number: order.tracking_number ?? null,
      tracking_url: order.tracking_url ?? null,
      payment: payment
        ? {
            id: payment.id,
            method: payment.method,
            amount: payment.amount,
            status: payment.status,
            created_at: payment.created_at,
          }
        : null,
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        id: item.id,
        product_id: item.product_id,
        name: item.name,
        unit_price: item.unit_price,
        qty: item.qty,
        flavor: item.flavor,
        weight: item.weight,
      })),
      status_history: (historyByOrder.get(order.id) ?? []).map((entry) => ({
        id: entry.id,
        status: entry.status,
        note: entry.note,
        created_at: entry.created_at,
      })),
    };
  });
}

/**
 * Undoes an order whose stock was taken by another order in the meantime:
 * the order goes, and the stock of the products that were taken comes back.
 *
 * The products that failed to take their stock never had any taken, so they
 * are left alone; giving their stock back would inflate it.
 */
async function undoOrder(
  db: D1Database,
  orderId: string,
  stockUpdates: [string, number][],
  failedIds: string[],
): Promise<void> {
  const failed = new Set(failedIds);
  const restore = stockUpdates
    .filter(([productId]) => !failed.has(productId))
    .map(([productId, qty]) =>
      db
        .prepare(
          "UPDATE products SET stock = stock + ?, orders_count = orders_count - ? WHERE id = ?",
        )
        .bind(qty, qty, productId),
    );

  await db.batch([
    ...restore,
    db.prepare("DELETE FROM coupon_redemptions WHERE order_id = ?").bind(orderId),
    db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId),
    db.prepare("DELETE FROM payments WHERE order_id = ?").bind(orderId),
    db.prepare("DELETE FROM order_status_history WHERE order_id = ?").bind(orderId),
    db.prepare("DELETE FROM orders WHERE id = ?").bind(orderId),
  ]);
}

ordersRoutes.post("/coupons/validate", async (c: OrdersContext) => {
  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  const code = readString(body.code).toUpperCase();
  const subtotal =
    typeof body.subtotal === "number" && Number.isFinite(body.subtotal)
      ? Math.max(0, Math.round(body.subtotal))
      : null;

  const eligibleSubtotal =
    typeof body.eligible_subtotal === "number" && Number.isFinite(body.eligible_subtotal)
      ? Math.max(0, Math.round(body.eligible_subtotal))
      : subtotal;

  if (!code || subtotal === null) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  const coupon = await findCoupon(c.env.DB, code);
  if (!coupon || coupon.active !== 1) {
    return c.json({ valid: false });
  }

  if (subtotal < coupon.min_order) {
    const minRupees = Math.round(coupon.min_order / 100);
    return c.json({
      valid: false,
      detail: `Minimum order of ₹${minRupees.toLocaleString("en-IN")} required for coupon ${coupon.code}`,
    });
  }

  if (eligibleSubtotal !== null && eligibleSubtotal <= 0) {
    return c.json({
      valid: false,
      detail: "Coupons cannot be applied to products currently on sale.",
    });
  }

  if (eligibleSubtotal !== null && eligibleSubtotal < coupon.min_order) {
    const minRupees = Math.round(coupon.min_order / 100);
    return c.json({
      valid: false,
      detail: `Minimum eligible items subtotal of ₹${minRupees.toLocaleString("en-IN")} required for coupon ${coupon.code}`,
    });
  }

  // Check single-use per customer
  const user = await getOptionalUser(c);
  let email = readString(body.email) || null;
  if (!email && user?.user_id) {
    const userRow = await c.env.DB.prepare("SELECT email FROM users WHERE id = ?")
      .bind(user.user_id)
      .first<{ email: string }>();
    if (userRow?.email) {
      email = userRow.email;
    }
  }
  const phone = readString(body.phone) || null;
  const userId = user?.user_id || null;

  if (coupon.single_use_per_user === 1 && (userId || email || phone)) {
    const alreadyUsed = await hasUsedCoupon(c.env.DB, coupon.code, userId, email, phone);
    if (alreadyUsed) {
      return c.json({
        valid: false,
        detail: "You have already used this coupon code.",
      });
    }
  }

  return c.json({
    valid: true,
    code: coupon.code,
    discount: couponDiscount(coupon, eligibleSubtotal ?? subtotal),
  });
});

ordersRoutes.post("/orders", async (c: OrdersContext) => {
  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return c.json({ detail: EMPTY_CART }, 400);
  }

  // A cart of many lines has many products, and the products are read in one
  // query with a parameter for every one of them.
  if (rawItems.length > MAX_CART_ITEMS) {
    return c.json({ detail: CART_TOO_LARGE }, 400);
  }

  const items: CartItem[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return c.json({ detail: INVALID_BODY }, 400);
    }

    const line = raw as Record<string, unknown>;
    const productId = readString(line.product_id);
    if (!productId) {
      return c.json({ detail: PRODUCT_REQUIRED }, 400);
    }

    const qty = line.qty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < MIN_QTY || qty > MAX_QTY) {
      return c.json({ detail: INVALID_QUANTITY }, 400);
    }

    items.push({
      product_id: productId,
      qty,
      flavor: readString(line.flavor) || null,
      weight: readString(line.weight) || null,
    });
  }

  const shipping = readShipping(body.shipping);
  if (!shipping) {
    return c.json({ detail: SHIPPING_REQUIRED }, 400);
  }

  const paymentMethod =
    body.payment_method === undefined ? "cod" : readString(body.payment_method).toLowerCase();
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    return c.json({ detail: INVALID_PAYMENT_METHOD }, 400);
  }

  // The products of the cart, with the prices of the database.
  const wanted = [...new Set(items.map((item) => item.product_id))];
  const placeholders = wanted.map(() => "?").join(", ");
  const { results: productRows } = await c.env.DB
    .prepare(
      `SELECT id, name, sale_price, stock, is_active,
              weight_options, weight_prices, sale_percentage, sale_price_override,
              sale_overrides, sale_starts_at, sale_ends_at
       FROM products WHERE id IN (${placeholders})`,
    )
    .bind(...wanted)
    .all<ProductRow>();
  const products = new Map(productRows.map((row) => [row.id, row]));

  // Every line of the cart, with the price of the database.
  const lines: { item: CartItem; priced: PricedItem }[] = [];
  const wantedQty = new Map<string, number>();
  for (const item of items) {
    const product = products.get(item.product_id);
    if (!product || product.is_active !== 1) {
      return c.json({ detail: `Product ${item.product_id} not found` }, 400);
    }

    const onSale = isOnSale(product, new Date());
    lines.push({
      item,
      priced: {
        product_id: item.product_id,
        name: product.name,
        // The line's price is the price of the size it carries: the exact
        // override of that size when one is set, the percentage off the
        // size's own regular price otherwise — or the regular price when no
        // sale is running. Never the price the client claimed.
        unit_price: effectiveVariantPrice(product, parseOptionMaps(product), item.weight, new Date()),
        qty: item.qty,
        flavor: item.flavor,
        weight: item.weight,
        is_on_sale: onSale,
      },
    });
    wantedQty.set(item.product_id, (wantedQty.get(item.product_id) ?? 0) + item.qty);
  }

  // The stock has to cover the whole cart, even when a product is in it twice.
  for (const [productId, qty] of wantedQty) {
    const product = products.get(productId);
    if (!product || product.stock < qty) {
      return c.json({ detail: INSUFFICIENT_STOCK }, 400);
    }
  }

  const pricedItems = lines.map((line) => line.priced);

  // The coupon of the cart. A coupon that cannot be used is ignored, like
  // the old API did.
  const couponCode = readString(body.coupon_code).toUpperCase();
  const coupon = couponCode ? await findCoupon(c.env.DB, couponCode) : null;
  const user = await getOptionalUser(c);

  if (coupon && coupon.single_use_per_user === 1) {
    const alreadyUsed = await hasUsedCoupon(
      c.env.DB,
      coupon.code,
      user?.user_id ?? null,
      shipping.email,
      shipping.phone,
    );
    if (alreadyUsed) {
      return c.json({ detail: "You have already used this coupon code." }, 400);
    }
  }

  const prices = priceOrder(pricedItems, coupon, shipping);
  const appliedCoupon = prices.discount > 0 ? coupon : null;

  const orderId = newId("ord");
  const address = JSON.stringify(shipping);
  const delivery = estimatedDeliveryDate();
  const now = new Date().toISOString();

  const stockUpdates = [...wantedQty.entries()];

  const redemptionStatements: D1PreparedStatement[] = [];
  if (appliedCoupon && appliedCoupon.single_use_per_user === 1) {
    const identifiers: string[] = [];
    if (user?.user_id) identifiers.push(`user:${user.user_id}`);
    if (shipping.email?.trim()) identifiers.push(`email:${shipping.email.toLowerCase().trim()}`);
    const cleanPhone = (shipping.phone || "").replace(/[\s\-()]/g, "");
    if (cleanPhone) identifiers.push(`phone:${cleanPhone}`);

    for (const ident of identifiers) {
      redemptionStatements.push(
        c.env.DB
          .prepare(
            `INSERT INTO coupon_redemptions (coupon_code, identifier, order_id, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(appliedCoupon.code, ident, orderId, now),
      );
    }
  }

  // The order and everything that belongs to it, in one transaction.
  const statements = [
    // The stock of every product of the cart goes down and its order count
    // goes up. The `stock >= ?` keeps the stock from going negative.
    ...stockUpdates.map(([productId, qty]) =>
      c.env.DB
        .prepare(
          `UPDATE products SET stock = stock - ?, orders_count = orders_count + ?
           WHERE id = ? AND stock >= ?`,
        )
        .bind(qty, qty, productId, qty),
    ),
    // Atomic redemption tracking to block concurrent checkout races on single-use coupons.
    ...redemptionStatements,
    // The number of the order is derived from the highest existing order number,
    // so deleting or cleaning up old orders cannot cause a number collision.
    c.env.DB
      .prepare(
        `INSERT INTO orders (id, order_number, user_id, name, email, phone, address,
           subtotal, discount, coupon_code, gst, shipping, total, status,
           estimated_delivery_date, created_at, updated_at)
         VALUES (?, 'KN-' || (SELECT COALESCE(MAX(CAST(SUBSTR(order_number, 4) AS INTEGER)), CAST(? AS INTEGER) - 1) + 1 FROM orders), ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?, 'placed', ?, ?, ?)`,
      )
      .bind(
        orderId,
        FIRST_ORDER_NUMBER,
        user?.user_id ?? null,
        shipping.full_name,
        shipping.email,
        shipping.phone,
        address,
        prices.subtotal,
        prices.discount,
        appliedCoupon?.code ?? null,
        prices.gst,
        prices.shipping,
        prices.total,
        delivery,
        now,
        now,
      ),
    ...lines.map(({ item, priced }) =>
      c.env.DB
        .prepare(
          `INSERT INTO order_items (id, order_id, product_id, name, unit_price, qty, flavor, weight)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("item"),
          orderId,
          item.product_id,
          priced.name,
          priced.unit_price,
          item.qty,
          item.flavor,
          item.weight,
        ),
    ),
    // The mock payment: a card and a upi payment are paid right away, a cash
    // on delivery one is paid when the order arrives.
    c.env.DB
      .prepare("INSERT INTO payments (id, order_id, method, amount, status) VALUES (?, ?, ?, ?, ?)")
      .bind(
        newId("pay"),
        orderId,
        paymentMethod,
        prices.total,
        paymentMethod === "cod" ? "on_delivery" : "paid",
      ),
    c.env.DB
      .prepare("INSERT INTO order_status_history (id, order_id, status, note) VALUES (?, ?, 'placed', ?)")
      .bind(newId("hist"), orderId, "Order placed"),
  ];

  let results: D1Result[];
  try {
    results = await c.env.DB.batch(statements);
  } catch (error) {
    if (
      String(error).includes("UNIQUE constraint failed") &&
      String(error).includes("coupon_redemptions")
    ) {
      return c.json({ detail: "You have already used this coupon code." }, 400);
    }
    throw error;
  }

  // The stock of a product can be taken by another order between the check
  // and the write. When that happens the order is undone. Every product that
  // lost the race is remembered, so the undo leaves their stock alone.
  const failedIds = stockUpdates
    .filter((_, index) => (results[index]?.meta?.changes ?? 0) !== 1)
    .map(([productId]) => productId);
  if (failedIds.length > 0) {
    await undoOrder(c.env.DB, orderId, stockUpdates, failedIds);
    return c.json({ detail: INSUFFICIENT_STOCK }, 400);
  }

  const order = await c.env.DB.prepare("SELECT order_number FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{ order_number: string }>();
  const orderNumber = order?.order_number ?? "";

  try {
    await sendMail(
      c.env,
      orderPlacedEmail(
        {
          order_number: orderNumber,
          name: shipping.full_name,
          email: shipping.email,
          subtotal: prices.subtotal,
          discount: prices.discount,
          gst: prices.gst,
          shipping: prices.shipping,
          total: prices.total,
          estimated_delivery_date: delivery,
        },
        pricedItems.map((item) => ({
          name: item.name,
          qty: item.qty,
          unit_price: item.unit_price,
        })),
      ),
      { orderId, template: "placed" },
    );
  } catch {
    // A mail that cannot be sent must not fail the order.
  }

  return c.json({ order_id: orderId, order_number: orderNumber, total: prices.total }, 201);
});

ordersRoutes.get("/orders", requireAuth, async (c: OrdersContext) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return c.json({ detail: NOT_AUTHENTICATED }, 401);
  }

  return c.json(await listOrders(c.env.DB, user.user_id));
});

/** The same list as `/api/orders`; the storefront asks for `/api/orders/me`. */
ordersRoutes.get("/orders/me", requireAuth, async (c: OrdersContext) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return c.json({ detail: NOT_AUTHENTICATED }, 401);
  }

  return c.json(await listOrders(c.env.DB, user.user_id));
});

ordersRoutes.get("/orders/:id/status-history", requireAuth, async (c: OrdersContext) => {
  const user = await getOptionalUser(c);
  if (!user) {
    return c.json({ detail: NOT_AUTHENTICATED }, 401);
  }

  const order = await c.env.DB.prepare("SELECT id, user_id FROM orders WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ id: string; user_id: string | null }>();

  if (!order) {
    return c.json({ detail: ORDER_NOT_FOUND }, 404);
  }

  if (user.role !== "admin" && order.user_id !== user.user_id) {
    return c.json({ detail: NOT_YOUR_ORDER }, 403);
  }

  const { results } = await c.env.DB
    .prepare(
      `SELECT id, status, note, created_at
       FROM order_status_history WHERE order_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(order.id)
    .all<HistoryRow>();

  return c.json(
    results.map((entry) => ({
      id: entry.id,
      status: entry.status,
      note: entry.note,
      created_at: entry.created_at,
    })),
  );
});
