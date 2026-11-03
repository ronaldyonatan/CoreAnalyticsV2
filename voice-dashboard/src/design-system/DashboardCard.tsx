import React from 'react';

interface DashboardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function DashboardCard({
  children,
  className = '',
  ...props
}: DashboardCardProps) {
  return (
    <div className={`ds-dashboard-card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
