import { UniverseHeader, UniverseTabs, UniverseCatalogHeader, UniverseCatalogSplit, UniverseCatalogEntry, UniverseCatalogInspector, UniverseInspectorDetails } from '../design-system/components/universe';
import { useEffect, useMemo, useState } from 'react';
import Pipelines from './Pipelines';
import JobMonitor from './JobMonitor';
import { pipelineApi, pipelineMessage, pipelineUuid } from './pipelineMetadata';
import type { PipelineDocument } from './pipelineMetadata';
import './etl-workspace.css';
import Scheduler from './Scheduler';
import type { ScheduleTarget } from './Scheduler';
import SchedulerClockMenu, {useScheduleIndex} from './SchedulerClockMenu';
import CompactCatalogFilters from './CompactCatalogFilters';
import './datasets-scheduler.css';
import './etl-catalog-minimal-actions.css';

type Section = 'overview' | 'canvas' | 'history' | 'lineage';
type SavedPipeline = {pipeline_id:string;pipeline_name:string;version:number;updated_at?:string};
type Job = {run_id:string;pipeline_id:string;version:number;status:string;created_at:string;started_at?:string|null;finished_at?:string|null;output_count?:number};
type PipelineDetail = SavedPipeline & {document:PipelineDocument};
const date = (v?:string|null) => v ? new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(v)?v:v+'Z').toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}) : '—';
const statuses:Record<string,string> = {SUCCEEDED:'Sukses',FAILED:'Gagal',RUNNING:'Berjalan',QUEUED:'Antrean',CANCELLED:'Dibatalkan'};
export default function ETLWorkspace({onExplore,onExploreSource,initialSection='overview',onSchedulerDetails}:{onExplore?:(id:string)=>void;onExploreSource?:(id:string,isParquet:boolean)=>void;initialSection?:'overview'|'history'|'lineage'|'pipeline';onSchedulerDetails?:(target:ScheduleTarget)=>void}) {
 const [section,setSection] = useState<Section>(initialSection==='pipeline'?'overview':initialSection);
 const [items,setItems] = useState<SavedPipeline[]>([]);
 const [jobs,setJobs] = useState<Job[]>([]);
 const [selectedId,setSelectedId] = useState('');
 const [previewId,setPreviewId] = useState('');
 const [detail,setDetail] = useState<PipelineDetail|null>(null);
 const [filter,setFilter] = useState('');
 const [statusFilter,setStatusFilter]=useState('');
 const [versionFilter,setVersionFilter]=useState('');
 const [updatedFilter,setUpdatedFilter]=useState('');
 const [lastFilter,setLastFilter]=useState('');
 const [scheduleTarget,setScheduleTarget]=useState<ScheduleTarget|null>(null);
 const [scheduleRevision,setScheduleRevision]=useState(0);
 const {items:schedules}=useScheduleIndex(scheduleRevision);
 const [runBusy,setRunBusy]=useState(false);
 const [runNotice,setRunNotice]=useState('');

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
 const lastJob=(id:string)=>jobs.filter(j=>j.pipeline_id.toLowerCase()===id.toLowerCase()).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
 const list = items.filter(p=>{
   if(!p.pipeline_name.toLowerCase().includes(filter.toLowerCase()))return false;
   const last=lastJob(p.pipeline_id);
   if(statusFilter && (last?.status||'NEVER')!==statusFilter)return false;
   if(versionFilter && String(p.version)!==versionFilter)return false;
   if(updatedFilter && (!p.updated_at||new Date(p.updated_at).getTime()<Date.now()-Number(updatedFilter)*86400000))return false;
   if(lastFilter==='never'&&last)return false;
   if(lastFilter==='ever'&&!last)return false;
   if(lastFilter==='7d'&&(!last||new Date(last.started_at||last.created_at).getTime()<Date.now()-7*86400000))return false;
   return true;
 });
 const filterOptions=[
   {id:'status',label:'Status',value:statusFilter,onChange:setStatusFilter,options:[{value:'SUCCEEDED',label:'Sukses'},{value:'FAILED',label:'Gagal'},{value:'RUNNING',label:'Berjalan'},{value:'QUEUED',label:'Antrean'},{value:'NEVER',label:'Never run'}]},
   {id:'version',label:'Versi',value:versionFilter,onChange:setVersionFilter,options:Array.from(new Set(items.map(p=>String(p.version)))).sort((a,b)=>Number(b)-Number(a)).map(v=>({value:v,label:'v'+v}))},
   {id:'last',label:'Last run',value:lastFilter,onChange:setLastFilter,options:[{value:'ever',label:'Pernah run'},{value:'never',label:'Never run'},{value:'7d',label:'7 hari terakhir'}]},
   {id:'updated',label:'Updated date',value:updatedFilter,onChange:setUpdatedFilter,options:[{value:'7',label:'7 hari terakhir'},{value:'30',label:'30 hari terakhir'}]}
 ];
 const preview = items.find(p=>p.pipeline_id===previewId);
 const previewRun = preview ? lastJob(preview.pipeline_id) : undefined;
 function requestId(){const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
 async function runPipeline(p:SavedPipeline){if(runBusy)return;setRunBusy(true);setRunNotice('');try{await pipelineApi(`/${pipelineUuid(p.pipeline_id)}/runs`,{version:p.version,request_id:requestId()});setRunNotice(`Pipeline ${p.pipeline_name} v${p.version} masuk antrean.`);refresh();}catch(e){setRunNotice(pipelineMessage(e));}finally{setRunBusy(false);}}

 return <div className="studio-etl-unified studio-etl-detail-page">

   {!selectedId && !newCanvas ? <section className="studio-etl-landing">
     <UniverseCatalogHeader title="ETL & Pipelines" count={catalogLoading ? '—' : items.length} hint="Katalog pipeline" actions={<><button type="button" disabled={loading} className="universe-refresh-icon u-dataset-action" onClick={refresh} aria-label="Muat ulang" data-tooltip="Muat ulang">↻</button><button type="button" className="u-dataset-action is-primary" onClick={()=>{setNewCanvas(true);setSection('canvas');}}>+ Pipeline baru</button></>}/>
     <CompactCatalogFilters query={filter} onQuery={setFilter} placeholder="Cari pipeline…" filters={filterOptions}/>
     {runNotice&&<p role="status" className="ca-scheduler-message">{runNotice}</p>}
     {error && <p role="alert" className="studio-etl-error">{error}</p>}
     {catalogLoading ? <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true"/><strong>Memuat katalog pipeline…</strong><span>Menunggu daftar pipeline dan riwayat run selesai dimuat.</span></div> : <UniverseCatalogSplit list={list.map(p=>{const last=lastJob(p.pipeline_id);const target:ScheduleTarget={type:'PIPELINE',id:p.pipeline_id,name:p.pipeline_name};return <div key={p.pipeline_id} className="u-dataset-entry-shell u-etl-entry-shell">
       <UniverseCatalogEntry mark="◇" title={p.pipeline_name} subtitle={`Versi ${p.version} · Diperbarui ${date(p.updated_at)}`}
         metadata={[{label:'Last run',value:!jobsLoaded?'—':last?date(last.started_at||last.created_at):'Never run'}]}
         badge={<span className={'u-etl-status-icon status-'+(last?.status||'none').toLowerCase()} role="img" aria-label={!jobsLoaded?'Status belum dimuat':last?statuses[last.status]||last.status:'Belum dijalankan'} title={!jobsLoaded?'Status belum dimuat':last?statuses[last.status]||last.status:'Belum dijalankan'}>{!jobsLoaded?'·':last?.status==='SUCCEEDED'?'✓':last?.status==='FAILED'?'×':last?.status==='RUNNING'?'◷':last?.status==='QUEUED'?'…':last?.status==='CANCELLED'?'−':'·'}</span>}
         selected={previewId===p.pipeline_id} onClick={()=>setPreviewId(p.pipeline_id)} onDoubleClick={()=>selectPipeline(p)}/>
       <div className="u-dataset-entry-tools"><SchedulerClockMenu target={target} schedule={schedules.find(s=>s.target_type==='PIPELINE'&&s.target_id.toLowerCase()===p.pipeline_id.toLowerCase())} lastRun={last?(last.started_at||last.created_at):null} disabled={runBusy} onRun={()=>void runPipeline(p)} onSchedule={()=>setScheduleTarget(target)} onDetails={()=>onSchedulerDetails?.(target)} onChange={()=>setScheduleRevision(v=>v+1)}/></div>
     </div>})} inspector={<UniverseCatalogInspector emptyHeading="Explore your pipelines" emptyDescription="Pilih pipeline di sebelah kiri untuk melihat ringkasan dan membuka overview, DataFlow, atau riwayat eksekusi.">
       {preview && <UniverseInspectorDetails eyebrow="DATA INTELLIGENCE / PIPELINE" title={preview.pipeline_name} subtitle={`Pipeline versi ${preview.version}`}
         fields={[{label:'LAST RUN',value:date(previewRun?.started_at||previewRun?.created_at)},{label:'STATUS',value:previewRun?(statuses[previewRun.status]||previewRun.status):'Never run'},{label:'LAST UPDATED',value:date(preview.updated_at)},{label:'VERSION',value:`v${preview.version}`} ]}
         actions={<><button type="button" className="u-dataset-action is-primary" onClick={()=>selectPipeline(preview)}>Buka Pipeline ↗</button><button type="button" className="u-dataset-action is-run" disabled={runBusy} onClick={()=>void runPipeline(preview)}>Run now</button><button type="button" className="u-dataset-action" onClick={()=>setScheduleTarget({type:'PIPELINE',id:preview.pipeline_id,name:preview.pipeline_name})}>Edit schedule</button></>}/>} 
     </UniverseCatalogInspector>}/>} 
     {!catalogLoading&&!error&&!items.length&&<p>Belum ada pipeline tersimpan. Buat pipeline pertama melalui tombol Pipeline baru.</p>}
   </section> : <>
     <UniverseHeader className="studio-etl-detail-header"><button type="button" onClick={()=>{setSelectedId('');setNewCanvas(false);setSection('overview');}}>← Semua pipeline</button><div><span className="studio-etl-kicker">ETL / PIPELINE DETAIL</span><h2>{newCanvas?'Pipeline baru':current?.pipeline_name||detail?.pipeline_name||'Memuat pipeline…'}</h2><small>{newCanvas?'Rancangan baru':`Versi ${detail?.version||current?.version||'—'} · ${selectedId}`}</small></div><div className="ca-scheduler-actions"><button type="button" disabled={loading} onClick={refresh} className="universe-refresh-icon" aria-label="Muat ulang" data-tooltip="Muat ulang">↻</button></div></UniverseHeader>
     <UniverseTabs className="studio-etl-nav" aria-label="Detail pipeline">
      {(['overview','canvas','history','lineage'] as const).map(tab=><button type="button" key={tab} className={section===tab?'is-active':''} onClick={()=>setSection(tab)} disabled={newCanvas&&tab!=='canvas'}>{({overview:'Overview',canvas:'DataFlow / Canvas',history:'Runs & History',lineage:'Lineage'})[tab]}</button>)}
     </UniverseTabs>
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
 {scheduleTarget&&<div className="datasets-schedule-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setScheduleTarget(null);}}><div className="datasets-schedule-dialog" role="dialog" aria-modal="true" aria-label={`Jadwal ${scheduleTarget.name}`}><Scheduler key={scheduleTarget.id} target={scheduleTarget} onClose={()=>setScheduleTarget(null)} onSaved={()=>setScheduleRevision(v=>v+1)}/></div></div>}
 </div>;
}
