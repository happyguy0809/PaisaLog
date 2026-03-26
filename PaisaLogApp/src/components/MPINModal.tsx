// src/components/MPINModal.tsx
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { C, F, sp, br } from '../design/tokens';
import { T } from '../design/components';

interface Props {
  visible:      boolean;
  mode:         'enter' | 'setup' | 'confirm';
  title?:       string;
  subtitle?:    string;
  onSuccess:    (pin: string) => void;
  onCancel:     () => void;
  error?:       string;
  onForgotPin?: () => void;
}

export function MPINModal({ visible, mode, title, subtitle, onSuccess, onCancel, error, onForgotPin }: Props) {
  const [pin, setPin] = useState('');
  const [shake]       = useState(new Animated.Value(0));

  useEffect(() => { if (visible) setPin(''); }, [visible]);

  useEffect(() => {
    if (error) {
      setPin('');
      Animated.sequence([
        Animated.timing(shake, { toValue: 10,  duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 10,  duration: 50, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0,   duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [error]);

  useEffect(() => { if (pin.length === 4) onSuccess(pin); }, [pin]);

  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <T.Label style={{ textAlign: 'center', marginBottom: sp[1] }}>
            {title ?? (mode === 'setup' ? 'Set your vault PIN' : mode === 'confirm' ? 'Confirm PIN' : 'Enter vault PIN')}
          </T.Label>
          {subtitle && <T.Cap style={{ textAlign: 'center', marginBottom: sp[4] }}>{subtitle}</T.Cap>}
          <Animated.View style={[s.dots, { transform: [{ translateX: shake }] }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[s.dot, pin.length > i && s.dotFilled]} />
            ))}
          </Animated.View>
          {error ? <T.Cap style={{ color: C.dangerText, textAlign: 'center', marginBottom: sp[3] }}>{error}</T.Cap> : null}
          {KEYS.map((row, ri) => (
            <View key={ri} style={s.row}>
              {row.map((k, ki) => k === '' ? (
                <View key={ki} style={s.keyEmpty} />
              ) : (
                <TouchableOpacity key={ki} style={s.key} activeOpacity={0.6}
                  onPress={() => k === '⌫' ? setPin(p => p.slice(0,-1)) : setPin(p => p.length < 4 ? p+k : p)}>
                  <Text style={s.keyTxt}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <TouchableOpacity onPress={onCancel} style={{ marginTop: sp[3], alignItems: 'center' }}>
            <T.Small color={C.textTertiary}>Cancel</T.Small>
          </TouchableOpacity>
          {onForgotPin && (
            <TouchableOpacity onPress={onForgotPin} style={{ marginTop: sp[2], alignItems: 'center' }}>
              <Text style={{ fontFamily: F.medium, fontSize: 13, color: '#6366F1' }}>Forgot PIN?</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  sheet:     { backgroundColor: C.cardBg, borderRadius: br.lg, padding: sp[6], width: 300 },
  dots:      { flexDirection: 'row', justifyContent: 'center', gap: sp[4], marginVertical: sp[5] },
  dot:       { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: C.accent, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: C.accent, borderColor: C.accent },
  row:       { flexDirection: 'row', justifyContent: 'center', gap: sp[3], marginBottom: sp[3] },
  key:       { width: 68, height: 56, borderRadius: br.md, backgroundColor: C.n[200], alignItems: 'center', justifyContent: 'center' },
  keyEmpty:  { width: 68, height: 56 },
  keyTxt:    { fontFamily: F.semibold, fontSize: 22, color: C.textPrimary },
});
