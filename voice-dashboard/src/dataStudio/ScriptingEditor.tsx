import { UniverseFormSection } from '../design-system/components/universe';
import { CAST_TYPES } from './utilityPreview';
import type { UtilityData } from './utilityPreview';
import type { Config } from './UtilityDraft';
export default function ScriptingEditor({ data, columns, ready, onRefresh, onChange }: { data: UtilityData; columns: { name: string; type: string }[]; ready: boolean | null; onRefresh: () => void; onChange: (config: Config) => void }) {
  const config = data.utilityConfig ?? {}, values = config.values ?? {}, rows = config.rows ?? [], python = data.label === 'Python Script';
  const change = (id: string, value: Partial<(typeof rows)[number]>) => onChange({ ...config, rows: rows.map(row => row.id === id ? { ...row, ...value } : row) });
  const useInput = () => onChange({ ...config, rows: columns.map(column => ({ id: crypto.randomUUID(), output: column.name, kind: 'Text', column: '', value: '' })) });
  return <UniverseFormSection className="utility-draft scripting-editor">
    <p role="status">{ready === null ? 'Memeriksa runtime scripting…' : ready ? 'Runtime siap untuk preview.' : 'Runtime scripting belum siap. Jalankan layanan scripting lalu periksa kembali.'} <button type="button" onClick={onRefresh}>Periksa runtime</button></p>
    <p>{python ? 'Input tersedia sebagai pandas DataFrame: input dan df. pandas (pd) dan numpy (np) sudah tersedia.' : 'Input tersedia sebagai data.frame: input dan df. Gunakan fungsi base R; jsonlite juga tersedia.'} Simpan hasil sebagai <strong>output</strong>, dengan nama dan urutan kolom sesuai konfigurasi di bawah.</p>
    <p>Sampel maksimal 50 baris, 30 kolom, 256 karakter per nilai. Waktu eksekusi script maksimal 8 detik. Hasil dikembalikan ke Spark untuk node berikutnya.</p>
    <div className="utility-sql"><div><strong>Kolom input</strong>{columns.map(column => <p key={column.name}>{column.name} · {column.type}</p>)}{!columns.length && <p>Hubungkan input untuk melihat kolom.</p>}</div><label><span>Code · {data.label}</span><textarea rows={14} maxLength={8000} spellCheck={false} value={values.code ?? ''} placeholder={python ? 'output = df.copy()' : 'output <- df'} onChange={event => onChange({ ...config, values: { ...values, code: event.target.value } })} /></label></div>
    <button type="button" onClick={() => { onChange({ ...config, values: { ...values, code: python ? 'output = df.copy()' : 'output <- df' }, rows: columns.map(column => ({ id: crypto.randomUUID(), output: column.name, kind: 'Text', column: '', value: '' })) }); }}>Contoh salin input</button>
    <h3>Kolom hasil</h3><p>Semua kolom output wajib didaftarkan sesuai urutan. Hasil kosong diperbolehkan; output tetap harus berupa tabel dengan kolom ini.</p><button type="button" disabled={!columns.length} onClick={useInput}>Gunakan kolom input</button>
    {rows.map((row, index) => <div className="utility-draft-row" key={row.id}><label><span>Nama kolom hasil {index + 1}</span><input maxLength={128} value={row.output} onChange={event => change(row.id, { output: event.target.value })} /></label><label><span>Tipe hasil</span><select value={row.kind || 'Text'} onChange={event => change(row.id, { kind: event.target.value })}>{CAST_TYPES.map(kind => <option key={kind}>{kind}</option>)}</select></label><button type="button" aria-label={`Hapus kolom hasil ${index + 1}`} onClick={() => onChange({ ...config, rows: rows.filter(item => item.id !== row.id) })}>×</button></div>)}
    <button type="button" disabled={rows.length >= 30} onClick={() => onChange({ ...config, rows: [...rows, { id: crypto.randomUUID(), output: '', kind: 'Text', column: '', value: '' }] })}>＋ Tambah kolom hasil</button>
    <p>Print/cat ditampilkan pada Log scripting. Script berjalan pada runtime terpisah tanpa akses jaringan dan file project. Paket yang tersedia disiapkan oleh administrator; pemasangan paket dari script tidak tersedia.</p>
  </UniverseFormSection>;
}
