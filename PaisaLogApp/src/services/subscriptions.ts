// src/services/subscriptions.ts
// Detects recurring charges from transaction history.
// A subscription is: same merchant, similar amount (within 10%), ~monthly interval (25-35 days).

export interface DetectedSubscription {
  merchant:        string;
  amount:          number;      // smallest unit (home currency)
  currency:        string;
  frequency:       'monthly' | 'weekly' | 'quarterly';
  last_charged:    string;      // YYYY-MM-DD
  next_expected:   string;      // YYYY-MM-DD
  occurrences:     number;
  txn_ids:         number[];
}

function add_days(date_str: string, days: number): string {
  const d = new Date(date_str);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function days_between(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function detect_subscriptions(txns: any[]): DetectedSubscription[] {
  // Group debits by merchant
  const by_merchant: Record<string, any[]> = {};
  for (const t of txns) {
    if (t.txn_type !== 'debit' || !t.merchant || t.is_investment) continue;
    const key = t.merchant.trim().toLowerCase();
    if (!by_merchant[key]) by_merchant[key] = [];
    by_merchant[key].push(t);
  }

  const results: DetectedSubscription[] = [];

  for (const [, group] of Object.entries(by_merchant)) {
    if (group.length < 2) continue;

    // Sort by date
    const sorted = [...group].sort((a, b) => a.txn_date.localeCompare(b.txn_date));

    // Check for monthly pattern (25-35 day intervals)
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(days_between(sorted[i-1].txn_date, sorted[i].txn_date));
    }

    const avg_interval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const all_monthly  = intervals.every(d => d >= 25 && d <= 40);
    const all_weekly   = intervals.every(d => d >= 5  && d <= 9);
    const all_quarterly = intervals.every(d => d >= 80 && d <= 100);

    if (!all_monthly && !all_weekly && !all_quarterly) continue;

    // Check similar amounts (within 15%)
    const amounts = sorted.map(t => t.amount);
    const avg_amt = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const similar = amounts.every(a => Math.abs(a - avg_amt) / avg_amt < 0.15);
    if (!similar) continue;

    const frequency: 'monthly' | 'weekly' | 'quarterly' =
      all_weekly ? 'weekly' : all_quarterly ? 'quarterly' : 'monthly';

    const last = sorted[sorted.length - 1];
    const next_days = frequency === 'weekly' ? 7 : frequency === 'quarterly' ? 91 : 30;

    results.push({
      merchant:      last.merchant,
      amount:        Math.round(avg_amt),
      currency:      'INR',
      frequency,
      last_charged:  last.txn_date,
      next_expected: add_days(last.txn_date, next_days),
      occurrences:   sorted.length,
      txn_ids:       sorted.map(t => t.id),
    });
  }

  // Sort by amount descending
  return results.sort((a, b) => b.amount - a.amount);
}
