#!/usr/bin/env node
/* Full-page smoke test — loads each page in jsdom with its real scripts and
   asserts what it renders is sane. Each story page is loaded twice where it
   reads the daily file: once offline (fetch fails, so nothing may be called
   today's) and once with data/live.json served, plus a copy of it in which
   half the reservoirs last reported days earlier.
   Run: node scripts/smoke_dom.mjs   (needs `npm install` once, dev-only) */
import {JSDOM,ResourceLoader,VirtualConsole} from 'jsdom';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIVE=JSON.parse(fs.readFileSync(path.join(ROOT,'data/live.json'),'utf8'));
const LIVE_DAY=Object.values(LIVE.res).map(o=>o.asOf).sort().pop();
/* the same file with every other reservoir's reading moved three days back */
const STALE=JSON.parse(JSON.stringify(LIVE));
const back=d=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()-3);return t.toISOString().slice(0,10);};
Object.keys(STALE.res).sort().forEach((id,i)=>{if(i%2)STALE.res[id].asOf=back(STALE.res[id].asOf);});

class LocalOnly extends ResourceLoader{
  fetch(url,options){
    if(url.startsWith('file:'))return super.fetch(url,options);
    return Promise.resolve(Buffer.from(''));   /* no network in the smoke run */
  }
}

let failures=0;
const ok=(cond,msg)=>{
  if(cond){console.log('  ok  '+msg);}
  else{failures++;console.error('  FAIL '+msg);}
};
const noNaN=(el,what)=>{
  const html=el.innerHTML;
  ok(!/NaN/.test(html),what+' has no NaN');
  ok(!/>undefined</.test(html)&&!/"undefined"/.test(html)&&!/>null</.test(html),what+' has no undefined/null');
};
const wait=ms=>new Promise(res=>setTimeout(res,ms));

async function load(file,{live=null,hash=''}={}){
  const errors=[];
  const vc=new VirtualConsole();
  vc.on('jsdomError',e=>{
    /* layout/canvas gaps in jsdom are expected; real script errors are not.
       replaceState on file:// is legal in real browsers, jsdom refuses it. */
    const msg=String(e.message)+' '+String(e.detail&&e.detail.message||'');
    if(/Could not parse CSS|not implemented|replaceState/i.test(msg))return;
    errors.push(e.detail&&e.detail.stack||e.message);
  });
  vc.on('error',(...a)=>errors.push(a.join(' ')));
  const url='file://'+path.join(ROOT,file)+hash;
  const html=fs.readFileSync(path.join(ROOT,file),'utf8');
  const dom=new JSDOM(html,{url,
    runScripts:'dangerously',
    resources:new LocalOnly(),
    pretendToBeVisual:true,
    virtualConsole:vc,
    beforeParse(window){
      window.fetch=live
        ?()=>Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(JSON.parse(JSON.stringify(live)))})
        :()=>Promise.reject(new Error('offline-smoke'));
      window.HTMLElement.prototype.scrollIntoView=function(){};
    }
  });
  const {window}=dom;
  await new Promise(res=>{
    if(window.document.readyState==='complete')res();
    else window.addEventListener('load',res);
  });
  await wait(200);   /* let the gated refresh settle */
  return {window,document:window.document,errors};
}
const noErrors=(p,what)=>ok(p.errors.length===0,(what||'no script errors')
  +(p.errors.length?'\n    '+p.errors.join('\n    '):''));
