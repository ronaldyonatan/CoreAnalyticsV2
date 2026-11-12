import { useEffect, useState } from 'react';
import { loadDatasetCatalog } from './datasetCatalog';
import { pipelineApi } from './pipelineMetadata';
import './scheduler.css';

type Frequency = 'INTERVAL' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type Target = 'STORED' | 'PIPELINE';
export type ScheduleTarget = { type: Target; id: string; name: string };
export type Schedule = {
  schedule_id: string; schedule_name: string; target_type: Target; target_id: string;
  target_name?: string; pipeline_version: number|null; frequency: Frequency;
  interval_minutes: number|null; time_of_day: string|null; week_day: number|null;
  month_day: number|null; week_days_mask?:number|null; repeat_minutes?:number|null; enabled: boolean; next_run_at?: string|null; last_run_at?: string|null;
};
type History = {event_id:string;schedule_id:string;schedule_name:string;target_name?:string;scheduled_at:string;status:string;result:string;attempt:number;run_id?:string|null;error_code?:string|null;finished_at?:string|null};
type Dataset = {dataset_id:string;dataset_name:string;access_mode:string};
type Pipeline = {pipeline_id:string;pipeline_name:string;version:number};
type Form = {
  schedule_id:string|null;schedule_name:string;target_type:Target;target_id:string;pipeline_version:number|null;
  frequency:Frequency;interval_minutes:number|null;time_of_day:string|null;week_day:number|null;month_day:number|null;week_days_mask:number|null;repeat_minutes:number|null;enabled:boolean;
};
const defaults = ():Form => ({schedule_id:null,schedule_name:'',target_type:'STORED',target_id:'',pipeline_version:null,
  frequency:'DAILY',interval_minutes:null,time_of_day:'07:00',week_day:null,month_day:null,week_days_mask:null,repeat_minutes:null,enabled:true});
/** Keep API-only fields out of POST Save (the backend rejects unexpected keys). */
function toForm(s:Schedule):Form {
  return {schedule_id:s.schedule_id,schedule_name:s.schedule_name,target_type:s.target_type,target_id:s.target_id,
    pipeline_version:s.pipeline_version,frequency:s.frequency,interval_minutes:s.interval_minutes,
    time_of_day:s.time_of_day,week_day:null,month_day:s.month_day,
    week_days_mask:s.frequency==='WEEKLY'?(s.week_days_mask??(1<<((s.week_day||1)-1))):null,
    repeat_minutes:s.repeat_minutes??null,enabled:Boolean(s.enabled)};
}
const days=['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
const statusNames: Record<string,string>={QUEUED:'Antrean',RUNNING:'Berjalan',SUCCEEDED:'Sukses',FAILED:'Gagal',SKIPPED_BUSY:'Dilewati: masih berjalan',SKIPPED_INVALID:'Dinonaktifkan: target tidak valid',CANCELLED:'Dibatalkan'};
function date(utc?: string|null) {
  if (!utc) return '—';
  const d=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(utc)?utc:utc+'Z');
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'});
}
function displayFrequency(s:Schedule) {
  if (s.frequency==='INTERVAL') return `Setiap ${s.interval_minutes} menit`;
  if (s.frequency==='DAILY') return `Harian · ${s.time_of_day} WIB${s.repeat_minutes?` · tiap ${s.repeat_minutes%60===0?`${s.repeat_minutes/60} jam`:`${s.repeat_minutes} menit`}`:''}`;
  if (s.frequency==='WEEKLY') return `${days.filter((_,i)=>((s.week_days_mask??(1<<((s.week_day||1)-1)))&(1<<i))!==0).map(d=>d.slice(0,3)).join(', ')} · ${s.time_of_day} WIB`;
  return `Tanggal ${s.month_day} · ${s.time_of_day} WIB`;
}
export async function schedulerApi<T>(path:string, body?:unknown,signal?:AbortSignal):Promise<T> {
  const csrf=document.cookie.split('; ').find(c=>c.startsWith('core_csrf='));
  const response=await fetch('/voice-api/api/studio/scheduler'+path,{credentials:'include',cache:'no-store',
    method:body===undefined?'GET':'POST',signal,headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf?decodeURIComponent(csrf.slice(10)):''},
    body:body===undefined?undefined:JSON.stringify(body)});
  let result;
  try {result=await response.json();} catch {throw Error('SCHEDULER_RESPONSE_INVALID');}
  if (!response.ok || result.success!==true) throw Error(result.code||'SCHEDULER_METADATA_UNAVAILABLE');
  return result.data as T;
}

