import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePerformance, performanceExample, PERFORMANCE_STEPS } from '../src/dataStudio/performancePreview.ts';
import { compileGraph } from '../src/dataStudio/graphPreview.ts';
import { compilePreview, PREVIEW_STEPS } from '../src/dataStudio/pipelinePreview.ts';
for (const language of ['python','r']) test(`Performance ${language} compiles reduced script schema and restores omitted columns`, () => {
  const example = performanceExample(language), result = compilePreview(example.nodes, example.edges);
  assert.equal(result.url, '/voice-api/api/studio/datasets/graph-spark-preview');
  assert.ok(PERFORMANCE_STEPS.every(s => PREVIEW_STEPS.includes(s)));
  assert.deepEqual(result.ports['performance-1'].main, ['Harga','Jumlah','RestoreKey']);
  assert.deepEqual(result.inputColumns['performance-2'][0], ['Harga','Jumlah','RestoreKey']);
  assert.deepEqual(result.ports['performance-3'].main, ['Total','Nama','Kota']);
  assert.deepEqual(result.availableStores['performance-3'], [{id:'performance-1',key:'RestoreKey',columns:['Nama','Kota']}]);
  assert.equal(result.body.nodes[2].steps[0].store,'performance-1');
});
test('reject missing keys, unknown stores, duplicate columns and restore collisions', () => {
  const store = {id:'store',key:'Key',columns:['Nama']};
  const data = (label,values) => ({label,utilityConfig:{values}});
  assert.throws(()=>compilePerformance(data('Select and Store Columns',{features:'["X"]',output:'nama'}),['X','Nama']),/kunci/);
  assert.throws(()=>compilePerformance(data('Select and Store Columns',{features:'[]',output:'Key'}),['X']),/kolom/);
  assert.throws(()=>compilePerformance(data('Select and Store Columns',{features:'["Gone"]',output:'Key'}),['X']),/kolom/);
  assert.throws(()=>compilePerformance(data('Restore Columns',{store:'store'}),['X'],[store]),/Kunci/);
  assert.throws(()=>compilePerformance(data('Restore Columns',{store:'store'}),['X','Key','nama'],[store]),/benturan/);
  assert.throws(()=>compilePerformance(data('Restore Columns',{store:'gone'}),['Key'],[store]),/Pilih penyimpanan/);
});
test('a sibling store cannot be referenced; partial inspection explains missing key', () => {
  const {nodes,edges}=performanceExample();
  const other={id:'sibling',data:{label:'Restore Columns',utilityConfig:{values:{store:'performance-1'}}}};
  const output={id:'sibling-output',data:{label:'Output Dataset'}};
  assert.throws(()=>compileGraph([...nodes,other,output],[...edges,{source:'performance-0',target:'sibling'},{source:'sibling',target:'sibling-output'}]),/jalur input/);
  const script=nodes.find(n=>n.id==='performance-2');script.data.utilityConfig.rows=script.data.utilityConfig.rows.filter(r=>r.output!=='RestoreKey');
  const partial=compileGraph(nodes,edges,{},true);
  assert.match(partial.errors['performance-3'],/Kunci RestoreKey/);
  assert.deepEqual(partial.availableStores['performance-3'][0].columns,['Nama','Kota']);
});
test('nested stores restore their own columns while the other key remains available', () => {
  const source={id:'source',data:{label:'Fixed Input',fixedColumns:['A','B','C'],fixedRows:[['a','b','c']]}};
  const make=(id,label,values)=>({id,data:{label,utilityConfig:{values}}});
  const nodes=[source,make('outer','Select and Store Columns',{features:'["A","B"]',output:'Outer'}),make('inner','Select and Store Columns',{features:'["A","Outer"]',output:'Inner'}),make('restore-inner','Restore Columns',{store:'inner'}),make('restore-outer','Restore Columns',{store:'outer'}),{id:'output',data:{label:'Output Dataset'}}];
  const result=compileGraph(nodes,nodes.slice(1).map((n,i)=>({source:nodes[i].id,target:n.id})));
  assert.deepEqual(result.ports['restore-outer'].main,['A','B','C']);
});