const navOk=(doc,cur)=>{
  const links=[...doc.querySelectorAll('nav.nav a:not(.brand)')].map(a=>a.textContent.trim());
  ok(links.join('|')==='Today|Long view|How it works|Map|Data|About','nav is Today, Long view, How it works, Map, Data, About');
  const c=doc.querySelector('nav.nav a[aria-current="page"]');
  ok(cur?c&&c.getAttribute('href')===cur:!c,'nav marks the current page'+(cur?' ('+cur+')':' (none)'));
  ok(!!doc.querySelector('link[rel="icon"][href="favicon.ico"]'),'favicon linked');
};
/* "today", "right now", "live" only where the newest day's readings are */
const TODAYWORD=/\b(today|right now|live)\b/i;
async function zip(p,z){
  p.document.getElementById('zip').value=z;
  p.document.getElementById('zipgo').dispatchEvent(new p.window.MouseEvent('click',{bubbles:true}));
  await wait(100);
  return p.document.getElementById('local-body');
}

/* ---------------- Today, offline ---------------- */
console.log('Today, offline (no daily readings)');
{
  const p=await load('index.html');
  noErrors(p);
  navOk(p.document,'index.html');
  const el=p.document.getElementById('today-body');
  ok(el&&/could not be loaded/i.test(el.textContent),'says the readings could not be loaded');
  ok(el.querySelectorAll('.sbasin').length===0,'no basin map without the day’s readings');
  ok(!/\d+% of normal today/.test(el.textContent),'no figure called today’s');
  const local=await zip(p,'80302');
  ok(local&&!local.hidden&&local.querySelectorAll('.rrow').length>=1,'ZIP still lists the reservoirs');
  ok(!/AF today/.test(local.textContent),'no reservoir called today’s offline');
  ok(/AF (on|estimate for) /.test(local.textContent),'each reservoir carries its own date');
  noNaN(local,'ZIP list');
  noErrors(p,'still no script errors');
}

/* ---------------- Today, with data/live.json ---------------- */
console.log('Today, with the daily readings of '+LIVE_DAY);
{
  const p=await load('index.html',{live:LIVE});
  noErrors(p);
  const el=p.document.getElementById('today-body');
  noNaN(el,'Today');
  ok(el.querySelectorAll('.sbasin').length===7,'choropleth has 7 basins');
  ok(!!el.querySelector('.bx-legend'),'legend present');
  ok(el.querySelectorAll('.tb-list li').length===7,'basin list has 7 rows');
  ok(/water year \d{4}, day \d+/.test(el.textContent),'date line gives the water-year day');
  /* the figures are the newest day's readings only, recomputed here by hand */
  const w=p.window;
  const day=w.eval('LIVE_META.day');
  ok(day===LIVE_DAY,'LIVE_META.day is the newest reading date ('+day+')');
  const wi=w.eval(`weekIdx(new Date('${LIVE_DAY}T12:00:00'))`);
  const RES=w.eval('RES'), NR=w.eval('RES_NORMALS');
  let s=0,m=0,n=0;
  RES.filter(r=>!r.fc).forEach(r=>{const L=LIVE.res[r.id];
    if(L&&L.asOf===LIVE_DAY&&NR[r.id]&&NR[r.id][wi]>0){s+=L.sto;m+=NR[r.id][wi];n++;}});
  const pct=Math.round(s/m*100);
  ok(new RegExp(`hold ${pct}% of what is usual`).test(el.textContent),`headline is ${pct}% from ${n} reservoirs`);
  ok(new RegExp(`${n} of ${RES.filter(r=>!r.fc).length} supply reservoirs reported today`).test(el.textContent),'caption gives how many reported');
  const yampa=el.querySelector('.sbasin[data-basin="yampa"]');
  const yr=RES.filter(r=>r.b==='yampa'&&!r.fc&&LIVE.res[r.id]).length;
  if(!yr)ok(/no reservoir reporting today/.test(yampa.getAttribute('aria-label')),'a basin with no reading says so');
  const bm=el.querySelector('#lr-bluemesa');
  ok(bm&&/Blue Mesa/.test(bm.textContent),'Blue Mesa shown');
  const local=await zip(p,'80302');
  noNaN(local,'ZIP list');
  ok(/AF today/.test(local.textContent),'a reservoir that reported is called today’s');
  ok(/of .+ supply reservoirs reported today/.test(local.textContent),'ZIP says how many of yours reported');
  const rows=[...local.querySelectorAll('.rrow')];
  const bad=rows.filter(r=>/today/.test(r.textContent)&&!/rr-live/.test(r.innerHTML));
  ok(bad.length===0,'only rows with a reading that day say today');
  ok(!!local.querySelector('a[href="how-it-works.html#80302"]'),'links on to the full trace');
  noErrors(p,'still no script errors');
}

