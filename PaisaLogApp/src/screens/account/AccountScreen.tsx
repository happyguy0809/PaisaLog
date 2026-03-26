// src/screens/account/AccountScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, Share, ScrollView, StyleSheet, Switch,
  TouchableOpacity, Alert, StatusBar, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { C, F, sp, br, fmt } from '../../design/tokens';
import {
  T, Between, Row, Card, Divider, Spacer,
  Bone, ListItem as Item, Chip,
} from '../../design/components';
import { User, Tok, Transactions, HouseholdApi, Export, storage, QK } from '../../services/api';
import { MPIN } from '../../services/mpin';

import { fmt_money } from '../../utils/money';


function HouseholdTargetCard({ hh }: { hh: any }) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const { data: targets } = useQuery({
    queryKey: ['household_targets', hh.id],
    queryFn:  () => HouseholdApi.targets(hh.id),
  });
  const setMut = useMutation({
    mutationFn: (body: any) => HouseholdApi.set_target(hh.id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['household_targets', hh.id] }),
  });
  const is_admin = hh.role === 'admin';
  const TARGET_TYPES = [
    { type: 'expense',    label: 'Monthly expense limit' },
    { type: 'investment', label: 'Monthly investment target' },
    { type: 'saving',     label: 'Monthly savings target' },
  ];
  function get_amt(type: string) {
    return (targets ?? []).find((t: any) => t.target_type === type)?.amount ?? 0;
  }
  return (
    <Card padding={sp[4]} style={{ marginBottom: sp[3] }}>
      <Between style={{ marginBottom: sp[3] }}>
        <View>
          <T.Small style={{ fontFamily: F.semibold, color: C.textPrimary }}>{hh.name}</T.Small>
          <T.Cap>{hh.member_count} members · {hh.role}</T.Cap>
        </View>
        {is_admin && (
          <TouchableOpacity
            onPress={() => setEditing(v => !v)}
            style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.sm, backgroundColor: C.accentLight, borderWidth: 1, borderColor: C.accentBorder }}
          >
            <T.Cap style={{ color: C.accent }}>{editing ? 'Done' : 'Edit targets'}</T.Cap>
          </TouchableOpacity>
        )}
      </Between>
      {TARGET_TYPES.map(({ type, label }) => (
        <View key={type} style={{ marginBottom: sp[3] }}>
          <Between style={{ marginBottom: sp[1] }}>
            <T.Cap>{label.toUpperCase()}</T.Cap>
            <T.Cap style={{ color: get_amt(type) > 0 ? C.accent : C.textDisabled }}>
              {get_amt(type) > 0 ? fmt_money(get_amt(type)) : 'Not set'}
            </T.Cap>
          </Between>
          {editing && (
            <TextInput
              style={s.targetInput}
              defaultValue={get_amt(type) > 0 ? String(get_amt(type) / 100) : ''}
              placeholder="Amount in ₹"
              placeholderTextColor={C.textDisabled}
              keyboardType="numeric"
              onEndEditing={(e) => {
                const amt = parseFloat(e.nativeEvent.text) * 100;
                if (!isNaN(amt) && amt > 0) {
                  setMut.mutate({ category: 'overall', target_type: type, amount: Math.round(amt) });
                }
              }}
            />
          )}
        </View>
      ))}
    </Card>
  );
}
export function AccountScreen({ setIsOnboarded }: { setIsOnboarded?: (v: boolean) => void }) {
  const nav      = useNavigation<any>();
  const qc       = useQueryClient();
  const [showLog, setShowLog] = useState(false);

  const { data: me, isLoading } = useQuery({ queryKey: QK.me, queryFn: User.me });

  const { data: my_households } = useQuery({
    queryKey: ['my_households'],
    queryFn:  HouseholdApi.my_households,
  });
  const { data: rawLog } = useQuery({
    queryKey: QK.rawLog,
    queryFn:  () => Transactions.rawLog(20),
    enabled:  showLog,
  });

  const consentMut = useMutation({
    mutationFn: ({ a, m }: { a: boolean; m: boolean }) => User.consent(a, m),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QK.me }),
  });

  const logoutMut = useMutation({
    mutationFn: () => User.logout().catch(() => {}), // ignore API errors
    onSettled:  () => { Tok.clear(); storage.delete('onboarding_done'); if (setIsOnboarded) setIsOnboarded(false); },
  });

  function onLogout() {
    Alert.alert('Sign out', 'You\'ll need a magic link to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logoutMut.mutate() },
    ]);
  }

  const plan       = me?.plan ?? 'free';
  const isPro      = plan === 'pro';
  const backupPref = storage.getString('backup_pref') ?? 'none';
  const userName   = me?.name ?? '';

  function txns_to_csv(txns: any[]): string {
    const headers = ['date','merchant','category','type','amount','currency','original_amount','original_currency','note','source'];
    const rows = txns.map((t: any) => [
      t.txn_date ?? '',
      (t.merchant ?? '').replace(/,/g, ';'),
      t.category ?? '',
      t.txn_type ?? '',
      ((t.amount ?? 0) / 100).toFixed(2),
      'INR',
      t.original_amount ? ((t.original_amount) / 100).toFixed(2) : '',
      t.original_currency ?? '',
      (t.note ?? '').replace(/,/g, ';'),
      t.sources ?? '',
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  async function handle_export(format: 'json' | 'csv' = 'json') {
    try {
      const data = await Export.my_data();
      const txns = data.transactions ?? [];
      if (format === 'csv') {
        const csv = txns_to_csv(txns);
        await Share.share({
          title: `PaisaLog_export_${data.exported_at?.slice(0,10)}.csv`,
          message: csv,
        });
      } else {
        await Share.share({
          title: `PaisaLog_export_${data.exported_at?.slice(0,10)}.json`,
          message: JSON.stringify(data, null, 2),
        });
      }
    } catch (e: any) {
      console.error('Export failed:', e?.message ?? e);
    }
  }

  function show_export_options() {
    Alert.alert('Export my data', `Choose format`, [
      { text: 'CSV (spreadsheet)', onPress: () => handle_export('csv') },
      { text: 'JSON (full data)', onPress: () => handle_export('json') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Profile card */}
        <View style={s.profileCard}>
          <Row style={{ gap: sp[3] }}>
            <View style={s.avatar}>
              <Text style={s.avatarTxt}>{userName ? userName[0].toUpperCase() : 'A'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {isLoading ? <Bone w={140} h={16} style={{ marginBottom: 6 }} /> : <T.H>{userName || 'Your account'}</T.H>}
              <T.Cap>{me?.jurisdiction ?? '—'}  ·  {isPro ? 'Pro plan' : 'Free plan'}</T.Cap>
            </View>
            {!isPro && (
              <TouchableOpacity style={s.upgradeBtn} activeOpacity={0.75}>
                <Text style={s.upgradeTxt}>Upgrade</Text>
              </TouchableOpacity>
            )}
          </Row>

          {/* Free tier limit bar */}
          {!isPro && (
            <View style={{ marginTop: sp[4], paddingTop: sp[4], borderTopWidth: 0.5, borderTopColor: C.borderFaint }}>
              <Between style={{ marginBottom: sp[2] }}>
                <T.Cap>Transactions used</T.Cap>
                <T.Cap>— / 500</T.Cap>
              </Between>
              <View style={s.limitTrack}>
                <View style={[s.limitFill, { width: '0%' }]} />
              </View>
            </View>
          )}
        </View>

        <Spacer h={sp[5]} />



        {/* Export */}
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[4] }}>
          <Item
            icon={<Text style={{ fontSize: 20 }}>📤</Text>}
            title="Export my data"
            sub="Download all your transactions as JSON"
            showArrow
            onPress={show_export_options}
          />
        </Card>

        {/* Backup */}
        <T.Cap style={s.secHdr}>BACKUP</T.Cap>
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[5] }}>
          <Item
            icon={<Text style={{ fontSize: 20 }}>{backupPref === 'drive' ? '☁' : '⚠'}</Text>}
            title={backupPref === 'drive' ? 'Google Drive' : 'No backup active'}
            sub={backupPref === 'drive' ? 'Encrypted. Stored in your account.' : 'Your data is at risk if you change phones.'}
            right={<T.Small color={C.accent}>{backupPref === 'none' ? 'Set up' : 'Manage'}</T.Small>}
            onPress={() => {}}
          />
        </Card>

        {/* Permissions */}
        <T.Cap style={s.secHdr}>PERMISSIONS</T.Cap>
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[5] }}>
          <Between style={s.switchRow}>
            <View>
              <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>Analytics</T.Small>
              <T.Cap>Helps us improve PaisaLog</T.Cap>
            </View>
            <Switch
              value={me?.analytics_consent ?? false}
              onValueChange={v => consentMut.mutate({ a: v, m: me?.marketing_consent ?? false })}
              trackColor={{ false: C.n300, true: C.investDot }}
              thumbColor={C.white}
            />
          </Between>
          <Divider ml={sp[4]} />
          <Between style={s.switchRow}>
            <View>
              <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>Marketing emails</T.Small>
              <T.Cap>Tips and product updates</T.Cap>
            </View>
            <Switch
              value={me?.marketing_consent ?? false}
              onValueChange={v => consentMut.mutate({ a: me?.analytics_consent ?? false, m: v })}
              trackColor={{ false: C.n300, true: C.investDot }}
              thumbColor={C.white}
            />
          </Between>
        </Card>

        {/* Raw signal log */}
        <Between style={[s.secHdr, { paddingRight: sp[4] }]}>
          <T.Cap>RAW SIGNAL LOG</T.Cap>
          <TouchableOpacity onPress={() => setShowLog(v => !v)}>
            <T.Cap style={{ color: C.accent }}>{showLog ? 'Hide' : 'Show'}</T.Cap>
          </TouchableOpacity>
        </Between>
        {showLog && (
          <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[5] }}>
            {(rawLog ?? []).length === 0
              ? <View style={{ padding: sp[5], alignItems: 'center' }}>
                  <T.Cap>No signals yet</T.Cap>
                </View>
              : (rawLog ?? []).map((entry: any, i: number) => {
                  const cls = entry.classification ?? 'LOW';
                  const color = cls === 'HIGH' ? C.investText : cls === 'MEDIUM' ? C.warnText : C.textTertiary;
                  const bg    = cls === 'HIGH' ? C.investBg  : cls === 'MEDIUM' ? C.warnBg   : C.n100;
                  return (
                    <View key={i}>
                      <View style={s.logRow}>
                        <View style={{ flex: 1 }}>
                          <Row style={{ gap: sp[2], marginBottom: 3 }}>
                            <View style={[s.logBadge, { backgroundColor: bg }]}>
                              <Text style={[s.logBadgeTxt, { color }]}>{cls}</Text>
                            </View>
                            <T.Cap>{dayjs(entry.received_at).format('HH:mm D MMM')}</T.Cap>
                          </Row>
                          <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>
                            {entry.parsed_merchant ?? '—'}
                          </T.Small>
                        </View>
                        {entry.parsed_amount && (
                          <T.Small style={{ fontFamily: F.semibold, color: C.spendText }}>
                            {fmt_money(entry.parsed_amount)}
                          </T.Small>
                        )}
                      </View>
                      {i < (rawLog ?? []).length - 1 && <Divider ml={sp[4]} />}
                    </View>
                  );
                })
            }
          </Card>
        )}





        {/* Sign out */}
        <Spacer h={sp[2]} />
        <TouchableOpacity style={s.signOutBtn} onPress={onLogout}>
          <Text style={s.signOutTxt}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: 'center', padding: sp[4] }}>
          <T.Cap style={{ color: C.dangerText }}>Delete account and all data</T.Cap>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.signOutBtn, { borderColor: C.accent, marginBottom: sp[2] }]}
          onPress={() => nav.navigate('LinkedAccounts')}
        >
          <T.Cap style={{ color: C.accent }}>Import Bank SMS & Emails</T.Cap>
        </TouchableOpacity>
        <T.Cap style={{ textAlign: 'center', marginBottom: sp[4] }}>PaisaLog 0.1.0 · Made in India</T.Cap>

        <Spacer h={sp[10]} />
      </ScrollView>
    </SafeAreaView>
  );
}

