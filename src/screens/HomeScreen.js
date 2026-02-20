import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MoodSelector from '../components/MoodSelector';
import MoodCard from '../components/MoodCard';
import { COLORS } from '../constants/colors';
import { getEntries, upsertTodayEntry } from '../services/storageService';
import { formatLongDate } from '../utils/date';

export default function HomeScreen() {
  const [mood, setMood] = useState(3);
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    const all = await getEntries();
    setEntries(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await upsertTodayEntry({ mood, note: note.trim() });
      setEntries(updated);
      setNote('');
      Alert.alert('Saved', "Today's mood has been recorded.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>How are you feeling today?</Text>
          <Text style={styles.subtitle}>{formatLongDate(new Date())}</Text>

          <MoodSelector value={mood} onChange={setMood} />

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note (what influenced your mood?)"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            multiline
            maxLength={180}
          />

          <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={onSave}>
            <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Today'}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Recent Entries</Text>
        {entries.length ? (
          entries.slice(0, 5).map((entry) => <MoodCard key={entry.id} entry={entry} />)
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No entries yet. Add your first mood above.</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 28 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  subtitle: { marginTop: 4, marginBottom: 12, color: COLORS.textMuted, fontWeight: '500' },
  input: {
    marginTop: 12,
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    color: COLORS.text,
    backgroundColor: '#F8FAFC',
  },
  button: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  empty: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    padding: 14,
  },
  emptyText: { color: COLORS.textMuted },
});
