// src/components/BudgetAlertBanner.tsx
// In-app budget alert banner for Home screen.
// Compares current summary against personal targets.
// Dismissible per session via local state.
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { C, F, sp, br, fmt } from '../design/tokens';
import { T, Row, Between } from '../design/components';
import { Transactions, PersonalTargets } from '../services/api';
import { fmt_money } from '../utils/money';

interface Alert {
  type:    'expense' | 'saving' | 'investment';
  label:   string;
  pct:     number;
  current: number;
  target:  number;
  level:   'warning' | 'danger' | 'over';
}

export function BudgetAlertBanner({ start, end }: { start: string; end: string }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [opacity]   = useState(new Animated.Value(0));

  const { data: targets } = useQuery({
    queryKey: ['personal_targets'],
    queryFn:  PersonalTargets.get,
  });

  const { data: summary } = useQuery({
    queryKey: ['summary', { start, end }],
    queryFn:  () => Transactions.summary({ start, end }),
  });

  const alerts: Alert[] = [];
  if (targets && summary) {
    const expense_target    = (targets as any[]).find(t => t.target_type === 'expense')?.amount ?? 0;
    const investment_target = (targets as any[]).find(t => t.target_type === 'investment')?.amount ?? 0;

    if (expense_target > 0) {
      const pct = Math.round(((summary as any).debit_amount / expense_target) * 100);
      if (pct >= 50) {
        alerts.push({
          type: 'expense', label: 'Monthly expenses',
          pct, current: (summary as any).debit_amount, target: expense_target,
          level: pct >= 100 ? 'over' : pct >= 80 ? 'danger' : 'warning',
        });
      }
    }
  }

  // Filter out dismissed alerts
  const active = alerts.filter(a => !dismissed.includes(`${a.type}_${a.level}`));

  useEffect(() => {
    if (active.length > 0) {
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [active.length]);

  if (active.length === 0) return null;

  const alert = active[0]; // Show most critical first
  const bg    = alert.level === 'over'    ? '#FEF2F2' :
                alert.level === 'danger'  ? '#FFFBEB' : '#FFFBEB';
  const color = alert.level === 'over'    ? '#B91C1C' :
                alert.level === 'danger'  ? '#B45309' : '#B45309';
  const icon  = alert.level === 'over'    ? '🚨' :
                alert.level === 'danger'  ? '⚠️' : '📊';

  return (
    <Animated.View style={[s.banner, { backgroundColor: bg, borderColor: color + '40', opacity }]}>
      <Between>
        <Row style={{ gap: sp[3], flex: 1 }}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <T.Small style={{ fontFamily: F.semibold, color }}>
              {alert.level === 'over'   ? 'Budget exceeded' :
               alert.level === 'danger' ? 'Budget at 80%' : 'Budget at 50%'}
            </T.Small>
            <T.Cap style={{ color, marginTop: 1 }}>
              {alert.label}: {fmt_money(alert.current)} of {fmt_money(alert.target)} ({alert.pct}%)
            </T.Cap>
            {/* Progress bar */}
            <View style={{ height: 3, backgroundColor: color + '20', borderRadius: br.full, marginTop: sp[1], overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(alert.pct, 100)}%`, height: '100%', backgroundColor: color, borderRadius: br.full }} />
            </View>
          </View>
        </Row>
        <TouchableOpacity
          onPress={() => setDismissed(d => [...d, `${alert.type}_${alert.level}`])}
          style={{ padding: sp[1] }}
          hitSlop={{ top:8,bottom:8,left:8,right:8 }}
        >
          <Text style={{ color, fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </Between>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    marginHorizontal: sp[4],
    marginBottom:     sp[3],
    padding:          sp[3],
    borderRadius:     br.sm,
    borderWidth:      1,
  },
});
