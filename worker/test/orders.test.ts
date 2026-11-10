/**
 * The commerce routes: the coupon validation, the order creation with the
 * mock payment and the buyer's own orders.
 *
 * The prices of the fixture are the ones of the brief: two products of
 * 299900 paise make a subtotal of 599800 paise, and the `KINETIC10` coupon
 * takes 10% off it.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";

const db = env.DB;

/** The products of the fixture. */
const PROD_WHEY = "prod_orders_whey";
const PROD_PLANT = "prod_orders_plant";
/** A product with a single unit in stock. */
const PROD_LAST = "prod_orders_last";
/**
 * The three products of the race test: the first one wins its stock, the
 * other two lose it to another order.
 */
const PROD_RACE_WON = "prod_orders_race_won";
const PROD_RACE_LOST_A = "prod_orders_race_lost_a";
const PROD_RACE_LOST_B = "prod_orders_race_lost_b";
/** A product of the carts of many lines; nothing else uses it. */
const PROD_BULK = "prod_orders_bulk";

/** The stock every product of the race test has. */
const RACE_STOCK = 10;

/** The stock the product of the big carts has. */
const BULK_STOCK = 200;

/** The most lines a cart may have. */
const MAX_CART_ITEMS = 50;

/** The orders that go into the database in one batch. */
const BULK_BATCH = 50;

/** The sale price of the two products of the brief. */
const SALE_PRICE = 299_900;

/** The subtotal of the cart of the brief. */
const SUBTOTAL = 599_800;
/** The discount of the `KINETIC10` coupon on that subtotal. */
const DISCOUNT = 59_980;
/** The GST on the subtotal left after the discount. */
const GST = 26_991;
/**
 * The total of the cart of the brief: the subtotal less the discount, plus
 * the GST and the shipping. The brief pins 565811, but the numbers it pins
 * for the parts (599800, 59980, 26991 and a free shipping) add up to 566811.
 */
const TOTAL = 566_811;

/** The shipping details of the fixture. */
const SHIPPING = {
  full_name: "Arjun Sharma",
  phone: "9876543210",
  email: "arjun@example.com",
  address: "Flat 4, Iron Heights Gym Road",
  city: "Mumbai",
  pincode: "400001",
};

/** A product of the fixture. */
interface ProductFixture {
  id: string;
  name: string;
  slug: string;
  salePrice: number;
  stock: number;
}

/** A coupon of the fixture; `minOrder` is in paise. */
interface CouponFixture {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  minOrder: number;
  active: number;
}

async function insertProduct(product: ProductFixture): Promise<void> {
  await db
    .prepare(
      `INSERT INTO products
         (id, name, slug, brand, category_id, mrp, sale_price, discount_percent,
          stock, images, flavors, weight_options, badge, is_new_arrival,
          is_active, rating, orders_count, created_at)
       VALUES (?, ?, ?, 'Kinetic', NULL, ?, ?, 0, ?, '[]', '[]', '[]', NULL, 0, 1, 4.5, 0, '2026-01-05 10:00:00')`,
    )
    .bind(
      product.id,
      product.name,
      product.slug,
      product.salePrice,
      product.salePrice,
      product.stock,
    )
    .run();
}

