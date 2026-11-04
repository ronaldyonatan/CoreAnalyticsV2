import { spaceLogin, curtainLogin, solarLogin, darkStaticLogin, lightStaticLogin, staticFieldLogin, animatedFieldLogin } from './login-config';
import type { LoginConfiguration } from './login-config';
import { deepSpaceCharts, daylightCharts, luminousCharts, clinicalCharts } from './renderer-config';
import type { ChartRenderers, ScenePalette } from './renderer-config';
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
  login: LoginConfiguration;
  three: ScenePalette & { renderers: ChartRenderers };
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
    login: spaceLogin,
    three: {
      renderers: deepSpaceCharts,
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
    login: curtainLogin,
    three: {
      renderers: luminousCharts,
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
    login: solarLogin,
    three: {
      renderers: daylightCharts,
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
    login: darkStaticLogin,
    three: {
      renderers: deepSpaceCharts,
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
    login: lightStaticLogin,
    three: {
      renderers: {
        ...deepSpaceCharts,
        DemographyChart: { ...deepSpaceCharts.DemographyChart, lightMaterials: true },
        IOLUsage: { ...deepSpaceCharts.IOLUsage, lightMaterials: true },
      },
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
    name: 'Horizon',
    description: 'Static bright blue command interface with clean clinical glass and brand-forward azure accents.',
    icon: '▰',
    appearance: 'light',
    performance: 'static',
    login: staticFieldLogin,
    three: {
      renderers: clinicalCharts,
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
    name: 'Skywave',
    description: 'Immersive bright blue atmosphere with animated sky-energy waves, luminous data grid and clinical glass.',
    icon: '≋',
    appearance: 'light',
    performance: 'immersive',
    login: animatedFieldLogin,
    three: {
      renderers: clinicalCharts,
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

  'lunar-eclipse': {
    id: 'lunar-eclipse',
    name: 'Lunar Eclipse',
    description: 'Midnight indigo and silver glass with a shadowed lunar core, an asymmetric ice-cyan corona and sparse stars.',
    icon: '◐',
    appearance: 'dark',
    performance: 'immersive',
    environment: 'space',
    surfaceFamily: 'holographic',
    login: {
      ...spaceLogin,
      // Explicit user preference: full motion for Lunar, including OS Reduced Motion.
      // Scoped utilities opt only this recipe into the existing animation keyframes.
      rootClassName: String.raw`login-jec-skywave-mode bg-[#080b19] bg-[image:var(--lunar-atmosphere)] before:content-[""] before:absolute before:inset-[-8%] before:pointer-events-none before:bg-[image:var(--lunar-drifting-field)] before:animate-[orbMistDrift_22s_ease-in-out_infinite_alternate] [&_.jec-brand-orb\_\_shell]:before:animate-[var(--orb-nebula-motion)] [&_.jec-brand-orb\_\_shell]:after:animate-[var(--orb-star-motion)]`,
      gatewayTitle: 'LUNAR ECLIPSE GATEWAY',
      networkLabel: 'LUNAR OBSERVATORY // 08',
      coreLabel: 'LUNAR FRIDAY CORE',
      spaceBackdrop: false,
      neuralCore: false,
      brandOrb: true,
      nebula: false,
      coreHaloSizeClassName: 'lg:h-[240px] lg:w-[240px] md:h-[330px] md:w-[330px]',
      coreHaloEffectClassName: 'rounded-full blur-[78px] opacity-55',
      starColor: '#c3dcf4',
      coreDirectionalColor: '#e8f3ff',
    },
    three: {
      background: '#080b19', fog: '#0c1023', star: '#c3dcf4', ambientIntensity: .9,
      floor: '#11162d', gridPrimary: '#627d9e', gridSecondary: '#242d48',
      wall: '#10152a', wallSecondary: '#161c36', wallAccent: '#6d67ac',
      renderers: {
        ...deepSpaceCharts,
        Panel1Revenue: {
          ...deepSpaceCharts.Panel1Revenue,
          palette: {"background":"#070915","fog":"#070915","floor":"#0b0f21","grid1":"#3c769f","grid2":"#171f46","previous":"#3f86b8","previousEmissive":"#336487","current":"#619fca","currentEmissive":"#3f7da9","radiantOuter":"#629ac3","radiantOuterEmissive":"#336487","radiantInner":"#619fca","radiantInnerEmissive":"#3f7da9","target":"#f59e0b","scanner":"#adcbe1","scannerSecondary":"#76a6c8","wall":"#0a0e1f","sideWall":"#0f1329","text":"#e0ecf5"},
          pointLightColor: "#77a6c7",
          backplateColor: "#101320",
        },
        PanelExsumRevenue: {
          ...deepSpaceCharts.PanelExsumRevenue,
          colors: ["#619fca","#629fcb","#629fcb","#629fcb","#629fcb","#9cc2de","#bad5e8","#d9e8f2","#e0ecf5","#e6e0f5"],
          backgroundColor: "#070915",
          fogColor: "#070915",
          pointLightColor: "#619fca",
          pointLightColor2: "#77a6c7",
          backplateColor: "#0a0e1f",
          gridPrimaryColor: "#3c769f",
          gridSecondaryColor: "#171f46",
          secondaryMaterialColor: "#090d1c",
          textShadow: "#619fca",
          textColor: "#e0ecf5",
          ledgerPalette: {"wall":"#070915","frame":"#121937","screen":"#0b0e20","cell":"#121735","edge":"#619fca","text":"#e0ecf5","muted":"#d9e8f2","pos":"#759dba","neg":"#fb7185","amber":"#fbbf24","glow":"#619fca"},
          hoverColor: "#202b61",
          pointLightColor3: "#77a6c7",
          tertiaryMaterialColor: "#0b0f23",
          scannerGlowColor: "rgba(97,159,202,.62)",
          background: "linear-gradient(90deg, transparent, rgba(97,159,202,.020), rgba(118,166,200,.060), rgba(97,159,202,.10), transparent)",
        },
        PanelExsumMaterial: {
          ...deepSpaceCharts.PanelExsumMaterial,
          colors: ["#619fca","#629fcb","#629fcb","#629fcb","#629fcb","#9cc2de","#bad5e8","#d9e8f2","#e0ecf5","#e6e0f5"],
          backgroundColor: "#070915",
          fogColor: "#070915",
          pointLightColor: "#619fca",
          pointLightColor2: "#77a6c7",
          backplateColor: "#0a0e1f",
          gridPrimaryColor: "#3c769f",
          gridSecondaryColor: "#171f46",
          secondaryMaterialColor: "#090d1c",
          textShadow: "#619fca",
          textColor: "#e0ecf5",
          ledgerPalette: {"wall":"#070915","frame":"#121937","screen":"#0b0e20","cell":"#121735","edge":"#619fca","text":"#e0ecf5","muted":"#d9e8f2","pos":"#759dba","neg":"#fb7185","amber":"#fbbf24","glow":"#619fca"},
          hoverColor: "#202b61",
          pointLightColor3: "#77a6c7",
          tertiaryMaterialColor: "#0b0f23",
          scannerGlowColor: "rgba(97,159,202,.62)",
          background: "linear-gradient(90deg,transparent,rgba(97,159,202,.020),rgba(118,166,200,.060),rgba(97,159,202,.10),transparent)",
        },
        PanelExsumDoctorFee: {
          ...deepSpaceCharts.PanelExsumDoctorFee,
          colors: ["#619fca","#629fcb","#629fcb","#629fcb","#629fcb","#9cc2de","#bad5e8","#d9e8f2","#e0ecf5","#e6e0f5"],
          backgroundColor: "#070915",
          fogColor: "#070915",
          pointLightColor: "#619fca",
          pointLightColor2: "#77a6c7",
          backplateColor: "#0a0e1f",
          gridPrimaryColor: "#3c769f",
          gridSecondaryColor: "#171f46",
          secondaryMaterialColor: "#090d1c",
          textShadow: "#619fca",
          textColor: "#e0ecf5",
          ledgerPalette: {"wall":"#070915","frame":"#121937","screen":"#0b0e20","cell":"#121735","edge":"#619fca","text":"#e0ecf5","muted":"#d9e8f2","pos":"#759dba","neg":"#fb7185","amber":"#fbbf24","glow":"#619fca"},
          hoverColor: "#202b61",
          pointLightColor3: "#77a6c7",
          tertiaryMaterialColor: "#0b0f23",
          scannerGlowColor: "rgba(97,159,202,.62)",
          background: "linear-gradient(90deg,transparent,rgba(97,159,202,.020),rgba(118,166,200,.060),rgba(97,159,202,.10),transparent)",
        },
        DailyRevenueChart: {
          ...deepSpaceCharts.DailyRevenueChart,
          backgroundColor: "#070915",
          fogColor: "#070915",
          directionalLightColor: "#e0ecf5",
          pointLightColor: "#629fcb",
          backplateColor: "#0a0e1f",
          secondaryMaterialColor: "#0c1025",
          tertiaryMaterialColor: "#0c1025",
          horizontalGridColor: "#3c769f",
          verticalGridColor: "#212c64",
          gridPrimaryColor: "#3c769f",
          gridSecondaryColor: "#171f46",
          floorColor: "#0b0f21",
          color: "#adcbe1",
          textShadow: "0 0 8px #4a8ebe",
          color2: "#adcbe1",
          textShadow2: "0 0 10px #4a8ebe",
          color3: "#76a6c8",
          textShadow3: "0 0 7px #3f7da9",
          shellClassName: "bg-[#070915] border-cyan-500/40",
          headerClassName: "border-cyan-500/30 bg-gradient-to-r from-cyan-950/35 via-[#070915]/70 to-orange-950/20 shadow-[0_10px_40px_rgba(98,159,203,0.06)]",
        },
        WeeklyRevenueChart: {
          ...deepSpaceCharts.WeeklyRevenueChart,
          backgroundColor: "#070915",
          fogColor: "#070915",
          backplateColor: "#0a0e1f",
          secondaryMaterialColor: "#0c1025",
          tertiaryMaterialColor: "#0c1025",
          horizontalGridColor: "#3c769f",
          verticalGridColor: "#212c64",
          gridPrimaryColor: "#3c769f",
          gridSecondaryColor: "#171f46",
          floorColor: "#0b0f21",
          shellClassName: "bg-[#070915] border-cyan-500/40",
          headerClassName: "border-cyan-500/30 bg-gradient-to-r from-cyan-950/35 via-[#070915]/80 to-orange-950/20 shadow-[0_10px_40px_rgba(98,159,203,0.06)]",
        },
        MonthlyRevenueChart: {
          ...deepSpaceCharts.MonthlyRevenueChart,
          backgroundColor: "#070915",
          fogColor: "#070915",
          backplateColor: "#0a0e1f",
          gridPrimaryColor: "#3c769f",
          gridSecondaryColor: "#171f46",
          floorColor: "#0b0f21",
          shellClassName: "bg-[#070915] border-cyan-500/40",
        },
        SurgeryBdChart: {
          ...deepSpaceCharts.SurgeryBdChart,
          backgroundColor: "#070915",
          fogColor: "#070915",
          backplateColor: "#0a0e1f",
          secondaryMaterialColor: "#0c1025",
          tertiaryMaterialColor: "#0c1025",
          horizontalGridColor: "#3c769f",
          verticalGridColor: "#212c64",
          gridPrimaryColor: "#3c769f",
          gridSecondaryColor: "#171f46",
          floorColor: "#0b0f21",
          shellClassName: "bg-[#070915] border-cyan-500/40",
          headerClassName: "border-cyan-500/30 bg-gradient-to-r from-cyan-950/35 via-[#070915]/80 to-orange-950/20 shadow-[0_10px_40px_rgba(98,159,203,0.06)]",
        },
        PerChannel3DChart: {
          ...deepSpaceCharts.PerChannel3DChart,
          backgroundColor: "#060811",
          fogColor: "#060811",
          floorColor: "#090c1b",
          gridPrimaryColor: "#212c64",
          gridSecondaryColor: "#121836",
          meshStandardMaterialColor2: "#060812",
          shellClassName: "border-cyan-500/30 bg-[#060811]",
        },
      },
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
