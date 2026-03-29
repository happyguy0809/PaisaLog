// ─────────────────────────────────────────────────────────
// extractors.ts  —  Universal field extractors
//
// ARCHITECTURE:
//   - No bank-specific logic here. Ever.
//   - Patterns ordered by specificity (priority). Lower = tried first.
//   - To add a new universal pattern: push to the right array.
//   - To handle an edge case (e.g. one broken sender): use exceptions.ts
//   - All amounts stored in smallest unit (paise for INR, cents for USD)
// ─────────────────────────────────────────────────────────

import { FieldExtractor } from './types'

// ── Currency symbol → ISO 4217 ──────────────────────────
const CURRENCY_MAP: Record<string, string> = {
  '₹': 'INR', 'Rs': 'INR', 'INR': 'INR',
  '$':  'USD', 'USD': 'USD',
  '€':  'EUR', 'EUR': 'EUR',
  '£':  'GBP', 'GBP': 'GBP',
  'SGD': 'SGD', 'AED': 'AED', 'JPY': 'JPY',
  'AUD': 'AUD', 'CAD': 'CAD', 'CHF': 'CHF',
  'MYR': 'MYR', 'THB': 'THB', 'HKD': 'HKD',
}

// ── Amount helpers ───────────────────────────────────────
const toPaise = (s: string) => Math.round(parseFloat(s.replace(/,/g, '')) * 100)

// ── Date helpers ─────────────────────────────────────────
const MONTH: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}
function isoDate(d: string, m: string, y: string): string {
  const dd = d.padStart(2, '0')
  const mm = MONTH[m.toLowerCase().slice(0, 3)] ?? m.padStart(2, '0')
  const yy = y.length === 2 ? `20${y}` : y
  return `${yy}-${mm}-${dd}`
}

// ── Merchant helpers ─────────────────────────────────────
// Words that appear near merchant position but are NOT the merchant
const MERCHANT_STOP = new Set([
  'upi','ref','no','on','at','for','to','via','the','a','an','your','this',
  'is','has','been','bank','account','card','linked','mobile','app',
  'transaction','txn','payment','transfer','neft','rtgs','imps','mandate',
  'towards','info','alert','update','service','charge','fee','emi',
])
function cleanMerchant(raw: string): string | null {
  // Strip "Upi-" prefix (BOB/BOBCARD format: "Upi-meesho", "Upi-rashi Eco Tourism")
  raw = raw.replace(/^Upi-/i, '')
  const cleaned = raw.trim().replace(/\s+/g, ' ').replace(/[.,:;!]+$/, '')
  if (cleaned.length < 2) return null
  if (MERCHANT_STOP.has(cleaned.toLowerCase())) return null
  // Reject currency amounts mistakenly captured as merchant
  if (/^(?:Rs\.?|INR|₹|\$|€|£)[\d,.]/.test(cleaned)) return null
  // Reject strings that are mostly digits
  if (/^\d/.test(cleaned)) return null
  return cleaned
}

