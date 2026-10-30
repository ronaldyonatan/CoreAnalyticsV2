import { useEffect, useMemo, useState } from 'react';
import {
  VOICE_COMMAND_GUIDE,
  type VoiceCommandDefinition,
  type VoiceCommandScope,
} from '../voiceCommand/voiceCommandRegistry';

interface VoiceCommandGuideProps {
  open: boolean;
  authorizedRoutes: string[];
  activeRoute?: string;
  onClose: () => void;
}

const SCOPE_META: Record<VoiceCommandScope, { label: string; short: string }> = {
  general: { label: 'Global', short: 'ANY PAGE' },
  company_performance: { label: 'Company Performance', short: 'COMPANY ONLY' },
  daily_tracking: { label: 'Daily Tracking', short: 'DAILY ONLY' },
};

const HEALTHCARE_TERMS = ['Healthcare', 'Cabang', 'Unit Bisnis', 'Site', 'Node'];

const HEALTHCARE_CHOOSE_EXAMPLES = [
  'Pilih cabang Kedoya',
  'Tampilkan site Menteng',
  'Filter cabang Cibubur',
  'Munculkan unit bisnis Surabaya',
];

const HEALTHCARE_RESET_EXAMPLES = [
  'Tampilkan semua cabang',
  'Munculkan semua unit bisnis',
  'Semua site',
  'Reset healthcare',
];


function commandSearchText(command: VoiceCommandDefinition) {
  return [
    command.label,
    command.description,
    command.section,
    ...command.aliases,
    ...command.examples,
  ]
    .join(' ')
    .toLowerCase();
}

function scopeRank(scope: VoiceCommandScope, activeRoute?: string) {
  if (scope === 'general') return 0;
  if (scope === activeRoute) return 1;
  return 2;
}

