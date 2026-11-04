import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, CONSUMABLE_DEFINITIONS, getModifiers, MISSION_DEFINITIONS, ROCKET_DEFINITIONS, stageFor, STAGES, UPGRADE_DEFINITIONS } from '@/game/config/game';
import type { CloudStatus } from '@/components/SyncStatus';
import { NeonButton } from '@/components/NeonButton';
import { NeonPanel } from '@/components/NeonPanel';
import { SpaceBackdrop } from '@/components/SpaceBackdrop';
import { AuthScreen } from '@/screens/AuthScreen';
import { GameScreen } from '@/screens/GameScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { useAuth } from '@/hooks/useAuth';
import { auth as firebaseAuth, firebaseConfigured } from '@/firebase/firebaseConfig';
import { authErrorMessage, loginWithEmail, logout, registerWithEmail } from '@/firebase/authService';
import { CloudSyncConflictError, cloudLoadErrorMessage, loadCloudProfile, saveCloudProfile, touchLastLogin } from '@/firebase/firestoreService';
import { useTiltControl } from '@/hooks/useTiltControl';
import { GameStorage } from '@/storage/GameStorage';
import { feedback } from '@/services/feedback';
import { rocketAudio } from '@/services/audio';
import type { ConsumableId, GameMode, GameRecord, GameResult, RocketId, ScreenName, Settings, StoredProfile, UpgradeId } from '@/types/game';

type Session = { id: number; mode: GameMode; missionId?: string; stageId?: string; fallbackTouch: boolean };

