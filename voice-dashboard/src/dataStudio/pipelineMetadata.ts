import { compileGraph } from './graphPreview.ts';
import type { GraphNode, GraphEdge } from './graphPreview.ts';

export type SavedNode = GraphNode & { type: 'pipeline'; position: { x: number; y: number } };
export type SavedEdge = GraphEdge & { id: string };
export type PipelineDocument = { nodes: SavedNode[]; edges: SavedEdge[]; graph: ReturnType<typeof compileGraph>['body'] | null };
const dataKeys = new Set('label datasetId fixedColumns fixedRows columns renames rules filterExpression outputName utilityConfig calculations textRules textColumns textOutput textDelimiter textRemove textKeepExtra splitNames formulas filterOp filterColumn filterValue'.split(' '));
const native = new Set('filter select combine replace split string format calculate date formula query constant duplicate alter schema json limit series meta_select order mapper deduplicate expression_filter group window pivot unpivot append join split_join split_filter'.split(' '));

export function pipelineDocument(nodes: (GraphNode & { position: { x: number; y: number } })[], edges: SavedEdge[], columns: Record<string, string[]> = {}): PipelineDocument {
  const cleanNodes: SavedNode[] = nodes.map(n => ({ id:n.id, type:'pipeline', position:{x:n.position.x,y:n.position.y}, data:Object.fromEntries(Object.entries(n.data).filter(([key]) => dataKeys.has(key))) as GraphNode['data'] }));
  const cleanEdges = edges.map(e => ({ id:e.id,source:e.source,target:e.target,...(e.sourceHandle == null ? {} : {sourceHandle:e.sourceHandle}),...(e.targetHandle == null ? {} : {targetHandle:e.targetHandle}) }));
  let graph: PipelineDocument['graph'] = null;
  try { graph=compileGraph(cleanNodes,cleanEdges,columns).body; } catch { /* An incomplete draft can be saved. */ }
  return JSON.parse(JSON.stringify({ nodes:cleanNodes, edges:cleanEdges, graph }));
}
export function batchReadiness(document: PipelineDocument) {
  if (!document.graph) return 'Lengkapi konfigurasi dan hubungkan semua node ke output.';
  if (document.graph.nodes.some(n => n.steps.some(s => (typeof s.type !== 'string' || !native.has(s.type))))) return 'Alur ini memuat komponen yang baru mendukung preview. Batch untuk Script, Data Science, Performance, dan AI belum tersedia.';
  return '';
}
export function pipelineUuid(value:unknown):string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw Error('PIPELINE_UUID_TRANSPORT_REQUIRED');
  return value.toLowerCase();
}
export async function pipelineApi<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const cookie=document.cookie.split('; ').find(item => item.startsWith('core_csrf='));
  const response=await fetch('/voice-api/api/studio/pipelines'+path,{method:body === undefined ? 'GET':'POST',credentials:'include',cache:'no-store',signal,headers:body === undefined ? {} : {'Content-Type':'application/json','X-CSRF-Token':cookie ? decodeURIComponent(cookie.slice(10)) : ''},body:body === undefined ? undefined:JSON.stringify(body)});
  let result;
  try { result=await response.json(); } catch { throw Error(response.status===404 ? 'PIPELINE_ENDPOINT_NOT_FOUND':'PIPELINE_RESPONSE_INVALID'); }
  if (!response.ok || result.success !== true) throw Error(result.code || 'PIPELINE_METADATA_UNAVAILABLE');
  return result.data as T;
}
export function pipelineMessage(error: unknown) {
  const code=error instanceof Error ? error.message : 'PIPELINE_METADATA_UNAVAILABLE';
  if (code==='PIPELINE_UUID_TRANSPORT_REQUIRED') return 'Format ID pipeline perlu diperbarui. Jalankan skrip SQL 010, lalu buka kembali pipeline dari daftar. Pipeline yang sudah tersimpan tetap ada.';
  if (code==='PIPELINE_ENDPOINT_NOT_FOUND') return 'Pipeline tidak dapat dibuka melalui alamat ini. Buka kembali dari daftar pipeline.';
  if (code==='PIPELINE_RESPONSE_INVALID') return 'Respons layanan pipeline tidak valid. Coba lagi.';
  if (/SCHEMA_REQUIRED|METADATA_UNAVAILABLE/.test(code)) return 'Penyimpanan pipeline belum terhubung. Konfigurasi layanan metadata perlu diaktifkan; preview tetap tersedia.';
  if (code==='PIPELINE_VERSION_CONFLICT') return 'Pipeline sudah diperbarui. Muat versi terbaru atau simpan sebagai pipeline baru.';
  return code;
}
