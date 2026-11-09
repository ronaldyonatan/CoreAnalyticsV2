import { useEffect, useMemo, useState } from 'react';
import { pipelineApi, pipelineMessage, pipelineUuid } from './pipelineMetadata';
import type { PipelineDocument } from './pipelineMetadata';
import PipelineLineage from './PipelineLineage';

type Job = { run_id: string; pipeline_id: string; pipeline_name: string; version: number; status: string; created_at: string; started_at?: string | null; finished_at?: string | null; error_code?: string | null; cancel_requested?: boolean; output_count?: number };
type Output = { output_version_id?: string; output_node_id: string; output_name: string; row_count: number; schema_json: string };
type JobDetail = Job & { outputs_json?: string };
type PipelineDetail = { document: PipelineDocument; pipeline_name: string; version: number };
const statusNames: Record<string, string> = { QUEUED: 'Antrean', RUNNING: 'Berjalan', SUCCEEDED: 'Selesai', FAILED: 'Gagal', CANCELLED: 'Dibatalkan' };
const goodDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + 'Z');
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};
const duration = (job: Job) => {
  if (!job.started_at) return '—';
  const start = Date.parse(job.started_at + (/Z|[+-]\d\d:\d\d$/.test(job.started_at) ? '' : 'Z'));
  const end = job.finished_at ? Date.parse(job.finished_at + (/Z|[+-]\d\d:\d\d$/.test(job.finished_at) ? '' : 'Z')) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  const seconds = Math.round((end - start) / 1000);
  return seconds < 60 ? `${seconds} dtk` : `${Math.floor(seconds / 60)}m ${seconds % 60}d`;
};
function schemaColumns(value: string): { name: string; type: unknown }[] {
  try { const schema = JSON.parse(value); return Array.isArray(schema.fields) ? schema.fields : []; } catch { return []; }
}
function validOutputs(value?: string): Output[] {
  try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; } catch { return []; }
}
export default function JobMonitor({ onExplore, onExploreSource, onOpenCanvas, view = 'history', pipelineId }: { onExplore?: (id: string) => void; onExploreSource?: (id: string, isParquet: boolean) => void; onOpenCanvas?: () => void; view?: 'history' | 'lineage'; pipelineId: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selectedRun, setSelectedRun] = useState('');
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [pipeline, setPipeline] = useState<PipelineDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await pipelineApi<Job[]>('/jobs', undefined, controller.signal);
        if (!controller.signal.aborted) { setJobs(result); setError(''); }
      } catch (err) { if (!controller.signal.aborted) setError(pipelineMessage(err)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 5000); }
    }
    void refresh(); return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt]);
  const scopedJobs = useMemo(() => jobs.filter(j => j.pipeline_id.toLowerCase() === pipelineId.toLowerCase()).sort((a,b) => (b.created_at || '').localeCompare(a.created_at || '')), [jobs, pipelineId]);
  const mostRecent = scopedJobs[0] || null;
  const filtered = useMemo(() => scopedJobs.filter(j => (status === 'ALL' || j.status === status) && (`${j.pipeline_name} ${j.run_id}`).toLowerCase().includes(filter.toLowerCase())), [scopedJobs, filter, status]);
  const totals = useMemo(() => ({ total: scopedJobs.length, succeeded: scopedJobs.filter(j => j.status === 'SUCCEEDED').length, failed: scopedJobs.filter(j => j.status === 'FAILED').length, running: scopedJobs.filter(j => j.status === 'RUNNING' || j.status === 'QUEUED').length }), [scopedJobs]);
  async function selectJob(job: Job) {
    setSelectedRun(job.run_id); setDetail(null); setPipeline(null); setDetailError(''); setBusy(job.run_id);
    try {
      const selected = await pipelineApi<JobDetail>('/jobs/' + pipelineUuid(job.run_id));
      setDetail(selected);
      if (view === 'lineage') {
        const version = encodeURIComponent(String(job.version));
        const result = await pipelineApi<PipelineDetail>('/' + pipelineUuid(job.pipeline_id) + '?version=' + version);
        setPipeline(result);
      }
    } catch (err) { setDetailError(pipelineMessage(err)); }
    finally { setBusy(''); }
  }
  useEffect(() => {
    if (view !== 'lineage' || !scopedJobs.length || selectedRun === scopedJobs[0].run_id) return;
    const first = scopedJobs[0];
    if (first) void selectJob(first);
    // Run only when the first list arrives; the selected run is retained across polls.
  }, [mostRecent?.run_id, selectedRun, view]);
  async function cancel(id: string) {
    if (!window.confirm('Batalkan job yang sedang berjalan?')) return;
    setBusy(id);
    try { await pipelineApi('/jobs/' + pipelineUuid(id) + '/cancel', {}); setAttempt(v => v + 1); }
    catch (err) { setError(pipelineMessage(err)); } finally { setBusy(''); }
  }
  const outputs = validOutputs(detail?.outputs_json);
  if (view === 'lineage') {
    return <section className="studio-etl-monitor studio-etl-monitor--lineage" aria-label="Pipeline lineage">
      {error && <p role="alert" className="studio-etl-error">{error}</p>}
      {!error && !scopedJobs.length && <p>Belum ada run untuk pipeline ini.</p>}
      {detailError && <p role="alert" className="studio-etl-error">{detailError}</p>}
      {mostRecent && !detail && !detailError && <p className="ca-lineage-loading">Memuat lineage run terbaru…</p>}
      {detail && pipeline && <PipelineLineage pipelineName={pipeline.pipeline_name} document={pipeline.document} outputs={outputs} version={detail.version} onExplore={onExplore} onExploreSource={onExploreSource} onOpenCanvas={onOpenCanvas} />}
      {detail && !pipeline && !detailError && <p className="ca-lineage-loading">Memuat struktur pipeline…</p>}
    </section>;
  }
  return <section className="studio-etl-monitor" aria-label="Spark jobs and history">
    <div className="studio-etl-monitor-title"><div><h2>Spark Runs & History</h2><p>Riwayat hanya untuk pipeline yang sedang dibuka, termasuk semua versinya.</p></div><button type="button" onClick={() => setAttempt(v => v + 1)}>↻ Perbarui</button></div>
    <div className="studio-etl-stats" aria-label="Ringkasan job">
      <div><span>Run pipeline ini (maks. 100)</span><strong>{totals.total}</strong></div>
      <div><span>Sukses</span><strong>{totals.succeeded}</strong></div>
      <div><span>Gagal</span><strong>{totals.failed}</strong></div>
      <div><span>Antrean / berjalan</span><strong>{totals.running}</strong></div>
      <div><span>Last run</span><strong className="small">{goodDate(mostRecent?.created_at)}</strong></div>
    </div>
    <div className="studio-etl-filters"><input aria-label="Cari pipeline atau run ID" placeholder="Cari pipeline / Run ID…" value={filter} onChange={e => setFilter(e.target.value)} /><select aria-label="Filter status run" value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">Semua status</option>{Object.entries(statusNames).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    {error && <p role="alert" className="studio-etl-error">{error}</p>}
    {!error && !scopedJobs.length && <p>Belum ada job. Simpan dan jalankan pipeline dari tab ETL & Pipeline.</p>}
    <div className="studio-etl-table-wrap"><table><thead><tr><th>Pipeline</th><th>Last run / mulai</th><th>Durasi</th><th>Status</th><th>Output</th><th>Aksi</th></tr></thead><tbody>{filtered.map(job => <tr key={job.run_id} className={selectedRun === job.run_id ? 'is-selected' : ''}><td><strong>{job.pipeline_name}</strong><small>v{job.version} · {job.run_id}</small></td><td>{goodDate(job.started_at || job.created_at)}</td><td>{duration(job)}</td><td><span className={'studio-etl-status status-' + job.status.toLowerCase()}>{statusNames[job.status] || job.status}</span>{job.error_code && <small>{job.error_code}</small>}</td><td>{job.output_count ?? 0} output</td><td><button type="button" disabled={busy === job.run_id} onClick={() => void selectJob(job)}>Detail & hasil</button>{['QUEUED', 'RUNNING'].includes(job.status) && !job.cancel_requested && <button type="button" disabled={!!busy} onClick={() => void cancel(job.run_id)}>Batalkan</button>}</td></tr>)}</tbody></table></div>
    {detailError && <p role="alert" className="studio-etl-error">{detailError}</p>}
    {detail && <div className="studio-etl-detail"><div className="studio-etl-detail-heading"><div><strong>{detail.pipeline_name}</strong><small>Run ID: {detail.run_id} · versi {detail.version}</small></div><button type="button" onClick={() => { setSelectedRun(''); setDetail(null); setPipeline(null); }}>Tutup</button></div>
      <h3>Output batch</h3>{outputs.length ? outputs.map(output => <div className="studio-etl-output" key={output.output_node_id}><div><strong>{output.output_name}</strong><small>{output.row_count.toLocaleString('id-ID')} baris · Parquet</small></div>{output.output_version_id && onExplore && <button type="button" onClick={() => onExplore(output.output_version_id!)}>Lihat data ↗</button>}<details><summary>Kolom hasil</summary><div className="studio-etl-columns">{schemaColumns(output.schema_json).map(field => <span key={field.name}>{field.name} <small>{typeof field.type === 'string' ? field.type : JSON.stringify(field.type)}</small></span>)}</div></details></div>) : <p>Belum ada metadata output pada run ini.</p>}
    </div>}
  </section>;
}
