import { UniverseHeader, UniverseTable, UniverseTabs, UniverseInspector, UniverseCatalogButton, UniverseToolbar } from '../design-system/components/universe';
import './dataset-overview.css';
import ParquetStorageDelete from './ParquetStorageDelete';
import { loadDatasetCatalog, parquetPreviewUrl } from './datasetCatalog';
import type { CatalogDataset as Dataset } from './datasetCatalog';
import { useEffect, useMemo, useRef, useState } from 'react';
import SearchPicker from './SearchPicker';
import ColumnFilter from './ColumnFilter';
import type { ColumnFilterValue, ColumnFilters } from './ColumnFilter';

type Column = { name: string; type: string };
type Sort = { column: string; direction: 'asc' | 'desc' };
type Preview = { columns: Column[]; preview_columns: Column[]; rows: (string | null)[][]; has_more: boolean; omitted_columns: number; page: number; stable_order: boolean; dataset_name?:string; total_rows?:number; truncated_cells?:boolean };
async function get(url: string, signal: AbortSignal) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.code || `HTTP_${response.status}`);
  return result.data;
}
async function fetchPreview(id: string, page: number, filters: ColumnFilters, sort: Sort | null, parquet:boolean, stored:boolean, signal: AbortSignal) {
  if (parquet) return get(parquetPreviewUrl(id,page),signal);
  if (stored) return get(`/voice-api/api/studio/datasets/${encodeURIComponent(id)}/preview?page=${page}`,signal);
  const csrf = document.cookie.split('; ').find(value => value.startsWith('core_csrf='));
  const response = await fetch(`/voice-api/api/studio/datasets/${encodeURIComponent(id)}/preview`, { method: 'POST', credentials: 'include', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ? decodeURIComponent(csrf.slice(10)) : '' }, body: JSON.stringify({ page, filters, sort }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.code || `HTTP_${response.status}`);
  return result.data;
}
export default function DataExplorer({ initialDatasetId = '', initialParquet = false, onBackToDatasets }: { initialDatasetId?: string; initialParquet?: boolean; onBackToDatasets?: () => void }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [connectionTypes, setConnectionTypes] = useState<Record<string, string>>({});
  const [id, setId] = useState(initialDatasetId);
  const [catalogNotices,setCatalogNotices]=useState<string[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<'overview'|'data'>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<ColumnFilters>({});
  const [openFilter, setOpenFilter] = useState<{ column: string; trigger: HTMLElement } | null>(null);
  const resizeRef = useRef<{ pointerId: number; key: string; startX: number; startWidth: number } | null>(null);
  const widths = useMemo(() => preview?.preview_columns.map((column, index) => {
    const longest = Math.max(column.name.length, column.type.length, ...preview.rows.map(row => String(row[index] ?? 'NULL').length));
    return columnWidths[column.name] ?? Math.max(96, Math.min(280, longest * 7 + 36));
  }) ?? [], [preview, columnWidths]);
  const setWidth = (key: string, value: number) => setColumnWidths(previous => ({ ...previous, [key]: Math.max(72, Math.min(800, Math.round(value))) }));
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([get('/voice-api/api/studio/connections', controller.signal), loadDatasetCatalog(controller.signal)]).then(([connections, catalog]) => {
      if (controller.signal.aborted) return;
      if (connections.status === 'fulfilled' && Array.isArray(connections.value)) {
        setConnectionTypes(Object.fromEntries(connections.value.filter(row => row.connection_id && row.connection_type).map(row => [String(row.connection_id).toLowerCase(), String(row.connection_type)])));
      }
      if (catalog.status === 'fulfilled') { setDatasets(catalog.value.items); setCatalogNotices(catalog.value.notices); }
      else setCatalogError(catalog.reason instanceof Error ? catalog.reason.message : 'DATASET_METADATA_UNAVAILABLE');
      if (connections.status === 'rejected') setCatalogNotices(previous => [...previous, 'Jenis koneksi belum dapat dimuat. Katalog dataset tetap dapat digunakan.']);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const selected = datasets.find(item => item.dataset_id === id);
  const parquet = selected?.access_mode === 'PARQUET' || (id === initialDatasetId && initialParquet);
  const stored = selected?.access_mode === 'STORED';
  const readOnly = parquet || stored;
  useEffect(() => {
    const controller = new AbortController();
    if (!id || tab !== 'data' || loading) return () => controller.abort();
    setBusy(true);
    fetchPreview(id, page, filters, sort, parquet, stored, controller.signal).then(data => { if (!controller.signal.aborted) setPreview(data); }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'DATASET_PREVIEW_UNAVAILABLE'); }).finally(() => { if (!controller.signal.aborted) { setBusy(false); setSorting(false); } });
    return () => controller.abort();
  }, [id, attempt, page, filters, sort, parquet, stored, tab, loading]);
  const applyFilter = (column: string, value: ColumnFilterValue | null) => { setBusy(true); setPreview(null); setError(''); setPage(1); setFilters(previous => { const next = { ...previous }; if (value) next[column] = value; else delete next[column]; return next; }); };
  const sourceType = (dataset: Dataset) => { if (dataset.access_mode==='PARQUET' || dataset.access_mode==='STORED') return 'Parquet'; const type = connectionTypes[String(dataset.connection_id ?? '').toLowerCase()]; return type?.toUpperCase() === 'SQLSERVER' ? 'SQL Server' : type || 'Jenis sumber tidak tersedia'; };
  const visibleDatasets = datasets.filter(item => [item.dataset_name, item.connection_name, item.source_schema, item.source_name, sourceType(item)].some(value => String(value ?? '').toLowerCase().includes(catalogQuery.trim().toLowerCase())));
  const openDataset = (value: string) => { setTab('overview'); setId(value); setSorting(false); setPage(1); setPreview(null); setColumnWidths({}); setFilters({}); setSort(null); setOpenFilter(null); setError(''); setBusy(false); };
  const openData = () => { if (tab !== 'data') { setTab('data'); setBusy(true); setError(''); } };
  return <section className="datasets-page explorer-page" aria-labelledby="explorer-title">
    {!id && <UniverseHeader className="datasets-header"><div><span className="datasets-eyebrow">DATA STUDIO / DATA EXPLORER</span><h1 id="explorer-title">Explore your data<span>.</span></h1><p>Jelajahi sumber Direct dan dataset Parquet tersimpan.</p></div></UniverseHeader>}
    {id && <UniverseToolbar className="explorer-toolbar ca-compact-toolbar"><button type="button" className="explorer-catalog-back" onClick={() => { if (onBackToDatasets) onBackToDatasets(); else openDataset(''); }}>← Semua dataset</button><SearchPicker label="Dataset" placeholder={loading ? 'Memuat dataset…' : 'Cari dataset'} options={datasets.map(item => ({ value: item.dataset_id, label: item.dataset_name, detail: item.connection_name }))} value={id} disabled={loading} onSelect={value => { if (value !== id) openDataset(value); }} />{tab === 'data' && <button type="button" className="universe-refresh-icon datasets-action" disabled={busy || loading} onClick={() => { setBusy(true); setPreview(null); setError(''); setAttempt(value => value + 1); }} aria-label="Muat ulang" data-tooltip="Muat ulang">↻</button>}</UniverseToolbar>}
    {id && !loading && <div className="ca-compact-heading">
      <div className="ca-compact-identity"><div className="ca-compact-title-row"><h2 id="explorer-title">{selected?.dataset_name ?? 'Dataset tidak tersedia'}</h2><span className="ca-status-pill">{selected?.storage_status ?? '—'}</span></div><p>{selected ? `${sourceType(selected)} · ${selected.connection_name}` : 'Metadata tidak tersedia di katalog'}</p></div>
      <div className="ca-compact-stats" aria-label="Ringkasan dataset">
        <span><small>Rows</small><strong>{selected?.row_count == null ? '—' : selected.row_count.toLocaleString('id-ID')}</strong></span>
        <span><small>Cards</small><strong>—</strong></span>
        <span><small>Owner</small><strong>{selected?.owner_name || '—'}</strong></span>
        <span><small>{readOnly ? 'Output dibuat' : 'Dibuat'}</small><strong>{selected?.created_at ? new Date(selected.created_at).toLocaleDateString('id-ID') : '—'}</strong></span>
      </div>
    </div>}
    {id && !loading && <UniverseTabs className="ca-dataset-tabs ca-compact-tabs" aria-label="Dataset detail tabs">
      <button type="button" className={tab === 'overview' ? 'active' : ''} aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}>Overview</button>
      <button type="button" className={tab === 'data' ? 'active' : ''} aria-current={tab === 'data' ? 'page' : undefined} onClick={openData}>Data</button>
    </UniverseTabs>}
    {id && !loading && selected && tab === 'overview' && <section className="ca-compact-overview" aria-label="Dataset overview">
      <div className="ca-compact-info-row">
        <span><small>Source</small><strong>{selected ? `${selected.source_schema}.${selected.source_name}` : '—'}</strong></span>
        <span><small>Run ID / Folder</small><strong className="ca-compact-mono" title={selected?.run_id ?? ''}>{selected?.run_id ?? (readOnly ? '—' : 'Direct SQL')}</strong></span>
        {selected?.run_id && <button type="button" className="ca-compact-copy" onClick={() => navigator.clipboard?.writeText(selected.run_id!)}>Copy ID</button>}
        {selected && selected.access_mode !== 'DIRECT' && <ParquetStorageDelete dataset={selected} onDeleted={async () => { const result = await loadDatasetCatalog(); setDatasets(result.items); setCatalogNotices(result.notices); setPreview(null); setTab('overview'); setError(''); }} />}
        <button type="button" className="datasets-action ca-compact-view" onClick={openData}>Lihat data →</button>
      </div>
      <details className="ca-compact-details" open>
        <summary>Detail teknis &amp; storage <span>Run ID, Output Version, tags, path</span></summary>
        <div className="ca-overview-columns"><div className="ca-overview-panel"><h3>Source &amp; metadata</h3><dl>
          <dt>Mode akses</dt><dd>{readOnly ? 'Parquet (stored)' : 'Direct'}</dd>
          <dt>Connection / Pipeline</dt><dd>{selected?.connection_name ?? '—'}</dd>
          <dt>Source</dt><dd>{selected ? `${selected.source_schema}.${selected.source_name}` : '—'}</dd>
          <dt>Dataset ID</dt><dd className="ca-id">{selected?.dataset_id ?? '—'}</dd>
          <dt>Tags</dt><dd>Belum tersedia dari API</dd>
        </dl></div><div className="ca-overview-panel"><h3>Storage information</h3><dl>
          <dt>Format</dt><dd>{readOnly ? 'Parquet' : 'Direct SQL'}</dd>
          <dt>Run ID / folder</dt><dd className="ca-id">{selected?.run_id ?? 'Tidak tersedia untuk dataset Direct'}</dd>
          <dt>Output Version ID</dt><dd className="ca-id">{parquet ? selected?.dataset_id ?? '—' : '—'}</dd>
          <dt>Relative path</dt><dd className="ca-id">{selected?.storage_relative_path ?? 'Belum tersedia dari API'}</dd>
          <dt>Ukuran Parquet</dt><dd>Belum tersedia dari API</dd>
        </dl></div></div>
      </details>
    </section>}
    {tab === 'data' && Object.keys(filters).length > 0 && <div className="explorer-active-filters" aria-label="Filter aktif"><span>Filter aktif</span>{Object.entries(filters).map(([column, filter]) => <button type="button" key={column} aria-label={`Hapus filter ${column}`} onClick={() => applyFilter(column, null)}>{column} · {filter.mode === 'exclude' ? 'Exclude' : 'Include'} ({filter.values.length}) <span aria-hidden="true">×</span></button>)}<button type="button" onClick={() => { setBusy(true); setPreview(null); setError(''); setPage(1); setFilters({}); }}>Hapus semua</button></div>}
    {tab === 'data' && openFilter && !readOnly && <ColumnFilter key={openFilter.column} datasetId={id} column={openFilter.column} filters={filters} trigger={openFilter.trigger} onApply={value => applyFilter(openFilter.column, value)} onClose={() => setOpenFilter(null)} />}
    {!loading && catalogNotices.map(notice=><p key={notice} role="status">{notice}</p>)}
    {!loading && catalogError && <div className="datasets-source-error" role="alert">Katalog dataset tidak dapat dimuat ({catalogError}). Tutup lalu buka kembali folder untuk mencoba lagi.</div>}
    {loading && <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat Data Explorer…</strong><span>Mengambil katalog dataset dan metadata koneksi.</span></div>}
    {tab === 'data' && error && <div className="datasets-source-error" role="alert">{readOnly ? `Hasil tersimpan belum dapat dibuka (${error}). Periksa layanan pembacaan hasil atau coba lagi.` : `Preview tidak tersedia (${error}). Pastikan koneksi aktif, tabel masih ada, dan akun SQL memiliki izin SELECT.`}</div>}
    {!id && !loading && !catalogError && <div className="explorer-catalog"><UniverseInspector className="explorer-catalog-sidebar"><strong>DATASETS</strong><span>● Semua dataset</span></UniverseInspector><div className="explorer-catalog-body"><label className="datasets-search"><span aria-hidden="true">⌕</span><span className="connections-sr-only">Cari dataset</span><input value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder="Cari dataset, koneksi, atau sumber" /></label><div className="explorer-catalog-count">{loading ? 'Memuat dataset…' : `${visibleDatasets.length} dataset`}</div>{!loading && !visibleDatasets.length ? <div className="datasets-empty">{datasets.length ? 'Tidak ada dataset yang cocok.' : 'Belum ada dataset yang tersedia.'}</div> : <ul className="explorer-catalog-list">{visibleDatasets.map(item => <li key={item.dataset_id}><UniverseCatalogButton type="button" className="explorer-catalog-row" onClick={() => openDataset(item.dataset_id)}><span className="explorer-catalog-icon" aria-hidden="true">▦</span><span className="explorer-catalog-name"><strong>{item.dataset_name}</strong><small>{sourceType(item)} · {item.source_schema}.{item.source_name}</small></span><span className="explorer-catalog-meta"><small>Connection</small><strong>{item.connection_name}</strong></span><span className="explorer-catalog-meta"><small>Access</small><strong>{item.access_mode==='DIRECT' ? 'Direct' : 'Parquet'}</strong></span><span className="explorer-catalog-open">Buka ↗</span></UniverseCatalogButton></li>)}</ul>}</div></div>}
    {id && tab === 'data' && !loading && !preview && busy && <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat data…</strong><span>Mengambil baris untuk tabel preview.</span></div>}
    {tab === 'data' && preview && (!busy || sorting) && <><div className="explorer-summary"><div><span className="datasets-eyebrow">{parquet ? 'PARQUET OUTPUT' : stored ? 'STORED DATASET' : 'DIRECT DATASET'}</span><h2>{selected?.dataset_name ?? preview.dataset_name ?? (parquet ? 'Hasil pipeline':'Dataset')}</h2><p>{selected ? `${sourceType(selected)} · ${selected.connection_name} · ${selected.source_schema}.${selected.source_name}` : ''}</p></div><span>{preview.columns.length} kolom · {preview.rows.length} baris ditampilkan{preview.total_rows !== undefined ? ` dari ${preview.total_rows.toLocaleString('id-ID')} baris`:''}</span></div>
      {readOnly && <p>Urutan sesuai hasil tersimpan.{preview.omitted_columns>0 ? ` ${preview.preview_columns.length} dari ${preview.columns.length} kolom ditampilkan.`:''}{preview.truncated_cells ? ' Nilai panjang dipersingkat untuk tampilan; file hasil tetap lengkap.':''}</p>}
      {preview.preview_columns.length === 0 ? <div className="datasets-empty">Tidak ada kolom dengan tipe yang didukung untuk preview.</div> : <div className="explorer-grid-wrap" aria-busy={sorting}><div className="explorer-table-scroll" role="region" aria-label="Data preview" tabIndex={0}><UniverseTable style={{ width: `max(100%, ${widths.reduce((sum, width) => sum + width, 0)}px)` }}><colgroup>{preview.preview_columns.map((column, index) => <col key={`${column.name}-${index}`} style={{ width: widths[index] }} />)}</colgroup><thead><tr>{preview.preview_columns.map((column, index) => <th key={`${column.name}-${index}`} scope="col" aria-sort={sort?.column === column.name ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>{readOnly ? <span className="explorer-header-name">{column.name}</span>:<button type="button" className="explorer-sort-button" title={`Urutkan ${column.name}`} aria-label={`Urutkan ${column.name}${sort?.column === column.name ? (sort.direction === 'asc' ? ', saat ini naik' : ', saat ini turun') : ''}`} onClick={() => { setBusy(true); setSorting(true); setError(''); setPage(1); setSort(previous => ({ column: column.name, direction: previous?.column === column.name && previous.direction === 'asc' ? 'desc' : 'asc' })); }}><span className="explorer-header-name">{column.name}</span><span className="explorer-sort-indicator" aria-hidden="true">{sort?.column === column.name ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button>}<small>{column.type}</small>{!readOnly && <button type="button" className={`explorer-column-filter-button${filters[column.name] ? ' is-active' : ''}`} aria-haspopup="dialog" onClick={event => setOpenFilter({ column: column.name, trigger: event.currentTarget })}>{filters[column.name] ? 'Filter aktif' : '+ Filter'}</button>}<span className="explorer-resize" role="separator" tabIndex={0} aria-label={`Ubah lebar kolom ${column.name}`} aria-orientation="vertical" aria-valuemin={72} aria-valuemax={800} aria-valuenow={widths[index]} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); resizeRef.current = { pointerId: event.pointerId, key: column.name, startX: event.clientX, startWidth: event.currentTarget.parentElement?.getBoundingClientRect().width ?? widths[index] }; }} onPointerMove={event => { const resize = resizeRef.current; if (resize && resize.pointerId === event.pointerId) setWidth(resize.key, resize.startWidth + event.clientX - resize.startX); }} onPointerUp={() => { resizeRef.current = null; }} onPointerCancel={() => { resizeRef.current = null; }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(column.name, (event.currentTarget.parentElement?.getBoundingClientRect().width ?? widths[index]) + (event.key === 'ArrowRight' ? 16 : -16)); } }} /></th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{row.map((value, columnIndex) => <td key={columnIndex} title={value ?? 'NULL'}>{value === null ? <em>NULL</em> : value}</td>)}</tr>)}</tbody></UniverseTable>{!preview.rows.length && <div className="datasets-empty">Tabel atau view tidak memiliki baris.</div>}</div>{sorting && <div className="explorer-grid-loading" role="status"><span className="explorer-grid-spinner" aria-hidden="true" /> Mengurutkan data…</div>}</div>}
    </>}
    {id && tab === 'data' && <UniverseTabs className="explorer-pagination" aria-label="Halaman data"><button type="button" disabled={busy || page <= 1} onClick={() => { setBusy(true); setPreview(null); setError(''); setPage(value => value - 1); }}>← Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={busy || !preview?.has_more} onClick={() => { setBusy(true); setPreview(null); setError(''); setPage(value => value + 1); }}>Berikutnya →</button></UniverseTabs>}
  </section>;
}
