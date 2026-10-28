export type CoreThemeId = 'cosmic-black' | 'aurora' | 'solaris';

export interface CoreThemeDefinition {
  id: CoreThemeId;
  name: string;
  description: string;
  icon: string;
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

export const CORE_THEMES: Record<CoreThemeId, CoreThemeDefinition> = {
  'cosmic-black': {
    id: 'cosmic-black',
    name: 'Cosmic Black',
    description: 'Deep-space command center with cyan neon and dark glass.',
    icon: '✦',
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

  'aurora': {
    id: 'aurora',
    name: 'Aurora',
    description: 'Luminous aurora command center with cyan, teal, violet and magenta energy.',
    icon: '◈',
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

  'solaris': {
    id: 'solaris',
    name: 'Solaris',
    description: 'Bright azure command center with white-blue solar plasma and Core cyan.',
    icon: '☼',
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
};

export const isCoreThemeId = (value: string | null): value is CoreThemeId =>
  value === 'cosmic-black' || value === 'aurora' || value === 'solaris';
