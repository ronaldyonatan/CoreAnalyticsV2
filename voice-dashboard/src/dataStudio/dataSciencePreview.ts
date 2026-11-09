import type { UtilityData } from './utilityPreview.ts';
export const SCIENCE_STEPS = ['AutoML Inference', 'Classification', 'Clustering', 'Forecasting', 'Multivariate Outliers', 'Outlier Detection', 'Prediction'];
export const SUPERVISED_STEPS = ['Classification', 'Prediction'];
export function compileScience(data: UtilityData, training?: string[], prediction?: string[]) {
  const values = data.utilityConfig?.values ?? {};
  const supervised = SUPERVISED_STEPS.includes(data.label);
  const fail = (message: string): never => { throw new Error(`${data.label}: ${message}`); };
  const name = (key: string, fallback = '') => { const value = (values[key] ?? fallback).trim(); if (!value || value.length > 128) fail('Nama kolom wajib diisi, maksimal 128 karakter.'); return value; };
  const source = (key: string) => { const value = name(key); if (training && !training.includes(value)) fail(`Kolom ${value} tidak tersedia dari Training/input.`); return value; };
  const number = (key: string, fallback: string, min: number, max: number, integer = false) => { const raw = values[key] ?? fallback; const n = Number(raw); if (!raw.trim() || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(`Nilai ${key} harus ${integer ? 'bilangan bulat ' : ''}${min}–${max}.`); return n; };
  const features = (key: string, optional = false) => { let names: unknown; try { names = JSON.parse(values[key] ?? '[]'); } catch { fail('Pilih kolom fitur.'); } if (!Array.isArray(names) || (!optional && !names.length) || names.some(n => typeof n !== 'string' || (training && !training.includes(n))) || new Set(names).size !== names.length) fail('Pilih fitur unik yang tersedia.'); return names as string[]; };
  const output = name('output', data.label === 'Clustering' ? 'cluster' : data.label.includes('Outlier') ? 'outlier' : data.label === 'Classification' ? 'classification' : 'prediction');
  const step: Record<string, unknown> = { type: 'data_science', output };
  let additions = [output];
  const algorithm = (options: string[]) => { const chosen = values.algorithm || options[0]; if (!options.includes(chosen)) fail('Pilih algoritme yang tersedia.'); return chosen; };
  if (data.label === 'AutoML Inference') {
    const model_id = values.model_id; if (!model_id || !/^[a-f0-9-]{36}$/.test(model_id)) fail('Pilih model yang sudah dilatih.');
    let modelFeatures: unknown; try { modelFeatures = JSON.parse(values.modelFeatures ?? '[]'); } catch { fail('Pilih kembali model terlatih.'); }
    if (!Array.isArray(modelFeatures) || !modelFeatures.length || modelFeatures.some(n => typeof n !== 'string' || (training && !training.includes(n)))) fail('Input inference harus memiliki seluruh fitur model.');
    Object.assign(step, { operation: 'inference', model_id });
  } else if (supervised) {
    const numeric = features('numeric', true), categorical = features('categorical', true), target = source('target');
    if (!numeric.length && !categorical.length) fail('Pilih minimal satu fitur numerik atau kategori.');
    const all = [...numeric, ...categorical]; if (all.includes(target) || new Set(all).size !== all.length) fail('Target tidak boleh menjadi fitur; fitur numerik dan kategori harus terpisah.');
    if (prediction && all.some(n => !prediction.includes(n))) fail('Input Predict harus memiliki seluruh kolom fitur Training.');
    Object.assign(step, { operation: data.label === 'Classification' ? 'classification' : 'prediction', target, numeric, categorical, algorithm: algorithm(data.label === 'Classification' ? ['Random Forest', 'Naive Bayes'] : ['Linear Regression', 'Random Forest']) });
  } else if (data.label === 'Clustering') Object.assign(step, { operation: 'clustering', features: features('features'), count: number('count', '2', 1, 20, true), algorithm: algorithm(['k-means', 'k-medians']) });
  else if (data.label === 'Multivariate Outliers') { const cutoff = number('cutoff', '0.95', 0, 1); if (cutoff === 0 || cutoff === 1) fail('Quantile cutoff harus lebih dari 0 dan kurang dari 1.'); Object.assign(step, { operation: 'multivariate', features: features('features'), cutoff }); }
  else if (data.label === 'Outlier Detection') { const cutoff = number('cutoff', '2', 0, 100); if (!cutoff) fail('Deviation cutoff harus lebih dari 0.'); Object.assign(step, { operation: 'outlier', source: source('source'), cutoff, algorithm: algorithm(['Standard Deviation', 'Mean Absolute Deviation']) }); }
  else if (data.label === 'Forecasting') {
    const time = source('time'), target = source('target'); if (time === target) fail('Kolom waktu dan target harus berbeda.');
    const periods = number('periods', '5', 1, 25, true), history = values.history?.trim() ? number('history', '', 0, 50, true) : null;
    if (history !== null && history + periods > 50) fail('History + periode baru maksimal 50 baris.');
    const lower = name('lower', 'prediction lower'), upper = name('upper', 'prediction upper'); additions = [output, lower, upper];
    Object.assign(step, { operation: 'forecasting', time, target, periods, history, lower, upper, band: number('band', '95', 1, 99), frequency: number('frequency', '1', 1, 12, true) });
  } else fail('Operasi belum tersedia.');
  const input = supervised ? prediction ?? training : training;
  const names = [...(input ?? []), ...additions];
  if (names.length > 30 || new Set(names.map(n => n.toLowerCase())).size !== names.length) fail('Nama kolom hasil harus unik; maksimal 30 kolom.');
  return { steps: [step], columns: input ? names : undefined };
}
export function scienceExample(label = 'Prediction') {
  const supervised = SUPERVISED_STEPS.includes(label);
  const forecast = label === 'Forecasting';
  const columns = forecast ? ['Tanggal', 'Sales'] : ['X', 'Y', 'Kelas'];
  const rows = Array.from({ length: 16 }, (_, i) => forecast ? [`2026-01-${String(i + 1).padStart(2, '0')}`, String(10 + 2 * i + (i % 3))] : [String(i + 1), String(2 * (i + 1) + 3), i < 8 ? 'A' : 'B']);
  const values: Record<string, string> = label === 'Classification' ? { target: 'Kelas', numeric: '["X"]', algorithm: 'Naive Bayes' } : label === 'Prediction' ? { target: 'Y', numeric: '["X"]' } : forecast ? { time: 'Tanggal', target: 'Sales', history: '8', periods: '3' } : label === 'Outlier Detection' ? { source: 'X' } : { features: '["X"]' };
  const nodes = [
    { id: 'science-train', type: 'pipeline', position: { x: 20, y: 50 }, data: { label: 'Fixed Input', fixedColumns: columns, fixedRows: rows } },
    ...(supervised ? [{ id: 'science-test', type: 'pipeline', position: { x: 20, y: 210 }, data: { label: 'Fixed Input', fixedColumns: ['X'], fixedRows: [['17'], ['20']] } }] : []),
    { id: 'science', type: 'pipeline', position: { x: 310, y: 100 }, data: { label, utilityConfig: { values } } },
    { id: 'science-output', type: 'pipeline', position: { x: 610, y: 100 }, data: { label: 'Output Dataset', outputName: label } },
  ];
  const edges = [{ id: 'science-training', source: 'science-train', target: 'science', targetHandle: supervised ? 'train' : null }, ...(supervised ? [{ id: 'science-predict', source: 'science-test', target: 'science', targetHandle: 'predict' }] : []), { id: 'science-result', source: 'science', target: 'science-output' }];
  return { nodes, edges };
}

export function compileScienceTraining(nodes: import('./graphPreview.ts').GraphNode[], edges: import('./graphPreview.ts').GraphEdge[], activeId: string) {
  const incoming = edges.filter(e => e.target === activeId);
  if (incoming.length !== 1) throw new Error('Hubungkan tepat satu input training ke AutoML Inference.');
  const used = new Set<string>(), visiting = new Set<string>();
  function visit(id: string) { if (visiting.has(id)) throw new Error('Graph tidak boleh cycle.'); if (used.has(id)) return; visiting.add(id); edges.filter(e => e.target === id).forEach(e => visit(e.source)); visiting.delete(id); used.add(id); }
  visit(incoming[0].source);
  const id = 'automl-training-output'; if (nodes.some(n => n.id === id)) throw new Error('ID output training sudah dipakai.');
  return { nodes: [...nodes.filter(n => used.has(n.id)), { id, data: { label: 'Output Dataset', outputName: 'AutoML Training Sample' } }], edges: [...edges.filter(e => used.has(e.source) && used.has(e.target)), { ...incoming[0], target: id, targetHandle: null }] };
}
