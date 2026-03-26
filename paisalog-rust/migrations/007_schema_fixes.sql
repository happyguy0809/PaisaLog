-- ============================================================
-- Migration 007: Fix schema mismatches between code and DB
-- ============================================================

-- raw_signal_log: code uses parsed_* column names + reviewed + received_at
ALTER TABLE raw_signal_log
  ADD COLUMN IF NOT EXISTS parsed_amount_paise  INT,
  ADD COLUMN IF NOT EXISTS parsed_type          TEXT,
  ADD COLUMN IF NOT EXISTS parsed_merchant      TEXT,
  ADD COLUMN IF NOT EXISTS parsed_acct_suffix   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS fingerprint          TEXT;

-- households: code uses owner_id instead of created_by, and invite_expires_at
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS owner_id           INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS invite_expires_at  TIMESTAMPTZ;

-- Backfill owner_id from created_by
UPDATE households SET owner_id = created_by WHERE owner_id IS NULL;
