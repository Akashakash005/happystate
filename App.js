import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash screen was already hidden.
});

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { initializing } = useAuth();
  const { isPrivateMode } = useTheme();
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
      <NavigationContainer
        key={isPrivateMode ? 'private-theme' : 'public-theme'}
        onReady={() => setNavigationReady(true)}
      >
        <StatusBar style={isPrivateMode ? 'light' : 'dark'} />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
