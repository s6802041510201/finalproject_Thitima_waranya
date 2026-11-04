import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, difficultyFor, ITEM_META, OBSTACLE_META, stageFor } from '@/game/config/game';
import { NeonButton } from '@/components/NeonButton';
import { NeonPanel } from '@/components/NeonPanel';
import { SpaceBackdrop } from '@/components/SpaceBackdrop';
import { useGameEngine } from '@/game/useGameEngine';
import { rocketAudio } from '@/services/audio';
import { CONSUMABLE_DEFINITIONS } from '@/game/config/game';
import type { ConsumableId, GameMode, GameModifiers, GameResult, Settings } from '@/types/game';

type Props = {
  mode: GameMode;
  missionId?: string;
  stageId?: string;
  settings: Settings;
  modifiers: GameModifiers;
  loadout: ConsumableId[];
  diamondBalance: number;
  getTilt: () => number;
  consumeDodge: () => number;
  gyroAvailable: boolean | null;
  onFinished: (result: GameResult) => void;
  onExit: () => void;
  onSettingsChange: (settings: Settings) => void;
  onCalibrate: () => void;
  onSpendDiamonds: (amount: number) => Promise<boolean>;
  onConsume: (item: ConsumableId) => void;
  onFeedback: (event: 'collect' | 'hit' | 'warning') => void;
};

