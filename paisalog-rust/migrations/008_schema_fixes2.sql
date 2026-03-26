-- ============================================================
-- Migration 008: More schema fixes
-- ============================================================

-- transactions: code uses txn_type but schema has "type" (reserved word issue)
ALTER TABLE transactions RENAME COLUMN "type" TO txn_type;

-- expense_splits: code uses payer_user_id but schema has payer_id
ALTER TABLE expense_splits RENAME COLUMN payer_id TO payer_user_id;

-- expense_splits: code uses splits_json and note columns
ALTER TABLE expense_splits
  ADD COLUMN IF NOT EXISTS splits_json  JSONB,
  ADD COLUMN IF NOT EXISTS note         TEXT;

-- refunds: code uses reason column
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS reason  TEXT;

-- refund_timeline: code uses label, event_date, done, active columns
ALTER TABLE refund_timeline
  ADD COLUMN IF NOT EXISTS label       TEXT,
  ADD COLUMN IF NOT EXISTS event_date  TEXT,
  ADD COLUMN IF NOT EXISTS done        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS active      BOOLEAN NOT NULL DEFAULT TRUE;
