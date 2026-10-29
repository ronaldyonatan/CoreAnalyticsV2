import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  CORE_THEMES,
  CORE_THEME_STORAGE_KEY,
  isCoreThemeId,
} from './themes';
import type {
  CoreThemeDefinition,
  CoreThemeId,
  CoreThemePerformance,
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

  isStaticTheme: boolean;
  isObsidian: boolean;
  isQuartz: boolean;
  performanceMode: CoreThemePerformance;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_CYCLE: CoreThemeId[] = [
  'cosmic-black',
  'aurora',
  'solaris',
  'obsidian',
  'quartz',
];

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
    const theme = CORE_THEMES[themeId];
    const root = document.documentElement;

    root.dataset.theme = themeId;
    root.dataset.performance = theme.performance;
    root.dataset.appearance = theme.appearance;

    document.documentElement.style.colorScheme =
      theme.appearance === 'light' ? 'light' : 'dark';

    window.localStorage.setItem(CORE_THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = CORE_THEMES[themeId];

    return {
      themeId,
      theme,
      setTheme: setThemeId,

      // Legacy convenience action. Cycles through all official themes.
      toggleTheme: () =>
        setThemeId((current) => {
          const currentIndex = THEME_CYCLE.indexOf(current);
          return THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];
        }),

      // Light materials are shared by Solaris and Quartz.
      isLight: theme.appearance === 'light',
      isAurora: themeId === 'aurora',
      isSolaris: themeId === 'solaris',

      // Performance/rendering flags for every dashboard/chart.
      isStaticTheme: theme.performance === 'static',
      isObsidian: themeId === 'obsidian',
      isQuartz: themeId === 'quartz',
      performanceMode: theme.performance,
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
