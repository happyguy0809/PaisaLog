// src/components/HideSheet.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Animated, Dimensions, StyleSheet, TextInput } from 'react-native';
import { C, F, sp, br } from '../design/tokens';
import { T, Row, Between, Btn, Divider } from '../design/components';

const SCREEN_H = Dimensions.get('window').height;

export type HideMode = 'hide_from_list' | 'hide_from_family' | 'hide_from_both' | 'hide_until' | 'ghost';

interface Props {
  visible:      boolean;
  onClose:      () => void;
  onConfirm:    (opts: { mode: HideMode; hidden_until?: string; exclude_from_totals: boolean }) => void;
  current_mode?: HideMode | null;
}

const MODES: { key: HideMode; label: string; sub: string }[] = [
  { key: 'hide_from_list',   label: 'Hide from my list',       sub: 'In vault only. Still counted in your totals.' },
  { key: 'hide_from_family', label: 'Hide from family only',   sub: 'Stays in your list. Family sees "₹X Private".' },
  { key: 'hide_from_both',   label: 'Hide from both',          sub: 'Hidden from your list and family. Counted in totals.' },
  { key: 'hide_until',       label: 'Hide from family until…', sub: 'Auto-reveals to family after the date you set.' },
  { key: 'ghost',            label: 'Ghost mode',              sub: 'Invisible everywhere. NOT counted in any totals. Vault only.' },
];

export function HideSheet({ visible, onClose, onConfirm, current_mode }: Props) {
  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  const [mode,  setMode]  = useState<HideMode>('hide_from_list');
  const [until, setUntil] = useState('');
  useEffect(() => {
    Animated.spring(slideY, { toValue: visible ? 0 : SCREEN_H, useNativeDriver: true, bounciness: 3 }).start();
    if (visible) { setMode(current_mode ?? 'hide_from_list'); setUntil(''); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={s.handle} />
        <Between style={{ paddingHorizontal: sp[4], paddingBottom: sp[3] }}>
          <T.Label>Hide transaction</T.Label>
          <TouchableOpacity onPress={onClose}><T.Small color={C.textTertiary}>Cancel</T.Small></TouchableOpacity>
        </Between>
        <Divider />
        {MODES.map((m, i) => (
          <View key={m.key}>
            <TouchableOpacity style={s.option} onPress={() => setMode(m.key)} activeOpacity={0.7}>
              <View style={[s.radio, mode === m.key && s.radioActive]}>
                {mode === m.key && <View style={s.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <T.Small style={{ fontFamily: F.medium, color: C.textPrimary }}>{m.label}</T.Small>
                <T.Cap style={{ marginTop: 2 }}>{m.sub}</T.Cap>
              </View>
            </TouchableOpacity>
            {m.key === 'hide_until' && mode === 'hide_until' && (
              <View style={{ paddingHorizontal: sp[4], paddingBottom: sp[3] }}>
                <TextInput style={s.dateInput} value={until} onChangeText={setUntil}
                  placeholder="Reveal date: YYYY-MM-DD" placeholderTextColor={C.textDisabled} />
              </View>
            )}
            {i < MODES.length - 1 && <Divider inset={sp[4]} />}
          </View>
        ))}

        <View style={{ padding: sp[4] }}>
          <Btn label="Hide transaction" onPress={() => onConfirm({ mode, hidden_until: mode === 'hide_until' ? until : undefined, exclude_from_totals: mode === 'ghost' })}
            variant="danger" size="lg" fullWidth disabled={mode === 'hide_until' && !until} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.pageBg, borderTopLeftRadius: br.lg, borderTopRightRadius: br.lg },
  handle:     { width: 36, height: 4, borderRadius: br.full, backgroundColor: C.n[300], alignSelf: 'center', marginTop: sp[3], marginBottom: sp[2] },
  option:     { flexDirection: 'row', alignItems: 'flex-start', gap: sp[3], padding: sp[4] },
  radio:      { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.borderDefault, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioActive:{ borderColor: C.accent },
  radioDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  dateInput:  { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[3], fontFamily: F.regular, fontSize: 14, color: C.textPrimary },

});
