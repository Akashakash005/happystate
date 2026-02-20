import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getMoodMeta } from '../constants/moods';
import { formatLongDate } from '../utils/date';
import { COLORS } from '../constants/colors';

export default function MoodCard({ entry }) {
  const meta = getMoodMeta(entry.mood);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.date}>{formatLongDate(entry.dateISO)}</Text>
        <View style={[styles.badge, { backgroundColor: meta.color }]}>
          <Text style={styles.badgeText}>{meta.label}</Text>
        </View>
      </View>
      {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: COLORS.text, fontWeight: '600' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  note: { marginTop: 8, color: COLORS.textMuted, lineHeight: 20 },
});
