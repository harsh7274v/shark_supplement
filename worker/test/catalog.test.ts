/**
 * The public catalog endpoints: the category list, the product list with its
 * search, filter and sort, and the product detail.
 *
 * The D1 database of a test file starts empty (the storage of a file is
 * isolated from the other files), so the fixtures below are the only rows the
 * endpoints can see.
 */

import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../src/index";
import { discountPercent } from "../src/lib/money";

const db = env.DB;

/** The two categories of the fixture; the gainers are listed first. */
const CAT_GAINERS = "cat_catalog_gainers";
const CAT_PROTEINS = "cat_catalog_proteins";

/** The three active products of the fixture. */
const PROD_WHEY = "prod_catalog_whey";
const PROD_PLANT = "prod_catalog_plant";
const PROD_GAINER = "prod_catalog_gainer";
/** An inactive product: it must not be listed anywhere. */
const PROD_RETIRED = "prod_catalog_retired";

interface CategoryJson {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  tagline: string | null;
  product_count: number;
}

interface ProductJson {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  category: string | null;
  mrp: number;
  sale_price: number;
  discount_percent: number;
  stock: number;
  images: string[];
  flavors: string[];
  weight_options: string[];
  badge: string | null;
  is_new_arrival: number;
  rating: number;
  orders_count: number;
  created_at: string;
}

function get(path: string) {
  return app.request(path, {}, env);
}

