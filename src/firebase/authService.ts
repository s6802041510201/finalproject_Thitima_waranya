import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './firebaseConfig';

export function requireAuth() {
  if (!auth) throw new Error('firebase-not-configured');
  return auth;
}

export async function registerWithEmail(username: string, email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim().toLowerCase(), password);
  await updateProfile(credential.user, { displayName: username.trim() });
  return credential.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await signInWithEmailAndPassword(requireAuth(), normalizedEmail, password);
  return result.user;
}

export async function logout() {
  await signOut(requireAuth());
}

export function authErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  switch (code) {
    case 'auth/invalid-email': return 'That email address is not valid.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password': return 'Email or password is incorrect.';
    case 'auth/email-already-in-use': return 'An account already uses that email. Try logging in.';
    case 'auth/operation-not-allowed': return 'This sign-in method is not enabled in Firebase Authentication.';
    case 'auth/weak-password': return 'Choose a password with at least 8 characters.';
    case 'auth/network-request-failed': return 'Unable to connect. Check your internet connection and try again.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a little, then try again.';
    case 'auth/user-disabled': return 'This account is disabled. Contact the app owner for help.';
    case 'firebase-not-configured': return 'Firebase setup is incomplete. Add the project settings to .env.local and restart Expo.';
    default: return 'We could not complete that request. Please try again.';
  }
}

function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
  if (error instanceof Error && (error.message.startsWith('auth/') || error.message === 'firebase-not-configured')) return error.message;
  return '';
}

