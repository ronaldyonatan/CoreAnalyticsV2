import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ownership-picker.css';

type Person = { user_id: string; username: string; display_name: string };
type Share = { principal_type?: string; principal_id?: string; access_role?: string; role?: string; display_name?: string; username?: string };
type Info = { owner_user_id: string; is_admin: boolean; can_manage_sharing?: boolean; shares: Share[] };
const ROOT = '/voice-api/api/studio/object-access';
function csrf(): string { const token = document.cookie.split('; ').find(c => c.startsWith('core_csrf=')); return token ? decodeURIComponent(token.substring(10)) : ''; }
async function request(url: string, body?: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal, method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success !== true) throw new Error(String(json.code || `HTTP_${response.status}`));
  return json.data;
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
const badgeColor = (id: string) => { let value = 0; for (const ch of id) value = (value * 33 + ch.charCodeAt(0)) >>> 0; return `hsl(${value % 360} 48% 37%)`; };
function Avatar({ name, id }: { name: string; id: string }) { return <span className="ownership-avatar" style={{ backgroundColor: badgeColor(id) }} title={name} aria-label={name}>{initials(name)}</span>; }
function ShareIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M20 8v6m-3-3h6"/></svg>;
}
/** Ownership metadata is fetched server-side; all mutations are authenticated and rechecked by BEAM/SQL. */
export default function OwnershipPicker({ objectType, objectId, fallbackOwner }: { objectType: 'DATASET' | 'CONNECTION' | 'PIPELINE' | 'SCHEDULE' | 'CHART' | 'DASHBOARD'; objectId: string; fallbackOwner?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef(Symbol('ownership-picker'));
  // Global coordination: exactly one Ownership popup can remain open across lists/modules.
  useEffect(() => {
    const onOtherOpen = (event: Event) => {
      if ((event as CustomEvent<symbol>).detail !== instanceRef.current) setOpen(false);
    };
    window.addEventListener('coreanalytics:ownership-picker-open', onOtherOpen);
    return () => window.removeEventListener('coreanalytics:ownership-picker-open', onOtherOpen);
  }, []);
  // Portal lives under document.body, so both the trigger and the portal must be checked.
  useEffect(() => {
    if (!open) return;
    const onOutsidePointer = (event: PointerEvent) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      if (triggerRef.current?.contains(node) || popupRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);
  const [popupPosition, setPopupPosition] = useState({ top: 48, left: 12 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(310, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      const popHeight = Math.min(440, window.innerHeight * 0.7);
      const below = rect.bottom + 8;
      const top = below + popHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - popHeight - 8);
      setPopupPosition({ top, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open]);
  const [info, setInfo] = useState<Info | null>(null);
  const [role, setRole] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [directoryError, setDirectoryError] = useState('');
  const path = `${ROOT}/${encodeURIComponent(objectType)}/${encodeURIComponent(objectId)}`;
  const editable = Boolean(info?.can_manage_sharing);
  const reload = useCallback(async (signal?: AbortSignal) => {
    const [metadata, access] = await Promise.all([request(path, undefined, signal), request(`${path}/check`, undefined, signal)]);
    setInfo(metadata as Info); setRole(String(access.effective_role || ''));
  }, [path]);
  useEffect(() => { const controller = new AbortController(); setInfo(null); setError(''); setRole(''); void reload(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'ACCESS_UNAVAILABLE'); }); return () => controller.abort(); }, [reload]);
  useEffect(() => {
    if (!open || !editable) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setDirectoryError('');
      void request(`${path}/directory?search=${encodeURIComponent(search)}&page_size=30`, undefined, controller.signal).then(data => setPeople(Array.isArray(data) ? data : [])).catch(e => { if (!controller.signal.aborted) setDirectoryError(e instanceof Error ? e.message : 'DIRECTORY_UNAVAILABLE'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, editable, search, path]);
  async function changeShare(person: Person, action: 'GRANT' | 'REVOKE', accessRole = 'EDITOR') {
    setSaving(true); setError('');
    try { await request(path, { action, principal_type: 'USER', principal_id: person.user_id, ...(action === 'GRANT' ? { access_role: accessRole } : {}) }); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'SHARE_CHANGE_FAILED'); }
    finally { setSaving(false); }
  }
  async function removeShare(share: Share) {
    if (!share.principal_id || !share.principal_type || !window.confirm('Cabut akses user/group ini?')) return;
    setSaving(true); setError('');
    try { await request(path, { action: 'REVOKE', principal_type: share.principal_type.toUpperCase(), principal_id: share.principal_id }); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'REVOKE_FAILED'); }
    finally { setSaving(false); }
  }
  const shares = Array.isArray(info?.shares) ? info.shares : [];
  const userShares = shares.filter(s => s.principal_type?.toUpperCase() === 'USER');
  const userName = (id: string, hint?: string) => people.find(p => p.user_id.toLowerCase() === id.toLowerCase())?.display_name || hint || people.find(p => p.user_id.toLowerCase() === id.toLowerCase())?.username || id.substring(0, 8);
  const guessedOwner = info?.owner_user_id ? userName(info.owner_user_id, fallbackOwner) : (fallbackOwner || 'Pemilik');
  const ownerName = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){0,4}$/i.test(guessedOwner) ? 'Pemilik' : guessedOwner;
  const tooltipNames = [ownerName + ' (Owner)', ...userShares.map(s => userName(s.principal_id || '', s.display_name || s.username))];
  return <div className="ownership-control">
    <button ref={triggerRef} type="button" className="ownership-trigger" onClick={() => {
      if (!open) window.dispatchEvent(new CustomEvent('coreanalytics:ownership-picker-open', { detail: instanceRef.current }));
      setOpen(!open);
    }} title={tooltipNames.join(" · ")} aria-expanded={open} aria-label={`Kelola ownership dan sharing: ${tooltipNames.join(", ")}`}>
      <span className="ownership-stack"><Avatar id={info?.owner_user_id || 'owner'} name={ownerName}/>{userShares.slice(0, 2).map(s => <Avatar key={s.principal_id} id={s.principal_id || ''} name={userName(s.principal_id || '', s.display_name || s.username)}/>)}</span>
      {userShares.length > 2 && <span className="ownership-count">+{userShares.length - 2}</span>}

    </button>
    {open && createPortal(<div ref={popupRef} className="ownership-popover ownership-popover-portal" style={{ top: popupPosition.top, left: popupPosition.left }} role="dialog" aria-label="Ownership and sharing">
      <div className="ownership-popover-header"><strong>Ownership & Sharing</strong><button type="button" aria-label="Close" onClick={() => setOpen(false)}>×</button></div>
      {error && <p className="ownership-error" role="alert">{error === "MUTATIONS_NOT_ENABLED" ? "Sharing belum diaktifkan di backend (MUTATIONS_NOT_ENABLED)." : error}</p>}
      {info ? <>
        <div className="ownership-entry"><Avatar id={info.owner_user_id} name={ownerName}/><span className="ownership-person" title={`${ownerName} · Primary owner`}><strong>{ownerName}</strong></span><span className="ownership-role">OWNER</span></div>
        <div className="ownership-label">SHARED ACCESS · {shares.length}</div>
        {shares.map((s, i) => <div className="ownership-entry" key={`${s.principal_type}-${s.principal_id}-${i}`}><Avatar id={s.principal_id || `${i}`} name={userName(s.principal_id || '', s.display_name || s.username || s.principal_type)}/><span className="ownership-person"><strong>{s.principal_type?.toUpperCase() === 'GROUP' ? `Group · ${s.display_name || (s.principal_id || '').slice(0, 8)}` : userName(s.principal_id || '', s.display_name || s.username)}</strong></span><span className="ownership-role">Shared</span>{editable && <button type="button" className="ownership-remove" title="Revoke access" disabled={saving} onClick={() => void removeShare(s)}>×</button>}</div>)}
        {editable && <><div className="ownership-label">ADD PEOPLE</div><input className="ownership-search" placeholder="Cari nama user…" value={search} onChange={e => setSearch(e.target.value)} />{directoryError && <small className="ownership-error">{directoryError}</small>}{loading && <small>Memuat user…</small>}<div className="ownership-people">{people.filter(p => p.user_id.toLowerCase() !== info.owner_user_id.toLowerCase()).map(p => { const existing = userShares.find(s => s.principal_id?.toLowerCase() === p.user_id.toLowerCase()); return <div className="ownership-entry" key={p.user_id}><Avatar id={p.user_id} name={p.display_name || p.username}/><span className="ownership-person" title={`${p.display_name || p.username} · ${p.username}`}><strong>{p.display_name || p.username}</strong></span>{existing ? <span className="ownership-role">Shared</span> : <button type="button" className="ownership-share-icon-button" aria-label={`Berikan akses kepada ${p.display_name || p.username}`} title={`Bagikan akses kepada ${p.display_name || p.username}`} disabled={saving} onClick={() => void changeShare(p, 'GRANT')}><ShareIcon /></button>}</div>; })}</div></>}
        {!editable && <p className="ownership-note">Hanya Owner utama yang dapat memberi atau mencabut akses.</p>}
        <p className="ownership-note">Hak akses diverifikasi oleh backend. Transfer Owner belum tersedia.</p>
      </> : <p className="ownership-note">{error || 'Memuat informasi ownership…'}</p>}
    </div>, document.body)}
  </div>;
}
