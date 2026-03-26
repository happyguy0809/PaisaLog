// src/screens/home/TxnDetailScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, StatusBar, KeyboardAvoidingView, Platform,
  Image, Modal, Alert as RNAlert, Animated,
} from 'react-native';
import { PinchGestureHandler, PanGestureHandler, GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { HideSheet } from '../../components/HideSheet';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { format_date } from '../../utils/date';
import { C, F, sp, br, fmt } from '../../design/tokens';

import { T, Row, Between, Divider, Btn, Spacer, Chip } from '../../design/components';
import { Transactions, Refunds, QK } from '../../services/api';
import { capture_bill, pick_bill, get_photo, save_photo, delete_photo, get_compression_level, bill_photo } from '../../services/photo';

import { getCat } from '../spend/categories';
import { fmt_money } from '../../utils/money';


// ── Pinch-to-zoom + pan image viewer ─────────────────────────
function PinchZoomView({ uri }: { uri: string }) {
  const scale       = React.useRef(new Animated.Value(1)).current;
  const baseScale   = React.useRef(1);
  const translateX  = React.useRef(new Animated.Value(0)).current;
  const translateY  = React.useRef(new Animated.Value(0)).current;
  const lastOffset  = React.useRef({ x: 0, y: 0 });
  const panRef      = React.useRef<any>();
  const pinchRef    = React.useRef<any>();

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale } }],
    { useNativeDriver: true }
  );

  const onPinchStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.oldState === State.ACTIVE) {
      baseScale.current = Math.min(Math.max(baseScale.current * nativeEvent.scale, 1), 5);
      scale.setValue(baseScale.current);
      // reset pan if zoomed back to 1
      if (baseScale.current <= 1) {
        lastOffset.current = { x: 0, y: 0 };
        translateX.setValue(0);
        translateY.setValue(0);
      }
    }
  };

  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true }
  );

  const onPanStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.oldState === State.ACTIVE) {
      lastOffset.current.x += nativeEvent.translationX;
      lastOffset.current.y += nativeEvent.translationY;
      translateX.setOffset(lastOffset.current.x);
      translateX.setValue(0);
      translateY.setOffset(lastOffset.current.y);
      translateY.setValue(0);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <PanGestureHandler
        ref={panRef}
        simultaneousHandlers={pinchRef}
        onGestureEvent={onPanEvent}
        onHandlerStateChange={onPanStateChange}
        minPointers={1}
        maxPointers={2}
      >
        <Animated.View style={{ flex: 1 }}>
          <PinchGestureHandler
            ref={pinchRef}
            simultaneousHandlers={panRef}
            onGestureEvent={onPinchEvent}
            onHandlerStateChange={onPinchStateChange}
          >
            <Animated.View style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              transform: [{ scale }, { translateX }, { translateY }]
            }}>
              <Image
                source={{ uri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
}

export function TxnDetailScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const qc     = useQueryClient();
  const txnId: number = route.params?.txnId;
  const [show_hide, setShowHide] = useState(false);
  const txnFallback: any = route.params?.txn ?? null;

  const [note,    setNote]    = useState('');
  const [editing,   setEditing]   = useState(false);
  const [photo,     setPhoto]     = useState<bill_photo | null>(null);
  const [photo_loading, setPhotoLoading] = useState(false);
  const [show_viewer,  setShowViewer]   = useState(false);

  // Find txn from any cached query list
  const allCached = qc.getQueriesData<any[]>({ queryKey: ['txns'] });
  const txn = allCached.flatMap(([, d]) => d ?? []).find((t: any) => t?.id === txnId) ?? txnFallback;


  const deleteMutation = useMutation({
    mutationFn: () => Transactions.delete(txnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['txns'],    exact: false });
      qc.invalidateQueries({ queryKey: ['summary'], exact: false });
      qc.invalidateQueries({ queryKey: ['apps'],    exact: false });
      nav.goBack();
    },
  });
  const hideMut = useMutation({
    mutationFn: (opts: any) => Transactions.set_visibility(txnId, opts),
    onMutate: async (opts: any) => {
      await qc.cancelQueries({ queryKey: ['txns'], exact: false });
      const prev = qc.getQueriesData<any[]>({ queryKey: ['txns'] });
      // Normalise 'null' string → actual null for cache so conditions work correctly
      const cache_opts = { ...opts, hidden_until: opts.hidden_until === 'null' ? null : opts.hidden_until };
      qc.setQueriesData<any[]>({ queryKey: ['txns'], exact: false }, (old) =>
        (old ?? []).map(t => t?.id === txnId ? { ...t, ...cache_opts } : t)
      );
      setShowHide(false);
      return { prev };
    },
    onError: (_e: any, _v: any, ctx: any) => {
      if (ctx?.prev) qc.setQueriesData({ queryKey: ['txns'], exact: false }, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['txns'], exact: false });
      qc.invalidateQueries({ queryKey: ['summary'], exact: false });
      qc.invalidateQueries({ queryKey: ['hidden_txns'] });
    },
  });


  function confirm_delete() {
    RNAlert.alert(
      'Delete transaction',
      'Select a reason (this helps improve automatic detection):',
      [
        { text: 'Wrong transaction recorded', style: 'destructive', onPress: () => deleteMutation.mutate() },
        { text: 'Duplicate entry',            style: 'destructive', onPress: () => deleteMutation.mutate() },
        { text: 'Other reason',               style: 'destructive', onPress: () => deleteMutation.mutate() },
        { text: 'Cancel',                     style: 'cancel' },
      ],
      { cancelable: true }
    );
  }

  const noteMutation = useMutation({
    mutationFn: () => Transactions.note(txnId, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['txns'] });
      setEditing(false);
    },
  });

  React.useEffect(() => {
    if (txn) setNote(txn.note ?? '');
  }, [txn?.note]);
  React.useEffect(() => {
    setPhoto(get_photo(txnId));
  }, [txnId]);

  if (!txn) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <T.Body>Transaction not found</T.Body>
          <TouchableOpacity onPress={() => nav.goBack()} style={{ marginTop: sp[4] }}>
            <T.Small color={C.accent}>Go back</T.Small>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const cat      = getCat(txn.category, txn.merchant);
  const isDebit  = txn.txn_type === 'debit';
  const isInvest = txn.is_investment;
  const amtColor = isInvest ? C.investText : isDebit ? C.spendText : C.investText;
  const sign     = isDebit ? '−' : '+';


  async function attach_photo(source: 'camera' | 'gallery') {
    setPhotoLoading(true);
    try {
      const level = get_compression_level();
      const result = source === 'camera'
        ? await capture_bill(level)
        : await pick_bill(level);
      if (result) {
        await save_photo(txnId, result);
        setPhoto(result);
      }
    } finally {
      setPhotoLoading(false);
    }
  }

  function show_photo_options() {
    if (photo) {
      // Already has photo — show management options
      RNAlert.alert(
        'Bill photo',
        undefined,
        [
          { text: 'Recapture',    onPress: () => attach_photo('camera') },
          { text: 'Choose from gallery', onPress: () => attach_photo('gallery') },
          { text: 'Remove photo', style: 'destructive', onPress: () => { delete_photo(txnId); setPhoto(null); } },
          { text: 'Cancel',       style: 'cancel' },
        ],
        { cancelable: true }
      );
    } else {
      RNAlert.alert(
        'Choose source',
        undefined,
        [
          { text: 'Camera',  onPress: () => attach_photo('camera') },
          { text: 'Gallery', onPress: () => attach_photo('gallery') },
          { text: 'Cancel',  style: 'cancel' },
        ],
        { cancelable: true }
      );
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: 'padding' })}>

        {/* Handle bar */}
        <View style={s.handle} />

        {/* Close */}
        <Between style={s.topBar}>
          <TouchableOpacity
            onPress={confirm_delete}
            style={s.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.deleteBtnTxt}>⌫</Text>
          </TouchableOpacity>
          <T.Label>Transaction</T.Label>
          <TouchableOpacity onPress={() => nav.goBack()} style={s.closeBtn}>
            <Text style={s.closeTxt}>✕</Text>
          </TouchableOpacity>
        </Between>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* Amount hero */}
          <View style={s.amtSection}>
            <View style={[s.catCircle, { backgroundColor: cat.color + '18' }]}>
              <Text style={s.catEmoji}>{cat.icon}</Text>
            </View>
            <Spacer h={sp[4]} />
            <Text style={[s.heroAmt, { color: amtColor }]}>
              {sign}{fmt_money(txn.amount)}
            </Text>
            <T.Body style={{ marginTop: sp[1] }}>
              {txn.merchant ?? (isDebit ? 'Payment' : 'Received')}
            </T.Body>
            <T.Cap style={{ marginTop: 3 }}>
              {format_date(txn.txn_date, 'D MMMM YYYY')}
            </T.Cap>
          </View>

          <Divider style={{ marginVertical: sp[5] }} />

          {/* Details grid */}
          <View style={s.detailGrid}>
            {[
              { label: 'Type',       value: isInvest ? 'Investment' : isDebit ? 'Debit' : 'Credit' },
              { label: 'Category',   value: cat.label },
              { label: 'Account',    value: txn.acct_suffix ? `···· ${txn.acct_suffix}` : '—' },
              { label: 'Source',     value: txn.sources ?? '—' },
              { label: 'Confidence', value: txn.confidence >= 80 ? 'High' : txn.confidence >= 50 ? 'Medium' : 'Low' },
              { label: 'Date',       value: format_date(txn.txn_date, 'D MMM YYYY') },
            ].map((row, i) => (
              <View key={i} style={s.detailRow}>
                <T.Cap style={{ flex: 1 }}>{row.label}</T.Cap>
                <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{row.value}</T.Small>
              </View>
            ))}
          </View>

          {/* Tags */}
          <Row style={s.tags}>
            {txn.is_subscription && <Chip label="Subscription" bg={C.accentLight} color={C.accent} />}
            {txn.is_investment   && <Chip label="Investment"   bg={C.investBg}    color={C.investText} />}
            {txn.is_cash         && <Chip label="Cash"         bg={C.n200}        color={C.n700} />}
          </Row>

          <Divider style={{ marginVertical: sp[5] }} />

          {/* Source Provenance */}
          {txn?.metadata && Object.keys(txn.metadata).length > 0 && (
            <View style={{ marginBottom: sp[3], padding: sp[4], backgroundColor: C.n100, borderRadius: br.md }}>
              <T.Cap style={{ letterSpacing: 0.8, marginBottom: sp[2] }}>SOURCE</T.Cap>
              {txn.metadata.source_type === 'sms' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp[2], marginBottom: sp[2] }}>
                    <View style={{ backgroundColor: C.accentLight, borderRadius: br.sm, paddingHorizontal: sp[2], paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.accent }}>SMS</Text>
                    </View>
                    <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.textPrimary }}>
                      {txn.metadata.sender_id ?? 'Unknown sender'}
                    </Text>
                  </View>
                  {!!txn.metadata.sms_timestamp_ms && (
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.textTertiary, marginBottom: sp[1] }}>
                      {new Date(txn.metadata.sms_timestamp_ms).toLocaleString()}
                    </Text>
                  )}
                  {!!txn.metadata.raw_source_text && (
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.textSecondary,
                      backgroundColor: C.n200, borderRadius: br.sm, padding: sp[2], lineHeight: 18 }}
                      numberOfLines={4} ellipsizeMode="tail">
                      {txn.metadata.raw_source_text}
                    </Text>
                  )}
                </>
              )}
              {txn.metadata.source_type === 'email' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp[2], marginBottom: sp[2] }}>
                    <View style={{ backgroundColor: '#EEF2FF', borderRadius: br.sm, paddingHorizontal: sp[2], paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.medium, fontSize: 11, color: '#6366F1' }}>EMAIL</Text>
                    </View>
                    <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.textPrimary, flex: 1 }}>
                      {txn.metadata.email_sender ?? 'Unknown'}
                    </Text>
                  </View>
                  {!!txn.metadata.email_subject && (
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.textSecondary, marginBottom: sp[1] }}>
                      {txn.metadata.email_subject}
                    </Text>
                  )}
                  {!!txn.metadata.email_timestamp && (
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.textTertiary }}>
                      {new Date(txn.metadata.email_timestamp).toLocaleString()}
                    </Text>
                  )}
                </>
              )}
              {(!txn.metadata.source_type || txn.metadata.source_type === 'manual') && (
                <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.textTertiary }}>Added manually</Text>
              )}
              {!!txn.metadata.parse_confidence && (
                <Text style={{ fontFamily: F.regular, fontSize: 11, color: C.textTertiary, marginTop: sp[1] }}>
                  Parse confidence: {txn.metadata.parse_confidence}%
                </Text>
              )}
            </View>
          )}
          {/* Note */}
          <View>
            <Between style={{ marginBottom: sp[3] }}>
              <T.Label>Note</T.Label>
              {!editing && (
                <TouchableOpacity onPress={() => setEditing(true)}>
                  <T.Small color={C.accent}>{txn.note ? 'Edit' : 'Add note'}</T.Small>
                </TouchableOpacity>
              )}
            </Between>
            {editing ? (
              <View>
                <TextInput
                  style={s.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note about this transaction..."
                  placeholderTextColor={C.textDisabled}
                  multiline
                  autoFocus
                  maxLength={300}
                />
                <Row style={{ gap: sp[3], marginTop: sp[3] }}>
                  <Btn label="Cancel" onPress={() => { setEditing(false); setNote(txn.note ?? ''); }} variant="ghost" size="sm" />
                  <Btn label="Save" onPress={() => noteMutation.mutate()} loading={noteMutation.isPending} variant="primary" size="sm" />
                </Row>
              </View>
            ) : (
              <T.Body>{txn.note || <T.Cap>No note added</T.Cap>}</T.Body>
            )}
          </View>

          <Divider style={{ marginVertical: sp[5] }} />

          {/* Bill photo */}
          <View>
            <Between style={{ marginBottom: sp[3] }}>
              <T.Label>Bill photo</T.Label>
              <TouchableOpacity onPress={show_photo_options}>
                <T.Small color={C.accent}>
                  {photo_loading ? 'Processing...' : photo ? 'Change' : 'Attach'}
                </T.Small>
              </TouchableOpacity>
            </Between>
            {photo ? (
              <View>
                <TouchableOpacity onPress={() => setShowViewer(true)} activeOpacity={0.85}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={{ width: '100%', height: 200, borderRadius: br.sm, backgroundColor: C.n200 }}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
                <Between style={{ marginTop: sp[2] }}>
                  <T.Cap style={{ color: C.textTertiary }}>
                    {Math.round((photo.size_bytes ?? 0) / 1024)}KB · {photo.compression}
                  </T.Cap>
                  <TouchableOpacity onPress={show_photo_options}>
                    <T.Small color={C.accent}>Change</T.Small>
                  </TouchableOpacity>
                </Between>
              </View>
            ) : (
              <TouchableOpacity
                style={{ height: 72, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: C.n100 }}
                onPress={show_photo_options}
              >
                <T.Cap style={{ color: C.textTertiary }}>📷  Tap to attach bill photo</T.Cap>
              </TouchableOpacity>
            )}
          </View>

          <Spacer h={sp[6]} />

          {/* Hide / Unhide transaction */}
          {(txn?.is_hidden || txn?.hidden_from_family || txn?.hidden_until) ? (
            <View style={{ borderRadius: br.sm, borderWidth: 1, borderColor: C.accentBorder, backgroundColor: C.accentLight, overflow: 'hidden' }}>
              <Between style={{ paddingHorizontal: sp[4], paddingVertical: sp[3] }}>
                <Row style={{ gap: sp[2] }}>
                  <Text style={{ fontSize: 14 }}>🔒</Text>
                  <View>
                    <T.Small style={{ fontFamily: F.medium, color: C.accent }}>Transaction is hidden</T.Small>
                    <T.Cap style={{ color: C.accent, opacity: 0.7 }}>
                      {txn?.is_hidden && txn?.hidden_from_family ? 'Hidden from list & family' :
                       txn?.is_hidden ? 'Hidden from your list' :
                       txn?.hidden_until ? `Hidden until ${txn.hidden_until}` :
                       'Hidden from family'}
                    </T.Cap>
                  </View>
                </Row>
                <Row style={{ gap: sp[2] }}>
                  <TouchableOpacity
                    onPress={() => hideMut.mutate({ is_hidden: false, hidden_from_family: false, hidden_until: 'null', exclude_from_totals: false })}
                    style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.sm, backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.accentBorder }}
                  >
                    <T.Cap style={{ color: C.accent }}>Unhide</T.Cap>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowHide(true)}
                    style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.sm, backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.accentBorder }}
                  >
                    <T.Cap style={{ color: C.textSecondary }}>Change</T.Cap>
                  </TouchableOpacity>
                </Row>
              </Between>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowHide(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp[2], paddingVertical: sp[4], borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, backgroundColor: C.pageBg }}
            >
              <Text style={{ fontSize: 14 }}>🔒</Text>
              <T.Small style={{ fontFamily: F.medium, color: C.textSecondary }}>Hide this transaction</T.Small>
            </TouchableOpacity>
          )}

          <Spacer h={sp[4]} />
          {isDebit && !txn?.is_investment && (
            <TouchableOpacity
              onPress={() => {
                Refunds.create({
                  txn_id:       txnId,
                  merchant:     txn?.merchant ?? undefined,
                  amount: txn?.amount,
                  refund_type:  'refund',
                  initiated_date: new Date().toISOString().split('T')[0],
                }).then(() => {
                  nav.navigate('RefundTracker');
                }).catch((e: any) => console.error('refund create:', e));
              }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp[2], paddingVertical: sp[4], borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, backgroundColor: C.pageBg }}
            >
              <Text style={{ fontSize: 14 }}>💸</Text>
              <T.Small style={{ fontFamily: F.medium, color: C.textSecondary }}>Track refund for this transaction</T.Small>
            </TouchableOpacity>
          )}
          <Spacer h={sp[10]} />
        </ScrollView>
      </KeyboardAvoidingView>
      {photo && show_viewer && (
        <Modal visible={show_viewer} transparent={false} onRequestClose={() => setShowViewer(false)} animationType="fade">
          <View style={{ flex: 1 }}>
            <PinchZoomView uri={photo.uri} />
            <TouchableOpacity
              onPress={() => setShowViewer(false)}
              style={{ position: 'absolute', top: 48, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: br.full, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setShowViewer(false); show_photo_options(); }}
              style={{ position: 'absolute', bottom: 48, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: br.sm, paddingHorizontal: sp[4], paddingVertical: sp[2] }}
            >
              <Text style={{ color: '#fff', fontSize: 14 }}>Change</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
      <HideSheet
        visible={show_hide}
        onClose={() => setShowHide(false)}
        current_mode={
          txn?.is_hidden ? 'hide_from_list' :
          txn?.hidden_from_family ? 'hide_from_family' : null
        }
        onConfirm={(opts) => {
          const body: any = { exclude_from_totals: opts.exclude_from_totals };
          if (opts.mode === 'hide_from_list')   { body.is_hidden = true;  body.hidden_from_family = false; }
          if (opts.mode === 'hide_from_family') { body.is_hidden = false; body.hidden_from_family = true; }
          if (opts.mode === 'hide_from_both')   { body.is_hidden = true;  body.hidden_from_family = true; }
          if (opts.mode === 'hide_until')       { body.is_hidden = false; body.hidden_from_family = true; body.hidden_until = opts.hidden_until; }
          if (opts.mode === 'ghost')            { body.is_hidden = true;  body.hidden_from_family = true; body.exclude_from_totals = true; }
          hideMut.mutate(body);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.pageBg },
  handle:  { width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n300, alignSelf: 'center', marginTop: sp[3] },
  topBar:  { paddingHorizontal: sp[4], paddingVertical: sp[3] },
  closeBtn:{ width: 36, height: 36, borderRadius: br.full, backgroundColor: C.n200, alignItems: 'center', justifyContent: 'center' },
  closeTxt:{ fontSize: 14, color: C.textSecondary },
  content: { paddingHorizontal: sp[5] },

  amtSection: { alignItems: 'center', paddingTop: sp[5] },
  catCircle:  { width: 64, height: 64, borderRadius: br.full, alignItems: 'center', justifyContent: 'center' },
  catEmoji:   { fontSize: 26 },
  heroAmt:    { fontFamily: F.bold, fontSize: 38, letterSpacing: -1.5, lineHeight: 42 },

  detailGrid: { gap: 1, backgroundColor: C.borderFaint, borderRadius: br.md, overflow: 'hidden' },
  detailRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.cardBg, paddingHorizontal: sp[4], paddingVertical: sp[3] },

  tags: { gap: sp[2], marginTop: sp[4], flexWrap: 'wrap' },

  deleteBtn: {
    width: 40, height: 40, borderRadius: br.sm,
    backgroundColor: C.spendText,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnTxt: { fontSize: 18, color: '#FFFFFF', fontWeight: 'bold' },
  noteInput: {
    backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1,
    borderColor: C.borderDefault, padding: sp[4],
    fontFamily: F.regular, fontSize: 15, color: C.textPrimary,
    minHeight: 80, textAlignVertical: 'top',
  },
});
