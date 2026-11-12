export type CatalogDataset = {
  dataset_id:string;dataset_name:string;connection_id:string;connection_name:string;
  source_schema:string;source_name:string;access_mode:string;storage_status:string;
  connector_type?:string;connection_type?:string;origin_type?:string;pipeline_id?:string;row_count?:number;run_id?:string;version?:number;created_at?:string;owner_name?:string;storage_relative_path?:string;refresh_status?:string;
};
/** Visual provenance classification. ETL outputs are also stored as Parquet;
 * use the ETL icon when the API exposes a pipeline/run association.
 * Do not infer transformations from an output's name. */
export type DatasetKind = 'direct' | 'stored' | 'etl';
export function datasetKind(dataset: CatalogDataset): DatasetKind {
  const mode = String(dataset.access_mode || '').toUpperCase();
  if (mode === 'DIRECT') return 'direct';
  if (mode === 'STORED') return 'stored';
  if (mode === 'PARQUET' && (dataset.pipeline_id || dataset.origin_type === 'ETL_PIPELINE' || dataset.run_id)) return 'etl';
  return 'stored';
}
export const DATASET_KIND_INFO: Record<DatasetKind, { label: string; detail: string; tooltip: string }> = {
  direct: { label: 'DIRECT', detail: 'Live source', tooltip: 'Data dibaca langsung dari sumber saat digunakan.' },
  stored: { label: 'STORED', detail: 'Materialized', tooltip: 'Data tersimpan sebagai dataset materialized.' },
  etl: { label: 'ETL', detail: 'Pipeline output', tooltip: 'Hasil pipeline yang disimpan sebagai output Parquet.' },
};
export type ParquetOutput = {output_version_id:string;output_name:string;pipeline_name:string;version:number;row_count:number;run_id:string;created_at?:string;pipeline_id?:string};
export function parquetDatasets(outputs:ParquetOutput[]):CatalogDataset[] {
  return outputs.map(output=>({dataset_id:output.output_version_id.toLowerCase(),dataset_name:output.output_name,
    connection_id:'',connection_name:output.pipeline_name,source_schema:'Pipeline',source_name:`v${output.version} · ${output.run_id.slice(0,8)}`,
    access_mode:'PARQUET',origin_type:'ETL_PIPELINE',pipeline_id:output.pipeline_id,storage_status:'READY',row_count:output.row_count,run_id:output.run_id,version:output.version,created_at:output.created_at}));
}
async function get(path:string,signal?:AbortSignal) {
  const response=await fetch('/voice-api/api/studio/'+path,{credentials:'include',cache:'no-store',signal});
  const result=await response.json().catch(()=>({}));
  if (!response.ok || result.success!==true || !Array.isArray(result.data)) throw Error(result.code || 'DATASET_METADATA_UNAVAILABLE');
  return result.data;
}
export async function loadDatasetCatalog(signal?:AbortSignal):Promise<{items:CatalogDataset[];notices:string[]}> {
  const [direct,outputs]=await Promise.allSettled([get('datasets',signal),get('pipelines/outputs',signal)]);
  for (const result of [direct,outputs]) if(result.status==='rejected' && /AUTH_REQUIRED|DATA_STUDIO_FORBIDDEN/.test(String(result.reason))) throw result.reason;
  if (direct.status==='rejected' && outputs.status==='rejected') throw Error('DATASET_METADATA_UNAVAILABLE');
  const items:CatalogDataset[]=direct.status==='fulfilled' ? direct.value
    .map((item:CatalogDataset)=>({...item,access_mode:String(item.access_mode||'DIRECT').trim().toUpperCase(),dataset_id:item.dataset_id.toLowerCase()})):[];
  if (outputs.status==='fulfilled') items.push(...parquetDatasets(outputs.value));
  const notices=[];
  if (direct.status==='rejected') notices.push('Daftar sumber Direct belum dapat dimuat.');
  if (outputs.status==='rejected') notices.push('Daftar hasil pipeline belum dapat dimuat.');
  return {items,notices};
}
export function datasetSource(dataset:CatalogDataset) {
  return dataset.access_mode==='PARQUET' ? `${dataset.connection_name} · ${dataset.source_name}`:`${dataset.connection_name} · ${dataset.source_schema}.${dataset.source_name}`;
}
export function parquetPreviewUrl(id:string,page:number) {
  return '/voice-api/api/studio/pipelines/outputs/'+encodeURIComponent(id)+'/preview?page='+page;
}
