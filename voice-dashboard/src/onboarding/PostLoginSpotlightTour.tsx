import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './PostLoginSpotlightTour.css';
import useSpotlightNarration from './useSpotlightNarration';
import useSpotlightLanguage, {
  SPOTLIGHT_LANGUAGE_OPTIONS,
  SPOTLIGHT_UI,
  type SpotlightLanguage,
} from './spotlightLanguage';

export type PostLoginTourStepId =
  | 'welcome'
  | 'navigation'
  | 'dashboard-switch'
  | 'healthcare'
  | 'maximize'
  | 'voice-activation'
  | 'voice-command'
  | 'theme'
  | 'account'
  | 'finish';

interface PostLoginTourStep {
  id: PostLoginTourStepId;
  eyebrow: string;
  title: string;
  description: string;
  target?: string;
  tip?: string;
  routeKey?: string;
}


const POST_COPY = {
  id: {
    welcome: { eyebrow:'COREANALYTICS · PANDUAN DASHBOARD', title:'Selamat datang di CoreAnalytics', description:'Sekarang Anda berada di workspace utama. Tour singkat ini memperkenalkan navigasi dashboard, Healthcare Selector, maximize dan restore panel, aktivasi voice command, Voice Commands, theme, serta My Account.', tip:'Spotlight setelah login disimpan per user. User lain tetap mendapatkan tour pertamanya sendiri.' },
    navigation: { eyebrow:'01 · NAVIGASI', title:'Navigasi Dashboard', description:'Gunakan navigation rail untuk berpindah antar dashboard yang memang diberikan kepada account Anda. Menu yang tidak memiliki permission tidak akan ditampilkan.', tip:'Navigation dapat di-pin, di-collapse, atau dibuka sebagai drawer pada layar yang lebih kecil.' },
    dashboard: { eyebrow:'02 · PINDAH DASHBOARD', title:(label:string)=>`Buka ${label}`, description:'Klik nama dashboard di navigation rail untuk berpindah halaman. Tour juga dapat memindahkan halaman secara otomatis agar kontrol yang dijelaskan selalu terlihat.', tip:'Hanya dashboard yang diizinkan oleh group access user yang akan muncul di sini.' },
    healthcare: { eyebrow:'03 · HEALTHCARE SELECTOR', title:'Pilih Healthcare Node', description:'Gunakan Healthcare Selector untuk menentukan unit atau healthcare node yang ingin dianalisis. Data dashboard akan mengikuti healthcare yang dipilih.', tip:'Jika selector menyediakan All Healthcare Nodes, gunakan pilihan itu untuk melihat agregasi seluruh node.' },
    maximize: { eyebrow:'04 · FOKUS PANEL', title:'Maximize dan Restore Dashboard', description:'Gunakan tombol di pojok panel untuk memperbesar satu dashboard. Setelah panel maximized, tombol yang sama berubah menjadi Restore Layout untuk kembali ke tampilan multi-panel.', tip:'Area spotlight tetap interaktif. Anda boleh mencoba Maximize lalu Restore sekarang.' },
    voiceActivation: { eyebrow:'05 · VOICE ACTIVATION', title:'Aktifkan Voice Command', description:'Gunakan tombol VOICE ON / VOICE OFF di bagian bawah navigation rail untuk mengaktifkan atau mematikan listening. Voice command hanya akan merespons ucapan saat status VOICE ON aktif. Jika browser meminta izin microphone, izinkan akses agar pengenalan suara dapat berjalan.', tip:'Status hijau berarti voice listening aktif. Status merah berarti voice command dimatikan; seluruh dashboard tetap dapat digunakan secara manual.' },
    voiceCommand: { eyebrow:'06 · VOICE COMMAND CENTER', title:'Kenali menu Voice Commands', description:'Buka Management Center lalu pilih Voice Commands untuk melihat daftar perintah suara yang tersedia. Daftar ini mengikuti permission dashboard user, dapat dicari berdasarkan nama, fungsi, alias, atau contoh ucapan. Anda juga dapat membuka panduan ini langsung dengan mengucapkan “Buka perintah suara”.', tip:'Gunakan perintah yang spesifik seperti “Buka Quarterly Revenue”, “Buka Demography”, atau “Pilih Healthcare Kedoya”. Perintah yang terlalu umum seperti “revenue” atau “bar” sengaja tidak dijalankan agar tidak salah menafsirkan.' },
    theme: { eyebrow:'07 · TAMPILAN', title:'Ganti Theme CoreAnalytics', description:'Buka Appearance untuk mengganti visual CoreAnalytics antara Cosmic Black, Aurora, dan Solaris. Dashboard, management, background, dan spotlight mengikuti theme aktif.', tip:'Theme dapat diganti kapan saja tanpa mengubah data atau hak akses user.' },
    account: { eyebrow:'08 · SELF SERVICE', title:'My Account', description:'My Account menyediakan self-service untuk Change Password dan Voice Identity. User dapat mengelola credential sendiri tanpa harus masuk ke User Management.', tip:'Change Password meminta current password. Voice enrollment juga melakukan verifikasi identitas sebelum menerima sample suara.' },
    finish: { eyebrow:'COREANALYTICS · SIAP', title:'Panduan dashboard selesai', description:'Anda sudah mengenal kontrol utama CoreAnalytics. Guided Tour dapat dijalankan ulang kapan saja dari Management Center lalu pilih Guided Tour.', tip:'Fitur yang ditampilkan oleh tour selalu menyesuaikan permission account yang sedang login.' },
  },
  en: {
    welcome: { eyebrow:'COREANALYTICS · DASHBOARD GUIDE', title:'Welcome to CoreAnalytics', description:'You are now in the main workspace. This short tour introduces dashboard navigation, the Healthcare Selector, panel maximize and restore, voice activation, Voice Commands, themes, and My Account.', tip:'The post-login spotlight is stored per user, so another user will still receive their own first-time tour.' },
    navigation: { eyebrow:'01 · NAVIGATION', title:'Dashboard Navigation', description:'Use the navigation rail to move between dashboards that are assigned to your account. Menus without permission are not displayed.', tip:'The navigation can be pinned, collapsed, or opened as a drawer on smaller screens.' },
    dashboard: { eyebrow:'02 · DASHBOARD SWITCHING', title:(label:string)=>`Open ${label}`, description:'Click a dashboard name in the navigation rail to switch pages. The tour can also move pages automatically so the control being explained is always visible.', tip:'Only dashboards allowed by your group access are shown here.' },
    healthcare: { eyebrow:'03 · HEALTHCARE SELECTOR', title:'Choose a Healthcare Node', description:'Use the Healthcare Selector to choose the unit or healthcare node you want to analyze. Dashboard data follows the selected healthcare.', tip:'If All Healthcare Nodes is available, use it to view an aggregate of all nodes.' },
    maximize: { eyebrow:'04 · PANEL FOCUS', title:'Maximize and Restore a Dashboard', description:'Use the button in the panel corner to maximize one dashboard. When the panel is maximized, the same button becomes Restore Layout so you can return to the multi-panel view.', tip:'The highlighted area remains interactive, so you can try Maximize and Restore now.' },
    voiceActivation: { eyebrow:'05 · VOICE ACTIVATION', title:'Activate Voice Commands', description:'Use the VOICE ON / VOICE OFF button at the bottom of the navigation rail to enable or disable listening. Voice commands respond to speech only while VOICE ON is active. If your browser asks for microphone permission, allow access so speech recognition can work.', tip:'Green means voice listening is active. Red means voice commands are muted; every dashboard control remains available manually.' },
    voiceCommand: { eyebrow:'06 · VOICE COMMAND CENTER', title:'Explore the Voice Commands menu', description:'Open Management Center and choose Voice Commands to see the available voice instructions. The list follows the dashboards your account is allowed to use, and you can search by command name, purpose, alias, or spoken example. You can also open this guide by saying “Buka perintah suara”.', tip:'Use specific phrases such as “Buka Quarterly Revenue”, “Buka Demography”, or “Pilih Healthcare Kedoya”. Broad words such as “revenue” or “bar” are intentionally ignored to prevent accidental commands.' },
    theme: { eyebrow:'07 · APPEARANCE', title:'Change the CoreAnalytics Theme', description:'Open Appearance to switch CoreAnalytics between Cosmic Black, Aurora, and Solaris. The dashboard, management screens, background, and spotlight follow the active theme.', tip:'You can change the theme at any time without changing data or user permissions.' },
    account: { eyebrow:'08 · SELF SERVICE', title:'My Account', description:'My Account provides self-service for Change Password and Voice Identity. Users can manage their own credentials without opening User Management.', tip:'Change Password requires the current password. Voice enrollment also verifies identity before accepting voice samples.' },
    finish: { eyebrow:'COREANALYTICS · READY', title:'Dashboard guide complete', description:'You now know the main CoreAnalytics controls. You can replay the Guided Tour at any time from Management Center, then Guided Tour.', tip:'The features shown by the tour always adapt to the permissions of the signed-in account.' },
  },
} satisfies Record<SpotlightLanguage, any>;

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface PostLoginSpotlightTourProps {
  enabled?: boolean;
  userId: string;
  authorizedRoutes: string[];
  replaySignal?: number;
  onPrepareStep?: (stepId: PostLoginTourStepId, routeKey?: string) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || '1') > 0
  );
}