/** Reads a JSON body of a response that has to be a 200. */
async function getJson<T>(path: string): Promise<T> {
  const res = await get(path);
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

/** The ids of a product list, in the order the API returned them. */
function ids(products: ProductJson[]): string[] {
  return products.map((product) => product.id);
}

beforeAll(async () => {
  // The proteins are written first and sort last: the order of the response
  // has to come from `sort_order`, not from the order of the writes.
  await db
    .prepare(
      `INSERT INTO categories (id, slug, name, image_url, tagline, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      CAT_PROTEINS,
      "proteins",
      "Proteins",
      "/api/images/seed/proteins.jpg",
      "Whey, isolate & plant protein",
      2,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO categories (id, slug, name, image_url, tagline, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      CAT_GAINERS,
      "gainers",
      "Gainers",
      "/api/images/seed/gainers.jpg",
      "Clean calorie-dense mass",
      1,
    )
    .run();

  // The stored `discount_percent` is deliberately wrong (99): the API has to
  // compute the discount from the prices it serves.
  await db
    .prepare(
      `INSERT INTO products
         (id, name, slug, brand, category_id, mrp, sale_price, discount_percent,
          stock, images, flavors, weight_options, badge, is_new_arrival,
          is_active, rating, orders_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      PROD_WHEY,
      "Kinetic Gold 100% Whey Isolate",
      "kinetic-gold-whey-isolate",
      "Kinetic",
      CAT_PROTEINS,
      399900,
      299900,
      99,
      12,
      JSON.stringify(["/api/images/whey-1.jpg", "/api/images/whey-2.jpg"]),
      JSON.stringify(["Rich Chocolate", "Vanilla Bean"]),
      JSON.stringify(["1 kg", "2 kg"]),
      "HOT",
      0,
      1,
      4.8,
      2314,
      "2026-01-05 10:00:00",
    )
    .run();

  await db
    .prepare(
      `INSERT INTO products
         (id, name, slug, brand, category_id, mrp, sale_price, stock,
          images, flavors, weight_options, badge, is_new_arrival, is_active,
          rating, orders_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      PROD_PLANT,
      "Kinetic Plant Protein Isolate",
      "kinetic-plant-protein-isolate",
      "Kinetic",
      CAT_PROTEINS,
      299900,
      249900,
      3,
      JSON.stringify([]),
      JSON.stringify(["Smooth Vanilla", "Dutch Cocoa"]),
      JSON.stringify(["800 g"]),
      "NEW",
      1,
      1,
      4.9,
      1240,
      "2026-03-05 10:00:00",
    )
    .run();

  await db
    .prepare(
      `INSERT INTO products
         (id, name, slug, brand, category_id, mrp, sale_price, stock,
          images, flavors, weight_options, badge, is_new_arrival, is_active,
          rating, orders_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      PROD_GAINER,
      "Apex Fuel Serious Mass Gainer",
      "apex-fuel-serious-mass-gainer",
      "Apex Fuel",
      CAT_GAINERS,
      349900,
      279900,
      8,
      JSON.stringify(["/api/images/gainer-1.jpg"]),
      JSON.stringify(["Chocolate", "Banana"]),
      JSON.stringify(["3 kg", "5 kg"]),
      null,
      0,
      1,
      4.5,
      3120,
      "2026-02-05 10:00:00",
    )
    .run();

  // Inactive: it is hidden from the list, the counts and the detail route.
  await db
    .prepare(
      `INSERT INTO products
         (id, name, slug, brand, category_id, mrp, sale_price, stock,
          images, flavors, weight_options, badge, is_new_arrival, is_active,
          rating, orders_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      PROD_RETIRED,
      "SwiftFuel Thermo Burn",
      "swiftfuel-thermo-burn",
      "SwiftFuel",
      CAT_GAINERS,
      179900,
      129900,
      0,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify(["90 Capsules"]),
      null,
      0,
      0,
      4.3,
      1810,
      "2025-12-05 10:00:00",
    )
    .run();
});

describe("catalog routes", () => {
  describe("GET /api/categories", () => {
    it("lists the categories ordered by sort_order", async () => {
      const categories = await getJson<CategoryJson[]>("/api/categories");

      expect(categories.map((category) => category.slug)).toEqual([
        "gainers",
        "proteins",
      ]);
      expect(categories[0]).toEqual({
        id: CAT_GAINERS,
        slug: "gainers",
        name: "Gainers",
        image_url: "/api/images/seed/gainers.jpg",
        tagline: "Clean calorie-dense mass",
        product_count: 1,
      });
    });

    it("counts the active products of a category only", async () => {
      const categories = await getJson<CategoryJson[]>("/api/categories");

      const proteins = categories.find((category) => category.slug === "proteins");
      const gainers = categories.find((category) => category.slug === "gainers");

      // Two active products in the proteins; the retired one lives in the
      // gainers and must not be counted.
      expect(proteins?.product_count).toBe(2);
      expect(gainers?.product_count).toBe(1);
    });
  });

  describe("GET /api/products", () => {
    it("lists the active products only", async () => {
      const products = await getJson<ProductJson[]>("/api/products");

      expect(products).toHaveLength(3);
      expect(ids(products)).not.toContain(PROD_RETIRED);
    });

    it("sorts by most ordered by default", async () => {
      const products = await getJson<ProductJson[]>("/api/products");

      expect(ids(products)).toEqual([PROD_GAINER, PROD_WHEY, PROD_PLANT]);
    });

    it("sorts by the orders count with the most_ordered key", async () => {
      const products = await getJson<ProductJson[]>("/api/products?sort=most_ordered");

      expect(ids(products)).toEqual([PROD_GAINER, PROD_WHEY, PROD_PLANT]);
    });

    it("sorts by the rating with the top_rated key", async () => {
      const products = await getJson<ProductJson[]>("/api/products?sort=top_rated");

      expect(ids(products)).toEqual([PROD_PLANT, PROD_WHEY, PROD_GAINER]);
    });

    it("sorts by the sale price with the price_asc key", async () => {
      const products = await getJson<ProductJson[]>("/api/products?sort=price_asc");

      expect(ids(products)).toEqual([PROD_PLANT, PROD_GAINER, PROD_WHEY]);
    });

    it("sorts by the sale price with the price_desc key", async () => {
      const products = await getJson<ProductJson[]>("/api/products?sort=price_desc");

      expect(ids(products)).toEqual([PROD_WHEY, PROD_GAINER, PROD_PLANT]);
    });

    it("sorts by the creation date with the newest key", async () => {
      const products = await getJson<ProductJson[]>("/api/products?sort=newest");

      expect(ids(products)).toEqual([PROD_PLANT, PROD_GAINER, PROD_WHEY]);
    });

    it("falls back to most ordered for an unknown sort key", async () => {
      const products = await getJson<ProductJson[]>("/api/products?sort=not_a_sort");

      expect(ids(products)).toEqual([PROD_GAINER, PROD_WHEY, PROD_PLANT]);
    });

    it("falls back to most ordered for a sort key of the object prototype", async () => {
      const products = await getJson<ProductJson[]>("/api/products?sort=constructor");

      expect(ids(products)).toEqual([PROD_GAINER, PROD_WHEY, PROD_PLANT]);
    });

    it("searches the name and the brand, case insensitively", async () => {
      const byBrand = await getJson<ProductJson[]>("/api/products?search=apex");
      expect(ids(byBrand)).toEqual([PROD_GAINER]);

      const byBrandUpperCase = await getJson<ProductJson[]>("/api/products?search=APEX");
      expect(ids(byBrandUpperCase)).toEqual([PROD_GAINER]);

      const byName = await getJson<ProductJson[]>("/api/products?search=whey");
      expect(ids(byName)).toEqual([PROD_WHEY]);
    });

    it("filters on the category slug", async () => {
      const products = await getJson<ProductJson[]>("/api/products?category=proteins");

      expect(ids(products).sort()).toEqual([PROD_PLANT, PROD_WHEY].sort());
    });

    it("filters nothing on the category all", async () => {
      const products = await getJson<ProductJson[]>("/api/products?category=all");

      expect(products).toHaveLength(3);
    });

    it("filters the new arrivals", async () => {
      const products = await getJson<ProductJson[]>("/api/products?new_arrivals=1");

      expect(ids(products)).toEqual([PROD_PLANT]);
    });

    it("computes the discount percent from the prices", async () => {
      const products = await getJson<ProductJson[]>("/api/products");

      const whey = products.find((product) => product.id === PROD_WHEY);
      const plant = products.find((product) => product.id === PROD_PLANT);
      const gainer = products.find((product) => product.id === PROD_GAINER);

      expect(whey?.discount_percent).toBe(25);
      expect(plant?.discount_percent).toBe(17);
      expect(gainer?.discount_percent).toBe(20);
    });

    it("computes the discount percent like the shared money util", async () => {
      const products = await getJson<ProductJson[]>("/api/products");

      for (const product of products) {
        expect(product.discount_percent).toBe(
          discountPercent(product.mrp, product.sale_price),
        );
      }
    });

    it("parses the images, flavors and weight options into arrays", async () => {
      const products = await getJson<ProductJson[]>("/api/products");

      const whey = products.find((product) => product.id === PROD_WHEY);
      const plant = products.find((product) => product.id === PROD_PLANT);

      expect(whey?.images).toEqual([
        "/api/images/whey-1.jpg",
        "/api/images/whey-2.jpg",
      ]);
      expect(whey?.flavors).toEqual(["Rich Chocolate", "Vanilla Bean"]);
      expect(whey?.weight_options).toEqual(["1 kg", "2 kg"]);
      expect(plant?.images).toEqual([]);
    });

    it("serves the prices in paise", async () => {
      const products = await getJson<ProductJson[]>("/api/products");

      const whey = products.find((product) => product.id === PROD_WHEY);

      expect(whey?.mrp).toBe(399900);
      expect(whey?.sale_price).toBe(299900);
    });

    it("honours the limit of the request", async () => {
      const products = await getJson<ProductJson[]>("/api/products?limit=1");

      expect(products).toHaveLength(1);
    });
  });

  describe("GET /api/products/:id", () => {
    it("serves a single active product", async () => {
      const product = await getJson<ProductJson>(`/api/products/${PROD_WHEY}`);

      expect(product.id).toBe(PROD_WHEY);
      expect(product.name).toBe("Kinetic Gold 100% Whey Isolate");
      expect(product.category).toBe("proteins");
      expect(product.discount_percent).toBe(25);
      expect(product.images).toEqual([
        "/api/images/whey-1.jpg",
        "/api/images/whey-2.jpg",
      ]);
    });

    it("answers 404 for a product that does not exist", async () => {
      const res = await get("/api/products/prod_does_not_exist");

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Product not found" });
    });

    it("answers 404 for an inactive product", async () => {
      const res = await get(`/api/products/${PROD_RETIRED}`);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ detail: "Product not found" });
    });
  });
});
