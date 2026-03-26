// src/screens/account/RefundTrackerScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { format_date } from '../../utils/date';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Row, Card, Divider, Spacer, Btn } from '../../design/components';
import { Refunds } from '../../services/api';
import { fmt_money } from '../../utils/money';

const STATUS_COLORS: Record<string, string> = {
  pending: '#F8961E', received: '#2C6BED', active: '#2C6BED',
  soon: '#43AA8B', credited: '#43AA8B', used: '#999', expired: '#EF4444', waiting: '#B45309',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', received: 'Received', active: 'Active',
  soon: 'Coming soon', credited: 'Credited', used: 'Used', expired: 'Expired', waiting: 'Waiting',
};

function RefundCard({ refund, onUpdateStatus }: any) {
  const [expanded, setExpanded] = useState(false);
  const color = STATUS_COLORS[refund.status] ?? '#999';
  return (
    <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[3] }}>
      <TouchableOpacity onPress={() => setExpanded((v: boolean) => !v)} activeOpacity={0.8}>
        <View style={{ padding: sp[4] }}>
          <Between>
            <View style={{ flex: 1 }}>
              <Row style={{ gap: sp[2], marginBottom: sp[1] }}>
                <View style={{ paddingHorizontal: sp[2], paddingVertical: 2, borderRadius: br.full, backgroundColor: color + '20' }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 10, color }}>{STATUS_LABELS[refund.status] ?? refund.status}</Text>
                </View>
                <View style={{ paddingHorizontal: sp[2], paddingVertical: 2, borderRadius: br.full, backgroundColor: C.n[200] }}>
                  <Text style={{ fontFamily: F.medium, fontSize: 10, color: C.textTertiary }}>{(refund.refund_type ?? '').toUpperCase()}</Text>
                </View>
              </Row>
              <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{refund.merchant ?? 'Unknown merchant'}</T.Small>
              <T.Cap>Initiated {refund.initiated_date ? format_date(refund.initiated_date, 'D MMM YYYY') : '—'}</T.Cap>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {refund.amount > 0 && (
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.investText }}>+{fmt_money(refund.amount)}</Text>
              )}
              <Text style={{ color: C.textTertiary, fontSize: 16, marginTop: sp[1] }}>{expanded ? '∧' : '∨'}</Text>
            </View>
          </Between>
        </View>
      </TouchableOpacity>
      {expanded && (
        <>
          <Divider />
          <View style={{ padding: sp[4] }}>
            {refund.rrn && <View style={s.refRow}><T.Cap style={{ flex: 1 }}>RRN (PG Reference)</T.Cap><T.Small style={{ fontFamily: F.medium }}>{refund.rrn}</T.Small></View>}
            {refund.arn && <View style={s.refRow}><T.Cap style={{ flex: 1 }}>ARN (Bank Reference)</T.Cap><T.Small style={{ fontFamily: F.medium }}>{refund.arn}</T.Small></View>}
            {refund.reference_no && !refund.rrn && !refund.arn && <View style={s.refRow}><T.Cap style={{ flex: 1 }}>Reference No.</T.Cap><T.Small>{refund.reference_no}</T.Small></View>}
            {refund.timeline?.length > 0 && (
              <View style={{ marginTop: sp[3] }}>
                <T.Cap style={{ marginBottom: sp[2], letterSpacing: 0.5 }}>TIMELINE</T.Cap>
                {refund.timeline.map((step: any, i: number) => (
                  <Row key={i} style={{ gap: sp[3], marginBottom: sp[2] }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 3,
                      backgroundColor: step.done ? C.investText : step.active ? C.accent : C.n[300] }} />
                    <View style={{ flex: 1 }}>
                      <T.Small style={{ color: step.done ? C.investText : step.active ? C.textPrimary : C.textTertiary,
                        fontFamily: step.done ? F.semibold : F.regular }}>{step.label}</T.Small>
                      {step.event_date && <T.Cap>{step.event_date}</T.Cap>}
                    </View>
                  </Row>
                ))}
              </View>
            )}
            <View style={{ marginTop: sp[3] }}>
              <T.Cap style={{ marginBottom: sp[2] }}>UPDATE STATUS</T.Cap>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp[2] }}>
                {['received','soon','credited','expired','waiting'].map((st: string) => (
                  <TouchableOpacity key={st} onPress={() => onUpdateStatus(refund.id, st)}
                    style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.full,
                      backgroundColor: refund.status === st ? (STATUS_COLORS[st] + '30') : C.n[200],
                      borderWidth: 1, borderColor: refund.status === st ? STATUS_COLORS[st] : C.borderFaint }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 11,
                      color: refund.status === st ? STATUS_COLORS[st] : C.textTertiary }}>{STATUS_LABELS[st]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </>
      )}
    </Card>
  );
}

