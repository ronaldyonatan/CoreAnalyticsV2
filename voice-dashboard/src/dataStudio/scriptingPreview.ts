import { CAST_TYPES } from './utilityPreview.ts';
import type { UtilityData } from './utilityPreview.ts';
export const SCRIPTING_STEPS = ['Python Script', 'R Script'];
export function scriptLanguage(label: string): 'python' | 'r' { return label === 'Python Script' ? 'python' : 'r'; }
export function compileScripting(data: UtilityData) {
  const code = data.utilityConfig?.values?.code ?? '', rows = data.utilityConfig?.rows ?? [];
  if (!SCRIPTING_STEPS.includes(data.label)) throw new Error('Komponen scripting tidak tersedia.');
  if (!code.trim() || code.length > 8000) throw new Error(`${data.label}: isi kode, maksimal 8000 karakter.`);
  if (!rows.length || rows.length > 30) throw new Error(`${data.label}: tentukan 1–30 kolom hasil.`);
  const outputs = rows.map(row => ({ name: row.output.trim(), kind: row.kind || 'Text' }));
  if (outputs.some(output => !output.name || output.name.length > 128 || !CAST_TYPES.includes(output.kind)) || new Set(outputs.map(output => output.name.toLowerCase())).size !== outputs.length) throw new Error(`${data.label}: kolom hasil harus memiliki nama unik dan tipe yang tersedia.`);
  return { steps: [{ type: 'script', language: scriptLanguage(data.label), code, outputs }], columns: outputs.map(output => output.name) };
}
export function scriptingExample() {
  const row = (id: string, output: string, kind = 'Text') => ({ id, output, kind, column: '', value: '' });
  return {
    nodes: [
      { id: 'script-input', type: 'pipeline', position: { x: 40, y: 100 }, data: { label: 'Fixed Input', fixedColumns: ['Nama', 'Harga', 'Jumlah'], fixedRows: [['Andi', '10', '2'], ['Budi', '7.5', '4'], ['Citra', '5', '1']] } },
      { id: 'script-python', type: 'pipeline', position: { x: 320, y: 100 }, data: { label: 'Python Script', utilityConfig: { values: { code: 'output = df.copy()\noutput["Total"] = pd.to_numeric(output["Harga"], errors="coerce") * pd.to_numeric(output["Jumlah"], errors="coerce")\noutput = output.loc[output["Total"] >= 20, ["Nama", "Total"]]\nprint(f"Python: {len(output)} rows")' }, rows: [row('python-name', 'Nama'), row('python-total', 'Total', 'Floating Decimal')] } } },
      { id: 'script-r', type: 'pipeline', position: { x: 600, y: 100 }, data: { label: 'R Script', utilityConfig: { values: { code: 'output <- df\noutput$Total <- as.numeric(output$Total)\noutput$Kategori <- ifelse(output$Total >= 25, "High", "Standard")\ncat(sprintf("R: %d rows\\n", nrow(output)))' }, rows: [row('r-name', 'Nama'), row('r-total', 'Total', 'Floating Decimal'), row('r-category', 'Kategori')] } } },
      { id: 'python-output', type: 'pipeline', position: { x: 320, y: 320 }, data: { label: 'Output Dataset', outputName: 'Hasil Python' } },
      { id: 'r-output', type: 'pipeline', position: { x: 880, y: 100 }, data: { label: 'Output Dataset', outputName: 'Hasil Python & R' } },
    ],
    edges: [
      { id: 'script-1', source: 'script-input', target: 'script-python', sourceHandle: 'main' },
      { id: 'script-2', source: 'script-python', target: 'script-r', sourceHandle: 'main' },
      { id: 'script-3', source: 'script-python', target: 'python-output', sourceHandle: 'main' },
      { id: 'script-4', source: 'script-r', target: 'r-output', sourceHandle: 'main' },
    ],
  };
}
