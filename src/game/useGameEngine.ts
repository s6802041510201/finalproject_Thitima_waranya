import { useCallback, useEffect, useRef, useState } from 'react';
import { difficultyFor, EMPTY_SNAPSHOT, ITEM_META, MISSION_DEFINITIONS, OBSTACLE_META, stageFor } from '@/game/config/game';
import type { ConsumableId, EntityKind, GameEntity, GameMode, GameModifiers, GameResult, GameSnapshot, ItemKind, ObstacleKind, Settings } from '@/types/game';

type EngineOptions = { width: number; height: number; mode: GameMode; missionId?: string; stageId?: string; settings: Settings; modifiers: GameModifiers; loadout: ConsumableId[]; getTilt: () => number; consumeDodge: () => number; onGameOver: (result: GameResult) => void; onDeath: (reason: 'hp' | 'fuel') => void; onConsume: (item: ConsumableId) => void; onEvent: (event: 'collect' | 'hit' | 'warning') => void; };
const itemKinds: ItemKind[] = ['fuel', 'crystal', 'coin', 'repair', 'shield', 'boost', 'magnet'];
const obstacleKinds: ObstacleKind[] = ['small', 'giant', 'meteor', 'debris'];
const GYRO_DODGE_COOLDOWN_SECONDS = 8;
const MAGNET_DURATION_SECONDS = 8;
const isItem = (kind: EntityKind): kind is ItemKind => itemKinds.includes(kind as ItemKind);
const isMagnetTarget = (kind: EntityKind) => kind === 'coin' || kind === 'crystal';
const isObstacle = (kind: EntityKind): kind is ObstacleKind => obstacleKinds.includes(kind as ObstacleKind);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const newSnapshot = (modifiers: GameModifiers): GameSnapshot => ({ ...EMPTY_SNAPSHOT, maxHp: modifiers.maxHp, hp: modifiers.maxHp, maxFuel: modifiers.maxFuel, fuel: modifiers.maxFuel, shieldCharges: modifiers.starterShield ? 1 : 0 });

