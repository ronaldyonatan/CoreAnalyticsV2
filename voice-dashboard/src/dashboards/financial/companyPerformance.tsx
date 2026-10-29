import React, { useState, useEffect, useCallback, useRef } from 'react';

// Import komponen panel
import Panel1Revenue from '../../components/Panel1Revenue';
import PanelExsumRevenue from '../../components/PanelExsumRevenue';
import PanelExsumDoctorFee from '../../components/PanelExsumDoctorFee';
import PanelExsumMaterial from '../../components/PanelExsumMaterial';
import PanelDetailPNL, { type PnLItem, type PnLClosingInfo } from '../../components/PanelDetailPNL';
import DailyFilterHealthcare from '../../components/PanelFilterHealthcare';
import { useVoiceCommandCompanyPerformance } from '../../voiceCommand/CompanyperformanceVC';
import './company-performance-theme.css';

interface TrenPendapatanItem { month: string; revenue: string; revenue_2025?: string; revenue_2026?: string; month_name?: string; }
interface ExsumRevenueItem { 'UNIT BISNIS': string; [key: string]: any; }
interface ExsumDoctorFeeItem { 'UNIT BISNIS': string; [key: string]: any; }
interface HealthcareItem { healthcareID: string; healthcareName: string; }

interface CompanyPerformanceProps {
  selectedHealthcareId: string;
  healthcareList: HealthcareItem[];
  onHealthcareChange?: (id: string) => void;
  onHealthcareRefresh?: () => Promise<boolean>;
  healthcareLoading?: boolean;
  healthcareError?: string | null;
}

class SciFiAudio {
  private static ctx: AudioContext | null = null;

  private static getContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  static playBeep(frequency = 800, type: OscillatorType = 'sine', duration = 0.08, vol = 0.05) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  static playWhoosh() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }
}

// =========================================================================
// 1. SUB-KOMPONEN: View Individu dengan Layout Dinamis Maximize / Normal
// =========================================================================
interface HealthcareDashboardViewProps {
  healthcareId: string;
  titleName: string;
  activeGraphs: number[];
  setActiveGraphs: (graphs: number[]) => void;
  panel1Mode: 'BAR' | 'RADIANT';
  setPanel1Mode: (mode: 'BAR' | 'RADIANT') => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  isCompareMode?: boolean;
  isLeftSide?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  peerData?: {
    trenPendapatan: TrenPendapatanItem[];
    exsumRevenue: ExsumRevenueItem[];
    exsumDoctorFee: ExsumDoctorFeeItem[];
    exsumMaterial: ExsumDoctorFeeItem[];
    exsumPnL: PnLItem[];
    closingInfo?: PnLClosingInfo;
  };
}

