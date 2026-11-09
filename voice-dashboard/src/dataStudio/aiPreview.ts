import type { UtilityData } from './utilityPreview.ts';
export const AI_STEPS = ['AI Classification', 'AI Model Inference', 'Sentiment Analysis', 'Text Generation'];
export type AIRuntime = { ready: boolean; provider: string; models: string[]; default_model: string; model_inference: boolean; max_rows: number; max_calls: number; code?: string };
export function compileAI(data: UtilityData, input?: string[]) {
  const v = data.utilityConfig?.values ?? {}, rows = data.utilityConfig?.rows ?? [];
  const fail = (message: string): never => { throw new Error(`${data.label}: ${message}`); };
  const text = (key: string, fallback = '', limit = 128, empty = false) => { const s = v[key] ?? fallback; if (s.length > limit || (!empty && !s.trim())) fail(`Isi ${key}, maksimal ${limit} karakter.`); return s; };
  const output = text('output', data.label === 'Sentiment Analysis' ? 'sentiment' : data.label === 'AI Classification' ? 'classification' : 'output');
  const result = (step: Record<string, unknown>, additions: string[], include = true) => { const names = [...(include ? input ?? [] : []), ...additions]; if (names.length > 30 || new Set(names.map(n => n.toLowerCase())).size !== names.length || additions.some(n => !n.trim() || n.length > 128)) fail('Nama kolom hasil harus unik, maksimal 30 kolom.'); return { steps: [step], columns: input || !include ? names : undefined }; };
  if (data.label === 'AI Model Inference') {
    const model_id = text('model_id'); if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(model_id)) fail('Pilih model yang sudah dilatih.');
    const task = v.modelTask; if (!['classification', 'prediction'].includes(task ?? '')) fail('Pilih ulang model untuk menentukan task inference.');
    let features: unknown; try { features = JSON.parse(v.modelFeatures ?? '[]'); } catch { fail('Pilih ulang model terlatih.'); }
    if (!Array.isArray(features) || !features.length || features.some(n => typeof n !== 'string' || (input && !input.includes(n)))) fail('Schema input harus memuat seluruh fitur model.');
    const include = v.includeInput ?? 'true'; if (!['true','false'].includes(include)) fail('Pilih apakah input disertakan.');
    return result({ type: 'ai_model', model_id, output, task, include_input: include === 'true' }, [output], include === 'true');
  }
  if (!AI_STEPS.includes(data.label)) fail('Operasi tidak tersedia.');
  const model = text('model'); if (model.includes('://') || !/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,127}$/.test(model)) fail('Pilih model lokal yang tersedia.');
  const source = data.label === 'Text Generation' ? '' : text('source'); if (source && input && !input.includes(source)) fail('Kolom sumber tidak tersedia.');
  const instructions = text('instructions','',2000,true), prompt = text('prompt','',2000,true), execution = v.execution ?? 'NON_BATCH';
  if (!['BATCH','NON_BATCH'].includes(execution)) fail('Execution preference tidak valid.');
  const rawTemperature = v.temperature ?? '0', temperature = Number(rawTemperature); if (!rawTemperature.trim() || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) fail('Temperature harus 0–2.');
  const mode = v.mode ?? (data.label === 'AI Classification' ? 'single' : data.label === 'Sentiment Analysis' ? 'overall' : 'text');
  const labels: {name:string;description:string}[] = [], topics: {name:string;description:string}[] = [], fields: {name:string;kind:string;description:string}[] = [];
  const entries = (min: number, max: number) => { if (rows.length < min || rows.length > max || new Set(rows.map(r => r.output.toLowerCase())).size !== rows.length || rows.some(r => !r.output.trim() || r.output.length > 128 || r.value.length > 256)) fail(`Tambahkan ${min}–${max} nama unik dan deskripsi maksimal 256 karakter.`); return rows.map(r => ({ name:r.output, description:r.value })); };
  let additions = [output]; let task: string;
  if (data.label === 'AI Classification') {
    task = 'classify'; if (!['single','multi'].includes(mode)) fail('Pilih Single Label atau Multi Label.'); labels.push(...entries(2,10)); if (mode === 'multi') additions = labels.map(l => l.name);
  } else if (data.label === 'Sentiment Analysis') {
    task = 'sentiment'; if (!['overall','targeted'].includes(mode)) fail('Pilih Overall atau Targeted Sentiment.'); if (mode === 'targeted') { topics.push(...entries(1,5)); additions = topics.map(t => t.name); }
  } else {
    task = 'generate'; if (!['text','structured'].includes(mode)) fail('Pilih Text atau Structured output.'); if (!prompt.trim()) fail('Isi prompt dengan instruksi yang jelas.');
    const matches = [...prompt.matchAll(/\{\{([^{}]{1,128})\}\}/g)]; if (matches.some(m => input && !input.includes(m[1])) || /\{\{|\}\}/.test(prompt.replace(/\{\{([^{}]{1,128})\}\}/g,''))) fail('Placeholder harus {{Nama kolom}} yang tersedia.');
    if (mode === 'structured') { const configured = entries(1,5); rows.forEach((r,i) => { const kind = r.kind || 'Text'; if (!['Text','Integer','Floating Decimal','Boolean'].includes(kind)) fail('Tipe output tidak didukung.'); fields.push({ ...configured[i], kind }); }); additions = fields.map(f => f.name); }
  }
  return result({ type:'ai_llm', task, model, source, instructions, execution, mode, output, labels, topics, prompt, temperature, fields }, additions);
}
export function aiExample(label: string, model: string) {
  const values: Record<string,string> = { model, source:'Ulasan', output: label === 'AI Classification' ? 'Kategori' : label === 'Sentiment Analysis' ? 'Sentiment' : 'Ringkasan' };
  const rows = label === 'AI Classification' ? [{id:'positive',column:'',output:'Pujian',kind:'Text',value:'The customer praises the product or service.'},{id:'negative',column:'',output:'Keluhan',kind:'Text',value:'The customer complains about the product or service.'}] : [];
  if (label === 'Text Generation') { values.prompt = 'Summarize this review in one short sentence: {{Ulasan}}'; values.temperature = '0'; }
  if (label === 'AI Model Inference') { values.output = 'Prediksi'; }
  const data = [{label:'Fixed Input',fixedColumns:['Nama','Ulasan'],fixedRows:[['Andi','The product is excellent and delivery was very fast.'],['Budi','The product arrived broken. Customer service was unhelpful.']]},{label,utilityConfig:{values,rows}},{label:'Output Dataset',outputName:label}];
  if (label === 'AI Model Inference') { data[0] = { label:'Fixed Input', fixedColumns:['X','Y'], fixedRows:Array.from({length:16},(_,i)=>[String(i+1),String(2*(i+1)+3)]) }; }
  return { nodes:data.map((data,i)=>({id:`ai-${i}`,type:'pipeline',position:{x:40+i*340,y:100},data})), edges:data.slice(1).map((_,i)=>({id:`ai-edge-${i}`,source:`ai-${i}`,target:`ai-${i+1}`})) };
}
