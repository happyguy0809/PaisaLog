// ─────────────────────────────────────────────────────────
// exceptions.ts  —  Edge-case overrides
//
// USE WHEN: a specific SMS format breaks the generic patterns.
// DO NOT:   add bank profiles, brand lists, or sender-specific logic.
// HOW:      set priority < 1 (e.g. 0.5) so it runs before generics.
//           Match on body content, not on sender ID.
//
// Example: "debited by 130" has no currency symbol.
//   The generic "amt_action_by" extractor already handles this.
//   If you find a new structural variant, add it here.
//
// Each exception is just a FieldExtractor — same shape as generics.
// ─────────────────────────────────────────────────────────

import { FieldExtractor } from './types'

export const EXCEPTIONS: FieldExtractor[] = [
  // ── Example: handle future edge cases below ────────────
  //
  // {
  //   id: 'exc_amount_hyphen_format',
  //   field: 'amount',
  //   priority: 0.5,                   // runs before all generics
  //   pattern: /Amount-([\d,]+)/,
  //   transform: m => Math.round(parseFloat(m[1].replace(/,/g, '')) * 100),
  //   confidence: 'HIGH',
  //   note: 'Hyphen-delimited format seen in XYZ SMS on 2026-04-01',
  // },
]
