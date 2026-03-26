-- ============================================================
-- Migration 002: Indexes
-- ============================================================

-- Fingerprint dedup — must include partition key (txn_date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_fingerprint
  ON transactions (user_id, fingerprint, txn_date);

-- Date range queries
CREATE INDEX IF NOT EXISTS idx_txn_user_date
  ON transactions (user_id, txn_date DESC);

-- Household combined view
CREATE INDEX IF NOT EXISTS idx_txn_household_date
  ON transactions (household_id, txn_date DESC)
  WHERE household_id IS NOT NULL;

-- Merchant grouping
CREATE INDEX IF NOT EXISTS idx_txn_merchant
  ON transactions (user_id, merchant)
  WHERE merchant IS NOT NULL;

-- Sync state (pending flush queue)
CREATE INDEX IF NOT EXISTS idx_txn_sync_state
  ON transactions (user_id, sync_state)
  WHERE sync_state != 'synced';

-- Signal log expiry cleanup
CREATE INDEX IF NOT EXISTS idx_signal_expires
  ON raw_signal_log (expires_at);

-- Signal log user lookup
CREATE INDEX IF NOT EXISTS idx_signal_user
  ON raw_signal_log (user_id, created_at DESC);

-- Auth token lookup
CREATE INDEX IF NOT EXISTS idx_auth_token_hash
  ON auth_tokens (token_hash)
  WHERE used = FALSE;

-- Refresh token lookup
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash
  ON refresh_tokens (token_hash)
  WHERE revoked = FALSE;

-- Refunds by user
CREATE INDEX IF NOT EXISTS idx_refunds_user
  ON refunds (user_id, created_at DESC);

-- Splits unsettled
CREATE INDEX IF NOT EXISTS idx_splits_unsettled
  ON expense_splits (household_id, ower_id)
  WHERE settled = FALSE;

-- Coins ledger
CREATE INDEX IF NOT EXISTS idx_coins_user
  ON coins_ledger (user_id, created_at DESC);
