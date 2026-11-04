import type { ConsumableId, DailyChallenge, GameModifiers, GameSnapshot, ItemKind, ObstacleKind, RocketId, Settings, UpgradeId } from '@/types/game';

export const COLORS = { cyan: '#57e9ff', blue: '#3677ff', purple: '#a95dff', pink: '#ff5dd6', yellow: '#ffe15a', panel: 'rgba(20, 28, 91, 0.86)', ink: '#edf5ff', danger: '#ff5171' };

export const DEFAULT_SETTINGS: Settings = { soundEffects: true, backgroundMusic: true, vibration: true, sensitivity: 'medium', invertTilt: false, controlMode: 'tilt', calibration: 0, gyroDodge: true, reducedEffects: false };
export const EMPTY_SNAPSHOT: GameSnapshot = { entities: [], rocketX: 0.5, rocketVelocity: 0, hp: 3, maxHp: 3, fuel: 100, maxFuel: 100, score: 0, distance: 0, crystals: 0, coins: 0, fuelCells: 0, asteroidsDodged: 0, shieldCharges: 0, boostCharges: 0, shieldActive: false, boostLeft: 0, magnetLeft: 0, combo: 0, comboLeft: 0, elapsed: 0, invulnerableLeft: 0, rings: 0, stormLeft: 0, stormCleared: false, showerLeft: 0, bossLeft: 0, bossCleared: false, bossLaserWarning: false, bossLaserActive: false, dodgeCooldown: 0 };

export const OBSTACLE_META: Record<ObstacleKind, { emoji: string; label: string; size: number }> = { small: { emoji: '🪨', label: 'Small Asteroid', size: 34 }, giant: { emoji: '🌑', label: 'Giant Asteroid', size: 68 }, meteor: { emoji: '☄️', label: 'Fire Meteor', size: 48 }, debris: { emoji: '🛰️', label: 'Space Debris', size: 42 } };
export const ITEM_META: Record<ItemKind, { emoji: string; label: string; color: string }> = { fuel: { emoji: '🔋', label: 'Fuel Cell +25%', color: '#ffe15a' }, crystal: { emoji: '💎', label: 'Crystal +100', color: '#55ecff' }, coin: { emoji: '🟡', label: 'Coin +50', color: '#ffda4d' }, repair: { emoji: '❤️‍🩹', label: 'Repair +1 HP', color: '#ff719d' }, shield: { emoji: '🛡️', label: 'Shield', color: '#58dcff' }, boost: { emoji: '⚡', label: 'Speed Boost', color: '#c875ff' }, magnet: { emoji: '🧲', label: 'Magnet', color: '#ff82df' } };

export const ROCKET_DEFINITIONS: Record<RocketId, { id: RocketId; name: string; emoji: string; tint: string; price?: number; unlockStage?: string; ability: string; description: string }> = {
  classic: { id: 'classic', name: 'RX-01 CLASSIC', emoji: '🚀', tint: '#57e9ff', ability: 'STANDARD', description: 'Balanced controls and standard fuel use.' },
  'pink-comet': { id: 'pink-comet', name: 'PINK COMET', emoji: '🚀', tint: '#ff75cf', price: 500, ability: 'COIN BOOST', description: '+20% coins from coin pickups.' },
  'cyber-bolt': { id: 'cyber-bolt', name: 'CYBER BOLT', emoji: '🚀', tint: '#77b6ff', price: 800, ability: 'AGILITY BOOST', description: '+12% lateral control speed.' },
  'solar-flame': { id: 'solar-flame', name: 'SOLAR FLAME', emoji: '🚀', tint: '#ffba52', price: 1200, ability: 'FUEL SAVER', description: 'Boost extra fuel drain reduced by 20%.' },
  'galaxy-phantom': { id: 'galaxy-phantom', name: 'GALAXY PHANTOM', emoji: '🚀', tint: '#bf8dff', price: 1800, ability: 'COMBO EXTENDER', description: 'Near-miss combo window +1 second.' },
  'golden-star': { id: 'golden-star', name: 'GOLDEN STAR', emoji: '🚀', tint: '#ffe15a', price: 2500, ability: 'STARTER SHIELD', description: 'Start every flight with one free shield.' },
  'nebula-guardian': { id: 'nebula-guardian', name: 'NEBULA GUARDIAN', emoji: '🚀', tint: '#73ffe1', unlockStage: 'stage-6', ability: 'ENERGY RECOVERY', description: 'Fuel Cells restore 10% more fuel.' },
};

