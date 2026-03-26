// src/screens/family/FamilyScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Share, Linking, StatusBar, Modal,
  Animated, Dimensions, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { format_date } from '../../utils/date';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Row, Card, Divider, Spacer, Btn } from '../../design/components';
import { HouseholdApi, Transactions, User, storage, QK } from '../../services/api';
import { fmt_money } from '../../utils/money';
import { getCat } from '../spend/categories';

const HOUSEHOLD_KEY = 'household_id';
const SCREEN_H = Dimensions.get('window').height;
// Category colors — fixed, never change
const CAT_COLORS = {
  income:     '#43AA8B',
  expense:    '#EF4444',
  investment: '#F8961E',
  saving:     '#0EA5E9',
  target:     '#9333EA', // purple — distinct from all categories
};

// Member colors — rotate through these, consistent per member index
const MEMBER_COLORS = ['#577590','#6C63FF','#FF6584','#E07B39','#2D6A4F','#9B2226'];
const member_color = (i: number) => MEMBER_COLORS[i % MEMBER_COLORS.length];

// 4 tabs only — no Savings tab
const TABS = [
  { label: 'Overall',     color: '#334155', bg: '#33415510' },
  { label: 'Income',      color: CAT_COLORS.income,     bg: CAT_COLORS.income + '18' },
  { label: 'Expenses',    color: CAT_COLORS.expense,    bg: CAT_COLORS.expense + '18' },
  { label: 'Investments', color: CAT_COLORS.investment, bg: CAT_COLORS.investment + '18' },
];

function make_range(offset = 0) {
  const d = dayjs().subtract(offset, 'month');
  return {
    start: d.startOf('month').format('YYYY-MM-DD'),
    end: offset === 0 ? dayjs().format('YYYY-MM-DD') : d.endOf('month').format('YYYY-MM-DD'),
    label: offset === 0 ? 'This month' : d.format('MMM YYYY'),
  };
}

function StackedBar({ segments, total, height = 16 }: { segments: Array<{ value: number; color: string }>; total: number; height?: number }) {
  if (total === 0) return <View style={{ height, backgroundColor: C.n[200], borderRadius: br.full }} />;
  return (
    <View style={{ height, flexDirection: 'row', borderRadius: br.full, overflow: 'hidden', backgroundColor: C.n[200] }}>
      {segments.filter(s => s.value > 0).map((seg, i) => (
        <View key={i} style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }} />
      ))}
    </View>
  );
}

