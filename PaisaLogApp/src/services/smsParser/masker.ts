// ─────────────────────────────────────────────────────────
// masker.ts  —  PII masker for enrichment payload (Phase 2)
//
// Strips values, preserves structure:
//   digits    → X repeated (count preserved, value gone)
//   names     → [NAME]     (salutation preserved)
//   VPA user  → [VPA]      (@bank domain preserved)
//   amounts   → masked     (SLM doesn't need the actual number)
//   merchant  → preserved  (brand names are public, not PII)
// ─────────────────────────────────────────────────────────

export function maskForEnrichment(
  raw: string,
  knownMerchant?: string | null,
): string {
  let out = raw

  // 1. Names after salutations
  out = out.replace(
    /\b(Dear|Hi|Hello)\s+([A-Za-z][A-Za-z\s]{1,30}?)(?=[,.]|\s+[A-Z])/gi,
    (_, sal) => `${sal} [NAME]`,
  )

  // 2. VPA username — keep @domain for structure context
  out = out.replace(/([a-zA-Z0-9._\-]+)(@[a-zA-Z0-9.]+)/g, '[VPA]$2')

  // 3. Protect merchant name from digit masking (e.g. "7-Eleven", "3M")
  const PLACEHOLDER = '___MERCHANT___'
  if (knownMerchant) {
    out = out.replace(
      new RegExp(knownMerchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      PLACEHOLDER,
    )
  }

  // 4. Mask all digit sequences — preserve length only
  out = out.replace(/\b\d+\b/g, n => 'X'.repeat(n.length))

  // 5. Restore merchant
  if (knownMerchant) {
    out = out.replace(new RegExp(PLACEHOLDER, 'g'), knownMerchant)
  }

  return out
}

// ─────────────────────────────────────────────────────────
// "Rs.5000 debited from XXXX1234 to Swiggy UPI Ref:884729372 on 28-Mar-26"
//  →
// "Rs.XXXX debited from XXXX1234 to Swiggy UPI Ref:XXXXXXXXX on XX-Mar-XX"
//                                        ^^^^^^ merchant survives
// ─────────────────────────────────────────────────────────
