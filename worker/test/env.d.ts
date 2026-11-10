declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    JWT_SECRET: string;
    FRONTEND_ORIGIN: string;
    /** Migration files read in Node by `vitest.config.ts`. */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
