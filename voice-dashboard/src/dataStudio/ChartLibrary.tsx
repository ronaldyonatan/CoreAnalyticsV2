import OwnershipGrid from './OwnershipGrid';
import './ownership-all-modules.css';
import OwnershipPicker from './OwnershipPicker';
import { UniverseRefreshButton } from '../design-system/components/universe/UniverseRefreshButton';
import { UniverseTable, UniverseInspector, UniverseToolbar, UniverseField, UniverseFormSection, UniverseCatalogHeader } from '../design-system/components/universe';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { loadDatasetCatalog, parquetPreviewUrl } from './datasetCatalog';
import type { CatalogDataset } from './datasetCatalog';
import { SharedChart } from './visualization/SharedChart';
import { Chart3DFullscreen, isChart3DSupported } from './chart3d/Chart3DFullscreen';
import { CHART_KINDS, emptyConfig, defaultChartProperties } from './visualization/chartTypes';
import type {
  ChartConfig,
  ChartProperties,
  ChartFilterOperator,
  ChartKind,
  ChartResult,
  SavedChart,
} from './visualization/chartTypes';
import './chart-library.css';

const BASE = '/voice-api/api/studio/charts';
const AGGREGATIONS = ['count', 'sum', 'avg', 'min', 'max'] as const;
const OPERATORS: Array<{ value: ChartFilterOperator; label: string }> = [
  { value: 'eq', label: 'Sama dengan' },
  { value: 'neq', label: 'Tidak sama dengan' },
  { value: 'gt', label: 'Lebih besar' },
  { value: 'gte', label: 'Lebih besar / sama' },
  { value: 'lt', label: 'Lebih kecil' },
  { value: 'lte', label: 'Lebih kecil / sama' },
  { value: 'contains', label: 'Mengandung' },
];

const CHART_GROUPS: Array<{ name: string; kinds: ChartKind[] }> = [
  { name: 'Filter Cards', kinds: ['filter_dropdown', 'filter_date'] },
  { name: 'Besaran & Peringkat', kinds: ['column', 'bar', 'grouped', 'lollipop', 'pareto'] },
  { name: 'Perjalanan Nilai', kinds: ['line', 'step', 'area', 'cumulative_line', 'cumulative_bar', 'variance', 'waterfall'] },
  { name: 'Profil & Perbandingan', kinds: ['radar', 'slope', 'combo', 'composed'] },
  { name: 'Bagian & Komposisi', kinds: ['stacked', 'pie', 'donut', 'stacked100', 'area100', 'treemap', 'waffle', 'funnel'] },
  { name: 'Intensitas & Detail', kinds: ['heatmap', 'table'] },
  { name: 'Indikator & Target', kinds: ['kpi', 'radial', 'bullet', 'progress'] },
];
const ORDERED_CHARTS: ChartKind[] = ['cumulative_line', 'cumulative_bar', 'variance', 'slope'];
const ANALYTICAL_CHARTS: ChartKind[] = [...ORDERED_CHARTS, 'combo', 'progress'];

const CHART_HINTS: Partial<Record<ChartKind, string>> = {
  filter_dropdown: 'Pilih kolom kategori. Target filter diatur nanti di Dashboard Designer.',
  filter_date: 'Pilih kolom tanggal. Target filter diatur nanti di Dashboard Designer.',
  stacked100: 'Pilih Category dan Series. Nilai non-negatif dinormalisasi menjadi 100% per kategori dari series hasil query (Top N).',
  area100: 'Pilih Category dan Series. Persentase area dihitung per kategori dari series hasil query (Top N); gunakan urutan kategori untuk tren.',
  heatmap: 'Category menjadi kolom, Series menjadi baris, dan Value menentukan intensitas warna. Sel tanpa nilai dibedakan dari nilai nol.',
  radar: 'Gunakan sedikitnya 3 kategori dengan nilai non-negatif. Series opsional untuk membandingkan beberapa profil.',
  pareto: 'Kategori diurutkan dari nilai terbesar. Persentase kumulatif memakai kategori hasil query (Top N), bukan total seluruh dataset.',
  step: 'Menampilkan perubahan bertahap. Untuk kategori waktu, pilih urutan Kategori A–Z.',
  cumulative_line: 'Akumulasi per Series mengikuti kategori A–Z pada hasil query (Top N), bukan saldo awal atau total historis. Gunakan kategori tanggal ISO untuk urutan waktu.',
  cumulative_bar: 'Batang menunjukkan total berjalan per Series pada kategori hasil query (Top N). Orientasi dapat diatur pada Variasi Analitik.',
  variance: 'Perubahan dihitung terhadap kategori sebelumnya pada hasil query, bukan varians statistik. Pilih selisih angka atau persentase pada Variasi Analitik.',
  slope: 'Bandingkan dua kategori ujung dari hasil query. Series opsional untuk membandingkan profil; pilih kategori awal dan akhir pada Variasi Analitik.',
  combo: 'Pilih Series dengan sedikitnya dua kelompok. Satu kelompok ditampilkan sebagai garis dan kelompok lainnya sebagai batang, menggunakan measure dan skala yang sama.',
  progress: 'Pencapaian per kategori dibandingkan dengan target eksplisit. Isi target positif pada Variasi Analitik; persentase di atas 100% tetap ditampilkan.',
};

const SORT_OPTIONS: Array<{ value: ChartConfig['sort']; label: string }> = [
  { value: 'value_desc', label: 'Nilai terbesar' },
  { value: 'value_asc', label: 'Nilai terkecil' },
  { value: 'dimension_asc', label: 'Kategori A–Z' },
  { value: 'dimension_desc', label: 'Kategori Z–A' },
];

const csrf = () => {
  const match = document.cookie.split('; ').find(item => item.startsWith('core_csrf='));
  return match ? decodeURIComponent(match.substring(10)) : '';
};

async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    signal,
    headers: method === 'GET'
      ? {}
      : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed.success === false) {
    throw new Error(parsed.code || `HTTP_${response.status}`);
  }
  return parsed.data as T;
}

