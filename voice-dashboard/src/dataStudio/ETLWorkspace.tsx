import { useEffect, useMemo, useState } from 'react';
import Pipelines from './Pipelines';
import JobMonitor from './JobMonitor';
import { pipelineApi, pipelineMessage, pipelineUuid } from './pipelineMetadata';
import type { PipelineDocument } from './pipelineMetadata';
import './etl-workspace.css';

type Section = 'overview' | 'canvas' | 'history' | 'lineage';
type SavedPipeline = {pipeline_id:string;pipeline_name:string;version:number;updated_at?:string};
type Job = {run_id:string;pipeline_id:string;version:number;status:string;created_at:string;started_at?:string|null;finished_at?:string|null;output_count?:number};
type PipelineDetail = SavedPipeline & {document:PipelineDocument};
const date = (v?:string|null) => v ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(v)?v:v+'Z').toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}) : '—';
const statuses:Record<string,string> = {SUCCEEDED:'Sukses',FAILED:'Gagal',RUNNING:'Berjalan',QUEUED:'Antrean',CANCELLED:'Dibatalkan'};
export default function ETLWorkspace({onExplore,onExploreSource,initialSection='overview'}:{onExplore?:(id:string)=>void;onExploreSource?:(id:string,isParquet:boolean)=>void;initialSection?:'overview'|'history'|'lineage'|'pipeline'}) {
 const [section,setSection] = useState<Section>(initialSection==='pipeline'?'overview':initialSection);
 const [items,setItems] = useState<SavedPipeline[]>([]);
 const [jobs,setJobs] = useState<Job[]>([]);
 const [selectedId,setSelectedId] = useState('');
 const [detail,setDetail] = useState<PipelineDetail|null>(null);
 const [filter,setFilter] = useState('');
 const [error,setError] = useState('');
 const [detailError,setDetailError] = useState('');
 const [catalogLoading,setCatalogLoading] = useState(true);
 const [detailLoading,setDetailLoading] = useState(false);
 const [jobsLoaded,setJobsLoaded] = useState(false);
 const [attempt,setAttempt] = useState(0);
 const [newCanvas,setNewCanvas] = useState(false);
 const [canvasOpened,setCanvasOpened] = useState(false);
 useEffect(()=>{ if(section==='canvas') setCanvasOpened(true); },[section]);
 useEffect(()=>{
   const controller = new AbortController();
   setCatalogLoading(true);setError('');
   Promise.allSettled([pipelineApi<SavedPipeline[]>('',undefined,controller.signal),pipelineApi<Job[]>('/jobs',undefined,controller.signal)])
    .then(([pipelines,runs])=>{
      if(controller.signal.aborted)return;
      const errors:string[]=[];
      if(pipelines.status==='fulfilled')setItems(pipelines.value);
      else errors.push(pipelineMessage(pipelines.reason));
      if(runs.status==='fulfilled'){setJobs(runs.value);setJobsLoaded(true);}
      else errors.push(pipelineMessage(runs.reason));
      setError(errors.join(' · '));
    })
    .catch(e=>{if(!controller.signal.aborted)setError(pipelineMessage(e));})
    .finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});
   return ()=>controller.abort();
 },[attempt]);
 useEffect(()=>{
   if (!selectedId) {setDetail(null);setDetailError('');setDetailLoading(false);return;}
   const controller = new AbortController();
   setDetail(null);setDetailError('');setDetailLoading(true);
   pipelineApi<PipelineDetail>('/'+pipelineUuid(selectedId),undefined,controller.signal)
     .then(d=>{if(!controller.signal.aborted)setDetail(d);})
     .catch(e=>{if(!controller.signal.aborted)setDetailError(pipelineMessage(e));})
     .finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
   return ()=>controller.abort();
 },[selectedId,attempt]);
 const scoped = useMemo(()=>jobs.filter(j=>j.pipeline_id.toLowerCase()===selectedId.toLowerCase()).sort((a,b)=>b.created_at.localeCompare(a.created_at)),[jobs,selectedId]);
 const recent = scoped[0];
 const success = scoped.filter(j=>j.status==='SUCCEEDED').length;
 const failure = scoped.filter(j=>j.status==='FAILED').length;
 const current = items.find(p=>p.pipeline_id===selectedId);
 const nodes = detail?.document.nodes ?? [];
 const sourceCount = nodes.filter(n=>n.data.label==='Input Dataset'||n.data.label==='Fixed Input').length;
 const stepCount = nodes.filter(n=>!['Input Dataset','Fixed Input','Output Dataset'].includes(n.data.label)).length;
 const outputCount = nodes.filter(n=>n.data.label==='Output Dataset').length;
 function selectPipeline(p:SavedPipeline){setNewCanvas(false);if(selectedId!==p.pipeline_id){setDetail(null);setDetailError('');setDetailLoading(true);}setSelectedId(p.pipeline_id);setSection('overview');}
 function refresh(){setCatalogLoading(true);if(selectedId)setDetailLoading(true);setAttempt(v=>v+1);}
 const loading = catalogLoading||detailLoading;
 const list = items.filter(p=>p.pipeline_name.toLowerCase().includes(filter.toLowerCase()));
 return <div className="studio-etl-unified studio-etl-detail-page">
   {!selectedId && !newCanvas ? <section className="studio-etl-landing">
     <div className="studio-etl-hero"><div><span className="studio-etl-kicker">DATA STUDIO / TRANSFORM DATA</span><h2>ETL & Pipelines</h2><p>Pilih pipeline untuk membuka overview, riwayat eksekusi, lineage, atau dataflow.</p></div><button type="button" onClick={()=>{setNewCanvas(true);setSection('canvas');}}>＋ Pipeline baru</button></div>
     <div className="studio-etl-catalog-bar"><input aria-label="Cari pipeline" placeholder="Cari pipeline…" value={filter} onChange={e=>setFilter(e.target.value)}/><button type="button" disabled={loading} onClick={refresh}>↻ Perbarui</button></div>
     {error && <p role="alert" className="studio-etl-error">{error}</p>}
     {catalogLoading ? <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true"/><strong>Memuat katalog pipeline…</strong><span>Menunggu daftar pipeline dan riwayat run selesai dimuat.</span></div> : <div className="studio-etl-catalog">{list.map(p=>{const history=jobs.filter(j=>j.pipeline_id.toLowerCase()===p.pipeline_id.toLowerCase()).sort((a,b)=>b.created_at.localeCompare(a.created_at));const last=history[0];return <button type="button" className="studio-etl-catalog-item" key={p.pipeline_id} onClick={()=>selectPipeline(p)}><span className="studio-etl-catalog-icon">◇</span><span className="studio-etl-catalog-main"><strong>{p.pipeline_name}</strong><small>Versi {p.version} · Diperbarui {date(p.updated_at)}</small></span><span className="studio-etl-catalog-meta"><small>Last run</small><strong>{!jobsLoaded?'—':last?date(last.started_at||last.created_at):'Belum ada'}</strong></span><span className={'studio-etl-status status-'+(last?.status||'none').toLowerCase()}>{!jobsLoaded?'—':last?statuses[last.status]||last.status:'Belum dijalankan'}</span><span aria-hidden="true">→</span></button>})}</div>}
     {!catalogLoading&&!error&&!items.length&&<p>Belum ada pipeline tersimpan. Buat pipeline pertama melalui tombol Pipeline baru.</p>}
   </section> : <>
     <header className="studio-etl-detail-header"><button type="button" onClick={()=>{setSelectedId('');setNewCanvas(false);setSection('overview');}}>← Semua pipeline</button><div><span className="studio-etl-kicker">ETL / PIPELINE DETAIL</span><h2>{newCanvas?'Pipeline baru':current?.pipeline_name||detail?.pipeline_name||'Memuat pipeline…'}</h2><small>{newCanvas?'Rancangan baru':`Versi ${detail?.version||current?.version||'—'} · ${selectedId}`}</small></div><button type="button" disabled={loading} onClick={refresh}>↻ Refresh</button></header>
     <nav className="studio-etl-nav" aria-label="Detail pipeline">
      {(['overview','canvas','history','lineage'] as const).map(tab=><button type="button" key={tab} className={section===tab?'is-active':''} onClick={()=>setSection(tab)} disabled={newCanvas&&tab!=='canvas'}>{({overview:'Overview',canvas:'DataFlow / Canvas',history:'Runs & History',lineage:'Lineage'})[tab]}</button>)}
     </nav>
     {section==='overview'&&!newCanvas&&<section className="studio-etl-overview">
       {error&&<p role="alert" className="studio-etl-error">{error}</p>}
       {detailError&&<p role="alert" className="studio-etl-error">{detailError}</p>}
       {loading ? <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true"/><strong>Memuat overview pipeline…</strong><span>Menunggu katalog, riwayat run, dan detail pipeline selesai dimuat.</span></div> : <>
       <div className="studio-etl-overview-metrics"><div><small>Last run</small><strong>{date(recent?.started_at||recent?.created_at)}</strong><span className={'studio-etl-status status-'+(recent?.status||'none').toLowerCase()}>{!jobsLoaded?'—':recent?statuses[recent.status]||recent.status:'Belum dijalankan'}</span></div><div><small>Total runs (maks. 100 terbaru)</small><strong>{jobsLoaded?scoped.length:'—'}</strong></div><div><small>Berhasil</small><strong>{jobsLoaded?success:'—'}</strong></div><div><small>Gagal</small><strong>{jobsLoaded?failure:'—'}</strong></div></div>
       <div className="studio-etl-overview-grid"><article><h3>Dataflow summary</h3><div className="studio-etl-mini-flow"><div><b>{detail?sourceCount:'—'}</b><small>Source</small></div><span>→</span><div><b>{detail?stepCount:'—'}</b><small>Transform</small></div><span>→</span><div><b>{detail?outputCount:'—'}</b><small>Output</small></div></div><p>Ringkasan graph pipeline versi tersimpan.</p><button type="button" onClick={()=>setSection('canvas')}>Buka DataFlow →</button></article><article><h3>Aktivitas terakhir</h3>{recent?<><p><span className={'studio-etl-status status-'+recent.status.toLowerCase()}>{statuses[recent.status]||recent.status}</span> · {date(recent.created_at)}</p><p>{recent.output_count??0} output · versi {recent.version}</p></>:<p>{jobsLoaded?'Belum ada run pipeline ini.':'Riwayat run tidak tersedia.'}</p>}<button type="button" onClick={()=>setSection('history')}>Lihat riwayat →</button></article><article><h3>Lineage terbaru</h3><p>{detail?sourceCount:'—'} sumber → {detail?stepCount:'—'} proses → {detail?outputCount:'—'} output</p><p>Berdasarkan graph versi {detail?.version||current?.version||'—'}; output run terbaru dapat dilihat pada tab Lineage.</p><button type="button" onClick={()=>setSection('lineage')}>Lihat lineage →</button></article></div>
       </>}
     </section>}
     {/* Canvas stays mounted after first opening to retain an unsaved draft across tab changes. */}
     {(canvasOpened||section==='canvas'||newCanvas) && <div hidden={section!=='canvas'}><Pipelines key={newCanvas?'new':selectedId} startNew={newCanvas} initialPipelineId={newCanvas?undefined:selectedId} onPipelineSaved={(id)=>{setSelectedId(id);setNewCanvas(false);setAttempt(v=>v+1);}} /></div>}
     {section==='history'&&!newCanvas&&<JobMonitor key={'history-'+selectedId} pipelineId={selectedId} view="history" onExplore={onExplore} />}
     {section==='lineage'&&!newCanvas&&<JobMonitor key={'lineage-'+selectedId} pipelineId={selectedId} view="lineage" onExplore={onExplore} onExploreSource={onExploreSource} onOpenCanvas={()=>setSection('canvas')} />}
   </>}
 </div>;
}
