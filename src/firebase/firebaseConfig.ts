import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getAuth, initializeAuth, type Persistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);

const app = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

function createAuth() {
  if (!app) return null;
  if (Platform.OS === 'web') return getAuth(app);
  try {
    // Firebase exposes this helper through its React Native runtime condition;
    // the package's shared TypeScript entry does not list the platform export.
    const getNativePersistence = (FirebaseAuth as typeof FirebaseAuth & {
      getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
    }).getReactNativePersistence;
    return initializeAuth(app, { persistence: getNativePersistence(AsyncStorage) });
  } catch {
    // Fast refresh can evaluate this module after Firebase Auth was initialized.
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = app ? getFirestore(app) : null;
