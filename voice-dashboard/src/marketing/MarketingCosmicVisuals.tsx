import { memo } from 'react';
import { LoginAtmosphere, LoginIdleCore } from '../LoginPortal';
import { CosmicBlackVisualProvider } from '../theme/ThemeContext';

/**
 * Exact Login Portal 3D components, rendered idle in a local Cosmic Black context.
 * The scoped provider does not change the user's saved theme or document root.
 * This is intentionally separate from MarketingEntry routing and App.tsx.
 */
export const CosmicLandingBackground = memo(function CosmicLandingBackground() {
  return (
    <div className="ca-landing-cosmic-background" aria-hidden="true">
      <CosmicBlackVisualProvider>
        <LoginAtmosphere />
      </CosmicBlackVisualProvider>
      <div className="ca-landing-cosmic-background__wash" />
    </div>
  );
});

export const CosmicLandingOrb = memo(function CosmicLandingOrb({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ca-landing-real-core ${compact ? 'ca-landing-real-core--compact' : ''}`} aria-label="CoreAnalytics Neural Core visual">
      <div className="ca-landing-real-core__halo" aria-hidden="true" />
      <div className="ca-landing-real-core__frame" aria-hidden="true" />
      <CosmicBlackVisualProvider>
        <LoginIdleCore />
      </CosmicBlackVisualProvider>
    </div>
  );
});
