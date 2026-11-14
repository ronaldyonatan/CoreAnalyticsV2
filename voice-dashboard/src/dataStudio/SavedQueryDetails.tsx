import { useEffect, useState } from 'react';
import './saved-query-details.css';

type QueryDefinition = { query: string; dialect: string };

function queryErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'HTTP_404') return 'Endpoint SQL belum tersedia. Restart backend dengan launcher Query DEV, lalu coba lagi.';
  if (code === 'HTTP_401' || code === 'AUTH_REQUIRED') return 'Sesi Anda berakhir. Silakan masuk kembali.';
  if (code === 'HTTP_403' || code === 'OBJECT_ACCESS_DENIED' || code === 'OWNER_REQUIRED' || code === 'OBJECT_ACCESS_OPERATION_DENIED') return 'Anda memerlukan akses edit atau jalankan untuk melihat SQL dataset ini.';
  if (code === 'DATASET_QUERY_UNAVAILABLE') return 'Definisi SQL belum dapat dimuat. Periksa ketersediaan metadata dan gateway BEAM.';
  return 'SQL belum dapat dimuat. Periksa koneksi backend dan coba lagi.';
}

export default function SavedQueryDetails({ datasetId, load, onRefresh, initiallyOpen = false }: {
  datasetId: string;
  load: (datasetId: string, signal: AbortSignal) => Promise<QueryDefinition>;
  onRefresh?: (datasetId: string) => Promise<string | undefined>;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [sql, setSql] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSql('');
    load(datasetId, controller.signal).then(result => {
      if (!controller.signal.aborted) setSql(result.query);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(queryErrorMessage(reason));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [datasetId, open, load]);

  async function refreshDataset() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    setRefreshMessage('');
    try {
      const runId = await onRefresh(datasetId);
      setRefreshMessage(runId ? `Job masuk antrean. ID: ${runId}` : 'Job masuk antrean.');
    } catch {
      setRefreshMessage('Job belum dapat dimasukkan ke antrean.');
    } finally {
      setRefreshing(false);
    }
  }

  return <section className="saved-query-details" aria-label="SQL sumber dataset">
    <div className="saved-query-heading"><strong>SQL Query</strong>
      {!initiallyOpen && <button type="button" className="saved-query-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Tutup SQL' : 'Lihat SQL'}</button>}</div>
    {open && <div className="saved-query-body" aria-live="polite">
      {loading && <p>Memuat SQL…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && sql && <pre tabIndex={0}><code>{sql}</code></pre>}
    </div>}
    {onRefresh && <button type="button" className="saved-query-refresh" disabled={refreshing} onClick={() => void refreshDataset()}>↻ Jalankan ulang dataset</button>}
    {refreshMessage && <p className="saved-query-note" role="status">{refreshMessage}</p>}
  </section>;
}
