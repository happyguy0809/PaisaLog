// src/utils/money.ts
import { get_currency } from '../config';

export function fmt_money(
  amount: number,
  currency_code: string = 'INR',
  opts?: { compact?: boolean; showSign?: boolean; show_symbol?: boolean }
): string {
  const cur   = get_currency(currency_code);
  const value = amount / cur.divisor;
  const symbol = opts?.show_symbol === false ? '' : cur.symbol;
  let str: string;
  if (opts?.compact) {
    if (value >= 1_000_000) str = `${(value / 1_000_000).toFixed(1)}M`;
    else if (value >= 1_000) str = `${(value / 1_000).toFixed(1)}k`;
    else str = value.toLocaleString(cur.locale, { minimumFractionDigits: 0, maximumFractionDigits: cur.decimals });
  } else {
    str = value.toLocaleString(cur.locale, { minimumFractionDigits: 0, maximumFractionDigits: cur.decimals });
  }
  const sign = (opts?.showSign && amount > 0) ? '+' : '';
  return `${sign}${symbol}${str}`;
}

export function to_smallest_unit(input: string, currency_code: string = 'INR'): number {
  const cur   = get_currency(currency_code);
  const value = parseFloat(input.replace(/,/g, ''));
  if (isNaN(value)) return 0;
  return Math.round(value * cur.divisor);
}

export function fmt_txn(amount: number, txn_type: string, currency_code = 'INR'): string {
  const sign = txn_type === 'credit' ? '+' : '−';
  return `${sign}${fmt_money(amount, currency_code)}`;
}
