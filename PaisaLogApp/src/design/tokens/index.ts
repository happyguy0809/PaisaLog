// src/design/tokens/index.ts
// PaisaLog Design System — Light theme
//
// Philosophy:
// Information should feel like clarity, not pressure.
// Every color, every spacing decision is in service of
// reducing cognitive load, not displaying more data.
//
// Rules that govern every design decision here:
// 1. One primary action per screen
// 2. Amounts only in two colors: red (spent) or green (invested)
// 3. All other text is grey — nothing fights for attention
// 4. Whitespace is not wasted space — it is breathing room
// 5. If a data point is not actionable, it should not be prominent

export const Colors = {

  // ── Backgrounds ─────────────────────────────────────────
  // Layered from lightest (page) to slightly darker (cards).
  // The difference is subtle — just enough to create depth
  // without visual noise.
  bg: {
    page:    '#F7F7F5',   // The base. Warm off-white, not clinical pure white.
    card:    '#FFFFFF',   // Cards sit on top of the page.
    input:   '#F2F2F0',   // Input fields — slightly recessed.
    overlay: 'rgba(0,0,0,0.40)', // Modal backdrop.
  },

  // ── Borders ─────────────────────────────────────────────
  // Almost invisible. Borders should separate, not decorate.
  border: {
    light:   '#EBEBEA',  // Default — very subtle
    default: '#E0E0DE',  // Slightly stronger — focused states
    strong:  '#C8C8C6',  // Dividers that need to be seen
  },

  // ── Text ────────────────────────────────────────────────
  // Four levels. Most text should be secondary or tertiary.
  // Reserve primary for the single most important thing on screen.
  text: {
    primary:   '#1A1A1A',  // Headings, amounts, key labels. Use sparingly.
    secondary: '#555552',  // Body text. Most content lives here.
    tertiary:  '#999994',  // Metadata, timestamps, captions.
    disabled:  '#C4C4C1',  // Unavailable states.
    onColor:   '#FFFFFF',  // Text on colored backgrounds (buttons).
  },

  // ── Spend — always and only for debit amounts ───────────
  // Muted red. Not alarm-red — more like "pay attention".
  // The goal is information, not anxiety.
  spend: {
    text:   '#D64040',   // Amount text color
    bg:     '#FDF2F2',   // Card tint background
    border: '#F5CCCC',   // Card border
    dot:    '#E05050',   // Small indicator dot
  },

  // ── Invest — always and only for investment amounts ─────
  // Calm green. Conveys growth without being garish.
  invest: {
    text:   '#1E8A4A',   // Amount text color
    bg:     '#F2FAF4',   // Card tint background
    border: '#C3E6CE',   // Card border
    dot:    '#2EA854',   // Small indicator dot
  },

  // ── Accent — the single action color ────────────────────
  // Used for: primary buttons, active nav, progress fills, links.
  // Nothing else gets this color. One accent, maximum clarity.
  accent: {
    default: '#2C6BED',  // Primary blue — calm, trustworthy
    light:   '#EBF1FD',  // Light tint for backgrounds
    border:  '#C0D4FA',  // Border on accent-tinted surfaces
    pressed: '#1A55D4',  // Pressed state (darker)
  },

  // ── Neutral ──────────────────────────────────────────────
  // For non-semantic UI — badges, secondary surfaces, etc.
  neutral: {
    100: '#F7F7F5',
    200: '#EFEFED',
    300: '#E5E5E3',
    400: '#D0D0CE',
    500: '#A8A8A6',
    600: '#787876',
    700: '#484846',
    800: '#2A2A28',
  },

  // ── Status colors ────────────────────────────────────────
  warning: { text: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  danger:  { text: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
  success: { text: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },

  // ── Privacy states ───────────────────────────────────────
  privacy: {
    visible:      '#1E8A4A',
    familyHidden: '#B45309',
    private:      '#6D28D9',
  },
} as const;

// ── Typography ───────────────────────────────────────────────
// Fonts are loaded from the assets folder as TTF files.
// No Google Fonts API call at runtime — everything is bundled.
//
// Primary (UI): "Outfit" — geometric, modern, very readable
//   at small sizes. Clean without being cold.
// Numbers: "DM Mono" — monospaced, so rupee amounts
//   don't jump around as digits change.
//
// Both are open-source, bundle them in assets/fonts/

export const Fonts = {
  ui: {
    regular: undefined,
    medium:  undefined,
    semibold: undefined,
    bold:    undefined,
  },
  // For rupee amounts — monospace keeps alignment consistent
  // when numbers change (avoids layout shifts in live updates)
  numeric: undefined,
} as const;

// ── Type scale ───────────────────────────────────────────────
// Named by purpose, not size. Purpose is stable; size can change.
// letterSpacing is negative on large text (tighter = more premium)
// lineHeight is generous on body text (easier to read)

export const Type = {
  // Hero numbers — the ONE metric that matters on a screen
  hero: {
    fontFamily: Fonts.ui.bold,
    fontSize:   42,
    letterSpacing: -1.5,
    lineHeight:    48,
    color: Colors.text.primary,
  },
  // Display — section totals, summary amounts
  display: {
    fontFamily: Fonts.ui.semibold,
    fontSize:   28,
    letterSpacing: -0.8,
    lineHeight:    34,
    color: Colors.text.primary,
  },
  // Title — screen headings
  title: {
    fontFamily: Fonts.ui.semibold,
    fontSize:   20,
    letterSpacing: -0.3,
    lineHeight:    26,
    color: Colors.text.primary,
  },
  // Heading — card titles, section labels
  heading: {
    fontFamily: Fonts.ui.semibold,
    fontSize:   16,
    letterSpacing: -0.1,
    lineHeight:    22,
    color: Colors.text.primary,
  },
  // Body — readable content
  body: {
    fontFamily: Fonts.ui.regular,
    fontSize:   15,
    letterSpacing: 0,
    lineHeight:    22,
    color: Colors.text.secondary,
  },
  // Small — supporting text
  small: {
    fontFamily: Fonts.ui.regular,
    fontSize:   13,
    letterSpacing: 0,
    lineHeight:    18,
    color: Colors.text.secondary,
  },
  // Label — UI chrome, badges, tabs
  label: {
    fontFamily: Fonts.ui.medium,
    fontSize:   12,
    letterSpacing: 0.1,
    lineHeight:    16,
    color: Colors.text.secondary,
  },
  // Caption — timestamps, metadata
  caption: {
    fontFamily: Fonts.ui.regular,
    fontSize:   11,
    letterSpacing: 0.2,
    lineHeight:    15,
    color: Colors.text.tertiary,
  },
  // Amount — transaction amounts, monospace for stability
  amount: {
    fontFamily: Fonts.numeric,
    fontSize:   15,
    letterSpacing: 0,
    lineHeight:    20,
  },
} as const;

// ── Spacing ──────────────────────────────────────────────────
// 4px base grid. Every value multiplies by 4.
// Named by size, not semantic — semantic naming creates
// false assumptions about where to use them.

export const S = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ── Radius ───────────────────────────────────────────────────
// Consistent corners throughout. Nothing too round (toy-like)
// or too square (corporate).

export const R = {
  xs:   6,
  sm:   10,
  md:   14,
  lg:   20,
  xl:   28,
  full: 999,
} as const;

// ── Shadows ──────────────────────────────────────────────────
// Light and barely-there. Elevation should feel natural.

export const Elevation = {
  card: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  4,
    elevation:     2,
  },
  sheet: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius:  12,
    elevation:     12,
  },
} as const;

