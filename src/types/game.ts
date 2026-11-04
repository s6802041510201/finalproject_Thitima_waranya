export type ControlMode = 'tilt' | 'touch';
export type Sensitivity = 'low' | 'medium' | 'high';
export type GameMode = 'endless' | 'mission' | 'adventure';
export type ScreenName =
  | 'splash' | 'main' | 'mode' | 'tutorial' | 'game' | 'missions' | 'leaderboard' | 'settings'
  | 'gameover' | 'stageclear' | 'garage' | 'upgrades' | 'shop' | 'inventory' | 'stages' | 'daily' | 'profile';

export type ItemKind = 'fuel' | 'crystal' | 'coin' | 'repair' | 'shield' | 'boost' | 'magnet';
export type ObstacleKind = 'small' | 'giant' | 'meteor' | 'debris';
export type SpecialKind = 'ring';
export type EntityKind = ItemKind | ObstacleKind | SpecialKind;
export type RocketId = 'classic' | 'pink-comet' | 'cyber-bolt' | 'solar-flame' | 'galaxy-phantom' | 'golden-star' | 'nebula-guardian';
export type UpgradeId = 'hull' | 'fuelTank' | 'thruster' | 'magnetCore' | 'boostPower';
export type ConsumableId = 'repairKit' | 'shieldBattery' | 'emergencyFuel' | 'magnetPulse';
export type DailyMetric = 'distance' | 'crystals' | 'dodged' | 'survival' | 'fuelCells' | 'coins' | 'shields' | 'boosts';

export interface GameEntity {
  id: number; kind: EntityKind; x: number; y: number; size: number; speed: number; drift: number; rotation: number; nearMissed?: boolean;
}

export interface GameModifiers {
  maxHp: number; maxFuel: number; agilityMultiplier: number; boostFuelMultiplier: number; magnetRadius: number;
  boostDuration: number; starterShield: boolean; coinMultiplier: number; comboWindow: number; fuelCellMultiplier: number;
  rocketEmoji: string; rocketTint: string;
}

export interface GameSnapshot {
  entities: GameEntity[]; rocketX: number; rocketVelocity: number; hp: number; maxHp: number; fuel: number; maxFuel: number;
  score: number; distance: number; crystals: number; coins: number; fuelCells: number; asteroidsDodged: number;
  shieldCharges: number; boostCharges: number; shieldActive: boolean; boostLeft: number; magnetLeft: number;
  combo: number; comboLeft: number; elapsed: number; invulnerableLeft: number;
  rings: number; stormLeft: number; stormCleared: boolean; showerLeft: number;
  bossLeft: number; bossCleared: boolean; bossLaserWarning: boolean; bossLaserActive: boolean; dodgeCooldown: number;
}

export interface GameResult {
  score: number; distance: number; crystals: number; coins: number; fuelCells: number; asteroidsDodged: number;
  shieldsUsed: number; boostsUsed: number; survivalTime: number; remainingHp: number; maxHp: number; mode: GameMode; missionId?: string; stageId?: string;
  missionCompleted?: boolean; stageCompleted?: boolean; stageFirstClearReward?: number; revivesUsed: number; endedBy: 'hp' | 'fuel' | 'mission' | 'stage';
}

export interface Settings {
  soundEffects: boolean; backgroundMusic: boolean; vibration: boolean; sensitivity: Sensitivity; invertTilt: boolean;
  controlMode: ControlMode; calibration: number; gyroDodge: boolean; reducedEffects: boolean;
}

export interface GameRecord extends GameResult { id: string; playedAt: string; }
export interface MissionProgress { missionId: string; value: number; claimed: boolean; }
export interface UpgradeLevels { hull: number; fuelTank: number; thruster: number; magnetCore: number; boostPower: number; }
export type Inventory = Record<ConsumableId, number>;
export interface StageProgress { stageId: string; unlocked: boolean; cleared: boolean; bestStars: number; rewardClaimed: boolean; }
export interface DailyChallenge { id: string; title: string; metric: DailyMetric; target: number; reward: number; icon: string; value: number; claimed: boolean; }
export interface DailyState { date: string; challenges: DailyChallenge[]; }

export interface StoredProfile {
  schemaVersion: number;
  settings: Settings;
  records: GameRecord[];
  /** Local Monday date for the current weekly mission cycle. */
  missionsWeek: string;
  missions: MissionProgress[];
  totalCoins: number;
  /** Lifetime coins collected, separate from the spendable coin balance. */
  totalCoinsCollected: number;
  bestScore: number;
  bestDistance: number;
  /** Lifetime crystal count, retained for backward compatibility and stats. */
  totalCrystals: number;
  /** Spendable revive currency. Crystals collected during a run become diamonds. */
  diamonds: number;
  totalGames: number; totalShieldsUsed: number; totalAsteroidsDodged: number; longestSurvival: number; totalDistance: number; totalRevivesUsed: number;
  ownedRockets: RocketId[]; equippedRocket: RocketId; upgrades: UpgradeLevels; inventory: Inventory; loadout: ConsumableId[];
  stages: StageProgress[]; daily: DailyState | null;
}