function FilterSheet({ visible, onClose, range, setRange, member_filter, setMemberFilter, members, member_colors }: any) {
  const [cs, setCs] = useState(range.start);
  const [ce, setCe] = useState(range.end);
  const [lm, setLm] = useState<number[]>(member_filter);
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : SCREEN_H, useNativeDriver: true, bounciness: 3 }).start();
    if (visible) { setCs(range.start); setCe(range.end); setLm(member_filter); }
  }, [visible]);
  const PRESETS = [0,1,2,3].map(make_range);
  function apply() { const lbl = `${format_date(cs, 'DD-MMM-YY')} – ${format_date(ce, 'DD-MMM-YY')}`; setRange({ start: cs, end: ce, label: lbl }); setMemberFilter(lm); onClose(); }
  function toggle(id: number) { setLm(p => p.includes(id) ? p.filter(m => m !== id) : [...p, id]); }
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={fs.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[fs.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={fs.handle} />
        <ScrollView contentContainerStyle={{ padding: sp[4] }}>
          <Between style={{ marginBottom: sp[4] }}>
            <T.Label>Filters</T.Label>
            <TouchableOpacity onPress={() => { setRange(make_range(0)); setMemberFilter([]); onClose(); }}><T.Small color={C.accent}>Reset</T.Small></TouchableOpacity>
          </Between>
          <T.Cap style={{ marginBottom: sp[2] }}>DATE RANGE</T.Cap>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[2], marginBottom: sp[3] }}>
            {PRESETS.map((p, i) => {
              const active = p.start === cs && p.end === ce;
              return <TouchableOpacity key={i} style={[fs.chip, active && fs.chipActive]} onPress={() => { setCs(p.start); setCe(p.end); }}><Text style={[fs.chipTxt, active && { color: C.accent }]}>{p.label}</Text></TouchableOpacity>;
            })}
          </View>
          <Row style={{ gap: sp[3], marginBottom: sp[4] }}>
            <View style={{ flex: 1 }}><T.Cap style={{ marginBottom: sp[1] }}>FROM</T.Cap><TextInput style={fs.dateInput} value={cs} onChangeText={setCs} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDisabled} /></View>
            <View style={{ flex: 1 }}><T.Cap style={{ marginBottom: sp[1] }}>TO</T.Cap><TextInput style={fs.dateInput} value={ce} onChangeText={setCe} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDisabled} /></View>
          </Row>
          <T.Cap style={{ marginBottom: sp[2] }}>MEMBERS</T.Cap>
          <TouchableOpacity style={[fs.mrow, lm.length === 0 && fs.mrowActive]} onPress={() => setLm([])}>
            <View style={[fs.chk, lm.length === 0 && fs.chkActive]}>{lm.length === 0 && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}</View>
            <T.Small>All members</T.Small>
          </TouchableOpacity>
          {(members ?? []).map((m: any, i: number) => {
            const color = member_colors[m.id] ?? C.accent;
            const checked = lm.includes(m.id);
            return (
              <TouchableOpacity key={m.id} style={[fs.mrow, checked && { backgroundColor: color + '10' }]} onPress={() => toggle(m.id)}>
                <View style={[fs.chk, checked && { backgroundColor: color, borderColor: color }]}>{checked && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}</View>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: sp[2] }} />
                <T.Small>{m.name || 'Member'}</T.Small>
              </TouchableOpacity>
            );
          })}
          <Spacer h={sp[4]} />
          <Btn label="Apply filters" onPress={apply} variant="primary" size="lg" fullWidth />
          <Spacer h={sp[4]} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function MemberTray({ member, range, visible, onClose, tab_filter, all_txns: hh_txns }: any) {
  const nav = useNavigation<any>();
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : SCREEN_H, useNativeDriver: true, bounciness: 4 }).start();
  }, [visible]);
  const txns = useMemo(() => {
    const base = (hh_txns ?? []).filter((t: any) => t.user_id === member?.id);
    const filtered = tab_filter === 'income'
      ? base.filter((t: any) => t.txn_type === 'credit')
      : tab_filter === 'expense'
      ? base.filter((t: any) => t.txn_type === 'debit' && !t.is_investment)
      : tab_filter === 'investment'
      ? base.filter((t: any) => t.is_investment)
      : base;
    return filtered.sort((a: any, b: any) => new Date(b.txn_date).getTime() - new Date(a.txn_date).getTime());
  }, [hh_txns, member?.id, tab_filter]);
  const isLoading = !hh_txns && !!member;
  if (!member) return null;
  const color = member.color ?? C.accent;
  const inc = (txns ?? []).filter((t: any) => t.txn_type === 'credit').reduce((s: number, t: any) => s + t.amount, 0);
  const exp = (txns ?? []).filter((t: any) => t.txn_type === 'debit' && !t.is_investment).reduce((s: number, t: any) => s + t.amount, 0);
  const inv = (txns ?? []).filter((t: any) => t.is_investment).reduce((s: number, t: any) => s + t.amount, 0);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={fs.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[mt.tray, { transform: [{ translateY: slideY }] }]}>
        <View style={mt.handle} />
        <Between style={mt.header}>
          <Row style={{ gap: sp[3] }}>
            <View style={[mt.avatar, { backgroundColor: color + '20' }]}><Text style={[mt.avatarTxt, { color }]}>{(member.name || 'A')[0].toUpperCase()}</Text></View>
            <View><T.Label>{member.name || 'Member'}</T.Label><T.Cap>{range.label}</T.Cap></View>
          </Row>
          <TouchableOpacity onPress={onClose} style={mt.closeBtn}><Text style={{ fontSize: 14, color: C.textSecondary }}>✕</Text></TouchableOpacity>
        </Between>
        <Row style={{ paddingHorizontal: sp[4], paddingBottom: sp[3], gap: sp[4] }}>
          <View><T.Cap>Income</T.Cap><Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#43AA8B' }}>+{fmt_money(inc, 'INR', { compact: true })}</Text></View>
          <View><T.Cap>Expenses</T.Cap><Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#EF4444' }}>-{fmt_money(exp, 'INR', { compact: true })}</Text></View>
          <View><T.Cap>Invested</T.Cap><Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#F8961E' }}>{fmt_money(inv, 'INR', { compact: true })}</Text></View>
          <View><T.Cap>Saved</T.Cap><Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#0EA5E9' }}>{fmt_money(Math.max(0, inc - exp - inv), { compact: true })}</Text></View>
        </Row>
        <Divider />
        {isLoading ? (
          <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>Loading...</T.Cap></View>
        ) : !txns?.length ? (
          <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>No transactions this period</T.Cap></View>
        ) : (
          <FlatList
            data={txns}
            keyExtractor={(item: any) => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: sp[4] }}
            renderItem={({ item: txn }: any) => {
              const isDebit = txn.txn_type === 'debit';
              const amtColor = txn.is_investment ? '#F8961E' : isDebit ? '#EF4444' : '#43AA8B';
              return (
                <TouchableOpacity onPress={() => { onClose(); nav.navigate('TransactionDetail', { txnId: txn.id, txn }); }} activeOpacity={0.7}>
                  <View style={[mt.txnRow, { backgroundColor: amtColor + '08', borderRadius: br.sm, marginVertical: 2, paddingHorizontal: sp[3] }]}>
                    <View style={[mt.txnIcon, { backgroundColor: amtColor + '20' }]}>
                      <Text>{txn.is_investment ? '📈' : isDebit ? '↑' : '↓'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{txn.merchant ?? (isDebit ? 'Payment' : 'Received')}</T.Small>
                      <T.Cap>{format_date(txn.txn_date, 'D MMM YYYY')}</T.Cap>
                    </View>
                    <Text style={{ fontFamily: F.semibold, fontSize: 14, color: amtColor }}>{isDebit ? '-' : '+'}{fmt_money(txn.amount, 'INR', { compact: true })}</Text>
                    <Text style={{ color: C.textTertiary, marginLeft: sp[2], fontSize: 12 }}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
        <Spacer h={sp[8]} />
      </Animated.View>
    </Modal>
  );
}

function OverallTab({ summary, all_txns, members, member_colors, member_filter, onMemberTap, targets, household_id, is_admin, onTabSwitch }: any) {
  const qc = useQueryClient();
  const [show_targets, setShowTargets] = useState(false);
  const setTargetMutation = useMutation({
    mutationFn: (body: any) => HouseholdApi.set_target(household_id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['household_targets', household_id] }),
  });
  const vm = member_filter.length > 0
    ? (summary?.members ?? []).filter((m: any) => member_filter.includes(m.user_id))
    : (summary?.members ?? []);
  const total_credit = vm.reduce((s: number, m: any) => s + (m.credit_amount ?? 0), 0);
  const total_debit  = vm.reduce((s: number, m: any) => s + m.debit_amount, 0);
  const total_invest = (all_txns ?? []).filter((t: any) => t.is_investment && (member_filter.length === 0 || member_filter.includes(t.user_id))).reduce((s: number, t: any) => s + t.amount, 0);
  const total_saved  = Math.max(0, total_credit - total_debit - total_invest);
  function get_target(type: string) { return (targets ?? []).find((t: any) => t.target_type === type)?.amount ?? 0; }
  function TargetBar({ value, type }: any) {
    const target = get_target(type);
    if (!target) return null;
    const pct  = Math.min((value / target) * 100, 100);
    const over = value > target;
    return (
      <View style={{ marginTop: sp[2] }}>
        <View style={{ height: 3, backgroundColor: C.n[200], borderRadius: br.full, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: over ? CAT_COLORS.expense : CAT_COLORS.target }} />
        </View>
        <T.Cap style={{ marginTop: 2, color: over ? CAT_COLORS.expense : CAT_COLORS.target }}>
          {over ? `↑ ${fmt_money(value - target, 'INR', { compact: true })} over` : `${fmt_money(target - value, 'INR', { compact: true })} left`}
          {' · '}Target: {fmt_money(target, 'INR', { compact: true })}
        </T.Cap>
      </View>
    );
  }
  const cards = [
    { label: 'Income',      value: total_credit, color: CAT_COLORS.income,     type: 'income',     bg: '#F2FAF4', border: '#C3E6CE' },
    { label: 'Expenses',    value: total_debit,  color: CAT_COLORS.expense,    type: 'expense',    bg: '#FDF2F2', border: '#F5CCCC' },
    { label: 'Investments', value: total_invest, color: CAT_COLORS.investment, type: 'investment', bg: '#FFF7ED', border: '#FDD9AA' },
    { label: 'Savings',     value: total_saved,  color: CAT_COLORS.saving,     type: 'saving',     bg: '#EFF9FF', border: '#BAE6FD' },
  ];
  const bars = [
    { label: 'Income',      color: CAT_COLORS.income,     getter: (m: any) => m.credit_amount ?? 0 },
    { label: 'Expenses',    color: CAT_COLORS.expense,    getter: (m: any) => m.debit_amount },
    { label: 'Investments', color: CAT_COLORS.investment, getter: (m: any) => (all_txns ?? []).filter((t: any) => t.is_investment && t.user_id === m.user_id).reduce((s: number, t: any) => s + t.amount, 0) },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      {/* 4 snapshot cards */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[2], marginBottom: sp[4] }}>
        {cards.map((cd, ci) => (
          <Card key={cd.label} padding={sp[3]} onPress={ci < 3 ? () => onTabSwitch(ci + 1) : undefined} style={{ flex: 1, minWidth: '45%', backgroundColor: cd.bg, borderWidth: 1, borderColor: cd.border }}>
            <T.Cap style={{ color: cd.color, fontFamily: F.semibold, opacity: 0.75 }}>{cd.label.toUpperCase()}</T.Cap>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: cd.color, marginTop: 2 }}>{fmt_money(cd.value)}</Text>
            <TargetBar value={cd.value} type={cd.type} color={cd.color} />
          </Card>
        ))}
      </View>
      {/* Admin targets */}
      {is_admin && (
        <TouchableOpacity style={{ marginBottom: sp[3], padding: sp[3], borderRadius: br.sm, borderWidth: 1, borderColor: C.accentBorder, backgroundColor: C.accentLight, alignItems: 'center' }} onPress={() => setShowTargets(!show_targets)}>
          <T.Small color={C.accent}>⊕ {show_targets ? 'Hide' : 'Set'} family targets</T.Small>
        </TouchableOpacity>
      )}
      {show_targets && (
        <Card padding={sp[4]} style={{ marginBottom: sp[4] }}>
          {[{ label: 'Monthly income target', type: 'income' }, { label: 'Monthly expense limit', type: 'expense' }, { label: 'Monthly investment target', type: 'investment' }].map(t => (
            <View key={t.type} style={{ marginBottom: sp[3] }}>
              <T.Cap style={{ marginBottom: sp[1] }}>{t.label.toUpperCase()}</T.Cap>
              <TextInput style={s.input} defaultValue={get_target(t.type) > 0 ? String(get_target(t.type) / 100) : ''} placeholder="Amount in Rs." placeholderTextColor={C.textDisabled} keyboardType="numeric"
                onEndEditing={(e) => { const amt = parseFloat(e.nativeEvent.text) * 100; if (!isNaN(amt) && amt > 0) setTargetMutation.mutate({ category: 'overall', target_type: t.type, amount: Math.round(amt) }); }} />
            </View>
          ))}
        </Card>
      )}
      {/* Stacked contribution bars */}
      <T.Cap style={s.secHdr}>MEMBER CONTRIBUTION</T.Cap>
      {bars.map(bar => {
        const segs = vm.map((m: any) => ({ color: member_colors[m.user_id] ?? C.accent, value: bar.getter(m) }));
        const total = segs.reduce((s: number, g: any) => s + g.value, 0);
        return (
          <View key={bar.label} style={{ marginBottom: sp[4] }}>
            <Between style={{ marginBottom: sp[2] }}>
              <T.Small style={{ fontFamily: F.medium }}>{bar.label}</T.Small>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: bar.color }}>{fmt_money(total)}</Text>
            </Between>
            <StackedBar segments={segs} total={total} height={20} />
            <Row style={{ flexWrap: 'wrap', gap: sp[2], marginTop: sp[1] }}>
              {vm.map((m: any, i: number) => { const val = segs[i]?.value ?? 0; return total > 0 && val > 0 ? <Row key={m.user_id} style={{ gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: member_colors[m.user_id] ?? C.accent }} /><T.Cap>{(m.name ?? 'M').split(' ')[0]}: {Math.round(val / total * 100)}%</T.Cap></Row> : null; })}
            </Row>
          </View>
        );
      })}
      {/* Members list with savings */}
      <T.Cap style={[s.secHdr, { marginTop: sp[2] }]}>MEMBERS — TAP FOR TRANSACTIONS</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {vm.map((m: any, i: number) => {
          const color = member_colors[m.user_id] ?? C.accent;
          const m_inv = (all_txns ?? []).filter((t: any) => t.is_investment && t.user_id === m.user_id).reduce((s: number, t: any) => s + t.amount, 0);
          const m_saved = Math.max(0, (m.credit_amount ?? 0) - m.debit_amount - m_inv);
          return (
            <View key={m.user_id}>
              <TouchableOpacity style={s.memberRow} onPress={() => onMemberTap({ ...m, id: m.user_id, color })} activeOpacity={0.6}>
                <View style={[s.dot, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{m.name || 'Member'}</T.Small>
                  <T.Cap>{m.txn_count} transactions</T.Cap>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontFamily: F.medium, fontSize: 12, color: CAT_COLORS.income }}>+{fmt_money(m.credit_amount ?? 0, 'INR', { compact: true })}</Text>
                  <Text style={{ fontFamily: F.medium, fontSize: 12, color: CAT_COLORS.expense }}>-{fmt_money(m.debit_amount, 'INR', { compact: true })}</Text>
                  <Text style={{ fontFamily: F.medium, fontSize: 12, color: CAT_COLORS.saving }}>={fmt_money(m_saved, 'INR', { compact: true })}</Text>
                </View>
                <Text style={{ color: C.textTertiary, marginLeft: sp[2] }}>›</Text>
              </TouchableOpacity>
              {i < vm.length - 1 && <Divider />}
            </View>
          );
        })}
      </Card>
      <Spacer h={sp[16]} />
    </ScrollView>
  );
}

