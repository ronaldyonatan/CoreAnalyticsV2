import test from 'node:test';
import assert from 'node:assert/strict';
import { parquetDatasets,loadDatasetCatalog,parquetPreviewUrl } from '../src/dataStudio/datasetCatalog.ts';
const output={output_version_id:'ABC00000-0000-4000-8000-000000000001',output_name:'Result',pipeline_name:'Sales',version:3,row_count:5000,run_id:'00000000-0000-4000-8000-000000000002'};
const direct={dataset_id:'DEF00000-0000-4000-8000-000000000003',dataset_name:'Direct',access_mode:'DIRECT'};
function reply(data,status=200){return {ok:status===200,json:async()=>data};}
test('Parquet versions retain their immutable identity, total rows, and pipeline version',()=>{
 const rows=parquetDatasets([output,{...output,output_version_id:'00000000-0000-4000-8000-000000000004'}]);
 assert.equal(rows[0].dataset_id,output.output_version_id.toLowerCase());assert.equal(rows[0].access_mode,'PARQUET');assert.equal(rows[0].row_count,5000);assert.equal(rows[0].version,3);assert.notEqual(rows[0].dataset_id,rows[1].dataset_id);
});
test('catalog merges Direct and Parquet while keeping both sources independent',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async url=>reply({success:true,data:String(url).endsWith('/outputs') ? [output]:[direct]});
 try {const result=await loadDatasetCatalog();assert.equal(result.items.length,2);assert.deepEqual(result.notices,[]);assert.equal(result.items[0].dataset_id,direct.dataset_id.toLowerCase());}finally{globalThis.fetch=previous;}
});
test('unavailable output metadata does not hide working Direct datasets',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async url=>String(url).endsWith('/outputs') ? reply({success:false,code:'PIPELINE_SCHEMA_REQUIRED'},503):reply({success:true,data:[direct]});
 try {const result=await loadDatasetCatalog();assert.equal(result.items.length,1);assert.equal(result.notices.length,1);}finally{globalThis.fetch=previous;}
});
test('Parquet stays browsable if the Direct catalog is unavailable',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async url=>String(url).endsWith('/outputs') ? reply({success:true,data:[output]}):reply({success:false},503);
 try {const result=await loadDatasetCatalog();assert.equal(result.items[0].access_mode,'PARQUET');assert.equal(result.notices.length,1);}finally{globalThis.fetch=previous;}
});
test('session loss is never downgraded to a partial catalog warning',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async url=>String(url).endsWith('/outputs') ? reply({success:false,code:'AUTH_REQUIRED'},401):reply({success:true,data:[direct]});
 try {await assert.rejects(loadDatasetCatalog(),/AUTH_REQUIRED/);}finally{globalThis.fetch=previous;}
});
test('page navigation uses the output ID endpoint and carries no storage path',()=>{
 assert.equal(parquetPreviewUrl('output-id',100),'/voice-api/api/studio/pipelines/outputs/output-id/preview?page=100');
});