export function useGameEngine(options: EngineOptions) {
  const { width, height, mode, missionId, stageId, settings, modifiers, loadout, getTilt, consumeDodge, onGameOver, onDeath, onConsume, onEvent } = options;
  const model = useRef<GameSnapshot>(newSnapshot(modifiers));
  const modelDirty = useRef(true); const paused = useRef(false); const ended = useRef(false); const deathReason = useRef<'hp' | 'fuel' | null>(null);
  const nextId = useRef(0); const spawnClock = useRef(0.8); const ringClock = useRef(1.8); const touchTarget = useRef<number | null>(null); const lastFrame = useRef(0); const shieldsUsed = useRef(0); const boostsUsed = useRef(0); const revives = useRef(0);
  const events = useRef({ showerStarted: false, stormStarted: false, bossStarted: false });
  const items = useRef<Record<ConsumableId, number>>({ repairKit: loadout.includes('repairKit') ? 1 : 0, shieldBattery: loadout.includes('shieldBattery') ? 1 : 0, emergencyFuel: loadout.includes('emergencyFuel') ? 1 : 0, magnetPulse: loadout.includes('magnetPulse') ? 1 : 0 });
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => newSnapshot(modifiers));
  const [isPaused, setIsPaused] = useState(false); const [remainingItems, setRemainingItems] = useState(items.current);
  const callback = useRef({ onGameOver, onDeath, onConsume, onEvent }); callback.current = { onGameOver, onDeath, onConsume, onEvent };

  const publish = useCallback(() => { if (!modelDirty.current) return; setSnapshot({ ...model.current, entities: [...model.current.entities] }); modelDirty.current = false; }, []);
  const result = useCallback((endedBy: GameResult['endedBy'], missionCompleted = false, stageCompleted = false): GameResult => { const state = model.current; return { score: Math.round(state.score), distance: Math.round(state.distance), crystals: state.crystals, coins: state.coins, fuelCells: state.fuelCells, asteroidsDodged: state.asteroidsDodged, shieldsUsed: shieldsUsed.current, boostsUsed: boostsUsed.current, survivalTime: Math.round(state.elapsed), remainingHp: state.hp, maxHp: state.maxHp, mode, missionId, stageId, missionCompleted, stageCompleted, revivesUsed: revives.current, endedBy }; }, [missionId, mode, stageId]);

  const reset = useCallback(() => { model.current = newSnapshot(modifiers); modelDirty.current = true; nextId.current = 0; spawnClock.current = 0.45; ringClock.current = 1.8; events.current = { showerStarted: false, stormStarted: false, bossStarted: false }; shieldsUsed.current = 0; boostsUsed.current = 0; revives.current = 0; paused.current = false; ended.current = false; deathReason.current = null; lastFrame.current = 0; items.current = { repairKit: loadout.includes('repairKit') ? 1 : 0, shieldBattery: loadout.includes('shieldBattery') ? 1 : 0, emergencyFuel: loadout.includes('emergencyFuel') ? 1 : 0, magnetPulse: loadout.includes('magnetPulse') ? 1 : 0 }; setRemainingItems(items.current); setIsPaused(false); publish(); }, [loadout, modifiers, publish]);
  const setPaused = useCallback((value: boolean) => { if (ended.current) return; paused.current = value; lastFrame.current = 0; setIsPaused(value); }, []);
  const activateShield = useCallback(() => { const state = model.current; if (!paused.current && !ended.current && state.shieldCharges > 0 && !state.shieldActive) { state.shieldCharges -= 1; state.shieldActive = true; shieldsUsed.current += 1; modelDirty.current = true; } }, []);
  const activateBoost = useCallback(() => { const state = model.current; if (!paused.current && !ended.current && state.boostCharges > 0 && state.boostLeft <= 0) { state.boostCharges -= 1; state.boostLeft = modifiers.boostDuration; boostsUsed.current += 1; modelDirty.current = true; } }, [modifiers.boostDuration]);
  const setTouchX = useCallback((x: number | null) => { touchTarget.current = x === null ? null : clamp(x / width, 0, 1); }, [width]);
  const useConsumable = useCallback((item: ConsumableId) => {
    const state = model.current; if (paused.current || ended.current || items.current[item] <= 0) return false;
    if (item === 'repairKit' && state.hp >= state.maxHp) return false;
    if (item === 'emergencyFuel' && state.fuel >= state.maxFuel) return false;
    if (item === 'repairKit') state.hp = Math.min(state.maxHp, state.hp + 1);
    if (item === 'shieldBattery') { state.shieldActive = true; shieldsUsed.current += 1; }
    if (item === 'emergencyFuel') state.fuel = Math.min(state.maxFuel, state.fuel + 30);
    if (item === 'magnetPulse') state.magnetLeft = Math.max(state.magnetLeft, MAGNET_DURATION_SECONDS);
    items.current = { ...items.current, [item]: items.current[item] - 1 }; setRemainingItems(items.current); modelDirty.current = true; callback.current.onConsume(item); callback.current.onEvent('collect'); return true;
  }, []);
  const giveUp = useCallback(() => { if (!ended.current || !deathReason.current) return; callback.current.onGameOver(result(deathReason.current)); }, [result]);
  const revive = useCallback(() => { if (!ended.current || !deathReason.current || revives.current >= 2) return false; const state = model.current; const rocketY = height - 82; state.hp = Math.min(state.maxHp, 2); state.fuel = state.maxFuel * 0.5; state.rocketX = 0.5; state.rocketVelocity = 0; state.shieldActive = true; state.invulnerableLeft = 3; state.entities = state.entities.filter((entity) => entity.y < rocketY - 190); revives.current += 1; ended.current = false; deathReason.current = null; lastFrame.current = 0; modelDirty.current = true; publish(); return true; }, [height, publish]);

  useEffect(() => { reset(); }, [modifiers.maxFuel, modifiers.maxHp]);
  useEffect(() => {
    if (width < 100 || height < 200) return;
    let animationFrame = 0;
    const spawn = (state: GameSnapshot) => {
      const difficulty = difficultyFor(state.distance); const stage = stageFor(stageId); const itemChance = stageId === 'stage-2' ? 0.42 : 0.28; const wantItem = Math.random() < itemChance;
      let kind: EntityKind = wantItem ? itemKinds[Math.floor(Math.random() * itemKinds.length)] : obstacleKinds[Math.floor(Math.random() * obstacleKinds.length)];
      if (stageId === 'stage-2' && wantItem && Math.random() < 0.55) kind = 'crystal';
      if (stageId === 'stage-1' && !wantItem && Math.random() < 0.7) kind = 'small';
      if (stageId === 'stage-3' && !wantItem && Math.random() < 0.5) kind = 'meteor';
      const obstacle = !isItem(kind); const size = obstacle ? OBSTACLE_META[kind as ObstacleKind].size : 33; const candidates = [0.12, 0.27, 0.42, 0.58, 0.73, 0.88];
      const safe = candidates.filter((lane) => !state.entities.some((entity) => !isItem(entity.kind) && entity.y < height * 0.32 && Math.abs(entity.x - lane) < 0.16));
      const lanes = safe.length ? safe : candidates; const x = lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() - 0.5) * 0.04;
      state.entities.push({ id: nextId.current++, kind, x: clamp(x, 0.06, 0.94), y: -size, size, speed: (obstacle ? 160 + Math.random() * 72 : 125 + Math.random() * 55) * difficulty.speed * (stage?.number === 1 ? 0.78 : 1), drift: kind === 'debris' ? (Math.random() - 0.5) * 60 : kind === 'meteor' ? (Math.random() - 0.5) * 25 : 0, rotation: 0 });
    };
    const spawnRing = (state: GameSnapshot) => {
      const lanes = [0.17, 0.32, 0.5, 0.68, 0.83];
      const x = lanes[Math.floor(Math.random() * lanes.length)];
      state.entities.push({ id: nextId.current++, kind: 'ring', x, y: -62, size: 58, speed: 145 * difficultyFor(state.distance).speed, drift: 0, rotation: 0 });
    };
    const finish = (endedBy: GameResult['endedBy'], missionCompleted = false, stageCompleted = false) => { if (ended.current) return; ended.current = true; callback.current.onGameOver(result(endedBy, missionCompleted, stageCompleted)); };
    const die = (reason: 'hp' | 'fuel') => { if (ended.current) return; ended.current = true; deathReason.current = reason; callback.current.onDeath(reason); };
    const frame = (timestamp: number) => {
      if (!lastFrame.current) lastFrame.current = timestamp; const dt = clamp((timestamp - lastFrame.current) / 1000, 0, 0.05); lastFrame.current = timestamp;
      if (paused.current || ended.current) consumeDodge();
      if (!paused.current && !ended.current) {
        const state = model.current; const difficulty = difficultyFor(state.distance); const stage = stageFor(stageId); state.elapsed += dt; state.comboLeft = Math.max(0, state.comboLeft - dt); if (state.comboLeft === 0) state.combo = 0;
        const sensitivity = settings.sensitivity === 'high' ? 1.12 : settings.sensitivity === 'low' ? 0.84 : 1;
        const sensed = settings.controlMode === 'tilt' ? getTilt() : 0;
        // Tilt is mapped to a position relative to the calibrated neutral hold,
        // not an accumulated speed. Returning the phone to neutral therefore
        // makes the target the arena centre rather than leaving the ship drifting.
        const rawTilt = clamp((sensed * (settings.invertTilt ? -1 : 1)) / 0.42, -1, 1);
        const normalized = Math.abs(rawTilt) < 0.07 ? 0 : rawTilt;
        const targetX = settings.controlMode === 'touch'
          ? touchTarget.current ?? state.rocketX
          : 0.5 + normalized * 0.41 * sensitivity;
        const targetVelocity = (clamp(targetX, 0.075, 0.925) - state.rocketX) * width * 8.5 * modifiers.agilityMultiplier;
        const response = Math.min(1, dt * 9.5 * modifiers.agilityMultiplier);
        state.rocketVelocity += (targetVelocity - state.rocketVelocity) * response;
        if (Math.abs(targetX - state.rocketX) < 0.0025 && Math.abs(state.rocketVelocity) < 8) state.rocketVelocity = 0;
        const dodge = consumeDodge();
        if (settings.gyroDodge && state.dodgeCooldown <= 0 && dodge) { state.rocketX = clamp(state.rocketX + dodge * 0.19, 0.075, 0.925); state.rocketVelocity = dodge * 520; state.invulnerableLeft = Math.max(state.invulnerableLeft, 0.32); state.dodgeCooldown = GYRO_DODGE_COOLDOWN_SECONDS; callback.current.onEvent('collect'); }
        const stormPush = state.stormLeft > 0 ? Math.sin(state.elapsed * 6) * 85 : 0; state.rocketX = clamp(state.rocketX + (state.rocketVelocity + stormPush) * dt / width, 0.075, 0.925);
        const boostFactor = state.boostLeft > 0 ? 1.5 : 1; const boosting = state.boostLeft > 0; state.boostLeft = Math.max(0, state.boostLeft - dt); state.magnetLeft = Math.max(0, state.magnetLeft - dt); state.invulnerableLeft = Math.max(0, state.invulnerableLeft - dt); state.dodgeCooldown = Math.max(0, state.dodgeCooldown - dt);
        const beforeDistance = state.distance; state.distance += 22 * difficulty.speed * boostFactor * dt; state.score += (Math.floor(state.distance / 10) - Math.floor(beforeDistance / 10)) * 10;
        const baseFuelDrain = mode === 'adventure' ? 0.55 : 1;
        state.fuel = Math.max(0, state.fuel - dt * (baseFuelDrain + (boosting ? 3 * modifiers.boostFuelMultiplier : 0)));
        if (stageId === 'stage-3' && !events.current.showerStarted && state.distance >= 420) { events.current.showerStarted = true; state.showerLeft = 9; callback.current.onEvent('warning'); }
        if (stage?.requiresStorm && !events.current.stormStarted && state.distance >= 620) { events.current.stormStarted = true; state.stormLeft = 14; callback.current.onEvent('warning'); }
        if (stage?.requiresBoss && !events.current.bossStarted && state.distance >= 1700) { events.current.bossStarted = true; state.bossLeft = 22; callback.current.onEvent('warning'); }
        if (state.showerLeft > 0) state.showerLeft = Math.max(0, state.showerLeft - dt);
        if (state.stormLeft > 0) { state.stormLeft = Math.max(0, state.stormLeft - dt); if (state.stormLeft === 0) state.stormCleared = true; }
        if (state.bossLeft > 0) {
          state.bossLeft = Math.max(0, state.bossLeft - dt);
          const laserCycle = (22 - state.bossLeft) % 6;
          state.bossLaserWarning = laserCycle >= 3.2 && laserCycle < 4.2;
          state.bossLaserActive = laserCycle >= 4.2 && laserCycle < 5.1;
          // The boss fires down the centre lane after a visible warning. A quick
          // tilt (or Gyro Dodge) moves the ship clear; shields still block it.
          if (state.bossLaserActive && state.rocketX > 0.41 && state.rocketX < 0.59 && state.invulnerableLeft <= 0) {
            if (state.shieldActive) state.shieldActive = false;
            else { state.hp -= 1; callback.current.onEvent('hit'); }
            state.invulnerableLeft = 1.5;
          }
          if (state.bossLeft === 0) { state.bossCleared = true; state.bossLaserWarning = false; state.bossLaserActive = false; }
        }
        if (stage?.rings) { ringClock.current -= dt; if (ringClock.current <= 0 && state.rings < stage.rings) { spawnRing(state); ringClock.current = 2.7 + Math.random() * 0.9; } }
        if (state.fuel < state.maxFuel * 0.2 && Math.floor(state.elapsed * 1.25) !== Math.floor((state.elapsed - dt) * 1.25)) callback.current.onEvent('warning'); spawnClock.current -= dt; if (spawnClock.current <= 0) { spawn(state); if (state.showerLeft > 0) spawn(state); if (state.bossLeft > 0 && Math.random() < 0.55) spawn(state); spawnClock.current = difficulty.spawn + Math.random() * 0.32; }
        const rocketY = height - 82; const rocketXpx = state.rocketX * width; const next: GameEntity[] = [];
        for (const entity of state.entities) {
          entity.y += entity.speed * dt * boostFactor; entity.x = clamp(entity.x + entity.drift * dt / width, 0.045, 0.955); entity.rotation += (entity.kind === 'debris' ? 3.5 : 1.2) * dt; const xpx = entity.x * width; const dx = rocketXpx - xpx; const dy = rocketY - entity.y; const distance = Math.hypot(dx, dy);
          if (state.magnetLeft > 0 && isMagnetTarget(entity.kind) && distance < modifiers.magnetRadius) { entity.x += (state.rocketX - entity.x) * Math.min(1, dt * 5.5); entity.y += (rocketY - entity.y) * Math.min(1, dt * 5.5); }
          const collisionRadius = 20 + entity.size * 0.32;
          if (entity.kind === 'ring') { if (distance < 38) { state.rings += 1; state.score += 150; callback.current.onEvent('collect'); continue; } if (entity.y < height + 90) next.push(entity); continue; }
          if (distance < collisionRadius) {
            if (isItem(entity.kind)) { if (entity.kind === 'fuel') { state.fuel = Math.min(state.maxFuel, state.fuel + 25 * modifiers.fuelCellMultiplier); state.fuelCells += 1; } if (entity.kind === 'crystal') { state.crystals += 1; state.score += 100; } if (entity.kind === 'coin') { state.coins += Math.round(10 * modifiers.coinMultiplier); state.score += 50; } if (entity.kind === 'repair') state.hp = Math.min(state.maxHp, state.hp + 1); if (entity.kind === 'shield') state.shieldCharges += 1; if (entity.kind === 'boost') state.boostCharges += 1; if (entity.kind === 'magnet') state.magnetLeft = MAGNET_DURATION_SECONDS; callback.current.onEvent('collect'); continue; }
            if (state.shieldActive) { state.shieldActive = false; callback.current.onEvent('collect'); continue; } if (state.invulnerableLeft <= 0) { state.hp -= 1; state.invulnerableLeft = 1.5; callback.current.onEvent('hit'); } continue;
          }
          if (!isItem(entity.kind) && !entity.nearMissed && entity.y > rocketY - 14 && entity.y < rocketY + 40 && distance < collisionRadius + 35) { entity.nearMissed = true; state.combo = Math.min(8, state.combo + 1); state.comboLeft = modifiers.comboWindow; state.score += 25 * state.combo; }
          if (entity.y < height + 90) next.push(entity); else if (!isItem(entity.kind)) state.asteroidsDodged += 1;
        }
        state.entities = next;
        const mission = MISSION_DEFINITIONS.find((definition) => definition.id === missionId); if (mode === 'mission' && mission) { const value = mission.metric === 'distance' ? state.distance : mission.metric === 'crystals' ? state.crystals : mission.metric === 'shields' ? shieldsUsed.current : mission.metric === 'dodged' ? state.asteroidsDodged : state.elapsed; if (value >= mission.target) finish('mission', true); }
        if (mode === 'adventure' && stage && state.distance >= stage.target && (!stage.crystals || state.crystals >= stage.crystals) && (!stage.dodged || state.asteroidsDodged >= stage.dodged) && (!stage.rings || state.rings >= stage.rings) && (!stage.requiresStorm || state.stormCleared) && (!stage.requiresBoss || state.bossCleared)) finish('stage', false, true);
        if (state.hp <= 0) die('hp'); else if (state.fuel <= 0) die('fuel'); modelDirty.current = true;
      }
      publish();
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [consumeDodge, getTilt, height, missionId, mode, modifiers.agilityMultiplier, modifiers.boostFuelMultiplier, modifiers.comboWindow, modifiers.fuelCellMultiplier, modifiers.magnetRadius, result, settings.controlMode, settings.gyroDodge, settings.invertTilt, settings.sensitivity, stageId, width, publish]);
  return { snapshot, isPaused, remainingItems, setPaused, reset, activateShield, activateBoost, setTouchX, useConsumable, giveUp, revive };
}
