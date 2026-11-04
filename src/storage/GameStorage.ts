import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONSUMABLE_DEFINITIONS, dailyChallengesFor, DEFAULT_SETTINGS, localDateKey, localWeekKey, MISSION_DEFINITIONS, ROCKET_DEFINITIONS, STAGES, UPGRADE_DEFINITIONS } from '@/game/config/game';
import type { ConsumableId, DailyChallenge, GameRecord, Inventory, MissionProgress, RocketId, Settings, StageProgress, StoredProfile, UpgradeId, UpgradeLevels } from '@/types/game';

const KEY = '@rocket-rush/profile-v2';
const LEGACY_KEY = '@rocket-rush/profile-v1';
const ACCOUNT_KEY_PREFIX = '@rocket-rush/account/';
let activeKey = KEY;
let activeUid: string | null = null;
const emptyUpgrades = (): UpgradeLevels => ({ hull: 0, fuelTank: 0, thruster: 0, magnetCore: 0, boostPower: 0 });
const emptyInventory = (): Inventory => ({ repairKit: 0, shieldBattery: 0, emergencyFuel: 0, magnetPulse: 0 });
const initialStages = (): StageProgress[] => STAGES.map((stage, index) => ({ stageId: stage.id, unlocked: index === 0, cleared: false, bestStars: 0, rewardClaimed: false }));

export const createInitialProfile = (): StoredProfile => ({ schemaVersion: 3, settings: DEFAULT_SETTINGS, records: [], missionsWeek: localWeekKey(), missions: [], totalCoins: 0, totalCoinsCollected: 0, bestScore: 0, bestDistance: 0, totalCrystals: 0, diamonds: 0, totalGames: 0, totalShieldsUsed: 0, totalAsteroidsDodged: 0, longestSurvival: 0, totalDistance: 0, totalRevivesUsed: 0, ownedRockets: ['classic'], equippedRocket: 'classic', upgrades: emptyUpgrades(), inventory: emptyInventory(), loadout: [], stages: initialStages(), daily: { date: localDateKey(), challenges: dailyChallengesFor() } });
const stageState = (stored: StageProgress[] | undefined) => initialStages().map((stage) => ({ ...stage, ...stored?.find((item) => item.stageId === stage.stageId) }));
const dailyForToday = (daily: StoredProfile['daily']) => daily?.date === localDateKey() ? daily : { date: localDateKey(), challenges: dailyChallengesFor() };
const weeklyForCurrent = (profile: StoredProfile): StoredProfile => profile.missionsWeek === localWeekKey() ? profile : { ...profile, missionsWeek: localWeekKey(), missions: [] };

export function normalizeStoredProfile(raw: Partial<StoredProfile>): StoredProfile {
  const base = createInitialProfile();
  const diamonds = typeof raw.diamonds === 'number' ? raw.diamonds : raw.totalCrystals ?? 0;
  const missionsWeek = raw.missionsWeek ?? localWeekKey();
  const records = raw.records ?? [];
  return { ...base, ...raw, schemaVersion: 3, records, bestScore: Math.max(raw.bestScore ?? 0, ...records.map((record) => record.score)), bestDistance: Math.max(raw.bestDistance ?? 0, ...records.map((record) => record.distance)), totalCoinsCollected: raw.totalCoinsCollected ?? 0, missionsWeek: localWeekKey(), missions: missionsWeek === localWeekKey() ? raw.missions ?? [] : [], settings: { ...DEFAULT_SETTINGS, ...raw.settings }, diamonds, upgrades: { ...emptyUpgrades(), ...raw.upgrades }, inventory: { ...emptyInventory(), ...raw.inventory }, ownedRockets: raw.ownedRockets?.length ? raw.ownedRockets : ['classic'], equippedRocket: raw.equippedRocket && (raw.ownedRockets ?? ['classic']).includes(raw.equippedRocket) ? raw.equippedRocket : 'classic', loadout: (raw.loadout ?? []).slice(0, 3), stages: stageState(raw.stages), daily: dailyForToday(raw.daily ?? null) };
}

