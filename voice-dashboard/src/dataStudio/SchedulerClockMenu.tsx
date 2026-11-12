import { UniverseQuickMenu } from '../design-system/components/universe';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
type ClockIconName = 'clock' | 'play' | 'calendar' | 'pause' | 'resume' | 'history';
function ClockMenuIcon({name}:{name:ClockIconName}) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name==='clock' && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}
    {name==='play' && <path d="m9 6 10 6-10 6z"/>}
    {name==='calendar' && <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>}
    {name==='pause' && <><path d="M9 6v12M15 6v12"/></>}
    {name==='resume' && <><circle cx="12" cy="12" r="9"/><path d="m10 8 5 4-5 4z"/></>}
    {name==='history' && <><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/><path d="M12 7v5l3 2"/></>}
  </svg>;
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
    if(rect) setPosition({left:Math.max(8,Math.min(window.innerWidth-256,rect.right-248)),top:rect.bottom+6});
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
  // Position from the menu's actual dimensions, not a fixed estimated height.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = menu.current.getBoundingClientRect();
    const margin = 10;
    const left = Math.max(margin, Math.min(anchor.right - box.width, window.innerWidth - box.width - margin));
    const below = anchor.bottom + 8;
    const above = anchor.top - box.height - 8;
    const top = below + box.height + margin <= window.innerHeight
      ? below : Math.max(margin, above);
    setPosition(previous => previous.left === left && previous.top === top ? previous : {left,top});
  }, [open, schedule?.enabled, error]);
  async function pause(){
    if(!schedule||busy)return;
    setBusy(true);setError('');
    try {await schedulerApi('/'+encodeURIComponent(schedule.schedule_id)+'/toggle',{enabled:!schedule.enabled});setOpen(false);onChange();}
    catch(e){setError(e instanceof Error?e.message:'SCHEDULER_UPDATE_FAILED');}
    finally{setBusy(false);}
  }
  const themeNode=trigger.current?.closest('[data-theme]') || document.querySelector('[data-theme]');
  const activeTheme=themeNode?.getAttribute('data-theme') || document.documentElement.getAttribute('data-theme') || '';
  const displayLast=(lastRun && lastRun!=='completed' ? localDate(lastRun) : '') || (schedule?.last_run_at ? localDate(schedule.last_run_at) : '');
  return <span className="ca-clock-wrap" onClick={event=>event.stopPropagation()}>
    <button ref={trigger} className={'ca-clock-trigger'+(schedule?.enabled?' is-scheduled':'')} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={`Aksi jadwal: ${target.name}`} title={`Aksi • ${target.name}`} onClick={show}>
      <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>
      <span className="ca-clock-caret">⌄</span>
    </button>
    {open&&createPortal(<UniverseQuickMenu ref={menu} className="ca-clock-menu ca-clock-menu-aurora ca-clock-menu-refined ca-clock-menu-compact" data-theme={activeTheme} style={position} role="menu" aria-label={`Aksi untuk ${target.name}`}>
      <div className="ca-clock-compact-head">
        <div className="ca-clock-compact-title"><strong title={target.name}>{target.name}</strong><small>{target.type==='PIPELINE'?'ETL Pipeline':'STORED Dataset'}</small></div>
        <span className={`ca-clock-compact-status${schedule?.enabled?' is-on':''}`} title={schedule ? (schedule.enabled?'Jadwal aktif':'Jadwal nonaktif'):'Belum dijadwalkan'}>{schedule?.enabled ? 'Active' : schedule ? 'Off' : 'Unset'}</span>
      </div>
      <div className="ca-clock-action-list" role="group" aria-label="Aksi dataset dan jadwal">
        <button type="button" role="menuitem" disabled={disabled} onClick={()=>{setOpen(false);onRun();}}><ClockMenuIcon name="play"/><span>Run now</span></button>
        <button type="button" role="menuitem" onClick={()=>{setOpen(false);onSchedule();}}><ClockMenuIcon name="calendar"/><span>{schedule?'Edit schedule':'Set schedule'}</span></button>
        <button type="button" role="menuitem" disabled={!schedule||busy} onClick={()=>void pause()}><ClockMenuIcon name={schedule?.enabled?'pause':'resume'}/><span>{schedule?.enabled?'Disable schedule':'Enable schedule'}</span></button>
        <button type="button" role="menuitem" onClick={()=>{setOpen(false);onDetails();}}><ClockMenuIcon name="history"/><span>Details & history</span></button>
      </div>
      {error&&<small role="alert" className="ca-clock-error">{error}</small>}
      <div className="ca-clock-foot ca-clock-compact-foot"><span>Last run</span><strong>{displayLast|| (lastRun==='completed'?'Pernah dijalankan': 'Never run')}</strong></div>
    </UniverseQuickMenu>,document.body)}
  </span>;
}

import './aurora-clock-v2.css';
