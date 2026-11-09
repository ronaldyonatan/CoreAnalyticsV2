/** Shared Chart Library contract. Existing dashboards can migrate via adapters. */
export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'stacked' | 'grouped' | 'pie' | 'donut' | 'kpi' | 'table' | 'composed' | 'treemap' | 'radial' | 'lollipop' | 'waterfall' | 'waffle' | 'funnel' | 'bullet';
export type ChartAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type ChartFilterOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';
export type ChartFilter = { column: string; operator: ChartFilterOperator; value: string };
export type ChartProperties = {
  showXAxis: boolean; showYAxis: boolean; showGrid: boolean; showLegend: boolean;
  showTooltip: boolean; showDataLabels: boolean; showTitle: boolean;
  xAxisLabel: string; yAxisLabel: string; legendPosition: 'top' | 'bottom';
  numberFormat: 'standard' | 'compact' | 'currency' | 'percent';
  currencySymbol: string; decimals: number; divideBy: number;
  negativeParentheses: boolean; fontSize: number; chartHeight: number;
  gaugeTarget: number; noDataMessage: string; colorDirection: 'normal' | 'reverse';
};
export const defaultChartProperties = (): ChartProperties => ({
  showXAxis:true,showYAxis:true,showGrid:true,showLegend:true,
  showTooltip:true,showDataLabels:false,showTitle:true,
  xAxisLabel:'',yAxisLabel:'',legendPosition:'bottom',
  numberFormat:'standard',currencySymbol:'Rp',decimals:2,divideBy:1,
  negativeParentheses:false,fontSize:11,chartHeight:410,
  gaugeTarget:0,noDataMessage:'Belum ada hasil query.',colorDirection:'normal',
});
export type ChartConfig = {
  properties?: ChartProperties;
  dataset_id: string;
  dataset_kind: 'DIRECT' | 'PARQUET';
  dimension: string;
  measure: string;
  series: string;
  aggregation: ChartAggregation;
  chart_type: ChartKind;
  filters: ChartFilter[];
  sort: 'value_desc' | 'value_asc' | 'dimension_asc' | 'dimension_desc';
  limit: number;
};
export type ChartResultRow = { dimension: string; series: string | null; value: number | null };
export type ChartResult = {
  rows: ChartResultRow[];
  columns: Array<{ name: string; type: string }>;
  source_kind: 'DIRECT' | 'PARQUET';
  truncated: boolean;
  is_sample: boolean;
};
export type SavedChart = {
  chart_id: string;
  name: string;
  version: number;
  created_at?: string;
  updated_at?: string;
  config: ChartConfig;
};
export const CHART_KINDS: Array<{ value: ChartKind; name: string }> = [
  { value: 'column', name: 'Column' }, { value: 'bar', name: 'Horizontal Bar' },
  { value: 'line', name: 'Line' }, { value: 'area', name: 'Area' },
  { value: 'grouped', name: 'Grouped Bar' }, { value: 'stacked', name: 'Stacked Bar' },
  { value: 'composed', name: 'Composed (Bar + Line)' }, { value: 'treemap', name: 'Treemap' },
  { value: 'radial', name: 'Radial Gauge' }, { value: 'lollipop', name: 'Lollipop' },
  { value: 'pie', name: 'Pie' }, { value: 'donut', name: 'Donut' },
  { value: 'waterfall', name: 'Waterfall' }, { value: 'waffle', name: 'Waffle' },
  { value: 'funnel', name: 'Funnel' }, { value: 'bullet', name: 'Bullet Gauge' },
  { value: 'kpi', name: 'KPI' }, { value: 'table', name: 'Table' },
];
export const emptyConfig = (): ChartConfig => ({
  dataset_id: '', dataset_kind: 'DIRECT', dimension: '', measure: '', series: '',
  aggregation: 'count', chart_type: 'column', filters: [], sort: 'value_desc', limit: 30, properties: defaultChartProperties(),
});
