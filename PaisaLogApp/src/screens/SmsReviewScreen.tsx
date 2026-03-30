import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { SmsReview } from '../services/api'

interface ReviewItem {
  id: number; sender_id: string; body_preview: string
  overall_conf: number; mandatory_missing: string[]; optional_missing: string[]
  parsed_amount: number | null; parsed_currency: string | null
  parsed_action: string | null; parsed_merchant: string | null
  parsed_account: string | null; parsed_date: string | null
  parsed_bank: string | null; created_at: string
}

const confColour = (n: number) =>
  n >= 80 ? '#2d7a2d' : n >= 60 ? '#b36b00' : '#c0392b'

const fmtAmount = (paise: number | null, cur: string | null) =>
  paise == null ? '—' : `${cur ?? 'INR'} ${(paise / 100).toFixed(2)}`

export default function SmsReviewScreen() {
  const [items, setItems]       = useState<ReviewItem[]>([])
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState<ReviewItem | null>(null)
  const [edits, setEdits]       = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await SmsReview.list(); setItems(r.data) }
    catch { Alert.alert('Error', 'Could not load review queue') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const approve = async (item: ReviewItem) => {
    try {
      await SmsReview.approve(item.id, {
        account_id: 1,
        amount:   edits.amount   ? Math.round(parseFloat(edits.amount) * 100) : item.parsed_amount,
        currency: edits.currency ?? item.parsed_currency,
        merchant: edits.merchant ?? item.parsed_merchant,
        action:   edits.action   ?? item.parsed_action,
        date:     edits.date     ?? item.parsed_date,
      })
      setItems(p => p.filter(i => i.id !== item.id))
      setSelected(null); setEdits({})
    } catch { Alert.alert('Error', 'Approval failed') }
  }

  const reject = (item: ReviewItem) =>
    Alert.alert('Reject SMS', 'Mark as non-transaction noise?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        await SmsReview.reject(item.id)
        setItems(p => p.filter(i => i.id !== item.id))
        setSelected(null)
      }},
    ])

  if (selected) {
    const item = selected
    return (
      <ScrollView style={s.container}>
        <TouchableOpacity onPress={() => { setSelected(null); setEdits({}) }} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={[s.badge, { backgroundColor: confColour(item.overall_conf) }]}>
          <Text style={s.badgeText}>{item.overall_conf}% confidence · {item.sender_id}</Text>
        </View>
        <Text style={s.bodyText}>{item.body_preview}</Text>
        {item.mandatory_missing.length > 0 &&
          <Text style={s.warn}>⚠ Mandatory missing: {item.mandatory_missing.join(', ')}</Text>}
        <Text style={s.sectionTitle}>Correct if wrong, then approve</Text>
        {[
          { k: 'amount',   label: 'Amount',   def: fmtAmount(item.parsed_amount, item.parsed_currency) },
          { k: 'action',   label: 'Action',   def: item.parsed_action   ?? '' },
          { k: 'merchant', label: 'Merchant', def: item.parsed_merchant ?? '' },
          { k: 'account',  label: 'Account',  def: item.parsed_account  ?? '' },
          { k: 'date',     label: 'Date',     def: item.parsed_date     ?? '' },
        ].map(f => (
          <View key={f.k} style={s.fieldRow}>
            <Text style={s.fieldLabel}>{f.label}</Text>
            <TextInput
              style={[s.fieldInput, edits[f.k] && s.fieldEdited]}
              defaultValue={f.def}
              onChangeText={v => setEdits(e => ({ ...e, [f.k]: v }))}
              placeholder="—"
            />
          </View>
        ))}
        <View style={s.actions}>
          <TouchableOpacity style={s.rejectBtn} onPress={() => reject(item)}>
            <Text style={s.rejectTxt}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.approveBtn} onPress={() => approve(item)}>
            <Text style={s.approveTxt}>✓ Approve</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>SMS Review Queue</Text>
        <Text style={s.headerCount}>{items.length} pending</Text>
      </View>
      <ScrollView>
        {loading && <ActivityIndicator style={{ margin: 20 }} />}
        {items.map(item => (
          <TouchableOpacity key={item.id} style={s.row} onPress={() => setSelected(item)}>
            <View style={[s.bar, { backgroundColor: confColour(item.overall_conf) }]} />
            <View style={s.rowBody}>
              <View style={s.rowTop}>
                <Text style={s.rowSender}>{item.sender_id}</Text>
                <Text style={[s.rowConf, { color: confColour(item.overall_conf) }]}>
                  {item.overall_conf}%
                </Text>
              </View>
              <Text style={s.rowAmt}>
                {fmtAmount(item.parsed_amount, item.parsed_currency)}
                {item.parsed_action   ? ` · ${item.parsed_action}`   : ''}
                {item.parsed_merchant ? ` · ${item.parsed_merchant}` : ''}
              </Text>
              <Text style={s.rowPreview} numberOfLines={1}>{item.body_preview}</Text>
              {item.mandatory_missing.length > 0 &&
                <Text style={s.rowWarn}>⚠ {item.mandatory_missing.join(', ')} missing</Text>}
            </View>
          </TouchableOpacity>
        ))}
        {!loading && items.length === 0 &&
          <View style={s.empty}><Text style={s.emptyTxt}>✓ Queue empty</Text></View>}
        <TouchableOpacity style={s.reload} onPress={load}>
          <Text style={s.reloadTxt}>Refresh</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F5F5F2' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e0e0e0' },
  headerTitle:  { fontSize: 16, fontWeight: '700', fontFamily: 'DM Sans' },
  headerCount:  { fontSize: 14, color: '#888', fontFamily: 'DM Sans' },
  row:          { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, borderRadius: 8, overflow: 'hidden' },
  bar:          { width: 4 },
  rowBody:      { flex: 1, padding: 10 },
  rowTop:       { flexDirection: 'row', justifyContent: 'space-between' },
  rowSender:    { fontSize: 11, color: '#888', fontFamily: 'DM Sans' },
  rowConf:      { fontSize: 12, fontWeight: '700', fontFamily: 'DM Sans' },
  rowAmt:       { fontSize: 13, fontWeight: '600', color: '#111', marginTop: 2, fontFamily: 'DM Sans' },
  rowPreview:   { fontSize: 11, color: '#999', marginTop: 2, fontFamily: 'DM Sans' },
  rowWarn:      { fontSize: 11, color: '#c0392b', marginTop: 2, fontFamily: 'DM Sans' },
  back:         { padding: 16 },
  backText:     { color: '#2563EB', fontSize: 14, fontFamily: 'DM Sans' },
  badge:        { alignSelf: 'flex-start', margin: 16, marginTop: 0, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText:    { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'DM Sans' },
  bodyText:     { fontSize: 13, color: '#333', marginHorizontal: 16, marginBottom: 8, lineHeight: 18, fontFamily: 'DM Sans' },
  warn:         { color: '#c0392b', fontSize: 12, marginHorizontal: 16, marginBottom: 8, fontFamily: 'DM Sans' },
  sectionTitle: { fontSize: 11, color: '#888', marginHorizontal: 16, marginTop: 8, marginBottom: 6, fontFamily: 'DM Sans', textTransform: 'uppercase' },
  fieldRow:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6 },
  fieldLabel:   { width: 72, fontSize: 12, color: '#888', fontFamily: 'DM Sans' },
  fieldInput:   { flex: 1, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0', paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, fontFamily: 'DM Sans' },
  fieldEdited:  { borderColor: '#2563EB', backgroundColor: '#f0f5ff' },
  actions:      { flexDirection: 'row', margin: 16, gap: 10 },
  rejectBtn:    { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#c0392b', alignItems: 'center' },
  rejectTxt:    { color: '#c0392b', fontWeight: '600', fontFamily: 'DM Sans' },
  approveBtn:   { flex: 2, padding: 12, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center' },
  approveTxt:   { color: '#fff', fontWeight: '600', fontFamily: 'DM Sans' },
  empty:        { padding: 40, alignItems: 'center' },
  emptyTxt:     { color: '#2d7a2d', fontSize: 16, fontFamily: 'DM Sans' },
  reload:       { margin: 16, padding: 12, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center' },
  reloadTxt:    { color: '#2563EB', fontFamily: 'DM Sans' },
})
