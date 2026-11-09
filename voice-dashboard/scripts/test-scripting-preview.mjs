import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileScripting, scriptingExample } from '../src/dataStudio/scriptingPreview.ts';
import { compilePreview } from '../src/dataStudio/pipelinePreview.ts';
import { compileGraph } from '../src/dataStudio/graphPreview.ts';
const row = (output, kind = 'Text') => ({ id: output, output, kind, column: '', value: '' });
test('Python and R compile code and explicit output schema without evaluating it', () => {
  for (const label of ['Python Script', 'R Script']) {
    const result = compileScripting({ label, utilityConfig: { values: { code: label === 'Python Script' ? 'output = df.copy()' : 'output <- df' }, rows: [row('Name'), row('Total', 'Floating Decimal')] } });
    assert.deepEqual(result.columns, ['Name', 'Total']);
    assert.equal(result.steps[0].language, label === 'Python Script' ? 'python' : 'r');
    assert.equal(result.steps[0].type, 'script');
  }
});
test('Python/R example propagates schemas and keeps separate outputs', () => {
  const example = scriptingExample(), result = compilePreview(example.nodes, example.edges);
  assert.equal(result.url, '/voice-api/api/studio/datasets/graph-spark-preview');
  assert.deepEqual(result.body.nodes.map(node => node.steps[0].language), ['python', 'r']);
  assert.deepEqual(result.ports['script-python'].main, ['Nama', 'Total']);
  assert.deepEqual(result.inputColumns['script-r'][0], ['Nama', 'Total']);
  assert.deepEqual(result.ports['script-r'].main, ['Nama', 'Total', 'Kategori']);
  assert.equal(result.body.outputs.length, 2);
});
test('empty code, long code, duplicate output names and invalid types cannot enable preview', () => {
  for (const config of [
    { values: { code: '' }, rows: [row('x')] },
    { values: { code: 'x'.repeat(8001) }, rows: [row('x')] },
    { values: { code: 'output = df' }, rows: [] },
    { values: { code: 'output = df' }, rows: [row('x'), row('X')] },
    { values: { code: 'output = df' }, rows: [row('x', 'ArbitraryType')] },
  ]) assert.throws(() => compileScripting({ label: 'Python Script', utilityConfig: config }));
});
test('partial inspection exposes script output columns only after valid configuration', () => {
  const example = scriptingExample(); example.nodes[1].data.utilityConfig.rows = [];
  const inspected = compileGraph(example.nodes, example.edges, {}, true);
  assert(inspected.errors['script-python']);
});