export default function Scheduler({target,focusTarget,onClose,onSaved,onPreviewDataset}:{target?:ScheduleTarget;focusTarget?:ScheduleTarget|null;onClose?:()=>void;onSaved?:()=>void;onPreviewDataset?:(id:string,parquet:boolean)=>void}) {
  const [schedules,setSchedules]=useState<Schedule[]>([]);
  const [history,setHistory]=useState<History[]>([]);
  const [datasets,setDatasets]=useState<Dataset[]>([]);
  const [pipelines,setPipelines]=useState<Pipeline[]>([]);
  const [allDatasets,setAllDatasets]=useState<import('./datasetCatalog').CatalogDataset[]>([]);
  const [showAll,setShowAll]=useState(false);
  const [repeatUnit,setRepeatUnit]=useState<'hours'|'minutes'>('hours');
  const [form,setForm]=useState<Form>(()=>({...defaults(),target_type:target?.type||'STORED',target_id:target?.id||'',schedule_name:target?`${target.type==='PIPELINE'?'Jalankan':'Refresh'} ${target.name}`:''}));
  const [showForm,setShowForm]=useState(Boolean(target));
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');
    Promise.allSettled([
      schedulerApi<Schedule[]>('',undefined,controller.signal),
      schedulerApi<History[]>('/history',undefined,controller.signal),
      loadDatasetCatalog(controller.signal),
      pipelineApi<Pipeline[]>('',undefined,controller.signal),
    ]).then(([list,logs,ds,ps])=>{
      if(controller.signal.aborted)return;
      if(list.status==='fulfilled')setSchedules(list.value);
      else setError(list.reason instanceof Error?list.reason.message:'SCHEDULER_METADATA_UNAVAILABLE');
      if(target && list.status==='fulfilled') {
        const existing=list.value.find(item=>item.target_type===target.type && item.target_id.toLowerCase()===target.id.toLowerCase());
        if(existing) { setForm(toForm(existing));setRepeatUnit(existing.repeat_minutes&&existing.repeat_minutes%60!==0?'minutes':'hours'); }
        else {
          const matched=ps.status==='fulfilled' && target.type==='PIPELINE' ? ps.value.find(item=>item.pipeline_id.toLowerCase()===target.id.toLowerCase()):undefined;
          setForm({...defaults(),target_type:target.type,target_id:target.id,schedule_name:`${target.type==='PIPELINE'?'Jalankan':'Refresh'} ${target.name}`,pipeline_version:matched?.version??null});
        }
      }
      if(logs.status==='fulfilled')setHistory(logs.value);
      if(ds.status==='fulfilled'){setDatasets(ds.value.items.filter(item=>item.access_mode==='STORED') as Dataset[]);setAllDatasets(ds.value.items);}
      if(ps.status==='fulfilled')setPipelines(ps.value);
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[reload,target?.id,target?.type]);
  const choices=form.target_type==='STORED'
    ? datasets.map(d=>({id:d.dataset_id,name:d.dataset_name,version:null}))
    : pipelines.map(p=>({id:p.pipeline_id,name:p.pipeline_name,version:p.version}));
  const selected=choices.find(c=>c.id.toLowerCase()===form.target_id.toLowerCase());
  function change<K extends keyof Form>(key:K,value:Form[K]){setForm(current=>({...current,[key]:value}));}
  function updateFrequency(value:Frequency){setForm(current=>({...current,frequency:value,interval_minutes:value==='INTERVAL'?60:null,
    time_of_day:value==='INTERVAL'?null:(current.time_of_day||'07:00'),week_day:null,week_days_mask:value==='WEEKLY'?1:null,
    repeat_minutes:null,month_day:value==='MONTHLY'?1:null}));}
  function selectWeekDay(index:number){setForm(current=>{
    const mask=(current.week_days_mask??(1<<((current.week_day||1)-1)))^(1<<index);
    return mask===0?current:{...current,week_day:null,week_days_mask:mask};
  });}

  function start(){setForm(defaults());setShowForm(true);setNotice('');setError('');}
  function closeEditor(){if(target)onClose?.();else setShowForm(false);}
  function edit(item:Schedule){setForm(toForm(item));setRepeatUnit(item.repeat_minutes&&item.repeat_minutes%60!==0?'minutes':'hours');setShowForm(true);setNotice('');setError('');}
  async function save(){
    if(!form.schedule_name.trim()||!form.target_id)return;
    setBusy(true);setError('');setNotice('');
    try {
      await schedulerApi('',{...form,week_day:null,pipeline_version:form.target_type==='PIPELINE'?(form.pipeline_version??selected?.version??null):null});
      setNotice('Jadwal tersimpan. Scheduler service akan mengantrekan job pada waktu yang ditentukan.');
      if(target){onSaved?.();onClose?.();}else{setShowForm(false);setReload(n=>n+1);}
    } catch(e){setError(e instanceof Error?e.message:'SCHEDULER_SAVE_FAILED');} finally{setBusy(false);}
  }
  async function toggle(s:Schedule){
    setBusy(true);setError('');setNotice('');
    try{await schedulerApi('/'+s.schedule_id+'/toggle',{enabled:!s.enabled});setNotice(s.enabled?'Jadwal dijeda.':'Jadwal diaktifkan.');setReload(n=>n+1);}
    catch(e){setError(e instanceof Error?e.message:'SCHEDULER_UPDATE_FAILED');}finally{setBusy(false);}
  }
  return <section className={`ca-scheduler${target?' ca-scheduler-embedded':''}`} aria-label="Unified Scheduler">
    {!target && <header className="ca-scheduler-top"><div><span className="studio-etl-kicker">DATA STUDIO / AUTOMATION</span><h2>Scheduler</h2><p>Jadwalkan Refresh STORED Dataset dan ETL Pipeline. Semua waktu menggunakan WIB (Asia/Jakarta).</p></div>
      <div className="ca-scheduler-actions"><button type="button" disabled={busy||loading} onClick={()=>setReload(v=>v+1)}>↻ Muat ulang</button><button type="button" className="ca-scheduler-primary" disabled={busy} onClick={start}>＋ Jadwal baru</button></div>
    </header>}
    {error&&<p className="ca-scheduler-message" role="alert">{error}</p>}
    {notice&&<p className="ca-scheduler-message" role="status">{notice}</p>}
    {showForm&&<div className="ca-scheduler-form" role="group" aria-label="Pengaturan jadwal">
      <div className="ca-scheduler-form-heading"><h3>{form.schedule_id?'Edit jadwal':'Jadwal baru'}</h3><button type="button" disabled={busy} onClick={closeEditor}>Tutup</button></div>
      <div className="ca-scheduler-fields">
        <label>Nama jadwal<input maxLength={150} value={form.schedule_name} placeholder="Contoh: Finance setiap pagi" onChange={e=>change('schedule_name',e.target.value)}/></label>
        {!target && <label>Jenis pekerjaan<select value={form.target_type} disabled={Boolean(form.schedule_id)} onChange={e=>setForm({...defaults(),schedule_name:form.schedule_name,target_type:e.target.value as Target})}><option value="STORED">Refresh STORED Dataset</option><option value="PIPELINE">Jalankan ETL Pipeline</option></select></label>}
        {!target && <label>Target<select value={form.target_id} disabled={Boolean(form.schedule_id)} onChange={e=>{const found=choices.find(c=>c.id===e.target.value);const prior=schedules.find(item=>item.target_type===form.target_type && item.target_id.toLowerCase()===e.target.value.toLowerCase());if(prior){setForm(toForm(prior));}else{setForm(p=>({...p,schedule_id:null,target_id:e.target.value,pipeline_version:found?.version??null}));}}}><option value="">Pilih target…</option>{choices.map(c=><option key={c.id} value={c.id}>{c.name}{c.version?` · v${c.version}`:''}</option>)}</select></label>}
        {target && <div className="ca-scheduler-target"><strong>{target.name}</strong><small>{target.type==='PIPELINE'?'Jalankan pipeline ETL (seluruh output menggunakan jadwal yang sama)':'Refresh dataset sumber ke Parquet'}</small></div>}
        <label>Frekuensi<select value={form.frequency} onChange={e=>updateFrequency(e.target.value as Frequency)}><option value="INTERVAL">Interval</option><option value="DAILY">Harian</option><option value="WEEKLY">Mingguan</option><option value="MONTHLY">Bulanan</option></select></label>
        {form.frequency==='INTERVAL'?<label>Interval (menit)<input type="number" min={5} max={10080} value={form.interval_minutes??60} onChange={e=>change('interval_minutes',Number(e.target.value))}/></label>:<label>Jam (WIB)<input type="time" value={form.time_of_day||'07:00'} onChange={e=>change('time_of_day',e.target.value)}/></label>}
        {form.frequency==='WEEKLY'&&<fieldset className="ca-weekdays"><legend>Jadwal mingguan — pilih beberapa hari</legend><div className="ca-weekday-grid">{days.map((day,i)=><label key={day} className={((form.week_days_mask??1)&(1<<i))?'is-active':''}><input type="checkbox" checked={Boolean((form.week_days_mask??1)&(1<<i))} onChange={()=>selectWeekDay(i)}/>{day.slice(0,3)}</label>)}</div><small>Minimal satu hari dipilih. Waktu berlaku untuk setiap hari yang dipilih.</small></fieldset>}
        {form.frequency==='DAILY'&&<fieldset className="ca-repeat-daily"><legend>Pengulangan dalam satu hari (opsional)</legend><label className="ca-scheduler-check"><input type="checkbox" checked={form.repeat_minutes!==null} onChange={e=>change('repeat_minutes',e.target.checked?60:null)}/> Ulangi beberapa kali setiap hari</label>{form.repeat_minutes!==null&&<div className="ca-repeat-line"><span>Setiap</span><input type="number" min={repeatUnit==='hours'?1:5} max={repeatUnit==='hours'?24:1440} step={1} value={repeatUnit==='hours'?form.repeat_minutes/60:form.repeat_minutes} onChange={e=>{const v=Number(e.target.value);change('repeat_minutes',repeatUnit==='hours'?v*60:v);}}/><select aria-label="Satuan pengulangan" value={repeatUnit} onChange={e=>{const unit=e.target.value as 'hours'|'minutes';setRepeatUnit(unit);change('repeat_minutes',unit==='hours'?60:30);}}><option value="hours">jam</option><option value="minutes">menit</option></select></div>}<small>Dimulai pukul {form.time_of_day||'07:00'} WIB, diulang sampai akhir hari; hari berikutnya dimulai dari jam yang sama. Minimal 5 menit.</small></fieldset>}
        {form.frequency==='MONTHLY'&&<label>Tanggal<select value={form.month_day||1} onChange={e=>change('month_day',Number(e.target.value))}>{Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select><small>Jika tanggal tidak ada, gunakan hari terakhir bulan.</small></label>}
        <label className="ca-scheduler-check"><input type="checkbox" checked={form.enabled} onChange={e=>change('enabled',e.target.checked)}/> Aktifkan jadwal</label>
      </div>
      <div className="ca-scheduler-form-actions"><button type="button" disabled={busy} onClick={closeEditor}>Batal</button><button type="button" className="ca-scheduler-primary" disabled={busy||loading||Boolean(error)||!form.schedule_name.trim()||!form.target_id||(form.target_type==='PIPELINE'&&!form.pipeline_version)} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan jadwal'}</button></div>
      {target?.type==='PIPELINE'&&!form.pipeline_version&&!loading&&<p className="ca-scheduler-message" role="alert">Pipeline tidak ditemukan atau belum memiliki versi tersimpan yang bisa dijalankan.</p>}
      <p className="ca-scheduler-note">Pipeline menggunakan versi tersimpan; seluruh output ETL mengikuti satu jadwal pipeline. Waktu WIB (UTC+07:00). Job dijalankan oleh worker, bukan browser.</p>
    </div>}
    {!target && focusTarget && <div className="ca-scheduler-focus ca-scheduler-section">
      <div className="ca-scheduler-focus-head"><div><span className="studio-etl-kicker">DETAILS / {focusTarget.type==='PIPELINE'?'ETL PIPELINE':'STORED DATASET'}</span><h3>{focusTarget.name}</h3><small>Hanya jadwal dan riwayat milik target ini; tidak ada jadwal terpisah untuk output pipeline.</small></div><button type="button" onClick={()=>setShowAll(value=>!value)}>{showAll?'Tampilkan target saja':'Lihat semua jadwal'}</button></div>
      {(()=>{const related=schedules.find(item=>item.target_type===focusTarget.type&&item.target_id.toLowerCase()===focusTarget.id.toLowerCase());const logs=history.filter(item=>item.schedule_id===related?.schedule_id);
        const previews=allDatasets.filter(item=>focusTarget.type==='STORED'?item.dataset_id.toLowerCase()===focusTarget.id.toLowerCase():item.access_mode==='PARQUET'&&item.pipeline_id?.toLowerCase()===focusTarget.id.toLowerCase());
        return <><div className="ca-scheduler-focus-stats"><div><small>Status jadwal</small><strong>{related?(related.enabled?'Aktif':'Dijeda'):'Belum dijadwalkan'}</strong></div><div><small>Last scheduled run</small><strong>{related?.last_run_at?date(related.last_run_at):'Never run'}</strong></div><div><small>Next run</small><strong>{related?.enabled?date(related.next_run_at):'—'}</strong></div></div>
          <div className="ca-scheduler-focus-actions"><button type="button" onClick={()=>{if(related)edit(related);else{const matched=pipelines.find(item=>item.pipeline_id.toLowerCase()===focusTarget.id.toLowerCase());setForm({...defaults(),target_type:focusTarget.type,target_id:focusTarget.id,schedule_name:`${focusTarget.type==='PIPELINE'?'Jalankan':'Refresh'} ${focusTarget.name}`,pipeline_version:matched?.version??null});setShowForm(true);}}}>{related?'Edit jadwal':'Set schedule'}</button>{previews.map(item=><button key={item.dataset_id} type="button" onClick={()=>onPreviewDataset?.(item.dataset_id,item.access_mode==='PARQUET')} disabled={!onPreviewDataset||item.storage_status!=='READY'}>Preview: {item.dataset_name} ↗</button>)}</div>
          <h4>Riwayat scheduler untuk target ini</h4>{logs.length?<div className="ca-scheduler-table-wrap"><table><thead><tr><th>Waktu</th><th>Status</th><th>Run ID</th></tr></thead><tbody>{logs.map(h=><tr key={h.event_id}><td>{date(h.scheduled_at)}</td><td>{statusNames[h.status]||h.status}</td><td><small>{h.run_id||'—'}</small></td></tr>)}</tbody></table></div>:<p>Belum ada eksekusi otomatis. Riwayat Run Now ditampilkan melalui halaman detail Dataset atau ETL.</p>}</>;
      })()}
    </div>}
    {!target && <><div className="ca-scheduler-section"><h3>Jadwal aktif & terdaftar <small>{schedules.length}</small></h3>
      {loading?<p>Memuat jadwal…</p>:!schedules.length?<p>Belum ada jadwal. Buat jadwal pertama untuk STORED Dataset atau ETL Pipeline.</p>:<div className="ca-scheduler-table-wrap"><table><thead><tr><th>Nama / target</th><th>Pengulangan</th><th>Berikutnya</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{schedules.filter(s=>!focusTarget||showAll||(s.target_type===focusTarget.type&&s.target_id.toLowerCase()===focusTarget.id.toLowerCase())).map(s=><tr key={s.schedule_id}><td><strong>{s.schedule_name}</strong><small>{s.target_type==='STORED'?'Dataset':'Pipeline'} · {s.target_name||s.target_id}{s.pipeline_version?` · v${s.pipeline_version}`:''}</small></td><td>{displayFrequency(s)}</td><td>{s.enabled?date(s.next_run_at):'—'}</td><td><span className={'ca-scheduler-state '+(s.enabled?'on':'off')}>{s.enabled?'Aktif':'Dijeda'}</span></td><td><div className="ca-scheduler-row-actions"><button type="button" disabled={busy} onClick={()=>edit(s)}>Edit</button><button type="button" disabled={busy} onClick={()=>void toggle(s)}>{s.enabled?'Jeda':'Aktifkan'}</button></div></td></tr>)}</tbody></table></div>}
    </div>
    <div className="ca-scheduler-section"><h3>Riwayat scheduler <small>150 terbaru</small></h3>
      {!history.length?<p>Belum ada eksekusi otomatis. Jalankan service scheduler agar jadwal diproses.</p>:<div className="ca-scheduler-table-wrap"><table><thead><tr><th>Jadwal</th><th>Waktu</th><th>Hasil</th><th>Run</th></tr></thead><tbody>{history.filter(h=>!focusTarget||showAll||schedules.some(s=>s.schedule_id===h.schedule_id&&s.target_type===focusTarget.type&&s.target_id.toLowerCase()===focusTarget.id.toLowerCase())).map(h=><tr key={h.event_id}><td><strong>{h.schedule_name}</strong><small>{h.target_name||''}</small></td><td>{date(h.scheduled_at)}</td><td><span className={'ca-scheduler-state '+(h.status==='SUCCEEDED'?'on':'off')}>{statusNames[h.status]||h.status}</span>{h.error_code&&<small>{h.error_code}</small>}</td><td><small className="ca-scheduler-run">{h.run_id||'—'}</small></td></tr>)}</tbody></table></div>}
    </div>
    </>}
  </section>;
}
