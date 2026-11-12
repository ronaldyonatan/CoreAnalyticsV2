import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { UniverseInspector, UniverseToolbar } from './UniversePrimitives';

/** Identical catalogue identity/actions contract based on approved Datasets V5.2. */
export function UniverseCatalogHeader({ title, count, hint, actions, id }: {title:string;count?:ReactNode;hint:string;actions?:ReactNode;id?:string}) {
  return <UniverseToolbar className="u-dataset-header" data-universe-part="catalog-header">
    <div className="u-dataset-heading"><span className="u-dataset-heading-mark" aria-hidden="true">◈</span>
      <h1 id={id}>{title}{count !== undefined && <span className="u-dataset-count">{count}</span>}</h1>
      <span className="u-dataset-hint">{hint}</span>
    </div>
    <div className="u-dataset-actions">{actions}</div>
  </UniverseToolbar>;
}
export function UniverseCatalogSplit({list,inspector,className=''}:{list:ReactNode;inspector:ReactNode;className?:string}){
  return <div className={`u-dataset-grid ${className}`.trim()}><div className="u-dataset-list">{list}</div>{inspector}</div>;
}
type EntryProps=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'> & {
  mark:ReactNode;title:string;subtitle:ReactNode;metadata?:Array<{label:string;value:ReactNode}>;
  badge?:ReactNode;selected?:boolean;
};
/** A single accessible button, with no nested actions (schedule menus live beside it). */
export function UniverseCatalogEntry({mark,title,subtitle,metadata=[],badge,selected=false,className='',...props}:EntryProps){
 return <button type="button" {...props} aria-pressed={selected} data-selected={selected} className={`u-dataset-entry${selected?' is-selected':''} ${className}`.trim()}>
   <span className="u-dataset-entry-mark" aria-hidden="true">{mark}</span>
   <span className="u-dataset-entry-name"><strong>{title}</strong><small>{subtitle}</small></span>
   {metadata.map((m,i)=><span key={i} className="u-dataset-entry-meta"><small>{m.label}</small><strong>{m.value}</strong></span>)}
   {badge&&<span className="u-dataset-entry-badge">{badge}</span>}
   <span className="u-dataset-entry-arrow" aria-hidden="true">↗</span>
 </button>;
}
/** Inspector is intentionally shared with source catalogue, including its empty state. */
export function UniverseCatalogInspector({children,emptyHeading='Explore your data',emptyDescription='Pilih item di sebelah kiri untuk melihat detail, status, dan tindakan yang tersedia.'}:{children?:ReactNode;emptyHeading?:string;emptyDescription?:string}){
 return <UniverseInspector className={`u-dataset-inspector${children?' has-selection':''}`}>
   {children || <div className="u-dataset-inspector-empty"><span className="u-dataset-inspector-symbol" aria-hidden="true">◎</span><span className="u-dataset-inspector-kicker">DATA INTELLIGENCE</span><h2>{emptyHeading}</h2><p>{emptyDescription}</p></div>}
 </UniverseInspector>;
}
export function UniverseInspectorDetails({eyebrow,title,subtitle,fields,actions}:{eyebrow:string;title:string;subtitle:string;fields:Array<{label:string;value:ReactNode}>;actions?:ReactNode}){
 return <div className="u-dataset-inspector-detail"><span className="u-dataset-inspector-kicker">{eyebrow}</span><div className="u-dataset-inspector-title"><span className="u-dataset-inspector-symbol" aria-hidden="true">◈</span><div><h2>{title}</h2><p>{subtitle}</p></div></div><dl>{fields.map((f,i)=><div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>{actions&&<div className="u-dataset-inspector-actions">{actions}</div>}</div>;
}
