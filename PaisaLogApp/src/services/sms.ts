// src/services/sms.ts
// SMS ingestion pipeline.
// Reads incoming bank SMS via native bridge, parses, sends to backend.
// OTPs are never forwarded — filtered at the Java layer and again here.

import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import { Transactions, storage } from './api';

const { SmsModule } = NativeModules;
// DEBUG — log what native modules are available
// DEBUG removed
const sms_emitter = SmsModule ? new NativeEventEmitter(SmsModule) : null;

// ── Permission request ────────────────────────────────────────
export async function request_sms_permission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const read = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'SMS Access',
        message: 'PaisaLog reads bank transaction alerts to track your spending automatically. OTPs are never read.',
        buttonPositive: 'Allow',
        buttonNegative: 'Skip',
      }
    );
    const receive = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      {
        title: 'Receive SMS',
        message: 'Required to detect new transactions in real time.',
        buttonPositive: 'Allow',
        buttonNegative: 'Skip',
      }
    );
    return (
      read === PermissionsAndroid.RESULTS.GRANTED &&
      receive === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (e) {
    console.error('SMS permission error:', e);
    return false;
  }
}

export async function check_sms_permission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !SmsModule) return false;
  const read = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  const receive = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
  return read && receive;
}

// ── Parse a single SMS body ───────────────────────────────────
// Returns null if not a financial SMS or is an OTP.
export interface parsed_sms {
  amount:  number;
  txn_type:      'debit' | 'credit';
  merchant:      string | null;
  acct_suffix:   string | null;
  sender:        string;
  body:          string;
  // Foreign currency
  original_currency: string | null;  // detected currency code e.g. 'AED', 'USD'
  original_amount:   number | null;  // amount in original currency smallest unit
  // Payment method
  payment_method: 'upi' | 'card' | 'netbanking' | 'emi' | 'cash' | 'wallet' | null;
  // Balance
  available_balance: number | null;  // in paise, null if not present in SMS
  // Refund tracking
  is_refund:     boolean;
  refund_type:   'refund' | 'reversal' | 'cashback' | null;
  rrn:           string | null;   // Retrieval Reference Number — 12 digits, PG-generated
  arn:           string | null;   // Acquirer Reference Number — 23 digits, bank-generated
  reference_no:  string | null;   // Generic fallback
}

