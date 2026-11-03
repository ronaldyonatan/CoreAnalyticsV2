import React from 'react';

export type DashboardControlSize = 'sm' | 'md' | 'lg';

interface DashboardExpandButtonProps {
  onClick: () => void;
  label?: string;
  size?: DashboardControlSize;
  className?: string;
}

export default function DashboardExpandButton({
  onClick,
  label = 'Expand chart',
  size = 'sm',
  className = '',
}: DashboardExpandButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`ds-dashboard-control ds-dashboard-expand ds-dashboard-control--${size} ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      <svg
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
        />
      </svg>
    </button>
  );
}
