import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

import LoginPortal from './LoginPortal';
import DashboardManager from './components/DashboardManager';
import { useVoiceCommand } from './hooks/useVoiceCommand';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import ThemeSwitcher from './components/ThemeSwitcher';

// Core Analytics brand asset (project-root /img folder)
import dashboardLogo from '../img/logohorizontal.png';
import dashboardJustLogo from '../img/logo.png';

// Import Menu Dashboards
import CompanyPerformance from './dashboards/financial/companyPerformance';
import DailyTracking from './dashboards/financial/DailyTracking';
import WidgetRevenuePage from './dashboards/WidgetRevenuePage';
import IOLUsage from './components/IOLUsage';
import UserManagement from './management/UserManagement';
import GroupManagement from './management/GroupManagement';

interface HealthcareItem {
  healthcareID: string;
  healthcareName: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon?: 'financial' | 'performance' | 'tracking' | 'iol' | 'widget' | 'management' | 'user';
  children?: MenuItem[];
}

// =========================================================
// MANAGEMENT CENTER VIEWS
// =========================================================

function UserManagementView() {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <UserManagement />
    </div>
  );
}

function GroupManagementView() {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <GroupManagement />
    </div>
  );
}

// =========================================================
// DASHBOARD REGISTRY
// =========================================================

const DASHBOARD_COMPONENTS: Record<
  string,
  React.ComponentType<{
    selectedHealthcareId: string;
    healthcareList: HealthcareItem[];
  }>
> = {
  company_performance: CompanyPerformance,
  daily_tracking: DailyTracking,
  widget_revenue: WidgetRevenuePage,
  iol_usage: IOLUsage,
  user_management: UserManagementView,
  group_management: GroupManagementView,
};

// =========================================================
// NAVIGATION
// =========================================================

const HARDCODED_MENU: MenuItem[] = [
  {
    id: 'financial',
    label: 'Financial',
    icon: 'financial',
    children: [
      {
        id: 'company_performance',
        label: 'Company Performance',
        icon: 'performance',
      },
      {
        id: 'daily_tracking',
        label: 'Daily Tracking',
        icon: 'tracking',
      },
      {
        id: 'iol_usage',
        label: 'IOL Usage',
        icon: 'iol',
      },
      // Widget Revenue tetap terdaftar di DASHBOARD_COMPONENTS untuk kebutuhan
      // iframe/autologin, tetapi disembunyikan dari sidebar utama.
    ],
  },
];

function FuturisticMenuIcon({
  type,
  active = false,
}: {
  type?: MenuItem['icon'];
  active?: boolean;
}) {
  const common = `h-[18px] w-[18px] flex-shrink-0 transition-all duration-300 ${
    active
      ? 'text-cyan-100 drop-shadow-[0_0_7px_rgba(56,189,248,.9)]'
      : 'text-sky-400/75 group-hover:text-cyan-200'
  }`;

  if (type === 'financial') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55">
        <path d="M4 19V10M10 19V5M16 19v-7M22 19V8" />
        <path d="M2.5 19.5h20M4 7.5l6-4 6 6 5-4" opacity=".75" />
        <circle cx="10" cy="3.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (type === 'performance') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55">
        <path d="M3 18.5h18M4.5 16l4-4 3 2 7-8" />
        <path d="M16 6h3v3" />
        <circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (type === 'tracking') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3.5" opacity=".65" />
        <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
        <path d="M12 12l4.2-2.5" />
      </svg>
    );
  }

  if (type === 'iol') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45">
        <ellipse cx="12" cy="12" rx="5.5" ry="8" />
        <circle cx="12" cy="12" r="2.7" />
        <path d="M6.7 8.8C4.2 7.8 3 5.9 3.2 3.8M17.3 15.2c2.5 1 3.7 2.9 3.5 5" opacity=".8" />
        <path d="M17.3 8.8c2.5-1 3.7-2.9 3.5-5M6.7 15.2c-2.5 1-3.7 2.9-3.5 5" opacity=".45" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (type === 'management') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3.5" y="4" width="17" height="16" rx="3" />
        <path d="M8 9h8M8 13h8M8 17h5" />
        <circle cx="18" cy="17" r="2.2" />
        <path d="M18 13.8v1.1M18 19.1v1.1M14.8 17h1.1M20.1 17h1.1" opacity=".8" />
      </svg>
    );
  }

  if (type === 'user') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 20c.6-4 2.9-6.2 6.5-6.2s5.9 2.2 6.5 6.2" />
        <path d="M18.5 7.5v4M16.5 9.5h4" opacity=".8" />
      </svg>
    );
  }

  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 13h5M8 17h8" />
    </svg>
  );
}

