// src/screens/tools/ToolsScreen.tsx
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { detect_subscriptions } from '../../services/subscriptions';
import { fmt_money } from '../../utils/money';
import { format_date } from '../../utils/date';
import { Transactions } from '../../services/api';
import { C, F, sp, br } from '../../design/tokens';
import { T, Card, Divider, Spacer, ListItem as Item, Between, Row } from '../../design/components';
import { MPIN } from '../../services/mpin';

const FREQ_LABEL: Record<string, string> = {
  monthly: 'Monthly', weekly: 'Weekly', quarterly: 'Quarterly',
};
const FREQ_COLOR: Record<string, string> = {
  monthly: '#6366F1', weekly: '#43AA8B', quarterly: '#F8961E',
};

function SubscriptionsCard() {
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split('T')[0];
  const end   = now.toISOString().split('T')[0];

  const { data: txns, isLoading } = useQuery({
    queryKey: ['txns_for_subs', start, end],
    queryFn:  () => Transactions.list({ start, end, limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  const subs = useMemo(() => detect_subscriptions(txns ?? []), [txns]);

  if (isLoading) return (
    <Card padding={sp[4]} style={{ marginBottom: sp[5] }}>
      <T.Cap>Detecting subscriptions...</T.Cap>
    </Card>
  );

  if (!subs.length) return (
    <Card padding={sp[4]} style={{ marginBottom: sp[5] }}>
      <Between>
        <View>
          <T.Small style={{ fontFamily: F.semibold }}>Subscriptions</T.Small>
          <T.Cap style={{ marginTop: 2 }}>No recurring charges detected yet</T.Cap>
        </View>
        <Text style={{ fontSize: 24 }}>✓</Text>
      </Between>
    </Card>
  );

  const monthly_total = subs
    .filter(s => s.frequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0);

  return (
    <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[5] }}>
      <View style={{ padding: sp[4], paddingBottom: sp[3] }}>
        <Between>
          <View>
            <T.Small style={{ fontFamily: F.semibold }}>Recurring charges</T.Small>
            <T.Cap>{subs.length} detected</T.Cap>
          </View>
          {monthly_total > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#6366F1' }}>
                {fmt_money(monthly_total)}
              </Text>
              <T.Cap>/ month</T.Cap>
            </View>
          )}
        </Between>
      </View>
      <Divider />
      {subs.slice(0, 8).map((sub, i) => {
        const color = FREQ_COLOR[sub.frequency] ?? '#999';
        const today = new Date().toISOString().split('T')[0];
        const days_until = Math.ceil((new Date(sub.next_expected).getTime() - new Date(today).getTime()) / 86400000);
        const due_soon = days_until >= 0 && days_until <= 7;
        return (
          <View key={sub.merchant + i}>
            <View style={{ paddingHorizontal: sp[4], paddingVertical: sp[3] }}>
              <Between>
                <View style={{ flex: 1, marginRight: sp[3] }}>
                  <Row style={{ gap: sp[2], marginBottom: 2 }}>
                    <View style={{ backgroundColor: color + '18', borderRadius: br.full, paddingHorizontal: sp[2], paddingVertical: 1 }}>
                      <Text style={{ fontFamily: F.medium, fontSize: 10, color }}>{FREQ_LABEL[sub.frequency]}</Text>
                    </View>
                    {due_soon && (
                      <View style={{ backgroundColor: '#FEF9C3', borderRadius: br.full, paddingHorizontal: sp[2], paddingVertical: 1 }}>
                        <Text style={{ fontFamily: F.medium, fontSize: 10, color: '#92400E' }}>
                          {days_until === 0 ? 'Due today' : `Due in ${days_until}d`}
                        </Text>
                      </View>
                    )}
                  </Row>
                  <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{sub.merchant}</T.Small>
                  <T.Cap>Last: {format_date(sub.last_charged, 'D MMM')} · Next: {format_date(sub.next_expected, 'D MMM')}</T.Cap>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.textPrimary }}>
                    {fmt_money(sub.amount)}
                  </Text>
                  <T.Cap>{sub.occurrences} charges</T.Cap>
                </View>
              </Between>
            </View>
            {i < subs.length - 1 && i < 7 && <Divider inset={sp[4]} />}
          </View>
        );
      })}
      {subs.length > 8 && (
        <View style={{ padding: sp[3], alignItems: 'center', borderTopWidth: 0.5, borderTopColor: C.borderFaint }}>
          <T.Cap>+{subs.length - 8} more recurring charges</T.Cap>
        </View>
      )}
    </Card>
  );
}

export function ToolsScreen() {
  const nav = useNavigation<any>();
  const SECTIONS = [
    { title: 'MONEY', items: [
      { icon: '💸', title: 'Refund tracker',       sub: 'Track refunds, reversals and cashbacks', screen: 'RefundTracker' },
      { icon: '🎯', title: 'Targets',               sub: 'Personal and family monthly targets',   screen: 'Targets' },
    ]},
    { title: 'PRIVACY', items: [
      { icon: '🔒', title: 'Hidden vault',           sub: MPIN.is_set() ? 'PIN protected · tap to open' : 'Set a PIN to hide transactions', screen: 'HiddenVault' },
      { icon: '🗑️', title: 'Deleted transactions',  sub: 'Restore recently deleted transactions', screen: 'DeletedTransactions' },
    ]},

  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><T.H>Tools</T.H></View>
      <ScrollView contentContainerStyle={{ padding: sp[4] }} showsVerticalScrollIndicator={false}>

        {/* Subscriptions */}
        <T.Cap style={s.secHdr}>SUBSCRIPTIONS</T.Cap>
        <SubscriptionsCard />

        {/* Tool sections */}
        {SECTIONS.map(sec => (
          <View key={sec.title}>
            <T.Cap style={s.secHdr}>{sec.title}</T.Cap>
            <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[5] }}>
              {sec.items.map((item, i) => (
                <View key={item.title}>
                  <Item icon={<Text style={{ fontSize: 20 }}>{item.icon}</Text>}
                    title={item.title} sub={item.sub} showArrow
                    onPress={() => nav.navigate(item.screen as any)} />
                  {i < sec.items.length - 1 && <Divider inset={sp[4]} />}
                </View>
              ))}
            </Card>
          </View>
        ))}
        <Spacer h={sp[10]} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  secHdr: { marginBottom: sp[2], letterSpacing: 0.5, paddingLeft: sp[1] },
});
