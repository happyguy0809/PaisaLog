// src/screens/spend/CategoryScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Pressable, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { format_date } from '../../utils/date';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Row, Divider, Spacer, Bone } from '../../design/components';
import { Transactions, QK } from '../../services/api';
import { getCat } from './categories';
import { fmt_money } from '../../utils/money';

export function CategoryScreen() {
  const nav   = useNavigation<any>();
  const route = useRoute<any>();
  const { catId, catLabel, color } = route.params as { catId: string; catLabel: string; color: string };

  const [month] = useState(dayjs());
  const range   = useMemo(() => ({
    start: month.startOf('month').format('YYYY-MM-DD'),
    end:   month.endOf('month').format('YYYY-MM-DD'),
  }), [month]);

  const { data: txns, isLoading } = useQuery({
    queryKey: QK.txns({ ...range, limit: 500 }),
    queryFn:  () => Transactions.list({ ...range, limit: 500 }),
  });

  // Filter to this category, group by merchant
  const merchants = useMemo(() => {
    if (!txns) return [];
    const filtered = txns.filter(t => {
      if (catId === 'investment') return t.is_investment === true;
      return t.txn_type === 'debit' && !t.is_investment &&
        (t.category ?? getCat(null, t.merchant).id) === catId;
    });
    const map: Record<string, { totalPaise: number; txns: typeof filtered }> = {};
    filtered.forEach(t => {
      const k = t.merchant ?? 'Unknown';
      if (!map[k]) map[k] = { totalPaise: 0, txns: [] };
      map[k].totalPaise += t.amount;
      map[k].txns.push(t);
    });
    return Object.entries(map)
      .map(([name, v]) => ({
        name,
        totalPaise: v.totalPaise,
        txns: v.txns.sort((a, b) => (b.txn_date ?? "").localeCompare(a.txn_date ?? "")),
      }))
      .sort((a, b) => b.totalPaise - a.totalPaise);
  }, [txns, catId]);

  const totalPaise = merchants.reduce((s, m) => s + m.totalPaise, 0);
  const totalCount = merchants.reduce((s, m) => s + m.txns.length, 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.back}>‹ Spends</Text>
        </TouchableOpacity>
      </View>

      {/* Hero */}
      <View style={s.hero}>
        <Text style={[s.heroAmt, { color }]}>{fmt_money(totalPaise)}</Text>
        <T.Cap>{catLabel}  ·  {totalCount} transaction{totalCount !== 1 ? 's' : ''}</T.Cap>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ marginBottom: sp[3] }}>
                <Bone w="100%" h={56} r={br.md} />
              </View>
            ))
          : merchants.length === 0
            ? <View style={{ alignItems: 'center', paddingTop: sp[16] }}>
                <T.Small>No transactions found</T.Small>
              </View>
            : merchants.map((m, mi) => (
                <View key={m.name} style={s.merchantBlock}>

                  {/* Merchant header row */}
                  <Between style={s.merchantHeader}>
                    <Row style={{ gap: sp[3], flex: 1 }}>
                      <View style={[s.merchantIcon, { backgroundColor: color + '18' }]}>
                        <Text style={[s.merchantInitial, { color }]}>{m.name[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <T.Small style={{ fontFamily: F.semibold, color: C.textPrimary }}>{m.name}</T.Small>
                        <T.Cap>{m.txns.length} transaction{m.txns.length !== 1 ? 's' : ''}</T.Cap>
                      </View>
                    </Row>
                    <Text style={[s.merchantAmt, { color: C.spendText }]}>{fmt_money(m.totalPaise)}</Text>
                  </Between>

                  {/* Transactions */}
                  <View style={s.txnList}>
                    {m.txns.map((txn, ti) => (
                      <View key={txn.id}>
                        <Pressable
                          style={({ pressed }) => [s.txnRow, pressed && { backgroundColor: C.n100 }]}
                          onPress={() => nav.navigate('TransactionDetail', { txnId: txn.id })}
                        >
                          <View style={{ flex: 1 }}>
                            <T.Small lines={1}>
                              {format_date(txn.txn_date, 'D MMM, ddd')}
                              {txn.acct_suffix ? `  ·  ···· ${txn.acct_suffix}` : ''}
                            </T.Small>
                            {txn.note && <T.Cap style={{ marginTop: 2 }}>{txn.note}</T.Cap>}
                          </View>
                          <Text style={[s.txnAmt, { color: C.spendText }]}>−{fmt_money(txn.amount)}</Text>
                        </Pressable>
                        {ti < m.txns.length - 1 && <Divider ml={sp[4]} />}
                      </View>
                    ))}
                  </View>
                </View>
              ))
        }
        <Spacer h={sp[10]} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingTop: sp[4], paddingBottom: sp[2] },
  back:   { fontFamily: F.medium, fontSize: 16, color: C.accent },
  hero:   { paddingHorizontal: sp[4], paddingBottom: sp[4] },
  heroAmt:{ fontFamily: F.bold, fontSize: 36, letterSpacing: -1.2, lineHeight: 40 },
  scroll: { paddingHorizontal: sp[4] },

  merchantBlock: {
    backgroundColor: C.cardBg, borderRadius: br.md,
    marginBottom: sp[3], overflow: 'hidden',
    borderWidth: 0.5, borderColor: C.borderFaint,
  },
  merchantHeader: {
    padding: sp[4],
    borderBottomWidth: 0.5, borderBottomColor: C.borderFaint,
  },
  merchantIcon: {
    width: 36, height: 36, borderRadius: br.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  merchantInitial: { fontFamily: F.bold, fontSize: 15 },
  merchantAmt:     { fontFamily: F.semibold, fontSize: 15, letterSpacing: -0.3 },

  txnList: {},
  txnRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp[4], paddingVertical: sp[3] },
  txnAmt:  { fontFamily: F.medium, fontSize: 14, letterSpacing: -0.2 },
});
