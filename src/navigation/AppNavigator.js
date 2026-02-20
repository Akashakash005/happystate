import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import InsightsScreen from '../screens/InsightsScreen';
import { COLORS } from '../constants/colors';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  const getTabIcon = (routeName, focused, color, size) => {
    if (routeName === 'Home') {
      return <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />;
    }
    if (routeName === 'Analytics') {
      return (
        <Ionicons
          name={focused ? 'stats-chart' : 'stats-chart-outline'}
          size={size}
          color={color}
        />
      );
    }
    return <Ionicons name={focused ? 'bulb' : 'bulb-outline'} size={size} color={color} />;
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: COLORS.surface },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: 120,
          paddingBottom: 30,
          paddingTop: 30,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIconStyle: { marginTop: 2 },
        tabBarIcon: ({ focused, color, size }) =>
          getTabIcon(route.name, focused, color, size),
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
    </Tab.Navigator>
  );
}
