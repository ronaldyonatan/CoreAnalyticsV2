// Compare stable Login Portal surfaces with a separately served approved source
// tree. Motion transforms/timing and WebGL pixels are intentionally out of scope.
import fs from 'node:fs';
const beforeOrigin = new URL(process.env.LOGIN_BASELINE_ORIGIN ?? 'http://127.0.0.1:5174').origin;
const afterOrigin = new URL(process.env.SHELL_TEST_ORIGIN ?? 'http://127.0.0.1:5173').origin;
const themes = process.env.SHELL_TEST_THEMES?.split(',') ?? ['cosmic-black','aurora','solaris','obsidian','quartz','jec-horizon','jec-skywave'];
const targets = await (await fetch(`http://127.0.0.1:${process.env.CHROME_DEBUG_PORT ?? 9333}/json`)).json();
const target = targets.find(item => item.type === 'page');
if (!target) throw Error('An isolated Chrome CDP page is required.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject) => {socket.onopen=resolve; socket.onerror=reject;});
let sequence=0;
const pending=new Map();
const call=(method,params={}) => new Promise((resolve,reject) => {
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
socket.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Fetch.requestPaused'){
    const {requestId,request}=message.params;
    const local=[beforeOrigin,afterOrigin].includes(new URL(request.url).origin);
    call(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId}:{requestId,errorReason:'Aborted'}).catch(()=>{});
    return;
  }
  const request=pending.get(message.id);if(!request)return;
  clearTimeout(request.timer);pending.delete(message.id);
  message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);
};
const evaluate=async expression=>{
  const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let initScript;
const report={};
try{
  await call('Page.enable');
  await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await call('Emulation.setDeviceMetricsOverride',{width:Number(process.env.THEME_VIEWPORT_WIDTH??1440),height:1000,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const theme of themes){
    const {identifier}=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
      if([${JSON.stringify(beforeOrigin)},${JSON.stringify(afterOrigin)}].includes(location.origin)){
        localStorage.removeItem('core_authenticated_user');
        localStorage.setItem('coreanalytics-theme',${JSON.stringify(theme)});
        localStorage.setItem('core_login_onboarding_v1','done');
        new MutationObserver(()=>{
          if(!window.__loginPaintScheduled && document.querySelector('.login-top-hud')){
            window.__loginPaintScheduled=true;requestAnimationFrame(()=>{window.__firstLoginPaint={theme:document.documentElement.dataset.theme,appearance:document.documentElement.dataset.appearance};});
          }
        }).observe(document,{childList:true,subtree:true});
        let seed=20261103; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
        if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>Promise.reject(Error('Local CSS QA does not access the microphone'));
        class Recognition {start(){this.onstart?.();}stop(){this.onend?.();}abort(){this.onend?.();}}
        window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=Recognition;
        if(window.speechSynthesis){speechSynthesis.cancel=()=>{};speechSynthesis.speak=u=>queueMicrotask(()=>{u.onstart?.();u.onend?.();});}
      }
    `});
    initScript=identifier;
    const snapshots=[],firstFrames=[];
    for(const origin of [beforeOrigin,afterOrigin]){
      await call('Page.navigate',{url:origin});
      let ready=false;
      for(let attempt=0;attempt<100;attempt++){
        await delay(100);
        if(await evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)} && !!document.querySelector('.login-top-hud')`)){ready=true;break;}
      }
      if(!ready)throw Error('Login Portal failed to mount: '+origin+' '+theme);
      await delay(4500);
      const snapshot=await evaluate(`(() => {
        for(const animation of document.getAnimations()){animation.pause();animation.currentTime=0;}
        const properties=['color','background-color','background-image','box-shadow','font-family','font-size','font-weight','line-height','letter-spacing','display','position','width','height','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','backdrop-filter','-webkit-backdrop-filter','fill','stroke',...['top','right','bottom','left'].flatMap(side=>['border-'+side+'-color','border-'+side+'-width','border-'+side+'-style']),...['top-left','top-right','bottom-right','bottom-left'].map(corner=>'border-'+corner+'-radius')];
        const selectors='button,input,select,label,.login-top-hud,.login-hud-surface,.ds-login-top-control,.frameless-core-stage,.jec-brand-orb';
        const elements=[...new Set([...document.querySelectorAll(selectors)].flatMap(root=>[root,...root.querySelectorAll('*')]))];
        return elements.map(element=>({tag:element.tagName,hook:typeof element.className==='string'?element.className:element.className.baseVal,styles:[null,'::before','::after'].map(pseudo=>{
          const style=getComputedStyle(element,pseudo);
          if(pseudo&&['none','normal'].includes(style.content))return {content:style.content};
          return Object.fromEntries(properties.map(property=>[property,style.getPropertyValue(property).replaceAll(location.origin,'<local>')]));
        })}));
      })()`);
      if(snapshot.length<10)throw Error('Login surface fixture was unexpectedly empty.');
      snapshots.push(snapshot);
      firstFrames.push(await evaluate('window.__firstLoginPaint ?? null'));
    }
    const [before,after]=snapshots,differences=[];
    if(before.length!==after.length)differences.push({kind:'node-count',before:before.length,after:after.length});
    else for(let node=0;node<before.length;node++){
      if(before[node].tag!==after[node].tag){differences.push({node,kind:'tag'});continue;}
      for(let pseudo=0;pseudo<3;pseudo++)for(const [property,value]of Object.entries(before[node].styles[pseudo]))if(value!==after[node].styles[pseudo][property])differences.push({node,hook:after[node].hook,pseudo,property,before:value,after:after[node].styles[pseudo][property]});
    }
    if(firstFrames[1]?.theme!==theme)differences.push({kind:'first-paint-theme',expected:theme,actual:firstFrames[1]});
    report[theme]={nodes:after.length,firstPaintTheme:firstFrames[1]?.theme,differences};
    console.log(`${theme}: ${after.length} login surface nodes; ${differences.length} differences`,differences.slice(0,3));
    await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:initScript});initScript=undefined;
  }
  if(process.env.LOGIN_REPORT_PATH)fs.writeFileSync(process.env.LOGIN_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
  if(Object.values(report).some(result=>result.differences.length))process.exitCode=1;
}finally{
  if(initScript)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:initScript}).catch(()=>{});
  await call('Page.navigate',{url:'about:blank'}).catch(()=>{});
  await call('Fetch.disable').catch(()=>{});
  socket.close();
}
