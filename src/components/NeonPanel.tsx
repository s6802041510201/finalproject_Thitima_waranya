import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export function NeonPanel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(16, 27, 88, 0.82)', borderRadius: 22, borderWidth: 1.2,
    borderColor: 'rgba(93, 221, 255, 0.75)', padding: 16,
    shadowColor: '#824dff', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 2 },
  },
});
