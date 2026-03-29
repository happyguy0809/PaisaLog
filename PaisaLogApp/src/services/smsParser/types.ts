// ─────────────────────────────────────────────────────────
// types.ts  —  SMS Parser type definitions
// ─────────────────────────────────────────────────────────

export type SmsAction       = 'debit' | 'credit' | 'refund' | 'reversal' | 'unknown'
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

// What we want out of every SMS
export interface ParsedSMS {
  user_name:  string | null   // "Utkarsh", "USER", null
  account:    string | null   // masked: "XXXX1234"
  amount:     number | null   // paise / cents (smallest unit)
  currency:   string | null   // ISO 4217: "INR", "USD" …
  date:       string | null   // ISO 8601: "2026-03-28"
  merchant:   string | null   // raw brand name before normalisation
  action:     SmsAction | null
  reference:  string | null   // Ref / RRN / UPI Ref No / Txn ID
  balance:    number | null   // available balance if present
  bank_name:  string | null   // issuing bank name e.g. "HDFC Bank", "Barclays"
}

// ─────────────────────────────────────────────────────────
// Extractor config — one entry = one pattern to try
// All patterns are generic; no bank-specific code here.
// To add a new pattern: push to the relevant array in extractors.ts
// To handle an edge case: add a higher-priority entry in exceptions.ts
// ─────────────────────────────────────────────────────────

export interface FieldExtractor {
  id:          string          // human label — shows in trace
  field:       keyof ParsedSMS
  priority:    number          // lower = tried first
  pattern:     RegExp
  transform:   (match: RegExpMatchArray, body: string) => string | number | null
  confidence:  ConfidenceLevel
  note?:       string          // why this pattern exists
}

// ─────────────────────────────────────────────────────────
// Parse trace — stored in transactions.metadata.sms_parse_trace
// Tells you exactly what fired, what matched, and why
// ─────────────────────────────────────────────────────────

export interface ExtractorAttempt {
  extractor_id: string
  pattern:      string          // regex.toString()
  matched:      boolean
  raw_match?:   string          // what the regex captured
  confidence:   ConfidenceLevel
  note?:        string
}

export interface FieldTrace {
  field:              string
  attempts:           ExtractorAttempt[]
  resolved:           boolean
  final_value:        string | number | null
  final_confidence:   ConfidenceLevel | null
  winning_extractor:  string | null
}

export interface ParseTrace {
  // Input
  sender_id:           string
  raw_body:            string

  // Results
  fields:              Record<keyof ParsedSMS, FieldTrace>
  field_scores:        Record<keyof ParsedSMS, number>   // 0–100
  overall_confidence:  number                             // 0–100 weighted
  mandatory_missing:   (keyof ParsedSMS)[]
  optional_missing:    (keyof ParsedSMS)[]

  // Enrichment (Phase 2 — placeholder for now)
  enrichment_triggered: boolean
  masked_body?:         string

  // Timing
  parse_ms:   number
  total_ms:   number
  parsed_at:  string   // ISO 8601
}

export interface SmsParseResult {
  parsed:  ParsedSMS
  trace:   ParseTrace
  source:  'local'        // 'enriched' added in Phase 2
}