function navigation_replace(nav: any) {
  // No-op: logout handled by clearing tokens which triggers conditional nav
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  scroll: { paddingHorizontal: sp[4], paddingTop: sp[5] },

  profileCard: {
    backgroundColor: C.cardBg, borderRadius: br.md, padding: sp[4],
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  avatar:    { width: 48, height: 48, borderRadius: br.full, backgroundColor: C.accentLight, borderWidth: 1.5, borderColor: C.accentBorder, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontFamily: F.bold, fontSize: 20, color: C.accent },
  upgradeBtn:{ backgroundColor: C.accentLight, borderWidth: 1, borderColor: C.accentBorder, borderRadius: br.sm, paddingHorizontal: sp[3], paddingVertical: sp[1] },
  upgradeTxt:{ fontFamily: F.semibold, fontSize: 12, color: C.accent },
  limitTrack:{ height: 4, backgroundColor: C.n200, borderRadius: br.full, overflow: 'hidden' },
  limitFill: { height: '100%', backgroundColor: C.accent, borderRadius: br.full },

  secHdr:    { paddingLeft: sp[1], marginBottom: sp[2], letterSpacing: 0.8 },
  switchRow: { paddingHorizontal: sp[4], paddingVertical: sp[4] },

  logRow:     { flexDirection: 'row', alignItems: 'center', padding: sp[4] },
  logBadge:   { paddingHorizontal: sp[2], paddingVertical: 2, borderRadius: br.full },
  logBadgeTxt:{ fontFamily: F.medium, fontSize: 10, letterSpacing: 0.3 },

  signOutBtn: {
    borderWidth: 1, borderColor: C.borderDefault, borderRadius: br.sm,
    padding: sp[4], alignItems: 'center', marginBottom: sp[2],
  },
  signOutTxt:   { fontFamily: F.medium, fontSize: 15, color: C.textSecondary },
  targetInput:  { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[3], fontFamily: F.regular, fontSize: 14, color: C.textPrimary, marginTop: sp[1] },
});
