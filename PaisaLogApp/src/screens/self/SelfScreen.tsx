// src/screens/self/SelfScreen.tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, Dimensions, FlatList, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { format_date } from '../../utils/date';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Row, Card, Divider, Spacer, Btn } from '../../design/components';
import { Transactions, User, PersonalTargets, QK } from '../../services/api';
import { fmt_money } from '../../utils/money';
import { getCat } from '../spend/categories';

const SCREEN_H = Dimensions.get('window').height;
const CAT = { income: '#43AA8B', expense: '#EF4444', investment: '#F8961E', saving: '#0EA5E9', target: '#B45309' };
const TABS = [
  { label: 'Overall', color: '#334155' },
  { label: 'Income', color: CAT.income },
  { label: 'Expenses', color: CAT.expense },
  { label: 'Investments', color: CAT.investment },
];

function make_range(offset = 0) {
  const d = dayjs().subtract(offset, 'month');
  return {
    start: d.startOf('month').format('YYYY-MM-DD'),
    end: offset === 0 ? dayjs().format('YYYY-MM-DD') : d.endOf('month').format('YYYY-MM-DD'),
    label: offset === 0 ? 'This month' : d.format('MMM YYYY'),
  };
}

function Bar({ segments, total, height = 8 }: any) {
  if (total === 0) return <View style={{ height, backgroundColor: C.n[200], borderRadius: br.full }} />;
  return (
    <View style={{ height, flexDirection: 'row', borderRadius: br.full, overflow: 'hidden', backgroundColor: C.n[200] }}>
      {(segments as any[]).filter(s => s.value > 0).map((seg, i) => (
        <View key={i} style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }} />
      ))}
    </View>
  );
}

