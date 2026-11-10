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
import { sendMail } from "../lib/email";
import { orderStatusEmail } from "../lib/email-templates";
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

/** The message of an order that is not there. */
const ORDER_NOT_FOUND = "Order not found";

/** The message of a contact and address block that cannot be replaced anymore. */
const ORDER_NOT_EDITABLE = "Order can no longer be edited";

/** The message of a cancellation the pipeline does not allow. */
const CANNOT_CANCEL_AFTER_SHIPPING = "Cannot cancel after shipping";

/** The message of a status the pipeline does not know. */
const INVALID_STATUS = "Invalid status";

/** The message of a shipping block that is not complete. */
const SHIPPING_REQUIRED = "Shipping details are required";

/** The days an order takes to be delivered; the default estimate. */
const ADMIN_DELIVERY_DAYS = 5;

/** The next status of a status in the legal pipeline. */
const ORDER_NEXT: Record<string, string> = {
  placed: "confirmed",
  confirmed: "shipped",
  shipped: "delivered",
};

/** The statuses the pipeline knows. */
const VALID_STATUSES = new Set([
  "placed",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

/** The note of a history row of a status change. */
function statusNote(status: string): string {
  return `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`;
}

/** The date an order is expected to be delivered, a few days out. */
function deliveryEstimate(): string {
  return new Date(Date.now() + ADMIN_DELIVERY_DAYS * 86_400_000).toISOString().slice(0, 10);
}

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

/** A row of the log of the mails, as the database has it. */
interface MailLogRow {
  id: string;
  order_id: string | null;
  to_email: string;
  template: string;
  status: string;
  error: string | null;
  created_at: string;
}

/** An order row of the admin list, with its computed columns. */
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

/** A payment of the admin list, joined with the number of its order. */
interface PaymentWithOrder extends PaymentRow {
  order_number: string;
}

/** The detail of an order, as the admin detail serves it. */
interface OrderDetail {
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
  payment: PaymentRow | null;
  status_history: {
    id: string;
    status: string;
    note: string | null;
    created_at: string;
  }[];
  email_log: {
    id: string;
    to_email: string;
    template: string;
    status: string;
    error: string | null;
    created_at: string;
  }[];
}

/** The shipping block of a body: name, phone, email, address, city, pincode. */
interface ShippingBlock {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
}

/** Reads a string of a body; anything else reads as an empty string. */
function readAdminString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The shipping block of a body, or `null` when one of its fields is missing. */
function readShippingBlock(value: unknown): ShippingBlock | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const block: ShippingBlock = {
    full_name: readAdminString(raw.full_name),
    phone: readAdminString(raw.phone),
    email: readAdminString(raw.email),
    address: readAdminString(raw.address),
    city: readAdminString(raw.city),
    pincode: readAdminString(raw.pincode),
  };

  if (Object.values(block).some((field) => field === "")) {
    return null;
  }

  return block;
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

/** A fresh id for a history row. */
function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Reads the row of an order of the database. */
async function readOrderRow(
  db: D1Database,
  id: string,
): Promise<OrderRow | null> {
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

/** Reads the detail of an order: the order, its items, its payment, its
 * status history and its mail log. */
async function readOrderDetail(
  db: D1Database,
  id: string,
): Promise<OrderDetail | null> {
  const order = await readOrderRow(db, id);
  if (!order) {
    return null;
  }

  const [items, payment, history, mailLog] = await Promise.all([
    db
      .prepare(
        `SELECT id, order_id, product_id, name, unit_price, qty, flavor, weight
         FROM order_items WHERE order_id = ? ORDER BY id ASC`,
      )
      .bind(id)
      .all<OrderItemRow>(),
    db
      .prepare(
        `SELECT id, order_id, method, amount, status, created_at
         FROM payments WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .bind(id)
      .first<PaymentRow>(),
    db
      .prepare(
        `SELECT id, status, note, created_at
         FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, id ASC`,
      )
      .bind(id)
      .all<HistoryRow>(),
    db
      .prepare(
        `SELECT id, order_id, to_email, template, status, error, created_at
         FROM email_log WHERE order_id = ? ORDER BY created_at ASC, id ASC`,
      )
      .bind(id)
      .all<MailLogRow>(),
  ]);

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
    items: items.results.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      name: item.name,
      unit_price: item.unit_price,
      qty: item.qty,
      flavor: item.flavor,
      weight: item.weight,
    })),
    payment: payment ?? null,
    status_history: history.results.map((entry) => ({
      id: entry.id,
      status: entry.status,
      note: entry.note,
      created_at: entry.created_at,
    })),
    email_log: mailLog.results.map((entry) => ({
      id: entry.id,
      to_email: entry.to_email,
      template: entry.template,
      status: entry.status,
      error: entry.error,
      created_at: entry.created_at,
    })),
  };
}

/**
 * The orders of the store, all of them, newest day first. The rows of the day
 * with `status = 'placed'` are served first, so the client can highlight
 * them. Each row carries the number of its items and a summary of its
 * payment.
 */
adminRoutes.get("/orders", async (c: AdminContext) => {
  const status = readString(c.req.query("status"));
  const q = readString(c.req.query("q"));

  const conditions: string[] = [];
  const bindings: unknown[] = [];
  if (status) {
    conditions.push("o.status = ?");
    bindings.push(status);
  }
  if (q) {
    const like = `%${q}%`;
    conditions.push("(o.order_number LIKE ? OR o.name LIKE ? OR o.email LIKE ?)");
    bindings.push(like, like, like);
  }

  let sql = `
    SELECT o.id, o.order_number, o.user_id, o.name, o.email, o.phone, o.address,
           o.subtotal, o.discount, o.coupon_code, o.gst, o.shipping, o.total,
           o.status, o.estimated_delivery_date, o.created_at, o.updated_at,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
           (SELECT method FROM payments WHERE order_id = o.id
            ORDER BY created_at DESC, id DESC LIMIT 1) AS payment_method,
           (SELECT status FROM payments WHERE order_id = o.id
            ORDER BY created_at DESC, id DESC LIMIT 1) AS payment_status
     FROM orders o`;
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }
  sql += `
     ORDER BY date(o.created_at) DESC,
              CASE WHEN o.status = 'placed' THEN 0 ELSE 1 END,
              o.created_at DESC, o.id DESC`;

  const { results } = await c.env.DB
    .prepare(sql)
    .bind(...bindings)
    .all<AdminOrderRow>();

  return c.json(results);
});

/** The detail of one order. */
adminRoutes.get("/orders/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: ORDER_NOT_FOUND }, 404);
  }

  const order = await readOrderDetail(c.env.DB, id);
  if (!order) {
    return c.json({ detail: ORDER_NOT_FOUND }, 404);
  }

  return c.json(order);
});

/**
 * Changes an order: the contact and address block, the status, or both.
 *
 * The shipping block replaces the whole contact and address block and is
 * allowed only while the order is placed. The status follows the legal
 * transitions of the pipeline, and `cancelled` is only allowed from
 * `placed` or `confirmed`. Every change appends a row to the status history
 * and sends the status mail of the new status.
 */
adminRoutes.patch("/orders/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: ORDER_NOT_FOUND }, 404);
  }

  const current = await readOrderRow(c.env.DB, id);
  if (!current) {
    return c.json({ detail: ORDER_NOT_FOUND }, 404);
  }

  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  // The contact and address block can only be replaced while the order is placed.
  let shippingBlock: ShippingBlock | null = null;
  if (body.shipping !== undefined) {
    if (current.status !== "placed") {
      return c.json({ detail: ORDER_NOT_EDITABLE }, 400);
    }
    shippingBlock = readShippingBlock(body.shipping);
    if (!shippingBlock) {
      return c.json({ detail: SHIPPING_REQUIRED }, 400);
    }
  }

  let nextStatus = current.status;
  let nextEta = current.estimated_delivery_date;
  let statusChanged = false;

  if (body.status !== undefined && body.status !== null) {
    const status = readAdminString(body.status);
    if (!VALID_STATUSES.has(status)) {
      return c.json({ detail: INVALID_STATUS }, 400);
    }
    if (status !== current.status) {
      if (status === "cancelled") {
        // Only placed and confirmed orders can be cancelled: once an order
        // is on its way or delivered, cancelling it is no longer possible.
        if (current.status !== "placed" && current.status !== "confirmed") {
          return c.json({ detail: CANNOT_CANCEL_AFTER_SHIPPING }, 400);
        }
      } else if (ORDER_NEXT[current.status] !== status) {
        return c.json(
          { detail: `Cannot change status from ${current.status} to ${status}` },
          400,
        );
      }
      nextStatus = status;
      nextEta =
        status === "shipped"
          ? readAdminString(body.estimated_delivery_date) || deliveryEstimate()
          : current.estimated_delivery_date;
      statusChanged = true;
    }
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  if (shippingBlock) {
    statements.push(
      c.env.DB
        .prepare(
          `UPDATE orders SET name = ?, phone = ?, email = ?, address = ?,
           updated_at = ? WHERE id = ?`,
        )
        .bind(
          shippingBlock.full_name,
          shippingBlock.phone,
          shippingBlock.email,
          JSON.stringify(shippingBlock),
          now,
          id,
        ),
    );
  }

  if (statusChanged) {
    statements.push(
      c.env.DB
        .prepare(
          `UPDATE orders SET status = ?, estimated_delivery_date = ?,
           updated_at = ? WHERE id = ?`,
        )
        .bind(nextStatus, nextEta, now, id),
    );
    statements.push(
      c.env.DB
        .prepare(
          "INSERT INTO order_status_history (id, order_id, status, note) VALUES (?, ?, ?, ?)",
        )
        .bind(newId("hist"), id, nextStatus, statusNote(nextStatus)),
    );
  }

  if (nextStatus === "cancelled") {
    // Giving the stock of every line of the order back to its product.
    const stockUpdates = await c.env.DB
      .prepare(
        "SELECT product_id, SUM(qty) AS qty FROM order_items WHERE order_id = ? GROUP BY product_id",
      )
      .bind(id)
      .all<{ product_id: string | null; qty: number }>();
    for (const update of stockUpdates.results) {
      if (update.product_id) {
        statements.push(
          c.env.DB
            .prepare("UPDATE products SET stock = stock + ? WHERE id = ?")
            .bind(update.qty, update.product_id),
        );
      }
    }
    // An unpaid payment becomes cancelled; a paid one keeps its money.
    statements.push(
      c.env.DB
        .prepare(
          "UPDATE payments SET status = 'cancelled' WHERE order_id = ? AND status = 'on_delivery'",
        )
        .bind(id),
    );
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  // Every change of status tells the buyer about it. A mail that cannot be
  // sent never fails the change.
  if (statusChanged) {
    try {
      const orderForEmail = {
        order_number: current.order_number,
        name: current.name,
        email: current.email,
        subtotal: current.subtotal,
        discount: current.discount,
        gst: current.gst,
        shipping: current.shipping,
        total: current.total,
        estimated_delivery_date: nextEta,
      };
      await sendMail(
        c.env,
        orderStatusEmail(orderForEmail, nextStatus, nextEta ?? undefined),
        { orderId: id, template: nextStatus },
      );
    } catch {
      // A mail that cannot be sent must not fail the change.
    }
  }

  return c.json(await readOrderDetail(c.env.DB, id));
});

/** The payments of the store, joined with their order numbers, newest first. */
adminRoutes.get("/payments", async (c: AdminContext) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.order_id, o.order_number, p.method, p.amount, p.status, p.created_at
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all<PaymentWithOrder>();

  return c.json(results);
});

/** The message of a coupon that is not there. */
const COUPON_NOT_FOUND = "Coupon not found";

/** The message of a coupon code another coupon already took. */
const CODE_TAKEN = "Coupon code already in use";

/** The message of a coupon body without a code. */
const CODE_REQUIRED = "Coupon code is required";

/** The message of a discount type that is not percent or flat. */
const BAD_DISCOUNT_TYPE = "Discount type must be percent or flat";

/** The message of a discount value that is not a number. */
const BAD_DISCOUNT_VALUE = "Discount value must be a number";

/** The message of a discount value below zero. */
const NEGATIVE_DISCOUNT_VALUE = "Discount value cannot be negative";

/** The message of a min order that is not a number. */
const BAD_MIN_ORDER = "Min order must be a number";

/** The message of a min order below zero. */
const NEGATIVE_MIN_ORDER = "Min order cannot be negative";

/** The message of an active flag that is not 0 or 1. */
const BAD_ACTIVE = "active must be 0 or 1";

/** A coupon row, as the database has it. */
interface CouponRow {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  min_order: number;
  active: number;
}

/** A coupon, as the API serves it. */
interface CouponJson {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  min_order: number;
  active: number;
}

/** Turns a coupon row into the JSON the API serves. */
function toCoupon(row: CouponRow): CouponJson {
  return {
    id: row.id,
    code: row.code,
    discount_type: row.discount_type,
    discount_value: row.discount_value,
    min_order: row.min_order,
    active: row.active,
  };
}

/** Reads the row of a coupon of the database. */
async function readCouponRow(
  db: D1Database,
  id: string,
): Promise<CouponRow | null> {
  return db
    .prepare(
      `SELECT id, code, discount_type, discount_value, min_order, active
       FROM coupons WHERE id = ?`,
    )
    .bind(id)
    .first<CouponRow>();
}

/** Reads the coupon of the database, as the API serves it. */
async function readCoupon(db: D1Database, id: string) {
  const row = await readCouponRow(db, id);
  return row === null ? null : toCoupon(row);
}

/** Reads the discount type of a body. */
function readDiscountType(value: unknown): "percent" | "flat" | null {
  if (value === "percent" || value === "flat") {
    return value;
  }
  return null;
}

/** The aggregates of the admin dashboard. */
adminRoutes.get("/overview", async (c: AdminContext) => {
  const daysParam = c.req.query("days");
  let days = 30;
  if (daysParam !== null && daysParam !== "") {
    const parsed = Number(daysParam);
    if (Number.isFinite(parsed) && parsed >= 1) {
      days = Math.round(parsed);
    }
  }

  // Orders older than `days` days are outside the window; `datetime('now', ?)`
  // takes the modifier as a bound value, so `-30 days` works like a literal.
  const window = `-${days} days`;

  const stats = await c.env.DB
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
       FROM orders
       WHERE status != 'cancelled' AND created_at >= datetime('now', ?)`,
    )
    .bind(window)
    .first<{ orders: number; revenue: number }>();

  const [revenueByDay, ordersByStatus, topProducts, lowStock] =
    await Promise.all([
      c.env.DB
        .prepare(
          `SELECT DATE(created_at) AS date, COALESCE(SUM(total), 0) AS total
           FROM orders
           WHERE status != 'cancelled' AND created_at >= datetime('now', ?)
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
        )
        .bind(window)
        .all<{ date: string; total: number }>(),
      c.env.DB
        .prepare(
          `SELECT status AS status, COUNT(*) AS count
           FROM orders
           WHERE status != 'cancelled' AND created_at >= datetime('now', ?)
           GROUP BY status
           ORDER BY status ASC`,
        )
        .bind(window)
        .all<{ status: string; count: number }>(),
      c.env.DB
        .prepare(
          `SELECT i.name AS name, SUM(i.qty) AS qty
           FROM order_items i
           JOIN orders o ON o.id = i.order_id
           WHERE o.status != 'cancelled' AND o.created_at >= datetime('now', ?)
           GROUP BY i.name
           ORDER BY qty DESC, name ASC`,
        )
        .bind(window)
        .all<{ name: string; qty: number }>(),
      c.env.DB
        .prepare(
          `SELECT COUNT(*) AS low_stock
           FROM products
           WHERE is_active = 1 AND stock <= 10`,
        )
        .first<{ low_stock: number }>(),
    ]);

  const ordered = stats?.orders ?? 0;
  const revenue = stats?.revenue ?? 0;

  return c.json({
    stats: {
      revenue,
      orders: ordered,
      avg_order: ordered === 0 ? 0 : Math.round(revenue / ordered),
      low_stock: lowStock?.low_stock ?? 0,
    },
    revenue_by_day: revenueByDay.results,
    orders_by_status: ordersByStatus.results,
    top_products: topProducts.results,
  });
});

/** Wipes the demo data and leaves the catalog (products, coupons) untouched. */
adminRoutes.post("/demo-data/reset", async (c: AdminContext) => {
  // Children first, then the orders they belong to; foreign keys stay happy.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM order_items"),
    c.env.DB.prepare("DELETE FROM payments"),
    c.env.DB.prepare("DELETE FROM order_status_history"),
    c.env.DB.prepare("DELETE FROM email_log"),
    c.env.DB.prepare("DELETE FROM orders"),
  ]);

  return c.json({ ok: true });
});

/**
 * Splits seed SQL into statements and runs them one by one.
 *
 * Full-line comments (`-- ...`) are stripped first, so a comment block never
 * reaches D1 as a statement. Every statement of the seed files uses
 * `INSERT OR IGNORE`, so running the seed twice changes nothing.
 */
async function runSeedSql(c: AdminContext, sql: string): Promise<void> {
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await c.env.DB.prepare(statement).run();
  }
}

/** (Re)seeds the catalog and the demo data: reset first, then both seed
 * files. Idempotent and deterministic. Behind `requireAdmin` like every
 * other admin route: 401 without a token, 403 for a customer. */
adminRoutes.post("/demo-data/seed", async (c: AdminContext) => {
  const seedCatalog = c.env.SEED_CATALOG;
  const seedDemoOrders = c.env.SEED_DEMO_ORDERS;
  if (typeof seedCatalog !== "string" || typeof seedDemoOrders !== "string") {
    return c.json({ detail: "Seed data is not configured on this worker" }, 500);
  }

  // Reset first: demo orders, payments, history and mail log are demo data;
  // the catalog (categories, products, coupons) stays and is re-seeded with
  // `INSERT OR IGNORE`, so re-running is a no-op.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM order_items"),
    c.env.DB.prepare("DELETE FROM payments"),
    c.env.DB.prepare("DELETE FROM order_status_history"),
    c.env.DB.prepare("DELETE FROM email_log"),
    c.env.DB.prepare("DELETE FROM orders"),
  ]);

  await runSeedSql(c, seedCatalog);
  await runSeedSql(c, seedDemoOrders);

  return c.json({ ok: true });
});

/** The coupons of the store, newest code first. */
adminRoutes.get("/coupons", async (c: AdminContext) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, code, discount_type, discount_value, min_order, active
       FROM coupons
       ORDER BY code ASC`,
    )
    .all<CouponRow>();

  return c.json(results.map(toCoupon));
});

/** Creates a coupon: the code is uppercased and must be unique. */
adminRoutes.post("/coupons", async (c: AdminContext) => {
  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  const code = readString(body.code);
  if (!code) {
    return c.json({ detail: CODE_REQUIRED }, 400);
  }
  const upper = code.toUpperCase();

  const discountType = readDiscountType(body.discount_type);
  if (!discountType) {
    return c.json({ detail: BAD_DISCOUNT_TYPE }, 400);
  }

  const discountValue = readMoney(body.discount_value);
  if (discountValue === null) {
    return c.json({ detail: BAD_DISCOUNT_VALUE }, 400);
  }
  if (discountValue < 0) {
    return c.json({ detail: NEGATIVE_DISCOUNT_VALUE }, 400);
  }

  const minOrder = readMoney(body.min_order);
  if (minOrder === null) {
    return c.json({ detail: BAD_MIN_ORDER }, 400);
  }
  if (minOrder < 0) {
    return c.json({ detail: NEGATIVE_MIN_ORDER }, 400);
  }

  const active = readFlag(body.active ?? 1);
  if (active === null) {
    return c.json({ detail: BAD_ACTIVE }, 400);
  }

  const taken = await c.env.DB
    .prepare("SELECT id FROM coupons WHERE code = ?")
    .bind(upper)
    .first<{ id: string }>();
  if (taken) {
    return c.json({ detail: CODE_TAKEN }, 409);
  }

  const id = `coup_${randomHex(8)}`;
  await c.env.DB
    .prepare(
      `INSERT INTO coupons (id, code, discount_type, discount_value, min_order, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, upper, discountType, discountValue, minOrder, active)
    .run();

  const coupon = await readCoupon(c.env.DB, id);
  if (!coupon) {
    return c.json({ detail: COUPON_NOT_FOUND }, 404);
  }

  return c.json(coupon, 201);
});

/** Changes a coupon: the fields given are replaced, the rest is kept. */
adminRoutes.patch("/coupons/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: COUPON_NOT_FOUND }, 404);
  }

  const current = await readCouponRow(c.env.DB, id);
  if (!current) {
    return c.json({ detail: COUPON_NOT_FOUND }, 404);
  }

  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  let code = current.code;
  if (body.code !== undefined) {
    const given = readString(body.code);
    if (!given) {
      return c.json({ detail: CODE_REQUIRED }, 400);
    }
    code = given.toUpperCase();
  }

  let discountType = current.discount_type;
  if (body.discount_type !== undefined) {
    const given = readDiscountType(body.discount_type);
    if (!given) {
      return c.json({ detail: BAD_DISCOUNT_TYPE }, 400);
    }
    discountType = given;
  }

  let discountValue = current.discount_value;
  if (body.discount_value !== undefined) {
    const given = readMoney(body.discount_value);
    if (given === null) {
      return c.json({ detail: BAD_DISCOUNT_VALUE }, 400);
    }
    if (given < 0) {
      return c.json({ detail: NEGATIVE_DISCOUNT_VALUE }, 400);
    }
    discountValue = given;
  }

  let minOrder = current.min_order;
  if (body.min_order !== undefined) {
    const given = readMoney(body.min_order);
    if (given === null) {
      return c.json({ detail: BAD_MIN_ORDER }, 400);
    }
    if (given < 0) {
      return c.json({ detail: NEGATIVE_MIN_ORDER }, 400);
    }
    minOrder = given;
  }

  let active = current.active;
  if (body.active !== undefined) {
    const given = readFlag(body.active);
    if (given === null) {
      return c.json({ detail: BAD_ACTIVE }, 400);
    }
    active = given;
  }

  if (code !== current.code) {
    const taken = await c.env.DB
      .prepare("SELECT id FROM coupons WHERE code = ? AND id != ?")
      .bind(code, id)
      .first<{ id: string }>();
    if (taken) {
      return c.json({ detail: CODE_TAKEN }, 409);
    }
  }

  await c.env.DB
    .prepare(
      `UPDATE coupons SET code = ?, discount_type = ?, discount_value = ?,
                       min_order = ?, active = ? WHERE id = ?`,
    )
    .bind(code, discountType, discountValue, minOrder, active, id)
    .run();

  const coupon = await readCoupon(c.env.DB, id);
  if (!coupon) {
    return c.json({ detail: COUPON_NOT_FOUND }, 404);
  }

  return c.json(coupon);
});

/** Removes a coupon. */
adminRoutes.delete("/coupons/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: COUPON_NOT_FOUND }, 404);
  }

  const result = await c.env.DB.prepare("DELETE FROM coupons WHERE id = ?")
    .bind(id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return c.json({ detail: COUPON_NOT_FOUND }, 404);
  }

  return c.json({ ok: true });
});
