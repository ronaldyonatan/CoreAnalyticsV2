import { useEffect, useRef, useState } from 'react';
import { batchReadiness, pipelineApi, pipelineMessage, pipelineUuid } from './pipelineMetadata';
import type { PipelineDocument } from './pipelineMetadata';
type Summary = { pipeline_id:string; pipeline_name:string; version:number; updated_at?:string };
type Saved = Summary & { document:PipelineDocument };
function updated(value?:string) {
  if (!value) return '—';
  const date=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value:value+'Z');
  return Number.isNaN(date.getTime()) ? '—':date.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
}
export default function PipelinePersistence({ document, editing, onEditingChange, onNew, onLoad, initialPipelineId, onSaved }: {
  document:PipelineDocument;editing:boolean;onEditingChange:(value:boolean)=>void;onNew:()=>void;onLoad:(value:PipelineDocument)=>void;initialPipelineId?:string;onSaved?:(id:string)=>void;
}) {
  const [name,setName]=useState('Pipeline baru'),[id,setId]=useState(''),[version,setVersion]=useState(0),[saved,setSaved]=useState('');
  const [items,setItems]=useState<Summary[]>([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[query,setQuery]=useState(''),[opened,setOpened]=useState(false);
  const request=useRef<{ key:string; id:string } | null>(null);
  const loadRequest=useRef<AbortController | null>(null);
  const [loadingDocument,setLoadingDocument]=useState(Boolean(initialPipelineId));
  const [metadataError,setMetadataError]=useState('');
  const signature=JSON.stringify({name,document}),dirty=signature!==saved,reason=batchReadiness(document);
  useEffect(() => {
    const controller=new AbortController();
    pipelineApi<{metadata_ready:boolean}>('/status',undefined,controller.signal).then(async status => {
      if (!status.metadata_ready) throw Error('PIPELINE_SCHEMA_REQUIRED');
      const list=await pipelineApi<Summary[]>('',undefined,controller.signal);
      if (!controller.signal.aborted) {setItems(list);setReady(true);setMetadataError('');}
    }).catch(error => {if (!controller.signal.aborted) {setReady(false);setMetadataError(pipelineMessage(error));}})
      .finally(()=>{if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[attempt]);
  useEffect(()=>{
    if(initialPipelineId) void load(initialPipelineId);
    return () => loadRequest.current?.abort();
  },[initialPipelineId]);
  function refresh() {setLoading(true);setAttempt(value=>value+1);}
  function canReplace() {return !opened || !dirty || window.confirm('Ganti perubahan yang belum disimpan?');}
  function create() {
    if (!canReplace()) return;
    setName('Pipeline baru');setId('');setVersion(0);setSaved('');setMessage('');setOpened(true);request.current=null;
    onNew();onEditingChange(true);
  }
  async function save(asNew=false) {
    setBusy(true);setError('');setMessage('');
    const snapshot=signature;
    try {
      const result=await pipelineApi<Summary>('',{name,document,pipeline_id:asNew ? null:id ? pipelineUuid(id):null,expected_version:asNew ? 0:version});
      setId(pipelineUuid(result.pipeline_id));setVersion(result.version);setSaved(snapshot);setMessage(`Versi ${result.version} tersimpan.`);
      setItems(previous => [result,...previous.filter(item => item.pipeline_id!==result.pipeline_id)]);onSaved?.(pipelineUuid(result.pipeline_id));
    } catch (error) {setError(pipelineMessage(error));} finally {setBusy(false);}
  }
  async function load(value:string) {
    if (!value || !canReplace()) return;
    const controller=new AbortController();
    loadRequest.current?.abort();loadRequest.current=controller;
    setLoadingDocument(true);setBusy(true);setError('');setMessage('');
    try {
      const result=await pipelineApi<Saved>('/'+pipelineUuid(value),undefined,controller.signal);
      if (controller.signal.aborted) return;
      onLoad(result.document);setName(result.pipeline_name);setId(pipelineUuid(result.pipeline_id));setVersion(result.version);setOpened(true);
      setSaved(JSON.stringify({name:result.pipeline_name,document:result.document}));onEditingChange(true);
    } catch (error) {if (!controller.signal.aborted) setError(pipelineMessage(error));}
    finally {if (!controller.signal.aborted) {setLoadingDocument(false);setBusy(false);}}
  }
  async function run() {
    setBusy(true);setError('');setMessage('');
    let runId:string;
    try {runId=pipelineUuid(id);} catch(error) {setError(pipelineMessage(error));setBusy(false);return;}
    const key=runId+':'+version;
    if (request.current?.key!==key) request.current={key,id:crypto.randomUUID()};
    try {
      await pipelineApi<{run_id:string;status:string}>('/'+runId+'/runs',{version,request_id:request.current!.id});
      setMessage('Job masuk antrean. Pantau hasil di Job Monitor.');request.current=null;
    } catch (error) {setError(pipelineMessage(error));} finally {setBusy(false);}
  }
  const filtered=items.filter(item=>item.pipeline_name.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className={`pipeline-persistence ${editing ? 'is-editing':'is-catalog'}`} aria-label={editing ? 'Pengaturan pipeline':'Daftar pipeline'}>
    {loadingDocument ? <div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat DataFlow…</strong><span>Mengambil konfigurasi pipeline tersimpan.</span></div> : editing ? <div className="pipeline-editor-bar">
      <button type="button" className="pipeline-back" disabled={busy} onClick={()=>{onEditingChange(false);setMessage('');refresh();}}>← Daftar pipeline</button>
      <label className="pipeline-name-field"><span className="connections-sr-only">Nama pipeline</span><input aria-label="Nama pipeline" value={name} maxLength={150} onChange={event=>setName(event.target.value)} /></label>
      <span className="pipeline-version">{version ? `v${version}`:'Baru'}<span className={dirty ? 'is-dirty':''}>{dirty ? 'Belum disimpan':'Tersimpan'}</span></span>
      <div className="pipeline-editor-actions"><button type="button" className="pipeline-save" disabled={!ready || busy || !name.trim() || !dirty} onClick={()=>void save()}>Simpan</button>
      <button type="button" className="pipeline-run" disabled={!ready || busy || !id || dirty || !!reason} title={reason || (dirty ? 'Simpan perubahan terlebih dahulu':'Jalankan pipeline')} onClick={()=>void run()}>Jalankan</button>
      <details className="pipeline-more"><summary aria-label="Tindakan pipeline lainnya">•••</summary><div><button type="button" disabled={!ready || busy || !name.trim()} onClick={()=>void save(true)}>Simpan sebagai baru</button><button type="button" disabled={!ready || busy || !id} onClick={()=>void load(id)}>Muat ulang versi tersimpan</button></div></details></div>
    </div> : <>
      <div className="pipeline-catalog-toolbar"><label className="pipeline-search"><span aria-hidden="true">⌕</span><input aria-label="Cari pipeline" placeholder="Cari pipeline…" value={query} onChange={event=>setQuery(event.target.value)} /></label><div>{opened && <button type="button" disabled={busy} onClick={()=>onEditingChange(true)}>{dirty ? 'Lanjutkan rancangan':'Kembali ke editor'}</button>}<button type="button" disabled={busy || loading} onClick={refresh}>Perbarui</button><button type="button" className="pipeline-run" disabled={busy} onClick={create}>＋ Pipeline baru</button></div></div>
      <div className="pipeline-table-wrap"><table className="pipeline-table"><thead><tr><th scope="col">Nama pipeline</th><th scope="col">Versi</th><th scope="col">Terakhir diperbarui</th><th scope="col"><span className="connections-sr-only">Tindakan</span></th></tr></thead><tbody>
        {loading ? <tr><td colSpan={4}><div className="studio-loading" role="status" aria-live="polite"><span className="studio-loading-spinner" aria-hidden="true" /><strong>Memuat pipeline…</strong><span>Mengambil daftar pipeline tersimpan.</span></div></td></tr>:filtered.map(item=><tr key={item.pipeline_id}><td><button className="pipeline-table-name" disabled={busy} onClick={()=>void load(item.pipeline_id)}>{item.pipeline_name}</button></td><td><span className="pipeline-version-tag">v{item.version}</span></td><td className="pipeline-table-date">{updated(item.updated_at)}</td><td className="pipeline-table-actions"><button type="button" disabled={busy} onClick={()=>void load(item.pipeline_id)} aria-label={`Buka ${item.pipeline_name}`}>Buka ↗</button></td></tr>)}
        {!loading && !filtered.length && !error && !metadataError && <tr><td colSpan={4} className="pipeline-table-empty">{query ? 'Pipeline tidak ditemukan.':'Belum ada pipeline tersimpan.'}</td></tr>}
      </tbody></table></div>
    </>}
    {metadataError && <div className="pipeline-feedback is-error" role="alert">{metadataError}<button type="button" disabled={busy || loading} onClick={refresh}>Coba lagi</button></div>}
    {error && <div className="pipeline-feedback is-error" role="alert">{error}<button type="button" disabled={busy || loading} onClick={() => { if (initialPipelineId && !opened) void load(initialPipelineId); else refresh(); }}>Coba lagi</button></div>}
    {message && <p className="pipeline-feedback" role="status">{message}</p>}
    {editing && reason && <p className="pipeline-readiness">{reason}</p>}
  </section>;
}