function TxnTray({ title, txns, visible, onClose }: any) {
  const nav = useNavigation<any>();
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : SCREEN_H, useNativeDriver: true, bounciness: 4 }).start();
  }, [visible]);
  if (!visible && !txns) return null;
  const total = (txns ?? []).reduce((s: number, t: any) => s + t.amount, 0);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' } as any} activeOpacity={1} onPress={onClose} />
      <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: SCREEN_H * 0.65, backgroundColor: C.pageBg, borderTopLeftRadius: br.lg, borderTopRightRadius: br.lg, transform: [{ translateY: slideY }] }}>
        <View style={{ width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n[300], alignSelf: 'center', marginTop: sp[3] }} />
        <Between style={{ paddingHorizontal: sp[4], paddingVertical: sp[3] }}>
          <View><T.Label>{title}</T.Label><T.Cap>{(txns ?? []).length} txns · {fmt_money(total)}</T.Cap></View>
          <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: br.full, backgroundColor: C.n[200], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, color: C.textSecondary }}>✕</Text>
          </TouchableOpacity>
        </Between>
        <Divider />
        <FlatList
          data={txns ?? []}
          keyExtractor={(t: any) => String(t.id)}
          contentContainerStyle={{ paddingHorizontal: sp[4], paddingBottom: sp[8] }}
          ItemSeparatorComponent={() => <Divider />}
          renderItem={({ item: t }: any) => {
            const isD = t.txn_type === 'debit';
            const col = t.is_investment ? CAT.investment : isD ? CAT.expense : CAT.income;
            return (
              <TouchableOpacity activeOpacity={0.7} onPress={() => { onClose(); nav.navigate('TransactionDetail', { txnId: t.id, txn: t }); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: sp[3], gap: sp[3] }}>
                  <View style={{ width: 36, height: 36, borderRadius: br.sm, backgroundColor: col + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text>{t.is_investment ? '📈' : isD ? '↑' : '↓'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{t.merchant ?? (isD ? 'Payment' : 'Received')}</T.Small>
                    <T.Cap>{format_date(t.txn_date, 'D MMM')}</T.Cap>
                  </View>
                  <Text style={{ fontFamily: F.semibold, fontSize: 14, color: col }}>{isD ? '-' : '+'}{fmt_money(t.amount, 'INR', { compact: true })}</Text>
                  <Text style={{ color: C.textTertiary, fontSize: 12 }}>›</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </Animated.View>
    </Modal>
  );
}

function OverallTab({ summary, all_txns, targets, onTabSwitch }: any) {
  const qc = useQueryClient();
  const [show_t, setShowT] = useState(false);
  const [tray, setTray] = useState<any>(null);
  const setMut = useMutation({ mutationFn: (b: any) => PersonalTargets.set(b), onSuccess: () => qc.invalidateQueries({ queryKey: ['personal_targets'] }) });
  const inc = summary?.credit_amount ?? 0;
  const exp = summary?.debit_amount  ?? 0;
  const inv = (all_txns ?? []).filter((t: any) => t.is_investment).reduce((s: number, t: any) => s + t.amount, 0);
  const sav = Math.max(0, inc - exp - inv);
  function gt(type: string) { return (targets ?? []).find((t: any) => t.target_type === type)?.amount ?? 0; }
  function TBar({ val, type, color }: any) {
    const tgt = gt(type); if (!tgt) return null;
    const pct = Math.min((val / tgt) * 100, 100); const over = val > tgt;
    return (
      <View style={{ marginTop: sp[2] }}>
        <View style={{ height: 3, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: br.full, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: over ? CAT.expense : CAT.target }} />
        </View>
        <T.Cap style={{ marginTop: 2, color: over ? CAT.expense : CAT.target }}>{over ? `↑ ${fmt_money(val - tgt, 'INR', { compact: true })} over` : `${fmt_money(tgt - val, 'INR', { compact: true })} left`} · Target: {fmt_money(tgt, 'INR', { compact: true })}</T.Cap>
      </View>
    );
  }
  const cards = [
    { label: 'Income', val: inc, color: CAT.income, bg: '#F2FAF4', border: '#C3E6CE', type: 'income', tab: 1 },
    { label: 'Expenses', val: exp, color: CAT.expense, bg: '#FDF2F2', border: '#F5CCCC', type: 'expense', tab: 2 },
    { label: 'Investments', val: inv, color: CAT.investment, bg: '#FFF7ED', border: '#FDD9AA', type: 'investment', tab: 3 },
    { label: 'Savings', val: sav, color: CAT.saving, bg: '#EFF9FF', border: '#BAE6FD', type: 'saving', tab: 0 },
  ];
  const by_cat = useMemo(() => {
    const m: Record<string, { total: number; txns: any[] }> = {};
    (all_txns ?? []).filter((t: any) => t.txn_type === 'debit' && !t.is_investment).forEach((t: any) => {
      const k = t.category ?? 'Uncategorised';
      if (!m[k]) m[k] = { total: 0, txns: [] };
      m[k].total += t.amount;
      m[k].txns.push(t);
    });
    return Object.entries(m)
      .sort((a, b) => {
        if (a[0] === 'Uncategorised') return 1;
        if (b[0] === 'Uncategorised') return -1;
        return b[1].total - a[1].total;
      })
      .slice(0, 6);
  }, [all_txns]);
  const exp_total = by_cat.reduce((s, [, v]) => s + v.total, 0);
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[2], marginBottom: sp[4] }}>
        {cards.map((cd, ci) => (
          <Card key={cd.label} padding={sp[3]} onPress={ci < 3 ? () => onTabSwitch(cd.tab) : undefined}
            style={{ flex: 1, minWidth: '45%', backgroundColor: cd.bg, borderWidth: 1, borderColor: cd.border }}>
            <T.Cap style={{ color: cd.color, fontFamily: F.semibold, opacity: 0.8 }}>{cd.label.toUpperCase()}</T.Cap>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: cd.color, marginTop: 2 }}>{fmt_money(cd.val)}</Text>
            <TBar val={cd.val} type={cd.type} color={cd.color} />
          </Card>
        ))}
      </View>
      <TouchableOpacity onPress={() => setShowT(!show_t)} style={{ marginBottom: sp[3], padding: sp[3], borderRadius: br.sm, borderWidth: 1, borderColor: C.accentBorder, backgroundColor: C.accentLight, alignItems: 'center' }}>
        <T.Small color={C.accent}>⊕ {show_t ? 'Hide' : 'Set'} monthly targets</T.Small>
      </TouchableOpacity>
      {show_t && (
        <Card padding={sp[4]} style={{ marginBottom: sp[4] }}>
          {[{ label: 'Expense limit', type: 'expense' }, { label: 'Investment target', type: 'investment' }, { label: 'Savings target', type: 'saving' }].map(t => (
            <View key={t.type} style={{ marginBottom: sp[3] }}>
              <T.Cap style={{ marginBottom: sp[1] }}>{t.label.toUpperCase()}</T.Cap>
              <TextInput style={s.input} defaultValue={gt(t.type) > 0 ? String(gt(t.type) / 100) : ''} placeholder="Amount in ₹" placeholderTextColor={C.textDisabled} keyboardType="numeric"
                onEndEditing={(e) => { const v = parseFloat(e.nativeEvent.text) * 100; if (!isNaN(v) && v >= 0) setMut.mutate({ category: 'overall', target_type: t.type, amount: Math.round(v) }); }} />
            </View>
          ))}
        </Card>
      )}
      {by_cat.length > 0 && (
        <>
          <T.Cap style={s.secHdr}>TOP EXPENSE CATEGORIES</T.Cap>
          <Card padding={sp[3]} style={{ marginBottom: sp[4] }}>
            {by_cat.map(([name, data], i) => (
              <TouchableOpacity key={name} onPress={() => setTray({ title: name, txns: data.txns })} activeOpacity={0.7}>
                <Between style={{ paddingVertical: sp[2] }}>
                  <T.Small style={{ fontFamily: F.medium }}>{getCat(name, null).label}</T.Small>
                  <Row style={{ gap: sp[3] }}>
                    <T.Cap>{exp_total > 0 ? Math.round(data.total / exp_total * 100) : 0}%</T.Cap>
                    <Text style={{ fontFamily: F.semibold, fontSize: 13, color: CAT.expense }}>{fmt_money(data.total, 'INR', { compact: true })}</Text>
                  </Row>
                </Between>
                <Bar segments={[{ value: data.total, color: CAT.expense }]} total={exp_total} height={4} />
                {i < by_cat.length - 1 && <Spacer h={sp[1]} />}
              </TouchableOpacity>
            ))}
          </Card>
        </>
      )}
      <Spacer h={sp[16]} />
      <TxnTray title={tray?.title ?? ''} txns={tray?.txns} visible={!!tray} onClose={() => setTray(null)} />
    </ScrollView>
  );
}

