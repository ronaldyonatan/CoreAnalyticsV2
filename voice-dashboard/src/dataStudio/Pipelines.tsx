import { UniverseHeader, UniverseTable, UniverseInspector, UniverseToolbar } from '../design-system/components/universe';
import './pipeline-canvas-compact.css';
import PipelinePersistence from './PipelinePersistence';
import { pipelineDocument } from './pipelineMetadata';
import AIServicesEditor from './AIServicesEditor';
import { AI_STEPS, compileAI } from './aiPreview';
import type { AIRuntime } from './aiPreview';
import PerformanceEditor from './PerformanceEditor';
import { PERFORMANCE_STEPS } from './performancePreview';
import type { StoredColumns } from './performancePreview';
import AutoMLEditor from './AutoMLEditor';
import DataScienceEditor from './DataScienceEditor';
import { compileScience, SCIENCE_STEPS, SUPERVISED_STEPS, compileScienceTraining } from './dataSciencePreview';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, addEdge, useEdgesState, useNodesState, useUpdateNodeInternals } from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import SearchPicker from './SearchPicker';
import UtilityDraft from './UtilityDraft';
import AdvancedDraft from './AdvancedDraft';
import TextTransformEditor from './TextTransformEditor';
import ScriptingEditor from './ScriptingEditor';
import { compileScripting, scriptLanguage, SCRIPTING_STEPS } from './scriptingPreview';
import RelationalEditor from './RelationalEditor';
import { compileRelational, JOIN_STEPS, outputPorts, RELATIONAL_STEPS } from './relationalPreview';
import { compileGraph, needsGraph } from './graphPreview';
import DateNumberEditor from './DateNumberEditor';
import { compileUtility, UTILITY_PREVIEW_STEPS } from './utilityPreview';
import type { Calculation } from './utilityPreview';
import { compileText, TEXT_STEPS } from './textPreview';
import type { TextRule } from './textPreview';
import { compilePreview, PREVIEW_STEPS } from './pipelinePreview';
import type { Utility, Config as UtilityConfig } from './UtilityDraft';

