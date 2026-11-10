/**
 * The categories of the admin: the list, the create, the change and the
 * delete.
 *
 * Mounted at `/api/admin/categories` by `routes/admin.ts`, so the routes
 * answer on `/api/admin/categories` and `/api/admin/categories/:id`.
 *
 * The guard of the admin (`requireAdmin`) is in the router that mounts this
 * one, so a caller without a token gets a 401 and a customer gets a 403.
 *
 * The number of products of a category counts every product of it, also the
 * ones that are not active any more: the row of a product stays in the
 * database when it is deleted, so the category still holds it and still
 * cannot be deleted with it.
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
import { readJsonBody } from "../lib/http";
import { randomHex } from "../lib/auth-common";

type AdminEnv = { Bindings: Env };
type AdminContext = Context<AdminEnv>;

export const adminCategoryRoutes = new Hono<AdminEnv>();

/** The message of a slug that is taken by another category. */
const SLUG_TAKEN = "Slug already in use";

/** The message of a slug that is empty. */
const SLUG_REQUIRED = "Slug is required";

/** The message of a sort order that is not a number. */
const BAD_SORT_ORDER = "Sort order must be a number";

/** The message of a category that is not there. */
const CATEGORY_NOT_FOUND = "Category not found";

/** The message of a category that still holds products. */
const CATEGORY_HAS_PRODUCTS = "Category has products";

/** A category row, as the database has it. */
interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
  sort_order: number;
  product_count: number;
}

/**
 * The slug of a category that is not taken yet.
 *
 * The slug of the name is used when it is free; when it is taken, a number
 * goes behind it: `-2`, `-3`, and so on.
 */
async function freeCategorySlug(
  db: D1Database,
  base: string,
  exceptId?: string,
): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT slug FROM categories
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

/**
 * Tells whether a slug is taken by another category.
 *
 * The category of `exceptId` does not count, so a category can keep its own
 * slug when it is changed.
 */
async function slugTaken(db: D1Database, slug: string, exceptId?: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM categories WHERE slug = ? AND id != ?")
    .bind(slug, exceptId ?? "")
    .first<{ id: string }>();

  return row !== null;
}

/** The sort order a new category gets: behind the last one. */
async function nextSortOrder(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories")
    .first<{ next: number }>();

  return row?.next ?? 0;
}

/** Reads the sort order of a body; a missing one reads as `null`. */
function readSortOrder(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

/** Reads the row of a category of the database. */
async function readCategoryRow(
  db: D1Database,
  id: string,
): Promise<CategoryRow | null> {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.image_url, c.tagline, c.sort_order,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c WHERE c.id = ?`,
    )
    .bind(id)
    .first<CategoryRow>();
}

adminCategoryRoutes.get("/", async (c: AdminContext) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.name, c.image_url, c.tagline, c.sort_order,
            COUNT(p.id) AS product_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     GROUP BY c.id, c.slug, c.name, c.image_url, c.tagline, c.sort_order
     ORDER BY c.sort_order ASC, c.name ASC`,
  ).all<CategoryRow>();

  return c.json(results);
});

adminCategoryRoutes.post("/", async (c: AdminContext) => {
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

  // The slug of the admin is taken as it is written, with the letters in
  // small letters: the slugs of the seed are written with underscores, and
  // the storefront filters the products on them.
  let slug: string;
  if (body.slug !== undefined) {
    const given = readString(body.slug);
    if (!given) {
      return c.json({ detail: SLUG_REQUIRED }, 400);
    }
    slug = given.toLowerCase();
    if (await slugTaken(c.env.DB, slug)) {
      return c.json({ detail: SLUG_TAKEN }, 409);
    }
  } else {
    slug = await freeCategorySlug(c.env.DB, base);
  }

  const imageUrl = body.image_url === undefined ? null : readText(body.image_url);
  const tagline = body.tagline === undefined ? null : readText(body.tagline);

  let sortOrder: number;
  if (body.sort_order === undefined) {
    sortOrder = await nextSortOrder(c.env.DB);
  } else {
    const given = readSortOrder(body.sort_order);
    if (given === null) {
      return c.json({ detail: BAD_SORT_ORDER }, 400);
    }
    sortOrder = given;
  }

  const id = `cat_${randomHex(8)}`;
  try {
    await c.env.DB.prepare(
      `INSERT INTO categories (id, slug, name, image_url, tagline, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, slug, name, imageUrl, tagline, sortOrder)
      .run();
  } catch (error) {
    // Another category can take the slug in the meantime.
    if (String(error).includes("UNIQUE constraint failed")) {
      return c.json({ detail: SLUG_TAKEN }, 409);
    }
    throw error;
  }

  const category = await readCategoryRow(c.env.DB, id);
  return c.json(category, 201);
});

adminCategoryRoutes.patch("/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: CATEGORY_NOT_FOUND }, 404);
  }

  const current = await readCategoryRow(c.env.DB, id);
  if (!current) {
    return c.json({ detail: CATEGORY_NOT_FOUND }, 404);
  }

  const body = await readJsonBody(c);
  if (!body) {
    return c.json({ detail: INVALID_BODY }, 400);
  }

  let name = current.name;
  let slug = current.slug;
  if (body.slug !== undefined) {
    const given = readString(body.slug);
    if (!given) {
      return c.json({ detail: SLUG_REQUIRED }, 400);
    }
    slug = given.toLowerCase();
    if (await slugTaken(c.env.DB, slug, id)) {
      return c.json({ detail: SLUG_TAKEN }, 409);
    }
  } else if (body.name !== undefined) {
    const given = readString(body.name);
    if (!given) {
      return c.json({ detail: NAME_REQUIRED }, 400);
    }
    const base = kebabCase(given);
    if (!base) {
      return c.json({ detail: NAME_NOT_A_SLUG }, 400);
    }
    name = given;
    slug = await freeCategorySlug(c.env.DB, base, id);
  }

  const imageUrl = body.image_url === undefined ? current.image_url : readText(body.image_url);
  const tagline = body.tagline === undefined ? current.tagline : readText(body.tagline);

  let sortOrder = current.sort_order;
  if (body.sort_order !== undefined) {
    const given = readSortOrder(body.sort_order);
    if (given === null) {
      return c.json({ detail: BAD_SORT_ORDER }, 400);
    }
    sortOrder = given;
  }

  await c.env.DB.prepare(
    `UPDATE categories SET name = ?, slug = ?, image_url = ?, tagline = ?, sort_order = ?
     WHERE id = ?`,
  )
    .bind(name, slug, imageUrl, tagline, sortOrder, id)
    .run();

  const category = await readCategoryRow(c.env.DB, id);
  return c.json(category);
});

adminCategoryRoutes.delete("/:id", async (c: AdminContext) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ detail: CATEGORY_NOT_FOUND }, 404);
  }

  // A category that holds products cannot go: the products point at it.
  const products = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM products WHERE category_id = ?",
  )
    .bind(id)
    .first<{ count: number }>();

  if ((products?.count ?? 0) > 0) {
    return c.json({ detail: CATEGORY_HAS_PRODUCTS }, 400);
  }

  const result = await c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  if ((result.meta?.changes ?? 0) === 0) {
    return c.json({ detail: CATEGORY_NOT_FOUND }, 404);
  }

  return c.json({ ok: true });
});
