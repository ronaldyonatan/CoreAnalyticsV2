import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './LoginSpotlightTour.css';

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

const STEPS: LoginTourStep[] = [
  {
    id: 'welcome',
    eyebrow: 'COREANALYTICS · FIRST ACCESS',
    title: 'Welcome to CoreAnalytics',
    description:
      'Sebelum masuk ke dashboard, kenali tiga jalur akses utama: Voice Authentication, Manual Login, dan Password Recovery.',
    target: '[data-tour="login-hud"]',
    tip: 'Tour ini tidak menjalankan proses login. Spotlight hanya memperkenalkan kontrol yang tersedia.',
  },
  {
    id: 'auth-modes',
    eyebrow: '01 · ACCESS MODE',
    title: 'Pilih cara masuk',
    description:
      'Gunakan Voice Access untuk autentikasi biometrik suara, atau Manual Access untuk login dengan username dan password.',
    target: '[data-tour="login-auth-modes"]',
  },
  {
    id: 'voice-login',
    eyebrow: '02 · VOICE AUTHENTICATION',
    title: 'Login dengan suara',
    description:
      'Tekan Voice Authentication untuk mengaktifkan listener. Setelah aktif, ucapkan “Hey Friday”. CoreAnalytics akan mencocokkan voice signature dengan biometric profile yang terdaftar.',
    target: '[data-tour="login-voice-auth"]',
    tip: 'Voice profile harus sudah terdaftar pada Management Center.',
  },
  {
    id: 'manual-login',
    eyebrow: '03 · MANUAL ACCESS',
    title: 'Login dengan credential',
    description:
      'Jika voice login tidak tersedia, pilih Manual Access lalu masukkan username dan password. Sistem melakukan secure credential verification sebelum membuka dashboard.',
    target: '[data-tour="login-manual-form"]',
    tip: 'Indikator login attempt membantu melihat sisa percobaan sebelum account lock.',
  },
  {
    id: 'forgot-password',
    eyebrow: '04 · PASSWORD RECOVERY',
    title: 'Lupa password?',
    description:
      'Gunakan Forgot Password untuk recovery. Masukkan username atau email terdaftar, verifikasi OTP 6 digit dari email, kemudian buat password baru.',
    target: '[data-tour="login-forgot-password"]',
    tip: 'Kode OTP memiliki masa berlaku dan reset token hanya dapat digunakan untuk proses recovery yang valid.',
  },
  {
    id: 'finish',
    eyebrow: 'COREANALYTICS · READY',
    title: 'Authentication gateway ready',
    description:
      'Anda sudah mengenal tiga jalur akses Login Portal. Setelah berhasil login, guided tour berikutnya dapat melanjutkan ke Navigation, Healthcare Selector, Dashboard, 3D View, Theme, dan Voice Command.',
    target: '[data-tour="login-hud"]',
    tip: 'Tekan GUIDE kapan saja untuk menjalankan tutorial Login Portal kembali.',
  },
];

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

  const step = STEPS[stepIndex];

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

      if (event.key === 'ArrowRight' && stepIndex < STEPS.length - 1) {
        event.preventDefault();
        setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
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
          <span>{String(stepIndex + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</span>
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
          {STEPS.map((item, index) => (
            <span
              key={item.id}
              className={index === stepIndex ? 'is-active' : index < stepIndex ? 'is-done' : ''}
            />
          ))}
        </div>

        <div className="login-tour-actions">
          <button type="button" className="login-tour-skip" onClick={closeTour}>
            SKIP GUIDE
          </button>

          <div className="login-tour-nav">
            <button
              type="button"
              className="login-tour-secondary"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
            >
              ← BACK
            </button>

            {stepIndex < STEPS.length - 1 ? (
              <button
                type="button"
                className="login-tour-primary"
                onClick={() => setStepIndex((current) => Math.min(STEPS.length - 1, current + 1))}
              >
                NEXT →
              </button>
            ) : (
              <button type="button" className="login-tour-primary" onClick={closeTour}>
                FINISH TOUR ✓
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