const HealthcareDashboardView = ({
  healthcareId,
  titleName,
  activeGraphs,
  setActiveGraphs,
  panel1Mode,
  setPanel1Mode,
  isScanning,
  setIsScanning,
  isCompareMode = false,
  isLeftSide = true,
  containerRef,
  peerData
}: HealthcareDashboardViewProps) => {
  const [animateChart, setAnimateChart] = useState(false);

  const [trenPendapatan, setTrenPendapatan] = useState<TrenPendapatanItem[]>([]);
  const [exsumRevenue, setExsumRevenue] = useState<ExsumRevenueItem[]>([]);
  const [exsumSentra, setExsumSentra] = useState<any[]>([]);
  const [exsumDoctorFee, setExsumDoctorFee] = useState<ExsumDoctorFeeItem[]>([]);
  const [exsumMaterial, setExsumMaterial] = useState<ExsumDoctorFeeItem[]>([]);
  const [exsumPnL, setExsumPnL] = useState<PnLItem[]>([]);
  const [closingInfo, setClosingInfo] = useState<PnLClosingInfo>({});

  function switchLayoutWithFade(graphs: number[]) {
    SciFiAudio.playWhoosh();
    setIsScanning(true);
    setTimeout(() => {
      setActiveGraphs(graphs);
      setIsScanning(false);
    }, 450);
  }

  useEffect(() => {
    if (!isScanning) {
      setAnimateChart(false);
      const timer = setTimeout(() => setAnimateChart(true), 150);
      return () => clearTimeout(timer);
    }
  }, [isScanning, setActiveGraphs]);

  const fetchDashboardData = useCallback(async (healthcareIdFilter: string) => {
    const headers = {
      'x-connection': 'domo',
      'x-token': 'e2e6457d15727d578130f0fc7db54708',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json'
    };
    const payloadBase = healthcareIdFilter ? { HealthcareID: healthcareIdFilter } : {};

    try {
      const [res1, resExsum, resSentra, resDoctor, resMaterial, resPnL, resClosing] = await Promise.all([
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'TrenPendapatan', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'exumrev', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'revsentra', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'exumdoctor', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'exummaterial', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'pnl', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'disclaimerPNL', ...payloadBase }) }),
      ]);

      if (res1.ok) { const json = await res1.json(); setTrenPendapatan(json.data || []); }
      if (resExsum.ok) { const json = await resExsum.json(); setExsumRevenue(json.data || []); }
      if (resSentra.ok) { const json = await resSentra.json(); setExsumSentra(json.data || []); } 
      if (resDoctor.ok) { const json = await resDoctor.json(); setExsumDoctorFee(json.data || []); }
      if (resMaterial.ok) { const json = await resMaterial.json(); setExsumMaterial(json.data || []); }
      if (resPnL.ok) { const json = await resPnL.json(); setExsumPnL(json.data || []); }
      if (resClosing.ok) { 
        const json = await resClosing.json(); 
        const closingArray = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
        
        if (!healthcareIdFilter) {
          setClosingInfo(closingArray);
        } else {
          const matchedClosing = closingArray.find((item: any) => {
            const itemID = String(item.HealthcareID || item.healthcareid || item.HealthcareId || '').trim().replace(/^0+/, '');
            const filterID = String(healthcareIdFilter).trim().replace(/^0+/, '');
            const itemName = String(item.HealthcareName || item.healthcarename || '').trim().toUpperCase();
            const targetName = String(titleName || '').trim().toUpperCase();

            if (filterID && itemID) return itemID === filterID;
            if (targetName && itemName) return itemName === targetName;
            return false;
          });

          setClosingInfo(matchedClosing || closingArray[0] || {}); 
        }
      }
    } catch (error) {
      console.error('API connection error:', error);
    }
  }, [titleName]);

  useEffect(() => {
    fetchDashboardData(healthcareId);
  }, [healthcareId, fetchDashboardData]);

  const renderSelectedPanel = (id: number) => {
    const isMaximized = activeGraphs.length === 1 && activeGraphs[0] === id;

    let panelContent = null;
    switch(id) {
      case 1: 
        panelContent = (
          <Panel1Revenue 
            key="panel-1" 
            panel1Mode={panel1Mode} 
            setPanel1Mode={setPanel1Mode} 
            trenPendapatan={trenPendapatan} 
            animateChart={animateChart}
            isMaximized={isMaximized}
          />
        ); 
        break;
      case 2: 
        panelContent = (
          <PanelExsumRevenue 
            key="panel-2" 
            exsumData={exsumRevenue} 
            sentraData={exsumSentra} 
            animateChart={animateChart}
            isMaximized={isMaximized}
          />
        ); 
        break;
      case 3: 
        panelContent = (
          <PanelExsumMaterial 
            key="panel-3" 
            exsumData={exsumMaterial} 
            animateChart={animateChart}
            isMaximized={isMaximized}
          />
        ); 
        break;
      case 4: 
        panelContent = (
          <PanelExsumDoctorFee 
            key="panel-4" 
            exsumData={exsumDoctorFee} 
            animateChart={animateChart}
            isMaximized={isMaximized}
          />
        ); 
        break;
      default: return null;
    }

    const handleToggleMaximize = () => {
      SciFiAudio.playBeep(900, 'triangle', 0.1, 0.04);
      isMaximized ? switchLayoutWithFade([1, 2, 3, 4]) : switchLayoutWithFade([id]);
    };

    return (
      <div key={`panel-wrapper-${id}`} className="company-panel-frame relative w-full h-full bg-[#001428]/20 border border-[#00f2fe]/10 rounded-lg p-1 overflow-hidden flex flex-col">
        <button
          onClick={handleToggleMaximize}
          title={isMaximized ? "Restore Layout" : "Maximize Panel"}
          className="company-icon-button absolute top-2 right-2 z-[60] p-1 rounded-lg bg-[#001428]/40 text-[#00f2fe]/70 hover:bg-[#00f2fe]/20 hover:text-white transition-all cursor-pointer backdrop-blur-sm"
        >
          {isMaximized ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
          )}
        </button>
        {panelContent}
      </div>
    );
  };

  const getGridClass = () => {
    const visibleTopGridPanels = activeGraphs.filter(g => g >= 1 && g <= 4);
    const len = visibleTopGridPanels.length;

    if (len === 1) {
      return 'company-top-grid--one grid-cols-1 grid-rows-1 h-full shrink-0';
    }

    if (len === 2) {
      return 'company-top-grid--two grid-cols-1 md:grid-cols-2 grid-rows-1 h-[75vh] shrink-0';
    }

    // Three graph combinations are intentionally one horizontal row on
    // tablet/desktop/phone-landscape. Portrait mobile remains stacked by the
    // existing <=767px responsive rules.
    if (len === 3) {
      return 'company-top-grid--three grid-cols-1 md:grid-cols-3 grid-rows-1 h-[75vh] shrink-0';
    }

    return 'company-top-grid--four grid-cols-1 md:grid-cols-2 grid-rows-2 h-[75vh] shrink-0';
  };

  const visibleTopGridPanels = activeGraphs.filter(g => g >= 1 && g <= 4);
  const isPanel5Maximized = activeGraphs.length === 1 && activeGraphs[0] === 5;
  const isAnyGraphMaximized = activeGraphs.length === 1 && activeGraphs[0] >= 1 && activeGraphs[0] <= 4;
  const isDefaultOverview =
    visibleTopGridPanels.length === 4 &&
    [1, 2, 3, 4].every((graphId) => visibleTopGridPanels.includes(graphId));

  // P&L belongs to the normal four-panel overview, or to its own fullscreen.
  // It must NOT leak into 2/3 graph voice combinations.
  const showPnlSection = isPanel5Maximized || isDefaultOverview;

  const handleToggleMaximizePanel5 = () => {
    SciFiAudio.playBeep(900, 'triangle', 0.1, 0.04);
    isPanel5Maximized ? switchLayoutWithFade([1, 2, 3, 4]) : switchLayoutWithFade([5]);
  };

  return (
    <div className="company-node-view flex flex-col h-full w-full relative overflow-hidden space-y-2">
      <div className="company-node-header flex justify-between items-center py-1 px-3 bg-[#00f2fe]/10 border-b border-[#00f2fe]/30 rounded-t-lg flex-shrink-0">
        <span className="company-title text-[10px] font-bold text-[#00f2fe] tracking-widest uppercase text-hud-glow">
          {titleName || 'ALL HEALTHCARE NODES'}
        </span>
        <span className="company-muted text-[9px] font-mono text-cyan-400/80 uppercase tracking-wider">
          {isPanel5Maximized
            ? 'DETAIL PNL (FULLSCREEN)'
            : isAnyGraphMaximized
              ? 'GRAFIK MAXIMIZED'
              : isDefaultOverview
                ? '4 GRAFIK UTAMA & DETAIL PNL'
                : `${visibleTopGridPanels.length} GRAFIK AKTIF`}
        </span>
      </div>

      <div 
        ref={containerRef}
        data-sync-id="dashboard-main-scroll"
        className="company-main-scroll flex-1 min-h-0 flex flex-col relative overflow-y-auto pr-1 space-y-4 custom-scrollbar"
      >
        {!isPanel5Maximized && (
          <div className={`company-top-grid w-full relative grid gap-3 ${getGridClass()} ${isScanning ? 'animate-glitch-out' : 'animate-glitch-in'}`}>
            {activeGraphs.filter(g => g >= 1 && g <= 4).map((graphId) => renderSelectedPanel(graphId))}
          </div>
        )}

        {showPnlSection && (
          <div className={`company-pnl-section w-full flex flex-col pb-4 ${isPanel5Maximized ? 'h-full flex-1' : 'min-h-[78vh]'} ${isScanning ? 'animate-glitch-out' : 'animate-glitch-in'}`}>
            <PanelDetailPNL 
              pnlData={exsumPnL} 
              animateChart={animateChart} 
              isMaximized={isPanel5Maximized}
              onToggleMaximize={handleToggleMaximizePanel5}
              isCompareMode={isCompareMode}
              isLeftSide={isLeftSide}
              peerPnLData={peerData?.exsumPnL}
              closingInfo={closingInfo}
              currentSiteName={titleName}
            />
          </div>
        )}
      </div>
    </div>
  );
};


