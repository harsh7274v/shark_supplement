import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const db = env.DB;

/** Every table the schema migration must create. */
const EXPECTED_TABLES = [
  "categories",
  "coupons",
  "email_log",
  "login_attempts",
  "order_items",
  "order_status_history",
  "orders",
  "password_resets",
  "payments",
  "products",
  "sessions",
  "users",
];

async function insertCategory(id: string, slug: string): Promise<void> {
  await db
    .prepare("INSERT INTO categories (id, slug, name) VALUES (?, ?, ?)")
    .bind(id, slug, `Category ${slug}`)
    .run();
}

async function insertProduct(id: string, slug: string, categoryId: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO products (id, name, slug, category_id, mrp, sale_price) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, `Product ${slug}`, slug, categoryId, 399900, 299900)
    .run();
}

async function insertOrder(
  id: string,
  orderNumber: string,
  userId: string | null = null,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO orders (id, order_number, user_id, name, email, subtotal, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, orderNumber, userId, "Test Buyer", "buyer@example.com", 299900, 299900)
    .run();
}

describe("d1 schema", () => {
  it("creates exactly the tables of the schema migration", async () => {
    const { results } = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations' ORDER BY name",
      )
      .all<{ name: string }>();

    expect(results.map((row) => row.name)).toEqual(EXPECTED_TABLES);
  });

  it("stores a category and a product that references it", async () => {
    await insertCategory("cat_fk", "protein");
    await insertProduct("prod_fk", "whey-isolate", "cat_fk");

    const row = await db
      .prepare(
        "SELECT p.name AS product, c.name AS category FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?",
      )
      .bind("prod_fk")
      .first<{ product: string; category: string }>();

    expect(row).toEqual({ product: "Product whey-isolate", category: "Category protein" });
  });

  it("cascades an order delete to its items", async () => {
    await insertCategory("cat_cascade", "fat-loss");
    await insertProduct("prod_cascade", "fat-burner", "cat_cascade");
    await insertOrder("order_cascade", "KN-1001");
    await db
      .prepare(
        "INSERT INTO order_items (id, order_id, product_id, name, unit_price, qty, flavor, weight) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        "item_cascade",
        "order_cascade",
        "prod_cascade",
        "Product fat-burner",
        299900,
        2,
        "Berry Blast",
        "450 ml",
      )
      .run();

    await db.prepare("DELETE FROM orders WHERE id = ?").bind("order_cascade").run();

    const { results } = await db
      .prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_id = ?")
      .bind("order_cascade")
      .all<{ count: number }>();

    expect(results[0]?.count).toBe(0);
  });

  it("rejects an order status outside the allowed set", async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO orders (id, order_number, name, email, status) VALUES (?, ?, ?, ?, ?)",
        )
        .bind("order_bad_status", "KN-BAD", "Test Buyer", "buyer@example.com", "bogus")
        .run(),
    ).rejects.toThrow();
  });

  it("accepts a guest order with no user_id", async () => {
    await insertOrder("order_guest", "KN-1002");

    const row = await db
      .prepare("SELECT user_id, estimated_delivery_date FROM orders WHERE id = ?")
      .bind("order_guest")
      .first<{ user_id: string | null; estimated_delivery_date: string | null }>();

    expect(row).toEqual({ user_id: null, estimated_delivery_date: null });
  });

  it("links an order to a user account", async () => {
    await db
      .prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)")
      .bind("user_1", "buyer@example.com", "Test Buyer")
      .run();
    await insertOrder("order_user", "KN-1003", "user_1");

    const row = await db
      .prepare("SELECT user_id FROM orders WHERE id = ?")
      .bind("order_user")
      .first<{ user_id: string | null }>();

    expect(row?.user_id).toBe("user_1");
  });

  it("rejects a user role outside the allowed set", async () => {
    await expect(
      db
        .prepare("INSERT INTO users (id, email, role) VALUES (?, ?, ?)")
        .bind("user_bad_role", "bad-role@example.com", "wizard")
        .run(),
    ).rejects.toThrow();
  });

  it("stores a mock payment for an order", async () => {
    await insertOrder("order_paid", "KN-1004");
    await db
      .prepare(
        "INSERT INTO payments (id, order_id, method, amount, status) VALUES (?, ?, ?, ?, ?)",
      )
      .bind("pay_ok", "order_paid", "upi", 299900, "paid")
      .run();

    const row = await db
      .prepare("SELECT method, amount, status FROM payments WHERE id = ?")
      .bind("pay_ok")
      .first<{ method: string; amount: number; status: string }>();

    expect(row).toEqual({ method: "upi", amount: 299900, status: "paid" });
  });

  it("rejects a payment status outside the allowed set", async () => {
    await insertOrder("order_payment", "KN-1005");

    await expect(
      db
        .prepare(
          "INSERT INTO payments (id, order_id, method, amount, status) VALUES (?, ?, ?, ?, ?)",
        )
        .bind("pay_bad_status", "order_payment", "cod", 299900, "bogus")
        .run(),
    ).rejects.toThrow();
  });

  it("logs a skipped email for an order", async () => {
    await insertOrder("order_email", "KN-1006");
    await db
      .prepare(
        "INSERT INTO email_log (id, order_id, to_email, template, status) VALUES (?, ?, ?, ?, ?)",
      )
      .bind("email_ok", "order_email", "buyer@example.com", "placed", "skipped")
      .run();

    const row = await db
      .prepare("SELECT to_email, template, status FROM email_log WHERE id = ?")
      .bind("email_ok")
      .first<{ to_email: string; template: string; status: string }>();

    expect(row).toEqual({
      to_email: "buyer@example.com",
      template: "placed",
      status: "skipped",
    });
  });

  it("rejects an email log status outside the allowed set", async () => {
    await insertOrder("order_email_bad", "KN-1007");

    await expect(
      db
        .prepare(
          "INSERT INTO email_log (id, order_id, to_email, template, status) VALUES (?, ?, ?, ?, ?)",
        )
        .bind("email_bad_status", "order_email_bad", "buyer@example.com", "placed", "bogus")
        .run(),
    ).rejects.toThrow();
  });
});