// =========================================================
// SCI-FI AUDIO
// =========================================================

class SciFiAudio {
  private static ctx: AudioContext | null = null;

  private static getContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  static playBeep(
    frequency = 800,
    type: OscillatorType = 'sine',
    duration = 0.08,
    vol = 0.05
  ) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration
      );

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }
}

// =========================================================
// SPACE BACKGROUND
// Same visual language as Login Portal, slightly calmer.
// =========================================================

function CyberTunnelBackground() {
  const { theme, isLight } = useTheme();
  const pointsRef = useRef<THREE.Points>(null!);

  const [sphere] = useState(() => {
    const data = new Float32Array(1500 * 3);

    for (let i = 0; i < 1500; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 3 + Math.random() * 7;

      data[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      data[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      data[i * 3 + 2] = r * Math.cos(phi);
    }

    return data;
  });

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.z -= delta * 0.12;
    }
  });

  return (
    <>
      <color attach="background" args={[theme.three.background]} />
      <fog attach="fog" args={[theme.three.fog, 2, 16]} />
      <ambientLight intensity={theme.three.ambientIntensity} />

      <Points
        ref={pointsRef}
        positions={sphere}
        stride={3}
        frustumCulled={false}
      >
        <PointMaterial
          transparent
          color={theme.three.star}
          size={isLight ? 0.027 : 0.032}
          sizeAttenuation
          depthWrite={false}
          opacity={isLight ? 0.36 : 0.72}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </>
  );
}

// =========================================================
// APP
// =========================================================

