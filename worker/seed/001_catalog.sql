-- KINETIC NUTRITION — idempotent catalog seed (Task 13).
--
-- Categories, products, coupons and the seed users. Every statement is
-- `INSERT OR IGNORE` on the unique keys, so re-running this file is a
-- no-op: the seed is idempotent and reset-safe.
--
-- Money is integer paise: rupee prices from `backend/server.py` (`price`
-- / `mrp`) multiplied by 100, and the stored `discount_percent` is the
-- percent the API recomputes from the two prices anyway.
-- Badges are stored uppercase (`NEW` / `HOT`) like the admin routes store
-- them, and `none` where there is no badge; `is_new_arrival = 1` exactly
-- where the badge is `NEW`.

INSERT OR IGNORE INTO categories (id, slug, name, image_url, tagline, sort_order)
VALUES
  ('cat_proteins', 'proteins', 'Proteins', '/api/images/catalog/whey_isolate.jpg', 'Whey, isolate & plant protein', 1),
  ('cat_gainers', 'gainers', 'Gainers', '/api/images/catalog/mass_gainer.jpg', 'Clean calorie-dense mass', 2),
  ('cat_pre_post', 'pre_post', 'Pre/Post Workout', '/api/images/catalog/pre_workout.jpg', 'Explosive energy & recovery', 3),
  ('cat_ayurveda', 'ayurveda', 'Ayurveda', '/api/images/catalog/ashwagandha.jpg', 'Ancient herbs, modern labs', 4),
  ('cat_fit_foods', 'fit_foods', 'Fit Foods', '/api/images/catalog/peanut_butter.jpg', 'High-protein everyday snacks', 5),
  ('cat_vitamins', 'vitamins', 'Vitamin Supplements', '/api/images/catalog/multivitamin.jpg', 'Daily micronutrient cover', 6),
  ('cat_fat_loss', 'fat_loss', 'Fat Loss', '/api/images/catalog/fat_burner.jpg', 'Cut clean, keep the muscle', 7);

