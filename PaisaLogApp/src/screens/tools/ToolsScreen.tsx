// src/screens/tools/ToolsScreen.tsx
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
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

// ── Derive bank name from SMS sender ID ─────────────────────
function classify_sender(sender: string): { bank: string; type: 'credit_card'|'savings'|'current'|'unknown' } {
  const s = (sender ?? '').toUpperCase().replace(/^[A-Z]{2}-/, '');
  if (s.includes('SBICRD') || s.includes('SBICGV')) return { bank: 'SBI', type: 'credit_card' };
  if (s.includes('SBIPSG') || s.includes('SBIINB')) return { bank: 'SBI', type: 'savings' };
  if (s.includes('CBSSBI'))  return { bank: 'SBI', type: 'current' };
  if (s.includes('ICICIT') || s.includes('ICICIB')) return { bank: 'ICICI', type: 'savings' };
  if (s.includes('HDFCBK') || s.includes('HDFCBN')) return { bank: 'HDFC', type: 'savings' };
  if (s.includes('HDFCCR')) return { bank: 'HDFC', type: 'credit_card' };
  if (s.includes('AXISBK')) return { bank: 'Axis', type: 'savings' };
  if (s.includes('AXISCR')) return { bank: 'Axis', type: 'credit_card' };
  if (s.includes('KOTAKB')) return { bank: 'Kotak', type: 'savings' };
  if (s.includes('INDUSB')) return { bank: 'IndusInd', type: 'savings' };
  return { bank: sender?.replace(/^[A-Z]{2}-/, '') ?? 'Unknown', type: 'unknown' };
}
function bank_from_sender(sender: string): string {
  const s = (sender ?? '').toUpperCase().replace(/^[A-Z]{2}-/, '');
  if (s.includes('SBICRD'))  return 'SBI Credit Card';
  if (s.includes('SBIPSG'))  return 'SBI Savings';
  if (s.includes('SBIINB'))  return 'SBI Net Banking';
  if (s.includes('CBSSBI'))  return 'SBI CBS';
  if (s.includes('ICICIB') || s.includes('ICICIT')) return 'ICICI Bank';
  if (s.includes('HDFCBK') || s.includes('HDFCBN')) return 'HDFC Bank';
  if (s.includes('AXISBK') || s.includes('AXISBN')) return 'Axis Bank';
  if (s.includes('KOTAKB'))  return 'Kotak Bank';
  if (s.includes('INDUSB'))  return 'IndusInd Bank';
  if (s.includes('PAYTMB'))  return 'Paytm Payments Bank';
  if (s.includes('BOIIND'))  return 'Bank of India';
  if (s.includes('PNBSMS'))  return 'PNB';
  if (s.includes('CANBNK'))  return 'Canara Bank';
  if (s.includes('UNIONB'))  return 'Union Bank';
  if (s.includes('IDFCBK'))  return 'IDFC First Bank';
  if (s.includes('AMNBNK'))  return 'Airtel Payments Bank';
  return sender?.replace(/^[A-Z]{2}-/, '') ?? 'Unknown Bank';
}

function account_icon(bank: string): string {
  if (bank.includes('Credit')) return '💳';
  if (bank.includes('Savings') || bank.includes('Net Banking')) return '🏦';
  return '🏛';
}

