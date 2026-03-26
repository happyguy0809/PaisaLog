// src/screens/account/DeletedTransactionsScreen.tsx
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Card, Spacer } from '../../design/components';
import { Transactions } from '../../services/api';
import { fmt_money } from '../../utils/money';

export function DeletedTransactionsScreen() {
  const nav = useNavigation<any>();
  const qc  = useQueryClient();

  const { data: txns, isLoading, refetch } = useQuery({
    queryKey: ['deleted_txns'],
    queryFn:  Transactions.deleted,
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => Transactions.restore(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['txns'], exact: false });
      qc.invalidateQueries({ queryKey: ['summary'], exact: false });
      refetch();
    },
  });

  function confirm_restore(id: number, merchant: any) {
    Alert.alert(
      'Restore transaction',
      'Move "' + (merchant ?? 'this transaction') + '" back to your list?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => restoreMut.mutate(id) },
      ]
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Between style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
          <Text style={{ fontSize: 16, color: C.accent }}>‹ Back</Text>
        </TouchableOpacity>
        <T.H>Deleted transactions</T.H>
        <View style={{ width: 48 }} />
      </Between>

      {isLoading ? (
        <View style={s.empty}><T.Cap>Loading...</T.Cap></View>
      ) : !txns?.length ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 40 }}>🗑️</Text>
          <Spacer h={sp[3]} />
          <T.H style={{ textAlign: 'center' }}>No deleted transactions</T.H>
          <T.Small style={{ textAlign: 'center', marginTop: sp[2], color: C.textTertiary }}>
            Deleted transactions appear here for 30 days.
          </T.Small>
        </View>
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(t: any) => String(t.id)}
          contentContainerStyle={{ padding: sp[4] }}
          ListHeaderComponent={
            <T.Cap style={{ marginBottom: sp[3] }}>
              {txns.length} deleted · restore within 30 days
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
                    <T.Cap style={{ marginTop: 2 }}>
                      {dayjs(txn.txn_date).format('D MMM YYYY')}
                    </T.Cap>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: sp[2] }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 15, color: amtColor }}>
                      {isDebit ? '-' : '+'}{fmt_money(txn.amount)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => confirm_restore(txn.id, txn.merchant)}
                      style={s.btn}
                    >
                      <Text style={s.btnTxt}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                </Between>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  empty:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: sp[8] },
  btn:    { paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.sm, backgroundColor: C.accentLight, borderWidth: 1, borderColor: C.accentBorder },
  btnTxt: { fontFamily: F.medium, fontSize: 11, color: C.accent },
});