export default function RocketRushApp() {
  const { user: authUser, initializing: authInitializing } = useAuth();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [screen, setScreen] = useState<ScreenName>('splash');
  const [session, setSession] = useState<Session | null>(null);
  const [lastResult, setLastResult] = useState<GameRecord | null>(null);
  const [previousBestScore, setPreviousBestScore] = useState(0);
  const [garageBack, setGarageBack] = useState<ScreenName>('main');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authFlowVisible, setAuthFlowVisible] = useState(true);
  const [entryChoiceVisible, setEntryChoiceVisible] = useState(true);
  const [guestMode, setGuestMode] = useState(false);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountLoadError, setAccountLoadError] = useState('');
  const [accountRetry, setAccountRetry] = useState(0);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('local');
  const [syncMessage, setSyncMessage] = useState('');
  const cloudStatusRef = useRef<CloudStatus>('local');
  const cloudRevisionRef = useRef(0);
  const latestProfileRef = useRef<StoredProfile | null>(null);
  const currentUserRef = useRef(authUser);
  const activeUidRef = useRef<string | null>(null);
  const skipCloudEffectRef = useRef(false);
  const cloudDirtyRef = useRef(false);
  const syncBusyRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(5000);
  const pendingRegistrationSeedRef = useRef<StoredProfile | null>(null);
  const registrationGateRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  currentUserRef.current = authUser;
  latestProfileRef.current = profile;
  const settings = profile?.settings;
  const { getTilt, consumeDodge, calibrate, sensorAvailable, gyroAvailable } = useTiltControl(Boolean(settings), settings ?? {
    soundEffects: true, backgroundMusic: true, vibration: true, sensitivity: 'medium', invertTilt: false, controlMode: 'tilt', calibration: 0, gyroDodge: true, reducedEffects: false,
  });

  const updateCloudStatus = (status: CloudStatus, message = '') => {
    cloudStatusRef.current = status;
    setCloudStatus(status);
    setSyncMessage(message);
  };

  const syncCloud = async () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    const user = currentUserRef.current;
    const currentProfile = latestProfileRef.current;
    if (!user || !currentProfile || activeUidRef.current !== user.uid || !cloudDirtyRef.current) return;
    if (cloudStatusRef.current === 'conflict') return;
    if (syncBusyRef.current) return;
    syncBusyRef.current = true;
    updateCloudStatus('syncing');
    try {
      const revision = await saveCloudProfile(user, currentProfile, cloudRevisionRef.current);
      if (currentUserRef.current?.uid !== user.uid) return;
      cloudRevisionRef.current = revision;
      await GameStorage.setCloudRevision(user.uid, revision);
      cloudDirtyRef.current = latestProfileRef.current !== currentProfile;
      await GameStorage.setCloudDirty(user.uid, cloudDirtyRef.current);
      retryDelayRef.current = 5000;
      updateCloudStatus('synced', 'Your latest saved progress is in the cloud.');
    } catch (error) {
      if (error instanceof CloudSyncConflictError) {
        updateCloudStatus('conflict', 'Another device saved newer progress. Choose which profile to keep before syncing again.');
      } else {
        await GameStorage.setCloudDirty(user.uid, true);
        updateCloudStatus('offline', 'Your progress is saved on this device. Cloud sync will retry when you reconnect.');
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(60000, retryDelayRef.current * 2);
        syncTimerRef.current = setTimeout(() => { void syncCloud(); }, delay);
      }
    } finally {
      syncBusyRef.current = false;
      if (cloudDirtyRef.current && (cloudStatusRef.current as CloudStatus) !== 'conflict' && !syncTimerRef.current) {
        syncTimerRef.current = setTimeout(() => { void syncCloud(); }, 700);
      }
    }
  };

  useEffect(() => {
    if (authInitializing) return;
    let active = true;
    if (!authUser) {
      activeUidRef.current = null;
      GameStorage.setAccountScope(null);
      setAccountLoading(false);
      if (!guestMode) {
        setProfile(null);
        latestProfileRef.current = null;
        setAuthFlowVisible(true);
      }
      return () => { active = false; };
    }

    const uid = authUser.uid;
    activeUidRef.current = uid;
    setGuestMode(false);
    setAuthFlowVisible(false);
    setAccountLoadError('');
    setAccountLoading(true);
    setProfile(null);
    latestProfileRef.current = null;
    cloudDirtyRef.current = false;
    updateCloudStatus('syncing', 'Loading your account save...');
    GameStorage.setAccountScope(uid);

    void (async () => {
      let candidate: StoredProfile | null = null;
      let localDirty = false;
      let localRevision = 0;
      const showProfile = (value: StoredProfile, status: CloudStatus, message: string) => {
        if (!active) return;
        skipCloudEffectRef.current = true;
        setProfile(value);
        setScreen('main');
        updateCloudStatus(status, message);
      };
      try {
        const registrationGate = registrationGateRef.current;
        if (registrationGate) await registrationGate.promise;
        if (!active) return;
        const hasLocalSave = await GameStorage.hasSavedProfile();
        if (!active) return;
        if (hasLocalSave) candidate = await GameStorage.load();
        localDirty = await GameStorage.getCloudDirty(uid);
        localRevision = await GameStorage.getCloudRevision(uid);
        if (!candidate && pendingRegistrationSeedRef.current) candidate = pendingRegistrationSeedRef.current;

        let cloud = await loadCloudProfile(uid);
        if (!active) return;
        if (cloud) {
          if (candidate && localDirty) {
            cloudRevisionRef.current = localRevision;
            if (localRevision !== cloud.revision) {
              cloudDirtyRef.current = true;
              showProfile(candidate, 'conflict', 'This device has unsynced progress, and a newer cloud save exists. Choose which profile to keep.');
              return;
            }
            const revision = await saveCloudProfile(authUser, candidate, cloud.revision);
            await GameStorage.save(candidate, { dirty: false });
            await GameStorage.setCloudRevision(uid, revision);
            await GameStorage.setCloudDirty(uid, false);
            cloudRevisionRef.current = revision;
            cloudDirtyRef.current = false;
            showProfile(candidate, 'synced', 'Your offline progress has been synced.');
            return;
          }
          candidate = cloud.profile;
          await GameStorage.save(candidate, { dirty: false });
          await GameStorage.setCloudRevision(uid, cloud.revision);
          await GameStorage.setCloudDirty(uid, false);
          void touchLastLogin(uid).catch(() => undefined);
          cloudRevisionRef.current = cloud.revision;
          cloudDirtyRef.current = false;
          showProfile(candidate, 'synced', 'Your account save is ready.');
          return;
        }

        if (candidate && localDirty && localRevision > 0) {
          cloudRevisionRef.current = localRevision;
          cloudDirtyRef.current = true;
          showProfile(candidate, 'conflict', 'This device has unsynced progress, but the cloud save could not be found. Keep this device’s save or try loading the cloud again.');
          return;
        }
        candidate ??= GameStorage.createInitialProfile();
        await GameStorage.save(candidate, { dirty: false });
        const revision = await saveCloudProfile(authUser, candidate, 0);
        if (!active) return;
        await GameStorage.setCloudRevision(uid, revision);
        await GameStorage.setCloudDirty(uid, false);
        cloudRevisionRef.current = revision;
        cloudDirtyRef.current = false;
        showProfile(candidate, 'synced', 'Your account save is ready.');
      } catch (error) {
        if (!active) return;
        if (candidate) {
          await GameStorage.save(candidate, { dirty: false });
          cloudRevisionRef.current = await GameStorage.getCloudRevision(uid);
          cloudDirtyRef.current = true;
          await GameStorage.setCloudDirty(uid, true);
          showProfile(candidate, error instanceof CloudSyncConflictError ? 'conflict' : 'offline', error instanceof CloudSyncConflictError
            ? 'Another device saved newer progress. Choose which profile to keep before syncing again.'
            : 'Your local account save is ready. Cloud sync will retry when connected.');
          if (!(error instanceof CloudSyncConflictError)) syncTimerRef.current = setTimeout(() => { void syncCloud(); }, retryDelayRef.current);
        } else {
          setAccountLoadError(cloudLoadErrorMessage(error));
          updateCloudStatus('offline');
        }
      } finally {
        pendingRegistrationSeedRef.current = null;
        if (active) setAccountLoading(false);
      }
    })();

    return () => { active = false; };
  }, [authInitializing, authUser?.uid, accountRetry]);

  useEffect(() => {
    if (!profile || authInitializing || accountLoading || !authUser || activeUidRef.current !== authUser.uid || guestMode) return;
    if (skipCloudEffectRef.current) { skipCloudEffectRef.current = false; return; }
    cloudDirtyRef.current = true;
    void GameStorage.setCloudDirty(authUser.uid, true);
    if (cloudStatusRef.current === 'conflict') return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => { void syncCloud(); }, 900);
  }, [profile, authUser?.uid, authInitializing, accountLoading, guestMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && cloudDirtyRef.current && cloudStatusRef.current !== 'conflict') void syncCloud();
    });
    return () => { subscription.remove(); if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, []);

  useEffect(() => {
    // Music only runs during an active flight; game-specific pause/death states
    // refine this further inside GameScreen.
    if (settings) rocketAudio.setMusicEnabled(settings.backgroundMusic && screen === 'game');
  }, [screen, settings?.backgroundMusic]);

  const navigate = (next: ScreenName) => {
    if (settings) feedback.tap(settings);
    if (next === 'missions' && profile) void GameStorage.refreshWeekly(profile).then(setProfile);
    setScreen(next);
  };
  const updateSettings = async (next: Settings) => {
    if (!profile) return;
    const saved = await GameStorage.updateSettings(profile, next);
    setProfile(saved);
  };
  const startGame = (mode: GameMode, missionId?: string, stageId?: string) => {
    if (!profile) return;
    feedback.tap(profile.settings);
    setSession({ id: Date.now(), mode, missionId, stageId, fallbackTouch: profile.settings.controlMode === 'tilt' && !sensorAvailable });
    setScreen('game');
  };
  const openGarage = (back: ScreenName) => { setGarageBack(back); navigate('garage'); };
  const finishGame = async (result: GameResult) => {
    if (!profile) return;
    const stage = result.stageCompleted ? stageFor(result.stageId) : undefined;
    const firstClear = Boolean(stage && !profile.stages.find((item) => item.stageId === stage.id)?.rewardClaimed);
    const completedResult = stage ? { ...result, stageFirstClearReward: firstClear ? stage.reward : 0 } : result;
    const record = GameStorage.createRecord(completedResult);
    setPreviousBestScore(profile.bestScore);
    let saved = await GameStorage.recordGame(profile, record);
    if (result.stageCompleted && result.stageId) saved = await GameStorage.completeStage(saved, result.stageId, result.remainingHp, result.maxHp, result.revivesUsed);
    setProfile(saved);
    setLastResult(record);
    setScreen(result.stageCompleted ? 'stageclear' : 'gameover');
  };
  const activeSettings = useMemo(() => session?.fallbackTouch && settings ? { ...settings, controlMode: 'touch' as const } : settings, [session?.fallbackTouch, settings]);
  const modifiers = useMemo(() => profile ? getModifiers(profile.equippedRocket, profile.upgrades) : null, [profile]);
  const spendDiamonds = async (amount: number) => { if (!profile) return false; const saved = await GameStorage.spendDiamonds(profile, amount); if (!saved) return false; setProfile(saved); return true; };
  const consume = async (item: ConsumableId) => { if (!profile) return; const saved = await GameStorage.consume(profile, item); if (saved) setProfile(saved); };

  const continueAsGuest = async () => {
    setGuestMode(true);
    try {
      if (authUser) await logout();
      GameStorage.setAccountScope(null);
      const local = await GameStorage.load();
      setProfile(local);
      setAuthFlowVisible(false);
      setEntryChoiceVisible(false);
      setAccountLoadError('');
      setScreen('main');
      cloudDirtyRef.current = false;
      updateCloudStatus('local', 'Progress is stored on this device.');
    } catch (error) {
      setGuestMode(false);
      Alert.alert('Could not start offline mode', authErrorMessage(error));
    }
  };
  const beginAuth = (mode: 'login' | 'register') => { setAuthMode(mode); setAuthFlowVisible(true); };
  const beginAuthFromEntry = () => { setEntryChoiceVisible(false); setAuthMode('login'); setAuthFlowVisible(true); };
  const returnFromAuth = () => {
    setAuthFlowVisible(false);
    if (profile) setScreen('profile');
    else setEntryChoiceVisible(true);
  };
  const runAuthTransition = async (operation: () => Promise<unknown>, seed: StoredProfile | null = null) => {
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    registrationGateRef.current = { promise: gate, resolve: releaseGate };
    pendingRegistrationSeedRef.current = seed;
    try { await operation(); }
    catch (error) { if (!firebaseAuth?.currentUser) pendingRegistrationSeedRef.current = null; throw error; }
    finally { registrationGateRef.current?.resolve(); registrationGateRef.current = null; }
  };
  const submitRegistration = (username: string, email: string, password: string) =>
    runAuthTransition(() => registerWithEmail(username, email, password), guestMode && profile ? profile : GameStorage.createInitialProfile());
  const submitLogin = (email: string, password: string) =>
    runAuthTransition(() => loginWithEmail(email, password));
  const submitLogout = async () => {
    try {
      if (cloudDirtyRef.current && cloudStatusRef.current !== 'conflict') await syncCloud();
      await logout();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      cloudDirtyRef.current = false;
      setProfile(null);
      latestProfileRef.current = null;
      activeUidRef.current = null;
      setGuestMode(false);
      setAuthMode('login');
      setAuthFlowVisible(true);
      setAccountLoadError('');
      setScreen('splash');
    } catch (error) { Alert.alert('Could not log out', authErrorMessage(error)); }
  };
  const useCloudSave = async () => {
    if (!authUser) return;
    try {
      const cloud = await loadCloudProfile(authUser.uid);
      if (!cloud) throw new Error('No cloud save is available for this account yet.');
      await GameStorage.save(cloud.profile, { dirty: false });
      await GameStorage.setCloudRevision(authUser.uid, cloud.revision);
      await GameStorage.setCloudDirty(authUser.uid, false);
      cloudRevisionRef.current = cloud.revision;
      cloudDirtyRef.current = false;
      skipCloudEffectRef.current = true;
      setProfile(cloud.profile);
      updateCloudStatus('synced', 'Loaded the cloud save on this device.');
    } catch { updateCloudStatus('offline', 'Unable to load the cloud save. Check your connection and try again.'); }
  };
  const keepDeviceSave = async () => {
    if (!authUser || !profile) return;
    updateCloudStatus('syncing', 'Saving this device’s profile...');
    try {
      const latest = await loadCloudProfile(authUser.uid);
      const revision = await saveCloudProfile(authUser, profile, latest?.revision ?? 0);
      await GameStorage.setCloudRevision(authUser.uid, revision);
      await GameStorage.setCloudDirty(authUser.uid, false);
      cloudRevisionRef.current = revision;
      cloudDirtyRef.current = false;
      updateCloudStatus('synced', 'This device’s profile is now the cloud save.');
    } catch (error) {
      if (error instanceof CloudSyncConflictError) updateCloudStatus('conflict', 'The cloud changed again. Choose a save and retry.');
      else updateCloudStatus('offline', 'Unable to sync right now. Your device save is still available.');
    }
  };
  const startLocalAccountSave = async () => {
    if (!authUser) return;
    GameStorage.setAccountScope(authUser.uid);
    const local = await GameStorage.load();
    await GameStorage.save(local, { dirty: false });
    cloudRevisionRef.current = await GameStorage.getCloudRevision(authUser.uid);
    await GameStorage.setCloudDirty(authUser.uid, true);
    cloudDirtyRef.current = true;
    skipCloudEffectRef.current = true;
    setProfile(local);
    setScreen('main');
    setAccountLoadError('');
    updateCloudStatus('offline', 'This device save is ready. It checks the cloud revision before syncing, so existing cloud progress will not be overwritten automatically.');
    syncTimerRef.current = setTimeout(() => { void syncCloud(); }, retryDelayRef.current);
  };

  if (authInitializing || (authUser && (accountLoading || activeUidRef.current !== authUser.uid)) || (!authUser && profile && !guestMode)) return <SplashScreen />;
  if (accountLoadError && authUser) return <AccountLoadErrorScreen message={accountLoadError} onRetry={() => { setAccountLoadError(''); setAccountRetry((attempt) => attempt + 1); }} onLocalSave={() => { void startLocalAccountSave(); }} onGuest={() => { void continueAsGuest(); }} onLogout={submitLogout} />;
  if (entryChoiceVisible) return <EntryChoiceScreen signedIn={Boolean(authUser)} accountLabel={authUser?.email ?? ''} onSignIn={beginAuthFromEntry} onContinue={() => { setEntryChoiceVisible(false); setScreen('main'); }} onGuest={() => { void continueAsGuest(); }} onSwitchAccount={() => { setEntryChoiceVisible(false); void submitLogout(); }} />;
  if (authFlowVisible || !profile) return <AuthScreen mode={authMode} firebaseConfigured={firebaseConfigured} onModeChange={setAuthMode} onLogin={submitLogin} onRegister={submitRegistration} onGuest={() => { void continueAsGuest(); }} onBack={returnFromAuth} />;
  if (!settings) return <SplashScreen />;
  if (screen === 'game' && session && activeSettings && modifiers) return (
      <GameScreen key={session.id} mode={session.mode} missionId={session.missionId} stageId={session.stageId} settings={activeSettings} modifiers={modifiers} loadout={profile.loadout} diamondBalance={profile.diamonds} getTilt={getTilt} consumeDodge={consumeDodge} gyroAvailable={gyroAvailable}
      onFinished={finishGame} onExit={() => navigate('main')}
      onSettingsChange={updateSettings} onCalibrate={() => updateSettings({ ...settings, calibration: calibrate() })}
      onSpendDiamonds={spendDiamonds} onConsume={consume}
      onFeedback={(event) => event === 'collect' ? feedback.collect(settings) : event === 'hit' ? feedback.hit(settings) : feedback.warning(settings)} />
  );
  if (screen === 'main') return <MainMenu profile={profile} signedIn={Boolean(authUser)} accountLabel={authUser?.email ?? ''} onNavigate={navigate} onGarage={() => openGarage('main')} />;
  if (screen === 'mode') return <ModeScreen onBack={() => navigate('main')} onStart={startGame} onStages={() => navigate('stages')} />;
  if (screen === 'tutorial') return <TutorialScreen onBack={() => navigate('main')} onStart={() => startGame('endless')} />;
  if (screen === 'missions') return <MissionsScreen profile={profile} onBack={() => navigate('main')} onStart={(id) => startGame('mission', id)} onClaim={async (id, reward) => setProfile(await GameStorage.claimMission(profile, id, reward))} />;
  if (screen === 'leaderboard') return <LeaderboardScreen profile={profile} onBack={() => navigate('main')} />;
  if (screen === 'garage') return <GarageScreen profile={profile} onBack={() => navigate(garageBack)} onRefresh={setProfile} onOpen={navigate} />;
  if (screen === 'upgrades') return <UpgradesScreen profile={profile} onBack={() => navigate('garage')} onRefresh={setProfile} />;
  if (screen === 'shop') return <ShopScreen profile={profile} onBack={() => navigate('garage')} onRefresh={setProfile} />;
  if (screen === 'inventory') return <InventoryScreen profile={profile} onBack={() => navigate('garage')} onRefresh={setProfile} />;
  if (screen === 'stages') return <StagesScreen profile={profile} onBack={() => navigate('mode')} onStart={(id) => startGame('adventure', undefined, id)} />;
  if (screen === 'daily') return <DailyScreen profile={profile} onBack={() => navigate('main')} onRefresh={setProfile} />;
  if (screen === 'settings') return <SettingsScreen settings={settings} sensorAvailable={sensorAvailable} gyroAvailable={gyroAvailable} onBack={() => navigate('main')} onChange={updateSettings} onCalibrate={() => updateSettings({ ...settings, calibration: calibrate() })} />;
  if (screen === 'profile') return <ProfileScreen profile={profile} username={guestMode ? 'Guest Pilot' : authUser?.displayName || 'Rocket Pilot'} email={authUser?.email ?? ''} signedIn={Boolean(authUser)} status={guestMode ? 'local' : cloudStatus} syncMessage={syncMessage} onBack={() => navigate('main')} onLogin={() => beginAuth('login')} onRegister={() => beginAuth('register')} onLogout={submitLogout} onSync={() => { if (cloudStatusRef.current === 'conflict') updateCloudStatus('conflict', 'Choose which saved profile to keep.'); else void syncCloud(); }} onUseCloud={() => { void useCloudSave(); }} onKeepDevice={() => { void keepDeviceSave(); }} />;
  if (screen === 'stageclear' && lastResult?.stageCompleted) return <StageClearScreen profile={profile} result={lastResult} onNext={(id) => startGame('adventure', undefined, id)} onReplay={() => startGame('adventure', undefined, lastResult.stageId)} onGarage={() => openGarage('stageclear')} onStages={() => navigate('stages')} />;
  if (screen === 'gameover' && lastResult) return <GameOverScreen result={lastResult} highScore={lastResult.score > previousBestScore} onPlayAgain={() => startGame(lastResult.mode, lastResult.missionId, lastResult.stageId)} onMenu={() => navigate('main')} />;
  return <MainMenu profile={profile} signedIn={Boolean(authUser)} accountLabel={authUser?.email ?? ''} onNavigate={navigate} onGarage={() => openGarage('main')} />;
}

