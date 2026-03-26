// src/screens/account/AccountSettingsScreen.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, TextInput, Modal, FlatList, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { C, F, sp, br } from '../../design/tokens';
import { T, Between, Card, Divider, Spacer, Btn } from '../../design/components';
import { User } from '../../services/api';
import { CURRENCIES, TIMEZONES, type Currency, type Timezone } from '../../config';

// ── Timezone Picker Modal ─────────────────────────────────────
function TimezonePicker({ visible, current, onSelect, onClose }: {
  visible: boolean; current: string; onSelect: (tz: Timezone) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return TIMEZONES;
    const q = search.toLowerCase();
    return TIMEZONES.filter(tz =>
      tz.label.toLowerCase().includes(q) ||
      tz.abbr.toLowerCase().includes(q) ||
      tz.utc_offset.includes(q) ||
      tz.region.toLowerCase().includes(q)
    );
  }, [search]);

  // Group by region for section list
  const sections = useMemo(() => {
    const map: Record<string, Timezone[]> = {};
    filtered.forEach(tz => {
      if (!map[tz.region]) map[tz.region] = [];
      map[tz.region].push(tz);
    });
    return Object.entries(map).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.pageBg }}>
        <Between style={{ paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
          <T.Label>Select timezone</T.Label>
          <TouchableOpacity onPress={onClose}>
            <T.Small color={C.accent}>Done</T.Small>
          </TouchableOpacity>
        </Between>

        {/* Search */}
        <View style={{ paddingHorizontal: sp[4], paddingVertical: sp[2], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
          <View style={ps.searchBox}>
            <Text style={{ color: C.textTertiary, marginRight: sp[2] }}>🔍</Text>
            <TextInput
              style={{ flex: 1, fontFamily: F.regular, fontSize: 14, color: C.textPrimary }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search city, abbreviation or offset..."
              placeholderTextColor={C.textDisabled}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Text style={{ color: C.textTertiary, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={item => item.value}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={ps.sectionHdr}>
              <T.Cap style={{ letterSpacing: 0.5, color: C.textTertiary }}>{section.title.toUpperCase()}</T.Cap>
            </View>
          )}
          renderItem={({ item: tz }) => {
            const selected = tz.value === current;
            return (
              <TouchableOpacity onPress={() => { onSelect(tz); onClose(); }} activeOpacity={0.7}>
                <View style={[ps.tzRow, selected && ps.tzRowActive]}>
                  {/* Timezone name | Abbreviation | UTC offset */}
                  <View style={{ flex: 1 }}>
                    <T.Small style={{ fontFamily: selected ? F.semibold : F.regular, color: selected ? C.accent : C.textPrimary }}>
                      {tz.label}
                    </T.Small>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp[2], marginTop: 2 }}>
                      <View style={ps.abbrBadge}>
                        <Text style={ps.abbrTxt}>{tz.abbr}</Text>
                      </View>
                      <T.Cap style={{ color: C.textTertiary }}>UTC {tz.utc_offset}</T.Cap>
                    </View>
                  </View>
                  {selected && <Text style={{ color: C.accent, fontSize: 16 }}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <Divider inset={sp[4]} />}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ── Currency Picker Modal ─────────────────────────────────────
function CurrencyPicker({ visible, current, onSelect, onClose }: {
  visible: boolean; current: string; onSelect: (c: Currency) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return CURRENCIES;
    const q = search.toLowerCase();
    return CURRENCIES.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.symbol.includes(q)
    );
  }, [search]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.pageBg }}>
        <Between style={{ paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
          <T.Label>Select currency</T.Label>
          <TouchableOpacity onPress={onClose}>
            <T.Small color={C.accent}>Done</T.Small>
          </TouchableOpacity>
        </Between>
        <View style={{ paddingHorizontal: sp[4], paddingVertical: sp[2], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint }}>
          <View style={ps.searchBox}>
            <Text style={{ color: C.textTertiary, marginRight: sp[2] }}>🔍</Text>
            <TextInput
              style={{ flex: 1, fontFamily: F.regular, fontSize: 14, color: C.textPrimary }}
              value={search} onChangeText={setSearch}
              placeholder="Search currency..."
              placeholderTextColor={C.textDisabled}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Text style={{ color: C.textTertiary, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <FlatList
          data={filtered}
          keyExtractor={item => item.code}
          ItemSeparatorComponent={() => <Divider inset={sp[4]} />}
          renderItem={({ item: cur }) => {
            const selected = cur.code === current;
            return (
              <TouchableOpacity onPress={() => { onSelect(cur); onClose(); }} activeOpacity={0.7}>
                <View style={[ps.tzRow, selected && ps.tzRowActive]}>
                  <View style={ps.symbolBox}>
                    <Text style={{ fontFamily: F.bold, fontSize: 16, color: selected ? C.accent : C.textPrimary }}>{cur.symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T.Small style={{ fontFamily: selected ? F.semibold : F.regular, color: selected ? C.accent : C.textPrimary }}>
                      {cur.name}
                    </T.Small>
                    <View style={{ flexDirection: 'row', gap: sp[2], marginTop: 2 }}>
                      <View style={ps.abbrBadge}>
                        <Text style={ps.abbrTxt}>{cur.code}</Text>
                      </View>
                      <T.Cap style={{ color: C.textTertiary }}>smallest unit: {cur.smallest_unit}</T.Cap>
                    </View>
                  </View>
                  {selected && <Text style={{ color: C.accent, fontSize: 16 }}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ── Main AccountSettingsScreen ────────────────────────────────
export function AccountSettingsScreen() {
  const nav = useNavigation<any>();
  const qc  = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: User.me });

  const [timezone,    setTimezone]    = useState('Asia/Kolkata');
  const [currency,    setCurrency]    = useState('INR');
  const [income_vis,  setIncomeVis]   = useState(false);
  const [show_tz,     setShowTz]      = useState(false);
  const [show_cur,    setShowCur]     = useState(false);
  const [saved,       setSaved]       = useState(false);

  useEffect(() => {
    if (me) {
      setTimezone((me as any).timezone   ?? 'Asia/Kolkata');
      setCurrency((me as any).home_currency ?? 'INR');
      setIncomeVis((me as any).income_visible_to_family ?? false);
    }
  }, [me]);

  const saveMut = useMutation({
    mutationFn: () => User.update_settings({ timezone, home_currency: currency, income_visible_to_family: income_vis }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['me'] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  const cur_tz  = TIMEZONES.find(t => t.value === timezone);
  const cur_cur = CURRENCIES.find(c => c.code === currency);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Between style={s.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
          <Text style={{ fontSize: 16, color: C.accent }}>‹ Back</Text>
        </TouchableOpacity>
        <T.H>Settings</T.H>
        <View style={{ width: 48 }} />
      </Between>

      <ScrollView contentContainerStyle={{ padding: sp[4] }} showsVerticalScrollIndicator={false}>

        {/* Timezone — tappable row */}
        <T.Cap style={s.secHdr}>TIMEZONE</T.Cap>
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[5] }}>
          <TouchableOpacity onPress={() => setShowTz(true)} activeOpacity={0.7}>
            <View style={{ padding: sp[4] }}>
              <Between>
                <View style={{ flex: 1 }}>
                  <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>
                    {cur_tz?.label ?? timezone}
                  </T.Small>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp[2], marginTop: 4 }}>
                    <View style={ps.abbrBadge}>
                      <Text style={ps.abbrTxt}>{cur_tz?.abbr ?? '—'}</Text>
                    </View>
                    <T.Cap>UTC {cur_tz?.utc_offset ?? ''}</T.Cap>
                  </View>
                </View>
                <Text style={{ color: C.textTertiary, fontSize: 18 }}>›</Text>
              </Between>
            </View>
          </TouchableOpacity>
        </Card>

        {/* Currency — tappable row */}
        <T.Cap style={s.secHdr}>HOME CURRENCY</T.Cap>
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: sp[5] }}>
          <TouchableOpacity onPress={() => setShowCur(true)} activeOpacity={0.7}>
            <View style={{ padding: sp[4] }}>
              <Between>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp[3], flex: 1 }}>
                  <View style={ps.symbolBox}>
                    <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.accent }}>{cur_cur?.symbol ?? '₹'}</Text>
                  </View>
                  <View>
                    <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{cur_cur?.name ?? currency}</T.Small>
                    <View style={{ flexDirection: 'row', gap: sp[2], marginTop: 4 }}>
                      <View style={ps.abbrBadge}>
                        <Text style={ps.abbrTxt}>{cur_cur?.code ?? currency}</Text>
                      </View>
                      <T.Cap>smallest unit: {cur_cur?.smallest_unit}</T.Cap>
                    </View>
                  </View>
                </View>
                <Text style={{ color: C.textTertiary, fontSize: 18 }}>›</Text>
              </Between>
            </View>
          </TouchableOpacity>
        </Card>

        {/* Family privacy */}
        <T.Cap style={s.secHdr}>FAMILY PRIVACY</T.Cap>
        <Card padding={sp[4]} style={{ marginBottom: sp[5] }}>
          <Between>
            <View style={{ flex: 1, marginRight: sp[4] }}>
              <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>Show income to family</T.Small>
              <T.Cap style={{ marginTop: 2 }}>When on, your income is visible to household members.</T.Cap>
            </View>
            <Switch value={income_vis} onValueChange={setIncomeVis}
              trackColor={{ false: C.n[300], true: C.investDot }} thumbColor={C.white} />
          </Between>
        </Card>

        <Btn
          label={saved ? '✓ Saved' : 'Save settings'}
          onPress={() => saveMut.mutate()}
          loading={saveMut.isPending}
          variant="primary" size="lg" fullWidth
        />
        <Spacer h={sp[10]} />
      </ScrollView>

      <TimezonePicker visible={show_tz} current={timezone} onSelect={tz => setTimezone(tz.value)} onClose={() => setShowTz(false)} />
      <CurrencyPicker visible={show_cur} current={currency} onSelect={cur => setCurrency(cur.code)} onClose={() => setShowCur(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.pageBg },
  header: { paddingHorizontal: sp[4], paddingVertical: sp[3], borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  secHdr: { marginBottom: sp[2], letterSpacing: 0.5, paddingLeft: sp[1] },
});

const ps = StyleSheet.create({
  searchBox:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, paddingHorizontal: sp[3], paddingVertical: sp[2] },
  sectionHdr:  { paddingHorizontal: sp[4], paddingVertical: sp[2], backgroundColor: C.pageBg, borderBottomWidth: 0.5, borderBottomColor: C.borderFaint },
  tzRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: sp[4], paddingVertical: sp[3], gap: sp[3] },
  tzRowActive: { backgroundColor: C.accentLight },
  abbrBadge:   { paddingHorizontal: sp[2], paddingVertical: 2, borderRadius: br.sm, backgroundColor: C.n[200] },
  abbrTxt:     { fontFamily: F.semibold, fontSize: 10, color: C.textSecondary, letterSpacing: 0.3 },
  symbolBox:   { width: 40, height: 40, borderRadius: br.sm, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.accentBorder },
});
