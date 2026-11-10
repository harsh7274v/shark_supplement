/**
 * The admin categories: the list, the create, the change and the delete.
 *
 * The D1 database of a test file starts empty, so the fixture below is the
 * only category there is, and the only product that is in it.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { signAccessToken } from "../src/lib/jwt";

const db = env.DB;

/** The category of the fixture; it has a product in it. */
const CAT_ID = "cat_admin_categories";

/** The product of the fixture; it is in the category of the fixture. */
const PROD_ID = "prod_admin_categories";

/** A category, as the API serves it. */
interface CategoryJson {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
  sort_order: number;
  product_count: number;
}

/** An access token of an admin. */
async function adminToken(): Promise<string> {
  return signAccessToken({ sub: "admin_categories", role: "admin" }, env.JWT_SECRET);
}

/** An access token of a customer. */
async function customerToken(): Promise<string> {
  return signAccessToken({ sub: "user_categories", role: "customer" }, env.JWT_SECRET);
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

/** The body of a category that is valid in every way. */
function categoryBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Pre/Post Workout",
    image_url: "/api/images/seed/pre_post.jpg",
    tagline: "Explosive energy & recovery",
    sort_order: 3,
    ...overrides,
  };
}

/** Reads the categories of the admin list. */
async function adminList(): Promise<CategoryJson[]> {
  const res = await call("GET", "/api/admin/categories", { token: await adminToken() });
  expect(res.status).toBe(200);
  return (await res.json()) as CategoryJson[];
}

/** Creates a category and answers with the category the API made. */
async function createCategory(
  overrides: Record<string, unknown> = {},
): Promise<CategoryJson> {
  const res = await call("POST", "/api/admin/categories", {
    body: categoryBody(overrides),
    token: await adminToken(),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CategoryJson;
}

beforeAll(async () => {
  await db
    .prepare(
      `INSERT INTO categories (id, slug, name, image_url, tagline, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      CAT_ID,
      "fixture",
      "Fixture Category",
      "/api/images/seed/fixture.jpg",
      "A category of the fixture",
      1,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO products (id, name, slug, category_id, mrp, sale_price, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(PROD_ID, "Fixture Product", "fixture-product", CAT_ID, 299900, 249900, 5)
    .run();
});

describe("admin categories", () => {
  describe("POST /api/admin/categories", () => {
    it("creates a category and gives it the slug of its name", async () => {
      const category = await createCategory({ name: "Pre/Post Workout" });

      expect(category.name).toBe("Pre/Post Workout");
      expect(category.slug).toBe("pre-post-workout");
      expect(category.tagline).toBe("Explosive energy & recovery");
      expect(category.sort_order).toBe(3);
      expect(category.product_count).toBe(0);
    });

    it("uses the slug of the admin when there is one", async () => {
      const category = await createCategory({ name: "Fat Loss", slug: "fat_loss" });

      expect(category.slug).toBe("fat_loss");
    });

    it("puts the new category in the list of the admin", async () => {
      const category = await createCategory({ name: "Vitamins" });

      const categories = await adminList();

      expect(categories.map((entry) => entry.id)).toContain(category.id);
    });

    it("makes the slug of a second category of the same name unique", async () => {
      const first = await createCategory({ name: "Ayurveda" });
      const second = await createCategory({ name: "Ayurveda" });

      expect(first.slug).toBe("ayurveda");
      expect(second.slug).toBe("ayurveda-2");
    });

    it("refuses a slug that is taken", async () => {
      await createCategory({ name: "Proteins", slug: "proteins" });

      const res = await call("POST", "/api/admin/categories", {
        body: categoryBody({ name: "More Proteins", slug: "proteins" }),
        token: await adminToken(),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ detail: "Slug already in use" });
    });

    it("refuses a category without a name", async () => {
      const res = await call("POST", "/api/admin/categories", {
        body: categoryBody({ name: "  " }),
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Name is required" });
    });

    it("refuses a customer", async () => {
      const res = await call("POST", "/api/admin/categories", {
        body: categoryBody({ name: "Customer Category" }),
        token: await customerToken(),
      });

      expect(res.status).toBe(403);
    });

    it("refuses a caller without a token", async () => {
      const res = await call("POST", "/api/admin/categories", {
        body: categoryBody({ name: "Anonymous Category" }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/admin/categories", () => {
    it("counts the products of a category", async () => {
      const categories = await adminList();

      const fixture = categories.find((entry) => entry.id === CAT_ID);
      expect(fixture?.product_count).toBe(1);
    });

    it("refuses a customer", async () => {
      const res = await call("GET", "/api/admin/categories", { token: await customerToken() });

      expect(res.status).toBe(403);
    });

    it("refuses a caller without a token", async () => {
      const res = await call("GET", "/api/admin/categories");

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/admin/categories/:id", () => {
    it("changes the category", async () => {
      const category = await createCategory({ name: "Before The Change" });

      const res = await call("PATCH", `/api/admin/categories/${category.id}`, {
        body: { name: "After The Change", tagline: "A new tagline", sort_order: 9 },
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
      const changed = (await res.json()) as CategoryJson;
      expect(changed.name).toBe("After The Change");
      expect(changed.tagline).toBe("A new tagline");
      expect(changed.sort_order).toBe(9);
      expect(changed.slug).toBe("after-the-change");
    });

    it("keeps the slug when the admin gives one", async () => {
      const category = await createCategory({ name: "Keep The Slug" });

      const res = await call("PATCH", `/api/admin/categories/${category.id}`, {
        body: { name: "Another Name", slug: "keep-the-slug" },
        token: await adminToken(),
      });

      expect(res.status).toBe(200);
      const changed = (await res.json()) as CategoryJson;
      expect(changed.slug).toBe("keep-the-slug");
    });

    it("answers 404 for a category that is not there", async () => {
      const res = await call("PATCH", "/api/admin/categories/cat_does_not_exist", {
        body: { name: "Nothing" },
        token: await adminToken(),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Category not found" });
    });

    it("refuses a customer", async () => {
      const category = await createCategory({ name: "Customer Change" });

      const res = await call("PATCH", `/api/admin/categories/${category.id}`, {
        body: { name: "Nothing" },
        token: await customerToken(),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/admin/categories/:id", () => {
    it("refuses to delete a category that has products", async () => {
      const res = await call("DELETE", `/api/admin/categories/${CAT_ID}`, {
        token: await adminToken(),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ detail: "Category has products" });
    });

    it("deletes a category without products", async () => {
      const category = await createCategory({ name: "Empty Category" });

      const res = await call("DELETE", `/api/admin/categories/${category.id}`, {
        token: await adminToken(),
      });

      expect(res.status).toBe(200);

      const row = await db
        .prepare("SELECT id FROM categories WHERE id = ?")
        .bind(category.id)
        .first<{ id: string }>();
      expect(row).toBeNull();
    });

    it("answers 404 for a category that is not there", async () => {
      const res = await call("DELETE", "/api/admin/categories/cat_does_not_exist", {
        token: await adminToken(),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Category not found" });
    });

    it("refuses a customer", async () => {
      const category = await createCategory({ name: "Customer Delete" });

      const res = await call("DELETE", `/api/admin/categories/${category.id}`, {
        token: await customerToken(),
      });

      expect(res.status).toBe(403);
    });
  });
});