async function insertCoupon(coupon: CouponFixture): Promise<void> {
  await db
    .prepare(
      `INSERT INTO coupons (id, code, discount_type, discount_value, min_order, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      coupon.id,
      coupon.code,
      coupon.type,
      coupon.value,
      coupon.minOrder,
      coupon.active,
    )
    .run();
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    env,
  );
}

function get(path: string, headers: Record<string, string> = {}) {
  return app.request(path, { headers }, env);
}

/** The `name=value` pair of a cookie, ready to be sent back as a header. */
function cookieHeader(res: Response, name: string): string {
  return (
    res.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.split(";")[0] ?? ""
  );
}

/** A fresh email per test. */
function uniqueEmail(): string {
  return `orders-${crypto.randomUUID()}@example.com`;
}

/**
 * Registers a customer and returns the cookie header that signs them in.
 */
async function signIn(email: string): Promise<{ cookie: string; userId: string }> {
  const registered = await post("/api/auth/register", {
    name: "Order Buyer",
    email,
    password: "sup3rsecret",
  });
  expect(registered.status).toBe(201);
  const body = (await registered.json()) as { user_id: string };
  return { cookie: cookieHeader(registered, "access_token"), userId: body.user_id };
}

/**
 * Registers a customer and makes them an admin; the role is read from the
 * database when the access token is signed.
 */
async function signInAsAdmin(email: string): Promise<{ cookie: string; userId: string }> {
  const { userId } = await signIn(email);
  await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(userId).run();
  const loggedIn = await post("/api/auth/login", { email, password: "sup3rsecret" });
  expect(loggedIn.status).toBe(200);
  return { cookie: cookieHeader(loggedIn, "access_token"), userId };
}

/** The cart of the brief: one unit of each of the two products. */
function cart(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      { product_id: PROD_WHEY, qty: 1, flavor: "Rich Chocolate", weight: "1 kg" },
      { product_id: PROD_PLANT, qty: 1, flavor: null, weight: null },
    ],
    coupon_code: "KINETIC10",
    shipping: SHIPPING,
    payment_method: "cod",
    ...overrides,
  };
}

/** An order row of the database. */
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

/** The order of the database, read by its id. */
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
async function readProduct(id: string): Promise<{ stock: number; orders_count: number } | null> {
  return db
    .prepare("SELECT stock, orders_count FROM products WHERE id = ?")
    .bind(id)
    .first<{ stock: number; orders_count: number }>();
}

/**
 * Inserts `count` orders of a buyer, with a line and a history row each.
 *
 * The orders go straight into the database: the test is about the list of the
 * buyer, and a hundred and one requests would be slow.
 */
async function insertOrders(userId: string, count: number): Promise<void> {
  for (let offset = 0; offset < count; offset += BULK_BATCH) {
    const size = Math.min(BULK_BATCH, count - offset);
    const statements: D1PreparedStatement[] = [];

    for (let index = offset; index < offset + size; index++) {
      const orderId = `ord_bulk_${index}_${userId}`;
      const created = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();

      statements.push(
        db
          .prepare(
            `INSERT INTO orders (id, order_number, user_id, name, email, phone, address,
               subtotal, discount, coupon_code, gst, shipping, total, status,
               estimated_delivery_date, created_at, updated_at)
             VALUES (?, ?, ?, 'Bulk Buyer', 'bulk@example.com', '9876543210', '{}',
               ?, 0, NULL, 0, 0, ?, 'placed', NULL, ?, ?)`,
          )
          .bind(orderId, `KN-BULK-${index}-${userId}`, userId, SALE_PRICE, SALE_PRICE, created, created),
        db
          .prepare(
            `INSERT INTO order_items (id, order_id, product_id, name, unit_price, qty, flavor, weight)
             VALUES (?, ?, ?, 'Bulk line', ?, 1, NULL, NULL)`,
          )
          .bind(`item_bulk_${index}_${userId}`, orderId, PROD_WHEY, SALE_PRICE),
        db
          .prepare(
            `INSERT INTO order_status_history (id, order_id, status, note, created_at)
             VALUES (?, ?, 'placed', 'Order placed', ?)`,
          )
          .bind(`hist_bulk_${index}_${userId}`, orderId, created),
      );
    }

    await db.batch(statements);
  }
}

/**
 * Makes the stock of some products impossible to take, the way another order
 * that took the stock in the meantime does.
 *
 * The trigger is a `BEFORE UPDATE` that ignores the update, so the guarded
 * update changes no row and the order route undoes the order. It only fires
 * on an update that takes stock, so the undo, which gives the stock back,
 * still goes through.
 */
async function blockStockUpdate(productIds: string[]): Promise<void> {
  for (const id of productIds) {
    expect(id).toMatch(/^[a-z0-9_]+$/);
  }

  const list = productIds.map((id) => `'${id}'`).join(", ");
  await db
    .prepare(
      `CREATE TRIGGER trg_orders_race BEFORE UPDATE ON products
       WHEN NEW.id IN (${list}) AND NEW.stock < OLD.stock
       BEGIN
         SELECT RAISE(IGNORE);
       END`,
    )
    .run();
}

/** Takes the trigger of the race away again. */
async function unblockStockUpdate(): Promise<void> {
  await db.prepare("DROP TRIGGER IF EXISTS trg_orders_race").run();
}

/** The order as the buyer list serves it. */
interface OrderJson {
  id: string;
  order_number: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  address: Record<string, string> | null;
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
  items: {
    id: string;
    product_id: string | null;
    name: string;
    unit_price: number;
    qty: number;
    flavor: string | null;
    weight: string | null;
  }[];
  status_history: { id: string; status: string; note: string | null; created_at: string }[];
}

beforeAll(async () => {
  await insertProduct({
    id: PROD_WHEY,
    name: "Kinetic Gold 100% Whey Isolate",
    slug: "kinetic-gold-whey-isolate",
    salePrice: SALE_PRICE,
    stock: 100,
  });

  await insertProduct({
    id: PROD_PLANT,
    name: "Kinetic Plant Protein Isolate",
    slug: "kinetic-plant-protein-isolate",
    salePrice: SALE_PRICE,
    stock: 100,
  });

  await insertProduct({
    id: PROD_LAST,
    name: "PureForge Creatine Monohydrate",
    slug: "pureforge-creatine-monohydrate",
    salePrice: 99_900,
    stock: 1,
  });

  // The three products of the race test.
  await insertProduct({
    id: PROD_RACE_WON,
    name: "Race Winner Whey",
    slug: "race-winner-whey",
    salePrice: 1_000,
    stock: RACE_STOCK,
  });

  await insertProduct({
    id: PROD_RACE_LOST_A,
    name: "Race Loser Whey A",
    slug: "race-loser-whey-a",
    salePrice: 1_000,
    stock: RACE_STOCK,
  });

  await insertProduct({
    id: PROD_RACE_LOST_B,
    name: "Race Loser Whey B",
    slug: "race-loser-whey-b",
    salePrice: 1_000,
    stock: RACE_STOCK,
  });

  // The product of the carts of many lines.
  await insertProduct({
    id: PROD_BULK,
    name: "Bulk Cart Whey",
    slug: "bulk-cart-whey",
    salePrice: 1_000,
    stock: BULK_STOCK,
  });

  // A percent coupon with a minimum order of Rs 1000 (100000 paise).
  await insertCoupon({
    id: "coupon_kinetic10",
    code: "KINETIC10",
    type: "percent",
    value: 10,
    minOrder: 100_000,
    active: 1,
  });

  // A flat coupon of Rs 500 (50000 paise).
  await insertCoupon({
    id: "coupon_flat500",
    code: "FLAT500",
    type: "flat",
    value: 50_000,
    minOrder: 0,
    active: 1,
  });

  // A coupon that is not running any more.
  await insertCoupon({
    id: "coupon_expired",
    code: "EXPIRED",
    type: "percent",
    value: 50,
    minOrder: 0,
    active: 0,
  });

  // A coupon that needs an order of Rs 9999 (999900 paise).
  await insertCoupon({
    id: "coupon_bigspend",
    code: "BIGSPEND",
    type: "percent",
    value: 10,
    minOrder: 999_900,
    active: 1,
  });
});

describe("order routes", () => {
  describe("POST /api/coupons/validate", () => {
    it("accepts a percent coupon and gives its share of the subtotal", async () => {
      const res = await post("/api/coupons/validate", { code: "KINETIC10", subtotal: SUBTOTAL });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        valid: true,
        code: "KINETIC10",
        discount: DISCOUNT,
      });
    });

    it("accepts a flat coupon and takes its value", async () => {
      const res = await post("/api/coupons/validate", { code: "FLAT500", subtotal: 99_900 });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        valid: true,
        code: "FLAT500",
        discount: 50_000,
      });
    });

    it("never gives a discount above the subtotal", async () => {
      const res = await post("/api/coupons/validate", { code: "FLAT500", subtotal: 30_000 });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        valid: true,
        code: "FLAT500",
        discount: 30_000,
      });
    });

    it("reads the code in upper case", async () => {
      const res = await post("/api/coupons/validate", { code: " kinetic10 ", subtotal: SUBTOTAL });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ valid: true, code: "KINETIC10" });
    });

    it("rejects a coupon that is not running", async () => {
      const res = await post("/api/coupons/validate", { code: "EXPIRED", subtotal: SUBTOTAL });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ valid: false });
    });

    it("rejects a code that is not a coupon", async () => {
      const res = await post("/api/coupons/validate", { code: "NOPE", subtotal: SUBTOTAL });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ valid: false });
    });

    it("rejects an order below the minimum of the coupon", async () => {
      const res = await post("/api/coupons/validate", { code: "BIGSPEND", subtotal: SUBTOTAL });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ valid: false });
    });

    it("reads the minimum order in paise", async () => {
      // The minimum of KINETIC10 is Rs 1000, so Rs 999 is too little and
      // Rs 1001 is enough.
      const tooSmall = await post("/api/coupons/validate", { code: "KINETIC10", subtotal: 99_900 });
      expect(await tooSmall.json()).toEqual({ valid: false });

      const bigEnough = await post("/api/coupons/validate", {
        code: "KINETIC10",
        subtotal: 100_100,
      });
      expect(await bigEnough.json()).toMatchObject({ valid: true });
    });

    it("rejects a body without a code", async () => {
      const res = await post("/api/coupons/validate", { subtotal: SUBTOTAL });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Invalid request body" });
    });
  });

  describe("POST /api/orders", () => {
    it("places a guest order with the exact totals of the brief", async () => {
      const res = await post("/api/orders", cart());

      expect(res.status).toBe(201);
      const body = (await res.json()) as { order_id: string; order_number: string; total: number };
      expect(body.order_id).toMatch(/^ord_[0-9a-f]{12}$/);
      expect(body.order_number).toMatch(/^KN-\d+$/);
      expect(body.total).toBe(TOTAL);

      const order = await readOrder(body.order_id);
      expect(order?.subtotal).toBe(SUBTOTAL);
      expect(order?.discount).toBe(DISCOUNT);
      expect(order?.gst).toBe(GST);
      expect(order?.shipping).toBe(0);
      expect(order?.total).toBe(TOTAL);
      expect(order?.coupon_code).toBe("KINETIC10");
      expect(order?.status).toBe("placed");
      expect(order?.user_id).toBeNull();
    });

    it("numbers the orders after the orders that are already there", async () => {
      const before = await db
        .prepare("SELECT COUNT(*) AS total FROM orders")
        .first<{ total: number }>();

      const res = await post("/api/orders", cart());
      const body = (await res.json()) as { order_number: string };

      expect(body.order_number).toBe(`KN-${1001 + (before?.total ?? 0)}`);
    });

    it("stores the shipping details of the buyer", async () => {
      const res = await post("/api/orders", cart());
      const body = (await res.json()) as { order_id: string };

      const order = await readOrder(body.order_id);
      expect(order?.name).toBe(SHIPPING.full_name);
      expect(order?.email).toBe(SHIPPING.email);
      expect(order?.phone).toBe(SHIPPING.phone);
      expect(JSON.parse(order?.address ?? "{}")).toEqual(SHIPPING);
    });

    it("gives an order of a signed in buyer the user id", async () => {
      const { cookie, userId } = await signIn(uniqueEmail());

      const res = await post("/api/orders", cart(), { Cookie: cookie });
      const body = (await res.json()) as { order_id: string };

      const order = await readOrder(body.order_id);
      expect(order?.user_id).toBe(userId);
    });

    it("records a cash on delivery payment as not paid yet", async () => {
      const res = await post("/api/orders", cart({ payment_method: "cod" }));
      const body = (await res.json()) as { order_id: string };

      const payment = await db
        .prepare("SELECT method, amount, status FROM payments WHERE order_id = ?")
        .bind(body.order_id)
        .first<{ method: string; amount: number; status: string }>();

      expect(payment?.method).toBe("cod");
      expect(payment?.amount).toBe(TOTAL);
      expect(payment?.status).toBe("on_delivery");
    });

    it("records an upi payment as paid", async () => {
      const res = await post("/api/orders", cart({ payment_method: "upi" }));
      const body = (await res.json()) as { order_id: string };

      const payment = await db
        .prepare("SELECT method, status FROM payments WHERE order_id = ?")
        .bind(body.order_id)
        .first<{ method: string; status: string }>();

      expect(payment?.method).toBe("upi");
      expect(payment?.status).toBe("paid");
    });

    it("records a card payment as paid", async () => {
      const res = await post("/api/orders", cart({ payment_method: "card" }));
      const body = (await res.json()) as { order_id: string };

      const payment = await db
        .prepare("SELECT method, status FROM payments WHERE order_id = ?")
        .bind(body.order_id)
        .first<{ method: string; status: string }>();

      expect(payment?.method).toBe("card");
      expect(payment?.status).toBe("paid");
    });

    it("takes the stock of every product of the cart", async () => {
      const before = await readProduct(PROD_WHEY);

      const res = await post("/api/orders", cart());
      const body = (await res.json()) as { order_id: string };

      const after = await readProduct(PROD_WHEY);
      expect(after?.stock).toBe((before?.stock ?? 0) - 1);
      expect(after?.orders_count).toBe((before?.orders_count ?? 0) + 1);
    });

    it("counts the units of a line, not the lines", async () => {
      const before = await readProduct(PROD_WHEY);

      const res = await post(
        "/api/orders",
        cart({
          items: [{ product_id: PROD_WHEY, qty: 3, flavor: null, weight: null }],
          coupon_code: null,
        }),
      );
      const body = (await res.json()) as { order_id: string };

      const after = await readProduct(PROD_WHEY);
      expect(after?.stock).toBe((before?.stock ?? 0) - 3);
      expect(after?.orders_count).toBe((before?.orders_count ?? 0) + 3);
    });

    it("writes the lines of the order with the price of the database", async () => {
      const res = await post(
        "/api/orders",
        cart({
          items: [{ product_id: PROD_WHEY, qty: 2, flavor: "Rich Chocolate", weight: "1 kg" }],
        }),
      );
      const body = (await res.json()) as { order_id: string };

      const { results: items } = await db
        .prepare(
          "SELECT product_id, name, unit_price, qty, flavor, weight FROM order_items WHERE order_id = ?",
        )
        .bind(body.order_id)
        .all<{
          product_id: string | null;
          name: string;
          unit_price: number;
          qty: number;
          flavor: string | null;
          weight: string | null;
        }>();

      expect(items).toHaveLength(1);
      expect(items[0]?.product_id).toBe(PROD_WHEY);
      expect(items[0]?.name).toBe("Kinetic Gold 100% Whey Isolate");
      expect(items[0]?.unit_price).toBe(SALE_PRICE);
      expect(items[0]?.qty).toBe(2);
      expect(items[0]?.flavor).toBe("Rich Chocolate");
      expect(items[0]?.weight).toBe("1 kg");
    });

    it("writes a status history row of the order", async () => {
      const res = await post("/api/orders", cart());
      const body = (await res.json()) as { order_id: string };

      const { results: history } = await db
        .prepare("SELECT status FROM order_status_history WHERE order_id = ?")
        .bind(body.order_id)
        .all<{ status: string }>();

      expect(history.map((row) => row.status)).toEqual(["placed"]);
    });

    it("sets the date the order is expected to be delivered", async () => {
      const res = await post("/api/orders", cart());
      const body = (await res.json()) as { order_id: string };

      const order = await readOrder(body.order_id);
      const expected = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      expect(order?.estimated_delivery_date).toBe(expected);
    });

    it("logs the mail of the order", async () => {
      const res = await post("/api/orders", cart());
      const body = (await res.json()) as { order_id: string };

      const mail = await db
        .prepare("SELECT order_id, to_email, template, status FROM email_log WHERE order_id = ?")
        .bind(body.order_id)
        .first<{
          order_id: string | null;
          to_email: string;
          template: string;
          status: string;
        }>();

      expect(mail?.order_id).toBe(body.order_id);
      expect(mail?.to_email).toBe(SHIPPING.email);
      expect(mail?.template).toBe("placed");
      expect(mail?.status).toBe("skipped");
    });

    it("prices the order from the database and not from the client", async () => {
      const res = await post(
        "/api/orders",
        cart({
          items: [
            { product_id: PROD_WHEY, qty: 1, price: 1, unit_price: 1, line_total: 1 },
            { product_id: PROD_PLANT, qty: 1, price: 1, unit_price: 1, line_total: 1 },
          ],
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { total: number };
      expect(body.total).toBe(TOTAL);
    });

    it("ignores a coupon that cannot be used", async () => {
      const res = await post("/api/orders", cart({ coupon_code: "EXPIRED" }));
      const body = (await res.json()) as { order_id: string; total: number };

      const order = await readOrder(body.order_id);
      expect(order?.coupon_code).toBeNull();
      expect(order?.discount).toBe(0);
    });

    it("rejects a cart without items", async () => {
      const res = await post("/api/orders", cart({ items: [] }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Cart is empty" });
    });

    it("rejects a quantity of zero", async () => {
      const res = await post(
        "/api/orders",
        cart({ items: [{ product_id: PROD_WHEY, qty: 0, flavor: null, weight: null }] }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Quantity must be between 1 and 20" });
    });

    it("rejects a quantity above twenty", async () => {
      const res = await post(
        "/api/orders",
        cart({ items: [{ product_id: PROD_WHEY, qty: 21, flavor: null, weight: null }] }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Quantity must be between 1 and 20" });
    });

    it("rejects an order that is bigger than the stock", async () => {
      const res = await post(
        "/api/orders",
        cart({ items: [{ product_id: PROD_LAST, qty: 2, flavor: null, weight: null }] }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Insufficient stock" });
    });

    it("writes nothing when the stock is not enough", async () => {
      const before = await db.prepare("SELECT COUNT(*) AS total FROM orders").first<{
        total: number;
      }>();

      const res = await post("/api/orders", cart({ items: [{ product_id: PROD_LAST, qty: 2 }] }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Insufficient stock" });

      const after = await db.prepare("SELECT COUNT(*) AS total FROM orders").first<{
        total: number;
      }>();
      expect(after?.total).toBe(before?.total);
    });

    it("rejects a product that is not there", async () => {
      const res = await post(
        "/api/orders",
        cart({ items: [{ product_id: "prod_does_not_exist", qty: 1 }] }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Product prod_does_not_exist not found" });
    });

    it("rejects an order without shipping details", async () => {
      const res = await post("/api/orders", cart({ shipping: { full_name: "Arjun Sharma" } }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Shipping details are required" });
    });

    it("rejects a payment method it does not know", async () => {
      const res = await post("/api/orders", cart({ payment_method: "cheque" }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Invalid payment method" });
    });

    it("rejects a cart with more lines than the cart may have", async () => {
      const items = Array.from({ length: MAX_CART_ITEMS + 1 }, () => ({
        product_id: PROD_BULK,
        qty: 1,
        flavor: null,
        weight: null,
      }));

      const res = await post("/api/orders", cart({ items }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        detail: `Cart cannot have more than ${MAX_CART_ITEMS} items`,
      });
    });

    it("rejects a cart with more different products than D1 can bind", async () => {
      // More than a hundred different products would need more than the
      // hundred parameters D1 binds in a query.
      const items = Array.from({ length: 101 }, (_, index) => ({
        product_id: `prod_orders_many_${index}`,
        qty: 1,
        flavor: null,
        weight: null,
      }));

      const res = await post("/api/orders", cart({ items }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        detail: `Cart cannot have more than ${MAX_CART_ITEMS} items`,
      });
    });

    it("takes a cart of the biggest size it may have", async () => {
      const items = Array.from({ length: MAX_CART_ITEMS }, () => ({
        product_id: PROD_BULK,
        qty: 1,
        flavor: "Rich Chocolate",
        weight: "1 kg",
      }));

      const res = await post("/api/orders", cart({ items, coupon_code: null }));

      expect(res.status).toBe(201);
    });

    it("gives the stock back to the product that won the race", async () => {
      // One product loses its stock to another order; the other one keeps
      // its stock and has to get it back.
      await blockStockUpdate([PROD_RACE_LOST_A]);

      try {
        const res = await post(
          "/api/orders",
          cart({
            items: [
              { product_id: PROD_RACE_WON, qty: 1, flavor: null, weight: null },
              { product_id: PROD_RACE_LOST_A, qty: 1, flavor: null, weight: null },
            ],
            coupon_code: null,
          }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ detail: "Insufficient stock" });

        const won = await readProduct(PROD_RACE_WON);
        expect(won?.stock).toBe(RACE_STOCK);
        expect(won?.orders_count).toBe(0);

        const lost = await readProduct(PROD_RACE_LOST_A);
        expect(lost?.stock).toBe(RACE_STOCK);
        expect(lost?.orders_count).toBe(0);
      } finally {
        await unblockStockUpdate();
      }
    });

    it("gives the stock back only to the products that lost the race", async () => {
      // The first product wins its stock, the other two lose it to another
      // order that took the stock in the meantime.
      await blockStockUpdate([PROD_RACE_LOST_A, PROD_RACE_LOST_B]);
      const before = await db.prepare("SELECT COUNT(*) AS total FROM orders").first<{
        total: number;
      }>();

      try {
        const res = await post(
          "/api/orders",
          cart({
            items: [
              { product_id: PROD_RACE_WON, qty: 1, flavor: null, weight: null },
              { product_id: PROD_RACE_LOST_A, qty: 1, flavor: null, weight: null },
              { product_id: PROD_RACE_LOST_B, qty: 1, flavor: null, weight: null },
            ],
            coupon_code: null,
          }),
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ detail: "Insufficient stock" });

        // The product that won its stock gets it back.
        const won = await readProduct(PROD_RACE_WON);
        expect(won?.stock).toBe(RACE_STOCK);
        expect(won?.orders_count).toBe(0);

        // The products that lost the race never took their stock, so they
        // must not get any back either.
        const lostA = await readProduct(PROD_RACE_LOST_A);
        expect(lostA?.stock).toBe(RACE_STOCK);
        expect(lostA?.orders_count).toBe(0);

        const lostB = await readProduct(PROD_RACE_LOST_B);
        expect(lostB?.stock).toBe(RACE_STOCK);
        expect(lostB?.orders_count).toBe(0);

        // The order is gone; the undo takes it away.
        const after = await db.prepare("SELECT COUNT(*) AS total FROM orders").first<{
          total: number;
        }>();
        expect(after?.total).toBe(before?.total);
      } finally {
        await unblockStockUpdate();
      }
    });
  });

  describe("GET /api/orders", () => {
    it("answers 401 without a token", async () => {
      const res = await get("/api/orders");

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });

    it("lists the orders of the buyer with the items and the history", async () => {
      const { cookie, userId } = await signIn(uniqueEmail());

      const placed = await post("/api/orders", cart(), { Cookie: cookie });
      const placedBody = (await placed.json()) as { order_id: string };

      const res = await get("/api/orders", { Cookie: cookie });
      expect(res.status).toBe(200);
      const orders = (await res.json()) as OrderJson[];

      expect(orders.map((order) => order.id)).toContain(placedBody.order_id);
      const order = orders.find((entry) => entry.id === placedBody.order_id);
      expect(order?.user_id).toBe(userId);
      expect(order?.order_number).toMatch(/^KN-\d+$/);
      expect(order?.items).toHaveLength(2);
      expect(order?.items[0]?.unit_price).toBe(SALE_PRICE);
      expect(order?.status_history.map((entry) => entry.status)).toEqual(["placed"]);
    });

    it("lists the orders of the buyer oldest first", async () => {
      const { cookie } = await signIn(uniqueEmail());

      await post("/api/orders", cart(), { Cookie: cookie });
      await post("/api/orders", cart(), { Cookie: cookie });

      const res = await get("/api/orders", { Cookie: cookie });
      const orders = (await res.json()) as OrderJson[];

      expect(orders).toHaveLength(2);
      expect((orders[0]?.created_at ?? "") <= (orders[1]?.created_at ?? "")).toBe(true);
    });

    it("does not list the orders of another buyer", async () => {
      const mine = await signIn(uniqueEmail());
      const other = await signIn(uniqueEmail());

      const placed = await post("/api/orders", cart(), { Cookie: mine.cookie });
      const placedBody = (await placed.json()) as { order_id: string };

      const res = await get("/api/orders", { Cookie: other.cookie });
      const orders = (await res.json()) as OrderJson[];

      expect(orders.map((order) => order.id)).not.toContain(placedBody.order_id);
    });

    it("does not list the guest orders", async () => {
      const { cookie } = await signIn(uniqueEmail());

      await post("/api/orders", cart());

      const res = await get("/api/orders", { Cookie: cookie });
      const orders = (await res.json()) as OrderJson[];

      expect(orders).toHaveLength(0);
    });

    it("serves the same list on /api/orders/me", async () => {
      const { cookie } = await signIn(uniqueEmail());
      await post("/api/orders", cart(), { Cookie: cookie });

      const list = await get("/api/orders", { Cookie: cookie });
      const me = await get("/api/orders/me", { Cookie: cookie });

      expect(me.status).toBe(200);
      expect(await me.json()).toEqual(await list.json());
    });

    it("answers 401 on /api/orders/me without a token", async () => {
      const res = await get("/api/orders/me");

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });

    it("lists a buyer with more than a hundred orders", async () => {
      const { cookie, userId } = await signIn(uniqueEmail());
      await insertOrders(userId, 101);

      const res = await get("/api/orders", { Cookie: cookie });

      expect(res.status).toBe(200);
      const orders = (await res.json()) as OrderJson[];
      expect(orders).toHaveLength(101);
      expect(orders.every((order) => order.items.length === 1)).toBe(true);
      expect(orders.every((order) => order.status_history.length === 1)).toBe(true);
    });
  });

  describe("GET /api/orders/:id/status-history", () => {
    it("answers 401 without a token", async () => {
      const res = await get("/api/orders/order_does_not_exist/status-history");

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ detail: "Not authenticated" });
    });

    it("serves the history of the order to its owner", async () => {
      const { cookie } = await signIn(uniqueEmail());
      const placed = await post("/api/orders", cart(), { Cookie: cookie });
      const placedBody = (await placed.json()) as { order_id: string };

      const res = await get(`/api/orders/${placedBody.order_id}/status-history`, {
        Cookie: cookie,
      });

      expect(res.status).toBe(200);
      const history = (await res.json()) as { status: string; note: string | null }[];
      expect(history).toHaveLength(1);
      expect(history[0]?.status).toBe("placed");
    });

    it("answers 403 for a buyer of another order", async () => {
      const owner = await signIn(uniqueEmail());
      const other = await signIn(uniqueEmail());
      const placed = await post("/api/orders", cart(), { Cookie: owner.cookie });
      const placedBody = (await placed.json()) as { order_id: string };

      const res = await get(`/api/orders/${placedBody.order_id}/status-history`, {
        Cookie: other.cookie,
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ detail: "Not your order" });
    });

    it("serves the history of any order to an admin", async () => {
      const owner = await signIn(uniqueEmail());
      const admin = await signInAsAdmin(uniqueEmail());
      const placed = await post("/api/orders", cart(), { Cookie: owner.cookie });
      const placedBody = (await placed.json()) as { order_id: string };

      const res = await get(`/api/orders/${placedBody.order_id}/status-history`, {
        Cookie: admin.cookie,
      });

      expect(res.status).toBe(200);
      const history = (await res.json()) as { status: string }[];
      expect(history.map((entry) => entry.status)).toEqual(["placed"]);
    });

    it("answers 404 for an order that is not there", async () => {
      const { cookie } = await signIn(uniqueEmail());

      const res = await get("/api/orders/order_does_not_exist/status-history", {
        Cookie: cookie,
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Order not found" });
    });
  });
});
