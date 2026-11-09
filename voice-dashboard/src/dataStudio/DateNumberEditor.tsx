import { compileUtility } from './utilityPreview';
import type { Calculation, UtilityData } from './utilityPreview';
export default function DateNumberEditor({ data, columns, onChange }: { data: UtilityData; columns: { name: string; type: string }[]; onChange: (rules: Calculation[]) => void }) {
  const rules = data.calculations ?? []; const date = data.label === 'Date Operations';
  const change = (id: string, value: Partial<Calculation>) => onChange(rules.map(rule => rule.id === id ? { ...rule, ...value } : rule));
  const options = date ? ['Subtract from date', 'Add to date', 'Difference between dates', 'Year of date', 'Quarter of date', 'Month of date', 'Day of year', 'Day of month', 'Day of week', 'Week of year'] : ['addition', 'subtraction', 'multiplication', 'division', 'power', 'ceiling', 'floor'];
  const labels: Record<string, string> = { addition: 'Addition', subtraction: 'Subtraction', multiplication: 'Multiplication', division: 'Division', power: 'Power', ceiling: 'Ceiling', floor: 'Floor' };
  const ruleColumns = (index: number) => { if (!index) return columns; try { return (compileUtility({ ...data, calculations: rules.slice(0, index) }, columns.map(column => column.name)).columns ?? []).map(name => ({ name, type: 'sample' })); } catch { return columns; } };
  return <div className="text-node-config"><p>Preview Spark aktif. Nilai angka/tanggal tidak valid dan pembagian nol menghasilkan NULL. Tanggal memakai YYYY-MM-DD.</p>
    {rules.map((rule, index) => {
      const binary = date ? ['Subtract from date', 'Add to date', 'Difference between dates'].includes(rule.operation) : !['ceiling', 'floor'].includes(rule.operation);
      const available = ruleColumns(index);
      return <div className="text-rule" key={rule.id}><strong>{data.label} · {index + 1}</strong><div className="pipelines-filter-steps">
        <label><span>Nama kolom hasil</span><input maxLength={128} value={rule.output} onChange={event => change(rule.id, { output: event.target.value })} /></label>
        <label><span>Operasi</span><select value={rule.operation} onChange={event => change(rule.id, { operation: event.target.value })}><option value="">Pilih operasi</option>{options.map(value => <option key={value} value={value}>{labels[value] ?? value}</option>)}</select></label>
        {(['left', 'right'] as const).filter(side => side === 'left' || binary).map((side, i) => {
          const isDate = date && (side === 'left' || rule.operation === 'Difference between dates');
          return <div className="calculator-operand" key={side}>
            <label><span>{isDate ? `Tanggal ${i + 1}` : `Nilai ${i + 1}`} · sumber</span><select value={rule[`${side}Kind`]} onChange={event => change(rule.id, { [`${side}Kind`]: event.target.value, [side]: '' })}><option value="column">Column</option><option value="value">Value</option></select></label>
            <label><span>{isDate ? 'Tanggal' : 'Angka'}</span>{rule[`${side}Kind`] === 'column' ? <select value={rule[side]} onChange={event => change(rule.id, { [side]: event.target.value })}><option value="">Pilih kolom</option>{available.map(column => <option key={column.name} value={column.name}>{column.name}</option>)}</select> : <input type={isDate ? 'date' : 'text'} maxLength={256} placeholder={isDate ? 'YYYY-MM-DD' : 'Contoh: 10.5'} value={rule[side]} onChange={event => change(rule.id, { [side]: event.target.value })} />}</label>
          </div>;
        })}
        {date && ['Subtract from date', 'Add to date'].includes(rule.operation) && <label><span>Satuan</span><select value={rule.unit ?? 'days'} onChange={event => change(rule.id, { unit: event.target.value })}><option value="days">Hari</option><option value="months">Bulan</option><option value="years">Tahun</option></select></label>}
      </div><button type="button" onClick={() => onChange(rules.filter(item => item.id !== rule.id))}>Hapus operasi</button></div>;
    })}
    <button type="button" disabled={rules.length >= 30} onClick={() => onChange([...rules, { id: crypto.randomUUID(), output: '', operation: date ? 'Year of date' : 'addition', leftKind: 'column', left: '', rightKind: 'value', right: '', unit: 'days' }])}>＋ Tambah operasi</button>
    {date && <p>Difference between dates menghasilkan tanggal pertama dikurangi tanggal kedua dalam hari. Day of week: Minggu=1 sampai Sabtu=7. Week of year mengikuti ISO. Pergeseran tanggal menerima bilangan bulat; tanggal akhir bulan disesuaikan.</p>}
  </div>;
}
