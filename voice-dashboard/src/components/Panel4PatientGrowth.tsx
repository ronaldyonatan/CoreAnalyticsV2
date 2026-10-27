import React from 'react';
import PanelWrapper from './PanelWrapper';

interface Panel4Props {
  pertumbuhanPasien: any[];
  animateChart: boolean;
}

export default function Panel4PatientGrowth({ pertumbuhanPasien, animateChart }: Panel4Props) {
  // Cari nilai maksimum pasien secara dinamis
  const maxPatients = Math.max(...pertumbuhanPasien.map((item: any) => item.totalPasien || 0), 1);

  return (
    <PanelWrapper title="4. PATIENT GROWTH">
      <div className="flex-1 flex items-end justify-around gap-3 pt-6 px-3 bg-transparent rounded-2xl border border-[#00f2fe]/15 mt-1 min-h-0 z-10">
        {pertumbuhanPasien.map((item, idx) => {
          const total = item.totalPasien || 0;
          // Skala dinamis dengan tinggi minimal 10% agar tetap nampak
          const heightPercent = Math.max((total / maxPatients) * 100, 10);

          return (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end gap-1">
              {/* Label Angka Nilai di Atas Batang */}
              <span className="text-[9px] font-bold text-emerald-400 whitespace-nowrap">
                {(total >= 1e6) ? `${(total / 1e6).toFixed(1)}M` : total.toLocaleString()}
              </span>
              
              <div 
                style={{ height: animateChart ? `${heightPercent}%` : '0%' }} 
                className="w-full bg-gradient-to-t from-emerald-950/60 to-emerald-400/90 rounded-t transition-all duration-700 ease-out shadow-[0_0_10px_rgba(52,211,153,0.3)]" 
              />
              <span className="text-[10px] font-semibold text-cyan-300 mt-1">{item.year}</span>
            </div>
          );
        })}
      </div>
    </PanelWrapper>
  );
}