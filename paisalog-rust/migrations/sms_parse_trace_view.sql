-- ─────────────────────────────────────────────────────────
-- SMS parse trace view + indexes
-- Run once: psql -U paisalog_api -d paisalog -f this_file.sql
-- ─────────────────────────────────────────────────────────

-- Human-readable parse status per transaction
CREATE OR REPLACE VIEW v_sms_parse_status AS
SELECT
  t.id                                                                      AS txn_id,
  t.created_at,
  t.amount,
  t.merchant_name,

  (t.metadata -> 'sms_parse_trace' ->> 'overall_confidence')::int          AS confidence_pct,
  t.metadata -> 'sms_parse_trace' ->> 'enrichment_triggered'               AS enrichment_triggered,
  (t.metadata -> 'sms_parse_trace' ->> 'total_ms')::int                    AS total_ms,

  t.metadata -> 'sms_parse_trace' -> 'mandatory_missing'                   AS mandatory_missing,
  t.metadata -> 'sms_parse_trace' -> 'optional_missing'                    AS optional_missing,

  -- Which extractor won per field (fastest debug signal)
  t.metadata -> 'sms_parse_trace' -> 'fields' -> 'amount'   ->> 'winning_extractor'   AS amount_extractor,
  t.metadata -> 'sms_parse_trace' -> 'fields' -> 'merchant' ->> 'winning_extractor'   AS merchant_extractor,
  t.metadata -> 'sms_parse_trace' -> 'fields' -> 'action'   ->> 'winning_extractor'   AS action_extractor,
  t.metadata -> 'sms_parse_trace' -> 'fields' -> 'account'  ->> 'winning_extractor'   AS account_extractor,

  -- Per-field confidence scores
  (t.metadata -> 'sms_parse_trace' -> 'field_scores' ->> 'amount')::int    AS amount_score,
  (t.metadata -> 'sms_parse_trace' -> 'field_scores' ->> 'merchant')::int  AS merchant_score,
  (t.metadata -> 'sms_parse_trace' -> 'field_scores' ->> 'date')::int      AS date_score

FROM transactions t
WHERE t.metadata ? 'sms_parse_trace';

-- Fast filtering on parse quality
CREATE INDEX IF NOT EXISTS idx_txn_parse_confidence
  ON transactions ((metadata -> 'sms_parse_trace' ->> 'overall_confidence'));

CREATE INDEX IF NOT EXISTS idx_txn_enrichment_triggered
  ON transactions ((metadata -> 'sms_parse_trace' ->> 'enrichment_triggered'));

-- ── Useful queries ─────────────────────────────────────

-- All failed merchant extractions:
-- SELECT txn_id, confidence_pct, mandatory_missing FROM v_sms_parse_status WHERE merchant_extractor IS NULL;

-- Extractor hit rate (which patterns fire most):
-- SELECT t.metadata->'sms_parse_trace'->'fields'->'merchant'->>'winning_extractor' AS ext, COUNT(*)
-- FROM transactions t WHERE t.metadata ? 'sms_parse_trace' GROUP BY ext ORDER BY count DESC;

-- Full trace for one transaction:
-- SELECT jsonb_pretty(metadata->'sms_parse_trace') FROM transactions WHERE id = <id>;
