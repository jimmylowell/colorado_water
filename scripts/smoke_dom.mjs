#!/usr/bin/env node
/* Full-page smoke test — loads index.html in jsdom with its real scripts,
   drives the ZIP flow, and asserts every rendered chart is sane. Network
   is stubbed to fail, so this also exercises the offline/snapshot path.
   Run: node scripts/smoke_dom.mjs   (needs `npm install` once, dev-only) */
import {JSDOM,ResourceLoader,VirtualConsole} from 'jsdom';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

class LocalOnly extends ResourceLoader{
  fetch(url,options){
    if(url.startsWith('file:'))return super.fetch(url,options);
    return Promise.resolve(Buffer.from(''));   /* no network in the smoke run */
  }
}

const pageErrors=[];
const vc=new VirtualConsole();
vc.on('jsdomError',e=>{
  /* layout/canvas gaps in jsdom are expected; real script errors are not.
     replaceState on file:// is legal in real browsers, jsdom refuses it. */
  const msg=String(e.message)+' '+String(e.detail&&e.detail.message||'');
  if(/Could not parse CSS|not implemented|replaceState/i.test(msg))return;
  pageErrors.push(e.detail&&e.detail.stack||e.message);
});
vc.on('error',(...a)=>pageErrors.push(a.join(' ')));

const dom=await JSDOM.fromFile(path.join(ROOT,'index.html'),{
  runScripts:'dangerously',
  resources:new LocalOnly(),
  pretendToBeVisual:true,
  virtualConsole:vc,
  beforeParse(window){
    window.fetch=()=>Promise.reject(new Error('offline-smoke'));
    window.HTMLElement.prototype.scrollIntoView=function(){};
  }
});
const {window}=dom, {document}=window;

await new Promise(res=>{
  if(document.readyState==='complete')res();
  else window.addEventListener('load',res);
});
await new Promise(res=>setTimeout(res,150));   /* let the gated refresh settle */

let failures=0;
const ok=(cond,msg)=>{
  if(cond){console.log('  ok  '+msg);}
  else{failures++;console.error('  FAIL '+msg);}
};
const noNaN=(el,what)=>{
  const html=el.innerHTML;
  ok(!/NaN/.test(html),what+' has no NaN');
  ok(!/>undefined</.test(html)&&!/"undefined"/.test(html),what+' has no undefined');
};

console.log('page load');
ok(pageErrors.length===0,'no script errors'+(pageErrors.length?'\n    '+pageErrors.join('\n    '):''));
const state=document.getElementById('state-body');
ok(state&&state.children.length>0,'Act 1 rendered');
noNaN(state,'Act 1');

console.log('Act 1 charts');
const hist=[...state.querySelectorAll('svg.histchart')];
ok(hist.length>=2,`history charts present (${hist.length})`);
for(const svg of hist){
  ok(svg.hasAttribute('viewBox')&&svg.getAttribute('viewBox').split(/[\s,]+/).map(Number).every(isFinite),
    'histchart viewBox finite');
  ok(!!svg.getAttribute('role'),'histchart has role');
  ok((svg.getAttribute('aria-label')||'').length>10,'histchart aria-label');
}
ok(state.querySelectorAll('.sbasin').length===7,'choropleth has 7 basins');
ok(!!state.querySelector('.bx-legend'),'choropleth legend present');
ok(!!state.querySelector('.lr-table'),'a data-table view exists');
const livestat=document.getElementById('livestat');
ok(livestat&&livestat.textContent.length>0,'livestat reported the offline fallback');

console.log('ZIP flow (80302 — Boulder, cross-Divide supply)');
document.getElementById('zip').value='80302';
document.getElementById('zipgo').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
await new Promise(res=>setTimeout(res,100));
const local=document.getElementById('local-body');
ok(local&&!local.hidden&&local.children.length>0,'Acts 2–3 rendered');
noNaN(local,'Acts 2–3');
ok(local.querySelectorAll('svg.basinmap-detail').length>=1,'basin map rendered');
ok(local.querySelectorAll('svg.basinflow').length>=1,'step-down diagram rendered');
ok(local.querySelectorAll('.rrow').length>=1,'reservoir rows rendered');
ok(pageErrors.length===0,'still no script errors'
  +(pageErrors.length?'\n    '+pageErrors.join('\n    '):''));

console.log('interaction layer');
const kbCharts=[...document.querySelectorAll('svg.histchart[tabindex]')];
ok(kbCharts.length>=3,`crosshair-enabled charts present (${kbCharts.length}, expect snow + Powell + panels)`);
for(const svg of kbCharts){
  svg.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  const box=svg.closest('.lr-chart')||svg.parentNode;
  const tip=box.querySelector('.cw-tip');
  ok(tip&&tip.style.display!=='none'&&tip.innerHTML.length>0,
    'keyboard step populates the tooltip');
  ok(!/NaN|undefined/.test(tip?tip.innerHTML:''),'tooltip content sane');
  svg.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
}

if(failures){console.error('\n'+failures+' FAILURES');process.exit(1);}
console.log('\nsmoke_dom: all green');
