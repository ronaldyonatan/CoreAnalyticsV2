import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { APP_RELEASE, RELEASE_HISTORY, RELEASE_HISTORY_NOTE, formatReleaseDate } from '../release/release-notes';

const VERSION_PAGE_SIZE = 10;
// Pin the running version, then show archives newest first (1.0.10 > 1.0.9).
const ORDERED_RELEASES = [
  APP_RELEASE,
  ...RELEASE_HISTORY.filter(item => item.version !== APP_RELEASE.version)
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true })),
];

export default function AppReleaseNotes() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const summaryId = useId();
  const pickerId = useId();
  const historyId = useId();
  const [selectedVersion, setSelectedVersion] = useState(APP_RELEASE.version);
  const release = RELEASE_HISTORY.find(item => item.version === selectedVersion) ?? APP_RELEASE;
  const current = release.version === APP_RELEASE.version;
  const [visibleCount, setVisibleCount] = useState(VERSION_PAGE_SIZE);
  const visibleReleases = ORDERED_RELEASES.slice(0, visibleCount);
  const hasMore = visibleReleases.length < ORDERED_RELEASES.length;
  const loadEarlier = () => setVisibleCount(count => Math.min(count + VERSION_PAGE_SIZE, ORDERED_RELEASES.length));
  const historyStatus = `Menampilkan ${visibleReleases.length} dari ${ORDERED_RELEASES.length} versi`;

  return <>
    <button
      type="button"
      className="ds-release-badge"
      aria-label={`Versi aplikasi ${APP_RELEASE.version}, lihat riwayat pembaruan`}
      title="Lihat catatan rilis"
      aria-haspopup="dialog"
      onClick={() => { setSelectedVersion(APP_RELEASE.version); setVisibleCount(VERSION_PAGE_SIZE); dialog.current?.showModal(); }}
    >
      {APP_RELEASE.version}
    </button>
    {createPortal(<dialog
      ref={dialog}
      className="ds-release-dialog"
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
      }}
    >
      <div className="ds-release-header">
        <div className="ds-release-heading">
          <span className="ds-release-mark" aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8" /><circle cx="12" cy="12" r="3.5" /></svg>
          </span>
          <div>
            <p className="ds-release-eyebrow">COREANALYTICS</p>
            <h2 id={titleId}>Catatan rilis</h2>
            <p id={summaryId} className="ds-release-intro">Temukan fitur baru, peningkatan, dan perbaikan di setiap versi.</p>
          </div>
        </div>
        <button type="button" className="ds-release-close" aria-label="Tutup catatan perubahan" onClick={() => dialog.current?.close()} autoFocus>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="ds-release-layout">
        <aside className="ds-release-sidebar" aria-label="Riwayat versi aplikasi">
          <p className="ds-release-nav-label">RIWAYAT VERSI</p>
          <nav id={historyId} className="ds-release-version-list" aria-label="Pilih versi">
            {visibleReleases.map(item => <button
              type="button"
              key={item.version}
              className={`ds-release-version-item ${release.version === item.version ? 'ds-release-version-item--selected' : ''}`}
              data-release-version={item.version}
              aria-label={`Versi ${item.version}`}
              aria-pressed={release.version === item.version}
              onClick={() => setSelectedVersion(item.version)}
            >
              <span className="ds-release-version-row"><strong>{item.version}</strong>{item.version === APP_RELEASE.version && <span className="ds-release-current-tag">Saat ini</span>}</span>
              <span className="ds-release-version-date">{formatReleaseDate(item.date)}</span>
            </button>)}
          </nav>
          {ORDERED_RELEASES.length > VERSION_PAGE_SIZE && <div className="ds-release-history-footer">
            <p className="ds-release-history-count" role="status">{historyStatus}</p>
            {hasMore && <button type="button" className="ds-release-load-more" aria-controls={historyId} onClick={loadEarlier}>Muat versi sebelumnya</button>}
          </div>}
          <p className="ds-release-archive-hint">Tanggal arsip mengikuti pencatatan Git, bukan waktu upload image.</p>
        </aside>
        <div className="ds-release-mobile-picker">
          <label htmlFor={pickerId}>Pilih versi</label>
          <select id={pickerId} aria-label="Pilih versi rilis" value={release.version} onChange={event => setSelectedVersion(event.target.value)}>
            {visibleReleases.map(item => <option key={item.version} value={item.version}>{item.version}{item.version === APP_RELEASE.version ? ' · Saat ini' : ' · Arsip'}</option>)}
          </select>
          {ORDERED_RELEASES.length > VERSION_PAGE_SIZE && <div className="ds-release-history-footer">
            <p className="ds-release-history-count" role="status">{historyStatus}</p>
            {hasMore && <button type="button" className="ds-release-load-more" aria-controls={pickerId} onClick={loadEarlier}>Muat versi sebelumnya</button>}
          </div>}
        </div>
        <article key={release.version} className="ds-release-content" data-release-active={release.version} tabIndex={0} aria-label={`Pembaruan versi ${release.version}`}>
          <div className="ds-release-meta">
            <span className={`ds-release-status ${current ? 'ds-release-status--current' : ''}`}>{current ? 'VERSI APLIKASI' : 'ARSIP GIT'}</span>
            <time dateTime={release.date}>{formatReleaseDate(release.date)}</time>
          </div>
          <p className="ds-release-version-number" aria-live="polite">Versi {release.version}</p>
          <h3 className="ds-release-title">{release.title}</h3>
          <p className="ds-release-summary">{release.summary}</p>
          {release.sections.map((section, index) => <section key={section.title} className="ds-release-section">
            <h3><span className="ds-release-section-marker" aria-hidden="true">{index === 0 ? '+' : index === 1 ? '↗' : '✓'}</span>{section.title}<span className="ds-release-count">{section.items.length}</span></h3>
            <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>
          </section>)}
          <details className="ds-release-evidence">
            <summary>Dasar catatan versi</summary>
            <p><strong>{release.evidence.label}</strong></p>
            <p>{release.evidence.description}</p>
            <div className="ds-release-references">{release.evidence.references.map(reference => <code key={reference}>{reference}</code>)}</div>
            <p>{RELEASE_HISTORY_NOTE}</p>
          </details>
        </article>
      </div>
    </dialog>, document.body)}
  </>;
}
