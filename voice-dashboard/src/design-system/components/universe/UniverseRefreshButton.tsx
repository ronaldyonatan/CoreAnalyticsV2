import type { ButtonHTMLAttributes } from 'react';

type UniverseRefreshButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'>;

/** Slim, theme-aware refresh action shared by Data Universe catalog headers.
 *  Tooltip appears after 2 seconds of hovering (see universe.css).
 */
export function UniverseRefreshButton({ className = '', ...props }: UniverseRefreshButtonProps) {
  return (
    <button
      {...props}
      type="button"
      className={`universe-refresh-icon ${className}`.trim()}
      aria-label="Muat ulang"
      data-tooltip="Muat ulang"
    >
      ↻
    </button>
  );
}