export const UPGRADE_DEFINITIONS: Record<UpgradeId, { id: UpgradeId; name: string; icon: string; description: string; prices: [number, number]; values: [string, string] }> = {
  hull: { id: 'hull', name: 'REINFORCED HULL', icon: '♥', description: 'Raises maximum hull integrity.', prices: [600, 1100], values: ['+1 Max HP', '+2 Max HP'] },
  fuelTank: { id: 'fuelTank', name: 'FUEL TANK', icon: '⛽', description: 'Raises maximum fuel capacity.', prices: [350, 700], values: ['+20 Max Fuel', '+40 Max Fuel'] },
  thruster: { id: 'thruster', name: 'THRUSTER', icon: '➜', description: 'Improves every rocket’s agility.', prices: [450, 900], values: ['+8% agility', '+16% agility'] },
  magnetCore: { id: 'magnetCore', name: 'MAGNET CORE', icon: '🧲', description: 'Extends pickup attraction radius.', prices: [300, 650], values: ['+15% radius', '+30% radius'] },
  boostPower: { id: 'boostPower', name: 'BOOST POWER', icon: '⚡', description: 'Extends boost duration.', prices: [400, 850], values: ['+1 second', '+2 seconds'] },
};

export const CONSUMABLE_DEFINITIONS: Record<ConsumableId, { id: ConsumableId; name: string; icon: string; price: number; description: string }> = {
  repairKit: { id: 'repairKit', name: 'REPAIR KIT', icon: '❤️‍🩹', price: 150, description: 'Restore 1 HP when damaged.' },
  shieldBattery: { id: 'shieldBattery', name: 'SHIELD BATTERY', icon: '🛡️', price: 200, description: 'Activate one collision shield.' },
  emergencyFuel: { id: 'emergencyFuel', name: 'EMERGENCY FUEL', icon: '🔋', price: 120, description: 'Restore 30 fuel when not full.' },
  magnetPulse: { id: 'magnetPulse', name: 'MAGNET PULSE', icon: '🧲', price: 180, description: 'Attract coins and crystals for 8 seconds.' },
};

export interface StageDefinition { id: string; number: number; name: string; theme: string; objective: string; target: number; metric: 'distance'; crystals?: number; dodged?: number; rings?: number; requiresStorm?: boolean; requiresBoss?: boolean; reward: number; }
export const STAGES: StageDefinition[] = [
  { id: 'stage-1', number: 1, name: 'EARTH ORBIT', theme: 'earth', objective: 'Reach 500 m', target: 500, metric: 'distance', reward: 100 },
  { id: 'stage-2', number: 2, name: 'CRYSTAL BELT', theme: 'crystal', objective: 'Reach 800 m and collect 5 Crystals', target: 800, metric: 'distance', crystals: 5, reward: 150 },
  { id: 'stage-3', number: 3, name: 'MARS DANGER ZONE', theme: 'mars', objective: 'Reach 1,200 m and dodge 15 asteroids', target: 1200, metric: 'distance', dodged: 15, reward: 200 },
  { id: 'stage-4', number: 4, name: 'COSMIC STORM', theme: 'storm', objective: 'Reach 1,600 m and survive the Cosmic Storm', target: 1600, metric: 'distance', requiresStorm: true, reward: 250 },
  { id: 'stage-5', number: 5, name: 'GALAXY PORTAL', theme: 'portal', objective: 'Reach 2,200 m and pass 5 Energy Rings', target: 2200, metric: 'distance', rings: 5, reward: 350 },
  { id: 'stage-6', number: 6, name: 'FINAL ESCAPE', theme: 'final', objective: 'Reach 3,000 m and survive the Asteroid Boss', target: 3000, metric: 'distance', requiresBoss: true, reward: 500 },
];

