// src/screens/account/HiddenVaultScreen.tsx
import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Card, Spacer } from '../../design/components';
import { Transactions, QK } from '../../services/api';
import { MPIN } from '../../services/mpin';
import { MPINModal } from '../../components/MPINModal';
import { fmt_money } from '../../utils/money';

type Stage = 'pin_enter' | 'pin_setup_1' | 'pin_setup_2' | 'vault';

export function HiddenVaultScreen() {
  const nav = useNavigation<any>();
  const qc  = useQueryClient();
  const [stage,     setStage]    = useState<Stage>(MPIN.is_set() ? 'pin_enter' : 'pin_setup_1');
  const [setup_pin, setSetupPin] = useState('');
  const [pin_error, setPinError] = useState('');
  const [unlocked,  setUnlocked] = useState(false);

  const { data: txns, refetch } = useQuery({
    queryKey: QK.hidden ? QK.hidden() : ['hidden_txns'],
    queryFn:  Transactions.hidden,
    enabled:  unlocked,
  });

  const unhideMut = useMutation({
    mutationFn: (id: number) => Transactions.set_visibility(id, {
      is_hidden: false, hidden_from_family: false,
      hidden_until: 'null', exclude_from_totals: false,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hidden_txns'] }); refetch(); },
  });

  function on_pin_enter(pin: string) {
    if (MPIN.verify(pin)) { setPinError(''); setUnlocked(true); setStage('vault'); }
    else setPinError('Wrong PIN — try again');
  }
  function on_setup_1(pin: string) { setSetupPin(pin); setStage('pin_setup_2'); }
  function on_setup_2(pin: string) {
    if (pin === setup_pin) { MPIN.set(pin); setUnlocked(true); setStage('vault'); }
    else { setPinError('PINs do not match — try again'); setStage('pin_setup_1'); setSetupPin(''); }
  }

  function confirm_unhide(id: number, merchant: any) {
    Alert.alert('Unhide transaction', `Show "${merchant ?? 'this transaction'}" everywhere again?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unhide', onPress: () => unhideMut.mutate(id) },
    ]);
  }

  function on_forgot_pin() {
    Alert.alert(
      'Reset vault PIN',
      'Your hidden transactions will remain hidden. You will need to set a new PIN to access the vault.\n\nTo verify your identity, you will be signed out and need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset & sign out', style: 'destructive', onPress: () => {
          MPIN.clear();
          // Sign out to verify identity — user must re-authenticate via magic link
          Alert.alert(
            'PIN reset',
            'Your vault PIN has been cleared. Sign in again to set a new PIN.',
            [{ text: 'OK', onPress: () => {
              // Clear tokens and go to login
              const { Tok } = require('../../services/api');
              Tok.clear();
              nav.reset({ index: 0, routes: [{ name: 'Onboarding' as any }] });
            }}]
          );
        }},
      ]
    );
  }

  function confirm_reset_pin() {
    Alert.alert('Reset vault PIN', 'You will need to set a new PIN to access the vault.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => { MPIN.clear(); nav.goBack(); } },
    ]);
  }

  function hide_label(txn: any): string {
    const parts: string[] = [];
    if (txn.is_hidden)           parts.push('My list');
    if (txn.hidden_from_family)  parts.push('Family');
    if (txn.hidden_until)        parts.push('Until ' + dayjs(txn.hidden_until).format('D MMM YY'));
    if (txn.exclude_from_totals) parts.push('Ghost');
    return parts.join(' · ') || 'Hidden';
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <MPINModal visible={stage === 'pin_enter'} mode="enter" title="Enter vault PIN"
        subtitle="Your hidden transactions are protected"
        error={pin_error} onSuccess={on_pin_enter} onCancel={() => nav.goBack()}
        onForgotPin={on_forgot_pin} />

      <MPINModal visible={stage === 'pin_setup_1'} mode="setup" title="Set vault PIN"
        subtitle="Choose a 4-digit PIN for your hidden transactions"
        onSuccess={on_setup_1} onCancel={() => nav.goBack()} />
      <MPINModal visible={stage === 'pin_setup_2'} mode="confirm" title="Confirm PIN"
        subtitle="Enter the same PIN again" error={pin_error}
        onSuccess={on_setup_2} onCancel={() => { setStage('pin_setup_1'); setPinError(''); }} />

      {unlocked && (
        <>
          <Between style={s.header}>
            <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
              <Text style={{ fontSize: 16, color: C.accent }}>‹ Back</Text>
            </TouchableOpacity>
            <T.H>Hidden vault</T.H>
            <TouchableOpacity onPress={confirm_reset_pin}>
              <T.Cap style={{ color: C.dangerText }}>Reset PIN</T.Cap>
            </TouchableOpacity>
          </Between>

          {!txns || txns.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>🔒</Text>
              <Spacer h={sp[3]} />
              <T.H style={{ textAlign: 'center' }}>Vault is empty</T.H>
              <T.Small style={{ textAlign: 'center', marginTop: sp[2], color: C.textTertiary }}>
                Hidden transactions appear here.{'\n'}On any transaction → tap Hide to add one.
              </T.Small>
            </View>
          ) : (
            <FlatList data={txns} keyExtractor={(t: any) => String(t.id)}
              contentContainerStyle={{ padding: sp[4] }}
              ListHeaderComponent={
                <T.Cap style={{ marginBottom: sp[3] }}>
                  {txns.length} hidden transaction{txns.length !== 1 ? 's' : ''}
                </T.Cap>
              }
              ItemSeparatorComponent={() => <View style={{ height: sp[2] }} />}
              renderItem={({ item: txn }: any) => {
                const isDebit  = txn.txn_type === 'debit';
                const amtColor = txn.is_investment ? '#F8961E' : isDebit ? C.spendText : C.investText;
                return (
                  <Card padding={sp[3]}>
                    <Between>
                      <View style={{ flex: 1 }}>
                        <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>
                          {txn.merchant ?? (isDebit ? 'Payment' : 'Received')}
                        </T.Small>
                        <T.Cap style={{ marginTop: 2 }}>{dayjs(txn.txn_date).format('D MMM YYYY')}</T.Cap>
                        <View style={s.badge}>
                          <Text style={s.badgeTxt}>🔒 {hide_label(txn)}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: sp[2] }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 15, color: amtColor }}>
                          {isDebit ? '-' : '+'}{fmt_money(txn.amount)}
                        </Text>
                        <TouchableOpacity onPress={() => confirm_unhide(txn.id, txn.merchant)} style={s.unhideBtn}>
                          <Text style={s.unhideTxt}>Unhide</Text>
                        </TouchableOpacity>
                      </View>
                    </Between>
                    {txn.note ? <T.Cap style={{ marginTop: sp[2] }}>Note: {txn.note}</T.Cap> : null}
                  </Card>
                );
              }}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.pageBg },
  header:    { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: sp[8] },
  badge:     { marginTop: sp[1], backgroundColor: C.n[200], paddingHorizontal: sp[2], paddingVertical: 2, borderRadius: br.full, alignSelf: 'flex-start' },
  badgeTxt:  { fontFamily: F.medium, fontSize: 10, color: C.textSecondary },
  unhideBtn: { paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.sm, backgroundColor: C.accentLight, borderWidth: 1, borderColor: C.accentBorder },
  unhideTxt: { fontFamily: F.medium, fontSize: 11, color: C.accent },
});
