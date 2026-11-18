import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowRight, Fingerprint, MoonStar } from 'lucide-react-native'
import { supabase } from '../lib/supabase'

const colors = { green: '#c5f36a', muted: '#92978e', panel: '#111410', border: '#272c25', white: '#f5f6ef' }

type Props = { onAuthenticated: () => void; configured: boolean }

export function AuthScreen({ onAuthenticated, configured }: Props) {
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    setNotice('')
    if (!configured || !supabase) {
      setError('Supabase configuration is missing. Check the project environment variables.')
      return
    }
    if (!email.trim() || password.length < 8 || (isSignup && username.trim().length < 2)) {
      setError(isSignup ? 'Add a username, valid email, and password of at least 8 characters.' : 'Enter your email and a password of at least 8 characters.')
      return
    }
    setBusy(true)
    const result = isSignup
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (result.error) {
      const msg = result.error.message.toLowerCase()
      setError(msg.includes('confirm') ? 'Check your inbox to confirm your email, then sign in.' : isSignup ? result.error.message : 'Invalid email or password.')
      return
    }
    if (isSignup && !result.data.session) {
      setNotice('Your account is ready. Confirm your email, then sign in to continue.')
      setIsSignup(false)
      return
    }
    onAuthenticated()
  }

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.ambientA} />
      <View pointerEvents="none" style={styles.ambientB} />
      <View style={styles.wrap}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><MoonStar size={18} color={colors.green} /></View>
          <Text style={styles.brand}>DESCREEN</Text>
          <View style={styles.brandLine} />
          <Text style={styles.edition}>A QUIETER KIND OF COMPETITION</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardIcon}><Fingerprint size={19} color={colors.green} /></View>
          <Text style={styles.kicker}>YOUR TIME, RECLAIMED</Text>
          <Text style={styles.title}>{isSignup ? 'Make room for more.' : 'Good to have you back.'}</Text>
          <Text style={styles.subtitle}>{isSignup ? 'Create an account. Your next offline hour starts here.' : 'Sign in and pick up where you left off.'}</Text>
          {!configured && <Text style={styles.notice}>Connect Supabase environment variables to enable accounts.</Text>}
          {isSignup && <Field label="USERNAME" placeholder="Choose a username" value={username} onChangeText={setUsername} autoCapitalize="none" />}
          <Field label="EMAIL ADDRESS" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field label="PASSWORD" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
          <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={({ pressed }) => [styles.submit, pressed && styles.pressed, busy && styles.disabled]}>
            {busy ? <ActivityIndicator color="#111" /> : <><Text style={styles.submitText}>{isSignup ? 'Create account' : 'Sign in'}</Text><ArrowRight size={17} color="#111" /></>}
          </Pressable>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{isSignup ? 'Already have an account?' : 'New to Descreen?'}</Text>
            <Pressable onPress={() => { setIsSignup(!isSignup); setError(''); setNotice('') }} accessibilityRole="button">
              <Text style={styles.switchAction}>{isSignup ? 'Sign in' : 'Create account'}</Text>
            </Pressable>
          </View>
          <View style={styles.divider} />
          <Text style={styles.privacy}>Your screen activity stays on your device. We only sync session totals.</Text>
        </View>
        <Text style={styles.footer}>LESS SCROLL. MORE LIFE.</Text>
      </View>
    </View>
  )
}

type FieldProps = { label: string; placeholder: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean; keyboardType?: 'email-address'; autoCapitalize?: 'none' }
function Field({ label, ...inputProps }: FieldProps) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} placeholderTextColor="#686f64" style={styles.input} autoCorrect={false} /></View>
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: '#080a08', justifyContent: 'center', paddingHorizontal: 22, overflow: 'hidden' },
  ambientA: { position: 'absolute', width: 420, height: 420, borderRadius: 240, backgroundColor: '#172216', opacity: 0.45, top: -240, right: -190 },
  ambientB: { position: 'absolute', width: 380, height: 380, borderRadius: 240, backgroundColor: '#10180f', opacity: 0.55, bottom: -250, left: -180 },
  wrap: { width: '100%', maxWidth: 440, alignSelf: 'center', paddingVertical: 44 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: '#38442d', backgroundColor: '#12180f', alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 2.2 },
  brandLine: { flex: 1, height: 1, backgroundColor: '#252a23', marginHorizontal: 5 },
  edition: { fontSize: 8, letterSpacing: 1.1, color: '#72796d' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 28, backgroundColor: '#0d100d' },
  cardIcon: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: '#35402d', backgroundColor: '#141a11', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  kicker: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 2.1, marginBottom: 10 },
  title: { color: colors.white, fontSize: 28, fontWeight: '600', letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 26 },
  field: { marginBottom: 17 },
  label: { color: '#a8afa1', fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginBottom: 8 },
  input: { color: colors.white, backgroundColor: '#111410', borderWidth: 1, borderColor: '#2a3028', borderRadius: 12, height: 49, paddingHorizontal: 14, fontSize: 14, outlineStyle: 'none' as never },
  submit: { height: 51, borderRadius: 12, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 5 },
  submitText: { color: '#11140d', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 21 },
  switchText: { color: '#8d9488', fontSize: 11 },
  switchAction: { color: colors.green, fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#20251e', marginTop: 22, marginBottom: 16 },
  privacy: { color: '#70776c', fontSize: 10, lineHeight: 16, textAlign: 'center' },
  error: { color: '#ff938b', fontSize: 11, lineHeight: 16, marginBottom: 12 },
  notice: { color: colors.green, fontSize: 11, lineHeight: 17, marginBottom: 12 },
  footer: { color: '#51584f', fontSize: 9, letterSpacing: 2, textAlign: 'center', marginTop: 25 },
})
