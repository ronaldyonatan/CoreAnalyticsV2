// Compare real healthcare picker markup with baseline components in an isolated
// local Vite fixture. Temporary source files are removed in finally.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(project, 'src');
const origin = process.env.SHELL_TEST_ORIGIN ?? 'http://127.0.0.1:5173';
const themes = ['cosmic-black', 'aurora', 'solaris', 'obsidian', 'quartz', 'jec-horizon', 'jec-skywave'];
const contexts = ['standalone', 'daily', 'company'];
const touch = process.env.SHELL_TOUCH === '1';
const baselineDirectory = process.env.BASELINE_DIRECTORY;
const baselineRef = process.env.BASELINE_REF ?? 'HEAD';
const temporary = [
  'src/components/PanelFilterHealthcare.baseline-qa.tsx',
  'src/components/SciFiDropdown.baseline-qa.tsx',
  'src/theme-qa/dropdowns.tsx', 'theme-qa.html', 'src/theme-qa/utilities.css',
].map(file => path.join(project, file));
const fixtureSource = String.raw`import React, { useState } from 'react';
import {createRoot} from 'react-dom/client';
import './utilities.css';
import {ThemeProvider,useTheme} from '../theme/ThemeContext';
import BeforeDaily from '../components/PanelFilterHealthcare.baseline-qa';
import AfterDaily from '../components/PanelFilterHealthcare';
import BeforeCompany from '../components/SciFiDropdown.baseline-qa';
import AfterCompany from '../components/SciFiDropdown';
function Fixture(){
 const {setTheme}=useTheme();(window as any).setFixtureTheme=setTheme;
 const [context,setContext]=useState('standalone');(window as any).setFixtureContext=setContext;
 const [selected,setSelected]=useState('a');(window as any).setFixtureSelected=setSelected;
 const [empty,setEmpty]=useState(false);(window as any).setFixtureEmpty=setEmpty;
 const [open,setOpen]=useState(true);
 return <React.Fragment>{[['before',BeforeDaily,BeforeCompany],['after',AfterDaily,AfterCompany]].map(([id,Daily,Company]:any)=><div key={id} data-fixture={id} className={context==='daily'?'daily-tracking-root':context==='company'?'company-theme-root':''} style={{width:600}}>
 <Daily healthcareList={empty?[]:[{healthcareID:'a',healthcareName:'Clinic A'},{healthcareID:'b',healthcareName:'Clinic B'}]} selectedId={selected} onSelect={setSelected}/>
 <Company isOpen={open} toggle={()=>setOpen(!open)} selectedName="Clinic A" list={empty?[]:[{id:'a',name:'Clinic A'},{id:'b',name:'Clinic B'}]} selectedId={selected} onSelect={setSelected}/>
 </div>)}</React.Fragment>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><Fixture/></ThemeProvider>);
`;
for (const file of temporary) {
  if (fs.existsSync(file)) throw Error('Refusing to overwrite an existing fixture: ' + file);
}
function readBaseline(file) {
  return baselineDirectory ? fs.readFileSync(path.join(baselineDirectory, 'src', file), 'utf8')
    : cp.execFileSync('git', ['show', `${baselineRef}:voice-dashboard/src/${file}`], {cwd: path.dirname(project), encoding: 'utf8'});
}
let socket;
const results = {};
try {
  const baselines = ['PanelFilterHealthcare', 'SciFiDropdown'].map(name => readBaseline(`components/${name}.tsx`));
  fs.mkdirSync(path.dirname(temporary[2]), {recursive: true});
  temporary.slice(0, 2).forEach((file, i) => fs.writeFileSync(file, baselines[i]));
  fs.writeFileSync(temporary[2], fixtureSource);
  // Explicit sources avoid relying on an already-warm Tailwind scanner for
  // baseline-only utilities that are no longer present in the application.
  fs.writeFileSync(temporary[4], '@import "tailwindcss";\n@source "../components/PanelFilterHealthcare.baseline-qa.tsx";\n@source "../components/SciFiDropdown.baseline-qa.tsx";\n@source "../components/PanelFilterHealthcare.tsx";\n@source "../components/SciFiDropdown.tsx";\n');
  fs.writeFileSync(temporary[3], '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/src/theme-qa/dropdowns.tsx"></script></body></html>');
  const targets = await (await fetch(`http://127.0.0.1:${process.env.CHROME_DEBUG_PORT ?? 9333}/json`)).json();
  const target = targets.find(item => item.type === 'page');
  if (!target) throw Error('An isolated Chrome CDP page is required.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {socket.onopen = resolve; socket.onerror = reject;});
  let sequence = 0;
  const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {pending.delete(id); reject(Error('CDP timeout: ' + method));}, 30000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params}));
  });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
  };
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  await call('Page.enable');
  await call('DOM.enable');
  await call('CSS.enable');
  await call('Emulation.setDeviceMetricsOverride', {width: Number(process.env.THEME_VIEWPORT_WIDTH ?? 1440), height: 1000, deviceScaleFactor: 1, mobile: false});
  await call('Emulation.setTouchEmulationEnabled', {enabled: touch, ...(touch ? {maxTouchPoints: 1} : {})});
  await call('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: process.env.THEME_REDUCED_MOTION === '1' ? 'reduce' : 'no-preference'}]});
  await call('Page.navigate', {url: origin + '/theme-qa.html'});
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    await delay(100);
    if (await evaluate('typeof window.setFixtureContext === "function"')) {ready = true; break;}
  }
  if (!ready) throw Error('The picker fixture did not mount.');
  await delay(1800); // Let creation-triggered Vite refreshes settle before CDP handles are read.
  await evaluate(`(() => {const style = document.createElement('style'); style.textContent = '[data-fixture] *,[data-fixture] *::before,[data-fixture] *::after{transition:none!important;animation:none!important}'; document.head.append(style);})()`);
  const pointer = await evaluate("({hover:matchMedia('(hover:hover)').matches, coarse:matchMedia('(pointer:coarse)').matches})");
  if (touch && (pointer.hover || !pointer.coarse)) throw Error('Touch media did not activate.');
  for (const theme of themes) {
    await evaluate(`window.setFixtureTheme(${JSON.stringify(theme)})`);
    await delay(100);
    const differences = [];
    const emptyColors = {};
    let comparisons = 0;
    for (const context of contexts) {
      await evaluate(`window.setFixtureContext(${JSON.stringify(context)})`);
      await delay(40);
      await evaluate(`document.querySelectorAll('[data-fixture] .daily-themed-control').forEach(element => {if (!element.parentElement.querySelector('input')) element.click();})`);
      await delay(40);
      for (const selection of ['a', '', 'empty']) {
        await evaluate(`window.setFixtureEmpty(${selection === 'empty'}); window.setFixtureSelected(${JSON.stringify(selection === 'empty' ? 'a' : selection)});`);
        await delay(40);
        for (const state of ['base', 'hover', 'focus']) {
          const current = await call('DOM.getDocument');
          const {nodeIds} = await call('DOM.querySelectorAll', {nodeId: current.root.nodeId, selector: '[data-fixture] *'});
          await Promise.all(nodeIds.map(nodeId => call('CSS.forcePseudoState', {nodeId, forcedPseudoClasses: state === 'base' ? [] : [state]})));
          const snapshots = await evaluate(`(() => {
            const result = {};
            for (const root of document.querySelectorAll('[data-fixture]')) result[root.dataset.fixture] = [root, ...root.querySelectorAll('*')].map(element => ({
              tag: element.tagName, text: element.textContent, styles: [null, '::before', '::after', '::placeholder'].map(pseudo => {
                const style = getComputedStyle(element, pseudo);
                if (pseudo && pseudo !== '::placeholder' && ['none','normal'].includes(style.content)) return {content: style.content};
                return Object.fromEntries([...style].filter(key => !key.startsWith('--')).map(key => [key, style.getPropertyValue(key)]));
              }),
            }));
            return result;
          })()`);
          if (!snapshots.before || snapshots.before.length !== snapshots.after?.length) throw Error('Picker markup differs: ' + theme);
          const label = `${context}/${selection}/${state}`;
          for (let node = 0; node < snapshots.before.length; node++) {
            if (snapshots.before[node].tag !== snapshots.after[node].tag) throw Error('Picker tag differs: ' + label);
            for (let pseudo = 0; pseudo < 4; pseudo++) {
              for (const [property, before] of Object.entries(snapshots.before[node].styles[pseudo])) {
                const after = snapshots.after[node].styles[pseudo][property];
                if (before !== after) differences.push({state: label, node, pseudo, property, before, after});
              }
            }
          }
          if (selection === 'empty' && state === 'base') emptyColors[context] = snapshots.before.find(node => node.text === 'Klinik tidak ditemukan')?.styles[0].color;
          comparisons++;
        }
      }
    }
    results[theme] = {comparisons, differences, emptyColors};
    console.log(`${theme}: ${comparisons} picker states; ${differences.length} differences`, differences.slice(0, 3));
  }
  await call('Page.navigate', {url: 'about:blank'});
  if (process.env.CLINIC_REPORT_PATH) fs.writeFileSync(process.env.CLINIC_REPORT_PATH, JSON.stringify({pointer, results}, null, 2) + '\n');
  if (Object.values(results).some(result => result.differences.length)) process.exitCode = 1;
} finally {
  socket?.close();
  for (const file of temporary) if (fs.existsSync(file)) fs.unlinkSync(file);
  const directory = path.join(source, 'theme-qa');
  if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
}
