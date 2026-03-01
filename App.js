import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider } from './src/context/AuthContext';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash screen was already hidden.
});

export default function App() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    setAppReady(true);
  }, []);

  const onNavigationReady = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  if (!appReady) {
    return null;
  }

  return (
    <AuthProvider>
      <SafeAreaProvider>
        <NavigationContainer onReady={onNavigationReady}>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
