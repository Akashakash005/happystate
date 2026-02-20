import React from 'react';
import AppNavigator from './AppNavigator';
import AuthNavigator from './AuthNavigator';
import LoadingScreen from '../screens/Auth/LoadingScreen';
import { useAuth } from '../context/AuthContext';

export default function RootNavigator() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthNavigator />;
  }

  return <AppNavigator />;
}
