import OwnershipGrid from './OwnershipGrid';
import './ownership-all-modules.css';
import { UniverseHeader, UniverseToolbar, UniverseInspector } from '../design-system/components/universe';
import { UniverseDatabaseMark, UniverseDatabaseSourceIcon } from '../design-system/components/universe/UniverseDatabaseMark';
import './dataset-overview.css';
import './datasets-compact.css';
import './datasets-detail-layout-fix.css';
import { loadDatasetCatalog, datasetSource, datasetKind, isQueryDataset, DATASET_KIND_INFO } from './datasetCatalog';
import type { DatasetKind } from './datasetCatalog';
import type { CatalogDataset as Dataset } from './datasetCatalog';
import { useCallback, useEffect, useRef, useState } from 'react';
import SearchPicker from './SearchPicker';
import Scheduler from './Scheduler';
import type { ScheduleTarget } from './Scheduler';
import { pipelineApi, pipelineUuid } from './pipelineMetadata';
import './datasets-scheduler.css';
import SchedulerClockMenu, {useScheduleIndex} from './SchedulerClockMenu';
import CompactCatalogFilters from './CompactCatalogFilters';
import ParquetStorageDelete from './ParquetStorageDelete';
import OwnershipPicker from './OwnershipPicker';
import './datasets-ownership-compact.css';
import './datasets-query-editor.css';
import SqlQueryWorkbench from './SqlQueryWorkbench';

type Connection = { connection_id: string; connection_name: string; database_name: string; is_active: boolean; connector_type?: string; connection_type?: string };
type Source = { schema: string; name: string; type: string };
type IngestJob = {dataset_id:string;run_id:string;status:string;created_at?:string|null;started_at?:string|null;finished_at?:string|null};
type Mode = 'DIRECT' | 'STORED';
const BASE = '/voice-api/api/studio/datasets';
const DEV_QUERY_PROBE_CONNECTION = '4a8e1bd8-41fb-47ff-b1e9-310ca46a83b3';
function csrf() { const item = document.cookie.split('; ').find(value => value.startsWith('core_csrf=')); return item ? decodeURIComponent(item.slice(10)) : ''; }
function datasetErrorMessage(error: string) {
  return error === 'QUERY_SQL_OBJECT_NOT_FOUND' ? 'Tabel atau view tidak ditemukan. Periksa nama, schema, database, dan izin akses.' : error === 'QUERY_SQL_COLUMN_NOT_FOUND' ? 'Nama kolom tidak ditemukan. Periksa nama kolom dan alias dalam query.' : error === 'QUERY_SQL_SYNTAX_ERROR' ? 'Sintaks SQL belum valid. Periksa query dan ingat bahwa pemisah GO belum didukung.' : error === 'QUERY_SQL_PERMISSION_DENIED' ? 'Izin untuk salah satu objek atau operasi dalam query ditolak.' : error === 'QUERY_SCRIPT_PREVIEW_FAILED' ? 'Preview query gagal. Periksa query dan koneksi sumber; perubahan yang dilakukan skrip mungkin sudah diterapkan.' : `Permintaan tidak dapat diselesaikan: ${error}.`;
}
async function api(url: string, signal?: AbortSignal, body?: unknown) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal, headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    let code = result.code || `HTTP_${response.status}`;
    if (url === `${BASE}/query-dev-probe` && result.diagnostic && typeof result.diagnostic === 'object') {
      const {stage, error_type, sqlstate, native_error, location} = result.diagnostic;
      const details = [stage, error_type, sqlstate].filter(value => typeof value === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(value));
      if (typeof native_error === 'number' && Number.isInteger(native_error)) details.push(String(native_error));
      if (typeof location === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,60}:\d{1,6}$/.test(location)) details.push(location);
      if (details.length) code += `; ${details.join(' / ')}`;
    }
    throw new Error(code);
  }
  return result.data;
}
// Use distinct icon silhouettes; colors inherit existing theme tokens with fallbacks.
const kindAppearance: Record<DatasetKind, { color: string; background: string }> = {
  direct: { color: 'var(--studio-info, var(--color-info, #35b8e6))', background: 'color-mix(in srgb, var(--studio-info, var(--color-info, #35b8e6)) 12%, transparent)' },
  stored: { color: 'var(--studio-success, var(--color-success, #44b8a0))', background: 'color-mix(in srgb, var(--studio-success, var(--color-success, #44b8a0)) 12%, transparent)' },
  etl: { color: 'var(--studio-accent, var(--color-accent, #a995ef))', background: 'color-mix(in srgb, var(--studio-accent, var(--color-accent, #a995ef)) 12%, transparent)' },
};
function DatasetKindIcon({ kind }: { kind: DatasetKind }) {
  const props = { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  if (kind === 'direct') return <svg {...props}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/><path d="M16 10l3-3m-3 0h3v3"/></svg>;
  if (kind === 'stored') return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 13h18M7 16h.01M11 16h.01M8 8h8"/></svg>;
  return <svg {...props}><rect x="2" y="3" width="7" height="6" rx="1.5"/><rect x="15" y="3" width="7" height="6" rx="1.5"/><rect x="8.5" y="16" width="7" height="6" rx="1.5"/><path d="M5.5 9v3h6.5v4M18.5 9v3H12"/></svg>;
}

function DatasetKindMark({ dataset }: { dataset: Dataset }) {
  const kind = datasetKind(dataset);
  const info = DATASET_KIND_INFO[kind];
  const style = kindAppearance[kind];
  const connector = dataset.connector_type || dataset.connection_type || '';
  if (isQueryDataset(dataset)) return <span className="dataset-query-mark" title="Dataset dari SQL Query"><UniverseDatabaseSourceIcon type={connector}/><small>QUERY</small></span>;
  const sourceLabel = kind === 'direct' && connector ? `${connector.toUpperCase()} · ${info.tooltip}` : info.tooltip;
  return kind === 'direct' ? <UniverseDatabaseMark type={connector} title={sourceLabel}/> : <span title={sourceLabel} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 35, height: 35, flexShrink: 0, borderRadius: 11, color: style.color, background: style.background, border: '1px solid color-mix(in srgb, currentColor 20%, transparent)' }}><DatasetKindIcon kind={kind}/></span>;
}
function catalogRowCount(dataset: Dataset): string {
  if (datasetKind(dataset) === 'direct') return '—';
  const count = dataset.row_count;
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? count.toLocaleString('id-ID') : '—';
}
function DatasetKindBadge({ dataset }: { dataset: Dataset }) {
  const kind = datasetKind(dataset);
  const info = DATASET_KIND_INFO[kind];
  return <span className="datasets-mode-label" title={info.tooltip} style={{ color: kindAppearance[kind].color, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '.07em' }}>{info.label}</span>;
}

