// src/services/api.ts
import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({ id: 'paisalog' });

// ─── Backend URL ────────────────────────────────────────────────
// Same machine: Android emulator uses 10.0.2.2 for host localhost
// Physical phone on same LAN: use your machine's LAN IP directly
const BASE = __DEV__
  ? 'https://api.engineersindia.co.in'  // Cloudflare tunnel — dev
  : 'https://api.paisalog.in';                   // production

// ─── Token store ────────────────────────────────────────────────
export const Tok = {
  get access()  { return storage.getString('tok_access')  ?? null; },
  get refresh() { return storage.getString('tok_refresh') ?? null; },
  set(a: string, r: string) {
    storage.set('tok_access', a);
    storage.set('tok_refresh', r);
  },
  clear() {
    storage.delete('tok_access');
    storage.delete('tok_refresh');
  },
};

// ─── Base fetch ─────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, opts: RequestInit = {}, retry = true): Promise<T> {
  const tok = Tok.access;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as any),
  };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && retry) {
    const ok = await doRefresh();
    if (ok) return call<T>(path, opts, false);
    Tok.clear();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Please sign in again');
  }
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(res.status, b.error ?? 'ERR', b.message ?? 'Something went wrong');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function doRefresh(): Promise<boolean> {
  const r = Tok.refresh;
  if (!r) return false;
  try {
    const d = await call<{ access_token: string; refresh_token: string }>(
      '/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: r }) }, false,
    );
    Tok.set(d.access_token, d.refresh_token);
    return true;
  } catch { return false; }
}

// ─── Auth ────────────────────────────────────────────────────────
export const Auth = {
  magicLink: (email: string) =>
    call<{ message: string }>('/auth/magic', {
      method: 'POST', body: JSON.stringify({ email, locale: 'en-IN' }),
    }),
  verify: (token: string, uid: number) =>
    call<{ access_token: string; refresh_token: string }>(`/auth/verify?token=${token}&uid=${uid}`),
  logout: () => call<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
};

// ─── User ────────────────────────────────────────────────────────
export interface Me {
  id: number; name: string; plan: string; sync_mode: string;
  jurisdiction: string; analytics_consent: boolean;
  marketing_consent: boolean; locale: string; timezone: string; created_at: string;
}
export const User = {
  me:      () => call<Me>('/me'),
  update:  (d: Partial<Pick<Me, 'name' | 'locale' | 'timezone'>>) =>
    call<{ ok: boolean }>('/me', { method: 'PATCH', body: JSON.stringify(d) }),
  update_settings: (body: { name?: string; locale?: string; timezone?: string; home_currency?: string; income_visible_to_family?: boolean }) =>
    call<{ ok: boolean }>('/me', { method: 'PATCH', body: JSON.stringify(body) }),
  consent: (analytics: boolean, marketing: boolean) =>
    call<{ ok: boolean }>('/me/consent', {
      method: 'PATCH', body: JSON.stringify({ analytics_consent: analytics, marketing_consent: marketing }),
    }),
  delete:  () => call<{ message: string }>('/me', { method: 'DELETE' }),
};

// ─── Transactions ────────────────────────────────────────────────
export interface Txn {
  id: number; user_id: number; household_id: number | null;
  amount: number; txn_type: 'debit' | 'credit' | 'refund';
  merchant: string | null; category: string | null; note: string | null;
  confidence: number; verified: boolean; sources: string;
  acct_suffix: string | null; txn_date: string; sync_state: string;
  is_investment: boolean; is_subscription: boolean; is_cash: boolean;
  local_id: string | null; created_at: string;
}
export interface TxnSummary {
  debit_amount: number; credit_amount: number;
  refund_amount: number; txn_count: number;
}
export interface AppGroup {
  merchant: string | null; txn_count: number;
  debit_amount: number; credit_amount: number;
  refund_amount: number; last_date: string;
}

export const Accounts = {
  list:     ()                   => call<any[]>('/accounts'),
  discover: (body: {bank_name: string; account_suffix: string; account_type?: string}) =>
                                    call<any>('/accounts/discover', { method: 'POST', body }),
  update:   (id: number, body: any) => call<any>(`/accounts/${id}`, { method: 'PATCH', body }),
  remove:   (id: number)            => call<any>(`/accounts/${id}`, { method: 'DELETE' }),
};

export const CustomerProfile = {
  get:    ()           => call<any>('/me/profile'),
  update: (body: any)  => call<any>('/me/profile', { method: 'PATCH', body }),
};

export const Export = {
  my_data: () => call<any>('/me/export'),
};

