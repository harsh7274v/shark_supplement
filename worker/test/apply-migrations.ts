import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

/**
 * Applies `migrations/*.sql` to the test database.
 *
 * The migration files are read in Node (see `vitest.config.ts`) and handed to
 * the runtime as the `TEST_MIGRATIONS` binding. Setup files run before the
 * per-test-file storage isolation, so every test file starts with the schema
 * in place. `applyD1Migrations` only applies migrations that were not applied
 * yet, so calling it on every run is safe.
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
