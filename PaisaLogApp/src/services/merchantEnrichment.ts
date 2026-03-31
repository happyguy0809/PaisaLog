// src/services/merchantEnrichment.ts
// Local-first merchant enrichment with server fallback.
// Privacy: only raw merchant string sent to server — no user_id, no amount.

import { MMKV } from 'react-native-mmkv'
import merchantBundle from '../assets/merchants.json'

const cache = new MMKV({ id: 'merchant_cache' })
const BASE   = __DEV__
  ? 'https://api.engineersindia.co.in'
  : 'https://api.engineersindia.co.in'

export interface MerchantInfo {
  name:        string
  category:    string
  subcategory?: string
  source:      'bundle' | 'cache' | 'server' | 'unknown'
}

// Normalise raw merchant string for lookup
function normalise(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Tier 1: bundled JSON lookup (instant, no network)
function lookupBundle(raw: string): MerchantInfo | null {
  const key = normalise(raw)
  const hit  = (merchantBundle as any)[key]
  if (!hit) return null
  return { ...hit, source: 'bundle' }
}

// Tier 2: MMKV cache (instant, previously server-resolved)
function lookupCache(raw: string): MerchantInfo | null {
  const key = `mc:${normalise(raw)}`
  const val = cache.getString(key)
  if (!val) return null
  try { return { ...JSON.parse(val), source: 'cache' } }
  catch { return null }
}

function saveCache(raw: string, info: MerchantInfo) {
  const key = `mc:${normalise(raw)}`
  cache.set(key, JSON.stringify(info))
}

// Tier 3: server enrichment (async, fire and forget)
async function lookupServer(raw: string): Promise<MerchantInfo | null> {
  try {
    const res = await fetch(`${BASE}/merchants/enrich`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: normalise(raw) }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.name) return null
    const info: MerchantInfo = {
      name:        data.name,
      category:    data.category,
      subcategory: data.subcategory,
      source:      'server',
    }
    saveCache(raw, info)
    return info
  } catch {
    return null
  }
}

// Main lookup — synchronous for immediate use, async enrichment in background
export function getMerchantInfo(raw: string | null | undefined): MerchantInfo {
  if (!raw) return { name: 'Unknown', category: 'uncategorized', source: 'unknown' }

  // Tier 1: bundle
  const bundle = lookupBundle(raw)
  if (bundle) return bundle

  // Tier 2: cache
  const cached = lookupCache(raw)
  if (cached) return cached

  // Tier 3: async server lookup (fire and forget — result available next render)
  lookupServer(raw).catch(() => {})

  // Return raw for now
  return { name: raw, category: 'uncategorized', source: 'unknown' }
}

// Warm the cache for a list of merchants (call after SMS scan)
export async function warmMerchantCache(rawMerchants: string[]): Promise<void> {
  const missing = rawMerchants.filter(
    m => !lookupBundle(m) && !lookupCache(m)
  )
  if (!missing.length) return

  try {
    const res = await fetch(`${BASE}/merchants/enrich/batch`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raws: missing.map(normalise) }),
    })
    if (!res.ok) return
    const results: Record<string, MerchantInfo> = await res.json()
    for (const [raw, info] of Object.entries(results)) {
      saveCache(raw, info)
    }
  } catch {}
}
