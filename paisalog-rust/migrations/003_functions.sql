-- ============================================================
-- Migration 004: Functions
-- ============================================================

-- current_user_id() — reads the user id set by the API per request
-- API runs: SET LOCAL app.current_user_id = '<id>' at start of every request
CREATE OR REPLACE FUNCTION current_user_id() RETURNS INT AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::INT;
$$ LANGUAGE SQL STABLE;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
