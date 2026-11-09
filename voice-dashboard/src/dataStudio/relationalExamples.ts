import type { GraphEdge, PreviewData } from './graphPreview';
export function relationalExample(aggregate = false) {
  const row = (id: string, column = '', output = '', kind = '', value = '') => ({ id, column, output, kind, value });
  const items: { id: string; data: PreviewData }[] = aggregate ? [
    { id: 'sales', data: { label: 'Fixed Input', fixedColumns: ['Team', 'Month', 'Value'], fixedRows: [['A', 'Jan', '10'], ['A', 'Jan', '5'], ['A', 'Feb', '20'], ['B', 'Jan', '7'], ['B', 'Feb', '3']] } },
    { id: 'group', data: { label: 'Group By', utilityConfig: { values: { groups: 'Team\nMonth' }, rows: [row('sum', 'Value', 'Total', 'sum'), row('count', '*', 'Count', 'count')] } } },
    { id: 'rank', data: { label: 'Rank & Window', utilityConfig: { values: { partition: 'Team', order: 'Total', direction: 'Descending', orderKind: 'Number' }, rows: [row('rank', '', 'Rank', 'rank'), row('running', 'Total', 'Running', 'running_sum')] } } },
    { id: 'pivot', data: { label: 'Pivot', utilityConfig: { values: { keys: 'Team', labelColumn: 'Month' }, rows: [row('jan', 'Total', 'Jan', 'sum', 'Jan'), row('feb', 'Total', 'Feb', 'sum', 'Feb')] } } },
    { id: 'unpivot', data: { label: 'Unpivot', utilityConfig: { values: { label: 'Month', value: 'Total' }, rows: [row('jan', 'Jan', 'Jan'), row('feb', 'Feb', 'Feb')] } } },
    { id: 'dynamic', data: { label: 'Dynamic Unpivot', utilityConfig: { values: { keep: 'Team', label: 'Metric', value: 'Value' } } } },
    { id: 'wide', data: { label: 'Output Dataset', outputName: 'Pivot' } },
    { id: 'long', data: { label: 'Output Dataset', outputName: 'Unpivot' } },
    { id: 'dynamic-output', data: { label: 'Output Dataset', outputName: 'Dynamic Unpivot' } },
    { id: 'rank-output', data: { label: 'Output Dataset', outputName: 'Group & Rank' } },
  ] : [
    { id: 'sales', data: { label: 'Fixed Input', fixedColumns: ['ID', 'Region', 'Amount'], fixedRows: [['1', 'west', '10'], ['2', 'east', '20'], ['2', 'east', '20'], ['3', 'west', '5']] } },
    { id: 'people', data: { label: 'Fixed Input', fixedColumns: ['ID', 'Name'], fixedRows: [['1', 'Andi'], ['2', 'Budi'], ['4', 'Citra']] } },
    { id: 'dedup', data: { label: 'Remove Duplicates', utilityConfig: { values: {} } } },
    { id: 'split', data: { label: 'Split Filter', utilityConfig: { rows: [row('high', '', 'High', '', 'Amount >= 10')] } } },
    { id: 'append', data: { label: 'Append Rows', utilityConfig: { values: {} } } },
    { id: 'join', data: { label: 'Join Data', utilityConfig: { values: { join: 'Full Outer' }, rows: [row('key', 'ID', 'ID')] } } },
    { id: 'split-join', data: { label: 'Split Join', utilityConfig: { rows: [row('key', 'ID', 'ID')] } } },
    { id: 'filter', data: { label: 'Filter Rows', filterExpression: 'Amount >= 15' } },
    { id: 'full', data: { label: 'Output Dataset', outputName: 'Full join' } },
    { id: 'matched', data: { label: 'Output Dataset', outputName: 'Matched' } },
    { id: 'left', data: { label: 'Output Dataset', outputName: 'Left only' } },
    { id: 'right', data: { label: 'Output Dataset', outputName: 'Right only' } },
    { id: 'filtered', data: { label: 'Output Dataset', outputName: 'Filtered' } },
  ];
  const connections: [string, string, string?, string?][] = aggregate ? [
    ['sales', 'group'], ['group', 'rank'], ['rank', 'pivot'], ['pivot', 'unpivot'], ['pivot', 'dynamic'], ['pivot', 'wide'], ['unpivot', 'long'], ['dynamic', 'dynamic-output'], ['rank', 'rank-output'],
  ] : [
    ['sales', 'dedup'], ['dedup', 'split'], ['split', 'append', 'branch-high', 'left'], ['split', 'append', 'else', 'right'],
    ['append', 'join', 'main', 'left'], ['people', 'join', 'main', 'right'], ['append', 'split-join', 'main', 'left'], ['people', 'split-join', 'main', 'right'],
    ['split', 'filter', 'branch-high'], ['join', 'full'], ['split-join', 'matched', 'matched'], ['split-join', 'left', 'left_only'], ['split-join', 'right', 'right_only'], ['filter', 'filtered'],
  ];
  const nodes = items.map((node, i) => ({ ...node, type: 'pipeline', position: { x: 50 + (i % 4) * 280, y: 60 + Math.floor(i / 4) * 210 } }));
  const edges: (GraphEdge & { id: string })[] = connections.map(([source, target, sourceHandle, targetHandle], i) => ({ id: `relational-edge-${i}`, source, target, sourceHandle: sourceHandle || 'main', targetHandle }));
  return { nodes, edges };
}