/* ---------------- Today, a day when half the readings are older ---------------- */
console.log('Today, half the reservoirs last reported three days earlier');
{
  const p=await load('index.html',{live:STALE});
  noErrors(p);
  const el=p.document.getElementById('today-body');
  noNaN(el,'Today');
  const n=Object.values(STALE.res).filter(o=>o.asOf===LIVE_DAY).length;
  const local=await zip(p,'80202');
  noNaN(local,'ZIP list');
  const txt=local.textContent;
  ok(/AF on \d+ \w+ \d{4}/.test(txt),'an older reading shows its date');
  const stale=Object.keys(STALE.res).filter(id=>STALE.res[id].asOf!==LIVE_DAY);
  const RESBY=p.window.eval('RESBY');
  const staleRows=[...local.querySelectorAll('.rrow')].filter(r=>
    stale.some(id=>RESBY[id]&&r.querySelector('.rr-name').textContent.startsWith(
      RESBY[id].n.replace(/ (Reservoir|Res\.|Lake|Canyon)$/,'').replace(/ Res\.$/,' Reservoir'))));
  ok(staleRows.every(r=>!/today/.test(r.textContent)),`older readings never say today (${staleRows.length} rows)`);
  ok(n>0,'some reservoirs still reported on the newest day');
  noErrors(p,'still no script errors');
}

