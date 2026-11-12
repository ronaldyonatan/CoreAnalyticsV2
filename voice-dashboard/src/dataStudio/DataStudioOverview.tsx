import { useState } from 'react';
import { STUDIO_MODULES } from './modules';
import StudioIcon from './StudioIcon';
import type { StudioModule, StudioModuleId } from './modules';
import { LoginIdleCore } from '../LoginPortal';

// Organic, staggered command-center layout inspired by the original 4/3 orbital arrangement.
// Keep six non-duplicated modules, with Scheduler independent on the right and the orb central.
// Routes follow the staggered card centers on a 1000 x 560 SVG stage; hidden in compact mode.
const NODE_PATHS: Record<string, string> = {
  connections: 'M 481 239 C 411 224 391 101 299 101 L 280 101',
  datasets: 'M 465 277 C 401 274 391 252 322 252 L 300 252',
  pipelines: 'M 482 322 C 410 349 388 448 302 448 L 280 448',
  charts: 'M 517 241 C 590 223 625 134 707 134 L 725 134',
  designer: 'M 536 282 C 601 293 637 319 688 319 L 705 319',
  scheduler: 'M 517 324 C 586 349 618 476 710 476 L 730 476',
};

function ModuleCard({ module, index, onSelect, onHighlight }: { module: StudioModule; index: number; onSelect: (id: StudioModuleId, origin: HTMLElement) => void; onHighlight: (id: StudioModuleId | null) => void }) {
  return <button type="button" className={`studio-command-card studio-command-card--${module.id}`} onClick={event => onSelect(module.id, event.currentTarget)} onMouseEnter={() => onHighlight(module.id)} onMouseLeave={() => onHighlight(null)} onFocus={() => onHighlight(module.id)} onBlur={() => onHighlight(null)}>
    <span className="studio-command-node-icon"><StudioIcon module={module} /><i aria-hidden="true" /></span>
    <span className="studio-command-card-copy"><span className="studio-node-index">0{index} / DATA STUDIO</span><strong>{module.label}</strong><small>{module.description}</small><span className={`studio-node-status${module.status !== 'planned' ? ' is-available' : ''}`}><i />{module.status === 'preview' ? 'PREVIEW' : module.status === 'available' ? 'AVAILABLE' : 'COMING SOON'}</span></span>
    <span className="studio-command-arrow" aria-hidden="true">↗</span>
  </button>;
}

export default function DataStudioOverview({ onSelect, paused = false }: { onSelect: (id: StudioModuleId, origin: HTMLElement) => void; paused?: boolean }) {
  const [highlighted, setHighlighted] = useState<StudioModuleId | null>(null);
  const modules = STUDIO_MODULES.filter(module => module.id !== 'overview' && module.id !== 'explorer' && module.id !== 'jobs');
  return <div className="studio-command">
    <div className="studio-command-heading"><div><div className="studio-command-eyebrow"><span /> DATA STUDIO / COMMAND CENTER</div><h1>Your data universe<span>.</span></h1><p>Connect, organize and explore your data from one workspace.</p></div><div className="studio-command-heading-meta"><span>CORE ANALYTICS</span><strong>DATA WORKSPACE <i>01</i></strong></div></div>
    <div className={`studio-command-stage studio-command-stage--left3-right3${highlighted ? ' has-highlight' : ''}`}>
      <svg className="studio-network" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">{modules.map(module => <g key={module.id} className={`studio-network-route${highlighted === module.id ? ' is-highlighted' : ''}`}><path className="studio-network-track" d={NODE_PATHS[module.id]} /><path className="studio-network-pulse" d={NODE_PATHS[module.id]} /></g>)}</svg>
      <div className="studio-orb-area" aria-label="Data Studio command center"><div className="studio-core-reticle" aria-hidden="true"><i /><i /><i /><i /></div><LoginIdleCore paused={paused} /><div className="studio-orb-caption"><span>CORE ANALYTICS / DATA STUDIO</span><strong>DATA COMMAND</strong><small>CONNECT · PROCESS · EXPLORE</small></div></div>
      {modules.map((module, index) => <ModuleCard key={module.id} module={module} index={index + 1} onSelect={onSelect} onHighlight={setHighlighted} />)}
    </div>
  </div>;
}
