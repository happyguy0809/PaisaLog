// src/screens/spend/SpendScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Pressable, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Row, Bone, Divider, Spacer } from '../../design/components';
import { Transactions, QK } from '../../services/api';
import { CATS, getCat } from './categories';
import { fmt_money } from '../../utils/money';

function monthRange(d = dayjs()) {
  return { start: d.startOf('month').format('YYYY-MM-DD'), end: d.endOf('month').format('YYYY-MM-DD') };
}

export function SpendScreen() {
  const nav    = useNavigation<any>();
  const [month, setMonth] = useState(dayjs());
  const range  = useMemo(() => monthRange(month), [month]);
  const isCurrent = month.isSame(dayjs(), 'month');

  const { data: txns, isLoading } = useQuery({
    queryKey: QK.txns({ ...range, limit: 500 }),
    queryFn:  () => Transactions.list({ ...range, limit: 500 }),
  });

  // Group by category
  const categories = useMemo(() => {
    if (!txns) return [];
    const map: Record<string, { totalPaise: number; count: number }> = {};
    txns
      .filter(t => t.txn_type === 'debit' && !t.is_investment)
      .forEach(t => {
        const id = t.category ?? getCat(null, t.merchant).id;
        if (!map[id]) map[id] = { totalPaise: 0, count: 0 };
        map[id].totalPaise += t.amount;
        map[id].count++;
      });
    return Object.entries(map)
      .map(([id, v]) => ({ id, ...v, ...(CATS[id] ?? CATS.other) }))
      .sort((a, b) => b.totalPaise - a.totalPaise);
  }, [txns]);

  const totalSpent = categories.reduce((s, c) => s + c.totalPaise, 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />

      <View style={s.header}>
        <View>
          <T.Cap>Spending breakdown</T.Cap>
          <Row style={{ gap: sp[2], marginTop: 2 }}>
            <TouchableOpacity onPress={() => setMonth(m => m.subtract(1, 'month'))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.chevron}>‹</Text>
            </TouchableOpacity>
            <Text style={s.monthTxt}>{isCurrent ? 'This month' : month.format('MMM YYYY')}</Text>
            {!isCurrent && (
              <TouchableOpacity onPress={() => setMonth(m => m.add(1, 'month'))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            )}
          </Row>
        </View>
      </View>

      {/* Total hero */}
      <View style={s.hero}>
        {isLoading
          ? <Bone w={180} h={44} r={br.sm} />
          : <Text style={s.heroAmt}>{fmt_money(totalSpent)}</Text>
        }
        <T.Cap>total spent</T.Cap>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={s.skelRow}>
                <Bone w={44} h={44} r={br.sm} />
                <View style={{ flex: 1, marginLeft: sp[3] }}>
                  <Bone w={110} h={13} style={{ marginBottom: 8 }} />
                  <Bone w="80%" h={3} r={br.full} />
                </View>
                <Bone w={72} h={14} />
              </View>
            ))
          : categories.map((cat, i) => {
              const pct = totalSpent > 0 ? Math.round((cat.totalPaise / totalSpent) * 100) : 0;
              return (
                <View key={cat.id}>
                  <Pressable
                    style={({ pressed }) => [s.catRow, pressed && { backgroundColor: C.n100 }]}
                    onPress={() => nav.navigate('Category', { catId: cat.id, catLabel: cat.label, color: cat.color })}
                  >
                    <View style={[s.catIcon, { backgroundColor: cat.color + '18' }]}>
                      <Text style={s.catEmoji}>{cat.icon}</Text>
                    </View>
                    <View style={s.catInfo}>
                      <Between style={{ marginBottom: 6 }}>
                        <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{cat.label}</T.Small>
                        <Row style={{ gap: sp[3] }}>
                          <T.Cap>{cat.count} txn{cat.count > 1 ? 's' : ''}</T.Cap>
                          <Text style={[s.catAmt, { color: C.spendText }]}>{fmt_money(cat.totalPaise)}</Text>
                        </Row>
                      </Between>
                      {/* Bar */}
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: cat.color }]} />
                      </View>
                    </View>
                    <Text style={s.chevronRight}>›</Text>
                  </Pressable>
                  {i < categories.length - 1 && <Divider ml={sp[4] + 44 + sp[3]} />}
                </View>
              );
            })
        }
        <Spacer h={sp[10]} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.pageBg },
  header:  { paddingHorizontal: sp[4], paddingTop: sp[4], paddingBottom: sp[3] },
  chevron: { fontSize: 22, color: C.textTertiary, lineHeight: 24 },
  monthTxt:{ fontFamily: F.semibold, fontSize: 20, letterSpacing: -0.4, color: C.textPrimary },
  hero:    { paddingHorizontal: sp[4], paddingBottom: sp[4] },
  heroAmt: { fontFamily: F.bold, fontSize: 38, letterSpacing: -1.5, color: C.spendText, lineHeight: 42 },
  scroll:  { paddingHorizontal: sp[4] },
  skelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: sp[4], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  catRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: sp[4], gap: sp[3] },
  catIcon: { width: 44, height: 44, borderRadius: br.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catEmoji:{ fontSize: 20 },
  catInfo: { flex: 1 },
  catAmt:  { fontFamily: F.semibold, fontSize: 14, letterSpacing: -0.3 },
  barTrack:{ height: 3, backgroundColor: C.n200, borderRadius: br.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: br.full },
  chevronRight: { fontSize: 18, color: C.textDisabled, lineHeight: 20 },
});