function ExpensesTab({ all_txns, member_colors, member_filter, members, onMemberTap }: any) {
  const [group_tray, setGroupTray] = useState<{ title: string; txns: any[] } | null>(null);
  const filtered = useMemo(() => (all_txns ?? []).filter((t: any) =>
    t.txn_type === 'debit' && !t.is_investment && (member_filter.length === 0 || member_filter.includes(t.user_id))
  ), [all_txns, member_filter]);
  const grand = filtered.reduce((s: number, t: any) => s + t.amount, 0);
  const member_segs = useMemo(() => (members ?? []).map((m: any) => ({
    color: member_colors[m.id] ?? C.accent,
    value: filtered.filter((t: any) => t.user_id === m.id).reduce((s: number, t: any) => s + t.amount, 0),
  })), [filtered, members, member_colors]);
  const by_category = useMemo(() => {
    const map: Record<string, any> = {};
    filtered.forEach((t: any) => {
      const k = t.category ?? 'Uncategorised';
      if (!map[k]) map[k] = { total: 0, txns: [], segs: {} };
      map[k].total += t.amount; map[k].txns.push(t);
      map[k].segs[t.user_id] = (map[k].segs[t.user_id] ?? 0) + t.amount;
    });
    return Object.entries(map).sort((a: any, b: any) => b[1].total - a[1].total);
  }, [filtered]);
  const by_merchant = useMemo(() => {
    const map: Record<string, any> = {};
    filtered.forEach((t: any) => {
      const k = t.merchant ?? 'Other';
      if (!map[k]) map[k] = { total: 0, txns: [], segs: {} };
      map[k].total += t.amount; map[k].txns.push(t);
      map[k].segs[t.user_id] = (map[k].segs[t.user_id] ?? 0) + t.amount;
    });
    return Object.entries(map).sort((a: any, b: any) => b[1].total - a[1].total);
  }, [filtered]);
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      <Card padding={sp[4]} style={{ marginBottom: sp[3], backgroundColor: '#FDF2F2', borderWidth: 1, borderColor: '#F5CCCC' }}>
        <T.Cap style={{ color: CAT_COLORS.expense }}>TOTAL EXPENSES</T.Cap>
        <Text style={{ fontFamily: F.bold, fontSize: 26, color: CAT_COLORS.expense, letterSpacing: -0.5, marginTop: 2 }}>{fmt_money(grand)}</Text>
        <T.Cap style={{ marginTop: 2 }}>{filtered.length} transactions</T.Cap>
      </Card>
      <T.Cap style={[s.secHdr, { marginTop: sp[2] }]}>MEMBER CONTRIBUTION</T.Cap>
      <Card padding={sp[3]} style={{ marginBottom: sp[4] }}>
        <StackedBar segments={member_segs} total={grand} height={18} />
        <Row style={{ flexWrap: 'wrap', gap: sp[2], marginTop: sp[2] }}>
          {(members ?? []).map((m: any, i: number) => {
            const val = member_segs[i]?.value ?? 0;
            return val > 0 ? (
              <TouchableOpacity key={m.id} onPress={() => onMemberTap?.({ ...m, id: m.id, color: member_colors[m.id] ?? C.accent })}>
                <Row style={{ gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: member_colors[m.id] ?? C.accent }} />
                  <T.Cap>{(m.name ?? 'M').split(' ')[0]}: {grand > 0 ? Math.round(val / grand * 100) : 0}%</T.Cap>
                </Row>
              </TouchableOpacity>
            ) : null;
          })}
        </Row>
      </Card>
      <T.Cap style={s.secHdr}>BY CATEGORY</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[4] }}>
        {by_category.map(([name, data]: any, i) => {
          const segs = Object.entries(data.segs).map(([uid, amt]: any) => ({ value: amt, color: member_colors[parseInt(uid)] ?? C.accent }));
          return (
            <View key={name}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setGroupTray({ title: name, txns: data.txns })}>
                <View style={{ padding: sp[4] }}>
                  <Between style={{ marginBottom: sp[2] }}>
                    <View style={{ flex: 1 }}>
                      <T.Small style={{ fontFamily: F.medium }}>{getCat(name, null).label}</T.Small>
                      <T.Cap>{data.txns.length} transactions · {grand > 0 ? Math.round(data.total / grand * 100) : 0}%</T.Cap>
                    </View>
                    <Row style={{ gap: sp[2] }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 14, color: CAT_COLORS.expense }}>{fmt_money(data.total, 'INR', { compact: true })}</Text>
                      <Text style={{ color: C.textTertiary, fontSize: 14 }}>›</Text>
                    </Row>
                  </Between>
                  <StackedBar segments={segs} total={data.total} height={5} />
                </View>
              </TouchableOpacity>
              {i < by_category.length - 1 && <Divider />}
            </View>
          );
        })}
        {by_category.length === 0 && <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>No expenses this period</T.Cap></View>}
      </Card>
      <T.Cap style={s.secHdr}>BY MERCHANT / APP</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[16] }}>
        {by_merchant.map(([name, data]: any, i) => {
          const segs = Object.entries(data.segs).map(([uid, amt]: any) => ({ value: amt, color: member_colors[parseInt(uid)] ?? C.accent }));
          return (
            <View key={name}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setGroupTray({ title: name, txns: data.txns })}>
                <View style={{ padding: sp[4] }}>
                  <Between style={{ marginBottom: sp[2] }}>
                    <View style={{ flex: 1 }}>
                      <T.Small style={{ fontFamily: F.medium }}>{getCat(name, null).label}</T.Small>
                      <T.Cap>{data.txns.length} transactions</T.Cap>
                    </View>
                    <Row style={{ gap: sp[2] }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 14, color: CAT_COLORS.expense }}>{fmt_money(data.total, 'INR', { compact: true })}</Text>
                      <Text style={{ color: C.textTertiary, fontSize: 14 }}>›</Text>
                    </Row>
                  </Between>
                  <StackedBar segments={segs} total={data.total} height={5} />
                </View>
              </TouchableOpacity>
              {i < by_merchant.length - 1 && <Divider />}
            </View>
          );
        })}
      </Card>
      <GroupTxnTray title={group_tray?.title ?? ''} txns={group_tray?.txns} member_colors={member_colors} visible={!!group_tray} onClose={() => setGroupTray(null)} />
    </ScrollView>
  );
}

