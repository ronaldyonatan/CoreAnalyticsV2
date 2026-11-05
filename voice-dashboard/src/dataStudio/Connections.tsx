import React, { useCallback, useEffect, useMemo, useState } from 'react';

type Connection = { connection_id: string; connection_name: string; connection_type: string; server_host: string; server_port: number; database_name: string; login_username: string; is_active: boolean; encrypt_transport: boolean; trust_server_certificate: boolean; created_at?: string };
type Form = { connection_name: string; server_host: string; server_port: number; database_name: string; login_username: string; password: string; encrypt_transport: boolean; trust_server_certificate: boolean; connection_timeout_seconds: number };
const empty: Form = { connection_name: '', server_host: '', server_port: 1433, database_name: '', login_username: '', password: '', encrypt_transport: true, trust_server_certificate: false, connection_timeout_seconds: 10 };
const BASE = '/voice-api/api/studio/connections';
function csrf() { const entry = document.cookie.split('; ').find(v => v.startsWith('core_csrf=')); return entry ? decodeURIComponent(entry.substring('core_csrf='.length)) : ''; }
async function api(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(BASE + path, { method, credentials: 'include', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  return <label className="connection-field"><span>{label}</span>{children}</label>;
}
export default function Connections() {
  const [items, setItems] = useState<Connection[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const activeCount = items.filter(item => item.is_active).length;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(item => (status === 'all' || (status === 'active') === item.is_active) &&
      [item.connection_name, item.server_host, item.database_name, item.connection_type].some(value => String(value ?? '').toLowerCase().includes(query)));
  }, [items, search, status]);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await api(''); const value = result.data; setItems(Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []); }
    catch (e) { setError(e instanceof Error ? e.message : 'Gagal memuat koneksi'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const result = await api('');
        const value = result.data;
        if (!cancelled) setItems(Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat koneksi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitial();
    return () => { cancelled = true; };
  }, []);
  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm(prev => ({ ...prev, [key]: value }));
  async function test() { setBusy(true); setNotice(''); setError(''); try { const result = await api('/test', 'POST', form); setNotice(result.message || result.data?.message || 'Test connection berhasil.'); } catch(e) { setError(e instanceof Error ? e.message : 'Test connection gagal'); } finally { setBusy(false); } }
  async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setNotice(''); setError(''); try { await api('', 'POST', form); setNotice('Connection berhasil ditambahkan.'); setAdding(false); setForm(empty); await reload(); } catch(e) { setError(e instanceof Error ? e.message : 'Gagal menyimpan koneksi'); } finally { setBusy(false); } }
  async function toggle(item: Connection) { setBusy(true); setError(''); setNotice(''); try { await api(`/${encodeURIComponent(item.connection_id)}/active`, 'PATCH', { is_active: !item.is_active }); setNotice(`Connection ${item.connection_name} diperbarui.`); await reload(); } catch(e) { setError(e instanceof Error ? e.message : 'Gagal memperbarui status'); } finally { setBusy(false); } }
  return <section className="connections-page" aria-labelledby="connections-title">
    <div className="connections-wrap">
      <header className="connections-header">
        <div className="connections-heading">
          <div className="connections-eyebrow"><span className="connections-eyebrow-line" /> DATA STUDIO <span>/</span> SOURCES</div>
          <h1 id="connections-title">Data Connections<span className="connections-title-dot">.</span></h1>
          <p>Kelola sumber data yang terhubung ke CoreAnalytics dalam satu tempat.</p>
        </div>
        <div className="connections-header-actions">
          <button type="button" className="connections-button" disabled={loading || busy} onClick={() => void reload()}><Icon name="refresh" /> Refresh</button>
          <button type="button" className="connections-button connections-button-primary" aria-expanded={adding} aria-controls="connection-form" onClick={() => setAdding(v => !v)}><Icon name={adding ? 'close' : 'plus'} /> {adding ? 'Close' : 'Add Connection'}</button>
        </div>
      </header>

      <div className="connections-overview" aria-label="Connection overview">
        <div className="connections-overview-intro"><span className="connections-overview-icon"><Icon name="database" /></span><div><span className="connections-overline">YOUR DATA NETWORK</span><strong>Connection overview</strong><small>Sumber data terdaftar</small></div></div>
        <div className="connections-metric"><span>Total connections</span><strong>{loading ? '—' : String(items.length).padStart(2, '0')}</strong><small>REGISTERED</small></div>
        <div className="connections-metric"><span>Active</span><strong>{loading ? '—' : String(activeCount).padStart(2, '0')}</strong><small><i className="connections-status-dot is-active" /> ENABLED</small></div>
        <div className="connections-metric"><span>Inactive</span><strong>{loading ? '—' : String(items.length - activeCount).padStart(2, '0')}</strong><small><i className="connections-status-dot" /> DISABLED</small></div>
      </div>

      {error && <div role="alert" className="connections-alert is-error"><span>!</span><div><strong>Unable to complete request</strong><p>{error}</p></div></div>}
      {notice && <div role="status" className="connections-alert is-success"><span>✓</span><div><strong>Update berhasil</strong><p>{notice}</p></div></div>}

      {adding && <form id="connection-form" className="connection-form" onSubmit={save}>
        <div className="connection-form-heading"><div className="connection-form-title"><span className="connection-icon"><Icon name="server" /></span><div><span className="connections-overline">NEW DATA SOURCE</span><h2>New SQL Server Connection</h2><p>Tambahkan detail server dan kredensial untuk menghubungkan sumber data.</p></div></div><span className="connection-type-badge">SQL SERVER</span></div>
        <div className="connection-form-section"><div className="connection-section-label"><span>01</span> CONNECTION DETAILS</div>
          <div className="connection-form-grid">
            <Field label="Connection Name"><input required maxLength={150} value={form.connection_name} onChange={e => update('connection_name', e.target.value)} placeholder="e.g. Branch database" /></Field>
            <Field label="Server Host"><input required maxLength={255} value={form.server_host} onChange={e => update('server_host', e.target.value)} placeholder="IP address or hostname" /></Field>
            <Field label="Port"><input required type="number" min={1} max={65535} value={form.server_port} onChange={e => update('server_port', Number(e.target.value))} /></Field>
            <Field label="Database"><input required maxLength={128} value={form.database_name} onChange={e => update('database_name', e.target.value)} placeholder="Database name" /></Field>
          </div>
        </div>
        <div className="connection-form-section"><div className="connection-section-label"><span>02</span> AUTHENTICATION &amp; SECURITY</div>
          <div className="connection-form-grid">
            <Field label="SQL Username"><input required maxLength={255} autoComplete="off" value={form.login_username} onChange={e => update('login_username', e.target.value)} placeholder="Username" /></Field>
            <Field label="Password"><input required type="password" autoComplete="new-password" value={form.password} onChange={e => update('password', e.target.value)} placeholder="Password" /></Field>
            <Field label="Timeout (seconds)"><input required type="number" min={1} max={60} value={form.connection_timeout_seconds} onChange={e => update('connection_timeout_seconds', Number(e.target.value))} /></Field>
          </div>
          <div className="connection-security"><Icon name="shield" /><div><strong>Transport security</strong><div className="connection-checkboxes"><label><input type="checkbox" checked={form.encrypt_transport} onChange={e => update('encrypt_transport', e.target.checked)} /> Encrypt Transport</label><label><input type="checkbox" checked={form.trust_server_certificate} onChange={e => update('trust_server_certificate', e.target.checked)} /> Trust Server Certificate (development only)</label></div></div></div>
        </div>
        <div className="connection-form-footer"><p>Uji koneksi sebelum menyimpan konfigurasi.</p><div><button type="button" disabled={busy} className="connections-button" onClick={() => void test()}>{busy ? 'Processing...' : 'Test Connection'}</button><button type="submit" disabled={busy} className="connections-button connections-button-primary">{busy ? 'Processing...' : 'Save Connection'} <Icon name="arrow" /></button></div></div>
      </form>}

      <div className="connections-list-heading"><div><div className="connections-eyebrow"><span className="connections-eyebrow-line" /> YOUR CONNECTIONS</div><h2>Registered sources <span>{loading ? '—' : items.length}</span></h2><p>Kelola konfigurasi dan status sumber data Anda.</p></div><span className="connections-list-caption">DATA STUDIO <span>//</span> SOURCES</span></div>
      <div className="connections-toolbar"><label className="connections-search"><Icon name="search" /><span className="connections-sr-only">Search connections</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, host or database" /></label><label className="connections-filter"><span className="connections-sr-only">Filter by status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
      {loading ? <div className="connections-empty">Loading connections...</div> : !items.length ? <div className="connections-empty"><span className="connection-icon"><Icon name="database" /></span><strong>Belum ada koneksi</strong><p>Tambahkan sumber data pertama Anda untuk memulai.</p><button type="button" className="connections-button" onClick={() => setAdding(true)}><Icon name="plus" /> Add Connection</button></div> : !filtered.length ? <div className="connections-empty"><strong>Tidak ada koneksi yang cocok</strong><p>Coba kata pencarian atau filter status lainnya.</p></div> : <div className="connections-table-scroll" role="region" aria-label="Registered connections" tabIndex={0}><table className="connections-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Host</th><th scope="col">Database</th><th scope="col">Username</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{filtered.map(item => <tr key={item.connection_id}>
        <th scope="row" className="connections-table-name">{item.connection_name}</th>
        <td><span className="connection-type-badge">{item.connection_type === 'SQLSERVER' ? 'SQL SERVER' : item.connection_type}</span></td>
        <td className="connections-table-host">{item.server_host}:{item.server_port}</td>
        <td>{item.database_name}</td><td>{item.login_username}</td>
        <td><span className={'connection-status ' + (item.is_active ? 'is-active' : '')}><i className={'connections-status-dot ' + (item.is_active ? 'is-active' : '')} />{item.is_active ? 'Active' : 'Inactive'}</span></td>
        <td><button disabled={busy} type="button" className="connections-button connection-toggle" aria-label={`${item.is_active ? 'Deactivate' : 'Activate'} ${item.connection_name}`} onClick={() => void toggle(item)}>{item.is_active ? 'Deactivate' : 'Activate'}</button></td>
      </tr>)}</tbody></table></div>}
      <div className="connections-footnote"><span><i className="connections-status-dot is-active" /> CONNECTION MANAGEMENT</span><span>COREANALYTICS <b>//</b> DATA STUDIO</span></div>
    </div>
  </section>;
}