export default function Datasets({ onExplore, onSchedulerDetails }: { onExplore: (datasetId: string, parquet?:boolean) => void; onSchedulerDetails?:(target:ScheduleTarget)=>void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [ingestJobs,setIngestJobs]=useState<IngestJob[]>([]);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter,setTypeFilter]=useState('');
  const [connectionFilter,setConnectionFilter]=useState('');
  const [ownerFilter,setOwnerFilter]=useState('');
  const [rowsFilter,setRowsFilter]=useState('');
  const [runFilter,setRunFilter]=useState('');
  const [createdFilter,setCreatedFilter]=useState('');
  const [scheduleRevision,setScheduleRevision]=useState(0);
  const {items:schedules}=useScheduleIndex(scheduleRevision);

  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [connection, setConnection] = useState('');
  const [queryProbeAvailable, setQueryProbeAvailable] = useState(false);
  const [queryProbeStatus, setQueryProbeStatus] = useState('');
  const [queryProbeBusy, setQueryProbeBusy] = useState(false);
  const [queryFeatureAvailable, setQueryFeatureAvailable] = useState(false);
  const [sqlScriptDevAvailable, setSqlScriptDevAvailable] = useState(false);
  const [sqlScriptSaveAvailable, setSqlScriptSaveAvailable] = useState(false);
  const [sqlScriptDevStatus, setSqlScriptDevStatus] = useState('');
  const [sourceKind, setSourceKind] = useState<'table'|'query'>('table');
  const [sourceSql, setSourceSql] = useState('');
  const [sqlPreview, setSqlPreview] = useState<{columns:string[];rows:unknown[][];has_more:boolean}|null>(null);
  const [sqlKnownColumns, setSqlKnownColumns] = useState<string[]>([]);
  const [sqlSourceColumns, setSqlSourceColumns] = useState<Record<string, string[]>>({});
  const [sqlPreviewBusy, setSqlPreviewBusy] = useState(false);
  const sqlPreviewRevision = useRef(0);
  const [queryProbeResult, setQueryProbeResult] = useState<{connection: string; message: string} | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceIndex, setSourceIndex] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<Mode>('DIRECT');
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceHasMore, setSourceHasMore] = useState(false);
  const moreController = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogNotices,setCatalogNotices]=useState<string[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [notice, setNotice] = useState('');
  const [scheduleTarget,setScheduleTarget]=useState<ScheduleTarget|null>(null);
  const searchSqlColumns = useCallback(async (prefix: string, signal: AbortSignal) => {
    if (!connection || !sqlScriptDevAvailable || !prefix) return [];
    const params = new URLSearchParams({q:prefix});
    const data = await api(`${BASE}/query-script-dev/column-search/${encodeURIComponent(connection)}?${params}`, signal);
    if (!Array.isArray(data?.items)) return [];
    return data.items.filter((item: {schema?:unknown;table?:unknown;name?:unknown}) =>
      typeof item.schema === 'string' && typeof item.table === 'string' && typeof item.name === 'string') as {schema:string;table:string;name:string}[];
  }, [connection, sqlScriptDevAvailable]);
  useEffect(() => {
    setQueryFeatureAvailable(false); setSourceKind('table'); setSqlPreview(null); setSqlKnownColumns([]); setSqlSourceColumns({}); sqlPreviewRevision.current++;
    if (!creating || !connection) return;
    const controller = new AbortController();
    api(`${BASE}/query-feature/status?connection_id=${encodeURIComponent(connection)}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) setQueryFeatureAvailable(result?.available === true); })
      .catch(() => {});
    return () => controller.abort();
  }, [creating, connection]);

  useEffect(() => {
    if (!creating || sourceKind !== 'query' || !sqlScriptDevAvailable || !connection || !sourceSql.trim()) return;
    const text = sourceSql.toLocaleLowerCase();
    const targets = sources.filter(source => text.includes(source.name.toLocaleLowerCase())
      && !Object.prototype.hasOwnProperty.call(sqlSourceColumns, `${source.schema.toLocaleLowerCase()}.${source.name.toLocaleLowerCase()}`)).slice(0, 4);
    if (!targets.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      Promise.allSettled(targets.map(async source => {
        const params = new URLSearchParams({schema:source.schema, name:source.name, type:source.type});
        const data = await api(`${BASE}/query-script-dev/columns/${encodeURIComponent(connection)}?${params}`, controller.signal);
        const columns = Array.isArray(data?.columns) ? data.columns.map((column: {name?:unknown}) => column.name).filter((name: unknown): name is string => typeof name === 'string') : [];
        return {key:`${source.schema.toLocaleLowerCase()}.${source.name.toLocaleLowerCase()}`, columns};
      })).then(results => {
        if (controller.signal.aborted) return;
        const found = results.filter((result): result is PromiseFulfilledResult<{key:string;columns:string[]}> => result.status === 'fulfilled').map(result => result.value);
        if (found.length) setSqlSourceColumns(previous => ({...previous, ...Object.fromEntries(found.map(item => [item.key, item.columns]))}));
      });
    }, 650);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [creating, sourceKind, sqlScriptDevAvailable, connection, sourceSql, sources, sqlSourceColumns]);

  useEffect(() => {
    setSqlScriptDevAvailable(false); setSqlScriptSaveAvailable(false); setSqlScriptDevStatus('');
    if (!import.meta.env.DEV || !creating || connection.toLowerCase() !== DEV_QUERY_PROBE_CONNECTION) return;
    setSqlScriptDevStatus('loading');
    const controller = new AbortController();
    api(`${BASE}/query-script-dev/status?connection_id=${encodeURIComponent(connection)}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setSqlScriptDevAvailable(result?.available === true); setSqlScriptSaveAvailable(result?.save_available === true); setSqlScriptDevStatus(result?.available === true ? 'available' : 'unavailable'); } })
      .catch(() => { if (!controller.signal.aborted) setSqlScriptDevStatus('unavailable'); });
    return () => controller.abort();
  }, [creating, connection]);

  async function previewSql() {
    if (!connection || !sourceSql.trim() || sqlPreviewBusy) return;
    setSqlPreviewBusy(true); setError(''); setSqlPreview(null);
    const revision = ++sqlPreviewRevision.current;
    try {
      const endpoint = queryFeatureAvailable ? 'query-feature' : 'query-script-dev';
      const result = await api(`${BASE}/${endpoint}/preview`, undefined, {connection_id:connection, query:sourceSql});
      if (revision === sqlPreviewRevision.current) { setSqlPreview(result); setSqlKnownColumns(Array.isArray(result?.columns) ? result.columns : []); }
    } catch (err) { if (revision === sqlPreviewRevision.current) setError(err instanceof Error ? err.message : 'QUERY_PREVIEW_UNAVAILABLE'); }
    finally { setSqlPreviewBusy(false); }
  }
  useEffect(() => {
    setQueryProbeAvailable(false);
    setQueryProbeStatus('');
    if (!import.meta.env.DEV || !creating || connection.toLowerCase() !== DEV_QUERY_PROBE_CONNECTION) return;
    setQueryProbeStatus('loading');
    const controller = new AbortController();
    api(`${BASE}/query-dev-probe/status?connection_id=${encodeURIComponent(connection)}`, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setQueryProbeAvailable(result?.available === true);
          setQueryProbeStatus(result?.available === true ? 'available' : result?.reason || 'unavailable');
        }
      })
      .catch(() => { if (!controller.signal.aborted) setQueryProbeStatus('backend_unavailable'); });
    return () => controller.abort();
  }, [creating, connection]);

  async function runQueryProbe() {
    if (!connection || queryProbeBusy) return;
    const selectedConnection = connection;
    setQueryProbeBusy(true);
    setQueryProbeResult(null);
    try {
      const result = await api(`${BASE}/query-dev-probe`, undefined, { connection_id: selectedConnection });
      setQueryProbeResult({ connection: selectedConnection, message: result?.status === 'QUERY_DEV_PROBE_PASSED'
        ? 'Uji akses dengan query tetap berhasil. Ini belum menguji SQL yang Anda tulis.'
        : 'Uji akses baca belum berhasil.' });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'QUERY_DEV_PROBE_UNAVAILABLE';
      setQueryProbeResult({ connection: selectedConnection, message: code === 'AUTH_REQUIRED'
        ? 'Sesi login tidak tersedia atau tidak valid. Silakan login kembali, lalu ulangi uji.'
        : `Uji akses baca gagal (${code}).` });
    } finally { setQueryProbeBusy(false); }
  }
  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [connectionRows, datasetRows, ingestRows] = await Promise.all([api('/voice-api/api/studio/connections', signal), loadDatasetCatalog(signal), api('/voice-api/api/studio/ingest/jobs',signal).catch(()=>[])]);
      if (signal?.aborted) return;
      const rows = Array.isArray(connectionRows) ? connectionRows : connectionRows?.data;
      setConnections(Array.isArray(rows) ? rows.filter((row: Connection) => row.is_active) : []);
      const activeConnections = Array.isArray(rows) ? rows : [];
      const typesByConnection = new Map<string, string>(activeConnections.map((item: Connection) => [String(item.connection_id).toLowerCase(), item.connector_type || item.connection_type || '']));
      setIngestJobs(Array.isArray(ingestRows)?ingestRows:[]);
      setDatasets(datasetRows.items.map(item => ({ ...item, connector_type: item.connector_type || item.connection_type || typesByConnection.get(String(item.connection_id || '').toLowerCase()) || '' })));setCatalogNotices(datasetRows.notices);
      setCatalogError('');setConnectionError('');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api('/voice-api/api/studio/connections', controller.signal), loadDatasetCatalog(controller.signal), api('/voice-api/api/studio/ingest/jobs', controller.signal)]).then(([connectionsResult, datasetsResult, ingestResult]) => {
      if (controller.signal.aborted) return;
      if (connectionsResult.status === 'fulfilled') {
        const connectionRows = connectionsResult.value;
        const rows = Array.isArray(connectionRows) ? connectionRows : connectionRows?.data;
        setConnections(Array.isArray(rows) ? rows.filter((row: Connection) => row.is_active) : []);
      } else setConnectionError('Daftar koneksi tidak dapat dimuat. Periksa layanan Connections dan sesi login.');
      if (ingestResult.status === 'fulfilled')setIngestJobs(Array.isArray(ingestResult.value)?ingestResult.value:[]);
      if (datasetsResult.status === 'fulfilled') {
        const connectionRows = connectionsResult.status === 'fulfilled' ? connectionsResult.value : [];
        const availableConnections: Connection[] = Array.isArray(connectionRows) ? connectionRows : (Array.isArray(connectionRows?.data) ? connectionRows.data : []);
        const typesByConnection = new Map<string, string>(availableConnections.map(item => [String(item.connection_id).toLowerCase(), item.connector_type || item.connection_type || '']));
        setDatasets(datasetsResult.value.items.map(item => ({ ...item, connector_type: item.connector_type || item.connection_type || typesByConnection.get(String(item.connection_id || '').toLowerCase()) || '' })));setCatalogNotices(datasetsResult.value.notices);
      } else setCatalogError('Katalog dataset belum dapat dimuat. Periksa backend, migrasi dataset, dan mode BEAM.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    if (!connection) return () => controller.abort();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: sourceSearch, offset: '0', limit: '50' });
      api(`${BASE}/sources/${encodeURIComponent(connection)}?${params}`, controller.signal).then(result => { setSources(Array.isArray(result?.items) ? result.items : []); setSourceHasMore(result?.has_more === true); }).catch(err => { if (!controller.signal.aborted) setSourceError(err instanceof Error ? err.message : 'DATASET_SOURCE_UNAVAILABLE'); }).finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); moreController.current?.abort(); };
  }, [connection, sourceAttempt, sourceSearch]);
  async function loadMoreSources() {
    if (!connection || sourceLoading || !sourceHasMore) return;
    setSourceLoading(true);
    const controller = new AbortController();
    moreController.current = controller;
    try {
      const params = new URLSearchParams({ q: sourceSearch, offset: String(sources.length), limit: '50' });
      const result = await api(`${BASE}/sources/${encodeURIComponent(connection)}?${params}`, controller.signal);
      if (controller.signal.aborted) return;
      setSources(previous => [...previous, ...(Array.isArray(result?.items) ? result.items : [])]);
      setSourceHasMore(result?.has_more === true);
    } catch (err) { if (!controller.signal.aborted) setSourceError(err instanceof Error ? err.message : 'DATASET_SOURCE_UNAVAILABLE'); }
    finally { if (!controller.signal.aborted) setSourceLoading(false); if (moreController.current === controller) moreController.current = null; }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const source = sources[Number(sourceIndex)];
    if (!name.trim() || (sourceKind === 'table' && !source) || (sourceKind === 'query' && (!(queryFeatureAvailable || sqlScriptSaveAvailable) || !sourceSql.trim()))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = sourceKind === 'query'
        ? await api(`${BASE}/${sqlScriptSaveAvailable ? 'query-script-dev' : 'query-feature'}`, undefined, {connection_id:connection, dataset_name:name.trim(), description:description.trim(), query:sourceSql})
        : await api(BASE, undefined, { connection_id: connection, dataset_name: name.trim(), description: description.trim(), source_schema: source.schema, source_name: source.name, source_type: source.type, access_mode: mode });
      if (sourceKind === 'query' || mode === 'STORED') {
        try { await api(`${BASE}/${encodeURIComponent(created.dataset_id)}/ingest`, undefined, {}); }
        catch { await reload(); setCreating(false); setNotice('Dataset tersimpan, tetapi ingest belum masuk antrean. Jalankan ulang dari katalog.'); return; }
      }
      await reload(); setName(''); setDescription(''); setSourceSql(''); setSourceIndex(''); setCreating(false); setNotice(sourceKind === 'query' || mode === 'STORED' ? 'Dataset tersimpan. Job ingest telah masuk antrean; jalankan Stored Ingest Worker.' : 'Dataset Direct berhasil disimpan.');
    } catch (err) { setError(err instanceof Error ? err.message : 'DATASET_CREATE_UNAVAILABLE'); }
    finally { setBusy(false); }
  }
  function resolveScheduleTarget(item: Dataset): ScheduleTarget | null {
    if(item.access_mode==='STORED') return {type:'STORED',id:item.dataset_id,name:item.dataset_name};
    // Multiple Parquet outputs may share a pipeline. Never schedule an output_version_id.
    if(item.access_mode==='PARQUET' && item.pipeline_id) return {type:'PIPELINE',id:item.pipeline_id,name:item.connection_name||item.dataset_name};
    return null;
  }
  function pipelineRequestId(): string {
    // Works on private HTTP intranets where crypto.randomUUID may not be exposed.
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  async function runNow(item: Dataset) {
    const target=resolveScheduleTarget(item);
    if(!target || busy)return;
    setBusy(true);setError('');setNotice('');
    try {
      if(target.type==='STORED') {
        const job = await api(`${BASE}/${encodeURIComponent(target.id)}/ingest`,undefined,{});
        const run = typeof job?.run_id === 'string' ? ` ID job: ${job.run_id}.` : '';
        setNotice(`Refresh ${item.dataset_name} masuk antrean STORED Worker.${run}`);
      } else {
        const pipelines=await pipelineApi<{pipeline_id:string;version:number}[]>('');
        const pipeline=pipelines.find(row=>row.pipeline_id.toLowerCase()===target.id.toLowerCase());
        if(!pipeline || !Number.isInteger(pipeline.version) || pipeline.version<1)throw Error('PIPELINE_NOT_READY');
        await pipelineApi(`/${pipelineUuid(target.id)}/runs`,{version:pipeline.version,request_id:pipelineRequestId()});
        setNotice(`Pipeline ${target.name} v${pipeline.version} masuk antrean. Semua output ETL diperbarui bersama.`);
      }
    } catch(err) {setError(err instanceof Error ? err.message:'JOB_SUBMIT_FAILED');}
    finally {setBusy(false);}
  }
  const currentDataset = datasets.find(item => item.dataset_id === selectedDataset?.dataset_id) ?? selectedDataset;
  const lastIngestByDataset=new Map<string,IngestJob>();
  ingestJobs.slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).forEach(job=>{const key=job.dataset_id.toLowerCase();if(!lastIngestByDataset.has(key))lastIngestByDataset.set(key,job);});
  const filtered = datasets.filter(item => {
    if(![item.dataset_name,item.connection_name,item.source_schema,item.source_name].some(v=>String(v??'').toLowerCase().includes(query.trim().toLowerCase())))return false;
    if(typeFilter && datasetKind(item)!==typeFilter)return false;
    if(connectionFilter && item.connection_name!==connectionFilter)return false;
    if(ownerFilter && item.owner_name!==ownerFilter)return false;
    const count=item.row_count;
    if(rowsFilter==='available' && !(typeof count==='number'&&count>=0))return false;
    if(rowsFilter==='100k' && !(typeof count==='number'&&count>=100000))return false;
    if(rowsFilter==='1m' && !(typeof count==='number'&&count>=1000000))return false;
    if(runFilter && (runFilter==='ever')!==Boolean(item.run_id))return false;
    const cutoff=createdFilter==='7d'?7:createdFilter==='30d'?30:0;
    if(cutoff && (!item.created_at||new Date(item.created_at).getTime()<Date.now()-cutoff*86400000))return false;
    return true;
  });
  const filterOptions=[
    {id:'type',label:'Tipe',value:typeFilter,onChange:setTypeFilter,options:[{value:'direct',label:'DIRECT'},{value:'stored',label:'STORED'},{value:'etl',label:'ETL'}]},
    {id:'connection',label:'Koneksi',value:connectionFilter,onChange:setConnectionFilter,options:Array.from(new Set(datasets.map(d=>d.connection_name).filter(Boolean))).sort().map(v=>({value:v,label:v}))},
    {id:'owner',label:'Owner',value:ownerFilter,onChange:setOwnerFilter,options:Array.from(new Set(datasets.map(d=>d.owner_name).filter((v):v is string=>Boolean(v)))).sort().map(v=>({value:v,label:v}))},
    {id:'rows',label:'Rows',value:rowsFilter,onChange:setRowsFilter,options:[{value:'available',label:'Ada row count'},{value:'100k',label:'≥ 100.000'},{value:'1m',label:'≥ 1.000.000'}]},
    {id:'run',label:'Last run',value:runFilter,onChange:setRunFilter,options:[{value:'ever',label:'Pernah run'},{value:'never',label:'Never run'}]},
    {id:'created',label:'Created date',value:createdFilter,onChange:setCreatedFilter,options:[{value:'7d',label:'7 hari terakhir'},{value:'30d',label:'30 hari terakhir'}]},
  ];
  return <section className={`datasets-page${creating ? ' datasets-page-create' : ' datasets-page-catalog'}`} aria-labelledby="datasets-title">
    {creating && <UniverseHeader className="datasets-catalog-heading datasets-create-header datasets-create-command-heading">
      <div className="datasets-catalog-identity"><h1 id="datasets-title">Datasets <span className="datasets-count">CREATE</span></h1><span className="datasets-catalog-hint">Katalog sumber data / Dataset baru</span></div>
      <div className="datasets-catalog-actions"><button type="button" className="datasets-action datasets-create-back" onClick={() => { setCreating(false); setSelectedDataset(null); setError(''); setNotice(''); }}>← Kembali ke katalog</button></div>
    </UniverseHeader>}
    {error && <p className="datasets-message" role="alert">{datasetErrorMessage(error)}</p>}
    {creating && connectionError && <p className="datasets-message" role="alert">{connectionError}</p>}
    {creating && catalogError && <p className="datasets-message" role="status">{catalogError} Pilihan koneksi tetap dapat dilihat jika layanan Connections tersedia.</p>}
    {!creating && catalogNotices.map(notice=><p key={notice} className="datasets-message" role="status">{notice}</p>)}
    {notice && <p className="datasets-message" role="status">{notice}</p>}
    {!creating ? <div className="datasets-catalog">
      <UniverseToolbar className="datasets-catalog-heading datasets-catalog-heading-compact">
        <div className="datasets-catalog-identity"><h1 id="datasets-title">Datasets <span className="datasets-count">{loading ? '—' : datasets.length}</span></h1></div>

        <div className="datasets-catalog-actions">
          <button type="button" className="universe-refresh-icon datasets-action datasets-catalog-refresh" disabled={loading || busy} onClick={() => { setError(''); void reload().catch(err => setError(err instanceof Error ? err.message : 'DATASET_METADATA_UNAVAILABLE')); }} aria-label="Muat ulang" data-tooltip="Muat ulang">↻</button>
          <button type="button" className="datasets-action datasets-catalog-create" onClick={() => { setCreating(true); setSelectedDataset(null); setError(''); setNotice(''); }}>+ <span>Dataset baru</span></button>
        </div>
      </UniverseToolbar>
      <CompactCatalogFilters query={query} onQuery={setQuery} placeholder="Cari dataset, koneksi, atau tabel…" filters={filterOptions}/>
      {loading ? <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat dataset…</strong><span>Mengambil katalog dataset dan daftar koneksi.</span></div> : catalogError ? <div className="datasets-empty" role="alert">{catalogError}</div> : !datasets.length ? <div className="datasets-empty"><strong>Belum ada dataset</strong><p>Buat dataset pertama dari koneksi yang sudah tersedia.</p><button type="button" className="datasets-action" onClick={() => setCreating(true)}>+ Create dataset</button></div> : !filtered.length ? <div className="datasets-empty">Tidak ada dataset yang cocok dengan pencarian.</div> : <div className="datasets-catalog-grid"><ul className="datasets-catalog-list">{filtered.map(item => {
        const action=resolveScheduleTarget(item);
        return <li key={item.dataset_id} className="datasets-row-shell">
          <button type="button" className={`datasets-catalog-row${selectedDataset?.dataset_id === item.dataset_id ? ' is-selected' : ''}`} onClick={() => setSelectedDataset(item)} aria-pressed={selectedDataset?.dataset_id === item.dataset_id}>
            <DatasetKindMark dataset={item}/>
            <span className="datasets-catalog-name"><strong>{item.dataset_name}</strong><small>{datasetSource(item)}</small></span>
            <span className="ca-catalog-metadata"><small>Rows</small><strong>{catalogRowCount(item)}</strong></span>
            <span className="ca-catalog-metadata"><small>Dibuat pada</small><strong>{item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '—'}</strong></span>
            <DatasetKindBadge dataset={item}/>
          </button>
          <div className="studio-ownership-dataset">{item.access_mode === 'PARQUET' ? (item.pipeline_id ? <OwnershipGrid objectType="PIPELINE" objectId={item.pipeline_id}/> : <span title="Pipeline ID belum tersedia">—</span>) : <OwnershipGrid objectType="DATASET" objectId={item.dataset_id} fallbackOwner={item.owner_name}/>}</div><div className="datasets-row-actions">{action && <SchedulerClockMenu target={action} schedule={schedules.find(s=>s.target_type===action.type&&s.target_id.toLowerCase()===action.id.toLowerCase())} lastRun={item.access_mode==='STORED'?(()=>{const job=lastIngestByDataset.get(item.dataset_id.toLowerCase());return job?(job.started_at||job.finished_at||job.created_at||null):(item.run_id?'completed':null);})():(item.run_id?'completed':null)} disabled={busy} onRun={()=>void runNow(item)} onSchedule={()=>setScheduleTarget(action)} onDetails={()=>onSchedulerDetails?.(action)} onChange={()=>setScheduleRevision(v=>v+1)}/>}</div>
        </li>;
      })}</ul><UniverseInspector className="datasets-detail">{currentDataset ? <><div className="ca-dataset-detail-header"><div className="ca-dataset-detail-actions"><span className="datasets-eyebrow">DATASET DETAILS</span><button type="button" className="datasets-action datasets-open-explorer" style={{ flexShrink: 0, minHeight: 32, padding: '6px 11px', whiteSpace: 'nowrap' }} onClick={() => onExplore(currentDataset.dataset_id, currentDataset.access_mode === 'PARQUET')} disabled={currentDataset.access_mode === 'STORED' && (currentDataset.storage_status !== 'READY' || !currentDataset.run_id)} title={currentDataset.access_mode === 'STORED' && currentDataset.storage_status !== 'READY' ? 'Jalankan dan selesaikan ingest terlebih dahulu.' : undefined}>Lihat data ↗</button>{resolveScheduleTarget(currentDataset) && <button type="button" className="datasets-action" onClick={()=>{const t=resolveScheduleTarget(currentDataset);if(t)onSchedulerDetails?.(t);}}>◷ Schedule & History</button>}</div></div><div className="ca-dataset-detail-body"><div className="deck-inspector-kicker">DATA INTELLIGENCE / INSPECTOR</div><div className="deck-inspector-title"><span className="deck-inspector-symbol" aria-hidden="true">◈</span><div><h2>{currentDataset.dataset_name}</h2><small>{currentDataset.connection_name || 'Data Studio'} · {DATASET_KIND_INFO[datasetKind(currentDataset)].label}</small></div></div><div className="deck-metrics"><div className="deck-metric"><span>ROWS</span><strong>{catalogRowCount(currentDataset)}</strong></div><div className="deck-metric"><span>DATA MODE</span><strong className="deck-status">{currentDataset.access_mode === 'PARQUET' ? 'ETL OUTPUT' : currentDataset.access_mode}</strong></div><div className="deck-metric"><span>STORAGE STATUS</span><strong className="deck-status">{currentDataset.storage_status || '—'}</strong></div><div className="deck-metric"><span>CONNECTION</span><strong style={{fontSize: '13px'}}>{currentDataset.connection_name || '—'}</strong></div></div><div className="deck-inspector-section">OWNERSHIP & SHARING</div><div className="datasets-ownership-panel">{currentDataset.access_mode === 'PARQUET' && currentDataset.pipeline_id ? <OwnershipPicker key={currentDataset.pipeline_id} objectType="PIPELINE" objectId={currentDataset.pipeline_id}/> : <OwnershipPicker key={currentDataset.dataset_id} objectType="DATASET" objectId={currentDataset.dataset_id} fallbackOwner={currentDataset.owner_name}/> }</div>{currentDataset.access_mode !== 'DIRECT' && <details className="datasets-inspector-storage-actions"><summary>Storage actions <span>Kelola output Parquet</span></summary><div className="datasets-inspector-storage-danger"><p>Tindakan ini menghapus output Parquet, bukan definisi dataset atau tabel sumber.</p><ParquetStorageDelete dataset={currentDataset} onDeleted={async()=>{await reload();setSelectedDataset(null);setNotice('Storage Parquet target berhasil dihapus. Definisi dataset tetap tersedia.');}}/></div></details>}<div className="deck-inspector-section">TECHNICAL DETAILS</div><dl><dt>{currentDataset.access_mode==='PARQUET' ? 'Pipeline':'Connection'}</dt><dd>{currentDataset.connection_name}</dd><dt>Source</dt><dd>{isQueryDataset(currentDataset) ? 'SQL Query' : currentDataset.access_mode==='PARQUET' ? currentDataset.source_name:`${currentDataset.source_schema}.${currentDataset.source_name}`}</dd><dt>Jenis dataset</dt><dd>{DATASET_KIND_INFO[datasetKind(currentDataset)].label} · {DATASET_KIND_INFO[datasetKind(currentDataset)].detail}</dd><dt>Access mode</dt><dd>{currentDataset.access_mode === 'DIRECT' ? 'Direct access' : currentDataset.access_mode}</dd><dt>Status</dt><dd>{currentDataset.storage_status}</dd>{currentDataset.access_mode === 'STORED' && currentDataset.refresh_status && <><dt>Refresh terakhir</dt><dd>{currentDataset.refresh_status}</dd></>}<dt>Owner</dt><dd>{currentDataset.owner_name || 'Belum tersedia'}</dd><dt>Cards</dt><dd>Belum tersedia</dd><dt>Tags</dt><dd>Belum tersedia</dd>{currentDataset.run_id && <><dt>Run ID</dt><dd className="ca-id">{currentDataset.run_id}</dd></>}{datasetKind(currentDataset) !== 'direct' && catalogRowCount(currentDataset) !== '—' && <><dt>Jumlah baris</dt><dd>{catalogRowCount(currentDataset)}</dd></>}</dl></div></> : <div className="deck-empty"><span className="deck-empty-symbol" aria-hidden="true">◎</span><span className="deck-inspector-kicker">DATA INTELLIGENCE</span><h2>Explore your data</h2><p>Pilih dataset di sebelah kiri untuk melihat metrik, koneksi, status, dan tindakan yang tersedia.</p></div>}</UniverseInspector></div>}
    </div> : <form onSubmit={save} className="datasets-layout datasets-create-layout">
      <div className="datasets-main datasets-create-main">
        <section className="datasets-create-step datasets-create-step-source" aria-labelledby="ds52-source">
          <div className="datasets-create-step-header"><span className="datasets-create-step-number">01</span><div><h2 id="ds52-source">Source</h2><p>{sourceKind === 'query' ? 'Pilih koneksi dan tulis query untuk membentuk dataset.' : 'Pilih koneksi aktif dan tabel atau view yang tersedia.'}</p></div></div>
          <div className="datasets-fields-grid datasets-create-fields">
            <SearchPicker label="Connection" placeholder={loading ? 'Memuat koneksi…' : 'Cari koneksi aktif'} value={connection} options={connections.map(item => ({ value: item.connection_id, label: `${item.connection_name} · ${item.database_name}` }))} onSelect={value => { setConnection(value); setSourceLoading(Boolean(value)); setSources([]); setSourceIndex(''); setSourceSearch(''); setSourceHasMore(false); setSourceError(''); setError(''); }} disabled={loading} />
            {sourceKind === 'table' && <SearchPicker key={connection} label="Tabel atau view" placeholder={!connection ? 'Pilih koneksi terlebih dahulu' : 'Cari schema, tabel, atau view'} value={sourceIndex} options={sources.map((item, index) => ({ value: String(index), label: `${item.schema}.${item.name}`, detail: item.type === 'VIEW' ? 'View' : 'Table' }))} onSelect={setSourceIndex} onSearch={value => { if (value !== sourceSearch) { setSourceSearch(value); setSources([]); setSourceHasMore(false); setSourceError(''); setSourceLoading(true); } }} disabled={!connection || !!sourceError} loading={sourceLoading} hasMore={sourceHasMore} onMore={() => void loadMoreSources()} />}
          </div>
          {(queryFeatureAvailable || sqlScriptDevAvailable) && <div className="datasets-query-editor">
            <div className="datasets-query-choice" role="group" aria-label="Jenis sumber">
              <button type="button" aria-pressed={sourceKind === 'table'} onClick={() => setSourceKind('table')}>Tabel / View</button>
              <button type="button" aria-pressed={sourceKind === 'query'} onClick={() => {setSourceKind('query');setMode('STORED');}}>SQL Query</button>
            </div>
            {sourceKind === 'query' && <SqlQueryWorkbench value={sourceSql} onChange={value => {sqlPreviewRevision.current++; setSourceSql(value); setSqlPreview(null); setError('');}} onRun={() => void previewSql()} busy={sqlPreviewBusy} preview={sqlPreview} knownColumns={sqlKnownColumns} sourceColumns={sqlSourceColumns} sources={sources} searchColumns={searchSqlColumns} connectionType={connections.find(item => item.connection_id.toLowerCase() === connection.toLowerCase())?.connector_type || connections.find(item => item.connection_id.toLowerCase() === connection.toLowerCase())?.connection_type || (connection.toLowerCase() === DEV_QUERY_PROBE_CONNECTION ? 'sqlserver' : '')} error={error ? datasetErrorMessage(error) : ''} usesConnectionCredentials={!queryFeatureAvailable && sqlScriptDevAvailable} saveAvailable={sqlScriptSaveAvailable}/>}
          </div>}
          {sqlScriptDevStatus === 'unavailable' && !queryFeatureAvailable && <p className="datasets-message" role="status">Editor SQL Query DEV belum aktif atau akses koneksi tidak tersedia. Jalankan backend dengan scripts/start_dataset_query_probe_dev.sh, lalu refresh halaman dan pastikan Anda memiliki akses edit pada koneksi bi.</p>}
          {import.meta.env.DEV && !sqlScriptDevAvailable && connection.toLowerCase() === DEV_QUERY_PROBE_CONNECTION && queryProbeStatus && <div className="datasets-query-dev-probe">
            {queryProbeAvailable ? <>
              <button type="button" className="datasets-action" disabled={queryProbeBusy} onClick={() => void runQueryProbe()}>{queryProbeBusy ? 'Menguji akses baca…' : 'Uji akses BI dengan query tetap (DEV)'}</button>
              {queryProbeResult?.connection === connection && <p role="status">{queryProbeResult.message}</p>}
            </> : <p role="status">{queryProbeStatus === 'loading' ? 'Memeriksa kesiapan uji query DEV…'
              : queryProbeStatus === 'access_denied' ? 'Uji query DEV belum tersedia untuk akun ini. Periksa hak akses pada Connection bi.'
              : queryProbeStatus === 'other_connection' ? 'Connection ini bukan target uji query DEV.'
              : 'Uji query DEV belum aktif. Jalankan backend dengan scripts/start_dataset_query_probe_dev.sh, lalu refresh halaman.'}</p>}
          </div>}
          {!loading && !connections.length && !connectionError && <p className="datasets-message">Belum ada koneksi aktif. Tambahkan atau aktifkan koneksi melalui Connections.</p>}
          {sourceKind === 'table' && sourceError && <div className="datasets-source-error" role="alert"><span>{sourceError === 'DATASET_CONNECTION_METADATA_UNAVAILABLE' ? 'Metadata koneksi belum tersedia dari BEAM. Periksa apakah mode dataset sudah diterapkan dan koneksi masih aktif.' : sourceError === 'HTTP_404' ? 'Endpoint dataset belum tersedia. Pastikan backend yang terbaru sudah dijalankan.' : `Daftar tabel belum dapat dimuat (${sourceError}). Periksa layanan dataset, kebijakan jaringan, dan akses akun SQL.`}</span><button type="button" onClick={() => { setSourceError(''); setSourceLoading(true); setSourceAttempt(value => value + 1); }}>Coba lagi</button></div>}
          {sourceKind === 'table' && connection && !sourceLoading && !sourceError && !sources.length && <p className="datasets-source-error">{sourceSearch ? 'Tidak ada tabel atau view yang cocok dengan pencarian.' : 'Tidak ada tabel atau view yang terlihat oleh akun SQL pada database ini.'}</p>}
        </section>
        <section className="datasets-create-step datasets-create-step-identity" aria-labelledby="ds52-identity">
          <div className="datasets-create-step-header"><span className="datasets-create-step-number">02</span><div><h2 id="ds52-identity">Identity</h2><p>Berikan nama yang mudah dikenali di katalog.</p></div></div>
          <div className="datasets-fields-grid datasets-create-fields">
            <label className="datasets-field">Nama dataset<input required maxLength={150} value={name} onChange={event => setName(event.target.value)} placeholder="Contoh: Pendapatan cabang" /></label>
            <label className="datasets-field">Deskripsi (opsional)<input maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Kegunaan dataset" /></label>
          </div>
        </section>
        <section className="datasets-create-step datasets-create-step-mode" aria-labelledby="ds52-mode">
          <div className="datasets-create-step-header"><span className="datasets-create-step-number">03</span><div><h2 id="ds52-mode">Access mode</h2><p>Pilih cara CoreAnalytics membaca data.</p></div></div>
          <div className={`datasets-modes${sourceKind === 'query' ? ' datasets-modes--single' : ''}`} role="radiogroup" aria-label="Mode akses dataset">
          {sourceKind !== 'query' && <label className={`datasets-mode ${mode === 'DIRECT' ? 'is-selected' : ''}`}><input type="radio" name="dataset-mode" checked={mode === 'DIRECT'} onChange={() => setMode('DIRECT')} /><span className="datasets-mode-icon" aria-hidden="true">↗</span><span><strong>Direct access</strong><small>Mengakses sumber saat data dibutuhkan.</small></span></label>}
          <label className={`datasets-mode ${mode === 'STORED' ? 'is-selected' : ''}`}><input type="radio" name="dataset-mode" checked={mode === 'STORED'} onChange={() => setMode('STORED')} /><span className="datasets-mode-icon" aria-hidden="true">◈</span><span><strong>Store in CoreAnalytics</strong><small>{sourceKind === 'query' ? 'Simpan hasil query sebagai Parquet melalui worker.' : 'Salin seluruh tabel/view ke Parquet melalui worker.'}</small></span></label>
        </div>
        </section>
      </div>
      <aside className="datasets-aside datasets-create-inspector" aria-label="Ringkasan konfigurasi dataset">
        <div className="datasets-create-inspector-kicker"><span aria-hidden="true">◎</span> DATA INTELLIGENCE / SETUP</div>
        <div className="datasets-create-preview">
          <span className="datasets-create-preview-label">Dataset preview</span>
          <h2>{name.trim() || 'New dataset'}</h2>
          <p>{description.trim() || 'Review konfigurasi sebelum menyimpan dataset.'}</p>
        </div>
        <dl className="datasets-create-specs">
          <div><dt>Connection</dt><dd>{connections.find(item => item.connection_id === connection)?.connection_name || 'Belum dipilih'}</dd></div>
          <div><dt>Source</dt><dd>{sourceKind === 'query' ? 'SQL Query' : sourceIndex !== '' && sources[Number(sourceIndex)] ? `${sources[Number(sourceIndex)].schema}.${sources[Number(sourceIndex)].name}` : 'Belum dipilih'}</dd></div>
          <div><dt>Access Mode</dt><dd className="datasets-create-mode-value">{mode === 'DIRECT' ? 'DIRECT' : 'STORED'}</dd></div>
        </dl>
        <p className="datasets-create-mode-note">{mode === 'DIRECT' ? 'Data tetap berada di sumber dan dibaca melalui Data Explorer.' : 'Dataset akan diingest ke Parquet melalui worker. Status awal dapat dipantau dari katalog.'}</p>
        <div className="datasets-create-save-dock"><button type="submit" disabled={busy || !connection || (sourceKind === 'table' ? sourceIndex === '' : !(queryFeatureAvailable || sqlScriptSaveAvailable) || !sourceSql.trim()) || !name.trim()}>{busy ? 'Menyimpan…' : sourceKind === 'query' ? 'Simpan & antrekan dataset' : 'Save dataset'}<span aria-hidden="true">↗</span></button><small>{sourceKind === 'query' && !(queryFeatureAvailable || sqlScriptSaveAvailable) ? 'Preview DEV tersedia; metadata atau gateway query belum siap.' : sourceKind === 'query' ? 'Simpan definisi dan antrekan ingest; worker menjalankan skrip.' : 'Konfigurasi dapat diperiksa kembali dari Dataset Details.'}</small></div>
      </aside>
    </form>}
    {scheduleTarget && <div className="datasets-schedule-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setScheduleTarget(null);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();setScheduleTarget(null);}}}>
      <div className="datasets-schedule-dialog" role="dialog" aria-modal="true" aria-label={`Pengaturan jadwal ${scheduleTarget.name}`}>
        <Scheduler key={`${scheduleTarget.type}:${scheduleTarget.id}`} target={scheduleTarget} onClose={()=>setScheduleTarget(null)} onSaved={()=>{setNotice(`Jadwal ${scheduleTarget?.name||'target'} tersimpan.`);setScheduleRevision(v=>v+1);}}/>
      </div>
    </div>}
  </section>;
}
import './aurora-datasets-glass.css';

import './aurora-datasets-v2.css';

import './aurora-command-deck-v3.css';

import './aurora-command-deck-v4.css';
import './aurora-command-deck-v5.css';
import './aurora-command-deck-v5-1.css';
import './aurora-command-deck-v5-2.css';
import './datasets-responsive-layout.css';
