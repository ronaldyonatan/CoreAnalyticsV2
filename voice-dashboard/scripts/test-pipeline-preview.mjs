import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compilePreview } from '../src/dataStudio/pipelinePreview.ts';

const input = { id: 'input', data: { label: 'Fixed Input', fixedColumns: ['Nama', 'Kota'], fixedRows: [['Andi', 'Jakarta'], ['Budi', 'Bandung']] } };
const select = { id: 'select', data: { label: 'Select Columns', columns: ['Nama'] } };
const output = { id: 'output', data: { label: 'Output Dataset' } };
const nodes = [input, select, output];
const edges = [{ source: 'input', target: 'select' }, { source: 'select', target: 'output' }];

test('2 × 2 input compiles to one selected column for the real Spark endpoint', () => {
  assert.deepEqual(compilePreview(nodes, edges), {
    url: '/voice-api/api/studio/datasets/fixed-spark-preview',
    body: { columns: ['Nama', 'Kota'], rows: input.data.fixedRows, steps: [{ type: 'select', columns: ['Nama'], renames: { Nama: 'Nama' } }] },
  });
});
test('disconnected, cyclic, and branching graphs cannot enable preview', () => {
  for (const graph of [[], [edges[0]], [...edges, { source: 'select', target: 'input' }], [...edges, { source: 'input', target: 'output' }]]) {
    assert.throws(() => compilePreview(nodes, graph));
  }
});
test('removed columns and duplicate aliases cannot enable preview', () => {
  assert.throws(() => compilePreview([input, { ...select, data: { ...select.data, columns: ['Removed'] } }, output], edges));
  assert.throws(() => compilePreview([input, { ...select, data: { ...select.data, columns: ['Nama', 'Kota'], renames: { Kota: 'nama' } } }, output], edges));
});
test('empty selection and oversized or duplicate input are rejected', () => {
  assert.throws(() => compilePreview([input, { ...select, data: { ...select.data, columns: [] } }, output], edges));
  for (const fixedColumns of [['Nama', 'nama'], ['Nama', ' ']]) {
    assert.throws(() => compilePreview([{ ...input, data: { ...input.data, fixedColumns } }, select, output], edges));
  }
  assert.throws(() => compilePreview([{ ...input, data: { ...input.data, fixedRows: Array(51).fill(['A', 'B']) } }, select, output], edges));
});
test('fixed filter after select targets the selected alias in Spark', () => {
  const filter = { id: 'filter', data: { label: 'Filter Rows', rules: [{ column: 'Pelanggan', op: 'eq', value: 'Andi' }] } };
  const result = compilePreview([input, { ...select, data: { ...select.data, renames: { Nama: 'Pelanggan' } } }, filter, output],
    [edges[0], { source: 'select', target: 'filter' }, { source: 'filter', target: 'output' }]);
  assert.deepEqual(result.body.steps[1], { type: 'filter', column: 'Pelanggan', op: 'eq', value: 'Andi' });
});
test('unsupported draft operations cannot enable preview', () => {
  assert.throws(() => compilePreview([input, { id: 'select', data: { label: 'Python Script' } }, output], edges), /Python Script/);
});
test('Direct Dataset keeps SQL filters before Spark select', () => {
  const filter = { id: 'filter', data: { label: 'Filter Rows', rules: [{ column: 'Nama', op: 'eq', value: 'Andi' }] } };
  const result = compilePreview([{ id: 'input', data: { label: 'Input Dataset', datasetId: 'dataset-id' } }, filter, select, output],
    [{ source: 'input', target: 'filter' }, { source: 'filter', target: 'select' }, edges[1]]);
  assert.deepEqual(result.body.filters, { Nama: { mode: 'include', values: ['Andi'] } });
  assert.equal(result.body.steps.length, 1);
});
