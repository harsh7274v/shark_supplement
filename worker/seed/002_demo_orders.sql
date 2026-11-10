-- KINETIC NUTRITION — idempotent demo orders seed (Task 13).
--
-- ~30 orders over `date('now', '-21..0 days')`, most of them delivered,
-- with a few shipped / confirmed / placed and two cancelled. Every id is
-- fixed, every amount is computed from the seeded product prices exactly
-- like `src/lib/pricing.ts` (subtotal, coupon discount with `min_order` in
-- paise, 5 % GST, free shipping from Rs 999), and every statement is
-- `INSERT OR IGNORE` on the unique keys, so re-running this file is a
-- no-op: idempotent and reset-safe.
--
-- Depends on `seed/001_catalog.sql` (categories, products, coupons, users).

INSERT OR IGNORE INTO orders (id, order_number, user_id, name, email, phone, address, subtotal, discount, coupon_code, gst, shipping, total, status, estimated_delivery_date, created_at, updated_at)
WITH RECURSIVE
nums(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM nums WHERE n < 29
),
-- One row per demo order, oldest first, all inside the last 21 days.
orders_src AS (
  SELECT
    n,
    'ord_demo_' || printf('%02d', n + 1) AS id,
    'KN-7' || printf('%03d', n + 1) AS order_number,
    date('now', '-' || (n % 22) || ' days') || ' ' || printf('%02d:00:00', (n * 7 + 3) % 24) AS created_at,
    CASE
      WHEN n BETWEEN 0 AND 1 THEN 'cancelled'
      WHEN n BETWEEN 2 AND 4 THEN 'placed'
      WHEN n BETWEEN 5 AND 7 THEN 'confirmed'
      WHEN n BETWEEN 8 AND 11 THEN 'shipped'
      ELSE 'delivered'
    END AS status,
    CASE WHEN n % 3 = 0 THEN 'user_athlete_test' END AS user_id,
    'Demo Buyer ' || (n + 1) AS name,
    CASE WHEN n % 3 = 0
      THEN 'athlete.test@kineticnutrition.com'
      ELSE 'guest-' || (n + 1) || '@example.com'
    END AS email,
    '+91 ' || printf('%05d', (n * 37 + 11) % 100000) AS phone,
    json_object(
      'address', 'Demo Address ' || (n + 1),
      'city', 'Bengaluru',
      'pincode', printf('%06d', (n * 13 + 7) % 1000000)
    ) AS address
  FROM nums
),
all_products AS (
  SELECT id, name, sale_price, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM products
),
items_src AS (
  SELECT o.id AS order_id, p.id AS product_id, p.name AS name, p.sale_price AS unit_price,
         1 + (o.n % 3) AS qty
  FROM orders_src o
  JOIN all_products p ON p.rn = (o.n % 18) + 1
  UNION ALL
  SELECT o.id, p.id, p.name, p.sale_price, 1
  FROM orders_src o
  JOIN all_products p ON p.rn = ((o.n * 3 + 7) % 18) + 1
  WHERE o.n % 2 = 0
  UNION ALL
  SELECT o.id, p.id, p.name, p.sale_price, 2
  FROM orders_src o
  JOIN all_products p ON p.rn = ((o.n * 5 + 11) % 18) + 1
  WHERE o.n % 5 = 0
),
order_prices AS (
  SELECT order_id, SUM(unit_price * qty) AS subtotal
  FROM items_src
  GROUP BY order_id
),
coupons_src AS (
  SELECT o.id AS order_id,
         CASE o.n % 4
           WHEN 0 THEN 'KINETIC10'
           WHEN 1 THEN 'WELCOME15'
           WHEN 2 THEN 'MUSCLE500'
         END AS coupon_code
  FROM orders_src o
),
order_prices_with_coupon AS (
  SELECT op.order_id, op.subtotal, cc.coupon_code,
         COALESCE(
           CASE cc.coupon_code
             WHEN 'KINETIC10' THEN CASE WHEN op.subtotal >= 149900 THEN CAST(ROUND(op.subtotal * 10 / 100.0) AS INTEGER) END
             WHEN 'WELCOME15' THEN CASE WHEN op.subtotal >= 199900 THEN CAST(ROUND(op.subtotal * 15 / 100.0) AS INTEGER) END
             WHEN 'MUSCLE500' THEN CASE WHEN op.subtotal >= 299900 THEN 50000 END
           END, 0) AS discount
  FROM order_prices op
  LEFT JOIN coupons_src cc ON cc.order_id = op.order_id
),
order_final AS (
  SELECT order_id, subtotal, discount,
         ROUND((subtotal - discount) * 0.05) AS gst,
         CASE WHEN subtotal - discount >= 99900 THEN 0 ELSE 7900 END AS shipping,
         subtotal - discount + ROUND((subtotal - discount) * 0.05)
           + CASE WHEN subtotal - discount >= 99900 THEN 0 ELSE 7900 END AS total
  FROM order_prices_with_coupon
)
SELECT o.id, o.order_number, o.user_id, o.name, o.email, o.phone, o.address,
       f.subtotal, f.discount,
       CASE WHEN f.discount > 0 THEN c.coupon_code END,
       f.gst, f.shipping, f.total, o.status, date(o.created_at, '+5 days'),
       o.created_at, o.created_at
