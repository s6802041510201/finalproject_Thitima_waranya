import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/game/config/game';
import { NeonButton } from '@/components/NeonButton';
import { NeonPanel } from '@/components/NeonPanel';
import { SpaceBackdrop } from '@/components/SpaceBackdrop';
import { authErrorMessage } from '@/firebase/authService';

type Mode = 'login' | 'register';
type Props = {
  mode: Mode;
  firebaseConfigured: boolean;
  onModeChange: (mode: Mode) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (username: string, email: string, password: string) => Promise<void>;
  onGuest: () => void;
  onBack: () => void;
};

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function AuthScreen({ mode, firebaseConfigured, onModeChange, onLogin, onRegister, onGuest, onBack }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    setError('');
    if (!firebaseConfigured) { setError('Firebase setup is incomplete. Add the project settings to .env.local and restart Expo.'); return; }
    if (mode === 'register' && (username.trim().length < 2 || username.trim().length > 24)) { setError('Username must be 2 to 24 characters long.'); return; }
    if (!validEmail(email)) { setError('Enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (mode === 'register' && password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setLoading(true);
    try {
      if (mode === 'register') await onRegister(username.trim(), email.trim(), password);
      else await onLogin(email.trim(), password);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'login' ? 'WELCOME BACK, PILOT' : 'CREATE PILOT ACCOUNT';
  return <SpaceBackdrop><SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.rocket}>🚀</Text><Text style={styles.brand}>ROCKET RUSH</Text><Text style={styles.subtitle}>ASTEROID ESCAPE</Text>
    <NeonPanel style={styles.panel}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.copy}>{mode === 'login' ? 'Log in to sync your flight data across devices.' : 'Create an account to keep your progress in the cloud.'}</Text>
      {mode === 'register' ? <Field label="USERNAME" value={username} onChangeText={setUsername} autoCapitalize="words" autoComplete="nickname" editable={!loading} /> : null}
      <Field label="EMAIL" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!loading} />
      <Field label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" editable={!loading} />
      {mode === 'register' ? <Field label="CONFIRM PASSWORD" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} autoCapitalize="none" editable={!loading} /> : null}
      <Pressable style={styles.showPassword} onPress={() => setShowPassword((visible) => !visible)}><Text style={styles.showPasswordText}>{showPassword ? 'HIDE PASSWORD' : 'SHOW PASSWORD'}</Text></Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <NeonButton label={loading ? 'CONNECTING...' : mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'} icon={loading ? undefined : '➜'} variant="primary" disabled={loading} onPress={submit} />
      {loading ? <ActivityIndicator color={COLORS.cyan} style={styles.spinner} /> : null}
      <Pressable disabled={loading} onPress={() => { setError(''); onModeChange(mode === 'login' ? 'register' : 'login'); }}><Text style={styles.switchText}>{mode === 'login' ? "NEW PILOT?  CREATE AN ACCOUNT" : 'ALREADY REGISTERED?  LOG IN'}</Text></Pressable>
    </NeonPanel>
    <NeonButton label="PLAY OFFLINE AS GUEST" icon="☄" variant="secondary" onPress={onGuest} disabled={loading} />
    <Text style={styles.offlineNote}>No account needed. Guest progress stays on this device.</Text>
    <Pressable disabled={loading} onPress={onBack}><Text style={styles.switchText}>BACK TO PLAY OPTIONS</Text></Pressable>
  </ScrollView></KeyboardAvoidingView></SafeAreaView></SpaceBackdrop>;
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholder={label === 'EMAIL' ? 'pilot@example.com' : label === 'USERNAME' ? 'Your pilot name' : 'At least 8 characters'} placeholderTextColor="#8392c4" style={styles.input} selectionColor={COLORS.cyan} /></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1 }, content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 9 },
  rocket: { fontSize: 48, textShadowColor: COLORS.cyan, textShadowRadius: 15 }, brand: { color: '#fff', fontSize: 29, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textShadowColor: COLORS.purple, textShadowRadius: 14 }, subtitle: { color: COLORS.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 3, marginBottom: 14 },
  panel: { width: '100%', maxWidth: 420, padding: 20, gap: 11 }, heading: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1, textAlign: 'center' }, copy: { color: '#c0cdf7', fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 3 },
  field: { gap: 5 }, fieldLabel: { color: COLORS.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, input: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(105, 157, 255, 0.58)', backgroundColor: 'rgba(8, 17, 54, 0.8)', color: '#fff', paddingHorizontal: 13, fontSize: 14 },
  showPassword: { alignSelf: 'flex-end', paddingVertical: 3 }, showPasswordText: { color: '#a9bcff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }, error: { color: '#ffabc0', fontSize: 12, lineHeight: 17, textAlign: 'center' }, spinner: { marginTop: -7 }, switchText: { color: '#bdb9ff', fontSize: 11, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5, padding: 7 }, offlineNote: { color: '#aab9e7', fontSize: 11, lineHeight: 16, textAlign: 'center', maxWidth: 330, marginTop: 5 },
});
