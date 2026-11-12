import { useEffect, useState } from 'react';
import type { CatalogDataset } from './datasetCatalog';
import './parquet-storage-delete.css';

type StorageKind = 'STORED' | 'ETL_OUTPUT';
type Allowed = {allowed: boolean; reason?: string; size_bytes?: number; active_jobs?: number; dependent_resources?: number};
const base = '/voice-api/api/studio/parquet/storage';
function csrf() { const found = document.cookie.split('; ').find(v=>v.startsWith('core_csrf=')); return found ? decodeURIComponent(found.slice(10)) : ''; }

// Destructive operations stay disabled unless the backend explicitly authorizes the exact target.
// The UI is not an authorization boundary: POST must revalidate ownership, references, job locks,
// storage path isolation, and mark metadata deleted before returning success.
export default function ParquetStorageDelete({dataset,onDeleted}:{dataset:CatalogDataset;onDeleted:()=>Promise<void>}) {
  const type:StorageKind | null = dataset.access_mode==='STORED' ? 'STORED' : dataset.access_mode==='PARQUET' ? 'ETL_OUTPUT' : null;
  const id=dataset.dataset_id;
  const runId=dataset.run_id || ''; 
  const [capability,setCapability]=useState<Allowed|null>(null);
  const [capabilityStatus,setCapabilityStatus]=useState('');
  const [open,setOpen]=useState(false);
  const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);setCapability(null);setCapabilityStatus('Memeriksa izin Delete…');setOpen(false);setConfirm('');setError('');
    if (!type || !id || !runId) return ()=>{clearTimeout(timeout);controller.abort();};
    void fetch(`${base}/capabilities?kind=${type}&id=${encodeURIComponent(id)}&run_id=${encodeURIComponent(runId)}`,
      {credentials:'include',cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error(`HTTP_${response.status}`);return response.json();})
      .then(payload=>{if(!controller.signal.aborted){setCapability(payload?.success===true?payload.data:null);setCapabilityStatus(payload?.success===true?'':'Endpoint Delete tidak mengembalikan capability valid');}})
      .catch(err=>{{setCapability(null);setCapabilityStatus(`API Delete tidak tersedia (${err instanceof Error?err.message:'NETWORK_ERROR'})`);}});
    return ()=>{clearTimeout(timeout);controller.abort();};
  },[type,id,runId]);
  if (!type) return null;
  async function erase(){
    if (confirm!=='DELETE'||busy||!type) return;
    setBusy(true);setError('');
    try {
      const response=await fetch(`${base}/delete`,{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
        body:JSON.stringify({kind:type,id,run_id:runId,confirmation:'DELETE'}),
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||result?.success!==true)throw Error(result?.code||'PARQUET_DELETE_FAILED');
      await onDeleted();setOpen(false);setConfirm('');
    }catch(e){setError(e instanceof Error?e.message:'PARQUET_DELETE_FAILED');}
    finally{setBusy(false);}
  }
  return <>
    <button type="button" className="datasets-action ca-storage-delete-trigger" disabled={busy || !capability?.allowed} title={!capability?.allowed ? (capability?.reason || 'Memeriksa izin penghapusan dan status backend…') : 'Hapus hanya file Parquet target ini, bukan tabel sumber'} onClick={()=>{setConfirm('');setError('');setOpen(true);}}>Hapus data Parquet</button>
    {!capability?.allowed && <small className="ca-storage-delete-reason" title={capability?.reason || ''}>{!runId ? 'Run ID belum tersedia' : capability ? `Delete belum tersedia: ${capability.reason || 'tidak diizinkan'}` : (capabilityStatus || 'Memeriksa Delete…')}</small>}
    {open && <div className="ca-storage-delete-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
      <div className="ca-storage-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="ca-storage-delete-title">
        <h3 id="ca-storage-delete-title">Hapus data Parquet?</h3>
        <p><strong>{dataset.dataset_name}</strong></p>
        <p>{type==='STORED' ? 'Snapshot dataset STORED akan dihapus dari storage. Definisi dataset dan sumber asli tetap ada.' : 'Hanya output Parquet versi ini yang akan dihapus. Definisi pipeline dan output versi lain tidak dihapus.'}</p>
        <p className="ca-storage-delete-warning">Tindakan ini tidak dapat dibatalkan. Dashboard dan preview yang memakai data ini mungkin tidak tersedia hingga data dibuat kembali.</p>
        {typeof capability?.size_bytes==='number' && <p>Perkiraan ruang dibebaskan: {((capability?.size_bytes ?? 0)/1048576).toLocaleString('id-ID',{maximumFractionDigits:1})} MB.</p>}
        <label htmlFor="ca-storage-confirm">Ketik <strong>DELETE</strong> untuk melanjutkan.</label>
        <input id="ca-storage-confirm" autoComplete="off" spellCheck={false} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="DELETE" disabled={busy}/>
        {error&&<p role="alert" className="ca-storage-delete-warning">Penghapusan gagal: {error}</p>}
        <div className="ca-storage-delete-actions">
          <button type="button" onClick={()=>{setOpen(false);setConfirm('');}} disabled={busy}>Batal</button>
          <button type="button" className="ca-storage-delete-danger" disabled={busy||confirm!=='DELETE'} onClick={()=>void erase()}>{busy?'Menghapus…':'Hapus permanen'}</button>
        </div>
      </div>
    </div>}
  </>;
}
