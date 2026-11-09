import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compilePreview } from '../src/dataStudio/pipelinePreview.ts';
import { compileText } from '../src/dataStudio/textPreview.ts';
const input = { id: 'input', data: { label: 'Fixed Input', fixedColumns: ['Nama', 'Kota'], fixedRows: [['Andi', 'Jakarta'], ['Budi', 'Bandung']] } };
const output = { id: 'output', data: { label: 'Output Dataset' } };
const rule = (values = {}) => ({ id: 'rule', column: 'Nama', find: '', replace: '', output: '', operation: '', ...values });
function graph(data, source = input, after = []) {
  const chain = [source, { id: 'text', data }, ...after, output];
  return compilePreview(chain, chain.slice(1).map((node, i) => ({ source: chain[i].id, target: node.id })));
}
test('all Text components compile to Spark operations', () => {
  const configs = [
    [{ label: 'Combine Columns', textColumns: ['Nama', 'Kota'], textOutput: 'Full', textDelimiter: '|', textRemove: true }, 'combine'],
    [{ label: 'Replace Text', textRules: [rule({ find: '.', replace: '$1' })] }, 'replace'],
    [{ label: 'Split Column', filterColumn: 'Nama', textDelimiter: '|', splitNames: ['First', 'Last'] }, 'split'],
    [{ label: 'String Operations', textRules: [rule({ operation: 'substring', start: 1, length: 2, output: 'Part' })] }, 'string'],
    [{ label: 'String Operations', textRules: [rule({ operation: 'right_left_substring', side: 'right', length: 2, output: 'Part' })] }, 'string'],
    [{ label: 'String Operations', textRules: [rule({ operation: 'trim_spaces', trim: 'both', output: 'Part' })] }, 'string'],
    [{ label: 'String Operations', textRules: [rule({ operation: 'pad_with_space', side: 'left', width: 10, output: 'Part' })] }, 'string'],
    [{ label: 'Text Formatting', textRules: [rule({ operation: 'upper', numberHandling: 'remove_numbers' })] }, 'format'],
  ];
  for (const [data, type] of configs) assert.equal(graph(data).body.steps[0].type, type);
});
test('downstream select accepts Text outputs and rejects removed sources', () => {
  const data = { label: 'Combine Columns', textColumns: ['Nama', 'Kota'], textOutput: 'Full', textRemove: true };
  assert.equal(graph(data, input, [{ id: 'select', data: { label: 'Select Columns', columns: ['Full'] } }]).body.steps.length, 2);
  assert.throws(() => graph(data, input, [{ id: 'select', data: { label: 'Select Columns', columns: ['Nama'] } }]));
  assert.deepEqual(compileText(data, ['Nama', 'Kota']).columns, ['Full']);
});
test('Direct filters after Text run in Spark, preserving graph order', () => {
  const data = { label: 'String Operations', textRules: [rule({ operation: 'trim_spaces', trim: 'both', output: 'Clean' })] };
  const result = graph(data, { id: 'input', data: { label: 'Input Dataset', datasetId: 'dataset-id' } }, [{ id: 'filter', data: { label: 'Filter Rows', rules: [{ column: 'Clean', op: 'eq', value: 'Andi' }] } }]);
  assert.deepEqual(result.body.filters, {});
  assert.equal(result.body.steps[1].type, 'filter');
});
test('invalid parameters, collisions and result column limits reject preview', () => {
  const invalid = [
    { label: 'Combine Columns', textColumns: ['Nama'], textOutput: 'Full' },
    { label: 'Combine Columns', textColumns: ['Nama', 'Kota'], textOutput: 'nama' },
    { label: 'Replace Text', textRules: [rule()] },
    { label: 'Split Column', filterColumn: 'Nama', splitNames: ['First', 'first'] },
    { label: 'Split Column', filterColumn: 'Nama', splitNames: ['Kota'] },
    { label: 'String Operations', textRules: [rule({ output: 'Part', operation: 'substring', start: 0, length: 3 })] },
    { label: 'String Operations', textRules: [rule({ output: 'Kota', operation: 'trim_spaces', trim: 'both' })] },
    { label: 'Text Formatting', textRules: [rule()] },
  ];
  for (const data of invalid) assert.throws(() => graph(data));
  const large = { id: 'input', data: { label: 'Fixed Input', fixedColumns: Array.from({ length: 30 }, (_, i) => `C${i}`), fixedRows: [Array(30).fill('a')] } };
  assert.throws(() => graph({ label: 'Split Column', filterColumn: 'C0', splitNames: ['Extra'] }, large));
});
test('all Text nodes propagate schemas through a complete pipeline', () => {
  const chain = [input,
    { id: 'string', data: { label: 'String Operations', textRules: [rule({ output: 'Clean', operation: 'trim_spaces', trim: 'both' })] } },
    { id: 'format', data: { label: 'Text Formatting', textRules: [rule({ column: 'Clean', operation: 'upper' })] } },
    { id: 'replace', data: { label: 'Replace Text', textRules: [rule({ column: 'Kota', find: 'a', replace: '@' })] } },
    { id: 'combine', data: { label: 'Combine Columns', textColumns: ['Clean', 'Kota'], textOutput: 'Full', textDelimiter: '|', textRemove: true } },
    { id: 'split', data: { label: 'Split Column', filterColumn: 'Full', splitNames: ['Person', 'City'], textDelimiter: '|', textRemove: true } },
    { id: 'select', data: { label: 'Select Columns', columns: ['Person', 'City'] } }, output];
  const result = compilePreview(chain, chain.slice(1).map((node, i) => ({ source: chain[i].id, target: node.id })));
  assert.deepEqual(result.body.steps.map(step => step.type), ['string', 'format', 'replace', 'combine', 'split', 'select']);
});
test('multiple String Operations rules consume earlier rule outputs', () => {
  const result = compileText({ label: 'String Operations', textRules: [
    rule({ operation: 'trim_spaces', output: 'Clean', trim: 'both' }),
    rule({ id: 'second', column: 'Clean', operation: 'substring', output: 'Short', start: 1, length: 2 }),
  ] }, ['Nama', 'Kota']);
  assert.deepEqual(result.columns, ['Nama', 'Kota', 'Clean', 'Short']);
  assert.equal(result.steps[1].column, 'Clean');
});
