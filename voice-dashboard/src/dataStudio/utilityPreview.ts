import { compileQueries, parseFormula } from './expressionPreview.ts';
import type { Config } from './UtilityDraft';
export const UTILITY_PREVIEW_STEPS = ['Calculator', 'Date Operations', 'Add Constants', 'Add Formula', 'Alter Columns', 'Duplicate Column', 'Get Schema', 'JSON Expander', 'Limit', 'Meta Select', 'Order', 'Series', 'SQL', 'SQL Script', 'Value Mapper'];
export const CAST_TYPES = ['Text', 'Floating Decimal', 'Fixed Decimal', 'Integer', 'Date', 'Timestamp', 'Boolean', 'Null'];
export type Calculation = { id: string; output: string; operation: string; leftKind: string; left: string; rightKind: string; right: string; unit?: string };
export type UtilityData = { label: string; calculations?: Calculation[]; formulas?: { id: string; name: string; expression: string }[]; utilityConfig?: Config };
const numeric = (value: string) => value.trim() !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value));
export function metadataMatches(pattern: string, name: string) {
  const chars = Array.from(name); let previous = [true, ...chars.map(() => false)];
  for (const token of Array.from(pattern)) {
    const next = [token === '*' && previous[0]];
    for (let i = 1; i <= chars.length; i++) next[i] = token === '*' ? previous[i] || next[i - 1] : previous[i - 1] && (token === '?' || token === chars[i - 1]);
    previous = next;
  }
  return previous[chars.length];
}
export function compileUtility(data: UtilityData, available?: string[]) {
  let columns = available?.slice(); const steps: Record<string, unknown>[] = [];
  const config = data.utilityConfig ?? {}; const rows = config.rows ?? []; const values = config.values ?? {};
  const fail = (message: string): never => { throw new Error(`${data.label}: ${message}`); };
  const source = (name: string) => { if (!name || (columns && !columns.includes(name))) fail(`kolom ${name || 'sumber'} tidak tersedia.`); };
  const name = (value: string) => { const result = value.trim(); if (!result || result.length > 128) fail('isi nama kolom, maksimal 128 karakter.'); return result; };
  const unique = (names: string[]) => { if (!names.length || names.length > 30 || new Set(names.map(item => item.toLowerCase())).size !== names.length) fail('hasil harus memiliki 1–30 kolom dengan nama unik.'); };
  const add = (value: string, overwrite?: string) => { const output = name(value); if (output !== overwrite && columns?.some(item => item.toLowerCase() === output.toLowerCase())) fail(`nama ${output} sudah dipakai.`); if (columns && output !== overwrite) columns.push(output); if (columns) unique(columns); return output; };
  const text = (value: string) => { if (value.length > 256) fail('nilai maksimal 256 karakter.'); return value; };
  const kind = (value: string, optional = false) => { if (!(optional && !value) && !CAST_TYPES.includes(value)) fail('pilih tipe data yang tersedia.'); return value; };
  const integer = (value: string, min: number, max: number) => { if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) fail(`isi bilangan bulat ${min}–${max}.`); return Number(value); };
  const boundedRows = () => { if (!rows.length || rows.length > 30) fail('tambahkan 1–30 aturan.'); };
  const operand = (mode: string, value: string, date = false) => {
    if (mode === 'column') source(value);
    else if (mode === 'value') { if (date ? !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value : !numeric(value)) fail(date ? 'isi tanggal ISO YYYY-MM-DD.' : 'isi nilai angka yang valid.'); }
    else fail('pilih Column atau Value.');
    return { kind: mode, value };
  };
  if (data.label === 'Calculator' || data.label === 'Date Operations') {
    const rules = data.calculations ?? []; if (!rules.length || rules.length > 30) fail('tambahkan 1–30 operasi.');
    for (const rule of rules) {
      const date = data.label === 'Date Operations';
      const allowed = date ? ['Subtract from date', 'Add to date', 'Difference between dates', 'Year of date', 'Quarter of date', 'Month of date', 'Day of year', 'Day of month', 'Day of week', 'Week of year'] : ['addition', 'subtraction', 'multiplication', 'division', 'power', 'ceiling', 'floor'];
      if (!allowed.includes(rule.operation)) fail('pilih operasi yang tersedia.');
      const left = operand(rule.leftKind, rule.left, date);
      const binary = date ? ['Subtract from date', 'Add to date', 'Difference between dates'].includes(rule.operation) : !['ceiling', 'floor'].includes(rule.operation);
      const right = binary ? operand(rule.rightKind, rule.right, date && rule.operation === 'Difference between dates') : null;
      const unit = rule.unit ?? 'days'; if (date && !['days', 'months', 'years'].includes(unit)) fail('pilih satuan tanggal.');
      const output = add(rule.output, rule.leftKind === 'column' ? rule.left : undefined);
      steps.push({ type: date ? 'date' : 'calculate', output, op: rule.operation, left, right, ...(date ? { unit } : {}) });
    }
  } else if (data.label === 'Add Formula') {
    const rules = data.formulas ?? []; if (!rules.length || rules.length > 30) fail('tambahkan 1–30 formula.');
    for (const rule of rules) { const expression = parseFormula(rule.expression, columns); steps.push({ type: 'formula', output: add(rule.name), expression }); }
  } else if (data.label === 'SQL' || data.label === 'SQL Script') {
    return compileQueries(values.sql ?? '', columns, data.label === 'SQL Script');
  } else if (data.label === 'Add Constants') {
    boundedRows(); for (const row of rows) steps.push({ type: 'constant', output: add(row.output), kind: kind(row.kind), value: text(row.value) });
  } else if (data.label === 'Duplicate Column') {
    boundedRows(); for (const row of rows) { source(row.column); steps.push({ type: 'duplicate', column: row.column, output: add(row.output) }); }
  } else if (data.label === 'Alter Columns') {
    const drop = (values.drop ?? '').split('\n').filter(Boolean); drop.forEach(source);
    const changes = rows.filter(row => row.column || row.output || row.kind).map(row => { source(row.column); return { column: row.column, output: name(row.output || row.column), kind: kind(row.kind, true) }; });
    if (!changes.length && !drop.length) fail('pilih perubahan atau kolom yang dihapus.');
    if (changes.length > 30 || new Set(changes.map(row => row.column)).size !== changes.length) fail('ubah setiap kolom paling banyak satu kali.');
    if (changes.some(row => drop.includes(row.column))) fail('kolom yang diubah tidak dapat sekaligus dihapus.');
    columns = columns?.filter(column => !drop.includes(column)).map(column => changes.find(row => row.column === column)?.output ?? column);
    if (columns) unique(columns);
    steps.push({ type: 'alter', changes, drop });
  } else if (data.label === 'Get Schema') {
    columns = [name(values['Nama kolom Names'] ?? 'name'), name(values['Nama kolom Expressions'] ?? 'expr'), name(values['Nama kolom Types'] ?? 'type')]; unique(columns);
    steps.push({ type: 'schema', names: columns });
  } else if (data.label === 'JSON Expander') {
    source(values.source ?? ''); boundedRows();
    const mappings = rows.map(row => {
      if (!/^\$(?:\.[\p{L}_][\p{L}\p{N}_]*|\[\d{1,3}\]){1,12}$/u.test(row.column) || row.column.length > 256) fail('path JSON harus seperti $.customer.name atau $.items[0].price.');
      return { path: row.column, output: add(row.output), kind: kind(row.kind || 'Text') };
    });
    steps.push({ type: 'json', column: values.source, mappings });
  } else if (data.label === 'Limit') {
    steps.push({ type: 'limit', count: integer(values.Limit ?? '50', 0, 50), offset: integer(values.Offset ?? '0', 0, 50) });
  } else if (data.label === 'Series') {
    const output = name(values['Nama kolom baru'] ?? 'Row count'); columns = [output];
    steps.push({ type: 'series', output, count: integer(values['Jumlah baris'] ?? '10', 1, 50), start: integer(values.Start ?? '0', -1000000, 1000000), step: integer(values.Step ?? '1', -1000000, 1000000) });
  } else if (data.label === 'Order') {
    boundedRows();
    const order = rows.map(row => { source(row.column); if (row.kind && !['Ascending', 'Descending'].includes(row.kind)) fail('pilih arah urutan.'); if (row.value && !['Text', 'Number', 'Date'].includes(row.value)) fail('pilih tipe pengurutan.'); return { column: row.column, direction: row.kind === 'Descending' ? 'desc' : 'asc', kind: row.value || 'Text' }; });
    if (new Set(order.map(item => item.column)).size !== order.length) fail('kolom urutan tidak boleh berulang.');
    steps.push({ type: 'order', items: order });
  } else if (data.label === 'Meta Select') {
    const selected = (values.columns ?? '').split('\n').filter(Boolean); selected.forEach(source);
    const pattern = values.pattern ?? '*'; if (!pattern || pattern.length > 128) fail('isi pola nama kolom, maksimal 128 karakter.');
    columns = columns?.filter(column => (!selected.length || selected.includes(column)) && metadataMatches(pattern, column)); if (columns) unique(columns);
    steps.push({ type: 'meta_select', columns: selected, pattern });
  } else if (data.label === 'Value Mapper') {
    source(values.source ?? ''); boundedRows();
    const output = values.destination === 'new' ? add(values.output ?? '') : values.source;
    const mappings = rows.map(row => [text(row.column), text(row.output)]);
    if (new Set(mappings.map(row => row[0])).size !== mappings.length) fail('nilai mapping asal tidak boleh berulang.');
    if (!['keep', 'default'].includes(values.unmatched ?? 'keep')) fail('pilih perlakuan nilai yang tidak cocok.');
    steps.push({ type: 'mapper', column: values.source, output, kind: kind(values.kind ?? '', true), mappings, unmatched: values.unmatched ?? 'keep', default: text(values.default ?? '') });
  } else fail('operasi belum tersedia.');
  return { steps, columns };
}
