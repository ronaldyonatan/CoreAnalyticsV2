export interface ScenePalette {
  background: string; fog: string; star: string; ambientIntensity: number;
  floor: string; gridPrimary: string; gridSecondary: string;
  wall: string; wallSecondary: string; wallAccent: string;
}

// Renderer values preserve the approved scene materials; no theme identity is read here.
export interface ChartRenderers {
  DemographyChart: { scene: Partial<ScenePalette>; lightMaterials: boolean; background: string; borderColor: string; color: string };
  IOLUsage: { lightMaterials: boolean; borderColor: string; background: string };
  Panel1Revenue: {
    palette: { background: string; fog: string; floor: string; grid1: string; grid2: string; previous: string; previousEmissive: string; current: string; currentEmissive: string; radiantOuter: string; radiantOuterEmissive: string; radiantInner: string; radiantInnerEmissive: string; target: string; scanner: string; scannerSecondary: string; wall: string; sideWall: string; text: string };
    ambientLightIntensity: number;
    pointLightColor: string;
    backplateColor: string;
  };
  PanelExsumRevenue: {
    colors: string[];
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    pointLightColor: string;
    pointLightColor2: string;
    backplateColor: string;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    secondaryMaterialColor: string;
    textShadow: string;
    textColor: string;
    ledgerPalette: { wall: string; frame: string; screen: string; cell: string; edge: string; text: string; muted: string; pos: string; neg: string; amber: string; glow: string };
    hoverColor: string;
    animatedBackdrop: boolean;
    pointLightColor3: string;
    tertiaryMaterialColor: string;
    scannerGlowColor: string;
    background: string;
  };
  PanelExsumMaterial: {
    colors: string[];
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    pointLightColor: string;
    pointLightColor2: string;
    backplateColor: string;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    secondaryMaterialColor: string;
    textShadow: string;
    textColor: string;
    ledgerPalette: { wall: string; frame: string; screen: string; cell: string; edge: string; text: string; muted: string; pos: string; neg: string; amber: string; glow: string };
    hoverColor: string;
    pointLightColor3: string;
    tertiaryMaterialColor: string;
    backplateOpacity: number;
    scannerGlowColor: string;
    background: string;
    surfaceBlend: number;
  };
  PanelExsumDoctorFee: {
    colors: string[];
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    pointLightColor: string;
    pointLightColor2: string;
    backplateColor: string;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    secondaryMaterialColor: string;
    textShadow: string;
    textColor: string;
    ledgerPalette: { wall: string; frame: string; screen: string; cell: string; edge: string; text: string; muted: string; pos: string; neg: string; amber: string; glow: string };
    hoverColor: string;
    pointLightColor3: string;
    tertiaryMaterialColor: string;
    backplateOpacity: number;
    scannerGlowColor: string;
    background: string;
    surfaceBlend: number;
  };

