// src/config/index.ts
// Single source of truth for all app configuration.
// Add currencies/timezones by editing the JSON files — no code changes needed.

import CURRENCIES_RAW from './currencies.json';
import TIMEZONES_RAW  from './timezones.json';

export interface Currency {
  code:         string;   // ISO 4217: INR, USD, etc.
  symbol:       string;   // ₹, $, €, etc.
  name:         string;   // Indian Rupee
  divisor:      number;   // 100 for most, 1 for JPY, 1000 for KWD
  decimals:     number;   // decimal places to display
  smallest_unit: string;  // paise, cents, fils, etc.
  locale:       string;   // for Intl.NumberFormat
  regions:      string[]; // ISO 3166 country codes
}

export interface Timezone {
  value:      string;   // IANA timezone: Asia/Kolkata
  label:      string;   // city/region name e.g. "India"
  abbr:       string;   // abbreviation e.g. "IST"
  utc_offset: string;   // UTC offset e.g. "+05:30"
  region:     string;   // Asia, Europe, Americas, Pacific, Universal
}

export const CURRENCIES: Currency[] = CURRENCIES_RAW as Currency[];
export const TIMEZONES:  Timezone[]  = TIMEZONES_RAW  as Timezone[];

// Quick lookup helpers
export function get_currency(code: string): Currency {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]; // fallback to INR
}

export function get_timezone(value: string): Timezone {
  return TIMEZONES.find(t => t.value === value) ?? TIMEZONES[0];
}

// Timezones grouped by region for UI pickers
export function timezones_by_region(): Record<string, Timezone[]> {
  return TIMEZONES.reduce((acc, tz) => {
    if (!acc[tz.region]) acc[tz.region] = [];
    acc[tz.region].push(tz);
    return acc;
  }, {} as Record<string, Timezone[]>);
}