function IncomeTab({ all_txns }: any) {
  const [tray, setTray] = useState<any>(null);
  const filtered = useMemo(() => (all_txns ?? []).filter((t: any) => t.txn_type === 'credit'), [all_txns]);
  const grand = filtered.reduce((s: number, t: any) => s + t.amount, 0);
  const by_src = useMemo(() => { const m: Record<string, any> = {}; filtered.forEach((t: any) => { const k = t.merchant ?? 'Other'; if (!m[k]) m[k] = { total: 0, txns: [] }; m[k].total += t.amount; m[k].txns.push(t); }); return Object.entries(m).sort((a: any, b: any) => b[1].total - a[1].total); }, [filtered]);
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      <Card padding={sp[4]} style={{ marginBottom: sp[4], backgroundColor: '#F2FAF4', borderWidth: 1, borderColor: '#C3E6CE' }}>
        <T.Cap style={{ color: CAT.income }}>TOTAL INCOME</T.Cap>
        <Text style={{ fontFamily: F.bold, fontSize: 26, color: CAT.income, letterSpacing: -0.5, marginTop: 2 }}>{fmt_money(grand)}</Text>
        <T.Cap style={{ marginTop: 2 }}>{filtered.length} transactions</T.Cap>
      </Card>
      <T.Cap style={s.secHdr}>BY SOURCE</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[16] }}>
        {by_src.map(([name, d]: any, i) => (
          <View key={name}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setTray({ title: name, txns: d.txns })}>
              <View style={{ padding: sp[4] }}>
                <Between style={{ marginBottom: sp[2] }}><View style={{ flex: 1 }}><T.Small style={{ fontFamily: F.medium }}>{getCat(name, null).label}</T.Small><T.Cap>{d.txns.length} txns · {grand > 0 ? Math.round(d.total / grand * 100) : 0}%</T.Cap></View><Row style={{ gap: sp[2] }}><Text style={{ fontFamily: F.semibold, fontSize: 14, color: CAT.income }}>{fmt_money(d.total, 'INR', { compact: true })}</Text><Text style={{ color: C.textTertiary, fontSize: 14 }}>›</Text></Row></Between>
                <Bar segments={[{ value: d.total, color: CAT.income }]} total={grand} height={5} />
              </View>
            </TouchableOpacity>
            {i < by_src.length - 1 && <Divider />}
          </View>
        ))}
        {by_src.length === 0 && <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>No income this period</T.Cap></View>}
      </Card>
      <TxnTray title={tray?.title ?? ''} txns={tray?.txns} visible={!!tray} onClose={() => setTray(null)} />
    </ScrollView>
  );
}

