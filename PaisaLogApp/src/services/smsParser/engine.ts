// ─────────────────────────────────────────────────────────
// engine.ts  —  Core parse engine
//
// Does NOT know about banks. Runs field extractors in priority
// order, records every attempt, builds a full trace.
// ─────────────────────────────────────────────────────────

import {
  ParsedSMS, SmsParseResult, ParseTrace, FieldTrace,
  ExtractorAttempt, ConfidenceLevel,
} from './types'
import { FieldExtractor, ALL_EXTRACTORS } from './extractors'
import { EXCEPTIONS } from './exceptions'
import { maskForEnrichment } from './masker'

// ── Config ───────────────────────────────────────────────

const MANDATORY: (keyof ParsedSMS)[] = ['amount', 'action', 'account']
const OPTIONAL:  (keyof ParsedSMS)[] = ['merchant', 'date', 'currency', 'reference', 'user_name', 'balance', 'bank_name']

// Trigger enrichment (Phase 2) when this many optional fields are missing
const OPTIONAL_MISSING_THRESHOLD = 2

const FIELD_WEIGHT: Record<keyof ParsedSMS, number> = {
  amount:    30,
  action:    20,
  account:   15,
  merchant:  15,
  date:      10,
  currency:   5,
  reference:  3,
  user_name:  1,
  balance:    1,
  bank_name:  2,
}

const CONF_SCORE: Record<ConfidenceLevel, number> = {
  HIGH: 100, MEDIUM: 60, LOW: 30,
}

// ── Helpers ──────────────────────────────────────────────

function groupByField(extractors: FieldExtractor[]): Map<keyof ParsedSMS, FieldExtractor[]> {
  const map = new Map<keyof ParsedSMS, FieldExtractor[]>()
  for (const e of extractors) {
    const list = map.get(e.field) ?? []
    list.push(e)
    map.set(e.field, list)
  }
  // Sort each group by priority
  for (const [, list] of map) list.sort((a, b) => a.priority - b.priority)
  return map
}

// ── Main export ──────────────────────────────────────────


// ── Pre-filter ────────────────────────────────────────────────
// Returns false for SMS that are definitely NOT transactions:
// OTPs, delivery updates, pure promotional, KYC alerts etc.
// Prevents garbage parses from entering the transaction pipeline.

export function isFinancialSms(body: string, senderId?: string): boolean {
  // Hard exclude: promotional sender IDs end in -P or -T (T = transactional OTP)
  if (senderId && /[-_][PT]$/i.test(senderId)) return false

  // Hard exclude: OTP messages
  if (/\bOTP\b|\bone.?time.?pass|verification.?code|OTP for Trxn/i.test(body)) return false

  // Hard exclude: delivery / logistics
  if (/\bdelivered\b|out for delivery|\bshipment\b|\bAWB\b|tracking id/i.test(body)) return false

  // Hard exclude: KYC / account management
  if (/\bKYC\b|update your KYC|add.on card|unsubscribe|scheduled on|Central Bank Digital Currency|Digital Rupee/i.test(body)) return false

  // Hard exclude: non-transaction financial alerts
  if (/consumed \d+% (?:of your )?(?:data|credit limit)|Balance Limit:|available limit is Rs|eligible for.*credit limit|increasing the limit/i.test(body)) return false

  // Hard exclude: pure promotional (has amount mention but no transaction word)
  const hasTxnWord = /\b(?:debited|credited|spent|received|transferred|refunded|payment|UPI|NEFT|IMPS|RTGS|trf to|is spent|is credited)\b/i.test(body)
  if (!hasTxnWord) return false

  return true
}

