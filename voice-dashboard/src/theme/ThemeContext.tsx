import React, { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import {
  CORE_THEMES,
  CORE_THEME_LIST,
  CORE_THEME_STORAGE_KEY,
  isCoreThemeId,
  getShellComposition,
  getSurfaceFamily,
} from './themes';
import type {
  CoreThemeDefinition,
  CoreThemeId,
  CoreThemePerformance,
} from './themes';
// The Design System entry owns stylesheet ordering.
import '../design-system/index.css';

interface ThemeContextValue {
  themeId: CoreThemeId;
  theme: CoreThemeDefinition;
  setTheme: (themeId: CoreThemeId) => void;
  toggleTheme: () => void;

  isLight: boolean;
  isStaticTheme: boolean;
  performanceMode: CoreThemePerformance;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_CYCLE = CORE_THEME_LIST.map((theme) => theme.id);

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

  // Activate root values before paint so component recipes never see a stale palette.
  useLayoutEffect(() => {
    const theme = CORE_THEMES[themeId];
    const root = document.documentElement;

    root.dataset.theme = themeId;
    root.dataset.performance = theme.performance;
    root.dataset.appearance = theme.appearance;
    root.dataset.surfaceFamily = getSurfaceFamily(theme);
    root.dataset.shellComposition = getShellComposition(theme);
    root.dataset.fullscreenTone = 'fullscreenTone' in theme ? theme.fullscreenTone : 'theme';

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

      // Appearance and performance are shared capabilities.
      isLight: theme.appearance === 'light',

      // Performance/rendering flags for every dashboard/chart.
      isStaticTheme: theme.performance === 'static',
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
