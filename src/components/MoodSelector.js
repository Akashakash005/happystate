import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MOOD_OPTIONS } from '../constants/moods';
import { COLORS } from '../constants/colors';

export default function MoodSelector({ value, onChange }) {
  return (
    <View style={styles.row}>
      {MOOD_OPTIONS.map((mood) => {
        const selected = mood.value === value;
        return (
          <Pressable
            key={mood.value}
            style={[styles.item, selected && styles.itemSelected]}
            onPress={() => onChange(mood.value)}
          >
            <Text style={[styles.value, selected && styles.valueSelected]}>{mood.value}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>{mood.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  item: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  itemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#EFF6FF',
  },
  value: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  valueSelected: { color: COLORS.primary },
  label: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },
  labelSelected: { color: COLORS.primary },
});
