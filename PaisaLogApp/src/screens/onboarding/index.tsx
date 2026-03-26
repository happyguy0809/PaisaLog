// src/screens/onboarding/index.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, StatusBar, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, sp, br } from '../../design/tokens';
import { Btn, T, Spacer } from '../../design/components';
import { Auth, storage, EmailAccounts, LinkedEmailAccount } from '../../services/api';
import { request_sms_permission } from '../../services/sms';

type Step = 'sms' | 'bank_email' | 'email' | 'sent' | 'backup';

export function OnboardingScreen({
  navigation,
  setIsOnboarded,
}: {
  navigation: any;
  setIsOnboarded: (val: boolean) => void;
}) {
  const [step, setStep] = useState<Step>('sms');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmailAccount[]>(() => EmailAccounts.list());
  const [newEmail, setNewEmail] = useState('');

  // Deep link listener — fires when magic link is tapped while on sent screen
  useEffect(() => {
    if (step !== 'sent') return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url?.startsWith('paisalog://auth')) return;
      setTimeout(() => {
        const authed =
          storage.getString('onboarding_done') === 'true' &&
          !!storage.getString('tok_access');
        if (authed) {
          setIsOnboarded(true);
          navigation.replace('Main');
        }
      }, 400);
    });
    return () => sub.remove();
  }, [step]);

  if (step === 'sms') {
    const examples = [
      { sender: 'VM-HDFCBK', tag: 'Debit detected', tagColor: C.spendText, tagBg: C.spendBg,
        msg: 'Rs 1,250 debited from A/c XX4521 at SWIGGY on 18-03-26. Avl Bal: Rs 38,420.' },
      { sender: 'BX-AXISBK', tag: 'Salary detected', tagColor: C.investText, tagBg: C.investBg,
        msg: 'Rs 85,000 credited to your AXIS Bank a/c on 01-03-26. Ref: 9182736450.' },
      { sender: 'VM-NETFLX', tag: 'Subscription', tagColor: C.accent, tagBg: C.accentLight,
        msg: 'Rs 649 debited from A/c XX7823 for Netflix subscription renewal.' },
    ];
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />
        <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
          <View style={s.logoRow}>
            <View style={s.logoDot} />
            <Text style={s.logoTxt}>PaisaLog</Text>
          </View>
          <Spacer h={sp[8]} />
          <Text style={s.headLine}>Your bank SMS,{'\n'}turned into clarity.</Text>
          <T.Body style={{ marginTop: sp[3], lineHeight: 22 }}>
            We read transaction alerts automatically. No login, no bank credentials, no OTPs — ever.
          </T.Body>
          <Spacer h={sp[6]} />
          {examples.map((ex, i) => (
            <View key={i} style={[s.smsCard, { marginBottom: sp[2] }]}>
              <View style={s.smsCardTop}>
                <Text style={s.smsSender}>{ex.sender}</Text>
                <View style={[s.smsTag, { backgroundColor: ex.tagBg }]}>
                  <Text style={[s.smsTagTxt, { color: ex.tagColor }]}>{ex.tag}</Text>
                </View>
              </View>
              <Text style={s.smsMsg}>{ex.msg}</Text>
            </View>
          ))}
          <Spacer h={sp[4]} />
          <View style={s.privacyRow}>
            <Text style={s.lock}>🔒</Text>
            <T.Cap style={s.privacyTxt}>
              OTPs are discarded immediately. Message bodies never leave your phone.
            </T.Cap>
          </View>
          <Spacer h={sp[6]} />
          <Btn
            label="Allow SMS access"
            onPress={async () => {
              await request_sms_permission();
              setStep("bank_email");
            }}
            variant="primary"
            size="lg"
            fullWidth
          />
          <TouchableOpacity style={s.skipBtn} onPress={() => setStep("bank_email")}>
            <T.Cap>Skip for now</T.Cap>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'bank_email') {
    function handleAdd() {
      const t = newEmail.trim().toLowerCase();
      if (!t.includes('@') || !t.includes('.')) return;
      try {
        const provider: LinkedEmailAccount['provider'] =
          t.endsWith('@gmail.com') ? 'gmail' :
          (t.endsWith('@outlook.com') || t.endsWith('@hotmail.com')) ? 'outlook' : 'other';
        EmailAccounts.add({ email: t, provider });
        setLinkedEmails(EmailAccounts.list());
        setNewEmail('');
      } catch {}
    }
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.pageBg} />
        <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
          <View style={s.logoRow}><View style={s.logoDot} /><Text style={s.logoTxt}>PaisaLog</Text></View>
          <Spacer h={sp[8]} />
          <Text style={s.headLine}>{'Connect\nbank emails.'}</Text>
          <T.Body style={{ marginTop: sp[3], lineHeight: 22 }}>
            Add the Gmail or Outlook address linked to your bank.
          </T.Body>
          <Spacer h={sp[5]} />
          {linkedEmails.map(acc => (
            <View key={acc.id} style={be.pill}>
              <Text style={be.pillIcon}>{acc.provider === 'gmail' ? '📧' : acc.provider === 'outlook' ? '📨' : '✉️'}</Text>
              <Text style={be.pillEmail}>{acc.email}</Text>
              <TouchableOpacity onPress={() => { EmailAccounts.remove(acc.id); setLinkedEmails(EmailAccounts.list()); }}>
                <Text style={be.pillX}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={be.inputRow}>
            <TextInput
              style={be.input} value={newEmail} onChangeText={setNewEmail}
              placeholder="you@gmail.com" placeholderTextColor={C.textDisabled}
              keyboardType="email-address" autoCapitalize="none"
              returnKeyType="done" onSubmitEditing={handleAdd}
            />
            <TouchableOpacity style={[be.addBtn, !newEmail.includes('@') && be.addBtnOff]}
              onPress={handleAdd} disabled={!newEmail.includes('@')}>
              <Text style={be.addBtnTxt}>Add</Text>
            </TouchableOpacity>
          </View>
          <View style={s.privacyRow}>
            <Text style={s.lock}>🔒</Text>
            <T.Cap style={s.privacyTxt}>Only transaction emails are read. No credentials stored.</T.Cap>
          </View>
          <Spacer h={sp[6]} />
          <Btn
            label={linkedEmails.length > 0 ? 'Continue' : 'Continue without email'}
            onPress={() => setStep('email')}
            variant={linkedEmails.length > 0 ? 'primary' : 'secondary'}
            size="lg" fullWidth
          />
          <TouchableOpacity style={s.skipBtn} onPress={() => setStep('email')}>
            <T.Cap>Skip — I'll add later</T.Cap>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'email') {
    const valid = email.includes('@') && email.includes('.');
    async function send() {
      if (!valid || loading) return;
      setLoading(true);
      setError('');
      try {
        await Auth.magicLink(email.toLowerCase().trim());
        setStep('sent');
      } catch (e: any) {
        setError(e.message ?? 'Could not send link. Try again.');
      } finally {
        setLoading(false);
      }
    }
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.select({ ios: 'padding', android: 'height' })}
        >
          <View style={s.page}>
            <View style={s.logoRow}>
              <View style={s.logoDot} />
              <Text style={s.logoTxt}>PaisaLog</Text>
            </View>
            <Spacer h={sp[8]} />
            <Text style={s.headLine}>Enter your{'\n'}email to begin.</Text>
            <T.Body style={{ marginTop: sp[3] }}>We will send a sign-in link. No password, ever.</T.Body>
            <Spacer h={sp[8]} />
            <TouchableOpacity style={s.emailField} activeOpacity={1}>
              <T.Cap>EMAIL</T.Cap>
              <TextInput
                style={s.emailInput}
                value={email}
                onChangeText={t => { setEmail(t); setError(''); }}
                placeholder="you@example.com"
                placeholderTextColor={C.textDisabled}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onSubmitEditing={send}
                returnKeyType="send"
              />
            </TouchableOpacity>
            {error ? <T.Small color={C.dangerText} style={{ marginTop: sp[2] }}>{error}</T.Small> : null}
            <Spacer h={sp[5]} />
            <Btn label="Send sign-in link" onPress={send} loading={loading} disabled={!valid} variant="primary" size="lg" fullWidth />
            <T.Cap style={s.authNote}>Your email is stored as a one-way hash.</T.Cap>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (step === 'sent') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={[s.page, { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={s.sentIcon}>
            <Text style={{ fontSize: 28 }}>✉</Text>
          </View>
          <Spacer h={sp[5]} />
          <Text style={[s.headLine, { textAlign: 'center' }]}>Check your email</Text>
          <T.Body style={{ textAlign: 'center', marginTop: sp[3] }}>
            We sent a sign-in link to{'\n'}
            <Text style={{ fontFamily: F.semibold, color: C.accent }}>{email}</Text>
          </T.Body>
          <T.Cap style={{ marginTop: sp[5], textAlign: 'center', lineHeight: 18 }}>
            Link expires in 15 minutes. Check spam if it does not arrive.
          </T.Cap>
          <Spacer h={sp[6]} />
          <TouchableOpacity onPress={() => setStep('email')}>
            <T.Small color={C.accent}>Resend link</T.Small>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'backup') {
    function done(pref: string) {
      storage.set('backup_pref', pref);
      storage.set('onboarding_done', 'true');
      setIsOnboarded(true);
      navigation.replace('Main');
    }
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.page}>
          <View style={s.logoRow}>
            <View style={s.logoDot} />
            <Text style={s.logoTxt}>PaisaLog</Text>
          </View>
          <Spacer h={sp[8]} />
          <Text style={s.headLine}>Protect your{'\n'}transaction history.</Text>
          <T.Body style={{ marginTop: sp[3] }}>
            Your data lives on this device. If you change phones without a backup, it is gone.
          </T.Body>
          <Spacer h={sp[6]} />
          <TouchableOpacity style={s.backupCard} onPress={() => done('drive')} activeOpacity={0.8}>
            <View style={s.backupLeft}>
              <View style={s.backupIcon}><Text style={{ fontSize: 20 }}>☁</Text></View>
              <View style={{ flex: 1 }}>
                <T.H>Google Drive</T.H>
                <T.Cap>Free. Encrypted. Stored in your account, not ours.</T.Cap>
              </View>
            </View>
            <View style={s.recBadge}><Text style={s.recBadgeTxt}>Recommended</Text></View>
          </TouchableOpacity>
          <Spacer h={sp[3]} />
          <TouchableOpacity style={s.skipOutlined} onPress={() => done('none')}>
            <T.Cap style={{ textAlign: 'center', lineHeight: 17 }}>
              Skip - I understand my data is not backed up
            </T.Cap>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: C.pageBg },
  page:     { flex: 1, paddingHorizontal: sp[5], paddingTop: sp[5], paddingBottom: sp[8] },
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: sp[2] },
  logoDot:  { width: 8, height: 8, borderRadius: br.full, backgroundColor: C.accent },
  logoTxt:  { fontFamily: F.bold, fontSize: 18, color: C.textPrimary, letterSpacing: -0.4 },
  headLine: { fontFamily: F.bold, fontSize: 34, color: C.textPrimary, letterSpacing: -1.2, lineHeight: 40 },
  smsCard:  { backgroundColor: C.cardBg, borderRadius: br.sm, padding: sp[3], borderWidth: 0.5, borderColor: C.borderFaint },
  smsCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp[1] },
  smsSender:  { fontFamily: F.medium, fontSize: 11, color: C.textTertiary, letterSpacing: 0.4 },
  smsTag:     { paddingHorizontal: sp[2], paddingVertical: 2, borderRadius: br.full },
  smsTagTxt:  { fontFamily: F.medium, fontSize: 10 },
  smsMsg:     { fontFamily: F.regular, fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  privacyRow: { flexDirection: 'row', gap: sp[2], backgroundColor: C.n200, borderRadius: br.sm, padding: sp[3], alignItems: 'flex-start' },
  lock:       { fontSize: 14, marginTop: 1 },
  privacyTxt: { flex: 1, lineHeight: 17 },
  skipBtn:    { alignItems: 'center', padding: sp[3] },
  emailField: { backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, padding: sp[4] },
  emailInput: { fontFamily: F.bold, fontSize: 24, color: C.textPrimary, marginTop: sp[2], letterSpacing: -0.5, padding: 0 },
  authNote:   { textAlign: 'center', marginTop: sp[5], lineHeight: 17 },
  sentIcon:   { width: 64, height: 64, borderRadius: br.full, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  backupCard: { backgroundColor: C.cardBg, borderRadius: br.md, padding: sp[4], borderWidth: 0.5, borderColor: C.borderDefault, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backupLeft: { flexDirection: 'row', alignItems: 'center', gap: sp[3], flex: 1 },
  backupIcon: { width: 44, height: 44, borderRadius: br.sm, backgroundColor: C.n200, alignItems: 'center', justifyContent: 'center' },
  recBadge:   { backgroundColor: C.investBg, paddingHorizontal: sp[2], paddingVertical: 3, borderRadius: br.full },
  recBadgeTxt:{ fontFamily: F.medium, fontSize: 10, color: C.investText },
  skipOutlined: { borderWidth: 0.5, borderColor: C.borderDefault, borderRadius: br.sm, padding: sp[4] },
});
const be = StyleSheet.create({
  pill:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardBg, borderRadius: br.sm, borderWidth: 0.5, borderColor: C.borderFaint, padding: sp[3], marginBottom: sp[2], gap: sp[2] },
  pillIcon:  { fontSize: 16 },
  pillEmail: { flex: 1, fontFamily: F.regular, fontSize: 13, color: C.textPrimary },
  pillX:     { fontFamily: F.regular, fontSize: 14, color: C.textTertiary, paddingHorizontal: sp[1] },
  inputRow:  { flexDirection: 'row', gap: sp[2], marginBottom: sp[4] },
  input:     { flex: 1, backgroundColor: C.inputBg, borderRadius: br.sm, borderWidth: 1, borderColor: C.borderDefault, paddingHorizontal: sp[3], paddingVertical: sp[3], fontFamily: F.regular, fontSize: 15, color: C.textPrimary },
  addBtn:    { backgroundColor: C.accent, borderRadius: br.sm, paddingHorizontal: sp[4], justifyContent: 'center' },
  addBtnOff: { backgroundColor: C.n300 },
  addBtnTxt: { fontFamily: F.semibold, fontSize: 14, color: '#fff' },
});
