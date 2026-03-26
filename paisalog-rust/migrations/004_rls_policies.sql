-- ============================================================
-- Migration 003: Row Level Security
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE households         ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_signal_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_timeline    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE coins_ledger       ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY users_isolation ON users
  USING (id = current_user_id());

CREATE POLICY auth_tokens_isolation ON auth_tokens
  USING (user_id = current_user_id());

CREATE POLICY refresh_tokens_isolation ON refresh_tokens
  USING (user_id = current_user_id());

CREATE POLICY households_isolation ON households
  USING (
    id IN (
      SELECT household_id FROM household_members
      WHERE user_id = current_user_id()
    )
  );

CREATE POLICY household_members_isolation ON household_members
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = current_user_id()
    )
  );

CREATE POLICY email_accounts_isolation ON email_accounts
  USING (user_id = current_user_id());

CREATE POLICY transactions_isolation ON transactions
  USING (user_id = current_user_id());

CREATE POLICY signal_log_isolation ON raw_signal_log
  USING (user_id = current_user_id());

CREATE POLICY refunds_isolation ON refunds
  USING (user_id = current_user_id());

CREATE POLICY refund_timeline_isolation ON refund_timeline
  USING (
    refund_id IN (
      SELECT id FROM refunds WHERE user_id = current_user_id()
    )
  );

CREATE POLICY splits_isolation ON expense_splits
  USING (
    payer_id = current_user_id()
    OR ower_id = current_user_id()
  );

CREATE POLICY coins_isolation ON coins_ledger
  USING (user_id = current_user_id());
