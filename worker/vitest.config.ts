import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import fs from "node:fs";

declare global {
  interface ImportMeta {
    /**
     * `import.meta.url` is provided by the runtime (Node for this config, the
     * Workers runtime for worker code); the Workers `tsconfig.json` has no
     * DOM/Node lib that would type it.
     */
    url: string;
  }
}

// Runs all tests inside the Workers runtime (workerd) using the bindings,
// vars, and compatibility settings defined in wrangler.jsonc.
//
// Test files run in workerd, where `fs` is not available, so the seed SQL
// files are read here in Node and handed to the runtime as bindings. Only
// `seed.test.ts` executes them (in its own setup), so every other test file
// still starts from an empty database.
export default defineConfig(async () => {
  // Migrations are read in Node and passed to the runtime as a binding, so the
  // setup file can apply them to every test database.
  const migrations = await readD1Migrations(
    new URL("./migrations", import.meta.url).pathname,
  );

  const seedCatalog = fs.readFileSync(
    new URL("./seed/001_catalog.sql", import.meta.url),
    "utf8",
  );
  const seedDemoOrders = fs.readFileSync(
    new URL("./seed/002_demo_orders.sql", import.meta.url),
    "utf8",
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SEED_CATALOG: seedCatalog,
            SEED_DEMO_ORDERS: seedDemoOrders,
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