// =========================================================================
// 2. KOMPONEN UTAMA
// =========================================================================
export default function CompanyPerformance({ 
  selectedHealthcareId, 
  healthcareList,
  onHealthcareChange,
  onHealthcareRefresh,
  healthcareLoading = false,
  healthcareError = null,
}: CompanyPerformanceProps) {

  const [activeGraphs, setActiveGraphs] = useState<number[]>([1, 2, 3, 4]);
  const [panel1Mode, setPanel1Mode] = useState<'BAR' | 'RADIANT'>('BAR');
  const [isScanning, setIsScanning] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const [isCompareMode, setIsCompareMode] = useState(false);
  
  // State Status Lock/Unlock Sync Scroll
  const [isScrollSynced, setIsScrollSynced] = useState<boolean>(true);
  
  const isScrollSyncedRef = useRef<boolean>(isScrollSynced);

  // State Kiri & Kanan
  const [leftHealthcareId, setLeftHealthcareId] = useState<string>(selectedHealthcareId || '');
  const [rightHealthcareId, setRightHealthcareId] = useState<string>('');

  // Ref untuk Synchronized Scrolling antara Kiri dan Kanan
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedHealthcareId !== undefined) {
      setLeftHealthcareId(selectedHealthcareId);
    }
  }, [selectedHealthcareId]);

  // Guided Tour: on mobile the healthcare selector lives inside the collapsed
  // FILTER area. App.tsx dispatches this event before Spotlight measures it.
  useEffect(() => {
    const handleTourShowHealthcareFilter = () => {
      setIsMobileFiltersOpen(true);
    };

    window.addEventListener(
      'core-tour-show-healthcare-filter',
      handleTourShowHealthcareFilter
    );

    return () => {
      window.removeEventListener(
        'core-tour-show-healthcare-filter',
        handleTourShowHealthcareFilter
      );
    };
  }, []);

  useEffect(() => {
    isScrollSyncedRef.current = isScrollSynced;
  }, [isScrollSynced]);

  // LOGIKA SYNCHRONIZED SCROLL (DITAMBAHKAN PENGAMANAN __isVoiceScrolling)
  useEffect(() => {
    if (!isCompareMode) return;

    const timer = setTimeout(() => {
      const leftEl = leftScrollRef.current;
      const rightEl = rightScrollRef.current;

      if (!leftEl || !rightEl) return;

      let isSyncing = false;

      const handleScroll = (source: HTMLElement, target: HTMLElement) => {
        return (e: Event) => {
          // CEK APAKAH SEDANG BERJALAN PROGRAMMATIC VOICE COMMAND SCROLL
          if ((window as any).__isVoiceScrolling || !isScrollSyncedRef.current || isSyncing) return;
          
          const scrolledEl = e.target as HTMLElement;
          if (!scrolledEl) return;

          isSyncing = true;

          if (scrolledEl === source) {
            target.scrollTop = source.scrollTop;
            target.scrollLeft = source.scrollLeft;
          } else {
            const syncId = scrolledEl.getAttribute('data-sync-id');
            let targetSub: HTMLElement | null = null;

            if (syncId) {
              targetSub = target.querySelector(`[data-sync-id="${syncId}"]`);
            } else {
              const tag = scrolledEl.tagName.toLowerCase();
              const sourceElements = Array.from(source.querySelectorAll(tag));
              const elIndex = sourceElements.indexOf(scrolledEl);

              if (elIndex !== -1) {
                const targetElements = Array.from(target.querySelectorAll(tag));
                targetSub = (targetElements[elIndex] as HTMLElement) || null;
              }
            }

            if (targetSub) {
              targetSub.scrollTop = scrolledEl.scrollTop;
              targetSub.scrollLeft = scrolledEl.scrollLeft;
            } else {
              target.scrollTop = source.scrollTop;
            }
          }

          requestAnimationFrame(() => {
            isSyncing = false;
          });
        };
      };

      const onLeftScroll = handleScroll(leftEl, rightEl);
      const onRightScroll = handleScroll(rightEl, leftEl);

      leftEl.addEventListener('scroll', onLeftScroll, true);
      rightEl.addEventListener('scroll', onRightScroll, true);

      return () => {
        leftEl.removeEventListener('scroll', onLeftScroll, true);
        rightEl.removeEventListener('scroll', onRightScroll, true);
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [isCompareMode]);

  const [leftData, setLeftData] = useState<{
    trenPendapatan: TrenPendapatanItem[];
    exsumRevenue: ExsumRevenueItem[];
    exsumDoctorFee: ExsumDoctorFeeItem[];
    exsumMaterial: ExsumDoctorFeeItem[];
    exsumPnL: PnLItem[];
    closingInfo?: PnLClosingInfo;
  }>({ trenPendapatan: [], exsumRevenue: [], exsumDoctorFee: [], exsumMaterial: [], exsumPnL: [], closingInfo: {} });

  const [rightData, setRightData] = useState<{
    trenPendapatan: TrenPendapatanItem[];
    exsumRevenue: ExsumRevenueItem[];
    exsumDoctorFee: ExsumDoctorFeeItem[];
    exsumMaterial: ExsumDoctorFeeItem[];
    exsumPnL: PnLItem[];
    closingInfo?: PnLClosingInfo;
  }>({ trenPendapatan: [], exsumRevenue: [], exsumDoctorFee: [], exsumMaterial: [], exsumPnL: [], closingInfo: {} });

  const currentLeftId = leftHealthcareId;
  const currentRightId = rightHealthcareId;

  const fetchPeerData = useCallback(async (healthcareIdFilter: string, isLeft: boolean) => {
    const headers = {
      'x-connection': 'domo',
      'x-token': 'e2e6457d15727d578130f0fc7db54708',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json'
    };
    const payloadBase = healthcareIdFilter ? { HealthcareID: healthcareIdFilter } : {};

    try {
      const [res1, resExsum, resDoctor, resMaterial, resPnL, resClosing] = await Promise.all([
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'TrenPendapatan', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'exumrev', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'exumdoctor', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'exummaterial', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'pnl', ...payloadBase }) }),
        fetch('https://beam.jec.co.id/v1/alb/Dashboard', { method: 'POST', headers, body: JSON.stringify({ Mode: 'disclaimerPNL', ...payloadBase }) }),
      ]);

      const tren = res1.ok ? (await res1.json()).data || [] : [];
      const rev = resExsum.ok ? (await resExsum.json()).data || [] : [];
      const doc = resDoctor.ok ? (await resDoctor.json()).data || [] : [];
      const mat = resMaterial.ok ? (await resMaterial.json()).data || [] : [];
      const pnl = resPnL.ok ? (await resPnL.json()).data || [] : [];
      
      const closingJson = resClosing.ok ? await resClosing.json() : {};
      const closingArray = Array.isArray(closingJson.data) ? closingJson.data : (Array.isArray(closingJson) ? closingJson : []);
      
      const targetHcName = healthcareList.find(hc => hc.healthcareID === healthcareIdFilter)?.healthcareName;
      const matchedClosing = closingArray.find((item: any) => {
        const itemID = String(item.HealthcareID || item.healthcareid || item.HealthcareId || '').trim().replace(/^0+/, '');
        const filterID = String(healthcareIdFilter || '').trim().replace(/^0+/, '');
        const itemName = String(item.HealthcareName || item.healthcarename || item.Healthcarename || '').trim().toUpperCase();
        const targetName = String(targetHcName || '').trim().toUpperCase();

        if (filterID && itemID) return itemID === filterID;
        if (targetName && itemName) return itemName === targetName;
        return false;
      }) || closingArray[0];

      if (isLeft) {
        setLeftData({ trenPendapatan: tren, exsumRevenue: rev, exsumDoctorFee: doc, exsumMaterial: mat, exsumPnL: pnl, closingInfo: matchedClosing || {} });
      } else {
        setRightData({ trenPendapatan: tren, exsumRevenue: rev, exsumDoctorFee: doc, exsumMaterial: mat, exsumPnL: pnl, closingInfo: matchedClosing || {} });
      }
    } catch (e) {}
  }, [healthcareList]);

  useEffect(() => {
    fetchPeerData(currentLeftId, true);
    if (isCompareMode) {
      fetchPeerData(currentRightId, false);
    }
  }, [currentLeftId, currentRightId, isCompareMode, fetchPeerData]);

  const handlePrimaryHealthcareSelect = useCallback((id: string) => {
    setLeftHealthcareId(id);
    onHealthcareChange?.(id);
  }, [onHealthcareChange]);

  const handleToggleCompare = () => {
    const nextMode = !isCompareMode;
    SciFiAudio.playBeep(nextMode ? 600 : 400, 'square', 0.1, 0.05);
    setIsCompareMode(nextMode);
    
    if (nextMode) {
      if (!leftHealthcareId) setLeftHealthcareId(selectedHealthcareId);
      if (!rightHealthcareId && healthcareList.length > 1) {
        const defaultRight = healthcareList.find(hc => hc.healthcareID !== selectedHealthcareId)?.healthcareID || healthcareList[1].healthcareID;
        setRightHealthcareId(defaultRight);
      }
    }
  };

  function switchLayoutWithFade(graphs: number[]) {
    SciFiAudio.playWhoosh();
    setIsScanning(true);
    setTimeout(() => {
      setActiveGraphs(graphs);
      setIsScanning(false);
    }, 450);
  }  

  useVoiceCommandCompanyPerformance({
    healthcareList,
    selectedHealthcareId,
    isCompareMode,
    setIsCompareMode,
    setPanel1Mode,
    activeGraphs,
    switchLayoutWithFade,
    setLeftHealthcareId,
    setRightHealthcareId,
    leftHealthcareId,
    SciFiAudio
  });  
  const getHealthcareName = (id: string) => {
    if (!id || id === '') return 'ALL HEALTHCARE NODES';
    return healthcareList.find(hc => hc.healthcareID === id)?.healthcareName || id;
  };

  return (
    <div className="company-theme-root company-performance-shell relative flex-1 min-w-0 min-h-0 flex flex-col h-full bg-[#000511]/40 rounded-xl p-2 overflow-hidden">
      
      {/* HEADER CONTROL BAR */}
      <div className="company-page-header company-control-bar relative z-[200] mb-2 flex flex-shrink-0 flex-col gap-2 overflow-visible rounded-xl border border-[#00f2fe]/40 px-3 py-3 backdrop-blur-md sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-2.5">
        <div className="company-page-title-row flex min-w-0 items-center space-x-3">
          <div className="relative flex h-3 w-3 flex-shrink-0 items-center justify-center">
            <span className="company-page-status-dot absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
            <span className="company-page-status-dot relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </div>
          <span className="company-page-title company-title min-w-0 text-lg font-extrabold uppercase tracking-[0.16em] sm:text-xl sm:tracking-widest">COMPANY PERFORMANCE</span>
        </div>

        <button
          type="button"
          className="company-mobile-filter-toggle"
          onClick={() => setIsMobileFiltersOpen((open) => !open)}
          aria-expanded={isMobileFiltersOpen}
          aria-controls="company-mobile-filters"
        >
          <span>{isMobileFiltersOpen ? 'HIDE FILTER' : 'SHOW FILTER'}</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${isMobileFiltersOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div
          id="company-mobile-filters"
          className={`company-page-controls ${isMobileFiltersOpen ? 'company-page-controls--mobile-open' : ''} flex min-w-0 flex-wrap items-center justify-end gap-2 lg:gap-3`}
        >
          {isCompareMode && (
            <div className="company-control-surface flex items-center gap-1 bg-[#001428]/60 p-0.5 rounded border border-[#00f2fe]/20">
              <button
                onClick={() => {
                  const nextSync = !isScrollSynced;
                  setIsScrollSynced(nextSync);
                  SciFiAudio.playBeep(nextSync ? 700 : 300, 'sine', 0.08, 0.05);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase rounded transition-all cursor-pointer ${
                  isScrollSynced
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-400/40 animate-pulse'
                }`}
                title={isScrollSynced ? "Klik untuk lepas lock & align manual" : "Klik untuk kunci sinkronisasi scroll"}
              >
                {isScrollSynced ? (
                  <>
                    <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <span>SYNC LOCKED</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 text-rose-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <span>MANUAL ALIGN</span>
                  </>
                )}
              </button>

              {!isScrollSynced && (
                <button
                  onClick={() => {
                    if (leftScrollRef.current && rightScrollRef.current) {
                      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
                      rightScrollRef.current.scrollLeft = leftScrollRef.current.scrollLeft;
                    }
                    setIsScrollSynced(true);
                    SciFiAudio.playBeep(800, 'triangle', 0.1, 0.05);
                  }}
                  className="px-2 py-1 text-[9px] font-bold text-cyan-400/80 hover:text-cyan-200 hover:bg-cyan-500/20 rounded transition-all cursor-pointer uppercase"
                  title="Reset alignment ke posisi 1:1"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {isCompareMode && <span className="company-compare-side-label text-[10px] font-bold uppercase">Kiri:</span>}

            <div
              data-tour="healthcare-selector"
              className="company-healthcare-filter-wrap relative z-[260] min-w-0"
            >
              <DailyFilterHealthcare
                healthcareList={healthcareList}
                selectedId={currentLeftId}
                onSelect={handlePrimaryHealthcareSelect}
              />
            </div>

            <button
              type="button"
              onClick={() => { void onHealthcareRefresh?.(); }}
              disabled={!onHealthcareRefresh || healthcareLoading}
              className="company-healthcare-refresh company-icon-button flex h-[30px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#00f2fe]/30 bg-[#001428]/60 text-cyan-300 transition-all hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-45"
              title={healthcareError ? `Refresh healthcare — ${healthcareError}` : 'Refresh healthcare dari BEAM'}
              aria-label="Refresh healthcare"
            >
              <svg
                className={`h-3.5 w-3.5 ${healthcareLoading ? 'animate-spin' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 6v5h-5M4 18v-5h5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.1 9A7 7 0 0118 6.4L20 11M4 13l2 4.6A7 7 0 0017.9 15" />
              </svg>
            </button>

            {healthcareError && !healthcareLoading && (
              <span
                className="company-healthcare-error flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-black"
                title={healthcareError}
                aria-label="Healthcare load failed"
              >
                !
              </span>
            )}
          </div>

          {isCompareMode && (
            <div className="flex items-center gap-1.5 animate-glitch-in">
              <span className="company-compare-side-label text-[10px] font-bold uppercase">Kanan:</span>
              <div className="company-healthcare-filter-wrap relative z-[260] min-w-0">
                <DailyFilterHealthcare
                  healthcareList={healthcareList}
                  selectedId={rightHealthcareId}
                  onSelect={(id) => setRightHealthcareId(id)}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleToggleCompare}
            className={`company-compare-toggle ${isCompareMode ? 'company-compare-toggle--active' : 'company-compare-toggle--idle'} flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded border transition-all cursor-pointer ${
              isCompareMode 
                ? 'bg-amber-950/40 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]' 
                : 'bg-cyan-950/30 border-cyan-500 text-cyan-400 hover:bg-cyan-900/50'
            }`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* DASHBOARD VIEWS (SINGLE / COMPARE) */}
      <div className="flex-1 flex gap-3 h-full min-h-0 min-w-0 overflow-hidden">
        
        {/* VIEW KIRI */}
        <div className="company-view-shell flex-1 h-full min-w-0 flex flex-col border border-[#00f2fe]/20 rounded-lg p-2 bg-[#000a1a]/40 shadow-inner overflow-hidden">
          <HealthcareDashboardView 
            healthcareId={currentLeftId} 
            titleName={getHealthcareName(currentLeftId)}
            activeGraphs={activeGraphs}
            setActiveGraphs={setActiveGraphs}
            panel1Mode={panel1Mode}
            setPanel1Mode={setPanel1Mode}
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            isCompareMode={isCompareMode}
            isLeftSide={true}
            containerRef={leftScrollRef}
            peerData={rightData}
          />
        </div>

        {/* VIEW KANAN (JIKA MODE KOMPARASI) */}
        {isCompareMode && (
          <div className="company-view-shell company-view-shell--compare flex-1 h-full min-w-0 flex flex-col border border-amber-500/30 rounded-lg p-2 bg-[#1a0f00]/40 shadow-inner animate-glitch-in overflow-hidden">
            <HealthcareDashboardView 
              healthcareId={currentRightId} 
              titleName={getHealthcareName(rightHealthcareId)}
              activeGraphs={activeGraphs}
              setActiveGraphs={setActiveGraphs}
              panel1Mode={panel1Mode}
              setPanel1Mode={setPanel1Mode}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              isCompareMode={isCompareMode}
              isLeftSide={false}
              containerRef={rightScrollRef}
              peerData={leftData}
            />
          </div>
        )}
      </div>

    </div>
  );
}