function IncomeTab({ all_txns, member_colors, member_filter, members, onMemberTap }: any) {
  const [group_tray, setGroupTray] = useState<{ title: string; txns: any[] } | null>(null);
  const filtered = useMemo(() => (all_txns ?? []).filter((t: any) =>
    t.txn_type === 'credit' && (member_filter.length === 0 || member_filter.includes(t.user_id))
  ), [all_txns, member_filter]);
  const grand = filtered.reduce((s: number, t: any) => s + t.amount, 0);
  const member_segs = useMemo(() => (members ?? []).map((m: any) => ({
    color: member_colors[m.id] ?? C.accent,
    value: filtered.filter((t: any) => t.user_id === m.id).reduce((s: number, t: any) => s + t.amount, 0),
  })), [filtered, members, member_colors]);
  const by_source = useMemo(() => {
    const map: Record<string, any> = {};
    filtered.forEach((t: any) => {
      const k = t.merchant ?? t.category ?? 'Other';
      if (!map[k]) map[k] = { total: 0, txns: [], segs: {} };
      map[k].total += t.amount; map[k].txns.push(t);
      map[k].segs[t.user_id] = (map[k].segs[t.user_id] ?? 0) + t.amount;
    });
    return Object.entries(map).sort((a: any, b: any) => b[1].total - a[1].total);
  }, [filtered]);
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      <Card padding={sp[4]} style={{ marginBottom: sp[3], backgroundColor: '#F2FAF4', borderWidth: 1, borderColor: '#C3E6CE' }}>
        <T.Cap style={{ color: CAT_COLORS.income }}>TOTAL INCOME</T.Cap>
        <Text style={{ fontFamily: F.bold, fontSize: 26, color: CAT_COLORS.income, letterSpacing: -0.5, marginTop: 2 }}>{fmt_money(grand)}</Text>
        <T.Cap style={{ marginTop: 2 }}>{filtered.length} transactions</T.Cap>
      </Card>
      <T.Cap style={[s.secHdr, { marginTop: sp[2] }]}>MEMBER CONTRIBUTION</T.Cap>
      <Card padding={sp[3]} style={{ marginBottom: sp[4] }}>
        <StackedBar segments={member_segs} total={grand} height={18} />
        <Row style={{ flexWrap: 'wrap', gap: sp[2], marginTop: sp[2] }}>
          {(members ?? []).map((m: any, i: number) => {
            const val = member_segs[i]?.value ?? 0;
            return val > 0 ? (
              <TouchableOpacity key={m.id} onPress={() => onMemberTap?.({ ...m, id: m.id, color: member_colors[m.id] ?? C.accent })}>
                <Row style={{ gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: member_colors[m.id] ?? C.accent }} />
                  <T.Cap>{(m.name ?? 'M').split(' ')[0]}: {grand > 0 ? Math.round(val / grand * 100) : 0}%</T.Cap>
                </Row>
              </TouchableOpacity>
            ) : null;
          })}
        </Row>
      </Card>
      <T.Cap style={s.secHdr}>BY SOURCE</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[16] }}>
        {by_source.map(([name, data]: any, i) => {
          const segs = Object.entries(data.segs).map(([uid, amt]: any) => ({ value: amt, color: member_colors[parseInt(uid)] ?? C.accent }));
          return (
            <View key={name}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setGroupTray({ title: name, txns: data.txns })}>
                <View style={{ padding: sp[4] }}>
                  <Between style={{ marginBottom: sp[2] }}>
                    <View style={{ flex: 1 }}>
                      <T.Small style={{ fontFamily: F.medium }}>{getCat(name, null).label}</T.Small>
                      <T.Cap>{data.txns.length} transactions · {grand > 0 ? Math.round(data.total / grand * 100) : 0}%</T.Cap>
                    </View>
                    <Row style={{ gap: sp[2] }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 14, color: CAT_COLORS.income }}>{fmt_money(data.total, 'INR', { compact: true })}</Text>
                      <Text style={{ color: C.textTertiary, fontSize: 14 }}>›</Text>
                    </Row>
                  </Between>
                  <StackedBar segments={segs} total={data.total} height={5} />
                </View>
              </TouchableOpacity>
              {i < by_source.length - 1 && <Divider />}
            </View>
          );
        })}
        {by_source.length === 0 && <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>No income this period</T.Cap></View>}
      </Card>
      <GroupTxnTray title={group_tray?.title ?? ''} txns={group_tray?.txns} member_colors={member_colors} visible={!!group_tray} onClose={() => setGroupTray(null)} />
    </ScrollView>
  );
}