export default function VoiceCommandGuide({
  open,
  authorizedRoutes,
  activeRoute,
  onClose,
}: VoiceCommandGuideProps) {
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | VoiceCommandScope>('all');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setScopeFilter('all');
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const authorizedSet = useMemo(
    () => new Set(authorizedRoutes),
    [authorizedRoutes]
  );

  const visibleCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return VOICE_COMMAND_GUIDE
      .filter((command) => command.showInGuide !== false)
      .filter((command) => !command.routeKey || authorizedSet.has(command.routeKey))
      .filter((command) => scopeFilter === 'all' || command.scope === scopeFilter)
      .filter((command) => !normalizedQuery || commandSearchText(command).includes(normalizedQuery))
      .sort((a, b) => {
        const byScope = scopeRank(a.scope, activeRoute) - scopeRank(b.scope, activeRoute);
        if (byScope !== 0) return byScope;
        const bySection = a.section.localeCompare(b.section);
        if (bySection !== 0) return bySection;
        return a.label.localeCompare(b.label);
      });
  }, [activeRoute, authorizedSet, query, scopeFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, VoiceCommandDefinition[]>();
    visibleCommands.forEach((command) => {
      const key = `${command.scope}::${command.section}`;
      const current = groups.get(key) ?? [];
      current.push(command);
      groups.set(key, current);
    });
    return Array.from(groups.entries()).map(([key, commands]) => ({
      key,
      scope: commands[0].scope,
      section: commands[0].section,
      commands,
    }));
  }, [visibleCommands]);

  if (!open) return null;

  const companyAuthorized = authorizedSet.has('company_performance');
  const dailyAuthorized = authorizedSet.has('daily_tracking');

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        aria-label="Close Voice Command Guide"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(0, 5, 14, .78)' }}
      />

      <section
        className="relative z-10 flex max-h-[94vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border font-mono"
        style={{
          borderColor: 'var(--core-border-strong)',
          background: 'color-mix(in srgb, var(--core-surface-strong) 84%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: 'var(--core-text)',
          boxShadow: '0 28px 90px rgba(0,0,0,.48), 0 0 32px var(--core-glow)',
        }}
      >
        <header
          className="relative flex-shrink-0 border-b px-14 py-4 sm:px-16 sm:py-5"
          style={{ borderColor: 'var(--core-border)' }}
        >
          <div className="mx-auto max-w-[820px] text-center">
            <div
              className="text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ color: 'var(--core-primary)' }}
            >
              Voice Command Center
            </div>

            <h2
              className="mt-1 text-[20px] font-black uppercase tracking-[0.055em] sm:text-[22px]"
              style={{ color: 'var(--core-text)' }}
            >
              Command Guide
            </h2>

            <p
              className="mx-auto mt-2 max-w-[760px] text-[11px] leading-relaxed sm:text-[12px]"
              style={{ color: 'var(--core-text-secondary)' }}
            >
              Global commands work anywhere. Dashboard commands only execute on
              their own page, so Company Performance commands never cross into
              Daily Tracking.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-black sm:right-4 sm:top-4"
            style={{
              borderColor: 'var(--core-border)',
              background: 'var(--core-control)',
              color: 'var(--core-text-secondary)',
            }}
            title="Close guide"
          >
            ×
          </button>
        </header>

        <div className="flex flex-shrink-0 flex-col gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--core-border)' }}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_250px]">
            <div className="relative min-w-0 flex-1">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search command, alias, example, or function..."
                className="h-11 w-full rounded-lg border px-3 text-[12px] outline-none"
                style={{
                  borderColor: 'var(--core-border)',
                  background: 'var(--core-control)',
                  color: 'var(--core-text)',
                }}
              />
            </div>

            <select
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value as 'all' | VoiceCommandScope)}
              className="h-11 w-full rounded-lg border px-3 text-[11px] font-black uppercase outline-none"
              style={{
                borderColor: 'var(--core-border)',
                background: 'var(--core-control)',
                color: 'var(--core-text)',
              }}
            >
              <option value="all">All available commands</option>
              <option value="general">Global</option>
              {companyAuthorized && <option value="company_performance">Company Performance</option>}
              {dailyAuthorized && <option value="daily_tracking">Daily Tracking</option>}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.09em]">
            <span
              className="rounded-md border px-2 py-1"
              style={{ borderColor: 'var(--core-border)', background: 'var(--core-control)', color: 'var(--core-text-secondary)' }}
            >
              Active: {activeRoute?.replaceAll('_', ' ') || '—'}
            </span>
            <span
              className="rounded-md border px-2 py-1"
              style={{ borderColor: 'var(--core-border)', background: 'var(--core-control)', color: 'var(--core-primary-strong)' }}
            >
              {visibleCommands.length} commands
            </span>
          </div>

          {(companyAuthorized || dailyAuthorized) && (
            <div
              className="rounded-xl border p-2.5 sm:p-3"
              style={{
                borderColor: 'var(--core-border-strong)',
                background: 'color-mix(in srgb, var(--core-primary) 5%, var(--core-panel))',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div
                    className="text-[10px] font-black uppercase tracking-[0.14em]"
                    style={{ color: 'var(--core-primary-strong)' }}
                  >
                    Healthcare / Branch Voice Shortcuts
                  </div>
                  <div
                    className="mt-1 text-[9px] leading-relaxed sm:text-[10px]"
                    style={{ color: 'var(--core-text-secondary)' }}
                  >
                    Semua istilah berikut dianggap setara saat memilih unit layanan. Sebutkan aksi + istilah + nama cabang/site.
                  </div>
                </div>
                <span
                  className="rounded-md border px-2 py-1 text-[7px] font-black uppercase tracking-[0.09em]"
                  style={{
                    borderColor: 'var(--core-border)',
                    background: 'var(--core-control)',
                    color: 'var(--core-text-muted)',
                  }}
                >
                  Company + Daily
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {HEALTHCARE_TERMS.map((term) => (
                  <span
                    key={term}
                    className="rounded-md border px-2 py-1 text-[8px] font-black uppercase"
                    style={{
                      borderColor: 'var(--core-border)',
                      background: 'var(--core-control)',
                      color: 'var(--core-primary-strong)',
                    }}
                  >
                    {term}
                  </span>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <div
                    className="mb-1.5 text-[7px] font-black uppercase tracking-[0.12em]"
                    style={{ color: 'var(--core-text-muted)' }}
                  >
                    Pilih / Filter Unit
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {HEALTHCARE_CHOOSE_EXAMPLES.map((example) => (
                      <span
                        key={example}
                        className="rounded-md border px-1.5 py-1 text-[8px] font-bold sm:text-[9px]"
                        style={{
                          borderColor: 'var(--core-border-strong)',
                          background: 'var(--core-control)',
                          color: 'var(--core-primary-strong)',
                        }}
                      >
                        “{example}”
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div
                    className="mb-1.5 text-[7px] font-black uppercase tracking-[0.12em]"
                    style={{ color: 'var(--core-text-muted)' }}
                  >
                    Kembali ke Semua Unit
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {HEALTHCARE_RESET_EXAMPLES.map((example) => (
                      <span
                        key={example}
                        className="rounded-md border px-1.5 py-1 text-[8px] font-bold sm:text-[9px]"
                        style={{
                          borderColor: 'var(--core-border)',
                          background: 'var(--core-control)',
                          color: 'var(--core-text-secondary)',
                        }}
                      >
                        “{example}”
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="mt-3 rounded-lg border px-3 py-2 text-[8px] leading-relaxed sm:text-[9px]"
                style={{
                  borderColor: 'var(--core-border)',
                  background: 'color-mix(in srgb, var(--core-control) 76%, transparent)',
                  color: 'var(--core-text-muted)',
                }}
              >
                Kata kerja yang umum: pilih, tampilkan, munculkan, filter, buka, ganti, ubah, gunakan. Untuk menghapus filter gunakan semua / tampilkan semua / munculkan semua / reset.
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {grouped.length === 0 ? (
            <div
              className="rounded-xl border px-4 py-10 text-center text-[11px]"
              style={{ borderColor: 'var(--core-border)', color: 'var(--core-text-muted)' }}
            >
              No commands match this search.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map((group) => {
                const meta = SCOPE_META[group.scope];
                const active = group.scope !== 'general' && group.scope === activeRoute;

                return (
                  <section
                    key={group.key}
                    className="rounded-xl border p-2.5 sm:p-3"
                    style={{
                      borderColor: 'var(--core-border)',
                      background: 'color-mix(in srgb, var(--core-panel) 54%, transparent)',
                    }}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--core-primary-strong)' }}>
                        {group.section}
                      </h3>
                      <span
                        className="rounded border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.09em]"
                        style={{
                          borderColor: active ? 'var(--core-primary)' : 'var(--core-border)',
                          background: active ? 'color-mix(in srgb, var(--core-primary) 10%, transparent)' : 'var(--core-control)',
                          color: active ? 'var(--core-primary-strong)' : 'var(--core-text-muted)',
                        }}
                      >
                        {meta.short}{active ? ' · ACTIVE PAGE' : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {group.commands.map((command) => (
                        <article
                          key={command.id}
                          className="self-start rounded-lg border p-2.5 sm:p-3"
                          style={{ borderColor: 'var(--core-border)', background: 'var(--core-panel)' }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] font-black sm:text-[12px]" style={{ color: 'var(--core-text)' }}>
                                {command.label}
                              </div>
                              <div className="mt-1 text-[9px] leading-snug sm:text-[10px]" style={{ color: 'var(--core-text-secondary)' }}>
                                {command.description}
                              </div>
                            </div>
                            <span
                              className="flex-shrink-0 rounded-md border px-1.5 py-1 text-[7px] font-black uppercase"
                              style={{ borderColor: 'var(--core-border)', color: 'var(--core-text-muted)' }}
                            >
                              {meta.label}
                            </span>
                          </div>

                          {command.examples.length > 0 && (
                            <div className="mt-1.5">
                              <div className="mb-1 text-[7px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--core-text-muted)' }}>
                                Say
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {command.examples.map((example) => (
                                  <span
                                    key={example}
                                    className="rounded-md border px-1.5 py-1 text-[8px] font-bold sm:text-[9px]"
                                    style={{ borderColor: 'var(--core-border-strong)', background: 'var(--core-control)', color: 'var(--core-primary-strong)' }}
                                  >
                                    “{example}”
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {command.aliases.length > 0 && (
                            <details className="mt-1.5" open={command.section === 'Healthcare'}>
                              <summary className="cursor-pointer text-[8px] font-black uppercase tracking-[0.10em]" style={{ color: 'var(--core-text-muted)' }}>
                                Accepted aliases ({command.aliases.length})
                              </summary>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {command.aliases.map((alias) => (
                                  <span
                                    key={alias}
                                    className="rounded border px-1.5 py-0.5 text-[8px]"
                                    style={{ borderColor: 'var(--core-border)', color: 'var(--core-text-secondary)' }}
                                  >
                                    {alias}
                                  </span>
                                ))}
                              </div>
                            </details>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <footer
          className="flex flex-shrink-0 items-center justify-between gap-3 border-t px-4 py-3 text-[9px] sm:px-6"
          style={{ borderColor: 'var(--core-border)', color: 'var(--core-text-muted)' }}
        >
          <span>Tip: untuk cabang/unit bisnis/site, sebutkan aksi + istilah + nama unit. Contoh: “Pilih cabang Kedoya”.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-[0.10em]"
            style={{ borderColor: 'var(--core-border-strong)', background: 'var(--core-control)', color: 'var(--core-primary-strong)' }}
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
