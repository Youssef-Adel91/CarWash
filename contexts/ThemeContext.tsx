// Powered by OnSpace.AI
// App-wide light/dark/system theme. Persisted locally so the choice
// survives restarts; the resolved `scheme` also drives the StatusBar style
// in app/_layout.tsx.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors } from '@/constants/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
type Scheme = 'light' | 'dark';

const THEME_MODE_KEY = '@carwash/theme_mode';

type ThemeContextType = {
  mode: ThemeMode;
  scheme: Scheme;
  colors: typeof lightColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((raw) => {
        if (!mounted) return;
        if (raw === 'light' || raw === 'dark' || raw === 'system') setModeState(raw);
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {
      // Ignore persistence failures — the in-memory mode still applies.
    });
  }, []);

  const scheme: Scheme = useMemo(() => {
    if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
    return mode;
  }, [mode, systemScheme]);

  const colors = scheme === 'dark' ? darkColors : lightColors;

  // Avoid a flash of the wrong theme while the persisted value loads —
  // fall back to the system scheme in the meantime.
  const value = useMemo<ThemeContextType>(
    () => ({ mode: loaded ? mode : 'system', scheme, colors, setMode }),
    [loaded, mode, scheme, colors, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
