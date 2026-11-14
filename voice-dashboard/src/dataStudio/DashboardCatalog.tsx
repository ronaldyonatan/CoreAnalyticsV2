import { useCallback, useEffect, useState } from 'react';
import DashboardDesigner from './DashboardDesigner';
import { dashboardApi, hydrateDashboard } from './dashboardPersistence';
import type { DashboardDocument, LoadedDashboard } from './dashboardPersistence';
import CompactCatalogFilters from './CompactCatalogFilters';
import { UniverseToolbar, UniverseInspector } from '../design-system/components/universe';
import './datasets-compact.css';
import './datasets-detail-layout-fix.css';
import './datasets-responsive-layout.css';
import './dashboard-catalog.css';

type Draft = { id: string; name: string; dirty: boolean; remoteId?: string; version?: number; editorCreated: boolean; initial?: LoadedDashboard };
type RemoteDashboard = {dashboard_id:string;dashboard_name:string;version:number};

type DraftEditorProps = {
  draft: Draft;
  active: boolean;
  onBack: () => void;
  onChange: (id: string, update: Partial<Pick<Draft, 'name' | 'dirty'>>) => void;
  onSave: (draft: Draft, name: string, document: DashboardDocument) => Promise<void>;
};

function DraftEditor({ draft, active, onBack, onChange, onSave }: DraftEditorProps) {
  const updateDirty = useCallback((dirty: boolean) => onChange(draft.id, { dirty }), [draft.id, onChange]);
  const updateName = useCallback((name: string) => onChange(draft.id, { name }), [draft.id, onChange]);
  return <div hidden={!active}><DashboardDesigner initial={draft.initial} onSave={(name,document) => onSave(draft,name,document)} onBack={onBack} onDirtyChange={updateDirty} onNameChange={updateName} /></div>;
}

