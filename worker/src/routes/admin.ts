/**
 * The admin routes: the products of the store.
 *
 * Mounted at `/api/admin` by `src/index.ts`, so the routes answer on
 * `/api/admin/products` and `/api/admin/products/:id`. The categories are a
 * router of their own (`routes/admin.categories.ts`), mounted here on
 * `/api/admin/categories`.
 *
 * Every route of the admin is behind the guard of Task 3: a caller without a
 * token gets a 401 and a customer gets a 403.
 *
 * The money of a product is paise, like everywhere else in the worker, and the
 * discount percent is always computed from the two prices: it is never taken
 * from the client and never typed by hand.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import type { Env } from "../env";
import {
  INVALID_BODY,
  NAME_NOT_A_SLUG,
  NAME_REQUIRED,
  kebabCase,
  readString,
  readText,
} from "../lib/admin-common";
import { randomHex } from "../lib/auth-common";
import { readJsonBody } from "../lib/http";
import { discountPercent } from "../lib/money";
import { requireAdmin } from "../middleware/auth";
import { adminCategoryRoutes } from "./admin.categories";

type AdminEnv = { Bindings: Env };
type AdminContext = Context<AdminEnv>;

export const adminRoutes = new Hono<AdminEnv>();

// The guard of every route of the admin. It is registered before the routes,
// so it runs before them.
adminRoutes.use("*", requireAdmin);

// The categories are a router of their own; it is mounted here, so the guard
// above covers it as well.
adminRoutes.route("/categories", adminCategoryRoutes);

/** The message of a sale price that is not below the mrp. */
const BAD_SALE_PRICE = "Sale price must be ≤ MRP and > 0";

/** The message of an mrp that is not a number. */
const BAD_MRP = "MRP must be a number";

/** The message of an mrp that is below zero. */
const NEGATIVE_MRP = "MRP cannot be negative";

/** The message of a sale price that is not a number. */
const BAD_SALE_NUMBER = "Sale price must be a number";

/** The message of a stock that is below zero. */
const NEGATIVE_STOCK = "Stock cannot be negative";

/** The message of a stock that is not a number. */
const BAD_STOCK = "Stock must be a number";

/** The message of a badge that is not one of the three. */
const BAD_BADGE = "Badge must be none, new or hot";

/** The message of a category that is not there. */
const CATEGORY_NOT_FOUND = "Category not found";

/** The message of a category id that is not a text. */
const BAD_CATEGORY_ID = "Category id must be a text";

/** The message of a product that is not there. */
const PRODUCT_NOT_FOUND = "Product not found";

/** The message of a slug that another product took in the meantime. */
const SLUG_TAKEN = "Slug already in use";

/**
 * The badge of a product, in the small letters the storefront compares with.
 *
 * The badge of the admin is written in small letters (`none`, `new`, `hot`),
 * and it is stored in the small caps the storefront looks for (`NEW`, `HOT`).
 */
const BADGES = new Map<string, string>([
  ["none", "none"],
  ["new", "NEW"],
  ["hot", "HOT"],
]);

/**
 * The columns of a product of the admin, with the discount computed from the
 * prices.
 *
 * The discount is computed here and not read from the column, so a row that
 * was written by an older version of the store still shows the right number.
 */
const PRODUCT_COLUMNS = `
  p.id,
  p.name,
  p.slug,
  p.description,
  p.brand,
  p.category_id,
  c.slug AS category,
  c.name AS category_name,
  p.mrp,
  p.sale_price,
  CASE WHEN p.mrp > 0
    THEN MAX(0, CAST(ROUND((p.mrp - p.sale_price) * 100.0 / p.mrp) AS INTEGER))
    ELSE 0 END AS discount_percent,
  p.stock,
  p.images,
  p.flavors,
  p.weight_options,
  p.badge,
  p.is_new_arrival,
  p.is_active,
  p.rating,
  p.orders_count,
  p.created_at`;

/** A product row, as the database has it. */
interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  category_id: string | null;
  category: string | null;
  category_name: string | null;
  mrp: number;
  sale_price: number;
  discount_percent: number;
  stock: number;
  images: string | null;
  flavors: string | null;
  weight_options: string | null;
  badge: string | null;
  is_new_arrival: number;
  is_active: number;
  rating: number;
  orders_count: number;
  created_at: string;
}