  DailyRevenueChart: {
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    directionalLightIntensity: number;
    directionalLightColor: string;
    pointLightIntensity: number;
    pointLightColor: string;
    pointLightIntensity2: number;
    pointLightColor2: string;
    pointLightIntensity3: number;
    pointLightColor3: string;
    backplateColor: string;
    backplateOpacity: number;
    backplateRoughness: number;
    backplateMetalness: number;
    secondaryMaterialColor: string;
    secondaryMaterialOpacity: number;
    secondaryMaterialRoughness: number;
    secondaryMaterialMetalness: number;
    tertiaryMaterialColor: string;
    tertiaryMaterialOpacity: number;
    tertiaryMaterialRoughness: number;
    tertiaryMaterialMetalness: number;
    horizontalGridColor: string;
    verticalGridColor: string;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    floorColor: string;
    floorMetalness: number;
    floorRoughness: number;
    floorOpacity: number;
    color: string;
    textShadow: string;
    color2: string;
    textShadow2: string;
    color3: string;
    textShadow3: string;
    shellClassName: string;
    headerClassName: string;
  };
  WeeklyRevenueChart: {
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    backplateColor: string;
    backplateOpacity: number;
    backplateRoughness: number;
    backplateMetalness: number;
    secondaryMaterialColor: string;
    secondaryMaterialOpacity: number;
    secondaryMaterialRoughness: number;
    secondaryMaterialMetalness: number;
    tertiaryMaterialColor: string;
    tertiaryMaterialOpacity: number;
    tertiaryMaterialRoughness: number;
    tertiaryMaterialMetalness: number;
    horizontalGridColor: string;
    verticalGridColor: string;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    floorColor: string;
    floorMetalness: number;
    floorRoughness: number;
    floorOpacity: number;
    shellClassName: string;
    headerClassName: string;
  };
  MonthlyRevenueChart: {
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    backplateColor: string;
    backplateOpacity: number;
    backplateMetalness: number;
    backplateRoughness: number;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    floorColor: string;
    floorMetalness: number;
    floorRoughness: number;
    floorOpacity: number;
    shellClassName: string;
  };
  SurgeryBdChart: {
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    backplateColor: string;
    backplateOpacity: number;
    backplateRoughness: number;
    backplateMetalness: number;
    secondaryMaterialColor: string;
    secondaryMaterialOpacity: number;
    secondaryMaterialRoughness: number;
    secondaryMaterialMetalness: number;
    tertiaryMaterialColor: string;
    tertiaryMaterialOpacity: number;
    tertiaryMaterialRoughness: number;
    tertiaryMaterialMetalness: number;
    horizontalGridColor: string;
    verticalGridColor: string;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    floorColor: string;
    shellClassName: string;
    headerClassName: string;
  };
  PerChannel3DChart: {
    backgroundColor: string;
    fogColor: string;
    ambientLightIntensity: number;
    floorColor: string;
    floorOpacity: number;
    gridPrimaryColor: string;
    gridSecondaryColor: string;
    meshStandardMaterialColor2: string;
    meshStandardMaterialOpacity2: number;
    shellClassName: string;
  };
}

