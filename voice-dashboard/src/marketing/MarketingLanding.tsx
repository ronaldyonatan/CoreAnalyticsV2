import { useCallback, useEffect, useRef, useState } from 'react';
import coreAnalyticsLogo from '../../img/logowithname.png';
import { CosmicLandingBackground, CosmicLandingOrb } from './MarketingCosmicVisuals';
import '../theme/themes/cosmic-black.css';
import MarketingThemeShowcase from './MarketingThemeShowcase';
import './marketing-landing.css';

type SectionId = 'home' | 'platform' | 'capabilities' | 'studio' | 'analytics' | 'themes' | 'intelligence' | 'security' | 'future' | 'contact';
const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'home', label: 'Discover' },
  { id: 'platform', label: 'Platform' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'studio', label: 'Data Studio' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'themes', label: 'Themes' },
  { id: 'intelligence', label: 'Voice' },
  { id: 'security', label: 'Governance' },
  { id: 'future', label: 'Roadmap' },
  { id: 'contact', label: 'Get Started' },
];
const SOURCE_FLOW = [
  { title: 'Sources', body: 'SQL Server · PostgreSQL · Online sources', step: '01' },
  { title: 'Processing', body: 'ETL · Pipelines · Scheduler', step: '02' },
  { title: 'Datasets', body: 'Direct · Stored · Parquet', step: '03' },
  { title: 'Intelligence', body: 'Charts · Dashboards · Voice', step: '04' },
];

const CAPABILITIES = [
  { icon: '◇', title: 'Data Connections', body: 'Manage SQL Server, PostgreSQL, and supported source connections through a unified workspace.', status: 'Available / evolving' },
  { icon: '▦', title: 'Dataset Manager', body: 'Work with direct and stored datasets, metadata, exploration, and parquet-backed analytics.', status: 'Available / evolving' },
  { icon: '⌘', title: 'ETL & Pipelines', body: 'Orchestrate Spark processing, transformation, execution history, and data lineage.', status: 'Available / evolving' },
  { icon: '◷', title: 'Scheduler', body: 'Configure automated processing and inspect schedules, run history, and next-run information.', status: 'Available / evolving' },
  { icon: '▥', title: 'Chart Library', body: 'Create and manage visualizations from datasets inside Data Studio.', status: 'Available / evolving' },
  { icon: '◎', title: 'Ownership & Sharing', body: 'Owner-controlled access with Viewer/Editor roles; enforcement is being hardened across all endpoints.', status: 'DEV / hardening' },
];

function SectionHeading({ eyebrow, title, accent, description }: { eyebrow: string; title: string; accent: string; description: string }) {
  return (
    <div className="ca-landing-heading">
      <span className="ca-landing-eyebrow">{eyebrow}</span>
      <h2>{title} <em>{accent}</em></h2>
      <p>{description}</p>
    </div>
  );
}

