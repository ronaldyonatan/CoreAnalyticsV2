// Functional UI checks use a separate CDP browser; backend requests are blocked.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const origin = new URL(process.env.SHELL_TEST_ORIGIN ?? 'http://127.0.0.1:5173').origin;
const targets = await (await fetch(`http://127.0.0.1:${process.env.CHROME_DEBUG_PORT ?? 9333}/json`)).json();
const ws = new WebSocket(targets.find(item => item.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0, init;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 30000);
  pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Fetch.requestPaused') {
    const { requestId, request } = message.params;
    const local = new URL(request.url).origin === origin;
    call(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId } : { requestId, errorReason: 'Aborted' }).catch(() => {});
    return;
  }
  const request = pending.get(message.id); if (!request) return;
  clearTimeout(request.timer); pending.delete(message.id);
  message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
};
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(expression)) return; await delay(100); }
  throw Error('UI did not become ready: ' + expression);
}
const themes = ['cosmic-black', 'aurora', 'solaris', 'obsidian', 'quartz', 'jec-horizon', 'jec-skywave', 'lunar-eclipse'];
const expectedVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;
const report = [];
try {
  await call('Page.enable');
  // Keep the isolated headless tab focused, as when the user operates the UI.
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setEmulatedMedia', { features: [] });
  await call('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  for (const [width, height] of [[1440, 1000], [390, 844], [390, 568]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const theme of themes) {
      init = (await call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){
        localStorage.setItem('coreanalytics-theme',${JSON.stringify(theme)});
        localStorage.setItem('core_login_onboarding_v1','done');localStorage.removeItem('core_authenticated_user');
        if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>Promise.reject(Error('Local UI QA'));
        class Recognition{start(){this.onstart?.();}stop(){this.onend?.();}abort(){this.onend?.();}}window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=Recognition;
        if(window.speechSynthesis){speechSynthesis.cancel=()=>{};speechSynthesis.speak=()=>{};}
      }` })).identifier;
      await call('Page.navigate', { url: origin });
      await until(`document.documentElement?.dataset.theme===${JSON.stringify(theme)}&&!!document.querySelector('.ds-release-badge')`);
      assert.ok(await evaluate(`document.querySelector('.ds-release-badge').textContent.includes(${JSON.stringify('V' + expectedVersion)})`));
      await evaluate(`document.querySelector('.ds-theme-trigger').click()`);
      await until(`!!document.querySelector('.ds-theme-menu-options')`);
      try { await until(`!!document.activeElement?.closest('.ds-theme-menu')`); }
      catch (error) {
        console.log('Focus diagnostic', await evaluate(`({theme:document.documentElement.dataset.theme,active:document.activeElement?.outerHTML.slice(0,250),hasFocus:document.hasFocus(),selected:document.querySelector('.ds-theme-menu [aria-checked="true"]')?.outerHTML.slice(0,500),modal:!!document.querySelector(':modal'),menu:document.querySelector('.ds-theme-menu')?.getBoundingClientRect().toJSON()})`));
        throw error;
      }
      const menu = await evaluate(`(()=>{const m=document.querySelector('.ds-theme-menu'),s=m.querySelector('.ds-theme-menu-options'),r=m.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,count:m.querySelectorAll('[role=menuitemradio]').length,scrollable:s.scrollHeight>s.clientHeight,portal:m.parentElement===document.body};})()`);
      assert.equal(menu.count, 8); assert.equal(menu.portal, true);
      assert.ok(menu.top >= 0 && menu.bottom <= height && menu.left >= 0 && menu.right <= width, JSON.stringify(menu));
      assert.ok(menu.scrollable, 'Menu must scroll with 8 descriptions');
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35, nativeVirtualKeyCode: 35 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35, nativeVirtualKeyCode: 35 });
      const last = await evaluate(`(()=>{const rows=[...document.querySelectorAll('.ds-theme-menu [role=menuitemradio]')],row=rows.at(-1),r=row.getBoundingClientRect(),m=document.querySelector('.ds-theme-menu').getBoundingClientRect();return {focused:document.activeElement===row,visible:r.bottom<=m.bottom+1&&r.top>=m.top};})()`);
      assert.ok(last.focused && last.visible, JSON.stringify(last));
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await until(`!document.querySelector('.ds-theme-menu')`);
      assert.ok(await evaluate(`document.activeElement===document.querySelector('.ds-theme-trigger')`));
      await evaluate(`document.querySelector('.ds-release-badge').click()`);
      await until(`!!document.querySelector('.ds-release-dialog[open]')`);
      const dialog = await evaluate(`(()=>{const d=document.querySelector('.ds-release-dialog'),r=d.getBoundingClientRect(),b=document.querySelector('.ds-release-badge').getBoundingClientRect();return {title:d.querySelector('h2').textContent,sections:[...d.querySelectorAll('section h3')].map(e=>e.textContent),top:r.top,bottom:r.bottom,left:r.left,right:r.right,modal:d.matches(':modal'),focusInside:d.contains(document.activeElement),badgeVisible:b.bottom<=innerHeight&&b.left>=0};})()`);
      assert.equal(dialog.title, 'CoreAnalytics V' + expectedVersion);
      assert.deepEqual(dialog.sections, ['Fitur baru', 'Peningkatan', 'Perbaikan']);
      assert.ok(dialog.modal && dialog.focusInside && dialog.badgeVisible);
      assert.ok(dialog.top >= 0 && dialog.bottom <= height + 1 && dialog.left >= 0 && dialog.right <= width, JSON.stringify(dialog));
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await until(`!document.querySelector('.ds-release-dialog[open]')`);
      if (theme === 'lunar-eclipse' && width === 1440 && process.env.RELEASE_SCREENSHOT) {
        await evaluate(`document.querySelector('.ds-release-badge').click()`);
        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(process.env.RELEASE_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
        await evaluate(`document.querySelector('.ds-release-dialog').close()`);
      }
      report.push({ theme, width, height, version: expectedVersion, menu, keyboardLastRowReachable: true, releaseDialog: dialog, escapeCloses: true });
      console.log(`${theme} ${width}x${height}: menu and release dialog passed`);
      await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: init }); init = undefined;
    }
  }
  if (process.env.LOGIN_RELEASE_REPORT) fs.writeFileSync(process.env.LOGIN_RELEASE_REPORT, JSON.stringify(report, null, 2) + '\n');
} finally {
  if (init) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: init }).catch(() => {});
  await call('Page.navigate', { url: 'about:blank' }).catch(() => {});
  await call('Fetch.disable').catch(() => {}); ws.close();
}
