import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import MarketingLanding from './MarketingLanding';

// Keep the native App/LoginPortal untouched: it is mounted offscreen only
// during the handoff, then faded in after its existing WebGL core is ready.
const ExistingApp = lazy(() => import('../App'));

type LandingPhase = 'home' | 'preparing' | 'flying' | 'arriving' | 'login';

function isLandingRequest(): boolean {
  if (import.meta.env.VITE_PUBLIC_LANDING === 'false') return false;
  const query = new URLSearchParams(window.location.search);
  const hashQuery = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const hash = window.location.hash;
  if (query.get('core_view') === 'login' || query.get('core_view') === 'app') return false;
  if (query.get('autologin') === 'true' || hashQuery.get('autologin') === 'true') return false;
  if (['token', 'reset_token', 'code'].some(param => query.has(param) || hashQuery.has(param))) return false;
  if (hash && !/^#(?:home|platform|capabilities|studio|analytics|intelligence|security|future|contact)$/.test(hash)) return false;
  return true;
}

/**
 * Match the ACTUAL camera framing of LoginPortal.tsx rather than guessing a
 * target pixel size from the browser width. Both scenes use z=6, fov=42.
 * CoreMotionGroup places the desktop idle core at up to 23.5% of canvas width
 * to the right; it is centered on narrow canvases.
 *
 * CoreScene occupies its entire canvas. Its apparent size is proportional to
 * the HEIGHT of the canvas, not to the width of its parent. This correction
 * prevents the visual pop when switching from the landing Three.js scene to
 * the full-window login scene.
 */
function measureCoreHandoff(orb: HTMLElement) {
  const sourceCanvas = orb.querySelector<HTMLCanvasElement>('.studio-login-core canvas');
  const destinationCanvas = document.querySelector<HTMLCanvasElement>(
    '.ca-marketing-login-layer .login-core-layer canvas',
  );
  if (!sourceCanvas || !destinationCanvas) return null;

  const src = sourceCanvas.getBoundingClientRect();
  const dst = destinationCanvas.getBoundingClientRect();
  if (src.height < 1 || dst.height < 1 || src.width < 1 || dst.width < 1) return null;

  const viewportHeight = 2 * 6 * Math.tan((42 * Math.PI / 180) / 2);
  const viewportWidth = viewportHeight * dst.width / dst.height;
  const rightOffset = viewportWidth >= 6
    ? Math.min(2.35, viewportWidth * .235) / viewportWidth
    : 0;

  return {
    deltaX: dst.left + dst.width * (.5 + rightOffset) - (src.left + src.width / 2),
    deltaY: dst.top + dst.height / 2 - (src.top + src.height / 2),
    scale: dst.height / src.height,
  };
}

function hasReadyLoginVisual() {
  const portal = document.querySelector<HTMLElement>('.ca-marketing-login-layer .login-portal-root');
  if (!portal) return false;
  // Cosmic Black uses a Three.js canvas. Wait for an initialized drawing buffer,
  // then allow extra frames for its first scene render before the crossfade.
  const canvas = portal.querySelector<HTMLCanvasElement>('.login-core-layer canvas');
  if (canvas) return canvas.width > 0 && canvas.height > 0;
  // Other native themes use CSS or independent visual elements.
  return !!portal.querySelector('.login-solaris-core, .login-aurora-orb-stage, .login-jec-orb-stage, .login-static-core');
}

/**
 * Public marketing site and the existing login remain in the same SPA.
 * v5 builds on warm mounting and matches actual WebGL canvas geometry.
 * It also keeps all homepage copy hidden through the crossfade to prevent
 * the interim flash of the old headline seen in the v4 recording.
 */
export default function MarketingEntry() {
  const [phase, setPhase] = useState<LandingPhase>(() => isLandingRequest() ? 'home' : 'login');
  const inFlightAnimation = useRef<Animation | null>(null);
  const [loginLoadError, setLoginLoadError] = useState(false);
  const completionTimer = useRef<number | null>(null);

  const clearFlight = useCallback(() => {
    inFlightAnimation.current?.cancel();
    inFlightAnimation.current = null;
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    completionTimer.current = null;
  }, []);

  const finishToLogin = useCallback(() => {
    inFlightAnimation.current = null;
    window.history.pushState(window.history.state, '', '/?core_view=login');
    // Keep the native orb in place as the warm Login Portal takes over.
    setPhase('arriving');
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    completionTimer.current = window.setTimeout(() => {
      completionTimer.current = null;
      setPhase('login');
    }, 340);
  }, []);

  const runOrbHandoff = useCallback(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const orb = document.querySelector<HTMLElement>('.ca-marketing-home-layer .ca-landing-hero-art .ca-landing-real-core');
    // Animate only the shared Three.js core, not the landing-specific halo/frame.
    const movingCore = orb?.querySelector<HTMLElement>('.studio-login-core');
    const bounds = movingCore?.getBoundingClientRect();
    const isVisible = !!bounds && bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;

    if (reducedMotion || !orb || !movingCore || !bounds || !isVisible || typeof movingCore.animate !== 'function') {
      finishToLogin();
      return;
    }

    const target = measureCoreHandoff(orb);
    if (!target) {
      finishToLogin();
      return;
    }

    setPhase('flying');
    try {
      const animation = movingCore.animate([
        { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
        { transform: `translate3d(${target.deltaX}px,${target.deltaY}px,0) scale(${target.scale})`, opacity: 1 },
      ], { duration: 820, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'forwards' });
      inFlightAnimation.current = animation;
      void animation.finished.then(() => {
        finishToLogin();
      }).catch(() => {
        // If canceled by Home or browser navigation, do not navigate again.
      });
    } catch {
      finishToLogin();
    }
  }, [finishToLogin]);

  const showLogin = useCallback(() => {
    if (phase !== 'home') return;
    // Render App/LoginPortal immediately, but keep the entire homepage visible
    // until the destination orb exists; import() alone did not ensure that.
    setLoginLoadError(false);
    setPhase('preparing');
  }, [phase]);

  const showHome = useCallback(() => {
    if (import.meta.env.VITE_PUBLIC_LANDING === 'false') {
      window.location.assign('/');
      return;
    }
    clearFlight();
    window.history.pushState(window.history.state, '', '/');
    setPhase('home');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }, [clearFlight]);

  useEffect(() => {
    if (phase !== 'preparing') return;
    let disposed = false;
    let scheduled: number | null = null;
    let started = false;
    const checkReady = () => {
      if (disposed || started || !hasReadyLoginVisual()) return;
      started = true;
      // The portal canvas can exist before its first WebGL frame.
      scheduled = window.setTimeout(() => {
        if (!disposed) runOrbHandoff();
      }, 260);
    };
    const observer = new MutationObserver(checkReady);
    observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    const poll = window.setInterval(checkReady, 90);
    const failSafe = window.setTimeout(() => {
      if (disposed || started) return;
      const layer = document.querySelector('.ca-marketing-login-layer');
      const stillLoading = !!layer?.querySelector('.ca-marketing-login-loading');
      if (layer && !stillLoading && layer.children.length > 0) {
        // E.g. an already authenticated session which opens the app directly.
        started = true;
        runOrbHandoff();
      } else {
        setLoginLoadError(true);
        setPhase('home');
      }
    }, 6500);
    checkReady();
    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(failSafe);
      if (scheduled !== null) window.clearTimeout(scheduled);
    };
  }, [phase, runOrbHandoff]);

  useEffect(() => {
    window.addEventListener('coreanalytics:marketing-home', showHome);
    const onPopState = () => {
      clearFlight();
      setPhase(isLandingRequest() ? 'home' : 'login');
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('coreanalytics:marketing-home', showHome);
      window.removeEventListener('popstate', onPopState);
    };
  }, [clearFlight, showHome]);

  // Make both original Login Portal logos link back to Home without editing
  // LoginPortal.tsx or interfering with actual sign-in behavior.
  useEffect(() => {
    if (phase === 'home') return;
    const selector = '.login-portal-root .login-brand-logo, .login-portal-root .ds-login-brand img[alt="Core Analytics"]';
    const decorate = () => {
      document.querySelectorAll<HTMLImageElement>(selector).forEach(logo => {
        logo.tabIndex = 0;
        logo.setAttribute('role', 'link');
        logo.setAttribute('aria-label', 'Back to CoreAnalytics homepage');
        logo.title = 'Back to CoreAnalytics homepage';
      });
    };
    const isLogo = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest(selector);
    const onClick = (event: MouseEvent) => {
      if (!isLogo(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      showHome();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLogo(event.target) || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      event.stopPropagation();
      showHome();
    };
    const observer = new MutationObserver(decorate);
    observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
    decorate();
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [phase, showHome]);

  useEffect(() => () => clearFlight(), [clearFlight]);

  const showLanding = phase !== 'login';
  const showApp = phase !== 'home';
  return (
    <div className="ca-marketing-entry" data-phase={phase}>
      {showLanding && (
        <div className="ca-marketing-home-layer">
          <MarketingLanding onLogin={showLogin} />
          {loginLoadError && (
            <div className="ca-marketing-login-error" role="alert">
              Login Portal belum siap. Periksa frontend dan coba klik Login kembali.
            </div>
          )}
        </div>
      )}
      {showApp && (
        <div className="ca-marketing-login-layer" aria-hidden={phase === 'preparing' || phase === 'flying'}>
          <Suspense fallback={<div role="status" className="ca-marketing-login-loading">Opening CoreAnalytics…</div>}>
            <ExistingApp />
          </Suspense>
        </div>
      )}
    </div>
  );
}
