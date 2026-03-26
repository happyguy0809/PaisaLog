// src/screens/add/AddScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Pressable, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { get_tz_offset } from '../../utils/date';
import { useQuery } from '@tanstack/react-query';
import { User, QK } from '../../services/api';
import { C, F, sp, br } from '../../design/tokens';
import { T, Btn, Divider, Spacer } from '../../design/components';
import { Transactions } from '../../services/api';
import { CATS } from '../spend/categories';
import { scan_bill } from '../../services/bill_scan';

const CAT_LIST = Object.entries(CATS).map(([id, v]) => ({ id, ...v }));
type TxnType = 'debit' | 'credit' | 'investment';

export function AddScreen() {
  const nav = useNavigation<any>();
  const qc  = useQueryClient();

  const [amount,   setAmount]   = useState('');
  const [type,     setType]     = useState<TxnType>('debit');
  const [catId,    setCatId]    = useState('other');
  const [merchant, setMerchant] = useState('');
  const [note,     setNote]     = useState('');
  const [isCash,    setIsCash]    = useState(false);
  const [scanning,  setScanning]  = useState(false);
  const [scan_hint, setScanHint]  = useState<string | null>(null);
  const [scan_photo_uri, setScanPhotoUri] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: QK.me, queryFn: User.me });
  async function on_scan_bill(source: 'camera' | 'gallery') {
    setScanning(true);
    setScanHint('Scanning bill...');
    try {
      const result = await scan_bill(source);
      if (!result) {
        setScanHint(source === 'camera'
          ? 'Camera unavailable — please allow camera permission in Settings'
          : 'Could not read image — try again');
        return;
      }
      // Pre-fill whatever was found
      if (result.amount && result.amount > 0) setAmount(String(result.amount / 100));
      if (result.merchant) setMerchant(result.merchant);

      // Save scanned image as bill photo
      if (result.image_uri) {
        setScanPhotoUri(result.image_uri);
      }

      // Build hint showing what was found and what needs manual entry
      const found: string[] = [];
      const missing: string[] = [];
      if (result.merchant) found.push(`merchant: ${result.merchant}`);
      else missing.push('merchant');
      if (result.amount && result.amount > 0) found.push(`amount: ${result.currency} ${((result.amount)/100).toFixed(2)}`);
      else missing.push('amount');
      if (result.date) found.push(`date: ${result.date}`);

      const hint = found.length > 0
        ? `✓ Found: ${found.join(', ')}${missing.length > 0 ? `\n⚠ Please fill in: ${missing.join(', ')}` : ''}`
        : 'Could not parse receipt — please fill in manually';
      setScanHint(hint);
    } catch (e: any) {
      console.error('[AddScreen] scan error:', e?.message);
      setScanHint('Scan failed — fill manually');
    } finally {
      setScanning(false);
    }
  }

  const canSave = parseFloat(amount) > 0;

  const mutation = useMutation({
    onError: (e: any) => console.error('ADD ERROR:', JSON.stringify(e)),
    mutationFn: async () => {
      const paise = Math.round(parseFloat(amount) * 100);
      return Transactions.ingest({
        amount:  paise,
        txn_type:      type === 'investment' ? 'debit' : type,
        merchant:      merchant || undefined,
        confidence:    100,
        source:        'manual',
        txn_date:      dayjs().format('YYYY-MM-DD'),
        epoch_seconds: Math.floor(Date.now() / 1000),
        tz_offset:     get_tz_offset((me as any)?.timezone ?? 'Asia/Kolkata'),
        is_cash:       isCash,
        is_investment: type === 'investment',
      });
    },
    onSuccess: (data: any) => {
      if (scan_photo_uri && data?.txn_id) {
        save_photo(data.txn_id, {
          uri: scan_photo_uri, width: 0, height: 0, size_kb: 0, compression: 'medium'
        });
      }
      qc.invalidateQueries({ queryKey: ['txns'],    exact: false });
      qc.invalidateQueries({ queryKey: ['summary'], exact: false });
      qc.invalidateQueries({ queryKey: ['invest'],  exact: false });
      qc.invalidateQueries({ queryKey: ['cash'],    exact: false });
      qc.invalidateQueries({ queryKey: ['apps'],    exact: false });
      nav.goBack();
    },
  });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: 'padding', android: 'height' })}>

        {/* Top bar */}
        <View style={s.handle} />
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()}>
            <T.Body color={C.textSecondary}>Cancel</T.Body>
          </TouchableOpacity>
          <T.Label>Add transaction</T.Label>
          <View style={{ width: 52 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Bill scan */}
          <View style={{ flexDirection: 'row', gap: sp[2], marginBottom: sp[3] }}>
            <TouchableOpacity
              onPress={() => on_scan_bill('camera')}
              disabled={scanning}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: sp[2], paddingVertical: sp[3], borderRadius: br.md,
                backgroundColor: C.accentLight, borderWidth: 1, borderColor: C.accentBorder }}
            >
              {scanning
                ? <ActivityIndicator size="small" color={C.accent} />
                : <Text style={{ fontSize: 18 }}>📷</Text>
              }
              <Text style={{ fontFamily: F.ui.medium, fontSize: 14, color: C.accent }}>
                {scanning ? 'Scanning...' : 'Scan bill'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => on_scan_bill('gallery')}
              disabled={scanning}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: sp[2], paddingVertical: sp[3], borderRadius: br.md,
                backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.borderFaint }}
            >
              <Text style={{ fontSize: 18 }}>🖼️</Text>
              <Text style={{ fontFamily: F.ui.medium, fontSize: 14, color: C.textSecondary }}>
                From gallery
              </Text>
            </TouchableOpacity>
          </View>
          {scan_hint && (
            <View style={{ backgroundColor: scan_hint.includes('fail') || scan_hint.includes('Could') ? '#FEF2F2' : '#F0FFF4',
              borderRadius: br.sm, padding: sp[2], marginBottom: sp[3],
              borderWidth: 1, borderColor: scan_hint.includes('fail') || scan_hint.includes('Could') ? '#FCA5A5' : '#86EFAC' }}>
              <Text style={{ fontFamily: F.ui.regular, fontSize: 12,
                color: scan_hint.includes('fail') || scan_hint.includes('Could') ? '#DC2626' : '#166534' }}>
                {scan_hint}
              </Text>
            </View>
          )}

          {/* Amount — the hero input */}
          <View style={s.amtSection}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              style={s.amtInput}
              value={amount}
              onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor={C.textDisabled}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          {/* Type pills */}
          <View style={s.typePills}>
            {(['debit', 'credit', 'investment'] as TxnType[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[s.pill, type === t && s.pillActive]}
                onPress={() => setType(t)}
              >
                <Text style={[s.pillTxt, type === t && s.pillTxtActive]}>
                  {t === 'debit' ? 'Spent' : t === 'credit' ? 'Received' : 'Invested'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Divider style={{ marginHorizontal: sp[4] }} />
          <Spacer h={sp[5]} />

          {/* Category */}
          <T.Cap style={s.sectionLbl}>CATEGORY</T.Cap>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
            {CAT_LIST.filter(c => c.id !== 'investment' || type === 'investment').map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[s.catChip, catId === cat.id && { backgroundColor: cat.color + '18', borderColor: cat.color + '50' }]}
                onPress={() => setCatId(cat.id)}
              >
                <Text style={s.catChipIcon}>{cat.icon}</Text>
                <Text style={[s.catChipTxt, catId === cat.id && { color: cat.color }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Spacer h={sp[5]} />
          <Divider style={{ marginHorizontal: sp[4] }} />
          <Spacer h={sp[5]} />

          {/* Merchant */}
          <View style={s.fieldWrap}>
            <T.Cap style={s.sectionLbl}>WHERE</T.Cap>
            <TextInput
              style={s.fieldInput}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="Merchant, shop or person name"
              placeholderTextColor={C.textDisabled}
            />
          </View>

          <Spacer h={sp[4]} />

          {/* Cash toggle */}
          <TouchableOpacity style={s.cashRow} onPress={() => setIsCash(v => !v)}>
            <View style={[s.checkbox, isCash && s.checkboxOn]}>
              {isCash && <Text style={s.checkmark}>✓</Text>}
            </View>
            <T.Body>This was a cash payment</T.Body>
          </TouchableOpacity>

          <Spacer h={sp[4]} />

          {/* Note */}
          <View style={s.fieldWrap}>
            <T.Cap style={s.sectionLbl}>NOTE (OPTIONAL)</T.Cap>
            <TextInput
              style={[s.fieldInput, { height: 72, textAlignVertical: 'top' }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={C.textDisabled}
              multiline
              maxLength={200}
            />
          </View>

          <Spacer h={sp[4]} />
        </ScrollView>

        {/* Footer */}
        <View style={s.footer}>
          <Btn
            label={mutation.isPending ? 'Saving…' : 'Save transaction'}
            onPress={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSave}
            variant="primary"
            size="lg"
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.pageBg },
  handle:  { width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n[300], alignSelf: 'center', marginTop: sp[3] },
  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp[4], paddingVertical: sp[3] },

  amtSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: sp[8], paddingHorizontal: sp[4] },
  rupee:      { fontFamily: F.ui.bold, fontSize: 36, color: C.textTertiary, marginRight: 4, lineHeight: 52 },
  amtInput:   { fontFamily: F.ui.bold, fontSize: 52, color: C.textPrimary, letterSpacing: -2, minWidth: 80, padding: 0 },

  typePills: { flexDirection: 'row', marginHorizontal: sp[4], backgroundColor: C.n[200], borderRadius: br.sm, padding: sp[1], marginBottom: sp[5] },
  pill:      { flex: 1, paddingVertical: sp[2], alignItems: 'center', borderRadius: br.xs },
  pillActive:{ backgroundColor: C.cardBg, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  pillTxt:   { fontFamily: F.ui.medium, fontSize: 13, color: C.textTertiary },
  pillTxtActive: { color: C.textPrimary },

  sectionLbl: { paddingHorizontal: sp[4], marginBottom: sp[2], fontSize: 10, letterSpacing: 0.8 },
  catScroll:  { paddingHorizontal: sp[4], gap: sp[2], paddingBottom: sp[1] },
  catChip:    { flexDirection: 'row', alignItems: 'center', gap: sp[1], paddingHorizontal: sp[3], paddingVertical: sp[2], borderRadius: br.full, backgroundColor: C.n[200], borderWidth: 1, borderColor: C.n[200] },
  catChipIcon:{ fontSize: 14 },
  catChipTxt: { fontFamily: F.ui.medium, fontSize: 13, color: C.textSecondary },

  fieldWrap:  { paddingHorizontal: sp[4] },
  fieldInput: { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[4], fontFamily: F.ui.regular, fontSize: 15, color: C.textPrimary },

  cashRow:    { flexDirection: 'row', alignItems: 'center', gap: sp[3], paddingHorizontal: sp[4] },
  checkbox:   { width: 22, height: 22, borderRadius: br.xs, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark:  { fontFamily: F.ui.semibold, fontSize: 13, color: C.white },

  footer: { paddingHorizontal: sp[4], paddingVertical: sp[4], borderTopWidth: 0.5, borderTopColor: C.borderFaint },
});