export default function MarketingLanding({ onLogin }: { onLogin: () => void }) {
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [presenting, setPresenting] = useState(false);
  const [showSignUpNotice, setShowSignUpNotice] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<'performance' | 'tracking' | 'operations'>('performance');
  const presentingRef = useRef(false);
  const activeSectionRef = useRef<SectionId>('home');

  const jumpTo = useCallback((id: SectionId) => {
    const el = document.getElementById(`ca-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
    setActiveSection(id);
    activeSectionRef.current = id;
    setMobileMenu(false);
  }, []);

  const jumpRelative = useCallback((delta: number) => {
    const current = Math.max(0, SECTIONS.findIndex(section => section.id === activeSectionRef.current));
    const next = Math.max(0, Math.min(SECTIONS.length - 1, current + delta));
    jumpTo(SECTIONS[next].id);
  }, [jumpTo]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const candidates = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!candidates.length) return;
      const id = candidates[0].target.id.replace(/^ca-/, '') as SectionId;
      if (!SECTIONS.some(section => section.id === id)) return;
      setActiveSection(id);
      activeSectionRef.current = id;
    }, { rootMargin: '-18% 0px -36% 0px', threshold: [0.2, 0.4, 0.65] });
    SECTIONS.forEach(({ id }) => {
      const element = document.getElementById(`ca-${id}`);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!presentingRef.current || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        jumpRelative(1);
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        jumpRelative(-1);
      } else if (event.key === 'Escape') {
        presentingRef.current = false;
        setPresenting(false);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [jumpRelative]);

  const togglePresentation = () => {
    const next = !presentingRef.current;
    presentingRef.current = next;
    setPresenting(next);
    setMobileMenu(false);
    if (next) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
      jumpTo(activeSectionRef.current);
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  const tabs = {
    performance: { label: 'Performance', headline: '12.8B', metric: '+18.6%', bars: [34, 44, 38, 58, 54, 70, 65, 82, 74, 88] },
    tracking: { label: 'Daily Tracking', headline: '8,421', metric: '+7.2%', bars: [48, 40, 60, 46, 69, 72, 58, 81, 68, 85] },
    operations: { label: 'Operations', headline: '98.4%', metric: '+2.1%', bars: [40, 60, 52, 78, 57, 72, 77, 70, 88, 94] },
  };
  const selected = tabs[analyticsTab];

  return (
    <div className="ca-landing" data-theme="cosmic-black" data-landing-page="true" data-presenting={presenting ? "true" : "false"}>
      <CosmicLandingBackground />
      <header className="ca-landing-header">
        <button type="button" className="ca-landing-logo" onClick={() => jumpTo('home')} aria-label="CoreAnalytics home">
          <img src={coreAnalyticsLogo} alt="CoreAnalytics" />
        </button>
        <nav className={`ca-landing-nav ${mobileMenu ? 'ca-landing-nav--open' : ''}`} aria-label="Landing navigation">
          {(['platform', 'studio', 'analytics', 'themes', 'intelligence', 'security', 'future'] as SectionId[]).map(id => (
            <button type="button" key={id} onClick={() => jumpTo(id)} className={activeSection === id ? 'is-active' : ''}>
              {SECTIONS.find(section => section.id === id)?.label}
            </button>
          ))}
        </nav>
        <div className="ca-landing-header-actions">
          <button type="button" className="ca-landing-link" onClick={onLogin}>Login</button>
          <button type="button" className="ca-landing-btn ca-landing-btn--primary" onClick={() => setShowSignUpNotice(true)}>Sign Up</button>
          <button type="button" className="ca-landing-mobile-toggle" aria-label="Toggle menu" aria-expanded={mobileMenu} onClick={() => setMobileMenu(value => !value)}>☰</button>
        </div>
      </header>

      <main>
        <section className="ca-landing-section ca-landing-hero" id="ca-home">
          <div className="ca-landing-container ca-landing-hero-grid">
            <div className="ca-landing-hero-copy">
              <div className="ca-landing-eyebrow"><span className="ca-landing-live-dot" /> WELCOME TO THE INTELLIGENCE ERA</div>
              <h1><span>Beyond data.</span><em>Beyond limits.</em></h1>
              <p>One intelligent universe to connect your data, orchestrate pipelines, explore insights, and turn complexity into decisive action.</p>
              <div className="ca-landing-cta-row">
                <button className="ca-landing-btn ca-landing-btn--primary" type="button" onClick={() => jumpTo('platform')}>Explore the platform <span aria-hidden="true">↗</span></button>
                <button className="ca-landing-btn ca-landing-btn--secondary" type="button" onClick={togglePresentation}>{presenting ? 'Exit Presentation' : 'Start Presentation'}</button>
              </div>
              <div className="ca-landing-hero-metrics">
                <div><strong>01</strong><span>Unified workspace<br />End to end</span></div>
                <div><strong>Data</strong><span>Processing<br />to intelligence</span></div>
                <div><strong>Voice</strong><span>Conversational<br />experience</span></div>
              </div>
            </div>
            <div className="ca-landing-hero-art">
              <div className="ca-landing-hero-art-label"><small>CORE ANALYTICS</small><strong>NEURAL CORE</strong></div>
              <CosmicLandingOrb />
              <div className="ca-landing-orb-readout ca-landing-orb-readout--top" aria-hidden="true"><small>DATA PIPELINE</small><strong>Connected Sources</strong><span>Processing · Insights</span></div>
              <div className="ca-landing-orb-readout ca-landing-orb-readout--bottom" aria-hidden="true"><small>INTELLIGENCE PULSE</small><strong>System Ready</strong><span>Insights in motion</span></div>
            </div>
          </div>
          <div className="ca-landing-scroll-hint">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></div>
        </section>

        <section className="ca-landing-section" id="ca-platform">
          <div className="ca-landing-container">
            <SectionHeading eyebrow="THE COREANALYTICS UNIVERSE" title="Every capability." accent="One connected platform." description="Reduce fragmentation across acquisition, transformation, analytics, visualization, and executive decision-making. One place to work with information." />
            <div className="ca-landing-three-cols">
              <article className="ca-landing-card"><span className="ca-landing-step">01 / CONNECT</span><h3>Connect the data</h3><p>Bring operational sources into a managed analytical workspace.</p><span className="ca-landing-card-symbol">⌁</span></article>
              <article className="ca-landing-card"><span className="ca-landing-step">02 / TRANSFORM</span><h3>Build intelligence</h3><p>Run pipelines, schedule refreshes, and publish datasets for reuse.</p><span className="ca-landing-card-symbol">◇</span></article>
              <article className="ca-landing-card"><span className="ca-landing-step">03 / VISUALIZE</span><h3>See the insight</h3><p>Turn complex data into charts, dashboards, and executive narratives.</p><span className="ca-landing-card-symbol">▥</span></article>
            </div>
            <div className="ca-landing-platform-banner"><strong>One Data Universe.</strong> <span>From first connection to every decision.</span></div>
          </div>
        </section>

        <section className="ca-landing-section" id="ca-capabilities">
          <div className="ca-landing-container">
            <SectionHeading eyebrow="BUILT FOR MODERN ANALYTICS" title="One workspace." accent="Many superpowers." description="A unified experience across data preparation, scheduling, reporting, and governed collaboration." />
            <div className="ca-landing-capability-grid">
              {CAPABILITIES.map(capability => (
                <article className="ca-landing-card ca-landing-capability" key={capability.title}>
                  <div className="ca-landing-capability-top"><span className="ca-landing-capability-icon">{capability.icon}</span><span className="ca-landing-status">{capability.status}</span></div>
                  <h3>{capability.title}</h3><p>{capability.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ca-landing-section" id="ca-studio">
          <div className="ca-landing-container ca-landing-split">
            <div>
              <SectionHeading eyebrow="DATA STUDIO" title="From scattered sources" accent="to clarity." description="Connect source systems, transform raw information, and publish governed assets—without jumping between tools." />
              <div className="ca-landing-list">
                <div><span>01</span><div><strong>Connect your sources</strong><p>Use managed connectors for operational databases.</p></div></div>
                <div><span>02</span><div><strong>Process with ETL</strong><p>Run monitored pipelines with reusable schedules.</p></div></div>
                <div><span>03</span><div><strong>Publish reusable datasets</strong><p>Direct and stored datasets for analysis and dashboards.</p></div></div>
              </div>
            </div>
            <div className="ca-landing-flow">
              <div className="ca-landing-flow-header"><span>DATA UNIVERSE / PIPELINE FLOW</span><span>DESIGN VIEW</span></div>
              {SOURCE_FLOW.map((step, i) => (
                <div className="ca-landing-flow-stage" key={step.title}>
                  <div className="ca-landing-flow-number">{step.step}</div>
                  <div><strong>{step.title}</strong><small>{step.body}</small></div>
                  <div className="ca-landing-flow-glyph">{['⌁','⇄','▤','▥'][i]}</div>
                  {i < SOURCE_FLOW.length - 1 && <div className="ca-landing-flow-link" aria-hidden="true" />}
                </div>
              ))}
              <div className="ca-landing-flow-footer">SOURCE → ETL → DATASET → INTELLIGENCE</div>
            </div>
          </div>
        </section>

        <section className="ca-landing-section" id="ca-analytics">
          <div className="ca-landing-container ca-landing-split ca-landing-split--reverse">
            <div className="ca-landing-preview">
              <div className="ca-landing-preview-head"><strong>CoreAnalytics / Business Intelligence</strong><span>ILLUSTRATIVE DEMO</span></div>
              <div className="ca-landing-preview-tabs">
                {(Object.entries(tabs) as Array<[keyof typeof tabs, typeof selected]>).map(([id, tab]) => (
                  <button type="button" key={id} className={analyticsTab===id?'is-active':''} onClick={() => setAnalyticsTab(id)}>{tab.label}</button>
                ))}
              </div>
              <div className="ca-landing-preview-metrics">
                <div><small>ILLUSTRATIVE METRIC</small><strong>{selected.headline}</strong></div>
                <div><small>ILLUSTRATIVE CHANGE</small><strong className="ca-landing-up">{selected.metric}</strong></div>
              </div>
              <div className="ca-landing-bars" role="img" aria-label={`${selected.label} demonstration chart with illustrative figures`}>
                {selected.bars.map((value, index) => <div key={`${analyticsTab}-${index}`} style={{ height: `${value}%` }}><span /></div>)}
              </div>
              <div className="ca-landing-chart-months"><span>JAN</span><span>MAR</span><span>MAY</span><span>JUL</span><span>SEP</span></div>
              <p className="ca-landing-chart-note">Demonstration figures only, not actual customer or business data.</p>
            </div>
            <div>
              <SectionHeading eyebrow="BUSINESS INTELLIGENCE" title="See the story" accent="behind every number." description="Visualize performance, examine trends, and present insights with a unified analytical workspace." />
              <div className="ca-landing-list">
                <div><span>↗</span><div><strong>Company Performance</strong><p>Financial and executive performance insights.</p></div></div>
                <div><span>↗</span><div><strong>Daily Tracking</strong><p>Operational monitoring across business activity.</p></div></div>
                <div><span>↗</span><div><strong>Chart Library</strong><p>Reusable visualizations from managed data.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="ca-landing-section ca-landing-universe-section" id="ca-themes">
          <div className="ca-landing-container">
            <SectionHeading
              eyebrow="THE COREANALYTICS EXPERIENCE"
              title="One Platform."
              accent="Multiple Universes."
              description="Discover a workspace with a personality of its own. Explore the real CoreAnalytics theme palettes without leaving this presentation."
            />
            <MarketingThemeShowcase />
          </div>
        </section>

        <section className="ca-landing-section" id="ca-intelligence">
          <div className="ca-landing-container ca-landing-split">
            <div>
              <SectionHeading eyebrow="CONVERSATIONAL EXPERIENCE" title="Don't just view data." accent="Talk to it." description="Voice-driven navigation and executive storytelling make presentations and exploration more intuitive." />
              <div className="ca-landing-quote">“Hey Friday, show me our performance overview.”<small>Illustrative command. Supported phrases depend on the active dashboard and configured language.</small></div>
              <div className="ca-landing-inline-tags"><span>Voice navigation</span><span>Executive briefing</span><span>Guided storytelling</span></div>
            </div>
            <div className="ca-landing-voice-panel">
              <div className="ca-landing-voice-header">VOICE INTELLIGENCE <span>CONCEPT PREVIEW</span></div>
              <CosmicLandingOrb compact />
              <div className="ca-landing-voice-response"><small>ANALYTICS ASSISTANT</small><strong>Insights, explained clearly.</strong><span>Explore the dashboard. Move between sections. Present without breaking your flow.</span></div>
            </div>
          </div>
        </section>

        <section className="ca-landing-section" id="ca-security">
          <div className="ca-landing-container">
            <SectionHeading eyebrow="OWNERSHIP & GOVERNANCE" title="Collaboration" accent="with control." description="Every analytical asset needs a clear owner and explicit access. CoreAnalytics brings governance into the same workspace as data and insights." />
            <div className="ca-landing-three-cols">
              <article className="ca-landing-card"><span className="ca-landing-step">01 / OWNERSHIP</span><h3>Owner-controlled sharing</h3><p>Object owners manage sharing. Recipients cannot share access onward.</p></article>
              <article className="ca-landing-card"><span className="ca-landing-step">02 / ACCESS</span><h3>Viewer & Editor roles</h3><p>Read and edit permissions are separated, with data-plane enforcement still under hardening.</p></article>
              <article className="ca-landing-card"><span className="ca-landing-step">03 / ACCOUNTABILITY</span><h3>Governance & audit</h3><p>Ownership records, explicit grants, and audited access changes support traceability.</p></article>
            </div>
          </div>
        </section>

        <section className="ca-landing-section" id="ca-future">
          <div className="ca-landing-container">
            <SectionHeading eyebrow="THE JOURNEY AHEAD" title="Built today." accent="Designed for what's next." description="CoreAnalytics is evolving toward a complete analytics SaaS, with a clear distinction between working product capabilities and future development." />
            <div className="ca-landing-roadmap">
              <div><span className="ca-landing-roadmap-label">NOW</span><h3>Unified Analytics</h3><p>Existing dashboards, Data Studio, pipelines, scheduling, chart exploration, and voice experience.</p></div>
              <div><span className="ca-landing-roadmap-label">HARDENING</span><h3>Access Enforcement</h3><p>Complete Viewer, Editor, Owner enforcement throughout API, data, and execution paths.</p></div>
              <div><span className="ca-landing-roadmap-label">PLANNED</span><h3>Platform Independence</h3><p>Native CoreAnalytics APIs, reduced legacy gateway dependency, metadata modernization, and backup / recovery.</p></div>
              <div><span className="ca-landing-roadmap-label">FUTURE</span><h3>Full SaaS Experience</h3><p>Tenant onboarding, subscriptions, and customer self-service when those components are built.</p></div>
            </div>
          </div>
        </section>

        <section className="ca-landing-section ca-landing-final" id="ca-contact">
          <div className="ca-landing-container ca-landing-final-content">
            <div className="ca-landing-eyebrow">WELCOME TO WHAT'S POSSIBLE</div>
            <h2>Your data has <em>a bigger future.</em></h2>
            <p>Connect information, empower decisions, and experience the next generation of business intelligence.</p>
            <div className="ca-landing-cta-row">
              <button type="button" className="ca-landing-btn ca-landing-btn--primary" onClick={onLogin}>Login to CoreAnalytics <span aria-hidden="true">↗</span></button>
              <button type="button" className="ca-landing-btn ca-landing-btn--secondary" onClick={() => setShowSignUpNotice(true)}>Sign Up</button>
            </div>
            <small>CoreAnalyticsV2 preview · Cosmic Black · SaaS signup not yet connected</small>
          </div>
        </section>
      </main>

      <footer className="ca-landing-footer"><span>© CoreAnalytics · Data Universe</span><span>Cosmic Black · Product Preview</span></footer>

      {presenting && <div className="ca-landing-presenter-rail" role="group" aria-label="Presentation controls">
        <span>{String(SECTIONS.findIndex(s => s.id === activeSection) + 1).padStart(2, '0')} / {String(SECTIONS.length).padStart(2,'0')}</span>
        <button type="button" onClick={() => jumpRelative(-1)} disabled={activeSection==='home'}>Previous</button>
        <button type="button" onClick={() => jumpRelative(1)} disabled={activeSection==='contact'}>Next</button>
        <button type="button" onClick={togglePresentation}>Exit</button>
      </div>}
      {showSignUpNotice && <div className="ca-landing-modal-backdrop" onClick={() => setShowSignUpNotice(false)} role="presentation">
        <div className="ca-landing-modal" role="dialog" aria-modal="true" aria-labelledby="ca-signup-title" onClick={event => event.stopPropagation()}>
          <span className="ca-landing-eyebrow">SAAS ONBOARDING</span>
          <h3 id="ca-signup-title">Sign Up — Coming Soon</h3>
          <p>Public registration and subscription management are not yet enabled. For now, you can sign in with an existing CoreAnalytics account.</p>
          <div className="ca-landing-cta-row"><button type="button" className="ca-landing-btn ca-landing-btn--primary" onClick={onLogin}>Open Login Portal</button><button type="button" className="ca-landing-btn ca-landing-btn--secondary" onClick={() => setShowSignUpNotice(false)}>Close</button></div>
        </div>
      </div>}
    </div>
  );
}
