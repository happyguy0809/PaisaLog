// src/components/AmountDisplay.tsx
// Renders transaction amount with foreign currency support.
// Primary: original currency (e.g. "AED 200")
// Secondary: home currency with asterisk (e.g. "*≈ ₹4,460")

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fmt_money } from '../utils/money';
import { F, sp, C } from '../design/tokens';

interface Props {
  amount:      number;
  original_amount?:  number | null;
  original_currency?: string | null;
  fx_rate?:          number | null;
  home_currency?:    string;
  txn_type?:         string;
  size?:             'sm' | 'md' | 'lg';
  compact?:          boolean;
  style?:            any;
}

export function AmountDisplay({
  amount,
  original_amount,
  original_currency,
  fx_rate,
  home_currency = 'INR',
  txn_type      = 'debit',
  size          = 'md',
  compact       = false,
  style,
}: Props) {
  const is_foreign = original_currency && original_currency !== home_currency && original_amount;
  const sign       = txn_type === 'credit' ? '+' : '−';
  const font_size  = size === 'lg' ? 26 : size === 'sm' ? 13 : 17;
  const is_invest  = txn_type === 'investment';

  if (is_foreign) {
    // Primary: original currency
    const primary_str = fmt_money(original_amount!, original_currency!, { compact });
    // Secondary: home currency equivalent
    const home_str    = fmt_money(amount, home_currency, { compact });

    return (
      <View style={[styles.col, style]}>
        <Text style={[styles.primary, { fontSize: font_size }]}>
          {sign}{primary_str}
        </Text>
        <Text style={styles.secondary}>
          *≈ {home_str}
          {fx_rate ? ` @ ${fx_rate.toFixed(2)}` : ''}
        </Text>
      </View>
    );
  }

  // Standard single currency
  return (
    <Text style={[styles.primary, { fontSize: font_size }, style]}>
      {sign}{fmt_money(amount, home_currency, { compact })}
    </Text>
  );
}

const styles = StyleSheet.create({
  col:       { alignItems: 'flex-end' },
  primary:   { fontFamily: F.semibold, color: C.textPrimary },
  secondary: { fontFamily: F.regular, fontSize: 11, color: C.textTertiary, marginTop: 1 },
});