export const deepSpaceCharts: ChartRenderers = {
  DemographyChart: { scene: {}, lightMaterials: false, background: 'var(--core-bg-secondary)', borderColor: 'var(--core-border)', color: 'var(--core-text)' },
  IOLUsage: { lightMaterials: false, borderColor: 'var(--core-border)', background: 'var(--core-panel)' },

  Panel1Revenue: {
    palette: {"background":"#020916","fog":"#020916","floor":"#031523","grid1":"#087da5","grid2":"#07304a","previous":"#0284c7","previousEmissive":"#075985","current":"#00f2fe","currentEmissive":"#0891b2","radiantOuter":"#0ea5e9","radiantOuterEmissive":"#075985","radiantInner":"#00f2fe","radiantInnerEmissive":"#0891b2","target":"#f59e0b","scanner":"#67e8f9","scannerSecondary":"#22d3ee","wall":"#031321","sideWall":"#07142a","text":"#e8fdff"},
    ambientLightIntensity: 0.9,
    pointLightColor: "#2563eb",
    backplateColor: "#1a0a20",
  },
  PanelExsumRevenue: {
    colors: ["#00f2fe","#00d4ff","#00b7ff","#0099ff","#007aff","#4d8aff","#759dff","#9fb0ff","#c5c4ff","#e0d8ff"],
    backgroundColor: "#020916",
    fogColor: "#020916",
    ambientLightIntensity: 0.9,
    pointLightColor: "#00f2fe",
    pointLightColor2: "#2563eb",
    backplateColor: "#031321",
    gridPrimaryColor: "#087da5",
    gridSecondaryColor: "#07304a",
    secondaryMaterialColor: "#03111e",
    textShadow: "#00f2fe",
    textColor: "#b9f8ff",
    ledgerPalette: {"wall":"#020916","frame":"#06263a","screen":"#031522","cell":"#052338","edge":"#00f2fe","text":"#efffff","muted":"#9eefff","pos":"#2dd4bf","neg":"#fb7185","amber":"#fbbf24","glow":"#00f2fe"},
    hoverColor: "#07516a",
    animatedBackdrop: false,
    pointLightColor3: "#2563eb",
    tertiaryMaterialColor: "#031725",
    scannerGlowColor: "rgba(0,242,254,.62)",
    background: "linear-gradient(90deg, transparent, rgba(0,242,254,.020), rgba(34,211,238,.060), rgba(0,242,254,.10), transparent)",
  },
  PanelExsumMaterial: {
    colors: ["#00f2fe","#00d4ff","#00b7ff","#0099ff","#007aff","#4d8aff","#759dff","#9fb0ff","#c5c4ff","#e0d8ff"],
    backgroundColor: "#020916",
    fogColor: "#020916",
    ambientLightIntensity: 0.9,
    pointLightColor: "#00f2fe",
    pointLightColor2: "#2563eb",
    backplateColor: "#031321",
    gridPrimaryColor: "#087da5",
    gridSecondaryColor: "#07304a",
    secondaryMaterialColor: "#03111e",
    textShadow: "#00f2fe",
    textColor: "#b9f8ff",
    ledgerPalette: {"wall":"#020916","frame":"#06263a","screen":"#031522","cell":"#052338","edge":"#00f2fe","text":"#efffff","muted":"#9eefff","pos":"#2dd4bf","neg":"#fb7185","amber":"#fbbf24","glow":"#00f2fe"},
    hoverColor: "#07516a",
    pointLightColor3: "#2563eb",
    tertiaryMaterialColor: "#031725",
    backplateOpacity: 0.9,
    scannerGlowColor: "rgba(0,242,254,.62)",
    background: "linear-gradient(90deg,transparent,rgba(0,242,254,.020),rgba(34,211,238,.060),rgba(0,242,254,.10),transparent)",
    surfaceBlend: 0,
  },
  PanelExsumDoctorFee: {
    colors: ["#00f2fe","#00d4ff","#00b7ff","#0099ff","#007aff","#4d8aff","#759dff","#9fb0ff","#c5c4ff","#e0d8ff"],
    backgroundColor: "#020916",
    fogColor: "#020916",
    ambientLightIntensity: 0.9,
    pointLightColor: "#00f2fe",
    pointLightColor2: "#2563eb",
    backplateColor: "#031321",
    gridPrimaryColor: "#087da5",
    gridSecondaryColor: "#07304a",
    secondaryMaterialColor: "#03111e",
    textShadow: "#00f2fe",
    textColor: "#b9f8ff",
    ledgerPalette: {"wall":"#020916","frame":"#06263a","screen":"#031522","cell":"#052338","edge":"#00f2fe","text":"#efffff","muted":"#9eefff","pos":"#2dd4bf","neg":"#fb7185","amber":"#fbbf24","glow":"#00f2fe"},
    hoverColor: "#07516a",
    pointLightColor3: "#2563eb",
    tertiaryMaterialColor: "#031725",
    backplateOpacity: 0.9,
    scannerGlowColor: "rgba(0,242,254,.62)",
    background: "linear-gradient(90deg,transparent,rgba(0,242,254,.020),rgba(34,211,238,.060),rgba(0,242,254,.10),transparent)",
    surfaceBlend: 0,
  },

  DailyRevenueChart: {
    backgroundColor: "#020916",
    fogColor: "#020916",
    ambientLightIntensity: 1.15,
    directionalLightIntensity: 2.4,
    directionalLightColor: "#b9f7ff",
    pointLightIntensity: 38,
    pointLightColor: "#00cfff",
    pointLightIntensity2: 28,
    pointLightColor2: "#00d084",
    pointLightIntensity3: 18,
    pointLightColor3: "#ff8a1f",
    backplateColor: "#031321",
    backplateOpacity: 0.78,
    backplateRoughness: 0.28,
    backplateMetalness: 0.45,
    secondaryMaterialColor: "#041727",
    secondaryMaterialOpacity: 0.72,
    secondaryMaterialRoughness: 0.3,
    secondaryMaterialMetalness: 0.5,
    tertiaryMaterialColor: "#041727",
    tertiaryMaterialOpacity: 0.72,
    tertiaryMaterialRoughness: 0.3,
    tertiaryMaterialMetalness: 0.5,
    horizontalGridColor: "#087da5",
    verticalGridColor: "#07506d",
    gridPrimaryColor: "#087da5",
    gridSecondaryColor: "#07304a",
    floorColor: "#031523",
    floorMetalness: 0.62,
    floorRoughness: 0.3,
    floorOpacity: 0.92,
    color: "#67e8f9",
    textShadow: "0 0 8px #06b6d4",
    color2: "#67e8f9",
    textShadow2: "0 0 10px #06b6d4",
    color3: "#22d3ee",
    textShadow3: "0 0 7px #0891b2",
    shellClassName: "bg-[#020916] border-cyan-500/40",
    headerClassName: "border-cyan-500/30 bg-gradient-to-r from-cyan-950/35 via-[#020916]/70 to-orange-950/20 shadow-[0_10px_40px_rgba(0,191,255,0.06)]",
  },
  WeeklyRevenueChart: {
    backgroundColor: "#020916",
    fogColor: "#020916",
    ambientLightIntensity: 1.15,
    backplateColor: "#031321",
    backplateOpacity: 0.78,
    backplateRoughness: 0.28,
    backplateMetalness: 0.45,
    secondaryMaterialColor: "#041727",
    secondaryMaterialOpacity: 0.72,
    secondaryMaterialRoughness: 0.3,
    secondaryMaterialMetalness: 0.5,
    tertiaryMaterialColor: "#041727",
    tertiaryMaterialOpacity: 0.72,
    tertiaryMaterialRoughness: 0.3,
    tertiaryMaterialMetalness: 0.5,
    horizontalGridColor: "#087da5",
    verticalGridColor: "#07506d",
    gridPrimaryColor: "#087da5",
    gridSecondaryColor: "#07304a",
    floorColor: "#031523",
    floorMetalness: 0.62,
    floorRoughness: 0.3,
    floorOpacity: 0.92,
    shellClassName: "bg-[#020916] border-cyan-500/40",
    headerClassName: "border-cyan-500/30 bg-gradient-to-r from-cyan-950/35 via-[#020916]/80 to-orange-950/20 shadow-[0_10px_40px_rgba(0,191,255,0.06)]",
  },
  MonthlyRevenueChart: {
    backgroundColor: "#020916",
    fogColor: "#020916",
    ambientLightIntensity: 1.15,
    backplateColor: "#031321",
    backplateOpacity: 0.82,
    backplateMetalness: 0.4,
    backplateRoughness: 0.32,
    gridPrimaryColor: "#087da5",
    gridSecondaryColor: "#07304a",
    floorColor: "#031523",
    floorMetalness: 0.6,
    floorRoughness: 0.3,
    floorOpacity: 0.92,
    shellClassName: "bg-[#020916] border-cyan-500/40",
  },
  SurgeryBdChart: {
    backgroundColor: "#020916",
    fogColor: "#020916",
    ambientLightIntensity: 1.1,
    backplateColor: "#031321",
    backplateOpacity: 0.8,
    backplateRoughness: 0.28,
    backplateMetalness: 0.45,
    secondaryMaterialColor: "#041727",
    secondaryMaterialOpacity: 0.74,
    secondaryMaterialRoughness: 0.3,
    secondaryMaterialMetalness: 0.5,
    tertiaryMaterialColor: "#041727",
    tertiaryMaterialOpacity: 0.74,
    tertiaryMaterialRoughness: 0.3,
    tertiaryMaterialMetalness: 0.5,
    horizontalGridColor: "#087da5",
    verticalGridColor: "#07506d",
    gridPrimaryColor: "#087da5",
    gridSecondaryColor: "#07304a",
    floorColor: "#031523",
    shellClassName: "bg-[#020916] border-cyan-500/40",
    headerClassName: "border-cyan-500/30 bg-gradient-to-r from-cyan-950/35 via-[#020916]/80 to-orange-950/20 shadow-[0_10px_40px_rgba(0,191,255,0.06)]",
  },
  PerChannel3DChart: {
    backgroundColor: "#010812",
    fogColor: "#010812",
    ambientLightIntensity: 0.95,
    floorColor: "#02101d",
    floorOpacity: 0.48,
    gridPrimaryColor: "#07506d",
    gridSecondaryColor: "#04283b",
    meshStandardMaterialColor2: "#010b14",
    meshStandardMaterialOpacity2: 0.92,
    shellClassName: "border-cyan-500/30 bg-[#010812]",
  },
};

