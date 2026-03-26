// src/screens/account/LinkedAccountsScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { C, F, sp, br } from '../../design/tokens';
import { backfill_sms, ScanProgress, request_sms_permission, check_sms_permission } from '../../services/sms';
import { EmailAccounts, LinkedEmailAccount, storage } from '../../services/api';

const PRESETS = [
  { label: '1 Month',  months: 1  },
  { label: '3 Months', months: 3  },
  { label: '6 Months', months: 6  },
  { label: '1 Year',   months: 12 },
] as const;

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <View style={{ marginVertical: sp[3] }}>
      <View style={{ height: 5, backgroundColor: C.borderFaint, borderRadius: br.full, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${Math.min(100, pct)}%` as any, backgroundColor: C.accent, borderRadius: br.full }} />
      </View>
      <Text style={{ fontFamily: F.regular, fontSize: 11, color: C.textTertiary, marginTop: sp[1] }}>{label}</Text>
    </View>
  );
}

function pctOf(p: ScanProgress): number {
  if (p.status === 'reading')    return 5;
  if (p.status === 'filtering')  return 15;
  if (p.status === 'parsing')    return p.filtered > 0 ? 15 + (p.parsed / p.filtered) * 45 : 30;
  if (p.status === 'submitting') return p.parsed > 0 ? 60 + (p.submitted / p.parsed) * 35 : 75;
  if (p.status === 'done')       return 100;
  return 0;
}
function labelOf(p: ScanProgress): string {
  if (p.status === 'reading')    return 'Reading messages…';
  if (p.status === 'filtering')  return `${p.total.toLocaleString()} messages — filtering bank SMS…`;
  if (p.status === 'parsing')    return `Parsing ${p.filtered.toLocaleString()} bank messages…`;
  if (p.status === 'submitting') return `Uploading ${p.submitted} / ${p.parsed}…`;
  if (p.status === 'done')       return `Done — ${p.created} new transaction${p.created !== 1 ? 's' : ''} added`;
  if (p.status === 'error')      return `Error: ${p.error}`;
  return '';
}
function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function LinkedAccountsScreen() {
  const nav = useNavigation<any>();

  const [smsGranted, setSmsGranted] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    check_sms_permission().then(has => setSmsGranted(has));
  }, []);

  async function grantSms() {
    const granted = await request_sms_permission();
    setSmsGranted(granted);
    if (!granted) Alert.alert(
      'Permission required',
      'Go to Settings → Apps → PaisaLog → Permissions → SMS → Allow, then come back.',
      [{ text: 'OK' }]
    );
  }

  const [presetIdx, setPresetIdx] = useState(1);
  const [scanning,  setScanning]  = useState(false);
  const [progress,  setProgress]  = useState<ScanProgress | null>(null);
  const lastTs      = parseInt(storage.getString('sms_backfill_ts')      ?? '0', 10);
  const lastCreated = parseInt(storage.getString('sms_backfill_created')  ?? '0', 10);
  const hasDone     = storage.getString('sms_backfill_done') === 'true';

  async function runScan() {
    if (scanning) return;
    if (!smsGranted) { await grantSms(); return; }
    setScanning(true); setProgress(null);
    try {
      await backfill_sms({
        from_ms: Date.now() - PRESETS[presetIdx].months * 30 * 24 * 3600 * 1000,
        to_ms:   Date.now(),
        on_progress: setProgress,
      });
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message ?? String(e));
    } finally { setScanning(false); }
  }

  const [accounts, setAccounts] = useState<LinkedEmailAccount[]>(EmailAccounts.list);
  const [showAdd,  setShowAdd]  = useState(false);
  const [newEmail, setNewEmail] = useState('');

  function addAccount() {
    const t = newEmail.trim().toLowerCase();
    if (!t.includes('@')) { Alert.alert('Invalid email'); return; }
    try {
      const provider: LinkedEmailAccount['provider'] =
        t.endsWith('@gmail.com') ? 'gmail' :
        (t.endsWith('@outlook.com') || t.endsWith('@hotmail.com')) ? 'outlook' : 'other';
      EmailAccounts.add({ email: t, provider });
      setAccounts(EmailAccounts.list()); setNewEmail(''); setShowAdd(false);
    } catch (e: any) { Alert.alert('Error', e?.message); }
  }
  function removeAccount(id: string) {
    Alert.alert('Remove account', 'Remove this email?', [
      { text: 'Remove', style: 'destructive', onPress: () => { EmailAccounts.remove(id); setAccounts(EmailAccounts.list()); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  const icon: Record<string, string> = { gmail: '\u{1F4E7}', outlook: '\u{1F4E8}', other: '\u2709\uFE0F' };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => nav.goBack()} style={{ paddingVertical: sp[2], marginBottom: sp[2] }}>
          <Text style={{ fontFamily: F.regular, fontSize: 15, color: C.accent }}>{'←'} Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Linked Accounts</Text>
        <Text style={s.sub}>Import and manage transaction sources</Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>SMS Import</Text>
          <Text style={s.cardSub}>Scan bank messages for a chosen period. Only known bank sender IDs are read.</Text>
          {hasDone && lastTs > 0 && (
            <View style={s.lastRow}>
              <Text style={s.lastTxt}>Last scan: {fmtDate(lastTs)}{lastCreated > 0 ? `  ·  ${lastCreated} imported` : ''}</Text>
            </View>
          )}
          {smsGranted === false ? (
            <View style={s.permBox}>
              <Text style={s.permIcon}>🔒</Text>
              <Text style={s.permTitle}>SMS permission required</Text>
              <Text style={s.permSub}>
                PaisaLog needs access to read bank transaction alerts.
                OTPs are never read or stored.
              </Text>
              <TouchableOpacity style={s.primaryBtn} onPress={grantSms}>
                <Text style={s.primaryBtnTxt}>Grant SMS Access</Text>
              </TouchableOpacity>
              <Text style={s.permHint}>
                {"If the prompt doesn't appear: Settings → Apps → PaisaLog → Permissions → SMS"}
              </Text>
            </View>
          ) : (
            <>
              <Text style={s.label}>SCAN PERIOD</Text>
              <View style={s.presets}>
                {PRESETS.map((p, i) => (
                  <TouchableOpacity key={i} style={[s.preset, presetIdx === i && s.presetOn]} onPress={() => setPresetIdx(i)}>
                    <Text style={[s.presetTxt, presetIdx === i && s.presetTxtOn]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {progress && <ProgressBar pct={pctOf(progress)} label={labelOf(progress)} />}
              {progress?.status === 'done' && (
                <View style={s.doneRow}>
                  <Text style={s.doneTxt}>{'✓'}  {progress.created} new  ·  {progress.skipped} already known</Text>
                </View>
              )}
              <TouchableOpacity style={[s.primaryBtn, scanning && s.primaryBtnOff]} onPress={runScan} disabled={scanning}>
                {scanning
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.primaryBtnTxt}>Scan Last {PRESETS[presetIdx].label}</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Bank Email Accounts</Text>
          <Text style={s.cardSub}>Add Gmail / Outlook linked to your bank. Automatic email parsing coming soon.</Text>
          <View style={s.infoBox}>
            <Text style={s.infoTxt}>Adding your email now means scanning starts automatically once Gmail integration is live — no action needed later.</Text>
          </View>
          {accounts.length === 0 && !showAdd && <Text style={s.emptyTxt}>No email accounts linked yet</Text>}
          {accounts.map(acc => (
            <View key={acc.id} style={s.accRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.accEmail}>{acc.email}</Text>
                <Text style={s.accMeta}>{acc.provider}{acc.last_parsed ? `  ·  Synced ${fmtDate(acc.last_parsed)}` : '  ·  Not synced yet'}</Text>
              </View>
              <TouchableOpacity onPress={() => removeAccount(acc.id)}>
                <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.dangerText }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          {showAdd ? (
            <View style={{ marginTop: sp[3] }}>
              <TextInput style={s.input} value={newEmail} onChangeText={setNewEmail}
                placeholder="you@gmail.com" placeholderTextColor={C.textDisabled}
                keyboardType="email-address" autoCapitalize="none" autoFocus
                returnKeyType="done" onSubmitEditing={addAccount} />
              <View style={{ flexDirection: 'row', gap: sp[2], marginTop: sp[2] }}>
                <TouchableOpacity style={[s.primaryBtn, { flex: 1 }, !newEmail.includes('@') && s.primaryBtnOff]}
                  onPress={addAccount} disabled={!newEmail.includes('@')}>
                  <Text style={s.primaryBtnTxt}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.cancelBtn, { flex: 1 }]}
                  onPress={() => { setShowAdd(false); setNewEmail(''); }}>
                  <Text style={s.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
              <Text style={s.addBtnTxt}>+ Add email account</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: sp[10] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.pageBg },
  scroll:      { paddingHorizontal: sp[4], paddingTop: sp[3] },
  title:       { fontFamily: F.bold, fontSize: 28, color: C.textPrimary, letterSpacing: -0.8 },
  sub:         { fontFamily: F.regular, fontSize: 14, color: C.textSecondary, marginTop: sp[1], marginBottom: sp[5] },
  label:       { fontFamily: F.medium, fontSize: 10, letterSpacing: 0.6, color: C.textTertiary, marginBottom: sp[2] },
  card:        { backgroundColor: C.cardBg, borderRadius: br.md, borderWidth: 0.5, borderColor: C.borderFaint, padding: sp[4], marginBottom: sp[4] },
  cardTitle:   { fontFamily: F.semibold, fontSize: 16, color: C.textPrimary, marginBottom: sp[1] },
  cardSub:     { fontFamily: F.regular, fontSize: 13, color: C.textSecondary, lineHeight: 19, marginBottom: sp[4] },
  lastRow:     { backgroundColor: C.n200, borderRadius: br.sm, paddingHorizontal: sp[3], paddingVertical: sp[2], marginBottom: sp[3] },
  lastTxt:     { fontFamily: F.regular, fontSize: 12, color: C.textSecondary },
  presets:     { flexDirection: 'row', gap: sp[2], marginBottom: sp[4], flexWrap: 'wrap' },
  preset:      { paddingHorizontal: sp[3], paddingVertical: sp[2], borderRadius: br.full, borderWidth: 0.5, borderColor: C.borderDefault },
  presetOn:    { backgroundColor: C.accentLight, borderColor: C.accent },
  presetTxt:   { fontFamily: F.medium, fontSize: 13, color: C.textSecondary },
  presetTxtOn: { color: C.accent },
  doneRow:     { backgroundColor: C.investBg, borderRadius: br.sm, paddingHorizontal: sp[3], paddingVertical: sp[2], marginBottom: sp[3] },
  doneTxt:     { fontFamily: F.medium, fontSize: 13, color: C.investText },
  primaryBtn:    { backgroundColor: C.accent, borderRadius: br.sm, paddingVertical: sp[4], alignItems: 'center', marginTop: sp[2] },
  primaryBtnOff: { backgroundColor: C.n300 },
  primaryBtnTxt: { fontFamily: F.semibold, fontSize: 15, color: '#fff' },
  cancelBtn:     { backgroundColor: C.n200, borderRadius: br.sm, paddingVertical: sp[4], alignItems: 'center', marginTop: sp[2] },
  cancelBtnTxt:  { fontFamily: F.semibold, fontSize: 14, color: C.textSecondary },
  infoBox:     { backgroundColor: C.n200, borderRadius: br.sm, padding: sp[3], marginBottom: sp[4] },
  infoTxt:     { fontFamily: F.regular, fontSize: 12, color: C.textSecondary, lineHeight: 18 },
  emptyTxt:    { fontFamily: F.regular, fontSize: 13, color: C.textTertiary, marginBottom: sp[3] },
  accRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint, gap: sp[3] },
  accEmail:    { fontFamily: F.medium, fontSize: 13, color: C.textPrimary },
  accMeta:     { fontFamily: F.regular, fontSize: 11, color: C.textTertiary, marginTop: 2 },
  input:       { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, paddingHorizontal: sp[3], paddingVertical: sp[3], fontFamily: F.regular, fontSize: 15, color: C.textPrimary },
  addBtn:      { borderWidth: 0.5, borderColor: C.borderDefault, borderRadius: br.sm, paddingVertical: sp[3], alignItems: 'center', marginTop: sp[3] },
  addBtnTxt:   { fontFamily: F.medium, fontSize: 14, color: C.accent },
});
