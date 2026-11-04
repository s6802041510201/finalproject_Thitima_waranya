import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/game/config/game';
import { NeonButton } from '@/components/NeonButton';
import { NeonPanel } from '@/components/NeonPanel';
import { SyncStatus, type CloudStatus } from '@/components/SyncStatus';
import { SpaceBackdrop } from '@/components/SpaceBackdrop';
import type { StoredProfile } from '@/types/game';

type Props = {
  profile: StoredProfile;
  username: string;
  email: string;
  signedIn: boolean;
  status: CloudStatus;
  syncMessage?: string;
  onBack: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => Promise<void>;
  onSync: () => void;
  onUseCloud: () => void;
  onKeepDevice: () => void;
};

export function ProfileScreen({ profile, username, email, signedIn, status, syncMessage, onBack, onLogin, onRegister, onLogout, onSync, onUseCloud, onKeepDevice }: Props) {
  const confirmLogout = () => Alert.alert('Switch account?', 'You will return to the login screen. Your cloud save stays with this account, and this device’s local save is kept.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'SWITCH ACCOUNT', onPress: () => { void onLogout(); } },
  ]);

  return <ProfileShell title="PLAYER PROFILE" onBack={onBack}>
    <NeonPanel style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
      <Text style={{ fontSize: 48 }}>🧑‍🚀</Text>
      <Text style={{ color: '#fff', fontSize: 21, fontWeight: '900', textAlign: 'center' }}>{username}</Text>
      <Text style={{ color: '#b7c7f5', fontSize: 12, textAlign: 'center' }}>{signedIn ? email : 'Guest pilot · This device only'}</Text>
      <SyncStatus status={status} />
      {syncMessage ? <Text style={{ color: status === 'conflict' ? '#ffd39e' : '#b7c7f5', fontSize: 12, lineHeight: 17, textAlign: 'center' }}>{syncMessage}</Text> : null}
      {signedIn ? <NeonButton label={status === 'syncing' ? 'SYNCING...' : 'SYNC NOW'} icon="↻" variant="secondary" disabled={status === 'syncing'} onPress={onSync} /> : <View style={{ flexDirection: 'row', gap: 9, flexWrap: 'wrap', justifyContent: 'center' }}><NeonButton small label="LOG IN" variant="primary" onPress={onLogin} /><NeonButton small label="CREATE ACCOUNT" variant="secondary" onPress={onRegister} /></View>}
      {signedIn && status === 'conflict' ? <View style={{ gap: 8, width: '100%' }}><Text style={{ color: COLORS.yellow, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>Choose which saved profile to keep. Your local copy remains available until you choose.</Text><NeonButton label="LOAD CLOUD SAVE" variant="primary" onPress={onUseCloud} /><NeonButton label="KEEP THIS DEVICE'S SAVE" variant="secondary" onPress={onKeepDevice} /></View> : null}
      {signedIn ? <NeonButton label="SWITCH ACCOUNT" icon="↪" variant="secondary" onPress={confirmLogout} /> : null}
    </NeonPanel>
    <NeonPanel style={{ gap: 8 }}>
      <Text style={{ color: COLORS.cyan, fontSize: 13, fontWeight: '900', letterSpacing: 1 }}>PILOT DATA</Text>
      <Stat label="COINS" value={profile.totalCoins} />
      <Stat label="DIAMONDS" value={profile.diamonds} />
      <Stat label="ROCKETS OWNED" value={profile.ownedRockets.length} />
      <Stat label="FLIGHTS" value={profile.totalGames} />
      <Stat label="STAGES CLEARED" value={profile.stages.filter((stage) => stage.cleared).length} />
    </NeonPanel>
  </ProfileShell>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(123, 148, 230, 0.2)', paddingVertical: 8 }}><Text style={{ color: '#bdc9ff', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{label}</Text><Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>{value.toLocaleString()}</Text></View>;
}

function ProfileShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return <SpaceBackdrop><SafeAreaView style={styles.safe}><View style={styles.header}><Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.title}>{title}</Text><View style={styles.spacer} /></View><ScrollView contentContainerStyle={styles.content}>{children}</ScrollView></SafeAreaView></SpaceBackdrop>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, gap: 10 }, back: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(37, 46, 112, 0.8)', borderWidth: 1, borderColor: '#596fc4' }, backText: { color: '#fff', fontSize: 30, lineHeight: 33 }, title: { flex: 1, color: '#f5f7ff', fontSize: 16, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' }, spacer: { width: 38 }, content: { padding: 18, paddingBottom: 32, gap: 14 },
});
