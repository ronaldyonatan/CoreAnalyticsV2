// Vite discovers theme styles automatically: add a CSS file and register metadata below.
import.meta.glob('./themes/*.css', { eager: true });

export type CoreThemeAppearance = 'dark' | 'light';
export type CoreThemePerformance = 'immersive' | 'static';
export type CoreSurfaceFamily = 'holographic' | 'luminous' | 'daylight' | 'clinical';
export type CoreEnvironment = 'space' | 'curtains' | 'solar-wind' | 'technical-grid' | 'field';

export interface CoreThemeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  appearance: CoreThemeAppearance;
  performance: CoreThemePerformance;
  environment?: CoreEnvironment;
  surfaceFamily?: CoreSurfaceFamily;
  fullscreenTone?: 'theme' | 'dark-stage';
  three: {
    background: string;
    fog: string;
    star: string;
    ambientIntensity: number;
    floor: string;
    gridPrimary: string;
    gridSecondary: string;
    wall: string;
    wallSecondary: string;
    wallAccent: string;
  };
}

export const CORE_THEME_STORAGE_KEY = 'coreanalytics-theme';

export const CORE_THEMES = {
  'cosmic-black': {
    id: 'cosmic-black',
    surfaceFamily: 'holographic',
    environment: 'space',
    name: 'Cosmic Black',
    description: 'Immersive deep-space command center with cyan neon and dark glass.',
    icon: '✦',
    appearance: 'dark',
    performance: 'immersive',
    three: {
      background: '#00030a',
      fog: '#00030a',
      star: '#00f2fe',
      ambientIntensity: 0.8,
      floor: '#031523',
      gridPrimary: '#087da5',
      gridSecondary: '#07304a',
      wall: '#031321',
      wallSecondary: '#07142a',
      wallAccent: '#1a0a20',
    },
  },

  aurora: {
    id: 'aurora',
    surfaceFamily: 'luminous',
    environment: 'curtains',
    name: 'Aurora',
    description: 'Immersive luminous command center with cyan, teal, violet and magenta energy.',
    icon: '◈',
    appearance: 'dark',
    performance: 'immersive',
    three: {
      background: '#102f3d',
      fog: '#163c49',
      star: '#7deeff',
      ambientIntensity: 1.12,
      floor: '#173f4d',
      gridPrimary: '#2dd4bf',
      gridSecondary: '#286274',
      wall: '#143746',
      wallSecondary: '#194455',
      wallAccent: '#362b57',
    },
  },

  solaris: {
    id: 'solaris',
    surfaceFamily: 'daylight',
    environment: 'solar-wind',
    name: 'Solaris',
    description: 'Immersive bright azure command center with white-blue solar plasma and Core cyan.',
    icon: '☼',
    appearance: 'light',
    performance: 'immersive',
    three: {
      background: '#eaf8ff',
      fog: '#d8f1ff',
      star: '#00bfe8',
      ambientIntensity: 1.38,
      floor: '#dff3fc',
      gridPrimary: '#00a8d4',
      gridSecondary: '#8fcbe8',
      wall: '#f4fbff',
      wallSecondary: '#e4f5ff',
      wallAccent: '#4b8cff',
    },
  },

  obsidian: {
    id: 'obsidian',
    surfaceFamily: 'holographic',
    environment: 'technical-grid',
    name: 'Obsidian',
    description: 'Static dark command interface. Zero motion, no decorative WebGL, optimized for lower-power devices.',
    icon: '◆',
    appearance: 'dark',
    performance: 'static',
    // Compatibility palette for chart components while they migrate to 2.5D.
    // Static themes should not mount decorative Three.js scenes.
    three: {
      background: '#020812',
      fog: '#020812',
      star: '#28d7e8',
      ambientIntensity: 0.75,
      floor: '#071827',
      gridPrimary: '#1385a6',
      gridSecondary: '#0b3448',
      wall: '#07131f',
      wallSecondary: '#0a1a29',
      wallAccent: '#10263a',
    },
  },

  quartz: {
    id: 'quartz',
    surfaceFamily: 'daylight',
    environment: 'technical-grid',
    name: 'Quartz',
    description: 'Static light crystalline interface. Zero motion, no decorative WebGL, optimized for lower-power devices.',
    icon: '◇',
    appearance: 'light',
    performance: 'static',
    // Compatibility palette for chart components while they migrate to 2.5D.
    // Static themes should not mount decorative Three.js scenes.
    three: {
      background: '#edf8fc',
      fog: '#e1f1f7',
      star: '#089fc5',
      ambientIntensity: 1.25,
      floor: '#e2f1f6',
      gridPrimary: '#169dbc',
      gridSecondary: '#a8d5e2',
      wall: '#f7fcfe',
      wallSecondary: '#e9f6fa',
      wallAccent: '#7acbe0',
    },
  },

  'jec-horizon': {
    id: 'jec-horizon',
    surfaceFamily: 'clinical',
    fullscreenTone: 'dark-stage',
    environment: 'field',
    name: 'JEC Horizon',
    description: 'Static bright JEC blue command interface with clean clinical glass and brand-forward azure accents.',
    icon: '▰',
    appearance: 'light',
    performance: 'static',
    three: {
      background: '#eef9ff',
      fog: '#dff3ff',
      star: '#168fd3',
      ambientIntensity: 1.28,
      floor: '#d9effa',
      gridPrimary: '#168fd3',
      gridSecondary: '#9ccfe8',
      wall: '#f8fdff',
      wallSecondary: '#e6f5fc',
      wallAccent: '#0072bc',
    },
  },

  'jec-skywave': {
    id: 'jec-skywave',
    surfaceFamily: 'clinical',
    fullscreenTone: 'dark-stage',
    environment: 'field',
    name: 'JEC Skywave',
    description: 'Immersive bright JEC blue atmosphere with animated sky-energy waves, luminous data grid and clinical glass.',
    icon: '≋',
    appearance: 'light',
    performance: 'immersive',
    three: {
      background: '#e8f7ff',
      fog: '#d5effc',
      star: '#168fd3',
      ambientIntensity: 1.42,
      floor: '#d8effa',
      gridPrimary: '#0072bc',
      gridSecondary: '#8fc9e6',
      wall: '#f5fcff',
      wallSecondary: '#dff2fb',
      wallAccent: '#00a7e1',
    },
  },

} as const satisfies Record<string, CoreThemeDefinition>;

export type CoreThemeId = keyof typeof CORE_THEMES;
export const CORE_THEME_LIST = Object.values(CORE_THEMES);

export const isCoreThemeId = (value: string | null): value is CoreThemeId =>
  value !== null && Object.prototype.hasOwnProperty.call(CORE_THEMES, value);

export const getThemeEnvironment = (theme: CoreThemeDefinition): CoreEnvironment =>
  theme.environment ?? (theme.performance === 'static' ? 'technical-grid' : 'space');

export const getShellComposition = (theme: CoreThemeDefinition): 'layered' | 'opaque' =>
  getThemeEnvironment(theme) === 'field' ? 'layered' : 'opaque';

/** Design System material recipe; independent of the decorative renderer. */
export const getSurfaceFamily = (theme: CoreThemeDefinition): CoreSurfaceFamily =>
  theme.surfaceFamily ?? (theme.appearance === 'light' ? 'daylight' : 'holographic');
