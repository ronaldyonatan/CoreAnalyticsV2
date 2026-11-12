import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { schedulerApi } from './Scheduler';
import type { Schedule, ScheduleTarget } from './Scheduler';
import './scheduler-actions-compact.css';

export function useScheduleIndex(refreshKey = 0) {
  const [items,setItems] = useState<Schedule[]>([]);
  const [error,setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    schedulerApi<Schedule[]>('',undefined,abort.signal).then(value => {
      if (!abort.signal.aborted) { setItems(value);setError(''); }
    }).catch(() => { if (!abort.signal.aborted) setError('Status jadwal belum tersedia.'); });
    return () => abort.abort();
  },[refreshKey]);
  return {items,error};
}

function localDate(value?:string|null) {
  if (!value) return '';
  const d=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value)?value:value+'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'});
}
export default function SchedulerClockMenu({target,schedule,lastRun,onRun,onSchedule,onDetails,onChange,disabled=false}:{
  target:ScheduleTarget;schedule?:Schedule;lastRun?:string|null;
  onRun:()=>void;onSchedule:()=>void;onDetails:()=>void;onChange:()=>void;disabled?:boolean;
}) {
  const trigger=useRef<HTMLButtonElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const [position,setPosition]=useState({left:0,top:0});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  function show() {
    if(open) {setOpen(false);return;}
    const rect=trigger.current?.getBoundingClientRect();
    if(rect) setPosition({left:Math.max(8,Math.min(window.innerWidth-235,rect.right-220)),top:rect.bottom+6>window.innerHeight-208 ? Math.max(8,rect.top-212) : rect.bottom+6});
    setError('');setOpen(true);
  }
  useEffect(()=>{
    if(!open)return;
    function close(event:PointerEvent){if(!(event.target instanceof Node) || (!trigger.current?.contains(event.target)&&!menu.current?.contains(event.target)))setOpen(false);}
    function esc(event:KeyboardEvent){if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}}
    const scroll=()=>setOpen(false);
    document.addEventListener('pointerdown',close);
    document.addEventListener('keydown',esc);
    window.addEventListener('resize',scroll);
    window.addEventListener('scroll',scroll,true);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc);window.removeEventListener('resize',scroll);window.removeEventListener('scroll',scroll,true);};
  },[open]);
  async function pause(){
    if(!schedule||busy)return;
    setBusy(true);setError('');
    try {await schedulerApi('/'+encodeURIComponent(schedule.schedule_id)+'/toggle',{enabled:!schedule.enabled});setOpen(false);onChange();}
    catch(e){setError(e instanceof Error?e.message:'SCHEDULER_UPDATE_FAILED');}
    finally{setBusy(false);}
  }
  const displayLast=(lastRun && lastRun!=='completed' ? localDate(lastRun) : '') || (schedule?.last_run_at ? localDate(schedule.last_run_at) : '');
  return <span className="ca-clock-wrap" onClick={event=>event.stopPropagation()}>
    <button ref={trigger} className={'ca-clock-trigger'+(schedule?.enabled?' is-scheduled':'')} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={`Aksi jadwal: ${target.name}`} title={`Aksi • ${target.name}`} onClick={show}>
      <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>
      <span className="ca-clock-caret">⌄</span>
    </button>
    {open&&createPortal(<div ref={menu} className="ca-clock-menu" style={position} role="menu" aria-label={`Aksi untuk ${target.name}`}>
      <div className="ca-clock-title">{target.type==='PIPELINE'?'ETL Pipeline':'STORED Dataset'} <strong>{target.name}</strong></div>
      <button type="button" role="menuitem" disabled={disabled} onClick={()=>{setOpen(false);onRun();}}>▶ <span>Run now</span></button>
      <button type="button" role="menuitem" onClick={()=>{setOpen(false);onSchedule();}}>▦ <span>{schedule?'Edit schedule':'Set schedule'}</span></button>
      <button type="button" role="menuitem" disabled={!schedule||busy} onClick={()=>void pause()}>{schedule?.enabled?'Ⅱ':'▷'} <span>{schedule?.enabled?'Disable schedule':'Enable schedule'}</span></button>
      <button type="button" role="menuitem" onClick={()=>{setOpen(false);onDetails();}}>↗ <span>Details & history</span></button>
      {error&&<small role="alert" className="ca-clock-error">{error}</small>}
      <div className="ca-clock-foot"><span>Last run</span><strong>{displayLast|| (lastRun==='completed'?'Pernah dijalankan': 'Never run')}</strong></div>
    </div>,document.body)}
  </span>;
}