function SplashScreen() {
  const glow = useState(() => new Animated.Value(0.4))[0];
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.4, duration: 500, useNativeDriver: true }),
    ]));
    animation.start(); return () => animation.stop();
  }, [glow]);
  return <SpaceBackdrop><SafeAreaView style={styles.splash}><Animated.Text style={[styles.splashRocket, { opacity: glow }]}>🚀</Animated.Text><Text style={styles.splashTitle}>ROCKET{`\n`}RUSH</Text><Text style={styles.splashSubtitle}>ASTEROID ESCAPE</Text><ActivityIndicator color={COLORS.cyan} size="large" /><Text style={styles.loading}>LOADING STELLAR SYSTEMS...</Text></SafeAreaView></SpaceBackdrop>;
}

function EntryChoiceScreen({ signedIn, accountLabel, onSignIn, onContinue, onGuest, onSwitchAccount }: { signedIn: boolean; accountLabel: string; onSignIn: () => void; onContinue: () => void; onGuest: () => void; onSwitchAccount: () => void }) {
  return <SpaceBackdrop><SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24 }}><NeonPanel style={{ alignItems: 'center', gap: 14, padding: 22 }}>
    <Text style={{ fontSize: 48 }}>🚀</Text><Text style={{ color: '#fff', fontSize: 23, fontWeight: '900', letterSpacing: 1 }}>ROCKET RUSH</Text><Text style={{ color: COLORS.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>CHOOSE HOW TO PLAY</Text>
    {signedIn ? <><Text style={{ color: '#c0cdf7', fontSize: 12, textAlign: 'center' }}>ACCOUNT CONNECTED</Text><Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' }}>{accountLabel || 'Rocket Pilot'}</Text><NeonButton label="PLAY WITH ACCOUNT" icon="☁" variant="primary" onPress={onContinue} /></> : <NeonButton label="SIGN IN / CREATE ACCOUNT" icon="🔐" variant="primary" onPress={onSignIn} />}
    <NeonButton label="PLAY OFFLINE AS GUEST" icon="☄" variant="secondary" onPress={onGuest} />
    <Text style={{ color: '#aab9e7', fontSize: 11, lineHeight: 16, textAlign: 'center' }}>{signedIn ? 'Account play saves progress to your cloud account. Guest play stores a separate save on this device.' : 'Sign in to sync progress across devices. Guest progress stays on this device.'}</Text>
    {signedIn ? <Pressable onPress={onSwitchAccount}><Text style={{ color: '#bdb9ff', fontSize: 11, fontWeight: '900', padding: 7 }}>USE A DIFFERENT ACCOUNT</Text></Pressable> : null}
  </NeonPanel></SafeAreaView></SpaceBackdrop>;
}

function AccountLoadErrorScreen({ message, onRetry, onLocalSave, onGuest, onLogout }: { message: string; onRetry: () => void; onLocalSave: () => void; onGuest: () => void; onLogout: () => void }) {
  return <SpaceBackdrop><SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24 }}><NeonPanel style={{ alignItems: 'center', gap: 14, padding: 22 }}><Text style={{ fontSize: 42 }}>☁️</Text><Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' }}>CLOUD SAVE UNAVAILABLE</Text><Text style={{ color: '#c0cdf7', fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{message}</Text><NeonButton label="TRY AGAIN" variant="primary" onPress={onRetry} /><NeonButton label="USE LOCAL ACCOUNT SAVE" variant="secondary" onPress={onLocalSave} /><NeonButton label="PLAY OFFLINE AS GUEST" variant="secondary" onPress={onGuest} /><Text style={{ color: '#aab9e7', fontSize: 11, lineHeight: 15, textAlign: 'center' }}>Your account save and Guest save are kept separately.</Text><NeonButton label="LOG OUT" variant="secondary" onPress={onLogout} /></NeonPanel></SafeAreaView></SpaceBackdrop>;
}