export const daylightCharts: ChartRenderers = {
  DemographyChart: { scene: { background: '#5f97cb', fog: '#91c8e8', floor: '#24527f', gridPrimary: '#a8e2ff', gridSecondary: '#4f7fb0', wall: '#78afd7', wallSecondary: '#6f96c9', wallAccent: '#5875bd', ambientIntensity: 1.45 }, lightMaterials: true, background: 'var(--core-bg-secondary)', borderColor: 'var(--core-border)', color: 'var(--core-text)' },
  IOLUsage: { lightMaterials: true, borderColor: 'var(--core-border)', background: 'var(--core-panel)' },

  Panel1Revenue: {
    palette: {"background":"#5f97cb","fog":"#91c8e8","floor":"#24527f","grid1":"#a8e2ff","grid2":"#4f7fb0","previous":"#3b82f6","previousEmissive":"#1d4ed8","current":"#79cfff","currentEmissive":"#287cc4","radiantOuter":"#9bdcff","radiantOuterEmissive":"#287cc4","radiantInner":"#d7f3ff","radiantInnerEmissive":"#4b9bdd","target":"#5b6ee1","scanner":"#c3ecff","scannerSecondary":"#6f8cff","wall":"#78afd7","sideWall":"#5875bd","text":"#f8fdff"},
    ambientLightIntensity: 1.18,
    pointLightColor: "#6f8cff",
    backplateColor: "#73a5ce",
  },
  PanelExsumRevenue: {
    colors: ["#2f80ed","#318cff","#54a8ff","#79c7ff","#9cdaff","#c6edff","#6f93ff","#4e73dc","#a9c8ff","#e0f5ff"],
    backgroundColor: "#5f97cb",
    fogColor: "#91c8e8",
    ambientLightIntensity: 1.22,
    pointLightColor: "#79cfff",
    pointLightColor2: "#6f8cff",
    backplateColor: "#78afd7",
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f7fb0",
    secondaryMaterialColor: "#03111e",
    textShadow: "#00f2fe",
    textColor: "#b9f8ff",
    ledgerPalette: {"wall":"#5f97cb","frame":"#4f7fb0","screen":"#4a82b8","cell":"#74acd4","edge":"#a8e2ff","text":"#f8fdff","muted":"#d7ebf8","pos":"#8fd2ff","neg":"#f05a7a","amber":"#6f8cff","glow":"#79cfff"},
    hoverColor: "#80b5da",
    animatedBackdrop: true,
    pointLightColor3: "#6f8cff",
    tertiaryMaterialColor: "#74acd4",
    scannerGlowColor: "rgba(0,242,254,.62)",
    background: "linear-gradient(90deg, transparent, rgba(0,242,254,.020), rgba(34,211,238,.060), rgba(0,242,254,.10), transparent)",
  },
  PanelExsumMaterial: {
    colors: ["#2f80ed","#318cff","#54a8ff","#79c7ff","#9cdaff","#c6edff","#6f93ff","#4e73dc","#a9c8ff","#e0f5ff"],
    backgroundColor: "#5f97cb",
    fogColor: "#91c8e8",
    ambientLightIntensity: 1.22,
    pointLightColor: "#79cfff",
    pointLightColor2: "#6f8cff",
    backplateColor: "#78afd7",
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f7fb0",
    secondaryMaterialColor: "#03111e",
    textShadow: "#00f2fe",
    textColor: "#b9f8ff",
    ledgerPalette: {"wall":"#5f97cb","frame":"#4f7fb0","screen":"#4a82b8","cell":"#74acd4","edge":"#a8e2ff","text":"#f8fdff","muted":"#d7ebf8","pos":"#8fd2ff","neg":"#f05a7a","amber":"#6f8cff","glow":"#79cfff"},
    hoverColor: "#80b5da",
    pointLightColor3: "#6f8cff",
    tertiaryMaterialColor: "#74acd4",
    backplateOpacity: 0.84,
    scannerGlowColor: "rgba(0,242,254,.62)",
    background: "linear-gradient(90deg,transparent,rgba(0,242,254,.020),rgba(34,211,238,.060),rgba(0,242,254,.10),transparent)",
    surfaceBlend: 1,
  },
  PanelExsumDoctorFee: {
    colors: ["#2f80ed","#318cff","#54a8ff","#79c7ff","#9cdaff","#c6edff","#6f93ff","#4e73dc","#a9c8ff","#e0f5ff"],
    backgroundColor: "#5f97cb",
    fogColor: "#91c8e8",
    ambientLightIntensity: 1.22,
    pointLightColor: "#79cfff",
    pointLightColor2: "#6f8cff",
    backplateColor: "#78afd7",
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f7fb0",
    secondaryMaterialColor: "#03111e",
    textShadow: "#00f2fe",
    textColor: "#b9f8ff",
    ledgerPalette: {"wall":"#5f97cb","frame":"#4f7fb0","screen":"#4a82b8","cell":"#74acd4","edge":"#a8e2ff","text":"#f8fdff","muted":"#d7ebf8","pos":"#8fd2ff","neg":"#f05a7a","amber":"#6f8cff","glow":"#79cfff"},
    hoverColor: "#80b5da",
    pointLightColor3: "#6f8cff",
    tertiaryMaterialColor: "#74acd4",
    backplateOpacity: 0.84,
    scannerGlowColor: "rgba(0,242,254,.62)",
    background: "linear-gradient(90deg,transparent,rgba(0,242,254,.020),rgba(34,211,238,.060),rgba(0,242,254,.10),transparent)",
    surfaceBlend: 1,
  },

  DailyRevenueChart: {
    backgroundColor: "#5f97cb",
    fogColor: "#91c8e8",
    ambientLightIntensity: 1.45,
    directionalLightIntensity: 2.8,
    directionalLightColor: "#eefaff",
    pointLightIntensity: 26,
    pointLightColor: "#79cfff",
    pointLightIntensity2: 20,
    pointLightColor2: "#6f8cff",
    pointLightIntensity3: 14,
    pointLightColor3: "#d7f3ff",
    backplateColor: "#78afd7",
    backplateOpacity: 0.56,
    backplateRoughness: 0.46,
    backplateMetalness: 0.18,
    secondaryMaterialColor: "#5875bd",
    secondaryMaterialOpacity: 0.38,
    secondaryMaterialRoughness: 0.5,
    secondaryMaterialMetalness: 0.16,
    tertiaryMaterialColor: "#5875bd",
    tertiaryMaterialOpacity: 0.38,
    tertiaryMaterialRoughness: 0.5,
    tertiaryMaterialMetalness: 0.16,
    horizontalGridColor: "#d7f3ff",
    verticalGridColor: "#7fb7df",
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f7fb0",
    floorColor: "#24527f",
    floorMetalness: 0.32,
    floorRoughness: 0.46,
    floorOpacity: 0.9,
    color: "#f3fbff",
    textShadow: "0 1px 4px rgba(8,47,73,.55)",
    color2: "#f3fbff",
    textShadow2: "0 1px 4px rgba(8,47,73,.55)",
    color3: "#e7f7ff",
    textShadow3: "0 1px 4px rgba(8,47,73,.55)",
    shellClassName: "bg-[#dff2ff] border-blue-400/35",
    headerClassName: "border-blue-400/25 bg-gradient-to-r from-sky-100/95 via-blue-50/95 to-indigo-100/80 shadow-[0_10px_34px_rgba(49,140,255,.08)]",
  },
  WeeklyRevenueChart: {
    backgroundColor: "#5f97cb",
    fogColor: "#91c8e8",
    ambientLightIntensity: 1.45,
    backplateColor: "#78afd7",
    backplateOpacity: 0.56,
    backplateRoughness: 0.46,
    backplateMetalness: 0.18,
    secondaryMaterialColor: "#5875bd",
    secondaryMaterialOpacity: 0.38,
    secondaryMaterialRoughness: 0.5,
    secondaryMaterialMetalness: 0.16,
    tertiaryMaterialColor: "#5875bd",
    tertiaryMaterialOpacity: 0.38,
    tertiaryMaterialRoughness: 0.5,
    tertiaryMaterialMetalness: 0.16,
    horizontalGridColor: "#d7f3ff",
    verticalGridColor: "#7fb7df",
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f7fb0",
    floorColor: "#24527f",
    floorMetalness: 0.32,
    floorRoughness: 0.46,
    floorOpacity: 0.9,
    shellClassName: "bg-[#dff2ff] border-blue-400/35",
    headerClassName: "border-blue-400/25 bg-gradient-to-r from-sky-100/95 via-blue-50/95 to-indigo-100/80 shadow-[0_10px_34px_rgba(49,140,255,.08)]",
  },
  MonthlyRevenueChart: {
    backgroundColor: "#5f97cb",
    fogColor: "#91c8e8",
    ambientLightIntensity: 1.45,
    backplateColor: "#78afd7",
    backplateOpacity: 0.56,
    backplateMetalness: 0.18,
    backplateRoughness: 0.46,
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f7fb0",
    floorColor: "#24527f",
    floorMetalness: 0.32,
    floorRoughness: 0.46,
    floorOpacity: 0.9,
    shellClassName: "bg-[#dff2ff] border-blue-400/35",
  },
  SurgeryBdChart: {
    backgroundColor: "#79b5df",
    fogColor: "#c4e7f8",
    ambientLightIntensity: 1.45,
    backplateColor: "#b6ddf3",
    backplateOpacity: 0.56,
    backplateRoughness: 0.46,
    backplateMetalness: 0.18,
    secondaryMaterialColor: "#8fb9df",
    secondaryMaterialOpacity: 0.38,
    secondaryMaterialRoughness: 0.5,
    secondaryMaterialMetalness: 0.16,
    tertiaryMaterialColor: "#8fb9df",
    tertiaryMaterialOpacity: 0.38,
    tertiaryMaterialRoughness: 0.5,
    tertiaryMaterialMetalness: 0.16,
    horizontalGridColor: "#d7f3ff",
    verticalGridColor: "#7fb7df",
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f86bb",
    floorColor: "#245f96",
    shellClassName: "bg-[#dff2ff] border-blue-400/35",
    headerClassName: "border-blue-400/25 bg-gradient-to-r from-sky-100/95 via-blue-50/95 to-indigo-100/80 shadow-[0_10px_34px_rgba(49,140,255,.08)]",
  },
  PerChannel3DChart: {
    backgroundColor: "#5f97cb",
    fogColor: "#91c8e8",
    ambientLightIntensity: 1.4,
    floorColor: "#78afd7",
    floorOpacity: 0.55,
    gridPrimaryColor: "#a8e2ff",
    gridSecondaryColor: "#4f7fb0",
    meshStandardMaterialColor2: "#24527f",
    meshStandardMaterialOpacity2: 0.9,
    shellClassName: "border-blue-400/35 bg-[#dff2ff]",
  },
};

