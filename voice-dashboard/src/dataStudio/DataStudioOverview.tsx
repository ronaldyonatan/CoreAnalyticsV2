import { useState } from 'react';
import { STUDIO_MODULES } from './modules';
import StudioIcon from './StudioIcon';
import type { StudioModule, StudioModuleId } from './modules';
import { LoginIdleCore } from '../LoginPortal';

// Keep the original radial command-center style, with alternating left/right module rows. The Data Explorer remains accessible inside Datasets.
// Five evenly spaced visual rows: left 1/3/5, right 2/4.
// SVG uses the same 0..1000 x 0..560 coordinate system as the stage.
const NODE_PATHS: Record<string, string> = {
  connections: 'M 500 246 C 418 246 408 56 310 56 L 290 56',
  datasets: 'M 500 280 C 420 280 405 280 310 280 L 290 280',
  pipelines: 'M 500 314 C 418 314 408 504 310 504 L 290 504',
  charts: 'M 500 258 C 584 258 597 168 690 168 L 710 168',
  designer: 'M 500 302 C 584 302 597 392 690 392 L 710 392',
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
    <div className={`studio-command-stage studio-command-stage--left3-right2${highlighted ? ' has-highlight' : ''}`}>
      <svg className="studio-network" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">{modules.map(module => <g key={module.id} className={`studio-network-route${highlighted === module.id ? ' is-highlighted' : ''}`}><path className="studio-network-track" d={NODE_PATHS[module.id]} /><path className="studio-network-pulse" d={NODE_PATHS[module.id]} /></g>)}</svg>
      <div className="studio-orb-area" aria-label="Data Studio command center"><div className="studio-core-reticle" aria-hidden="true"><i /><i /><i /><i /></div><LoginIdleCore paused={paused} /><div className="studio-orb-caption"><span>CORE ANALYTICS / DATA STUDIO</span><strong>DATA COMMAND</strong><small>CONNECT · PROCESS · EXPLORE</small></div></div>
      {modules.map((module, index) => <ModuleCard key={module.id} module={module} index={index + 1} onSelect={onSelect} onHighlight={setHighlighted} />)}
    </div>
  </div>;
}
