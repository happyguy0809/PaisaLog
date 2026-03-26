-- ============================================================
-- Migration 009: More schema fixes
-- ============================================================

-- expense_splits: code uses "splits" not "splits_json"
ALTER TABLE expense_splits RENAME COLUMN splits_json TO splits;

-- refunds: code uses expiry_date not coupon_expiry
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS expiry_date DATE;
UPDATE refunds SET expiry_date = coupon_expiry WHERE expiry_date IS NULL;

-- users: code uses consent_recorded_at
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ;