function AppContent() {
  const { themeId, isLight, isAurora } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedHealthcareId, setSelectedHealthcareId] =
    useState<string>('');

  // Navigation
  const [activeMenuId, setActiveMenuId] = useState<string>(
    'company_performance'
  );
  const [expandedGroups, setExpandedGroups] = useState<
    Record<string, boolean>
  >({ financial: true });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  // Mobile: sidebar starts as a floating drawer and does not consume content width.
  // Desktop: sidebar starts pinned to preserve the familiar layout.
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-login for iframe / widget mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.split('?')[1] || ''
    );

    if (
      params.get('autologin') === 'true' ||
      hashParams.get('autologin') === 'true'
    ) {
      setIsLoggedIn(true);
      setActiveMenuId('widget_revenue');
    }
  }, []);

  // Dashboard Manager
  const [showManager, setShowManager] = useState(false);

  // Management / settings dropdown in the global header.
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(event.target as Node)
      ) {
        setShowSettingsMenu(false);
      }
    };

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handlePointerDown);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showSettingsMenu]);

  const openUserManagement = useCallback(() => {
    SciFiAudio.playBeep(760, 'sine', 0.06, 0.035);
    setShowManager(false);
    setActiveMenuId('user_management');
    setShowSettingsMenu(false);
    if (!isSidebarPinned) setIsSidebarExpanded(false);
  }, [isSidebarPinned]);

  const openGroupManagement = useCallback(() => {
    SciFiAudio.playBeep(790, 'sine', 0.06, 0.035);
    setShowManager(false);
    setActiveMenuId('group_management');
    setShowSettingsMenu(false);
    if (!isSidebarPinned) setIsSidebarExpanded(false);
  }, [isSidebarPinned]);

  const openDashboardDesigner = useCallback(() => {
    SciFiAudio.playBeep(850, 'sine', 0.08, 0.04);
    setShowSettingsMenu(false);
    setShowManager(true);
  }, []);

  const [dashboardItems, setDashboardItems] = useState<any[]>(() => {
    const saved = localStorage.getItem('coa_dashboard_layout');

    return saved
      ? JSON.parse(saved)
      : [
          {
            id: '1',
            title: 'Tren Pendapatan',
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            content: 'Grafik 1',
          },
          {
            id: '2',
            title: 'Exsum Revenue',
            x: 6,
            y: 0,
            w: 6,
            h: 4,
            content: 'Grafik 2',
          },
          {
            id: '3',
            title: 'Exsum Material',
            x: 0,
            y: 4,
            w: 6,
            h: 4,
            content: 'Grafik 3',
          },
          {
            id: '4',
            title: 'Exsum Doctor Fee',
            x: 6,
            y: 4,
            w: 6,
            h: 4,
            content: 'Grafik 4',
          },
        ];
  });

  useEffect(() => {
    localStorage.setItem(
      'coa_dashboard_layout',
      JSON.stringify(dashboardItems)
    );
  }, [dashboardItems]);

  const [healthcareList, setHealthcareList] = useState<HealthcareItem[]>([]);

  // Global Voice Command
  const { isListening, toggleListening } = useVoiceCommand({
    onStatusChange: () => {},
  });

  // Voice commands for Sidebar
  useEffect(() => {
    const handleGlobalVoiceCommand = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const transcript = customEvent.detail?.toLowerCase() || '';

      if (
        transcript.includes('tutup sidebar') ||
        transcript.includes('sembunyikan sidebar') ||
        transcript.includes('tutup menu') ||
        transcript.includes('close sidebar') ||
        transcript.includes('minimize sidebar')
      ) {
        setIsSidebarExpanded(false);
        SciFiAudio.playBeep(700, 'sine', 0.05, 0.03);
      } else if (
        transcript.includes('buka sidebar') ||
        transcript.includes('tampilkan sidebar') ||
        transcript.includes('buka menu') ||
        transcript.includes('open sidebar') ||
        transcript.includes('maximize sidebar')
      ) {
        setIsSidebarExpanded(true);
        SciFiAudio.playBeep(700, 'sine', 0.05, 0.03);
      }
    };

    window.addEventListener(
      'coa-voice-command',
      handleGlobalVoiceCommand as EventListener
    );

    return () => {
      window.removeEventListener(
        'coa-voice-command',
        handleGlobalVoiceCommand as EventListener
      );
    };
  }, []);

  useEffect(() => {
    if (isMobileView && !isSidebarPinned) {
      setIsSidebarExpanded(false);
    }
  }, [isMobileView, isSidebarPinned]);

  const handleResetToLogin = useCallback(() => {
    SciFiAudio.playBeep(400, 'sawtooth', 0.15, 0.05);
    setIsLoggedIn(false);
  }, []);

  // Healthcare master
  useEffect(() => {
    const fetchHealthcareMaster = async () => {
      try {
        const res = await fetch('https://beam.jec.co.id/v1/alb/Dashboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-connection': 'domo',
            'x-token': 'e2e6457d15727d578130f0fc7db54708',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify({ Mode: 'healthcare' }),
        });

        if (res.ok) {
          const json = await res.json();
          const rawData = json.data || [];

          if (Array.isArray(rawData)) {
            const formattedData: HealthcareItem[] = rawData.map(
              (item: any) => ({
                healthcareID: item.healthcareID,
                healthcareName: item.healthcareName,
              })
            );

            setHealthcareList(formattedData);
          }
        }
      } catch (error) {
        console.error('Gagal mengambil data healthcare:', error);
      }
    };

    fetchHealthcareMaster();
  }, []);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // =======================================================
  // LOGIN
  // =======================================================

  if (!isLoggedIn) {
    return (
      <LoginPortal
        onLoginSuccess={(hcId) => {
          setSelectedHealthcareId(hcId || '');
          setActiveMenuId('company_performance');
          setIsLoggedIn(true);
        }}
      />
    );
  }

  // =======================================================
  // DASHBOARD MANAGER
  // =======================================================

  if (showManager) {
    return (
      <div
        data-active-theme={themeId}
        className="fixed inset-0 z-[999] flex h-screen w-screen flex-col overflow-y-auto p-4 font-mono select-none md:p-6"
        style={{ background: 'var(--core-bg)', color: 'var(--core-text)' }}
      >
        <div
          className="mb-4 flex items-center justify-between rounded-xl border px-4 py-3 backdrop-blur-md"
          style={{
            borderColor: 'var(--core-border)',
            background: 'var(--core-panel)',
          }}
        >
          <button
            onClick={() => setShowManager(false)}
            className="cursor-pointer rounded-lg border border-indigo-400/40 bg-indigo-950/35 px-4 py-2 text-xs font-bold text-indigo-200 shadow-[0_0_14px_rgba(99,102,241,.12)] transition-all hover:bg-indigo-900/45"
          >
            ← Back to Main Dashboard
          </button>

          <span className="text-xs tracking-widest text-indigo-300 uppercase">
            🛠️ DESIGNER / DASHBOARD MANAGER MODE
          </span>
        </div>

        <div className="w-full flex-1">
          <DashboardManager
            dashboardItems={dashboardItems}
            setDashboardItems={setDashboardItems}
            onLaunchPresentation={() => setShowManager(false)}
          />
        </div>
      </div>
    );
  }

  const ActiveDashboardComponent = DASHBOARD_COMPONENTS[activeMenuId];

  // =======================================================
  // MAIN DASHBOARD
  // =======================================================

  return (
    <>
      <style>{`
        .text-hud-glow {
          text-shadow:
            0 0 8px rgba(59,188,255,.50),
            0 0 18px rgba(37,99,235,.24);
        }

        .text-white-glow {
          text-shadow: 0 0 8px rgba(255,255,255,.55);
        }

        @keyframes holoGlitchIn {
          0% {
            opacity: 0;
            transform: scale(.99);
            filter: blur(4px);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }

        @keyframes holoGlitchOut {
          0% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
          100% {
            opacity: 0;
            transform: scale(1.01);
            filter: blur(4px);
          }
        }

        .animate-glitch-in {
          animation: holoGlitchIn .25s cubic-bezier(.25,.46,.45,.94) forwards;
        }

        .animate-glitch-out {
          animation: holoGlitchOut .2s cubic-bezier(.55,.085,.68,.53) forwards;
        }

        .grid-panel-container > div > div {
          background-color: var(--core-surface) !important;
          backdrop-filter: blur(3px) !important;
          -webkit-backdrop-filter: blur(3px) !important;
          transition:
            background-color .32s ease,
            border-color .32s ease,
            color .32s ease;
        }

        [data-theme="aurora"] .text-hud-glow {
          text-shadow:
            0 0 7px rgba(2,132,199,.20),
            0 0 14px rgba(14,116,144,.10);
        }

        /*
          FULLSCREEN STACKING GUARD
          DailyTracking fullscreen is rendered inside the dashboard
          content. When that layer exists, the dashboard content must
          move above the global header/settings so the close button
          always stays clickable.
        */
        .core-dashboard-frame:has(.daily-tracking-fullscreen) > .core-global-header {
          z-index: 1 !important;
          opacity: 0 !important;
          pointer-events: none !important;
          transform: translateY(-6px);
        }

        .core-dashboard-frame:has(.daily-tracking-fullscreen) > .core-dashboard-content {
          z-index: 250 !important;
        }

        .core-dashboard-frame:has(.daily-tracking-fullscreen) .core-settings-layer {
          z-index: 0 !important;
          pointer-events: none !important;
        }

        .core-dashboard-frame .daily-tracking-fullscreen {
          z-index: 9999 !important;
        }

        .core-global-header {
          transition:
            opacity .18s ease,
            transform .18s ease;
        }
      `}</style>

      <div
        data-active-theme={themeId}
        className="fixed inset-0 z-50 m-0 flex h-screen w-screen flex-col overflow-hidden p-1.5 font-mono select-none md:p-2"
        style={{
          background: 'var(--core-bg)',
          color: 'var(--core-primary)',
        }}
      >
        {/* SPACE BACKGROUND */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 1, 5], fov: 50 }}>
            <CyberTunnelBackground />
          </Canvas>
        </div>

        {/* SOFT BLUE NEBULA */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background: isAurora
              ? 'radial-gradient(ellipse at 78% 19%, rgba(139,92,246,.10) 0%, transparent 43%), radial-gradient(ellipse at 20% 72%, rgba(45,212,191,.09) 0%, transparent 38%)'
              : 'radial-gradient(ellipse at 80% 25%, rgba(0,140,255,.10) 0%, rgba(20,60,160,.035) 25%, transparent 48%), radial-gradient(ellipse at 20% 75%, rgba(0,115,255,.055) 0%, transparent 36%)',
          }}
        />

        {/* MOVING AURORA FIELD
            Only rendered for the Aurora theme so Cosmic Black remains unchanged. */}
        {isAurora && (
          <div className="core-aurora-field" aria-hidden="true">
            <div className="core-aurora-ribbon core-aurora-ribbon--cyan" />
            <div className="core-aurora-ribbon core-aurora-ribbon--violet" />
            <div className="core-aurora-ribbon core-aurora-ribbon--teal" />
            <div className="core-aurora-stars" />
          </div>
        )}

        {/* MAIN FRAME */}
        <div
          className="core-dashboard-frame relative z-10 flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-xl border p-2 backdrop-blur-[3px] md:p-3"
          style={{
            borderColor: 'var(--core-border)',
            background: 'var(--core-surface)',
            boxShadow: 'var(--core-frame-shadow)',
          }}
        >
          {/* =================================================
              GLOBAL CORE ANALYTICS HEADER
              Compact branding: no tall empty logo area.
          ================================================= */}
          <header
            className="core-global-header relative z-[60] mb-2 flex h-[58px] flex-shrink-0 items-center justify-between overflow-visible rounded-lg border px-2.5 backdrop-blur-md sm:h-[62px] sm:px-3 md:h-[66px] md:px-4"
            style={{
              borderColor: 'var(--core-border)',
              background: isAurora
                ? 'linear-gradient(105deg, rgba(14,43,55,.94), rgba(24,70,83,.90), rgba(25,56,76,.92))'
                : 'var(--core-surface-strong)',
            }}
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 md:gap-4">
              {/* Global navigation trigger: sits beside the logo and never consumes dashboard width. */}
              <button
                type="button"
                onClick={() => {
                  SciFiAudio.playBeep(700, 'sine', 0.05, 0.03);
                  setIsSidebarExpanded((prev) => !prev);
                }}
                title={isSidebarExpanded ? 'Close navigation' : 'Open navigation'}
                aria-label={isSidebarExpanded ? 'Close navigation' : 'Open navigation'}
                className={`group relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border backdrop-blur-md transition-all sm:h-11 sm:w-11 ${
                  isSidebarExpanded
                    ? 'border-cyan-300/55 bg-cyan-500/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,.15)]'
                    : 'border-sky-500/25 bg-[#04111f]/70 text-sky-300 hover:border-cyan-300/50 hover:text-cyan-100'
                }`}
              >
                <span className="absolute inset-[4px] rounded-md border border-sky-400/10" />
                <svg
                  className="relative z-10 h-[21px] w-[21px] sm:h-[23px] sm:w-[23px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M4 7h16" strokeLinecap="round" />
                  <path d="M4 12h16" strokeLinecap="round" />
                  <path d="M4 17h16" strokeLinecap="round" />
                </svg>
                <span className="absolute -bottom-px left-1/2 h-px w-5 -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
              </button>

              <img
                src={dashboardLogo}
                alt="Core Analytics"
                draggable={false}
                className="relative z-10 h-[42px] w-[175px] max-w-[58vw] object-contain object-left brightness-110 saturate-110 drop-shadow-[0_0_11px_rgba(56,189,248,.48)] sm:h-[48px] sm:w-[220px] md:h-[54px] md:w-[270px] lg:w-[300px]"
              />
            </div>

            <div ref={settingsMenuRef} className="core-settings-layer relative z-[70] flex items-center gap-2 overflow-visible">
              <div className="hidden items-center gap-2 md:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span className="text-[7px] font-bold tracking-[0.20em] text-emerald-300/75 uppercase">
                  CORE ONLINE
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  SciFiAudio.playBeep(720, 'sine', 0.05, 0.025);
                  setShowSettingsMenu((prev) => !prev);
                }}
                title="Management Center"
                aria-label="Open Management Center"
                aria-expanded={showSettingsMenu}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-lg border backdrop-blur-md transition-all sm:h-11 sm:w-11 ${
                  showSettingsMenu || activeMenuId === 'user_management' || activeMenuId === 'group_management'
                    ? 'border-cyan-300/55 bg-cyan-500/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,.16)]'
                    : 'border-sky-500/25 bg-[#04111f]/70 text-sky-300 hover:border-cyan-300/50 hover:text-cyan-100'
                }`}
              >
                <span className="absolute inset-[4px] rounded-md border border-sky-400/10" />
                <svg
                  className={`relative z-10 h-[20px] w-[20px] transition-transform duration-300 ${
                    showSettingsMenu ? 'rotate-45' : 'group-hover:rotate-12'
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.65"
                >
                  <circle cx="12" cy="12" r="3.1" />
                  <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.55V20.3h-3v-.1a1.7 1.7 0 00-1.03-1.55 1.7 1.7 0 00-1.87.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 007.04 15a1.7 1.7 0 00-1.55-1.03H5.4v-3h.09A1.7 1.7 0 007.04 10a1.7 1.7 0 00-.34-1.87l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 001.87.34A1.7 1.7 0 0011.72 4.8v-.1h3v.1a1.7 1.7 0 001.03 1.55 1.7 1.7 0 001.87-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0019.4 10a1.7 1.7 0 001.55 1.03h.09v3h-.09A1.7 1.7 0 0019.4 15z" />
                </svg>
              </button>

              {showSettingsMenu && (
                <div
                  className="absolute right-0 top-[calc(100%+10px)] z-[9999] w-[270px] overflow-hidden rounded-xl border p-2 backdrop-blur-xl"
                  style={{
                    borderColor: 'var(--core-border)',
                    background: 'var(--core-surface-strong)',
                    boxShadow: isAurora
                      ? '0 20px 60px rgba(0,0,0,.36), 0 0 30px rgba(45,212,191,.10)'
                      : '0 18px 60px rgba(0,0,0,.72), 0 0 34px rgba(0,183,255,.18)',
                  }}
                >
                  <div className="mb-2 rounded-lg border border-sky-500/15 bg-[#061426]/55 px-3 py-2.5">
                    <div className="text-[9px] font-black tracking-[0.20em] text-cyan-100 uppercase">
                      Management Center
                    </div>
                    <div className="mt-1 text-[7px] tracking-[0.14em] text-slate-500 uppercase">
                      Administration & system tools
                    </div>
                  </div>

                  <div
                    className="mb-2 rounded-lg border p-2.5"
                    style={{
                      borderColor: 'var(--core-border)',
                      background: 'var(--core-panel)',
                    }}
                  >
                    <div
                      className="mb-2 text-[7px] font-black uppercase tracking-[0.18em]"
                      style={{ color: 'var(--core-text-secondary)' }}
                    >
                      Appearance
                    </div>
                    <ThemeSwitcher />
                  </div>

                  <button
                    type="button"
                    onClick={openUserManagement}
                    className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                      activeMenuId === 'user_management'
                        ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-50'
                        : 'border-transparent text-sky-200/80 hover:border-sky-400/20 hover:bg-[#071b31]/70 hover:text-cyan-50'
                    }`}
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-950/25 text-cyan-300">
                      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <circle cx="10" cy="8" r="3" />
                        <path d="M4 19c.55-3.55 2.6-5.5 6-5.5 2.3 0 4.05.9 5.05 2.6" />
                        <path d="M18 13v6M15 16h6" />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold tracking-[0.06em]">
                        User Management
                      </span>
                      <span className="mt-0.5 block text-[7px] tracking-[0.05em] text-slate-500">
                        Account & voice identity enrollment
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={openGroupManagement}
                    className={`group mt-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                      activeMenuId === 'group_management'
                        ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-50'
                        : 'border-transparent text-sky-200/80 hover:border-sky-400/20 hover:bg-[#071b31]/70 hover:text-cyan-50'
                    }`}
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-950/25 text-cyan-300">
                      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <circle cx="8" cy="9" r="2.7" />
                        <circle cx="16.5" cy="10" r="2.3" />
                        <path d="M3 19c.5-3.3 2.3-5 5-5s4.5 1.7 5 5" />
                        <path d="M13.2 15c3.6-.7 6.2 1 6.8 4" opacity=".85" />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold tracking-[0.06em]">
                        Group Management
                      </span>
                      <span className="mt-0.5 block text-[7px] tracking-[0.05em] text-slate-500">
                        Access groups & permission foundation
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={openDashboardDesigner}
                    className="group mt-1 flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-indigo-200/80 transition-all hover:border-indigo-400/20 hover:bg-indigo-950/30 hover:text-indigo-100"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-indigo-400/20 bg-indigo-950/30 text-indigo-300">
                      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M14.7 6.3a4 4 0 01-5 5L4 17v3h3l5.7-5.7a4 4 0 005-5l-2.2 2.2-3-3 2.2-2.2z" />
                        <path d="M16 16l4 4" opacity=".7" />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold tracking-[0.06em]">
                        Dashboard Designer
                      </span>
                      <span className="mt-0.5 block text-[7px] tracking-[0.05em] text-slate-500">
                        Layout & presentation tools
                      </span>
                    </span>
                  </button>

                  <div className="mt-2 flex items-center justify-between border-t border-sky-500/10 px-2 pt-2">
                    <span className="text-[7px] tracking-[0.14em] text-slate-600 uppercase">
                      CoreAnalytics
                    </span>
                    <span className="flex items-center gap-1.5 text-[7px] font-bold tracking-[0.14em] text-emerald-300/70 uppercase">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_#34d399]" />
                      Online
                    </span>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* CONTENT AREA */}
          <div className="core-dashboard-content pointer-events-auto relative z-30 flex min-h-0 min-w-0 w-full flex-1 gap-2.5 overflow-hidden">
            {/* =================================================
                FLOATING / PINNABLE NAVIGATION
                - Unpinned: overlays dashboard; content width never changes.
                - Pinned: participates in the flex layout and can be collapsed.
            ================================================= */}
            {isSidebarExpanded && !isSidebarPinned && (
              <button
                type="button"
                aria-label="Close navigation overlay"
                onClick={() => setIsSidebarExpanded(false)}
                className="absolute inset-0 z-30 cursor-default backdrop-blur-[1px]"
                style={{
                  background: isAurora
                    ? 'rgba(5,24,33,.42)'
                    : 'rgba(1,6,17,.35)',
                }}
              />
            )}

            <aside
              className={`z-40 flex flex-col justify-between overflow-hidden rounded-xl border p-2 backdrop-blur-xl transition-all duration-300 ease-out ${
                isSidebarPinned
                  ? `relative flex-shrink-0 ${isSidebarExpanded ? 'w-56' : 'w-[58px]'}`
                  : `absolute bottom-0 left-0 top-0 w-[min(82vw,280px)] ${
                      isSidebarExpanded
                        ? 'pointer-events-auto translate-x-0 opacity-100'
                        : 'pointer-events-none -translate-x-[calc(100%+14px)] opacity-0'
                    }`
              }`}
              style={{
                borderColor: 'var(--core-border)',
                background: 'var(--core-sidebar)',
                boxShadow: '0 0 34px var(--core-glow)',
              }}
            >
              <div className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto">
                {/* Drawer HUD header */}
                <div className={`flex items-center rounded-lg border border-sky-500/20 bg-[#061426]/55 p-1.5 ${
                  isSidebarExpanded ? 'justify-between' : 'justify-center'
                }`}>
                  {isSidebarExpanded && (
                    <div className="min-w-0 pl-1">
                      <div className="text-[8px] font-black tracking-[0.20em] text-cyan-100 uppercase">
                        Navigation
                      </div>
                      <div className="mt-0.5 text-[6px] tracking-[0.17em] text-slate-600 uppercase">
                        Core command rail
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {/* PIN / UNPIN */}
                    <button
                      type="button"
                      onClick={() => {
                        SciFiAudio.playBeep(760, 'sine', 0.05, 0.03);
                        setIsSidebarPinned((prev) => !prev);
                        setIsSidebarExpanded(true);
                      }}
                      title={isSidebarPinned ? 'Unpin navigation' : 'Pin navigation'}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border transition-all ${
                        isSidebarPinned
                          ? 'border-amber-300/45 bg-amber-950/25 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,.08)]'
                          : 'border-sky-400/25 bg-sky-950/20 text-sky-300 hover:border-cyan-300/55 hover:text-cyan-100'
                      }`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M9 3h6l-.8 5 3.3 3.2-1.2 1.2L13 11.2V21l-1 1-1-1v-9.8l-3.3 1.2-1.2-1.2L9.8 8 9 3z" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {isSidebarExpanded && !isSidebarPinned && (
                      <button
                        type="button"
                        onClick={() => setIsSidebarExpanded(false)}
                        title="Close navigation"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-sky-500/20 bg-[#020b16]/70 text-sky-400 transition-all hover:border-rose-300/35 hover:text-rose-300"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* MENU LIST */}
                <div className="mt-1 flex w-full flex-col gap-1">
                  {HARDCODED_MENU.map((group) => {
                    const isExpanded = expandedGroups[group.id];

                    return (
                      <div key={group.id} className="flex w-full flex-col">
                        <button
                          onClick={() => toggleGroup(group.id)}
                          title={group.label}
                          className="group flex w-full items-center justify-between rounded-lg border border-sky-500/15 bg-[#061426]/35 p-2 text-xs font-bold text-sky-300 transition-all hover:border-sky-400/30 hover:bg-[#08203b]/55"
                        >
                          <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-sky-400/10 bg-sky-950/20">
                              <FuturisticMenuIcon type={group.icon} />
                            </span>
                            {isSidebarExpanded && (
                              <span className="truncate tracking-[0.04em]">{group.label}</span>
                            )}
                          </div>

                          {isSidebarExpanded && (
                            <svg
                              className={`h-3.5 w-3.5 text-sky-400/55 transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                            >
                              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>

                        {isExpanded && group.children && (
                          <div className={`mt-1 flex flex-col gap-1 ${isSidebarExpanded ? 'pl-2' : 'pl-0'}`}>
                            {group.children.map((child) => {
                              const isActive = activeMenuId === child.id;

                              return (
                                <button
                                  key={child.id}
                                  title={child.label}
                                  onClick={() => {
                                    SciFiAudio.playBeep(800, 'sine', 0.05, 0.03);
                                    setActiveMenuId(child.id);
                                    if (!isSidebarPinned) setIsSidebarExpanded(false);
                                  }}
                                  className={`group flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-xs transition-all ${
                                    isActive
                                      ? 'border-cyan-300/40 bg-cyan-500/10 font-bold text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,.10)]'
                                      : 'border-transparent text-sky-400/70 hover:border-sky-500/15 hover:bg-[#071b31]/65 hover:text-sky-100'
                                  }`}
                                >
                                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border ${
                                    isActive
                                      ? 'border-cyan-300/25 bg-cyan-400/10'
                                      : 'border-sky-500/10 bg-[#03101e]/55'
                                  }`}>
                                    <FuturisticMenuIcon type={child.icon} active={isActive} />
                                  </span>
                                  {isSidebarExpanded && <span className="truncate">{child.label}</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SIDEBAR FOOTER */}
              <div className="mt-2 flex w-full flex-col gap-2 border-t border-sky-500/15 pt-2">
                <button
                  onClick={toggleListening}
                  title={isListening ? 'Voice Active' : 'Voice Muted'}
                  className={`flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border p-2 text-xs font-bold whitespace-nowrap backdrop-blur-[2px] transition-all ${
                    isListening
                      ? 'border-emerald-400/55 bg-emerald-950/25 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,.15)]'
                      : 'border-rose-400/35 bg-rose-950/18 text-rose-400/85 shadow-[0_0_8px_rgba(244,63,94,.08)]'
                  }`}
                >
                  {isListening ? (
                    <svg className="h-4 w-4 flex-shrink-0 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  )}
                  {isSidebarExpanded && (
                    <span className="text-[9px] tracking-wider uppercase">
                      {isListening ? 'VOICE ON' : 'VOICE OFF'}
                    </span>
                  )}
                </button>

                <button
                  onClick={handleResetToLogin}
                  title="Logout"
                  className="flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border border-rose-500/30 bg-rose-950/14 p-2 font-bold whitespace-nowrap text-rose-400/80 shadow-[0_0_8px_rgba(244,63,94,.06)] transition-all hover:bg-rose-500/15 hover:text-rose-200"
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  {isSidebarExpanded && (
                    <span className="text-[9px] tracking-wider uppercase">LOGOUT</span>
                  )}
                </button>
              </div>
            </aside>

            {/* DYNAMIC DASHBOARD */}
            <div className="relative z-10 min-h-0 min-w-0 flex-1 overflow-hidden transition-all duration-300">
              {ActiveDashboardComponent ? (
                <ActiveDashboardComponent
                  selectedHealthcareId={selectedHealthcareId}
                  healthcareList={healthcareList}
                />
              ) : (
                <div
                  className="flex h-full flex-1 items-center justify-center text-sm"
                  style={{ color: 'var(--core-text-secondary)' }}
                >
                  <span>Select a menu from the sidebar.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


// =========================================================
// THEME ROOT
// =========================================================

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
