import React, { useRef, useEffect } from 'react';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  isOpen: boolean;
  toggle: () => void;
  selectedName: string;
  list: { id: string; name: string }[];
  onSelect: (id: string) => void;
  selectedId: string;
}

export default function SciFiDropdown({ isOpen, toggle, selectedName, list, onSelect, selectedId }: Props) {
  const { isJecHorizon, isJecSkywave } = useTheme();
  const isJecTheme = isJecHorizon || isJecSkywave;
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
      <label className={`text-[10px] font-bold hidden sm:inline ${isJecTheme ? 'text-[#0A5C91]' : 'text-cyan-300'}`}>HEALTHCARE:</label>
      <div 
        onClick={toggle} 
        className={`border text-[12px] px-[14px] py-[8px] rounded-[12px] cursor-pointer flex items-center justify-between min-w-[240px] ${isJecTheme ? 'bg-white/90 border-[#2587C8]/30 text-[#073B59] shadow-[0_8px_18px_rgba(1,78,120,.08)]' : 'bg-[#001428]/90 border-[#00f2fe]/50 text-[#a5f3fc] shadow-[0_0_10px_rgba(0,242,254,0.15)]'}`}
      >
        <span className="truncate mr-2">{selectedName}</span>
        <span className={`text-[10px] ${isJecTheme ? 'text-[#2587C8]' : 'text-[#00f2fe]'}`} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </div>

      {isOpen && (
        <div className={`absolute top-[calc(100%+6px)] right-0 w-[300px] max-h-[260px] overflow-y-auto border rounded-[12px] backdrop-blur-md z-[9999] ${isJecTheme ? 'bg-white/95 border-[#2587C8]/25 shadow-[0_14px_34px_rgba(1,78,120,.16)]' : 'bg-[#00050c]/95 border-[#00f2fe]/60 shadow-[0_8px_32px_rgba(0,242,254,0.25)]'}`}>
          <div 
            onClick={() => onSelect('')} 
            className={`p-[10px_14px] text-[11px] cursor-pointer font-bold border-b border-[#00f2fe]/20 ${selectedId === '' ? (isJecTheme ? 'bg-[#2587C8]/14 text-[#014E78]' : 'bg-[#00f2fe]/20 text-[#00f2fe]') : (isJecTheme ? 'text-[#245D7B]' : 'text-[#a5f3fc]')}`}
          >
            -- All Healthcare Nodes --
          </div>
          {list.map((hc) => (
            <div 
              key={hc.id} 
              onClick={() => onSelect(hc.id)} 
              className={`p-[10px_14px] text-[11px] cursor-pointer border-b border-[#00f2fe]/10 ${selectedId === hc.id ? (isJecTheme ? 'bg-[#2587C8]/14 text-[#014E78] font-bold' : 'bg-[#00f2fe]/20 text-[#00f2fe]') : (isJecTheme ? 'text-[#245D7B] hover:bg-[#2587C8]/10' : 'text-[#a5f3fc]')}`}
            >
              {hc.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}