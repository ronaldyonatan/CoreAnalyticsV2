import { UniverseInspector, UniverseToolbar, UniverseCatalogButton, UniverseCatalogList } from '../design-system/components/universe';
import { useEffect, useMemo, useState } from 'react';
import { pipelineApi } from './pipelineMetadata';
import type { ScheduleTarget } from './Scheduler';
import './scheduler-job-monitor.css';

export type MonitorSchedule = {
  schedule_id: string; schedule_name: string; target_type: 'STORED' | 'PIPELINE';
  target_id: string; target_name?: string; enabled: boolean;
};
export type SchedulerDispatchEvent = {
  event_id: string; schedule_id: string; schedule_name: string; target_name?: string;
  scheduled_at: string; status: string; result: string; attempt: number;
  run_id?: string | null; error_code?: string | null; finished_at?: string | null;
};
type Execution = {
  run_id: string; dataset_id?: string; pipeline_id?: string; pipeline_name?: string;
  status: string; created_at?: string | null; started_at?: string | null;
  finished_at?: string | null; error_code?: string | null;
  trigger_type?: string; trigger?: string; source?: string;
  version?: number; output_count?: number; row_count?: number; outputs_json?: string; storage_relative_path?: string;
};
type TimelineItem = {
  id: string; kind: 'STORED' | 'PIPELINE' | 'SCHEDULER_EVENT';
  targetKey: string; name: string; runId: string | null;
  startedAt: string | null; finishedAt: string | null;
  status: string; trigger: string; errorCode: string | null;
  duration: string; raw: Execution | null;
};
const displayTime = (v?: string | null) => {
  if (!v) return '—';
  const timestamp = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(v) ? v : `${v}Z`);
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '—';
};
const parseUtc = (v?: string | null): number => {
  if (!v) return NaN;
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(v) ? v : `${v}Z`);
};
function runDuration(job: Execution): string {
  const start = parseUtc(job.started_at);
  if (!Number.isFinite(start)) return '—';
  const end = parseUtc(job.finished_at) || (['QUEUED', 'RUNNING'].includes(job.status) ? Date.now() : NaN);
  if (!Number.isFinite(end) || end < start) return '—';
  const sec = Math.floor((end - start) / 1000);
  return sec < 60 ? `${sec} dtk` : `${Math.floor(sec / 60)}m ${sec % 60}d`;
}
const statuses: Record<string,string> = {QUEUED:'Antrean',RUNNING:'Berjalan',SUCCEEDED:'Selesai',FAILED:'Gagal',CANCELLED:'Dibatalkan',SKIPPED_BUSY:'Dilewati (sibuk)',SKIPPED_INVALID:'Target tidak valid'};
const targetKey = (type: string, id: string) => `${type}:${id.toLowerCase()}`;
function csrf() { const match = document.cookie.split('; ').find(s => s.startsWith('core_csrf=')); return match ? decodeURIComponent(match.slice(10)) : ''; }
async function storedApi<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/voice-api/api/studio/ingest${path}`, { credentials:'include', cache:'no-store', signal, headers:{'X-CSRF-Token':csrf()} });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw Error(result?.code || 'STORED_HISTORY_UNAVAILABLE');
  return result.data as T;
}
function sourceLabel(job: Execution, scheduled: boolean): string {
  const explicit = String(job.trigger_type || job.trigger || job.source || '').toUpperCase();
  if (['SCHEDULED','SCHEDULER','AUTO'].includes(explicit) || scheduled) return 'Scheduled';
  if (['MANUAL','USER'].includes(explicit)) return 'Manual';
  if (explicit === 'API') return 'API';
  return 'Manual / API*';
}

export default function SchedulerJobMonitor({ schedules, events, selected, onSelectTarget, onPreviewOutput }:{
  schedules: MonitorSchedule[]; events: SchedulerDispatchEvent[];
  selected: ScheduleTarget | null;
  onSelectTarget?: (target: ScheduleTarget | null) => void;
  onPreviewOutput?: (outputId:string)=>void;
}) {
  const [stored,setStored] = useState<Execution[]>([]);
  const [pipeline,setPipeline] = useState<Execution[]>([]);
  const [sourceErrors,setSourceErrors] = useState<string[]>([]);
  const [loading,setLoading] = useState(true);
  const [reload,setReload] = useState(0);
  const [filter,setFilter] = useState('');
  const [statusFilter,setStatusFilter] = useState('ALL');
  const [triggerFilter,setTriggerFilter] = useState('ALL');
  const [selectedRun,setSelectedRun] = useState<TimelineItem | null>(null);
  const [detail,setDetail] = useState<Execution | null>(null);
  const [detailError,setDetailError] = useState('');
  const [detailBusy,setDetailBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    // Keep independently available history even if the other source is offline.
    Promise.allSettled([
      storedApi<Execution[]>('/jobs',controller.signal),
      pipelineApi<Execution[]>('/jobs',undefined,controller.signal),
    ]).then(([storedResult,pipelineResult]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];
      if (storedResult.status === 'fulfilled') setStored(Array.isArray(storedResult.value) ? storedResult.value : []);
      else errors.push('Riwayat STORED belum dapat dimuat.');
      if (pipelineResult.status === 'fulfilled') setPipeline(Array.isArray(pipelineResult.value) ? pipelineResult.value : []);
      else errors.push('Riwayat ETL belum dapat dimuat.');
      setSourceErrors(errors);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[reload]);
  const timeline = useMemo(() => {
    const byRun = new Map(events.filter(e => e.run_id).map(e => [String(e.run_id).toLowerCase(),e]));
    const scheduleById = new Map(schedules.map(s => [s.schedule_id.toLowerCase(), s]));
    const knownRuns = new Set<string>();
    const output:TimelineItem[] = [];
    for (const [kind,jobs] of [['STORED',stored],['PIPELINE',pipeline]] as const) {
      for (const job of jobs) {
        const id = String(job.run_id || '').toLowerCase();
        if (!id) continue;
        knownRuns.add(id);
        const event = byRun.get(id);
        const idForTarget = kind === 'STORED' ? job.dataset_id : job.pipeline_id;
        if (!idForTarget) continue;
        const schedule = schedules.find(s => s.target_type === kind && s.target_id.toLowerCase() === idForTarget.toLowerCase());
        output.push({
          id:`${kind}:${id}`,kind,targetKey:targetKey(kind,idForTarget),
          name:kind === 'STORED' ? (schedule?.target_name || schedule?.schedule_name || 'STORED Dataset') : (job.pipeline_name || schedule?.target_name || 'ETL Pipeline'),
          runId:job.run_id,startedAt:job.started_at || job.created_at || null,finishedAt:job.finished_at || null,
          status:job.status,trigger:sourceLabel(job,Boolean(event)),errorCode:job.error_code || null,
          duration:runDuration(job),raw:job,
        });
      }
    }
    // Retain skipped scheduler events or events whose underlying job is older than the job-list window.
    for (const e of events) {
      if (e.run_id && knownRuns.has(e.run_id.toLowerCase())) continue;
      const schedule = scheduleById.get(e.schedule_id.toLowerCase());
      if (!schedule) continue;
      output.push({
        id:`EVENT:${e.event_id}`,kind:'SCHEDULER_EVENT',targetKey:targetKey(schedule.target_type,schedule.target_id),
        name:schedule.target_name || schedule.schedule_name,runId:e.run_id || null,
        startedAt:e.scheduled_at,finishedAt:e.finished_at || null,status:e.status,
        trigger:'Scheduled',errorCode:e.error_code || null,duration:'—',raw:null,
      });
    }
    return output.sort((a,b) => (parseUtc(b.startedAt) || 0) - (parseUtc(a.startedAt) || 0));
  },[stored,pipeline,events,schedules]);
  const filtered = useMemo(() => timeline.filter(j => {
    if (selected && j.targetKey !== targetKey(selected.type, selected.id)) return false;
    if (statusFilter !== 'ALL' && j.status !== statusFilter) return false;
    if (triggerFilter === 'SCHEDULED' && j.trigger !== 'Scheduled') return false;
    if (triggerFilter === 'OTHER' && j.trigger === 'Scheduled') return false;
    return `${j.name} ${j.runId||''} ${j.errorCode||''}`.toLowerCase().includes(filter.toLowerCase());
  }),[timeline,selected,statusFilter,triggerFilter,filter]);
  const totals = useMemo(() => ({
    success:filtered.filter(j=>j.status==='SUCCEEDED').length,
    failed:filtered.filter(j=>j.status==='FAILED').length,
    running:filtered.filter(j=>['RUNNING','QUEUED'].includes(j.status)).length,
  }),[filtered]);
  useEffect(() => {
    if (!selectedRun || !selectedRun.runId || selectedRun.kind === 'SCHEDULER_EVENT') {
      setDetail(null);setDetailError('');setDetailBusy(false);return;
    }
    const controller=new AbortController();
    setDetailBusy(true);setDetail(null);setDetailError('');
    const promise=selectedRun.kind==='STORED'
      ? storedApi<Execution>(`/jobs/${encodeURIComponent(selectedRun.runId)}`,controller.signal)
      : pipelineApi<Execution>(`/jobs/${encodeURIComponent(selectedRun.runId)}`,undefined,controller.signal);
    promise.then(result=>{if(!controller.signal.aborted)setDetail(result);})
      .catch(err=>{if(!controller.signal.aborted)setDetailError(err instanceof Error?err.message:'JOB_DETAIL_UNAVAILABLE');})
      .finally(()=>{if(!controller.signal.aborted)setDetailBusy(false);});
    return ()=>controller.abort();
  },[selectedRun]);
  return <UniverseInspector className="ca-job-monitor" aria-label="Execution history">
    <div className="ca-job-monitor-head">
      <div><h3>Execution History</h3><p>{selected ? `Filter: ${selected.name}` : 'Semua jadwal dan run manual'}</p></div>
      <div className="ca-job-monitor-tools">
        {selected && <button type="button" onClick={()=>onSelectTarget?.(null)}>Semua</button>}
        <button type="button" disabled={loading} onClick={()=>setReload(v=>v+1)} className="universe-refresh-icon" aria-label="Muat ulang" data-tooltip="Muat ulang">↻</button>
      </div>
    </div>
    <div className="ca-job-monitor-metrics">
      <span><small>Riwayat</small><strong>{loading?'—':filtered.length}</strong></span>
      <span><small>Selesai</small><strong>{loading?'—':totals.success}</strong></span>
      <span><small>Gagal</small><strong>{loading?'—':totals.failed}</strong></span>
      <span><small>Antrean / berjalan</small><strong>{loading?'—':totals.running}</strong></span>
    </div>
    <UniverseToolbar className="ca-job-monitor-filters">
      <input value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Cari run" placeholder="Cari job / Run ID…" />
      <select aria-label="Filter trigger" value={triggerFilter} onChange={e=>setTriggerFilter(e.target.value)}>
        <option value="ALL">Semua pemicu</option><option value="SCHEDULED">Scheduled</option><option value="OTHER">Manual / API</option>
      </select>
      <select aria-label="Filter status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        <option value="ALL">Semua status</option>{Object.keys(statuses).map(s=><option value={s} key={s}>{statuses[s]}</option>)}
      </select>
    </UniverseToolbar>
    {sourceErrors.length>0 && <p className="ca-job-monitor-warning" role="status">{sourceErrors.join(' ')}</p>}
    <UniverseCatalogList className="ca-job-monitor-list">
      {loading && <p className="ca-job-monitor-empty">Memuat riwayat job…</p>}
      {!loading && !filtered.length && <p className="ca-job-monitor-empty">Belum ada eksekusi pada filter ini. Pastikan Scheduler dan worker berjalan untuk job terjadwal.</p>}
      {!loading && filtered.map(job=><UniverseCatalogButton type="button" key={job.id} className={`ca-job-monitor-item${selectedRun?.id===job.id?' is-selected':''}`} onClick={()=>setSelectedRun(job)}>
        <span className="ca-job-monitor-item-line"><strong>{job.name}</strong><span className={`ca-job-monitor-status ca-state-${job.status.toLowerCase()}`}>{statuses[job.status]||job.status}</span></span>
        <small>{displayTime(job.startedAt)} · {job.duration} · {job.trigger}</small>
        {job.runId && <small className="ca-job-monitor-run">{job.runId}</small>}
        {job.errorCode && <small className="ca-job-monitor-error">{job.errorCode}</small>}
      </UniverseCatalogButton>)}
    </UniverseCatalogList>
    <p className="ca-job-monitor-footnote">*Jika metadata pemicu tidak tersedia, run di luar riwayat Scheduler ditandai Manual / API. Pembeda pasti membutuhkan metadata trigger dari backend.</p>
    {selectedRun && <section className="ca-job-monitor-detail" aria-label="Detail eksekusi">
      <div className="ca-job-monitor-head"><h3>Run Detail</h3><button type="button" onClick={()=>setSelectedRun(null)}>Tutup</button></div>
      <dl>
        <dt>Target</dt><dd>{selectedRun.name}</dd>
        <dt>Status</dt><dd>{statuses[selectedRun.status]||selectedRun.status}</dd>
        <dt>Pemicu</dt><dd>{selectedRun.trigger}</dd>
        <dt>Run ID</dt><dd className="ca-job-monitor-run">{selectedRun.runId||'—'}</dd>
        <dt>Mulai</dt><dd>{displayTime(selectedRun.startedAt)}</dd>
        <dt>Selesai</dt><dd>{displayTime(selectedRun.finishedAt)}</dd>
        <dt>Durasi</dt><dd>{selectedRun.duration}</dd>
      </dl>
      {detailBusy && <p>Memuat detail eksekusi…</p>}
      {detailError && <p className="ca-job-monitor-warning" role="alert">{detailError}</p>}
      {detail && <>
        {typeof detail.version === 'number' && <p>Versi pipeline: v{detail.version}</p>}
        {typeof detail.output_count === 'number' && <p>Output: {detail.output_count}</p>}
        {typeof detail.row_count === 'number' && <p>Rows: {detail.row_count.toLocaleString('id-ID')}</p>}
        {detail.error_code && <p className="ca-job-monitor-error">Error: {detail.error_code}</p>}
        {detail.outputs_json && (()=>{
          let outputs: {output_version_id?:string;output_name?:string;row_count?:number;schema_json?:string}[]=[];
          try {const parsed:unknown=JSON.parse(detail.outputs_json);if(Array.isArray(parsed))outputs=parsed.filter(o=>o!==null&&typeof o==='object');} catch { /* metadata may not be available */ }
          return outputs.length>0 && <div className="ca-job-monitor-outputs"><strong>Output Parquet</strong>{outputs.map((o,i)=><div className="ca-job-monitor-output" key={o.output_version_id||i}>
            <span>{o.output_name||`Output ${i+1}`}{typeof o.row_count==='number'&&<small>{o.row_count.toLocaleString('id-ID')} baris</small>}</span>
            {o.output_version_id&&onPreviewOutput&&<button type="button" onClick={()=>onPreviewOutput(o.output_version_id!)}>Lihat data ↗</button>}
            {o.schema_json && <details><summary>Kolom hasil</summary><code>{(()=>{try{const v=JSON.parse(o.schema_json);return Array.isArray(v.fields)?v.fields.map((f:{name:string})=>f.name).join(', '):'—';}catch{return '—';}})()}</code></details>}
          </div>)}</div>;
        })()}
      </>}
      {selectedRun.kind === 'SCHEDULER_EVENT' && <p>Ini adalah kejadian dispatcher Scheduler, bukan detail job worker.</p>}
    </section>}
  </UniverseInspector>;
}