/**
 * Parses a JSON array column of the products table. A column that is not a
 * JSON array of strings reads as an empty array.
 */
function parseArray(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/** Turns a product row into the JSON the API serves. */
function toProduct(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    brand: row.brand,
    category_id: row.category_id,
    category: row.category,
    category_name: row.category_name,
    mrp: row.mrp,
    sale_price: row.sale_price,
    discount_percent: row.discount_percent,
    stock: row.stock,
    images: parseArray(row.images),
    flavors: parseArray(row.flavors),
    weight_options: parseArray(row.weight_options),
    badge: row.badge,
    is_new_arrival: row.is_new_arrival,
    is_active: row.is_active,
    rating: row.rating,
    orders_count: row.orders_count,
    created_at: row.created_at,
  };
}

/** Reads the money of a body: whole paise. A number that is not one reads as `null`. */
function readMoney(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

/** Reads the stock of a body: whole pieces. A missing one reads as zero. */
function readStock(value: unknown): number | null {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

/** Reads a flag of a body: 0 or 1. */
function readFlag(value: unknown): number | null {
  if (value === true) {
    return 1;
  }
  if (value === false) {
    return 0;
  }
  if (value === 0 || value === 1) {
    return value;
  }
  return null;
}

/** Reads a list of strings of a body. A list that is not one reads as `null`. */
function readStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (!value.every((item) => typeof item === "string")) {
    return null;
  }
  return value as string[];
}

/** Reads the badge of a body. A missing one reads as no badge at all. */
function readBadge(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return "none";
  }
  if (typeof value !== "string") {
    return null;
  }
  return BADGES.get(value.trim().toLowerCase()) ?? null;
}

/** The message of a list of strings that is not one. */
function listMessage(field: string): string {
  return `${field} must be a list of strings`;
}

/** The message of a flag that is not 0 or 1. */
function flagMessage(field: string): string {
  return `${field} must be 0 or 1`;
}

/**
 * The slug of a product that is not taken yet.
 *
 * The slug of the name is used when it is free; when it is taken, a number
 * goes behind it: `-2`, `-3`, and so on.
 */
async function freeProductSlug(
  db: D1Database,
  base: string,
  exceptId?: string,
): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT slug FROM products
       WHERE (slug = ? OR slug LIKE ?) AND id != ?`,
    )
    .bind(base, `${base}-%`, exceptId ?? "")
    .all<{ slug: string }>();

  const taken = new Set(results.map((row) => row.slug));
  let slug = base;
  let number = 1;
  while (taken.has(slug)) {
    number += 1;
    slug = `${base}-${number}`;
  }

  return slug;
}

/** Reads the row of a product of the database. */
async function readProductRow(db: D1Database, id: string): Promise<ProductRow | null> {
  return db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`,
    )
    .bind(id)
    .first<ProductRow>();
}

/** Reads the product of the database, as the API serves it. */
async function readProduct(db: D1Database, id: string) {
  const row = await readProductRow(db, id);
  return row === null ? null : toProduct(row);
}

/** Tells whether a category is there. */
async function categoryExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM categories WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();

  return row !== null;
}

