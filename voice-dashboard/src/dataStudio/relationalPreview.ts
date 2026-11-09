import { parseFormula } from './expressionPreview.ts';
import type { UtilityData } from './utilityPreview';
export const RELATIONAL_STEPS = ['Remove Duplicates', 'Split Filter', 'Append Rows', 'Join Data', 'Split Join', 'Group By', 'Rank & Window', 'Pivot', 'Unpivot', 'Dynamic Unpivot'];
export const JOIN_STEPS = ['Append Rows', 'Join Data', 'Split Join'];
export const AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'first', 'last'];
export const WINDOW_FUNCTIONS = ['row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist', 'ntile', 'lag', 'lead', 'running_sum', 'running_avg', 'running_count', 'running_min', 'running_max'];
export type Port = { id: string; label: string };
export function outputPorts(data: UtilityData): Port[] {
  if (data.label === 'Split Join') return [{ id: 'matched', label: 'Matched' }, { id: 'left_only', label: 'Left only' }, { id: 'right_only', label: 'Right only' }];
  if (data.label === 'Split Filter') return [...(data.utilityConfig?.rows ?? []).map(row => ({ id: `branch-${row.id}`, label: row.output || 'Filter' })), { id: 'else', label: data.utilityConfig?.values?.remaining || 'Else' }];
  return [{ id: 'main', label: 'Output' }];
}
export function compileRelational(data: UtilityData, left?: string[], right?: string[]) {
  const rows = data.utilityConfig?.rows ?? []; const values = data.utilityConfig?.values ?? {};
  const fail = (message: string): never => { throw new Error(`${data.label}: ${message}`); };
  const name = (value: string) => { const result = value.trim(); if (!result || result.length > 128) fail('isi nama kolom, maksimal 128 karakter.'); return result; };
  const source = (value: string, columns = left) => { if (!value || (columns && !columns.includes(value))) fail(`kolom ${value || 'sumber'} tidak tersedia.`); return value; };
  const names = (columns: string[]) => { if (!columns.length || columns.length > 30 || columns.some(item => !item || item.length > 128) || new Set(columns.map(item => item.toLowerCase())).size !== columns.length) fail('hasil harus memiliki 1–30 kolom unik.'); return columns; };
  const list = (key: string) => { const result = (values[key] ?? '').split('\n').filter(Boolean); result.forEach(item => source(item)); if (new Set(result).size !== result.length) fail('kolom tidak boleh berulang.'); return result; };
  const rules = () => { if (!rows.length || rows.length > 30) fail('tambahkan 1–30 aturan.'); };
  const aggregate = (row: (typeof rows)[number]) => {
    let op = row.kind || 'sum', column = row.column;
    if (!column && row.value) { const match = /^(sum|avg|min|max|count|count_distinct|first|last)\((.*)\)$/i.exec(row.value.trim()); if (match) { op = match[1].toLowerCase(); column = match[2].replace(/^`|`$/g, '').replaceAll('``', '`'); } }
    if (!AGGREGATIONS.includes(op)) fail('pilih fungsi agregasi.');
    if (!(op === 'count' && column === '*')) source(column);
    return { op, column, output: name(row.output), kind: row.value === 'Text' ? 'Text' : 'Number' };
  };
  const result = (operation: Record<string, unknown>, ports: Record<string, string[] | undefined>) => ({ steps: [operation], ports });
  if (data.label === 'Remove Duplicates') {
    const keys = list('keys'); const sensitivity = values.case ?? 'sensitive'; if (!['sensitive', 'insensitive'].includes(sensitivity)) fail('pilih sensitivitas huruf.');
    return result({ type: 'deduplicate', keys, insensitive: sensitivity === 'insensitive' }, { main: left });
  }
  if (data.label === 'Split Filter') {
    rules(); if (rows.length > 5) fail('maksimal lima cabang filter.');
    const labels = rows.map(row => name(row.output)); if (new Set(labels).size !== labels.length || new Set(rows.map(row => row.id)).size !== rows.length) fail('nama dan ID cabang harus unik.');
    const branches = rows.map(row => ({ port: `branch-${row.id}`, predicate: parseFormula(row.value, left) }));
    return result({ type: 'split_filter', branches }, Object.fromEntries(outputPorts(data).map(port => [port.id, left])));
  }
  if (data.label === 'Append Rows') {
    const mode = values.columns ?? 'all', conflict = values.conflict ?? 'compatible';
    if (!['all', 'shared'].includes(mode) || !['compatible', 'error'].includes(conflict)) fail('pilih mode kolom dan konflik tipe.');
    const output = left && right ? names(mode === 'shared' ? left.filter(item => right.includes(item)) : [...left, ...right.filter(item => !left.includes(item))]) : undefined;
    return result({ type: 'append', mode, conflict }, { main: output });
  }
  if (data.label === 'Join Data' || data.label === 'Split Join') {
    const join = data.label === 'Split Join' ? 'Inner' : values.join ?? 'Inner';
    if (!['Inner', 'Left Outer', 'Right Outer', 'Left Anti', 'Right Anti', 'Full Outer', 'Cross Join'].includes(join)) fail('pilih jenis join.');
    if (join !== 'Cross Join') rules();
    const keys = join === 'Cross Join' ? [] : rows.map(row => ({ left: source(row.column), right: source(row.output, right) }));
    if (keys.length > 10 || new Set(keys.map(key => `${key.left}\0${key.right}`)).size !== keys.length) fail('maksimal sepuluh pasangan kunci unik.');
    const prefix = values.prefix ?? 'right_'; if (prefix.length > 64) fail('prefix kanan maksimal 64 karakter.');
    const keyKind = values.keyKind ?? 'Text'; if (!['Text', 'Number'].includes(keyKind)) fail('pilih tipe kunci.');
    const nulls = values.nulls ?? 'distinct'; if (!['distinct', 'match'].includes(nulls)) fail('pilih perlakuan NULL.');
    const combined = left && right && !['Left Anti', 'Right Anti'].includes(join) ? names([...left, ...right.map(item => prefix + item)]) : undefined;
    const operation = { type: data.label === 'Split Join' ? 'split_join' : 'join', join, keys, prefix, key_kind: keyKind, nulls: nulls === 'match' };
    if (data.label === 'Split Join') return result(operation, { matched: combined, left_only: left, right_only: right });
    return result(operation, { main: join === 'Left Anti' ? left : join === 'Right Anti' ? right : combined });
  }
  if (data.label === 'Group By') {
    rules(); const groups = list('groups'), aggregates = rows.map(aggregate); const output = names([...groups, ...aggregates.map(row => row.output)]);
    return result({ type: 'group', groups, aggregates }, { main: output });
  }
  if (data.label === 'Rank & Window') {
    rules(); const partition = list('partition'), order = source(values.order ?? '');
    const direction = values.direction === 'Descending' ? 'desc' : 'asc', kind = values.orderKind ?? 'Number'; if (!['Text', 'Number', 'Date'].includes(kind)) fail('pilih tipe urutan.');
    const calculations = rows.map(row => {
      const op = row.kind || row.value.replace(/\(\)$/, '').toLowerCase() || 'row_number'; if (!WINDOW_FUNCTIONS.includes(op)) fail('pilih fungsi rank/window.');
      if (['lag', 'lead'].includes(op) || op.startsWith('running_')) source(row.column);
      const amount = ['ntile', 'lag', 'lead'].includes(op) ? Number(row.value || '1') : 1;
      if (!Number.isInteger(amount) || amount < (op === 'ntile' ? 1 : 0) || amount > 50) fail('offset/bucket harus 0–50 (ntile minimal 1).');
      return { op, column: row.column, output: name(row.output), amount };
    });
    return result({ type: 'window', partition, order, direction, kind, calculations }, { main: left ? names([...left, ...calculations.map(row => row.output)]) : undefined });
  }
  if (data.label === 'Pivot') {
    rules(); const groups = list('keys'), label = source(values.labelColumn ?? ''); if (groups.includes(label)) fail('kolom label tidak menjadi identitas baris.');
    const aggregates = rows.map(row => { if (row.value.length > 256) fail('nilai label maksimal 256 karakter.'); const spec = aggregate({ ...row, value: 'Number' }); return { ...spec, label: row.value }; });
    return result({ type: 'pivot', groups, label, aggregates }, { main: names([...groups, ...aggregates.map(row => row.output)]) });
  }
  if (data.label === 'Unpivot' || data.label === 'Dynamic Unpivot') {
    const label = name(values.label ?? 'attribute'), value = name(values.value ?? 'value');
    let keep: string[] | undefined, mappings: { column: string; label: string }[] | null;
    if (data.label === 'Dynamic Unpivot') { keep = list('keep'); mappings = left ? left.filter(item => !keep!.includes(item)).map(column => ({ column, label: column })) : null; }
    else { rules(); mappings = rows.map(row => ({ column: source(row.column), label: name(row.output || row.column) })); keep = left?.filter(column => !mappings!.some(row => row.column === column)); }
    if (mappings && !mappings.length) fail('pilih setidaknya satu kolom untuk unpivot.');
    return result({ type: 'unpivot', keep: keep ?? null, mappings, dynamic: data.label === 'Dynamic Unpivot', label, value, include_nulls: values.nulls !== 'exclude' }, { main: keep ? names([...keep, label, value]) : undefined });
  }
  return fail('komponen belum tersedia.');
}