function ChartThumbnail({ kind }: { kind: ChartKind }) {
  const bars = kind === 'bar' || kind === 'grouped' || kind === 'stacked';
  const pie = kind === 'pie' || kind === 'donut';
  const line = kind === 'line' || kind === 'area';
  return (
    <svg className="ca-chart-thumb" viewBox="0 0 64 42" fill="none" aria-hidden="true">
      {(kind === 'filter_dropdown' || kind === 'filter_date') && <><rect x="6" y="8" width="52" height="27" rx="5" stroke="currentColor" strokeWidth="2" /><path d={kind === 'filter_dropdown' ? 'M42 19l5 5 5-5M12 21h23' : 'M15 13v-4m27 4v-4M12 18h39M16 23h5m5 0h5m5 0h5m-25 5h5m5 0h5'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
      {kind === 'column' && (
        <>
          <path d="M5 37H60" stroke="currentColor" opacity=".22" />
          <rect x="9" y="22" width="8" height="15" rx="1.5" fill="#53B7DC" />
          <rect x="22" y="14" width="8" height="23" rx="1.5" fill="#53B7DC" />
          <rect x="35" y="20" width="8" height="17" rx="1.5" fill="#53B7DC" />
          <rect x="48" y="7" width="8" height="30" rx="1.5" fill="#53B7DC" />
        </>
      )}
      {bars && (
        <>
          {[10, 22, 34].map((y, i) => (
            <g key={y}>
              <rect x="5" y={y - 5} width={kind === 'stacked' ? 22 : 39 - i * 8} height="7" rx="1.5" fill="#53B7DC" />
              {kind === 'grouped' && <rect x="5" y={y + 3} width={31 - i * 5} height="3" rx="1" fill="#E5B35A" />}
              {kind === 'stacked' && <rect x="27" y={y - 5} width={21 - i * 5} height="7" rx="1" fill="#E5B35A" />}
            </g>
          ))}
        </>
      )}
      {line && (
        <>
          {kind === 'area' && <path d="M5 35 16 27 28 30 40 13 57 8V37H5Z" fill="#53B7DC" opacity=".25" />}
          <path d="M5 35 16 27 28 30 40 13 57 8" stroke="#53B7DC" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {[ [5,35], [28,30], [40,13], [57,8] ].map(([x,y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill="#E5B35A" />
          ))}
        </>
      )}
      {pie && (
        <>
          <circle cx="32" cy="21" r="17" fill="#53B7DC" />
          <path d="M32 21V4A17 17 0 0 1 49 21Z" fill="#E5B35A" />
          <path d="M32 21 49 21A17 17 0 0 1 22 35Z" fill="#4CC79F" />
          {kind === 'donut' && <circle cx="32" cy="21" r="9" className="ca-chart-thumb-hole" />}
        </>
      )}
      {kind === 'composed' && <>
        <path d="M4 37H60" stroke="currentColor" opacity=".22" />
        {[8,21,34,47].map((x,i)=><rect key={x} x={x} y={22-i*4} width="8" height={15+i*4} rx="1" fill="#53B7DC" opacity=".8"/>)}
        <path d="M7 19 24 25 37 10 51 15" stroke="#E5B35A" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round"/>
        {[[7,19],[24,25],[37,10],[51,15]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2.2" fill="#E5B35A"/>)}
      </>}
      {kind === 'lollipop' && <>
        <path d="M6 37H59" stroke="currentColor" opacity=".22" />
        {[[12,23],[26,13],[40,28],[54,7]].map(([x,y],i)=><g key={i}><path d={`M${x} 37V${y}`} stroke="#53B7DC" strokeWidth="3" strokeLinecap="round"/><circle cx={x} cy={y} r="4" fill="#E5B35A" stroke="#0c2133" strokeWidth="1"/></g>)}
      </>}
      {kind === 'radial' && <>
        <circle cx="32" cy="21" r="15" stroke="currentColor" opacity=".16" strokeWidth="7"/>
        <circle cx="32" cy="21" r="15" stroke="#53B7DC" strokeWidth="7" strokeLinecap="round" strokeDasharray="69 95" transform="rotate(-90 32 21)"/>
        <text x="32" y="24" textAnchor="middle" fill="#53B7DC" fontSize="11" fontWeight="700">73%</text>
      </>}
      {kind === 'kpi' && (
        <>
          <rect x="6" y="6" width="52" height="30" rx="5" stroke="#53B7DC" strokeWidth="1.3" />
          <text x="32" y="26" fill="#53B7DC" textAnchor="middle" fontSize="18" fontWeight="700">123</text>
        </>
      )}
      {kind === 'stacked100' && [8, 22, 36, 50].map((x, i) => <g key={x}><rect x={x} y="5" width="8" height="32" fill="#53B7DC" /><rect x={x} y={5 + [12, 20, 8, 16][i]} width="8" height={32 - [12, 20, 8, 16][i]} fill="#E5B35A" /></g>)}
      {kind === 'area100' && <><path d="M5 5H59V37H5Z" fill="#a991ed" /><path d="M5 15 18 23 32 18 46 25 59 15V37H5Z" fill="#53B7DC" /><path d="M5 28 18 30 32 25 46 32 59 27V37H5Z" fill="#4CC79F" /></>}
      {kind === 'heatmap' && Array.from({ length: 24 }, (_, i) => <rect key={i} x={5 + i % 6 * 9} y={4 + Math.floor(i / 6) * 9} width="8" height="8" rx="1" fill="#53B7DC" opacity={.2 + (i * 7 % 5) * .18} />)}
      {kind === 'radar' && <><path d="M32 3 50 16 43 36 21 36 14 16Z" stroke="currentColor" opacity=".3" /><path d="M32 3V21M50 16 32 21 43 36M21 36 32 21 14 16" stroke="currentColor" opacity=".2" /><path d="M32 7 45 17 37 30 24 32 20 17Z" fill="#53B7DC" fillOpacity=".3" stroke="#53B7DC" strokeWidth="2" /><path d="M32 13 41 18 40 32 27 28 16 17Z" stroke="#E5B35A" strokeWidth="1.5" /></>}
      {kind === 'pareto' && <><path d="M4 37H60" stroke="currentColor" opacity=".22" />{[28, 20, 12, 5].map((h, i) => <rect key={i} x={7 + i * 14} y={37 - h} width="9" height={h} fill="#53B7DC" />)}<path d="M11 26 25 17 39 9 53 5" stroke="#E5B35A" strokeWidth="2.5" strokeLinejoin="round" /></>}
      {kind === 'step' && <><path d="M5 37H59" stroke="currentColor" opacity=".22" /><path d="M5 34H18V26H31V30H44V12H58" stroke="#53B7DC" strokeWidth="3" strokeLinejoin="round" /></>}
      {kind === 'cumulative_line' && <><path d="M6 35H59" stroke="currentColor" opacity=".2" /><path d="M8 32 20 28 33 20 46 16 58 6" stroke="#53B7DC" strokeWidth="2.5" strokeLinecap="round" />{[[8,32],[20,28],[33,20],[46,16],[58,6]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="2.5" fill="#4CC79F" />)}<text x="8" y="15" fill="#E5B35A" fontSize="12">Σ</text></>}
      {kind === 'cumulative_bar' && <><path d="M5 37H59" stroke="currentColor" opacity=".2" />{[8,14,23,31].map((h,i) => <rect key={i} x={8+i*13} y={37-h} width="9" height={h} rx="2" fill="#53B7DC" opacity={.45+i*.18} />)}<path d="M8 24V18H18" stroke="#E5B35A" strokeWidth="2" /></>}
      {kind === 'variance' && <><path d="M5 21H59" stroke="currentColor" opacity=".35" /><rect x="9" y="8" width="9" height="13" rx="2" fill="#4CC79F" /><rect x="22" y="21" width="9" height="11" rx="2" fill="#E5B35A" /><rect x="35" y="4" width="9" height="17" rx="2" fill="#4CC79F" /><rect x="48" y="21" width="9" height="6" rx="2" fill="#E5B35A" /></>}
      {kind === 'slope' && <><path d="M12 5V37M52 5V37" stroke="currentColor" opacity=".2" />{[[9,29,'#53B7DC'],[21,10,'#4CC79F'],[34,18,'#E5B35A']].map(([a,b,color],i) => <g key={i}><path d={`M12 ${a}L52 ${b}`} stroke={String(color)} strokeWidth="2" /><circle cx="12" cy={a} r="3" fill={String(color)} /><circle cx="52" cy={b} r="3" fill={String(color)} /></g>)}</>}
      {kind === 'combo' && <><path d="M5 37H59" stroke="currentColor" opacity=".2" />{[14,25,19,29].map((h,i) => <rect key={i} x={8+i*13} y={37-h} width="8" height={h} rx="2" fill="#53B7DC" opacity=".7" />)}<path d="M12 12 25 23 38 8 51 16" stroke="#4CC79F" strokeWidth="2.5" />{[[12,12],[25,23],[38,8],[51,16]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="2.5" fill="#4CC79F" />)}</>}
      {kind === 'progress' && <>{[8,20,32].map((y,i) => <g key={y}><rect x="6" y={y} width="51" height="6" rx="3" fill="currentColor" opacity=".12" /><rect x="6" y={y} width={[38,24,48][i]} height="6" rx="3" fill="#4CC79F" /><path d={`M47 ${y-2}V${y+8}`} stroke="#E5B35A" strokeWidth="1.5" /></g>)}</>}
      {kind === 'waterfall' && <><rect x="7" y="24" width="10" height="13" fill="#53B7DC"/><rect x="21" y="14" width="10" height="10" fill="#4CC79F"/><rect x="35" y="20" width="10" height="7" fill="#E5B35A"/><rect x="49" y="9" width="10" height="18" fill="#53B7DC"/><path d="M17 24H21M31 14H35M45 20H49" stroke="currentColor" opacity=".5"/></>}
      {kind === 'waffle' && Array.from({length:40},(_,i)=><rect key={i} x={5+(i%10)*5.5} y={5+Math.floor(i/10)*9} width="4.5" height="7" rx=".6" fill={i<25?'#53B7DC':i<34?'#E5B35A':'#4CC79F'}/>)}
      {kind === 'funnel' && <><path d="M4 5H60L51 15H13Z" fill="#53B7DC"/><path d="M13 18H51L44 28H20Z" fill="#a991ed"/><path d="M20 31H44L39 39H25Z" fill="#4CC79F"/></>}
      {kind === 'bullet' && <><rect x="6" y="12" width="52" height="18" fill="currentColor" opacity=".15"/><rect x="6" y="12" width="33" height="18" fill="#53B7DC"/><path d="M46 7V35" stroke="#E5B35A" strokeWidth="3"/></>}
      {kind === 'treemap' && <><rect x="5" y="5" width="30" height="32" fill="#53B7DC"/><rect x="37" y="5" width="22" height="16" fill="#E5B35A"/><rect x="37" y="23" width="22" height="14" fill="#4CC79F"/></>}
      {kind === 'table' && (
        <>
          <rect x="6" y="5" width="52" height="32" rx="2" stroke="#53B7DC" strokeWidth="1.3" />
          <path d="M6 14H58M6 22H58M6 30H58M29 5V37" stroke="#53B7DC" strokeWidth="1.3" />
        </>
      )}
    </svg>
  );
}

function FieldBadge({ numeric }: { numeric: boolean }) {
  return <span className={`ca-chart-field-type${numeric ? ' is-number' : ''}`}>{numeric ? '123' : 'ABC'}</span>;
}

export default function ChartLibrary() {
  const [catalog, setCatalog] = useState<CatalogDataset[]>([]);
  const [charts, setCharts] = useState<SavedChart[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [catalogNotices, setCatalogNotices] = useState<string[]>([]);
  const [chartId, setChartId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [name, setName] = useState('Chart baru');
  const [config, setConfig] = useState<ChartConfig>(emptyConfig);
  const [columns, setColumns] = useState<Array<{ name: string; type: string }>>([]);
  const [results, setResults] = useState<ChartResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [queryBusy, setQueryBusy] = useState(false);
  const [querySignature, setQuerySignature] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState<'library' | 'analyzer'>('library');
  const [fieldSearch, setFieldSearch] = useState('');
  const [chartSearch, setChartSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [openTypeGroups, setOpenTypeGroups] = useState<string[]>([CHART_GROUPS[0].name]);
  const [closedSearchGroups, setClosedSearchGroups] = useState<string[]>([]);
  const [showTable, setShowTable] = useState(true);
  const [showSettings, setShowSettings] = useState(true);
  const [showChartTypes, setShowChartTypes] = useState(true);
  const [fullCanvas, setFullCanvas] = useState(false);
  const [fullscreenView, setFullscreenView] = useState<'2d' | '3d'>('2d');
  const [dragged, setDragged] = useState('');
  const [activeTools, setActiveTools] = useState<'filter' | 'properties'>('filter');
  const [propertyTab, setPropertyTab] = useState('General');
  const props = { ...defaultChartProperties(), ...config.properties };
  // Progress requires its explicit target during query validation.
  const querySpec = useMemo(() => {
    const { properties, ...query } = config;
    return config.chart_type === 'progress'
      ? { ...query, properties: { gaugeTarget: properties?.gaugeTarget ?? 0 } }
      : query;
  }, [config]);
  const signature = JSON.stringify(querySpec);
  const isFilterCard = config.chart_type === 'filter_dropdown' || config.chart_type === 'filter_date';
  const isDateColumn = (type: string) => /^(date|datetime|datetime2|smalldatetime|datetimeoffset|timestamp)(?:\b|\()/i.test(type);
  const ready = Boolean(config.dataset_id && (config.chart_type === 'kpi' || config.dimension)
    && (config.aggregation === 'count' || config.measure)
    && (!['grouped','stacked','stacked100','area100','heatmap','combo'].includes(config.chart_type) || config.series)
    && (!['pie','donut','kpi','pareto','progress'].includes(config.chart_type) || !config.series)
    && (config.chart_type !== 'pareto' || config.sort === 'value_desc')
    && (!ORDERED_CHARTS.includes(config.chart_type) || config.sort === 'dimension_asc')
    && (config.chart_type !== 'progress' || props.gaugeTarget > 0)
    && (!config.series || config.series !== config.dimension)
    && (config.chart_type !== 'filter_date' || columns.some(c => c.name === config.dimension && isDateColumn(c.type)))
    && columns.length > 0
    && (!config.dimension || columns.some(c => c.name === config.dimension))
    && (!config.measure || columns.some(c => c.name === config.measure))
    && (!config.series || columns.some(c => c.name === config.series)));
  const validResults = ready && querySignature === signature ? results : null;
  const resultSeries = Array.from(new Set(validResults?.rows.map(row => row.series).filter((value): value is string => Boolean(value))));
  const resultCategories = Array.from(new Set(validResults?.rows.map(row => row.dimension)));
  const updateProp = <K extends keyof ChartProperties>(key: K, value: ChartProperties[K]) => {
    setConfig(old => ({ ...old, properties: { ...defaultChartProperties(), ...old.properties, [key]: value } }));
  };
  const chooseFullscreenView = (view: '2d' | '3d') => {
    setFullscreenView(view);
    updateProp('fullscreen3d', view === '3d');
  };
  const toggle = (key: keyof ChartProperties, label: string) => <label className="ca-chart-prop-check"><span>{label}</span><input type="checkbox" checked={Boolean(props[key])} onChange={e => updateProp(key, e.target.checked as never)} /></label>;
  const textField = (key: keyof ChartProperties, label: string) => <UniverseField className="ca-chart-setting-control"><span>{label}</span><input maxLength={100} value={String(props[key])} onChange={e => updateProp(key, e.target.value as never)} /></UniverseField>;
  const numberField = (key: keyof ChartProperties, label: string, min: number, max: number) => <UniverseField className="ca-chart-setting-control"><span>{label}</span><input type="number" min={min} max={max} value={Number(props[key])} onChange={e => updateProp(key, Math.round(Math.max(min,Math.min(max,Number(e.target.value)||min))) as never)} /></UniverseField>;
  const choice = (key: keyof ChartProperties, label: string, choices: Array<[string | number,string]>) => <UniverseField className="ca-chart-setting-control"><span>{label}</span><select value={String(props[key])} onChange={e => updateProp(key, (typeof choices[0][0] === 'number' ? Number(e.target.value) : e.target.value) as never)}>{choices.map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></UniverseField>;
  const chart3DReady = isChart3DSupported(config.chart_type);
  useEffect(() => {
    if (!fullCanvas) return;
    setFullscreenView(props.fullscreen3d && chart3DReady ? '3d' : '2d');
  }, [fullCanvas, props.fullscreen3d, chart3DReady]);
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const datasetPickerRef = useRef<HTMLSelectElement>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const [datasets, saved] = await Promise.allSettled([
      loadDatasetCatalog(signal),
      api<SavedChart[]>('', 'GET', undefined, signal),
    ]);
    if (signal?.aborted) return;
    if (datasets.status === 'fulfilled') {
      setCatalog(datasets.value.items);
      setCatalogNotices(datasets.value.notices);
    }
    if (saved.status === 'fulfilled') setCharts(saved.value);
    if (datasets.status === 'rejected') {
      setCatalogNotices([]);
      setError('Katalog dataset belum tersedia.');
    }
    if (saved.status === 'rejected') {
      setError('Chart API belum siap. Periksa route dan migrasi database Chart Library.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLibraryLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!fullCanvas) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullCanvas(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', dismiss);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', dismiss);
    };
  }, [fullCanvas]);

  const numeric = useMemo(
    () => columns.filter(column => /^(?:u?int(?:8|16|32|64)?|integer|bigint|smallint|tinyint|decimal(?:128|256)?|numeric|number|money|smallmoney|float(?:16|32|64)?|double|real|long|short|byte)(?:\b|\()/i.test(column.type)),
    [columns],
  );
  const isNumeric = useCallback((field: string) => numeric.some(item => item.name === field), [numeric]);
  const visibleColumns = useMemo(
    () => columns.filter(column => column.name.toLowerCase().includes(fieldSearch.toLowerCase())),
    [columns, fieldSearch],
  );
  const dimensions = visibleColumns.filter(column => !isNumeric(column.name));
  const measures = visibleColumns.filter(column => isNumeric(column.name));
  // Stage 1E: date range analysis uses existing safe, parameterized filters.
  // No schema migration and no new SQL operators are required.
  const dateColumns = columns.filter(c => /^(date|datetime|datetime2|smalldatetime|datetimeoffset|timestamp)(?:\b|\()/i.test(c.type));
  const [dateColumn, setDateColumn] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const applyDateRange = () => {
    if (!dateColumn || (!dateFrom && !dateTo)) return;
    const retained = config.filters.filter(f => !(f.column === dateColumn && (f.operator === 'gte' || f.operator === 'lte')));
    const additions: ChartConfig['filters'] = [];
    if (dateFrom) additions.push({ column: dateColumn, operator: 'gte', value: dateFrom });
    if (dateTo) additions.push({ column: dateColumn, operator: 'lte', value: dateTo + 'T23:59:59' });
    if (retained.length + additions.length > 8) { setError('Maksimum 8 filter. Hapus filter lain terlebih dahulu.'); return; }
    setField('filters', [...retained, ...additions]);
  };

  
  const visibleCharts = charts.filter(chart => chart.name.toLowerCase().includes(chartSearch.toLowerCase()));
  const activeDataset = catalog.find(dataset => dataset.dataset_id === config.dataset_id);
  const chartLabel = CHART_KINDS.find(kind => kind.value === config.chart_type)?.name || config.chart_type;
  const typeSearchTerm = typeSearch.trim().toLocaleLowerCase();
  const visibleTypeGroups = CHART_GROUPS.map(group => ({
    ...group,
    kinds: group.kinds.filter(kind => !typeSearchTerm || group.name.toLocaleLowerCase().includes(typeSearchTerm)
      || (CHART_KINDS.find(item => item.value === kind)?.name || kind).toLocaleLowerCase().includes(typeSearchTerm)),
  })).filter(group => group.kinds.length > 0);

  const setChartType = (kind: ChartKind) => {
    setConfig(previous => ({
      ...previous,
      chart_type: kind,
      dimension: kind === 'kpi' || (kind === 'filter_date' && !columns.some(c => c.name === previous.dimension && isDateColumn(c.type))) ? '' : previous.dimension,
      measure: kind.startsWith('filter_') ? '' : previous.measure,
      aggregation: kind.startsWith('filter_') ? 'count' : previous.aggregation,
      series: kind.startsWith('filter_') || ['pie', 'donut', 'kpi', 'pareto', 'progress'].includes(kind) ? '' : previous.series,
      sort: kind.startsWith('filter_') ? 'dimension_asc' : kind === 'pareto' ? 'value_desc' : ORDERED_CHARTS.includes(kind) ? 'dimension_asc' : previous.sort,
    }));
    if (ANALYTICAL_CHARTS.includes(kind)) {
      setActiveTools('properties');
      setPropertyTab('Variasi Analitik');
      setShowSettings(true);
    } else if (propertyTab === 'Variasi Analitik') {
      setPropertyTab('General');
    }
    setResults(null);
    setMessage('');
  };

  const setField = <K extends keyof ChartConfig>(key: K, value: ChartConfig[K]) => {
    setConfig(previous => ({ ...previous, [key]: value }));
    setResults(null);
    setMessage('');
  };

  const chooseDataset = (id: string) => {
    const row = catalog.find(dataset => dataset.dataset_id === id);
    setConfig({
      ...emptyConfig(),
      ...(isFilterCard ? { chart_type: config.chart_type, sort: 'dimension_asc' as const } : {}),
      dataset_id: id,
      dataset_kind: row?.access_mode === 'PARQUET' ? 'PARQUET' : 'DIRECT',
    });
    setResults(null);
    setColumns([]);
    setError('');
  };

  useEffect(() => {
    if (!config.dataset_id) return;
    const controller = new AbortController();

    // Reuse the existing Data Explorer metadata contract. The preview is
    // read ONLY to discover column names/types, never to aggregate chart data.
    const url = config.dataset_kind === 'PARQUET'
      ? parquetPreviewUrl(config.dataset_id, 1)
      : `/voice-api/api/studio/datasets/${encodeURIComponent(config.dataset_id)}/preview`;

    const loadColumns = async () => {
      const method = config.dataset_kind === 'PARQUET' ? 'GET' : 'POST';
      const response = await fetch(url, {
        method,
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
        headers: method === 'POST'
          ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }
          : {},
        body: method === 'POST'
          ? JSON.stringify({ page: 1, filters: {}, sort: null })
          : undefined,
      });
      const parsed = await response.json().catch(() => ({}));
      if (!response.ok || parsed.success === false) {
        throw new Error(parsed.code || `HTTP_${response.status}`);
      }
      const found = parsed.data?.columns;
      if (!Array.isArray(found)) throw new Error('DATASET_COLUMNS_UNAVAILABLE');
      return found.filter((column: unknown): column is { name: string; type: string } => {
        if (!column || typeof column !== 'object') return false;
        const item = column as Record<string, unknown>;
        return typeof item.name === 'string' && typeof item.type === 'string';
      });
    };

    void loadColumns()
      .then(found => {
        if (!controller.signal.aborted) {
          setColumns(found);
          setError('');
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setColumns([]);
          setError(err instanceof Error ? err.message : 'CHART_COLUMNS_UNAVAILABLE');
        }
      });
    return () => controller.abort();
  }, [config.dataset_id, config.dataset_kind]);

  const openNew = () => {
    setChartId(null);
    setVersion(0);
    setName('Chart baru');
    setConfig(emptyConfig());
    setColumns([]);
    setResults(null);
    setWorking('analyzer');
    setError('');
    setMessage('');
    setFieldSearch('');
  };

  const openSaved = async (id: string) => {
    setError('');
    setBusy(true);
    try {
      const chart = await api<SavedChart>(`/${encodeURIComponent(id)}`);
      setChartId(chart.chart_id);
      setVersion(chart.version);
      setName(chart.name);
      setConfig(chart.config);
      setResults(null);
      setWorking('analyzer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CHART_OPEN_FAILED');
    } finally {
      setBusy(false);
    }
  };

  // Stage 1E: debounce automatic full-dataset aggregation, cancel stale queries.
  // React StrictMode may mount twice: AbortController protects both cases.
  useEffect(() => {
    if (working !== 'analyzer' || !ready) {
      setQueryBusy(false);
      return;
    }
    const controller = new AbortController();
    setQueryBusy(true);
    setError('');
    const timer = window.setTimeout(() => {
      void api<ChartResult>('/query', 'POST', querySpec, controller.signal)
        .then(output => {
          if (controller.signal.aborted) return;
          if (output.is_sample) throw new Error('CHART_SAMPLE_AGGREGATION_REJECTED');
          setResults(output);
          setQuerySignature(signature);
          setMessage(output.truncated
            ? 'Hasil dibatasi. Sesuaikan Top N dan sorting.'
            : 'Agregasi seluruh dataset berhasil dimuat.');
        })
        .catch(err => {
          if (controller.signal.aborted) return;
          setResults(null);
          setQuerySignature('');
          setMessage('');
          const code = err instanceof Error ? err.message : 'CHART_QUERY_FAILED';
          setError(isFilterCard && code === 'CHART_QUERY_INVALID'
            ? 'Backend belum menerima jenis filter ini. Pastikan backend versi terbaru sudah dimuat ulang, lalu coba lagi.'
            : code);
        })
        .finally(() => { if (!controller.signal.aborted) setQueryBusy(false); });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [working, ready, signature]);

  const save = async () => {
    if (!name.trim() || !validResults || queryBusy) {
      setError('Beri nama chart dan tunggu preview otomatis selesai sebelum menyimpan.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await api<{ chart_id: string; version: number }>(
        chartId ? `/${chartId}` : '',
        chartId ? 'PUT' : 'POST',
        chartId
          ? { name: name.trim(), config, expected_version: version }
          : { name: name.trim(), config },
      );
      setChartId(saved.chart_id);
      setVersion(saved.version);
      setMessage('Chart berhasil tersimpan di Chart Library.');
      setFullCanvas(false);
      setChartSearch('');
      setLibraryLoading(true);
      setWorking('library');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CHART_SAVE_FAILED');
    } finally {
      setLibraryLoading(false);
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Hapus chart ini dari Library?')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/${encodeURIComponent(id)}`, 'DELETE');
      await reload();
      if (chartId === id) openNew();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CHART_DELETE_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const dropField = (field: 'dimension' | 'measure' | 'series') => (event: DragEvent) => {
    event.preventDefault();
    const label = event.dataTransfer.getData('text/plain') || dragged;
    if (!columns.some(column => column.name === label)) return;
    if (isFilterCard && field !== 'dimension') return;
    if (config.chart_type === 'filter_date' && !columns.some(c => c.name === label && isDateColumn(c.type))) return;
    if (field === 'measure' && !isNumeric(label)) return;
    if (field === 'series' && ['pie', 'donut', 'kpi', 'pareto', 'progress'].includes(config.chart_type)) return;
    setField(field, label);
    setDragged('');
  };

  const dropAggregation = (event: DragEvent) => {
    event.preventDefault();
    if (isFilterCard) return;
    const label = event.dataTransfer.getData('text/plain') || dragged;
    if (!isNumeric(label)) return;
    setConfig(previous => ({
      ...previous,
      measure: label,
      aggregation: isNumeric(label) ? 'sum' : 'count',
    }));
    setResults(null);
    setMessage('');
    setDragged('');
  };

  const focusTable = () => {
    setShowTable(true);
    window.requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  const plotPanel = (
    <div ref={chartRef} className={`ca-chart-plot${fullCanvas ? ' is-fullscreen' : ''}`}>
      <div className="ca-chart-plot-heading">
        <div>
          <span className="ca-chart-section-eyebrow">CHART PREVIEW</span>
          {props.showTitle && <h2>{name.trim() || 'Untitled Chart'}</h2>}
          <small>{activeDataset?.dataset_name || 'Pilih dataset'} · {chartLabel}</small>
        </div>
        {!fullCanvas && (
          <div className="ca-chart-plot-actions">
            {chart3DReady && (
              <button
                type="button"
                className={`ca-chart-3d-quick${props.fullscreen3d ? ' is-active' : ''}`}
                aria-pressed={props.fullscreen3d}
                title="Tampilkan versi 3D saat fullscreen"
                onClick={() => updateProp('fullscreen3d', !props.fullscreen3d)}
              >3D</button>
            )}
            <button
              type="button"
              className="ca-chart-maximize"
              aria-label="Layar penuh grafik"
              onClick={() => setFullCanvas(true)}
            >
              ⛶ Fullscreen
            </button>
          </div>
        )}
      </div>
      {fullCanvas && (
        <div className="ca-chart-fullscreen-actions">
          {chart3DReady && (
            <div className="ca-chart-view-toggle" role="group" aria-label="Mode tampilan">
              <button type="button" className={fullscreenView === '2d' ? 'is-selected' : ''} aria-pressed={fullscreenView === '2d'} onClick={() => chooseFullscreenView('2d')}>2D</button>
              <button type="button" className={fullscreenView === '3d' ? 'is-selected' : ''} aria-pressed={fullscreenView === '3d'} onClick={() => chooseFullscreenView('3d')}>3D</button>
            </div>
          )}
          <button
            type="button"
            className="ca-chart-maximize"
            aria-label="Kembali dari fullscreen"
            onClick={() => setFullCanvas(false)}
          >
            ↙ Kembali
          </button>
        </div>
      )}
      <div className="ca-chart-canvas ca-chart-preview-container" aria-busy={queryBusy}>
        {validResults && (isFilterCard ? <div className="ca-filter-card-preview"><label><span>{config.dimension}</span>{config.chart_type === 'filter_dropdown' ? <select key={signature} defaultValue=""><option value="">Pilih {config.dimension}</option>{validResults.rows.map((row, index) => <option key={index} value={row.dimension}>{row.dimension}</option>)}</select> : <div className="ca-filter-date-fields"><input type="date" aria-label="Tanggal awal" /><span>hingga</span><input type="date" aria-label="Tanggal akhir" /></div>}</label><small>Preview saja. Target filter diatur di Dashboard Designer.{config.chart_type === 'filter_dropdown' && validResults.truncated ? ' Daftar preview dibatasi.' : ''}</small></div> : fullCanvas && fullscreenView === '3d' && chart3DReady
          ? <Chart3DFullscreen kind={config.chart_type} rows={validResults.rows} title={name} height={Math.max(540, props.chartHeight)} properties={props} />
          : <SharedChart kind={config.chart_type} rows={validResults.rows} title={name} height={fullCanvas ? Math.max(540, props.chartHeight) : props.chartHeight} properties={props} />)}
        {!validResults && !queryBusy && <div className="chart-empty">{error ? 'Preview belum tersedia. Periksa pesan di atas.' : ready ? 'Menyiapkan preview otomatis…' : 'Pilih dataset dan lengkapi field grafik.'}</div>}
        {queryBusy && <div className="ca-chart-loading-overlay" role="status"><span className="ca-chart-spinner ca-chart-spinner-large" /><strong>Memproses data grafik</strong><small>Agregasi seluruh dataset sedang berjalan…</small></div>}
      </div>
      <div className="ca-chart-plot-foot">
        <span>{validResults ? `${validResults.rows.length} baris hasil agregasi` : queryBusy ? 'Sedang mengambil data…' : 'Preview otomatis'}</span>
        <span>{validResults ? (validResults.is_sample ? 'Sample' : 'Full dataset aggregation') : 'Recharts · auto preview'}{validResults && fullCanvas && fullscreenView === '3d' && chart3DReady ? ' · WebGL 3D' : ''}</span>
      </div>
    </div>
  );

  return (
    <section className={`ca-chart-library${working === 'analyzer' ? ' is-analyzer' : ''}`}>
      <UniverseCatalogHeader title={working === 'library' ? 'Chart Library' : 'Data Vision'} count={working === 'library' ? (libraryLoading ? '—' : charts.length) : undefined} hint="Katalog visualisasi" actions={<>
        {working === 'analyzer' && <button type="button" className="u-dataset-action" onClick={() => {setFullCanvas(false);setWorking('library');}}>← Chart Library</button>}
        {/* V11.4: catalogue reload */}
        {working === 'library' && <UniverseRefreshButton
          disabled={libraryLoading || busy}
          onClick={() => {
            setError('');
            setLibraryLoading(true);
            void reload().finally(() => setLibraryLoading(false));
          }}
        />}
        <button type="button" className="u-dataset-action is-primary" disabled={busy || (working === 'analyzer' && (queryBusy || !validResults))} onClick={working === 'library' ? openNew : () => void save()}>{working === 'library' ? '+ Chart baru' : '▣ Simpan chart'}</button>
      </>}/>
      {!libraryLoading && error && <p role="alert" className="ca-chart-error">{error}</p>}
      {message && <p role="status" className="ca-chart-message">{message}</p>}

      {working === 'library' ? (
        <div className="ca-chart-library-view">
          <UniverseToolbar className="ca-chart-library-intro u-dataset-filters">
            <label className="ca-chart-library-search"><span className="ca-chart-sr-only">Cari chart</span><input value={chartSearch} onChange={event => setChartSearch(event.target.value)} placeholder="⌕  Cari chart…" /></label>
          </UniverseToolbar>
          {catalogNotices.map(notice => <p key={notice} className="ca-chart-catalog-notice" role="status">{notice}</p>)}
          {libraryLoading ? (
            <div className="ca-chart-empty ca-chart-library-empty" role="status" aria-live="polite">
              <span className="ca-chart-spinner ca-chart-spinner-large" />
              <h3>Memuat Chart Library…</h3>
              <p>Mengambil chart tersimpan dan katalog dataset.</p>
            </div>
          ) : visibleCharts.length ? (
            <div className="ca-chart-list u-thumbnail-gallery">
              {visibleCharts.map(chart => (
                <article key={chart.chart_id} className="ca-chart-card u-thumbnail-card">
                  <div className="ca-chart-card-icon"><ChartThumbnail kind={chart.config.chart_type} /></div>
                  <div className="ca-chart-card-copy">
                    <strong>{chart.name}</strong>
                    <small>{CHART_KINDS.find(kind => kind.value === chart.config.chart_type)?.name || chart.config.chart_type} · {chart.config.dataset_kind} · V{chart.version}</small>
                  </div>
                  <div className="studio-ownership-chart"><OwnershipGrid objectType="CHART" objectId={chart.chart_id}/></div>
                  <div className="ca-chart-card-actions">
                    <button type="button" onClick={() => void openSaved(chart.chart_id)}>Buka Analyzer</button>
                    <button type="button" disabled={busy} onClick={() => void remove(chart.chart_id)}>Hapus</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ca-chart-empty ca-chart-library-empty">
              <div className="ca-chart-empty-icon"><ChartThumbnail kind="column" /></div>
              <h3>{charts.length ? 'Chart tidak ditemukan' : 'Belum ada chart tersimpan'}</h3>
              <p>{charts.length ? 'Coba kata kunci lain.' : 'Buat chart pertama Anda dari dataset yang tersedia.'}</p>
              {!charts.length && <button type="button" onClick={openNew}>+ Buat chart baru</button>}
            </div>
          )}
        </div>
      ) : (
        <div className="ca-chart-analyzer-shell">
          <UniverseToolbar className="ca-chart-commandbar" role="toolbar" aria-label="Toolbar Chart Analyzer">
            <div className="ca-chart-command-group">
              <button type="button" className="ca-chart-command" onClick={() => datasetPickerRef.current?.focus()}>
                <span className="ca-chart-command-icon">▤</span><span>DATASET</span>
              </button>
              <button type="button" className="ca-chart-command" onClick={focusTable}>
                <span className="ca-chart-command-icon">▦</span><span>DATA TABLE</span>
              </button>
              <button type="button" className={activeTools === 'filter' ? 'ca-chart-command is-selected' : 'ca-chart-command'} onClick={() => { setActiveTools('filter'); setShowSettings(true); }}>
                <span className="ca-chart-command-icon">▽</span><span>FILTER & SORT</span>
              </button>
              <button type="button" className={activeTools === 'properties' ? 'ca-chart-command is-selected' : 'ca-chart-command'} onClick={() => { setActiveTools('properties'); setShowSettings(true); }}>
                <span className="ca-chart-command-icon">☷</span><span>PROPERTIES</span>
              </button>
              <button type="button" className="ca-chart-command" onClick={() => setShowChartTypes(value => !value)} aria-pressed={showChartTypes}>
                <span className="ca-chart-command-icon">▥</span><span>CHART TYPES</span>
              </button>
            </div>
            <div className="ca-chart-command-end">
              <span className="ca-chart-technology">RECHARTS ENGINE</span>
              <span className="ca-chart-auto-status" role="status" aria-live="polite">
                {queryBusy ? <><span className="ca-chart-spinner" /> Memuat grafik…</>
                  : !ready ? 'Lengkapi data grafik' : validResults ? '✓ Preview otomatis' : 'Menyiapkan preview…'}
              </span>
            </div>
          </UniverseToolbar>

          <div className="ca-chart-shelf" aria-label="Konfigurasi data chart">
            <label className="ca-chart-name-field">
              <span>NAME</span>
              <input value={name} maxLength={150} onChange={event => setName(event.target.value)} aria-label="Nama chart" />
            </label>
            <label className={`ca-chart-data-slot${config.dimension ? ' is-filled' : ''}`} onDragOver={event => event.preventDefault()} onDrop={dropField('dimension')}>
              <span>{isFilterCard ? 'FILTER FIELD' : 'CATEGORY / X'}</span>
              <select value={config.dimension} onChange={event => setField('dimension', event.target.value)} aria-label="Dimension">
                <option value="">{config.chart_type === 'kpi' ? 'Opsional' : 'Seret kolom di sini'}</option>
                {columns.filter(column => config.chart_type !== 'filter_date' || isDateColumn(column.type)).map(column => <option key={column.name} value={column.name}>{column.name}</option>)}
              </select>
            </label>
            {!isFilterCard && <><label className={`ca-chart-data-slot is-measure${config.measure ? ' is-filled' : ''}`} onDragOver={event => event.preventDefault()} onDrop={dropField('measure')}>
              <span>VALUE / Y</span>
              <select value={config.measure} onChange={event => setField('measure', event.target.value)} aria-label="Measure">
                <option value="">{config.aggregation === 'count' ? 'Hitung baris' : 'Seret kolom di sini'}</option>
                {columns.map(column => <option key={column.name} value={column.name}>{column.name}</option>)}
              </select>
            </label>
            <label className={`ca-chart-data-slot is-aggregation${config.measure ? ' is-filled' : ''}`} onDragOver={event => event.preventDefault()} onDrop={dropAggregation}>
              <span>AGGREGATION</span>
              <select value={config.aggregation} onChange={event => setField('aggregation', event.target.value as ChartConfig['aggregation'])} aria-label="Aggregation">
                {AGGREGATIONS.map(agg => <option key={agg} value={agg}>{agg.toUpperCase()}</option>)}
              </select>
            </label>
            <label className={`ca-chart-data-slot${config.series ? ' is-filled' : ''}`} onDragOver={event => event.preventDefault()} onDrop={dropField('series')}>
              <span>SERIES</span>
              <select value={config.series} disabled={['pie', 'donut', 'kpi', 'pareto', 'progress'].includes(config.chart_type)} onChange={event => setField('series', event.target.value)} aria-label="Series">
                <option value="">{['grouped', 'stacked', 'stacked100', 'area100', 'heatmap', 'combo'].includes(config.chart_type) ? 'Pilih series (wajib)' : 'Tanpa series'}</option>
                {columns.filter(column => column.name !== config.dimension).map(column => (
                  <option key={column.name} value={column.name}>{column.name}</option>
                ))}
              </select>
            </label>
            </>}
            <div className="ca-chart-shelf-type" title="Jenis visualisasi aktif">
              <span>CHART</span>
              <strong>{chartLabel}</strong>
            </div>
          </div>

          {CHART_HINTS[config.chart_type] && <p className="ca-chart-kind-hint">{CHART_HINTS[config.chart_type]}</p>}
          <div className={`ca-chart-body${showSettings ? '' : ' hide-settings'}${showChartTypes ? '' : ' hide-types'}`}>
            <UniverseInspector className="ca-chart-fields" aria-label="Daftar kolom dataset">
              <div className="ca-chart-pane-heading">
                <strong>DataSet</strong>
                <span>{config.dataset_kind}</span>
              </div>
              <label className="ca-chart-dataset-picker">
                <span className="ca-chart-sr-only">Pilih dataset</span>
                <select ref={datasetPickerRef} value={config.dataset_id} disabled={libraryLoading} onChange={event => chooseDataset(event.target.value)}>
                  <option value="">{libraryLoading ? 'Memuat dataset…' : 'Pilih dataset'}</option>
                  {catalog.map(dataset => (
                    <option key={dataset.dataset_id} value={dataset.dataset_id}>
                      {dataset.dataset_name} · {dataset.access_mode === 'PARQUET' ? 'PARQUET' : 'DIRECT'}
                    </option>
                  ))}
                </select>
              </label>
              {catalogNotices.map(notice => <small key={notice} className="ca-chart-dataset-note" role="status">{notice}</small>)}
              {activeDataset && <small className="ca-chart-dataset-name" title={activeDataset.dataset_name}>{activeDataset.dataset_name}</small>}
              <div className="ca-chart-field-tabs" aria-label="Tab kolom"><strong>Columns</strong><span>{columns.length} fields</span></div>
              <label className="ca-chart-field-search">
                <span className="ca-chart-sr-only">Cari kolom</span>
                <input value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="⌕  Cari kolom" />
              </label>
              <div className="ca-chart-field-list">
                <div className="ca-chart-field-group-title">Dimensions <span>{dimensions.length}</span></div>
                {dimensions.map(column => (
                  <button
                    key={column.name}
                    type="button"
                    className="ca-chart-field-item"
                    draggable
                    title={`${column.name} (${column.type}). Seret ke Category atau Series.`}
                    onDragStart={event => { event.dataTransfer.setData('text/plain', column.name); setDragged(column.name); }}
                  >
                    <FieldBadge numeric={false} />
                    <strong>{column.name}</strong>
                  </button>
                ))}
                <div className="ca-chart-field-group-title">Measures <span>{measures.length}</span></div>
                {measures.map(column => (
                  <button
                    key={column.name}
                    type="button"
                    className="ca-chart-field-item is-measure"
                    draggable
                    title={`${column.name} (${column.type}). Seret ke Value.`}
                    onDragStart={event => { event.dataTransfer.setData('text/plain', column.name); setDragged(column.name); }}
                  >
                    <FieldBadge numeric />
                    <strong>{column.name}</strong>
                  </button>
                ))}
                {!visibleColumns.length && <p className="ca-chart-field-empty">{columns.length ? 'Kolom tidak ditemukan.' : 'Pilih dataset untuk memuat kolom.'}</p>}
              </div>
              <div className="ca-chart-fields-foot">Drag & drop kolom ke bar konfigurasi di atas.</div>
            </UniverseInspector>

            {showSettings && (
              <UniverseInspector className="ca-chart-settings" aria-label="Pengaturan chart">
                <div className="ca-chart-pane-heading">
                  <strong>{activeTools === 'filter' ? 'Filters & Sort' : 'Chart Properties'}</strong>
                  <button type="button" className="ca-chart-pane-close" aria-label="Sembunyikan pengaturan" onClick={() => setShowSettings(false)}>×</button>
                </div>
                {activeTools === 'filter' ? (
                  <div className="ca-chart-settings-scroll">
                    <UniverseFormSection className="ca-chart-setting-section">
                      <div className="ca-chart-setting-heading"><strong>Filters</strong><span>{config.filters.length}/8</span></div>
                      <div className="ca-chart-filter-list">
                        {config.filters.map((filter, index) => (
                          <div className="ca-chart-filter-row" key={index}>
                            <div className="ca-chart-filter-title">
                              <strong>Filter {index + 1}</strong>
                              <button type="button" aria-label={`Hapus filter ${index + 1}`} onClick={() => setField('filters', config.filters.filter((_, i) => i !== index))}>×</button>
                            </div>
                            <select aria-label="Kolom filter" value={filter.column} onChange={event => setField('filters', config.filters.map((item, i) => i === index ? { ...item, column: event.target.value } : item))}>
                              {columns.map(column => <option key={column.name} value={column.name}>{column.name}</option>)}
                            </select>
                            <select aria-label="Operator filter" value={filter.operator} onChange={event => setField('filters', config.filters.map((item, i) => i === index ? { ...item, operator: event.target.value as ChartFilterOperator } : item))}>
                              {OPERATORS.map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                            </select>
                            <input aria-label="Nilai filter" placeholder="Nilai filter" value={filter.value} onChange={event => setField('filters', config.filters.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
                          </div>
                        ))}
                        {!config.filters.length && <div className="ca-chart-drop-hint">Belum ada filter. Tambahkan filter untuk membatasi data dari sumber.</div>}
                        <button type="button" className="ca-chart-add-filter" disabled={config.filters.length >= 8 || !columns.length} onClick={() => setField('filters', [...config.filters, { column: columns[0]?.name || '', operator: 'eq', value: '' }])}>+ Tambah filter</button>
                      </div>
                    </UniverseFormSection>
                    {dateColumns.length > 0 && <UniverseFormSection className="ca-chart-setting-section">
                      <div className="ca-chart-setting-heading"><strong>Analisis periode</strong></div>
                      <UniverseField className="ca-chart-setting-control"><span>Kolom tanggal</span>
                        <select value={dateColumn} onChange={event => setDateColumn(event.target.value)}>
                          <option value="">Pilih kolom tanggal</option>
                          {dateColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </UniverseField>
                      <UniverseField className="ca-chart-setting-control"><span>Dari tanggal</span><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></UniverseField>
                      <UniverseField className="ca-chart-setting-control"><span>Sampai tanggal</span><input type="date" min={dateFrom || undefined} value={dateTo} onChange={e => setDateTo(e.target.value)} /></UniverseField>
                      <button type="button" className="ca-chart-add-filter" disabled={!dateColumn || (!dateFrom && !dateTo) || Boolean(dateFrom && dateTo && dateFrom > dateTo)} onClick={applyDateRange}>Terapkan rentang tanggal</button>
                      <small>Rentang tanggal menjadi filter dataset dan memicu refresh otomatis.</small>
                    </UniverseFormSection>}
                    <UniverseFormSection className="ca-chart-setting-section">
                      <div className="ca-chart-setting-heading"><strong>Sorting</strong></div>
                      <UniverseField className="ca-chart-setting-control">
                        <span>Urutan grafik</span>
                        <select value={config.sort} disabled={config.chart_type === 'pareto' || ORDERED_CHARTS.includes(config.chart_type)} onChange={event => setField('sort', event.target.value as ChartConfig['sort'])}>
                          {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </UniverseField>
                    </UniverseFormSection>
                    <UniverseFormSection className="ca-chart-setting-section">
                      <div className="ca-chart-setting-heading"><strong>Limit rows</strong></div>
                      <UniverseField className="ca-chart-setting-control">
                        <span>Top N (maks. 250)</span>
                        <input type="number" min={1} max={250} value={config.limit} onChange={event => setField('limit', Math.min(250, Math.max(1, Number(event.target.value) || 1)))} />
                      </UniverseField>
                    </UniverseFormSection>
                  </div>
                ) : (
                  <div className="ca-chart-settings-scroll">
                    <UniverseFormSection className="ca-chart-setting-section">
                      <div className="ca-chart-setting-heading"><strong>General</strong></div>
                      <UniverseField className="ca-chart-setting-control"><span>Judul chart</span><input value={name} onChange={event => setName(event.target.value)} maxLength={150} /></UniverseField>
                    </UniverseFormSection>
                    <UniverseFormSection className="ca-chart-setting-section">
                      <div className="ca-chart-setting-heading"><strong>Data mapping</strong></div>
                      <UniverseField className="ca-chart-setting-control"><span>Jenis grafik</span><select value={config.chart_type} onChange={event => setChartType(event.target.value as ChartKind)}>{CHART_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.name}</option>)}</select></UniverseField>
                      {!isFilterCard && <UniverseField className="ca-chart-setting-control"><span>Agregasi</span><select value={config.aggregation} onChange={event => setField('aggregation', event.target.value as ChartConfig['aggregation'])}>{AGGREGATIONS.map(agg => <option key={agg} value={agg}>{agg.toUpperCase()}</option>)}</select></UniverseField>}
                    </UniverseFormSection>
                    <UniverseFormSection className="ca-chart-setting-section">
                      <div className="ca-chart-setting-heading"><strong>Chart Properties</strong><button type="button" onClick={() => updateProp('showGrid', true)}>Reset grid</button></div>
                      <div className="ca-chart-property-tabs">{['General', ...(ANALYTICAL_CHARTS.includes(config.chart_type) ? ['Variasi Analitik'] : []), 'Axes & Grid','Hover Text','Number Format','Legend & Labels','Full Size','Layar Penuh 3D'].map(tab => <button type="button" key={tab} className={propertyTab === tab ? 'is-selected' : ''} onClick={() => setPropertyTab(tab)}>{tab} ›</button>)}</div>
                      <div className="ca-chart-property-controls">
                        {propertyTab === 'General' && <>
                          {toggle('showTitle','Tampilkan judul')}{choice('colorDirection','Arah warna',[['normal','Normal'],['reverse','Reverse']])}
                          {textField('noDataMessage','Pesan tanpa data')}{numberField('fontSize','Ukuran font',9,20)}
                        </>}
                        {propertyTab === 'Variasi Analitik' && <>
                          {['cumulative_bar', 'variance'].includes(config.chart_type) && choice('orientation', 'Orientasi batang', [['vertical', 'Tegak'], ['horizontal', 'Mendatar']])}
                          {['cumulative_line', 'combo'].includes(config.chart_type) && <>
                            {choice('trendStyle', 'Bentuk garis', [['linear', 'Lurus'], ['smooth', 'Halus'], ['step', 'Bertahap']])}
                            {toggle('trendMarkers', 'Penanda titik')}
                          </>}
                          {config.chart_type === 'variance' && <>
                            {choice('varianceMode', 'Perubahan nilai', [['absolute', 'Selisih angka'], ['percent', 'Persentase perubahan']])}
                            <small>Kategori pertama tidak memiliki pembanding. Persentase tidak dihitung jika nilai sebelumnya nol atau kosong.</small>
                          </>}
                          {config.chart_type === 'combo' && <>
                            <UniverseField className="ca-chart-setting-control"><span>Kelompok untuk garis</span>
                              <select value={props.comboLineSeries} disabled={!validResults} onChange={event => updateProp('comboLineSeries', event.target.value)}>
                                <option value="">Otomatis: kelompok terakhir</option>
                                {props.comboLineSeries && !resultSeries.includes(props.comboLineSeries) && <option value={props.comboLineSeries}>Tidak ada dalam hasil: {props.comboLineSeries}</option>}
                                {resultSeries.map(series => <option key={series} value={series}>{series}</option>)}
                              </select>
                            </UniverseField>
                            <small>Semua kelompok memakai measure, agregasi, dan skala yang sama. Kelompok selain garis menjadi batang.</small>
                          </>}
                          {config.chart_type === 'slope' && <>
                            {(['slopeStart', 'slopeEnd'] as const).map(key => <UniverseField key={key} className="ca-chart-setting-control"><span>{key === 'slopeStart' ? 'Kategori awal' : 'Kategori akhir'}</span>
                              <select value={props[key]} disabled={!validResults} onChange={event => updateProp(key, event.target.value)}>
                                <option value="">{key === 'slopeStart' ? 'Kategori pertama pada hasil' : 'Kategori terakhir pada hasil'}</option>
                                {props[key] && !resultCategories.includes(props[key]) && <option value={props[key]}>Tidak ada dalam hasil: {props[key]}</option>}
                                {resultCategories.map(category => <option key={category} value={category}>{category}</option>)}
                              </select>
                            </UniverseField>)}
                            <small>Hanya Series yang mempunyai nilai pada kedua kategori yang dibandingkan; pilih dua kategori berbeda.</small>
                          </>}
                          {config.chart_type === 'progress' && <>
                            {numberField('gaugeTarget', 'Target per kategori (wajib > 0)', 0, 1000000000)}
                            <small>Target menggunakan satuan nilai asli, sebelum pembagian format angka. Tidak ada target otomatis.</small>
                          </>}
                          {ORDERED_CHARTS.includes(config.chart_type) && <small>Urutan kategori dikunci A–Z. Analisis hanya mencakup kategori dan Series hasil query (Top N).</small>}
                        </>}
                        {propertyTab === 'Axes & Grid' && <>
                          {toggle('showXAxis','Sumbu X')}{toggle('showYAxis','Sumbu Y')}{toggle('showGrid','Grid')}
                          {textField('xAxisLabel','Label X')}{textField('yAxisLabel','Label Y')}
                        </>}
                        {propertyTab === 'Hover Text' && <>
                          {toggle('showTooltip','Aktifkan tooltip')}{choice('numberFormat','Format hover',[['standard','Number'],['compact','Compact'],['currency','Currency'],['percent','Percent']])}
                          {numberField('decimals','Decimal places',0,6)}{choice('divideBy','Divide value by',[[1,'None'],[1000,'Thousands'],[1000000,'Millions'],[1000000000,'Billions']])}
                          {toggle('negativeParentheses','Negative numbers (100)')}
                        </>}
                        {propertyTab === 'Number Format' && <>
                          {choice('numberFormat','Format angka',[['standard','Number'],['compact','Compact'],['currency','Currency'],['percent','Percent']])}
                          {textField('currencySymbol','Simbol mata uang')}{numberField('decimals','Jumlah desimal',0,6)}
                          <small>Pemisah ribuan/desimal mengikuti locale Indonesia.</small>
                        </>}
                        {propertyTab === 'Legend & Labels' && <>
                          {toggle('showLegend','Tampilkan legend')}{toggle('showDataLabels','Label nilai pada grafik')}
                          {choice('legendPosition','Posisi legend',[['top','Atas'],['bottom','Bawah']])}
                        </>}
                        {propertyTab === 'Full Size' && <>
                          {numberField('chartHeight','Tinggi grafik',260,900)}{numberField('gaugeTarget',config.chart_type === 'progress' ? 'Target per kategori (wajib > 0)' : 'Target Gauge (0 = skala otomatis)',0,1000000000)}{numberField('fontSize','Ukuran font',9,20)}
                        </>}
                        {propertyTab === 'Layar Penuh 3D' && <>
                          {toggle('fullscreen3d','Tampilkan versi 3D saat fullscreen')}
                          <small className="ca-chart-3d-note">Chart yang sama tetap 2D di panel ini dan otomatis menjadi 3D ketika dibuka layar penuh. Tombol 3D di samping Fullscreen juga bisa dipakai untuk mengaktifkannya.</small>
                          {!chart3DReady && <small className="ca-chart-3d-note">Jenis grafik ini belum punya tampilan 3D, sehingga tetap 2D saat fullscreen.</small>}
                        </>}
                      </div>
                    </UniverseFormSection>
                  </div>
                )}
              </UniverseInspector>
            )}

            <main className="ca-chart-main">
              {!fullCanvas && plotPanel}
            </main>
            {fullCanvas && createPortal(
              <div className="ca-chart-library ca-chart-fullscreen-portal">{plotPanel}</div>,
              document.body,
            )}

            {showChartTypes && (
              <UniverseInspector className="ca-chart-types" aria-label="Galeri jenis grafik">
                <div className="ca-chart-pane-heading">
                  <strong>Chart types</strong>
                  <button type="button" className="ca-chart-pane-close" onClick={() => setShowChartTypes(false)} aria-label="Sembunyikan galeri">×</button>
                </div>
                <div className="ca-chart-type-search">
                  <input type="search" value={typeSearch} onChange={event => { setTypeSearch(event.target.value); setClosedSearchGroups([]); }} placeholder="Cari jenis chart..." aria-label="Cari jenis chart" />
                </div>
                <div className="ca-chart-chart-picker">
                  {visibleTypeGroups.length === 0 && <p className="ca-chart-type-no-results">Jenis chart tidak ditemukan.</p>}
                  {visibleTypeGroups.map(group => (
                    <section key={group.name} className="ca-chart-type-group">
                      <h3><button type="button" className="ca-chart-type-group-toggle" aria-expanded={typeSearchTerm ? !closedSearchGroups.includes(group.name) : openTypeGroups.includes(group.name)} onClick={() => {
                        if (typeSearchTerm) {
                          setClosedSearchGroups(groups => groups.includes(group.name) ? groups.filter(name => name !== group.name) : [...groups, group.name]);
                          return;
                        }
                        setOpenTypeGroups(groups => groups.includes(group.name) ? groups.filter(name => name !== group.name) : [...groups, group.name]);
                      }}>
                        <span>{group.name}</span><span aria-hidden="true">{(typeSearchTerm ? !closedSearchGroups.includes(group.name) : openTypeGroups.includes(group.name)) ? '−' : '+'}</span>
                      </button></h3>
                      {(typeSearchTerm ? !closedSearchGroups.includes(group.name) : openTypeGroups.includes(group.name)) && <div className="ca-chart-type-grid">
                        {group.kinds.map(kind => (
                          <button
                            key={kind}
                            type="button"
                            title={CHART_KINDS.find(item => item.value === kind)?.name || kind}
                            className={config.chart_type === kind ? 'ca-chart-type-option is-selected' : 'ca-chart-type-option'}
                            aria-pressed={config.chart_type === kind}
                            onClick={() => setChartType(kind)}
                          >
                            <ChartThumbnail kind={kind} />
                            <span>{CHART_KINDS.find(item => item.value === kind)?.name || kind}</span>
                          </button>
                        ))}
                      </div>}
                    </section>
                  ))}
                </div>
              </UniverseInspector>
            )}
          </div>

          <section className="ca-chart-datatable" ref={tableRef} aria-label="Data Table">
            <div className="ca-chart-datatable-heading">
              <div><strong>Data Table</strong><span>Hasil agregasi sesuai konfigurasi grafik</span></div>
              <button type="button" onClick={() => setShowTable(value => !value)} aria-expanded={showTable}>
                {showTable ? '⌄ Tutup tabel' : '⌃ Buka tabel'}
              </button>
            </div>
            {showTable && (
              validResults ? (
                <div className="ca-chart-table">
                  <UniverseTable>
                    <thead><tr><th>#</th><th>Dimension</th><th>Series</th><th>Value</th></tr></thead>
                    <tbody>
                      {validResults.rows.map((row, index) => (
                        <tr key={`${row.dimension}:${row.series ?? ''}:${index}`}>
                          <td>{index + 1}</td>
                          <td>{row.dimension}</td>
                          <td>{row.series || '—'}</td>
                          <td>{row.value == null ? '—' : row.value.toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </UniverseTable>
                </div>
              ) : (
                <div className="ca-chart-table-placeholder">{queryBusy ? 'Sedang memuat data agregasi…' : 'Lengkapi konfigurasi untuk menampilkan data otomatis.'}</div>
              )
            )}
          </section>
        </div>
      )}
    </section>
  );
}
