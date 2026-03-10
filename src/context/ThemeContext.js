import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { COLORS, PUBLIC_COLORS, PRIVATE_COLORS } from "../constants/colors";
import { getProfile, updateProfile } from "../services/profileService";
import {
  getActiveCharacterMode,
  setActiveCharacterMode,
} from "../services/characterModeService";

const ThemeContext = createContext({
  colors: PUBLIC_COLORS,
  isPrivateMode: false,
  setPrivateMode: async () => {},
  refreshThemeFromProfile: async () => {},
});

export function ThemeProvider({ children }) {
  const [isPrivateMode, setIsPrivateMode] = useState(false);

  useEffect(() => {
    const nextColors = isPrivateMode ? PRIVATE_COLORS : PUBLIC_COLORS;
    for (const key of Object.keys(COLORS)) {
      delete COLORS[key];
    }
    Object.assign(COLORS, nextColors);
  }, [isPrivateMode]);

  const refreshThemeFromProfile = useCallback(async () => {
    try {
      const [profile, mode] = await Promise.all([
        getProfile(),
        getActiveCharacterMode(),
      ]);
      const nextMode =
        mode === "private" || profile?.privateJournalMode ? "private" : "public";
      setIsPrivateMode(nextMode === "private");
      await setActiveCharacterMode(nextMode);
    } catch {
      setIsPrivateMode(false);
    }
  }, []);

  useEffect(() => {
    refreshThemeFromProfile();
  }, [refreshThemeFromProfile]);

  const setPrivateMode = useCallback(async (nextValue) => {
    const normalized = Boolean(nextValue);
    const previousValue = isPrivateMode;
    setIsPrivateMode(normalized);
    try {
      const nextMode = normalized ? "private" : "public";
      await setActiveCharacterMode(nextMode);
      await updateProfile({ privateJournalMode: normalized }, nextMode);
    } catch (error) {
      setIsPrivateMode(previousValue);
      throw error;
    }
  }, [isPrivateMode]);

  const value = useMemo(
    () => ({
      colors: isPrivateMode ? PRIVATE_COLORS : PUBLIC_COLORS,
      isPrivateMode,
      setPrivateMode,
      refreshThemeFromProfile,
    }),
    [isPrivateMode, refreshThemeFromProfile, setPrivateMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeColors() {
  return useTheme().colors;
}
