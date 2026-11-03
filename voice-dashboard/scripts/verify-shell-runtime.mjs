// A disposable local-browser fixture. It seeds only a synthetic local session and
// blocks all requests outside the Vite origin; no real authentication is tested.
import fs from 'node:fs';
const origin = new URL(process.env.SHELL_TEST_ORIGIN ?? 'http://127.0.0.1:5173').origin;
const baselineFile = process.env.SHELL_BASELINE_PATH ?? '/tmp/coreanalytics-shell-approved.json';
const themes = process.env.SHELL_TEST_THEMES?.split(',') ?? ['cosmic-black', 'aurora', 'solaris', 'obsidian', 'quartz', 'jec-horizon', 'jec-skywave'];
const targets = await (await fetch(`http://127.0.0.1:${process.env.CHROME_DEBUG_PORT ?? 9333}/json`)).json();
const target = targets.find(item => item.type === 'page');
if (!target) throw Error('A dedicated Chrome CDP page is required.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Fetch.requestPaused') {
    const { requestId, request } = message.params;
    const local = new URL(request.url).origin === origin;
    call(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId } : { requestId, errorReason: 'Aborted' }).catch(() => {});
    return;
  }
  const request = pending.get(message.id);
  if (!request) return;
  clearTimeout(request.timer);
  pending.delete(message.id);
  message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
};
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function click(selector) {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw Error('Missing shell control: ' + ${JSON.stringify(selector)}); element.click(); })()`);
  await delay(120);
}
async function freezeMotion() {
  await evaluate(`(() => { if (!document.querySelector('.core-global-header')) throw Error('Shell did not mount'); const style=document.createElement('style'); style.textContent='html[data-theme] body * { transition:none!important;animation:none!important; } html[data-theme] body .core-global-header::after { animation:none!important; }'; document.head.append(style); })()`);
}
async function forceHover(selector) {
  // App may replace a navigation node during a clock/state render. Resolve it
  // afresh rather than treating a detached CDP handle as a product regression.
  let hovered;
  for (let attempt = 0; attempt < 3; attempt++) {
    const {root} = await call('DOM.getDocument');
    const {nodeId} = await call('DOM.querySelector', {nodeId: root.nodeId, selector});
    if (!nodeId) throw Error(`Missing hover target: ${selector}`);
    try {
      await call('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: ['hover']});
      hovered = nodeId;
      break;
    } catch (error) {
      if (!error.message.includes('Could not find node with given id') || attempt === 2) throw error;
    }
  }
  // CSS transitions are already frozen; no timed pause is needed here.
  return async () => {
    try { await call('CSS.forcePseudoState', {nodeId: hovered, forcedPseudoClasses: []}); }
    catch (error) {
      // A removed node also loses its forced pseudo state.
      if (!error.message.includes('Could not find node with given id')) throw error;
    }
  };
}

async function snapshot() {
  return evaluate(`(() => {
    const roots=[...document.querySelectorAll('.core-global-header, [data-tour="navigation-sidebar"], [aria-label="Close navigation overlay"]')];
    const elements=roots.flatMap(root=>[root,...root.querySelectorAll('*')]);
    return elements.map(element=>({tag:element.tagName,hook:typeof element.className==='string'?element.className:element.className.baseVal,styles:[null,'::before','::after'].map(pseudo=>{
      const style=getComputedStyle(element,pseudo);
      if(pseudo && ['none','normal'].includes(style.content)) return {content:style.content};
      return Object.fromEntries([...style].filter(key=>!key.startsWith('--')).map(key=>[key,style.getPropertyValue(key)]));
    })}));
  })()`);
}
const results = {};
let initScriptId;
try {
  await call('Page.enable');
  await call('DOM.enable');
  await call('CSS.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await call('Emulation.setDeviceMetricsOverride', { width: Number(process.env.THEME_VIEWPORT_WIDTH ?? 1440), height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: process.env.SHELL_REDUCED_MOTION === '1' ? 'reduce' : 'no-preference' }] });
  await call('Emulation.setTouchEmulationEnabled', {
    enabled: process.env.SHELL_TOUCH === '1',
    ...(process.env.SHELL_TOUCH === '1' ? { maxTouchPoints: 1 } : {}),
  });
  const pointer = await evaluate("({ hover: matchMedia('(hover:hover)').matches, none: matchMedia('(hover:none)').matches, coarse: matchMedia('(pointer:coarse)').matches })");
  if (process.env.SHELL_TOUCH === '1' && (pointer.hover || !pointer.none || !pointer.coarse)) throw Error('Touch media emulation did not activate');
  const { identifier } = await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (${JSON.stringify(process.env.SHELL_EXTENDED_STATES === '1')}) {
      class MockSpeechRecognition { start(){ this.onstart?.(); } abort(){ this.onend?.(); } }
      window.SpeechRecognition = MockSpeechRecognition;
      window.webkitSpeechRecognition = MockSpeechRecognition;
    }
    localStorage.setItem('core_authenticated_user', JSON.stringify({user_id:'theme-shell-qa',username:'theme-shell-qa',display_name:'Theme Shell QA',groups:[],menus:['daily_tracking','company_performance','user_management','group_management'].map(route_key=>({menu_id:route_key,menu_code:route_key,menu_name:route_key,route_key})),auth_method:'password',authenticated_at:'2026-11-03T00:00:00Z'}));
    localStorage.setItem('core_postlogin_onboarding_v1_theme-shell-qa','done');
  ` });
  initScriptId = identifier;
  await call('Page.navigate', { url: origin });
  await delay(2000);
  for (const theme of themes) {
    await evaluate(`localStorage.setItem('coreanalytics-theme',${JSON.stringify(theme)})`);
    await call('Page.navigate', { url: origin });
    await delay(1600);
    await freezeMotion();
    // All widths use the same logical initial state for comparison.
    if (Number(process.env.THEME_VIEWPORT_WIDTH ?? 1440) < 1024) {
      await click('[data-tour="navigation-trigger"]');
      await click('[data-tour="navigation-sidebar"] button[title="Pin navigation"]');
    }
    const states = {};
    states.pinnedExpanded = await snapshot();
    if (process.env.SHELL_EXTENDED_STATES === '1') {
      for (const [name, selector] of [
        ['accountSidebarHover', '[data-tour="my-account-sidebar"]'],
        ['pinActiveHover', '[data-tour="navigation-sidebar"] button[title="Unpin navigation"]'],
        ['voiceOffHover', '[data-tour="voice-activation-toggle"]'],
        ['logoutHover', '[data-tour="navigation-sidebar"] button[title="Logout"]'],
      ]) { const clear=await forceHover(selector); states[name]=await snapshot(); await clear(); }
      await click('[data-tour="voice-activation-toggle"]');
      states.voiceOn = await snapshot();
      const clear=await forceHover('[data-tour="voice-activation-toggle"]');
      states.voiceOnHover=await snapshot(); await clear();
      await click('[data-tour="voice-activation-toggle"]');
    }
    for (const [name, selector] of [
      ['groupHover', '.core-nav-group-button'],
      ['activeChildHover', '.core-nav-child-active'],
      ['idleChildHover', '.core-nav-child-button:not(.core-nav-child-active)'],
    ]) {
      const clear = await forceHover(selector);
      states[name] = await snapshot();
      await clear();
    }
    await click('[data-tour="navigation-trigger"]');
    states.pinnedCollapsed = await snapshot();
    await click('[data-tour="navigation-sidebar"] button[title="Unpin navigation"]');
    // Existing mobile behavior closes the rail on unpin. Open it explicitly
    // before checking the floating-drawer state; do not change app behavior.
    const drawerOpen = await evaluate(`Boolean(document.querySelector('[data-tour="navigation-sidebar"] button[title="Close navigation"]'))`);
    if (!drawerOpen) await click('[data-tour="navigation-trigger"]');
    states.drawerExpanded = await snapshot();
    if (process.env.SHELL_EXTENDED_STATES === '1') {
      for (const [name, selector] of [
        ['pinIdleHover', '[data-tour="navigation-sidebar"] button[title="Pin navigation"]'],
        ['drawerCloseHover', '[data-tour="navigation-sidebar"] button[title="Close navigation"]'],
      ]) { const clear=await forceHover(selector); states[name]=await snapshot(); await clear(); }
    }
    await click('[data-tour="navigation-sidebar"] button[title="Close navigation"]');
    states.drawerClosed = await snapshot();
    await click('[data-tour="settings-button"]');
    states.settingsOpen = await snapshot();
    const clear = await forceHover('.core-my-account-button');
    states.settingsActionHover = await snapshot();
    await clear();
    results[theme] = states;
    console.log(`${theme}: captured ${Object.keys(states).length} shell states`);
  }
  if (process.argv.includes('--capture')) {
    fs.writeFileSync(baselineFile, JSON.stringify(results));
    console.log(`Shell snapshot captured: ${baselineFile}`);
  } else {
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    const report = {};
    for (const [theme, states] of Object.entries(results)) {
      const differences = [];
      for (const [state, nodes] of Object.entries(states)) {
        const before = baseline[theme]?.[state];
        if (!before || before.length !== nodes.length) { differences.push({state, kind:'node-count',before:before?.length,after:nodes.length}); continue; }
        for (let node=0;node<nodes.length;node++) {
          if(before[node].tag!==nodes[node].tag){differences.push({state,node,kind:'tag'});continue;}
          for(let pseudo=0;pseudo<3;pseudo++) {
            const keys=new Set([...Object.keys(before[node].styles[pseudo]),...Object.keys(nodes[node].styles[pseudo])]);
            for(const property of keys){const old=before[node].styles[pseudo][property],actual=nodes[node].styles[pseudo][property];if(old!==actual)differences.push({state,node,hook:nodes[node].hook,pseudo,property,before:old,after:actual});}
          }
        }
      }
      report[theme] = { states: Object.keys(states).length, differences };
      console.log(`${theme}: ${differences.length} differences`, differences.slice(0,5));
    }
    if(process.env.SHELL_REPORT_PATH)fs.writeFileSync(process.env.SHELL_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
    if(Object.values(report).some(item=>item.differences.length))process.exitCode=1;
  }
} finally {
  if (initScriptId) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScriptId }).catch(()=>{});
  await call('Page.navigate', { url: 'about:blank' }).catch(()=>{});
  await call('Fetch.disable').catch(()=>{});
  socket.close();
}
