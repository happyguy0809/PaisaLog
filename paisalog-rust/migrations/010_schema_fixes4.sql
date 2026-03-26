-- ============================================================
-- Migration 010: More schema fixes
-- ============================================================

-- refunds: code uses initiated_date and resolved_date
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS initiated_date  DATE,
  ADD COLUMN IF NOT EXISTS resolved_date   DATE;

-- transactions: code uses sources (comma-separated string e.g. "sms,email")
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sources  TEXT NOT NULL DEFAULT 'sms';

-- subscriptions: cadence_days must be INT not ambiguous — ensure next_estimated_date is DATE
ALTER TABLE subscriptions
  ALTER COLUMN next_estimated_date TYPE DATE,
  ALTER COLUMN last_payment_date   TYPE DATE;
