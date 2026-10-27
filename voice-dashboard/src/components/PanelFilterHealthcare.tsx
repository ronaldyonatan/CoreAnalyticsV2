import React, { useState, useRef, useEffect } from 'react';

interface HealthcareItem {
  healthcareID: string;
  healthcareName: string;
}

interface DailyFilterHealthcareProps {
  healthcareList: HealthcareItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function DailyFilterHealthcare({ 
  healthcareList, 
  selectedId, 
  onSelect 
}: DailyFilterHealthcareProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedName = selectedId === '' 
    ? '-- SELECT HEALTHCARE CLINIC --' 
    : (healthcareList.find(hc => hc.healthcareID === selectedId)?.healthcareName || selectedId);

  // Filter list berdasarkan ketikan pencarian user
  const filteredList = healthcareList.filter(hc => 
    hc.healthcareName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Tutup dropdown jika klik di luar area
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* TOMBOL UTAMA DROPDOWN */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="daily-themed-control border rounded-lg px-3 py-1 text-xs sm:text-sm font-extrabold uppercase tracking-wider cursor-pointer shadow-inner flex items-center justify-between gap-4 min-w-[240px]"
      >
        <span className="truncate">{selectedName}</span>
        <svg className={`w-4 h-4 text-[#2587C8] transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* KOTAK MENU PENCARIAN & LIST */}
      {isOpen && (
        <div className="daily-themed-popover absolute left-0 mt-1 w-full border rounded-lg shadow-2xl z-50 p-1.5 backdrop-blur-md">
          {/* INPUT KOTAK PENCARIAN */}
          <div className="p-1 pb-2 border-b border-[#2587C8]/30">
            <input
              type="text"
              placeholder="Cari klinik..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              className="daily-themed-input w-full border rounded px-2 py-1 text-xs focus:outline-none"
            />
          </div>

          {/* PILIHAN DEFAULT / RESET */}
          <div
            onClick={() => {
              onSelect('');
              setIsOpen(false);
              setSearchTerm('');
            }}
            className="px-3 py-1.5 text-xs text-cyan-400 hover:bg-[#2587C8]/20 hover:text-white rounded cursor-pointer transition-colors mt-1"
          >
            -- SELECT HEALTHCARE CLINIC --
          </div>

          {/* DAFTAR KLINIK HASIL FILTER */}
          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5 mt-1">
            {filteredList.length > 0 ? (
              filteredList.map((h) => (
                <div
                  key={h.healthcareID}
                  onClick={() => {
                    onSelect(h.healthcareID);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`px-3 py-1.5 text-xs rounded cursor-pointer transition-colors ${
                    selectedId === h.healthcareID 
                      ? 'bg-[#2587C8]/40 text-white font-bold' 
                      : 'text-cyan-200 hover:bg-[#2587C8]/20 hover:text-white'
                  }`}
                >
                  {h.healthcareName}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-cyan-500 text-center italic">
                Klinik tidak ditemukan
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}