export const GameStorage = {
  createInitialProfile,
  /** Selects an isolated local save for a signed-in account, or the legacy guest save. */
  setAccountScope(uid: string | null) { activeUid = uid; activeKey = uid ? `${ACCOUNT_KEY_PREFIX}${uid}/profile-v2` : KEY; },
  async getCloudRevision(uid: string) {
    const raw = await AsyncStorage.getItem(`${ACCOUNT_KEY_PREFIX}${uid}/cloud-revision`);
    return Math.max(0, Number(raw) || 0);
  },
  async setCloudRevision(uid: string, revision: number) {
    await AsyncStorage.setItem(`${ACCOUNT_KEY_PREFIX}${uid}/cloud-revision`, String(Math.max(0, revision)));
  },
  async getCloudDirty(uid: string) {
    return (await AsyncStorage.getItem(`${ACCOUNT_KEY_PREFIX}${uid}/cloud-dirty`)) === '1';
  },
  async setCloudDirty(uid: string, dirty: boolean) {
    await AsyncStorage.setItem(`${ACCOUNT_KEY_PREFIX}${uid}/cloud-dirty`, dirty ? '1' : '0');
  },
  async hasSavedProfile(): Promise<boolean> {
    return (await AsyncStorage.getItem(activeKey)) !== null || (activeKey === KEY && (await AsyncStorage.getItem(LEGACY_KEY)) !== null);
  },
  normalize: normalizeStoredProfile,
  async load(): Promise<StoredProfile> {
    try {
      const raw = await AsyncStorage.getItem(activeKey) ?? (activeKey === KEY ? await AsyncStorage.getItem(LEGACY_KEY) : null);
      const profile = raw ? normalizeStoredProfile(JSON.parse(raw) as Partial<StoredProfile>) : createInitialProfile();
      await AsyncStorage.setItem(activeKey, JSON.stringify(profile));
      return profile;
    } catch { return createInitialProfile(); }
  },
  async save(profile: StoredProfile, options: { dirty?: boolean } = {}) {
    await AsyncStorage.setItem(activeKey, JSON.stringify(profile));
    if (activeUid && options.dirty !== false) await this.setCloudDirty(activeUid, true);
  },
  async refreshWeekly(profile: StoredProfile) { const next = weeklyForCurrent(profile); if (next !== profile) await this.save(next); return next; },
  async updateSettings(profile: StoredProfile, settings: Settings) { const next = { ...profile, settings }; await this.save(next); return next; },
  createRecord(result: Omit<GameRecord, 'id' | 'playedAt'>): GameRecord { return { ...result, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, playedAt: new Date().toISOString() }; },
  missionValue(profile: StoredProfile, id: string) { return profile.missionsWeek === localWeekKey() ? profile.missions.find((mission) => mission.missionId === id)?.value ?? 0 : 0; },
  isClaimed(profile: StoredProfile, id: string) { return profile.missionsWeek === localWeekKey() && (profile.missions.find((mission) => mission.missionId === id)?.claimed ?? false); },
  async claimMission(profile: StoredProfile, id: string, reward: number) {
    const currentProfile = weeklyForCurrent(profile); const existing = currentProfile.missions.find((mission) => mission.missionId === id);
    if (existing?.claimed) return currentProfile;
    const missions: MissionProgress[] = existing ? currentProfile.missions.map((mission) => mission.missionId === id ? { ...mission, claimed: true } : mission) : [...currentProfile.missions, { missionId: id, value: 0, claimed: true }];
    const next = { ...currentProfile, missions, totalCoins: currentProfile.totalCoins + reward }; await this.save(next); return next;
  },
  async purchaseRocket(profile: StoredProfile, id: RocketId) {
    const rocket = ROCKET_DEFINITIONS[id];
    if (profile.ownedRockets.includes(id) || !rocket.price || profile.totalCoins < rocket.price) return null;
    const next = { ...profile, totalCoins: profile.totalCoins - rocket.price, ownedRockets: [...profile.ownedRockets, id] }; await this.save(next); return next;
  },
  async equipRocket(profile: StoredProfile, id: RocketId) { if (!profile.ownedRockets.includes(id)) return null; const next = { ...profile, equippedRocket: id }; await this.save(next); return next; },
  async buyUpgrade(profile: StoredProfile, id: UpgradeId) {
    const level = profile.upgrades[id]; const definition = UPGRADE_DEFINITIONS[id]; const price = definition.prices[level];
    if (level >= 2 || price === undefined || profile.totalCoins < price) return null;
    const next = { ...profile, totalCoins: profile.totalCoins - price, upgrades: { ...profile.upgrades, [id]: level + 1 } }; await this.save(next); return next;
  },
  async buyConsumable(profile: StoredProfile, id: ConsumableId) {
    const price = CONSUMABLE_DEFINITIONS[id].price; if (profile.totalCoins < price) return null;
    const next = { ...profile, totalCoins: profile.totalCoins - price, inventory: { ...profile.inventory, [id]: profile.inventory[id] + 1 } }; await this.save(next); return next;
  },
  async setLoadout(profile: StoredProfile, loadout: ConsumableId[]) {
    const unique = loadout.filter((item, index) => loadout.indexOf(item) === index && profile.inventory[item] > 0).slice(0, 3);
    const next = { ...profile, loadout: unique }; await this.save(next); return next;
  },
  async consume(profile: StoredProfile, id: ConsumableId) {
    if (profile.inventory[id] <= 0) return null;
    const next = { ...profile, inventory: { ...profile.inventory, [id]: profile.inventory[id] - 1 }, loadout: profile.loadout.filter((item) => item !== id || profile.inventory[id] > 1) }; await this.save(next); return next;
  },
  async spendDiamonds(profile: StoredProfile, amount: number) {
    if (amount < 1 || profile.diamonds < amount) return null;
    const next = { ...profile, diamonds: profile.diamonds - amount, totalRevivesUsed: profile.totalRevivesUsed + 1 }; await this.save(next); return next;
  },
  async completeStage(profile: StoredProfile, stageId: string, hp: number, maxHp: number, revivesUsed: number) {
    const stage = STAGES.find((item) => item.id === stageId); if (!stage) return profile;
    const current = profile.stages.find((item) => item.stageId === stageId); if (!current) return profile;
    const stars = Math.min(revivesUsed > 0 ? 2 : 3, hp >= maxHp ? 3 : hp >= 2 ? 2 : 1);
    const firstClear = !current.rewardClaimed;
    const stages = profile.stages.map((item, index) => item.stageId === stageId ? { ...item, cleared: true, rewardClaimed: true, bestStars: Math.max(item.bestStars, stars) } : index === stage.number ? { ...item, unlocked: true } : item);
    const ownedRockets = stageId === 'stage-6' && !profile.ownedRockets.includes('nebula-guardian') ? [...profile.ownedRockets, 'nebula-guardian' as RocketId] : profile.ownedRockets;
    const next = { ...profile, stages, ownedRockets, totalCoins: profile.totalCoins + (firstClear ? stage.reward : 0) }; await this.save(next); return next;
  },
  async claimDaily(profile: StoredProfile, id: string) {
    const daily = dailyForToday(profile.daily); const challenge = daily.challenges.find((item) => item.id === id);
    if (!challenge || challenge.claimed || challenge.value < challenge.target) return null;
    const challenges: DailyChallenge[] = daily.challenges.map((item) => item.id === id ? { ...item, claimed: true } : item);
    const next = { ...profile, totalCoins: profile.totalCoins + challenge.reward, daily: { ...daily, challenges } }; await this.save(next); return next;
  },
  async recordGame(profile: StoredProfile, record: GameRecord) {
    const currentProfile = weeklyForCurrent(profile);
    const metricValue: Record<string, number> = { distance: record.distance, crystals: record.crystals, shields: record.shieldsUsed, dodged: record.asteroidsDodged, survival: record.survivalTime };
    const missions = MISSION_DEFINITIONS.map((definition) => { const current = currentProfile.missions.find((mission) => mission.missionId === definition.id); return { missionId: definition.id, value: (current?.value ?? 0) + metricValue[definition.metric], claimed: current?.claimed ?? false }; });
    const daily = dailyForToday(currentProfile.daily);
    const dailyMetrics: Record<string, number> = { distance: record.distance, crystals: record.crystals, dodged: record.asteroidsDodged, survival: record.survivalTime, fuelCells: record.fuelCells, coins: record.coins, shields: record.shieldsUsed, boosts: record.boostsUsed };
    const challenges = daily.challenges.map((challenge) => ({ ...challenge, value: challenge.value + dailyMetrics[challenge.metric] }));
    const next: StoredProfile = { ...currentProfile, records: [record, ...currentProfile.records].slice(0, 30), bestScore: Math.max(currentProfile.bestScore, record.score), bestDistance: Math.max(currentProfile.bestDistance, record.distance), missions, daily: { ...daily, challenges }, totalCoins: currentProfile.totalCoins + record.coins, totalCoinsCollected: currentProfile.totalCoinsCollected + record.coins, totalCrystals: currentProfile.totalCrystals + record.crystals, diamonds: currentProfile.diamonds + record.crystals, totalGames: currentProfile.totalGames + 1, totalShieldsUsed: currentProfile.totalShieldsUsed + record.shieldsUsed, totalAsteroidsDodged: currentProfile.totalAsteroidsDodged + record.asteroidsDodged, longestSurvival: Math.max(currentProfile.longestSurvival, record.survivalTime), totalDistance: currentProfile.totalDistance + record.distance };
    await this.save(next); return next;
  },
};
