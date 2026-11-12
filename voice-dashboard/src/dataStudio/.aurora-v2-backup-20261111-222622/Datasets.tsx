import './dataset-overview.css';
import './datasets-compact.css';
import './datasets-detail-layout-fix.css';
import { loadDatasetCatalog, datasetSource, datasetKind, DATASET_KIND_INFO } from './datasetCatalog';
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

type Connection = { connection_id: string; connection_name: string; database_name: string; is_active: boolean; connector_type?: string; connection_type?: string };
type Source = { schema: string; name: string; type: string };
type IngestJob = {dataset_id:string;run_id:string;status:string;created_at?:string|null;started_at?:string|null;finished_at?:string|null};
type Mode = 'DIRECT' | 'STORED';
const BASE = '/voice-api/api/studio/datasets';
function csrf() { const item = document.cookie.split('; ').find(value => value.startsWith('core_csrf=')); return item ? decodeURIComponent(item.slice(10)) : ''; }
async function api(url: string, signal?: AbortSignal, body?: unknown) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal, headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.code || `HTTP_${response.status}`);
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
function DatabaseSourceIcon({ type }: { type: string }) {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'postgresql' || normalized === 'postgres') {
    // Distinct elephant-inspired silhouette, not a copied brand asset.
    return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 11V7a8 8 0 0 1 16 0v7c0 2-1 3-3 3h-2"/><path d="M8 13v5c0 2 1 3 3 3s3-1 3-3v-7"/><path d="M14 15c2 0 3 1 3 3M6 8h.01M18 8h.01"/><path d="M4 14c-2 0-2 3 0 4h3"/></svg>;
  }
  if (normalized === 'sqlserver' || normalized === 'sql_server' || normalized === 'mssql') {
    // SQL Server-inspired red ribbon mark. Original artwork, not an official Microsoft brand asset.
    return <svg width="25" height="25" viewBox="0 0 32 32" fill="none" aria-hidden="true" role="img">
      <path d="M5 9.2C10.5 3.2 20.7 3.4 27.5 8.3C22 7.3 17.2 8.4 12.6 11.2L6.4 15.1C5.2 13.3 4.8 11.5 5 9.2Z" fill="#E74856"/>
      <path d="M27.5 8.3C28.8 10.4 28.5 13.1 26.2 15.6C23.8 18.3 20.6 19.5 16.4 21.3C12.7 22.9 9.4 24.8 7.5 27.5C5.9 25.7 5.4 23.4 6.3 21.2C7.3 18.8 10.2 16.7 14.2 14.8C19.4 12.3 23.6 10.8 27.5 8.3Z" fill="#D62D3C"/>
      <path d="M7.5 27.5C13.2 29.5 22.1 27.7 26.6 22.8C27.4 21.9 27.9 20.9 28.1 19.8C24.5 22.5 20.1 23.8 15.4 25.4C12.4 26.4 9.9 27.1 7.5 27.5Z" fill="#A91D2B"/>
      <path d="M6.4 15.1C7.6 17 9.3 18.1 11.4 18.7C9.1 20.2 7.2 21.9 6.3 23.9C4.1 21.5 3.8 18.2 6.4 15.1Z" fill="#F16A73"/>
    </svg>;
  }
  return <DatasetKindIcon kind="direct" />;
}
function DatasetKindMark({ dataset }: { dataset: Dataset }) {
  const kind = datasetKind(dataset);
  const info = DATASET_KIND_INFO[kind];
  const style = kindAppearance[kind];
  const connector = dataset.connector_type || dataset.connection_type || '';
  const sourceLabel = kind === 'direct' && connector ? `${connector.toUpperCase()} · ${info.tooltip}` : info.tooltip;
  return <span title={sourceLabel} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 35, height: 35, flexShrink: 0, borderRadius: 11, color: style.color, background: style.background, border: '1px solid color-mix(in srgb, currentColor 20%, transparent)' }}>{kind === 'direct' ? <DatabaseSourceIcon type={connector} /> : <DatasetKindIcon kind={kind}/>}</span>;
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
    if (!source || !name.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await api(BASE, undefined, { connection_id: connection, dataset_name: name.trim(), description: description.trim(), source_schema: source.schema, source_name: source.name, source_type: source.type, access_mode: mode });
      if (mode === 'STORED') { await api(`${BASE}/${encodeURIComponent(created.dataset_id)}/ingest`, undefined, {}); }
      await reload(); setName(''); setDescription(''); setSourceIndex(''); setCreating(false); setNotice(mode === 'STORED' ? 'Dataset tersimpan. Job ingest telah masuk antrean; jalankan Stored Ingest Worker.' : 'Dataset Direct berhasil disimpan.');
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
        await api(`${BASE}/${encodeURIComponent(target.id)}/ingest`,undefined,{});
        setNotice(`Refresh ${item.dataset_name} masuk antrean STORED Worker.`);
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
  return <section className={`datasets-page${creating ? '' : ' datasets-page-catalog'}`} aria-labelledby="datasets-title">
    {creating && <header className="datasets-header datasets-create-header"><div><span className="datasets-eyebrow">DATA STUDIO / DATASETS</span><h1 id="datasets-title">Create dataset<span>.</span></h1><p>Hubungkan sumber data untuk analisis dan dashboard CoreAnalytics.</p></div><button type="button" className="datasets-action" onClick={() => { setCreating(false); setSelectedDataset(null); setError(''); setNotice(''); }}>← Kembali ke katalog</button></header>}
    {error && <p className="datasets-message" role="alert">Permintaan tidak dapat diselesaikan: {error}. Pastikan migrasi dataset dan mode BEAM telah tersedia.</p>}
    {creating && connectionError && <p className="datasets-message" role="alert">{connectionError}</p>}
    {creating && catalogError && <p className="datasets-message" role="status">{catalogError} Pilihan koneksi tetap dapat dilihat jika layanan Connections tersedia.</p>}
    {!creating && catalogNotices.map(notice=><p key={notice} className="datasets-message" role="status">{notice}</p>)}
    {notice && <p className="datasets-message" role="status">{notice}</p>}
    {!creating ? <div className="datasets-catalog">
      <div className="datasets-catalog-heading datasets-catalog-heading-compact">
        <div className="datasets-catalog-identity"><h1 id="datasets-title">Datasets <span className="datasets-count">{loading ? '—' : datasets.length}</span></h1><span className="datasets-catalog-hint">Katalog sumber data</span></div>

        <div className="datasets-catalog-actions">
          <button type="button" className="datasets-action datasets-catalog-refresh" disabled={loading || busy} onClick={() => { setError(''); void reload().catch(err => setError(err instanceof Error ? err.message : 'DATASET_METADATA_UNAVAILABLE')); }} title="Muat ulang metadata dataset tanpa menjalankan proses ingest">↻ <span>Muat ulang</span></button>
          <button type="button" className="datasets-action datasets-catalog-create" onClick={() => { setCreating(true); setSelectedDataset(null); setError(''); setNotice(''); }}>+ <span>Dataset baru</span></button>
        </div>
      </div>
      <CompactCatalogFilters query={query} onQuery={setQuery} placeholder="Cari dataset, koneksi, atau tabel…" filters={filterOptions}/>
      {loading ? <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat dataset…</strong><span>Mengambil katalog dataset dan daftar koneksi.</span></div> : catalogError ? <div className="datasets-empty" role="alert">{catalogError}</div> : !datasets.length ? <div className="datasets-empty"><strong>Belum ada dataset</strong><p>Buat dataset pertama dari koneksi yang sudah tersedia.</p><button type="button" className="datasets-action" onClick={() => setCreating(true)}>+ Create dataset</button></div> : !filtered.length ? <div className="datasets-empty">Tidak ada dataset yang cocok dengan pencarian.</div> : <div className="datasets-catalog-grid"><ul className="datasets-catalog-list">{filtered.map(item => {
        const action=resolveScheduleTarget(item);
        return <li key={item.dataset_id} className="datasets-row-shell">
          <button type="button" className={`datasets-catalog-row${selectedDataset?.dataset_id === item.dataset_id ? ' is-selected' : ''}`} onClick={() => setSelectedDataset(item)} aria-pressed={selectedDataset?.dataset_id === item.dataset_id}>
            <DatasetKindMark dataset={item}/>
            <span className="datasets-catalog-name"><strong>{item.dataset_name}</strong><small>{datasetSource(item)}</small></span>
            <span className="ca-catalog-metadata"><small>Rows</small><strong>{catalogRowCount(item)}</strong></span>
            <span className="ca-catalog-metadata"><small>Dibuat pada</small><strong>{item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '—'}</strong></span>
            <DatasetKindBadge dataset={item}/><span aria-hidden="true">↗</span>
          </button>
          <div className="datasets-row-actions">{action && <SchedulerClockMenu target={action} schedule={schedules.find(s=>s.target_type===action.type&&s.target_id.toLowerCase()===action.id.toLowerCase())} lastRun={item.access_mode==='STORED'?(()=>{const job=lastIngestByDataset.get(item.dataset_id.toLowerCase());return job?(job.started_at||job.finished_at||job.created_at||null):(item.run_id?'completed':null);})():(item.run_id?'completed':null)} disabled={busy} onRun={()=>void runNow(item)} onSchedule={()=>setScheduleTarget(action)} onDetails={()=>onSchedulerDetails?.(action)} onChange={()=>setScheduleRevision(v=>v+1)}/>}</div>
        </li>;
      })}</ul><aside className="datasets-detail">{currentDataset ? <><div className="ca-dataset-detail-header"><div className="ca-dataset-detail-actions"><span className="datasets-eyebrow">DATASET DETAILS</span><button type="button" className="datasets-action datasets-open-explorer" style={{ flexShrink: 0, minHeight: 32, padding: '6px 11px', whiteSpace: 'nowrap' }} onClick={() => onExplore(currentDataset.dataset_id, currentDataset.access_mode === 'PARQUET')} disabled={currentDataset.access_mode === 'STORED' && (currentDataset.storage_status !== 'READY' || !currentDataset.run_id)} title={currentDataset.access_mode === 'STORED' && currentDataset.storage_status !== 'READY' ? 'Jalankan dan selesaikan ingest terlebih dahulu.' : undefined}>Lihat data ↗</button>{resolveScheduleTarget(currentDataset) && <button type="button" className="datasets-action" onClick={()=>{const t=resolveScheduleTarget(currentDataset);if(t)onSchedulerDetails?.(t);}}>◷ Details & History</button>}<ParquetStorageDelete dataset={currentDataset} onDeleted={async()=>{await reload();setSelectedDataset(null);setNotice('Storage Parquet target berhasil dihapus. Definisi dataset tetap tersedia.');}}/></div></div><div className="ca-dataset-detail-body"><h2>{currentDataset.dataset_name}</h2><dl><dt>{currentDataset.access_mode==='PARQUET' ? 'Pipeline':'Connection'}</dt><dd>{currentDataset.connection_name}</dd><dt>Source</dt><dd>{currentDataset.access_mode==='PARQUET' ? currentDataset.source_name:`${currentDataset.source_schema}.${currentDataset.source_name}`}</dd><dt>Jenis dataset</dt><dd>{DATASET_KIND_INFO[datasetKind(currentDataset)].label} · {DATASET_KIND_INFO[datasetKind(currentDataset)].detail}</dd><dt>Access mode</dt><dd>{currentDataset.access_mode === 'DIRECT' ? 'Direct access' : currentDataset.access_mode}</dd><dt>Status</dt><dd>{currentDataset.storage_status}</dd>{currentDataset.access_mode === 'STORED' && currentDataset.refresh_status && <><dt>Refresh terakhir</dt><dd>{currentDataset.refresh_status}</dd></>}<dt>Owner</dt><dd>{currentDataset.owner_name || 'Belum tersedia'}</dd><dt>Cards</dt><dd>Belum tersedia</dd><dt>Tags</dt><dd>Belum tersedia</dd>{currentDataset.run_id && <><dt>Run ID</dt><dd className="ca-id">{currentDataset.run_id}</dd></>}{datasetKind(currentDataset) !== 'direct' && catalogRowCount(currentDataset) !== '—' && <><dt>Jumlah baris</dt><dd>{catalogRowCount(currentDataset)}</dd></>}</dl></div></> : <><span className="datasets-eyebrow">DATASET DETAILS</span><h2>Pilih dataset</h2><p>Informasi dataset yang dipilih akan ditampilkan di sini.</p></>}</aside></div>}
    </div> : <form onSubmit={save} className="datasets-layout">
      <div className="datasets-main">
        <div className="datasets-section-heading"><span>01 / SOURCE</span><h2>Pilih sumber data</h2><p>Mulai dengan koneksi aktif, lalu pilih tabel atau view yang tersedia.</p></div>
        <div className="datasets-fields-grid">
        <SearchPicker label="Connection" placeholder={loading ? 'Memuat koneksi…' : 'Cari koneksi aktif'} value={connection} options={connections.map(item => ({ value: item.connection_id, label: `${item.connection_name} · ${item.database_name}` }))} onSelect={value => { setConnection(value); setSourceLoading(Boolean(value)); setSources([]); setSourceIndex(''); setSourceSearch(''); setSourceHasMore(false); setSourceError(''); setError(''); }} disabled={loading} />
        {!loading && !connections.length && !connectionError && <p className="datasets-message">Belum ada koneksi aktif. Tambahkan atau aktifkan koneksi melalui Connections.</p>}
        <SearchPicker key={connection} label="Tabel atau view" placeholder={!connection ? 'Pilih koneksi terlebih dahulu' : 'Cari schema, tabel, atau view'} value={sourceIndex} options={sources.map((item, index) => ({ value: String(index), label: `${item.schema}.${item.name}`, detail: item.type === 'VIEW' ? 'View' : 'Table' }))} onSelect={setSourceIndex} onSearch={value => { if (value !== sourceSearch) { setSourceSearch(value); setSources([]); setSourceHasMore(false); setSourceError(''); setSourceLoading(true); } }} disabled={!connection || !!sourceError} loading={sourceLoading} hasMore={sourceHasMore} onMore={() => void loadMoreSources()} />
        {sourceError && <div className="datasets-source-error" role="alert"><span>{sourceError === 'DATASET_CONNECTION_METADATA_UNAVAILABLE' ? 'Metadata koneksi belum tersedia dari BEAM. Periksa apakah mode dataset sudah diterapkan dan koneksi masih aktif.' : sourceError === 'HTTP_404' ? 'Endpoint dataset belum tersedia. Pastikan backend yang terbaru sudah dijalankan.' : `Daftar tabel belum dapat dimuat (${sourceError}). Periksa layanan dataset, kebijakan jaringan, dan akses akun SQL.`}</span><button type="button" onClick={() => { setSourceError(''); setSourceLoading(true); setSourceAttempt(value => value + 1); }}>Coba lagi</button></div>}
        {connection && !sourceLoading && !sourceError && !sources.length && <p className="datasets-source-error">{sourceSearch ? 'Tidak ada tabel atau view yang cocok dengan pencarian.' : 'Tidak ada tabel atau view yang terlihat oleh akun SQL pada database ini.'}</p>}
        <label className="datasets-field">Nama dataset<input required maxLength={150} value={name} onChange={event => setName(event.target.value)} placeholder="Contoh: Pendapatan cabang" /></label>
        <label className="datasets-field">Deskripsi (opsional)<input maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Kegunaan dataset" /></label>
        </div>
        <div className="datasets-section-heading"><span>02 / ACCESS MODE</span><h2>Bagaimana data digunakan?</h2><p>Pilih cara dataset mengakses data sesuai kebutuhan.</p></div>
        <div className="datasets-modes" role="radiogroup" aria-label="Mode akses dataset">
          <label className={`datasets-mode ${mode === 'DIRECT' ? 'is-selected' : ''}`}><input type="radio" name="dataset-mode" checked={mode === 'DIRECT'} onChange={() => setMode('DIRECT')} /><span className="datasets-mode-icon" aria-hidden="true">↗</span><span><strong>Direct access</strong><small>Mengakses sumber saat data dibutuhkan.</small></span></label>
          <label className={`datasets-mode ${mode === 'STORED' ? 'is-selected' : ''}`}><input type="radio" name="dataset-mode" checked={mode === 'STORED'} onChange={() => setMode('STORED')} /><span className="datasets-mode-icon" aria-hidden="true">◈</span><span><strong>Store in CoreAnalytics</strong><small>Salin seluruh tabel/view ke Parquet melalui worker.</small></span></label>
        </div>
      </div>
      <aside className="datasets-aside"><span className="datasets-eyebrow">DATASET SETUP</span><h2>{mode === 'DIRECT' ? 'Direct access' : 'Parquet storage'}</h2><p>{mode === 'DIRECT' ? 'Definisi dataset disimpan; data dibaca langsung dari sumber saat Anda membukanya.' : 'Dataset disimpan ke Parquet oleh Stored Ingest Worker. Refresh dapat dijalankan dari detail dataset.'}</p><div className="datasets-aside-line" /><strong>{mode === 'DIRECT' ? 'Direct dataset' : 'Stored dataset'}</strong><p>{mode === 'DIRECT' ? 'Dataset dapat dibuka melalui Data Explorer; data tetap berada di sumber.' : 'Simpan dataset untuk membuat antrean ingest awal. Worker dijalankan secara terpisah.'}</p><button type="submit" disabled={busy || !connection || sourceIndex === '' || !name.trim()}>{busy ? 'Menyimpan…' : 'Save dataset'}</button></aside>
    </form>}
    {scheduleTarget && <div className="datasets-schedule-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setScheduleTarget(null);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();setScheduleTarget(null);}}}>
      <div className="datasets-schedule-dialog" role="dialog" aria-modal="true" aria-label={`Pengaturan jadwal ${scheduleTarget.name}`}>
        <Scheduler key={`${scheduleTarget.type}:${scheduleTarget.id}`} target={scheduleTarget} onClose={()=>setScheduleTarget(null)} onSaved={()=>{setNotice(`Jadwal ${scheduleTarget?.name||'target'} tersimpan.`);setScheduleRevision(v=>v+1);}}/>
      </div>
    </div>}
  </section>;
}
import './aurora-datasets-glass.css';