function AccountTxnTray({ account, visible, onClose }: any) {
  const nav = useNavigation<any>();
  const slideY = React.useRef(new Animated.Value(800)).current;
  React.useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : 800, useNativeDriver: true, bounciness: 4 }).start();
  }, [visible]);
  if (!visible) return null;
  const txns = (account.txns ?? []).sort((a: any, b: any) =>
    b.txn_date > a.txn_date ? 1 : -1);
  const col = account.bank?.includes('Credit') ? '#6366F1' : '#43AA8B';
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        activeOpacity={1} onPress={onClose} />
      <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '85%', backgroundColor: C.pageBg,
        borderTopLeftRadius: br.lg, borderTopRightRadius: br.lg,
        transform: [{ translateY: slideY }] }}>
        <View style={{ width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n300,
          alignSelf: 'center', marginTop: sp[3] }} />
        {/* Header */}
        <View style={{ padding: sp[4], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
          <Between>
            <View>
              <Text style={{ fontFamily: F.semibold, fontSize: 16, color: C.textPrimary }}>
                {account.bank}
              </Text>
              <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.textTertiary }}>
                ···· {account.acct_suffix}  ·  {txns.length} transactions
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: br.full, backgroundColor: C.n200,
                alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.textSecondary, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </Between>
          {account.last_balance != null && (
            <View style={{ marginTop: sp[2], flexDirection: 'row', gap: sp[3] }}>
              <View style={{ flex: 1, backgroundColor: col + '10', borderRadius: br.sm, padding: sp[2] }}>
                <Text style={{ fontFamily: F.regular, fontSize: 10, color: col }}>AVL BALANCE *</Text>
                <Text style={{ fontFamily: F.semibold, fontSize: 15, color: col }}>
                  {fmt_money(account.last_balance)}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#FDF2F2', borderRadius: br.sm, padding: sp[2] }}>
                <Text style={{ fontFamily: F.regular, fontSize: 10, color: '#EF4444' }}>SPENT</Text>
                <Text style={{ fontFamily: F.semibold, fontSize: 15, color: '#EF4444' }}>
                  {fmt_money(account.total_debit, 'INR', { compact: true })}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#F2FAF4', borderRadius: br.sm, padding: sp[2] }}>
                <Text style={{ fontFamily: F.regular, fontSize: 10, color: '#43AA8B' }}>RECEIVED</Text>
                <Text style={{ fontFamily: F.semibold, fontSize: 15, color: '#43AA8B' }}>
                  {fmt_money(account.total_credit, 'INR', { compact: true })}
                </Text>
              </View>
            </View>
          )}
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: sp[8] }}>
          {txns.map((t: any, i: number) => {
            const isD = t.txn_type === 'debit';
            const tcol = isD ? '#EF4444' : '#43AA8B';
            return (
              <TouchableOpacity key={t.id} activeOpacity={0.7}
                onPress={() => { onClose(); nav.navigate('TransactionDetail', { txnId: t.id, txn: t }); }}
                style={{ flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: sp[4], paddingVertical: sp[3],
                  borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.textPrimary }} numberOfLines={1}>
                    {t.merchant ?? (isD ? 'Payment' : 'Received')}
                  </Text>
                  <Text style={{ fontFamily: F.regular, fontSize: 11, color: C.textTertiary }}>
                    {t.txn_date}{t.category ? '  ·  ' + t.category : ''}
                    {t.payment_method ? '  ·  ' + t.payment_method.toUpperCase() : ''}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: tcol }}>
                  {isD ? '−' : '+'}{fmt_money(t.amount, 'INR', { compact: true })}
                </Text>
                <Text style={{ color: C.textTertiary, marginLeft: sp[2] }}>›</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function AccountsCard() {
  const now   = new Date();
  const start = React.useMemo(() => {
    if (range === '1M') return new Date(now.getFullYear(), now.getMonth()-1,   1).toISOString().split('T')[0];
    if (range === '3M') return new Date(now.getFullYear(), now.getMonth()-3,   1).toISOString().split('T')[0];
    if (range === '6M') return new Date(now.getFullYear(), now.getMonth()-6,   1).toISOString().split('T')[0];
    return '2020-01-01';
  }, [range]);
  const end   = now.toISOString().split('T')[0];
  const [tray,  setTray]    = React.useState<any>(null);
  const [range, setRange]   = React.useState<'1M'|'3M'|'6M'|'all'>('3M');
  const { data: all_txns_for_balance } = useQuery({
    queryKey: ['txns_balance_all'],
    queryFn:  () => Transactions.list({ start: '2020-01-01', end, limit: 2000 }),
    staleTime: 10 * 60 * 1000,
  });
  const { data: txns, isLoading } = useQuery({
    queryKey: ['txns_accounts', start, end],
    queryFn:  () => Transactions.list({ start, end, limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  // Extract balances from all SMS bodies
  const balances = React.useMemo(() => {
    const BAL_RE = [
      /available limit is Rs\.?([\d,]+\.?\d*)/i,
      /Avl\.? ?Bal[:\s]+Rs\.?([\d,]+\.?\d*)/i,
      /Available Bal[:\s]+Rs\.?([\d,]+\.?\d*)/i,
      /Available Credit Limit[:\s]+Rs\.?([\d,]+\.?\d*)/i,
    ];
    return (all_txns_for_balance ?? [])
      .filter((t: any) => t.raw_sms_body)
      .map((t: any) => {
        for (const re of BAL_RE) {
          const m = t.raw_sms_body.match(re);
          if (m) {
            const val = parseFloat(m[1].replace(/,/g, ''));
            if (!isNaN(val)) return {
              acct_suffix:   t.acct_suffix,
              sender_id:     t.metadata?.sender_id ?? '',
              balance_paise: Math.round(val * 100),
              snapshot_date: t.txn_date,
            };
          }
        }
        return null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.snapshot_date > a.snapshot_date ? 1 : -1);
  }, [all_txns_for_balance]);

  const accounts = React.useMemo(() => {
    if (!txns) return [];
    const map: Record<string, {
      acct_suffix: string;
      bank: string;
      bank_name: string;
      acct_type: string;
      sender: string;
      txn_count: number;
      last_txn: string;
      last_ts: number;
      total_debit: number;
      total_credit: number;
      last_balance: number | null;
      balance_date: string | null;
      txns: any[];
    }> = {};
    txns.forEach((t: any) => {
      if (!t.acct_suffix) return;  // only account-linked transactions
      const sender = t.metadata?.sender_id ?? '';
      const bank   = bank_from_sender(sender);
      const key    = t.acct_suffix;  // group by account suffix only
      const { bank: bank_name, type: acct_type } = classify_sender(sender);
      if (!map[key]) map[key] = {
        acct_suffix: t.acct_suffix,
        bank: bank_from_sender(sender),
        bank_name, acct_type, sender,  // bank from first seen sender
        txn_count: 0, last_txn: t.txn_date, last_ts: 0,
        total_debit: 0, total_credit: 0,
        last_balance: null, balance_date: null, txns: [],
      };
      map[key].txn_count++;
      if (t.txn_date > map[key].last_txn) map[key].last_txn = t.txn_date;
      const ts = t.metadata?.sms_timestamp_ms ?? 0;
      if (ts > map[key].last_ts) map[key].last_ts = ts;
      if (t.txn_type === 'debit')  map[key].total_debit  += t.amount;
      if (t.txn_type === 'credit') map[key].total_credit += t.amount;
      map[key].txns.push(t);
    });
    // Attach latest balance
    balances.forEach((b: any) => {
      const key  = b.acct_suffix;
      if (map[key] && !map[key].last_balance) {
        map[key].last_balance = b.balance_paise;
        map[key].balance_date = b.snapshot_date;
      } else if (!b.acct_suffix) {
        // No suffix — attach to first credit card found
        const cc = Object.values(map).find((a: any) => a.bank.includes('Credit'));
        if (cc && !cc.last_balance) { cc.last_balance = b.balance_paise; cc.balance_date = b.snapshot_date; }
      }
    });
    return Object.values(map).sort((a, b) => b.last_ts - a.last_ts);
  }, [txns]);

  if (isLoading) return (
    <Card padding={sp[4]} style={{ marginBottom: sp[5] }}>
      <T.Cap>Loading accounts...</T.Cap>
    </Card>
  );

  if (!accounts.length) return (
    <Card padding={sp[4]} style={{ marginBottom: sp[5] }}>
      <Between>
        <View>
          <T.Small style={{ fontFamily: F.semibold }}>Accounts</T.Small>
          <T.Cap style={{ marginTop: 2 }}>No account data yet — scan your SMS first</T.Cap>
        </View>
        <Text style={{ fontSize: 24 }}>🏦</Text>
      </Between>
    </Card>
  );

  return (
    <View style={{ marginBottom: sp[5] }}>
      <Row style={{ gap: sp[2], marginBottom: sp[3] }}>
        {(['1M','3M','6M','all'] as const).map(r => (
          <TouchableOpacity key={r} onPress={() => setRange(r)}
            style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.full,
              backgroundColor: range === r ? C.accentLight : C.n200,
              borderWidth: 1, borderColor: range === r ? C.accentBorder : C.borderFaint }}>
            <Text style={{ fontFamily: F.medium, fontSize: 12,
              color: range === r ? C.accent : C.textSecondary }}>
              {r === 'all' ? 'All time' : r}
            </Text>
          </TouchableOpacity>
        ))}
      </Row>
      {(['credit_card', 'savings', 'current', 'unknown']).map((type: any) => {
        const group = accounts.filter((a: any) => (a.acct_type ?? 'unknown') === type);
        if (!group.length) return null;
        const label = type === 'credit_card' ? 'CREDIT CARDS'
                    : type === 'savings'     ? 'SAVINGS ACCOUNTS'
                    : type === 'current'     ? 'CURRENT ACCOUNTS'
                    : 'OTHER ACCOUNTS';
        return (
          <View key={type} style={{ marginBottom: sp[4] }}>
            <T.Cap style={{ marginBottom: sp[2], letterSpacing: 0.5 }}>{label}</T.Cap>
            <Card padding={0} style={{ overflow: 'hidden' }}>
              {group.map((acc: any, i: number) => {
                const col = acc.acct_type === 'credit_card' ? '#6366F1'
                          : acc.acct_type === 'savings'     ? '#43AA8B' : '#F8961E';
                const icon = acc.acct_type === 'credit_card' ? '💳'
                           : acc.acct_type === 'savings'     ? '🏦' : '🏧';
                return (
                  <View key={acc.acct_suffix}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => setTray(acc)}
                      style={{ padding: sp[4] }}>
                      <Between>
                        <Row style={{ gap: sp[3], flex: 1 }}>
                          <View style={{ width: 40, height: 40, borderRadius: br.sm,
                            backgroundColor: col + '18', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 20 }}>{icon}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.textPrimary }}>
                              {acc.bank_name ?? acc.bank} XXXX{acc.acct_suffix}
                            </Text>
                            <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.textTertiary }}>
                              {acc.txn_count} transactions
                              {acc.last_balance != null ? `  ·  Avl: ${fmt_money(acc.last_balance, 'INR', { compact: true })} *` : ''}
                            </Text>
                          </View>
                        </Row>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontFamily: F.semibold, fontSize: 12, color: '#EF4444' }}>
                            −{fmt_money(acc.total_debit, 'INR', { compact: true })}
                          </Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 11, color: '#43AA8B' }}>
                            +{fmt_money(acc.total_credit, 'INR', { compact: true })}
                          </Text>
                        </View>
                        <Text style={{ color: C.textTertiary, marginLeft: sp[2] }}>›</Text>
                      </Between>
                    </TouchableOpacity>
                    {i < group.length - 1 && <Divider />}
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
      <Text style={{ fontFamily: F.regular, fontSize: 11, color: C.textTertiary, marginTop: sp[2], paddingHorizontal: sp[1] }}>
        * Based on SMS transactions received. Balances not available — rescan SMS to update.
      </Text>
      {tray && <AccountTxnTray account={tray} visible={!!tray} onClose={() => setTray(null)} />}
    </View>
  );
}

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
  const [toolTab, setToolTab] = React.useState<'tools'|'accounts'>('tools');
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
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
        <TouchableOpacity onPress={() => setToolTab('tools')}
          style={{ flex: 1, alignItems: 'center', paddingVertical: sp[2],
            borderBottomWidth: 2, borderBottomColor: toolTab === 'tools' ? C.accent : 'transparent' }}>
          <Text style={{ fontFamily: F.medium, fontSize: 13,
            color: toolTab === 'tools' ? C.accent : C.textTertiary }}>Tools</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setToolTab('accounts')}
          style={{ flex: 1, alignItems: 'center', paddingVertical: sp[2],
            borderBottomWidth: 2, borderBottomColor: toolTab === 'accounts' ? C.accent : 'transparent' }}>
          <Text style={{ fontFamily: F.medium, fontSize: 13,
            color: toolTab === 'accounts' ? C.accent : C.textTertiary }}>Accounts</Text>
        </TouchableOpacity>
      </View>
      {toolTab === 'accounts' ? (
        <ScrollView contentContainerStyle={{ padding: sp[4] }} showsVerticalScrollIndicator={false}>
          <AccountsCard />
          <Spacer h={sp[10]} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: sp[4] }} showsVerticalScrollIndicator={false}>
          <T.Cap style={s.secHdr}>SUBSCRIPTIONS</T.Cap>
          <SubscriptionsCard />
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
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  secHdr: { marginBottom: sp[2], letterSpacing: 0.5, paddingLeft: sp[1] },
});
