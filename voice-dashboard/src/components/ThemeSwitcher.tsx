import React, { useState } from 'react';
import { CORE_THEMES } from '../theme/themes';
import type { CoreThemeId } from '../theme/themes';
import { useTheme } from '../theme/ThemeContext';

interface ThemeSwitcherProps {
  compact?: boolean;
  align?: 'left' | 'right';
}

const IMMERSIVE_THEMES: CoreThemeId[] = [
  'cosmic-black',
  'aurora',
  'solaris',
];

const STATIC_THEMES: CoreThemeId[] = [
  'obsidian',
  'quartz',
];

export default function ThemeSwitcher({
  compact = false,
  align = 'left',
}: ThemeSwitcherProps) {
  const { themeId, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const activeTheme = CORE_THEMES[themeId];

  const selectTheme = (id: CoreThemeId) => {
    setTheme(id);
    setOpen(false);
  };

  const renderCompactThemeRow = (id: CoreThemeId) => {
    const item = CORE_THEMES[id];
    const active = item.id === themeId;

    return (
      <button
        type="button"
        key={item.id}
        onClick={() => selectTheme(item.id)}
        className="core-theme-menu-row flex w-full items-start gap-2 px-3 py-2.5 text-left"
        style={{
          background: active
            ? 'color-mix(in srgb, var(--core-primary) 12%, transparent)'
            : 'transparent',
          color: active
            ? 'var(--core-primary-strong)'
            : 'var(--core-text)',
        }}
      >
        <span className="mt-0.5 text-sm">{item.icon}</span>

        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase tracking-[0.08em]">
            {item.name}
          </span>
          <span
            className="mt-0.5 block text-[9px] leading-relaxed"
            style={{ color: 'var(--core-text-secondary)' }}
          >
            {item.description}
          </span>
        </span>

        <span
          className="mt-1 h-2.5 w-2.5 rounded-full border"
          style={{
            borderColor: active
              ? 'var(--core-primary)'
              : 'var(--core-border)',
            background: active ? 'var(--core-primary)' : 'transparent',
            boxShadow: active ? '0 0 9px var(--core-glow)' : 'none',
          }}
        />
      </button>
    );
  };

  const renderInlineOption = (id: CoreThemeId) => {
    const item = CORE_THEMES[id];
    const active = item.id === themeId;
    const isStatic = item.performance === 'static';

    return (
      <button
        key={id}
        type="button"
        onClick={() => setTheme(id)}
        title={item.description}
        aria-label={`Use ${item.name} theme`}
        aria-pressed={active}
        className={`core-theme-option core-theme-option--${id} flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left ${
          active ? 'core-theme-option-active' : ''
        }`}
        style={{
          borderColor: active ? 'var(--core-border-strong)' : 'var(--core-border)',
          background: active
            ? 'color-mix(in srgb, var(--core-primary) 13%, var(--core-panel))'
            : 'var(--core-control)',
          boxShadow: active ? '0 0 14px var(--core-glow)' : 'none',
        }}
      >
        <span className="core-theme-option-icon flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-[14px]"
          style={{ borderColor: 'var(--core-border)', background: 'var(--core-panel)' }}
        >
          {item.icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="core-theme-option-name block text-[10px] font-black uppercase tracking-[0.08em]"
            style={{ color: active ? 'var(--core-primary-strong)' : 'var(--core-text)' }}
          >
            {item.name}
          </span>
          <span className="mt-0.5 block text-[7px] font-bold uppercase tracking-[0.10em]"
            style={{ color: 'var(--core-text-muted)' }}
          >
            {isStatic ? 'Static · Zero Motion' : 'Immersive'}
          </span>
        </span>

        <span
          className="flex h-5 min-w-[38px] items-center justify-center rounded-md border px-1.5 text-[6px] font-black uppercase tracking-[0.08em]"
          style={{
            borderColor: active ? 'var(--core-primary)' : 'var(--core-border)',
            color: active ? 'var(--core-primary-strong)' : 'var(--core-text-muted)',
            background: active
              ? 'color-mix(in srgb, var(--core-primary) 12%, transparent)'
              : 'transparent',
          }}
        >
          {active ? 'Active' : 'Select'}
        </span>
      </button>
    );
  };

  if (!compact) {
    const isStatic = activeTheme.performance === 'static';

    return (
      <div className="core-theme-switcher w-full">
        <div className="relative">
          <select
            value={themeId}
            onChange={(event) => selectTheme(event.target.value as CoreThemeId)}
            aria-label="Select application theme"
            className="core-control h-11 w-full appearance-none rounded-lg border px-3 pr-10 text-[12px] font-black uppercase tracking-[0.08em] outline-none"
            style={{
              borderColor: 'var(--core-border)',
              background: 'var(--core-control)',
              color: 'var(--core-text)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.025)',
            }}
          >
            <optgroup label="Immersive">
              {IMMERSIVE_THEMES.map((id) => (
                <option key={id} value={id}>
                  {CORE_THEMES[id].name}
                </option>
              ))}
            </optgroup>

            <optgroup label="Static Performance">
              {STATIC_THEMES.map((id) => (
                <option key={id} value={id}>
                  {CORE_THEMES[id].name}
                </option>
              ))}
            </optgroup>
          </select>

          <div
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--core-primary-strong)' }}
            aria-hidden="true"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        <div
          className="mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          style={{
            borderColor: 'var(--core-border)',
            background: 'var(--core-panel)',
          }}
        >
          <div className="min-w-0">
            <div
              className="truncate text-[10px] font-black uppercase tracking-[0.10em]"
              style={{ color: 'var(--core-primary-strong)' }}
            >
              {activeTheme.name}
            </div>

            <div
              className="mt-0.5 text-[8px] leading-relaxed"
              style={{ color: 'var(--core-text-secondary)' }}
            >
              {activeTheme.description}
            </div>
          </div>

          <span
            className="shrink-0 rounded-md border px-2 py-1 text-[7px] font-black uppercase tracking-[0.08em]"
            style={{
              borderColor: 'var(--core-border)',
              color: isStatic
                ? 'var(--core-primary-strong)'
                : 'var(--core-text-secondary)',
              background: 'var(--core-control)',
            }}
          >
            {isStatic ? 'Zero Motion' : 'Immersive'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={`Theme: ${activeTheme.name}`}
        className="core-control flex w-full items-center justify-center gap-2 rounded-md border p-1.5 text-xs font-bold"
        aria-expanded={open}
      >
        <span className="text-sm">{activeTheme.icon}</span>
      </button>

      {open && (
        <div
          className={`absolute top-full z-[999] mt-2 w-[260px] overflow-hidden rounded-lg border ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{
            background: 'var(--core-surface-strong)',
            borderColor: 'var(--core-border)',
            boxShadow: '0 18px 42px rgba(0, 0, 0, .28), 0 0 20px var(--core-glow)',
          }}
        >
          <div
            className="border-b px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em]"
            style={{
              borderColor: 'var(--core-border)',
              color: 'var(--core-text-secondary)',
            }}
          >
            Appearance
          </div>

          <div
            className="px-3 pb-1.5 pt-2 text-[7px] font-black uppercase tracking-[0.18em]"
            style={{ color: 'var(--core-text-muted)' }}
          >
            Immersive
          </div>
          {IMMERSIVE_THEMES.map(renderCompactThemeRow)}

          <div
            className="mt-1 border-t px-3 pb-1.5 pt-2 text-[7px] font-black uppercase tracking-[0.18em]"
            style={{
              borderColor: 'var(--core-border)',
              color: 'var(--core-text-muted)',
            }}
          >
            Static Performance · Zero Motion
          </div>
          {STATIC_THEMES.map(renderCompactThemeRow)}
        </div>
      )}
    </div>
  );
}