export function parseSMS(body: string, senderId: string): SmsParseResult {
  const t0 = performance.now()

  // Exceptions run first (priority < 1), then generics
  const allExtractors: FieldExtractor[] = [
    ...EXCEPTIONS,
    ...ALL_EXTRACTORS,
  ].sort((a, b) => a.priority - b.priority)

  const byField = groupByField(allExtractors)
  const parsed: Partial<ParsedSMS> = {}
  const fieldTraces: Partial<Record<keyof ParsedSMS, FieldTrace>> = {}

  // ── Run each field ──────────────────────────────────────
  for (const [field, extractors] of byField.entries()) {
    const attempts: ExtractorAttempt[] = []
    let resolved  = false
    let finalVal: string | number | null = null
    let finalConf: ConfidenceLevel | null = null
    let winningId: string | null = null

    for (const ext of extractors) {
      if (resolved) {
        attempts.push({
          extractor_id: ext.id, pattern: ext.pattern.toString(),
          matched: false, confidence: ext.confidence,
          note: 'skipped — field already resolved',
        })
        continue
      }

      const match = body.match(ext.pattern)
      if (match) {
        const value = ext.transform(match, body)
        if (value !== null && value !== undefined) {
          attempts.push({
            extractor_id: ext.id, pattern: ext.pattern.toString(),
            matched: true, raw_match: match[0],
            confidence: ext.confidence, note: ext.note,
          })
          ;(parsed as any)[field] = value
          finalVal  = value
          finalConf = ext.confidence
          winningId = ext.id
          resolved  = true
          continue
        }
      }

      attempts.push({
        extractor_id: ext.id, pattern: ext.pattern.toString(),
        matched: false, confidence: ext.confidence, note: ext.note,
      })
    }

    fieldTraces[field] = { field, attempts, resolved, final_value: finalVal, final_confidence: finalConf, winning_extractor: winningId }
  }

  const parseMs = Math.round(performance.now() - t0)

  // ── Confidence scoring ──────────────────────────────────
  let weightedSum = 0, totalWeight = 0
  const fieldScores: Partial<Record<keyof ParsedSMS, number>> = {}
  for (const [field, weight] of Object.entries(FIELD_WEIGHT)) {
    const ft    = fieldTraces[field as keyof ParsedSMS]
    const score = ft?.final_confidence ? CONF_SCORE[ft.final_confidence] : 0
    fieldScores[field as keyof ParsedSMS] = score
    weightedSum += score * weight
    totalWeight += weight
  }
  const overall = Math.round(weightedSum / totalWeight)

  // ── Missing fields ──────────────────────────────────────
  const mandatoryMissing = MANDATORY.filter(f => (parsed as any)[f] == null)
  const optionalMissing  = OPTIONAL.filter(f =>  (parsed as any)[f] == null)
  const enrichment = mandatoryMissing.length > 0 || optionalMissing.length >= OPTIONAL_MISSING_THRESHOLD

  // ── Masked body (ready for Phase 2 enrichment) ──────────
  const maskedBody = enrichment
    ? maskForEnrichment(body, parsed.merchant ?? null)
    : undefined

  const trace: ParseTrace = {
    sender_id: senderId,
    raw_body: body,
    fields: fieldTraces as Record<keyof ParsedSMS, FieldTrace>,
    field_scores: fieldScores as Record<keyof ParsedSMS, number>,
    overall_confidence: overall,
    mandatory_missing: mandatoryMissing,
    optional_missing: optionalMissing,
    enrichment_triggered: enrichment,
    masked_body: maskedBody,
    parse_ms: parseMs,
    total_ms: Math.round(performance.now() - t0),
    parsed_at: new Date().toISOString(),
  }

  return { parsed: parsed as ParsedSMS, trace, source: 'local' }
}

// ── Summary line for logs / QA output ────────────────────
export function traceSummary(r: SmsParseResult): string {
  const { trace: t, parsed: p } = r
  const missing = [...t.mandatory_missing, ...t.optional_missing]
  return [
    `conf=${t.overall_confidence}%`,
    `amt=${p.amount ?? '?'}`,
    `action=${p.action ?? '?'}`,
    `acct=${p.account ?? '?'}`,
    `merchant=${p.merchant ?? '?'}`,
    `date=${p.date ?? '?'}`,
    missing.length ? `missing=[${missing.join(',')}]` : 'complete',
    `${t.parse_ms}ms`,
  ].join(' ')
}
