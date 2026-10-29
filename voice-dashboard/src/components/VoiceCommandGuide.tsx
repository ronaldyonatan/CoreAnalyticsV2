import React, { useMemo, useState } from 'react';
import './VoiceCommandGuide.css';
import { VOICE_COMMAND_GUIDE, normalizeVoiceTranscript, type VoiceCommandDefinition } from '../voiceCommand/voiceCommandRegistry';

interface VoiceCommandGuideProps {
  open: boolean;
  authorizedRoutes: string[];
  activeRoute?: string;
  onClose: () => void;
}

export default function VoiceCommandGuide({
  open,
  authorizedRoutes,
  activeRoute,
  onClose,
}: VoiceCommandGuideProps) {
  const [query, setQuery] = useState('');
  const routeSet = useMemo(() => new Set(authorizedRoutes), [authorizedRoutes]);

  const visibleCommands = useMemo(() => {
    const normalizedQuery = normalizeVoiceTranscript(query);
    return VOICE_COMMAND_GUIDE.filter((command) => {
      if (command.showInGuide === false) return false;
      if (command.routeKey && !routeSet.has(command.routeKey)) return false;
      if (!normalizedQuery) return true;

      const haystack = normalizeVoiceTranscript([
        command.label,
        command.description,
        ...command.examples,
        ...command.aliases,
      ].join(' '));
      return haystack.includes(normalizedQuery);
    });
  }, [query, routeSet]);

  const sections = useMemo(() => {
    const grouped = new Map<string, VoiceCommandDefinition[]>();
    visibleCommands.forEach((command) => {
      const current = grouped.get(command.section) ?? [];
      current.push(command);
      grouped.set(command.section, current);
    });
    return Array.from(grouped.entries());
  }, [visibleCommands]);

  if (!open) return null;

  return (
    <div className="voice-guide-root" role="dialog" aria-modal="true" aria-label="Voice Command Guide">
      <button className="voice-guide-backdrop" type="button" onClick={onClose} aria-label="Close Voice Command Guide" />

      <section className="voice-guide-panel">
        <div className="voice-guide-header">
          <div>
            <div className="voice-guide-eyebrow">COREANALYTICS · VOICE COMMAND CENTER</div>
            <h2>Voice Commands</h2>
            <p>Gunakan kalimat yang spesifik agar satu ucapan hanya menjalankan satu action.</p>
          </div>
          <button type="button" className="voice-guide-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="voice-guide-status-row">
          <span className="voice-guide-status-dot" />
          <span>ACTIVE CONTEXT</span>
          <strong>{String(activeRoute || 'GLOBAL').replace(/_/g, ' ').toUpperCase()}</strong>
        </div>

        <label className="voice-guide-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari command, contoh: Doctor Fee"
            autoComplete="off"
          />
        </label>

        <div className="voice-guide-content">
          {sections.length === 0 ? (
            <div className="voice-guide-empty">Tidak ada command yang cocok.</div>
          ) : sections.map(([section, commands]) => (
            <div key={section} className="voice-guide-section">
              <div className="voice-guide-section-title">{section}</div>
              <div className="voice-guide-command-grid">
                {commands.map((command) => (
                  <article key={command.id} className="voice-guide-command">
                    <div className="voice-guide-command-copy">
                      <h3>{command.label}</h3>
                      <p>{command.description}</p>
                    </div>
                    <div className="voice-guide-example">
                      <span>UCAPKAN</span>
                      <strong>“{command.examples[0]}”</strong>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="voice-guide-footer">
          <span>Tip: “Quarterly Revenue”, “Revenue Summary”, dan “Daily Revenue” adalah command yang berbeda.</span>
          <button type="button" onClick={onClose}>TUTUP</button>
        </div>
      </section>
    </div>
  );
}
