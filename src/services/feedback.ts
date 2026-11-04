import * as Haptics from 'expo-haptics';
import type { Settings } from '@/types/game';
import { rocketAudio } from '@/services/audio';

export const feedback = {
  tap(settings: Settings) {
    rocketAudio.play('tap', settings.soundEffects);
    if (settings.vibration) void Haptics.selectionAsync();
  },
  collect(settings: Settings) {
    rocketAudio.play('collect', settings.soundEffects);
    if (settings.vibration) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  hit(settings: Settings) {
    rocketAudio.play('hit', settings.soundEffects);
    if (settings.vibration) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
  warning(settings: Settings) {
    rocketAudio.play('warning', settings.soundEffects);
    if (settings.vibration) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },
};
