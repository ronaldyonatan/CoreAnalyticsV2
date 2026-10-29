import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './LoginSpotlightTour.css';
import useSpotlightNarration from './useSpotlightNarration';
import useSpotlightLanguage, {
  SPOTLIGHT_LANGUAGE_OPTIONS,
  SPOTLIGHT_UI,
  type SpotlightLanguage,
} from './spotlightLanguage';

export type LoginTourStepId =
  | 'welcome'
  | 'auth-modes'
  | 'voice-login'
  | 'manual-login'
  | 'forgot-password'
  | 'finish';

interface LoginTourStep {
  id: LoginTourStepId;
  eyebrow: string;
  title: string;
  description: string;
  target?: string;
  tip?: string;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface LoginSpotlightTourProps {
  onPrepareStep?: (stepId: LoginTourStepId) => void;
}

const STORAGE_KEY = 'core_login_onboarding_v1';

const LOGIN_STEPS: Record<SpotlightLanguage, LoginTourStep[]> = {
  id: [
    { id:'welcome', eyebrow:'COREANALYTICS · AKSES PERTAMA', title:'Selamat datang di CoreAnalytics', description:'Sebelum masuk ke dashboard, kenali tiga jalur akses utama: autentikasi suara, login manual, dan pemulihan password.', target:'[data-tour="login-hud"]', tip:'Tour ini tidak menjalankan proses login. Spotlight hanya memperkenalkan kontrol yang tersedia.' },
    { id:'auth-modes', eyebrow:'01 · MODE AKSES', title:'Pilih cara masuk', description:'Gunakan Voice Access untuk autentikasi biometrik suara, atau Manual Access untuk login dengan username dan password.', target:'[data-tour="login-auth-modes"]' },
    { id:'voice-login', eyebrow:'02 · AUTENTIKASI SUARA', title:'Login dengan suara', description:'Tekan Voice Authentication untuk mengaktifkan listener. Setelah aktif, ucapkan “Hey Friday”. CoreAnalytics akan mencocokkan voice signature dengan profil biometrik suara yang terdaftar.', target:'[data-tour="login-voice-auth"]', tip:'Voice profile harus sudah terdaftar sebelum voice login dapat digunakan.' },
    { id:'manual-login', eyebrow:'03 · AKSES MANUAL', title:'Login dengan kredensial', description:'Jika voice login tidak tersedia, pilih Manual Access lalu masukkan username dan password. Sistem melakukan verifikasi kredensial sebelum membuka dashboard.', target:'[data-tour="login-manual-form"]', tip:'Indikator percobaan login membantu melihat sisa percobaan sebelum account terkunci.' },
    { id:'forgot-password', eyebrow:'04 · PEMULIHAN PASSWORD', title:'Lupa password?', description:'Gunakan Forgot Password untuk recovery. Masukkan username atau email terdaftar, verifikasi OTP 6 digit dari email, kemudian buat password baru.', target:'[data-tour="login-forgot-password"]', tip:'Kode OTP memiliki masa berlaku dan reset token hanya dapat digunakan untuk proses recovery yang valid.' },
    { id:'finish', eyebrow:'COREANALYTICS · SIAP', title:'Gerbang autentikasi siap', description:'Anda sudah mengenal tiga jalur akses Login Portal. Setelah berhasil login, guided tour berikutnya akan memperkenalkan navigasi, Healthcare Selector, dashboard, theme, dan My Account.', target:'[data-tour="login-hud"]', tip:'Tekan GUIDE kapan saja untuk menjalankan tutorial Login Portal kembali.' },
  ],
  en: [
    { id:'welcome', eyebrow:'COREANALYTICS · FIRST ACCESS', title:'Welcome to CoreAnalytics', description:'Before entering the dashboard, get familiar with the three main access paths: Voice Authentication, Manual Login, and Password Recovery.', target:'[data-tour="login-hud"]', tip:'This tour does not perform a login. The spotlight only introduces the controls that are available.' },
    { id:'auth-modes', eyebrow:'01 · ACCESS MODE', title:'Choose how to sign in', description:'Use Voice Access for biometric voice authentication, or Manual Access to sign in with your username and password.', target:'[data-tour="login-auth-modes"]' },
    { id:'voice-login', eyebrow:'02 · VOICE AUTHENTICATION', title:'Sign in with your voice', description:'Press Voice Authentication to activate the listener. Once it is active, say “Hey Friday”. CoreAnalytics will match your voice signature with the registered biometric voice profile.', target:'[data-tour="login-voice-auth"]', tip:'A voice profile must already be registered before voice login can be used.' },
    { id:'manual-login', eyebrow:'03 · MANUAL ACCESS', title:'Sign in with credentials', description:'If voice login is not available, choose Manual Access and enter your username and password. The system verifies your credentials before opening the dashboard.', target:'[data-tour="login-manual-form"]', tip:'The login attempt indicator shows how many attempts remain before the account is locked.' },
    { id:'forgot-password', eyebrow:'04 · PASSWORD RECOVERY', title:'Forgot your password?', description:'Use Forgot Password to recover access. Enter your registered username or email, verify the six-digit OTP from your email, then create a new password.', target:'[data-tour="login-forgot-password"]', tip:'The OTP has an expiration time, and the reset token can only be used for a valid recovery process.' },
    { id:'finish', eyebrow:'COREANALYTICS · READY', title:'Authentication gateway ready', description:'You now know the three Login Portal access paths. After you sign in, the next guided tour will introduce navigation, the Healthcare Selector, dashboards, themes, and My Account.', target:'[data-tour="login-hud"]', tip:'Press GUIDE at any time to replay the Login Portal tutorial.' },
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function LoginSpotlightTour({
  onPrepareStep,
}: LoginSpotlightTourProps) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: 360, height: 270 });
  const { language, setLanguage } = useSpotlightLanguage();
  const ui = SPOTLIGHT_UI[language];
  const steps = LOGIN_STEPS[language];
  const safeStepIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeStepIndex];

  const {
    audioEnabled,
    audioSupported,
    toggleAudio,
  } = useSpotlightNarration({
    active,
    stepKey: step.id,
    title: step.title,
    description: step.description,
    tip: step.tip,
    language,
  });

  const measureTarget = useCallback(() => {
    if (!active || !step.target) {
      setTargetRect(null);
      return;
    }

    const target = document.querySelector<HTMLElement>(step.target);
    if (!target) {
      setTargetRect(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = step.id === 'welcome' || step.id === 'finish' ? 10 : 8;
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
  }, [active, step.id, step.target]);

  useEffect(() => {
    let completed = false;
    try {
      completed = localStorage.getItem(STORAGE_KEY) === 'done';
    } catch {
      completed = false;
    }

    if (completed) return;

    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, 900);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!active) return;

    onPrepareStep?.(step.id);

    const timers = [70, 160, 320].map((delay) =>
      window.setTimeout(measureTarget, delay)
    );

    const handleViewport = () => measureTarget();
    window.addEventListener('resize', handleViewport);
    window.addEventListener('scroll', handleViewport, true);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('resize', handleViewport);
      window.removeEventListener('scroll', handleViewport, true);
    };
  }, [active, measureTarget, onPrepareStep, step.id]);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        try {
          localStorage.setItem(STORAGE_KEY, 'done');
        } catch {
          // The replay button remains available even if storage is unavailable.
        }
        setActive(false);
        onPrepareStep?.('welcome');
        return;
      }

      if (event.key === 'ArrowRight' && stepIndex < steps.length - 1) {
        event.preventDefault();
        setStepIndex((current) => Math.min(current + 1, steps.length - 1));
      }

      if (event.key === 'ArrowLeft' && stepIndex > 0) {
        event.preventDefault();
        setStepIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onPrepareStep, stepIndex]);

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
  }, [active, stepIndex]);

  const tooltipStyle = useMemo<React.CSSProperties>(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const margin = 14;
    const gap = 20;
    const width = Math.min(360, viewportWidth - margin * 2);
    const height = Math.max(220, cardSize.height || 270);

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

    // Desktop login panel normally sits on the left, so prefer the empty
    // visual area to its right. The remaining directions are strict
    // fallbacks and are only selected when the whole card fits there.
    if (roomRight >= width + gap) {
      return {
        width,
        left: targetRect.right + gap,
        top: centeredTop,
      };
    }

    if (roomLeft >= width + gap) {
      return {
        width,
        left: targetRect.left - width - gap,
        top: centeredTop,
      };
    }

    if (roomBottom >= height + gap) {
      return {
        width,
        left: centeredLeft,
        top: targetRect.bottom + gap,
      };
    }

    if (roomTop >= height + gap) {
      return {
        width,
        left: centeredLeft,
        top: targetRect.top - height - gap,
      };
    }

    // Small screens may not have one side large enough for the complete
    // tooltip. Dock it to the half of the viewport furthest from the
    // spotlight instead of placing it on top of the highlighted control.
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const dockTop = targetCenterY > viewportHeight / 2;

    return {
      width,
      left: centeredLeft,
      top: dockTop
        ? margin
        : Math.max(margin, viewportHeight - height - margin),
    };
  }, [cardSize.height, targetRect]);

  const persistDone = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'done');
    } catch {
      // Keep the tour usable even if browser storage is blocked.
    }
  }, []);

  const closeTour = useCallback(() => {
    persistDone();
    setActive(false);
    setStepIndex(0);
    setTargetRect(null);
    onPrepareStep?.('welcome');
  }, [onPrepareStep, persistDone]);

  const replayTour = useCallback(() => {
    setStepIndex(0);
    setTargetRect(null);
    setActive(true);
  }, []);

  if (!active) {
    return (
      <button
        type="button"
        className="login-tour-replay"
        onClick={replayTour}
        title="Replay Login Guide"
      >
        <span className="login-tour-replay__pulse" />
        GUIDE
      </button>
    );
  }

  return (
    <div className="login-tour-root" role="dialog" aria-modal="true" aria-label="CoreAnalytics Login Guide">
      {targetRect ? (
        <>
          <div className="login-tour-shade" style={{ left: 0, top: 0, right: 0, height: targetRect.top }} />
          <div
            className="login-tour-shade"
            style={{ left: 0, top: targetRect.top, width: targetRect.left, height: targetRect.height }}
          />
          <div
            className="login-tour-shade"
            style={{ left: targetRect.right, right: 0, top: targetRect.top, height: targetRect.height }}
          />
          <div className="login-tour-shade" style={{ left: 0, right: 0, top: targetRect.bottom, bottom: 0 }} />
          <div
            className="login-tour-focus"
            style={{
              left: targetRect.left,
              top: targetRect.top,
              width: targetRect.width,
              height: targetRect.height,
            }}
          >
            <span className="login-tour-focus__scan" />
            <span className="login-tour-corner login-tour-corner--tl" />
            <span className="login-tour-corner login-tour-corner--tr" />
            <span className="login-tour-corner login-tour-corner--bl" />
            <span className="login-tour-corner login-tour-corner--br" />
          </div>
        </>
      ) : (
        <div className="login-tour-shade login-tour-shade--full" />
      )}

      <section ref={cardRef} className="login-tour-card" style={tooltipStyle}>
        <div className="login-tour-card__rail" />

        <div className="login-tour-card__topline">
          <span>{step.eyebrow}</span>
          <div className="login-tour-card__tools">
            <label className="login-tour-language-wrap" title={ui.languageLabel}>
              <span aria-hidden="true">🌐</span>
              <select
                className="login-tour-language"
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
              className={`login-tour-audio ${audioEnabled ? 'is-on' : 'is-off'}`}
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
            <span>{String(safeStepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span>
          </div>
        </div>

        <h2>{step.title}</h2>
        <p>{step.description}</p>

        {step.tip && (
          <div className="login-tour-tip">
            <span>◈</span>
            <span>{step.tip}</span>
          </div>
        )}

        <div className="login-tour-progress" aria-hidden="true">
          {steps.map((item, index) => (
            <span
              key={item.id}
              className={index === safeStepIndex ? 'is-active' : index < safeStepIndex ? 'is-done' : ''}
            />
          ))}
        </div>

        <div className="login-tour-actions">
          <button type="button" className="login-tour-skip" onClick={closeTour}>
            {ui.skip}
          </button>

          <div className="login-tour-nav">
            <button
              type="button"
              className="login-tour-secondary"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={safeStepIndex === 0}
            >
              ← {ui.back}
            </button>

            {safeStepIndex < steps.length - 1 ? (
              <button
                type="button"
                className="login-tour-primary"
                onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
              >
                {ui.next} →
              </button>
            ) : (
              <button type="button" className="login-tour-primary" onClick={closeTour}>
                {ui.finish}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
