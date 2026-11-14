-- Migration 0003: Add single_use_per_user to coupons table.
-- Default is 1 (each user/email can only redeem a coupon once).
ALTER TABLE coupons ADD COLUMN single_use_per_user INTEGER NOT NULL DEFAULT 1 CHECK (single_use_per_user IN (0, 1));