function InvestmentsTab({ all_txns, member_colors, member_filter, members, onMemberTap }: any) {
  const [group_tray, setGroupTray] = useState<{ title: string; txns: any[] } | null>(null);
  const filtered = useMemo(() => (all_txns ?? []).filter((t: any) =>
    t.is_investment && (member_filter.length === 0 || member_filter.includes(t.user_id))
  ), [all_txns, member_filter]);
  const grand = filtered.reduce((s: number, t: any) => s + t.amount, 0);
  const member_segs = useMemo(() => (members ?? []).map((m: any) => ({
    color: member_colors[m.id] ?? C.accent,
    value: filtered.filter((t: any) => t.user_id === m.id).reduce((s: number, t: any) => s + t.amount, 0),
  })), [filtered, members, member_colors]);
  const by_platform = useMemo(() => {
    const map: Record<string, any> = {};
    filtered.forEach((t: any) => {
      const k = t.merchant ?? t.category ?? 'Other';
      if (!map[k]) map[k] = { total: 0, txns: [], segs: {} };
      map[k].total += t.amount; map[k].txns.push(t);
      map[k].segs[t.user_id] = (map[k].segs[t.user_id] ?? 0) + t.amount;
    });
    return Object.entries(map).sort((a: any, b: any) => b[1].total - a[1].total);
  }, [filtered]);
  return (
    <ScrollView contentContainerStyle={{ padding: sp[4] }}>
      <Card padding={sp[4]} style={{ marginBottom: sp[3], backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDD9AA' }}>
        <T.Cap style={{ color: CAT_COLORS.investment }}>TOTAL INVESTMENTS</T.Cap>
        <Text style={{ fontFamily: F.bold, fontSize: 26, color: CAT_COLORS.investment, letterSpacing: -0.5, marginTop: 2 }}>{fmt_money(grand)}</Text>
        <T.Cap style={{ marginTop: 2 }}>{filtered.length} transactions</T.Cap>
      </Card>
      <T.Cap style={[s.secHdr, { marginTop: sp[2] }]}>MEMBER CONTRIBUTION</T.Cap>
      <Card padding={sp[3]} style={{ marginBottom: sp[4] }}>
        <StackedBar segments={member_segs} total={grand} height={18} />
        <Row style={{ flexWrap: 'wrap', gap: sp[2], marginTop: sp[2] }}>
          {(members ?? []).map((m: any, i: number) => {
            const val = member_segs[i]?.value ?? 0;
            return val > 0 ? (
              <TouchableOpacity key={m.id} onPress={() => onMemberTap?.({ ...m, id: m.id, color: member_colors[m.id] ?? C.accent })}>
                <Row style={{ gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: member_colors[m.id] ?? C.accent }} />
                  <T.Cap>{(m.name ?? 'M').split(' ')[0]}: {grand > 0 ? Math.round(val / grand * 100) : 0}%</T.Cap>
                </Row>
              </TouchableOpacity>
            ) : null;
          })}
        </Row>
      </Card>
      <T.Cap style={s.secHdr}>BY PLATFORM</T.Cap>
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[16] }}>
        {by_platform.map(([name, data]: any, i) => {
          const segs = Object.entries(data.segs).map(([uid, amt]: any) => ({ value: amt, color: member_colors[parseInt(uid)] ?? C.accent }));
          return (
            <View key={name}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setGroupTray({ title: name, txns: data.txns })}>
                <View style={{ padding: sp[4] }}>
                  <Between style={{ marginBottom: sp[2] }}>
                    <View style={{ flex: 1 }}>
                      <T.Small style={{ fontFamily: F.medium }}>{getCat(name, null).label}</T.Small>
                      <T.Cap>{data.txns.length} transactions</T.Cap>
                    </View>
                    <Row style={{ gap: sp[2] }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 14, color: CAT_COLORS.investment }}>{fmt_money(data.total, 'INR', { compact: true })}</Text>
                      <Text style={{ color: C.textTertiary, fontSize: 14 }}>›</Text>
                    </Row>
                  </Between>
                  <StackedBar segments={segs} total={data.total} height={5} />
                </View>
              </TouchableOpacity>
              {i < by_platform.length - 1 && <Divider />}
            </View>
          );
        })}
        {by_platform.length === 0 && <View style={{ padding: sp[8], alignItems: 'center' }}><T.Cap>No investments this period</T.Cap></View>}
      </Card>
      <GroupTxnTray title={group_tray?.title ?? ''} txns={group_tray?.txns} member_colors={member_colors} visible={!!group_tray} onClose={() => setGroupTray(null)} />
    </ScrollView>
  );
}


