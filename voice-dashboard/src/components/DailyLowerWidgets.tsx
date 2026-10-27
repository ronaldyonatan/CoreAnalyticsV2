import React from 'react';
import MonthlyRevenueChart from './MonthlyRevenueChart';
import WeeklyRevenueChart from './WeeklyRevenueChart';
import SurgeryBdChart from './SurgeryBdChart';
import PerChannelVisitsChart from './PerChannelVisitsChart';
import PerChannelSurgeryChart from './PerChannelSurgeryChart';
import PerChannelRevenueChart from './PerChannelRevenueChart';

interface DailyLowerWidgetsProps {
  isLoaded: boolean;
  dailyData?: any[];
  monthlyData?: any[];
  surgeryBdData?: any[];
  channelVisitsData?: any[];
  channelSurgeryData?: any[];
  channelRevenueData?: any[];
  onExpand: (key: string) => void;
}

export default function DailyLowerWidgets({
  isLoaded,
  dailyData = [],
  monthlyData = [],
  surgeryBdData = [],
  channelVisitsData = [],
  channelSurgeryData = [],
  channelRevenueData = [],
  onExpand,
}: DailyLowerWidgetsProps) {
  const ExpandButton = ({ cardKey }: { cardKey: string }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onExpand(cardKey);
      }}
      className="daily-themed-icon-button p-1 rounded transition-colors"
      title="View Full Screen"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
      </svg>
    </button>
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-shrink-0">
        {/* UTILIZATION & PRODUCTIVITY - COMING SOON */}
        <div className="daily-themed-card border rounded-xl p-3 flex flex-col justify-between space-y-2 backdrop-blur-sm relative group overflow-hidden">
          <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-30">
            <ExpandButton cardKey="utilization" />
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-2 text-center pt-5">
            <div className="daily-themed-inset p-2 rounded-lg border daily-themed-border shadow-inner">
              <div className="text-[9px] daily-themed-muted mb-1">Utilization</div>
              <div className="grid grid-cols-2 text-[9px] font-bold border-b daily-themed-border pb-1 mb-1">
                <span>Poli</span><span>OT</span>
              </div>
              <div className="grid grid-cols-2 text-[10px]">
                <div><span className="text-[8px] daily-themed-accent block">A</span>{isLoaded ? '34.3%' : '0%'}</div>
                <div><span className="text-[8px] daily-themed-accent block">A</span>{isLoaded ? '18.8%' : '0%'}</div>
              </div>
              <div className="grid grid-cols-2 text-[10px] text-rose-400 mt-1">
                <div><span className="text-[8px] daily-themed-accent block">T</span>{isLoaded ? '55.2%' : '0%'}</div>
                <div><span className="text-[8px] daily-themed-accent block">T</span>{isLoaded ? '20.2%' : '0%'}</div>
              </div>
            </div>

            <div className="daily-themed-inset p-2 rounded-lg border daily-themed-border shadow-inner">
              <div className="text-[9px] daily-themed-muted mb-1">Conversion</div>
              <div className="grid grid-cols-2 text-[9px] font-bold border-b daily-themed-border pb-1 mb-1">
                <span>Incl PO</span><span>excl PO*</span>
              </div>
              <div className="grid grid-cols-2 text-[10px]">
                <div><span className="text-[8px] daily-themed-accent block">A</span>{isLoaded ? '5.6%' : '0%'}</div>
                <div><span className="text-[8px] daily-themed-accent block">A</span>{isLoaded ? '7%' : '0%'}</div>
              </div>
              <div className="grid grid-cols-2 text-[10px] text-[#4ade80] mt-1">
                <div><span className="text-[8px] daily-themed-accent block">T</span>{isLoaded ? '6.3%' : '0%'}</div>
                <div><span className="text-[8px] daily-themed-accent block">T</span>{isLoaded ? '8.4%' : '0%'}</div>
              </div>
            </div>
          </div>

          <div className="relative z-10 daily-themed-inset p-2 rounded-lg border daily-themed-border text-center shadow-inner">
            <div className="text-[9px] daily-themed-muted mb-1">Prod Index</div>
            <div className="grid grid-cols-2 text-[9px] font-bold border-b daily-themed-border pb-1 mb-1">
              <span>Emp</span><span>SpM</span>
            </div>
            <div className="grid grid-cols-2 text-xs font-extrabold text-white">
              <div><span className="text-[8px] daily-themed-accent block">A</span>{isLoaded ? '8.2 X' : '0 X'}</div>
              <div><span className="text-[8px] daily-themed-accent block">A</span>{isLoaded ? '3.2 X' : '0 X'}</div>
            </div>
            <div className="grid grid-cols-2 text-xs font-extrabold text-amber-400 mt-1">
              <div><span className="text-[8px] daily-themed-accent block">T</span>{isLoaded ? '8.6 X' : '0 X'}</div>
              <div><span className="text-[8px] daily-themed-accent block">T</span>{isLoaded ? '3.6 X' : '0 X'}</div>
            </div>
          </div>

          {/* COMING SOON OVERLAY FOR THIS WHOLE PANEL */}
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
            <div
              className="absolute inset-0 opacity-[0.055]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(-24deg, rgba(251,191,36,.34) 0px, rgba(251,191,36,.34) 1px, transparent 1px, transparent 15px)',
              }}
            />

            <span className="absolute left-2 top-2 h-4 w-4 border-l border-t border-amber-300/55" />
            <span className="absolute right-2 top-2 h-4 w-4 border-r border-t border-amber-300/55" />
            <span className="absolute bottom-2 left-2 h-4 w-4 border-b border-l border-amber-300/55" />
            <span className="absolute bottom-2 right-2 h-4 w-4 border-b border-r border-amber-300/55" />

            <div className="absolute left-1/2 top-1/2 w-[132%] -translate-x-1/2 -translate-y-1/2 -rotate-[7deg] border-y border-amber-300/35 bg-[#3a2705]/55 py-2.5 shadow-[0_0_24px_rgba(251,191,36,.09)] backdrop-blur-[1px]">
              <div className="flex items-center justify-center gap-2.5 whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_9px_rgba(252,211,77,.95)]" />
                <span className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-100">
                  Coming Soon
                </span>
                <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-200/65">
                  Utilization · Conversion · Prod Index
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_9px_rgba(252,211,77,.95)]" />
              </div>
              <div className="mt-1 text-center text-[7px] font-bold uppercase tracking-[0.19em] text-amber-100/45">
                Live data integration in progress
              </div>
            </div>

            <div className="utilization-comingsoon-sweep absolute inset-y-0 -left-1/3 w-[32%] bg-[linear-gradient(90deg,transparent,rgba(251,191,36,.06),rgba(255,244,190,.16),rgba(251,191,36,.06),transparent)] blur-sm" />

            <div className="absolute bottom-2.5 right-3 rounded-full border border-amber-300/25 bg-[#211704]/70 px-2 py-0.5 text-[6px] font-black uppercase tracking-[0.18em] text-amber-200/65">
              Preview Data
            </div>
          </div>
        </div>

        {/* SURGERY BD */}
        <SurgeryBdChart
          isLoaded={isLoaded}
          surgeryBdData={surgeryBdData}
          onExpand={onExpand}
        />

        {/* WEEKLY REVENUE */}
        <WeeklyRevenueChart
          isLoaded={isLoaded}
          dailyData={dailyData}
          onExpand={onExpand}
        />
      </div>

      {/* BARIS FOOTER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-shrink-0 pb-1">
        {/* PER CHANNEL */}
        <div className="daily-themed-card border rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-sm min-h-[120px] relative group">
          <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <ExpandButton cardKey="per-channel" />
          </div>
          <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider pb-1 border-b daily-themed-border text-center pr-6">
            PER CHANNEL
          </div>
          <div className="grid grid-cols-3 gap-2 py-1 my-auto items-center">
            <PerChannelVisitsChart isLoaded={isLoaded} data={channelVisitsData} />
            <PerChannelSurgeryChart isLoaded={isLoaded} data={channelSurgeryData} />
            <PerChannelRevenueChart isLoaded={isLoaded} data={channelRevenueData} />
          </div>
          <div className="flex justify-center items-center gap-4 text-[8px] pt-1.5 border-t daily-themed-border font-bold">
            <span className="text-[#3bb14a]">BPJS</span>
            <span className="text-[#38bdf8]">Paying P</span>
            <span className="text-[#f59e0b]">B to B</span>
          </div>
        </div>

        {/* MONTHLY REVENUE & YTD */}
        <MonthlyRevenueChart
          isLoaded={isLoaded}
          monthlyData={monthlyData}
          onExpand={onExpand}
        />

        {/* 2025 - OL */}
        <div className="daily-themed-card border rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-sm min-h-[120px] relative group overflow-hidden">
          <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-30">
            <ExpandButton cardKey="ol-2025" />
          </div>
          <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider pb-1.5 border-b daily-themed-border pr-7">
            2025 - OL (In IDR Mio)
          </div>
          <div className="grid grid-cols-2 gap-2 items-center py-1.5 my-auto">
            <div className="flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full border-3 border-indigo-400 flex items-center justify-center text-xs font-bold text-indigo-200 shadow-[0_0_12px_rgba(129,140,248,0.4)]">
                {isLoaded ? '95.8%' : '0%'}
              </div>
            </div>
            <div className="space-y-1 text-[9px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-black border border-[#2587C8] rounded-sm"></span>
                Budget: <strong className="text-white">{isLoaded ? '30,325' : '0'}</strong>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[#2587C8] rounded-sm"></span>
                2026-OL: <strong className="text-[#38bdf8]">{isLoaded ? '29,083' : '0'}</strong>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-[#3bb14a] rounded-sm"></span>
                YTD: <strong className="text-[#4ade80]">{isLoaded ? '21,551' : '0'}</strong>
              </div>
            </div>
          </div>

          {/* COMING SOON - BUDGET / OL */}
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
            <div
              className="absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(-24deg, rgba(251,191,36,.30) 0px, rgba(251,191,36,.30) 1px, transparent 1px, transparent 15px)',
              }}
            />

            <div className="absolute left-1/2 top-1/2 w-[128%] -translate-x-1/2 -translate-y-1/2 -rotate-[6deg] border-y border-amber-300/35 bg-[#3a2705]/55 py-2 shadow-[0_0_22px_rgba(251,191,36,.10)] backdrop-blur-[1px]">
              <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_9px_rgba(252,211,77,.95)]" />

                <span className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-100">
                  Coming Soon
                </span>

                <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-amber-200/65">
                  Budget · OL · YTD
                </span>

                <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_9px_rgba(252,211,77,.95)]" />
              </div>

              <div className="mt-0.5 text-center text-[6px] font-bold uppercase tracking-[0.18em] text-amber-100/45">
                Live data integration in progress
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes utilizationComingSoonSweep {
          0% { transform: translateX(0%); opacity: 0; }
          12% { opacity: 0.85; }
          72% { opacity: 0.85; }
          100% { transform: translateX(430%); opacity: 0; }
        }

        .utilization-comingsoon-sweep {
          animation: utilizationComingSoonSweep 5.5s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .utilization-comingsoon-sweep {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
