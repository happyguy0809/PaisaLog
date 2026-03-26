-- ============================================================
-- Migration 006: Schema additions for v1 full feature set
-- Adds: jurisdiction, consent_version, consent_ip_hash to users
-- Adds: subscriptions, cash_spends, child_accounts tables
-- Adds: local_id, is_investment, is_subscription, is_cash to transactions
-- ============================================================

-- ── Users additions ───────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS jurisdiction      TEXT NOT NULL DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS consent_version   TEXT,
  ADD COLUMN IF NOT EXISTS consent_ip_hash   TEXT,  -- SHA-256 of IP, for GDPR
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── Transactions additions ────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_investment   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_cash         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS local_id        TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;

-- Idempotency: same device cannot insert the same local event twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_local_id
  ON transactions (user_id, local_id, txn_date)
  WHERE local_id IS NOT NULL;

-- ── Subscriptions (detected recurring payments) ───────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      SERIAL PRIMARY KEY,
  user_id                 INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant                TEXT NOT NULL,
  estimated_amount_paise  INT NOT NULL,
  cadence_days            INT NOT NULL,  -- 7, 30, 365
  last_payment_date       DATE,
  next_estimated_date     DATE,
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  detected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant)
);

CREATE INDEX IF NOT EXISTS idx_subs_user
  ON subscriptions (user_id)
  WHERE active = TRUE;

-- ── Cash spend log (manual entry after ATM withdrawal) ────────
CREATE TABLE IF NOT EXISTS cash_spends (
  id                  SERIAL PRIMARY KEY,
  user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Link to ATM withdrawal transaction if known
  withdrawal_txn_id   BIGINT,
  amount_paise        INT NOT NULL CHECK (amount_paise > 0),
  note                TEXT,
  -- Category is user-selected — can be NULL if not specified
  category            TEXT,
  spent_date          DATE NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_spends_user
  ON cash_spends (user_id, spent_date DESC);

-- ── Child parental control accounts ──────────────────────────
CREATE TABLE IF NOT EXISTS child_accounts (
  child_user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id         INT REFERENCES households(id) ON DELETE SET NULL,
  -- Child cannot remove payment sources without parent approval
  can_remove_sources   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (child_user_id, parent_user_id)
);

-- ── Enable RLS on new tables ──────────────────────────────────
ALTER TABLE subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_spends    ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_accounts ENABLE ROW LEVEL SECURITY;

-- ── RLS policies ─────────────────────────────────────────────
CREATE POLICY subs_isolation ON subscriptions
  USING (user_id = current_user_id());

CREATE POLICY cash_isolation ON cash_spends
  USING (user_id = current_user_id());

CREATE POLICY child_isolation ON child_accounts
  USING (
    child_user_id  = current_user_id()
    OR parent_user_id = current_user_id()
  );

-- ── Grants for new tables ────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  subscriptions, cash_spends, child_accounts
TO paisalog_api;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO paisalog_api;
