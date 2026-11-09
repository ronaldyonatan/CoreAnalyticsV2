import test from 'node:test';
import assert from 'node:assert/strict';
import { pipelineDocument, batchReadiness, pipelineUuid, pipelineMessage } from '../src/dataStudio/pipelineMetadata.ts';
const nodes=[{id:'fixed',position:{x:1,y:2},selected:true,measured:{width:100},data:{label:'Fixed Input',fixedColumns:['A'],fixedRows:[['x']],executed:true}},{id:'out',position:{x:300,y:2},data:{label:'Output Dataset',outputName:'Result'}}];
const edges=[{id:'e',source:'fixed',target:'out',selected:true}];
test('saved document drops React state and preview execution badges, preserves positions and compiles exact graph',()=>{
 const result=pipelineDocument(nodes,edges);assert.deepEqual(Object.keys(result.nodes[0]).sort(),['data','id','position','type']);assert.equal(result.nodes[0].data.executed,undefined);assert.equal(result.edges[0].selected,undefined);assert.equal(result.graph.outputs[0].name,'Result');assert.equal(batchReadiness(result),'');assert.deepEqual(result.nodes[0].position,{x:1,y:2});assert.equal(nodes[0].data.executed,true);
});
test('incomplete drafts remain saveable but cannot run',()=>{
 const result=pipelineDocument(nodes,[]);assert.equal(result.graph,null);assert.match(batchReadiness(result),/Lengkapi/);
});
test('preview-only operations cannot be advertised as batch-ready',()=>{
 const result=pipelineDocument(nodes,edges);result.graph.nodes=[{id:'script',inputs:[],steps:[{type:'script'}]}];assert.match(batchReadiness(result),/baru mendukung preview/);
});
test('saved snapshot remains detached from later edits',()=>{
 const input=structuredClone(nodes);const result=pipelineDocument(input,edges);input[0].data.fixedRows[0][0]='changed';assert.equal(result.nodes[0].data.fixedRows[0][0],'x');assert.equal(result.graph.sources[0].rows[0][0],'x');
});

test('binary UUID responses cannot be used in pipeline URLs and show a precise migration message',()=>{
 assert.throws(()=>pipelineUuid('\ufffdVQ\x04\ufffdN'),/UUID_TRANSPORT_REQUIRED/);
 assert.equal(pipelineUuid('ABC00000-0000-4000-8000-000000000001'),'abc00000-0000-4000-8000-000000000001');
 assert.match(pipelineMessage(Error('PIPELINE_UUID_TRANSPORT_REQUIRED')),/010/);
 assert.doesNotMatch(pipelineMessage(Error('PIPELINE_ENDPOINT_NOT_FOUND')),/metadata.*diaktifkan/);
});
