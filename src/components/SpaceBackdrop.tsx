import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const palettes: Record<string, [string, string, string, string]> = {
  earth: ['#020b2e', '#0b3e75', '#0e789e', '#07164b'], crystal: ['#12042f', '#492078', '#9a3c91', '#170b54'],
  mars: ['#25050b', '#6f1f1d', '#b74d21', '#23040b'], storm: ['#090329', '#251063', '#104b83', '#070622'],
  portal: ['#061c46', '#0e6e9a', '#9b287f', '#17064a'], final: ['#190208', '#4b0713', '#210120', '#05010a'],
  easy: ['#02061f', '#10155a', '#126d91', '#070a32'], normal: ['#090329', '#2b1769', '#67328e', '#10063f'],
  hard: ['#25050b', '#742520', '#8d2355', '#140416'], extreme: ['#16051f', '#481043', '#811b40', '#0a0218'], survival: ['#090108', '#39030d', '#200022', '#010103'],
};

export function SpaceBackdrop({ children, theme = 'easy' }: { children: React.ReactNode; theme?: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const stars = useMemo(() => Array.from({ length: 54 }, (_, index) => ({
    id: index,
    left: `${(index * 47) % 101}%`, top: `${(index * 73) % 98}%`,
    size: index % 7 === 0 ? 4 : index % 3 === 0 ? 2 : 1,
    opacity: 0.22 + ((index * 13) % 68) / 100,
  })), []);
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 2200, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return (
    <LinearGradient colors={palettes[theme] ?? palettes.easy} style={styles.fill}>
      <View pointerEvents="none" style={styles.nebulaOne} />
      <Animated.View pointerEvents="none" style={[styles.nebulaTwo, { opacity: pulse }]} />
      {stars.map((star) => <View key={star.id} pointerEvents="none" style={[styles.star, {
        left: star.left as `${number}%`, top: star.top as `${number}%`, width: star.size, height: star.size, opacity: star.opacity,
      }]} />)}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  star: { position: 'absolute', backgroundColor: '#d9f7ff', borderRadius: 10, shadowColor: '#61dfff', shadowOpacity: 1, shadowRadius: 5 },
  nebulaOne: { position: 'absolute', width: 390, height: 260, right: -120, top: 150, borderRadius: 250, backgroundColor: 'rgba(102, 28, 217, 0.32)', transform: [{ rotate: '-22deg' }] },
  nebulaTwo: { position: 'absolute', width: 310, height: 250, left: -150, bottom: 80, borderRadius: 220, backgroundColor: 'rgba(0, 173, 255, 0.20)' },
});
