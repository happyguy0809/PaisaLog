// ─────────────────────────────────────────────────────────
// smsParser/index.ts  —  Public API
//
// Usage:
//   import { parseSMS, traceSummary } from '@/services/smsParser'
//   const result = parseSMS(rawBody, senderId)
//   console.log(traceSummary(result))
//   // Store result.trace in transactions.metadata.sms_parse_trace
// ─────────────────────────────────────────────────────────

export { parseSMS, traceSummary, isFinancialSms }    from './engine'
export { maskForEnrichment }         from './masker'
export type {
  ParsedSMS, ParseTrace, SmsParseResult,
  FieldExtractor, FieldTrace, ExtractorAttempt,
} from './types'
