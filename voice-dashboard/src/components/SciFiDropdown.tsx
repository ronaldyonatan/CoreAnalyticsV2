import React, { useRef, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  toggle: () => void;
  selectedName: string;
  list: { id: string; name: string }[];
  onSelect: (id: string) => void;
  selectedId: string;
}

export default function SciFiDropdown({ isOpen, toggle, selectedName, list, onSelect, selectedId }: Props) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (isOpen) toggle();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, toggle]);

  return (
    <div className="flex items-center gap-2 relative" ref={dropdownRef}>
      <label className="text-[10px] font-bold hidden sm:inline ds-clinic-company-label">HEALTHCARE:</label>
      <div
        onClick={toggle}
        className="border text-[12px] px-[14px] py-[8px] rounded-[12px] cursor-pointer flex items-center justify-between min-w-[240px] ds-clinic-company-control"
      >
        <span className="truncate mr-2">{selectedName}</span>
        <span className="text-[10px] ds-clinic-company-glyph" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </div>

      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] right-0 w-[300px] max-h-[260px] overflow-y-auto border rounded-[12px] backdrop-blur-md z-[9999] ds-clinic-company-popover">
          <div
            onClick={() => onSelect('')}
            className={`p-[10px_14px] text-[11px] cursor-pointer font-bold border-b border-[#00f2fe]/20 ds-clinic-company-reset ${selectedId === '' ? 'ds-clinic-company-reset--selected' : ''}`}
          >
            -- All Healthcare Nodes --
          </div>
          {list.map((hc) => (
            <div
              key={hc.id}
              onClick={() => onSelect(hc.id)}
              className={`p-[10px_14px] text-[11px] cursor-pointer border-b border-[#00f2fe]/10 ds-clinic-company-option ${selectedId === hc.id ? 'ds-clinic-company-option--selected' : ''}`}
            >
              {hc.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
