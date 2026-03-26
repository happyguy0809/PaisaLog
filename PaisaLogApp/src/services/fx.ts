// src/services/fx.ts
// Exchange rate service — fetches rates daily, caches in MMKV.
// Uses exchangerate-api.com free tier (1500 req/month, updated daily).
// Rates are fetched relative to the user's home currency.

import { MMKV } from 'react-native-mmkv';

const fx_storage = new MMKV({ id: 'paisalog_fx' });
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const API_BASE     = 'https://api.exchangerate-api.com/v4/latest';

export interface FxRates {
  base:       string;
  rates:      Record<string, number>;
  fetched_at: number;
}

/** Get cached rates or fetch fresh ones */
export async function get_rates(base_currency: string = 'INR'): Promise<Record<string, number>> {
  const cache_key = `fx_rates_${base_currency}`;
  const cached    = fx_storage.getString(cache_key);

  if (cached) {
    try {
      const parsed: FxRates = JSON.parse(cached);
      if (Date.now() - parsed.fetched_at < CACHE_TTL_MS) {
        return parsed.rates;
      }
    } catch {}
  }

  // Fetch fresh
  try {
    const res  = await fetch(`${API_BASE}/${base_currency}`);
    const data = await res.json();
    const rates: FxRates = {
      base:       base_currency,
      rates:      data.rates ?? {},
      fetched_at: Date.now(),
    };
    fx_storage.set(cache_key, JSON.stringify(rates));
    return rates.rates;
  } catch (e) {
    console.warn('FX rate fetch failed:', e);
    // Return cached even if stale
    if (cached) {
      try { return JSON.parse(cached).rates; } catch {}
    }
    return {};
  }
}

/**
 * Convert amount from one currency to another.
 * @param amount      Amount in smallest unit of from_currency
 * @param from        Source currency code e.g. 'AED'
 * @param to          Target currency code e.g. 'INR'
 * @param rates       Rates relative to base currency
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return amount;
  const from_rate = rates[from] ?? 1;
  const to_rate   = rates[to]   ?? 1;
  // Convert via base: amount / from_rate * to_rate
  return Math.round(amount * (to_rate / from_rate));
}

/**
 * Get the FX rate between two currencies as a single number.
 * e.g. get_rate('AED', 'INR', rates) → 22.63 (1 AED = 22.63 INR)
 */
export function get_rate(
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return 1;
  const from_rate = rates[from] ?? 1;
  const to_rate   = rates[to]   ?? 1;
  return to_rate / from_rate;
}