FROM orders_src o
JOIN order_final f ON f.order_id = o.id
LEFT JOIN coupons_src c ON c.order_id = o.id;

INSERT OR IGNORE INTO order_items (id, order_id, product_id, name, unit_price, qty, flavor, weight)
WITH RECURSIVE
nums(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM nums WHERE n < 29
),
orders_src AS (
  SELECT n, 'ord_demo_' || printf('%02d', n + 1) AS id, created_at
  FROM (
    SELECT n, date('now', '-' || (n % 22) || ' days') || ' ' || printf('%02d:00:00', (n * 7 + 3) % 24) AS created_at
    FROM nums
  )
),
all_products AS (
  SELECT id, name, sale_price, flavors, weight_options, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM products
),
items_src AS (
  SELECT o.id AS order_id, p.id AS product_id, p.name AS name, p.sale_price AS unit_price,
         1 + (o.n % 3) AS qty, p.flavors AS flavors, p.weight_options AS weight_options
  FROM orders_src o
  JOIN all_products p ON p.rn = (o.n % 18) + 1
  UNION ALL
  SELECT o.id, p.id, p.name, p.sale_price, 1, p.flavors, p.weight_options
  FROM orders_src o
  JOIN all_products p ON p.rn = ((o.n * 3 + 7) % 18) + 1
  WHERE o.n % 2 = 0
  UNION ALL
  SELECT o.id, p.id, p.name, p.sale_price, 2, p.flavors, p.weight_options
  FROM orders_src o
  JOIN all_products p ON p.rn = ((o.n * 5 + 11) % 18) + 1
  WHERE o.n % 5 = 0
),
numbered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY product_id) AS line
  FROM items_src
)
SELECT 'item_' || order_id || '_' || printf('%02d', line),
       order_id, product_id, name, unit_price, qty,
       json_extract(flavors, '$[0]'), json_extract(weight_options, '$[0]')
FROM numbered;

INSERT OR IGNORE INTO payments (id, order_id, method, amount, status, created_at)
WITH RECURSIVE
nums(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM nums WHERE n < 29
),
orders_src AS (
  SELECT n, 'ord_demo_' || printf('%02d', n + 1) AS id,
         date('now', '-' || (n % 22) || ' days') || ' ' || printf('%02d:00:00', (n * 7 + 3) % 24) AS created_at,
         CASE
           WHEN n BETWEEN 0 AND 1 THEN 'cancelled'
           WHEN n BETWEEN 2 AND 4 THEN 'placed'
           WHEN n BETWEEN 5 AND 7 THEN 'confirmed'
           WHEN n BETWEEN 8 AND 11 THEN 'shipped'
           ELSE 'delivered'
         END AS status
  FROM nums
)
SELECT 'pay_' || o.id, o.id,
       CASE o.n % 3 WHEN 0 THEN 'cod' WHEN 1 THEN 'upi' ELSE 'card' END,
       (SELECT total FROM orders WHERE id = o.id),
       CASE WHEN o.n % 3 = 0 AND o.status <> 'delivered' THEN 'on_delivery' ELSE 'paid' END,
       o.created_at
FROM orders_src o;

INSERT OR IGNORE INTO order_status_history (id, order_id, status, note, created_at)
WITH RECURSIVE
nums(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM nums WHERE n < 29
),
orders_src AS (
  SELECT 'ord_demo_' || printf('%02d', n + 1) AS id,
         date('now', '-' || (n % 22) || ' days') || ' ' || printf('%02d:00:00', (n * 7 + 3) % 24) AS created_at,
         CASE
           WHEN n BETWEEN 0 AND 1 THEN 'cancelled'
           WHEN n BETWEEN 2 AND 4 THEN 'placed'
           WHEN n BETWEEN 5 AND 7 THEN 'confirmed'
           WHEN n BETWEEN 8 AND 11 THEN 'shipped'
           ELSE 'delivered'
         END AS status
  FROM nums
)
SELECT 'hist_' || o.id || '_placed', o.id, 'placed', 'Order placed', o.created_at FROM orders_src o
UNION ALL
SELECT 'hist_' || o.id || '_confirmed', o.id, 'confirmed', 'Order confirmed',
       datetime(o.created_at, '+1 hours') FROM orders_src o
WHERE o.status IN ('confirmed', 'shipped', 'delivered')
UNION ALL
SELECT 'hist_' || o.id || '_shipped', o.id, 'shipped', 'Order shipped',
       datetime(o.created_at, '+2 hours') FROM orders_src o
WHERE o.status IN ('shipped', 'delivered')
UNION ALL
SELECT 'hist_' || o.id || '_delivered', o.id, 'delivered', 'Order delivered',
       datetime(o.created_at, '+3 hours') FROM orders_src o
WHERE o.status = 'delivered'
UNION ALL
SELECT 'hist_' || o.id || '_cancelled', o.id, 'cancelled', 'Order cancelled',
       datetime(o.created_at, '+4 hours') FROM orders_src o
WHERE o.status = 'cancelled';
