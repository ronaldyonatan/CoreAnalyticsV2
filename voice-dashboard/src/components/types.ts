// src/types.ts
export interface DashboardPage {
  id: string;
  title: string;
  icon?: string;
  items: DashboardItem[];
}

export interface MenuItem {
  id: string;
  title: string;
  icon?: string;
  path?: string; // misalnya: '/revenue', '/service-performance'
}

export interface DashboardItem {
  id: string;
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  chartKey: string;
  title: string;
  color: string;
}