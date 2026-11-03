// Compare CSS against a Git baseline in a dedicated, disposable Chrome CDP tab.
// See docs/theme-system-refactor.md for setup, scope and limitations.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';

const dashboardRoot = fileURLToPath(new URL('../', import.meta.url));
const base = path.join(dashboardRoot, 'src/');
const repo = path.resolve(dashboardRoot, '..');
const baseline = process.env.BASELINE_REF ?? 'HEAD';
const baselineDirectory = process.env.BASELINE_DIRECTORY;
function readBaseline(file) {
  return baselineDirectory ? fs.readFileSync(path.join(baselineDirectory, 'src', file), 'utf8')
    : cp.execFileSync('git', ['show', `${baseline}:voice-dashboard/src/${file}`], { cwd: repo, encoding: 'utf8' });
}
const debugPort = process.env.CHROME_DEBUG_PORT ?? '9333';
const themes = process.env.THEME_TEST_THEMES?.split(',') ?? ['cosmic-black', 'aurora', 'solaris', 'obsidian', 'quartz', 'jec-horizon', 'jec-skywave'];

function expand(file, old = false) {
  file = path.normalize(file);
  const text = old
    ? readBaseline(file)
    : fs.readFileSync(path.join(base, file), 'utf8');
  return text.replace(/@import ['"](.+?)['"];?/g, (_, imported) =>
    imported === 'react-grid-layout/css/styles.css' ? fs.readFileSync(path.join(dashboardRoot, 'node_modules', imported), 'utf8') : expand(path.join(path.dirname(file), imported), old));
}

// Match ThemeContext's compatibility order, followed by the page extension.
const sheets = [
  'theme/theme.css',
  'theme/jec-brand-themes.css',
  'theme/jec-blue-field-v4.5.css',
  'design-system/index.css',
  'components/MyAccount.css', 'onboarding/LoginSpotlightTour.css', 'onboarding/PostLoginSpotlightTour.css',
  'components/CompanyMobileGrid.css',
  'dashboards/financial/company-performance-theme.css',
  'management/UserVoiceRegistration.css', 'executiveIntelligence/components/executive-briefing.css',
];
// Normalize renamed renderer hooks; CSS values remain those of the baseline.
const baselineSheets = baselineDirectory ? [
  ...fs.readdirSync(path.join(baselineDirectory, 'src/theme/themes')).sort().map(file => `theme/themes/${file}`),
  'design-system/index.css', 'components/MyAccount.css', 'onboarding/LoginSpotlightTour.css', 'onboarding/PostLoginSpotlightTour.css', 'components/CompanyMobileGrid.css',
  'dashboards/financial/company-performance-theme.css', 'management/UserVoiceRegistration.css', 'executiveIntelligence/components/executive-briefing.css',
].filter(file => fs.existsSync(path.join(baselineDirectory, 'src', file))) : sheets;
const old = (readBaseline('index.css').replace(/@import ['"]tailwindcss['"];?/, '') + '\n' + baselineSheets.map(file => expand(file, true)).join('\n') + '\n' + fs.readFileSync(path.join(dashboardRoot, 'node_modules/react-grid-layout/css/styles.css'), 'utf8'))
  .replaceAll('core-jec-field--skywave', 'ds-environment-field--animated')
  .replaceAll('core-jec-field--horizon', 'ds-environment-field--static')
  .replaceAll('core-jec-field', 'ds-environment-field')
  .replaceAll('jecField', 'dsField')
  .replaceAll("core-aurora-ribbon--cyan", "ds-environment-curtain--primary")
  .replaceAll("core-aurora-ribbon--violet", "ds-environment-curtain--secondary")
  .replaceAll("core-aurora-ribbon--teal", "ds-environment-curtain--tertiary")
  .replaceAll("core-aurora-field", "ds-environment-curtains")
  .replaceAll("core-aurora-ribbon", "ds-environment-curtain")
  .replaceAll("core-aurora-stars", "ds-environment-curtain-stars")
  .replaceAll("core-solaris-", "ds-environment-solar-")
  .replaceAll("core-static-field", "ds-environment-technical-grid")
  .replaceAll("coreAurora", "dsCurtain")
  .replaceAll("coreSolaris", "dsSolar");
const fresh = fs.readdirSync(path.join(base, 'theme/themes')).sort()
  .map(file => expand(`theme/themes/${file}`)).join('\n') + expand('design-system/index.css');
const styleAssets = JSON.parse(fs.readFileSync(path.join(dashboardRoot, 'docs/component-style-assets.json'), 'utf8'));
function embeddedStyles(sourceText, block) {
  const tree = ts.createSourceFile('fixture.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const constants = new Map(), styles = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isNoSubstitutionTemplateLiteral(node.initializer)) constants.set(node.name.text, node.initializer.text);
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'style') styles.push(node.children.find(ts.isJsxExpression)?.expression);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  const expression = styles[block];
  if (expression && ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (expression && ts.isIdentifier(expression) && constants.has(expression.text)) return constants.get(expression.text);
  throw Error('Baseline CSS is not static at block ' + block);
}
const mountedAssets = styleAssets.filter(asset => asset.file !== 'Applama.tsx');
const oldMountedStyles = mountedAssets.map(asset => embeddedStyles(readBaseline(asset.file), asset.block)).join('\n');
const freshMountedStyles = mountedAssets.map(asset => expand(asset.asset)).join('\n');
// The original page mounted this stylesheet at runtime, after the imported CSS.
const baselineAppSource = readBaseline('App.tsx');
const baselineAppStyles = baselineAppSource.match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1] ?? '';
const baselineDailySource = readBaseline('dashboards/financial/DailyTracking.tsx');
const baselineDailyTemplate = baselineDailySource.match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1] ?? '';
function baselineDailyStyles(theme) {
  const isLight = ['solaris', 'quartz', 'jec-horizon', 'jec-skywave'].includes(theme);
  return baselineDailyTemplate.replace(/\$\{isLight\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\}/g, (_, light, dark) => isLight ? light : dark);
}

// Header/navigation use real rendered markup, interaction states and Tailwind
// utilities in verify-shell-runtime.mjs; do not fabricate unused legacy hooks.
const isRuntimeShellHook = name => /^(?:core-global-header$|core-brand-logo$|core-icon-button(?:$|-)|core-settings-layer$|core-my-account-sidebar$|core-sidebar$|core-nav-|core-menu-|ds-navigation-|ds-nav-|ds-header-|ds-menu-|ds-settings-voice-icon$)/.test(name);
const classes = new Set();
const briefingClasses = new Set();
for (const css of [old, fresh, oldMountedStyles, freshMountedStyles]) {
  postcss.parse(css).walkRules(rule => {
    for (const match of rule.selector.matchAll(/\.(ebi5-[a-zA-Z0-9_-]+)/g)) briefingClasses.add(match[1]);
    if (rule.selector.includes('data-theme') || rule.selector.includes('data-active-theme') || rule.selector.includes('[class*=')) return;
    for (const match of rule.selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) { if (!match[1].startsWith('ds-environment') && !match[1].startsWith('ds-clinic-') && !match[1].startsWith('my-account-') && !match[1].startsWith('ebi5-') && !/^(?:core-app-shell|core-main-frame|core-theme-option(?:$|-))/.test(match[1]) && !isRuntimeShellHook(match[1])) classes.add(match[1]); }
  });
}

const fixture = `
<main data-active-theme="THEME">
  <div class="executive-briefing-shell"><section class="ebi5-page"><header class="ebi5-shell-header"><div class="ebi5-brand"><strong>Core <span>Briefing</span></strong></div></header>
    <div class="ebi5-presenter-strip"><div class="ebi5-friday speaking"><small>Status</small><strong>Friday</strong><em>Speaking</em><div class="ebi5-friday-orb"><i></i><i></i><b></b></div></div></div>
    <div class="ebi5-presentation"><div class="ebi5-stage">
      <div class="ebi5-metric-panel"><strong class="positive">Positive</strong></div><div class="ebi5-metric-panel"><strong class="negative">Negative</strong></div>
      <div class="ebi5-service-row positive ebi5-explained"><div class="ebi5-service-change">Gain</div><div class="fill"></div></div><div class="ebi5-service-row negative ebi5-explained"><div class="ebi5-service-change">Loss</div><div class="fill"></div></div>
      <div class="ebi5-launch-actions"><button class="primary"><span>Begin</span></button><button class="secondary">Cancel</button></div>
      <svg><path class="ebi5-slope-line" d="M0 0 L10 10"/><circle class="ebi5-slope-dot current" r="2"/><circle class="ebi5-slope-dot old" r="2"/></svg>
      ${[...briefingClasses].filter(name=>name!=='ebi5-page').map(name=>`<div class="${name}">Text</div>`).join('')}
    </div></div><footer class="ebi5-footer">Footer</footer>
  </section></div>
  <div class="login-tour-root"><div class="login-tour-shade login-tour-shade--full"></div><div class="login-tour-focus"><div class="login-tour-focus__scan"></div></div>
    <div class="login-tour-card"><div class="login-tour-card__topline"><span>Step 1</span><span>Tour</span></div><h2>Title</h2><p>Instructions</p>
      <div class="login-tour-tip"><span>Tip</span><span>Info</span></div><div class="login-tour-card__tools"><span>Tools</span><button class="login-tour-audio">Off</button><button class="login-tour-audio is-on">On</button><button class="login-tour-audio is-on" disabled>Disabled</button></div>
      <div class="login-tour-language-wrap"><select class="login-tour-language"><option>Bahasa</option></select></div>
      <div class="login-tour-actions"><button class="login-tour-skip">Skip</button><button class="login-tour-secondary" disabled>Back</button><button class="login-tour-primary">Next</button></div>
    </div><button class="login-tour-replay"><span class="login-tour-replay__pulse"></span>Replay</button>
  </div>
  <div class="core-tour-root"><div class="core-tour-shade core-tour-shade--full"></div><div class="core-tour-focus"><div class="core-tour-focus__scan"></div></div>
    <div class="core-tour-card"><div class="core-tour-card__topline"><span>Step 1</span><span>Tour</span></div><h2>Title</h2><p>Instructions</p>
      <div class="core-tour-tip"><span>Tip</span><span>Info</span></div><div class="core-tour-card__tools"><span>Tools</span><button class="core-tour-audio">Off</button><button class="core-tour-audio is-on">On</button><button class="core-tour-audio is-on" disabled>Disabled</button></div>
      <div class="core-tour-language-wrap"><select class="core-tour-language"><option>Bahasa</option></select></div>
      <div class="core-tour-actions"><button class="core-tour-skip">Skip</button><button class="core-tour-secondary" disabled>Back</button><button class="core-tour-primary">Next</button></div>
    </div><button class="core-tour-replay"><span class="core-tour-replay__pulse"></span>Replay</button>
  </div>
  <section class="my-account-overlay"><button class="my-account-backdrop"></button><div class="my-account-shell">
    <header class="my-account-header"><div class="my-account-avatar"></div><div class="my-account-identity"><h2>User</h2></div><button class="my-account-close">Close</button></header>
    <nav class="my-account-tabs"><button class="active">Password</button><button>Voice</button></nav>
    <div class="my-account-content"><div class="my-account-field"><span>Password</span><input placeholder="Password"></div><div class="my-account-input-wrap"><input placeholder="Confirm"><button>Show</button></div>
    <div class="my-account-actions"><button class="primary">Save</button><button class="secondary" disabled>Cancel</button></div>
    <div class="my-account-alert error">Error</div><div class="my-account-alert success">Success</div><div class="my-account-alert info">Info</div>
    <div class="my-account-voice-status"><div class="my-account-status-orb"></div><div class="my-account-status-copy"><strong>Voice</strong><span>Active</span></div></div>
    <div class="my-account-profile-grid"><div><span>Info</span><strong>Value</strong></div></div>
    <div class="my-account-recorder"><button class="record">Record</button><button class="record stop">Stop</button><small>Info</small></div>
    <div class="my-account-sample"><span>1</span><audio></audio><small>Ready</small><button>Remove</button></div>
    </div></div></section>
  <div class="core-dashboard-frame">
    <div class="management-themed-root user-management-root"><div class="management-stage"></div>
      <div class="management-page-header"></div><div class="management-toolbar"></div>
      <div class="management-metric-card"></div>
      <div class="management-table-shell"><table><thead class="management-table-head">
        <tr><td class="management-table-cell">Text</td></tr>
      </thead></table><div class="management-table-footer"></div></div>
      <input class="management-input" placeholder="Search">
      <div class="management-drawer"></div><div class="management-modal"></div>
      <div class="management-floating-surface"></div><div class="management-overlay"></div>
      ${['text-cyan-50','text-cyan-100','text-cyan-200','text-cyan-300','text-cyan-400','text-slate-200','text-slate-300','text-slate-400','text-slate-500','text-slate-600','text-slate-700','text-white','bg-[#001122]','bg-cyan-500','bg-cyan-950','bg-slate-900','bg-violet-950','border-cyan-500','border-sky-500','border-slate-500','border-violet-500','text-violet-500','text-[9px]','text-[10px]','text-[11px]','text-[12px]'].map(name=>`<span class="${name}">Text</span>`).join('')}
      <button class="bg-cyan-500">Primary</button><button class="bg-cyan-950">Secondary</button>
    </div>
    <div class="company-theme-root"><div class="company-panel"></div>
      <div class="company-exsum-mobile-panel"><div class="company-panel-header"><h4>Header</h4></div><div class="company-tabs"><button>Tab</button></div><select class="company-select"><option>Option</option></select>
      <table class="company-exsum-grid"><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody><tr><td>Revenue</td><td>100</td></tr></tbody></table><div class="company-panel-footer">Footer</div></div>
      <table class="company-pnl-mobile-grid"><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody><tr><td>Expense</td><td>100</td></tr></tbody></table>
    </div>
    <div class="uvr-shell"><div class="uvr-card"><h1 class="uvr-title">Enroll</h1><h2>Voice</h2>
      <div class="uvr-steps"><div class="uvr-step active"><span>1</span></div><div class="uvr-step done"><span>2</span></div><div class="uvr-step skipped"><span>3</span></div></div>
      <div class="uvr-section"><label>Name<input placeholder="Name"></label></div>
      <button class="uvr-primary">Primary</button><button class="uvr-primary" disabled>Disabled</button><button class="uvr-secondary">Secondary</button>
      <div class="uvr-policy"><span class="ok">Verified</span></div><div class="uvr-user"><div>User<small>Info</small><code>01</code></div></div>
      <div class="uvr-recorder"><small>Recorder</small><button class="uvr-record">Record</button><button class="uvr-stop">Stop</button></div>
      <div class="uvr-sample"><span>Sample</span><button>Remove</button></div><div class="uvr-success"><code>Success</code></div>
    </div></div>
    <div class="daily-themed-card"></div>
    <section class="core-settings-popover">
      <div class="core-settings-intro"><div>Title</div><div>Description</div></div>
      <div><div>Label</div><select class="core-control"><option>Option</option></select></div>
      ${['core-my-account-button','core-guided-tour-button','core-voice-guide-button','bg-cyan-500/10'].map(name=>`<button class="${name}"><span>Icon</span><span><span>Action</span><span>Description</span></span></button>`).join('')}
      <div><span>Footer</span><span>Status</span></div>
    </section>
  </div>
  <div class="login-top-hud"><div class="ds-login-top-control">
    <span class="ds-login-top-label"></span><span class="ds-login-status-online"></span>
    <span class="ds-login-status-dot"></span><button class="core-control ds-theme-trigger"></button>
    <div class="ds-theme-menu"><button class="ds-theme-menu-row ds-theme-menu-row--active">
      <span class="ds-theme-menu-description"></span>
    </button></div>
  </div></div>
</main>`;

// Use a dedicated CDP browser: the selected tab is replaced with the fixture.
const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const target = targets.find(item => item.type === 'page');
if (!target) throw new Error('No page found in the dedicated Chrome session.');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 0;
const pending = new Map();
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timeout);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function snapshot(css, theme) {
  const appearance = ['solaris', 'quartz', 'jec-horizon', 'jec-skywave'].includes(theme) ? 'light' : 'dark';
  const performance = ['obsidian', 'quartz', 'jec-horizon'].includes(theme) ? 'static' : 'immersive';
  const expression = `(() => {
    document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    document.documentElement.dataset.surfaceFamily = ${JSON.stringify(({ 'cosmic-black':'holographic', aurora:'luminous', solaris:'daylight', obsidian:'holographic', quartz:'daylight', 'jec-horizon':'clinical', 'jec-skywave':'clinical' })[theme])};
    document.documentElement.dataset.appearance = ${JSON.stringify(appearance)};
    document.documentElement.dataset.performance = ${JSON.stringify(performance)};
    document.documentElement.dataset.fullscreenTone = ${JSON.stringify(theme.startsWith('jec-') ? 'dark-stage' : 'theme')};
    document.documentElement.dataset.shellComposition = ${JSON.stringify(theme.startsWith('jec-') ? 'layered' : 'opaque')};
    document.head.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = ${JSON.stringify(css)};
    document.head.append(style);
    document.body.innerHTML = ${JSON.stringify(fixture.replace('THEME', theme))};
    const parent = document.querySelector('main');
    parent.dataset.shellComposition = document.documentElement.dataset.shellComposition;
    parent.dataset.surfaceFamily = document.documentElement.dataset.surfaceFamily;
    parent.dataset.performance = document.documentElement.dataset.performance;
    if (${JSON.stringify(theme.startsWith('jec-'))}) {
      const field = document.createElement('div');
      field.className = 'ds-environment-field ds-environment-field--' + (${JSON.stringify(performance)} === 'static' ? 'static' : 'animated');
      field.innerHTML = '<div class="ds-environment-field__glow"></div><div class="ds-environment-field__grid"></div><div class="ds-environment-field__stars ds-environment-field__stars--a"></div><div class="ds-environment-field__stars ds-environment-field__stars--b"></div><div class="ds-environment-field__wave ds-environment-field__wave--a"></div><div class="ds-environment-field__wave ds-environment-field__wave--b"></div>';
      parent.append(field);
    }
    if (${JSON.stringify(theme === 'aurora')}) {
      const element = document.createElement('div');
      element.className = 'ds-environment-curtains';
      element.innerHTML = '<div class="ds-environment-curtain ds-environment-curtain--primary"></div><div class="ds-environment-curtain ds-environment-curtain--secondary"></div><div class="ds-environment-curtain ds-environment-curtain--tertiary"></div><div class="ds-environment-curtain-stars"></div>';
      parent.append(element);
    }
    if (${JSON.stringify(theme === 'solaris')}) {
      const element = document.createElement('div');
      element.className = 'ds-environment-solar-field';
      element.innerHTML = '<div class="ds-environment-solar-corona"></div><div class="ds-environment-solar-sun"></div><div class="ds-environment-solar-ring"></div><div class="ds-environment-solar-ring ds-environment-solar-ring--b"></div><div class="ds-environment-solar-dust"></div>';
      parent.append(element);
    }
    if (${JSON.stringify(['obsidian', 'quartz'].includes(theme))}) {
      const element = document.createElement('div');
      element.className = 'ds-environment-technical-grid';
      parent.append(element);
    }
    for (const name of ${JSON.stringify([...classes])}) {
      const element = document.createElement('div');
      element.className = name;
      parent.append(element);
    }
    // Freeze CSS motion for deterministic comparisons; JS/WebGL is outside this fixture.
    for (const element of document.querySelectorAll('*')) {
      element.style.animation = 'none';
      element.style.transition = 'none';
    }
    window.__themeCSSSnapshot = () => {
      for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 0; }
      return [...document.querySelectorAll('body *')].map(element =>
      [null, '::before', '::after'].map(pseudo => {
        const style = getComputedStyle(element, pseudo);
        if (pseudo && ['none', 'normal'].includes(style.content)) return { content: style.content };
        return Object.fromEntries([...style].filter(key => !key.startsWith('--'))
          .map(key => [key, style.getPropertyValue(key)]));
      }));
    };
    return window.__themeCSSSnapshot();
  })()`;
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  if (process.env.THEME_DEBUG_SELECTOR) {
    const debug = await call('Runtime.evaluate', {expression: `(() => {
      const e=document.querySelector(${JSON.stringify(process.env.THEME_DEBUG_SELECTOR)}); const matches=[];
      function walk(rules){for(const r of rules){if(r.selectorText){try{if(e.matches(r.selectorText)&&[...r.style].some(p=>p.includes('border')))matches.push({selector:r.selectorText,border:r.style.getPropertyValue('border'),borderColor:r.style.getPropertyValue('border-color')})}catch{}}else if(r.cssRules)walk(r.cssRules)}}
      for(const s of document.styleSheets)walk(s.cssRules);return {matches,color:getComputedStyle(e).borderColor};
    })()`, returnByValue:true});
    console.log('Selector debug', JSON.stringify(debug.result.value));
  }
  if (process.env.THEME_PSEUDO_STATE) {
    const {root} = await call('DOM.getDocument');
    const {nodeIds} = await call('DOM.querySelectorAll', {nodeId: root.nodeId, selector: 'body *'});
    await Promise.all(nodeIds.map(nodeId => call('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: [process.env.THEME_PSEUDO_STATE]})));
    const forced = await call('Runtime.evaluate', {expression: 'window.__themeCSSSnapshot()', returnByValue: true});
    if (forced.exceptionDetails) throw Error(JSON.stringify(forced.exceptionDetails));
    return forced.result.value;
  }
  return result.result.value;
}

const results = {};
try {
  await call('DOM.enable');
  await call('CSS.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: Number(process.env.THEME_VIEWPORT_WIDTH ?? 1440), height: 1000,
    deviceScaleFactor: 1, mobile: false,
  });
  await call('Emulation.setEmulatedMedia', { features: [{
    name: 'prefers-reduced-motion', value: process.env.THEME_REDUCED_MOTION === '1' ? 'reduce' : 'no-preference',
  }] });
  await call('Page.navigate', { url: 'about:blank' });
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const theme of themes) {
    const before = await snapshot(old + '\n' + oldMountedStyles + '\n' + baselineAppStyles + '\n' + baselineDailyStyles(theme), theme);
    const after = await snapshot(fresh + '\n' + freshMountedStyles, theme);
    const differences = [];
    for (let node = 0; node < before.length; node++) {
      for (let pseudo = 0; pseudo < 3; pseudo++) {
        for (const [property, value] of Object.entries(before[node][pseudo])) {
          const actual = after[node][pseudo][property];
          if (value !== actual) differences.push({ node, pseudo, property, before: value, after: actual });
        }
      }
    }
    results[theme] = { nodes: before.length, differences };
    console.log(`${theme}: ${before.length} nodes; ${differences.length} differences`, differences.slice(0, 5));
  }
  if (process.env.THEME_REPORT_PATH) fs.writeFileSync(process.env.THEME_REPORT_PATH, JSON.stringify(results, null, 2));
  if (Object.values(results).some(result => result.differences.length)) process.exitCode = 1;
} finally {
  ws.close();
}
