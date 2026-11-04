import {
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type Transaction,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { StoredProfile } from '@/types/game';
import { GameStorage } from '@/storage/GameStorage';
import { db } from './firebaseConfig';

export class CloudSyncConflictError extends Error {
  constructor(readonly cloudRevision: number) {
    super('The cloud save changed on another device.');
    this.name = 'CloudSyncConflictError';
  }
}

export function cloudLoadErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code).split('/').pop() : '';
  if (code === 'permission-denied') return 'Firestore denied access to this save. In Firebase Console, publish firestore.rules under Firestore Database → Rules, then retry.';
  if (code === 'failed-precondition' || code === 'not-found') return 'The Firestore database is not ready yet. Create a database in Firebase Console → Firestore Database, then retry.';
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network-request-failed') return 'Could not reach Firestore. Check the phone’s internet connection and retry.';
  if (code === 'unauthenticated') return 'Your sign-in session expired. Log out and sign in again.';
  return 'Could not load this account’s cloud save. Check that Firestore exists and firestore.rules has been published, then retry.';
}

function requireDb() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

const userDocument = (uid: string) => doc(requireDb(), 'users', uid);
type CloudSnapshot = { profile: StoredProfile; revision: number } | null;

function cleanRecords(records: StoredProfile['records']): Record<string, unknown>[] {
  return records.map((record) => Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ));
}

/** Reads the four versioned documents in one Firestore transaction. */
export async function loadCloudProfile(uid: string): Promise<CloudSnapshot> {
  const firestore = requireDb();
  const [user, inventory, progress, statistics] = await runTransaction(firestore, async (transaction: Transaction) => {
    const userRef = doc(firestore, 'users', uid);
    const [userSnap, inventorySnap, progressSnap, statisticsSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(doc(firestore, 'users', uid, 'inventory', 'default')),
      transaction.get(doc(firestore, 'users', uid, 'progress', 'default')),
      transaction.get(doc(firestore, 'users', uid, 'statistics', 'default')),
    ]);
    return [userSnap, inventorySnap, progressSnap, statisticsSnap] as const;
  });

  if (!user.exists() && !inventory.exists() && !progress.exists() && !statistics.exists()) return null;
  const account = (user.data() ?? {}) as DocumentData;
  const inventoryData = (inventory.data() ?? {}) as DocumentData;
  const progressData = (progress.data() ?? {}) as DocumentData;
  const statisticsData = (statistics.data() ?? {}) as DocumentData;
  const revision = Math.max(0, Number(account.revision) || 0);
  const profile = GameStorage.normalize({
    schemaVersion: 3,
    settings: account.settings,
    totalCoins: account.totalCoins,
    diamonds: account.diamonds,
    equippedRocket: account.selectedRocket,
    missionsWeek: progressData.missionsWeek,
    ownedRockets: inventoryData.ownedRockets,
    upgrades: inventoryData.upgrades,
    inventory: inventoryData.inventory,
    loadout: inventoryData.loadout,
    stages: progressData.stages,
    missions: progressData.missions,
    daily: progressData.daily,
    records: statisticsData.records,
    totalCoinsCollected: statisticsData.totalCoinsCollected,
    bestScore: statisticsData.bestScore,
    bestDistance: statisticsData.bestDistance,
    totalCrystals: statisticsData.totalCrystalsCollected,
    totalGames: statisticsData.totalFlights,
    totalShieldsUsed: statisticsData.totalShieldsUsed,
    totalAsteroidsDodged: statisticsData.totalAsteroidsDodged,
    longestSurvival: statisticsData.longestSurvival,
    totalDistance: statisticsData.totalDistance,
    totalRevivesUsed: statisticsData.totalRevivesUsed,
  } as Partial<StoredProfile>);
  return { profile, revision };
}

/** Saves all parts of a profile atomically and refuses to overwrite a newer revision. */
export async function saveCloudProfile(
  user: Pick<User, 'uid' | 'email' | 'displayName'>,
  profile: StoredProfile,
  expectedRevision: number,
): Promise<number> {
  const firestore = requireDb();
  return runTransaction(firestore, async (transaction) => {
    const userRef = doc(firestore, 'users', user.uid);
    const current = await transaction.get(userRef);
    const currentData = current.data();
    const currentRevision = Math.max(0, Number(currentData?.revision) || 0);
    if (current.exists() && currentRevision !== expectedRevision) {
      throw new CloudSyncConflictError(currentRevision);
    }
    if (!current.exists() && expectedRevision !== 0) throw new CloudSyncConflictError(0);
    const revision = currentRevision + 1;
    const stamp = serverTimestamp();
    const username = user.displayName?.trim() || (typeof currentData?.username === 'string' ? currentData.username : 'Rocket Pilot');

    transaction.set(userRef, {
      uid: user.uid,
      username,
      email: user.email ?? '',
      totalCoins: profile.totalCoins,
      diamonds: profile.diamonds,
      selectedRocket: profile.equippedRocket,
      settings: profile.settings,
      revision,
      createdAt: currentData?.createdAt ?? stamp,
      updatedAt: stamp,
      lastLoginAt: currentData?.lastLoginAt ?? stamp,
    });
    transaction.set(doc(firestore, 'users', user.uid, 'inventory', 'default'), {
      ownedRockets: profile.ownedRockets,
      upgrades: profile.upgrades,
      inventory: profile.inventory,
      loadout: profile.loadout,
      revision,
      updatedAt: stamp,
    });
    transaction.set(doc(firestore, 'users', user.uid, 'progress', 'default'), {
      stages: profile.stages,
      missions: profile.missions,
      missionsWeek: profile.missionsWeek,
      daily: profile.daily,
      revision,
      updatedAt: stamp,
    });
    transaction.set(doc(firestore, 'users', user.uid, 'statistics', 'default'), {
      records: cleanRecords(profile.records),
      totalCoinsCollected: profile.totalCoinsCollected,
      totalCrystalsCollected: profile.totalCrystals,
      totalFlights: profile.totalGames,
      totalShieldsUsed: profile.totalShieldsUsed,
      totalAsteroidsDodged: profile.totalAsteroidsDodged,
      longestSurvival: profile.longestSurvival,
      totalDistance: profile.totalDistance,
      totalRevivesUsed: profile.totalRevivesUsed,
      bestScore: profile.bestScore,
      bestDistance: profile.bestDistance,
      revision,
      updatedAt: stamp,
    });
    return revision;
  });
}

export async function touchLastLogin(uid: string): Promise<void> {
  await updateDoc(userDocument(uid), { lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