export default function DashboardCatalog({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled=false;
    dashboardApi<RemoteDashboard[]>('/designer/dashboards').then(items => {
      if (cancelled) return;
      setDrafts(existing => [...existing, ...items.filter(item => !existing.some(draft => draft.remoteId === item.dashboard_id)).map(item => ({id:item.dashboard_id,remoteId:item.dashboard_id,name:item.dashboard_name,version:item.version,dirty:false,editorCreated:false}))]);
    }).catch(() => {if (!cancelled) setCatalogError('Penyimpanan dashboard belum tersedia. Dashboard yang ada belum dapat dimuat.');})
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled=true;};
  }, []);
  const dirty = drafts.some(draft => draft.dirty);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const changeDraft = useCallback((id: string, update: Partial<Pick<Draft, 'name' | 'dirty'>>) => {
    setDrafts(items => items.map(item => item.id === id && (('name' in update && item.name !== update.name) || ('dirty' in update && item.dirty !== update.dirty)) ? { ...item, ...update } : item));
  }, []);
  const back = useCallback(() => setActive(null), []);
  const create = () => {
    setNotice('');
    const id = crypto.randomUUID();
    setDrafts(items => [{ id, name: 'Dashboard baru', dirty: false, editorCreated: true }, ...items]);
    setActive(id);
  };
  const saveDraft = async (draft: Draft, name: string, document: DashboardDocument) => {
    const result = draft.remoteId
      ? await dashboardApi<{dashboard_id:string;version:number}>(`/designer/dashboards/${encodeURIComponent(draft.remoteId)}`, 'PUT', {name,document,expected_version:draft.version})
      : await dashboardApi<{dashboard_id:string;version:number}>('/designer/dashboards', 'POST', {name,document,dashboard_id:draft.id});
    if (result.dashboard_id?.toLowerCase() !== (draft.remoteId || draft.id).toLowerCase() || !Number.isInteger(result.version)) throw new Error('DASHBOARD_SERVICE_UNAVAILABLE');
    setDrafts(items => items.map(item => item.id === draft.id ? {...item,remoteId:result.dashboard_id,version:result.version} : item));
    setCatalogError('');
    setNotice('Dashboard berhasil disimpan.');
  };
  const open = async (draft: Draft) => {
    if (busy) return;
    setNotice('');
    if (draft.editorCreated) {setActive(draft.id); return;}
    if (!draft.remoteId) return;
    setBusy(true); setCatalogError('');
    try {
      const stored = await dashboardApi<{name:string;version:number;document:DashboardDocument}>(`/designer/dashboards/${encodeURIComponent(draft.remoteId)}`);
      const initial = await hydrateDashboard(stored.name,stored.document);
      setDrafts(items => items.map(item => item.id === draft.id ? {...item,name:stored.name,version:stored.version,initial,editorCreated:true} : item));
      setActive(draft.id);
    } catch (error) {setCatalogError(`Dashboard tidak dapat dibuka. Pastikan chart dan dataset masih tersedia dan dapat diakses (${error instanceof Error ? error.message : 'DASHBOARD_SERVICE_UNAVAILABLE'}).`);}
    finally {setBusy(false);}
  };
  const remove = async (draft: Draft) => {
    if (!window.confirm(`Hapus ${draft.remoteId ? 'dashboard' : 'draft'} “${draft.name.trim() || 'Dashboard baru'}”?`)) return;
    if (busy) return;
    setBusy(true); setCatalogError('');
    try {
      if (draft.remoteId) await dashboardApi(`/designer/dashboards/${encodeURIComponent(draft.remoteId)}`, 'DELETE', {expected_version:draft.version});
      setDrafts(items => items.filter(item => item.id !== draft.id));
      if (selectedId === draft.id) setSelectedId(null);
    } catch (error) {setCatalogError(`Dashboard tidak dapat dihapus (${error instanceof Error ? error.message : 'DASHBOARD_SERVICE_UNAVAILABLE'}).`);}
    finally {setBusy(false);}
  };
  const filtered = drafts.filter(draft => (draft.name.trim() || 'Dashboard baru').toLowerCase().includes(search.toLowerCase().trim()));
  const selected = drafts.find(draft => draft.id === selectedId);
  return <>
    {active === null && <section className="datasets-page datasets-page-catalog dashboard-catalog" aria-label="Daftar dashboard">
      <div className="datasets-catalog">
        <UniverseToolbar className="datasets-catalog-heading datasets-catalog-heading-compact">
          <div className="datasets-catalog-identity"><h1>Dashboards <span className="datasets-count">{drafts.length}</span></h1></div>
          <div className="datasets-catalog-actions"><button type="button" className="datasets-action datasets-catalog-create" onClick={create}>+ <span>Dashboard baru</span></button></div>
        </UniverseToolbar>
        <CompactCatalogFilters query={search} onQuery={setSearch} placeholder="Cari dashboard…" filters={[]} />
        {catalogError && <p className="datasets-message" role="alert">{catalogError}</p>}
        {notice && <p className="datasets-message" role="status">{notice}</p>}
        {loading && <p className="datasets-message" role="status">Memuat dashboard…</p>}
        {!drafts.length && (loading || catalogError) ? null : !drafts.length ? <div className="datasets-empty"><strong>Belum ada dashboard</strong><p>Buat dashboard pertama dari Chart Library.</p><button type="button" className="datasets-action" onClick={create}>+ Dashboard baru</button></div>
          : !filtered.length ? <div className="datasets-empty">Tidak ada dashboard yang cocok dengan pencarian.</div>
          : <div className="datasets-catalog-grid"><ul className="datasets-catalog-list">{filtered.map(draft => <li key={draft.id}>
            <button type="button" className={`datasets-catalog-row${selectedId === draft.id ? ' is-selected' : ''}`} aria-pressed={selectedId === draft.id} onClick={() => setSelectedId(draft.id)} onDoubleClick={() => void open(draft)}>
              <span className="dashboard-catalog-mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M10 9v12"/></svg></span>
              <span className="datasets-catalog-name"><strong>{draft.name.trim() || 'Dashboard baru'}</strong><small>Dashboard Designer</small></span>
              <span className="ca-catalog-metadata"><small>Status</small><strong>{draft.remoteId && !draft.dirty ? 'Tersimpan' : 'Draft'}</strong></span>
              <span className="ca-catalog-metadata"><small>Penyimpanan</small><strong>{draft.remoteId ? 'CoreAnalytics' : 'Sesi ini'}</strong></span>
              <span className="datasets-mode-label">{draft.remoteId && !draft.dirty ? 'SAVED' : 'DRAFT'}</span><span aria-hidden="true">↗</span>
            </button>
          </li>)}</ul>
          <UniverseInspector className="datasets-detail">{selected ? <><div className="ca-dataset-detail-header"><div className="ca-dataset-detail-actions"><span className="datasets-eyebrow">DASHBOARD DETAILS</span><button type="button" className="datasets-action datasets-open-explorer" disabled={busy} onClick={() => void open(selected)}>Buka dashboard ↗</button></div></div><div className="ca-dataset-detail-body"><div className="deck-inspector-kicker">DATA INTELLIGENCE / INSPECTOR</div><div className="deck-inspector-title"><span className="deck-inspector-symbol" aria-hidden="true">◈</span><div><h2>{selected.name.trim() || 'Dashboard baru'}</h2><small>Dashboard Designer · {selected.remoteId && !selected.dirty ? 'Tersimpan' : 'Draft'}</small></div></div><div className="deck-inspector-section">DETAILS</div><dl><dt>Status</dt><dd>{selected.remoteId && !selected.dirty ? 'Tersimpan' : 'Draft'}</dd><dt>Penyimpanan</dt><dd>{selected.remoteId ? 'CoreAnalytics' : 'Sesi ini'}</dd></dl><button type="button" className="datasets-action dashboard-catalog-delete" disabled={busy} onClick={() => void remove(selected)}>{selected.remoteId ? 'Hapus dashboard' : 'Hapus draft'}</button></div></> : <div className="deck-empty"><span className="deck-empty-symbol" aria-hidden="true">◎</span><span className="deck-inspector-kicker">DATA INTELLIGENCE</span><h2>Dashboard details</h2><p>Pilih dashboard untuk melihat detail dan tindakan yang tersedia.</p></div>}</UniverseInspector></div>}
      </div>
    </section>}
    {drafts.filter(draft => draft.editorCreated).map(draft => <DraftEditor key={draft.id} draft={draft} active={active === draft.id} onBack={back} onChange={changeDraft} onSave={saveDraft} />)}
  </>;
}
