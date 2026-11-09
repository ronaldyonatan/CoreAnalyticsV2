import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAI, AI_STEPS, aiExample } from '../src/dataStudio/aiPreview.ts';
import { compilePreview, PREVIEW_STEPS } from '../src/dataStudio/pipelinePreview.ts';
const row=(output,kind='Text',value='description')=>({id:output,column:'',output,kind,value});
const data=(label,values={},rows=[])=>({label,utilityConfig:{values:{model:'mistral:latest',source:'Review',...values},rows}});
for(const label of AI_STEPS.filter(s=>s!=='AI Model Inference'))test(`${label}: configured example reaches graph Spark preview`,()=>{
 const {nodes,edges}=aiExample(label,'mistral:latest');const result=compilePreview(nodes,edges);
 assert.ok(PREVIEW_STEPS.includes(label));assert.equal(result.url,'/voice-api/api/studio/datasets/graph-spark-preview');assert.equal(result.body.nodes[0].steps[0].type,'ai_llm');assert.equal(result.ports['ai-1'].main.length,3);
});
test('multi-label, targeted sentiment and structured generation propagate typed output schemas',()=>{
 const multi=compileAI(data('AI Classification',{mode:'multi'},[row('Pujian'),row('Keluhan')]),['Review']);assert.deepEqual(multi.columns,['Review','Pujian','Keluhan']);
 const targeted=compileAI(data('Sentiment Analysis',{mode:'targeted'},[row('Product'),row('Delivery')]),['Review']);assert.deepEqual(targeted.columns,['Review','Product','Delivery']);
 const structured=compileAI(data('Text Generation',{mode:'structured',prompt:'Extract from {{Review}}'},[row('Quantity','Integer'),row('Satisfied','Boolean')]),['Review']);assert.deepEqual(structured.steps[0].fields.map(f=>f.kind),['Integer','Boolean']);
});
test('reject unavailable placeholders, collisions, duplicate labels, invalid types and parameters',()=>{
 assert.throws(()=>compileAI(data('Text Generation',{prompt:'{{Missing}}'}),['Review']),/Placeholder/);
 assert.throws(()=>compileAI(data('Text Generation',{prompt:'{{Review}'}),['Review']),/Placeholder/);
 assert.throws(()=>compileAI(data('Sentiment Analysis',{output:'review'}),['Review']),/unik/);
 assert.throws(()=>compileAI(data('AI Classification',{},[row('A'),row('a')]),['Review']),/unik/);
 assert.throws(()=>compileAI(data('Text Generation',{prompt:'Hi',temperature:'NaN'}),['Review']),/Temperature/);
 assert.throws(()=>compileAI(data('Text Generation',{prompt:'Hi',mode:'structured'},[row('X','Exec')]),['Review']),/Tipe/);
 assert.throws(()=>compileAI(data('Sentiment Analysis',{model:'https://bad.example'}),['Review']),/model lokal/);
});
test('AI Model Inference needs trained model task/schema and can return only inferred columns',()=>{
 const values={model_id:'00000000-0000-4000-8000-000000000001',modelTask:'prediction',modelFeatures:'["X"]',includeInput:'false',output:'Pred'};
 assert.deepEqual(compileAI(data('AI Model Inference',values),['X']).columns,['Pred']);
 assert.deepEqual(compileAI(data('AI Model Inference',{...values,includeInput:'true'}),['X']).columns,['X','Pred']);
 assert.throws(()=>compileAI(data('AI Model Inference',values),['Y']),/Schema input/);
 assert.throws(()=>compileAI(data('AI Model Inference',{...values,modelTask:'execute'}),['X']),/task/);
});