function MainMenu({ profile, signedIn, accountLabel, onNavigate, onGarage }: { profile: StoredProfile; signedIn: boolean; accountLabel: string; onNavigate: (screen: ScreenName) => void; onGarage: () => void }) {
  return <SpaceBackdrop><SafeAreaView style={styles.safe}><View style={styles.mainContent}>
    <View style={styles.logoWrap}><Text style={styles.logoTop}>ROCKET</Text><Text style={styles.logoBottom}>RUSH</Text><Text style={styles.tagline}>ASTEROID ESCAPE</Text></View>
    <View style={styles.hero}><Text style={styles.planet}>🪐</Text><Text style={styles.heroRocket}>🚀</Text><Text style={styles.spark}>✦</Text></View>
    <View style={styles.menuButtons}>
      <NeonButton label="PLAY" icon="▶" variant="primary" onPress={() => onNavigate('mode')} style={styles.playButton} />
      <NeonButton label="ROCKET GARAGE" icon="🚀" onPress={onGarage} />
      <NeonButton label="DAILY CHALLENGES" icon="☀" onPress={() => onNavigate('daily')} />
      <NeonButton label="WEEKLY MISSIONS" icon="◎" onPress={() => onNavigate('missions')} />
      <NeonButton label="LEADERBOARD" icon="♛" onPress={() => onNavigate('leaderboard')} />
      <NeonButton label="SETTINGS" icon="⚙" onPress={() => onNavigate('settings')} />
      <NeonButton label="HOW TO PLAY" icon="?" onPress={() => onNavigate('tutorial')} />
    </View>
    <Text style={styles.coinBank}>🟡 {profile.totalCoins} COINS  ·  💎 {profile.diamonds} DIAMONDS</Text>
    <Pressable accessibilityRole="button" onPress={() => onNavigate('profile')} style={styles.accountEntry}>
      <Text style={styles.accountIcon}>👤</Text>
      <View style={styles.accountCopy}>
        <Text style={styles.accountTitle}>{signedIn ? 'ACCOUNT & CLOUD SAVE' : 'SIGN IN / CREATE ACCOUNT'}</Text>
        <Text numberOfLines={1} style={styles.accountSubtitle}>{signedIn ? accountLabel || 'Tap to sync or switch account' : 'Save your progress across devices'}</Text>
      </View>
      <Text style={styles.accountArrow}>›</Text>
    </Pressable>
  </View></SafeAreaView></SpaceBackdrop>;
}

function ScreenShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return <SpaceBackdrop><SafeAreaView style={styles.safe}><View style={styles.header}><Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.headerTitle}>{title}</Text><View style={styles.headerSpacer} /></View><ScrollView contentContainerStyle={styles.scroll}>{children}</ScrollView></SafeAreaView></SpaceBackdrop>;
}

function ModeScreen({ onBack, onStart, onStages }: { onBack: () => void; onStart: (mode: GameMode, missionId?: string) => void; onStages: () => void }) {
  return <ScreenShell title="SELECT MODE" onBack={onBack}>
    <Text style={styles.screenIntro}>CHOOSE YOUR FLIGHT</Text>
    <Pressable style={styles.modePressable} onPress={() => onStart('endless')}><NeonPanel style={[styles.modeCard, styles.endlessCard]}><Text style={styles.modeIcon}>∞</Text><View style={styles.modeCopy}><Text style={styles.modeTitle}>ENDLESS SURVIVAL</Text><Text style={styles.modeDescription}>Go as far as you can. Every meter makes space more dangerous.</Text></View></NeonPanel></Pressable>
    <Pressable style={styles.modePressable} onPress={onStages}><NeonPanel style={styles.modeCard}><Text style={styles.modeIcon}>⚑</Text><View style={styles.modeCopy}><Text style={styles.modeTitle}>ADVENTURE MODE</Text><Text style={styles.modeDescription}>Clear six stages, earn first-clear rewards, and unlock Nebula Guardian.</Text></View></NeonPanel></Pressable>
    <Text style={styles.helpNote}>WEEKLY MISSIONS reset every Monday. Daily Challenges reset each day.</Text>
  </ScreenShell>;
}