export function parse_sms(sender: string, body: string): parsed_sms | null {
  const upper = body.toUpperCase();

  // Hard reject OTPs
  if (upper.includes('OTP') || upper.includes('ONE TIME') || upper.includes('PASSWORD')) return null;
  if (body.length < 20) return null;

  // Amount extraction — match Rs/INR/₹ followed by number
  const amt_match = body.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amt_match) return null;
  const amount_rupees = parseFloat(amt_match[1].replace(/,/g, ''));
  if (!amount_rupees || amount_rupees <= 0) return null;
  const amount = Math.round(amount_rupees * 100);

  // Txn type
  const is_debit = /debited|deducted|spent|paid|withdrawn/i.test(body);
  const is_credit = /credited|received|deposited/i.test(body);
  if (!is_debit && !is_credit) return null;
  const txn_type: 'debit' | 'credit' = is_debit ? 'debit' : 'credit';

  // Merchant — look for "at MERCHANT" or "to MERCHANT"
  const merchant_match = body.match(/(?:at|to|from)\s+([A-Za-z0-9 ]{2,30}?)(?:\s+on|\s+via|\s+ref|\.|$)/i);
  let merchant = merchant_match ? merchant_match[1].trim() : null;

  // Account suffix — XX1234 or ending 1234
  const acct_match = body.match(/(?:XX|x{2}|ending\s)(\d{4})/i);
  let acct_suffix = acct_match ? acct_match[1] : null;

  // ── Foreign currency detection ──────────────────────────
  // Detect non-INR currency symbols and codes in SMS
  const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
    [/USD\s*([\d,]+(?:\.\d{1,2})?)/i,       'USD'],
    [/US\$\s*([\d,]+(?:\.\d{1,2})?)/i,       'USD'],
    [/\$\s*([\d,]+(?:\.\d{1,2})?)/i,         'USD'],
    [/AED\s*([\d,]+(?:\.\d{1,2})?)/i,        'AED'],
    [/EUR\s*([\d,]+(?:\.\d{1,2})?)/i,        'EUR'],
    [/€\s*([\d,]+(?:\.\d{1,2})?)/i,          'EUR'],
    [/GBP\s*([\d,]+(?:\.\d{1,2})?)/i,        'GBP'],
    [/£\s*([\d,]+(?:\.\d{1,2})?)/i,          'GBP'],
    [/SGD\s*([\d,]+(?:\.\d{1,2})?)/i,        'SGD'],
    [/AUD\s*([\d,]+(?:\.\d{1,2})?)/i,        'AUD'],
    [/JPY\s*([\d,]+(?:\.\d{1,2})?)/i,        'JPY'],
    [/¥\s*([\d,]+(?:\.\d{1,2})?)/i,          'JPY'],
    [/CAD\s*([\d,]+(?:\.\d{1,2})?)/i,        'CAD'],
    [/SAR\s*([\d,]+(?:\.\d{1,2})?)/i,        'SAR'],
    [/QAR\s*([\d,]+(?:\.\d{1,2})?)/i,        'QAR'],
    [/MYR\s*([\d,]+(?:\.\d{1,2})?)/i,        'MYR'],
    [/KWD\s*([\d,]+(?:\.\d{1,2})?)/i,        'KWD'],
  ];

  let original_currency: string | null = null;
  let original_amount: number | null = null;

  for (const [pattern, code] of CURRENCY_PATTERNS) {
    const m = body.match(pattern);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val > 0) {
        original_currency = code;
        // Store in smallest unit (multiply by 100 for most, 1 for JPY, 1000 for KWD)
        const divisors: Record<string, number> = { JPY: 1, KWD: 1000 };
        original_amount = Math.round(val * (divisors[code] ?? 100));
        break;
      }
    }
  }

  // ── UPI/generic debit amount fallback ────────────────────────
  if (!amount) {
    const m2 = body.match(/debited(?:\s+by|\s+with)?\s+(?:Rs\.?|INR|\u20b9)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m2) amount = Math.round(parseFloat(m2[1].replace(/,/g,'')) * 100);
  }
  // ── Account suffix from UPI format ───────────────────────────
  if (!acct_suffix) {
    const m3 = body.match(/(?:A\/C\s+X+|Acct\s+X+|a\/c\s+no\.?\s+X+)(\d{3,6})/i);
    if (m3) acct_suffix = m3[1].slice(-4);
  }
  // ── Merchant from trf to / paid to format ────────────────────
  if (!merchant) {
    const m4 = body.match(/(?:trf\s+to|transfer\s+to|paid\s+to)\s+([A-Za-z][A-Za-z\s]{2,25}?)(?:\s*[,.]|Ref|$)/i);
    if (m4) merchant = m4[1].trim();
  }

  // ── Refund / reversal / cashback detection ──────────────
  const is_refund    = /refund|reversal|reversed|cashback|cash back|money back/i.test(body);
  const refund_type  = /cashback|cash back/i.test(body) ? 'cashback'
                     : /reversal|reversed/i.test(body)  ? 'reversal'
                     : is_refund                         ? 'refund'
                     : null;

  // RRN — 12-digit Retrieval Reference Number, PG-generated at auth/initiation
  // Common patterns: "RRN 123456789012", "Ref No 123456789012", "UPI Ref 123456789012"
  const rrn_match = body.match(
    /(?:RRN|Ref(?:erence)?(?:\s+No\.?)?|UPI\s+Ref(?:\s+No\.?)?)[:\s]+(\d{12})/i
  ) || body.match(/(\d{12})/);
  const rrn = rrn_match ? rrn_match[1] : null;

  // ARN — 23-digit Acquirer Reference Number, bank-generated at refund/capture
  // Typically starts with a letter+digits pattern or pure 23-digit string
  const arn_match = body.match(
    /(?:ARN|Acquirer\s+Ref(?:erence)?)[:\s]+([A-Z0-9]{23})/i
  ) || body.match(/([A-Z]{2}\d{21})/i);
  const arn = arn_match ? arn_match[1].toUpperCase() : null;

  // Generic reference — catch-all for other ref numbers
  const ref_match = body.match(/(?:Ref(?:erence)?(?:\s+No\.?)?|Transaction\s+ID)[:\s]+([A-Z0-9]{8,20})/i);
  const reference_no = (!rrn && !arn && ref_match) ? ref_match[1] : null;

  // Detect payment method
  const payment_method =
    /upi|vpa|gpay|phonepe|paytm/i.test(body)      ? 'upi'
    : /emi/i.test(body)                             ? 'emi'
    : /netbanking|net.banking|neft|rtgs|imps/i.test(body) ? 'netbanking'
    : /wallet/i.test(body)                          ? 'wallet'
    : /atm|cash/i.test(body)                        ? 'cash'
    : /card|credit|debit/i.test(body)               ? 'card'
    : null;

  // Available balance
  const bal_match = body.match(/(?:Avl\.?\s*Bal(?:ance)?|Available\s+Balance)[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const available_balance = bal_match
    ? Math.round(parseFloat(bal_match[1].replace(/,/g, '')) * 100)
    : null;

  return { amount, txn_type, merchant, acct_suffix, sender, body,
           original_currency, original_amount,
           payment_method,
           available_balance,
           is_refund: is_refund || txn_type === 'credit', refund_type, rrn, arn, reference_no };
}

// ── Ingest a parsed SMS to backend ───────────────────────────
function bank_name_from_sender(sender: string): string {
  const s = sender.toUpperCase();
  if (s.includes('HDFCBK') || s.includes('HDFC'))   return 'HDFC Bank';
  if (s.includes('ICICIT') || s.includes('ICICI'))   return 'ICICI Bank';
  if (s.includes('SBIINB') || s.includes('SBI'))     return 'State Bank of India';
  if (s.includes('AXISBK') || s.includes('AXIS'))    return 'Axis Bank';
  if (s.includes('KOTAKB') || s.includes('KOTAK'))   return 'Kotak Mahindra Bank';
  if (s.includes('INDUSB') || s.includes('INDUS'))   return 'IndusInd Bank';
  if (s.includes('YESBNK') || s.includes('YESB'))    return 'Yes Bank';
  if (s.includes('BOIIND') || s.includes('BOI'))     return 'Bank of India';
  if (s.includes('PNBSMS') || s.includes('PNB'))     return 'Punjab National Bank';
  if (s.includes('CANBNK') || s.includes('CANARA'))  return 'Canara Bank';
  if (s.includes('UNIONB') || s.includes('UNION'))   return 'Union Bank';
  if (s.includes('IDFCFB') || s.includes('IDFC'))    return 'IDFC First Bank';
  if (s.includes('PAYTMB') || s.includes('PAYTM'))   return 'Paytm Payments Bank';
  if (s.includes('AMEX'))                            return 'American Express';
  if (s.includes('SCBL')  || s.includes('STANCHART')) return 'Standard Chartered';
  if (s.includes('CITI'))                            return 'Citibank';
  // Fallback: extract readable part from sender
  return sender.replace(/^(VM|BP|TM|TP|TA|TB|TC|TD|TE|TF|TG|TH)-/i, '').toUpperCase();
}

async function ingest_parsed(parsed: parsed_sms, timestamp_ms: number): Promise<void> {
  const txn_date = new Date(timestamp_ms).toISOString().split('T')[0];
  const epoch_seconds = Math.floor(timestamp_ms / 1000);

  try {
    // Get stored timezone from MMKV or default
    let tz_off = '+05:30';
    try {
      const { storage } = require('./storage');
      const tz = storage.getString('user_timezone');
      if (tz) {
        const { get_tz_offset } = require('../utils/date');
        tz_off = get_tz_offset(tz);
      }
    } catch {}
    // Build metadata audit trail — frozen at parse time, never modified
    const metadata = {
      raw_source_text: parsed.body.slice(0, 300),  // first 300 chars of SMS
      sender_id:       parsed.sender,
      parse_confidence: 75,
      parse_version:   '1.0',
      source_type:     'sms',
      sms_timestamp_ms: timestamp_ms,
      ...(parsed.original_currency ? {
        raw_currency: parsed.original_currency,
        raw_amount:   String(parsed.original_amount ?? parsed.amount),
      } : {}),
    };

    const result: any = await Transactions.ingest({
      amount:            parsed.amount,
      txn_type:          parsed.txn_type,
      merchant:          parsed.merchant ?? undefined,
      acct_suffix:       parsed.acct_suffix ?? undefined,
      confidence:        75,
      source:            'sms',
      txn_date,
      epoch_seconds,
      tz_offset:         tz_off,
      original_currency: parsed.original_currency ?? undefined,
      original_amount:   parsed.original_amount ?? undefined,
      metadata,
    });
    if (parsed.refund_type && (parsed.rrn || parsed.arn || parsed.is_refund)) {
      try {
        const { Refunds } = require('./api');
        await Refunds.create({
          txn_id:         result?.txn_id,
          merchant:       parsed.merchant ?? undefined,
          amount:   parsed.amount,
          refund_type:    parsed.refund_type,
          rrn:            parsed.rrn ?? undefined,
          arn:            parsed.arn ?? undefined,
          reference_no:   parsed.reference_no ?? undefined,
          initiated_date: txn_date,
          reason:         'auto-detected from SMS',
        });
      } catch (re: any) {
        console.warn('Refund auto-create:', re?.message ?? re);
      }
    }
    // Auto-discover account from SMS (Belief 14)
    if (parsed.acct_suffix) {
      try {
        await Accounts.discover({
          bank_name:      bank_name_from_sender(parsed.sender),
          account_suffix: parsed.acct_suffix,
          account_type:   parsed.sender.toUpperCase().includes('CC') ||
                          parsed.sender.toUpperCase().includes('CARD')
                          ? 'credit_card' : 'savings',
        });
      } catch (_) {} // fire and forget
    }
  } catch (e: any) {
    console.error('SMS ingest error:', e?.message ?? e);
  }
}

// ── Process a raw SMS event ───────────────────────────────────
export async function process_sms_event(
  sender: string,
  body: string,
  timestamp_ms: number
): Promise<boolean> {
  const parsed = parse_sms(sender, body);
  if (!parsed) return false;
  await ingest_parsed(parsed, timestamp_ms);
  return true;
}

// ── Start realtime listener ───────────────────────────────────
let listener_active = false;
let listener_sub: any = null;

export function start_sms_listener(): void {
  if (listener_active || !sms_emitter) return;
  listener_active = true;

  listener_sub = sms_emitter.addListener('on_sms_received', async (event: any) => {
    await process_sms_event(event.sender ?? '', event.body ?? '', event.timestamp ?? Date.now());
  });
}

export function stop_sms_listener(): void {
  if (!listener_active) return;
  listener_sub?.remove();
  listener_active = false;
}

// ── Financial sender pre-filter ──────────────────────────────
// Financial SMS detection based on CONTENT not sender name.
// Sender lists break when banks change IDs, merge, or new banks appear.
// Instead: if the SMS body contains financial signals → process it.
const FIN_BODY_PATTERNS = [
  /(?:Rs\.?|INR|₹)\s*[\d,]+/i,              // amount with currency
  /debited|credited|spent|withdrawn/i,        // transaction verbs
  /a\/c|acct|account.*\d{3}/i,               // account reference
  /upi|neft|imps|rtgs/i,                     // payment rails
  /otp\s+is\s+\d{4,6}/i,                    // OTP — will be filtered by OTP check
];

export function is_financial_sender(sender: string, body?: string): boolean {
  // If body is provided, detect by content (more reliable)
  if (body) {
    // Reject OTPs first
    if (/OTP|one.?time.?pass/i.test(body)) return false;
    // Reject promotional patterns
    if (/offer|discount|cashback.*earn|click here|visit us|unsubscribe/i.test(body) &&
        !(/debited|credited|spent|withdrawn/i.test(body))) return false;
    return FIN_BODY_PATTERNS.some(p => p.test(body));
  }
  // Fallback: sender-based (kept for backward compat but very permissive)
  const raw = sender.toUpperCase().replace(/^[A-Z]{2}-/, '');
  // Accept any sender that looks like a bank/financial institution code
  // 6-char alpha codes are typically registered SMS senders
  return raw.length >= 3;
}

// ── Historical backfill ───────────────────────────────────────
const SIX_MONTHS_MS  = 6 * 30 * 24 * 60 * 60 * 1000;
const BACKFILL_BATCH = 50;

export interface ScanProgress {
  status:   'reading' | 'filtering' | 'parsing' | 'submitting' | 'done' | 'error';
  total:    number;
  filtered: number;
  parsed:   number;
  submitted:number;
  created:  number;
  skipped:  number;
  error?:   string;
}
export type ProgressCb = (p: ScanProgress) => void;

export async function backfill_sms(opts: {
  from_ms?:     number;
  to_ms?:       number;
  on_progress?: ProgressCb;
  max_sms?:     number;
} = {}): Promise<{ processed: number; skipped: number; created: number }> {
  if (!SmsModule) return { processed: 0, skipped: 0, created: 0 };
  const { from_ms = Date.now() - SIX_MONTHS_MS, to_ms = Date.now(),
          on_progress, max_sms = 10_000 } = opts;
  let prog: ScanProgress = {
    status: 'reading', total: 0, filtered: 0,
    parsed: 0, submitted: 0, created: 0, skipped: 0,
  };
  const emit = (patch: Partial<ScanProgress>) => {
    prog = { ...prog, ...patch }; on_progress?.(prog);
  };
  let all: Array<{ sender: string; body: string; timestamp: number }> = [];
  try {
    all = await SmsModule.getRecentSms(max_sms);
  } catch (e) {
    emit({ status: 'error', error: String(e) });
    return { processed: 0, skipped: 0, created: 0 };
  }
  emit({ status: 'filtering', total: all.length });
  const financial = all.filter(
    m => m.timestamp >= from_ms && m.timestamp <= to_ms
      && is_financial_sender(m.sender ?? '', m.body ?? '')
  );
  emit({ status: 'parsing', filtered: financial.length });
  let tz_off = '+05:30';
  try {
    const tz = storage.getString('user_timezone');
    if (tz) { const { get_tz_offset } = require('../utils/date'); tz_off = get_tz_offset(tz); }
  } catch {}
  const to_submit: any[] = [];
  for (const msg of financial) {
    let parsed: any = null;
    try {
      parsed = parse_sms(msg.sender ?? '', msg.body ?? '');
    } catch (parseErr: any) {
      console.error('[SCAN] parse_sms threw:', parseErr?.message, 'sender:', msg.sender, 'body:', msg.body?.slice(0,50));
      emit({ skipped: prog.skipped + 1 }); continue;
    }
    if (!parsed) { emit({ skipped: prog.skipped + 1 }); continue; }
    to_submit.push({
      local_id:          `sms_${msg.timestamp}_${parsed.amount}`,
      amount:            parsed.amount,
      txn_type:          parsed.txn_type,
      merchant:          parsed.merchant   ?? undefined,
      acct_suffix:       parsed.acct_suffix ?? undefined,
      confidence:        75,
      source:            'sms',
      txn_date:          new Date(msg.timestamp).toISOString().split('T')[0],
      epoch_seconds:     Math.floor(msg.timestamp / 1000),
      tz_offset:         tz_off,
      is_cash:           /atm|cash/i.test(msg.body ?? ''),
      original_amount:   parsed.original_amount   ?? undefined,
      original_currency: parsed.original_currency ?? undefined,
      metadata: {
        sender_id:       parsed.sender,
        parse_version:   '2.0',
        source_type:      'sms_backfill',
        sms_timestamp_ms: msg.timestamp,
      },
      raw_sms_body:    msg.body ?? '',
      payment_method:  (parsed as any)?.payment_method ?? undefined,
    });
    emit({ parsed: prog.parsed + 1 });
  }
  emit({ status: 'submitting' });
  let created = 0;
  for (let i = 0; i < to_submit.length; i += BACKFILL_BATCH) {
    const chunk = to_submit.slice(i, i + BACKFILL_BATCH);
    try {
      // Log first item fingerprint inputs to diagnose collisions
      if (chunk[0]) {
        const s = chunk[0];
        console.log('[BATCH_DEBUG] sample:', s.amount, s.acct_suffix, s.epoch_seconds, s.txn_date, s.local_id);
      }
      const nullSuffix = chunk.filter((x: any) => !x.acct_suffix).length;
      console.log('[BATCH] sending', chunk.length, '| null acct_suffix:', nullSuffix);
      const r = await Transactions.batch({ transactions: chunk });
      console.log('[BATCH] response:', JSON.stringify(r));
      created += r.created ?? 0;
      emit({ submitted: prog.submitted + chunk.length, created: prog.created + (r.created ?? 0) });
    } catch (e: any) { console.warn('[BATCH] chunk failed:', e?.status, e?.message, e?.code); }
    await new Promise(r => setTimeout(r, 150));
  }
  storage.set('sms_backfill_done',    'true');
  storage.set('sms_backfill_ts',      String(Date.now()));
  storage.set('sms_backfill_created', String(created));
  // Auto-detect transfers after scan
  try { await Transfers.detect(); } catch (_) {}

  emit({ status: 'done', created });
  return { processed: to_submit.length, skipped: prog.skipped, created };
}
