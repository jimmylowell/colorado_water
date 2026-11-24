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
  ok(links.join('|')==='Today|Reports|Long view|How it works|Map|Data|About','nav is Today, Reports, Long view, How it works, Map, Data, About');
  const c=doc.querySelector('nav.nav a[aria-current="page"]');
  ok(cur?c&&c.getAttribute('href')===cur:!c,'nav marks the current page'+(cur?' ('+cur+')':' (none)'));
  ok(!!doc.querySelector('link[rel="icon"][href="favicon.ico"]'),'favicon linked');
};
/* "today", "right now", "live" only where the newest day's readings are */
const TODAYWORD=/\b(today|right now|live)\b/i;
/* the words are bullets: a paragraph of the story opens a section in one
   short sentence at most (chart captions and tunnel lines aside) */
const PROSE_MAX=30;
function shortProse(root,what){
  const long=[...root.querySelectorAll('p.lr-p:not(.tap-desc), p.co-p, p.bx-blurb')]
    .map(p=>p.textContent.trim().split(/\s+/).filter(Boolean).length>PROSE_MAX?p.textContent.trim().slice(0,60):null)
    .filter(Boolean);
  ok(long.length===0,`${what}: no paragraph over ${PROSE_MAX} words`+(long.length?'\n    '+long.join('\n    '):''));
}
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
  shortProse(p.document.querySelector('main'),'Today');
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

/* ---------------- Today: snow so far and Lake Powell ---------------- */
console.log('Today, snow so far and Lake Powell');
{
  const S=LIVE.snow, P=LIVE.powell;
  ok(S&&S.asOf&&S.panel===43,'live.json has the snow block on the 43-site panel');
  ok(P&&P.now&&P.now.sto>0,'live.json has the Lake Powell block');
  const p=await load('index.html',{live:LIVE});
  noErrors(p);
  const el=p.document.getElementById('today-body');
  noNaN(el,'Today with snow and Powell');
  const sn=el.querySelector('#lr-snowtoday');
  ok(!!sn,'snow section shown');
  if(sn&&S.pct!=null)ok(sn.textContent.includes(S.pct+'%')&&sn.textContent.includes(S.swe.toFixed(1)+' in')
    &&sn.textContent.includes(S.med.toFixed(1)+' in'),`snow figure is ${S.pct}% (${S.swe} in against ${S.med} in)`);
  if(sn)ok(new RegExp(`${S.reporting} of the ${S.panel} panel sites reported`).test(sn.textContent),'snow says how many sites reported');
  /* the percent is the reporting sites' sum over their medians' sum, checked here from the files */
  const panel=JSON.parse(fs.readFileSync(path.join(ROOT,'data/snow_panel.json'),'utf8'));
  ok(panel.sites.length===S.panel&&panel.days.length===366,'snow_panel.json has the panel and 366 days');
  const rawF=path.join(ROOT,'data/raw/nrcs_snotel_panel.json');
  if(fs.existsSync(rawF)){
    const raw=JSON.parse(fs.readFileSync(rawF,'utf8')), k=panel.days.indexOf(S.asOf.slice(5));
    const med=Object.fromEntries(panel.sites.map(x=>[x.triplet,x.med[k]]));
    let sv=0,sm=0,nr=0;
    raw.forEach(st=>((st.data||[{}])[0].values||[]).forEach(r=>{
      if(r.date.slice(0,10)===S.asOf&&typeof r.value==='number'&&r.value>=0&&st.stationTriplet in med){
        nr++; if(med[st.stationTriplet]!=null){sv+=r.value;sm+=med[st.stationTriplet];}}}));
    ok(nr===S.reporting&&(S.pct==null||Math.round(sv/sm*100)===S.pct),
      `snow ${S.pct}% from ${nr} sites recomputed from the saved NRCS response`);
  }
  const pw=el.querySelector('#lr-powelltoday');
  ok(!!pw,'Lake Powell section shown');
  if(pw){
    ok(pw.textContent.includes((P.now.sto/1e6).toFixed(2)+'M'),'Powell storage is the newest daily row');
    if(P.sep30){const d=P.now.sto-P.sep30.sto;
      ok(pw.textContent.includes((d>=0?'up ':'down ')+Math.abs(d).toLocaleString('en-US')+' acre-feet'),'change since 30 September is the plain difference');}
    if(P.yearAgo)ok(/A year earlier, \d+ \w+ \d{4}/.test(pw.textContent),'the same day a year earlier, dated');
  }
  noErrors(p,'still no script errors');
}
console.log('Today, snow and Powell not refreshed, rows missing');
{
  const OLD=JSON.parse(JSON.stringify(LIVE));
  OLD.snow.asOf=back(OLD.snow.asOf); OLD.snow.reporting=30; OLD.snow.pct=null;
  OLD.powell.now.date=back(OLD.powell.now.date); OLD.powell.now.elev=null; OLD.powell.yearAgo=null;
  const p=await load('index.html',{live:OLD});
  noErrors(p);
  const el=p.document.getElementById('today-body');
  noNaN(el,'Today with older snow and Powell');
  const sn=el.querySelector('#lr-snowtoday'), pw=el.querySelector('#lr-powelltoday');
  const fd=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  ok(sn&&sn.textContent.includes(fd(OLD.snow.asOf)),'an older snow reading shows its own date');
  ok(sn&&/no percent is given/.test(sn.textContent),'no median percent: says so, fills nothing in');
  ok(sn&&/30 of the 43 panel sites reported/.test(sn.textContent),'a short count is shown as it is');
  ok(pw&&pw.textContent.includes(fd(OLD.powell.now.date)),'an older Powell reading shows its own date');
  ok(pw&&/A year earlier: no reading/.test(pw.textContent),'a missing year-earlier row says no reading');
  ok(pw&&/no elevation reading/.test(pw.textContent),'a missing elevation says so');
  const NONE=JSON.parse(JSON.stringify(LIVE)); delete NONE.snow; delete NONE.powell;
  const q=await load('index.html',{live:NONE});
  noErrors(q);
  const e2=q.document.getElementById('today-body');
  ok(!e2.querySelector('#lr-snowtoday')&&!e2.querySelector('#lr-powelltoday'),'a file without the blocks leaves both sections out');
  ok(e2.querySelectorAll('.sbasin').length===7,'the basins still render');
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
  {const t=el.textContent.replace(/today, from the day’s readings/,''), m=t.match(TODAYWORD);
   ok(!m,'explainer claims nothing as today’s'+(m?` ("…${t.slice(Math.max(0,m.index-50),m.index+20)}…")`:''));}
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
  shortProse(p.document.querySelector('main'),'How it works');
  ok(!/NRCS \/ NOAA/.test(el.textContent),'the unsourced snowpack share is gone');
  ok(!!el.querySelector('a[href*="Southwestern_North_American_megadrought"]'),'megadrought links to its article');
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
  navOk(p.document,'reports.html');
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
  ok(/Gunnison 23% \(83% in March\)/.test(el.textContent),'30 September storage given as bullets');
  ok(/June 27%, the low/.test(el.textContent),'streamflow given as bullets');
  ok(/5\.16M acre-feet, the lowest end of a water year since 1964/.test(after.textContent),'Lake Powell against the record');
  ok(!!after.querySelector('#lr-method li'),'method listed at the foot');
  shortProse(p.document.querySelector('main'),'report');
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
  ok(/the lowest since 1964/.test(el.textContent),'Lake Powell 2026 against the record');
  shortProse(el,'long view');
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
  ok(!/Since September/.test(t),'about no longer holds Since September (it is the autumn check-in)');
  ok(/href="reports\.html"/.test(t),'about points to Reports');
}

