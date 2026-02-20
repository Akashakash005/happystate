import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { getEntries } from '../services/storageService';
import { getStats } from '../utils/analytics';
import StatCard from '../components/StatCard';

export default function AnalyticsScreen() {
  const [entries, setEntries] = useState([]);

  const load = useCallback(async () => {
    const all = await getEntries();
    setEntries(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const stats = useMemo(() => getStats(entries), [entries]);
  const maxCount = Math.max(...Object.values(stats.distribution), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <StatCard label="Total Entries" value={String(stats.total)} />
        <View style={{ width: 10 }} />
        <StatCard label="Average Mood" value={String(stats.average)} />
      </View>

      <View style={[styles.row, { marginTop: 10 }]}>
        <StatCard label="Current Streak" value={`${stats.streak}d`} />
        <View style={{ width: 10 }} />
        <StatCard label="Trend" value={stats.trend.toUpperCase()} />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Mood Distribution</Text>
        {[1, 2, 3, 4, 5].map((m) => {
          const count = stats.distribution[m] || 0;
          const widthPct = (count / maxCount) * 100;
          return (
            <View key={m} style={styles.barRow}>
              <Text style={styles.barLabel}>{m}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${widthPct}%` }]} />
              </View>
              <Text style={styles.barValue}>{count}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 24 },
  row: { flexDirection: 'row' },
  block: {
    marginTop: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  blockTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  barLabel: { width: 20, color: COLORS.text, fontWeight: '700' },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  barFill: { height: 12, borderRadius: 999, backgroundColor: COLORS.primary },
  barValue: { width: 28, textAlign: 'right', color: COLORS.textMuted, fontWeight: '700' },
});