/* ---------------- old links ---------------- */
console.log('Old links');
for(const h of ['#80302','#zip=80302']){
  const p=await load('index.html',{live:LIVE,hash:h});
  const local=p.document.getElementById('local-body');
  ok(local&&!local.hidden&&/80302/.test(local.textContent),`index.html${h} opens that ZIP’s water`);
  noErrors(p);
}
{
  const t=fs.readFileSync(path.join(ROOT,'timeline.html'),'utf8');
  ok(/water-year-2026\.html#player/.test(t),'timeline.html leads to the report’s player');
}

/* ---------------- How it works ---------------- */
console.log('How it works (with readings), ZIP 80302');
{
  const p=await load('how-it-works.html',{live:LIVE});
  noErrors(p);
  navOk(p.document,'how-it-works.html');
  const el=p.document.getElementById('how-body');
  noNaN(el,'How it works');
  ['lr-snow','lr-reservoirs','lr-basins','lr-longview'].forEach(id=>ok(!!el.querySelector('#'+id),'section '+id));
  ok(!TODAYWORD.test(el.textContent.replace(/Coloradans live east/g,'')
    .replace(/today, from the day’s readings/,'')),'explainer claims nothing as today’s');
  const local=await zip(p,'80302');
  ok(local&&!local.hidden&&local.children.length>0,'trace rendered');
  noNaN(local,'trace');
  ok(local.querySelectorAll('svg.basinmap-detail').length>=1,'basin map rendered');
  ok(local.querySelectorAll('svg.basinflow').length>=1,'step-down diagram rendered');
  ok(local.querySelectorAll('.rrow').length>=1,'reservoir rows rendered');
  ok(local.querySelectorAll('.lr-table').length>=3,
    `table views in the trace (${local.querySelectorAll('.lr-table').length})`);
  ok(!local.querySelector('[data-cw="snowStore"]'),'the 2026 snow-in chart is not in the trace');
  ok(!/right now/i.test(local.textContent),'no "right now" in the trace');
  const mark=local.querySelector('.bm-res[data-tip]');
  if(mark){
    mark.dispatchEvent(new p.window.FocusEvent('focusin',{bubbles:true}));
    const box=mark.closest('.cw-hover');
    const mtip=box&&box.querySelector('.cw-tip');
    ok(mtip&&mtip.style.display!=='none'&&mtip.innerHTML.length>0,
      'focusing a reservoir glass populates the tooltip');
  }else ok(false,'a focusable reservoir glass with data-tip exists');
  noErrors(p,'still no script errors');
}

/* ---------------- Water year 2026 ---------------- */
console.log('Water year 2026 report');
{
  const p=await load('water-year-2026.html');
  noErrors(p);
  navOk(p.document,null);
  const el=p.document.getElementById('report-body');
  noNaN(el,'report');
  ok(/30 September 2026/.test(el.textContent),'basin map labelled 30 September 2026');
  ok(el.querySelectorAll('.sbasin').length===7,'year-end map has 7 basins');
  ok(!!el.querySelector('[data-cw="snowState"] svg.histchart'),'snow season chart drawn');
  ok(!el.querySelector('.wc-now'),'no "today" marker on the closed year');
  ok(!TODAYWORD.test(el.textContent.replace(/<a [^>]*>Today<\/a>/,'').replace(/\bToday\b shows/,'')),'report calls nothing today’s');
  ok(!!p.document.getElementById('tslider')&&!!p.document.querySelector('#viz *'),'month-by-month player drawn');
  const after=p.document.getElementById('report-after');
  noNaN(after,'snow in, water out');
  ok(!!after.querySelector('[data-cw="snowStore"] svg'),'snow in, water out drawn');
  const btn=after.querySelectorAll('#snowin-pick button');
  ok(btn.length>=5,`basin picker (${btn.length})`);
  btn[btn.length-1].dispatchEvent(new p.window.MouseEvent('click',{bubbles:true}));
  await wait(50);
  ok(!!after.querySelector('[data-cw="snowStore"] svg'),'picking a basin redraws');
  ok(/Gunnison basin stood at 23%/.test(el.textContent),'the about page’s Water year 2026 section moved here');
  noErrors(p,'still no script errors');
}

/* ---------------- The long view ---------------- */
console.log('The long view');
{
  const p=await load('long-view.html');
  noErrors(p);
  navOk(p.document,'long-view.html');
  const el=p.document.getElementById('longview-body');
  noNaN(el,'long view');
  ok(!!el.querySelector('[data-cw="powell"] svg.histchart'),'Lake Powell chart drawn');
  ok(!!el.querySelector('#tbl-powell'),'Lake Powell table');
  ok(!!el.querySelector('[data-cw="snowBars"] svg'),'snow by decade chart drawn');
  ok(!!el.querySelector('#tbl-decades'),'snow by decade table');
  console.log('interaction layer');
  const kbCharts=[...el.querySelectorAll('svg.histchart[tabindex]')];
  ok(kbCharts.length>=1,`crosshair-enabled charts present (${kbCharts.length})`);
  for(const svg of kbCharts){
    svg.dispatchEvent(new p.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    const box=svg.closest('.lr-chart')||svg.parentNode;
    const tip=box.querySelector('.cw-tip');
    ok(tip&&tip.style.display!=='none'&&tip.innerHTML.length>0,'keyboard step populates the tooltip');
    ok(!/NaN|undefined/.test(tip?tip.innerHTML:''),'tooltip content sane');
  }
  noErrors(p,'still no script errors');
}

/* ---------------- About ---------------- */
console.log('About');
{
  const t=fs.readFileSync(path.join(ROOT,'about.html'),'utf8');
  ok(!/<h2>Water year 2026<\/h2>/.test(t),'about no longer holds Water year 2026');
  ok(/<h2>Since September<\/h2>/.test(t),'about keeps Since September');
}

if(failures){console.error('\n'+failures+' FAILURES');process.exit(1);}
console.log('\nsmoke_dom: all green');