export function stageFor(id?: string) { return STAGES.find((stage) => stage.id === id); }

export function getModifiers(rocketId: RocketId, upgrades: { hull: number; fuelTank: number; thruster: number; magnetCore: number; boostPower: number }): GameModifiers {
  const boost = rocketId === 'cyber-bolt' ? 1.12 : 1;
  return { maxHp: 3 + upgrades.hull, maxFuel: 100 + upgrades.fuelTank * 20, agilityMultiplier: (1 + upgrades.thruster * 0.08) * boost, boostFuelMultiplier: rocketId === 'solar-flame' ? 0.8 : 1, magnetRadius: 150 * (1 + upgrades.magnetCore * 0.15), boostDuration: 5 + upgrades.boostPower, starterShield: rocketId === 'golden-star', coinMultiplier: rocketId === 'pink-comet' ? 1.2 : 1, comboWindow: rocketId === 'galaxy-phantom' ? 2.5 : 1.5, fuelCellMultiplier: rocketId === 'nebula-guardian' ? 1.1 : 1, rocketEmoji: ROCKET_DEFINITIONS[rocketId].emoji, rocketTint: ROCKET_DEFINITIONS[rocketId].tint };
}

export function difficultyFor(distance: number) { if (distance >= 3000) return { name: 'SURVIVAL', speed: 1.85, spawn: 0.35 }; if (distance >= 2000) return { name: 'EXTREME', speed: 1.55, spawn: 0.46 }; if (distance >= 1000) return { name: 'HARD', speed: 1.3, spawn: 0.58 }; if (distance >= 500) return { name: 'NORMAL', speed: 1.12, spawn: 0.7 }; return { name: 'EASY', speed: 0.95, spawn: 0.85 }; }

export const MISSION_DEFINITIONS = [
  { id: 'travel-3000', title: 'Deep Space Run', description: 'Travel 3,000 meters', target: 3000, reward: 200, icon: '🚀', metric: 'distance' },
  { id: 'crystals-30', title: 'Crystal Hunter', description: 'Collect 30 Crystals', target: 30, reward: 150, icon: '💎', metric: 'crystals' },
  { id: 'shield-5', title: 'Safety First', description: 'Use Shield 5 times', target: 5, reward: 100, icon: '🛡️', metric: 'shields' },
  { id: 'dodge-100', title: 'Ace Pilot', description: 'Dodge 100 Asteroids', target: 100, reward: 175, icon: '🎯', metric: 'dodged' },
  { id: 'survive-300', title: 'Long Haul', description: 'Survive for 5 minutes', target: 300, reward: 250, icon: '⏱️', metric: 'survival' },
] as const;

const dailyTemplates: Omit<DailyChallenge, 'id' | 'value' | 'claimed'>[] = [
  { title: 'Crystal Hunter', metric: 'crystals', target: 20, reward: 150, icon: '💎' }, { title: 'Space Traveler', metric: 'distance', target: 2000, reward: 200, icon: '🚀' }, { title: 'Asteroid Dodger', metric: 'dodged', target: 30, reward: 150, icon: '☄️' }, { title: 'Space Survivor', metric: 'survival', target: 180, reward: 200, icon: '⏱️' }, { title: 'Fuel Collector', metric: 'fuelCells', target: 10, reward: 100, icon: '🔋' }, { title: 'Coin Collector', metric: 'coins', target: 50, reward: 150, icon: '🟡' }, { title: 'Shield Master', metric: 'shields', target: 5, reward: 100, icon: '🛡️' }, { title: 'Boost Expert', metric: 'boosts', target: 5, reward: 100, icon: '⚡' },
];

export function localDateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
/** A local, Monday-starting week key that does not depend on UTC conversion. */
export function localWeekKey(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return localDateKey(monday);
}
export function dailyChallengesFor(date = localDateKey()) {
  const seed = [...date].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
  return [0, 1, 2].map((offset) => { const template = dailyTemplates[(seed + offset * 3) % dailyTemplates.length]; return { ...template, id: `${date}-${template.metric}-${offset}`, value: 0, claimed: false }; });
}
