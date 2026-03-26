// src/design/components/index.tsx
// Every UI primitive PaisaLog uses.
// Light theme. Calm. Uncluttered.
//
// Rule: if something is not here, question whether it's needed.
// Adding a new component is a decision, not a default.

import React, { ReactNode } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, TextInput,
  StyleSheet, ActivityIndicator, ViewStyle, TextStyle,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Colors, Fonts, Type, S, R, Elevation, fmt } from '../tokens';

// ── Haptics helper ───────────────────────────────────────────

function haptic(type: 'light' | 'medium' | 'success' = 'light') {
  ReactNativeHapticFeedback.trigger(
    type === 'success' ? 'notificationSuccess' : type === 'medium' ? 'impactMedium' : 'impactLight',
    { enableVibrateFallback: true, ignoreAndroidSystemSettings: false },
  );
}

// ── Layout ───────────────────────────────────────────────────

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Between({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.between, style]}>{children}</View>;
}

export function Gap({ size = S[3] }: { size?: number }) {
  return <View style={{ height: size }} />;
}

// ── Typography ───────────────────────────────────────────────
// Named by role so usage is intentional.

interface TProps { children: ReactNode; style?: TextStyle; color?: string; numberOfLines?: number }

export function HeroAmount({ children, style, color }: TProps) {
  return <Text style={[Type.hero, color ? { color } : null, style]}>{children}</Text>;
}
export function DisplayAmount({ children, style, color }: TProps) {
  return <Text style={[Type.display, color ? { color } : null, style]}>{children}</Text>;
}
export function Title({ children, style }: TProps) {
  return <Text style={[Type.title, style]}>{children}</Text>;
}
export function Heading({ children, style }: TProps) {
  return <Text style={[Type.heading, style]}>{children}</Text>;
}
export function Body({ children, style, color }: TProps) {
  return <Text style={[Type.body, color ? { color } : null, style]}>{children}</Text>;
}
export function Small({ children, style, color, numberOfLines }: TProps) {
  return <Text style={[Type.small, color ? { color } : null, style]} numberOfLines={numberOfLines}>{children}</Text>;
}
export function Label({ children, style, color }: TProps) {
  return <Text style={[Type.label, color ? { color } : null, style]}>{children}</Text>;
}
export function Caption({ children, style, color }: TProps) {
  return <Text style={[Type.caption, color ? { color } : null, style]}>{children}</Text>;
}

// Amount — monospace, colored by type
interface AmountProps {
  paise: number;
  type?: 'spend' | 'invest' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  style?: TextStyle;
}
export function Amount({ paise, type = 'neutral', size = 'md', compact, style }: AmountProps) {
  const color = type === 'spend' ? Colors.spend.text : type === 'invest' ? Colors.invest.text : Colors.text.primary;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 22 : 16;
  return (
    <Text style={[{ fontFamily: Fonts.numeric, fontSize, color, letterSpacing: -0.3 }, style]}>
      {type === 'spend' ? '−' : type === 'invest' ? '+' : ''}{fmt(paise, { compact })}
    </Text>
  );
}

// ── Card ─────────────────────────────────────────────────────
// The fundamental container. White background, subtle shadow.
// Everything inside a Card shares the same elevation.

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padding?: number;
}

