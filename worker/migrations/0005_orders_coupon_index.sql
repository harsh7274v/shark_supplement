-- Indexes orders.coupon_code for fast coupon usage lookup during checkout
CREATE INDEX IF NOT EXISTS idx_orders_coupon ON orders (coupon_code);