adminRoutes.get("/products", async (c: AdminContext) => {
  // Every product is listed, also the ones that are not active: the admin
  // has to be able to see the ones it took off the storefront.
  const { results } = await c.env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.name ASC, p.id ASC`,
  ).all<ProductRow>();

  return c.json(results.map(toProduct));
});

adminRoutes.post("/products", async (c: AdminContext) => {
  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  const name = readString(body.name);
  if (!name) {
    return c.json({ detail: NAME_REQUIRED }, 400);
  }

  const base = kebabCase(name);
  if (!base) {
    return c.json({ detail: NAME_NOT_A_SLUG }, 400);
  }

  const mrp = readMoney(body.mrp);
  if (mrp === null) {
    return c.json({ detail: BAD_MRP }, 400);
  }
  if (mrp < 0) {
    return c.json({ detail: NEGATIVE_MRP }, 400);
  }

  const salePrice = readMoney(body.sale_price);
  if (salePrice === null) {
    return c.json({ detail: BAD_SALE_NUMBER }, 400);
  }
  if (salePrice <= 0 || salePrice > mrp) {
    return c.json({ detail: BAD_SALE_PRICE }, 400);
  }

  const stock = readStock(body.stock);
  if (stock === null) {
    return c.json({ detail: BAD_STOCK }, 400);
  }
  if (stock < 0) {
    return c.json({ detail: NEGATIVE_STOCK }, 400);
  }

  const images = readStringList(body.images ?? []);
  if (!images) {
    return c.json({ detail: listMessage("Images") }, 400);
  }
  const flavors = readStringList(body.flavors ?? []);
  if (!flavors) {
    return c.json({ detail: listMessage("Flavors") }, 400);
  }
  const weightOptions = readStringList(body.weight_options ?? []);
  if (!weightOptions) {
    return c.json({ detail: listMessage("Weight options") }, 400);
  }

  const badge = readBadge(body.badge);
  if (badge === null) {
    return c.json({ detail: BAD_BADGE }, 400);
  }

  const isNewArrival = readFlag(body.is_new_arrival ?? 0);
  if (isNewArrival === null) {
    return c.json({ detail: flagMessage("is_new_arrival") }, 400);
  }
  const isActive = readFlag(body.is_active ?? 1);
  if (isActive === null) {
    return c.json({ detail: flagMessage("is_active") }, 400);
  }

  let categoryId: string | null = null;
  if (body.category_id !== undefined && body.category_id !== null) {
    if (typeof body.category_id !== "string" || body.category_id.trim() === "") {
      return c.json({ detail: BAD_CATEGORY_ID }, 400);
    }
    categoryId = body.category_id.trim();
    if (!(await categoryExists(c.env.DB, categoryId))) {
      return c.json({ detail: CATEGORY_NOT_FOUND }, 400);
    }
  }

  const id = `prod_${randomHex(8)}`;
  const slug = await freeProductSlug(c.env.DB, base);

  try {
    await c.env.DB.prepare(
      `INSERT INTO products (id, name, slug, description, brand, category_id, mrp, sale_price,
                             discount_percent, stock, images, flavors, weight_options, badge,
                             is_new_arrival, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        name,
        slug,
        body.description === undefined ? null : readText(body.description),
        body.brand === undefined ? null : readText(body.brand),
        categoryId,
        mrp,
        salePrice,
        discountPercent(mrp, salePrice),
        stock,
        JSON.stringify(images),
        JSON.stringify(flavors),
        JSON.stringify(weightOptions),
        badge,
        isNewArrival,
        isActive,
      )
      .run();
  } catch (error) {
    // Two admins can write a product of the same name at the same time: the
    // slug of one of them is taken in the meantime.
    if (String(error).includes("UNIQUE constraint failed")) {
      return c.json({ detail: SLUG_TAKEN }, 409);
    }
    throw error;
  }

  const product = await readProduct(c.env.DB, id);
  if (!product) {
    return c.json({ detail: PRODUCT_NOT_FOUND }, 404);
  }

  return c.json(product, 201);
});

