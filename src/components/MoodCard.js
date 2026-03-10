import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getMoodMeta } from '../constants/moods';
import { formatLongDate } from '../utils/date';
import { useTheme } from '../context/ThemeContext';

export default function MoodCard({ entry }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const meta = getMoodMeta(entry.mood);
  const slotLabel = entry.slot
    ? `${entry.slot.charAt(0).toUpperCase()}${entry.slot.slice(1)}`
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.date}>{formatLongDate(entry.dateISO)}</Text>
        <View style={[styles.badge, { backgroundColor: meta.color }]}>
          <Text style={styles.badgeText}>{meta.label}</Text>
        </View>
      </View>
      {slotLabel ? <Text style={styles.slot}>{slotLabel}</Text> : null}
      {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: colors.text, fontWeight: '600' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  slot: { marginTop: 6, color: colors.textMuted, fontWeight: '600' },
  note: { marginTop: 8, color: colors.textMuted, lineHeight: 20 },
});
