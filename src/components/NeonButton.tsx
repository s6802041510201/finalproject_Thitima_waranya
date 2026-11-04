import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/game/config/game';

interface Props {
  label: string;
  onPress: () => void;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'gold';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}

export function NeonButton({ label, onPress, icon, variant = 'secondary', disabled, style, small }: Props) {
  const colors: [string, string, ...string[]] = variant === 'primary' ? ['#00c8f6', '#4c68ff', '#c144ff']
    : variant === 'danger' ? ['#ff4f83', '#bf3cff']
      : variant === 'gold' ? ['#ffdf48', '#ff8c32'] : ['#1e3b9a', '#302176', '#7439ba'];
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.shell, style, disabled && styles.disabled, pressed && styles.pressed]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.gradient, small && styles.small]}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text numberOfLines={2} style={[styles.label, small && styles.smallLabel]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { maxWidth: '100%', borderRadius: 30, borderWidth: 1.5, borderColor: COLORS.cyan, shadowColor: COLORS.purple, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, overflow: 'hidden' },
  gradient: { minHeight: 50, maxWidth: '100%', paddingHorizontal: 18, paddingVertical: 6, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  small: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 5 },
  label: { flexShrink: 1, color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center', includeFontPadding: false },
  smallLabel: { fontSize: 13 },
  icon: { fontSize: 20 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },
});
