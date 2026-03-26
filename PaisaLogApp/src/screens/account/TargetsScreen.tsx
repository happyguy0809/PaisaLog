// src/screens/account/TargetsScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { C, F, sp, br, fmt } from '../../design/tokens';
import { T, Between, Row, Card, Divider, Spacer, Btn } from '../../design/components';
import { HouseholdApi, PersonalTargets } from '../../services/api';
import { fmt_money } from '../../utils/money';

const TARGET_TYPES = [
  { type: 'expense',    label: 'Monthly expense limit',    color: '#EF4444', bg: '#FDF2F2' },
  { type: 'investment', label: 'Monthly investment target', color: '#F8961E', bg: '#FFF7ED' },
  { type: 'saving',     label: 'Monthly savings target',   color: '#0EA5E9', bg: '#EFF9FF' },
];


function PersonalTargetsCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: targets } = useQuery({
    queryKey: ['personal_targets'],
    queryFn:  PersonalTargets.get,
  });
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const end   = now.toISOString().split('T')[0];
  const { data: summary } = useQuery({
    queryKey: ['summary', start, end],
    queryFn:  () => Transactions.summary({ start, end }),
  });

  const setMut = useMutation({
    mutationFn: (body: any) => PersonalTargets.set(body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['personal_targets'] }),
  });

  function get_amt(type: string) {
    return (targets ?? []).find((t: any) => t.target_type === type)?.amount ?? 0;
  }

  return (
    <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[4] }}>
      <Between style={{ padding: sp[4], paddingBottom: sp[3] }}>
        <View>
          <T.Small style={{ fontFamily: F.semibold, color: C.textPrimary }}>Personal targets</T.Small>
          <T.Cap>Your individual monthly goals</T.Cap>
        </View>
        <TouchableOpacity
          onPress={() => setEditing(v => !v)}
          style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.sm,
            backgroundColor: editing ? C.accentLight : C.n[200],
            borderWidth: 1, borderColor: editing ? C.accentBorder : C.borderFaint }}
        >
          <T.Cap style={{ color: editing ? C.accent : C.textSecondary }}>
            {editing ? 'Done' : 'Edit'}
          </T.Cap>
        </TouchableOpacity>
      </Between>
      <Divider />
      {TARGET_TYPES.map(({ type, label, color, bg }, i) => {
        const amt = get_amt(type);
        return (
          <View key={type}>
            <View style={{ padding: sp[4], backgroundColor: amt > 0 ? bg : undefined }}>
              <Between style={{ marginBottom: editing ? sp[2] : 0 }}>
                <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{label}</T.Small>
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: amt > 0 ? color : C.textDisabled }}>
                  {amt > 0 ? fmt_money(amt) : 'Not set'}
                </Text>
              </Between>
              {amt > 0 && !editing && summary && (() => {
                const actual = type === 'expense' ? (summary as any).debit_amount ?? 0
                             : type === 'investment' ? (summary as any).invest_amount ?? 0
                             : Math.max(0, ((summary as any).credit_amount ?? 0) - ((summary as any).debit_amount ?? 0));
                const pct = Math.min(100, Math.round(actual / amt * 100));
                const bar_color = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F8961E' : color;
                return (
                  <View style={{ marginTop: sp[2] }}>
                    <View style={{ height: 4, backgroundColor: C.n[200], borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: 4, width: `${pct}%`, backgroundColor: bar_color, borderRadius: 2 }} />
                    </View>
                    <T.Cap style={{ marginTop: 2, color: bar_color }}>
                      {fmt_money(actual)} of {fmt_money(amt)} ({pct}%)
                    </T.Cap>
                  </View>
                );
              })()}
              {editing && (
                <TextInput
                  style={[s.input, { borderColor: color + '60' }]}
                  defaultValue={amt > 0 ? String(amt / 100) : ''}
                  placeholder={'Amount in ₹'}
                  placeholderTextColor={C.textDisabled}
                  keyboardType="numeric"
                  onEndEditing={(e) => {
                    const v = parseFloat(e.nativeEvent.text) * 100;
                    if (!isNaN(v) && v >= 0) {
                      setMut.mutate({ category: 'overall', target_type: type, amount: Math.round(v) });
                    }
                  }}
                />
              )}
            </View>
            {i < TARGET_TYPES.length - 1 && <Divider />}
          </View>
        );
      })}
    </Card>
  );
}