function firstVisible(selectors: string): HTMLElement | null {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors));
  return elements.find(isVisible) ?? null;
}

function resolveTarget(step: PostLoginTourStep): HTMLElement | null {
  // Voice Command Center must highlight the actual menu item, never the gear.
  // Resolve it before the generic target lookup so an earlier settings button
  // in DOM order can never steal the spotlight.
  if (step.id === 'voice-command') {
    const explicit = firstVisible(
      '[data-tour="voice-command-menu"], [data-tour="voice-commands"]'
    );

    if (explicit) return explicit;

    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"], a')
    ).filter(isVisible);

    const voiceCommandEntry = controls.find((element) => {
      const text = String(element.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const title = String(element.getAttribute('title') || '')
        .trim()
        .toLowerCase();

      const label = String(element.getAttribute('aria-label') || '')
        .trim()
        .toLowerCase();

      return (
        text === 'voice commands' ||
        text.startsWith('voice commands ') ||
        title === 'voice commands' ||
        label === 'voice commands'
      );
    });

    // Do NOT fall back to Management Center / gear.
    // The tour will measure again after onPrepareStep opens the menu.
    return voiceCommandEntry ?? null;
  }

  if (step.target) {
    const direct = firstVisible(step.target);
    if (direct) return direct;
  }

  if (step.id === 'healthcare') {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"], select')
    ).filter(isVisible);

    return controls.find((element) => {
      const text = String(element.textContent || '').toLowerCase();
      const title = String(element.getAttribute('title') || '').toLowerCase();
      const label = String(element.getAttribute('aria-label') || '').toLowerCase();
      return (
        text.includes('healthcare') ||
        text.includes('all node') ||
        title.includes('healthcare') ||
        label.includes('healthcare')
      );
    }) ?? null;
  }

  return null;
}

