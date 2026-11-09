import { useEffect, useRef, useState } from 'react';
import DataScienceEditor from './DataScienceEditor';
import type { Config } from './UtilityDraft';
type Model = { id: string; task: string; target: string; numeric: string[]; categorical: string[]; algorithm: string; score: number; metric: string; training_rows: number; expires: number };
export default function AutoMLEditor({ config, columns, loadTrainingData, onChange }: { config: Config; columns: { name: string }[]; loadTrainingData: (signal: AbortSignal) => Promise<{ columns: string[]; rows: (string | null)[][] }>; onChange: (config: Config) => void }) {
  const [models, setModels] = useState<Model[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [training, setTraining] = useState<Config>({ values: { numeric: '[]', categorical: '[]' } });
  const [task, setTask] = useState('prediction');
  const request = useRef<AbortController | null>(null);
  const values = config.values ?? {};
  useEffect(() => { const controller = new AbortController(); fetch('/voice-api/api/studio/datasets/science-models', { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async r => { const body = await r.json(); if (!r.ok || body.success === false) throw Error(body.code || 'MODEL_UNAVAILABLE'); setModels(body.data); }).catch(e => { if (!controller.signal.aborted) setError(String(e)); }); return () => { controller.abort(); request.current?.abort(); }; }, []);
  const choose = (model?: Model) => onChange({ ...config, values: { ...values, model_id: model?.id ?? '', modelTask: model?.task ?? '', modelFeatures: JSON.stringify(model ? [...model.numeric, ...model.categorical] : []) } });
  async function train() {
    const controller = new AbortController(); request.current?.abort(); request.current = controller; setBusy(true); setError('');
    try {
      const sample = await loadTrainingData(controller.signal), v = training.values ?? {};
      const csrf = document.cookie.split('; ').find(item => item.startsWith('core_csrf='));
      const response = await fetch('/voice-api/api/studio/datasets/science-models', { method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ? decodeURIComponent(csrf.slice(10)) : '' }, body: JSON.stringify({ ...sample, target: v.target ?? '', numeric: JSON.parse(v.numeric ?? '[]'), categorical: JSON.parse(v.categorical ?? '[]'), task }) });
      const body = await response.json(); if (!response.ok || body.success === false) throw Error(body.detail ? `${body.code}: ${body.detail}` : body.code || 'MODEL_TRAINING_FAILED');
      if (controller.signal.aborted) return;
      const model: Model = body.data; setModels(current => [...current, model]); choose(model);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (request.current === controller) setBusy(false); }
  }
  const model = models.find(m => m.id === values.model_id);
  return <div className="utility-draft"><fieldset disabled={busy}><p>Gunakan model AutoML yang sudah dilatih pada sampel. Model preview berlaku 1 jam, khusus pengguna ini, dan hilang saat backend dimulai ulang.</p><label><span>Model terlatih</span><select value={values.model_id ?? ''} onChange={e => choose(models.find(m => m.id === e.target.value))}><option value="">Pilih atau latih model</option>{models.map(m => <option key={m.id} value={m.id}>{m.task} · {m.target} · {m.algorithm} · {m.id.slice(0, 8)}</option>)}</select></label>{model && <p>{model.metric}: {model.score.toPrecision(4)} · {model.training_rows} baris training · berlaku sampai {new Date(model.expires * 1000).toLocaleTimeString()}.</p>}<label><span>Nama kolom hasil inference</span><input maxLength={128} value={values.output ?? 'prediction'} onChange={e => onChange({ ...config, values: { ...values, output: e.target.value } })} /></label><details><summary>Latih model AutoML preview dari input terhubung</summary><p>Memilih kandidat dengan cross-validation terbaik, lalu melatih ulang pada seluruh sampel. Regression: Linear Regression vs Random Forest. Classification: Naive Bayes vs Random Forest. AutoML lokal untuk preview; tidak terhubung ke model Domo.</p><label><span>Jenis task</span><select disabled={busy} value={task} onChange={e => setTask(e.target.value)}><option value="prediction">Prediction (numerik)</option><option value="classification">Classification (kategori)</option></select></label><DataScienceEditor trainingOnly kind={task === 'prediction' ? 'Prediction' : 'Classification'} config={training} columns={columns} predictionColumns={[]} inputs={['Input terhubung']} onChange={setTraining} /><button type="button" disabled={busy || !columns.length} onClick={() => void train()}>{busy ? 'Melatih model…' : 'Latih & pilih model'}</button></details>{error && <p role="alert">{error}</p>}</fieldset></div>;
}
