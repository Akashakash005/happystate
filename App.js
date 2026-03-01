import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider, useAuth } from './src/context/AuthContext';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash screen was already hidden.
});

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { initializing } = useAuth();
  const [navigationReady, setNavigationReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  useEffect(() => {
    if (!navigationReady || initializing || splashHidden) return;

    SplashScreen.hideAsync()
      .catch(() => {})
      .finally(() => setSplashHidden(true));
  }, [initializing, navigationReady, splashHidden]);

  return (
    <SafeAreaProvider>
      <NavigationContainer onReady={() => setNavigationReady(true)}>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
