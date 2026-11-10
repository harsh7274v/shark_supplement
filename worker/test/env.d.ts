declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    /** Migration files read in Node by `vitest.config.ts`. */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