function GroupTxnTray({ title, txns, member_colors, visible, onClose }: any) {
  const nav = useNavigation<any>();
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : SCREEN_H, useNativeDriver: true, bounciness: 4 }).start();
  }, [visible]);
  if (!visible && !txns) return null;
  const total = (txns ?? []).reduce((s: number, t: any) => s + t.amount, 0);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={fs.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[mt.tray, { transform: [{ translateY: slideY }] }]}>
        <View style={mt.handle} />
        <Between style={mt.header}>
          <View>
            <T.Label>{title}</T.Label>
            <T.Cap>{(txns ?? []).length} transactions · {fmt_money(total)}</T.Cap>
          </View>
          <TouchableOpacity onPress={onClose} style={mt.closeBtn}>
            <Text style={{ fontSize: 14, color: C.textSecondary }}>✕</Text>
          </TouchableOpacity>
        </Between>
        <Divider />
        <FlatList
          data={txns ?? []}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: sp[4], paddingBottom: sp[8] }}
          renderItem={({ item: txn }: any) => {
            const isDebit = txn.txn_type === 'debit';
            const amtColor = txn.is_investment ? CAT_COLORS.investment : isDebit ? CAT_COLORS.expense : CAT_COLORS.income;
            const mColor = member_colors?.[txn.user_id] ?? C.accent;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { onClose(); nav.navigate('TransactionDetail', { txnId: txn.id, txn }); }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: sp[3], gap: sp[3] }}>
                  <View style={{ width: 36, height: 36, borderRadius: br.sm, backgroundColor: amtColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14 }}>{txn.is_investment ? '📈' : isDebit ? '↑' : '↓'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>
                      {txn.merchant ?? (isDebit ? 'Payment' : 'Received')}
                    </T.Small>
                    <Row style={{ gap: sp[2], marginTop: 2 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mColor }} />
                      <T.Cap>{txn.name ?? 'Member'} · {format_date(txn.txn_date, 'D MMM')}</T.Cap>
                    </Row>
                  </View>
                  <Text style={{ fontFamily: F.semibold, fontSize: 14, color: amtColor }}>
                    {isDebit ? '-' : '+'}{fmt_money(txn.amount, 'INR', { compact: true })}
                  </Text>
                  <Text style={{ color: C.textTertiary, fontSize: 12 }}>›</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <Divider />}
        />
      </Animated.View>
    </Modal>
  );
}
export function FamilyScreen() {
  const qc = useQueryClient();
  const [active_hh,     setActiveHh]    = useState<number | null>(storage.getNumber(HOUSEHOLD_KEY) ?? null);
  const [active_tab,    setActiveTab]   = useState(0);
  const [range,         setRange]       = useState(make_range(0));
  const [member_filter, setMemberFilter] = useState<number[]>([]);
  const [show_filter,   setShowFilter]  = useState(false);
  const [show_create,   setShowCreate]  = useState(false);
  const [show_join,     setShowJoin]    = useState(false);
  const [show_add_menu, setShowAddMenu] = useState(false);
  const [family_name,   setFamilyName]  = useState('');
  const [invite_input,  setInviteInput] = useState('');
  const [tray_member,   setTrayMember]  = useState<any>(null);

  const { data: me } = useQuery({ queryKey: QK.me, queryFn: User.me });
  const { data: my_households, isLoading: hhl } = useQuery({ queryKey: ['my_households'], queryFn: HouseholdApi.my_households });

  useEffect(() => {
    if (!active_hh && my_households && my_households.length > 0) {
      const best = [...my_households].sort((a, b) => b.member_count - a.member_count)[0];
      setActiveHh(best.id); storage.set(HOUSEHOLD_KEY, best.id);
    }
  }, [my_households]);

  const { data: members } = useQuery({ queryKey: QK.household(active_hh ?? 0), queryFn: () => HouseholdApi.members(active_hh!), enabled: !!active_hh });
  const { data: summary }  = useQuery({ queryKey: QK.household_sum(active_hh ?? 0, range.start, range.end), queryFn: () => HouseholdApi.summary(active_hh!, range.start, range.end), enabled: !!active_hh });
  const { data: all_txns } = useQuery({ queryKey: ['household_txns', active_hh, range.start, range.end], queryFn: () => HouseholdApi.transactions(active_hh!, range.start, range.end), enabled: !!active_hh });
  const { data: targets }  = useQuery({ queryKey: ['household_targets', active_hh], queryFn: () => HouseholdApi.targets(active_hh!), enabled: !!active_hh });

  const member_colors = useMemo(() => { const map: Record<number, string> = {}; (members ?? []).forEach((m: any, i: number) => { map[m.id] = member_color(i); }); return map; }, [members]);
  const is_admin = members?.find((m: any) => m.id === me?.id)?.role === 'admin';

  const createMutation = useMutation({
    mutationFn: () => HouseholdApi.create(family_name.trim()),
    onSuccess: (data) => { storage.set(HOUSEHOLD_KEY, data.id); setActiveHh(data.id); setShowCreate(false); setFamilyName(''); qc.invalidateQueries({ queryKey: ['my_households'] }); share_invite(data.invite_code); },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const joinMutation = useMutation({
    mutationFn: () => HouseholdApi.join(invite_input.trim().toUpperCase()),
    onSuccess: (data) => { storage.set(HOUSEHOLD_KEY, data.household_id); setActiveHh(data.household_id); setShowJoin(false); setInviteInput(''); qc.invalidateQueries({ queryKey: ['my_households'] }); },
    onError: (e: any) => Alert.alert('Invalid code', e.message),
  });

  const leaveMutation = useMutation({
    mutationFn: () => HouseholdApi.leave(active_hh!),
    onSuccess: () => { const rem = (my_households ?? []).filter(h => h.id !== active_hh); const next = rem[0]?.id ?? null; if (next) storage.set(HOUSEHOLD_KEY, next); else storage.delete(HOUSEHOLD_KEY); setActiveHh(next); qc.invalidateQueries({ queryKey: ['my_households'] }); },
  });

  const regenMutation = useMutation({ mutationFn: () => HouseholdApi.regenerate_invite(active_hh!), onSuccess: (data) => share_invite(data.invite_code) });

  function share_invite(code: string) {
    const link = `https://paisalog.in/join/${code}`;
    const msg = `Join my family on PaisaLog!\n\n${link}\n\nCode: ${code}`;
    const wa = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Alert.alert('Invite to family', link, [
      { text: 'WhatsApp', onPress: () => Linking.canOpenURL(wa).then(ok => ok ? Linking.openURL(wa) : Share.share({ message: msg })) },
      { text: 'Email', onPress: () => Linking.openURL(`mailto:?subject=${encodeURIComponent('Join my family on PaisaLog')}&body=${encodeURIComponent(msg)}`) },
      { text: 'More', onPress: () => Share.share({ message: msg }) },
      { text: 'Cancel', style: 'cancel' },
    ], { cancelable: true });
  }

  function confirm_leave() {
    Alert.alert('Leave group', 'Your transactions will become personal.', [
      { text: 'Leave', style: 'destructive', onPress: () => leaveMutation.mutate() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const filter_active = member_filter.length > 0 || range.label !== 'This month';

  if (!hhl && (!my_households || my_households.length === 0)) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.empty}>
          <Text style={{ fontSize: 48 }}>family</Text>
          <Spacer h={sp[4]} />
          <T.H style={{ textAlign: 'center' }}>Family view</T.H>
          <T.Body style={{ textAlign: 'center', marginTop: sp[2], marginBottom: sp[6] }}>Track spending together.{'\n'}See who spent what, and where.</T.Body>
          {!show_create && !show_join && <View style={{ gap: sp[3], width: '100%' }}><Btn label="Create a family group" onPress={() => setShowCreate(true)} variant="primary" size="lg" fullWidth /><Btn label="Join with invite code" onPress={() => setShowJoin(true)} variant="ghost" size="lg" fullWidth /></View>}
          {show_create && <View style={{ width: '100%', gap: sp[3] }}><T.Cap>FAMILY NAME</T.Cap><TextInput style={s.input} value={family_name} onChangeText={setFamilyName} placeholder="e.g. The Sharma Family" placeholderTextColor={C.textDisabled} autoFocus /><Row style={{ gap: sp[3] }}><Btn label="Cancel" onPress={() => setShowCreate(false)} variant="ghost" size="md" /><Btn label="Create" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!family_name.trim()} variant="primary" size="md" /></Row></View>}
          {show_join && <View style={{ width: '100%', gap: sp[3] }}><T.Cap>INVITE CODE</T.Cap><TextInput style={s.input} value={invite_input} onChangeText={setInviteInput} placeholder="Enter invite code" placeholderTextColor={C.textDisabled} autoCapitalize="characters" autoFocus maxLength={12} /><Row style={{ gap: sp[3] }}><Btn label="Cancel" onPress={() => setShowJoin(false)} variant="ghost" size="md" /><Btn label="Join" onPress={() => joinMutation.mutate()} loading={joinMutation.isPending} disabled={invite_input.length < 4} variant="primary" size="md" /></Row></View>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />

      {/* Group tabs - WhatsApp style */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.groupTabsScroll} contentContainerStyle={{ minWidth: '100%' }}>
        <View style={s.groupTabsRow}>
          {(my_households ?? []).map(hh => { const active = hh.id === active_hh; return (
            <TouchableOpacity key={hh.id} style={[s.groupTab, active && s.groupTabActive]} onPress={() => { setActiveHh(hh.id); storage.set(HOUSEHOLD_KEY, hh.id); }}>
              <Text style={[s.groupTabTxt, active && { color: C.accent }]} numberOfLines={1}>{hh.name}</Text>
              {active && <View style={s.groupTabUnderline} />}
            </TouchableOpacity>
          ); })}
          <TouchableOpacity style={s.groupTabAdd} onPress={() => setShowAddMenu(true)}>
            <Text style={{ color: C.accent, fontSize: 22, fontFamily: F.regular, lineHeight: 28 }}>+</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Invite + Leave under active group */}
      <Between style={s.groupActions}>
        <T.Cap style={{ color: C.textTertiary }}>{(my_households ?? []).find(h => h.id === active_hh)?.member_count ?? 0} members · {range.label}</T.Cap>
        <Row style={{ gap: sp[4] }}>
          <TouchableOpacity onPress={() => regenMutation.mutate()}><T.Small color={C.accent}>+ Invite</T.Small></TouchableOpacity>
          <TouchableOpacity onPress={confirm_leave}><T.Small color={C.dangerText}>Leave</T.Small></TouchableOpacity>
        </Row>
      </Between>

      {/* 4 Chrome-style tabs */}
      <View style={s.contentTabsRow}>
        {TABS.map((tab, i) => { const active = i === active_tab; return (
          <TouchableOpacity key={tab.label} style={[s.contentTab, active && { backgroundColor: tab.bg, borderBottomColor: tab.color }]} onPress={() => setActiveTab(i)}>
            <Text style={[s.contentTabTxt, active && { color: tab.color, fontFamily: F.semibold }]}>{tab.label}</Text>
          </TouchableOpacity>
        ); })}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {active_tab === 0 && <OverallTab summary={summary} all_txns={all_txns} members={members} member_colors={member_colors} member_filter={member_filter} onMemberTap={setTrayMember} targets={targets} household_id={active_hh} is_admin={is_admin} onTabSwitch={setActiveTab} />}
        {active_tab === 1 && <IncomeTab all_txns={all_txns} member_colors={member_colors} member_filter={member_filter} onMemberTap={setTrayMember} members={members} />}
        {active_tab === 2 && <ExpensesTab all_txns={all_txns} member_colors={member_colors} member_filter={member_filter} members={members} onMemberTap={setTrayMember} />}
        {active_tab === 3 && <InvestmentsTab all_txns={all_txns} member_colors={member_colors} member_filter={member_filter} members={members} onMemberTap={setTrayMember} />}
      </View>

      {/* Floating filter */}
      <TouchableOpacity style={[s.fab, filter_active && { backgroundColor: C.accent }]} onPress={() => setShowFilter(true)}>
        <Text style={{ color: filter_active ? '#fff' : C.textPrimary, fontSize: 18 }}>F</Text>
      </TouchableOpacity>

      <FilterSheet visible={show_filter} onClose={() => setShowFilter(false)} range={range} setRange={setRange} member_filter={member_filter} setMemberFilter={setMemberFilter} members={members} member_colors={member_colors} />
      <MemberTray member={tray_member} range={range} visible={!!tray_member} onClose={() => setTrayMember(null)} tab_filter={active_tab === 0 ? 'overall' : active_tab === 1 ? 'income' : active_tab === 2 ? 'expense' : 'investment'} all_txns={all_txns} />

      {show_add_menu && <View style={s.overlay}><TouchableOpacity style={s.overlayBg} onPress={() => setShowAddMenu(false)} /><View style={s.inlineCard}><T.Label style={{ marginBottom: sp[4] }}>Add family group</T.Label><View style={{ gap: sp[3] }}><Btn label="Create a new group" onPress={() => { setShowAddMenu(false); setShowCreate(true); }} variant="primary" size="lg" fullWidth /><Btn label="Join with invite code" onPress={() => { setShowAddMenu(false); setShowJoin(true); }} variant="ghost" size="lg" fullWidth /></View></View></View>}
      {show_create && <View style={s.overlay}><TouchableOpacity style={s.overlayBg} onPress={() => setShowCreate(false)} /><View style={s.inlineCard}><T.Label style={{ marginBottom: sp[3] }}>New family group</T.Label><TextInput style={s.input} value={family_name} onChangeText={setFamilyName} placeholder="e.g. Roommates" placeholderTextColor={C.textDisabled} autoFocus /><Row style={{ gap: sp[3], marginTop: sp[3] }}><Btn label="Cancel" onPress={() => setShowCreate(false)} variant="ghost" size="sm" /><Btn label="Create" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!family_name.trim()} variant="primary" size="sm" /></Row></View></View>}
      {show_join && <View style={s.overlay}><TouchableOpacity style={s.overlayBg} onPress={() => setShowJoin(false)} /><View style={s.inlineCard}><T.Label style={{ marginBottom: sp[3] }}>Join a family group</T.Label><TextInput style={s.input} value={invite_input} onChangeText={setInviteInput} placeholder="Enter invite code" placeholderTextColor={C.textDisabled} autoCapitalize="characters" autoFocus maxLength={12} /><Row style={{ gap: sp[3], marginTop: sp[3] }}><Btn label="Cancel" onPress={() => setShowJoin(false)} variant="ghost" size="sm" /><Btn label="Join" onPress={() => joinMutation.mutate()} loading={joinMutation.isPending} disabled={invite_input.length < 4} variant="primary" size="sm" /></Row></View></View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: C.pageBg },
  empty:           { flex: 1, paddingHorizontal: sp[6], justifyContent: 'center', alignItems: 'center' },
  input:           { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[3], fontFamily: F.regular, fontSize: 15, color: C.textPrimary },
  groupTabsScroll: { flexGrow: 0, borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  groupTabsRow:    { flexDirection: 'row', flex: 1 },
  groupTab:        { flex: 1, alignItems: 'center', paddingVertical: sp[3], minWidth: 80, position: 'relative' },
  groupTabAdd:     { width: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: sp[3], borderLeftWidth: 0.5, borderLeftColor: C.borderFaint },
  groupTabActive:  {},
  groupTabTxt:     { fontFamily: F.medium, fontSize: 13, color: C.textSecondary },
  groupTabUnderline: { position: 'absolute', bottom: 0, left: 8, right: 8, height: 2, backgroundColor: C.accent, borderRadius: br.full },
  groupActions:    { paddingHorizontal: sp[4], paddingVertical: sp[2], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  contentTabsRow:  { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  contentTab:      { flex: 1, alignItems: 'center', paddingVertical: sp[2], borderBottomWidth: 2, borderBottomColor: 'transparent' },
  contentTabTxt:   { fontFamily: F.medium, fontSize: 11, color: C.textTertiary },
  fab:             { position: 'absolute', bottom: sp[6], right: sp[4], width: 48, height: 48, borderRadius: 24, backgroundColor: C.cardBg, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  secHdr:          { marginBottom: sp[2], letterSpacing: 0.5 },
  memberRow:       { flexDirection: 'row', alignItems: 'center', padding: sp[4], gap: sp[3] },
  dot:             { width: 12, height: 12, borderRadius: 6 },
  overlay:         { ...StyleSheet.absoluteFillObject, zIndex: 100, justifyContent: 'center', padding: sp[4] },
  overlayBg:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  inlineCard:      { backgroundColor: C.cardBg, borderRadius: br.md, padding: sp[4] },
});

const fs = StyleSheet.create({
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:       { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: SCREEN_H * 0.75, backgroundColor: C.pageBg, borderTopLeftRadius: br.lg, borderTopRightRadius: br.lg },
  handle:      { width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n[300], alignSelf: 'center', marginTop: sp[3], marginBottom: sp[2] },
  chip:        { paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.full, backgroundColor: C.n[200], borderWidth: 1, borderColor: C.borderFaint },
  chipActive:  { backgroundColor: C.accentLight, borderColor: C.accentBorder },
  chipTxt:     { fontFamily: F.medium, fontSize: 12, color: C.textSecondary },
  dateInput:   { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[3], fontFamily: F.regular, fontSize: 14, color: C.textPrimary },
  mrow:        { flexDirection: 'row', alignItems: 'center', gap: sp[2], padding: sp[3], borderRadius: br.sm, marginBottom: sp[1] },
  mrowActive:  { backgroundColor: C.accentLight },
  chk:         { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: C.borderDefault, alignItems: 'center', justifyContent: 'center' },
  chkActive:   { backgroundColor: C.accent, borderColor: C.accent },
});

const mt = StyleSheet.create({
  tray:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: SCREEN_H * 0.65, backgroundColor: C.pageBg, borderTopLeftRadius: br.lg, borderTopRightRadius: br.lg },
  handle:   { width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n[300], alignSelf: 'center', marginTop: sp[3] },
  header:   { paddingHorizontal: sp[4], paddingVertical: sp[3] },
  avatar:   { width: 40, height: 40, borderRadius: br.full, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:{ fontFamily: F.bold, fontSize: 16 },
  closeBtn: { width: 32, height: 32, borderRadius: br.full, backgroundColor: C.n[200], alignItems: 'center', justifyContent: 'center' },
  txnRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: sp[3], gap: sp[3] },
  txnIcon:  { width: 36, height: 36, borderRadius: br.sm, alignItems: 'center', justifyContent: 'center' },
});