function TutorialScreen({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const [page, setPage] = useState(0);
  const pages = [
    { icon: '📱', title: 'TILT TO FLY', body: 'Tilt your phone left or right to steer. You can switch to Touch control in Settings.' },
    { icon: '☄️', title: 'SURVIVE THE FIELD', body: 'Avoid asteroids. A hit costs one heart, but you get 1.5 seconds of recovery time.' },
    { icon: '💎', title: 'COLLECT POWER', body: 'Crystals and coins add score. Fuel keeps you flying. Shield, boost, and magnet are stored power-ups.' },
  ];
  const item = pages[page];
  return <ScreenShell title="HOW TO PLAY" onBack={onBack}><NeonPanel style={styles.tutorialPanel}><Text style={styles.tutorialIcon}>{item.icon}</Text><Text style={styles.tutorialTitle}>{item.title}</Text><Text style={styles.tutorialBody}>{item.body}</Text><View style={styles.dots}>{pages.map((_, index) => <View key={index} style={[styles.dot, index === page && styles.dotActive]} />)}</View><View style={styles.rowButtons}>{page > 0 ? <NeonButton label="PREVIOUS" small onPress={() => setPage(page - 1)} /> : <View />}{page < pages.length - 1 ? <NeonButton label="NEXT" small variant="primary" onPress={() => setPage(page + 1)} /> : <NeonButton label="START GAME" small variant="primary" onPress={onStart} />}</View></NeonPanel><NeonPanel style={styles.legendPanel}><Legend icon="☄️" text="Asteroids damage your rocket" /><Legend icon="🔋" text="Fuel Cell restores 25% fuel" /><Legend icon="🛡️" text="Shield prevents one impact" /><Legend icon="⚡" text="Boost travels 50% faster for 5 seconds" /></NeonPanel></ScreenShell>;
}

function Legend({ icon, text }: { icon: string; text: string }) { return <View style={styles.legend}><Text style={styles.legendIcon}>{icon}</Text><Text style={styles.legendText}>{text}</Text></View>; }

function MissionsScreen({ profile, onBack, onStart, onClaim }: { profile: StoredProfile; onBack: () => void; onStart: (id: string) => void; onClaim: (id: string, reward: number) => void }) {
  return <ScreenShell title="WEEKLY MISSIONS" onBack={onBack}><Text style={styles.screenIntro}>WEEK OF {profile.missionsWeek} · RESETS MONDAY</Text>{MISSION_DEFINITIONS.map((mission) => {
    const value = GameStorage.missionValue(profile, mission.id); const claimed = GameStorage.isClaimed(profile, mission.id); const complete = value >= mission.target; const progress = Math.min(100, value / mission.target * 100);
    return <NeonPanel key={mission.id} style={styles.missionCard}><View style={styles.missionTop}><Text style={styles.missionIcon}>{mission.icon}</Text><View style={styles.missionCopy}><Text style={styles.missionTitle}>{mission.title}</Text><Text style={styles.missionDescription}>{mission.description}</Text></View><Text style={styles.reward}>🟡 {mission.reward}</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><View style={styles.missionFooter}><Text style={styles.progressText}>{Math.min(Math.floor(value), mission.target)} / {mission.target}</Text>{complete && !claimed ? <NeonButton small label="CLAIM" variant="gold" onPress={() => onClaim(mission.id, mission.reward)} /> : claimed ? <Text style={styles.claimed}>✓ CLAIMED</Text> : <NeonButton small label="PLAY" variant="primary" onPress={() => onStart(mission.id)} />}</View></NeonPanel>;
  })}</ScreenShell>;
}

function Wallet({ profile }: { profile: StoredProfile }) { return <Text style={styles.wallet}>🟡 {profile.totalCoins}  ·  💎 {profile.diamonds}</Text>; }

function GarageScreen({ profile, onBack, onRefresh, onOpen }: { profile: StoredProfile; onBack: () => void; onRefresh: (profile: StoredProfile) => void; onOpen: (screen: ScreenName) => void }) {
  const buy = async (id: RocketId) => { const rocket = ROCKET_DEFINITIONS[id]; Alert.alert('Purchase rocket?', `${rocket.name}\n${rocket.price} Coins`, [{ text: 'Cancel', style: 'cancel' }, { text: 'BUY', onPress: async () => { const saved = await GameStorage.purchaseRocket(profile, id); if (saved) { onRefresh(saved); Alert.alert('Rocket unlocked!', `${rocket.name} is ready to equip.`); } else Alert.alert('Not enough Coins', 'Complete flights and challenges to earn more Coins.'); } }]); };
  const equip = async (id: RocketId) => { const saved = await GameStorage.equipRocket(profile, id); if (saved) onRefresh(saved); };
  return <ScreenShell title="ROCKET GARAGE" onBack={onBack}><Wallet profile={profile} /><View style={styles.garageLinks}><NeonButton small label="UPGRADES" onPress={() => onOpen('upgrades')} /><NeonButton small label="ITEM SHOP" onPress={() => onOpen('shop')} /><NeonButton small label="INVENTORY" onPress={() => onOpen('inventory')} /></View>{(Object.keys(ROCKET_DEFINITIONS) as RocketId[]).map((id) => { const rocket = ROCKET_DEFINITIONS[id]; const owned = profile.ownedRockets.includes(id); const equipped = profile.equippedRocket === id; const locked = rocket.unlockStage && !profile.stages.find((stage) => stage.stageId === rocket.unlockStage)?.cleared; return <NeonPanel key={id} style={styles.garageCard}><Text style={[styles.garageRocket, { color: rocket.tint }]}>{rocket.emoji}</Text><View style={styles.garageInfo}><Text style={styles.missionTitle}>{rocket.name}</Text><Text style={styles.ability}>{rocket.ability}</Text><Text style={styles.missionDescription}>{rocket.description}</Text>{locked ? <Text style={styles.locked}>LOCKED — CLEAR STAGE 6</Text> : equipped ? <Text style={styles.claimed}>✓ EQUIPPED</Text> : owned ? <NeonButton small label="EQUIP" variant="primary" onPress={() => equip(id)} /> : <NeonButton small label={`BUY — 🟡 ${rocket.price}`} variant="gold" onPress={() => buy(id)} />}</View></NeonPanel>; })}</ScreenShell>;
}

function UpgradesScreen({ profile, onBack, onRefresh }: { profile: StoredProfile; onBack: () => void; onRefresh: (profile: StoredProfile) => void }) { return <ScreenShell title="PERMANENT UPGRADES" onBack={onBack}><Wallet profile={profile} />{(Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]).map((id) => { const upgrade = UPGRADE_DEFINITIONS[id]; const level = profile.upgrades[id]; const price = upgrade.prices[level]; return <NeonPanel key={id} style={styles.upgradeCard}><Text style={styles.missionIcon}>{upgrade.icon}</Text><View style={styles.missionCopy}><Text style={styles.missionTitle}>{upgrade.name} · LV {level}/2</Text><Text style={styles.missionDescription}>{upgrade.description}</Text><Text style={styles.ability}>{level < 2 ? `NEXT: ${upgrade.values[level]}` : 'MAX LEVEL'}</Text></View>{level < 2 ? <NeonButton small label={`🟡 ${price}`} variant="gold" onPress={async () => { const saved = await GameStorage.buyUpgrade(profile, id); if (saved) onRefresh(saved); else Alert.alert('Not enough Coins'); }} /> : null}</NeonPanel>; })}</ScreenShell>; }

function ShopScreen({ profile, onBack, onRefresh }: { profile: StoredProfile; onBack: () => void; onRefresh: (profile: StoredProfile) => void }) { return <ScreenShell title="ITEM SHOP" onBack={onBack}><Wallet profile={profile} />{(Object.keys(CONSUMABLE_DEFINITIONS) as ConsumableId[]).map((id) => { const item = CONSUMABLE_DEFINITIONS[id]; return <NeonPanel key={id} style={styles.upgradeCard}><Text style={styles.missionIcon}>{item.icon}</Text><View style={styles.missionCopy}><Text style={styles.missionTitle}>{item.name}</Text><Text style={styles.missionDescription}>{item.description}</Text><Text style={styles.ability}>OWNED: {profile.inventory[id]}</Text></View><NeonButton small label={`BUY ${item.price}`} variant="gold" onPress={async () => { const saved = await GameStorage.buyConsumable(profile, id); if (saved) onRefresh(saved); else Alert.alert('Not enough Coins'); }} /></NeonPanel>; })}</ScreenShell>; }

