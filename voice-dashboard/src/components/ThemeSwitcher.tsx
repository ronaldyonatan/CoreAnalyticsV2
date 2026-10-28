import React, { useState } from 'react';
import { CORE_THEMES } from '../theme/themes';
import type { CoreThemeId } from '../theme/themes';
import { useTheme } from '../theme/ThemeContext';

export default function ThemeSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { themeId, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const activeTheme = CORE_THEMES[themeId];

  const selectTheme = (id: CoreThemeId) => {
    setTheme(id);
    setOpen(false);
  };

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

        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-[9px] uppercase tracking-[0.14em]">
              {activeTheme.name}
            </span>

            <svg
              className={`h-3 w-3 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute top-full z-[999] mt-2 overflow-hidden rounded-lg border backdrop-blur-xl ${
            compact ? 'left-0 w-48' : 'left-0 right-0'
          }`}
          style={{
            background: 'var(--core-surface-strong)',
            borderColor: 'var(--core-border)',
            boxShadow: '0 18px 42px rgba(0, 0, 0, .28), 0 0 20px var(--core-glow)',
          }}
        >
          <div
            className="border-b px-3 py-2 text-[8px] font-black uppercase tracking-[0.18em]"
            style={{
              borderColor: 'var(--core-border)',
              color: 'var(--core-text-secondary)',
            }}
          >
            Appearance
          </div>

          {Object.values(CORE_THEMES).map((item) => {
            const active = item.id === themeId;

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => selectTheme(item.id)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors"
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
                  <span className="block text-[10px] font-black uppercase tracking-[0.10em]">
                    {item.name}
                  </span>

                  <span
                    className="mt-0.5 block text-[8px] leading-relaxed"
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
                    background: active
                      ? 'var(--core-primary)'
                      : 'transparent',
                    boxShadow: active
                      ? '0 0 9px var(--core-glow)'
                      : 'none',
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
