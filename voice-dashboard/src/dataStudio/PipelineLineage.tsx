import {  UniverseHeader , UniverseInspector } from '../design-system/components/universe';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PipelineDocument } from './pipelineMetadata';
import { loadDatasetCatalog } from './datasetCatalog';
import type { CatalogDataset } from './datasetCatalog';
import './pipeline-lineage.css';

type Output = { output_version_id?: string; output_node_id: string; output_name: string; row_count: number };
type Props = {
  document: PipelineDocument;
  outputs: Output[];
  version: number;
  pipelineName?: string;
  onExplore?: (id: string) => void;
  onExploreSource?: (id: string, isParquet: boolean) => void;
  onOpenCanvas?: () => void;
};
type Kind = 'source' | 'pipeline' | 'transform' | 'output' | 'downstream';
type VisualNode = {id: string; kind: Kind; title: string; subtitle: string; x: number; y: number; datasetId?: string; outputId?: string; rowCount?: number};
type VisualEdge = {from: string; to: string};
const NODE_WIDTH = 194;
const NODE_HEIGHT = 66;
const X_GAP = 248;
const Y_GAP = 104;
const START_X = 42;
const START_Y = 85;
const sourceNode = (label: string) => label === 'Input Dataset' || label === 'Fixed Input';
const outputNode = (label: string) => label === 'Output Dataset';

function makeGraph(doc: PipelineDocument, outputs: Output[], catalog: CatalogDataset[], expanded: boolean, pipelineName: string) {
  const saved = doc.nodes || [];
  const lookup = new Map(catalog.map(c => [c.dataset_id.toLowerCase(), c]));
  const inputs = saved.filter(n => sourceNode(n.data.label));
  const ends = saved.filter(n => outputNode(n.data.label));
  const steps = saved.filter(n => !sourceNode(n.data.label) && !outputNode(n.data.label));
  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];
  const add = (kind: Kind, id: string, title: string, subtitle: string, col: number, row: number, extras: Partial<VisualNode> = {}) => {
    nodes.push({kind,id,title,subtitle,x: START_X + col * X_GAP,y: START_Y + row * Y_GAP,...extras});
  };
  const inputCount = Math.max(1,inputs.length);
  const outputCount = Math.max(1,ends.length);
  const maxCount = Math.max(inputCount,outputCount,expanded ? steps.length : 1);
  const offset = (count: number,i:number) => (maxCount-count)/2 + i;
  inputs.forEach((n,i) => {
    const datasetId = typeof n.data.datasetId === 'string' ? n.data.datasetId : undefined;
    const source = datasetId ? lookup.get(datasetId.toLowerCase()) : undefined;
    add('source',n.id,source?.dataset_name || (n.data.label === 'Fixed Input' ? 'Fixed Input' : 'Input Dataset'),source ? `${source.access_mode} · ${source.connection_name}` : datasetId ? `Dataset ${datasetId.slice(0,8)}…` : 'Input pipeline',0,offset(inputCount,i),{datasetId});
  });
  const pipelineId = '__current_pipeline__';
  const processColumn = expanded ? 1 : 1;
  if (!expanded) add('pipeline', pipelineId,pipelineName,`${steps.length} transformasi`,1,offset(1,0));
  else {
    // Detailed mode uses the actual stored edges to place operations in dependency order.
    const selected = new Set(steps.map(n => n.id));
    const depthMap = new Map<string,number>();
    const resolving = new Set<string>();
    const calc = (id: string):number => {
      if(depthMap.has(id)) return depthMap.get(id)!;
      if(resolving.has(id)) return 0;
      resolving.add(id);
      const parents=(doc.edges||[]).filter(e=>e.target===id&&selected.has(e.source));
      const level=parents.length?Math.min(8,Math.max(...parents.map(e=>calc(e.source)))+1):0;
      resolving.delete(id);depthMap.set(id,level);return level;
    };
    steps.forEach(n=>calc(n.id));
    const groups=new Map<number,typeof steps>();
    steps.forEach(n=>{const level=depthMap.get(n.id)||0;groups.set(level,[...(groups.get(level)||[]),n]);});
    for(const [level,group] of groups){group.forEach((n,i)=>add('transform',n.id,n.data.label||'Transform','ETL operation',processColumn+level,offset(group.length,i)));}
    if(!steps.length) add('pipeline',pipelineId,pipelineName,'Tanpa transformasi',1,offset(1,0));
  }
  const transformCols = expanded ? Math.max(1,...nodes.filter(n=>n.kind==='transform').map(n=>Math.round((n.x-START_X)/X_GAP)+1)) : 2;
  const outputCol=Math.max(2,transformCols);
  ends.forEach((n,i)=>{
    const output=outputs.find(o=>o.output_node_id===n.id);
    add('output',n.id,String(n.data.outputName||output?.output_name||'Output Dataset'),output?`${output.row_count.toLocaleString('id-ID')} baris · Parquet`:'Output belum terdaftar',outputCol,offset(outputCount,i),{outputId:output?.output_version_id,rowCount:output?.row_count});
  });
  // Cross-pipeline / chart dependencies are not exposed by the current metadata API.
  // An empty downstream lane is explicit, not a fabricated linked node.
  add('downstream','__unresolved_downstream__','Downstream','Belum ada relasi terverifikasi',outputCol+1,offset(1,0));
  const actualEdges=(doc.edges||[]).filter(e=>saved.some(n=>n.id===e.source)&&saved.some(n=>n.id===e.target));
  if(expanded){
    actualEdges.forEach(e=>edges.push({from:e.source,to:e.target}));
    if(!steps.length) inputs.forEach(n=>edges.push({from:n.id,to:pipelineId}));
    if(!steps.length) ends.forEach(n=>edges.push({from:pipelineId,to:n.id}));
  }else{
    // An overview link exists only where a real path connects source to an output.
    const adjacency=new Map<string,string[]>();
    actualEdges.forEach(e=>adjacency.set(e.source,[...(adjacency.get(e.source)||[]),e.target]));
    const reaches=(from:string,to:string)=>{const queue=[from];const seen=new Set<string>();while(queue.length){const next=queue.shift()!;if(next===to)return true;if(seen.has(next))continue;seen.add(next);queue.push(...(adjacency.get(next)||[]));}return false;};
    const validInputs=inputs.filter(n=>ends.some(o=>reaches(n.id,o.id)));
    const validOutputs=ends.filter(n=>inputs.some(s=>reaches(s.id,n.id)));
    validInputs.forEach(n=>edges.push({from:n.id,to:pipelineId}));
    validOutputs.forEach(n=>edges.push({from:pipelineId,to:n.id}));
  }
  const width=START_X*2+(outputCol+1)*X_GAP+NODE_WIDTH;
  const height=Math.max(300,START_Y*2+(maxCount-1)*Y_GAP+NODE_HEIGHT);
  return {nodes,edges,width,height,outputCol};
}

