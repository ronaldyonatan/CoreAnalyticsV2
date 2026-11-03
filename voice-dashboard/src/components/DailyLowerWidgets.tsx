import { ComponentStyles } from '../design-system/ComponentStyles';
import React from 'react';
import MonthlyRevenueChart from './MonthlyRevenueChart';
import WeeklyRevenueChart from './WeeklyRevenueChart';
import SurgeryBdChart from './SurgeryBdChart';
import PerChannelVisitsChart from './PerChannelVisitsChart';
import PerChannelSurgeryChart from './PerChannelSurgeryChart';
import PerChannelRevenueChart from './PerChannelRevenueChart';
import { DashboardExpandButton } from '../design-system';

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
    <DashboardExpandButton
      size="sm"
      onClick={() => onExpand(cardKey)}
      label={`Expand ${cardKey.replace(/-/g, ' ')} chart`}
    />
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-shrink-0">
        {/* UTILIZATION & PRODUCTIVITY - COMING SOON */}
        <div className="daily-themed-card border rounded-xl p-3 flex flex-col justify-between space-y-2 backdrop-blur-sm relative group overflow-hidden"
          style={{
            background: 'var(--core-panel)',
            borderColor: 'var(--core-border)',
            color: 'var(--core-text)',
          }}>
          <div className="absolute top-2.5 right-3 opacity-100 visible z-30">
            <ExpandButton cardKey="utilization" />
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-2 text-center pt-5">
            <div className="daily-themed-inset p-2 rounded-lg border shadow-inner"
              style={{
                background: 'var(--core-control)',
                borderColor: 'var(--core-border)',
                color: 'var(--core-text)',
              }}>
              <div className="text-[9px] mb-1" style={{ color: 'var(--core-primary-strong)' }}>Utilization</div>
              <div className="grid grid-cols-2 text-[9px] font-bold border-b pb-1 mb-1" style={{ borderColor: 'var(--core-border)' }}>
                <span>Poli</span><span>OT</span>
              </div>
              <div className="grid grid-cols-2 text-[10px]">
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>A</span>{isLoaded ? '34.3%' : '0%'}</div>
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>A</span>{isLoaded ? '18.8%' : '0%'}</div>
              </div>
              <div className="grid grid-cols-2 text-[10px] text-rose-400 mt-1">
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>T</span>{isLoaded ? '55.2%' : '0%'}</div>
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>T</span>{isLoaded ? '20.2%' : '0%'}</div>
              </div>
            </div>

            <div className="daily-themed-inset p-2 rounded-lg border shadow-inner"
              style={{
                background: 'var(--core-control)',
                borderColor: 'var(--core-border)',
                color: 'var(--core-text)',
              }}>
              <div className="text-[9px] mb-1" style={{ color: 'var(--core-primary-strong)' }}>Conversion</div>
              <div className="grid grid-cols-2 text-[9px] font-bold border-b pb-1 mb-1" style={{ borderColor: 'var(--core-border)' }}>
                <span>Incl PO</span><span>excl PO*</span>
              </div>
              <div className="grid grid-cols-2 text-[10px]">
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>A</span>{isLoaded ? '5.6%' : '0%'}</div>
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>A</span>{isLoaded ? '7%' : '0%'}</div>
              </div>
              <div className="grid grid-cols-2 text-[10px] text-[#4ade80] mt-1">
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>T</span>{isLoaded ? '6.3%' : '0%'}</div>
                <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>T</span>{isLoaded ? '8.4%' : '0%'}</div>
              </div>
            </div>
          </div>

          <div className="daily-themed-inset relative z-10 p-2 rounded-lg border text-center shadow-inner"
            style={{
              background: 'var(--core-control)',
              borderColor: 'var(--core-border)',
              color: 'var(--core-text)',
            }}>
            <div className="text-[9px] mb-1" style={{ color: 'var(--core-primary-strong)' }}>Prod Index</div>
            <div className="grid grid-cols-2 text-[9px] font-bold border-b pb-1 mb-1" style={{ borderColor: 'var(--core-border)' }}>
              <span>Emp</span><span>SpM</span>
            </div>
            <div className="grid grid-cols-2 text-xs font-extrabold" style={{ color: 'var(--core-text)' }}>
              <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>A</span>{isLoaded ? '8.2 X' : '0 X'}</div>
              <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>A</span>{isLoaded ? '3.2 X' : '0 X'}</div>
            </div>
            <div className="grid grid-cols-2 text-xs font-extrabold mt-1" style={{ color: 'var(--core-primary-strong)' }}>
              <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>T</span>{isLoaded ? '8.6 X' : '0 X'}</div>
              <div><span className="text-[8px] block" style={{ color: 'var(--core-text-secondary)' }}>T</span>{isLoaded ? '3.6 X' : '0 X'}</div>
            </div>
          </div>

          {/* COMING SOON OVERLAY FOR THIS WHOLE PANEL */}
          <div className="daily-comingsoon-util-overlay pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
            <div
              className="daily-comingsoon-pattern absolute inset-0 opacity-[0.055]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(-24deg, color-mix(in srgb, var(--core-primary) 30%, transparent) 0px, color-mix(in srgb, var(--core-primary) 30%, transparent) 1px, transparent 1px, transparent 15px)',
              }}
            />

            <span className="daily-comingsoon-corner absolute left-2 top-2 h-4 w-4 border-l border-t" style={{ borderColor: 'var(--core-border-strong)' }} />
            <span className="daily-comingsoon-corner absolute right-2 top-2 h-4 w-4 border-r border-t" style={{ borderColor: 'var(--core-border-strong)' }} />
            <span className="daily-comingsoon-corner absolute bottom-2 left-2 h-4 w-4 border-b border-l" style={{ borderColor: 'var(--core-border-strong)' }} />
            <span className="daily-comingsoon-corner absolute bottom-2 right-2 h-4 w-4 border-b border-r" style={{ borderColor: 'var(--core-border-strong)' }} />

            <div className="daily-comingsoon-ribbon daily-comingsoon-ribbon--util absolute left-1/2 top-1/2 w-[132%] -translate-x-1/2 -translate-y-1/2 -rotate-[7deg] border-y py-2.5 backdrop-blur-[1px]"
              style={{
                background: 'color-mix(in srgb, var(--core-primary) 16%, var(--core-panel))',
                borderColor: 'var(--core-border-strong)',
                boxShadow: '0 0 24px color-mix(in srgb, var(--core-glow) 45%, transparent)',
                color: 'var(--core-text)',
              }}>
              <div className="flex items-center justify-center gap-2.5 whitespace-nowrap">
                <span className="daily-comingsoon-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--core-primary)', boxShadow: '0 0 9px var(--core-glow)' }} />
                <span className="daily-comingsoon-title text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: 'var(--core-primary-strong)' }}>
                  Coming Soon
                </span>
                <span className="daily-comingsoon-subtitle text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--core-text-secondary)' }}>
                  Utilization · Conversion · Prod Index
                </span>
                <span className="daily-comingsoon-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--core-primary)', boxShadow: '0 0 9px var(--core-glow)' }} />
              </div>
              <div className="daily-comingsoon-footnote mt-1 text-center text-[7px] font-bold uppercase tracking-[0.19em]" style={{ color: 'var(--core-text-muted)' }}>
                Live data integration in progress
              </div>
            </div>

            <div className="utilization-comingsoon-sweep absolute inset-y-0 -left-1/3 w-[32%] blur-sm" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--core-primary) 6%, transparent), color-mix(in srgb, var(--core-primary-soft) 18%, transparent), color-mix(in srgb, var(--core-primary) 6%, transparent), transparent)' }} />

            <div className="daily-comingsoon-preview absolute bottom-2.5 right-3 rounded-full border px-2 py-0.5 text-[6px] font-black uppercase tracking-[0.18em]"
              style={{
                background: 'var(--core-control)',
                borderColor: 'var(--core-border)',
                color: 'var(--core-text-secondary)',
              }}>
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
        <div className="daily-themed-card bg-[#000a17]/70 border border-[#2587C8]/30 rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-sm min-h-[120px] relative group">
          <div className="absolute top-2.5 right-3 opacity-100 visible z-30">
            <ExpandButton cardKey="per-channel" />
          </div>
          <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider pb-1 border-b border-[#2587C8]/20 text-center pr-6">
            PER CHANNEL
          </div>
          <div className="grid grid-cols-3 gap-2 py-1 my-auto items-center">
            <PerChannelVisitsChart isLoaded={isLoaded} data={channelVisitsData} />
            <PerChannelSurgeryChart isLoaded={isLoaded} data={channelSurgeryData} />
            <PerChannelRevenueChart isLoaded={isLoaded} data={channelRevenueData} />
          </div>
          <div className="flex justify-center items-center gap-4 text-[8px] pt-1.5 border-t border-[#2587C8]/20 font-bold">
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
        <div className="daily-themed-card bg-[#000a17]/70 border border-[#2587C8]/30 rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-sm min-h-[120px] relative group">
          <div className="absolute top-2.5 right-3 opacity-100 visible z-30">
            <ExpandButton cardKey="ol-2025" />
          </div>
          <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider pb-1.5 border-b border-[#2587C8]/20 pr-7">
            2025 - OL (In IDR Mio)
          </div>
          {/* COMING SOON — OL preview */}
          <div className="daily-comingsoon-ol-overlay pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
            <div className="daily-comingsoon-ribbon daily-comingsoon-ribbon--ol absolute left-1/2 top-1/2 w-[116%] -translate-x-1/2 -translate-y-1/2 -rotate-[5deg] border-y py-1.5 backdrop-blur-[2px]">
              <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                <span className="daily-comingsoon-dot h-1.5 w-1.5 rounded-full" />
                <span className="daily-comingsoon-title text-[9px] font-black uppercase tracking-[0.24em]">
                  Coming Soon
                </span>
                <span className="daily-comingsoon-subtitle text-[7px] font-bold uppercase tracking-[0.16em]">
                  Budget · OL · YTD
                </span>
                <span className="daily-comingsoon-dot h-1.5 w-1.5 rounded-full" />
              </div>
              <div className="daily-comingsoon-footnote mt-0.5 text-center text-[6px] font-bold uppercase tracking-[0.18em]">
                Live data integration in progress
              </div>
            </div>
            <div className="utilization-comingsoon-sweep absolute inset-y-0 -left-1/3 w-[28%] bg-[linear-gradient(90deg,transparent,rgba(125,211,252,.04),rgba(255,255,255,.14),rgba(125,211,252,.04),transparent)] blur-sm" />
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
        </div>
      </div>

      <ComponentStyles name="utilization" />
    </>
  );
}