function InventoryScreen({ profile, onBack, onRefresh }: { profile: StoredProfile; onBack: () => void; onRefresh: (profile: StoredProfile) => void }) { const toggle = async (id: ConsumableId) => { const active = profile.loadout.includes(id); const next = active ? profile.loadout.filter((item) => item !== id) : [...profile.loadout, id]; if (!active && profile.loadout.length >= 3) { Alert.alert('Loadout full', 'Choose up to 3 different items per flight.'); return; } const saved = await GameStorage.setLoadout(profile, next); onRefresh(saved); }; return <ScreenShell title="INVENTORY" onBack={onBack}><Text style={styles.screenIntro}>EQUIP UP TO 3 ITEMS BEFORE A FLIGHT</Text>{(Object.keys(CONSUMABLE_DEFINITIONS) as ConsumableId[]).map((id) => <NeonPanel key={id} style={styles.upgradeCard}><Text style={styles.missionIcon}>{CONSUMABLE_DEFINITIONS[id].icon}</Text><View style={styles.missionCopy}><Text style={styles.missionTitle}>{CONSUMABLE_DEFINITIONS[id].name}</Text><Text style={styles.ability}>OWNED: {profile.inventory[id]}</Text></View><NeonButton small disabled={profile.inventory[id] === 0} label={profile.loadout.includes(id) ? 'EQUIPPED' : 'EQUIP'} variant={profile.loadout.includes(id) ? 'primary' : 'secondary'} onPress={() => toggle(id)} /></NeonPanel>)}</ScreenShell>; }

function StagesScreen({ profile, onBack, onStart }: { profile: StoredProfile; onBack: () => void; onStart: (id: string) => void }) { return <ScreenShell title="ADVENTURE STAGES" onBack={onBack}>{STAGES.map((stage) => { const progress = profile.stages.find((item) => item.stageId === stage.id); const locked = !progress?.unlocked; return <NeonPanel key={stage.id} style={styles.stageCard}><Text style={styles.stageNumber}>{locked ? '🔒' : `0${stage.number}`}</Text><View style={styles.missionCopy}><Text style={styles.missionTitle}>{stage.name}</Text><Text style={styles.missionDescription}>{stage.objective}</Text><Text style={styles.ability}>REWARD: 🟡 {stage.reward} · {'★'.repeat(progress?.bestStars ?? 0)}{'☆'.repeat(3 - (progress?.bestStars ?? 0))}</Text></View><NeonButton small disabled={locked} label={locked ? 'LOCKED' : progress?.cleared ? 'REPLAY' : 'PLAY'} variant="primary" onPress={() => onStart(stage.id)} /></NeonPanel>; })}</ScreenShell>; }

function StageClearScreen({ profile, result, onNext, onReplay, onGarage, onStages }: { profile: StoredProfile; result: GameRecord; onNext: (id: string) => void; onReplay: () => void; onGarage: () => void; onStages: () => void }) {
  const stage = stageFor(result.stageId);
  const glow = useState(() => new Animated.Value(0.35))[0];
  useEffect(() => { const animation = Animated.loop(Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(glow, { toValue: 0.35, duration: 700, useNativeDriver: true })])); animation.start(); return () => animation.stop(); }, [glow]);
  if (!stage) return null;
  const stars = Math.min(result.revivesUsed > 0 ? 2 : 3, result.remainingHp >= result.maxHp ? 3 : result.remainingHp >= 2 ? 2 : 1);
  const nextStage = STAGES[stage.number];
  const nextUnlocked = nextStage && profile.stages.find((item) => item.stageId === nextStage.id)?.unlocked;
  const bestScore = Math.max(...profile.records.filter((record) => record.stageId === stage.id).map((record) => record.score), result.score);
  return <SpaceBackdrop theme={stage.theme}><SafeAreaView style={styles.stageClearSafe}><Animated.Text style={[styles.stageClearBurst, { opacity: glow }]}>✦ ✧ ✦</Animated.Text><Text style={styles.overTitle}>{stage.number === 6 ? 'ADVENTURE\nCOMPLETE!' : 'STAGE\nCLEAR!'}</Text><Text style={styles.stageClearName}>{stage.name}</Text><Text style={styles.stageStars}>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text><NeonPanel style={styles.resultPanel}><ResultLine label="FINAL SCORE" value={result.score.toLocaleString()} /><ResultLine label="DISTANCE" value={`${result.distance} m`} /><ResultLine label="FLIGHT COINS" value={`🟡 ${result.coins}`} /><ResultLine label="DIAMONDS FOUND" value={`💎 ${result.crystals}`} /><ResultLine label="BEST STAGE SCORE" value={bestScore.toLocaleString()} />{result.stageFirstClearReward ? <View style={styles.stageReward}><Text style={styles.stageRewardText}>FIRST CLEAR REWARD · 🟡 {result.stageFirstClearReward}</Text></View> : <Text style={styles.replayReward}>FIRST-CLEAR REWARD ALREADY CLAIMED</Text>}{nextStage && nextUnlocked ? <Text style={styles.nextUnlocked}>✓ {nextStage.name} UNLOCKED</Text> : null}</NeonPanel><View style={styles.stageClearActions}>{nextStage && nextUnlocked ? <NeonButton label="NEXT STAGE" icon="▶" variant="primary" onPress={() => onNext(nextStage.id)} /> : null}<NeonButton label="REPLAY STAGE" icon="↻" onPress={onReplay} /><NeonButton label="ROCKET GARAGE" icon="🚀" onPress={onGarage} /><NeonButton label="STAGE SELECT" icon="☰" onPress={onStages} /></View></SafeAreaView></SpaceBackdrop>;
}

