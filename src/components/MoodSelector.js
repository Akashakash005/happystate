import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MOOD_OPTIONS } from '../constants/moods';
import { useTheme } from '../context/ThemeContext';

export default function MoodSelector({ value, onChange }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

const createStyles = (colors) => StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  item: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  itemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.inputAccent,
  },
  value: { fontSize: 18, fontWeight: '700', color: colors.text },
  valueSelected: { color: colors.primary },
  label: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  labelSelected: { color: colors.primary },
});
