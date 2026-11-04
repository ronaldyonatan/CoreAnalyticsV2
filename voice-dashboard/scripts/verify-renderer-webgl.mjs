// Render the actual fullscreen Daily chart on both origins. Input parity is
// checked separately; this smoke test checks successful draw calls/context state.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
const baseline=process.env.BASELINE_DIRECTORY;
if(!baseline)throw Error('Set BASELINE_DIRECTORY to the separately served baseline project root.');
const origins=[process.env.LOGIN_BASELINE_ORIGIN??'http://127.0.0.1:5174',process.env.SHELL_TEST_ORIGIN??'http://127.0.0.1:5173'];
const names=['theme-renderer-runtime-qa.html','theme-renderer-runtime-qa.tsx'];
const source=`import React from 'react';
import {createRoot} from 'react-dom/client';
import {_roots} from '@react-three/fiber';
import {ThemeProvider} from './src/theme/ThemeContext';
import DailyRevenueChart from './src/components/DailyRevenueChart';
import './src/index.css';
window.__themeChartRoots=_roots;
createRoot(document.getElementById('root')!).render(<ThemeProvider><div style={{width:1400,height:900}}><DailyRevenueChart isLoaded isFullscreen onExpand={()=>{}} dailyData={[{day:1,adm:120,sur:35,rev:12000000},{day:2,adm:155,sur:42,rev:18000000},{day:3,adm:90,sur:28,rev:9000000}]} /></div></ThemeProvider>);`;
const created=[];
let socket,sequence=0,init;
const pending=new Map();
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const themes=['cosmic-black','aurora','solaris','obsidian','quartz','jec-horizon','jec-skywave'];
const report={};
try{
 for(const root of [baseline,project])for(let i=0;i<names.length;i++){
  const file=path.join(root,names[i]);if(fs.existsSync(file))throw Error('Fixture already exists: '+file);
  fs.writeFileSync(file,i===0?'<div id="root"></div><script type="module" src="/theme-renderer-runtime-qa.tsx"></script>':source);created.push(file);
 }
 const targets=await(await fetch(`http://127.0.0.1:${process.env.CHROME_DEBUG_PORT??9333}/json`)).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==='Fetch.requestPaused'){const{requestId,request}=m.params;const local=origins.includes(new URL(request.url).origin);call(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId}:{requestId,errorReason:'Aborted'}).catch(()=>{});return;}const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 await call('Page.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 for(const id of themes){
  init=(await call('Page.addScriptToEvaluateOnNewDocument',{source:`if(${JSON.stringify(origins)}.includes(location.origin))localStorage.setItem('coreanalytics-theme',${JSON.stringify(id)});`})).identifier;
  const snapshots=[];
  for(const origin of origins){
   await call('Page.navigate',{url:origin+'/'+names[0]});let snapshot;
   for(let attempt=0;attempt<100;attempt++){
    await new Promise(r=>setTimeout(r,150));
    snapshot=await evaluate(`(()=>{if(document.documentElement.dataset.theme!==${JSON.stringify(id)}||!window.__themeChartRoots||!document.querySelector('#root > div'))return null;return {canvasCount:document.querySelectorAll('canvas').length,scenes:[...window.__themeChartRoots.values()].map(root=>{const s=root.store.getState();let ambient; s.scene.traverse(o=>{if(o.isAmbientLight)ambient=o.intensity;});return {background:s.scene.background?.getHexString(),fog:s.scene.fog?.color.getHexString(),ambient,drawCalls:s.gl.info.render.calls,contextLost:s.gl.getContext().isContextLost()};})};})()`);
    const isStatic=['obsidian','quartz','jec-horizon'].includes(id);
    if(snapshot&&(isStatic?snapshot.canvasCount===0:snapshot.scenes.length===1&&snapshot.scenes[0].drawCalls>0))break;
   }
   assert.ok(snapshot,'Chart failed to mount '+origin+'/'+id);
   if(['obsidian','quartz','jec-horizon'].includes(id))assert.equal(snapshot.canvasCount,0);
   else{assert.equal(snapshot.canvasCount,1);assert.equal(snapshot.scenes.length,1);assert.ok(snapshot.scenes[0].drawCalls>0,'No WebGL draw calls '+origin+'/'+id);assert.equal(snapshot.scenes[0].contextLost,false);}
   snapshots.push(snapshot);
  }
  const stable=s=>s.scenes.map(({background,fog,ambient,contextLost})=>({background,fog,ambient,contextLost}));
  assert.deepEqual(stable(snapshots[1]),stable(snapshots[0]),id+' actual scene inputs');
  report[id]={before:snapshots[0],after:snapshots[1],sceneInputsEqual:true,pixelComparison:false};console.log(id+': render smoke passed');
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init});init=undefined;
 }
 if(process.env.WEBGL_REPORT_PATH)fs.writeFileSync(process.env.WEBGL_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
}finally{
 if(socket?.readyState===1){if(init)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:init}).catch(()=>{});await call('Page.navigate',{url:'about:blank'}).catch(()=>{});await call('Fetch.disable').catch(()=>{});socket.close();}
 for(const file of created)fs.rmSync(file,{force:true});
}
