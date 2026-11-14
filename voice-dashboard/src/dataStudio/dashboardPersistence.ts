import type { ChartConfig, SavedChart } from './visualization/chartTypes';
export type PersistedPage = { id: string; name: string };
export type PersistedFrame = { id: string; page_id: string; x: number; y: number; w: number; h: number };
export type PersistedCard = PersistedFrame & { chart_id: string; title: string; background: string; mappings: {target_card_id:string;target_column:string}[]; drill_path:string[] };
export type PersistedBlock = PersistedFrame & {kind:'text'|'image'|'divider'|'spacer';text:string;image:string;alt:string;color:string;font_size:number;align:'left'|'center'|'right'};
export type DashboardDocument = {version:2;pages:PersistedPage[];cards:PersistedCard[];frames:PersistedFrame[];blocks:PersistedBlock[];style:{background:string;textColor:string}};
export type LoadedDashboard = {name:string;document:DashboardDocument;charts:Record<string,{chart:SavedChart;columns:{name:string;type:string}[]}>};
/** JSON object ordering is not stable across BEAM/Flask round trips. */
export function dashboardFingerprint(name:string, document:DashboardDocument):string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,canonical(item)]));
    return value;
  };
  return JSON.stringify(canonical({name,document}));
}
const BASE='/voice-api/api/studio';
const csrf=()=>decodeURIComponent(document.cookie.split('; ').find(item=>item.startsWith('core_csrf='))?.substring(10)||'');
export async function dashboardApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(`${BASE}${path}`,{method,credentials:'include',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf()},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.success===false) throw new Error(result.code||`HTTP_${response.status}`);
  return result.data as T;
}
export async function hydrateDashboard(name:string,document:DashboardDocument):Promise<LoadedDashboard>{
  if(document.version!==2 || !Array.isArray(document.cards) || !Array.isArray(document.pages) || !Array.isArray(document.frames) || !Array.isArray(document.blocks)) throw new Error('DASHBOARD_FORMAT_UNSUPPORTED');
  const ids=[...new Set(document.cards.map(card=>card.chart_id))];
  const pairs=await Promise.all(ids.map(async id=>{
    const chart=await dashboardApi<SavedChart>(`/charts/${encodeURIComponent(id)}`);
    const config:ChartConfig=chart.config;
    const schema=await dashboardApi<{columns:{name:string;type:string}[]}>(`/charts/datasets/${encodeURIComponent(config.dataset_id)}/columns?kind=${encodeURIComponent(config.dataset_kind)}`);
    return [id,{chart,columns:schema.columns}] as const;
  }));
  return {name,document,charts:Object.fromEntries(pairs)};
}
