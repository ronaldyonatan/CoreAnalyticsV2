import { UniverseToolbar } from '../design-system/components/universe';
import './scheduler-actions-compact.css';
export type FilterOption={value:string;label:string};
export type FilterConfig={id:string;label:string;value:string;onChange:(value:string)=>void;options:FilterOption[]};
export default function CompactCatalogFilters({query,onQuery,placeholder,filters}:{query:string;onQuery:(value:string)=>void;placeholder:string;filters:FilterConfig[]}){
  const count=filters.filter(f=>f.value).length;
  return <UniverseToolbar className="ca-catalog-filter-bar">
    <label className="ca-catalog-query"><span aria-hidden="true">⌕</span><span className="ca-sr-only">Cari</span><input type="search" value={query} onChange={e=>onQuery(e.target.value)} placeholder={placeholder}/></label>
    <span className="ca-catalog-filter-icon" aria-label="Filter katalog" title="Filter katalog">♧</span>
    <div className="ca-catalog-filter-controls">{filters.map(f=><label key={f.id} className={'ca-catalog-filter-select'+(f.value?' is-active':'')}>
      <span className="ca-sr-only">{f.label}</span><select aria-label={f.label} value={f.value} onChange={e=>f.onChange(e.target.value)}><option value="">{f.label}</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </label>)}</div>
    {(count>0||query)&&<button type="button" className="ca-catalog-clear" onClick={()=>{onQuery('');filters.forEach(f=>f.onChange(''));}}>Hapus filter ({count}) ×</button>}
  </UniverseToolbar>;
}
