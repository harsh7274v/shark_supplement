-- Tracks single-use coupon redemptions atomically to prevent concurrent checkout races.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  coupon_code TEXT NOT NULL,
  identifier  TEXT NOT NULL,
  order_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (coupon_code, identifier)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_order ON coupon_redemptions (order_id);

