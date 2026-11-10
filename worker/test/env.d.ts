declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    JWT_SECRET: string;
    FRONTEND_ORIGIN: string;
    /** Migration files read in Node by `vitest.config.ts`. */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    /** Seed SQL read in Node by `vitest.config.ts` (Task 13). */
    SEED_CATALOG: string;
    SEED_DEMO_ORDERS: string;
  }
}

/** `node:fs` has no type package in this project; declare the small slice
 * `vitest.config.ts` needs. */
declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: string): string;
}

/** `?raw` imports inline file contents as strings at transform time (run in
 * Node), so they're available as plain string constants inside the Workers
 * test runtime (workerd) where `fs` is unavailable. Used by
 * `test/seed-vars-sync.test.ts` to pin wrangler seed vars to their `.sql`
 * sources. */
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
declare module "*.jsonc?raw" {
  const content: string;
  export default content;
}