export const luminousCharts: ChartRenderers = {
  ...deepSpaceCharts,
  DemographyChart: { scene: {}, lightMaterials: false, background: 'var(--core-bg-secondary)', borderColor: 'var(--core-border)', color: 'var(--core-text)' },
  IOLUsage: { lightMaterials: false, borderColor: 'var(--core-border)', background: 'var(--core-panel)' },

  Panel1Revenue: {
    palette: {"background":"#0a2935","fog":"#0b2f3b","floor":"#0b2732","grid1":"#2dd4bf","grid2":"#315d69","previous":"#60a5fa","previousEmissive":"#2563eb","current":"#2dd4bf","currentEmissive":"#0f9f8c","radiantOuter":"#59e8f5","radiantOuterEmissive":"#159aaa","radiantInner":"#2dd4bf","radiantInnerEmissive":"#0f9f8c","target":"#fbbf24","scanner":"#59e8f5","scannerSecondary":"#a78bfa","wall":"#123945","sideWall":"#2f3155","text":"#eaffff"},
    ambientLightIntensity: 1.05,
    pointLightColor: "#a78bfa",
    backplateColor: "#382f57",
  },
  PanelExsumRevenue: {
    colors: ["#59e8f5","#2dd4bf","#60a5fa","#818cf8","#a78bfa","#c084fc","#5eead4","#38bdf8","#f0abfc","#bae6fd"],
    backgroundColor: "#092a35",
    fogColor: "#092a35",
    ambientLightIntensity: 1.1,
    pointLightColor: "#2dd4bf",
    pointLightColor2: "#a78bfa",
    backplateColor: "#103744",
    gridPrimaryColor: "#2dd4bf",
    gridSecondaryColor: "#315d69",
    secondaryMaterialColor: "#0d3340",
    textShadow: "#2dd4bf",
    textColor: "#baf7f4",
    ledgerPalette: {"wall":"#0a2630","frame":"#17414d","screen":"#092832","cell":"#123844","edge":"#59e8f5","text":"#efffff","muted":"#a9dce2","pos":"#5eead4","neg":"#fb7185","amber":"#fbbf24","glow":"#2dd4bf"},
    hoverColor: "#17606b",
    animatedBackdrop: true,
    pointLightColor3: "#a78bfa",
    tertiaryMaterialColor: "#103642",
    scannerGlowColor: "rgba(89,232,245,.62)",
    background: "linear-gradient(90deg, transparent, rgba(89,232,245,.025), rgba(167,139,250,.065), rgba(89,232,245,.11), transparent)",
  },
  PanelExsumMaterial: {
    colors: ["#59e8f5","#2dd4bf","#60a5fa","#818cf8","#a78bfa","#c084fc","#5eead4","#38bdf8","#f0abfc","#bae6fd"],
    backgroundColor: "#092a35",
    fogColor: "#092a35",
    ambientLightIntensity: 1.1,
    pointLightColor: "#2dd4bf",
    pointLightColor2: "#a78bfa",
    backplateColor: "#103744",
    gridPrimaryColor: "#2dd4bf",
    gridSecondaryColor: "#315d69",
    secondaryMaterialColor: "#0d3340",
    textShadow: "#2dd4bf",
    textColor: "#baf7f4",
    ledgerPalette: {"wall":"#0a2630","frame":"#17414d","screen":"#092832","cell":"#123844","edge":"#59e8f5","text":"#efffff","muted":"#a9dce2","pos":"#5eead4","neg":"#fb7185","amber":"#fbbf24","glow":"#2dd4bf"},
    hoverColor: "#17606b",
    pointLightColor3: "#a78bfa",
    tertiaryMaterialColor: "#103642",
    backplateOpacity: 0.82,
    scannerGlowColor: "rgba(89,232,245,.62)",
    background: "linear-gradient(90deg,transparent,rgba(89,232,245,.025),rgba(167,139,250,.065),rgba(89,232,245,.11),transparent)",
    surfaceBlend: 1,
  },
  PanelExsumDoctorFee: {
    colors: ["#59e8f5","#2dd4bf","#60a5fa","#818cf8","#a78bfa","#c084fc","#5eead4","#38bdf8","#f0abfc","#bae6fd"],
    backgroundColor: "#092a35",
    fogColor: "#092a35",
    ambientLightIntensity: 1.1,
    pointLightColor: "#2dd4bf",
    pointLightColor2: "#a78bfa",
    backplateColor: "#103744",
    gridPrimaryColor: "#2dd4bf",
    gridSecondaryColor: "#315d69",
    secondaryMaterialColor: "#0d3340",
    textShadow: "#2dd4bf",
    textColor: "#baf7f4",
    ledgerPalette: {"wall":"#0a2630","frame":"#17414d","screen":"#092832","cell":"#123844","edge":"#59e8f5","text":"#efffff","muted":"#a9dce2","pos":"#5eead4","neg":"#fb7185","amber":"#fbbf24","glow":"#2dd4bf"},
    hoverColor: "#17606b",
    pointLightColor3: "#a78bfa",
    tertiaryMaterialColor: "#103642",
    backplateOpacity: 0.82,
    scannerGlowColor: "rgba(89,232,245,.62)",
    background: "linear-gradient(90deg,transparent,rgba(89,232,245,.025),rgba(167,139,250,.065),rgba(89,232,245,.11),transparent)",
    surfaceBlend: 1,
  },
};

// Clinical fullscreen charts intentionally retain their approved dark stage.
export const clinicalCharts: ChartRenderers = {
  ...deepSpaceCharts,
  DemographyChart: {
    scene: { background: '#010b16', fog: '#03182b', floor: '#06233a', gridPrimary: '#167da8', gridSecondary: '#0b4968', wall: '#08283d', wallSecondary: '#0b3550', wallAccent: '#0f5f89', ambientIntensity: 1.12 },
    lightMaterials: false, background: '#020916', borderColor: 'rgba(37,135,200,.42)', color: '#e9f8ff',
  },
  IOLUsage: { lightMaterials: false, borderColor: 'rgba(37,135,200,.42)', background: '#010611' },
};
