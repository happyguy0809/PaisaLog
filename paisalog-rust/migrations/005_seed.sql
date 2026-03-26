-- ============================================================
-- Migration 005: Seed data
-- ============================================================

-- Seed partner merchants (all inactive — v2 stub)
INSERT INTO partner_merchants (name, active) VALUES
  ('Swiggy',    FALSE),
  ('Zomato',    FALSE),
  ('Amazon',    FALSE),
  ('Flipkart',  FALSE),
  ('BigBasket', FALSE),
  ('Blinkit',   FALSE)
ON CONFLICT (name) DO NOTHING;
