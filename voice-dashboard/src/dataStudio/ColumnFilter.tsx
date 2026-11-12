import { UniversePanel } from '../design-system/components/universe';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ColumnFilterValue = { mode: 'include' | 'exclude'; values: (string | null)[] };
export type ColumnFilters = Record<string, ColumnFilterValue>;
function panelPosition(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 24);
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const up = below < 240 && above > below;
  return { left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: up ? Math.max(12, rect.top - Math.min(380, above)) : rect.bottom + 4, maxHeight: Math.max(100, Math.min(380, up ? above : below)) };
}
async function loadValues(datasetId: string, column: string, search: string, offset: number, filters: ColumnFilters, signal: AbortSignal) {
  const csrf = document.cookie.split('; ').find(item => item.startsWith('core_csrf='));
  const response = await fetch(`/voice-api/api/studio/datasets/${encodeURIComponent(datasetId)}/filter-values`, { method: 'POST', credentials: 'include', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ? decodeURIComponent(csrf.slice(10)) : '' }, body: JSON.stringify({ column, search, offset, filters: Object.fromEntries(Object.entries(filters).filter(([key]) => key !== column)) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.code || `HTTP_${response.status}`);
  return data.data as { values: (string | null)[]; has_more: boolean };
}
export default function ColumnFilter({ datasetId, column, filters, trigger, onApply, onClose }: { datasetId: string; column: string; filters: ColumnFilters; trigger: HTMLElement; onApply: (filter: ColumnFilterValue | null) => void; onClose: () => void }) {
  const [mode, setMode] = useState<ColumnFilterValue['mode']>(filters[column]?.mode ?? 'include');
  const [selected, setSelected] = useState<(string | null)[]>(filters[column]?.values ?? []);
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<(string | null)[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [position, setPosition] = useState(() => panelPosition(trigger));
  const panel = useRef<HTMLDivElement>(null);
  const moreRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const place = () => setPosition(panelPosition(trigger));
    const dismiss = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.contains(event.target as Node)) onClose(); };
    const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') { onClose(); trigger.focus(); } };
    place(); document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', keys); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', keys); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [trigger, onClose]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { loadValues(datasetId, column, search, 0, filters, controller.signal).then(result => { if (!controller.signal.aborted) { setValues(result.values); setHasMore(result.has_more); } }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'FILTER_VALUES_UNAVAILABLE'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); }, 250);
    return () => { clearTimeout(timer); controller.abort(); moreRef.current?.abort(); };
  }, [datasetId, column, search, filters]);
  async function more() {
    if (loading || !hasMore) return;
    const controller = new AbortController(); moreRef.current = controller; setLoading(true);
    try { const result = await loadValues(datasetId, column, search, values.length, filters, controller.signal); if (!controller.signal.aborted) { setValues(previous => [...previous, ...result.values]); setHasMore(result.has_more); } }
    catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'FILTER_VALUES_UNAVAILABLE'); }
    finally { if (!controller.signal.aborted) setLoading(false); if (moreRef.current === controller) moreRef.current = null; }
  }
  return createPortal(<UniversePanel ref={panel} className="explorer-filter-panel" role="dialog" aria-label={`Filter ${column}`} style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); trigger.focus(); } }}><strong>Filter · {column}</strong><label><span className="connections-sr-only">Mode filter</span><select value={mode} onChange={event => setMode(event.target.value as ColumnFilterValue['mode'])}><option value="include">Include</option><option value="exclude">Exclude</option></select></label><label><span className="connections-sr-only">Cari nilai</span><input autoFocus value={search} maxLength={128} placeholder="Cari nilai…" onChange={event => { setSearch(event.target.value); setLoading(true); setError(''); setValues([]); setHasMore(false); }} /></label><small>{selected.length} dipilih · maksimum 50</small><div className="explorer-filter-options">{values.map((value, index) => <label key={`${index}-${JSON.stringify(value)}`}><input type="checkbox" checked={selected.includes(value)} disabled={selected.length >= 50 && !selected.includes(value)} onChange={() => setSelected(previous => previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value])} /><span title={value ?? 'NULL'}>{value === null ? '(NULL)' : value === '' ? '(Kosong)' : value}</span></label>)}{loading && <p role="status">Memuat nilai…</p>}{!loading && !values.length && !error && <p>Tidak ada nilai yang cocok.</p>}{error && <p role="alert">Nilai filter tidak dapat dimuat ({error}).</p>}{hasMore && <button type="button" onClick={() => void more()} disabled={loading}>Muat lebih banyak</button>}</div><small>Nilai lebih dari 256 karakter tidak ditampilkan.</small><div className="explorer-filter-actions"><button type="button" onClick={() => { onApply(null); onClose(); }}>Hapus</button><button type="button" onClick={() => { onApply(selected.length ? { mode, values: selected } : null); onClose(); }}>Terapkan</button></div></UniversePanel>, document.body);
}
