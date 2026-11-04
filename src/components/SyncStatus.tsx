import { StyleSheet, Text, View } from 'react-native';

export type CloudStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error';

const statusCopy: Record<CloudStatus, { label: string; color: string; dot: string }> = {
  local: { label: 'LOCAL SAVE', color: '#b9c8f4', dot: '◌' },
  syncing: { label: 'SYNCING CLOUD SAVE', color: '#61e8ff', dot: '◌' },
  synced: { label: 'CLOUD SAVE UP TO DATE', color: '#72ffd2', dot: '●' },
  offline: { label: 'OFFLINE · SAVED ON THIS DEVICE', color: '#ffd479', dot: '●' },
  conflict: { label: 'CLOUD SAVE CHANGED ON ANOTHER DEVICE', color: '#ffbb82', dot: '!' },
  error: { label: 'CLOUD SYNC NEEDS ATTENTION', color: '#ff9eb7', dot: '!' },
};

export function SyncStatus({ status }: { status: CloudStatus }) {
  const item = statusCopy[status];
  return <View accessibilityRole="text" style={styles.row}><Text style={[styles.dot, { color: item.color }]}>{item.dot}</Text><Text style={[styles.label, { color: item.color }]}>{item.label}</Text></View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(12, 23, 68, 0.72)' },
  dot: { fontSize: 13, fontWeight: '900' },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textAlign: 'center' },
});
