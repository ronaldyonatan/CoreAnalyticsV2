import React from 'react';

interface DashboardPageHeaderProps {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  titleClassName?: string;
  children?: React.ReactNode;
}

export default function DashboardPageHeader({
  title,
  actions,
  className = '',
  titleClassName = '',
  children,
}: DashboardPageHeaderProps) {
  return (
    <header className={`ds-page-header ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className={`ds-page-header__title ${titleClassName}`.trim()}>
          {title}
        </h1>
        {children}
      </div>

      {actions ? (
        <div className="ds-page-header__actions">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
