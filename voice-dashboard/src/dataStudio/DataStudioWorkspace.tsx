import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent } from 'react';
import Connections from './Connections';
import { LoginAtmosphere } from '../LoginPortal';
import { ComponentStyles } from '../design-system/ComponentStyles';
import DataStudioOverview from './DataStudioOverview';
import { STUDIO_MODULES } from './modules';
import StudioIcon from './StudioIcon';
import type { StudioModule, StudioModuleId } from './modules';

function ComingSoon({ module }: { module: StudioModule }) {
  return <div className="studio-placeholder"><span className="studio-placeholder-icon"><StudioIcon module={module} /></span><span className="studio-placeholder-badge">COMING SOON</span><h1>{module.label}</h1><p>{module.description}. This module is planned for a future Data Studio release.</p></div>;
}

export default function DataStudioWorkspace() {
  const [selected, setSelected] = useState<StudioModuleId>('overview');
  const [connectionsOpened, setConnectionsOpened] = useState(false);
  const [fullPage, setFullPage] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const originRectRef = useRef<DOMRect | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const closingRef = useRef(false);
  const [portalTarget] = useState(() => {
    const element = document.createElement('div');
    element.className = 'studio-portal-mount';
    return element;
  });
  useLayoutEffect(() => {
    const target = fullPage ? document.body : containerRef.current;
    target?.appendChild(portalTarget);
    return () => { portalTarget.remove(); };
  }, [fullPage, portalTarget]);
  useLayoutEffect(() => {
    if (selected === 'overview') {
      animationRef.current?.cancel();
      animationRef.current = null;
      openerRef.current?.focus();
      return;
    }
    const dialog = dialogRef.current;
    // Clear a completed closing effect before measuring the full-size dialog.
    animationRef.current?.cancel();
    animationRef.current = null;
    closeRef.current?.focus();
    if (!dialog || !originRectRef.current || document.documentElement.dataset.performance === 'static') return;
    const origin = originRectRef.current;
    const destination = dialog.getBoundingClientRect();
    if (!destination.width || !destination.height) return;
    const dx = origin.left + origin.width / 2 - (destination.left + destination.width / 2);
    const dy = origin.top + origin.height / 2 - (destination.top + destination.height / 2);
    const sx = Math.max(.05, Math.min(1, origin.width / destination.width));
    const sy = Math.max(.05, Math.min(1, origin.height / destination.height));
    const animation = dialog.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.8 },
      { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
    ], { duration: 950, easing: 'cubic-bezier(.22, .68, .16, 1)' });
    animationRef.current = animation;
    return () => { animation.cancel(); if (animationRef.current === animation) animationRef.current = null; };
  }, [selected]);
  const current = STUDIO_MODULES.find(module => module.id === selected)!;
  const selectModule = (id: StudioModuleId, origin?: HTMLElement) => {
    if (id === 'overview' && selected !== 'overview') {
      if (closingRef.current) return;
      const dialog = dialogRef.current;
      animationRef.current?.cancel();
      const originRect = openerRef.current?.getBoundingClientRect() ?? originRectRef.current;
      if (dialog && originRect && document.documentElement.dataset.performance !== 'static') {
        const destination = dialog.getBoundingClientRect();
        if (destination.width && destination.height) {
          const dx = originRect.left + originRect.width / 2 - (destination.left + destination.width / 2);
          const dy = originRect.top + originRect.height / 2 - (destination.top + destination.height / 2);
          const sx = Math.max(.05, Math.min(1, originRect.width / destination.width));
          const sy = Math.max(.05, Math.min(1, originRect.height / destination.height));
          closingRef.current = true;
          const animation = dialog.animate([
            { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.35 },
          ], { duration: 700, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
          animationRef.current = animation;
          const finishClose = () => {
            if (!closingRef.current || animationRef.current !== animation) return;
            closingRef.current = false;
            setSelected('overview');
          };
          animation.onfinish = finishClose;
          // Some browsers can suspend animation callbacks during tab transitions.
          window.setTimeout(finishClose, 800);
          return;
        }
      }
      closingRef.current = false;
    }
    if (id !== 'overview') {
      openerRef.current = origin ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      originRectRef.current = origin?.getBoundingClientRect() ?? openerRef.current?.getBoundingClientRect() ?? null;
      if (id === 'connections') setConnectionsOpened(true);
    }
    setSelected(id);
  };
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); selectModule('overview'); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? []).filter(el => el.getClientRects().length > 0);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const workspace = <section className={`studio-workspace${fullPage ? ' is-full-page' : ''}`} aria-label="Data Studio workspace">
    <header className="studio-workspace-header" inert={selected !== 'overview' || undefined}><button type="button" className="studio-header-button" aria-label={fullPage ? 'Kembali ke aplikasi' : 'Layar penuh'} onClick={() => setFullPage(value => !value)}><span aria-hidden="true">{fullPage ? '↙' : '↗'}</span><span>{fullPage ? 'Kembali ke aplikasi' : 'Layar penuh'}</span></button></header>
    <main className="studio-content" aria-label="Data Studio command center" data-paused={selected !== 'overview' || undefined} inert={selected !== 'overview' || undefined}>
      <ComponentStyles name="login-gateway" /><LoginAtmosphere paused={selected !== 'overview'} /><DataStudioOverview onSelect={selectModule} paused={selected !== 'overview'} />
    </main>
    <div className="studio-window-overlay" hidden={selected === 'overview'}>
      <div className="studio-window" role="dialog" aria-modal="true" aria-labelledby="studio-window-title" ref={dialogRef} onKeyDown={handleDialogKeyDown}>
        <header className="studio-window-header"><div className="studio-window-heading"><span className="studio-window-glyph" aria-hidden="true"><StudioIcon module={current} /></span><h2 id="studio-window-title">{current.label}</h2></div><button ref={closeRef} type="button" className="studio-window-close" aria-label="Tutup dan kembali ke Command Center" onClick={() => selectModule('overview')}><span aria-hidden="true">×</span></button></header>
        <div className="studio-window-content">
          {connectionsOpened && <div className="studio-connections" hidden={selected !== 'connections'}><Connections /></div>}
          {current.status === 'planned' && <ComingSoon module={current} />}
        </div>
      </div>
    </div>
  </section>;
  return <><div className="studio-portal-host" ref={containerRef} />{createPortal(workspace, portalTarget)}</>;
}
