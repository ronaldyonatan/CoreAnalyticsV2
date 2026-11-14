import assert from 'node:assert/strict';
import { hydrateDashboard, dashboardApi, dashboardFingerprint } from '../src/dataStudio/dashboardPersistence.ts';
const calls=[];
globalThis.fetch=async (url, options) => {
  calls.push([url,options]);
  if (url.includes('/charts/datasets/')) return {ok:true,json:async()=>({success:true,data:{columns:[{name:'branch',type:'varchar'}]}})};
  if (url.includes('/charts/')) return {ok:true,json:async()=>({success:true,data:{chart_id:'chart-1',config:{dataset_id:'dataset-1',dataset_kind:'DIRECT'}}})};
  return {ok:false,status:503,json:async()=>({success:false,code:'DASHBOARD_SERVICE_UNAVAILABLE'})};
};
const document={version:2,pages:[{id:'page-1',name:'Overview'}],cards:[{id:'a',chart_id:'chart-1'},{id:'b',chart_id:'chart-1'}],frames:[],blocks:[],style:{}};
const loaded=await hydrateDashboard('Example',document);
assert.equal(dashboardFingerprint('Example',document),dashboardFingerprint('Example',{style:{},blocks:[],frames:[],cards:document.cards,pages:document.pages,version:2}));
assert.equal(loaded.charts['chart-1'].columns[0].name,'branch');
assert.equal(calls.length,2); // Repeated chart instances share one authorized lookup.
await assert.rejects(hydrateDashboard('Broken',{...document,version:1}),/DASHBOARD_FORMAT_UNSUPPORTED/);
await assert.rejects(dashboardApi('/designer/dashboards'),/DASHBOARD_SERVICE_UNAVAILABLE/);
assert.ok(calls.every(([,options])=>options.credentials==='include'));
console.log('Dashboard persistence client tests passed.');
