-- The storefront variants and the sale engine.
--
-- Ten columns on `products` carry everything the new pricing needs: the two
-- option-photo maps, the per-size regular prices, the two detail texts and
-- the five sale fields. Every column is nullable or defaulted, so rows
-- written before this migration keep working unchanged.
--
-- The three new categories the storefront grows into are seeded here with
-- INSERT OR IGNORE, so re-running the migration never duplicates them.

ALTER TABLE products ADD COLUMN flavor_images TEXT;   -- JSON {"<flavor>": "<url>"}
ALTER TABLE products ADD COLUMN weight_images TEXT;   -- JSON {"<size>": "<url>"}
ALTER TABLE products ADD COLUMN weight_prices TEXT;   -- JSON {"<size>": <paise>}
ALTER TABLE products ADD COLUMN contents TEXT;        -- "What's inside" (free text)
ALTER TABLE products ADD COLUMN nutrition TEXT;       -- nutrition details (free text)
ALTER TABLE products ADD COLUMN sale_percentage INTEGER NOT NULL DEFAULT 0;  -- 0..90, 0 = none
ALTER TABLE products ADD COLUMN sale_price_override INTEGER;  -- exact base sale price, paise
ALTER TABLE products ADD COLUMN sale_overrides TEXT;  -- JSON {"<size>": <paise>}
ALTER TABLE products ADD COLUMN sale_starts_at TEXT;  -- UTC, like every other timestamp
ALTER TABLE products ADD COLUMN sale_ends_at TEXT;

INSERT OR IGNORE INTO categories (id, slug, name, icon, image_url, tagline, sort_order) VALUES
  ('cat_apparel',  'apparel',  'Apparel',  NULL, NULL, 'Train hard, look harder.', 90),
  ('cat_aminos',   'aminos',   'Aminos',   NULL, NULL, 'Recovery starts here.',    91),
  ('cat_gym_gear', 'gym-gear', 'Gym Gear', NULL, NULL, 'Gear that keeps up.',      92);