function ExpensesTab({ all_txns }: any) {
  const [tray, setTray] = useState<any>(null);
  const filtered = useMemo(() => (all_txns ?? []).filter((t: any) => t.txn_type === 'debit' && !t.is_investment), [all_txns]);
  const grand = filtered.reduce((s: number, t: any) => s + t.amount, 0);
  const by_cat = useMemo(() => {
    const m: Record<string, any> = {};
    filtered.forEach((t: any) => {
      const k = t.category ?? 'Uncategorised';
      if (!m[k]) m[k] = { total: 0, txns: [] };
      m[k].total += t.amount;
      m[k].txns.push(t);
    });
    return Object.entries(m).sort((a: any, b: any) => {
      if (a[0] === 'Uncategorised') return 1;
      if (b[0] === 'Uncategorised') return -1;
      return b[1].total - a[1].total;
    });
  }, [filtered]);
  const by_mer = useMemo(() => { const m: Record<string, any> = {}; filtered.forEach((t: any) => { const k = t.merchant ?? 'Other'; if (!m[k]) m[k] = { total: 0, txns: [] }; m[k].total += t.amount; m[k].txns.push(t); }); return Object.entries(m).sort((a: any, b: any) => b[1].total - a[1].total); }, [filtered]);
  function R({ name, d }: any) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => setTray({ title: name, txns: d.txns })}>
        <View style={{ padding: sp[4] }}>
          <Between style={{ marginBottom: sp[2] }}><View style={{ flex: 1 }}><T.Small style={{ fontFamily: F.medium }}>{getCat(name, null).label}</T.Small><T.Cap>{d.txns.length} txns · {grand > 0 ? Math.round(d.total / grand * 100) : 0}%</T.Cap></View><Row style={{ gap: sp[2] }}><Text style={{ fontFamily: F.semibold, fontSize: 14, color: CAT.expense }}>{fmt_money(d.total, 'INR', { compact: true })}</Text><Text style={{ color: C.textTertiary, fontSize: 14 }}>›</Text></Row></Between>
          <Bar segments={[{ value: d.total, color: CAT.expense }]} total={grand} height={5} />
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      <Card padding={sp[4]} style={{ marginBottom: sp[4], backgroundColor: '#FDF2F2', borderWidth: 1, borderColor: '#F5CCCC' }}>
        <T.Cap style={{ color: CAT.expense }}>TOTAL EXPENSES</T.Cap>
        <Text style={{ fontFamily: F.bold, fontSize: 26, color: CAT.expense, letterSpacing: -0.5, marginTop: 2 }}>{fmt_money(grand)}</Text>
        <T.Cap style={{ marginTop: 2 }}>{filtered.length} transactions</T.Cap>
      </Card>
      <T.Cap style={s.secHdr}>BY CATEGORY</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[4] }}>
        {by_cat.map(([n, d]: any, i) => <View key={n}><R name={n} d={d} />{i < by_cat.length - 1 && <Divider />}</View>)}
        {by_cat.length === 0 && <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>No expenses</T.Cap></View>}
      </Card>
      <T.Cap style={s.secHdr}>BY MERCHANT / APP</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[16] }}>
        {by_mer.map(([n, d]: any, i) => <View key={n}><R name={n} d={d} />{i < by_mer.length - 1 && <Divider />}</View>)}
      </Card>
      <TxnTray title={tray?.title ?? ''} txns={tray?.txns} visible={!!tray} onClose={() => setTray(null)} />
    </ScrollView>
  );
}

