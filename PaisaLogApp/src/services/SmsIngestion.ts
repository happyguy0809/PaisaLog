// src/services/SmsIngestion.ts
import { parseSMS, isFinancialSms } from './smsParser'
import type { SmsParseResult } from './smsParser'
import api from './api'

export interface RawSms { address: string; body: string; date: number }

const HIGH_CONF = 80
const MED_CONF  = 60

export async function ingestSms(sms: RawSms): Promise<{
  action: 'transaction' | 'review' | 'skipped'
  transactionId?: number
  reviewId?: number
}> {
  if (!isFinancialSms(sms.body, sms.address)) return { action: 'skipped' }

  const result: SmsParseResult = parseSMS(sms.body, sms.address)
  const { parsed, trace } = result
  const conf         = trace.overall_confidence
  const hasMandatory = trace.mandatory_missing.length === 0

  const payload = {
    sender_id:         sms.address,
    raw_body:          sms.body,
    masked_body:       trace.masked_body ?? null,
    parse_trace:       trace,
    overall_conf:      conf,
    mandatory_missing: trace.mandatory_missing,
    optional_missing:  trace.optional_missing,
    parsed_amount:     parsed.amount    ?? null,
    parsed_currency:   parsed.currency  ?? null,
    parsed_account:    parsed.account   ?? null,
    parsed_action:     parsed.action    ?? null,
    parsed_merchant:   parsed.merchant  ?? null,
    parsed_date:       parsed.date      ?? null,
    parsed_bank:       parsed.bank_name ?? null,
    parsed_reference:  parsed.reference ?? null,
  }

  // HIGH confidence — straight to transaction
  if (conf >= HIGH_CONF && hasMandatory) {
    try {
      const res = await api.post('/transactions/batch', [payload])
      return { action: 'transaction', transactionId: res.data?.[0]?.id }
    } catch { /* fall through to review */ }
  }

  // MEDIUM confidence — transaction + review queue
  if (conf >= MED_CONF && hasMandatory) {
    let txnId: number | undefined
    try {
      const res = await api.post('/transactions/batch', [{ ...payload, needs_review: true }])
      txnId = res.data?.[0]?.id
    } catch {}
    try {
      const rev = await api.post('/sms/review', payload)
      return { action: 'review', transactionId: txnId, reviewId: rev.data.id }
    } catch {}
  }

  // LOW confidence — review only
  try {
    const rev = await api.post('/sms/review', payload)
    return { action: 'review', reviewId: rev.data.id }
  } catch {
    return { action: 'skipped' }
  }
}

export async function ingestBatch(
  smsList: RawSms[],
  onProgress?: (done: number, total: number) => void
): Promise<{ transactions: number; reviews: number; skipped: number }> {
  let transactions = 0, reviews = 0, skipped = 0
  for (let i = 0; i < smsList.length; i++) {
    const r = await ingestSms(smsList[i])
    if (r.action === 'transaction') transactions++
    else if (r.action === 'review') reviews++
    else skipped++
    onProgress?.(i + 1, smsList.length)
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 50))
  }
  return { transactions, reviews, skipped }
}