export default function PostLoginSpotlightTour({
  enabled = true,
  userId,
  authorizedRoutes,
  replaySignal = 0,
  onPrepareStep,
}: PostLoginSpotlightTourProps) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const lastReplaySignalRef = useRef(replaySignal);
  const [cardSize, setCardSize] = useState({ width: 380, height: 270 });
  const { language, setLanguage } = useSpotlightLanguage();
  const ui = SPOTLIGHT_UI[language];

  const routeSet = useMemo(() => new Set(authorizedRoutes), [authorizedRoutes]);

  const steps = useMemo<PostLoginTourStep[]>(() => {
    const copy = POST_COPY[language];
    const result: PostLoginTourStep[] = [
      { id:'welcome', ...copy.welcome },
    ];

    if (authorizedRoutes.length > 0) {
      result.push({
        id:'navigation', ...copy.navigation,
        target:'[data-tour="navigation-sidebar"]',
      });
    }

    const switchRoute = ['daily_tracking','company_performance','iol_usage'].find((route) => routeSet.has(route));
    if (switchRoute) {
      const routeLabel = switchRoute === 'daily_tracking' ? 'Daily Tracking' : switchRoute === 'company_performance' ? 'Company Performance' : 'IOL Usage';
      result.push({
        id:'dashboard-switch',
        eyebrow:copy.dashboard.eyebrow,
        title:copy.dashboard.title(routeLabel),
        description:copy.dashboard.description,
        tip:copy.dashboard.tip,
        target:`[data-tour="nav-dashboard-${switchRoute}"]`,
        routeKey:switchRoute,
      });
    }

    const healthcareRoute = routeSet.has('company_performance') ? 'company_performance' : routeSet.has('daily_tracking') ? 'daily_tracking' : undefined;
    if (healthcareRoute) {
      result.push({
        id:'healthcare', ...copy.healthcare,
        target:'[data-tour="healthcare-selector"], .company-healthcare-filter-wrap, .daily-healthcare-filter-wrap',
        routeKey:healthcareRoute,
      });
    }

    if (routeSet.has('company_performance')) {
      result.push({
        id:'maximize', ...copy.maximize,
        target:'[data-tour="dashboard-maximize"], button[title="Maximize Panel"], button[title="Restore Layout"]',
        routeKey:'company_performance',
      });
    }

    result.push(
      {
        id:'voice-activation',
        ...copy.voiceActivation,
        target:'[data-tour="voice-activation-toggle"]',
      },
      {
        id:'voice-command',
        ...copy.voiceCommand,
        target:'[data-tour="voice-command-menu"], [data-tour="voice-commands"]',
      },
      { id:'theme', ...copy.theme, target:'[data-tour="theme-switcher"]' },
      { id:'account', ...copy.account, target:'[data-tour="my-account"]' },
      { id:'finish', ...copy.finish },
    );
    return result;
  }, [authorizedRoutes.length, language, routeSet]);

  const safeStepIndex = Math.min(stepIndex, Math.max(steps.length - 1, 0));
  const step = steps[safeStepIndex];

  const {
    audioEnabled,
    audioSupported,
    toggleAudio,
  } = useSpotlightNarration({
    active: Boolean(active && step),
    stepKey: step?.id || '',
    title: step?.title || '',
    description: step?.description || '',
    tip: step?.tip,
    language,
  });

  const storageKey = useMemo(
    () => `core_postlogin_onboarding_v1_${String(userId || '').trim() || 'anonymous'}`,
    [userId]
  );

  const measureTarget = useCallback(() => {
    if (!active || !step?.target) {
      setTargetRect(null);
      return;
    }

    const target = resolveTarget(step);
    if (!target) {
      setTargetRect(null);
      return;
    }

    const raw = target.getBoundingClientRect();

    if (
      raw.bottom < 0 ||
      raw.top > window.innerHeight ||
      raw.right < 0 ||
      raw.left > window.innerWidth
    ) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    const rect = target.getBoundingClientRect();
    const padding = 8;
    const top = Math.max(8, rect.top - padding);
    const left = Math.max(8, rect.left - padding);
    const right = Math.min(window.innerWidth - 8, rect.right + padding);
    const bottom = Math.min(window.innerHeight - 8, rect.bottom + padding);

    setTargetRect({
      top,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      right,
      bottom,
    });
  }, [active, step?.target]);

  useEffect(() => {
    if (!enabled || !userId || steps.length === 0) return;

    let completed = false;
    try {
      completed = localStorage.getItem(storageKey) === 'done';
    } catch {
      completed = false;
    }

    if (completed) return;

    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [enabled, steps.length, storageKey, userId]);

  useEffect(() => {
    if (!enabled) return;
    if (lastReplaySignalRef.current === replaySignal) return;

    lastReplaySignalRef.current = replaySignal;
    setStepIndex(0);
    setTargetRect(null);
    setActive(true);
  }, [enabled, replaySignal]);

  useEffect(() => {
    if (!active || !step) return;

    onPrepareStep?.(step.id, step.routeKey);

    const timers = [80, 190, 360, 620].map((delay) =>
      window.setTimeout(measureTarget, delay)
    );
    const trackingTimer = window.setInterval(measureTarget, 420);

    const handleViewport = () => measureTarget();
    window.addEventListener('resize', handleViewport);
    window.addEventListener('scroll', handleViewport, true);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearInterval(trackingTimer);
      window.removeEventListener('resize', handleViewport);
      window.removeEventListener('scroll', handleViewport, true);
    };
  }, [active, measureTarget, onPrepareStep, step]);

  useEffect(() => {
    if (!active || !cardRef.current) return;

    const card = cardRef.current;
    const measureCard = () => {
      const rect = card.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCardSize({ width: rect.width, height: rect.height });
      }
    };

    measureCard();
    const observer = new ResizeObserver(measureCard);
    observer.observe(card);
    return () => observer.disconnect();
  }, [active, safeStepIndex]);

  const persistDone = useCallback(() => {
    try {
      localStorage.setItem(storageKey, 'done');
    } catch {
      // Tour still works if browser storage is unavailable.
    }
  }, [storageKey]);

  const closeTour = useCallback(() => {
    persistDone();
    setActive(false);
    setStepIndex(0);
    setTargetRect(null);
    onPrepareStep?.('finish');
  }, [onPrepareStep, persistDone]);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTour();
        return;
      }

      if (event.key === 'ArrowRight' && safeStepIndex < steps.length - 1) {
        event.preventDefault();
        setStepIndex((current) => Math.min(current + 1, steps.length - 1));
      }

      if (event.key === 'ArrowLeft' && safeStepIndex > 0) {
        event.preventDefault();
        setStepIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, closeTour, safeStepIndex, steps.length]);

  const tooltipStyle = useMemo<React.CSSProperties>(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const margin = 14;
    const gap = 18;
    const width = Math.min(390, viewportWidth - margin * 2);
    const height = Math.max(230, cardSize.height || 270);

    if (!targetRect) {
      return {
        width,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const centeredTop = clamp(
      targetRect.top + targetRect.height / 2 - height / 2,
      margin,
      Math.max(margin, viewportHeight - height - margin)
    );
    const centeredLeft = clamp(
      targetRect.left + targetRect.width / 2 - width / 2,
      margin,
      Math.max(margin, viewportWidth - width - margin)
    );

    const roomRight = viewportWidth - targetRect.right - margin;
    const roomLeft = targetRect.left - margin;
    const roomBottom = viewportHeight - targetRect.bottom - margin;
    const roomTop = targetRect.top - margin;

    if (roomRight >= width + gap) {
      return { width, left: targetRect.right + gap, top: centeredTop };
    }

    if (roomLeft >= width + gap) {
      return { width, left: targetRect.left - width - gap, top: centeredTop };
    }

    if (roomBottom >= height + gap) {
      return { width, left: centeredLeft, top: targetRect.bottom + gap };
    }

    if (roomTop >= height + gap) {
      return { width, left: centeredLeft, top: targetRect.top - height - gap };
    }

    const targetCenterY = targetRect.top + targetRect.height / 2;
    return {
      width,
      left: centeredLeft,
      top:
        targetCenterY > viewportHeight / 2
          ? margin
          : Math.max(margin, viewportHeight - height - margin),
    };
  }, [cardSize.height, targetRect]);

  if (!enabled || !active || !step) return null;

  return (
    <div
      className="core-tour-root"
      role="dialog"
      aria-modal="true"
      aria-label="CoreAnalytics Dashboard Guide"
    >
      {targetRect ? (
        <>
          <div className="core-tour-shade" style={{ left: 0, top: 0, right: 0, height: targetRect.top }} />
          <div
            className="core-tour-shade"
            style={{ left: 0, top: targetRect.top, width: targetRect.left, height: targetRect.height }}
          />
          <div
            className="core-tour-shade"
            style={{ left: targetRect.right, right: 0, top: targetRect.top, height: targetRect.height }}
          />
          <div className="core-tour-shade" style={{ left: 0, right: 0, top: targetRect.bottom, bottom: 0 }} />
          <div
            className="core-tour-focus"
            style={{
              left: targetRect.left,
              top: targetRect.top,
              width: targetRect.width,
              height: targetRect.height,
            }}
          >
            <span className="core-tour-focus__scan" />
            <span className="core-tour-corner core-tour-corner--tl" />
            <span className="core-tour-corner core-tour-corner--tr" />
            <span className="core-tour-corner core-tour-corner--bl" />
            <span className="core-tour-corner core-tour-corner--br" />
          </div>
        </>
      ) : (
        <div className="core-tour-shade core-tour-shade--full" />
      )}

      <section ref={cardRef} className="core-tour-card" style={tooltipStyle}>
        <div className="core-tour-card__rail" />

        <div className="core-tour-card__topline">
          <span>{step.eyebrow}</span>
          <div className="core-tour-card__tools">
            <label className="core-tour-language-wrap" title={ui.languageLabel}>
              <span aria-hidden="true">🌐</span>
              <select
                className="core-tour-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as SpotlightLanguage)}
                aria-label={ui.languageLabel}
              >
                {SPOTLIGHT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`core-tour-audio ${audioEnabled ? 'is-on' : 'is-off'}`}
              onClick={toggleAudio}
              disabled={!audioSupported}
              aria-pressed={audioEnabled}
              title={
                audioSupported
                  ? audioEnabled
                    ? ui.audioOnTitle
                    : ui.audioOffTitle
                  : ui.audioUnavailableTitle
              }
            >
              <span aria-hidden="true">{audioEnabled && audioSupported ? '🔊' : '🔇'}</span>
              <span>{audioSupported ? (audioEnabled ? ui.audioOn : ui.audioOff) : ui.audioUnavailable}</span>
            </button>
            <span>
              {String(safeStepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
            </span>
          </div>
        </div>

        <h2>{step.title}</h2>
        <p>{step.description}</p>

        {step.tip && (
          <div className="core-tour-tip">
            <span>◈</span>
            <span>{step.tip}</span>
          </div>
        )}

        <div className="core-tour-progress" aria-hidden="true">
          {steps.map((item, index) => (
            <span
              key={item.id}
              className={
                index === safeStepIndex
                  ? 'is-active'
                  : index < safeStepIndex
                    ? 'is-done'
                    : ''
              }
            />
          ))}
        </div>

        <div className="core-tour-actions">
          <button type="button" className="core-tour-skip" onClick={closeTour}>
            {ui.skip}
          </button>

          <div className="core-tour-nav">
            <button
              type="button"
              className="core-tour-secondary"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={safeStepIndex === 0}
            >
              ← {ui.back}
            </button>

            {safeStepIndex < steps.length - 1 ? (
              <button
                type="button"
                className="core-tour-primary"
                onClick={() =>
                  setStepIndex((current) => Math.min(steps.length - 1, current + 1))
                }
              >
                {ui.next} →
              </button>
            ) : (
              <button type="button" className="core-tour-primary" onClick={closeTour}>
                {ui.finish}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