/* ---------------- Reports and the check-ins ---------------- */
console.log('Reports');
{
  const p=await load('reports.html');
  noErrors(p);
  navOk(p.document,'reports.html');
  const list=[...p.document.querySelectorAll('#report-list a')].map(a=>a.getAttribute('href'));
  ok(list.join('|')==='check-in-2026-autumn.html|water-year-2026.html','newest first: the autumn check-in, then the yearly report');
  ok(list.every(h=>fs.existsSync(path.join(ROOT,h))),'every listed report exists');
  ok(/next check-in comes in early January/i.test(p.document.getElementById('reports-body').textContent),'says when the next one comes');
  shortProse(p.document.querySelector('main'),'reports');
}
console.log('Autumn 2026 check-in');
{
  const p=await load('check-in-2026-autumn.html');
  noErrors(p);
  navOk(p.document,'reports.html');
  const el=p.document.getElementById('checkin-body');
  noNaN(el,'check-in');
  ok(/^Written 23 November 2026 · this page is not updated$/.test(p.document.getElementById('checkin-written').textContent.trim()),'head says the day it was written and that it is not updated');
  ok(!p.document.querySelector('script[src]'),'frozen: loads no scripts, so no figure can move');
  const secs=[...el.querySelectorAll('section.lr-sec')].filter(s=>s.id!=='lr-method');
  ok(secs.length>=3&&secs.every(s=>/\b\d{1,2} November( 2026)?\b/.test(s.textContent)),'every section carries its date');
  ok(!/Del Norte at 875/.test(el.textContent.replace(/Correction:.*$/m,'')),'the 2003 Del Norte value is not used as a figure');
  ok(!!el.querySelector('#lr-method li'),'method listed at the foot');
  ok(!TODAYWORD.test(el.textContent.replace(/on Today\./,'').replace(/data\/live\.json/g,'')),'calls nothing today’s');
  shortProse(p.document.querySelector('main'),'check-in');
  const idx=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  ok(/href="check-in-2026-autumn\.html"/.test(idx),'Today links to the newest check-in');
}

/* ---------------- Data page: the daily series and their dates ---------------- */
console.log('Data page');
{
  const p=await load('data.html',{live:LIVE});
  noErrors(p);
  const d=p.document;
  const fd=s=>new Date(s+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  ok(d.getElementById('asof-snow').textContent===fd(LIVE.snow.asOf)+' · '+LIVE.snow.reporting+' of '+LIVE.snow.panel+' sites','snow series listed with its date');
  ok(d.getElementById('asof-powell').textContent===fd(LIVE.powell.now.date),'Lake Powell series listed with its date');
  ok(d.querySelectorAll('#restable tr').length>40,'reservoir table renders');
  const q=await load('data.html');
  noErrors(q,'offline: no script errors');
  ok(q.document.getElementById('asof-snow').textContent==='not loaded','offline: the snow date says not loaded');
}

if(failures){console.error('\n'+failures+' FAILURES');process.exit(1);}
console.log('\nsmoke_dom: all green');
