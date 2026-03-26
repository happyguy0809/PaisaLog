// src/screens/home/HomeScreen.tsx
// The home screen. Answers one question: "how am I doing?"
//
// Progressive disclosure in practice:
// — Level 1 (always visible): two numbers. Spent. Invested.
// — Level 2 (one tap): the ratio, savings rate, breakdown prompt.
// — Level 3 (separate screen): the full drill-down.
//
// The user should not need to process more than two numbers
// to understand their financial position this month.

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Colors, S, R, Fonts, fmt } from '../../design/tokens';
import {
  Between, Row, MetricCard, Card, Caption, Body, Small,
  Heading, SectionLabel, Divider, Bone, Chip, ProgressBar,
} from '../../design/components';
import { Transactions, Investments, QK } from '../../services/api';

// ── Date range for current month ──────────────────────────────

function monthRange(d = dayjs()) {
  return { start: d.startOf('month').format('YYYY-MM-DD'), end: d.endOf('month').format('YYYY-MM-DD') };
}

// ── Main screen ───────────────────────────────────────────────

export function HomeScreen() {
  const nav         = useNavigation<any>();
  const [month, setMonth] = useState(dayjs());
  const range       = useMemo(() => monthRange(month), [month]);
  const isThisMonth = month.isSame(dayjs(), 'month');

  const { data: summary, isLoading: sl, refetch: rs } = useQuery({
    queryKey: QK.summary(range),
    queryFn:  () => Transactions.summary(range),
  });

  const { data: invest, isLoading: il, refetch: ri } = useQuery({
    queryKey: QK.investments(range),
    queryFn:  () => Investments.summary(range),
  });

  const { data: recentTxns, isLoading: tl, refetch: rt } = useQuery({
    queryKey: QK.transactions({ ...range, limit: 8 }),
    queryFn:  () => Transactions.list({ ...range, limit: 8 }),
  });

  const { data: apps, isLoading: al } = useQuery({
    queryKey: QK.apps(range),
    queryFn:  () => Transactions.apps(range),
  });

  const loading   = sl || il;
  const onRefresh = () => Promise.all([rs(), ri(), rt()]);

  // Computed
  const spentPaise    = summary?.debitPaise ?? 0;
  const investedPaise = invest?.totalInvestedPaise ?? 0;
  const creditPaise   = summary?.creditPaise ?? 0;
  const netSpent      = Math.max(0, spentPaise - investedPaise);
  const savedPaise    = Math.max(0, creditPaise - spentPaise);
  const ratio         = netSpent > 0 ? Math.round((investedPaise / netSpent) * 100) : 0;
  const ratioGood     = ratio >= 100;

  // Top apps by spend (max 3, to not overwhelm)
  const topApps = (apps ?? [])
    .filter(a => a.debitPaise > 0)
    .slice(0, 3);

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg.page} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.accent.default} />
        }
      >

        {/* ── Header ─────────────────────────────────────── */}
        <Between style={styles.header}>
          <View>
            <Caption>{greeting}</Caption>
            {/* Month navigator */}
            <Row style={{ gap: S[2], marginTop: 2 }}>
              <TouchableOpacity
                onPress={() => setMonth(m => m.subtract(1, 'month'))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.chevron}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {isThisMonth ? 'This month' : month.format('MMM YYYY')}
              </Text>
              {!isThisMonth && (
                <TouchableOpacity
                  onPress={() => setMonth(m => m.add(1, 'month'))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              )}
            </Row>
          </View>

          {/* Add button */}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => nav.navigate('AddTransaction')}
            activeOpacity={0.75}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </Between>

        {/* ── The two numbers that matter ─────────────────── */}
        {/* This is the most important view in the entire app. */}
        {/* Two cards. Two numbers. Nothing else. */}
        <Row style={styles.dualCards}>
          <MetricCard
            label="Spent"
            amount={netSpent}
            type="spend"
            sub="excl. investments"
            loading={loading}
            onPress={() => nav.navigate('Spend')}
          />
          <View style={{ width: S[3] }} />
          <MetricCard
            label="Invested"
            amount={investedPaise}
            type="invest"
            sub="this month"
            loading={loading}
            onPress={() => {}}
          />
        </Row>

        {/* ── Ratio — one line, not a whole section ───────── */}
        {/* Keep it compact. It's context, not the headline. */}
        {!loading && (creditPaise > 0 || spentPaise > 0) && (
          <View style={styles.ratioRow}>
            <View style={styles.ratioBar}>
              {investedPaise > 0 && (
                <View style={[styles.ratioSegment, {
                  flex: investedPaise,
                  backgroundColor: Colors.invest.dot,
                }]} />
              )}
              {netSpent > 0 && (
                <View style={[styles.ratioSegment, {
                  flex: netSpent,
                  backgroundColor: Colors.spend.dot,
                }]} />
              )}
            </View>
            <Small style={[styles.ratioLabel, { color: ratioGood ? Colors.invest.text : Colors.text.tertiary }]}>
              {ratio > 0
                ? ratioGood
                  ? `Investing ${ratio}% of spend ✓`
                  : `Investing ${ratio}% of spend`
                : 'No investments yet'}
            </Small>
          </View>
        )}

        {/* ── Income + savings — only if there's income ───── */}
        {!loading && creditPaise > 0 && (
          <Card style={styles.savingsCard} padding={S[4]}>
            <Row style={{ gap: S[6] }}>
              <View>
                <Caption>Income</Caption>
                <Text style={styles.savingsFig}>{fmt(creditPaise)}</Text>
              </View>
              <View style={styles.savingsDivider} />
              <View>
                <Caption>Saved</Caption>
                <Text style={[styles.savingsFig, { color: savedPaise > 0 ? Colors.invest.text : Colors.text.secondary }]}>
                  {fmt(savedPaise)}
                </Text>
              </View>
              {creditPaise > 0 && (
                <>
                  <View style={styles.savingsDivider} />
                  <View>
                    <Caption>Rate</Caption>
                    <Text style={styles.savingsFig}>
                      {Math.round((savedPaise / creditPaise) * 100)}%
                    </Text>
                  </View>
                </>
              )}
            </Row>
          </Card>
        )}

        {/* ── Top spending — 3 apps only, no more ─────────── */}
        {/* If users want more, they go to Spends screen. */}
        {!al && topApps.length > 0 && (
          <View style={styles.section}>
            <SectionLabel
              label="Top spending"
              action="See all"
              onAction={() => nav.navigate('Spend')}
            />
            <Card padding={0} style={styles.appList}>
              {topApps.map((app, i) => {
                const pct = spentPaise > 0 ? (app.debitPaise / spentPaise) * 100 : 0;
                return (
                  <View key={i}>
                    <View style={styles.appRow}>
                      <View style={styles.appIconWrap}>
                        <Text style={styles.appIconText}>
                          {(app.merchant ?? 'U')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.appInfo}>
                        <Between>
                          <Small style={{ color: Colors.text.primary, fontFamily: Fonts.ui.medium }}>
                            {app.merchant ?? 'Unknown'}
                          </Small>
                          <Text style={[styles.appAmount, { color: Colors.spend.text }]}>
                            {fmt(app.debitPaise, { compact: true })}
                          </Text>
                        </Between>
                        <ProgressBar
                          value={pct}
                          color={Colors.spend.dot}
                          height={2}
                          style={{ marginTop: 6 }}
                        />
                      </View>
                    </View>
                    {i < topApps.length - 1 && <Divider inset={S[4] + 38 + S[3]} />}
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {/* ── Recent transactions ──────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel
            label="Recent"
            action="See all"
            onAction={() => nav.navigate('Spend')}
          />
          <Card padding={0} style={styles.txnList}>
            {tl
              ? Array.from({ length: 5 }).map((_, i) => (
                  <View key={i} style={styles.txnSkeleton}>
                    <Bone w={36} h={36} radius={R.sm} />
                    <View style={{ flex: 1, marginLeft: S[3] }}>
                      <Bone w={130} h={13} style={{ marginBottom: 6 }} />
                      <Bone w={80} h={10} />
                    </View>
                    <Bone w={60} h={14} />
                  </View>
                ))
              : (recentTxns ?? []).length === 0
                ? <View style={styles.txnEmpty}>
                    <Small>No transactions yet</Small>
                  </View>
                : (recentTxns ?? []).map((txn, i, arr) => {
                    const isLast  = i === arr.length - 1;
                    const isInvest = txn.isInvestment;
                    const amtColor = isInvest ? Colors.invest.text :
                                    txn.txnType === 'debit' ? Colors.spend.text :
                                    Colors.invest.text;
                    const sign = txn.txnType === 'debit' ? '−' : '+';

                    return (
                      <View key={txn.id}>
                        <Pressable
                          style={({ pressed }) => [styles.txnRow, pressed && { backgroundColor: Colors.neutral[100] }]}
                          onPress={() => nav.navigate('TransactionDetail', { txnId: txn.id })}
                        >
                          {/* Icon */}
                          <View style={styles.txnIconWrap}>
                            <Text style={styles.txnIconText}>
                              {txn.isInvestment ? '📈' : txn.txnType === 'credit' ? '↓' : '↑'}
                            </Text>
                          </View>
                          {/* Content */}
                          <View style={styles.txnContent}>
                            <Small
                              style={{ color: Colors.text.primary, fontFamily: Fonts.ui.medium }}
                              numberOfLines={1}
                            >
                              {txn.merchant ?? (txn.txnType === 'credit' ? 'Received' : 'Payment')}
                            </Small>
                            <Caption>{dayjs(txn.txnDate).format('D MMM')}</Caption>
                          </View>
                          {/* Amount */}
                          <Text style={[styles.txnAmount, { color: amtColor }]}>
                            {sign}{fmt(txn.amountPaise, { compact: true })}
                          </Text>
                        </Pressable>
                        {!isLast && <Divider inset={S[4] + 36 + S[3]} />}
                      </View>
                    );
                  })
            }
          </Card>
        </View>

        <View style={{ height: S[10] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg.page },
  scroll: { paddingHorizontal: S[4], paddingTop: S[4] },

  header: { marginBottom: S[5] },
  chevron: {
    fontSize: 22,
    color: Colors.text.tertiary,
    lineHeight: 24,
  },
  monthLabel: {
    fontFamily:    Fonts.ui.semibold,
    fontSize:      20,
    letterSpacing: -0.4,
    color:         Colors.text.primary,
  },
  addBtn: {
    paddingHorizontal: S[4],
    paddingVertical:   S[2],
    borderRadius:      R.full,
    backgroundColor:   Colors.accent.light,
    borderWidth:       1,
    borderColor:       Colors.accent.border,
  },
  addBtnText: {
    fontFamily: Fonts.ui.semibold,
    fontSize:   13,
    color:      Colors.accent.default,
  },

  dualCards: { marginBottom: S[3] },

  ratioRow: { marginBottom: S[3], gap: S[2] },
  ratioBar: {
    height:       5,
    flexDirection: 'row',
    borderRadius:  R.full,
    overflow:      'hidden',
    backgroundColor: Colors.border.light,
  },
  ratioSegment: { height: '100%' },
  ratioLabel:   { fontFamily: Fonts.ui.regular },

  savingsCard: { marginBottom: S[5] },
  savingsFig: {
    fontFamily:    Fonts.ui.semibold,
    fontSize:      17,
    color:         Colors.text.primary,
    letterSpacing: -0.3,
    marginTop:     2,
  },
  savingsDivider: {
    width:           0.5,
    height:          32,
    backgroundColor: Colors.border.light,
  },

  section: { marginBottom: S[5] },

  appList: { overflow: 'hidden' },
  appRow:  {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       S[4],
    gap:           S[3],
  },
  appIconWrap: {
    width:           38,
    height:          38,
    borderRadius:    R.sm,
    backgroundColor: Colors.neutral[200],
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  appIconText: {
    fontFamily: Fonts.ui.bold,
    fontSize:   15,
    color:      Colors.text.secondary,
  },
  appInfo: { flex: 1 },
  appAmount: {
    fontFamily:    Fonts.ui.semibold,
    fontSize:      14,
    letterSpacing: -0.3,
  },

  txnList:    { overflow: 'hidden' },
  txnSkeleton: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       S[4],
  },
  txnEmpty: {
    padding:    S[8],
    alignItems: 'center',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       S[4],
    gap:           S[3],
  },
  txnIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    R.sm,
    backgroundColor: Colors.neutral[200],
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  txnIconText: { fontSize: 16 },
  txnContent: { flex: 1 },
  txnAmount: {
    fontFamily:    Fonts.ui.semibold,
    fontSize:      14,
    letterSpacing: -0.3,
  },
});
