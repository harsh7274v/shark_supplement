/**
 * Production runs `POST /api/admin/demo-data/seed` using the `SEED_CATALOG` /
 * `SEED_DEMO_ORDERS` values from `worker/wrangler.jsonc` vars, not the
 * `worker/seed/*.sql` files directly. Tests run the `.sql` files (handed in
 * by `worker/vitest.config.ts`). If a `.sql` file is edited and wrangler.jsonc
 * isn't re-synced (`node worker/scripts/sync-seed-vars.mjs`), production would
 * execute untested SQL.
 *
 * This test pins the invariant: both wrangler vars must equal the `.sql`
 * source files exactly. Any divergence fails this test.
 *
 * File contents are pulled in with `?raw` imports (resolved at transform time
 * in Node), so they're plain string constants inside the Workers test runtime
 * (workerd) where `node:fs` can't read host files.
 */

import { describe, expect, it } from "vitest";
import wranglerRaw from "../wrangler.jsonc?raw";
import catalogSql from "../seed/001_catalog.sql?raw";
import demoOrdersSql from "../seed/002_demo_orders.sql?raw";

function wranglerVar(name: string): string {
  const vars = JSON.parse(wranglerRaw).vars as Record<string, unknown>;
  const value = vars[name];
  if (typeof value !== "string") {
    throw new Error(`wrangler.jsonc vars.${name} is missing or not a string`);
  }
  return value;
}

describe("wrangler seed-var sync", () => {
  it("keeps SEED_CATALOG and SEED_DEMO_ORDERS identical to their seed .sql files", () => {
    expect(wranglerVar("SEED_CATALOG")).toBe(catalogSql);
    expect(wranglerVar("SEED_DEMO_ORDERS")).toBe(demoOrdersSql);
  });
});
