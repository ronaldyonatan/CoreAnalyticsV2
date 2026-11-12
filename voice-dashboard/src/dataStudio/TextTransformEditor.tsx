import { UniverseFormSection } from '../design-system/components/universe';
import type { TextData, TextRule } from './textPreview';
import { compileText } from './textPreview';

export default function TextTransformEditor({ data, columns, onChange }: {
  data: TextData; columns: { name: string; type: string }[]; onChange: (value: Partial<Omit<TextData, 'label'>>) => void;
}) {
  const rules = data.textRules ?? [];
  const changeRule = (id: string, value: Partial<TextRule>) => onChange({ textRules: rules.map(rule => rule.id === id ? { ...rule, ...value } : rule) });
  const source = (value: string, change: (name: string) => void, options = columns) => <select value={value} onChange={event => change(event.target.value)}><option value="">Pilih kolom</option>{options.map(column => <option key={column.name} value={column.name}>{column.name}</option>)}</select>;
  const ruleColumns = (index: number) => {
    if (!index || data.label !== 'String Operations') return columns;
    try { return (compileText({ ...data, textRules: rules.slice(0, index) }, columns.map(column => column.name)).columns ?? []).map(name => ({ name, type: 'text' })); }
    catch { return columns; }
  };
  const delimiter = data.textDelimiter ?? (data.label === 'Split Column' ? ',' : '');
  return <UniverseFormSection className="text-node-config">
    <p>Preview Spark aktif. Hasil teks maksimal 256 karakter per nilai; konfigurasi dan hasil belum disimpan.</p>
    {data.label === 'Combine Columns' && <>
      <div className="pipelines-filter-steps">
        <label><span>Nama kolom hasil gabungan</span><input maxLength={128} value={data.textOutput ?? ''} onChange={event => onChange({ textOutput: event.target.value })} /></label>
        <label><span>Karakter pemisah (boleh kosong)</span><input maxLength={256} value={delimiter} onChange={event => onChange({ textDelimiter: event.target.value })} placeholder="Contoh: spasi, koma, atau -" /></label>
        <label className="text-checkbox"><input type="checkbox" checked={!!data.textRemove} onChange={event => onChange({ textRemove: event.target.checked })} /> Hapus kolom asal</label>
      </div>
      <p>Pilih minimal dua kolom sesuai urutan. NULL menjadi bagian kosong; pemisah tetap dipertahankan.</p>
      {(data.textColumns ?? ['']).map((name, index) => <div className="text-config-line" key={index}>
        {source(name, value => onChange({ textColumns: (data.textColumns ?? ['']).map((item, i) => i === index ? value : item) }))}
        <button type="button" aria-label={`Hapus kolom gabungan ${index + 1}`} onClick={() => onChange({ textColumns: (data.textColumns ?? ['']).filter((_, i) => i !== index) })}>×</button>
      </div>)}
      <button type="button" disabled={(data.textColumns ?? ['']).length >= 30} onClick={() => onChange({ textColumns: [...(data.textColumns ?? ['']), ''] })}>＋ Tambah kolom</button>
    </>}
    {data.label === 'Split Column' && <>
      <div className="pipelines-filter-steps">
        <label><span>Kolom sumber</span>{source(data.filterColumn ?? '', value => onChange({ filterColumn: value }))}</label>
        <label><span>Pemisah literal</span><input maxLength={256} value={delimiter} onChange={event => onChange({ textDelimiter: event.target.value })} /></label>
        <label className="text-checkbox"><input type="checkbox" checked={!!data.textKeepExtra} onChange={event => onChange({ textKeepExtra: event.target.checked })} /> Simpan sisa di kolom terakhir</label>
        <label className="text-checkbox"><input type="checkbox" checked={!!data.textRemove} onChange={event => onChange({ textRemove: event.target.checked })} /> Hapus kolom asal</label>
      </div>
      <p>Nama kolom hasil sesuai urutan potongan. Potongan yang tidak ada menghasilkan NULL. Tanpa opsi simpan sisa, potongan berlebih dibuang.</p>
      {(data.splitNames ?? ['']).map((name, index) => <div className="text-config-line" key={index}>
        <input aria-label={`Nama kolom hasil ${index + 1}`} maxLength={128} value={name} onChange={event => onChange({ splitNames: (data.splitNames ?? ['']).map((item, i) => i === index ? event.target.value : item) })} placeholder="Nama kolom baru" />
        <button type="button" aria-label={`Hapus hasil split ${index + 1}`} onClick={() => onChange({ splitNames: (data.splitNames ?? ['']).filter((_, i) => i !== index) })}>×</button>
      </div>)}
      <button type="button" disabled={(data.splitNames ?? ['']).length >= 30} onClick={() => onChange({ splitNames: [...(data.splitNames ?? ['']), ''] })}>＋ Tambah kolom</button>
    </>}
    {['Replace Text', 'String Operations', 'Text Formatting'].includes(data.label) && <>
      {rules.map((rule, index) => <div className="text-rule" key={rule.id}>
        <strong>Aturan {index + 1}</strong>
        <div className="pipelines-filter-steps">
          <label><span>Kolom sumber</span>{source(rule.column, value => changeRule(rule.id, { column: value }), ruleColumns(index))}</label>
          {data.label === 'Replace Text' && <>
            <label><span>Teks literal yang dicari</span><input maxLength={256} value={rule.find} onChange={event => changeRule(rule.id, { find: event.target.value })} /></label>
            <label><span>Ganti dengan (boleh kosong)</span><input maxLength={256} value={rule.replace} onChange={event => changeRule(rule.id, { replace: event.target.value })} /></label>
          </>}
          {data.label === 'String Operations' && <>
            <label><span>Nama kolom hasil</span><input maxLength={128} value={rule.output} onChange={event => changeRule(rule.id, { output: event.target.value })} /></label>
            <label><span>Operasi</span><select value={rule.operation} onChange={event => changeRule(rule.id, { operation: event.target.value, start: rule.start ?? 1, length: rule.length ?? 3, side: rule.side ?? 'left', width: rule.width ?? 10, trim: rule.trim ?? 'both' })}>
              <option value="">Pilih operasi</option><option value="substring">Substring</option><option value="right_left_substring">Right/left substring</option><option value="trim_spaces">Trim spaces</option><option value="pad_with_space">Pad with space</option>
            </select></label>
            {rule.operation === 'substring' && <label><span>Posisi awal (mulai dari 1)</span><input type="number" min={1} max={256} step={1} value={rule.start ?? ''} onChange={event => changeRule(rule.id, { start: Number(event.target.value) })} /></label>}
            {['substring', 'right_left_substring'].includes(rule.operation) && <label><span>Panjang teks</span><input type="number" min={1} max={256} step={1} value={rule.length ?? ''} onChange={event => changeRule(rule.id, { length: Number(event.target.value) })} /></label>}
            {['right_left_substring', 'pad_with_space'].includes(rule.operation) && <label><span>{rule.operation === 'pad_with_space' ? 'Sisi penambahan spasi' : 'Ambil dari sisi'}</span><select value={rule.side ?? ''} onChange={event => changeRule(rule.id, { side: event.target.value })}><option value="">Pilih sisi</option><option value="left">Kiri</option><option value="right">Kanan</option></select></label>}
            {rule.operation === 'trim_spaces' && <label><span>Buang spasi dari sisi</span><select value={rule.trim ?? ''} onChange={event => changeRule(rule.id, { trim: event.target.value })}><option value="">Pilih sisi</option><option value="both">Kedua sisi</option><option value="left">Kiri</option><option value="right">Kanan</option></select></label>}
            {rule.operation === 'pad_with_space' && <label><span>Panjang akhir (teks panjang tidak dipotong)</span><input type="number" min={1} max={256} step={1} value={rule.width ?? ''} onChange={event => changeRule(rule.id, { width: Number(event.target.value) })} /></label>}
          </>}
          {data.label === 'Text Formatting' && <>
            <label><span>Format huruf</span><select value={rule.operation} onChange={event => changeRule(rule.id, { operation: event.target.value })}><option value="">Tidak berubah</option><option value="lower">All lower case</option><option value="upper">All upper case</option><option value="capitalize_first">Capitalize first letter</option></select></label>
            <label><span>Perlakuan angka</span><select value={rule.numberHandling ?? ''} onChange={event => changeRule(rule.id, { numberHandling: event.target.value })}><option value="">Tidak berubah</option><option value="remove_numbers">Remove all number</option><option value="only_numbers">Show only number</option></select></label>
          </>}
        </div>
        <button type="button" onClick={() => onChange({ textRules: rules.filter(item => item.id !== rule.id) })}>Hapus aturan</button>
      </div>)}
      <button type="button" disabled={rules.length >= 30} onClick={() => onChange({ textRules: [...rules, { id: crypto.randomUUID(), column: '', find: '', replace: '', output: '', operation: '', start: 1, length: 3, side: 'left', width: 10, trim: 'both' }] })}>＋ Tambah aturan</button>
      <p>{data.label === 'String Operations' ? 'Gunakan nama kolom sumber sebagai nama hasil untuk mengganti kolom tersebut. Nama baru menambahkan kolom.' : 'Aturan dijalankan berurutan dan mengganti nilai pada kolom sumber.'} NULL tetap NULL.</p>
      {data.label === 'Text Formatting' && <p>Angka dibersihkan sebelum format huruf diterapkan. Capitalize first letter hanya mengubah karakter pertama; huruf selanjutnya tetap.</p>}
    </>}
  </UniverseFormSection>;
}
