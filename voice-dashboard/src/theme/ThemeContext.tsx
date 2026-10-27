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
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getInitialTheme = (): CoreThemeId => {
  if (typeof window === 'undefined') return 'cosmic-black';

  const saved = window.localStorage.getItem(CORE_THEME_STORAGE_KEY);

  // Backward compatibility: users who previously selected Cosmic Light
  // are migrated automatically to the new Aurora theme.
  if (saved === 'cosmic-light') return 'aurora';

  if (isCoreThemeId(saved)) return saved;

  return 'cosmic-black';
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<CoreThemeId>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    // Aurora deliberately uses dark browser controls because its surfaces
    // are medium-dark translucent glass, not a white/light UI.
    document.documentElement.style.colorScheme = 'dark';

    window.localStorage.setItem(CORE_THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = CORE_THEMES[themeId];

    return {
      themeId,
      theme,
      setTheme: setThemeId,
      toggleTheme: () =>
        setThemeId((current) =>
          current === 'cosmic-black' ? 'aurora' : 'cosmic-black'
        ),

      // Legacy compatibility flag.
      // Aurora is intentionally NOT treated as a traditional light theme.
      // Existing chart components that still branch on `isLight` will therefore
      // keep their dark/cosmic 3D scene materials instead of switching to white.
      isLight: false,
      isAurora: themeId === 'aurora',
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
