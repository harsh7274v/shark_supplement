/**
 * The admin products: the list, the create, the change and the soft delete.
 *
 * The D1 database of a test file starts empty, so the fixture below is the
 * only category the products can point at.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

/** The one category of the fixture. */
const CAT_ID = "cat_admin_products";

/** The message of a sale price that is not below the mrp. */
const BAD_PRICE = "Sale price must be ≤ MRP and > 0";

/** A product row, as the database has it. */
interface ProductRow {
  id: string;
  name: string;
  slug: string;
  mrp: number;
  sale_price: number;
  discount_percent: number;
  stock: number;
  badge: string | null;
  is_active: number;
  images: string;
  flavors: string;
  weight_options: string;
  weight_prices: string | null;
}

/** A product, as the API serves it. */
interface ProductJson {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
  category_id: string | null;
  category: string | null;
  category_name: string | null;
  mrp: number;
  sale_price: number;
  discount_percent: number;
  stock: number;
  images: string[];
  flavors: string[];
  weight_options: string[];
  badge: string | null;
  is_new_arrival: number;
  is_active: number;
  created_at: string;
  flavor_images: Record<string, string>;
  weight_images: Record<string, string>;
  weight_prices: Record<string, number>;
  sale_overrides: Record<string, number>;
  contents: string | null;
  nutrition: string | null;
  sale_percentage: number;
  sale_price_override: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
}

/** An access token of an admin. */
async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "admin_products", role: "admin" }, env.JWT_SECRET);
}

/** An access token of a customer. */
async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_products", role: "customer" }, env.JWT_SECRET);
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

/** The body of a product that is valid in every way. */
function productBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Kinetic Gold Whey",
    brand: "Kinetic",
    description: "Whey protein isolate",
    category_id: CAT_ID,
    mrp: 399900,
    sale_price: 299900,
    stock: 25,
    images: ["/api/images/products/cover.png"],
    flavors: ["Rich Chocolate"],
    weight_options: ["1 kg", "2 kg"],
    badge: "none",
    is_new_arrival: 0,
    is_active: 1,
    ...overrides,
  };
}

/** Reads the row of a product of the database. */
async function readRow(id: string): Promise<ProductRow | null> {
  return db
    .prepare(
      `SELECT id, name, slug, mrp, sale_price, discount_percent, stock, badge,
              is_active, images, flavors, weight_options, weight_prices
       FROM products WHERE id = ?`,
    )
    .bind(id)
    .first<ProductRow>();
}

/** Reads the products of the admin list. */
async function adminList(): Promise<ProductJson[]> {
  const res = await call("GET", "/api/admin/products", { token: await adminToken() });
  expect(res.status).toBe(200);
  return (await res.json()) as ProductJson[];
}

/** Reads the products of the storefront list. */
async function publicList(): Promise<ProductJson[]> {
  const res = await call("GET", "/api/products");
  expect(res.status).toBe(200);
  return (await res.json()) as ProductJson[];
}