export function Card({ children, style, onPress, padding = S[4] }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={() => { haptic('light'); onPress(); }}
        style={({ pressed }) => [styles.card, { padding }, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

// ── Section label ─────────────────────────────────────────────
// The small uppercase label above a group of content.
// Keeps sections distinct without heavy headers.

export function SectionLabel({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return (
    <Between style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{label.toUpperCase()}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.sectionLabelAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </Between>
  );
}

// ── Divider ───────────────────────────────────────────────────

export function Divider({ inset = 0, style }: { inset?: number; style?: ViewStyle }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

// ── Button ────────────────────────────────────────────────────
// Two variants. Primary (filled accent) and ghost (outline).
// Size: sm, md, lg.
// If you find yourself needing a third variant, reconsider the UX.

interface BtnProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  icon?: ReactNode;
}

export function Btn({ label, onPress, variant = 'primary', size = 'md', loading, disabled, fullWidth, style, icon }: BtnProps) {
  const sizes = { sm: styles.btnSm, md: styles.btnMd, lg: styles.btnLg };
  const variants = {
    primary: styles.btnPrimary,
    ghost:   styles.btnGhost,
    danger:  styles.btnDanger,
  };
  const textColors = {
    primary: Colors.text.onColor,
    ghost:   Colors.text.primary,
    danger:  Colors.danger.text,
  };

  return (
    <Pressable
      onPress={() => {
        if (loading || disabled) return;
        haptic('medium');
        onPress();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        sizes[size],
        variants[variant],
        fullWidth && { width: '100%' as any },
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.82, transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : Colors.accent.default} />
        : <Row style={{ gap: S[2] }}>
            {icon}
            <Text style={[styles.btnText, { color: textColors[variant] }, size === 'sm' && { fontSize: 13 }]}>
              {label}
            </Text>
          </Row>
      }
    </Pressable>
  );
}

// ── Chip / Badge ──────────────────────────────────────────────

interface ChipProps { label: string; color?: string; bg?: string; style?: ViewStyle }

export function Chip({ label, color = Colors.text.tertiary, bg = Colors.neutral[200], style }: ChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────

export function ProgressBar({ value, color = Colors.accent.default, height = 4, style }: {
  value: number; color?: string; height?: number; style?: ViewStyle;
}) {
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <View style={[styles.progressTrack, { height }, style]}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color, height }]} />
    </View>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
// Placeholder while loading. Matches shape of content.

export function Bone({ w, h, radius = R.xs, style }: { w: number | string; h: number; radius?: number; style?: ViewStyle }) {
  return <View style={[{ width: w as any, height: h, borderRadius: radius, backgroundColor: Colors.neutral[200] }, style]} />;
}

// ── Metric card ───────────────────────────────────────────────
// The two-card pattern on the home screen.
// Spend card = red tint. Invest card = green tint.

interface MetricCardProps {
  label:   string;
  amount:  number;
  type:    'spend' | 'invest';
  sub?:    string;
  onPress?: () => void;
  loading?: boolean;
}

export function MetricCard({ label, amount, type, sub, onPress, loading }: MetricCardProps) {
  const scheme = type === 'spend' ? Colors.spend : Colors.invest;
  const content = (
    <View style={[styles.metricCard, { backgroundColor: scheme.bg, borderColor: scheme.border }]}>
      <Row style={styles.metricHeader}>
        <View style={[styles.metricDot, { backgroundColor: scheme.dot }]} />
        <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
      </Row>
      {loading
        ? <Bone w={110} h={34} style={{ marginTop: S[2] }} />
        : <Text style={[styles.metricAmount, { color: scheme.text }]}>
            {fmt(amount)}
          </Text>
      }
      {sub && <Caption style={styles.metricSub}>{sub}</Caption>}
    </View>
  );

  if (onPress) return <Pressable onPress={onPress} style={{ flex: 1 }}>{content}</Pressable>;
  return <View style={{ flex: 1 }}>{content}</View>;
}

// ── List item ─────────────────────────────────────────────────
// Reusable for any list row that needs icon + content + right.

interface ListItemProps {
  icon?:     ReactNode;
  title:     string;
  sub?:      string;
  right?:    ReactNode;
  onPress?:  () => void;
  showArrow?: boolean;
  style?:    ViewStyle;
}

export function ListItem({ icon, title, sub, right, onPress, showArrow = false, style }: ListItemProps) {
  const inner = (
    <Between style={[styles.listItem, style]}>
      <Row style={{ flex: 1, gap: S[3] }}>
        {icon && <View style={styles.listIcon}>{icon}</View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.listTitle}>{title}</Text>
          {sub && <Caption>{sub}</Caption>}
        </View>
      </Row>
      <Row style={{ gap: S[2] }}>
        {right}
        {showArrow && <Text style={styles.arrow}>›</Text>}
      </Row>
    </Between>
  );

  if (onPress) {
    return (
      <Pressable onPress={() => { haptic('light'); onPress(); }} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

// ── Input ─────────────────────────────────────────────────────

interface InputProps {
  label?:       string;
  value:        string;
  onChange:     (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoFocus?:   boolean;
  style?:       ViewStyle;
  maxLength?:   number;
  multiline?:   boolean;
}

export function Input({ label, value, onChange, placeholder, keyboardType, autoFocus, style, maxLength, multiline }: InputProps) {
  return (
    <View style={[styles.inputWrap, style]}>
      {label && <Label style={styles.inputLabel}>{label.toUpperCase()}</Label>}
      <TextInput
        style={[styles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.disabled}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        multiline={multiline}
      />
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────

export function Empty({ title, message, action, onAction }: { title: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <Body style={{ fontFamily: Fonts.ui.medium, color: Colors.text.secondary, marginBottom: S[2] }}>{title}</Body>
      <Caption style={{ textAlign: 'center', lineHeight: 18 }}>{message}</Caption>
      {action && onAction && <Btn label={action} onPress={onAction} variant="ghost" size="sm" style={{ marginTop: S[4] }} />}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.bg.page },
  row:     { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  card: {
    backgroundColor: Colors.bg.card,
    borderRadius:    R.md,
    ...Elevation.card,
  },
  cardPressed: { opacity: 0.9 },

  sectionLabel: {
    paddingHorizontal: S[4],
    paddingBottom:     S[2],
    marginTop:         S[1],
  },
  sectionLabelText: {
    fontFamily:    Fonts.ui.semibold,
    fontSize:      10,
    letterSpacing: 0.9,
    color:         Colors.text.tertiary,
  },
  sectionLabelAction: {
    fontFamily: Fonts.ui.medium,
    fontSize:   12,
    color:      Colors.accent.default,
  },

  divider: {
    height:          0.5,
    backgroundColor: Colors.border.light,
  },

  btn: {
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   R.sm,
    flexDirection:  'row',
  },
  btnSm: { paddingHorizontal: S[4], paddingVertical: S[2] },
  btnMd: { paddingHorizontal: S[5], paddingVertical: S[3] },
  btnLg: { paddingHorizontal: S[6], paddingVertical: S[4] },
  btnPrimary: { backgroundColor: Colors.accent.default },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth:     1,
    borderColor:     Colors.border.default,
  },
  btnDanger: {
    backgroundColor: Colors.danger.bg,
    borderWidth:     1,
    borderColor:     Colors.danger.border,
  },
  btnText: {
    fontFamily: Fonts.ui.semibold,
    fontSize:   15,
    letterSpacing: 0,
  },

  chip: {
    paddingHorizontal: S[2],
    paddingVertical:   3,
    borderRadius:      R.full,
  },
  chipText: {
    fontFamily:    Fonts.ui.medium,
    fontSize:      11,
    letterSpacing: 0.2,
  },

  progressTrack: {
    backgroundColor: Colors.neutral[200],
    borderRadius:    R.full,
    overflow:        'hidden',
  },
  progressFill: {
    borderRadius: R.full,
  },

  metricCard: {
    borderRadius: R.md,
    padding:      S[4],
    borderWidth:  1,
  },
  metricHeader: { gap: S[1], marginBottom: S[2] },
  metricDot:    { width: 6, height: 6, borderRadius: R.full },
  metricLabel: {
    fontFamily:    Fonts.ui.semibold,
    fontSize:      9,
    letterSpacing: 0.9,
    color:         Colors.text.tertiary,
  },
  metricAmount: {
    fontFamily:    Fonts.ui.bold,
    fontSize:      26,
    letterSpacing: -0.8,
    lineHeight:    30,
  },
  metricSub: { marginTop: 3 },

  listItem: {
    paddingVertical:   S[4],
    paddingHorizontal: S[4],
  },
  listIcon: {
    width:          38,
    height:         38,
    borderRadius:   R.sm,
    backgroundColor: Colors.neutral[200],
    alignItems:     'center',
    justifyContent: 'center',
  },
  listTitle: {
    fontFamily: Fonts.ui.medium,
    fontSize:   14,
    color:      Colors.text.primary,
    marginBottom: 2,
  },
  arrow: {
    fontSize: 18,
    color:    Colors.text.disabled,
    lineHeight: 20,
  },

  inputWrap: { gap: S[2] },
  inputLabel: {
    fontSize:      10,
    letterSpacing: 0.8,
    color:         Colors.text.tertiary,
  },
  input: {
    backgroundColor: Colors.bg.input,
    borderRadius:    R.sm,
    borderWidth:     1,
    borderColor:     Colors.border.default,
    padding:         S[4],
    fontFamily:      Fonts.ui.regular,
    fontSize:        15,
    color:           Colors.text.primary,
  },

  empty: {
    alignItems:      'center',
    paddingVertical: S[12],
    paddingHorizontal: S[8],
  },
});

// ── Short aliases (used by screens) ──────────────────────────
export const T = {
  Hero:    HeroAmount,
  Display: DisplayAmount,
  Title,
  Heading,
  H:       Heading,
  Body,
  Small,
  Label,
  Caption,
  Cap:     Caption,
};
export function Spacer({ h = 0, w = 0 }: { h?: number; w?: number }) {
  return <View style={{ height: h, width: w }} />;
}
