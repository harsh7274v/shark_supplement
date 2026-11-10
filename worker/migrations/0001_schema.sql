-- KINETIC NUTRITION — D1 schema.
--
-- Money columns hold integer paise; timestamps are ISO-8601 text.
-- `orders.user_id` is NULL for guest checkout and `orders.address` holds a
-- JSON blob of the shipping address.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  picture       TEXT,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer')),
  auth_provider TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  icon       TEXT,
  image_url  TEXT,
  tagline    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT,
  brand            TEXT,
  category_id      TEXT REFERENCES categories(id),
  mrp              INTEGER NOT NULL DEFAULT 0,
  sale_price       INTEGER NOT NULL DEFAULT 0,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  stock            INTEGER NOT NULL DEFAULT 0,
  images           TEXT NOT NULL DEFAULT '[]',
  flavors          TEXT NOT NULL DEFAULT '[]',
  weight_options   TEXT NOT NULL DEFAULT '[]',
  badge            TEXT,
  is_new_arrival   INTEGER NOT NULL DEFAULT 0 CHECK (is_new_arrival IN (0, 1)),
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  rating           REAL NOT NULL DEFAULT 0,
  orders_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE coupons (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value INTEGER NOT NULL DEFAULT 0,
  min_order      INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE orders (
  id                      TEXT PRIMARY KEY,
  order_number            TEXT NOT NULL UNIQUE,
  user_id                 TEXT REFERENCES users(id),
  name                    TEXT NOT NULL,
  email                   TEXT NOT NULL,
  phone                   TEXT,
  address                 TEXT,
  subtotal                INTEGER NOT NULL DEFAULT 0,
  discount                INTEGER NOT NULL DEFAULT 0,
  coupon_code             TEXT,
  gst                     INTEGER NOT NULL DEFAULT 0,
  shipping                INTEGER NOT NULL DEFAULT 0,
  total                   INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'placed'
                            CHECK (status IN ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  estimated_delivery_date TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  name       TEXT NOT NULL,
  unit_price INTEGER NOT NULL DEFAULT 0,
  qty        INTEGER NOT NULL DEFAULT 1,
  flavor     TEXT,
  weight     TEXT
);

CREATE TABLE payments (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('cod', 'upi', 'card')),
  amount     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL CHECK (status IN ('paid', 'on_delivery', 'refunded', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_status_history (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE email_log (
  id         TEXT PRIMARY KEY,
  order_id   TEXT REFERENCES orders(id) ON DELETE CASCADE,
  to_email   TEXT NOT NULL,
  template   TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
  identifier   TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE password_resets (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);

CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_payments_order ON payments (order_id);
CREATE INDEX idx_order_status_history_order ON order_status_history (order_id);
CREATE INDEX idx_email_log_order ON email_log (order_id);