export const Transactions = {
  list:    (p: { start: string; end: string; limit?: number; household_id?: number; householdId?: number }) =>
    call<Txn[]>(`/transactions?${qs(p)}`),
  summary: (p: { start: string; end: string; householdId?: number }) =>
    call<TxnSummary>(`/transactions/summary?${qs(p)}`),
  apps:    (p: { start: string; end: string; householdId?: number }) =>
    call<AppGroup[]>(`/transactions/apps?${qs(p)}`),
  ingest:  (d: {
    amount: number; txn_type: string; merchant?: string;
    confidence: number; source: string; txn_date: string;
    epoch_seconds: number; local_id?: string;
    is_cash?: boolean; is_investment?: boolean;
    tz_offset?: string;
    original_amount?: number;
    original_currency?: string;
    fx_rate_at_entry?: number;
    metadata?: Record<string, any>;
  }) => call<{ action: string; txn_id?: number }>('/transactions', { method: 'POST', body: JSON.stringify(d) }),
  batch: (d: { transactions: Array<{
    local_id?: string; amount: number; txn_type: string;
    merchant?: string; acct_suffix?: string; confidence: number;
    source: string; txn_date: string; epoch_seconds: number;
    is_investment?: boolean; is_cash?: boolean; tz_offset?: string;
    original_amount?: number; original_currency?: string;
    fx_rate_at_entry?: number; metadata?: Record<string, any>;
    raw_sms_body?: string; raw_email_body?: string;
  }> }) =>
    call<{ created: number; merged: number; skipped: number; errors: string[] }>(
      '/transactions/batch', { method: 'POST', body: JSON.stringify(d) }
    ),
  delete:  (id: number) =>
    call<{ ok: boolean; id: number }>(`/transactions/${id}`, { method: 'DELETE' }),
  correct: (id: number, body: {
    merchant?: string; category?: string;
    amount?: number; txn_type?: string; note?: string;
  }) => call<{ ok: boolean }>(`/transactions/${id}/correct`, {
    method: 'PATCH', body: JSON.stringify(body)
  }),
  note:    (id: number, note: string) =>
    call<{ ok: boolean }>(`/transactions/${id}/note`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  rawLog:  (limit = 20) => call<any[]>(`/transactions/raw-log?limit=${limit}`),
  deleted: () => call<any[]>('/transactions/deleted'),
  restore: (id: number) =>
    call<{ ok: boolean }>(`/transactions/${id}/restore`, { method: 'POST', body: '{}' }),
  set_visibility: (id: number, body: {
    is_hidden?: boolean;
    hidden_from_family?: boolean;
    hidden_until?: string | null;
    exclude_from_totals?: boolean;
  }) => call<{ ok: boolean }>(`/transactions/${id}/visibility`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),
  hidden: () => call<any[]>('/transactions/hidden'),
};

// ─── Investments ─────────────────────────────────────────────────
export interface InvestSummary { total_invested_paise: number; transaction_count: number; period_start: string; period_end: string; }
export interface InvestBreakdown {
  merchant: string | null; total_paise: number; transaction_count: number; last_date: string;
}
export const Investments = {
  summary:    (p: { start: string; end: string }) => call<InvestSummary>(`/investments/summary?${qs(p)}`),
  breakdown:  (p: { start: string; end: string }) => call<InvestBreakdown[]>(`/investments/breakdown?${qs(p)}`),
  transactions:(p: { start: string; end: string; limit?: number }) => call<Txn[]>(`/investments/transactions?${qs(p)}`),
};

// ─── Cash ────────────────────────────────────────────────────────
export interface CashEntry {
  id: number; amount: number; category: string;
  merchant: string | null; note: string | null; spent_date: string; created_at: string;
}
export const Cash = {
  list:   (p?: { start?: string; end?: string }) => call<CashEntry[]>(`/cash?${qs(p ?? {})}`),
  create: (d: { amount: number; category: string; merchant?: string; note?: string; spent_date: string }) =>
    call<{ id: number }>('/cash', { method: 'POST', body: JSON.stringify(d) }),
  delete: (id: number) => call<{ ok: boolean }>(`/cash/${id}`, { method: 'DELETE' }),
};

// ─── Personal Targets ────────────────────────────────────────────
export const PersonalTargets = {
  get: () => call<Array<{ category: string; target_type: string; amount: number; period: string }>>('/targets'),
  set: (body: { category: string; target_type: string; amount: number }) =>
    call<{ ok: boolean }>('/targets', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Household ───────────────────────────────────────────────────
export const Household = {
  create: (name: string) =>
    call<{ id: number; inviteCode: string }>('/household', { method: 'POST', body: JSON.stringify({ name }) }),
  join:   (inviteCode: string) =>
    call<{ householdId: number; name: string }>('/household/join', { method: 'POST', body: JSON.stringify({ inviteCode }) }),
  members:(id: number) => call<any[]>(`/household/${id}/members`),
  summary:(id: number, start: string, end: string) =>
    call<any>(`/household/${id}/summary?start=${start}&end=${end}`),
};

// ─── Refunds ─────────────────────────────────────────────────────
export const Refunds = {
  list:         () => call<any[]>('/refunds'),
  updateStatus: (id: number, status: string) =>
    call<{ ok: boolean }>(`/refunds/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};


// ─── Household ───────────────────────────────────────────────
export interface HouseholdMember {
  id: number; name: string; role: string;
  joined_at: string; month_debit_amount: number;
}
export interface HouseholdSummary {
  summary: {
    debit_amount: number; credit_amount: number;
    refund_amount: number; txn_count: number; active_members: number;
  };
  members: Array<{
    user_id: number; name: string;
    debit_amount: number; txn_count: number;
  }>;
}
export const HouseholdApi = {
  create: (name: string) =>
    call<{ id: number; invite_code: string }>('/household', {
      method: 'POST', body: JSON.stringify({ name })
    }),
  join: (invite_code: string) =>
    call<{ household_id: number; name: string }>('/household/join', {
      method: 'POST', body: JSON.stringify({ invite_code })
    }),
  members: (id: number) =>
    call<HouseholdMember[]>(`/household/${id}/members`),
  summary: (id: number, start: string, end: string) =>
    call<HouseholdSummary>(`/household/${id}/summary?start=${start}&end=${end}`),
  regenerate_invite: (id: number) =>
    call<{ invite_code: string }>(`/household/${id}/invite/regenerate`, { method: 'POST' }),
  targets: (id: number) =>
    call<Array<{ category: string; target_type: string; amount: number; period: string }>>(`/household/${id}/targets`),
  set_target: (id: number, body: { category: string; target_type: string; amount: number }) =>
    call<{ ok: boolean }>(`/household/${id}/targets`, { method: 'POST', body: JSON.stringify(body) }),
  leave: (id: number) =>
    call<{ ok: boolean }>(`/household/${id}/leave`, { method: 'POST' }),
  my_households: () =>
    call<Array<{ id: number; name: string; role: string; joined_at: string; member_count: number }>>('/households'),
  transactions: (id: number, start: string, end: string, limit = 500) =>
    call<any[]>(`/household/${id}/transactions?start=${start}&end=${end}&limit=${limit}`),
};

export interface LinkedEmailAccount {
  id: string; email: string;
  provider: 'gmail' | 'outlook' | 'other';
  label?: string; added_at: number;
  last_parsed?: number; txns_found?: number;
}
export const EmailAccounts = {
  list(): LinkedEmailAccount[] {
    try { const r = storage.getString('linked_email_accounts'); return r ? JSON.parse(r) : []; }
    catch { return []; }
  },
  add(a: Omit<LinkedEmailAccount,'id'|'added_at'>): LinkedEmailAccount {
    const all = EmailAccounts.list();
    if (all.find(x => x.email === a.email)) throw new Error('Already linked');
    const entry = { ...a, id: `ea_${Date.now()}`, added_at: Date.now() };
    storage.set('linked_email_accounts', JSON.stringify([...all, entry]));
    return entry;
  },
  remove(id: string) {
    storage.set('linked_email_accounts',
      JSON.stringify(EmailAccounts.list().filter(a => a.id !== id)));
  },
  update(id: string, patch: Partial<LinkedEmailAccount>) {
    storage.set('linked_email_accounts',
      JSON.stringify(EmailAccounts.list().map(a => a.id === id ? {...a,...patch} : a)));
  },
};

// ─── React Query keys ────────────────────────────────────────────
export const QK = {
  me:            ['me'],
  txns:          (p: object) => ['txns', p],
  summary:       (p: object) => ['summary', p],
  apps:          (p: object) => ['apps', p],
  invest:        (p: object) => ['invest', p],
  investBreak:   (p: object) => ['investBreak', p],
  cash:          (p?: object) => ['cash', p],
  household:     (id: number) => ['household', id],
  household_sum: (id: number, s: string, e: string) => ['household_sum', id, s, e],
  householdSum:  (id: number, s: string, e: string) => ['householdSum', id, s, e],
  refunds:       ['refunds'],
  household:     (id: number) => ['household', id],
  household_sum: (id: number, s: string, e: string) => ['household_sum', id, s, e],
  rawLog:        ['rawLog'],
};

// ─── Helpers ─────────────────────────────────────────────────────
function qs(p: Record<string, any>): string {
  return Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}
