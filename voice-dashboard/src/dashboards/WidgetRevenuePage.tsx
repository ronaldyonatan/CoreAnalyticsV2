import React, { useState } from 'react';
import DailyRevenueChart from '../components/DailyRevenueChart';

interface WidgetRevenuePageProps {
  selectedHealthcareId?: string;
  healthcareList?: any[];
}

export default function WidgetRevenuePage({ selectedHealthcareId }: WidgetRevenuePageProps) {
  const isLoaded = true;

  // Data Dummy Harian (1 sampai 31 Oktober) untuk Trial
  const [dummyDailyData] = useState([
    { day: 1, adm: 70, sur: 20, rev: 45.5 },
    { day: 2, adm: 140, sur: 60, rev: 110.2 },
    { day: 3, adm: 0, sur: 0, rev: 0 },
    { day: 4, adm: 120, sur: 35, rev: 95.0 },
    { day: 5, adm: 130, sur: 40, rev: 102.5 },
    { day: 6, adm: 60, sur: 15, rev: 40.0 },
    { day: 7, adm: 110, sur: 30, rev: 88.4 },
    { day: 8, adm: 100, sur: 25, rev: 75.0 },
    { day: 9, adm: 115, sur: 30, rev: 92.1 },
    { day: 10, adm: 0, sur: 0, rev: 0 },
    { day: 11, adm: 170, sur: 50, rev: 135.8 },
    { day: 12, adm: 140, sur: 45, rev: 112.0 },
    { day: 13, adm: 220, sur: 70, rev: 175.6 },
    { day: 14, adm: 125, sur: 35, rev: 98.2 },
    { day: 15, adm: 80, sur: 20, rev: 62.0 },
    { day: 16, adm: 0, sur: 0, rev: 0 },
    { day: 17, adm: 0, sur: 0, rev: 0 },
    { day: 18, adm: 0, sur: 0, rev: 0 },
    { day: 19, adm: 0, sur: 0, rev: 0 },
    { day: 20, adm: 0, sur: 0, rev: 0 },
    { day: 21, adm: 0, sur: 0, rev: 0 },
    { day: 22, adm: 0, sur: 0, rev: 0 },
    { day: 23, adm: 0, sur: 0, rev: 0 },
    { day: 24, adm: 0, sur: 0, rev: 0 },
    { day: 25, adm: 0, sur: 0, rev: 0 },
    { day: 26, adm: 0, sur: 0, rev: 0 },
    { day: 27, adm: 0, sur: 0, rev: 0 },
    { day: 28, adm: 0, sur: 0, rev: 0 },
    { day: 29, adm: 0, sur: 0, rev: 0 },
    { day: 30, adm: 0, sur: 0, rev: 0 },
    { day: 31, adm: 0, sur: 0, rev: 0 },
  ]);

  return (
    <div className="flex-1 h-full w-full bg-[#00050a]/80 border border-[#2587C8]/30 rounded-xl p-4 flex flex-col items-center justify-center overflow-hidden">
      <div className="w-full max-w-4xl">
        <div className="mb-2 text-xs font-bold text-cyan-400 tracking-wider uppercase flex items-center justify-between">
          <span>🎯 Trial Widget Mode (Dummy Data Preview)</span>
          <span className="text-[10px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
            Healthcare ID: {selectedHealthcareId || 'All Healthcare'}
          </span>
        </div>
        
        <DailyRevenueChart 
          isLoaded={isLoaded} 
          dailyData={dummyDailyData} 
          onExpand={(key) => {
            console.log('Expanded widget key:', key);
          }} 
        />
      </div>
    </div>
  );
}