// ─────────────────────────────────────────────────────────
// AMOUNT
// Covers: prefixed symbol, suffixed symbol, keyword-only (no symbol),
//         "for Rs X", labelled formats
// ─────────────────────────────────────────────────────────
export const AMOUNT: FieldExtractor[] = [
  {
    id: 'amt_symbol_prefix',
    field: 'amount', priority: 1,
    pattern: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => toPaise(m[1]),
    confidence: 'HIGH',
    note: 'Rs.5,000 / ₹500.00 / INR 1234',
  },
  {
    id: 'amt_symbol_suffix',
    field: 'amount', priority: 2,
    pattern: /([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|₹)/i,
    transform: m => toPaise(m[1]),
    confidence: 'HIGH',
    note: '1234.00 INR — symbol after amount',
  },
  {
    id: 'amt_usd_prefix',
    field: 'amount', priority: 3,
    pattern: /(?:\$|USD)\s*([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => toPaise(m[1]),
    confidence: 'HIGH',
  },
  {
    id: 'amt_eur_prefix',
    field: 'amount', priority: 4,
    pattern: /(?:€|EUR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => toPaise(m[1]),
    confidence: 'HIGH',
  },
  {
    id: 'amt_for_keyword',
    field: 'amount', priority: 5,
    pattern: /\bfor\s+(?:Rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => toPaise(m[1]),
    confidence: 'MEDIUM',
    note: '"for 250" or "for Rs. 250" — no symbol required',
  },
  {
    id: 'amt_action_by',
    field: 'amount', priority: 6,
    // "debited by 130" / "credited with 5000" — no currency symbol at all
    pattern: /(?:debited|credited|spent|received)\s+(?:by|of|with|for)\s+([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => toPaise(m[1]),
    confidence: 'MEDIUM',
    note: 'Some banks omit currency symbol entirely',
  },
  {
    id: 'amt_amount_label',
    field: 'amount', priority: 7,
    pattern: /\bAmount\s*:?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => toPaise(m[1]),
    confidence: 'MEDIUM',
    note: '"Amount: 750" labelled format',
  },
]

// ─────────────────────────────────────────────────────────
// CURRENCY
// ─────────────────────────────────────────────────────────
export const CURRENCY: FieldExtractor[] = [
  {
    id: 'cur_iso_code',
    field: 'currency', priority: 1,
    pattern: /\b(INR|USD|EUR|GBP|SGD|AED|JPY|AUD|CAD|CHF|MYR|THB|HKD)\b/,
    transform: m => m[1].toUpperCase(),
    confidence: 'HIGH',
    note: 'Explicit ISO 4217 code in body',
  },
  {
    id: 'cur_rupee_symbol',
    field: 'currency', priority: 2,
    pattern: /(?:₹|Rs\.?)/,
    transform: () => 'INR',
    confidence: 'HIGH',
  },
  {
    id: 'cur_dollar_symbol',
    field: 'currency', priority: 3,
    pattern: /\$/,
    transform: () => 'USD',
    confidence: 'MEDIUM',
    note: 'Could also be SGD/CAD — ISO code preferred',
  },
  {
    id: 'cur_default_inr',
    field: 'currency', priority: 99,
    pattern: /\d/,    // always matches — pure fallback
    transform: () => 'INR',
    confidence: 'LOW',
    note: 'Default fallback: assume INR if no currency signal',
  },
]

// ─────────────────────────────────────────────────────────
// ACCOUNT NUMBER  (always masked by the bank in the SMS)
// ─────────────────────────────────────────────────────────
export const ACCOUNT: FieldExtractor[] = [
  {
    id: 'acc_acslash_masked',
    field: 'account', priority: 1,
    // "A/C XXXX1234" / "A/C XX9803"
    pattern: /A\/C\s+(?:[Xx*]+|XX+)(\d{3,4})/,
    transform: m => `XXXX${m[1]}`,
    confidence: 'HIGH',
    note: 'A/C XXXX1234 — most common Indian bank format',
  },
  {
    id: 'acc_account_label',
    field: 'account', priority: 2,
    // "account XXXX1234" / "Acct XX9803"
    pattern: /\bAcct?\.?\s+(?:[Xx*]+)(\d{3,4})/i,
    transform: m => `XXXX${m[1]}`,
    confidence: 'HIGH',
  },
  {
    id: 'acc_card_ending',
    field: 'account', priority: 3,
    // "card ending 1234" / "Card XX0480" / "card no. 1234"
    pattern: /\bcard\s+(?:ending|no\.?|number|XX)?\s*(?:[Xx*]+)?(\d{4})\b/i,
    transform: m => `XXXX${m[1]}`,
    confidence: 'HIGH',
  },
  {
    id: 'acc_inline_masked',
    field: 'account', priority: 4,
    // Bank already masked it: "XXXX1234" or "XX9803" or "***1234"
    pattern: /(?:XX+|xx+|\*{2,})(\d{3,4})\b/,
    transform: m => `XXXX${m[1]}`,
    confidence: 'MEDIUM',
    note: 'Masked number already in SMS body',
  },
  {
    id: 'acc_ending_bare',
    field: 'account', priority: 2,
    // "Credit Card ending 5212" / "BOBCARD ending 0971" — no XX prefix
    pattern: /(?:card|BOBCARD)\s+ending\s+(\d{4})\b/i,
    transform: (m: RegExpMatchArray) => `XXXX${m[1]}`,
    confidence: 'HIGH',
    note: 'SBI/BOBCARD: "ending 4-digits" without XX prefix',
  },
  {
    id: 'acc_from_last4',
    field: 'account', priority: 5,
    // "from account ending 9803" / "from X9803" — single letter prefix
    pattern: /\bfrom\s+[A-Za-z]?(\d{4})\b/i,
    transform: m => `XXXX${m[1]}`,
    confidence: 'MEDIUM',
  },
]

// ─────────────────────────────────────────────────────────
// ACTION  (debit/credit/refund/reversal)
// Refund checked FIRST — it is more specific than debit/credit
// ─────────────────────────────────────────────────────────
export const ACTION: FieldExtractor[] = [
  {
    id: 'act_refund',
    field: 'action', priority: 1,
    pattern: /\b(refund(?:ed)?|reversal|reversed|cashback)\b/i,
    transform: m => {
      const v = m[1].toLowerCase()
      return v.includes('fund') || v.includes('back') ? 'refund' : 'reversal'
    },
    confidence: 'HIGH',
    note: 'Refund/reversal before debit — prevents misclassification',
  },
  {
    id: 'act_debit',
    field: 'action', priority: 2,
    pattern: /\b(debit(?:ed)?|spent|paid|withdrawn|purchase[d]?|charged|debited)\b/i,
    transform: () => 'debit',
    confidence: 'HIGH',
  },
  {
    id: 'act_credit',
    field: 'action', priority: 3,
    pattern: /\b(credit(?:ed)?|received|deposited|added)\b/i,
    transform: () => 'credit',
    confidence: 'HIGH',
  },
  {
    id: 'act_sent_to',
    field: 'action', priority: 4,
    pattern: /\bsent\s+(?:to|via)\b/i,
    transform: () => 'debit',
    confidence: 'MEDIUM',
    note: '"sent to X" implies outgoing = debit',
  },
  {
    id: 'act_trf_to',
    field: 'action', priority: 5,
    pattern: /\btrf\s+to\b/i,
    transform: () => 'debit',
    confidence: 'MEDIUM',
    note: '"trf to X" UPI shorthand',
  },
]

// ─────────────────────────────────────────────────────────
// REFERENCE NUMBER  (Ref / RRN / UPI Ref / Txn ID / IMPS)
// ─────────────────────────────────────────────────────────
export const REFERENCE: FieldExtractor[] = [
  {
    id: 'ref_upi_ref_no',
    field: 'reference', priority: 1,
    pattern: /UPI\s*Ref\.?\s*(?:No\.?)?\s*:?\s*(\d{8,})/i,
    transform: m => m[1],
    confidence: 'HIGH',
  },
  {
    id: 'ref_rrn',
    field: 'reference', priority: 2,
    pattern: /\bRRN\s*:?\s*(\d{8,})/i,
    transform: m => m[1],
    confidence: 'HIGH',
  },
  {
    id: 'ref_txn_id',
    field: 'reference', priority: 3,
    pattern: /(?:Txn\.?\s*ID|Txn\.?\s*No\.?|Transaction\s*(?:ID|No\.?))\s*:?\s*([A-Z0-9]{6,})/i,
    transform: m => m[1],
    confidence: 'HIGH',
  },
  {
    id: 'ref_imps_neft',
    field: 'reference', priority: 4,
    pattern: /(?:IMPS|NEFT|RTGS)\s*(?:Ref\.?|No\.?)?\s*:?\s*(\d{8,})/i,
    transform: m => m[1],
    confidence: 'HIGH',
  },
  {
    id: 'ref_generic_colon',
    field: 'reference', priority: 5,
    pattern: /\bRef(?:erence)?\.?\s*(?:No\.?)?\s*:?\s*([A-Z0-9]{6,})/i,
    transform: m => m[1],
    confidence: 'MEDIUM',
  },
]

// ─────────────────────────────────────────────────────────
// DATE  (normalised to ISO 8601 YYYY-MM-DD)
// ─────────────────────────────────────────────────────────
export const DATE: FieldExtractor[] = [
  {
    id: 'date_dd_mon_yy',
    field: 'date', priority: 1,
    pattern: /(\d{1,2})[-\/\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\/\s](\d{2,4})/i,
    transform: m => isoDate(m[1], m[2], m[3]),
    confidence: 'HIGH',
    note: '"28-Mar-26" / "28 Mar 2026"',
  },
  {
    id: 'date_no_sep',
    field: 'date', priority: 2,
    // "28Mar26" / "25Mar26" — no separator, used in SBI UPI SMS
    pattern: /(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d{2,4})(?!\d)/i,
    transform: (m: RegExpMatchArray) => isoDate(m[1], m[2], m[3]),
    confidence: 'HIGH',
    note: 'SBI UPI: "on date 28Mar26" — no separator between day/month/year',
  },
  {
    id: 'date_dd_mm_yyyy_slash',
    field: 'date', priority: 2,
    pattern: /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
    transform: m => isoDate(m[1], m[2], m[3]),
    confidence: 'HIGH',
    note: '"28/03/2026"',
  },
  {
    id: 'date_yyyy_mm_dd',
    field: 'date', priority: 3,
    pattern: /(\d{4})-(\d{2})-(\d{2})/,
    transform: m => `${m[1]}-${m[2]}-${m[3]}`,
    confidence: 'HIGH',
    note: 'ISO format already present',
  },
  {
    id: 'date_on_dd_mon',
    field: 'date', priority: 4,
    pattern: /\bon\s+(\d{1,2})[-\/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\/](\d{2,4})/i,
    transform: m => isoDate(m[1], m[2], m[3]),
    confidence: 'HIGH',
    note: '"on 28-Mar-26" — keyword anchored',
  },
  {
    id: 'date_today',
    field: 'date', priority: 5,
    pattern: /\btoday\b/i,
    transform: () => new Date().toISOString().slice(0, 10),
    confidence: 'MEDIUM',
  },
]

// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// MERCHANT
// Strategy: anchor words → capture tokens → stop-word filter
// No brand names hardcoded. Works for any merchant globally.
// ─────────────────────────────────────────────────────────────
export const MERCHANT: FieldExtractor[] = [
  {
    id: 'mer_pipe_to',
    field: 'merchant', priority: 1,
    pattern: /\|?\s*To:\s*([A-Z][A-Z0-9 &\-'.]{2,50}?)\s*(?:\||$)/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'HIGH',
    note: 'Pipe-delimited "To: MERCHANT |" labelled format',
  },
  {
    id: 'mer_vpa_username',
    field: 'merchant', priority: 2,
    pattern: /(?:to|at|towards)\s+([a-zA-Z0-9._\-]+)@[a-zA-Z0-9.]+/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1].split('.')[0]),
    confidence: 'HIGH',
    note: 'VPA handle — username before @ is the merchant/payee',
  },
  {
    id: 'mer_to_boundary',
    field: 'merchant', priority: 3,
    pattern: /\bto\s+([A-Z][A-Za-z0-9 &\-'.]{2,50}?)(?=\s+(?:UPI|Ref|on|via|using|\d))/,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'HIGH',
    note: 'Anchor: "to X" — boundary at keyword or digit',
  },
  {
    id: 'mer_at_boundary',
    field: 'merchant', priority: 4,
    pattern: /\bat\s+([A-Z][A-Za-z0-9 &\-'.]{2,50}?)(?=\s+(?:on|Ref|UPI|\d|$))/,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'HIGH',
    note: 'Anchor: "at X" — card swipe / POS purchase',
  },
  {
    id: 'mer_paid_to',
    field: 'merchant', priority: 5,
    pattern: /\b(?:paid|payment)\s+to\s+([A-Z][A-Z0-9 &\-'.]{2,50}?)(?=\s+(?:via|Ref|on|UPI|\.|,|$))/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'HIGH',
  },
  {
    id: 'mer_merchant_label',
    field: 'merchant', priority: 6,
    pattern: /merchant\s*:?\s*([A-Z][A-Z0-9 &\-'.]{2,50})/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'HIGH',
    note: 'Explicit "merchant:" label',
  },
  {
    id: 'mer_trf_to',
    field: 'merchant', priority: 7,
    pattern: /\btrf\s+to\s+([A-Z][A-Z0-9 &\-'.]{2,50}?)(?=\s+(?:Ref|UPI|\d|$))/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'MEDIUM',
    note: '"trf to X" UPI debit shorthand',
  },
  {
    id: 'mer_by_sender',
    field: 'merchant', priority: 8,
    pattern: /\bby\s+([A-Z][A-Za-z0-9 &\-'.]{2,40}?)\s+on\s+/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'MEDIUM',
    note: '"refunded by Zomato on ..." — merchant after by, before on',
  },
  {
    id: 'mer_sent_to',
    field: 'merchant', priority: 9,
    pattern: /\bsent\s+to\s+([A-Z][A-Z0-9 &\-'.]{2,50}?)(?=\s+(?:on|Ref|UPI|\.|,|$))/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'MEDIUM',
  },
  {
    id: 'mer_towards',
    field: 'merchant', priority: 10,
    pattern: /\btowards\s+([A-Z][A-Z0-9 &\-'.]{2,50}?)(?=\s+(?:on|Ref|for|\.|,|$))/i,
    transform: (m: RegExpMatchArray) => cleanMerchant(m[1]),
    confidence: 'MEDIUM',
  },
]

// USER NAME  (salutation-based only — no name lists)
// ─────────────────────────────────────────────────────────
export const USER_NAME: FieldExtractor[] = [
  {
    id: 'usr_dear',
    field: 'user_name', priority: 1,
    pattern: /\bDear\s+([A-Za-z][A-Za-z\s]{1,30}?)(?=[,.]|\s+[A-Z])/i,
    transform: m => m[1].trim(),
    confidence: 'HIGH',
    note: '"Dear Utkarsh," — most common Indian bank greeting',
  },
  {
    id: 'usr_hi_hello',
    field: 'user_name', priority: 2,
    pattern: /\b(?:Hi|Hello)\s+([A-Za-z][A-Za-z]{1,20})[,!]/i,
    transform: m => m[1],
    confidence: 'HIGH',
  },
  {
    id: 'usr_generic_placeholder',
    field: 'user_name', priority: 99,
    pattern: /\b(USER|CUSTOMER|A\/C\s+HOLDER)\b/i,
    transform: () => 'USER',
    confidence: 'LOW',
    note: 'Generic placeholder — not a real name',
  },
]

// ─────────────────────────────────────────────────────────
// BALANCE  (available balance after transaction)
// ─────────────────────────────────────────────────────────
export const BALANCE: FieldExtractor[] = [
  {
    id: 'bal_avl_bal',
    field: 'balance', priority: 1,
    pattern: /(?:Avl\.?\s*Bal(?:ance)?|Available\s+Balance)[:\s]*(?:is\s*)?(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => Math.round(parseFloat(m[1].replace(/,/g, '')) * 100),
    confidence: 'HIGH',
    note: '"Avl Bal: Rs.12,345.67"',
  },
  {
    id: 'bal_balance_is',
    field: 'balance', priority: 2,
    pattern: /[Bb]alance\s+(?:is\s+)?(?:now\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => Math.round(parseFloat(m[1].replace(/,/g, '')) * 100),
    confidence: 'MEDIUM',
  },
  {
    id: 'bal_label_colon',
    field: 'balance', priority: 3,
    pattern: /[Bb]alance\s*:\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    transform: m => Math.round(parseFloat(m[1].replace(/,/g, '')) * 100),
    confidence: 'MEDIUM',
  },
]

// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// BANK NAME
// Body-first: bank names itself in ~95% of SMS messages.
// Generic fallback catches "X Bank" patterns not listed here.
// To add a bank: one line, pattern matches the name in the body.
// ─────────────────────────────────────────────────────────────
export const BANK_NAME: FieldExtractor[] = [
  // ── India ────────────────────────────────────────────────
  { id: 'bank_hdfc',        field: 'bank_name', priority: 1, pattern: /HDFC\s*Bank/i,                       transform: () => 'HDFC Bank',             confidence: 'HIGH' },
  { id: 'bank_sbi',         field: 'bank_name', priority: 1, pattern: /State\s*Bank\s*(?:of\s*India)?/i,    transform: () => 'State Bank of India',   confidence: 'HIGH' },
  { id: 'bank_sbi_short',   field: 'bank_name', priority: 2, pattern: /\bSBI\b/,                            transform: () => 'State Bank of India',   confidence: 'MEDIUM' },
  { id: 'bank_icici',       field: 'bank_name', priority: 1, pattern: /ICICI\s*Bank/i,                      transform: () => 'ICICI Bank',            confidence: 'HIGH' },
  { id: 'bank_axis',        field: 'bank_name', priority: 1, pattern: /Axis\s*Bank/i,                       transform: () => 'Axis Bank',             confidence: 'HIGH' },
  { id: 'bank_kotak',       field: 'bank_name', priority: 1, pattern: /Kotak\s*(?:Mahindra\s*)?Bank/i,      transform: () => 'Kotak Mahindra Bank',   confidence: 'HIGH' },
  { id: 'bank_bob',         field: 'bank_name', priority: 1, pattern: /Bank\s*of\s*Baroda/i,                transform: () => 'Bank of Baroda',        confidence: 'HIGH' },
  { id: 'bank_pnb',         field: 'bank_name', priority: 1, pattern: /Punjab\s*National\s*Bank/i,          transform: () => 'Punjab National Bank',  confidence: 'HIGH' },
  { id: 'bank_canara',      field: 'bank_name', priority: 1, pattern: /Canara\s*Bank/i,                     transform: () => 'Canara Bank',           confidence: 'HIGH' },
  { id: 'bank_yes',         field: 'bank_name', priority: 1, pattern: /Yes\s*Bank/i,                        transform: () => 'Yes Bank',              confidence: 'HIGH' },
  { id: 'bank_idfc',        field: 'bank_name', priority: 1, pattern: /IDFC\s*(?:First\s*)?Bank/i,          transform: () => 'IDFC First Bank',       confidence: 'HIGH' },
  { id: 'bank_indusind',    field: 'bank_name', priority: 1, pattern: /IndusInd\s*Bank/i,                   transform: () => 'IndusInd Bank',         confidence: 'HIGH' },
  { id: 'bank_rbl',         field: 'bank_name', priority: 1, pattern: /RBL\s*Bank/i,                        transform: () => 'RBL Bank',              confidence: 'HIGH' },
  { id: 'bank_federal',     field: 'bank_name', priority: 1, pattern: /Federal\s*Bank/i,                    transform: () => 'Federal Bank',          confidence: 'HIGH' },
  { id: 'bank_uco',         field: 'bank_name', priority: 1, pattern: /UCO\s*Bank/i,                        transform: () => 'UCO Bank',              confidence: 'HIGH' },
  { id: 'bank_iob',         field: 'bank_name', priority: 1, pattern: /Indian\s*Overseas\s*Bank/i,          transform: () => 'Indian Overseas Bank',  confidence: 'HIGH' },
  { id: 'bank_paytm',       field: 'bank_name', priority: 1, pattern: /Paytm\s*(?:Payments\s*)?Bank/i,      transform: () => 'Paytm Payments Bank',   confidence: 'HIGH' },
  { id: 'bank_airtel',      field: 'bank_name', priority: 1, pattern: /Airtel\s*(?:Payments\s*)?Bank/i,     transform: () => 'Airtel Payments Bank',  confidence: 'HIGH' },
  // ── USA ──────────────────────────────────────────────────
  { id: 'bank_chase',       field: 'bank_name', priority: 1, pattern: /\bChase\b/i,                         transform: () => 'Chase',                 confidence: 'HIGH' },
  { id: 'bank_bofa',        field: 'bank_name', priority: 1, pattern: /Bank\s*of\s*America/i,               transform: () => 'Bank of America',       confidence: 'HIGH' },
  { id: 'bank_wells',       field: 'bank_name', priority: 1, pattern: /Wells\s*Fargo/i,                     transform: () => 'Wells Fargo',           confidence: 'HIGH' },
  { id: 'bank_citi',        field: 'bank_name', priority: 1, pattern: /\bCiti(?:bank)?\b/i,                 transform: () => 'Citibank',              confidence: 'HIGH' },
  { id: 'bank_capital_one', field: 'bank_name', priority: 1, pattern: /Capital\s*One/i,                     transform: () => 'Capital One',           confidence: 'HIGH' },
  { id: 'bank_amex',        field: 'bank_name', priority: 1, pattern: /American\s*Express|\bAmex\b/i,       transform: () => 'American Express',      confidence: 'HIGH' },
  // ── UK ───────────────────────────────────────────────────
  { id: 'bank_barclays',    field: 'bank_name', priority: 1, pattern: /Barclays/i,                          transform: () => 'Barclays',              confidence: 'HIGH' },
  { id: 'bank_hsbc',        field: 'bank_name', priority: 1, pattern: /\bHSBC\b/,                           transform: () => 'HSBC',                  confidence: 'HIGH' },
  { id: 'bank_lloyds',      field: 'bank_name', priority: 1, pattern: /Lloyds\s*(?:Bank)?/i,                transform: () => 'Lloyds Bank',           confidence: 'HIGH' },
  { id: 'bank_natwest',     field: 'bank_name', priority: 1, pattern: /NatWest/i,                           transform: () => 'NatWest',               confidence: 'HIGH' },
  { id: 'bank_monzo',       field: 'bank_name', priority: 1, pattern: /\bMonzo\b/i,                         transform: () => 'Monzo',                 confidence: 'HIGH' },
  { id: 'bank_starling',    field: 'bank_name', priority: 1, pattern: /Starling\s*(?:Bank)?/i,              transform: () => 'Starling Bank',         confidence: 'HIGH' },
  // ── Europe ───────────────────────────────────────────────
  { id: 'bank_n26',         field: 'bank_name', priority: 1, pattern: /\bN26\b/,                            transform: () => 'N26',                   confidence: 'HIGH' },
  { id: 'bank_revolut',     field: 'bank_name', priority: 1, pattern: /Revolut/i,                           transform: () => 'Revolut',               confidence: 'HIGH' },
  { id: 'bank_bnp',         field: 'bank_name', priority: 1, pattern: /BNP\s*Paribas/i,                     transform: () => 'BNP Paribas',           confidence: 'HIGH' },
  { id: 'bank_deutsche',    field: 'bank_name', priority: 1, pattern: /Deutsche\s*Bank/i,                   transform: () => 'Deutsche Bank',         confidence: 'HIGH' },
  { id: 'bank_ing',         field: 'bank_name', priority: 1, pattern: /\bING\s*Bank/i,                      transform: () => 'ING Bank',              confidence: 'HIGH' },
  // ── UAE ──────────────────────────────────────────────────
  { id: 'bank_enbd',        field: 'bank_name', priority: 1, pattern: /Emirates\s*NBD/i,                    transform: () => 'Emirates NBD',          confidence: 'HIGH' },
  { id: 'bank_adcb',        field: 'bank_name', priority: 1, pattern: /\bADCB\b/,                           transform: () => 'ADCB',                  confidence: 'HIGH' },
  { id: 'bank_fab',         field: 'bank_name', priority: 1, pattern: /First\s*Abu\s*Dhabi\s*Bank|\bFAB\b/, transform: () => 'First Abu Dhabi Bank',  confidence: 'HIGH' },
  { id: 'bank_mashreq',     field: 'bank_name', priority: 1, pattern: /Mashreq\s*(?:Bank)?/i,               transform: () => 'Mashreq Bank',          confidence: 'HIGH' },
  // ── Singapore ────────────────────────────────────────────
  { id: 'bank_dbs',         field: 'bank_name', priority: 1, pattern: /\bDBS\s*(?:Bank)?/i,                 transform: () => 'DBS Bank',              confidence: 'HIGH' },
  { id: 'bank_ocbc',        field: 'bank_name', priority: 1, pattern: /\bOCBC\s*(?:Bank)?/i,                transform: () => 'OCBC Bank',             confidence: 'HIGH' },
  { id: 'bank_uob',         field: 'bank_name', priority: 1, pattern: /\bUOB\b/,                            transform: () => 'UOB',                   confidence: 'HIGH' },
  // ── Australia ────────────────────────────────────────────
  { id: 'bank_commbank',    field: 'bank_name', priority: 1, pattern: /Commonwealth\s*Bank|CommBank/i,      transform: () => 'Commonwealth Bank',     confidence: 'HIGH' },
  { id: 'bank_anz',         field: 'bank_name', priority: 1, pattern: /\bANZ\b/,                            transform: () => 'ANZ',                   confidence: 'HIGH' },
  { id: 'bank_westpac',     field: 'bank_name', priority: 1, pattern: /Westpac/i,                           transform: () => 'Westpac',               confidence: 'HIGH' },
  { id: 'bank_nab',         field: 'bank_name', priority: 1, pattern: /\bNAB\b/,                            transform: () => 'NAB',                   confidence: 'HIGH' },
  // ── Southeast Asia ───────────────────────────────────────
  { id: 'bank_gcash',       field: 'bank_name', priority: 1, pattern: /GCash/i,                             transform: () => 'GCash',                 confidence: 'HIGH' },
  { id: 'bank_gopay',       field: 'bank_name', priority: 1, pattern: /GoPay/i,                             transform: () => 'GoPay',                 confidence: 'HIGH' },
  { id: 'bank_bdo',         field: 'bank_name', priority: 1, pattern: /\bBDO\b/,                            transform: () => 'BDO',                   confidence: 'HIGH' },
  { id: 'bank_bpi',         field: 'bank_name', priority: 1, pattern: /\bBPI\b/,                            transform: () => 'BPI',                   confidence: 'HIGH' },
  { id: 'bank_bca',         field: 'bank_name', priority: 1, pattern: /\bBCA\b/,                            transform: () => 'BCA',                   confidence: 'HIGH' },
  { id: 'bank_mandiri',     field: 'bank_name', priority: 1, pattern: /Bank\s*Mandiri/i,                    transform: () => 'Bank Mandiri',          confidence: 'HIGH' },
  { id: 'bank_maybank',     field: 'bank_name', priority: 1, pattern: /Maybank/i,                           transform: () => 'Maybank',               confidence: 'HIGH' },
  // ── Generic fallback: "X Bank" in body ───────────────────
  {
    id: 'bank_generic_body',
    field: 'bank_name', priority: 50,
    pattern: /([A-Z][A-Za-z\s]{2,30}?\s*Bank)\b/,
    transform: (m: RegExpMatchArray) => m[1].trim(),
    confidence: 'LOW',
    note: 'Catches unrecognised "X Bank" patterns. Low confidence — verify.',
  },
]

// MASTER LIST — engine iterates this
// To add a new field extractor: add it to the right array above
// and it will be picked up automatically here.
// ─────────────────────────────────────────────────────────
export const ALL_EXTRACTORS: FieldExtractor[] = [
  ...AMOUNT,
  ...CURRENCY,
  ...ACCOUNT,
  ...ACTION,
  ...REFERENCE,
  ...DATE,
  ...MERCHANT,
  ...USER_NAME,
  ...BALANCE,
  ...BANK_NAME,
]