// ── Animation ────────────────────────────────────────────────

export const Anim = {
  fast:   150,
  normal: 220,
  slow:   380,
} as const;

// ── Helper: format rupee amount ──────────────────────────────
// Centralised so formatting is consistent everywhere.

export function fmt(paise: number, opts?: { compact?: boolean; showSign?: boolean }): string {
  const rs = paise / 100;
  let str: string;

  if (opts?.compact) {
    if (rs >= 10_00_000) str = `${(rs / 10_00_000).toFixed(1)}L`;
    else if (rs >= 1_000) str = `${(rs / 1_000).toFixed(1)}k`;
    else str = Math.round(rs).toLocaleString('en-IN');
  } else {
    str = Math.round(rs).toLocaleString('en-IN');
  }

  return (opts?.showSign && paise > 0 ? '+' : '') + '₹' + str;
}


// ── Short aliases (used by screens) ──────────────────────────
export const F  = Fonts;
export const sp = S;
export const br = R;


// ── Flat color aliases (used by screens as C.pageBg etc) ─────
export const C = {
  ...Colors,
  pageBg:        Colors.bg.page,
  cardBg:        Colors.bg.card,
  inputBg:       Colors.bg.input,
  textPrimary:   Colors.text.primary,
  textSecondary: Colors.text.secondary,
  textTertiary:  Colors.text.tertiary,
  textDisabled:  Colors.text.disabled,
  borderFaint:   Colors.border.light,
  borderDefault: Colors.border.default,
  borderStrong:  Colors.border.strong,
  accent:        Colors.accent.default,
  accentLight:   Colors.accent.light,
  accentBorder:  Colors.accent.border,
  spendText:     Colors.spend.text,
  spendBg:       Colors.spend.bg,
  investText:    Colors.invest.text,
  investBg:      Colors.invest.bg,
  investDot:     Colors.invest.dot,
  dangerText:    Colors.danger.text,
  warnText:      Colors.warning.text,
  warnBg:        Colors.warning.bg,
  white:         '#FFFFFF',
  n:             Colors.neutral,
};