export default function PipelineLineage({document,outputs,version,pipelineName = 'ETL / DataFlow',onExplore,onExploreSource,onOpenCanvas}:Props){
  const [catalog,setCatalog]=useState<CatalogDataset[]>([]);
  const [notice,setNotice]=useState('');
  const [expanded,setExpanded]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [zoom,setZoom]=useState(1);
  const viewport=useRef<HTMLDivElement>(null);
  useEffect(()=>{const controller=new AbortController();loadDatasetCatalog(controller.signal).then(result=>{if(!controller.signal.aborted){setCatalog(result.items);setNotice(result.notices.join(' '));}}).catch(()=>{if(!controller.signal.aborted)setNotice('Katalog dataset tidak dapat dimuat; beberapa nama sumber mungkin belum tersedia.');});return()=>controller.abort();},[]);
  const graph=useMemo(()=>makeGraph(document,outputs,catalog,expanded,pipelineName),[document,outputs,catalog,expanded,pipelineName]);
  const focus=graph.nodes.find(n=>n.id===selected)||null;
  const sourceMatch=focus?.datasetId?catalog.find(c=>c.dataset_id.toLowerCase()===focus.datasetId!.toLowerCase()):undefined;
  const navigable=(node:VisualNode)=>node.kind==='source'?!!(node.datasetId&&sourceMatch&&onExploreSource):node.kind==='output'?!!(node.outputId&&onExplore):['pipeline','transform'].includes(node.kind)?!!onOpenCanvas:false;
  const navigate=(node:VisualNode)=>{
    if(node.kind==='source'&&node.datasetId&&onExploreSource){const src=catalog.find(c=>c.dataset_id.toLowerCase()===node.datasetId!.toLowerCase());if(src)onExploreSource(src.dataset_id,src.access_mode==='PARQUET');}
    if(node.kind==='output'&&node.outputId&&onExplore)onExplore(node.outputId);
    if((node.kind==='pipeline'||node.kind==='transform')&&onOpenCanvas)onOpenCanvas();
  };
  const reset=()=>{setZoom(1);if(viewport.current){viewport.current.scrollLeft=0;viewport.current.scrollTop=0;}};
  if(!(document.nodes||[]).length)return <section className="ca-lineage"><p>Belum ada graph pipeline tersimpan untuk versi ini.</p></section>;
  return <section className="ca-lineage ca-lineage-v2" aria-label="Data lineage end-to-end">
    <UniverseHeader className="ca-lineage-topbar">
      <div><span className="ca-lineage-kicker">DATA LINEAGE · V{version}</span><h3>Source → ETL → Output → Downstream</h3></div>
      <div className="ca-lineage-tools"><button type="button" className={expanded?'is-active':''} onClick={()=>{setExpanded(v=>!v);setSelected(null);setZoom(1);}}>{expanded?'Ringkas ETL':'Detail transformasi'}</button><button type="button" aria-label="Perkecil diagram" onClick={()=>setZoom(v=>Math.max(.6,+(v-.15).toFixed(2)))}>−</button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Perbesar diagram" onClick={()=>setZoom(v=>Math.min(1.6,+(v+.15).toFixed(2)))}>+</button><button type="button" onClick={reset}>Reset</button></div>
    </UniverseHeader>
    {notice&&<p className="ca-lineage-note">{notice}</p>}
    <div className="ca-lineage-viewport" ref={viewport} tabIndex={0} aria-label="Diagram lineage; geser untuk menampilkan seluruh alur">
      <div className="ca-lineage-scaled" style={{width:graph.width*zoom,height:graph.height*zoom}}>
        <div className="ca-lineage-plane" style={{width:graph.width,height:graph.height,transform:`scale(${zoom})`}}>
          <div className="ca-lineage-lanes">{[{title:'01 / SOURCE',col:0},{title:'02 / DATAFLOW',col:1},{title:'03 / OUTPUT',col:graph.outputCol},{title:'04 / DOWNSTREAM',col:graph.outputCol+1}].map((lane,i)=><span key={i} style={{left:START_X+lane.col*X_GAP}}>{lane.title}</span>)}</div>
          <svg className="ca-lineage-lines" width={graph.width} height={graph.height} viewBox={`0 0 ${graph.width} ${graph.height}`} aria-hidden="true"><defs><marker id="ca-lineage-v2-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor"/></marker></defs>{graph.edges.map((edge,i)=>{const a=graph.nodes.find(n=>n.id===edge.from);const b=graph.nodes.find(n=>n.id===edge.to);if(!a||!b)return null;const x=a.x+NODE_WIDTH,y=a.y+NODE_HEIGHT/2,x2=b.x,y2=b.y+NODE_HEIGHT/2;const bend=Math.max(18,(x2-x)/2);return <path key={`${edge.from}-${edge.to}-${i}`} d={`M${x} ${y} C${x+bend} ${y},${x2-bend} ${y2},${x2} ${y2}`} markerEnd="url(#ca-lineage-v2-arrow)"/>;})}</svg>
          {graph.nodes.map(node=><button key={node.id} type="button" className={`ca-lineage-item ca-lineage-item--${node.kind}${selected===node.id?' is-selected':''}`} style={{left:node.x,top:node.y,width:NODE_WIDTH,height:NODE_HEIGHT}} onClick={()=>setSelected(node.id)} onDoubleClick={()=>navigate(node)} aria-pressed={selected===node.id} title={node.title}><span className="ca-lineage-item-icon" aria-hidden="true">{node.kind==='source'?'▤':node.kind==='pipeline'?'⤨':node.kind==='transform'?'◇':node.kind==='output'?'▣':'◌'}</span><span className="ca-lineage-item-copy"><strong>{node.title}</strong><small>{node.subtitle}</small></span></button>)}
        </div>
      </div>
    </div>
    {focus&&<UniverseInspector className="ca-lineage-node-detail"><div><span>{focus.kind.toUpperCase()}</span><strong>{focus.title}</strong><small>{focus.subtitle}</small></div><div className="ca-lineage-node-actions">{navigable(focus)&&<button type="button" onClick={()=>navigate(focus)}>{focus.kind==='source'?'Buka dataset':focus.kind==='output'?'Lihat hasil': 'Buka Canvas'} ↗</button>}{focus.kind==='downstream'&&<small>Relasi lintas dataset, view, atau chart belum tersedia dari API. Tidak ada relasi yang diasumsikan.</small>}<button type="button" onClick={()=>setSelected(null)}>Tutup</button></div></UniverseInspector>}
  </section>;
}