adminRoutes.patch("/products/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: PRODUCT_NOT_FOUND }, 404);
  }

  const current = await readProductRow(c.env.DB, id);
  if (!current) {
    return c.json({ detail: PRODUCT_NOT_FOUND }, 404);
  }

  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  let name = current.name;
  let slug = current.slug;
  if (body.name !== undefined) {
    const given = readString(body.name);
    if (!given) {
      return c.json({ detail: NAME_REQUIRED }, 400);
    }
    const base = kebabCase(given);
    if (!base) {
      return c.json({ detail: NAME_NOT_A_SLUG }, 400);
    }
    name = given;
    // The slug follows the name, so the two cannot drift apart.
    slug = await freeProductSlug(c.env.DB, base, id);
  }

  let mrp = current.mrp;
  if (body.mrp !== undefined) {
    const given = readMoney(body.mrp);
    if (given === null) {
      return c.json({ detail: BAD_MRP }, 400);
    }
    if (given < 0) {
      return c.json({ detail: NEGATIVE_MRP }, 400);
    }
    mrp = given;
  }

  let salePrice = current.sale_price;
  if (body.sale_price !== undefined) {
    const given = readMoney(body.sale_price);
    if (given === null) {
      return c.json({ detail: BAD_SALE_NUMBER }, 400);
    }
    salePrice = given;
  }
  if (salePrice <= 0 || salePrice > mrp) {
    return c.json({ detail: BAD_SALE_PRICE }, 400);
  }

  let stock = current.stock;
  if (body.stock !== undefined) {
    const given = readStock(body.stock);
    if (given === null) {
      return c.json({ detail: BAD_STOCK }, 400);
    }
    if (given < 0) {
      return c.json({ detail: NEGATIVE_STOCK }, 400);
    }
    stock = given;
  }

  let images = current.images ?? "[]";
  if (body.images !== undefined) {
    const given = readStringList(body.images);
    if (!given) {
      return c.json({ detail: listMessage("Images") }, 400);
    }
    images = JSON.stringify(given);
  }

  let flavors = current.flavors ?? "[]";
  if (body.flavors !== undefined) {
    const given = readStringList(body.flavors);
    if (!given) {
      return c.json({ detail: listMessage("Flavors") }, 400);
    }
    flavors = JSON.stringify(given);
  }

  let weightOptions = current.weight_options ?? "[]";
  if (body.weight_options !== undefined) {
    const given = readStringList(body.weight_options);
    if (!given) {
      return c.json({ detail: listMessage("Weight options") }, 400);
    }
    weightOptions = JSON.stringify(given);
  }

  let badge = current.badge;
  if (body.badge !== undefined) {
    const given = readBadge(body.badge);
    if (given === null) {
      return c.json({ detail: BAD_BADGE }, 400);
    }
    badge = given;
  }

  let isNewArrival = current.is_new_arrival;
  if (body.is_new_arrival !== undefined) {
    const given = readFlag(body.is_new_arrival);
    if (given === null) {
      return c.json({ detail: flagMessage("is_new_arrival") }, 400);
    }
    isNewArrival = given;
  }

  let isActive = current.is_active;
  if (body.is_active !== undefined) {
    const given = readFlag(body.is_active);
    if (given === null) {
      return c.json({ detail: flagMessage("is_active") }, 400);
    }
    isActive = given;
  }

  let categoryId = current.category_id;
  if (body.category_id !== undefined) {
    if (body.category_id === null) {
      categoryId = null;
    } else {
      if (typeof body.category_id !== "string" || body.category_id.trim() === "") {
        return c.json({ detail: BAD_CATEGORY_ID }, 400);
      }
      categoryId = body.category_id.trim();
      if (!(await categoryExists(c.env.DB, categoryId))) {
        return c.json({ detail: CATEGORY_NOT_FOUND }, 400);
      }
    }
  }

  try {
    await c.env.DB.prepare(
      `UPDATE products SET name = ?, slug = ?, description = ?, brand = ?, category_id = ?,
                           mrp = ?, sale_price = ?, discount_percent = ?, stock = ?, images = ?,
                           flavors = ?, weight_options = ?, badge = ?, is_new_arrival = ?,
                           is_active = ?
       WHERE id = ?`,
    )
      .bind(
        name,
        slug,
        body.description === undefined ? current.description : readText(body.description),
        body.brand === undefined ? current.brand : readText(body.brand),
        categoryId,
        mrp,
        salePrice,
        discountPercent(mrp, salePrice),
        stock,
        images,
        flavors,
        weightOptions,
        badge,
        isNewArrival,
        isActive,
        id,
      )
      .run();
  } catch (error) {
    // Another product can take the slug of this one in the meantime.
    if (String(error).includes("UNIQUE constraint failed")) {
      return c.json({ detail: SLUG_TAKEN }, 409);
    }
    throw error;
  }

  const product = await readProduct(c.env.DB, id);
  if (!product) {
    return c.json({ detail: PRODUCT_NOT_FOUND }, 404);
  }

  return c.json(product);
});

adminRoutes.delete("/products/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: PRODUCT_NOT_FOUND }, 404);
  }

  // The product is not taken away: it is put off the storefront, so the row
  // of it and its pictures stay.
  const result = await c.env.DB.prepare("UPDATE products SET is_active = 0 WHERE id = ?")
    .bind(id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return c.json({ detail: PRODUCT_NOT_FOUND }, 404);
  }

  return c.json({ ok: true });
});