export function RefundTrackerScreen() {
  const nav = useNavigation<any>();
  const qc  = useQueryClient();
  const [show_add, setShowAdd] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount]     = useState('');
  const [type, setType]         = useState('refund');
  const [rrn, setRrn]           = useState('');
  const [arn, setArn]           = useState('');
  const [ref_no, setRefNo]      = useState('');
  const [date, setDate]         = useState(dayjs().format('YYYY-MM-DD'));

  const { data: refunds, isLoading } = useQuery({ queryKey: ['refunds'], queryFn: Refunds.list });
  const updateMut = useMutation({
    mutationFn: ({ id, status }: any) => Refunds.update_status(id, status),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['refunds'] }),
  });
  const createMut = useMutation({
    mutationFn: (body: any) => Refunds.create(body),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['refunds'] }); setShowAdd(false); },
  });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Between style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
          <Text style={{ fontSize: 16, color: C.accent }}>‹ Back</Text>
        </TouchableOpacity>
        <T.H>Refund tracker</T.H>
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Text style={{ fontSize: 22, color: C.accent }}>+</Text>
        </TouchableOpacity>
      </Between>

      {isLoading ? (
        <View style={s.empty}><T.Cap>Loading...</T.Cap></View>
      ) : !refunds?.length ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 40 }}>💸</Text>
          <Spacer h={sp[3]} />
          <T.H style={{ textAlign: 'center' }}>No refunds tracked</T.H>
          <T.Small style={{ textAlign: 'center', marginTop: sp[2], color: C.textTertiary }}>
            {'Refunds from SMS are auto-detected. Tap + to add one manually.'}
          </T.Small>
        </View>
      ) : (
        <FlatList
          data={refunds}
          keyExtractor={(r: any) => String(r.id)}
          contentContainerStyle={{ padding: sp[4] }}
          renderItem={({ item }: any) => (
            <RefundCard refund={item} onUpdateStatus={(id: number, status: string) => updateMut.mutate({ id, status })} />
          )}
        />
      )}

      <Modal visible={show_add} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.pageBg }}>
          <Between style={{ paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
            <TouchableOpacity onPress={() => setShowAdd(false)}><T.Small color={C.textTertiary}>Cancel</T.Small></TouchableOpacity>
            <T.Label>Track refund</T.Label>
            <TouchableOpacity onPress={() => createMut.mutate({ merchant: merchant || undefined, amount: amount ? Math.round(parseFloat(amount)*100) : undefined, refund_type: type, rrn: rrn || undefined, arn: arn || undefined, reference_no: ref_no || undefined, initiated_date: date })}>
              <T.Small color={C.accent}>Save</T.Small>
            </TouchableOpacity>
          </Between>
          <ScrollView contentContainerStyle={{ padding: sp[4] }}>
            <T.Cap style={{ marginBottom: sp[1] }}>MERCHANT</T.Cap>
            <TextInput style={[s.input, { marginBottom: sp[4] }]} value={merchant} onChangeText={setMerchant} placeholder="e.g. Swiggy" placeholderTextColor={C.textDisabled} />
            <T.Cap style={{ marginBottom: sp[1] }}>AMOUNT (₹)</T.Cap>
            <TextInput style={[s.input, { marginBottom: sp[4] }]} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={C.textDisabled} keyboardType="numeric" />
            <T.Cap style={{ marginBottom: sp[2] }}>TYPE</T.Cap>
            <Row style={{ gap: sp[2], marginBottom: sp[4] }}>
              {['refund','reversal','cashback'].map((t: string) => (
                <TouchableOpacity key={t} onPress={() => setType(t)} style={{ flex: 1, paddingVertical: sp[2], borderRadius: br.sm, alignItems: 'center', backgroundColor: type === t ? C.accentLight : C.n[200], borderWidth: 1, borderColor: type === t ? C.accentBorder : C.borderFaint }}>
                  <T.Cap style={{ color: type === t ? C.accent : C.textSecondary, fontFamily: F.medium }}>{t.charAt(0).toUpperCase()+t.slice(1)}</T.Cap>
                </TouchableOpacity>
              ))}
            </Row>
            <T.Cap style={{ marginBottom: sp[1] }}>RRN — 12-digit (PG-generated at auth)</T.Cap>
            <TextInput style={[s.input, { marginBottom: sp[4] }]} value={rrn} onChangeText={setRrn} placeholder="123456789012" placeholderTextColor={C.textDisabled} keyboardType="numeric" maxLength={12} />
            <T.Cap style={{ marginBottom: sp[1] }}>ARN — 23-digit (bank-generated at refund)</T.Cap>
            <TextInput style={[s.input, { marginBottom: sp[8] }]} value={arn} onChangeText={setArn} placeholder="AB12345678901234567890" placeholderTextColor={C.textDisabled} autoCapitalize="characters" maxLength={23} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  empty:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: sp[8] },
  refRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: sp[2], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  input:  { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[3], fontFamily: F.regular, fontSize: 14, color: C.textPrimary },
});
