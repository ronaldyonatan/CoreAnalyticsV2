import type { UtilityData } from './utilityPreview.ts';
export const PERFORMANCE_STEPS = ['Select and Store Columns', 'Restore Columns'];
export type StoredColumns = { id: string; key: string; columns?: string[] };
export function compilePerformance(data: UtilityData, input?: string[], stores: StoredColumns[] = []) {
  const v = data.utilityConfig?.values ?? {};
  const fail = (message: string): never => { throw new Error(`${data.label}: ${message}`); };
  const names = (values: string[]) => { if (!values.length || values.length > 30 || new Set(values.map(n => n.toLowerCase())).size !== values.length) fail('Hasil harus memiliki 1–30 kolom unik tanpa benturan nama.'); return values; };
  if (data.label === 'Select and Store Columns') {
    let selected: unknown; try { selected = JSON.parse(v.features ?? '[]'); } catch { fail('Pilih kolom yang diteruskan.'); }
    if (!Array.isArray(selected) || !selected.length || selected.some(n => typeof n !== 'string' || !n || n.length > 128 || (input && !input.includes(n))) || new Set(selected).size !== selected.length) fail('Pilih minimal satu kolom input yang unik.');
    const columns = selected as string[], key = (v.output ?? '').trim();
    if (!key || key.length > 128 || (input && input.some(n => n.toLowerCase() === key.toLowerCase()))) fail('Nama kunci restore wajib diisi, maksimal 128 karakter, dan tidak boleh sama dengan kolom input.');
    return { steps: [{ type: 'select_store', columns, key }] as Record<string, unknown>[], columns: names([...columns, key]), stored: { key, columns: input?.filter(n => !columns.includes(n)) } };
  }
  if (data.label !== 'Restore Columns') fail('Operasi tidak tersedia.');
  const saved = stores.find(s => s.id === v.store);
  if (!saved) fail('Pilih penyimpanan dari Select and Store Columns pada jalur input ini.');
  if (input && !input.includes(saved!.key)) fail(`Kunci ${saved!.key} tidak tersedia. Teruskan kunci melalui script tanpa mengganti nama/nilainya.`);
  return { steps: [{ type: 'restore_columns', store: saved!.id, key: saved!.key }] as Record<string, unknown>[], columns: input && saved!.columns ? names([...input.filter(n => n !== saved!.key), ...saved!.columns]) : undefined };
}
export function performanceExample(language = 'python') {
  const key = 'RestoreKey';
  const data = [
    { label: 'Fixed Input', fixedColumns: ['Nama', 'Kota', 'Harga', 'Jumlah'], fixedRows: [['Andi', 'Jakarta', '10', '2'], ['Budi', 'Bandung', '7.5', '4'], ['Citra', 'Surabaya', '5', '1']] },
    { label: 'Select and Store Columns', utilityConfig: { values: { features: '["Harga","Jumlah"]', output: key } } },
    { label: language === 'python' ? 'Python Script' : 'R Script', utilityConfig: { values: { code: language === 'python' ? 'output = df[["RestoreKey"]].copy()\noutput["Total"] = pd.to_numeric(df["Harga"]) * pd.to_numeric(df["Jumlah"])\noutput = output[output["Total"] >= 20].sort_values("Total", ascending=False)\nprint("Hanya Harga, Jumlah, RestoreKey masuk ke script")' : 'output <- data.frame(RestoreKey = df$RestoreKey, Total = as.numeric(df$Harga) * as.numeric(df$Jumlah))\noutput <- output[output$Total >= 20, , drop = FALSE]\noutput <- output[order(-output$Total), , drop = FALSE]\ncat("Hanya Harga, Jumlah, RestoreKey masuk ke script")' }, rows: [{ id: 'key', column: '', output: key, kind: 'Text', value: '' }, { id: 'total', column: '', output: 'Total', kind: 'Floating Decimal', value: '' }] } },
    { label: 'Restore Columns', utilityConfig: { values: { store: 'performance-1' } } },
    { label: 'Output Dataset', outputName: `Performance ${language.toUpperCase()}` },
  ];
  return { nodes: data.map((data, i) => ({ id: `performance-${i}`, type: 'pipeline', position: { x: 30 + i * 260, y: 100 }, data })), edges: data.slice(1).map((_, i) => ({ id: `performance-edge-${i}`, source: `performance-${i}`, target: `performance-${i + 1}` })) };
}