function InvestmentsTab({ all_txns }: any) {
  const [tray, setTray] = useState<any>(null);
  const filtered = useMemo(() => (all_txns ?? []).filter((t: any) => t.is_investment), [all_txns]);
  const grand = filtered.reduce((s: number, t: any) => s + t.amount, 0);
  const by_plt = useMemo(() => { const m: Record<string, any> = {}; filtered.forEach((t: any) => { const k = t.merchant ?? 'Other'; if (!m[k]) m[k] = { total: 0, txns: [] }; m[k].total += t.amount; m[k].txns.push(t); }); return Object.entries(m).sort((a: any, b: any) => b[1].total - a[1].total); }, [filtered]);
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      <Card padding={sp[4]} style={{ marginBottom: sp[4], backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDD9AA' }}>
        <T.Cap style={{ color: CAT.investment }}>TOTAL INVESTMENTS</T.Cap>
        <Text style={{ fontFamily: F.bold, fontSize: 26, color: CAT.investment, letterSpacing: -0.5, marginTop: 2 }}>{fmt_money(grand)}</Text>
        <T.Cap style={{ marginTop: 2 }}>{filtered.length} transactions</T.Cap>
      </Card>
      <T.Cap style={s.secHdr}>BY PLATFORM</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[16] }}>
        {by_plt.map(([n, d]: any, i) => (
          <View key={n}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setTray({ title: n, txns: d.txns })}>
              <View style={{ padding: sp[4] }}>
                <Between style={{ marginBottom: sp[2] }}><View style={{ flex: 1 }}><T.Small style={{ fontFamily: F.medium }}>{n}</T.Small><T.Cap>{d.txns.length} txns</T.Cap></View><Row style={{ gap: sp[2] }}><Text style={{ fontFamily: F.semibold, fontSize: 14, color: CAT.investment }}>{fmt_money(d.total, 'INR', { compact: true })}</Text><Text style={{ color: C.textTertiary, fontSize: 14 }}>›</Text></Row></Between>
                <Bar segments={[{ value: d.total, color: CAT.investment }]} total={grand} height={5} />
              </View>
            </TouchableOpacity>
            {i < by_plt.length - 1 && <Divider />}
          </View>
        ))}
        {by_plt.length === 0 && <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>No investments this period</T.Cap></View>}
      </Card>
      <TxnTray title={tray?.title ?? ''} txns={tray?.txns} visible={!!tray} onClose={() => setTray(null)} />
    </ScrollView>
  );
}

