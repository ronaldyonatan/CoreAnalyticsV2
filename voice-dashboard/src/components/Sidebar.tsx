import React from 'react';
import type { MenuItem } from './types';
import { useTheme } from '../theme/ThemeContext';

interface SidebarProps {
  menuList: MenuItem[];
  activeMenuId: string;
  onSelectMenu: (id: string) => void;
}

export default function Sidebar({
  menuList,
  activeMenuId,
  onSelectMenu,
}: SidebarProps) {
  const { isLight } = useTheme();

  return (
    <aside
      className="relative flex h-full w-64 flex-col overflow-hidden border-r p-3 font-mono"
      style={{
        background: 'var(--core-sidebar)',
        borderColor: 'var(--core-border)',
        color: 'var(--core-text)',
        boxShadow: isLight
          ? '10px 0 30px rgba(37,99,120,.08)'
          : '10px 0 34px rgba(0,183,255,.08)',
      }}
    >
      {/* Soft cosmic / HUD atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isLight
            ? 'radial-gradient(circle at 18% 8%, rgba(14,165,233,.11), transparent 34%), radial-gradient(circle at 90% 82%, rgba(99,102,241,.06), transparent 32%)'
            : 'radial-gradient(circle at 18% 8%, rgba(0,242,254,.08), transparent 34%), radial-gradient(circle at 90% 82%, rgba(99,102,241,.07), transparent 32%)',
        }}
      />

      {/* HUD edge */}
      <div
        className="pointer-events-none absolute inset-y-3 right-0 w-px"
        style={{
          background:
            'linear-gradient(to bottom, transparent, var(--core-primary), transparent)',
          opacity: isLight ? 0.35 : 0.6,
        }}
      />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* Brand / section header */}
        <div
          className="mb-4 rounded-xl border px-3 py-3 backdrop-blur-md"
          style={{
            background: 'var(--core-panel)',
            borderColor: 'var(--core-border)',
            boxShadow: isLight
              ? 'inset 0 1px 0 rgba(255,255,255,.42), 0 8px 20px rgba(37,99,120,.06)'
              : 'inset 0 1px 0 rgba(255,255,255,.03), 0 0 18px rgba(0,242,254,.06)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: 'var(--core-primary)',
                boxShadow: '0 0 10px var(--core-glow)',
              }}
            />
            <h1
              className="text-[13px] font-black uppercase tracking-[0.16em]"
              style={{ color: 'var(--core-text)' }}
            >
              Core Analytics
            </h1>
          </div>

          <p
            className="mt-1 pl-4 text-[8px] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--core-text-muted)' }}
          >
            Voice Dashboard
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {menuList.map((menu) => {
            const isActive = activeMenuId === menu.id;

            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => onSelectMenu(menu.id)}
                className="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200"
                style={{
                  background: isActive
                    ? isLight
                      ? 'linear-gradient(90deg, rgba(14,165,233,.16), rgba(8,127,157,.10))'
                      : 'linear-gradient(90deg, rgba(0,242,254,.14), rgba(37,99,235,.08))'
                    : 'transparent',
                  borderColor: isActive
                    ? 'var(--core-border-strong)'
                    : 'transparent',
                  color: isActive
                    ? 'var(--core-text)'
                    : 'var(--core-text-secondary)',
                  boxShadow: isActive
                    ? isLight
                      ? 'inset 0 1px 0 rgba(255,255,255,.45), 0 6px 18px rgba(37,99,120,.08)'
                      : '0 0 14px var(--core-glow)'
                    : 'none',
                }}
              >
                {/* Active energy rail */}
                <span
                  className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-r-full transition-opacity"
                  style={{
                    background: 'var(--core-primary)',
                    boxShadow: '0 0 8px var(--core-glow)',
                    opacity: isActive ? 1 : 0,
                  }}
                />

                {/* Icon capsule */}
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-sm transition-all"
                  style={{
                    background: isActive
                      ? 'color-mix(in srgb, var(--core-primary) 14%, transparent)'
                      : 'var(--core-control)',
                    borderColor: isActive
                      ? 'var(--core-border-strong)'
                      : 'var(--core-border)',
                    color: isActive
                      ? 'var(--core-primary-strong)'
                      : 'var(--core-primary-soft)',
                    boxShadow: isActive
                      ? '0 0 12px var(--core-glow)'
                      : 'none',
                  }}
                >
                  {menu.icon || '📊'}
                </span>

                <span
                  className="min-w-0 flex-1 truncate text-[11px] font-bold tracking-[0.04em]"
                  style={{
                    color: isActive
                      ? 'var(--core-text)'
                      : 'var(--core-text-secondary)',
                  }}
                >
                  {menu.title}
                </span>

                {/* Active marker */}
                {isActive && (
                  <span
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{
                      background: 'var(--core-primary)',
                      boxShadow: '0 0 8px var(--core-glow)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer status */}
        <div
          className="mt-3 flex items-center justify-between border-t px-2 pt-3"
          style={{ borderColor: 'var(--core-border)' }}
        >
          <span
            className="text-[7px] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--core-text-muted)' }}
          >
            Navigation
          </span>

          <span
            className="flex items-center gap-1.5 text-[7px] font-black uppercase tracking-[0.14em]"
            style={{ color: 'var(--core-primary-strong)' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: 'var(--core-primary)',
                boxShadow: '0 0 7px var(--core-glow)',
              }}
            />
            Online
          </span>
        </div>
      </div>
    </aside>
  );
}