export function GameScreen({ mode, missionId, stageId, settings, modifiers, loadout, diamondBalance, getTilt, consumeDodge, gyroAvailable, onFinished, onExit, onSettingsChange, onCalibrate, onSpendDiamonds, onConsume, onFeedback }: Props) {
  const { width, height } = useWindowDimensions();
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  // The HUD and power controls are outside the playfield. Measuring this area
  // keeps collision, spawning, and rendering in the same coordinate space on
  // every phone size and safe-area configuration.
  const [arenaSize, setArenaSize] = useState(() => ({ width, height: Math.max(300, height - 185) }));
  const [deathPhase, setDeathPhase] = useState<'dying' | 'offer' | null>(null);
  const [reviveCount, setReviveCount] = useState(0);
  const [reviveSeconds, setReviveSeconds] = useState(10);
  const [reviving, setReviving] = useState(false);
  const deathTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onArenaLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setArenaSize((current) => current.width === nextWidth && current.height === nextHeight
      ? current
      : { width: nextWidth, height: nextHeight });
  }, []);
  const onDeath = useCallback(() => {
    setDeathPhase('dying');
    deathTimer.current = setTimeout(() => { setReviveSeconds(10); setDeathPhase('offer'); }, settings.reducedEffects ? 450 : 1100);
  }, [settings.reducedEffects]);
  const { snapshot, isPaused, remainingItems, setPaused, reset, activateShield, activateBoost, setTouchX, useConsumable, giveUp, revive } = useGameEngine({
    width: arenaSize.width, height: arenaSize.height, mode, missionId, stageId, settings, modifiers, loadout, getTilt, consumeDodge, onGameOver: onFinished, onDeath, onConsume, onEvent: onFeedback,
  });
  useEffect(() => {
    rocketAudio.setMusicEnabled(settings.backgroundMusic && !isPaused && !deathPhase);
  }, [deathPhase, isPaused, settings.backgroundMusic]);
  useEffect(() => () => { if (deathTimer.current) clearTimeout(deathTimer.current); }, []);
  useEffect(() => {
    if (deathPhase !== 'offer') return;
    if (reviveSeconds <= 0) { giveUp(); return; }
    const timer = setTimeout(() => setReviveSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [deathPhase, giveUp, reviveSeconds]);
  const onTouch = useCallback((event: { nativeEvent: { locationX: number } }) => {
    if (settings.controlMode === 'touch') setTouchX(event.nativeEvent.locationX);
  }, [setTouchX, settings.controlMode]);
  const fuelColor = snapshot.fuel <= 20 ? COLORS.danger : snapshot.fuel <= 45 ? COLORS.yellow : COLORS.cyan;
  const difficulty = difficultyFor(snapshot.distance);
  const stage = stageFor(stageId);
  const backdropTheme = stage?.theme ?? difficulty.name.toLowerCase();
  const reviveCost = reviveCount === 0 ? 5 : 10;
  const canRevive = reviveCount < 2 && diamondBalance >= reviveCost;
  const handleRevive = async () => {
    if (!canRevive || reviving) return;
    setReviving(true);
    const paid = await onSpendDiamonds(reviveCost);
    if (paid && revive()) { setReviveCount((value) => value + 1); setDeathPhase(null); }
    setReviving(false);
  };
  return (
    <SpaceBackdrop theme={backdropTheme}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.hud} pointerEvents="box-none">
          <View style={styles.hudLeft}>
            <Text style={styles.hearts}>{'♥'.repeat(snapshot.hp)}<Text style={styles.emptyHearts}>{'♡'.repeat(Math.max(0, snapshot.maxHp - snapshot.hp))}</Text></Text>
            <View style={styles.fuelRow}><Text style={styles.fuelIcon}>⛽</Text><View style={styles.fuelTrack}><View style={[styles.fuelFill, { width: `${snapshot.fuel}%`, backgroundColor: fuelColor }]} /></View></View>
          </View>
          <View style={styles.scoreBox}><Text style={styles.hudLabel}>DISTANCE</Text><Text style={styles.hudValue}>{Math.floor(snapshot.distance)} m</Text><Text style={styles.hudLabel}>SCORE</Text><Text style={styles.hudValue}>{Math.floor(snapshot.score)}</Text><Text style={styles.currencyHud}>🟡 {snapshot.coins}  💎 +{snapshot.crystals}</Text></View>
          <Pressable onPress={() => setPaused(true)} style={styles.pause}><Text style={styles.pauseText}>Ⅱ</Text></Pressable>
        </View>
        <Pressable style={styles.arena} onLayout={onArenaLayout} onPressIn={onTouch} onPressOut={() => setTouchX(null)} onTouchMove={onTouch}>
          <Text style={styles.difficulty}>{difficulty.name}</Text>
          {snapshot.entities.map((entity) => {
            const meta = entity.kind === 'ring' ? { emoji: '⭕', label: 'Energy Ring' } : entity.kind in ITEM_META ? ITEM_META[entity.kind as keyof typeof ITEM_META] : OBSTACLE_META[entity.kind as keyof typeof OBSTACLE_META];
            return <Text key={entity.id} style={[styles.entity, { fontSize: entity.size, left: entity.x * arenaSize.width - entity.size / 2, top: entity.y, transform: [{ rotate: `${entity.rotation}rad` }] }]}>{meta.emoji}</Text>;
          })}
          <View pointerEvents="none" style={styles.statusRow}>
            {stage?.rings ? <Text numberOfLines={1} style={[styles.statusPill, styles.ringPill]}>RINGS {snapshot.rings}/{stage.rings}</Text> : null}
            {snapshot.magnetLeft > 0 ? <Text numberOfLines={1} style={[styles.statusPill, styles.magnetPill]}>🧲 MAGNET · COINS + CRYSTALS · {Math.ceil(snapshot.magnetLeft)}s</Text> : null}
            {snapshot.boostLeft > 0 ? <Text numberOfLines={1} style={[styles.statusPill, styles.boostPill]}>BOOST · {Math.ceil(snapshot.boostLeft)}s</Text> : null}
            {settings.gyroDodge && gyroAvailable !== null ? <Text numberOfLines={1} style={[styles.statusPill, styles.dodgePill]}>{!gyroAvailable ? 'GYRO DODGE SENSOR UNAVAILABLE' : snapshot.dodgeCooldown > 0 ? `DODGE READY IN · ${Math.ceil(snapshot.dodgeCooldown)}s` : 'GYRO DODGE READY'}</Text> : null}
            {snapshot.stormLeft > 0 ? <Text numberOfLines={1} style={[styles.statusPill, styles.stormPill]}>⚡ STORM · {Math.ceil(snapshot.stormLeft)}s</Text> : null}
            {snapshot.showerLeft > 0 ? <Text numberOfLines={1} style={[styles.statusPill, styles.showerPill]}>☄ METEOR SHOWER · {Math.ceil(snapshot.showerLeft)}s</Text> : null}
            {snapshot.bossLeft > 0 ? <Text numberOfLines={1} style={[styles.statusPill, styles.bossPill]}>BOSS {snapshot.bossLeft > 11 ? 'PHASE 1' : 'PHASE 2'} · {Math.ceil(snapshot.bossLeft)}s</Text> : null}
          </View>
          {snapshot.bossLeft > 0 ? <Text style={styles.boss}>🌑</Text> : null}
          {snapshot.bossLaserWarning ? <View pointerEvents="none" style={styles.laserWarning}><Text style={styles.laserText}>⚠ LASER INCOMING ⚠</Text></View> : null}
          {snapshot.bossLaserActive ? <View pointerEvents="none" style={styles.laserBeam} /> : null}
          {snapshot.shieldActive ? <View style={[styles.shieldBubble, { left: snapshot.rocketX * arenaSize.width - 34 }]} /> : null}
          <Text style={[styles.rocket, { left: snapshot.rocketX * arenaSize.width - 29, color: modifiers.rocketTint, transform: [{ rotate: `${Math.max(-15, Math.min(15, snapshot.rocketVelocity / 24))}deg` }], opacity: snapshot.invulnerableLeft > 0 && Math.floor(snapshot.elapsed * 12) % 2 === 0 ? 0.45 : 1 }]}>{modifiers.rocketEmoji}</Text>
          <Text style={[styles.flame, { left: snapshot.rocketX * arenaSize.width - 12, opacity: 0.55 + (Math.sin(snapshot.elapsed * 20) + 1) / 5 }]}>🔥</Text>
        </Pressable>
        <View style={styles.bottomControls} pointerEvents="box-none">
          <Pressable onPress={activateShield} style={[styles.powerButton, snapshot.shieldCharges === 0 && styles.powerDisabled]}><Text style={styles.powerIcon}>🛡️</Text><Text style={styles.counter}>{snapshot.shieldCharges}</Text></Pressable>
          <View style={styles.combo}><Text style={styles.comboLabel}>COMBO</Text><Text style={styles.comboValue}>×{Math.max(1, snapshot.combo)}</Text></View>
          <Pressable onPress={activateBoost} style={[styles.powerButton, snapshot.boostCharges === 0 && styles.powerDisabled]}><Text style={styles.powerIcon}>⚡</Text><Text style={styles.counter}>{snapshot.boostCharges}</Text></Pressable>
        </View>
        {loadout.length > 0 ? <View style={styles.consumables}>{loadout.map((item) => <Pressable key={item} disabled={remainingItems[item] <= 0} onPress={() => useConsumable(item)} style={[styles.consumable, remainingItems[item] <= 0 && styles.powerDisabled]}><Text style={styles.consumableIcon}>{CONSUMABLE_DEFINITIONS[item].icon}</Text><Text style={styles.consumableCount}>×{remainingItems[item]}</Text></Pressable>)}</View> : null}
        {isPaused ? <View style={styles.overlay}><NeonPanel style={styles.pausePanel}><Text style={styles.pauseSymbol}>Ⅱ</Text><Text style={styles.pausedTitle}>PAUSED</Text><NeonButton label="RESUME" icon="▶" variant="primary" onPress={() => setPaused(false)} /><NeonButton label="RESTART" icon="↻" onPress={reset} /><NeonButton label="SETTINGS" icon="⚙" onPress={() => setQuickSettingsOpen(true)} /><NeonButton label="MAIN MENU" icon="⌂" onPress={onExit} /></NeonPanel></View> : null}
        {quickSettingsOpen ? <View style={styles.quickOverlay}><NeonPanel style={styles.quickPanel}><Text style={styles.quickTitle}>QUICK SETTINGS</Text><QuickOption label={`SFX ${settings.soundEffects ? 'ON' : 'OFF'}`} onPress={() => onSettingsChange({ ...settings, soundEffects: !settings.soundEffects })} /><QuickOption label={`MUSIC ${settings.backgroundMusic ? 'ON' : 'OFF'}`} onPress={() => onSettingsChange({ ...settings, backgroundMusic: !settings.backgroundMusic })} /><QuickOption label={`VIBRATION ${settings.vibration ? 'ON' : 'OFF'}`} onPress={() => onSettingsChange({ ...settings, vibration: !settings.vibration })} /><QuickOption label={`CONTROL: ${settings.controlMode.toUpperCase()}`} onPress={() => onSettingsChange({ ...settings, controlMode: settings.controlMode === 'tilt' ? 'touch' : 'tilt' })} /><QuickOption label={`SENSITIVITY: ${settings.sensitivity.toUpperCase()}`} onPress={() => onSettingsChange({ ...settings, sensitivity: settings.sensitivity === 'low' ? 'medium' : settings.sensitivity === 'medium' ? 'high' : 'low' })} /><NeonButton label="CALIBRATE" small onPress={onCalibrate} /><NeonButton label="DONE" variant="primary" onPress={() => setQuickSettingsOpen(false)} /></NeonPanel></View> : null}
        {deathPhase ? <View style={styles.deathOverlay}><View style={styles.explosion}><Text style={styles.explosionText}>{deathPhase === 'dying' ? '💥' : '🚀'}</Text></View>{deathPhase === 'dying' ? <><Text style={styles.destroyed}>CRITICAL DAMAGE</Text><Text style={styles.deathHint}>ROCKET DESTROYED!</Text></> : <NeonPanel style={styles.revivePanel}><Text style={styles.destroyed}>ROCKET DESTROYED!</Text><Text style={styles.reviveCopy}>Continue your adventure?</Text><Text style={styles.diamondBalance}>💎 {diamondBalance} DIAMONDS</Text><Text style={styles.countdown}>DECISION TIME: {reviveSeconds}s</Text><NeonButton label={canRevive ? `CONTINUE — ${reviveCost} 💎` : 'NOT ENOUGH DIAMONDS'} disabled={!canRevive || reviving} variant="primary" onPress={handleRevive} /><NeonButton label="GIVE UP" variant="danger" onPress={giveUp} /></NeonPanel>}</View> : null}
      </SafeAreaView>
    </SpaceBackdrop>
  );
}

