import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileGraph } from '../src/dataStudio/graphPreview.ts';
import { compilePreview } from '../src/dataStudio/pipelinePreview.ts';
import { compileRelational } from '../src/dataStudio/relationalPreview.ts';
import { relationalExample } from '../src/dataStudio/relationalExamples.ts';
for (const aggregate of [false, true]) test(`complete ${aggregate ? 'Aggregate/Pivot' : 'Filter/Combine'} graph compiles`, () => {
  const example = relationalExample(aggregate), result = compilePreview(example.nodes, example.edges);
  assert.equal(result.url, '/voice-api/api/studio/datasets/graph-spark-preview');
  assert.equal(result.body.sources.length, aggregate ? 1 : 2); assert.equal(result.body.outputs.length, aggregate ? 4 : 5);
  if (!aggregate) {
    const join = result.body.nodes.find(node => node.id === 'join'); assert.deepEqual(join.inputs, [{ node: 'append', port: 'main' }, { node: 'people', port: 'main' }]);
    assert.deepEqual(result.ports['split-join'].left_only, ['ID', 'Region', 'Amount']);
    assert.equal(result.ports.join.main.at(-1), 'right_Name');
  } else {
    assert.deepEqual(result.ports.pivot.main, ['Team', 'Jan', 'Feb']);
    assert.deepEqual(result.ports.unpivot.main, ['Team', 'Month', 'Total']);
    assert.deepEqual(result.ports.dynamic.main, ['Team', 'Metric', 'Value']);
  }
});
test('cycles, duplicate IDs, unused nodes, missing join side and obsolete branch ports reject preview', () => {
  const { nodes, edges } = relationalExample();
  for (const connections of [edges.filter(edge => !(edge.target === 'join' && edge.targetHandle === 'right')), edges.map(edge => edge.target === 'join' ? { ...edge, targetHandle: null } : edge), edges.map(edge => edge.source === 'split' ? { ...edge, sourceHandle: 'deleted' } : edge), [...edges, { source: 'join', target: 'append' }]]) assert.throws(() => compileGraph(nodes, connections));
  assert.throws(() => compileGraph([...nodes, nodes[0]], edges));
  assert.throws(() => compileGraph([...nodes, { id: 'unused', data: { label: 'Fixed Input', fixedColumns: ['x'], fixedRows: [['x']] } }], edges));
});
test('partial graph exposes Left and Right schemas while config is incomplete', () => {
  const { nodes, edges } = relationalExample(); nodes.find(node => node.id === 'join').data.utilityConfig.rows = [];
  const result = compileGraph(nodes, edges, {}, true);
  assert(result.errors.join); assert.deepEqual(result.inputColumns.join[1], ['ID', 'Name']);
});
test('append all/shared and join collision validation match output schemas', () => {
  assert.deepEqual(compileRelational({ label: 'Append Rows', utilityConfig: { values: { columns: 'shared' } } }, ['id', 'left'], ['id', 'right']).ports.main, ['id']);
  assert.throws(() => compileRelational({ label: 'Join Data', utilityConfig: { values: { prefix: '' }, rows: [{ id: 'key', column: 'id', output: 'id', kind: '', value: '' }] } }, ['id'], ['id']));
});
test('Direct Dataset graph sources stay as IDs and carry no SQL credentials', () => {
  const { nodes, edges } = relationalExample(true); nodes[0].data = { label: 'Input Dataset', datasetId: '00000000-0000-4000-8000-000000000001' };
  const result = compileGraph(nodes, edges, { '00000000-0000-4000-8000-000000000001': ['Team', 'Month', 'Value'] });
  assert.deepEqual(result.body.sources[0], { id: 'sales', kind: 'dataset', dataset_id: '00000000-0000-4000-8000-000000000001' });
});
