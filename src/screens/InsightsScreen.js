import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { getEntries } from '../services/storageService';
import { getStats } from '../utils/analytics';
import { useAuth } from '../context/AuthContext';

function buildInsights(entries, stats) {
  if (!entries.length) {
    return ['Start tracking daily to unlock personalized insights.'];
  }

  const messages = [];

  if (stats.trend === 'up') messages.push('Your recent mood trend is improving. Keep your current routines.');
  if (stats.trend === 'down') messages.push('Your mood dipped recently. Try sleep, movement, and short breaks.');
  if (stats.trend === 'stable') messages.push('Your mood is stable. Small habit upgrades can create positive momentum.');

  if (stats.streak >= 5) messages.push(`Strong consistency: ${stats.streak}-day tracking streak.`);
  if (stats.average >= 4) messages.push('Overall mood is strong. Capture what is working and repeat it.');
  if (stats.average < 3) messages.push('Average mood is low. Consider reducing stressors and adding recovery time.');

  return messages;
}

export default function InsightsScreen() {
  const [entries, setEntries] = useState([]);
  const { user, profile, logout, authLoading } = useAuth();

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
  const insights = useMemo(() => buildInsights(entries, stats), [entries, stats]);
  const accountName = profile?.displayName || user?.email || 'Signed in user';

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('Logout failed', error?.message || 'Could not logout.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.accountCard}>
        <Text style={styles.accountLabel}>Account</Text>
        <Text style={styles.accountValue}>{accountName}</Text>
        <Pressable style={[styles.logoutButton, authLoading && styles.disabled]} onPress={handleLogout}>
          <Text style={styles.logoutText}>{authLoading ? 'Logging out...' : 'Logout'}</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Personal Insights</Text>
        <Text style={styles.heroText}>
          Based on your tracked mood history, here are actionable observations.
        </Text>
      </View>

      {insights.map((text, idx) => (
        <View key={`${text}-${idx}`} style={styles.card}>
          <Text style={styles.cardText}>{text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 24 },
  accountCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  accountLabel: { color: COLORS.textMuted, fontWeight: '600', marginBottom: 2 },
  accountValue: { color: COLORS.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  logoutButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutText: {
    color: '#1E40AF',
    fontWeight: '700',
  },
  disabled: { opacity: 0.7 },
  hero: {
    backgroundColor: '#DBEAFE',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#1E3A8A' },
  heroText: { marginTop: 6, color: '#1E3A8A', lineHeight: 20 },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardText: { color: COLORS.text, lineHeight: 22, fontWeight: '500' },
});
