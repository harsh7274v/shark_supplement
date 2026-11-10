import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

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
export default defineConfig(async () => {
  // Migrations are read in Node and passed to the runtime as a binding, so the
  // setup file can apply them to every test database.
  const migrations = await readD1Migrations(
    new URL("./migrations", import.meta.url).pathname,
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