function DailyScreen({ profile, onBack, onRefresh }: { profile: StoredProfile; onBack: () => void; onRefresh: (profile: StoredProfile) => void }) { const daily = profile.daily; return <ScreenShell title="DAILY CHALLENGES" onBack={onBack}><Wallet profile={profile} /><Text style={styles.screenIntro}>RESETS WITH YOUR LOCAL DATE</Text>{daily?.challenges.map((challenge) => { const complete = challenge.value >= challenge.target; return <NeonPanel key={challenge.id} style={styles.missionCard}><View style={styles.missionTop}><Text style={styles.missionIcon}>{challenge.icon}</Text><View style={styles.missionCopy}><Text style={styles.missionTitle}>{challenge.title}</Text><Text style={styles.missionDescription}>{challenge.target} {challenge.metric}</Text></View><Text style={styles.reward}>🟡 {challenge.reward}</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, challenge.value / challenge.target * 100)}%` }]} /></View><View style={styles.missionFooter}><Text style={styles.progressText}>{Math.min(Math.floor(challenge.value), challenge.target)} / {challenge.target}</Text>{challenge.claimed ? <Text style={styles.claimed}>✓ CLAIMED</Text> : <NeonButton small disabled={!complete} label="CLAIM" variant="gold" onPress={async () => { const saved = await GameStorage.claimDaily(profile, challenge.id); if (saved) onRefresh(saved); }} />}</View></NeonPanel>; })}</ScreenShell>; }

function LeaderboardScreen({ profile, onBack }: { profile: StoredProfile; onBack: () => void }) {
  const rows = [...profile.records].sort((a, b) => b.score - a.score).slice(0, 10);
  return <ScreenShell title="LOCAL LEADERBOARD" onBack={onBack}><Text style={styles.screenIntro}>SCORES SAVED ON THIS DEVICE</Text><NeonPanel style={styles.leaderPanel}>{rows.length === 0 ? <View style={styles.emptyBoard}><Text style={styles.emptyIcon}>🏆</Text><Text style={styles.emptyTitle}>NO FLIGHTS YET</Text><Text style={styles.emptyText}>Finish a run to add your first local score.</Text></View> : rows.map((record, index) => <View key={record.id} style={[styles.leaderRow, index < 3 && styles.topRow]}><Text style={styles.rank}>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</Text><View style={styles.leaderDetail}><Text style={styles.leaderName}>FLIGHT {record.playedAt.slice(0, 10)}</Text><Text style={styles.leaderDistance}>{record.distance} m</Text></View><Text style={styles.leaderScore}>{record.score.toLocaleString()}</Text></View>)}</NeonPanel><Text style={styles.localOnly}>Local only — global rankings can be connected later without changing the game data model.</Text></ScreenShell>;
}

function SettingsScreen({ settings, sensorAvailable, gyroAvailable, onBack, onChange, onCalibrate }: { settings: Settings; sensorAvailable: boolean; gyroAvailable: boolean | null; onBack: () => void; onChange: (settings: Settings) => void; onCalibrate: () => void }) {
  const toggle = (key: 'soundEffects' | 'backgroundMusic' | 'vibration' | 'invertTilt' | 'gyroDodge' | 'reducedEffects') => onChange({ ...settings, [key]: !settings[key] });
  return <ScreenShell title="SETTINGS" onBack={onBack}><NeonPanel style={styles.settingsPanel}>
    <SettingToggle label="Sound Effects" value={settings.soundEffects} onChange={() => toggle('soundEffects')} />
    <SettingToggle label="Background Music" value={settings.backgroundMusic} onChange={() => toggle('backgroundMusic')} />
    <SettingToggle label="Vibration" value={settings.vibration} onChange={() => toggle('vibration')} />
    <SettingToggle label="Invert Tilt" value={settings.invertTilt} onChange={() => toggle('invertTilt')} />
    <SettingToggle label="Gyro Dodge" description="Quick phone roll dodges once every 8 seconds." value={settings.gyroDodge} onChange={() => toggle('gyroDodge')} />
    <SettingToggle label="Reduced Effects" value={settings.reducedEffects} onChange={() => toggle('reducedEffects')} />
    <Text style={styles.settingLabel}>TILT SENSITIVITY</Text><View style={styles.choiceRow}>{(['low', 'medium', 'high'] as const).map((value) => <Pressable key={value} onPress={() => onChange({ ...settings, sensitivity: value })} style={[styles.choice, settings.sensitivity === value && styles.choiceActive]}><Text style={styles.choiceText}>{value.toUpperCase()}</Text></Pressable>)}</View>
    <Text style={styles.settingLabel}>CONTROL MODE</Text><View style={styles.choiceRow}>{(['tilt', 'touch'] as const).map((value) => <Pressable key={value} onPress={() => onChange({ ...settings, controlMode: value })} style={[styles.choice, settings.controlMode === value && styles.choiceActive]}><Text style={styles.choiceText}>{value === 'tilt' ? 'TILT' : 'TOUCH'}</Text></Pressable>)}</View>
    <View style={styles.sensorStatus}><Text style={styles.sensorText}>{sensorAvailable ? '● Motion sensor detected' : '● Motion sensor unavailable — Touch mode will be used'}</Text><Text style={styles.sensorText}>{gyroAvailable === null ? 'Checking Gyro Dodge sensor…' : gyroAvailable ? '● Gyro Dodge sensor ready' : '● Gyro Dodge unavailable on this device'}</Text></View>
    <NeonButton label="CALIBRATE SENSOR" icon="◎" onPress={() => { onCalibrate(); Alert.alert('Calibration saved', 'Hold your phone naturally in portrait orientation before starting your next flight.'); }} />
  </NeonPanel></ScreenShell>;
}

function SettingToggle({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: () => void }) { return <View style={styles.toggleRow}><View style={styles.toggleCopy}><Text style={styles.toggleLabel}>{label}</Text>{description ? <Text style={styles.toggleDescription}>{description}</Text> : null}</View><Switch value={value} onValueChange={onChange} trackColor={{ false: '#24316c', true: '#5b54d9' }} thumbColor={value ? '#62eaff' : '#aab5da'} /></View>; }

function GameOverScreen({ result, highScore, onPlayAgain, onMenu }: { result: GameRecord; highScore: boolean; onPlayAgain: () => void; onMenu: () => void }) {
  const clearedStage = result.stageCompleted ? stageFor(result.stageId) : undefined;
  const title = clearedStage ? 'STAGE\nCLEAR!' : result.missionCompleted ? 'MISSION\nCOMPLETE!' : 'GAME\nOVER';
  const endMessage = clearedStage ? `${clearedStage.name} cleared${result.revivesUsed ? ' · star rating capped at ★★' : ''}` : result.endedBy === 'fuel' ? 'Out of fuel' : result.endedBy === 'mission' ? 'Mission objective reached' : 'Hull integrity depleted';
  return <SpaceBackdrop theme={clearedStage?.theme}><SafeAreaView style={styles.gameOverSafe}><Text style={styles.overTitle}>{title}</Text>{clearedStage ? <Text style={styles.newHigh}>★ FIRST-CLEAR REWARD: 🟡 {clearedStage.reward} ★</Text> : highScore ? <Text style={styles.newHigh}>★ NEW HIGH SCORE ★</Text> : null}<NeonPanel style={styles.resultPanel}><ResultLine label="DISTANCE" value={`${result.distance} m`} /><ResultLine label="SCORE" value={result.score.toLocaleString()} /><ResultLine label="CRYSTALS" value={`💎 ${result.crystals}`} /><ResultLine label="ASTEROIDS DODGED" value={String(result.asteroidsDodged)} /><ResultLine label="SURVIVAL" value={`${result.survivalTime}s`} /><View style={styles.endReason}><Text style={styles.endReasonText}>{endMessage}</Text></View></NeonPanel><View style={styles.gameOverButtons}><NeonButton label="PLAY AGAIN" icon="↻" variant="primary" onPress={onPlayAgain} /><NeonButton label="MAIN MENU" icon="⌂" onPress={onMenu} /></View></SafeAreaView></SpaceBackdrop>;
}

function ResultLine({ label, value }: { label: string; value: string }) { return <View style={styles.resultLine}><Text style={styles.resultLabel}>{label}</Text><Text style={styles.resultValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1 }, splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 11 }, splashRocket: { fontSize: 62, textShadowColor: COLORS.cyan, textShadowRadius: 17 }, splashTitle: { color: '#fff', fontSize: 48, lineHeight: 42, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', textShadowColor: COLORS.pink, textShadowRadius: 15 }, splashSubtitle: { color: COLORS.cyan, fontSize: 14, fontWeight: '900', letterSpacing: 4, marginBottom: 24 }, loading: { color: '#bbcaff', letterSpacing: 2, fontSize: 10, marginTop: 8 },
  mainContent: { flex: 1, alignItems: 'center', paddingHorizontal: 30, paddingTop: 30, paddingBottom: 12 }, logoWrap: { alignItems: 'center' }, logoTop: { color: '#a1efff', fontSize: 42, lineHeight: 40, fontWeight: '900', fontStyle: 'italic', letterSpacing: -2, textShadowColor: COLORS.blue, textShadowRadius: 11 }, logoBottom: { color: '#ff8cdd', fontSize: 55, lineHeight: 51, fontWeight: '900', fontStyle: 'italic', letterSpacing: -3, textShadowColor: COLORS.pink, textShadowRadius: 12 }, tagline: { color: '#72e9ff', fontWeight: '900', letterSpacing: 2.2, fontSize: 11, marginTop: 7 }, hero: { height: 150, width: '100%', position: 'relative', alignItems: 'center', justifyContent: 'center' }, planet: { position: 'absolute', left: 5, bottom: 22, fontSize: 65, opacity: 0.85 }, heroRocket: { fontSize: 98, transform: [{ rotate: '30deg' }], textShadowColor: COLORS.cyan, textShadowRadius: 20 }, spark: { position: 'absolute', right: 23, top: 22, color: '#fff', fontSize: 30, textShadowColor: COLORS.cyan, textShadowRadius: 15 }, menuButtons: { width: '100%', maxWidth: 340, gap: 9 }, playButton: { marginBottom: 2 }, coinBank: { marginTop: 'auto', color: '#ffe15a', fontWeight: '800', fontSize: 11, letterSpacing: 0.5, paddingVertical: 4 }, accountEntry: { width: '100%', maxWidth: 340, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(106, 222, 255, 0.72)', backgroundColor: 'rgba(19, 37, 103, 0.8)' }, accountIcon: { fontSize: 20 }, accountCopy: { flex: 1, gap: 2 }, accountTitle: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.7 }, accountSubtitle: { color: '#afc5f7', fontSize: 10 }, accountArrow: { color: COLORS.cyan, fontSize: 28, lineHeight: 30 },
  header: { height: 70, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 42, height: 42, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#183889', borderWidth: 1.5, borderColor: COLORS.cyan }, backText: { color: '#fff', fontSize: 39, lineHeight: 38, marginTop: -7 }, headerTitle: { color: '#eaf8ff', fontSize: 22, fontWeight: '900', fontStyle: 'italic', textShadowColor: COLORS.cyan, textShadowRadius: 9 }, headerSpacer: { width: 42 }, scroll: { padding: 18, paddingTop: 8, paddingBottom: 42, gap: 14 }, screenIntro: { color: '#b4c7ff', fontSize: 11, textAlign: 'center', letterSpacing: 1.5, fontWeight: '800', marginBottom: 3 },
  modePressable: { width: '100%' }, modeCard: { minHeight: 151, flexDirection: 'row', alignItems: 'center', gap: 16 }, endlessCard: { borderColor: COLORS.yellow }, modeIcon: { width: 48, flexShrink: 0, color: COLORS.cyan, fontSize: 48, fontWeight: '900', textAlign: 'center' }, modeCopy: { flex: 1, minWidth: 0, gap: 2 }, modeTitle: { color: '#fff', fontSize: 21, fontWeight: '900', lineHeight: 27, marginBottom: 4, flexShrink: 1 }, modeDescription: { color: '#c8d5ff', fontSize: 13, lineHeight: 19, flexShrink: 1 }, helpNote: { color: '#a4b9ee', textAlign: 'center', fontSize: 12, lineHeight: 17, marginTop: 3, paddingHorizontal: 8, flexShrink: 1 },
  tutorialPanel: { alignItems: 'center', paddingVertical: 28, minHeight: 327 }, tutorialIcon: { fontSize: 76, marginBottom: 8 }, tutorialTitle: { color: COLORS.cyan, fontWeight: '900', fontSize: 24, letterSpacing: 1 }, tutorialBody: { color: '#e4eaff', lineHeight: 21, fontSize: 15, textAlign: 'center', marginTop: 16 }, dots: { flexDirection: 'row', gap: 8, marginVertical: 22 }, dot: { width: 8, height: 8, borderRadius: 6, backgroundColor: '#6b77b9' }, dotActive: { backgroundColor: COLORS.cyan, width: 23 }, rowButtons: { width: '100%', flexDirection: 'row', justifyContent: 'space-between' }, legendPanel: { gap: 8 }, legend: { flexDirection: 'row', gap: 13, alignItems: 'center' }, legendIcon: { fontSize: 24 }, legendText: { color: '#e6edff', fontSize: 13, flexShrink: 1 },
  missionCard: { gap: 13 }, missionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, missionIcon: { fontSize: 34 }, missionCopy: { flex: 1 }, missionTitle: { color: '#fff', fontWeight: '900', fontSize: 16 }, missionDescription: { color: '#bcc9fa', fontSize: 12, marginTop: 2 }, reward: { color: COLORS.yellow, fontWeight: '900', fontSize: 12 }, progressTrack: { height: 10, backgroundColor: '#081442', borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: '#3656aa' }, progressFill: { height: '100%', backgroundColor: COLORS.cyan, borderRadius: 9 }, missionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, progressText: { color: '#d9e4ff', fontSize: 12, fontWeight: '800' }, claimed: { color: '#6fffc8', fontSize: 12, fontWeight: '900' },
  wallet: { color: COLORS.yellow, fontSize: 14, textAlign: 'center', fontWeight: '900', letterSpacing: 1 }, garageLinks: { flexDirection: 'row', gap: 7, justifyContent: 'center', flexWrap: 'wrap' }, garageCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, garageRocket: { fontSize: 48, textShadowColor: COLORS.cyan, textShadowRadius: 10 }, garageInfo: { flex: 1, gap: 5 }, ability: { color: COLORS.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }, locked: { color: '#f098bf', fontSize: 11, fontWeight: '900' }, upgradeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }, stageCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, stageNumber: { color: COLORS.cyan, fontSize: 26, fontWeight: '900', width: 42, textAlign: 'center' },
  stageClearSafe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 }, stageClearBurst: { color: '#a9f6ff', fontSize: 37, fontWeight: '900', textShadowColor: COLORS.cyan, textShadowRadius: 22 }, stageClearName: { color: '#cbd8ff', fontSize: 13, fontWeight: '900', letterSpacing: 1.4 }, stageStars: { color: COLORS.yellow, fontSize: 31, letterSpacing: 4, textShadowColor: '#ffbd41', textShadowRadius: 12 }, stageReward: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255, 214, 74, 0.14)' }, stageRewardText: { color: '#ffe27d', fontSize: 12, fontWeight: '900', textAlign: 'center' }, replayReward: { color: '#b6c2eb', fontSize: 10, fontWeight: '800', textAlign: 'center', marginTop: 8 }, nextUnlocked: { color: '#76ffd6', fontSize: 11, fontWeight: '900', textAlign: 'center', marginTop: 7 }, stageClearActions: { width: '100%', maxWidth: 350, gap: 8 },
  leaderPanel: { padding: 9 }, emptyBoard: { alignItems: 'center', paddingVertical: 36, gap: 7 }, emptyIcon: { fontSize: 50 }, emptyTitle: { color: '#fff', fontWeight: '900', fontSize: 18 }, emptyText: { color: '#bac8f5', textAlign: 'center', fontSize: 13 }, leaderRow: { minHeight: 52, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: 'rgba(111, 137, 220, 0.28)' }, topRow: { backgroundColor: 'rgba(110, 63, 224, 0.18)' }, rank: { width: 44, color: '#f4f7ff', fontWeight: '900', fontSize: 16 }, leaderDetail: { flex: 1 }, leaderName: { color: '#f6f7ff', fontWeight: '800', fontSize: 12 }, leaderDistance: { color: '#afbef5', fontSize: 11, marginTop: 2 }, leaderScore: { color: COLORS.yellow, fontWeight: '900', fontSize: 17 }, localOnly: { color: '#b4c2f4', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  settingsPanel: { gap: 9 }, toggleRow: { minHeight: 48, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(123, 148, 230, 0.2)' }, toggleCopy: { flex: 1, gap: 3 }, toggleLabel: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1 }, toggleDescription: { color: '#b7c7f5', fontSize: 10, lineHeight: 14, flexShrink: 1 }, settingLabel: { color: COLORS.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 10 }, choiceRow: { flexDirection: 'row', gap: 8 }, choice: { flex: 1, minHeight: 39, borderRadius: 12, backgroundColor: '#172365', borderWidth: 1, borderColor: '#4162b7', alignItems: 'center', justifyContent: 'center' }, choiceActive: { backgroundColor: '#4132b8', borderColor: COLORS.cyan, shadowColor: COLORS.cyan, shadowOpacity: 0.8, shadowRadius: 7 }, choiceText: { color: '#fff', fontSize: 11, fontWeight: '900' }, sensorStatus: { marginVertical: 6, padding: 10, gap: 5, backgroundColor: 'rgba(0, 212, 255, 0.1)', borderRadius: 12 }, sensorText: { color: '#8df6ff', fontSize: 12, lineHeight: 17, textAlign: 'center', fontWeight: '700' },
  gameOverSafe: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 17 }, overTitle: { color: '#fa9eff', fontSize: 47, lineHeight: 43, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', textShadowColor: COLORS.pink, textShadowRadius: 18 }, newHigh: { color: COLORS.yellow, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 }, resultPanel: { width: '100%', maxWidth: 350, gap: 7, paddingVertical: 20 }, resultLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 5 }, resultLabel: { color: '#bdc9ff', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, resultValue: { color: '#fff', fontSize: 22, fontWeight: '900' }, endReason: { marginTop: 7, backgroundColor: 'rgba(90, 55, 173, 0.45)', padding: 10, borderRadius: 10 }, endReasonText: { color: '#d3dcff', fontSize: 12, textAlign: 'center' }, gameOverButtons: { width: '100%', maxWidth: 350, gap: 10 },
});
