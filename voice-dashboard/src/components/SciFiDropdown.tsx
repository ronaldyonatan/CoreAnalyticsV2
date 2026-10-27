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
      <label className="text-[10px] text-cyan-300 font-bold hidden sm:inline">HEALTHCARE:</label>
      <div 
        onClick={toggle} 
        className="bg-[#001428]/90 border border-[#00f2fe]/50 text-[#a5f3fc] text-[12px] px-[14px] py-[8px] rounded-[12px] cursor-pointer flex items-center justify-between min-w-[240px] shadow-[0_0_10px_rgba(0,242,254,0.15)]"
      >
        <span className="truncate mr-2">{selectedName}</span>
        <span className="text-[#00f2fe] text-[10px]" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </div>

      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] right-0 w-[300px] max-h-[260px] overflow-y-auto bg-[#00050c]/95 border border-[#00f2fe]/60 rounded-[12px] shadow-[0_8px_32px_rgba(0,242,254,0.25)] backdrop-blur-md z-[9999]">
          <div 
            onClick={() => onSelect('')} 
            className={`p-[10px_14px] text-[11px] cursor-pointer font-bold border-b border-[#00f2fe]/20 ${selectedId === '' ? 'bg-[#00f2fe]/20 text-[#00f2fe]' : 'text-[#a5f3fc]'}`}
          >
            -- All Healthcare Nodes --
          </div>
          {list.map((hc) => (
            <div 
              key={hc.id} 
              onClick={() => onSelect(hc.id)} 
              className={`p-[10px_14px] text-[11px] cursor-pointer border-b border-[#00f2fe]/10 ${selectedId === hc.id ? 'bg-[#00f2fe]/20 text-[#00f2fe]' : 'text-[#a5f3fc]'}`}
            >
              {hc.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}