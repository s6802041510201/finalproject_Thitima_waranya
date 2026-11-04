# ROCKET RUSH: ASTEROID ESCAPE

An offline 2D portrait arcade game built for a Mobile Application Development mini project. Pilot a rocket through an asteroid field using phone tilt or touch control, collect power-ups, complete missions, and keep a local flight history.

## Features

- Real game loop with delta-time movement, difficulty scaling, object reuse/removal, collision circles, safe spawn lanes, invulnerability frames, near-miss combos, and pause/resume without a time jump.
- Four obstacle types: small asteroid, giant asteroid, fire meteor, and rotating space debris.
- Seven collectible types: fuel, crystal, coin, repair kit, shield, speed boost, and magnet.
- Touch fallback for simulator, web, and devices without usable motion sensors.
- Accelerometer + gyroscope complementary filter: accelerometer gravity provides stable tilt, gyro provides fast response; the gyro is not used as an angle by itself.
- Calibration, dead zone, smoothing, sensitivity, inversion, inertia, and boundary clamp.
- Local AsyncStorage profile for settings, records, best score, totals, and five mission progress records.
- Optional Firebase email/password accounts with private Firestore player saves, profile screens, and revision-checked cloud synchronization.
- Account-specific local saves remain playable offline; conflicting device saves are presented for a player choice instead of silently overwriting each other.
- Local-only leaderboard (no fabricated global scores), accessible UI screens, haptic feedback, and safe-area portrait layout.
- Offline sound feedback and looping space music generated as compact WAV files into the app cache on first launch; Sound Effects and Background Music settings control them independently.

## Install and run

```bash
npm install
npm run start
```

Then scan the QR code using Expo Go on Android/iOS, or run:

```bash
npm run android
npm run ios
```

The project targets Expo SDK 58 and uses the Expo-compatible package versions in `package.json`. If versions need aligning after an Expo upgrade, run:

```bash
npx expo install --fix
```

## Controls

- **Tilt**: hold the phone upright and use **Settings → Calibrate Sensor** while holding it naturally. Tilt left/right to accelerate sideways. Small movement is ignored by the dead zone.
- **Touch**: select **Touch** in Settings, then touch and drag horizontally in the playfield.
- **Shield**: collect a shield, then press the lower-left power button. It absorbs the next asteroid collision.
- **Boost**: collect a boost, then press the lower-right power button. It gives 50% more travel speed for 5 seconds and consumes extra fuel.

## Device-test checklist

1. Use a physical phone to check motion direction, calibration, and the desired sensitivity.
2. Switch to Touch in an emulator/web browser; the same game rules should work.
3. Verify haptics on the target device (OS battery-saver/device settings can suppress it).
4. Pause a run, wait, and resume: score, fuel, distance, spawn timer, and entities remain frozen while paused.
5. Finish runs and reopen the application: settings, missions, and the local leaderboard persist.

## Project map

```
app/                       Expo Router entry and app flow
src/components/            Reusable neon UI and animated space background
src/game/                  Game configuration and delta-time engine
src/hooks/useTiltControl   Sensor fusion and calibration source
src/screens/GameScreen     Playfield, HUD, pause controls
src/screens/AuthScreen     Login and registration
src/screens/ProfileScreen  Account details and cloud sync controls
src/firebase/              Firebase config, auth, Firestore save/sync
src/storage/GameStorage    AsyncStorage persistence boundary
src/services/feedback      Haptic feedback boundary
src/types/                 TypeScript game models
```

The data layer remains separate from the UI; Firebase sync attaches at the existing `GameStorage` boundary without changing game screens or score calculation.

## Firebase setup

The app uses the Firebase JavaScript SDK, Firebase Authentication, Cloud Firestore, and AsyncStorage. Email/password and guest play do not require native Firebase packages.

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
2. Create a Cloud Firestore database for the project.
3. Copy `.env.example` to `.env.local` and enter the Firebase web-app config. The supplied Firebase project values are already in this workspace's ignored `.env.local` file.
4. Publish `firestore.rules` from **Firestore Database → Rules**. These rules let a signed-in user access only their own documents.
5. Restart Expo with `npm run start`. Guest and email/password flows can be opened in Expo Go.

Expo inlines `EXPO_PUBLIC_` variables into the client bundle. Firebase web configuration values are client identifiers, not server credentials; never put a service account key or Firebase Admin credential in the app. Firestore Security Rules protect the data.

The cloud save uses these documents:

- `users/{uid}` — username, email, balances, equipped rocket, settings, and save revision.
- `users/{uid}/inventory/default` — owned rockets, upgrades, consumable counts, and loadout.
- `users/{uid}/progress/default` — stages, weekly missions, and daily challenges.
- `users/{uid}/statistics/default` — recent flight records and lifetime totals/high scores.

The four documents are written in a Firestore transaction. Each account also has a separate AsyncStorage profile and cached cloud revision. Offline profile changes are marked locally and retried; if another device has advanced the cloud revision, the app pauses syncing and lets the player load the cloud save or keep this device's save.

Currency, rewards, stage completion, and scores are still calculated on the client. The rules enforce account ownership and basic data types, but a modified client can still submit fabricated values. Before production, move reward and purchase validation to trusted Cloud Functions or another server-side authority.

## Firebase verification

`npm run typecheck` passed. Android and web Expo bundle exports passed. `npm run lint` could not run because ESLint is not installed in this project. Full registration, login, Firestore writes, two-device sync, offline recovery, and rule behavior require Email/Password to be enabled and the rules deployed; they must be exercised on Expo Go devices with this Firebase project. No live account or second device was available in this workspace, so those interactive scenarios are not marked as passed.
