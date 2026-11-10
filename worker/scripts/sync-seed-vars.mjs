/**
 * Syncs `worker/wrangler.jsonc`'s `SEED_CATALOG` / `SEED_DEMO_ORDERS` vars
 * from `worker/seed/*.sql` (the source of truth).
 *
 * Reads each `.sql` file, escapes its full contents as a JSON string, and
 * replaces the matching var value in `worker/wrangler.jsonc`. The rest of
 * the file (comments, other vars, formatting) is preserved verbatim.
 *
 * Idempotent: if a var already matches the `.sql` file it is left untouched,
 * so running this script twice changes nothing the second time.
 *
 *   node worker/scripts/sync-seed-vars.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER = join(__dirname, ".."); // .../worker/

const SEED_FILES = {
  SEED_CATALOG: "seed/001_catalog.sql",
  SEED_DEMO_ORDERS: "seed/002_demo_orders.sql",
};

/**
 * Replace the JSON-string value of a single `vars` entry in raw wrangler
 * text, preserving everything else byte-for-byte. Returns the (possibly
 * unchanged) text.
 */
function replaceVar(text, name, newValueJson) {
  const key = JSON.stringify(name); // '"SEED_CATALOG"'
  // Matches: <key> : " <json-string-value> "  (handles escapes inside)
  const re = new RegExp(
    `(${key}\\s*:\\s*)"((?:[^"\\\\]|\\\\.)*)"`,
  );
  if (!re.test(text)) {
    throw new Error(`Var ${name} not found in worker/wrangler.jsonc`);
  }
  return text.replace(re, (_match, prefix, oldValue) => {
    let oldText;
    try {
      oldText = JSON.parse(`"${oldValue}"`);
    } catch (err) {
      throw new Error(`Failed to parse existing value of ${name}: ${err.message}`);
    }
    const newText = JSON.parse(newValueJson);
    if (oldText === newText) {
      return _match; // already in sync: no-op (idempotency)
    }
    return prefix + newValueJson;
  });
}

let wrangler = readFileSync(join(WORKER, "wrangler.jsonc"), "utf8");
const updated = [];

for (const [name, fileName] of Object.entries(SEED_FILES)) {
  const sql = readFileSync(join(WORKER, fileName), "utf8");
  const next = replaceVar(wrangler, name, JSON.stringify(sql));
  if (next !== wrangler) {
    wrangler = next;
    updated.push(name);
  }
}

if (updated.length) {
  writeFileSync(join(WORKER, "wrangler.jsonc"), wrangler);
  for (const name of updated) {
    console.log(`updated ${name} from worker/seed/${SEED_FILES[name]}`);
  }
} else {
  console.log("no changes: SEED_CATALOG / SEED_DEMO_ORDERS already in sync with worker/seed/*.sql");
}
