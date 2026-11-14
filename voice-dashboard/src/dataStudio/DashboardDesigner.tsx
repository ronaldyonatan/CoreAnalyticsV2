import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { dashboardQuery } from './dashboardInteractions';
import { removePageCardReferences } from './dashboardPages';
import { FRAME_PRESETS, canApplyGridLayout, findFreePlacement, fitPresetWidths, gridCollisions, gridDropIntent, insertFrameRow, isFreeGap, makeFrames, moveGridItem, repairGridCollisions, resizeAdjacentColumns } from './dashboardLayout';
import type { Frame } from './dashboardLayout';
import type { DropIntent } from './dashboardLayout';
import type { DrillStep, Interaction, Selection } from './dashboardInteractions';
import type { ChartResult, SavedChart } from './visualization/chartTypes';
import { SharedChart } from './visualization/SharedChart';
import { UniverseCatalogHeader } from '../design-system/components/universe';
import { dashboardFingerprint } from './dashboardPersistence';
import type { DashboardDocument, LoadedDashboard } from './dashboardPersistence';
import './dashboard-designer.css';

const Grid = WidthProvider(Responsive);
type Column = { name: string; type: string };
type Card = { pageId: string; id: string; chart: SavedChart; columns: Column[]; title: string; background: string; x: number; y: number; w: number; h: number; mappings: {targetCardId: string; targetColumn: string}[]; drillPath: string[] };
type LayoutItem = { i: string; x: number; y: number; w: number; h: number };
type ContentKind = 'text' | 'image' | 'divider' | 'spacer';
type PageFrame = Frame & { pageId: string };
type ContentBlock = PageFrame & { kind: ContentKind; text: string; image: string; alt: string; color: string; fontSize: number; align: 'left' | 'center' | 'right' };
const CONTENT_TYPES: { kind: ContentKind; label: string; icon: string }[] = [
  { kind: 'text', label: 'Teks & judul', icon: 'T' },
  { kind: 'image', label: 'Gambar', icon: '▧' },
  { kind: 'divider', label: 'Garis pemisah', icon: '—' },
  { kind: 'spacer', label: 'Ruang kosong', icon: '↕' },
];
const csrf = () => decodeURIComponent(document.cookie.split('; ').find(s => s.startsWith('core_csrf='))?.substring(10) || '');
async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/voice-api/api/studio/charts${path}`, { method, credentials: 'include', cache: 'no-store', signal,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.code || `HTTP_${response.status}`);
  return data.data as T;
}
const dateColumn = (type: string) => /^(date|datetime|datetime2|smalldatetime|datetimeoffset|timestamp)(?:\b|\()/i.test(type);
const isFilter = (card: Card) => card.chart.config.chart_type.startsWith('filter_');

type CachedChart = { key: string; revision: number; result: ChartResult };
function ChartCard({ card, interactions, selections, steps, onSelection, onDrill, cache, revision }: {
  card: Card; interactions: Interaction[]; selections: Selection[]; steps: DrillStep[];
  onSelection: (selection: Selection | null) => void; onDrill: (steps: DrillStep[]) => void;
  cache: MutableRefObject<Map<string, CachedChart>>; revision: number;
}) {
  const [result, setResult] = useState<ChartResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const incoming = interactions.filter(i => i.sourceCardId !== card.id && i.mappings.some(m => m.targetCardId === card.id));
  const signature = JSON.stringify({ interactions: incoming, selections: selections.filter(s => incoming.some(i => i.sourceCardId === s.sourceCardId)), steps, path: card.drillPath });
  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
    try {
      const validPath = card.drillPath.every(Boolean) ? card.drillPath : [];
      const spec = dashboardQuery(card.chart.config, card.id, card.columns.map(c => c.name), interactions, selections, validPath, validPath.length ? steps : []);
      const { properties, ...query } = spec;
      const body = spec.chart_type === 'progress' ? { ...query, properties: { gaugeTarget: properties?.gaugeTarget ?? 0 } } : query;
      const key = JSON.stringify({ chart: card.chart.chart_id, version: card.chart.version, body });
      const cached = cache.current.get(card.id);
      if (cached && cached.key === key && cached.revision !== revision) {
        cache.current.set(card.id, { ...cached, revision });
        setResult(cached.result); setError(''); setLoading(false); return;
      }
      setResult(null); setError(''); setLoading(true);
      await request<ChartResult>('/query', 'POST', body, controller.signal).then(data => {
        if (data.is_sample) throw new Error('CHART_SAMPLE_AGGREGATION_REJECTED');
        if (!controller.signal.aborted) { cache.current.set(card.id, { key, revision, result: data }); setResult(data); }
      }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'CHART_QUERY_FAILED'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } catch (err) { setResult(null); setLoading(false); setError(err instanceof Error ? err.message : 'CHART_QUERY_FAILED'); }
    };
    void run();
    return () => controller.abort();
    // The serialized signature represents all interaction inputs and avoids a request on layout changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.chart, card.columns, signature, cache, revision]);
  const current = selections.find(s => s.sourceCardId === card.id);
  const values = [...new Set((result?.rows || []).map(row => row.dimension))];
  const selected = current && 'value' in current ? current.value : '';
  const date = current && !('value' in current) ? current : { from: '', to: '' };
  const choose = (value: string) => onSelection(value ? {sourceCardId:card.id,value} : null);
  const drill = (value: string) => {
    if (!value || value === '(NULL)' || steps.length >= card.drillPath.length - 1) return;
    onDrill([...steps, { column: card.drillPath[steps.length], value }]);
    onSelection(null);
  };
  return <div className="dd-card-body">
    {loading && <div className="dd-chart-loading" role="status"><span className="dd-loading-spinner" aria-hidden="true"/><span>Memuat data chart…</span></div>}
    {error && <p className="dd-error" role="alert">Data tidak dapat dimuat: {error}</p>}
    {result && card.chart.config.chart_type === 'filter_dropdown' && <label className="dd-filter"><span>{card.chart.config.dimension}</span><select value={selected} onChange={e => choose(e.target.value)}><option value="">Semua</option>{values.map(v => <option key={v} value={v} disabled={v === '(NULL)'}>{v}</option>)}</select>{result.truncated && <small>Daftar nilai dibatasi oleh konfigurasi chart.</small>}</label>}
    {result && card.chart.config.chart_type === 'filter_date' && <div className="dd-date"><label>Dari<input type="date" value={date.from || ''} onChange={e => onSelection({sourceCardId:card.id,from:e.target.value,to:date.to})}/></label><label>Sampai<input type="date" value={date.to || ''} onChange={e => onSelection({sourceCardId:card.id,from:date.from,to:e.target.value})}/></label><button type="button" onClick={() => onSelection(null)}>Reset</button></div>}
    {result && !isFilter(card) && <><SharedChart kind={card.chart.config.chart_type} rows={result.rows} title={card.title} height={Math.max(260, card.h * 64 - 110)} properties={card.chart.config.properties} onSelectDimension={value => { if (value !== '(NULL)') choose(value); }}/>
      {(card.mappings.length > 0 || card.drillPath.length > 1) && <div className="dd-interactive"><label>Pilih kategori<select value={selected} onChange={e => choose(e.target.value)}><option value="">Semua</option>{values.map(v => <option key={v} value={v} disabled={v === '(NULL)'}>{v}</option>)}</select></label>{card.drillPath.length > 1 && <button type="button" disabled={!selected || steps.length >= card.drillPath.length - 1} onClick={() => drill(selected)}>Drill down</button>}{steps.length > 0 && <button type="button" onClick={() => {onDrill(steps.slice(0,-1)); onSelection(null);}}>← {steps.map(s => s.value).join(' / ')}</button>}</div>}
      {result.truncated && <small className="dd-note">Hasil mengikuti batas Top N chart.</small>}</>}
  </div>;
}

export default function DashboardDesigner({ onDirtyChange, onBack, onNameChange, onSave, initial }: { onDirtyChange?: (dirty: boolean) => void; onBack?: () => void; onNameChange?: (name: string) => void; onSave?: (name: string, document: DashboardDocument) => Promise<void>; initial?: LoadedDashboard }) {
  const editorRef = useRef<HTMLElement>(null);
  const chartCache = useRef(new Map<string, CachedChart>());
  const resizeBeforeRef = useRef<readonly LayoutItem[]>([]);
  const dragBeforeRef = useRef<readonly LayoutItem[]>([]);
  const [moving, setMoving] = useState(false);
  const [dragPreview, setDragPreview] = useState<DropIntent | null>(null);
  const [freePreview, setFreePreview] = useState<LayoutItem | null>(null);
  const [gridRevision, setGridRevision] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [pages, setPages] = useState(() => initial?.document.pages ?? [{ id: crypto.randomUUID(), name: 'Halaman 1' }]);
  const [activePage, setActivePage] = useState<string>(() => pages[0].id);
  const [catalog, setCatalog] = useState<SavedChart[]>([]); const [cards, setCards] = useState<Card[]>(() => (initial?.document.cards ?? []).map(card => ({id:card.id,pageId:card.page_id,x:card.x,y:card.y,w:card.w,h:card.h,chart:initial!.charts[card.chart_id].chart,columns:initial!.charts[card.chart_id].columns,title:card.title,background:card.background,mappings:card.mappings.map(mapping => ({targetCardId:mapping.target_card_id,targetColumn:mapping.target_column})),drillPath:card.drill_path})));
  const [frames, setFrames] = useState<PageFrame[]>(() => (initial?.document.frames ?? []).map(frame => ({id:frame.id,pageId:frame.page_id,x:frame.x,y:frame.y,w:frame.w,h:frame.h}))); const [blocks, setBlocks] = useState<ContentBlock[]>(() => (initial?.document.blocks ?? []).map(block => ({id:block.id,pageId:block.page_id,x:block.x,y:block.y,w:block.w,h:block.h,kind:block.kind,text:block.text,image:block.image,alt:block.alt,color:block.color,fontSize:block.font_size,align:block.align}))); const [selectedFrame, setSelectedFrame] = useState('');
  const [palette, setPalette] = useState<'layout' | 'chart' | 'content'>('layout'); const [frameHeight, setFrameHeight] = useState(5);
  const [selectedId, setSelectedId] = useState(''); const [selections, setSelections] = useState<Selection[]>([]);
  const [steps, setSteps] = useState<Record<string,DrillStep[]>>({});
  const [search, setSearch] = useState(''); const [name, setName] = useState(initial?.name ?? 'Dashboard baru');
  const [bg, setBg] = useState(initial?.document.style.background ?? '#081522'); const [textColor, setTextColor] = useState(initial?.document.style.textColor ?? '#e9f4ff');
  const [edit, setEdit] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const [addingFrame, setAddingFrame] = useState('');
  const [replaceNotice, setReplaceNotice] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [dropY, setDropY] = useState<number | null>(null);
  const [nativeGap, setNativeGap] = useState<LayoutItem | null>(null);
  const dashboardDocument = useMemo<DashboardDocument>(() => ({version:2,pages,cards:cards.map(card => ({id:card.id,page_id:card.pageId,chart_id:card.chart.chart_id,title:card.title,background:card.background,x:card.x,y:card.y,w:card.w,h:card.h,mappings:card.mappings.map(mapping => ({target_card_id:mapping.targetCardId,target_column:mapping.targetColumn})),drill_path:card.drillPath})),frames:frames.map(frame => ({id:frame.id,page_id:frame.pageId,x:frame.x,y:frame.y,w:frame.w,h:frame.h})),blocks:blocks.map(block => ({id:block.id,page_id:block.pageId,x:block.x,y:block.y,w:block.w,h:block.h,kind:block.kind,text:block.text,image:block.image,alt:block.alt,color:block.color,font_size:block.fontSize,align:block.align})),style:{background:bg,textColor}}),[pages,cards,frames,blocks,bg,textColor]);
  const fingerprint = useMemo(() => dashboardFingerprint(name,dashboardDocument),[name,dashboardDocument]);
  const [baseline, setBaseline] = useState<string | null>(() => initial ? dashboardFingerprint(initial.name,initial.document) : null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const dirty = baseline !== null ? fingerprint !== baseline : pages.length > 1 || pages[0].name !== 'Halaman 1' || cards.length > 0 || frames.length > 0 || blocks.length > 0 || name !== 'Dashboard baru' || bg !== '#081522' || textColor !== '#e9f4ff';
  const save = async () => {
    if (!onSave || saving || busy || imageLoading) return;
    if (!name.trim() || pages.some(page => !page.name.trim())) { setError('Isi nama dashboard dan setiap halaman sebelum menyimpan.'); return; }
    if (cards.some(card => card.mappings.some(mapping => !mapping.targetCardId || !mapping.targetColumn) || card.drillPath.some(column => !column))) { setError('Lengkapi atau hapus pemetaan filter dan tingkat drill-down yang kosong.'); return; }
    const overlapPage = pages.find(page => gridCollisions([...cards,...frames,...blocks].filter(item => item.pageId === page.id).map(item => ({i:item.id,x:item.x,y:item.y,w:item.w,h:item.h}))).length > 0);
    if (overlapPage) { setActivePage(overlapPage.id); setEdit(true); setError('Ada komponen yang bertumpuk. Pilih “Rapikan layout” sebelum menyimpan.'); return; }
    setSaving(true); setError(''); setSavedMessage('');
    try { await onSave(name,dashboardDocument); setBaseline(fingerprint); setSavedMessage('Dashboard tersimpan.'); await backToCatalog(); }
    catch (err) { setError(err instanceof Error && err.message === 'DASHBOARD_VERSION_CONFLICT' ? 'Dashboard telah diubah di tempat lain. Buka ulang sebelum menyimpan.' : `Dashboard belum tersimpan: ${err instanceof Error ? err.message : 'DASHBOARD_SERVICE_UNAVAILABLE'}`); }
    finally { setSaving(false); }
  };
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) {event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  useEffect(() => { const controller = new AbortController(); request<SavedChart[]>('', 'GET', undefined, controller.signal).then(setCatalog).catch(e => { if (!controller.signal.aborted) setError(`Chart Library: ${e.message}`); }); return () => controller.abort(); }, []);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === editorRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === editorRef.current) await document.exitFullscreen();
      else if (!document.fullscreenElement && editorRef.current?.requestFullscreen) await editorRef.current.requestFullscreen();
      else throw new Error('FULLSCREEN_UNAVAILABLE');
    } catch { setError('Layar penuh tidak tersedia. Periksa izin browser lalu coba lagi.'); }
  };
  const backToCatalog = async () => {
    if (document.fullscreenElement === editorRef.current) {
      try { await document.exitFullscreen(); }
      catch { setError('Tidak dapat keluar dari layar penuh. Gunakan tombol Esc lalu coba lagi.'); return; }
    }
    onBack?.();
  };
  const pageCards = useMemo(() => cards.filter(card => card.pageId === activePage), [cards, activePage]);
  const pageFrames = useMemo(() => frames.filter(frame => frame.pageId === activePage), [frames, activePage]);
  const pageBlocks = useMemo(() => blocks.filter(block => block.pageId === activePage), [blocks, activePage]);
  const interactions = useMemo(() => cards.map(c => ({ sourceCardId: c.id, mappings: c.mappings.filter(m => m.targetCardId && m.targetColumn) })), [cards]);
  const selected = cards.find(c => c.id === selectedId);
  const selectedBlock = blocks.find(block => block.id === selectedId);
  const updateBlock = (id: string, change: Partial<ContentBlock>) => setBlocks(old => old.map(block => block.id === id ? { ...block, ...change } : block));
  const update = (id: string, fn: (card: Card) => Card) => setCards(previous => previous.map(c => c.id === id ? fn(c) : c));
  const add = async (id: string, frameId?: string, replaceId?: string) => {
    const replacing = pageCards.find(item => item.id === replaceId);
    const destination = pageFrames.find(item => item.id === (frameId ?? selectedFrame));
    if (busy || (replaceId && !replacing) || (!replacing && (cards.length >= 40 || (!destination && cards.length + frames.length + blocks.length >= 40)))) return;
    setAddingFrame(replacing?.id ?? destination?.id ?? ''); setBusy(id); setError(''); setReplaceNotice('');
    try {
      const chart = await request<SavedChart>(`/${encodeURIComponent(id)}`);
      const schema = await request<{columns:Column[]}>(`/datasets/${encodeURIComponent(chart.config.dataset_id)}/columns?kind=${encodeURIComponent(chart.config.dataset_kind)}`);
      if (replacing) {
        const kind = chart.config.chart_type;
        const columnAllowed = (name: string, sourceKind: string) => {
          const column = schema.columns.find(item => item.name === name);
          return !!column && (sourceKind !== 'filter_date' || dateColumn(column.type));
        };
        const outgoing = kind === 'kpi' ? [] : replacing.mappings.filter(mapping => {
          if (!mapping.targetCardId || !mapping.targetColumn || kind !== 'filter_date') return true;
          const target = cards.find(item => item.id === mapping.targetCardId);
          return !!target?.columns.some(column => column.name === mapping.targetColumn && dateColumn(column.type));
        });
        const drillPath = !kind.startsWith('filter_') && kind !== 'kpi' && replacing.drillPath.every(name => !name || schema.columns.some(column => column.name === name)) ? replacing.drillPath : [];
        const incomingInvalid = cards.some(item => item.id !== replacing.id && item.mappings.some(mapping => mapping.targetCardId === replacing.id && !!mapping.targetColumn && !columnAllowed(mapping.targetColumn, item.chart.config.chart_type)));
        const adjusted = incomingInvalid || outgoing.length !== replacing.mappings.length || drillPath.length !== replacing.drillPath.length;
        chartCache.current.delete(replacing.id);
        setCards(previous => previous.map(item => item.id === replacing.id
          ? { ...item, chart, columns: schema.columns, title: chart.name, mappings: outgoing, drillPath }
          : { ...item, mappings: item.mappings.filter(mapping => mapping.targetCardId !== replacing.id || !mapping.targetColumn || columnAllowed(mapping.targetColumn, item.chart.config.chart_type)) }));
        setSelections(previous => previous.filter(selection => selection.sourceCardId !== replacing.id));
        setSteps(previous => { const next = { ...previous }; delete next[replacing.id]; return next; });
        setSelectedFrame(''); setSelectedId(replacing.id);
        setReplaceNotice(adjusted ? 'Chart diganti. Pemetaan atau drill-down yang tidak sesuai telah dihapus; periksa pengaturan interaksi.' : 'Chart berhasil diganti.');
        return;
      }
      const frame = destination;
      const y = [...pageCards, ...pageFrames, ...pageBlocks].reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
      const card: Card = { pageId: activePage, id: frame?.id || crypto.randomUUID(), chart, columns: schema.columns, title: chart.name, background:'#102333', x:frame?.x ?? 0, y:frame?.y ?? y, w:frame?.w ?? (chart.config.chart_type.startsWith('filter_') ? 4 : 6), h:frame?.h ?? (chart.config.chart_type.startsWith('filter_') ? 3 : 6), mappings:[], drillPath:[] };
      setCards(previous => [...previous, card]);
      if (frame) setFrames(previous => previous.filter(item => item.id !== frame.id));
      setSelectedFrame(''); setSelectedId(card.id);
    } catch (e) { setError(`Chart tidak dapat ditambahkan: ${e instanceof Error ? e.message : 'CHART_ERROR'}`); }
    finally { setBusy(''); setAddingFrame(''); }
  };
  const layout = [...pageCards, ...pageFrames, ...pageBlocks].map(c => ({ i:c.id, x:c.x, y:c.y, w:c.w, h:c.h, minW:1, minH:2, maxH:100 }));
  const canvasPoint = (element: HTMLElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const columnWidth = Math.max(1, (rect.width - 13 * 12) / 12);
    return { x: Math.max(0, Math.min(11.999, (clientX - rect.left - 12) / (columnWidth + 12))), y: Math.max(0, (clientY - rect.top - 12) / 76) };
  };
  const applyLayout = (items: readonly LayoutItem[]) => {
    if (!canApplyGridLayout(layout,items)) { setError('Posisi tersebut menyebabkan layout bertumpuk. Coba posisi lain.'); return; }
    setCards(prev => prev.map(c => {const item = items.find(i => i.i === c.id); return item ? {...c, x:item.x,y:item.y,w:item.w,h:item.h} : c; }));
    setFrames(prev => prev.map(c => {const item = items.find(i => i.i === c.id); return item ? {...c, x:item.x,y:item.y,w:item.w,h:item.h} : c; }));
    setBlocks(prev => prev.map(c => {const item = items.find(i => i.i === c.id); return item ? {...c, x:item.x,y:item.y,w:item.w,h:item.h} : c; }));
  };
  const dragIntent = (id: string, event: Event, before: readonly LayoutItem[]) => {
    const grid = editorRef.current?.querySelector<HTMLElement>('.dd-grid');
    const touch = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : null;
    const point = touch || ('clientX' in event ? event as MouseEvent : null);
    if (!grid || !point || !before.length) return null;
    const rect = grid.getBoundingClientRect();
    if (point.clientX < rect.left || point.clientX > rect.right || point.clientY < rect.top || point.clientY > rect.bottom) return null;
    const columnWidth = (rect.width - 13 * 12) / 12;
    if (columnWidth <= 0) return null;
    const x = Math.max(0, Math.min(11.999, (point.clientX - rect.left - 12) / (columnWidth + 12)));
    const y = Math.max(0, (point.clientY - rect.top - 12) / 76);
    return gridDropIntent(before, id, x, y);
  };
  const finishDrag = (id: string, event: Event) => {
    const before = dragBeforeRef.current;
    dragBeforeRef.current = [];
    if (!before.length) return;
    const intent = dragIntent(id, event, before);
    const moved = intent ? moveGridItem(before, id, intent) : null;
    if (!moved) {
      if (intent) setError('Slot tidak dapat ditempatkan di posisi tersebut. Coba tepi atau baris lain.');
      applyLayout(before); return;
    }
    applyLayout(moved);
  };
  const insertPreset = (presetId: string, y: number, x?: number) => {
    const preset = FRAME_PRESETS.find(item => item.id === presetId);
    if (!preset || busy || cards.length + frames.length + blocks.length + preset.widths.length > 40) return;
    if (x !== undefined && isFreeGap(layout, x, y)) {
      const space = findFreePlacement(layout, {i:'new',x:0,y:0,w:12,h:frameHeight}, x, y);
      const widths = space && fitPresetWidths(preset.widths, space.w);
      if (!space || !widths) { setError('Ruang kosong terlalu kecil untuk layout ini. Coba slot lain atau perbesar ruangnya.'); return; }
      let left = space.x;
      const newFrames = widths.map(width => { const frame = {id:crypto.randomUUID(),pageId:activePage,x:left,y:space.y,w:width,h:space.h}; left += width; return frame; });
      setFrames(old => [...old, ...newFrames]);
      setSelectedId(''); setSelectedFrame(''); setDropY(null); setNativeGap(null); return;
    }
    const result = insertFrameRow(preset.widths, [...pageCards, ...pageFrames, ...pageBlocks], frameHeight, y, () => crypto.randomUUID());
    const positions = new Map(result.items.map(item => [item.id, item.y]));
    setCards(old => old.map(card => ({ ...card, y: positions.get(card.id) ?? card.y })));
    setFrames(old => [...old.map(frame => ({ ...frame, y: positions.get(frame.id) ?? frame.y })), ...result.frames.map(frame => ({ ...frame, pageId: activePage }))]);
    setBlocks(old => old.map(block => ({ ...block, y: positions.get(block.id) ?? block.y })));
    setSelectedId(''); setSelectedFrame(''); setDropY(null);
  };
  const addContent = (kind: ContentKind, targetId?: string, y?: number, x?: number) => {
    const destination = pageFrames.find(frame => frame.id === (targetId ?? selectedFrame));
    if (busy || (!destination && cards.length + frames.length + blocks.length >= 40)) return;
    const height = kind === 'image' ? 5 : 3;
    const occupied = [...pageCards, ...pageFrames, ...pageBlocks];
    const bottom = occupied.reduce((value, item) => Math.max(value, item.y + item.h), 0);
    const gap = !destination && x !== undefined && y !== undefined && isFreeGap(layout, x, y)
      ? findFreePlacement(layout, {i:'new',x:0,y:0,w:12,h:height}, x, y) : null;
    if (!destination && x !== undefined && y !== undefined && isFreeGap(layout, x, y) && !gap) { setError('Ruang kosong terlalu kecil untuk komponen ini.'); return; }
    const inserted = destination || gap ? null : insertFrameRow([12], occupied, height, y ?? bottom, () => crypto.randomUUID());
    if (inserted) {
      const positions = new Map(inserted.items.map(item => [item.id, item.y]));
      setCards(old => old.map(card => ({ ...card, y: positions.get(card.id) ?? card.y })));
      setFrames(old => old.map(frame => ({ ...frame, y: positions.get(frame.id) ?? frame.y })));
      setBlocks(old => old.map(block => ({ ...block, y: positions.get(block.id) ?? block.y })));
    }
    const frame = destination ?? (gap ? {id:crypto.randomUUID(),x:gap.x,y:gap.y,w:gap.w,h:gap.h} : inserted!.frames[0]);
    setBlocks(old => [...old, { ...frame, pageId: activePage, kind, text: 'Tulis judul atau keterangan', image: '', alt: '', color: textColor, fontSize: 24, align: 'left' }]);
    if (destination) setFrames(old => old.filter(item => item.id !== destination.id));
    setSelectedFrame(''); setSelectedId(frame.id); setDropY(null); setNativeGap(null);
  };
  const uploadImage = (id: string, file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Pilih gambar PNG, JPG, WebP, atau GIF dengan ukuran maksimal 2 MB.'); return;
    }
    const reader = new FileReader();
    setImageLoading(true);
    reader.onload = () => { if (typeof reader.result === 'string') updateBlock(id, { image: reader.result }); };
    reader.onerror = () => setError('Gambar tidak dapat dibaca. Silakan pilih kembali.');
    reader.onloadend = () => setImageLoading(false);
    try { reader.readAsDataURL(file); }
    catch { setImageLoading(false); setError('Gambar tidak dapat dibaca. Silakan pilih kembali.'); }
  };
  const switchPage = (id: string) => { if (busy) return; pageCards.forEach(card => chartCache.current.delete(card.id)); setActivePage(id); setSelectedId(''); setSelectedFrame(''); setDropY(null); setNativeGap(null); };
  const addPage = () => { if (busy || pages.length >= 12) return; let number = 1; while (pages.some(page => page.name === `Halaman ${number}`)) number++; const page = { id: crypto.randomUUID(), name: `Halaman ${number}` }; setPages(old => [...old, page]); switchPage(page.id); };
  const removePage = () => {
    if (busy || pages.length <= 1) return;
    const page = pages.find(item => item.id === activePage)!;
    const { removedIds: ids } = removePageCardReferences(cards, activePage);
    const count = ids.size + pageFrames.length + pageBlocks.length;
    if (!window.confirm(`Hapus ${page.name.trim() || 'halaman ini'}${count ? ` beserta ${count} komponennya` : ''}?`)) return;
    setCards(old => removePageCardReferences(old, activePage).cards);
    setFrames(old => old.filter(frame => frame.pageId !== activePage));
    setBlocks(old => old.filter(block => block.pageId !== activePage));
    setSelections(old => old.filter(selection => !ids.has(selection.sourceCardId)));
    setSteps(old => Object.fromEntries(Object.entries(old).filter(([id]) => !ids.has(id))));
    setPages(old => old.filter(item => item.id !== activePage));
    switchPage(pages.find(item => item.id !== activePage)!.id);
  };
  const setSelection = (cardId: string, selection: Selection | null) => setSelections(old => [...old.filter(s => s.sourceCardId !== cardId), ...(selection ? [selection] : [])]);
  const remove = (id: string) => { chartCache.current.delete(id); setCards(old => old.filter(c => c.id !== id).map(c => ({...c,mappings:c.mappings.filter(m => m.targetCardId !== id)}))); setSelections(old => old.filter(s => s.sourceCardId !== id)); setSteps(old => {const next={...old}; delete next[id]; return next;}); setSelectedId(''); };
  const filtered = catalog.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  return <section ref={editorRef} className="dd-shell" onKeyDown={event => { if (event.key === 'Escape' && document.fullscreenElement === editorRef.current) { event.preventDefault(); event.stopPropagation(); void toggleFullscreen(); } }}>
    <UniverseCatalogHeader title="Dashboard Designer" hint="Katalog dashboard / Editor" actions={<div className="dd-header-actions">{onBack && <button type="button" className="u-dataset-action" disabled={saving} onClick={() => void backToCatalog()}>← Daftar dashboard</button>}<button type="button" className="u-dataset-action" aria-pressed={fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? '⤡ Keluar layar penuh' : '⛶ Layar penuh'}</button><button type="button" className="u-dataset-action" disabled={saving || !!busy} onClick={() => {chartCache.current.clear(); setGridRevision(value => value + 1);}}>↻ Muat ulang data</button><button type="button" className="u-dataset-action" disabled={saving || !!busy} onClick={() => setEdit(!edit)}>{edit ? '▶ Lihat dashboard' : '✎ Edit dashboard'}</button>{onSave && <button type="button" className="u-dataset-action is-primary" disabled={saving || !!busy || imageLoading} onClick={() => void save()}>{saving ? 'Menyimpan…' : '▣ Simpan dashboard'}</button>}</div>} />
    <div className="dd-notice" role="status">{savedMessage && !dirty ? savedMessage : dirty ? 'Perubahan belum disimpan.' : baseline !== null ? 'Dashboard tersimpan.' : 'Dashboard baru belum disimpan.'}</div>
    {replaceNotice && <div className="dd-notice" role="status">{replaceNotice}</div>}
    {error && <div className="dd-error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
    {edit && gridCollisions(layout).length > 0 && <div className="dd-error" role="alert">Ada komponen yang bertumpuk pada halaman ini. <button type="button" onClick={() => {const repaired=repairGridCollisions(layout); if (!repaired) {setError('Layout terlalu panjang untuk dirapikan secara otomatis.');return;} applyLayout(repaired); setGridRevision(value => value + 1); setError('');}}>Rapikan layout</button></div>}
    <nav className="dd-pages" aria-label="Halaman dashboard" inert={saving || undefined}><div className="dd-page-tabs" role="tablist" aria-label="Pilih halaman">{pages.map(page => <button type="button" role="tab" key={page.id} disabled={!!busy} aria-selected={page.id === activePage} onClick={() => switchPage(page.id)}>{page.name.trim() || 'Tanpa nama'}</button>)}{edit && <button type="button" className="dd-page-add" disabled={!!busy || pages.length >= 12} onClick={addPage}>＋ Halaman</button>}</div>{edit && <div className="dd-page-settings"><label>Nama halaman<input aria-label="Nama halaman" maxLength={60} value={pages.find(page => page.id === activePage)?.name || ''} onChange={e => setPages(old => old.map(page => page.id === activePage ? {...page,name:e.target.value} : page))}/></label><button type="button" disabled={!!busy || pages.length <= 1} onClick={removePage}>Hapus halaman</button></div>}{selections.length > 0 && <button type="button" className="dd-reset-filters" onClick={() => setSelections([])}>Reset filter ({selections.length})</button>}</nav>
    <div className={`dd-layout${!edit ? ' dd-view' : ''}`} inert={saving || undefined}>
      {edit && <aside className="dd-sidebar dd-palette">
        <div className="dd-palette-tabs" role="tablist" aria-label="Komponen dashboard"><button type="button" role="tab" aria-selected={palette === 'layout'} onClick={() => setPalette('layout')}>Layout</button><button type="button" role="tab" aria-selected={palette === 'content'} onClick={() => setPalette('content')}>Konten</button><button type="button" role="tab" aria-selected={palette === 'chart'} onClick={() => setPalette('chart')}>Chart Library</button></div>
        {palette === 'layout' ? <><div className="dd-palette-heading"><h2>Susun layout</h2><span>12 kolom</span></div><p className="dd-note">Tarik layout ke kanvas atau klik untuk menambahkan di bagian bawah.</p>
          <div className="dd-presets">{FRAME_PRESETS.map(preset => <button type="button" className="dd-preset" draggable={!busy && cards.length + frames.length + blocks.length + preset.widths.length <= 40} onDragStart={e => {e.dataTransfer.setData('text/x-core-layout', preset.id); e.dataTransfer.effectAllowed='copy';}} onDragEnd={() => {setDropY(null);setNativeGap(null);}} disabled={!!busy || cards.length + frames.length + blocks.length + preset.widths.length > 40} key={preset.id} onClick={() => {setFrames(old => [...old, ...makeFrames(preset.widths, [...pageCards, ...old.filter(frame => frame.pageId === activePage), ...pageBlocks], frameHeight, () => crypto.randomUUID()).map(frame => ({ ...frame, pageId: activePage }))]); setSelectedId('');}}><span className="dd-preset-preview" aria-hidden="true">{preset.widths.map((width,i) => <i key={i} style={{flex:width}}/>)}</span><span>{preset.label}</span></button>)}</div>
          <label className="dd-frame-height">Tinggi slot<select value={frameHeight} onChange={e => setFrameHeight(Number(e.target.value))}><option value={3}>Ringkas · filter</option><option value={5}>Sedang</option><option value={7}>Tinggi · chart</option></select></label>
          <button className="dd-open-charts" type="button" onClick={() => setPalette('chart')}>Lanjut ke Chart Library →</button></> : palette === 'content' ? <><div className="dd-palette-heading"><h2>Konten</h2></div><p className="dd-note">Tarik komponen ke kanvas atau pilih slot lalu tekan ＋.</p>{selectedFrame && <p className="dd-slot-hint">Slot dipilih — pilih komponen untuk mengisinya.</p>}<div className="dd-content-list">{CONTENT_TYPES.map(item => <div className="dd-catalog-item" key={item.kind} draggable={!busy} onDragStart={e => {e.dataTransfer.setData('text/x-core-content', item.kind); e.dataTransfer.effectAllowed='copy';}}><span><strong><span aria-hidden="true">{item.icon}</span> {item.label}</strong></span><button type="button" disabled={!!busy} aria-label={`Tambahkan ${item.label}`} onClick={() => addContent(item.kind)}>＋</button></div>)}</div></> : <><div className="dd-palette-heading"><h2>Chart Library</h2><span>{catalog.length} chart</span></div><input aria-label="Cari chart" placeholder="Cari chart…" value={search} onChange={e => setSearch(e.target.value)}/>{selectedFrame && <p className="dd-slot-hint">Slot dipilih — pilih chart untuk mengisinya.</p>}<div className="dd-catalog">{filtered.map(chart => <div className="dd-catalog-item" key={chart.chart_id} draggable onDragStart={e => e.dataTransfer.setData('text/x-core-chart', chart.chart_id)}><span><strong>{chart.name}</strong><small>{chart.config?.chart_type?.replaceAll('_',' ') || 'Chart'}</small></span><button type="button" disabled={!!busy} aria-label={`Tambahkan ${chart.name}`} onClick={() => void add(chart.chart_id)}>＋</button></div>)}{!filtered.length && <p className="dd-note">Tidak ada chart ditemukan.</p>}</div></>}
      </aside>}
      <main className="dd-main"><div className="dd-canvas-title"><input aria-label="Nama dashboard" value={name} maxLength={150} onChange={e => {setName(e.target.value); onNameChange?.(e.target.value);}} disabled={!edit}/><span>{pageCards.length} chart{edit && pageFrames.length ? ` · ${pageFrames.length} slot kosong` : ''}</span></div><div className="dd-canvas" aria-busy={!!busy} style={{background:bg,color:textColor}} onDragOver={e => {
        if (e.dataTransfer.types.includes('text/x-core-layout') || e.dataTransfer.types.includes('text/x-core-content')) {
          e.preventDefault(); e.dataTransfer.dropEffect='copy';
          const point = canvasPoint(e.currentTarget,e.clientX,e.clientY);
          if (isFreeGap(layout, point.x, point.y)) {
            const preview = findFreePlacement(layout,{i:'preview',x:0,y:0,w:12,h:frameHeight},point.x,point.y);
            setNativeGap(old => old && preview && old.x === preview.x && old.y === preview.y && old.w === preview.w && old.h === preview.h ? old : preview); setDropY(null);
          } else { setNativeGap(null); setDropY(insertFrameRow([12], [...pageCards,...pageFrames,...pageBlocks], frameHeight, point.y, () => '').y); }
        } else if (e.dataTransfer.types.includes('text/x-core-chart')) e.preventDefault();
      }} onDragLeave={e => {if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {setDropY(null);setNativeGap(null);}}} onDrop={e => {
        const preset=e.dataTransfer.getData('text/x-core-layout'); const content=e.dataTransfer.getData('text/x-core-content'); const id=e.dataTransfer.getData('text/x-core-chart');
        const point=canvasPoint(e.currentTarget,e.clientX,e.clientY);
        if (content && CONTENT_TYPES.some(item => item.kind === content)) {e.preventDefault(); addContent(content as ContentKind, '', point.y, point.x);}
        else if (preset) {e.preventDefault(); insertPreset(preset,point.y,point.x);}
        else if (id) {e.preventDefault(); void add(id, '');}
        setDropY(null); setNativeGap(null);
      }}>
      {busy && !addingFrame && <div className="dd-add-overlay dd-add-overlay-canvas" role="status"><span className="dd-loading-spinner" aria-hidden="true"/><span>Menambahkan chart…</span></div>}
      {edit && (nativeGap || freePreview) && <div className="dd-gap-preview" aria-hidden="true" style={{left:`calc(${(nativeGap || freePreview)!.x / 12 * 100}% + ${12 - (nativeGap || freePreview)!.x}px)`,width:`calc(${(nativeGap || freePreview)!.w / 12 * 100}% - ${(nativeGap || freePreview)!.w + 12}px)`,top:12+(nativeGap || freePreview)!.y*76,height:(nativeGap || freePreview)!.h*76-12}}/>}
      {edit && dropY !== null && <div className="dd-drop-line" style={{top:dropY * 76 + 5}} aria-hidden="true"><span>Lepas di sini</span></div>}
      {!pageCards.length && !pageBlocks.length && (!edit || !pageFrames.length) ? <div className="dd-empty"><strong>Mulai susun dashboard</strong><p>{edit ? 'Pilih layout di sebelah kiri, lalu isi slot dengan chart.' : 'Belum ada chart di dashboard.'}</p></div> : <Grid key={`${activePage}:${gridRevision}`} className="dd-grid" layouts={{lg:layout,md:layout,sm:layout}} breakpoints={{lg:1200,md:800,sm:0}} cols={{lg:12,md:12,sm:12}} rowHeight={64} margin={[12,12]} compactType={null} preventCollision={moving} isDraggable={edit && !busy} isResizable={edit && !busy} resizeHandles={['se','e','s']} draggableHandle=".dd-move-handle" draggableCancel="button, input, select, textarea, .react-resizable-handle" onDragStart={() => {dragBeforeRef.current = layout.map(item => ({...item})); setMoving(true);}} onDrag={(_items, _old, current, _placeholder, event) => {const next=current ? dragIntent(current.i,event,dragBeforeRef.current) : null; const source=current && dragBeforeRef.current.find(item => item.i === current.i); const gap=source && next?.position === 'free' ? findFreePlacement(dragBeforeRef.current.filter(item => item.i !== source.i), source, next.x ?? -1, next.y ?? -1) : null; setFreePreview(old => old && gap && old.x === gap.x && old.y === gap.y && old.w === gap.w && old.h === gap.h ? old : gap); setDragPreview(old => old?.targetId === next?.targetId && old?.position === next?.position && Math.floor(old?.x ?? -1) === Math.floor(next?.x ?? -1) && Math.floor(old?.y ?? -1) === Math.floor(next?.y ?? -1) ? old : next);}} onDragStop={(_items, _old, current, _placeholder, event) => {setMoving(false); setDragPreview(null); setFreePreview(null); if (current) finishDrag(current.i, event); else if (dragBeforeRef.current.length) {applyLayout(dragBeforeRef.current); dragBeforeRef.current = [];} setGridRevision(value => value + 1);}} onResizeStart={() => {resizeBeforeRef.current = layout.map(item => ({...item}));}} onResizeStop={(items, _old, current) => {applyLayout(current ? resizeAdjacentColumns(resizeBeforeRef.current, items, current.i) : items); resizeBeforeRef.current = []; setGridRevision(value => value + 1);}}>
        {edit && pageFrames.map((frame,index) => <div key={frame.id} className={`dd-frame${selectedFrame === frame.id ? ' is-selected' : ''}${dragPreview?.targetId === frame.id ? ` dd-drop-${dragPreview.position}` : ''}`} onClick={() => {setSelectedFrame(frame.id); setSelectedId(''); setPalette('chart');}} onDragOver={e => {if ((e.dataTransfer.types.includes('text/x-core-chart') || e.dataTransfer.types.includes('text/x-core-content'))) {e.preventDefault(); e.stopPropagation();}}} onDrop={e => {const content=e.dataTransfer.getData('text/x-core-content'); const id=e.dataTransfer.getData('text/x-core-chart'); if (content && CONTENT_TYPES.some(item => item.kind === content)) {e.preventDefault(); e.stopPropagation(); addContent(content as ContentKind, frame.id);} else if (id) {e.preventDefault(); e.stopPropagation(); void add(id, frame.id);}}}>
          {busy && addingFrame === frame.id && <div className="dd-add-overlay" role="status"><span className="dd-loading-spinner" aria-hidden="true"/><span>Menambahkan chart…</span></div>}
          <div className="dd-frame-head dd-move-handle" title="Tarik bagian ini untuk memindahkan slot"><span className="dd-handle" aria-hidden="true">⠿</span><span>Slot {index + 1}</span><button type="button" disabled={!!busy} aria-label={`Hapus slot ${index + 1}`} onClick={e => {e.stopPropagation(); setFrames(old => old.filter(item => item.id !== frame.id)); if (selectedFrame === frame.id) setSelectedFrame('');}}>×</button></div><button className="dd-frame-target" type="button" disabled={!!busy} onClick={e => {e.stopPropagation(); setSelectedFrame(frame.id); setSelectedId(''); setPalette('chart');}}><span>＋</span><strong>Tambahkan chart atau konten</strong><small>Tarik ke sini atau klik untuk memilih</small></button>
        </div>)}
        {!edit && pageFrames.map(frame => <div key={frame.id} aria-hidden="true" />)}
        {pageBlocks.map(block => <div key={block.id} className={`dd-content-block dd-content-${block.kind}${selectedId === block.id && edit ? ' is-selected' : ''}${edit ? ' is-editing' : ''}${dragPreview?.targetId === block.id ? ` dd-drop-${dragPreview.position}` : ''}`} onClick={() => {if (edit) {setSelectedId(block.id); setSelectedFrame('');}}}>
          {edit && <div className="dd-content-head dd-move-handle" title="Tarik bagian ini untuk memindahkan komponen"><span className="dd-handle" aria-hidden="true">⠿</span><span>{CONTENT_TYPES.find(item => item.kind === block.kind)?.label}</span><button type="button" aria-label="Hapus komponen" onClick={e => {e.stopPropagation();setBlocks(old => old.filter(item => item.id !== block.id));setSelectedId('');}}>×</button></div>}
          {block.kind === 'text' && <div className="dd-content-text" style={{color:block.color,fontSize:block.fontSize,textAlign:block.align}}>{block.text}</div>}
          {block.kind === 'image' && (block.image ? <img className="dd-content-image" src={block.image} alt={block.alt}/> : edit ? <div className="dd-content-placeholder">Pilih gambar pada panel pengaturan</div> : null)}
          {block.kind === 'divider' && <div className="dd-content-divider" style={{borderColor:block.color}}/>}
          {block.kind === 'spacer' && edit && <div className="dd-content-placeholder">Ruang kosong</div>}
        </div>)}
        {pageCards.map(card => <div key={card.id} className={`dd-card${selectedId === card.id && edit ? ' is-selected' : ''}${dragPreview?.targetId === card.id ? ` dd-drop-${dragPreview.position}` : ''}`} style={{background:card.background,color:textColor}} onDragOver={e => {if (edit && !busy && e.dataTransfer.types.includes('text/x-core-chart')) {e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='copy';}}} onDrop={e => {const chartId=e.dataTransfer.getData('text/x-core-chart'); if (edit && chartId) {e.preventDefault(); e.stopPropagation(); void add(chartId, undefined, card.id);}}} onClick={() => {if (edit) {setSelectedId(card.id); setSelectedFrame('');}}}>{busy && addingFrame === card.id && <div className="dd-add-overlay" role="status"><span className="dd-loading-spinner" aria-hidden="true"/><span>Mengganti chart…</span></div>}<div className={`dd-card-head${edit ? ' dd-move-handle' : ''}`} title={edit ? 'Tarik bagian ini untuk memindahkan chart' : undefined}><span className={edit ? 'dd-handle' : ''} aria-hidden="true">{edit ? '⠿' : '◇'}</span><strong>{card.title}</strong>{edit && <button type="button" disabled={!!busy} onClick={e => {e.stopPropagation(); remove(card.id);}} aria-label={`Hapus ${card.title}`}>×</button>}</div><ChartCard cache={chartCache} revision={gridRevision} card={card} interactions={interactions} selections={selections} steps={steps[card.id] || []} onSelection={selection => setSelection(card.id,selection)} onDrill={path => setSteps(old => ({...old,[card.id]:path}))}/></div>)}
      </Grid>}</div></main>
      {edit && <aside className="dd-sidebar dd-inspector"><h2>Pengaturan</h2>{selectedBlock ? <><h3>{CONTENT_TYPES.find(item => item.kind === selectedBlock.kind)?.label}</h3>{selectedBlock.kind === 'text' && <><label>Teks<textarea maxLength={4000} value={selectedBlock.text} onChange={e => updateBlock(selectedBlock.id,{text:e.target.value})}/></label><label>Ukuran teks<input type="number" min={10} max={96} value={selectedBlock.fontSize} onChange={e => updateBlock(selectedBlock.id,{fontSize:Math.max(10,Math.min(96,Number(e.target.value)||10))})}/></label><label>Perataan<select value={selectedBlock.align} onChange={e => updateBlock(selectedBlock.id,{align:e.target.value as ContentBlock['align']})}><option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option></select></label></>}{(selectedBlock.kind === 'text' || selectedBlock.kind === 'divider') && <label>Warna<input type="color" value={selectedBlock.color} onChange={e => updateBlock(selectedBlock.id,{color:e.target.value})}/></label>}{selectedBlock.kind === 'image' && <><label>Pilih gambar<input type="file" disabled={imageLoading} accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => {uploadImage(selectedBlock.id,e.target.files?.[0]);e.target.value='';}}/></label><small className="dd-note">PNG, JPG, WebP, atau GIF · maksimal 2 MB.</small><label>Teks alternatif<input maxLength={150} value={selectedBlock.alt} onChange={e => updateBlock(selectedBlock.id,{alt:e.target.value})}/></label>{selectedBlock.image && <button type="button" onClick={() => updateBlock(selectedBlock.id,{image:''})}>Hapus gambar</button>}</>}{selectedBlock.kind === 'spacer' && <p className="dd-note">Geser sudut untuk mengubah ukuran ruang kosong.</p>}<button className="dd-clear-selection" type="button" onClick={() => setSelectedId('')}>Pengaturan dashboard</button></> : selected ? <><label>Judul chart<input maxLength={150} value={selected.title} onChange={e => update(selected.id,c => ({...c,title:e.target.value}))}/></label><label>Warna kartu<input type="color" value={selected.background} onChange={e => update(selected.id,c => ({...c,background:e.target.value}))}/></label><div className="dd-divider"/><h3>Filter ke chart lain</h3><p className="dd-note">Pilih chart tujuan dan kolom yang menerima pilihan.</p>{selected.mappings.map((m,i) => <div className="dd-mapping" key={i}><select aria-label="Chart tujuan" value={m.targetCardId} onChange={e => update(selected.id,c => ({...c,mappings:c.mappings.map((x,n) => n === i ? {targetCardId:e.target.value,targetColumn:''} : x)}))}><option value="">Pilih chart</option>{cards.filter(c => c.id !== selected.id).map(c => <option value={c.id} key={c.id}>{c.title} · {pages.find(page => page.id === c.pageId)?.name}</option>)}</select><select aria-label="Kolom tujuan" value={m.targetColumn} onChange={e => update(selected.id,c => ({...c,mappings:c.mappings.map((x,n) => n === i ? {...x,targetColumn:e.target.value} : x)}))}><option value="">Pilih kolom</option>{cards.find(c => c.id === m.targetCardId)?.columns.filter(c => selected.chart.config.chart_type !== 'filter_date' || dateColumn(c.type)).map(c => <option value={c.name} key={c.name}>{c.name}</option>)}</select><button type="button" onClick={() => update(selected.id,c => ({...c,mappings:c.mappings.filter((_,n) => n !== i)}))}>Hapus</button></div>)}<button type="button" disabled={cards.length < 2} onClick={() => update(selected.id,c => ({...c,mappings:[...c.mappings,{targetCardId:'',targetColumn:''}]}))}>＋ Tambah pemetaan</button>
        {!isFilter(selected) && selected.chart.config.chart_type !== 'kpi' && <><div className="dd-divider"/><h3>Drill-down</h3><p className="dd-note">Urutan kolom menentukan tingkat detail.</p>{selected.drillPath.map((column,i) => <div className="dd-mapping" key={i}><select aria-label={`Tingkat drill ${i+1}`} value={column} onChange={e => {update(selected.id,c => ({...c,drillPath:c.drillPath.map((x,n) => n === i ? e.target.value : x)})); setSteps(old => ({...old,[selected.id]:[]}));}}><option value="">Pilih kolom</option>{selected.columns.filter(c => c.name === column || !selected.drillPath.includes(c.name)).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select><button type="button" onClick={() => {update(selected.id,c => ({...c,drillPath:c.drillPath.filter((_,n) => n !== i)}));setSteps(old => ({...old,[selected.id]:[]}));}}>Hapus</button></div>)}<button type="button" disabled={selected.drillPath.length >= 8} onClick={() => update(selected.id,c => ({...c,drillPath:[...c.drillPath, c.drillPath.length ? '' : c.chart.config.dimension]}))}>＋ Tingkat drill</button></>}
        <button className="dd-clear-selection" type="button" onClick={() => setSelectedId('')}>Pengaturan dashboard</button></> : <><label>Warna latar<input type="color" value={bg} onChange={e => setBg(e.target.value)}/></label><label>Warna teks<input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}/></label><p className="dd-note">Pilih kartu untuk mengatur interaksi dan tampilannya.</p></>}</aside>}
    </div>
  </section>;
}
