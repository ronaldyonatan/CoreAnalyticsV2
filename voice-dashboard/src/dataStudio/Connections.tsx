import OwnershipGrid from './OwnershipGrid';
import './ownership-all-modules.css';
import OwnershipPicker from './OwnershipPicker';
import { UniverseHeader, UniverseToolbar, UniverseForm, UniverseFormSection, UniverseField, UniverseCatalogButton, UniverseCatalogList, UniverseCatalogHeader, UniverseCatalogSplit, UniverseCatalogEntry, UniverseCatalogInspector, UniverseInspectorDetails, UniverseDatabaseMark, UniverseDatabaseSourceIcon } from '../design-system/components/universe';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';

type Connection = { connection_id: string; connection_name: string; connection_type: string; server_host: string; server_port: number; database_name: string; login_username: string; is_active: boolean; encrypt_transport: boolean; trust_server_certificate: boolean; created_at?: string };
type CatalogItem = { id: string; label: string; category: string; description: string; capabilities: string[]; enabled: boolean };
type Form = { connection_name: string; server_host: string; server_port: number; database_name: string; login_username: string; password: string; encrypt_transport: boolean; trust_server_certificate: boolean; connection_timeout_seconds: number };
const empty: Form = { connection_name: '', server_host: '', server_port: 1433, database_name: '', login_username: '', password: '', encrypt_transport: true, trust_server_certificate: false, connection_timeout_seconds: 10 };
const BASE = '/voice-api/api/studio/connections';
function csrf() { const entry = document.cookie.split('; ').find(v => v.startsWith('core_csrf=')); return entry ? decodeURIComponent(entry.substring('core_csrf='.length)) : ''; }
async function api(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
  const res = await fetch(BASE + path, { method, credentials: 'include', cache: 'no-store', signal, headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({ success: false, code: `HTTP_${res.status}` }));
  if (!res.ok || data.success === false) throw new Error(String(data.code || data.message || `HTTP_${res.status}`));
  return data;
}
type IconName = 'database' | 'refresh' | 'plus' | 'search' | 'server' | 'shield' | 'arrow' | 'close';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></>,
    server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <UniverseField className="connection-field"><span>{label}</span>{children}</UniverseField>;
}
export default function Connections({ active = true }: { active?: boolean }) {
  const [items, setItems] = useState<Connection[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [selectedConnector, setSelectedConnector] = useState('sqlserver');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const catalogItems = useMemo(() => catalog.filter(item => (catalogCategory === 'All' || item.category === catalogCategory) && (item.label + ' ' + item.description).toLowerCase().includes(catalogQuery.trim().toLowerCase())), [catalog, catalogCategory, catalogQuery]);
  const activeCount = items.filter(item => item.is_active).length;
  const selectedConnection = items.find(item => item.connection_id === selectedConnectionId);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(item => (status === 'all' || (status === 'active') === item.is_active) &&
      [item.connection_name, item.server_host, item.database_name, item.connection_type].some(value => String(value ?? '').toLowerCase().includes(query)));
  }, [items, search, status]);
  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const result = await api('', 'GET', undefined, signal);
      if (signal?.aborted) return;
      const value = result.data;
      setItems(Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Gagal memuat koneksi'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useLayoutEffect(() => {
    if (!active) { setLoading(true); return; }
    const controller = new AbortController();
    void reload(controller.signal);
    void api('/connector-capabilities', 'GET', undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const raw = result.data || {};
      const labels: Record<string, string> = { sqlserver: 'SQL Server', postgresql: 'PostgreSQL', mysql: 'MySQL', oracle: 'Oracle', bigquery: 'BigQuery', firebase: 'Firebase', rest: 'REST API', csv: 'CSV / Excel' };
      const categories: Record<string, string> = { bigquery: 'Cloud', firebase: 'Cloud', rest: 'API', csv: 'File' };
      const entries = Object.entries(raw).map(([id, value]) => ({ id, label: labels[id] || id, category: categories[id] || 'Database', description: id === 'sqlserver' ? 'Microsoft SQL Server' : id === 'postgresql' ? 'Open-source relational database' : 'Data source connector', capabilities: Array.isArray(value) ? value.map(String) : [], enabled: Array.isArray(value) && value.includes('test') }));
      setCatalog(entries.sort((a,b) => a.label.localeCompare(b.label)));
    }).catch(() => { if (!controller.signal.aborted) setCatalog([{id:'sqlserver',label:'SQL Server',category:'Database',description:'Microsoft SQL Server',capabilities:['test'],enabled:true}]); });
    return () => controller.abort();
  }, [active, reload]);
  function openCatalog() { setAdding(false); setCatalogOpen(true); setCatalogQuery(''); setCatalogCategory('All'); setSelectedConnector('sqlserver'); }
  function chooseConnector(id: string) { const item = catalog.find(c => c.id === id); if (!item?.enabled) return; setEditingId(null); setSelectedConnector(id); setForm({...empty,server_port:id === 'postgresql' ? 5432 : 1433}); setCatalogOpen(false); setAdding(true); }
  function startEdit(item: Connection) { setCatalogOpen(false); setEditingId(item.connection_id); setSelectedConnector(item.connection_type.toLowerCase()); setForm({ connection_name:item.connection_name,server_host:item.server_host,server_port:item.server_port,database_name:item.database_name,login_username:item.login_username,password:'',encrypt_transport:item.encrypt_transport,trust_server_certificate:item.trust_server_certificate,connection_timeout_seconds:(item as Connection & {connection_timeout_seconds?:number}).connection_timeout_seconds ?? 10 }); setAdding(true); }
  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm(prev => ({ ...prev, [key]: value }));
  async function test() { setBusy(true); setNotice(''); setError(''); try { const result = await api('/test', 'POST', {...form, connector_type:selectedConnector}); setNotice(result.message || result.data?.message || 'Test connection berhasil.'); } catch(e) { setError(e instanceof Error ? e.message : 'Test connection gagal'); } finally { setBusy(false); } }
  async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setNotice(''); setError(''); try { await api(editingId ? `/${encodeURIComponent(editingId)}` : '', editingId ? 'PATCH' : 'POST', {...form,connector_type:selectedConnector}); setNotice(editingId ? 'Connection berhasil diperbarui.' : 'Connection berhasil ditambahkan.'); setEditingId(null); setAdding(false); setForm(empty); await reload(); } catch(e) { setError(e instanceof Error ? e.message : 'Gagal menyimpan koneksi'); } finally { setBusy(false); } }
  async function toggle(item: Connection) { setBusy(true); setError(''); setNotice(''); try { await api(`/${encodeURIComponent(item.connection_id)}/active`, 'PATCH', { is_active: !item.is_active }); setNotice(`Connection ${item.connection_name} diperbarui.`); await reload(); } catch(e) { setError(e instanceof Error ? e.message : 'Gagal memperbarui status'); } finally { setBusy(false); } }
  return <section className="connections-page" aria-labelledby="connections-title">
    <div className="connections-wrap">
      <UniverseCatalogHeader id="connections-title" title="Connections" count={loading ? '—' : items.length} hint="Katalog sumber data"
        actions={<><button type="button" className="universe-refresh-icon u-dataset-action" disabled={loading || busy} onClick={() => void reload()} aria-label="Muat ulang" data-tooltip="Muat ulang">↻</button><button type="button" className="u-dataset-action is-primary" aria-expanded={adding || catalogOpen} aria-controls="connection-form" onClick={() => { if (adding || catalogOpen) {setAdding(false);setCatalogOpen(false);} else openCatalog(); }}>{adding || catalogOpen ? '× Tutup' : '+ Koneksi baru'}</button></>}/>

      {!loading && error && <div role="alert" className="connections-alert is-error"><span>!</span><div><strong>Unable to complete request</strong><p>{error}</p></div></div>}
      {notice && <div role="status" className="connections-alert is-success"><span>✓</span><div><strong>Update berhasil</strong><p>{notice}</p></div></div>}

      {catalogOpen && <section className="connection-catalog" aria-label="Connector catalog">
        <UniverseHeader className="connection-catalog-header"><div><span className="connections-overline">CONNECTOR CATALOG</span><h2>Select a data source</h2><p>Choose a connector to configure. Available connectors are loaded from the backend registry.</p></div><button type="button" className="connections-button" onClick={() => setCatalogOpen(false)}><Icon name="close" /> Close</button></UniverseHeader>
        <UniverseToolbar className="connection-catalog-toolbar"><label className="connections-search"><Icon name="search" /><span className="connections-sr-only">Search connectors</span><input value={catalogQuery} onChange={e => setCatalogQuery(e.target.value)} placeholder="Search data sources..." /></label><div className="connection-catalog-categories">{['All','Database','Cloud','API','File'].map(category => <button key={category} type="button" className={'connection-catalog-filter ' + (catalogCategory === category ? 'is-selected' : '')} onClick={() => setCatalogCategory(category)}>{category}</button>)}</div></UniverseToolbar>
        <UniverseCatalogList className="connection-catalog-grid">{catalogItems.map(item => <UniverseCatalogButton type="button" key={item.id} disabled={!item.enabled} className="connection-catalog-item" onClick={() => chooseConnector(item.id)}><span className="connection-catalog-icon"><UniverseDatabaseSourceIcon type={item.id}/></span><span className="connection-catalog-text"><strong>{item.label}</strong><small>{item.description}</small></span><span className={'connection-catalog-status ' + (item.enabled ? 'is-ready' : '')}>{item.enabled ? 'Configure' : 'Not yet available'}</span></UniverseCatalogButton>)}</UniverseCatalogList>
        {!catalogItems.length && <div className="connections-empty"><strong>No matching connectors</strong><p>Try another keyword or category.</p></div>}
        <p className="connection-catalog-note">Only connectors supported end-to-end by this release can be configured. More connectors will appear as they are enabled.</p>
      </section>}
      {adding && <UniverseForm id="connection-form" className="connection-form" onSubmit={save}>
        <div className="connection-form-heading"><div className="connection-form-title"><span className="connection-icon"><Icon name="server" /></span><div><span className="connections-overline">{editingId ? 'EDIT DATA SOURCE' : 'NEW DATA SOURCE'}</span><h2>{editingId ? 'Edit' : 'New'} {selectedConnector === 'sqlserver' ? 'SQL Server' : 'PostgreSQL'} Connection</h2><p>Tambahkan detail server dan kredensial untuk menghubungkan sumber data.</p></div></div><span className="connection-type-badge">{selectedConnector === 'sqlserver' ? 'SQL SERVER' : 'POSTGRESQL'}</span></div>
        <UniverseFormSection className="connection-form-section"><div className="connection-section-label"><span>01</span> CONNECTION DETAILS</div>
          <div className="connection-form-grid">
            <Field label="Connection Name"><input required maxLength={150} value={form.connection_name} onChange={e => update('connection_name', e.target.value)} placeholder="e.g. Branch database" /></Field>
            <Field label="Server Host"><input required maxLength={255} value={form.server_host} onChange={e => update('server_host', e.target.value)} placeholder="IP address or hostname" /></Field>
            <Field label="Port"><input required type="number" min={1} max={65535} value={form.server_port} onChange={e => update('server_port', Number(e.target.value))} /></Field>
            <Field label="Database"><input required maxLength={128} value={form.database_name} onChange={e => update('database_name', e.target.value)} placeholder="Database name" /></Field>
          </div>
        </UniverseFormSection>
        <UniverseFormSection className="connection-form-section"><div className="connection-section-label"><span>02</span> AUTHENTICATION &amp; SECURITY</div>
          <div className="connection-form-grid">
            <Field label="Database Username"><input required maxLength={255} autoComplete="off" value={form.login_username} onChange={e => update('login_username', e.target.value)} placeholder="Username" /></Field>
            <Field label="Password"><input required={!editingId} type="password" autoComplete="new-password" value={form.password} onChange={e => update('password', e.target.value)} placeholder={editingId ? "Leave blank to keep existing password" : "Password"} /></Field>
            <Field label="Timeout (seconds)"><input required type="number" min={1} max={60} value={form.connection_timeout_seconds} onChange={e => update('connection_timeout_seconds', Number(e.target.value))} /></Field>
          </div>
          <div className="connection-security"><Icon name="shield" /><div><strong>Transport security</strong><div className="connection-checkboxes"><label><input type="checkbox" checked={form.encrypt_transport} onChange={e => update('encrypt_transport', e.target.checked)} /> Encrypt Transport</label>{selectedConnector === 'sqlserver' && <label><input type="checkbox" checked={form.trust_server_certificate} onChange={e => update('trust_server_certificate', e.target.checked)} /> Trust Server Certificate (development only)</label>}</div></div></div>
        </UniverseFormSection>
        <div className="connection-form-footer"><p>Uji koneksi sebelum menyimpan konfigurasi.</p><div><button type="button" disabled={busy || (Boolean(editingId) && !form.password)} className="connections-button" onClick={() => void test()}>{busy ? 'Processing...' : 'Test Connection'}</button><button type="submit" disabled={busy} className="connections-button connections-button-primary">{busy ? 'Processing...' : editingId ? 'Update Connection' : 'Save Connection'} <Icon name="arrow" /></button></div></div>
      </UniverseForm>}

      {!adding && !catalogOpen && <>
        <UniverseToolbar className="connections-toolbar u-dataset-filters"><label className="connections-search"><Icon name="search" /><span className="connections-sr-only">Cari connections</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari koneksi, host, atau database…" /></label><label className="connections-filter"><span className="connections-sr-only">Filter status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Semua status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></UniverseToolbar>
        {loading ? <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat Connections…</strong><span>Mengambil daftar sumber data terdaftar.</span></div> : error && !items.length ? null : !items.length ? <div className="connections-empty"><strong>Belum ada koneksi</strong><p>Tambahkan sumber data pertama Anda untuk memulai.</p><button type="button" className="connections-button" onClick={openCatalog}>+ Koneksi baru</button></div> : !filtered.length ? <div className="connections-empty"><strong>Tidak ada koneksi yang cocok</strong><p>Coba kata pencarian atau filter lainnya.</p></div> :
          <UniverseCatalogSplit list={filtered.map(item=><div className="u-dataset-entry-shell" key={item.connection_id}>
            <UniverseCatalogEntry mark={<UniverseDatabaseMark type={item.connection_type} title={item.connection_type}/>} title={item.connection_name} subtitle={`${item.connection_type === 'SQLSERVER' ? 'SQL Server' : item.connection_type} · ${item.server_host}:${item.server_port}`}
              metadata={[{label:'Database',value:item.database_name}]} badge={<span className={'u-dataset-badge '+(item.is_active?'is-active':'is-inactive')}>{item.is_active?'ACTIVE':'INACTIVE'}</span>}
              selected={item.connection_id===selectedConnectionId} onClick={()=>setSelectedConnectionId(item.connection_id)}/>
            <div className="studio-ownership-grid-cell"><OwnershipGrid objectType="CONNECTION" objectId={item.connection_id}/></div>
          </div>)} inspector={<UniverseCatalogInspector emptyHeading="Explore your connections" emptyDescription="Pilih koneksi di sebelah kiri untuk melihat konfigurasi, status, dan tindakan yang tersedia.">
            {selectedConnection && <UniverseInspectorDetails eyebrow="DATA INTELLIGENCE / CONNECTION" title={selectedConnection.connection_name} subtitle={`${selectedConnection.connection_type} · ${selectedConnection.is_active?'Active':'Inactive'}`}
              fields={[{label:'DATABASE',value:selectedConnection.database_name},{label:'SERVER',value:`${selectedConnection.server_host}:${selectedConnection.server_port}`},{label:'USERNAME',value:selectedConnection.login_username},{label:'SECURITY',value:selectedConnection.encrypt_transport?'Transport encrypted':'Standard transport'}]}
              actions={<><div className="studio-ownership-inspector"><span>OWNER / ACCESS</span><OwnershipPicker objectType="CONNECTION" objectId={selectedConnection.connection_id}/></div><button type="button" className="u-dataset-action" disabled={busy} onClick={()=>startEdit(selectedConnection)}>Edit Connection</button><button type="button" className={selectedConnection.is_active ? "u-dataset-action is-danger" : "u-dataset-action is-success"} disabled={busy} onClick={()=>void toggle(selectedConnection)}>{selectedConnection.is_active?'Deactivate':'Activate'}</button></>}/>} 
          </UniverseCatalogInspector>}/>
        }
      </>}
    </div>
  </section>;
}