function QuickOption({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable style={styles.quickOption} onPress={onPress}><Text style={styles.quickOptionText}>{label}</Text><Text style={styles.quickArrow}>›</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1 },
  hud: { height: 110, paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 5 },
  hudLeft: { gap: 8 }, hearts: { color: '#ff5b7c', fontSize: 27, letterSpacing: 1, textShadowColor: '#ff5b7c', textShadowRadius: 8 }, emptyHearts: { color: '#53617f' },
  fuelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, fuelIcon: { fontSize: 19 }, fuelTrack: { width: 130, height: 15, borderRadius: 10, padding: 2, backgroundColor: '#07133e', borderWidth: 1, borderColor: '#5ce7ff' }, fuelFill: { height: '100%', borderRadius: 8 },
  scoreBox: { alignItems: 'flex-end', marginRight: 44 }, hudLabel: { color: '#ccd7ff', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, hudValue: { color: '#fff', fontSize: 19, fontWeight: '900', marginBottom: 2 }, currencyHud: { color: '#ffdf67', fontSize: 10, fontWeight: '900', marginTop: 1 },
  pause: { position: 'absolute', right: 16, top: 12, width: 39, height: 39, borderRadius: 22, backgroundColor: '#1737a0', borderColor: '#5ceaff', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, pauseText: { fontSize: 22, color: '#fff', fontWeight: '900' },
  arena: { flex: 1 }, difficulty: { alignSelf: 'center', color: '#99efff', fontSize: 11, fontWeight: '900', letterSpacing: 2, opacity: 0.8 }, statusRow: { position: 'absolute', top: 18, left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'flex-start', gap: 5, zIndex: 4 }, statusPill: { maxWidth: '100%', overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(114, 226, 255, 0.55)', backgroundColor: 'rgba(12, 24, 73, 0.84)', color: '#f2f7ff', paddingHorizontal: 9, paddingVertical: 4, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.25, textAlign: 'center', includeFontPadding: false }, ringPill: { color: '#d3bbff', borderColor: 'rgba(189, 155, 255, 0.65)' }, magnetPill: { color: '#ffd8f7', borderColor: 'rgba(255, 130, 223, 0.7)' }, boostPill: { color: '#ffe98c', borderColor: 'rgba(255, 225, 90, 0.7)' }, dodgePill: { color: '#aaffed', borderColor: 'rgba(118, 255, 229, 0.7)' }, stormPill: { color: '#b9dcff', borderColor: 'rgba(145, 196, 255, 0.7)' }, showerPill: { color: '#ffd0a8', borderColor: 'rgba(255, 178, 107, 0.7)' }, bossPill: { color: '#ffb4c0', borderColor: 'rgba(255, 130, 152, 0.7)' }, entity: { position: 'absolute', textAlign: 'center', textShadowColor: '#a95dff', textShadowRadius: 8 }, rocket: { position: 'absolute', bottom: 50, fontSize: 58, zIndex: 3, textShadowColor: '#58dcff', textShadowRadius: 14 }, flame: { position: 'absolute', bottom: 23, zIndex: 2, fontSize: 30 }, shieldBubble: { position: 'absolute', bottom: 36, width: 68, height: 68, zIndex: 1, borderRadius: 36, borderWidth: 3, borderColor: '#62eaff', backgroundColor: 'rgba(64, 207, 255, 0.22)', shadowColor: '#55e6ff', shadowRadius: 15, shadowOpacity: 1 },
  boss: { position: 'absolute', top: 108, alignSelf: 'center', fontSize: 72, opacity: 0.72 }, laserWarning: { position: 'absolute', top: '48%', left: 0, right: 0, height: 9, backgroundColor: 'rgba(255, 58, 96, 0.6)', alignItems: 'center', justifyContent: 'center' }, laserBeam: { position: 'absolute', top: 0, bottom: 0, alignSelf: 'center', width: 56, backgroundColor: 'rgba(255, 40, 84, 0.48)', borderLeftWidth: 2, borderRightWidth: 2, borderColor: '#ffb5c2' }, laserText: { color: '#fff0f2', fontSize: 9, fontWeight: '900', letterSpacing: 1, textShadowColor: '#ff174f', textShadowRadius: 8 },
  bottomControls: { paddingHorizontal: 17, paddingBottom: 8, minHeight: 75, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, powerButton: { width: 58, height: 58, borderRadius: 30, borderWidth: 2, borderColor: '#55e6ff', backgroundColor: 'rgba(18, 52, 160, 0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: '#5ee8ff', shadowRadius: 10, shadowOpacity: 0.8 }, powerDisabled: { opacity: 0.45 }, powerIcon: { fontSize: 28 }, counter: { position: 'absolute', right: -4, bottom: -2, minWidth: 22, textAlign: 'center', overflow: 'hidden', borderRadius: 12, color: '#fff', backgroundColor: '#152368', fontWeight: '900', paddingVertical: 1 }, combo: { alignItems: 'center' }, comboLabel: { color: '#b8c7ff', fontSize: 10, fontWeight: '900' }, comboValue: { color: '#ffe15a', fontSize: 19, fontWeight: '900' },
  consumables: { position: 'absolute', bottom: 78, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7, zIndex: 8 }, consumable: { minWidth: 38, height: 34, paddingHorizontal: 5, borderRadius: 10, backgroundColor: 'rgba(18, 52, 160, 0.92)', borderWidth: 1, borderColor: COLORS.pink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, consumableIcon: { fontSize: 20 }, consumableCount: { color: '#fff', fontSize: 10, fontWeight: '900' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(1, 4, 25, 0.72)', alignItems: 'center', justifyContent: 'center', padding: 35, zIndex: 20 }, pausePanel: { width: '100%', maxWidth: 320, alignItems: 'center', gap: 12, paddingVertical: 23 }, pauseSymbol: { color: '#dffaff', fontSize: 47, fontWeight: '900' }, pausedTitle: { color: '#fff', fontSize: 28, fontWeight: '900', fontStyle: 'italic', marginBottom: 6 },
  quickOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, backgroundColor: 'rgba(1, 4, 25, 0.89)', alignItems: 'center', justifyContent: 'center', padding: 28 }, quickPanel: { width: '100%', maxWidth: 340, gap: 8, paddingVertical: 20 }, quickTitle: { color: COLORS.cyan, textAlign: 'center', fontSize: 21, fontWeight: '900', marginBottom: 4 }, quickOption: { minHeight: 41, paddingHorizontal: 12, backgroundColor: 'rgba(39, 48, 131, 0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(91, 218, 255, 0.44)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quickOptionText: { color: '#f3f7ff', fontSize: 12, fontWeight: '900' }, quickArrow: { color: COLORS.cyan, fontSize: 24, lineHeight: 20 },
  deathOverlay: { position: 'absolute', zIndex: 50, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(13, 3, 30, 0.88)', alignItems: 'center', justifyContent: 'center', padding: 27, gap: 13 }, explosion: { width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(255, 91, 62, 0.26)', borderWidth: 3, borderColor: '#ffad4c', alignItems: 'center', justifyContent: 'center', shadowColor: '#ff583d', shadowOpacity: 1, shadowRadius: 30 }, explosionText: { fontSize: 65 }, destroyed: { color: '#ffb08d', fontSize: 25, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1, textAlign: 'center' }, deathHint: { color: '#e0bcff', fontSize: 13, fontWeight: '800', letterSpacing: 1.2 }, revivePanel: { width: '100%', maxWidth: 330, alignItems: 'center', gap: 11, paddingVertical: 21 }, reviveCopy: { color: '#d9e5ff', fontSize: 14 }, diamondBalance: { color: COLORS.cyan, fontSize: 18, fontWeight: '900' }, countdown: { color: COLORS.yellow, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
});
