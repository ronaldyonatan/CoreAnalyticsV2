import { AI_STEPS } from './aiPreview.ts';
import { PERFORMANCE_STEPS } from './performancePreview.ts';
import { SCIENCE_STEPS } from './dataSciencePreview.ts';
import { compileGraph, needsGraph } from './graphPreview.ts';
import { SCRIPTING_STEPS } from './scriptingPreview.ts';
import { RELATIONAL_STEPS } from './relationalPreview.ts';
import type { GraphNode, GraphEdge } from './graphPreview.ts';
import { compileText, TEXT_STEPS } from './textPreview.ts';
import { compileUtility, UTILITY_PREVIEW_STEPS } from './utilityPreview.ts';

/** Compile only operations supported by the bounded Spark preview worker. */
export const PREVIEW_STEPS = ['Fixed Input', 'Input Dataset', 'Select Columns', 'Filter Rows', 'Output Dataset', ...TEXT_STEPS, ...UTILITY_PREVIEW_STEPS, ...RELATIONAL_STEPS, ...SCRIPTING_STEPS, ...SCIENCE_STEPS, ...PERFORMANCE_STEPS, ...AI_STEPS];

export function compilePreview(nodes: GraphNode[], edges: GraphEdge[], datasetColumns: Record<string, string[]> = {}) {
  if (needsGraph(nodes, edges)) return compileGraph(nodes, edges, datasetColumns);
  const inputs = nodes.filter(node => ['Fixed Input', 'Input Dataset'].includes(node.data.label));
  if (inputs.length !== 1 || nodes.filter(node => node.data.label === 'Output Dataset').length !== 1) {
    throw new Error('Gunakan tepat satu Fixed Input atau Input Dataset, dan satu Output Dataset.');
  }
  let current = inputs[0];
  const ordered = [current];
  while (current.data.label !== 'Output Dataset') {
    const outgoing = edges.filter(edge => edge.source === current.id);
    if (outgoing.length !== 1) throw new Error('Hubungkan node menjadi satu alur dari input sampai output.');
    const next = nodes.find(node => node.id === outgoing[0].target);
    if (!next || ordered.includes(next) || edges.filter(edge => edge.target === next.id).length !== 1) {
      throw new Error('Alur tidak valid: periksa cabang atau hubungan berulang.');
    }
    current = next;
    ordered.push(current);
  }
  if (ordered.length !== nodes.length || edges.length !== nodes.length - 1) {
    throw new Error('Hubungkan seluruh node ke alur input dan output.');
  }
  const unsupported = ordered.find(node => !PREVIEW_STEPS.includes(node.data.label));
  if (unsupported) throw new Error(`Preview ${unsupported.data.label} belum tersedia.`);
  const input = inputs[0].data;
  const fixed = input.label === 'Fixed Input';
  const columns = (input.fixedColumns ?? []).map(name => name.trim());
  const rows = input.fixedRows ?? [];
  if (fixed && (!columns.length || columns.length > 30 || columns.some(name => !name || name.length > 128) || new Set(columns.map(name => name.toLowerCase())).size !== columns.length || !rows.length || rows.length > 50 || rows.some(row => row.length !== columns.length || row.some(cell => cell.length > 256)))) {
    throw new Error('Isi 1–30 kolom unik dan 1–50 baris pada Fixed Input (maksimal 256 karakter per nilai).');
  }
  if (!fixed && !input.datasetId) throw new Error('Pilih dataset pada node Input Dataset.');
  let available: string[] | undefined = fixed ? columns : undefined;
  let selected = false;
  const steps: Record<string, unknown>[] = [];
  const filters: Record<string, { mode: 'include' | 'exclude'; values: (string | null)[] }> = {};
  for (const { data } of ordered.slice(1, -1)) {
    if (data.label === 'Select Columns') {
      const names = data.columns ?? [];
      if (!names.length || names.length > 30 || new Set(names).size !== names.length || names.some(name => available && !available.includes(name))) {
        throw new Error('Pilih setidaknya satu kolom yang tersedia pada Select Columns.');
      }
      const renames = Object.fromEntries(names.map(name => [name, data.renames?.[name]?.trim() || name]));
      available = names.map(name => renames[name]);
      if (available.some(name => name.length > 128) || new Set(available.map(name => name.toLowerCase())).size !== available.length) {
        throw new Error('Nama kolom hasil harus unik dan maksimal 128 karakter.');
      }
      steps.push({ type: 'select', columns: names, renames });
      selected = true;
    } else if (data.label === 'Filter Rows') {
      if (!data.rules?.length) throw new Error('Tambahkan setidaknya satu aturan Filter Rows.');
      for (const rule of data.rules) {
        if (!rule.column || (available && !available.includes(rule.column)) || !['eq', 'neq', 'null', 'notnull'].includes(rule.op) || rule.value.length > 256) {
          throw new Error('Periksa kolom dan nilai aturan Filter Rows.');
        }
        const value = rule.op === 'null' || rule.op === 'notnull' ? null : rule.value;
        if (fixed || selected) steps.push({ type: 'filter', column: rule.column, op: rule.op, value });
        else {
          if (filters[rule.column]) throw new Error('Preview Input Dataset mendukung satu aturan per kolom.');
          filters[rule.column] = { mode: rule.op === 'neq' || rule.op === 'notnull' ? 'exclude' : 'include', values: [value] };
        }
      }
    } else if (TEXT_STEPS.includes(data.label)) {
      const result = compileText(data, available);
      steps.push(...result.steps); available = result.columns; selected = true;
    } else if (UTILITY_PREVIEW_STEPS.includes(data.label)) {
      const result = compileUtility(data, available);
      steps.push(...result.steps); available = result.columns; selected = true;
    }
  }
  if (steps.length > 30) throw new Error('Preview mendukung maksimal 30 langkah Spark.');
  return {
    url: fixed ? '/voice-api/api/studio/datasets/fixed-spark-preview' : `/voice-api/api/studio/datasets/${encodeURIComponent(input.datasetId!)}/spark-preview`,
    body: fixed ? { columns, rows, steps } : { filters, steps },
  };
}
