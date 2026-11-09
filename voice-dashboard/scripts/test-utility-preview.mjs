import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileUtility, metadataMatches } from '../src/dataStudio/utilityPreview.ts';
import { compilePreview } from '../src/dataStudio/pipelinePreview.ts';
import { compileQueries, parseFormula } from '../src/dataStudio/expressionPreview.ts';
const columns = ['Price', 'Qty', 'Day', 'Payload', 'Status'];
const row = (values = {}) => ({ id: 'r', column: '', output: '', kind: '', value: '', ...values });
const calculation = (values = {}) => ({ id: 'c', output: 'Total', operation: 'multiplication', leftKind: 'column', left: 'Price', rightKind: 'column', right: 'Qty', ...values });
const utility = (label, rows = [], values = {}) => ({ label, utilityConfig: { rows, values } });
test('all Calculator and Date Operations compile with operands and output schemas', () => {
  for (const operation of ['addition', 'subtraction', 'multiplication', 'division', 'power', 'ceiling', 'floor']) {
    const result = compileUtility({ label: 'Calculator', calculations: [calculation({ operation })] }, columns);
    assert.equal(result.steps[0].type, 'calculate'); assert(result.columns.includes('Total'));
  }
  for (const operation of ['Subtract from date', 'Add to date', 'Difference between dates', 'Year of date', 'Quarter of date', 'Month of date', 'Day of year', 'Day of month', 'Day of week', 'Week of year']) {
    const result = compileUtility({ label: 'Date Operations', calculations: [calculation({ operation, left: 'Day', rightKind: 'value', right: operation === 'Difference between dates' ? '2024-02-28' : '1' })] }, columns);
    assert.equal(result.steps[0].type, 'date');
  }
});
test('utility palette operations compile and propagate schemas', () => {
  const examples = [
    [utility('Add Constants', [row({ output: 'New', kind: 'Integer', value: '5' })]), 'constant'],
    [utility('Duplicate Column', [row({ column: 'Price', output: 'Copy' })]), 'duplicate'],
    [utility('Alter Columns', [row({ column: 'Price', output: 'Amount', kind: 'Integer' })], { drop: 'Qty' }), 'alter'],
    [utility('Get Schema'), 'schema'],
    [utility('JSON Expander', [row({ column: '$.items[0].price', output: 'Extract', kind: 'Integer' })], { source: 'Payload' }), 'json'],
    [utility('Limit', [], { Limit: '2', Offset: '1' }), 'limit'],
    [utility('Meta Select', [], { pattern: 'P*' }), 'meta_select'],
    [utility('Order', [row({ column: 'Price', kind: 'Descending', value: 'Number' })]), 'order'],
    [utility('Series'), 'series'],
    [utility('SQL', [], { sql: 'SELECT Price, Qty FROM input WHERE Price > 2 ORDER BY Qty DESC LIMIT 5 OFFSET 1' }), 'query'],
    [utility('SQL Script', [], { sql: 'SELECT Price AS Amount FROM input; SELECT Amount FROM input' }), 'query'],
    [utility('Value Mapper', [row({ column: 'A', output: 'Active' })], { source: 'Status' }), 'mapper'],
    [{ label: 'Add Formula', formulas: [{ id: 'f', name: 'Total', expression: '`Price` * `Qty`' }] }, 'formula'],
  ];
  for (const [data, type] of examples) assert.equal(compileUtility(data, columns).steps[0].type, type, data.label);
  assert.deepEqual(compileUtility(utility('Meta Select', [], { pattern: 'P*' }), columns).columns, ['Price', 'Payload']);
  assert.deepEqual(compileUtility(utility('Get Schema'), columns).columns, ['name', 'expr', 'type']);
});
test('formula precedence, quoted identifiers, null predicates and functions', () => {
  const ast = parseFormula('(`Price` + 2) * Qty / 3', columns);
  assert.equal(ast.op, '/'); assert.equal(ast.left.op, '*'); assert.equal(ast.left.left.op, '+');
  assert.equal(parseFormula("coalesce(upper(Status), 'unknown')", columns).name, 'coalesce');
  assert.equal(parseFormula('NOT (Price IS NULL) AND Price >= 2', columns).op, 'AND');
  assert.equal(parseFormula('`a``b` + 1', ['a`b']).left.name, 'a`b');
});
test('SQL Script consumes previous output schemas and literal semicolons', () => {
  const result = compileQueries("SELECT Price AS Amount, 'a;b' AS Marker FROM input; SELECT Amount * 2 AS Doubled FROM input", columns, true);
  assert.equal(result.steps.length, 2); assert.deepEqual(result.columns, ['Doubled']);
  assert.throws(() => compileQueries('SELECT Price AS Amount FROM input; SELECT Price FROM input', columns, true));
});
test('unsafe or unsupported expression/SQL syntax never compiles', () => {
  for (const source of ["reflect('java.lang.Runtime')", 'foo(1)', 'Price.__class__', 'Price +', '1e999', 'missing + 1']) assert.throws(() => parseFormula(source, columns), source);
  for (const sql of ['DROP TABLE input', 'SELECT * FROM other', "SELECT * FROM parquet.'/tmp/x'", 'SELECT * FROM input; DROP TABLE input', 'SELECT * FROM input LIMIT 51', 'SELECT * FROM input CROSS JOIN other', 'SELECT Price, Price FROM input', 'SELECT Price FROM input WHERE exists(1)']) assert.throws(() => compileQueries(sql, columns, true), sql);
});
test('invalid utility parameters and schema collisions disable preview', () => {
  const invalid = [
    utility('Add Constants', [row({ output: 'price', kind: 'Integer', value: '5' })]),
    utility('Alter Columns', [row({ column: 'Price', output: 'Qty' })]),
    utility('JSON Expander', [row({ column: '$..*', output: 'New' })], { source: 'Payload' }),
    utility('Limit', [], { Limit: '51' }), utility('Series', [], { 'Jumlah baris': '0' }),
    utility('Meta Select', [], { pattern: 'missing*' }),
    { label: 'Calculator', calculations: [calculation({ leftKind: 'value', left: 'NaN' })] },
    { label: 'Date Operations', calculations: [calculation({ operation: 'Year of date', leftKind: 'value', left: '2026-02-30' })] },
  ];
  for (const data of invalid) assert.throws(() => compileUtility(data, columns), data.label);
});
test('entire pipeline handles generated Utility columns and post-transform filters', () => {
  const chain = [
    { id: 'input', data: { label: 'Fixed Input', fixedColumns: ['Price', 'Qty'], fixedRows: [['10', '2']] } },
    { id: 'calc', data: { label: 'Calculator', calculations: [calculation()] } },
    { id: 'constant', data: utility('Add Constants', [row({ output: 'Fee', kind: 'Integer', value: '5' })]) },
    { id: 'formula', data: { label: 'Add Formula', formulas: [{ id: 'f', name: 'Final', expression: 'Total + Fee' }] } },
    { id: 'select', data: { label: 'Select Columns', columns: ['Final'] } },
    { id: 'output', data: { label: 'Output Dataset' } },
  ];
  const result = compilePreview(chain, chain.slice(1).map((node, i) => ({ source: chain[i].id, target: node.id })));
  assert.deepEqual(result.body.steps.map(step => step.type), ['calculate', 'constant', 'formula', 'select']);
});

test('Meta Select wildcard matching is bounded and treats other symbols literally', () => {
  assert(metadataMatches('Amount*', 'Amount2026'));
  assert(metadataMatches('a?', 'a😀'));
  assert(metadataMatches('[a].*', '[a].value'));
  assert(!metadataMatches('[a].*', 'avalue'));
  assert(!metadataMatches('*a'.repeat(60) + 'b', 'a'.repeat(128)));
});
