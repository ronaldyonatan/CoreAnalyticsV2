import type { ReactNode } from 'react';

export type StudioModuleId = 'overview' | 'connections' | 'datasets' | 'explorer' | 'pipelines' | 'jobs' | 'charts' | 'designer';
export type StudioModule = {
  id: StudioModuleId;
  label: string;
  description: string;
  status: 'available' | 'preview' | 'planned';
  icon: ReactNode;
};

// Availability and module metadata live together so future sections can be added here.
export const STUDIO_MODULES: StudioModule[] = [
  { id: 'overview', label: 'Overview', description: 'Your workspace at a glance', status: 'available', icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
  { id: 'connections', label: 'Connections', description: 'Manage your data sources', status: 'available', icon: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></> },
  { id: 'datasets', label: 'Datasets', description: 'Catalog, overview, preview and explore data', status: 'available', icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></> },
  { id: 'explorer', label: 'Data Explorer', description: 'Preview datasets', status: 'available', icon: <><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></> },
  { id: 'pipelines', label: 'ETL & Pipelines', description: 'Design ETL, monitor Spark runs, view lineage & outputs', status: 'preview', icon: <><rect x="3" y="4" width="6" height="6" rx="1" /><rect x="15" y="14" width="6" height="6" rx="1" /><path d="M9 7h3a3 3 0 0 1 3 3v1M9 17h6M6 10v4a3 3 0 0 0 3 3" /></> },
  { id: 'charts', label: 'Chart Library', description: 'Manage reusable charts', status: 'preview', icon: <><path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6M20 16V5" /></> },
  { id: 'designer', label: 'Dashboard Designer', description: 'Create dashboards visually', status: 'planned', icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M10 9v12" /></> },
];