function HouseholdTargets({ hh }: { hh: any }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: targets } = useQuery({
    queryKey: ['household_targets', hh.id],
    queryFn:  () => HouseholdApi.targets(hh.id),
  });

  const setMut = useMutation({
    mutationFn: (body: any) => HouseholdApi.set_target(hh.id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['household_targets', hh.id] }),
  });

  const is_admin = hh.role === 'admin';

  function get_amt(type: string) {
    return (targets ?? []).find((t: any) => t.target_type === type)?.amount ?? 0;
  }

  return (
    <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[4] }}>
      <Between style={{ padding: sp[4], paddingBottom: sp[3] }}>
        <View>
          <T.Small style={{ fontFamily: F.semibold, color: C.textPrimary }}>{hh.name}</T.Small>
          <T.Cap>{hh.member_count} members · {hh.role}</T.Cap>
        </View>
        {is_admin && (
          <TouchableOpacity
            onPress={() => setEditing(v => !v)}
            style={{ paddingHorizontal: sp[3], paddingVertical: sp[1], borderRadius: br.sm, backgroundColor: editing ? C.accentLight : C.n[200], borderWidth: 1, borderColor: editing ? C.accentBorder : C.borderFaint }}
          >
            <T.Cap style={{ color: editing ? C.accent : C.textSecondary }}>
              {editing ? 'Done' : 'Edit'}
            </T.Cap>
          </TouchableOpacity>
        )}
      </Between>
      <Divider />
      {TARGET_TYPES.map(({ type, label, color, bg }, i) => {
        const amt = get_amt(type);
        return (
          <View key={type}>
            <View style={{ padding: sp[4], backgroundColor: amt > 0 ? bg : undefined }}>
              <Between style={{ marginBottom: editing ? sp[2] : 0 }}>
                <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{label}</T.Small>
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: amt > 0 ? color : C.textDisabled }}>
                  {amt > 0 ? fmt_money(amt) : 'Not set'}
                </Text>
              </Between>
              {editing && (
                <TextInput
                  style={[s.input, { borderColor: color + '60' }]}
                  defaultValue={amt > 0 ? String(amt / 100) : ''}
                  placeholder={'Amount in ₹'}
                  placeholderTextColor={C.textDisabled}
                  keyboardType="numeric"
                  onEndEditing={(e) => {
                    const v = parseFloat(e.nativeEvent.text) * 100;
                    if (!isNaN(v) && v > 0) {
                      setMut.mutate({ category: 'overall', target_type: type, amount: Math.round(v) });
                    } else if (e.nativeEvent.text === '' && amt > 0) {
                      setMut.mutate({ category: 'overall', target_type: type, amount: 0 });
                    }
                  }}
                />
              )}
            </View>
            {i < TARGET_TYPES.length - 1 && <Divider />}
          </View>
        );
      })}
    </Card>
  );
}

export function TargetsScreen() {
  const nav = useNavigation<any>();

  const { data: my_households } = useQuery({
    queryKey: ['my_households'],
    queryFn:  HouseholdApi.my_households,
  });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Between style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
          <Text style={{ fontSize: 16, color: C.accent }}>‹ Back</Text>
        </TouchableOpacity>
        <T.H>Targets</T.H>
        <View style={{ width: 48 }} />
      </Between>

      <ScrollView contentContainerStyle={{ padding: sp[4] }} showsVerticalScrollIndicator={false}>
        <PersonalTargetsCard />
        <Spacer h={sp[2]} />
        {(my_households ?? []).length > 0 && (
          <>
            <T.Cap style={{ marginBottom: sp[3], letterSpacing: 0.5, marginTop: sp[2] }}>FAMILY GROUPS</T.Cap>
            {(my_households ?? []).map((hh: any) => (
              <HouseholdTargets key={hh.id} hh={hh} />
            ))}
          </>
        )}
        <Spacer h={sp[10]} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  empty:  { alignItems: 'center', justifyContent: 'center', paddingVertical: sp[16] },
  input:  { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[3], fontFamily: F.regular, fontSize: 14, color: C.textPrimary, marginTop: sp[1] },
});
