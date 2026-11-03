export type MoneyUnit = "IDR_BILLION";

export interface PeriodInfo {
  label: string;
  periodStart: string;
  periodEnd: string;
  comparisonLabel: string;
  audited: boolean;
}

export interface PublicSource {
  id: string;
  label: string;
  type: "PUBLIC_FINANCIAL_REPORT" | "INVESTOR_RELATIONS" | "PUBLIC_DISCLOSURE";
  url: string;
  publishedAt?: string;
  notes?: string;
}

export interface Metric {
  current: number;
  previous: number;
  unit: MoneyUnit;
}

export interface ServiceMetric extends Metric {
  label: string;
}

export interface JecPublicSnapshot {
  company: {
    legalName: string;
    brandName: string;
    ticker: string;
  };
  period: PeriodInfo;
  financial: {
    revenue: Metric;
    grossProfit: Metric;
    operatingProfit: Metric;
    profitForPeriod: Metric;
    netProfitParent: Metric;
  };
  expenses: {
    marketing: Metric;
    generalAdministrative: Metric;
    financeCost: Metric;
  };
  balanceSheet: {
    assets: Metric;
    liabilities: Metric;
    equity: Metric;
  };
  services: Record<
    "surgery" | "polyclinic" | "lasik" | "pharmacy" | "optical" | "inpatient",
    ServiceMetric
  >;
  context: {
    dataScope: "PUBLIC_ONLY";
    allowRootCauseClaim: false;
    notes: string[];
  };
  sources: PublicSource[];
}

export type BriefingSceneType =
  | "overview"
  | "revenue"
  | "services"
  | "profitability"
  | "balance-sheet"
  | "summary";

export interface ExecutiveBriefingNarrationSegment {
  text: string;
  /** Semantic visual targets activated when this spoken segment actually starts. */
  highlightKeys?: string[];
}

export interface ExecutiveBriefingScene {
  id: string;
  type: BriefingSceneType;
  eyebrow: string;
  title: string;
  narration: string;
  narrationSegments?: ExecutiveBriefingNarrationSegment[];
  minimumVisualMs?: number;
  payload: Record<string, unknown>;
}

export interface ExecutiveBriefing {
  id: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  sourceLabel: string;
  scenes: ExecutiveBriefingScene[];
}

export type BriefingEngineStatus =
  | "idle"
  | "running"
  | "completed"
  | "cancelled"
  | "error";

export interface BriefingEngineCallbacks {
  onStatusChange?: (status: BriefingEngineStatus) => void;
  onSceneChange?: (
    scene: ExecutiveBriefingScene,
    index: number,
    total: number
  ) => void;
  onProgress?: (progress: number) => void;
  onNarrationHighlightChange?: (
    scene: ExecutiveBriefingScene,
    sceneIndex: number,
    highlightKeys: string[]
  ) => void;
  onComplete?: () => void;
  onError?: (error: unknown) => void;
}