type Step = Utility | 'Calculator' | 'Date Operations' | 'Combine Columns' | 'Replace Text' | 'Split Column' | 'String Operations' | 'Text Formatting' | 'Fixed Input' | 'Input Dataset' | 'Select Columns' | 'Filter Rows' | 'Add Formula' | 'Output Dataset';
type FilterOp = 'eq' | 'neq' | 'null' | 'notnull';
type FilterRule = { id: string; column: string; op: FilterOp; value: string };
type Formula = { id: string; name: string; expression: string };
type Data = { filterExpression?: string; outputName?: string; utilityConfig?: UtilityConfig; calculations?: Calculation[]; textRules?: TextRule[]; textColumns?: string[]; textOutput?: string; textDelimiter?: string; textRemove?: boolean; textKeepExtra?: boolean; splitNames?: string[]; fixedColumns?: string[]; fixedRows?: string[][]; rules?: FilterRule[]; formulas?: Formula[]; filterOp?: FilterOp; label: Step; datasetId?: string; columns?: string[]; renames?: Record<string, string>; filterColumn?: string; filterValue?: string; [key: string]: unknown };
type Dataset = { dataset_id: string; dataset_name: string; connection_name: string; access_mode: string };
type OutputPreview = { id: string; name: string; columns: string[]; rows: (string | null)[][]; has_more: boolean };
type ScriptLog = { node?: string | null; language: string; logs: string };
type AIUsage = { node?: string; model: string; rows: number; requests: number; execution: string; provider: string };
type Preview = { aiUsage?: AIUsage[]; scriptLogs?: ScriptLog[]; outputs?: OutputPreview[]; preview_columns: { name: string; type: string }[]; rows: (string | null)[][]; has_more: boolean };
const groups: { label: string; items: string[] }[] = [
  { label: 'DATASETS', items: ['Fixed Input', 'Input Dataset', 'Output Dataset'] },
  { label: 'TEXT', items: ['Combine Columns', 'Replace Text', 'Split Column', 'String Operations', 'Text Formatting'] },
  { label: 'DATES AND NUMBERS', items: ['Calculator', 'Date Operations'] },
  { label: 'UTILITY', items: ['Add Constants', 'Add Formula', 'Alter Columns', 'Duplicate Column', 'Get Schema', 'JSON Expander', 'Limit', 'Meta Select', 'Order', 'Select Columns', 'Series', 'SQL', 'SQL Script', 'Value Mapper'] },
  { label: 'FILTER', items: ['Filter Rows', 'Remove Duplicates', 'Split Filter'] },
  { label: 'COMBINE DATA', items: ['Append Rows', 'Join Data', 'Split Join'] },
  { label: 'AGGREGATE', items: ['Group By', 'Rank & Window'] },
  { label: 'PIVOT', items: ['Dynamic Unpivot', 'Pivot', 'Unpivot'] },
  { label: 'SCRIPTING', items: ['Python Script', 'R Script'] },
  { label: 'DATA SCIENCE', items: ['AutoML Inference', 'Classification', 'Clustering', 'Forecasting', 'Multivariate Outliers', 'Outlier Detection', 'Prediction'] },
  { label: 'PERFORMANCE', items: ['Restore Columns', 'Select and Store Columns'] },
  { label: 'AI SERVICES', items: ['AI Classification', 'AI Model Inference', 'Sentiment Analysis', 'Text Generation'] },
];
const advancedSteps: Utility[] = ['Group By', 'Rank & Window', 'Dynamic Unpivot', 'Pivot', 'Unpivot', 'Python Script', 'R Script', 'AutoML Inference', 'Classification', 'Clustering', 'Forecasting', 'Multivariate Outliers', 'Outlier Detection', 'Prediction', 'Restore Columns', 'Select and Store Columns', 'AI Classification', 'AI Model Inference', 'Sentiment Analysis', 'Text Generation'];
const utilitySteps: Utility[] = [...advancedSteps, 'SQL', 'SQL Script', 'Value Mapper', 'Remove Duplicates', 'Split Filter', 'Append Rows', 'Join Data', 'Split Join', 'Add Constants', 'Alter Columns', 'Duplicate Column', 'Get Schema', 'JSON Expander', 'Limit', 'Meta Select', 'Order', 'Series'];
const editableSteps: Step[] = [...utilitySteps, 'Calculator', 'Date Operations', 'Combine Columns', 'Replace Text', 'Split Column', 'String Operations', 'Text Formatting', 'Fixed Input', 'Input Dataset', 'Output Dataset', 'Select Columns', 'Filter Rows', 'Add Formula'];
const testedSteps = PREVIEW_STEPS;
function textConfigured(data: Data) {
  try { if (AI_STEPS.includes(data.label)) compileAI(data); else if (SCIENCE_STEPS.includes(data.label)) compileScience(data); else if (SCRIPTING_STEPS.includes(data.label)) compileScripting(data); else if (RELATIONAL_STEPS.includes(data.label)) compileRelational(data); else if (TEXT_STEPS.includes(data.label)) compileText(data); else compileUtility(data); return true; } catch { return false; }
}
function isStep(label: string): label is Step { return editableSteps.some(step => step === label); }
function StepIcon({ label }: { label: string }) {
  const icon = label === 'Input Dataset' || label === 'Output Dataset' ? <><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></> : label === 'Select Columns' ? <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/></> : label === 'Add Formula' ? <><path d="M16 3h-2c-2 0-3 1-3 3L9 18c-.3 2-1 3-3 3H5M7 9h9M16 14l5 5m0-5-5 5"/></> : label === 'Filter Rows' || label === 'Split Filter' ? <><path d="M4 5h16l-6 7v6l-4 2v-8z"/></> : label.includes('Join') ? <><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></> : label.includes('Column') || label.includes('Rows') || label.includes('Schema') ? <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/></> : label.includes('Date') || label === 'Calculator' ? <><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M4 9h16M8 2v4M16 2v4M8 13h3M8 17h3M14 13h2M14 17h2"/></> : label.includes('Script') || label.includes('SQL') ? <><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13l-2 2 2 2m6-4 2 2-2 2"/></> : <><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{icon}</svg>;
}
function PipelineNode({ id, data }: NodeProps<Node<Data>>) {
  const ports = outputPorts(data), branches = ports.length > 1, supervised = SUPERVISED_STEPS.includes(data.label), combine = JOIN_STEPS.includes(data.label) || supervised;
  const update = useUpdateNodeInternals(), portSignature = JSON.stringify(ports);
  useEffect(() => { update(id); }, [id, portSignature, update]);
  const status = data.executed ? 'Preview Spark berhasil' : data.label === 'Output Dataset' ? (data.configured ? 'Siap menerima hasil preview' : 'Hubungkan alur untuk preview') : !testedSteps.includes(data.label) ? 'Belum dapat dijalankan' : data.configured ? 'Konfigurasi terisi' : 'Belum dikonfigurasi';
  return <div className={branches || combine ? 'pipeline-multi-port' : ''} style={branches ? { minHeight: Math.max(90, ports.length * 25) } : undefined}>{!['Fixed Input', 'Input Dataset'].includes(data.label) && (combine ? <>{(supervised ? ['train', 'predict'] : ['left', 'right']).map((port, index) => <span key={port} className="pipeline-port-label is-left" style={{ top: `${30 + index * 40}%` }}><Handle id={port} type="target" position={Position.Left} title={port === 'train' ? 'Training input' : port === 'predict' ? 'Predict input (opsional)' : port === 'left' ? 'Left input' : 'Right input'} />{port === 'train' ? 'Training' : port === 'predict' ? 'Predict' : port === 'left' ? 'Left' : 'Right'}</span>)}</> : <Handle type="target" position={Position.Left} />)}<span className={`pipeline-node-icon${data.executed ? ' is-executed' : data.configured ? ' is-configured' : ' is-unconfigured'}`} title={status}><StepIcon label={data.label} /><span className="pipeline-node-state" aria-label={status}>{data.executed || data.configured ? '✓' : '!'}</span></span><span className="pipeline-node-label">{data.label}</span>{data.label !== 'Output Dataset' && ports.map((port, index) => branches ? <span key={port.id} className="pipeline-port-label is-right" style={{ top: `${(index + 1) * 100 / (ports.length + 1)}%` }}>{port.label}<Handle id={port.id} type="source" position={Position.Right} title={port.label} /></span> : <Handle key={port.id} id={port.id} type="source" position={Position.Right} />)}</div>;
}
function FormulaEditor({ value, columns, onChange }: { value: string; columns: { name: string; type: string }[]; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const insert = (name: string) => {
    const el = ref.current; const start = el?.selectionStart ?? value.length; const end = el?.selectionEnd ?? start;
    const token = '`' + name.replaceAll('`', '``') + '`';
    onChange(value.slice(0, start) + token + value.slice(end)); setOpen(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };
  return <div className="pipelines-formula-editor"><textarea ref={ref} value={value} maxLength={4000} placeholder="Tulis formula…" spellCheck={false} onChange={event => onChange(event.target.value)} /><button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>＋ Kolom</button>{open && <div className="pipelines-formula-suggestions"><input aria-label="Cari kolom formula" placeholder="Cari kolom…" value={search} onChange={event => setSearch(event.target.value)} />{columns.filter(column => column.name.toLowerCase().includes(search.toLowerCase())).map(column => <button type="button" key={column.name} onMouseDown={event => event.preventDefault()} onClick={() => insert(column.name)}>{column.name} <small>{column.type}</small></button>)}{!columns.length && <small>Hubungkan Input Dataset untuk melihat kolom.</small>}</div>}</div>;
}
const nodeTypes = { pipeline: PipelineNode };
const initial: Node<Data>[] = [
  { id: 'input', type: 'pipeline', sourcePosition: Position.Right, targetPosition: Position.Left, position: { x: 40, y: 120 }, data: { label: 'Input Dataset' } },
  { id: 'output', type: 'pipeline', sourcePosition: Position.Right, targetPosition: Position.Left, position: { x: 400, y: 120 }, data: { label: 'Output Dataset' } },
];
export default function Pipelines({initialPipelineId,onPipelineSaved,startNew=false}:{initialPipelineId?:string;onPipelineSaved?:(id:string)=>void;startNew?:boolean} = {}) {
  const [editing, setEditing] = useState(startNew);
  const pageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const sync = () => { setIsFullscreen(document.fullscreenElement === pageRef.current); setCanvasFullscreen(document.fullscreenElement === canvasRef.current); };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === pageRef.current) {
        await document.exitFullscreen();
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await pageRef.current?.requestFullscreen();
      }
    } catch {
      setFullscreenError('Mode layar penuh tidak tersedia. Periksa izin fullscreen browser.');
    }
  }
  const [nodes, setNodes, onNodesChange] = useNodesState(initial);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([{ id: 'input-output', source: 'input', target: 'output' }]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<Node<Data>, Edge> | null>(null);
  const touchDrag = useRef<{ step: Step; x: number; y: number } | null>(null);
  const [keyboardStep, setKeyboardStep] = useState<Step | null>(null);
  async function toggleCanvasFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === canvasRef.current) await document.exitFullscreen();
      else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await canvasRef.current?.requestFullscreen();
      }
      requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.2, duration: 180 }));
    } catch {
      setFullscreenError('Mode layar penuh kanvas tidak tersedia di browser ini.');
    }
  }
  const [paletteSearch, setPaletteSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<string[]>(['DATASETS']);
  const [panelHeight, setPanelHeight] = useState(75);
  const [columnSearch, setColumnSearch] = useState('');
  const [selectedSearch, setSelectedSearch] = useState('');
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [datasetColumns, setDatasetColumns] = useState<Record<string, string[]>>({});
  const [selectedOutput, setSelectedOutput] = useState('');
  const [scriptRuntime, setScriptRuntime] = useState<{ python: boolean; r: boolean } | null>(null);
  const [scriptRuntimeAttempt, setScriptRuntimeAttempt] = useState(0);
  const [aiRuntime, setAIRuntime] = useState<AIRuntime | null>(null), [aiAttempt, setAIAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/voice-api/api/studio/datasets/ai-runtime', { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json(); if (!response.ok || result.success === false) throw Error(result.code || 'AI_RUNTIME_UNAVAILABLE');
      if (!controller.signal.aborted) setAIRuntime(result.data);
    }).catch(() => { if (!controller.signal.aborted) setAIRuntime({ ready:false,provider:'Ollama lokal',models:[],default_model:'',model_inference:false,max_rows:5,max_calls:10,code:'AI_RUNTIME_UNAVAILABLE' }); });
    return () => controller.abort();
  }, [aiAttempt]);
  const aiReady = (label: string, model?: string) => label === 'AI Model Inference' ? aiRuntime?.model_inference === true : aiRuntime?.ready === true && (!model || aiRuntime.models.includes(model));

  useEffect(() => {
    const controller = new AbortController();
    fetch('/voice-api/api/studio/datasets/script-runtime', { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok || result.success === false) throw new Error('SCRIPT_RUNTIME_NOT_READY'); if (!controller.signal.aborted) setScriptRuntime({ python: result.data.python === true, r: result.data.r === true }); }).catch(() => { if (!controller.signal.aborted) setScriptRuntime({ python: false, r: false }); });
    return () => controller.abort();
  }, [scriptRuntimeAttempt]);
  const previewAvailable = (label: string) => testedSteps.includes(label) && (!AI_STEPS.includes(label) || aiReady(label)) && (!SCRIPTING_STEPS.includes(label) || scriptRuntime?.[scriptLanguage(label)] === true);
  const graphMode = needsGraph(nodes, edges);
  const datasetSignature = JSON.stringify([...new Set(nodes.filter(node => node.data.label === 'Input Dataset').map(node => node.data.datasetId).filter((id): id is string => Boolean(id)))].sort());
  useEffect(() => {
    if (!graphMode) return;
    const ids: string[] = JSON.parse(datasetSignature); if (ids.length > 4) return;
    const controller = new AbortController();
    Promise.all(ids.map(async id => { const response = await fetch(`/voice-api/api/studio/datasets/${encodeURIComponent(id)}/preview?page=1`, { credentials: 'include', cache: 'no-store', signal: controller.signal }); const result = await response.json(); if (!response.ok || result.success === false) throw new Error(result.code || 'DATASET_COLUMNS_UNAVAILABLE'); return [id, result.data.preview_columns.map((column: { name: string }) => column.name)] as const; })).then(items => { if (!controller.signal.aborted) setDatasetColumns(Object.fromEntries(items)); }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'DATASET_COLUMNS_UNAVAILABLE'); });
    return () => controller.abort();
  }, [graphMode, datasetSignature]);
  const requestRef = useRef<AbortController | null>(null);
  const signature = JSON.stringify({ nodes: nodes.map(({ id, data }) => ({ id, data })), edges: edges.map(({ source, target, sourceHandle, targetHandle }) => ({ source, target, sourceHandle, targetHandle })) });
  const [previewSignature, setPreviewSignature] = useState('');
  const signatureRef = useRef(signature);
  useEffect(() => { signatureRef.current = signature; requestRef.current?.abort(); }, [signature]);
  useEffect(() => () => requestRef.current?.abort(), []);
  let compiled: ReturnType<typeof compilePreview> | null = null;
  let readiness = '';
  try { compiled = compilePreview(nodes, edges, datasetColumns); }
  catch (err) { readiness = err instanceof Error ? err.message : 'Periksa konfigurasi pipeline.'; }
  if (nodes.some(node => SCRIPTING_STEPS.includes(node.data.label) && !scriptRuntime?.[scriptLanguage(node.data.label)])) { compiled = null; readiness = scriptRuntime ? 'Runtime scripting belum siap. Periksa runtime pada konfigurasi node.' : 'Memeriksa runtime scripting…'; }
  if (nodes.some(node => AI_STEPS.includes(node.data.label) && !aiReady(node.data.label, node.data.utilityConfig?.values?.model))) { compiled = null; readiness = aiRuntime ? 'Layanan/model AI belum siap. Pilih model yang tersedia atau periksa ulang AI Services.' : 'Memeriksa layanan AI…'; }
  const validPreview = previewSignature === signature ? preview : null;
  const outputPreview = validPreview?.outputs?.find(output => output.id === selectedOutput) ?? validPreview?.outputs?.[0];
  const currentPreview = outputPreview ? { ...validPreview, preview_columns: outputPreview.columns.map(name => ({ name, type: 'sample' })), rows: outputPreview.rows, has_more: outputPreview.has_more } : validPreview;
  const [loadError, setLoadError] = useState('');
  const [sourceColumns, setSourceColumns] = useState<{ name: string; type: string }[]>([]);
  const [loadedSourceId, setLoadedSourceId] = useState('');
  const [columnsError, setColumnsError] = useState('');
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (editorRef.current?.contains(target) && (target.closest('.react-flow__node') || target.closest('.pipelines-config'))) return;
      setSelected(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const connect = useCallback((connection: Connection) => { setPreview(null); setEdges(current => addEdge(connection, current)); }, [setEdges]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/voice-api/api/studio/datasets', { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok || result.success === false) throw new Error(result.code || 'DATASET_UNAVAILABLE'); if (!controller.signal.aborted) setDatasets((result.data as Dataset[]).filter(item => item.access_mode === 'DIRECT')); }).catch(err => { if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : 'DATASET_UNAVAILABLE'); }).finally(() => { if (!controller.signal.aborted) setDatasetsLoading(false); });
    return () => controller.abort();
  }, []);
  const add = (step: Step, point: { x: number; y: number }) => {
    const position = flowRef.current?.screenToFlowPosition(point);
    if (!position) return;
    const id = crypto.randomUUID();
    setSelected(id); setColumnSearch(''); setSelectedSearch(''); setColumnPickerOpen(false);
    setPreview(null); setNodes(current => [...current, { id, type: 'pipeline', sourcePosition: Position.Right, targetPosition: Position.Left, position, data: utilitySteps.some(name => name === step) ? { label: step, utilityConfig: { rows: [{ id: crypto.randomUUID(), column: '', output: '', kind: '', value: '' }] } } : step === 'Calculator' || step === 'Date Operations' ? { label: step, calculations: [{ id: crypto.randomUUID(), output: '', operation: step === 'Calculator' ? 'addition' : '', leftKind: 'column', left: '', rightKind: 'column', right: '' }] } : step === 'Fixed Input' ? { label: step, fixedColumns: ['Column 1'], fixedRows: [['']] } : ['Replace Text', 'String Operations', 'Text Formatting'].includes(step) ? { label: step, textRules: [{ id: crypto.randomUUID(), column: '', find: '', replace: '', output: '', operation: '', numberHandling: '' }] } : { label: step } }]);
  };
  async function loadScienceTraining(signal: AbortSignal) {
    if (!selected) throw Error('Pilih node model terlebih dahulu.');
    const training = compileScienceTraining(nodes, edges, selected), graph = compileGraph(training.nodes, training.edges, datasetColumns);
    const csrf = document.cookie.split('; ').find(item => item.startsWith('core_csrf='));
    const response = await fetch(graph.url, { method: 'POST', credentials: 'include', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ? decodeURIComponent(csrf.slice(10)) : '' }, body: JSON.stringify(graph.body) });
    const result = await response.json(); if (!response.ok || result.success === false) throw Error(result.detail ? `${result.code}: ${result.detail}` : result.code || 'TRAINING_SAMPLE_UNAVAILABLE');
    return { columns: result.data.columns as string[], rows: result.data.rows as (string | null)[][] };
  }
  const update = (values: Partial<Data>) => { setPreview(null); setNodes(current => current.map(node => node.id === selected ? { ...node, data: { ...node.data, ...values } } : node)); };
  let performanceInspection: ReturnType<typeof compileGraph> | null = null;
  if (nodes.some(node => PERFORMANCE_STEPS.includes(node.data.label))) { try { performanceInspection = compileGraph(nodes, edges, datasetColumns, true); } catch { /* readiness already reports graph errors */ } }
  const displayNodes: Node<Data>[] = nodes.map(node => ({ ...node, data: { ...node.data, executed: Boolean(currentPreview), configured: AI_STEPS.includes(node.data.label) ? aiReady(node.data.label, node.data.utilityConfig?.values?.model) && textConfigured(node.data) : PERFORMANCE_STEPS.includes(node.data.label) ? Boolean(performanceInspection?.ports[node.id]?.main && !performanceInspection.errors[node.id]) : node.data.label === 'Output Dataset' ? Boolean(compiled) : node.data.label === 'Fixed Input' ? Boolean(node.data.fixedColumns?.length && node.data.fixedColumns.every(name => name.trim()) && node.data.fixedRows?.length) : node.data.label === 'Input Dataset' ? Boolean(node.data.datasetId && datasets.some(dataset => dataset.dataset_id === node.data.datasetId)) : node.data.label === 'Select Columns' ? Boolean(node.data.columns?.length) : node.data.label === 'Filter Rows' ? Boolean(node.data.filterExpression?.trim() || ((node.data.rules ?? []).length && (node.data.rules ?? []).every(rule => rule.column))) : SCIENCE_STEPS.includes(node.data.label) || TEXT_STEPS.includes(node.data.label) || UTILITY_PREVIEW_STEPS.includes(node.data.label) || RELATIONAL_STEPS.includes(node.data.label) || SCRIPTING_STEPS.includes(node.data.label) ? (SCRIPTING_STEPS.includes(node.data.label) ? Boolean(scriptRuntime?.[scriptLanguage(node.data.label)]) && textConfigured(node.data) : textConfigured(node.data)) : false } }));
  const active = nodes.find(node => node.id === selected);
  const activeOutput = validPreview?.outputs?.find(output => output.id === active?.id);
  const activeResult = activeOutput ? { columns: activeOutput.columns.length, rows: activeOutput.rows.length } : currentPreview ? { columns: currentPreview.preview_columns.length, rows: currentPreview.rows.length } : null;
  const upstream: Node<Data>[] = [];
  let previous = active;
  while (previous) {
    const incoming = edges.filter(edge => edge.target === previous!.id);
    if (incoming.length !== 1) break;
    const next = nodes.find(node => node.id === incoming[0].source);
    if (!next || upstream.some(node => node.id === next.id) || next.id === active?.id) break;
    upstream.unshift(next);
    previous = next;
  }
  const sourceId = upstream[0]?.data.label === 'Input Dataset' ? upstream[0].data.datasetId : undefined;
  const fixedSource = upstream[0]?.data.label === 'Fixed Input' ? upstream[0].data : undefined;
  let availableColumns = fixedSource ? (fixedSource.fixedColumns ?? []).map(name => name.trim()).filter(Boolean).map(name => ({ name, type: 'text' })) : loadedSourceId === sourceId ? sourceColumns : [];
  let upstreamError = '';
  for (const node of upstream) if (node.data.label === 'Select Columns') {
    const allowed = node.data.columns ?? [];
    availableColumns = allowed.flatMap(name => availableColumns.filter(column => column.name === name).map(column => ({ ...column, name: node.data.renames?.[name]?.trim() || name }))); 
  } else if (TEXT_STEPS.includes(node.data.label)) {
    try { availableColumns = (compileText(node.data, availableColumns.map(column => column.name)).columns ?? []).map(name => ({ name, type: 'text' })); }
    catch (err) { upstreamError = err instanceof Error ? err.message : 'Periksa konfigurasi Text sebelumnya.'; availableColumns = []; break; }
  } else if (UTILITY_PREVIEW_STEPS.includes(node.data.label)) {
    try { availableColumns = (compileUtility(node.data, availableColumns.map(column => column.name)).columns ?? []).map(name => ({ name, type: 'sample' })); }
    catch (err) { upstreamError = err instanceof Error ? err.message : 'Periksa konfigurasi Utility sebelumnya.'; availableColumns = []; break; }
  }
  let rightColumns: { name: string; type: string }[] = [], graphInputLabels: string[] = [];
  let performanceStores: StoredColumns[] = [];
  if (graphMode && active) {
    try {
      const inspection = performanceInspection ?? compileGraph(nodes, edges, datasetColumns, true);
      performanceStores = inspection.availableStores[active.id] ?? [];
      availableColumns = (inspection.inputColumns[active.id]?.[0] ?? []).map(name => ({ name, type: 'sample' }));
      rightColumns = (inspection.inputColumns[active.id]?.[1] ?? []).map(name => ({ name, type: 'sample' }));
      const incoming = edges.filter(edge => edge.target === active.id).sort((a, b) => (['left', 'train'].includes(a.targetHandle ?? '') ? 0 : 1) - (['left', 'train'].includes(b.targetHandle ?? '') ? 0 : 1));
      graphInputLabels = incoming.map(edge => { const parent = nodes.find(node => node.id === edge.source); return `${parent?.data.label ?? edge.source} (${edge.source.slice(0, 8)})`; });
    } catch (err) { upstreamError = err instanceof Error ? err.message : 'Periksa koneksi graph.'; }
  }
  useEffect(() => {
    if (!sourceId) return;
    const controller = new AbortController();
    fetch(`/voice-api/api/studio/datasets/${encodeURIComponent(sourceId)}/preview?page=1`, { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.code || 'DATASET_COLUMNS_UNAVAILABLE');
      if (!controller.signal.aborted) { setSourceColumns(result.data.preview_columns); setLoadedSourceId(sourceId); setColumnsError(''); }
    }).catch(err => { if (!controller.signal.aborted) { setSourceColumns([]); setColumnsError(err instanceof Error ? err.message : 'DATASET_COLUMNS_UNAVAILABLE'); setLoadedSourceId(sourceId); } });
    return () => controller.abort();
  }, [sourceId]);
  async function runPreview() {
    if (!compiled || busy) return;
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    const startedSignature = signature;
    setError(''); setPreview(null); setBusy(true);
    try {
      const csrf = document.cookie.split('; ').find(item => item.startsWith('core_csrf='));
      const response = await fetch(compiled.url, { method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ? decodeURIComponent(csrf.slice(10)) : '' }, body: JSON.stringify(compiled.body) });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.detail ? `${result.code}: ${result.detail}` : result.code || 'SPARK_PREVIEW_UNAVAILABLE');
      if (controller.signal.aborted || signatureRef.current !== startedSignature) return;
      const data = result.data as { columns: string[]; rows: (string | null)[][]; has_more: boolean; outputs?: OutputPreview[]; script_logs?: ScriptLog[]; ai_usage?: AIUsage[] };
      const outputNode = nodes.find(node => node.data.label === 'Output Dataset');
      const receivedOutputs = data.outputs ?? [{ id: outputNode?.id ?? 'output', name: outputNode?.data.outputName?.trim() || 'Output', columns: data.columns, rows: data.rows, has_more: data.has_more }];
      setSelectedOutput(receivedOutputs[0]?.id ?? '');
      setPreviewSignature(startedSignature);
      setPreview({ aiUsage: data.ai_usage, scriptLogs: data.script_logs, outputs: receivedOutputs, preview_columns: data.columns.map(name => ({ name, type: 'sample' })), rows: data.rows, has_more: data.has_more });
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : 'PREVIEW_UNAVAILABLE'; setError(message);
        if (/^AI_(?:PROVIDER_|MODEL_NOT_AVAILABLE|RUNTIME_)/.test(message)) { setAIRuntime(current => current ? { ...current, ready:false, code:message.split(':')[0] } : current); setAIAttempt(value => value + 1); }
      }
    } finally { if (requestRef.current === controller) setBusy(false); }
  }
  return <section ref={pageRef} className={`datasets-page pipelines-page${editing ? ' is-editor-open' : ''}`}>
    <UniverseHeader className="datasets-header pipelines-compact-heading"><div><span className="datasets-eyebrow">DATA STUDIO / ETL</span><h1>{editing ? 'DataFlow' : 'ETL & Pipelines'}<span>.</span></h1></div><button className="pipelines-fullscreen-button" type="button" onClick={() => void toggleFullscreen()} aria-pressed={isFullscreen} title={isFullscreen ? 'Keluar layar penuh (Esc)' : 'Perbesar editor ke layar penuh'}>{isFullscreen ? '↙ Keluar layar penuh' : '⛶ Layar penuh'}</button></UniverseHeader>
    {fullscreenError && <p className="pipelines-fullscreen-error" role="alert">{fullscreenError}</p>}
    <PipelinePersistence initialPipelineId={initialPipelineId} onSaved={onPipelineSaved} document={pipelineDocument(nodes, edges, datasetColumns)} editing={editing} onEditingChange={setEditing} onNew={() => { setNodes(structuredClone(initial));setEdges([{id:'input-output',source:'input',target:'output'}]);setSelected(null);setPreview(null);setError(''); }} onLoad={document => { setNodes(document.nodes as Node<Data>[]);setEdges(document.edges);setSelected(null);setPreview(null);setError(''); }} />
    {editing && <><UniverseToolbar className="pipelines-toolbar">{focusedNode && <button type="button" onClick={() => setSelected(focusedNode)}>Buka konfigurasi node terpilih</button>}{keyboardStep && <button type="button" onClick={() => { const rect = editorRef.current?.querySelector('.pipelines-canvas')?.getBoundingClientRect(); if (rect) add(keyboardStep, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); setKeyboardStep(null); }}>Tambahkan ke tengah kanvas</button>}<button type="button" className="datasets-action" onClick={() => void runPreview()} disabled={busy || !compiled} title={readiness || 'Jalankan alur di Spark'}>{busy ? 'Memuat preview…' : '▶ Jalankan preview'}</button></UniverseToolbar><p className="pipelines-preview-readiness" role="status">{busy ? 'Memproses preview…' : readiness}</p><div ref={editorRef} className={`pipelines-builder${active ? ' has-config' : ''}`}><UniverseInspector className="pipelines-palette" aria-label="Komponen pipeline"><div id="pipelines-palette-list" className="pipelines-palette-content"><label className="pipelines-palette-search"><span className="connections-sr-only">Cari komponen</span><input value={paletteSearch} onChange={event => setPaletteSearch(event.target.value)} placeholder="Cari komponen…" /></label>{groups.map(group => { const matching = group.items.filter(step => step.toLowerCase().includes(paletteSearch.toLowerCase())); return (matching.length > 0 || (!paletteSearch.trim() && !group.items.length)) ? <details key={`${group.label}:${paletteSearch.trim() ? paletteSearch.toLowerCase() : "browse"}`} open={paletteSearch.trim() ? matching.length > 0 : openGroups.includes(group.label)} onToggle={event => { if (paletteSearch.trim()) return; const isOpen = event.currentTarget.open; setOpenGroups(current => current.includes(group.label) === isOpen ? current : isOpen ? [...current, group.label] : current.filter(name => name !== group.label)); }}><summary>{group.label}</summary><div className="pipelines-palette-grid">{matching.map(step => <button key={step} type="button" className={previewAvailable(step) ? 'is-tested' : isStep(step) ? 'is-draft' : 'is-planned'} title={previewAvailable(step) ? 'Tersedia untuk preview awal' : AI_STEPS.includes(step) ? 'Layanan/model AI belum siap' : SCRIPTING_STEPS.includes(step) ? 'Runtime scripting belum siap' : isStep(step) ? 'Rancangan: belum dapat dijalankan' : 'Belum tersedia'} disabled={!isStep(step)} draggable={isStep(step)} onDragStart={event => { if (!isStep(step)) return; event.dataTransfer.setData('application/x-coreanalytics-step', step); event.dataTransfer.effectAllowed = 'copy'; }} onPointerDown={event => { if (isStep(step) && event.pointerType === 'touch') { touchDrag.current = { step, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerUp={event => { const drag = touchDrag.current; touchDrag.current = null; if (!drag || event.pointerType !== 'touch' || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 12) return; if (document.elementFromPoint(event.clientX, event.clientY)?.closest('.pipelines-canvas')) add(drag.step, { x: event.clientX, y: event.clientY }); }} onPointerCancel={() => { touchDrag.current = null; }} onKeyDown={event => { if (isStep(step) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setKeyboardStep(step); } }} aria-label={`${step}, seret ke kanvas atau pilih dengan keyboard`}><span className="pipelines-palette-icon"><StepIcon label={step} /></span><span>{step}</span>{!previewAvailable(step) && <small>{AI_STEPS.includes(step) ? 'Model belum siap':SCRIPTING_STEPS.includes(step) ? 'Runtime belum siap':'Belum siap'}</small>}</button>)}</div>{!group.items.length && <p className="pipelines-palette-planned">Belum tersedia</p>}</details> : null; })}{!groups.some(group => group.items.some(step => step.toLowerCase().includes(paletteSearch.toLowerCase()))) && <p>Komponen tidak ditemukan.</p>}</div></UniverseInspector><div ref={canvasRef} className="pipelines-canvas pipelines-canvas--fullscreen-ready" onDragOver={event => { if (Array.from(event.dataTransfer.types).includes('application/x-coreanalytics-step')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={event => { event.preventDefault(); const step = event.dataTransfer.getData('application/x-coreanalytics-step'); if (isStep(step)) add(step, { x: event.clientX, y: event.clientY }); }}><button type="button" className="pipelines-canvas-fullscreen-button" onClick={() => void toggleCanvasFullscreen()} aria-label={canvasFullscreen ? "Keluar layar penuh kanvas" : "Lihat kanvas layar penuh"} title={canvasFullscreen ? "Keluar layar penuh (Esc)" : "Layar penuh kanvas"}>{canvasFullscreen ? "↙ Kembali" : "⛶ Full Canvas"}</button><ReactFlow onInit={instance => { flowRef.current = instance; requestAnimationFrame(() => requestAnimationFrame(() => { if (flowRef.current === instance) void instance.fitView({ padding: 0.25 }); })); }} nodeTypes={nodeTypes} nodes={displayNodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={changes => { setPreview(null); onEdgesChange(changes); }} onConnect={connect} onSelectionChange={({ nodes: selection }) => { setFocusedNode(selection.length === 1 ? selection[0].id : null); }} onNodeDoubleClick={(_, node) => { setSelected(node.id); setColumnSearch(''); setSelectedSearch(''); setColumnPickerOpen(false); }} fitView fitViewOptions={{ padding: 0.25 }}><Background /><Controls /></ReactFlow></div>
    {active && <div className="pipelines-config" style={{ height: `${panelHeight}%` }}><div className="pipelines-panel-resize" role="separator" tabIndex={0} aria-label="Ubah tinggi panel konfigurasi" aria-orientation="horizontal" aria-valuemin={30} aria-valuemax={90} aria-valuenow={panelHeight} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = editorRef.current?.getBoundingClientRect(); if (rect?.height) setPanelHeight(Math.max(30, Math.min(90, Math.round((rect.bottom - event.clientY) / rect.height * 100)))); }} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setPanelHeight(value => Math.max(30, Math.min(90, value + (event.key === 'ArrowUp' ? 5 : -5)))); } }}><span /></div><div className="pipelines-config-header"><strong>{active.data.label}</strong><span>Konfigurasi</span><button type="button" aria-label="Tutup konfigurasi" onClick={() => setSelected(null)}>×</button></div>{active?.data.label === 'Fixed Input' && <div className="fixed-input-editor"><p>Masukkan data teks manual untuk preview. Maksimum 30 kolom dan 50 baris; data belum disimpan saat jendela ditutup.</p><div className="fixed-input-actions"><button type="button" disabled={(active.data.fixedColumns ?? []).length >= 30} onClick={() => update({ fixedColumns: [...(active.data.fixedColumns ?? []), `Column ${(active.data.fixedColumns ?? []).length + 1}`], fixedRows: (active.data.fixedRows ?? []).map(row => [...row, '']) })}>＋ Kolom</button><button type="button" disabled={(active.data.fixedRows ?? []).length >= 50} onClick={() => update({ fixedRows: [...(active.data.fixedRows ?? []), (active.data.fixedColumns ?? []).map(() => '')] })}>＋ Baris</button></div><div className="fixed-input-scroll"><UniverseTable><thead><tr><th>#</th>{(active.data.fixedColumns ?? []).map((name, col) => <th key={col}><input aria-label={`Nama kolom ${col + 1}`} value={name} maxLength={128} onChange={e => update({ fixedColumns: (active.data.fixedColumns ?? []).map((value, index) => index === col ? e.target.value : value) })} /><button type="button" disabled={(active.data.fixedColumns ?? []).length <= 1} aria-label={`Hapus kolom ${col + 1}`} onClick={() => update({ fixedColumns: (active.data.fixedColumns ?? []).filter((_, index) => index !== col), fixedRows: (active.data.fixedRows ?? []).map(row => row.filter((_, index) => index !== col)) })}>×</button></th>)}</tr></thead><tbody>{(active.data.fixedRows ?? []).map((row, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}<button type="button" disabled={(active.data.fixedRows ?? []).length <= 1} aria-label={`Hapus baris ${rowIndex + 1}`} onClick={() => update({ fixedRows: (active.data.fixedRows ?? []).filter((_, index) => index !== rowIndex) })}>×</button></th>{row.map((value, col) => <td key={col}><input aria-label={`Baris ${rowIndex + 1}, kolom ${col + 1}`} maxLength={256} value={value} onChange={e => update({ fixedRows: (active.data.fixedRows ?? []).map((values, index) => index === rowIndex ? values.map((cell, i) => i === col ? e.target.value : cell) : values) })} /></td>)}</tr>)}</tbody></UniverseTable></div></div>}{active?.data.label === 'Input Dataset' && <SearchPicker label="Dataset sumber" placeholder={datasetsLoading ? 'Memuat dataset…' : 'Cari dataset Direct'} disabled={datasetsLoading} loading={datasetsLoading} options={datasets.map(d => ({ value: d.dataset_id, label: d.dataset_name, detail: d.connection_name }))} value={active.data.datasetId ?? ''} onSelect={value => update({ datasetId: value })} />}{(active?.data.label === 'Filter Rows' || active?.data.label === 'Select Columns') && <>{!graphMode && !sourceId && !fixedSource ? <p>Hubungkan node ini ke Input Dataset atau Fixed Input yang sudah dipilih.</p> : !graphMode && !fixedSource && loadedSourceId !== sourceId ? <p role="status">Memuat kolom dataset…</p> : !graphMode && !fixedSource && columnsError ? <p role="alert">Kolom tidak dapat dimuat ({columnsError}).</p> : availableColumns.length === 0 ? <p>Tidak ada kolom yang tersedia dari node sebelumnya.</p> : active.data.label === 'Filter Rows' ? <div className="pipelines-filter-config"><label><span>Formula filter (opsional, menggantikan aturan di bawah)</span><input maxLength={4000} placeholder="Amount >= 10 AND Status = 'A'" value={active.data.filterExpression ?? ''} onChange={event => update({ filterExpression: event.target.value })} /></label><p>Baris harus memenuhi semua aturan berikut (AND).</p>{(active.data.rules ?? []).map((rule, index) => <div key={rule.id} className="pipelines-filter-rule"><strong>Aturan {index + 1}</strong><div className="pipelines-filter-steps"><label><span>Pilih kolom</span><select value={rule.column} onChange={e => update({ rules: (active.data.rules ?? []).map(item => item.id === rule.id ? { ...item, column: e.target.value } : item) })}><option value="">Pilih kolom</option>{availableColumns.map(column => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}</select></label><label><span>Jenis perbandingan</span><select value={rule.op} onChange={e => update({ rules: (active.data.rules ?? []).map(item => item.id === rule.id ? { ...item, op: e.target.value as FilterOp } : item) })}><option value="eq">Sama dengan</option><option value="neq">Tidak sama dengan (termasuk NULL)</option><option value="null">Adalah NULL</option><option value="notnull">Bukan NULL</option></select></label>{rule.op !== 'null' && rule.op !== 'notnull' && <label><span>Nilai pembanding</span><input value={rule.value} onChange={e => update({ rules: (active.data.rules ?? []).map(item => item.id === rule.id ? { ...item, value: e.target.value } : item) })} placeholder="Masukkan nilai" /></label>}</div><button type="button" onClick={() => update({ rules: (active.data.rules ?? []).filter(item => item.id !== rule.id) })}>Hapus aturan</button></div>)}<button type="button" className="pipelines-add-formula" onClick={() => update({ rules: [...(active.data.rules ?? []), { id: crypto.randomUUID(), column: '', op: 'eq', value: '' }] })}>＋ Tambah aturan</button></div> : <div className="pipelines-column-picker"><p>Pilih kolom yang akan disertakan dalam dataset.</p><div className="pipelines-column-actions"><button type="button" onClick={() => setColumnPickerOpen(value => !value)} aria-expanded={columnPickerOpen}>＋ Tambah kolom</button><span>{(active.data.columns ?? []).length} dari {availableColumns.length} kolom dipilih</span></div>{columnPickerOpen && <div className="pipelines-column-menu"><input aria-label="Cari kolom" placeholder="Cari kolom…" value={columnSearch} onChange={e => setColumnSearch(e.target.value)} /><button type="button" className="pipelines-select-all" onClick={() => update({ columns: availableColumns.map(column => column.name) })}>Pilih semua</button><div className="pipelines-column-list">{availableColumns.filter(column => column.name.toLowerCase().includes(columnSearch.toLowerCase())).map(column => <label key={column.name}><input type="checkbox" checked={(active.data.columns ?? []).includes(column.name)} onChange={e => update({ columns: e.target.checked ? [...(active.data.columns ?? []), column.name] : (active.data.columns ?? []).filter(name => name !== column.name) })} /><span>{column.name}</span><small>{column.type}</small></label>)}</div></div>}{(active.data.columns ?? []).length > 0 && <div className="pipelines-selected-table"><input aria-label="Cari kolom terpilih" placeholder="Cari kolom yang dipilih…" value={selectedSearch} onChange={e => setSelectedSearch(e.target.value)} /><div className="pipelines-selected-heading"><span>Nama kolom</span><span>Nama baru</span><span>Urutan</span></div>{(active.data.columns ?? []).filter(name => name.toLowerCase().includes(selectedSearch.toLowerCase())).map(name => { const all = active.data.columns ?? []; const index = all.indexOf(name); const move = (to: number) => { const next = [...all]; [next[index], next[to]] = [next[to], next[index]]; update({ columns: next }); }; return <div className="pipelines-selected-row" key={name}><span>{name}</span><input aria-label={`Nama baru untuk ${name}`} placeholder="Nama baru (opsional)" value={active.data.renames?.[name] ?? ''} onChange={e => update({ renames: { ...active.data.renames, [name]: e.target.value } })} /><div><button type="button" disabled={index === 0} aria-label={`Pindahkan ${name} ke atas`} onClick={() => move(index - 1)}>↑</button><button type="button" disabled={index === all.length - 1} aria-label={`Pindahkan ${name} ke bawah`} onClick={() => move(index + 1)}>↓</button><button type="button" aria-label={`Hapus kolom ${name}`} onClick={() => update({ columns: all.filter(column => column !== name) })}>×</button></div></div>; })}</div>}</div>}</>}{active && TEXT_STEPS.includes(active.data.label) && <>{upstreamError && <p role="alert">{upstreamError}</p>}<TextTransformEditor data={active.data} columns={availableColumns} onChange={update} /></>}{active && (active.data.label === 'Calculator' || active.data.label === 'Date Operations') && <DateNumberEditor data={active.data} columns={availableColumns} onChange={calculations => update({ calculations })} />}{active && RELATIONAL_STEPS.includes(active.data.label) && <RelationalEditor kind={active.data.label as Utility} config={active.data.utilityConfig ?? { rows: [] }} columns={availableColumns} rightColumns={rightColumns} inputs={graphInputLabels} onChange={utilityConfig => update({ utilityConfig })} />}{active?.data.label === 'AutoML Inference' && <AutoMLEditor key={active.id} config={active.data.utilityConfig ?? {}} columns={availableColumns} loadTrainingData={loadScienceTraining} onChange={utilityConfig => update({ utilityConfig })} />}{active && active.data.label !== 'AutoML Inference' && SCIENCE_STEPS.includes(active.data.label) && <DataScienceEditor kind={active.data.label} config={active.data.utilityConfig ?? {}} columns={availableColumns} predictionColumns={rightColumns} inputs={graphInputLabels} onChange={utilityConfig => update({ utilityConfig })} />}{active && AI_STEPS.includes(active.data.label) && <AIServicesEditor kind={active.data.label} config={active.data.utilityConfig ?? {}} columns={availableColumns} runtime={aiRuntime} onRefresh={() => setAIAttempt(value => value + 1)} loadTrainingData={loadScienceTraining} onChange={utilityConfig => update({ utilityConfig })} />}{active && PERFORMANCE_STEPS.includes(active.data.label) && <PerformanceEditor kind={active.data.label} config={active.data.utilityConfig ?? {}} columns={availableColumns} stores={performanceStores} onChange={utilityConfig => update({ utilityConfig })} />}{active && SCRIPTING_STEPS.includes(active.data.label) && <ScriptingEditor data={active.data} columns={availableColumns} ready={scriptRuntime ? scriptRuntime[scriptLanguage(active.data.label)] : null} onRefresh={() => setScriptRuntimeAttempt(value => value + 1)} onChange={utilityConfig => update({ utilityConfig })} />}{active && !AI_STEPS.includes(active.data.label) && !PERFORMANCE_STEPS.includes(active.data.label) && !SCIENCE_STEPS.includes(active.data.label) && !SCRIPTING_STEPS.includes(active.data.label) && !RELATIONAL_STEPS.includes(active.data.label) && utilitySteps.some(step => step === active.data.label) && (advancedSteps.some(step => step === active.data.label) ? <AdvancedDraft kind={active.data.label as Utility} config={active.data.utilityConfig ?? { rows: [] }} columns={availableColumns} onChange={utilityConfig => update({ utilityConfig })} /> : <UtilityDraft kind={active.data.label as Utility} config={active.data.utilityConfig ?? { rows: [] }} columns={availableColumns} onChange={utilityConfig => update({ utilityConfig })} />) }{active?.data.label === 'Add Formula' && <div className="pipelines-formulas"><p>Tambahkan kolom hasil dan tulis rumusnya. Formula dijalankan di Spark sesuai urutan aturan.</p>{(active.data.formulas ?? []).map((formula, index) => <div className="pipelines-formula-row" key={formula.id}><label><span>{index + 1} · Nama kolom hasil</span><input value={formula.name} maxLength={128} placeholder="Nama kolom" onChange={event => update({ formulas: (active.data.formulas ?? []).map(item => item.id === formula.id ? { ...item, name: event.target.value } : item) })} /></label><label><span>Rumus</span><FormulaEditor value={formula.expression} columns={availableColumns} onChange={value => update({ formulas: (active.data.formulas ?? []).map(item => item.id === formula.id ? { ...item, expression: value } : item) })} /></label><span className="pipelines-formula-status">{compiled ? 'Siap preview' : 'Periksa formula'}</span><button type="button" aria-label={`Hapus formula ${index + 1}`} onClick={() => update({ formulas: (active.data.formulas ?? []).filter(item => item.id !== formula.id) })}>×</button></div>)}<button type="button" className="pipelines-add-formula" onClick={() => update({ formulas: [...(active.data.formulas ?? []), { id: crypto.randomUUID(), name: '', expression: '' }] })}>＋ Tambah formula</button><p>Gunakan nama kolom (backtick untuk nama dengan spasi), angka, + - * / % **, dan fungsi abs, ceil, floor, round, sqrt, power, upper, lower, trim, length, concat, coalesce, year, month, dayofmonth. Contoh: `Harga` * `Jumlah`. Pembagian nol atau angka tidak valid menghasilkan NULL.</p></div>}{active?.data.label === 'Output Dataset' && <div><label><span>Nama output</span><input maxLength={150} value={active.data.outputName ?? ''} onChange={event => update({ outputName: event.target.value })} /></label><p>{activeResult ? `✓ Spark berhasil: ${activeResult.columns} kolom · ${activeResult.rows} baris.` : readiness || 'Alur siap. Klik Jalankan preview untuk melihat hasil.'}</p></div>}{loadError && active?.data.label === 'Input Dataset' && <p role="alert">Dataset tidak dapat dimuat ({loadError}).</p>}</div>}</div>
    {error && <div className="datasets-source-error" role="alert">{error}</div>}{busy && <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat preview pipeline…</strong><span>Menunggu hasil pemrosesan Spark.</span></div>}{currentPreview && <div className="pipelines-preview" role="region" aria-label="Hasil preview Spark"><label className="pipelines-output-picker"><span>Output preview</span><select aria-label="Pilih output preview" value={outputPreview?.id ?? ''} onChange={event => setSelectedOutput(event.target.value)}>{validPreview?.outputs?.map(output => <option key={output.id} value={output.id}>{output.name}</option>) ?? <option value="">Output</option>}</select></label><strong>✓ Spark preview berhasil · {currentPreview.preview_columns.length} kolom · {currentPreview.rows.length} baris {currentPreview.has_more ? '· sampel dibatasi atau sumber memiliki lebih banyak data' : ''}</strong><div className="explorer-table-scroll"><UniverseTable><thead><tr>{currentPreview.preview_columns.map(c => <th key={c.name}>{c.name}</th>)}</tr></thead><tbody>{currentPreview.rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j}>{value ?? 'NULL'}</td>)}</tr>)}</tbody></UniverseTable></div>{currentPreview.aiUsage?.length ? <details className="pipelines-script-logs"><summary>Detail AI Services</summary>{currentPreview.aiUsage.map((usage, i) => <p key={i}>{usage.provider} · {usage.model} · {usage.rows} baris · {usage.requests} panggilan · {usage.execution}</p>)}</details> : null}{currentPreview.scriptLogs?.length ? <details className="pipelines-script-logs"><summary>Log scripting</summary>{currentPreview.scriptLogs.map((entry, index) => <div key={index}><strong>{entry.language.toUpperCase()}{entry.node ? ` · ${entry.node}` : ''}</strong><pre>{entry.logs || '(tidak ada log)'}</pre></div>)}</details> : null}</div>}</>}
  </section>;
}
