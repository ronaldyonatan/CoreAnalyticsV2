import { useState } from 'react';
import { STUDIO_MODULES } from './modules';
import StudioIcon from './StudioIcon';
import type { StudioModule, StudioModuleId } from './modules';
import { LoginIdleCore } from '../LoginPortal';

const NODE_PATHS: Record<string, string> = {
  connections: 'M 500 250 C 422 250 397 80 280 80 L 240 80',
  datasets: 'M 500 270 C 406 270 414 194 298 194 L 260 194',
  explorer: 'M 500 290 C 416 290 405 315 286 315 L 240 315',
  pipelines: 'M 500 310 C 408 310 420 440 300 440 L 260 440',
  jobs: 'M 500 250 C 578 250 603 80 720 80 L 760 80',
  charts: 'M 500 280 C 594 280 586 194 702 194 L 740 194',
  designer: 'M 500 305 C 584 305 595 315 714 315 L 760 315',
};

function ModuleCard({ module, index, onSelect, onHighlight }: { module: StudioModule; index: number; onSelect: (id: StudioModuleId, origin: HTMLElement) => void; onHighlight: (id: StudioModuleId | null) => void }) {
  return <button type="button" className={`studio-command-card studio-command-card--${module.id}`} onClick={event => onSelect(module.id, event.currentTarget)} onMouseEnter={() => onHighlight(module.id)} onMouseLeave={() => onHighlight(null)} onFocus={() => onHighlight(module.id)} onBlur={() => onHighlight(null)}>
    <span className="studio-command-node-icon"><StudioIcon module={module} /><i aria-hidden="true" /></span>
    <span className="studio-command-card-copy"><span className="studio-node-index">0{index} / DATA STUDIO</span><strong>{module.label}</strong><small>{module.description}</small><span className={`studio-node-status${module.status === 'available' ? ' is-available' : ''}`}><i />{module.status === 'available' ? 'AVAILABLE' : 'COMING SOON'}</span></span>
    <span className="studio-command-arrow" aria-hidden="true">↗</span>
  </button>;
}

export default function DataStudioOverview({ onSelect, paused = false }: { onSelect: (id: StudioModuleId, origin: HTMLElement) => void; paused?: boolean }) {
  const [highlighted, setHighlighted] = useState<StudioModuleId | null>(null);
  const modules = STUDIO_MODULES.filter(module => module.id !== 'overview');
  return <div className="studio-command">
    <div className="studio-command-heading"><div><div className="studio-command-eyebrow"><span /> DATA STUDIO / COMMAND CENTER</div><h1>Your data universe<span>.</span></h1><p>Connect, organize and explore your data from one workspace.</p></div><div className="studio-command-heading-meta"><span>CORE ANALYTICS</span><strong>DATA WORKSPACE <i>01</i></strong></div></div>
    <div className={`studio-command-stage${highlighted ? ' has-highlight' : ''}`}>
      <svg className="studio-network" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">{modules.map(module => <g key={module.id} className={`studio-network-route${highlighted === module.id ? ' is-highlighted' : ''}`}><path className="studio-network-track" d={NODE_PATHS[module.id]} /><path className="studio-network-pulse" d={NODE_PATHS[module.id]} /></g>)}</svg>
      <div className="studio-orb-area" aria-label="Data Studio command center"><div className="studio-core-reticle" aria-hidden="true"><i /><i /><i /><i /></div><LoginIdleCore paused={paused} /><div className="studio-orb-caption"><span>CORE ANALYTICS / DATA STUDIO</span><strong>DATA COMMAND</strong><small>CONNECT · PROCESS · EXPLORE</small></div></div>
      {modules.map((module, index) => <ModuleCard key={module.id} module={module} index={index + 1} onSelect={onSelect} onHighlight={setHighlighted} />)}
    </div>
  </div>;
}