INSERT OR IGNORE INTO products (id, name, slug, description, brand, category_id, mrp, sale_price, discount_percent, stock, images, flavors, weight_options, badge, is_new_arrival, is_active, rating, orders_count, created_at)
VALUES
  ('prod_whey_isolate', 'Kinetic Gold 100% Whey Isolate', 'kinetic-gold-100-whey-isolate', '24g ultra-filtered isolate per scoop, under 1g sugar and instantised for zero-clump mixing.', 'Kinetic', 'cat_proteins', 399900, 299900, 25, 48, '["/api/images/catalog/whey_isolate.jpg"]', '["Rich Chocolate", "Vanilla Bean", "Cookies & Cream"]', '["1 kg", "2 kg"]', 'HOT', 0, 1, 4.8, 0, date('now', '-12 days') || ' 10:00:00'),
  ('prod_whey_concentrate', 'Apex Fuel Whey Concentrate', 'apex-fuel-whey-concentrate', 'Grass-fed concentrate with 24g protein and a rich, milkshake-thick texture.', 'Apex Fuel', 'cat_proteins', 259900, 189900, 27, 32, '["/api/images/catalog/whey_concentrate.jpg"]', '["Chocolate Fudge", "Mocha Coffee"]', '["1 kg", "2 kg"]', 'none', 0, 1, 4.6, 0, date('now', '-18 days') || ' 10:30:00'),
  ('prod_plant_protein', 'Kinetic Plant Protein Isolate', 'kinetic-plant-protein-isolate', 'Pea + brown rice blend delivering a complete 25g vegan amino acid profile.', 'Kinetic', 'cat_proteins', 299900, 249900, 17, 18, '["/api/images/catalog/plant_protein.jpg"]', '["Smooth Vanilla", "Dutch Cocoa"]', '["800 g"]', 'NEW', 1, 1, 4.5, 0, date('now', '-2 days') || ' 11:00:00'),
  ('prod_casein', 'PureForge Night Casein', 'pureforge-night-casein', 'Slow-release micellar casein that feeds muscles for up to 7 overnight hours.', 'PureForge', 'cat_proteins', 279900, 219900, 21, 24, '["/api/images/catalog/casein.jpg"]', '["Chocolate Supreme"]', '["1 kg"]', 'none', 0, 1, 4.7, 0, date('now', '-26 days') || ' 11:30:00'),
  ('prod_mass_gainer', 'Apex Fuel Serious Mass Gainer', 'apex-fuel-serious-mass-gainer', '1250 calorie shakes with 50g protein and complex carbs for hard gainers.', 'Apex Fuel', 'cat_gainers', 349900, 279900, 20, 40, '["/api/images/catalog/mass_gainer.jpg"]', '["Chocolate", "Banana"]', '["3 kg", "5 kg"]', 'none', 0, 1, 4.5, 0, date('now', '-15 days') || ' 12:00:00'),
  ('prod_lean_gainer', 'Kinetic Lean Muscle Gainer', 'kinetic-lean-muscle-gainer', 'A 2:1 carb-to-protein lean bulk formula with added creatine and digestive enzymes.', 'Kinetic', 'cat_gainers', 299900, 249900, 17, 15, '["/api/images/catalog/lean_gainer.jpg"]', '["Vanilla Almond"]', '["2.5 kg"]', 'NEW', 1, 1, 4.4, 0, date('now', '-3 days') || ' 12:30:00'),
  ('prod_pre_workout', 'Kinetic Pre-Workout Surge', 'kinetic-pre-workout-surge', '300mg caffeine, 6g citrulline and 3.2g beta-alanine for skin-splitting pumps.', 'Kinetic', 'cat_pre_post', 199900, 159900, 20, 60, '["/api/images/catalog/pre_workout.jpg"]', '["Blue Raspberry", "Fruit Punch", "Green Apple"]', '["250 g"]', 'HOT', 0, 1, 4.7, 0, date('now', '-8 days') || ' 13:00:00'),
  ('prod_creatine', 'PureForge Creatine Monohydrate', 'pureforge-creatine-monohydrate', 'Micronised Creapure-grade monohydrate, third-party tested for purity.', 'PureForge', 'cat_pre_post', 129900, 89900, 31, 90, '["/api/images/catalog/creatine.jpg"]', '["Unflavoured"]', '["250 g", "500 g"]', 'none', 0, 1, 4.9, 0, date('now', '-6 days') || ' 13:30:00'),
  ('prod_eaa', 'Apex Fuel EAA Recovery', 'apex-fuel-eaa-recovery', 'All 9 essential amino acids plus electrolytes for intra and post-session recovery.', 'Apex Fuel', 'cat_pre_post', 239900, 189900, 21, 35, '["/api/images/catalog/eaa.jpg"]', '["Watermelon", "Citrus Splash"]', '["400 g"]', 'NEW', 1, 1, 4.5, 0, date('now', '-4 days') || ' 14:00:00'),
  ('prod_ashwagandha', 'NaturaVeda Ashwagandha KSM-66', 'naturaveda-ashwagandha-ksm-66', 'Clinically dosed KSM-66 root extract to cut cortisol and boost natural strength.', 'NaturaVeda', 'cat_ayurveda', 109900, 79900, 27, 50, '["/api/images/catalog/ashwagandha.jpg"]', '[]', '["60 Capsules", "120 Capsules"]', 'none', 0, 1, 4.7, 0, date('now', '-10 days') || ' 14:30:00'),
  ('prod_shilajit', 'NaturaVeda Himalayan Shilajit Resin', 'naturaveda-himalayan-shilajit-resin', 'Lab-purified 100% raw Shilajit resin, fulvic acid tested at 68%.', 'NaturaVeda', 'cat_ayurveda', 179900, 129900, 28, 28, '["/api/images/catalog/shilajit.jpg"]', '[]', '["20 g"]', 'NEW', 1, 1, 4.6, 0, date('now', '-5 days') || ' 15:00:00'),
  ('prod_peanut_butter', 'SwiftFuel High-Protein Peanut Butter', 'swiftfuel-high-protein-peanut-butter', '1kg of slow-roasted, stone-ground peanut butter with 30g protein per 100g.', 'SwiftFuel', 'cat_fit_foods', 64900, 49900, 23, 70, '["/api/images/catalog/peanut_butter.jpg"]', '["Creamy", "Crunchy", "Dark Chocolate"]', '["500 g", "1 kg"]', 'none', 0, 1, 4.6, 0, date('now', '-9 days') || ' 15:30:00'),
  ('prod_protein_bars', 'Kinetic Protein Bar Box', 'kinetic-protein-bar-box', '20g protein, under 2g sugar per bar. Box of 12 gym-bag-ready snacks.', 'Kinetic', 'cat_fit_foods', 179900, 149900, 17, 22, '["/api/images/catalog/protein_bars.jpg"]', '["Choco Almond", "Peanut Butter"]', '["12 x 60 g"]', 'none', 0, 1, 4.4, 0, date('now', '-7 days') || ' 16:00:00'),
  ('prod_multivitamin', 'VitaCore Daily Multivitamin', 'vitacore-daily-multivitamin', '42 essential vitamins, minerals and botanicals in one sustained-release tablet.', 'VitaCore', 'cat_vitamins', 99900, 69900, 30, 65, '["/api/images/catalog/multivitamin.jpg"]', '[]', '["90 Tablets"]', 'none', 0, 1, 4.5, 0, date('now', '-14 days') || ' 16:30:00'),
  ('prod_omega3', 'VitaCore Omega-3 Fish Oil', 'vitacore-omega-3-fish-oil', '1400mg omega-3 with 660mg EPA and 440mg DHA per serving, mercury tested.', 'VitaCore', 'cat_vitamins', 119900, 89900, 25, 40, '["/api/images/catalog/omega3.jpg"]', '[]', '["60 Softgels"]', 'NEW', 1, 1, 4.6, 0, date('now', '-5 days') || ' 17:00:00'),
  ('prod_fat_burner', 'Kinetic Thermo Burn', 'kinetic-thermo-burn', 'Thermogenic blend of green tea extract, L-theanine and 200mg caffeine.', 'Kinetic', 'cat_fat_loss', 179900, 129900, 28, 30, '["/api/images/catalog/fat_burner.jpg"]', '[]', '["90 Capsules"]', 'none', 0, 1, 4.3, 0, date('now', '-11 days') || ' 17:30:00'),
  ('prod_lcarnitine', 'Apex Fuel L-Carnitine 3000', 'apex-fuel-l-carnitine-3000', '3000mg liquid L-carnitine shots that turn stored fat into training fuel.', 'Apex Fuel', 'cat_fat_loss', 139900, 99900, 29, 55, '["/api/images/catalog/lcarnitine.jpg"]', '["Berry Blast"]', '["450 ml"]', 'none', 0, 1, 4.4, 0, date('now', '-16 days') || ' 18:00:00'),
  ('prod_acv_gummies', 'PureForge ACV Gummies', 'pureforge-acv-gummies', '1000mg apple cider vinegar per serving with the mother, minus the harsh taste.', 'PureForge', 'cat_fat_loss', 89900, 64900, 28, 45, '["/api/images/catalog/acv_gummies.jpg"]', '["Green Apple"]', '["60 Gummies"]', 'none', 0, 1, 4.3, 0, date('now', '-20 days') || ' 18:30:00');

INSERT OR IGNORE INTO coupons (id, code, discount_type, discount_value, min_order, active, single_use_per_user)
VALUES
  ('coup_kinetic10', 'KINETIC10', 'percent', 10, 149900, 1, 1),
  ('coup_welcome15', 'WELCOME15', 'percent', 15, 199900, 1, 1),
  ('coup_muscle500', 'MUSCLE500', 'flat', 50000, 299900, 1, 1);

INSERT OR IGNORE INTO users (id, email, name, picture, password_hash, role, auth_provider, created_at)
VALUES
  ('user_admin', 'admin@kineticnutrition.com', 'Admin', NULL, 'pbkdf2$100000$EXaANY02t6d72HjsXavaLg==$DAyeOFMJQr0xpTvqVf3V9VJRFvoP20cG/omneK3FO48=', 'admin', 'password', '2026-10-01 00:00:00'),
  ('user_athlete_test', 'athlete.test@kineticnutrition.com', 'Demo Athlete', NULL, 'pbkdf2$100000$95VC5AYrQWwnYqJfS6KM8Q==$05QfhiUp3WHd/qgwXe0nH2WsiBhl8ijMeDLaSslIj4A=', 'customer', 'password', '2026-10-01 00:00:00');
