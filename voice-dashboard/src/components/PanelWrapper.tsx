import React from 'react';

interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function PanelWrapper({ title, children, className = "" }: Props) {
  return (
    <div className={`bg-[#000814]/40 backdrop-blur-md border border-[#00f2fe]/40 rounded-[35px] p-3 flex flex-col justify-between relative overflow-hidden min-h-0 h-full shadow-[inset_0_0_20px_rgba(0,242,254,0.2)] ${className}`}>
      <h4 className="text-[11px] font-bold text-cyan-200 tracking-wider z-10 flex-shrink-0">
        {title}
      </h4>
      {children}
    </div>
  );
}