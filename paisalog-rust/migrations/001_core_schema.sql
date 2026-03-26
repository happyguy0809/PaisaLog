-- ============================================================
-- Migration 001: Core schema
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  email_hash            TEXT NOT NULL UNIQUE,   -- SHA-256(lowercase(email))
  name                  TEXT,
  locale                TEXT NOT NULL DEFAULT 'en-IN',
  timezone              TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  plan                  TEXT NOT NULL DEFAULT 'free',  -- free | family
  sync_mode             TEXT NOT NULL DEFAULT 'batch', -- batch | realtime
  analytics_consent     BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent     BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at            TIMESTAMPTZ,
  hard_delete_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auth tokens (magic link) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw token
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Refresh tokens ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Households ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,
  created_by   INT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Household members ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_members (
  household_id  INT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',  -- admin | member
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

-- ── Email accounts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_accounts (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_hash      TEXT NOT NULL,   -- SHA-256(lowercase(email))
  provider        TEXT NOT NULL DEFAULT 'gmail',
  oauth_token_enc TEXT,            -- AES-256-GCM encrypted
  last_synced_at  TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, email_hash)
);

-- ── Transactions (partitioned by quarter) ─────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id               BIGSERIAL,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id     INT REFERENCES households(id) ON DELETE SET NULL,
  amount_paise     INT NOT NULL CHECK (amount_paise > 0),
  type             TEXT NOT NULL,   -- debit | credit
  merchant         TEXT,
  category         TEXT,
  acct_suffix      TEXT,
  upi_ref          TEXT,
  source           TEXT NOT NULL,  -- sms | email | manual
  sender_hash      TEXT,
  confidence       INT NOT NULL DEFAULT 0,
  verified         BOOLEAN NOT NULL DEFAULT FALSE,
  fingerprint      TEXT NOT NULL,
  sync_state       TEXT NOT NULL DEFAULT 'pending',
  note             TEXT,
  is_coupon_refund BOOLEAN NOT NULL DEFAULT FALSE,
  txn_date         DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, txn_date)
) PARTITION BY RANGE (txn_date);

-- ── Partitions (2025–2027) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions_2025_q1 PARTITION OF transactions
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS transactions_2025_q2 PARTITION OF transactions
  FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS transactions_2025_q3 PARTITION OF transactions
  FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS transactions_2025_q4 PARTITION OF transactions
  FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS transactions_2026_q1 PARTITION OF transactions
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS transactions_2026_q2 PARTITION OF transactions
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS transactions_2026_q3 PARTITION OF transactions
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS transactions_2026_q4 PARTITION OF transactions
  FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS transactions_2027_q1 PARTITION OF transactions
  FOR VALUES FROM ('2027-01-01') TO ('2027-04-01');

-- ── Raw signal log (auto-expires 90 days) ────────────────────
CREATE TABLE IF NOT EXISTS raw_signal_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,       -- sms | email
  sender_hash     TEXT,
  confidence      INT NOT NULL,
  classification  TEXT NOT NULL,       -- HIGH | MEDIUM | LOW | OTP
  amount_paise    INT,
  txn_type        TEXT,
  merchant        TEXT,
  acct_suffix     TEXT,
  promoted        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Refunds ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  txn_id          BIGINT,
  refund_type     TEXT NOT NULL,   -- money | coupon | pending
  amount_paise    INT,
  coupon_code     TEXT,
  coupon_expiry   DATE,
  status          TEXT NOT NULL DEFAULT 'pending',
  merchant        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Refund timeline ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refund_timeline (
  id          SERIAL PRIMARY KEY,
  refund_id   INT NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  step        TEXT NOT NULL,
  status      TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Expense splits ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_splits (
  id            SERIAL PRIMARY KEY,
  household_id  INT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  txn_id        BIGINT NOT NULL,
  payer_id      INT NOT NULL REFERENCES users(id),
  ower_id       INT NOT NULL REFERENCES users(id),
  amount_paise  INT NOT NULL CHECK (amount_paise > 0),
  settled       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Partner merchants (v2 stub) ───────────────────────────────
CREATE TABLE IF NOT EXISTS partner_merchants (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  active      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Coins ledger (v3 stub) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS coins_ledger (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         INT NOT NULL,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
