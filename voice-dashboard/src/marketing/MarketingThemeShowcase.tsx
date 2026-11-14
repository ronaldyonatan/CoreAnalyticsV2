import { useState } from 'react';
import { LoginIdleCore } from '../LoginPortal';
import { ComponentStyles } from '../design-system/ComponentStyles';
import { MarketingThemeVisualProvider } from '../theme/ThemeContext';
// Bring in the installed, original theme tokens. No theme is applied to the
// homepage itself; a nested [data-theme] scopes them to the sample only.
import '../theme/themes/cosmic-black.css';
import '../theme/themes/aurora.css';
import '../theme/themes/jec-skywave.css';
import '../theme/themes/solaris.css';
import '../theme/themes/lunar-eclipse.css';

type ShowcaseTheme = 'cosmic-black' | 'aurora' | 'jec-skywave' | 'solaris' | 'lunar-eclipse';
type ThemeOption = {
  id: ShowcaseTheme;
  title: string;
  label: string;
  mood: string;
  environment: string;
  performance: 'Immersive';
};

// Confirmed identifiers, names, and characteristics from the CoreAnalytics
// theme registry shipped in the provided source. Nebula / Stardust / Nova
// Rose are deliberately excluded until confirmed as installed themes.
const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: 'cosmic-black', title: 'Cosmic Black', label: 'Deep Space', mood: 'A deep-space command center with cyan neural energy and dark glass.', environment: 'Neural Core', performance: 'Immersive' },
  { id: 'aurora', title: 'Aurora', label: 'Living Light', mood: 'Luminous cyan and teal surfaces with an aurora-inspired atmosphere.', environment: 'Aurora Field', performance: 'Immersive' },
  { id: 'jec-skywave', title: 'Skywave', label: 'Blue Energy', mood: 'Bright sky-blue energy waves surrounding the JEC Friday core.', environment: 'Skywave Field', performance: 'Immersive' },
  { id: 'solaris', title: 'Solaris', label: 'Solar Clarity', mood: 'Bright blue-white presentation surfaces and a cool solar-plasma identity.', environment: 'Solar Core', performance: 'Immersive' },
  { id: 'lunar-eclipse', title: 'Lunar Eclipse', label: 'Midnight Orbit', mood: 'Midnight indigo with a shadowed lunar core and silver-blue highlights.', environment: 'Lunar Core', performance: 'Immersive' },
] as const;

const sampleBars = [31, 48, 44, 61, 55, 71, 66, 84, 76, 91];

export default function MarketingThemeShowcase() {
  const [activeTheme, setActiveTheme] = useState<ShowcaseTheme>('cosmic-black');
  const selected = THEME_OPTIONS.find(theme => theme.id === activeTheme) ?? THEME_OPTIONS[0];

  return (
    <div className="ca-landing-universe-showcase">
      {/* This CSS is normally mounted only by the full LoginPortal. The preview
          uses LoginIdleCore directly, so Aurora requires the same component CSS. */}
      <ComponentStyles name="login-gateway" />
      <div className="ca-landing-universe-picker" aria-label="Choose a CoreAnalytics theme">
        {THEME_OPTIONS.map(theme => (
          <button
            key={theme.id}
            type="button"
            className={`ca-landing-universe-choice${theme.id === activeTheme ? ' is-selected' : ''}`}
            aria-pressed={theme.id === activeTheme}
            onClick={() => setActiveTheme(theme.id)}
          >
            <span className={`ca-landing-universe-swatch ca-landing-universe-swatch--${theme.id}`} aria-hidden="true" />
            <span>{theme.title}</span>
          </button>
        ))}
      </div>

      {/* Theme tokens apply ONLY to this stage: never write to documentElement or
          ThemeContext. The active app / LoginPortal theme remains Cosmic Black. */}
      <div className="ca-landing-universe-stage" data-theme={activeTheme} data-universe-theme={activeTheme}>
        <div className="ca-landing-universe-stage-head">
          <div className="ca-landing-universe-stage-title">
            <span className="ca-landing-universe-status-dot" aria-hidden="true" />
            <div>
              <strong>COREANALYTICS</strong>
              <small>DATA UNIVERSE / LIVE THEME PREVIEW</small>
            </div>
          </div>
          <span className="ca-landing-universe-mode">{selected.performance} theme</span>
        </div>

        <div className="ca-landing-universe-stage-body">
          <div className="ca-landing-universe-identity">
            <div className="ca-landing-universe-visual" aria-label={`${selected.title} original Login Portal idle core`} role="img">
              <div className="ca-landing-universe-original-core">
                <MarketingThemeVisualProvider themeId={activeTheme}>
                  <LoginIdleCore key={activeTheme} />
                </MarketingThemeVisualProvider>
              </div>
            </div>
            <div className="ca-landing-universe-caption">
              <span>{selected.label.toUpperCase()} / {selected.environment.toUpperCase()}</span>
              <h3>{selected.title}</h3>
              <p>{selected.mood}</p>
            </div>
          </div>

          <div className="ca-landing-universe-ui" aria-label={`${selected.title} sample analytics dashboard (illustrative)`}>
            <div className="ca-landing-universe-ui-bar">
              <span className="ca-landing-universe-ui-mark" aria-hidden="true">✦</span>
              <strong>Workspace Overview</strong>
              <span className="ca-landing-universe-ui-live">DESIGN PREVIEW</span>
            </div>
            <div className="ca-landing-universe-ui-metrics">
              <div><small>DATASETS</small><strong>24</strong><span>Connected assets</span></div>
              <div><small>PIPELINES</small><strong>12</strong><span>Managed flows</span></div>
              <div><small>INSIGHTS</small><strong>86</strong><span>Visual cards</span></div>
            </div>
            <div className="ca-landing-universe-ui-chart">
              <div className="ca-landing-universe-ui-chart-head"><strong>Analytics Performance</strong><span>ILLUSTRATIVE</span></div>
              <div className="ca-landing-universe-ui-bars" role="img" aria-label="Illustrative ten-bar performance chart">
                {sampleBars.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
              </div>
              <div className="ca-landing-universe-ui-chart-foot"><span>JAN</span><span>APR</span><span>JUL</span><span>OCT</span></div>
            </div>
            <div className="ca-landing-universe-ui-flow"><span>CONNECT</span><i aria-hidden="true">→</i><span>TRANSFORM</span><i aria-hidden="true">→</i><span>VISUALIZE</span></div>
          </div>
        </div>
        <div className="ca-landing-universe-stage-bottom">
          <span>Original Login Portal core · Illustrative dashboard data</span>
          <span>Immersive theme family</span>
        </div>
      </div>
      <p className="ca-landing-universe-disclaimer">
        Original idle-state core from the installed Login Portal, scoped to this preview only. Dashboard numbers remain illustrative.
      </p>
    </div>
  );
}
