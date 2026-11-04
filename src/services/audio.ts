import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

type SoundName = 'tap' | 'collect' | 'hit' | 'warning' | 'music';

const sampleRate = 8000;
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array) {
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    const second = offset + 1 < bytes.length ? bytes[offset + 1] : 0;
    const third = offset + 2 < bytes.length ? bytes[offset + 2] : 0;
    output += base64Alphabet[first >> 2];
    output += base64Alphabet[((first & 3) << 4) | (second >> 4)];
    output += offset + 1 < bytes.length ? base64Alphabet[((second & 15) << 2) | (third >> 6)] : '=';
    output += offset + 2 < bytes.length ? base64Alphabet[third & 63] : '=';
  }
  return output;
}

/** Builds a tiny mono PCM WAV in memory so the game has no network/audio-asset dependency. */
function makeWave(name: SoundName) {
  const duration = name === 'music' ? 2.4 : 0.12;
  const sampleCount = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const writeText = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index); };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, sampleCount * 2, true);
  const frequencies: Record<Exclude<SoundName, 'music'>, number> = { tap: 650, collect: 980, hit: 135, warning: 350 };
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const envelope = name === 'music'
      ? 0.16 * Math.min(1, (time % 0.3) * 20) * Math.min(1, (0.3 - (time % 0.3)) * 20)
      : 0.4 * Math.exp(-time * (name === 'hit' ? 9 : 24));
    const frequency = name === 'music'
      ? [262, 330, 392, 523, 392, 330, 294, 392][Math.floor(time / 0.3) % 8]
      : frequencies[name];
    const harmonic = name === 'hit' ? Math.sin(Math.PI * 2 * frequency * time) + 0.35 * Math.sin(Math.PI * 2 * frequency * 0.5 * time) : Math.sin(Math.PI * 2 * frequency * time);
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, harmonic * envelope)) * 32767, true);
  }
  return encodeBase64(bytes);
}

class RocketAudio {
  private players = new Map<SoundName, ReturnType<typeof createAudioPlayer>>();
  private bootPromise: Promise<void> | null = null;
  private musicWanted = false;

  private async boot() {
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
        const directory = FileSystem.cacheDirectory;
        if (!directory) return;
        for (const name of ['tap', 'collect', 'hit', 'warning', 'music'] as const) {
          const uri = `${directory}rocket-rush-${name}.wav`;
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) await FileSystem.writeAsStringAsync(uri, makeWave(name), { encoding: FileSystem.EncodingType.Base64 });
          const player = createAudioPlayer({ uri });
          player.volume = name === 'music' ? 0.18 : 0.46;
          player.loop = name === 'music';
          this.players.set(name, player);
        }
        if (this.musicWanted) this.players.get('music')?.play();
      } catch {
        // Audio must never block gameplay; haptics and the game remain available if playback is unavailable.
      }
    })();
    return this.bootPromise;
  }

  play(name: Exclude<SoundName, 'music'>, enabled: boolean) {
    if (!enabled) return;
    void this.boot().then(() => {
      const player = this.players.get(name);
      if (!player) return;
      void player.seekTo(0);
      player.play();
    });
  }

  setMusicEnabled(enabled: boolean) {
    this.musicWanted = enabled;
    void this.boot().then(() => {
      const player = this.players.get('music');
      if (!player) return;
      if (enabled) player.play();
      else player.pause();
    });
  }
}

export const rocketAudio = new RocketAudio();
