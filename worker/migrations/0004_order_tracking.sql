-- Migration 0004: Add courier_name, tracking_number, and tracking_url to orders.
ALTER TABLE orders ADD COLUMN courier_name TEXT;
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN tracking_url TEXT;