/** Creates a product and answers with the product the API made. */
async function createProduct(
  overrides: Record<string, unknown> = {},
): Promise<ProductJson> {
  const res = await call("POST", "/api/admin/products", {
    body: productBody(overrides),
    token: await adminToken(),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as ProductJson;
}

beforeAll(async () => {
  await db
    .prepare(
      `INSERT INTO categories (id, slug, name, image_url, tagline, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      CAT_ID,
      "proteins",
      "Proteins",
      "/api/images/seed/proteins.jpg",
      "Whey, isolate & plant protein",
      1,
    )
    .run();
});

describe("admin products", () => {
  describe("POST /api/admin/products", () => {
    it("creates a product and stores the discount of its prices", async () => {
      const product = await createProduct({ name: "Kinetic Gold Whey" });

      expect(product.name).toBe("Kinetic Gold Whey");
      expect(product.mrp).toBe(399900);
      expect(product.sale_price).toBe(299900);
      expect(product.discount_percent).toBe(25);

      const row = await readRow(product.id);
      expect(row?.discount_percent).toBe(25);
    });

    it("gives the product the slug of its name", async () => {
      const product = await createProduct({ name: "Kinetic Gold 100% Whey Isolate" });

      expect(product.slug).toBe("kinetic-gold-100-whey-isolate");
    });

    it("makes the slug of a second product of the same name unique", async () => {
      const first = await createProduct({ name: "Duplicate Name Product" });
      const second = await createProduct({ name: "Duplicate Name Product" });

      expect(first.slug).toBe("duplicate-name-product");
      expect(second.slug).toBe("duplicate-name-product-2");
    });

    it("puts the new product in the list of the storefront", async () => {
      const product = await createProduct({ name: "Storefront Product" });

      const products = await publicList();

      expect(products.map((entry) => entry.id)).toContain(product.id);
    });

    it("keeps the images, the flavors and the weight options", async () => {
      const product = await createProduct({ name: "Product With Options" });

      expect(product.images).toEqual(["/api/images/products/cover.png"]);
      expect(product.flavors).toEqual(["Rich Chocolate"]);
      expect(product.weight_options).toEqual(["1 kg", "2 kg"]);

      const row = await readRow(product.id);
      expect(JSON.parse(row?.images ?? "[]")).toEqual(["/api/images/products/cover.png"]);
    });

    it("writes the badge in small caps", async () => {
      const fresh = await createProduct({ name: "Fresh Badge", badge: "new" });
      const hot = await createProduct({ name: "Hot Badge", badge: "hot" });
      const plain = await createProduct({ name: "Plain Badge", badge: "none" });

      expect(fresh.badge).toBe("NEW");
      expect(hot.badge).toBe("HOT");
      expect(plain.badge).toBe("none");
    });

    it("refuses a sale price above the mrp", async () => {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: "Too Cheap", mrp: 299900, sale_price: 399900 }),
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: BAD_PRICE });
    });

    it("refuses a sale price of zero", async () => {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: "Free", mrp: 299900, sale_price: 0 }),
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: BAD_PRICE });
    });

    it("refuses a negative stock", async () => {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: "Negative Stock", stock: -1 }),
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Stock cannot be negative" });
    });

    it("refuses a product without a name", async () => {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: "   " }),
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Name is required" });
    });

    it("refuses a category that is not there", async () => {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: "Lost Category", category_id: "cat_does_not_exist" }),
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Category not found" });
    });

    it("refuses a customer", async () => {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: "Customer Product" }),
        token: await customerToken(),
      });

      expect(res.status).toBe(403);
    });

    it("refuses a caller without a token", async () => {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: "Anonymous Product" }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/admin/products", () => {
    it("lists the products of the store", async () => {
      const product = await createProduct({ name: "Listed Product" });

      const products = await adminList();

      expect(products.map((entry) => entry.id)).toContain(product.id);
    });

    it("lists a product that was deleted as well", async () => {
      const product = await createProduct({ name: "Hidden Product" });
      await call("DELETE", `/api/admin/products/${product.id}`, { token: await adminToken() });

      const products = await adminList();

      expect(products.map((entry) => entry.id)).toContain(product.id);
    });

    it("refuses a customer", async () => {
      const res = await call("GET", "/api/admin/products", { token: await customerToken() });

      expect(res.status).toBe(403);
    });

    it("refuses a caller without a token", async () => {
      const res = await call("GET", "/api/admin/products");

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/admin/products/:id", () => {
    it("changes the product", async () => {
      const product = await createProduct({ name: "Before The Change" });

      const res = await call("PATCH", `/api/admin/products/${product.id}`, {
        body: { name: "After The Change", brand: "Apex Fuel", stock: 7 },
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
      const changed = (await res.json()) as ProductJson;
      expect(changed.name).toBe("After The Change");
      expect(changed.brand).toBe("Apex Fuel");
      expect(changed.stock).toBe(7);
      expect(changed.slug).toBe("after-the-change");
    });

    it("recomputes the discount when the sale price changes", async () => {
      const product = await createProduct({ name: "Discount Product" });

      const res = await call("PATCH", `/api/admin/products/${product.id}`, {
        body: { sale_price: 199900 },
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
      const changed = (await res.json()) as ProductJson;
      expect(changed.discount_percent).toBe(50);

      const row = await readRow(product.id);
      expect(row?.discount_percent).toBe(50);
      expect(row?.sale_price).toBe(199900);
    });

    it("refuses a sale price above the mrp", async () => {
      const product = await createProduct({ name: "Bad Change" });

      const res = await call("PATCH", `/api/admin/products/${product.id}`, {
        body: { sale_price: 999900 },
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: BAD_PRICE });
    });

    it("refuses a negative stock", async () => {
      const product = await createProduct({ name: "Bad Stock Change" });

      const res = await call("PATCH", `/api/admin/products/${product.id}`, {
        body: { stock: -5 },
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Stock cannot be negative" });
    });

    it("keeps the fields it is not given", async () => {
      const product = await createProduct({ name: "Kept Product" });

      await call("PATCH", `/api/admin/products/${product.id}`, {
        body: { stock: 3 },
        token: await adminToken(),
      });

      const row = await readRow(product.id);
      expect(row?.name).toBe("Kept Product");
      expect(row?.mrp).toBe(399900);
      expect(row?.stock).toBe(3);
    });

    it("turns a product active again", async () => {
      const product = await createProduct({ name: "Retired Product", is_active: 0 });

      const res = await call("PATCH", `/api/admin/products/${product.id}`, {
        body: { is_active: 1 },
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
      const changed = (await res.json()) as ProductJson;
      expect(changed.is_active).toBe(1);
    });

    it("answers 404 for a product that is not there", async () => {
      const res = await call("PATCH", "/api/admin/products/prod_does_not_exist", {
        body: { stock: 1 },
        token: await adminToken(),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Product not found" });
    });

    it("refuses a customer", async () => {
      const product = await createProduct({ name: "Customer Change" });

      const res = await call("PATCH", `/api/admin/products/${product.id}`, {
        body: { stock: 1 },
        token: await customerToken(),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/admin/products/:id", () => {
    it("hides the product from the storefront and keeps the row", async () => {
      const product = await createProduct({ name: "Deleted Product" });

      const res = await call("DELETE", `/api/admin/products/${product.id}`, {
        token: await adminToken(),
      });

      expect(res.status).toBe(200);

      const products = await publicList();
      expect(products.map((entry) => entry.id)).not.toContain(product.id);

      const row = await readRow(product.id);
      expect(row).not.toBeNull();
      expect(row?.is_active).toBe(0);
    });

    it("answers 404 for a product that is not there", async () => {
      const res = await call("DELETE", "/api/admin/products/prod_does_not_exist", {
        token: await adminToken(),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Product not found" });
    });

    it("deletes a product that is already off the storefront", async () => {
      const product = await createProduct({ name: "Twice Deleted Product" });
      await call("DELETE", `/api/admin/products/${product.id}`, { token: await adminToken() });

      const res = await call("DELETE", `/api/admin/products/${product.id}`, {
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
    });

    it("refuses a customer", async () => {
      const product = await createProduct({ name: "Customer Delete" });

      const res = await call("DELETE", `/api/admin/products/${product.id}`, {
        token: await customerToken(),
      });

      expect(res.status).toBe(403);
    });
  });
});

/**
 * The variant and sale fields of a product: what the admin sends is what the
 * API serves back, the stale keys of a shrunk option list are pruned, and
 * every broken value is refused.
 */
describe("admin product variant and sale fields", () => {
  /** The window of an active sale for the fixtures. */
  const STARTS = new Date(Date.now() - 86_400_000).toISOString();
  const ENDS = new Date(Date.now() + 7 * 86_400_000).toISOString();

  it("creates a product with variant and sale fields and serves them back", async () => {
    const product = await createProduct({
      name: "Kinetic Variant Whey",
      flavor_images: { "Rich Chocolate": "/api/images/products/choc.png" },
      weight_images: { "1 kg": "/api/images/products/1kg.png" },
      weight_prices: { "1 kg": 299_900, "2 kg": 549_900 },
      sale_overrides: { "2 kg": 449_900 },
      contents: "One scoop and a shaker",
      nutrition: "24 g protein per serving",
      sale_percentage: 20,
      sale_price_override: 199_900,
      sale_starts_at: STARTS,
      sale_ends_at: ENDS,
    });

    expect(product.flavor_images).toEqual({ "Rich Chocolate": "/api/images/products/choc.png" });
    expect(product.weight_images).toEqual({ "1 kg": "/api/images/products/1kg.png" });
    expect(product.weight_prices).toEqual({ "1 kg": 299_900, "2 kg": 549_900 });
    expect(product.sale_overrides).toEqual({ "2 kg": 449_900 });
    expect(product.contents).toBe("One scoop and a shaker");
    expect(product.nutrition).toBe("24 g protein per serving");
    expect(product.sale_percentage).toBe(20);
    expect(product.sale_price_override).toBe(199_900);
    expect(product.sale_starts_at).toBe(STARTS);
    expect(product.sale_ends_at).toBe(ENDS);

    // The row of the database carries the same maps, as JSON.
    const row = await readRow(product.id);
    expect(JSON.parse(row?.weight_prices ?? "{}")).toEqual({ "1 kg": 299_900, "2 kg": 549_900 });
  });

  it("creates a product without any of the new fields", async () => {
    const product = await createProduct({ name: "Kinetic Plain Whey" });

    expect(product.flavor_images).toEqual({});
    expect(product.weight_prices).toEqual({});
    expect(product.contents).toBeNull();
    expect(product.sale_percentage).toBe(0);
    expect(product.sale_price_override).toBeNull();
    expect(product.sale_starts_at).toBeNull();
  });

  it("prunes stale map keys when PATCH shrinks the weight options", async () => {
    const product = await createProduct({
      name: "Kinetic Shrinking Whey",
      weight_prices: { "1 kg": 299_900, "2 kg": 549_900 },
      sale_overrides: { "2 kg": 449_900 },
    });

    const res = await call("PATCH", `/api/admin/products/${product.id}`, {
      body: { weight_options: ["1 kg"] },
      token: await adminToken(),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as ProductJson;

    expect(updated.weight_options).toEqual(["1 kg"]);
    // "2 kg" is no longer an option of the product: its keys are gone.
    expect(updated.weight_prices).toEqual({ "1 kg": 299_900 });
    expect(updated.sale_overrides).toEqual({});
  });

  it("edits the sale fields of a single product with PATCH", async () => {
    const product = await createProduct({ name: "Kinetic Sale Edit Whey" });

    const res = await call("PATCH", `/api/admin/products/${product.id}`, {
      body: {
        sale_percentage: 30,
        sale_starts_at: STARTS,
        sale_ends_at: ENDS,
      },
      token: await adminToken(),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as ProductJson;

    expect(updated.sale_percentage).toBe(30);
    expect(updated.sale_starts_at).toBe(STARTS);
    expect(updated.sale_ends_at).toBe(ENDS);
  });

  it("refuses a sale percentage above 90 or fractional", async () => {
    for (const sale_percentage of [91, 1.5, -5]) {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: `Kinetic Pct ${sale_percentage}`, sale_percentage }),
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    }
  });

  it("accepts a sale percentage of 0 (no percentage)", async () => {
    const product = await createProduct({
      name: "Kinetic Zero Pct Whey",
      sale_percentage: 0,
    });

    expect(product.sale_percentage).toBe(0);
  });

  it("refuses a window that ends before it starts", async () => {
    const res = await call("POST", "/api/admin/products", {
      body: productBody({
        name: "Kinetic Backwards Window",
        sale_starts_at: ENDS,
        sale_ends_at: STARTS,
      }),
      token: await adminToken(),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a window with only one timestamp", async () => {
    const res = await call("POST", "/api/admin/products", {
      body: productBody({ name: "Kinetic Half Window", sale_starts_at: STARTS }),
      token: await adminToken(),
    });
    expect(res.status).toBe(400);
  });

  it("refuses an unparseable timestamp", async () => {
    const res = await call("POST", "/api/admin/products", {
      body: productBody({
        name: "Kinetic Garbage Window",
        sale_starts_at: "not-a-date",
        sale_ends_at: ENDS,
      }),
      token: await adminToken(),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a base override at or above the base price", async () => {
    for (const sale_price_override of [299_900, 300_000]) {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({
          name: `Kinetic Override ${sale_price_override}`,
          sale_price_override,
          sale_starts_at: STARTS,
          sale_ends_at: ENDS,
        }),
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    }
  });

  it("refuses a money-map key that is not a weight option", async () => {
    const res = await call("POST", "/api/admin/products", {
      body: productBody({
        name: "Kinetic Stale Key Whey",
        weight_prices: { "1 kg": 299_900, "9 L": 123_456 },
      }),
      token: await adminToken(),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a price-map value that is not a positive whole paise amount", async () => {
    for (const weight_prices of [{ "1 kg": 0 }, { "1 kg": -5 }, { "1 kg": 199.5 }, { "1 kg": "x" }]) {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({ name: `Kinetic Bad Map ${JSON.stringify(weight_prices)}`, weight_prices }),
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    }
  });

  it("refuses an image-map value outside /api/images/", async () => {
    for (const bad of ["https://evil.example.com/x.png", "javascript:alert(1)", "/api/images"]) {
      const res = await call("POST", "/api/admin/products", {
        body: productBody({
          name: `Kinetic Bad Image ${bad.slice(0, 8)}`,
          weight_images: { "1 kg": bad },
        }),
        token: await adminToken(),
      });
      expect(res.status).toBe(400);
    }
  });
});
