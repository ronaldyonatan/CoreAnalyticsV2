import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  CORE_THEMES,
  CORE_THEME_STORAGE_KEY,
  isCoreThemeId,
} from './themes';
import type {
  CoreThemeDefinition,
  CoreThemeId,
} from './themes';
import './theme.css';

interface ThemeContextValue {
  themeId: CoreThemeId;
  theme: CoreThemeDefinition;
  setTheme: (themeId: CoreThemeId) => void;
  toggleTheme: () => void;
  isLight: boolean;
  isAurora: boolean;
  isSolaris: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getInitialTheme = (): CoreThemeId => {
  if (typeof window === 'undefined') return 'cosmic-black';

  const saved = window.localStorage.getItem(CORE_THEME_STORAGE_KEY);

  // Backward compatibility: the retired Cosmic Light theme maps to Aurora.
  if (saved === 'cosmic-light') return 'aurora';

  if (isCoreThemeId(saved)) return saved;

  return 'cosmic-black';
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<CoreThemeId>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;

    // Solaris is the only true light environment. Cosmic Black and Aurora
    // deliberately keep dark browser-native controls.
    document.documentElement.style.colorScheme =
      themeId === 'solaris' ? 'light' : 'dark';

    window.localStorage.setItem(CORE_THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = CORE_THEMES[themeId];

    return {
      themeId,
      theme,
      setTheme: setThemeId,
      // Kept for legacy callers. It now cycles through all available themes.
      toggleTheme: () =>
        setThemeId((current) => {
          if (current === 'cosmic-black') return 'aurora';
          if (current === 'aurora') return 'solaris';
          return 'cosmic-black';
        }),

      // Existing chart components can use this flag to switch to their
      // established light materials only for Solaris.
      isLight: themeId === 'solaris',
      isAurora: themeId === 'aurora',
      isSolaris: themeId === 'solaris',
    };
  }, [themeId]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}