export function SelfScreen() {
  const nav = useNavigation<any>();
  const [tab, setTab]       = useState(0);
  const [range, setRange]   = useState(make_range(0));
  const [showF, setShowF]   = useState(false);
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;

  const { data: me }      = useQuery({ queryKey: QK.me, queryFn: User.me });
  const { data: summary } = useQuery({ queryKey: QK.summary(range), queryFn: () => Transactions.summary(range) });
  const { data: txns }    = useQuery({ queryKey: QK.txns({ ...range, limit: 500 }), queryFn: () => Transactions.list({ ...range, limit: 500 }) });
  const { data: targets } = useQuery({ queryKey: ['personal_targets'], queryFn: PersonalTargets.get });

  // Filter sheet
  useEffect(() => {
    Animated.spring(slideY, { toValue: showF ? 0 : SCREEN_H, useNativeDriver: true, bounciness: 3 }).start();
  }, [showF]);

  const [cs, setCs] = useState(range.start);
  const [ce, setCe] = useState(range.end);
  useEffect(() => { if (showF) { setCs(range.start); setCe(range.end); } }, [showF]);

  const filter_active = range.label !== 'This month';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Between style={s.header}>
        <View>
          <T.H>{(me as any)?.name?.split(' ')[0] ?? 'My finances'}</T.H>
          <T.Cap>{range.label}</T.Cap>
        </View>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: C.accent }]} onPress={() => nav.navigate('AddTransaction')}>
          <Text style={{ color: '#fff', fontSize: 22, lineHeight: 28 }}>+</Text>
        </TouchableOpacity>
      </Between>

      <View style={s.tabs}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t.label} style={[s.tab, tab === i && { borderBottomColor: t.color }]} onPress={() => setTab(i)}>
            <Text style={[s.tabTxt, tab === i && { color: t.color, fontFamily: F.semibold }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 0 && <OverallTab summary={summary} all_txns={txns} targets={targets} onTabSwitch={setTab} />}
        {tab === 1 && <IncomeTab all_txns={txns} />}
        {tab === 2 && <ExpensesTab all_txns={txns} />}
        {tab === 3 && <InvestmentsTab all_txns={txns} />}
      </View>

      {/* Filter sheet */}
      {/* Filter FAB — same position as Family */}
      <TouchableOpacity
        style={[s.fab, filter_active && { backgroundColor: C.accent }]}
        onPress={() => setShowF(true)}
      >
        <Text style={{ fontSize: 20, color: filter_active ? '#fff' : C.textPrimary }}>⧈</Text>
      </TouchableOpacity>

      {showF && (
        <Modal visible={showF} transparent animationType="none" onRequestClose={() => setShowF(false)}>
          <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' } as any} activeOpacity={1} onPress={() => setShowF(false)} />
          <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: SCREEN_H * 0.55, backgroundColor: C.pageBg, borderTopLeftRadius: br.lg, borderTopRightRadius: br.lg, transform: [{ translateY: slideY }] }}>
            <View style={{ width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n[300], alignSelf: 'center', marginTop: sp[3], marginBottom: sp[2] }} />
            <ScrollView contentContainerStyle={{ padding: sp[4] }}>
              <Between style={{ marginBottom: sp[4] }}>
                <T.Label>Date range</T.Label>
                <TouchableOpacity onPress={() => { setRange(make_range(0)); setShowF(false); }}><T.Small color={C.accent}>Reset</T.Small></TouchableOpacity>
              </Between>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[2], marginBottom: sp[3] }}>
                {[0, 1, 2, 3].map(i => { const p = make_range(i); const a = p.start === cs && p.end === ce; return (
                  <TouchableOpacity key={i} style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.full, backgroundColor: a ? C.accentLight : C.n[200], borderWidth: 1, borderColor: a ? C.accentBorder : C.borderFaint }} onPress={() => { setCs(p.start); setCe(p.end); }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 12, color: a ? C.accent : C.textSecondary }}>{p.label}</Text>
                  </TouchableOpacity>
                ); })}
              </View>
              <Spacer h={sp[3]} />
              <Btn label="Apply" onPress={() => { const lbl = `${format_date(cs, 'DD-MMM-YY')} – ${format_date(ce, 'DD-MMM-YY')}`; setRange({ start: cs, end: ce, label: lbl }); setShowF(false); }} variant="primary" size="lg" fullWidth />
              <Spacer h={sp[4]} />
            </ScrollView>
          </Animated.View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  iconBtn:{ width: 36, height: 36, borderRadius: br.full, backgroundColor: C.n[200], alignItems: 'center', justifyContent: 'center' },
  fab:     { position: 'absolute', bottom: sp[6], right: sp[4], width: 48, height: 48, borderRadius: 24, backgroundColor: C.cardBg, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  tabs:   { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  tab:    { flex: 1, alignItems: 'center', paddingVertical: sp[2], borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabTxt: { fontFamily: F.medium, fontSize: 11, color: C.textTertiary },
  secHdr: { marginBottom: sp[2], letterSpacing: 0.5 },
  input:  { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[3], fontFamily: F.regular, fontSize: 14, color: C.textPrimary },
});
