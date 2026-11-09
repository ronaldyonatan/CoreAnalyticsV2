import { compileAI, AI_STEPS } from './aiPreview.ts';
import { compilePerformance, PERFORMANCE_STEPS } from './performancePreview.ts';
import type { StoredColumns } from './performancePreview.ts';
import { compileScience, SCIENCE_STEPS, SUPERVISED_STEPS } from './dataSciencePreview.ts';
import { compileScripting, SCRIPTING_STEPS } from './scriptingPreview.ts';
import { compileText, TEXT_STEPS } from './textPreview.ts';
import type { TextData } from './textPreview.ts';
import { compileUtility, UTILITY_PREVIEW_STEPS } from './utilityPreview.ts';
import type { UtilityData } from './utilityPreview.ts';
import { compileRelational, JOIN_STEPS, outputPorts, RELATIONAL_STEPS } from './relationalPreview.ts';
import { parseFormula } from './expressionPreview.ts';
export type PreviewData = TextData & UtilityData & { datasetId?: string; fixedColumns?: string[]; fixedRows?: string[][]; columns?: string[]; renames?: Record<string, string>; rules?: { column: string; op: string; value: string }[]; filterExpression?: string; outputName?: string };
export type GraphNode = { id: string; data: PreviewData };
export type GraphEdge = { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
type Names = string[] | undefined;
type Ref = { node: string; port: string };
export function needsGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  return nodes.some(node => AI_STEPS.includes(node.data.label) || PERFORMANCE_STEPS.includes(node.data.label) || SCIENCE_STEPS.includes(node.data.label) || RELATIONAL_STEPS.includes(node.data.label) || SCRIPTING_STEPS.includes(node.data.label) || node.data.filterExpression?.trim()) || nodes.filter(node => ['Fixed Input', 'Input Dataset'].includes(node.data.label)).length > 1 || nodes.filter(node => node.data.label === 'Output Dataset').length > 1 || nodes.some(node => edges.filter(edge => edge.source === node.id).length > 1);
}
export function compileGraph(nodes: GraphNode[], edges: GraphEdge[], datasetColumns: Record<string, string[]> = {}, partial = false) {
  const ports: Record<string, Record<string, Names>> = {}, inputColumns: Record<string, Names[]> = {}, errors: Record<string, string> = {};
  const sources: Record<string, unknown>[] = [], operations: { id: string; inputs: Ref[]; steps: Record<string, unknown>[] }[] = [], outputs: { id: string; name: string; input: Ref }[] = [];
  const stores: Record<string, StoredColumns> = {}, availableStores: Record<string, StoredColumns[]> = {}, ancestors: Record<string, Set<string>> = {};
  const visited = new Set<string>(), visiting = new Set<string>();
  const fail = (message: string): never => { throw new Error(message); };
  const ids = nodes.map(node => node.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !id || id.length > 80)) fail('ID node harus unik dan maksimal 80 karakter.');
  if (!partial && (nodes.length > 30 || edges.length > 60)) fail('Preview graph maksimal 30 node dan 60 koneksi.');
  for (const edge of edges) { if (!ids.includes(edge.source) || !ids.includes(edge.target)) fail('Koneksi merujuk node yang sudah dihapus.'); if (nodes.find(node => node.id === edge.source)?.data.label === 'Output Dataset') fail('Output Dataset adalah ujung alur.'); }
  function visit(node: GraphNode) {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) fail('Graph tidak boleh memiliki hubungan berulang (cycle).');
    visiting.add(node.id);
    const incoming = edges.filter(edge => edge.target === node.id);
    incoming.forEach(edge => visit(nodes.find(item => item.id === edge.source)!));
    const ordered = JOIN_STEPS.includes(node.data.label) || SUPERVISED_STEPS.includes(node.data.label) ? [...incoming].sort((a, b) => (['left', 'train'].includes(a.targetHandle ?? '') ? 0 : 1) - (['left', 'train'].includes(b.targetHandle ?? '') ? 0 : 1)) : incoming;
    const refs = ordered.map(edge => ({ node: edge.source, port: edge.sourceHandle || 'main' }));
    inputColumns[node.id] = refs.map(ref => ports[ref.node]?.[ref.port]);
    ancestors[node.id] = new Set(refs.flatMap(ref => [ref.node, ...(ancestors[ref.node] ?? [])]));
    availableStores[node.id] = Object.values(stores).filter(store => ancestors[node.id].has(store.id));
    try {
      const { data } = node, source = ['Fixed Input', 'Input Dataset'].includes(data.label);
      if (SUPERVISED_STEPS.includes(data.label) ? !(incoming.length >= 1 && incoming.length <= 2 && ordered[0]?.targetHandle === 'train' && (incoming.length === 1 || ordered[1]?.targetHandle === 'predict')) : incoming.length !== (source ? 0 : JOIN_STEPS.includes(data.label) ? 2 : 1)) fail(`${data.label}: hubungkan ${SUPERVISED_STEPS.includes(data.label) ? 'Training dan Predict opsional' : source ? 'tanpa input' : JOIN_STEPS.includes(data.label) ? 'dua input Left dan Right' : 'tepat satu input'}.`);
      if (JOIN_STEPS.includes(data.label) && (ordered[0]?.targetHandle !== 'left' || ordered[1]?.targetHandle !== 'right')) fail(`${data.label}: gunakan port Left dan Right masing-masing satu kali.`);
      for (const ref of refs) if (!ports[ref.node] || !(ref.port in ports[ref.node])) fail('Pilih port output cabang yang tersedia.');
      if (data.label === 'Fixed Input') {
        const columns = (data.fixedColumns ?? []).map(name => name.trim()), rows = data.fixedRows ?? [];
        if (!columns.length || columns.length > 30 || columns.some(name => !name || name.length > 128) || new Set(columns.map(name => name.toLowerCase())).size !== columns.length || !rows.length || rows.length > 50 || rows.some(row => row.length !== columns.length || row.some(value => typeof value !== 'string' || value.length > 256))) fail('Fixed Input memerlukan 1–30 kolom unik dan 1–50 baris teks.');
        ports[node.id] = { main: columns }; sources.push({ id: node.id, kind: 'fixed', columns, rows });
      } else if (data.label === 'Input Dataset') {
        if (!data.datasetId) fail('Pilih dataset pada Input Dataset.');
        ports[node.id] = { main: datasetColumns[data.datasetId!] }; sources.push({ id: node.id, kind: 'dataset', dataset_id: data.datasetId });
      } else if (data.label === 'Output Dataset') {
        const name = data.outputName?.trim() || `Output ${outputs.length + 1}`; if (name.length > 150) fail('Nama output maksimal 150 karakter.');
        outputs.push({ id: node.id, name, input: refs[0] }); ports[node.id] = { main: inputColumns[node.id][0] };
      } else {
        const left = inputColumns[node.id][0], right = inputColumns[node.id][1];
        let steps: Record<string, unknown>[] = [];
        if (AI_STEPS.includes(data.label)) {
          const result = compileAI(data, left); steps = result.steps; ports[node.id] = { main: result.columns };
        } else if (PERFORMANCE_STEPS.includes(data.label)) {
          const result = compilePerformance(data, left, availableStores[node.id]); steps = result.steps; ports[node.id] = { main: result.columns };
          if (result.stored) stores[node.id] = { id: node.id, ...result.stored };
        } else if (SCIENCE_STEPS.includes(data.label)) {
          const result = compileScience(data, left, right); steps = result.steps; ports[node.id] = { main: result.columns };
        } else if (RELATIONAL_STEPS.includes(data.label)) {
          const result = compileRelational(data, left, right); steps = result.steps; ports[node.id] = result.ports;
        } else if (SCRIPTING_STEPS.includes(data.label)) {
          const result = compileScripting(data); steps = result.steps; ports[node.id] = { main: result.columns };
        } else if (TEXT_STEPS.includes(data.label) || UTILITY_PREVIEW_STEPS.includes(data.label)) {
          const result = TEXT_STEPS.includes(data.label) ? compileText(data, left) : compileUtility(data, left); steps = result.steps; ports[node.id] = { main: result.columns };
        } else if (data.label === 'Select Columns') {
          const selected = data.columns ?? [], renames = data.renames ?? {};
          if (!selected.length || selected.some(name => left && !left.includes(name)) || new Set(selected).size !== selected.length) fail('Pilih kolom Select Columns yang tersedia.');
          const names = selected.map(name => renames[name]?.trim() || name);
          if (names.some(name => name.length > 128) || new Set(names.map(name => name.toLowerCase())).size !== names.length) fail('Nama kolom hasil harus unik.');
          steps = [{ type: 'select', columns: selected, renames: Object.fromEntries(selected.map(name => [name, renames[name]?.trim() || name])) }]; ports[node.id] = { main: names };
        } else if (data.label === 'Filter Rows') {
          if (data.filterExpression?.trim()) steps = [{ type: 'expression_filter', predicate: parseFormula(data.filterExpression, left) }];
          else {
            if (!data.rules?.length) fail('Tambahkan aturan Filter Rows.');
            steps = data.rules!.map(rule => { if (!rule.column || (left && !left.includes(rule.column)) || !['eq', 'neq', 'null', 'notnull'].includes(rule.op) || rule.value.length > 256) fail('Aturan Filter Rows tidak valid.'); return { type: 'filter', column: rule.column, op: rule.op, value: ['null', 'notnull'].includes(rule.op) ? null : rule.value }; });
          }
          ports[node.id] = { main: left };
        } else fail(`${data.label}: preview belum tersedia.`);
        operations.push({ id: node.id, inputs: refs, steps });
      }
    } catch (error) {
      if (!partial) throw error;
      errors[node.id] = error instanceof Error ? error.message : 'Periksa node.';
      ports[node.id] = Object.fromEntries(outputPorts(node.data).map(port => [port.id, undefined]));
    }
    visiting.delete(node.id); visited.add(node.id);
  }
  nodes.forEach(visit);
  if (!partial) {
    if (!sources.length || sources.length > 4 || !outputs.length || outputs.length > 6 || operations.reduce((count, node) => count + node.steps.length, 0) > 30) fail('Graph memerlukan 1–4 sumber, 1–6 output, dan maksimal 30 langkah Spark.');
    if (operations.reduce((count, node) => count + node.steps.filter(step => step.type === 'script').length, 0) > 4) fail('Preview maksimal empat node scripting.');
    if (operations.reduce((count, node) => count + node.steps.filter(step => step.type === 'ai_llm').length, 0) > 4) fail('Preview maksimal empat tile generatif AI.');
    const used = new Set<string>();
    const mark = (id: string) => { if (used.has(id)) return; used.add(id); edges.filter(edge => edge.target === id).forEach(edge => mark(edge.source)); };
    outputs.forEach(output => mark(output.id)); if (used.size !== nodes.length) fail('Hubungkan seluruh node ke salah satu Output Dataset.');
  }
  return { url: '/voice-api/api/studio/datasets/graph-spark-preview', body: { sources, nodes: operations, outputs }, ports, inputColumns, errors, stores, availableStores };
}
