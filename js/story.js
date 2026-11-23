"use strict";
/* =====================================================================
   THE PAGES — one script builds four pages from shared pieces; the page
   is named by <body data-page>. docs/design.md says what goes where.

     today     (index.html)            the newest day's readings only: the
                                       seven basins, Blue Mesa, your
                                       reservoirs by ZIP
     report    (water-year-2026.html)  the closed year, frozen: snow, where
                                       each basin ended on 30 September,
                                       the month-by-month player, snow in
                                       and water out
     longview  (long-view.html)        the record year by year: Lake Powell
                                       and the snowpack by decade
     how       (how-it-works.html)     snow, reservoirs, basins, tunnels,
                                       the megadrought, and the ZIP trace

   "Today", "right now" and "live" are said only of a figure from the newest
   day's readings (LIVE_META.day); every other figure carries its own date.
   Year-specific numbers are never hard-coded in prose beside a figure
   (see BASININFO) — the derived value is the single source.
   ===================================================================== */
(function(){
/* WEST / slopeOf live in data.js; kaf/af/glass geometry in charts.js */
const {kaf,af,sparkPath,glassGlyph,PAL}=window.CW_CHARTS;
const cleanName=n=>n.replace(/ (Reservoir|Res\.|Lake|Canyon)$/,'');
/* possessive that respects names already ending in s ("the Arkansas' snowpack") */
const poss=n=>n+(/s$/i.test(n)?'’':'’s');
/* "Res." is fine on a cramped map label, but reads badly mid-sentence */
const proseName=n=>n.replace(/ Res\.$/,' Reservoir');
const FULLMON={Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',
  Mar:'March',Apr:'April',May:'May',Jun:'June',Jul:'July',Aug:'August',Sep:'September'};
const PAGE=document.body.dataset.page||'today';
const monthName=mi=>FULLMON[MONTHS[mi].split(' ')[0]]||MONTHS[mi];
const W=n=>wikify(n);
let curTap=null, curZip=null;
let curSel=null;   /* the basin picked in the explorer — survives re-renders */

/* ---------- shared pieces ---------- */
function sec(id,kicker,title,body){
  return `<section class="lr-sec" id="lr-${id}">`
    +`<p class="lr-kicker">${kicker}</p><h2 class="lr-h2">${title}</h2>${body}</section>`;
}
const cite=s=>`<span class="lr-cite">${s}</span>`;

function glassMini(r){
  const rd=readingOf(r);
  const frac=Math.max(0,Math.min(1,rd.sto/r.cap));
  const col=r.fc?PAL.GLASS.fc:ramp(rd.pm);
  /* shared geometry core: same silhouette, and the fill is now solved by
     AREA like every other glass on the site — a half-full mini really is
     half-full, not half-tall */
  return `<svg class="gmini" width="30" height="39" viewBox="0 0 30 39" aria-hidden="true">`
    +`<g transform="translate(15,37)">${glassGlyph({h:31,a:12,b:6.5,frac,col,id:'gm'+r.id,strokeW:1.1})}</g></svg>`;
}
/* A reservoir's normal year as a 52-week silhouette, with a dot where the
   reservoir actually sits this week. One glance answers the question the bare
   glass could not: is this level normal for AUGUST, or is it genuinely low? */
function resYearSpark(r){
  const nrm=(typeof RES_NORMALS!=='undefined')&&RES_NORMALS[r.id];
  if(!nrm||!r.cap)return '';
  const rd=readingOf(r);
  const w=104,h=26,wi=Math.min(51,weekIdx(/^\d{4}-/.test(rd.date)?new Date(rd.date+'T12:00:00'):new Date(rd.date)));
  /* Scale to the curve itself, NOT to capacity: against a full-pool top, a
     reservoir that swings between 40% and 70% draws as a flat line and the
     seasonal shape — the whole point of this mark — disappears. */
  const top=Math.max(...nrm,rd.sto)*1.08;
  const X=i=>i/51*w, Y=v=>h-1-(v/top)*(h-2);
  const d=sparkPath(nrm,X,Y);
  const now=rd.sto, col=r.fc?PAL.GLASS.fc:ramp(rd.pm);
  return `<svg class="resspark" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="A normal year at ${cleanName(r.n)} peaks in early summer; the latest reading is marked.">
    <path d="${d} L${w},${h} L0,${h} Z" fill="#8FA6B2" opacity="0.10"/>
    <path d="${d}" fill="none" stroke="#7C93A1" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="${X(wi).toFixed(1)}" y1="0" x2="${X(wi).toFixed(1)}" y2="${h}" stroke="#54798C" stroke-width="0.8"/>
    <circle cx="${X(wi).toFixed(1)}" cy="${Y(Math.min(now,top)).toFixed(1)}" r="2.6" fill="${col}"/></svg>`;
}
/* One reservoir, as a row of facts rather than a cup on its own. `share` is
   this reservoir's slice of everything the provider stores, which is the piece
   that makes a single-reservoir group meaningful. */
function resRow(r,share){
  const rd=readingOf(r), pm=rd.pm, col=r.fc?'#8DA4B0':ramp(pm);
  const live=rd.today;
  const now=rd.sto;
  return `<div class="rrow">
    <div class="rr-glass">${glassMini(r)}</div>
    <div class="rr-main">
      <div class="rr-name">${proseName(cleanName(r.n))}${live?'<span class="rr-live">live</span>':''}</div>
      <div class="rr-sub">${r.r||''}${r.r?' · ':''}${kaf(r.cap)} KAF when full${
        share!=null?` · <b>${share}%</b> of what your provider stores`:''}</div>
      ${share!=null?`<div class="rr-share"><i style="width:${Math.max(2,share)}%"></i></div>`:''}
    </div>
    <div class="rr-spark">${resYearSpark(r)}<span class="rr-sparklab">a normal year</span></div>
    <div class="rr-val">
      <div class="rr-pct" style="color:${col}">${r.fc?'flood':pm+'%'}</div>
      <div class="rr-of">${r.fc?'control pool':'of normal'}</div>
      <div class="rr-af">${r.fc?'':`${af(now)} AF ${readingWhen(rd)}`}</div>
    </div>
  </div>`;
}
function glassGroup(title,arr,totCap){
  if(!arr.length)return'';
  const cap=arr.reduce((s,r)=>s+r.cap,0);
  const sorted=arr.slice().sort((a,b)=>b.cap-a.cap);
  const groupShare=totCap?Math.round(cap/totCap*100):null;
  return `<div class="src-slope"><div class="src-slope-h">${title}`
    +`<span class="src-slope-n">${arr.length} reservoir${arr.length>1?'s':''} · ${kaf(cap)} KAF`
    +`${groupShare!=null?` · ${groupShare}% of your stored supply`:''}</span></div>`
    +`<div class="rrows">${sorted.map(r=>resRow(r,totCap?Math.round(r.cap/totCap*100):null)).join('')}</div></div>`;
}

/* =====================================================================
   ACT 1 — COLORADO
   ===================================================================== */

/* §1 snowpack + the water year.
   The explainer (How it works) and the charts are on different pages now:
   the season chart with water year 2026 on it is in the 2026 report, the
   decade bars and table are on the long view. */
const LATE_MAY_WK=33;    /* water-year week index covering ~20–26 May */
/* the decade figures, from SNOW_DECADES only; null when it is not loaded */
function decadeFigs(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec)return null;
  const keys=Object.keys(D.dec).sort();
  const a=D.dec[keys[0]], z=D.dec[keys[keys.length-1]];
  if(!a||!z||!a.peak)return null;
  const wk=LATE_MAY_WK, ga=a.wk[wk], gz=z.wk[wk];
  return {D,keys,a,z,first:keys[0],last:keys[keys.length-1],
    drop:Math.round((1-z.peak/a.peak)*100),
    springDrop:(ga>0&&gz!=null)?Math.round((1-gz/ga)*100):null};
}
function decadePeakLine(){
  const f=decadeFigs(); if(!f)return '';
  return `the median peak snowpack fell from ${f.a.peak} in (${f.first}) to ${f.z.peak} in (${f.last}) on a fixed panel of ${f.D.n} SNOTEL sites`;
}
function decadeTrend(){
  const f=decadeFigs(); if(!f)return '';
  const yrs=f.z.n&&f.z.n<10?` (${f.z.n} years so far)`:'';
  return `<p class="lr-p">${W(`The same ${f.D.n} long-record {{SNOTEL}} sites in every decade, so the comparison does not depend on which sites were running.`)}</p>
     <ul class="lr-list">
       <li>Median peak snowpack, ${f.first}: <b>${f.a.peak} in</b> of water.</li>
       <li>Median peak snowpack, ${f.last}${yrs}: <b>${f.z.peak} in</b>, about <b>${f.drop}%</b> lower.</li>
       ${f.springDrop!=null?`<li>The week of 20 May: the ${f.last} median holds about <b>${f.springDrop}% less</b> than the ${f.first}.</li>`:''}
       <li>Source: NRCS AWDB SNOTEL snow-water equivalent; the table under the chart has every decade.</li>
     </ul>`;
}
function decadeYearLine(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  const cur=D&&D.curStats;
  if(!cur)return '';
  const f=decadeFigs();
  return `<ul class="lr-list">
       <li>Peak snowpack, water year ${D.curWY}: <b>${cur.peak} in</b> of water${cur.peakWk!=null?`, in ${peakWhen(cur.peakWk)}`:''}.</li>
       ${f?`<li>Median peak for the ${f.last} so far: ${f.z.peak} in. For the ${f.first}: ${f.a.peak} in.</li>`:''}
       ${cur.apr1!=null?`<li>Left on 1 April: <b>${cur.apr1} in</b>.</li>`:''}
       <li>By 1 June, 91% of SNOTEL sites were bare (NRCS).</li>
       <li>Source: a fixed panel of ${D.n} long-record NRCS SNOTEL sites, the same sites in every decade.</li>
     </ul>`;
}
/* water-year week index → "early March" etc. (week 0 starts 1 October) */
function peakWhen(wk){
  const d=new Date(Date.UTC(2025,9,1)+wk*7*864e5);
  const m=d.toLocaleString('en-US',{month:'long',timeZone:'UTC'}), day=d.getUTCDate();
  return (day<=10?'early ':day<=20?'mid-':'late ')+m;
}
function secSnowHow(){
  const facts=COLORADO_FACTS.map(f=>
    `<div class="fact"><div class="fact-stat">${f.stat}</div>`
    +`<div class="fact-lab">${W(f.lab)} ${cite(f.cite)}</div></div>`).join('');
  return sec('snow','Where it begins','Colorado’s water starts as snow',
    `<p class="lr-p">${W(`Snow on the high country is the state’s first store of water; the reservoirs come after.`)}</p>
     <div class="fact-grid">${facts}</div>
     <ul class="lr-list">
       <li>${W(`Snow is measured as {{snow water equivalent|snow-water equivalent}}: the depth of water it would melt into.`)}</li>
       <li>Snow builds through winter and melts in spring: the season week by week, decade medians and 2026, is in <a href="water-year-2026.html#lr-snow">the 2026 report</a> (NRCS SNOTEL, 43 fixed sites).</li>
       <li>The decades side by side: <a href="long-view.html#lr-snowdecades">the long view</a>.</li>
     </ul>`);
}
function secSnowReport(){
  const chart=window.CW_HISTORY&&CW_HISTORY.hasSnowChart()
    ?'<div class="cw-mount" data-cw="snowState" data-closed="1"></div>':'';
  return sec('snow','Snow','The snow that peaked early',
    `${decadeYearLine()}
     ${chart?`<div class="lr-chart">${chart}<div class="lr-chart-cap">The 1980s and 2020s medians and water year 2026, week by week · statewide snow-water equivalent on the fixed SNOTEL panel (NRCS). Shaded: the melt season.</div></div>`:''}
     <p class="lr-p lr-aside">Every decade since the 1980s: <a href="long-view.html#lr-snowdecades">the long view</a>.</p>`);
}
function secSnowDecades(){
  const bars=window.CW_HISTORY&&CW_HISTORY.hasDecades()
    ?'<div class="cw-mount" data-cw="snowBars"></div>':'';
  const table=window.CW_HISTORY&&CW_HISTORY.hasDecades()?CW_HISTORY.snowDecadeTable():'';
  return sec('snowdecades','Snowpack by decade','The snowpack, decade by decade',
    `${decadeTrend()}
     ${bars?`<div class="lr-chart">${bars}<div class="lr-chart-cap">Median peak snowpack by decade on the fixed panel, water year 2026 last. No decade is higher than the one before; the 2000s and 2010s tie. Dashed: the 1980s level.</div>${table}</div>`:''}`);
}

/* §3 what reservoirs actually do (education) */
function secReservoirs(){
  const sanchez=RESBY['sanchez'];
  const sn=sanchez&&(typeof RES_NORMALS!=='undefined')&&RES_NORMALS.sanchez;
  const snLo=sn?Math.round(Math.min(...sn)/sanchez.cap*100):null, snHi=sn?Math.round(Math.max(...sn)/sanchez.cap*100):null;
  return sec('reservoirs','The lakes','What a reservoir is for',
    `<p class="lr-p">A reservoir holds the spring melt and releases it through the rest of the year.</p>
     <ul class="lr-list">
       <li>Storage is read against the median for that week of the year, not against full: levels are meant to fall through summer (Colorado DWR telemetry, medians from 2005).</li>
       <li><b>Carryover</b> is the water still stored on 30 September, when the next water year begins. Each basin’s 30 September 2026 figure is in <a href="water-year-2026.html#lr-basins">the 2026 report</a>.</li>
       ${sn?`<li>${cleanName(sanchez.n)}, in the San Luis Valley: in a median week it holds ${snLo}% to ${snHi}% of its capacity, so a low reading there is its normal (DWR, weekly medians).</li>`:''}
       <li>${W(`Cherry Creek is a flood-control reservoir built by the US Army Corps of Engineers ({{Cherry Creek Dam}}). The site draws it and Bear Creek as flood-control pools, not supply.`)}</li>
     </ul>
     <h3 class="lr-h3">Summer rain</h3>
     <ul class="lr-list">
       <li>${W(`The {{North American monsoon}} brings summer storms to the Southwest, typically June to mid-September.`)}</li>
       <li>${W(`{{flash flood|Flash flooding}} is a serious danger during the monsoon.`)}</li>
       <li>Whether a summer’s rain reached the reservoirs shows in the basin’s storage line for that year: <a href="water-year-2026.html#lr-snowin">snow in, water out</a>.</li>
     </ul>`);
}

/* §4 the seven basins. One map, two sources of figures:
     'today'   — the newest day's readings only (basinToday); a basin where no
                 reservoir reported that day is drawn blank and says so
     'yearend' — 30 September 2026, the derived monthly series (basinStats) */
const BMW=700,BMH=400, BGW=-109.05,BGE=-102.05,BGN=41,BGS=37;
const bmx=lon=>(lon-BGW)/(BGE-BGW)*BMW, bmy=lat=>(BGN-lat)/(BGN-BGS)*BMH;
const NOREAD='#33434D';
function basinPathD(rings){
  return rings.map(r=>'M'+r.map(p=>bmx(p[0]).toFixed(1)+','+bmy(p[1]).toFixed(1)).join('L')+'Z').join(' ');
}
function basinFig(bid,mode){
  if(mode==='today'){
    const t=basinToday(bid);
    const day=fmtDay(LIVE_META.day);
    return {pct:t.pct,count:t.count,cap:t.cap,
      tip:t.pct!=null
        ?`<b>${t.pct}%</b> of the median for this week<br>${t.n} of ${t.count} reservoirs reported today (${day})`
        :`No reservoir reported today (${day})<br>${t.count} reservoirs here`,
      aria:t.pct!=null?`${t.pct}% of the median for this week, ${t.n} of ${t.count} reservoirs reporting today`
        :`no reservoir reporting today`};
  }
  const st=basinStats(bid);
  return {pct:st.pct,count:st.count,cap:st.cap,
    tip:`<b>${st.pct}%</b> of normal storage on 30 September 2026<br>${st.count} reservoirs · ${kaf(st.cap)} KAF when full`,
    aria:`${st.pct}% of normal storage on 30 September 2026`};
}
/* Choropleth: fill encodes storage vs that basin's own normal (ramp), at a
   CONSTANT opacity — selection/hover live on the stroke only, because varying
   fill-opacity would read as a different storage value. */
function stateBasinsSVG(home,sel,mode){
  if(typeof BASIN_GEO==='undefined')return '';
  const figs={};
  Object.keys(BASIN_GEO).forEach(bid=>{figs[bid]=basinFig(bid,mode);});
  let s=`<svg class="basinmap" viewBox="0 0 ${BMW} ${BMH}" role="group" aria-label="Colorado's seven river basins, shaded by storage against each basin's own normal, ${mode==='today'?'from today’s readings':'on 30 September 2026'}">`;
  s+=`<image href="img/co-relief.webp" x="0" y="0" width="${BMW}" height="${BMH}" preserveAspectRatio="none" opacity="0.3"/>`;
  Object.keys(BASIN_GEO).forEach(bid=>{
    const f=figs[bid];
    const bn=BASINS.find(x=>x.id===bid).n;
    s+=`<path class="sbasin${bid===home?' home':''}${bid===sel?' sel':''}" data-basin="${bid}" `
      +`d="${basinPathD(BASIN_GEO[bid])}" fill="${f.pct!=null?ramp(f.pct):NOREAD}" tabindex="0" role="button" `
      +`aria-pressed="${bid===sel}" aria-label="${bn} basin, ${f.aria}" `
      +`data-tip="<div class=&quot;tt-h&quot;>${bn}</div><div class=&quot;tt-d&quot;>${f.tip}</div>"></path>`;
  });
  Object.keys(BASIN_GEO).forEach(bid=>{
    const a=BASIN_LABEL[bid]; if(!a)return;
    const x=bmx(a[0]).toFixed(0), y=bmy(a[1]).toFixed(0);
    const bb=BASINS.find(x2=>x2.id===bid), f=figs[bid];
    /* neutral, not ramp-coloured: the fill beneath already carries the value */
    s+=`<text class="sbasin-lab" x="${x}" y="${y}" text-anchor="middle" pointer-events="none">${bb.n.toUpperCase()}</text>`;
    s+=`<text class="sbasin-pct" x="${x}" y="${y}" dy="1.1em" text-anchor="middle" pointer-events="none">${f.pct!=null?f.pct+'%':'no reading'}</text>`;
  });
  return s+'</svg>'+basinLegend(mode);
}
/* The old legend showed five evenly-spaced swatches sampled at 55/70/85/100/112%
   — but `ramp()` is a piecewise scale with UNEVEN stops, so a swatch's position
   in that row said nothing about the value it stood for, and the row carried no
   numbers at all. This builds the bar straight from RAMPS: every stop sits at its
   true position on a 0–120% scale, so the legend and the map are the same scale.
   Ticks are labelled, and 100% is called out as the thing being compared to. */
const BXL_MAX=120;
function basinLegend(mode){
  const grad=RAMPS.map(([v,c])=>`${c} ${(Math.min(v,BXL_MAX)/BXL_MAX*100).toFixed(1)}%`).join(',');
  const ticks=[0,25,50,75,100,BXL_MAX];
  return `<div class="bx-legend">
    <div class="bxl-cap">Storage vs this basin’s own normal${mode==='today'?' · today':' · 30 September 2026'}</div>
    <div class="bxl-scale">
      <div class="bxl-bar" style="background:linear-gradient(90deg,${grad})"></div>
      <div class="bxl-ticks">${ticks.map(v=>
        `<span class="bxl-tick${v===100?' is-norm':''}" style="left:${(v/BXL_MAX*100).toFixed(1)}%">`
        +`<i></i><b>${v}%</b></span>`).join('')}</div>
    </div>
    <ul class="bxl-note lr-list">
      <li>100% = the median storage for this week of the year across the record, not full.</li>
      <li>Each basin against its own median, so they read side by side.</li>${
      mode==='today'?'<li>Dark: no reservoir in that basin reported today.</li>':''}
    </ul>
  </div>`;
}
function basinSummaryHTML(bid,home,mode){
  const b=BASINS.find(x=>x.id===bid);
  const slope=`<span>${WEST.includes(bid)?'West slope':'East slope'}</span>`;
  if(mode==='today'){
    const t=basinToday(bid);
    return `<div class="bx-head"><span class="bx-name">${b.n}${bid===home?' · your basin':''}</span>`
      +`<span class="bx-pct"${t.pct!=null?` style="color:${rampText(t.pct)}"`:''}>${t.pct!=null?t.pct+'% of normal today':'no reading today'}</span></div>`
      +`<p class="bx-blurb">${W(BASININFO[bid]||'')}</p>`
      +`<div class="bx-stats">${slope}<span>${t.n} of ${t.count} reservoirs reported today</span>`
      +`<span>${kaf(t.cap)} KAF full</span></div>`;
  }
  const st=basinStats(bid);
  return `<div class="bx-head"><span class="bx-name">${b.n}${bid===home?' · your basin':''}</span>`
    +`<span class="bx-pct" style="color:${rampText(st.pct)}">${st.pct}% of normal on 30 September</span></div>`
    +`<p class="bx-blurb">${W(BASININFO[bid]||'')}</p>`
    +`<div class="bx-stats">${slope}<span>${st.count} reservoirs</span>`
    +`<span>${kaf(st.cap)} KAF full</span><span>${st.below} below normal</span>`
    +`${st.largest?`<span>largest: ${cleanName(st.largest.n)}</span>`:''}</div>`;
}
function basinExplorer(home,mode){
  const sel=curSel||home||'colorado';
  return `<div class="basinmap-wrap" id="basin-explorer" data-mode="${mode}">${stateBasinsSVG(home,sel,mode)}
       <div class="bx-panel" id="basin-sel">${basinSummaryHTML(sel,home,mode)}</div></div>`;
}
/* The seven basins as a plain list, newest day only: the table view of the
   today map, and the first thing a phone reader sees below it */
function basinTodayList(){
  const ids=Object.keys(typeof BASIN_GEO!=='undefined'?BASIN_GEO:{});
  const rows=ids.map(bid=>({bid,n:BASINS.find(x=>x.id===bid).n,t:basinToday(bid)}))
    .sort((a,b)=>(b.t.pct==null?-1:b.t.pct)-(a.t.pct==null?-1:a.t.pct));
  return `<ul class="tb-list">${rows.map(r=>`<li><span class="tb-name">${r.n}</span>`
    +`<span class="tb-n">${r.t.n} of ${r.t.count} reporting</span>`
    +`<span class="tb-pct"${r.t.pct!=null?` style="color:${rampText(r.t.pct)}"`:''}>${r.t.pct!=null?r.t.pct+'%':'–'}</span></li>`).join('')}</ul>`;
}
function secBasinsHow(){
  return sec('basins','The basins','Seven basins, seven different years',
    `<ul class="lr-list">
       <li>${W(`The site uses seven basins, the seven water divisions of Colorado DWR: four west of the {{Continental Divide}}, three east.`)}</li>
       <li>Each is measured against its own median, so they can be read side by side.</li>
       <li>On 30 September 2026 they ranged from 23% (Gunnison) to 97% (South Platte) of median storage (<a href="data.html">basin history CSV</a>).</li>
       <li>Each basin <a href="index.html">today</a>, from the day’s readings; and on <a href="water-year-2026.html#lr-basins">30 September 2026</a>.</li>
     </ul>`);
}
function secBasinsReport(home){
  return sec('basins','Where each basin ended','Storage on 30 September 2026, against each basin’s median',
    `<p class="lr-p">The carryover water year 2027 starts from. Tap a basin for its details.</p>
     ${secStorage2026()}
     ${basinExplorer(home,'yearend')}
     <p class="lr-p lr-cap">Boundaries: USGS Watershed Boundary Dataset (public domain). Storage: Colorado DWR telemetry, monthly in the <a href="data.html">basin history CSV</a>.</p>`);
}

/* §5 the long view: Lake Powell year by year */
function secPowell(){
  const powell=window.CW_HISTORY&&CW_HISTORY.hasPowell()
    ?'<div class="cw-mount" data-cw="powell"></div>':'';
  const powellTable=window.CW_HISTORY&&CW_HISTORY.hasPowell()&&CW_HISTORY.powellTable
    ?CW_HISTORY.powellTable():'';
  const pk=(typeof POWELL_ANNUAL!=='undefined')?POWELL_ANNUAL.reduce((a,b)=>b[1]>a[1]?b:a):null;
  const last=(typeof POWELL_ANNUAL!=='undefined')?POWELL_ANNUAL[POWELL_ANNUAL.length-1]:null;
  return sec('powell','Lake Powell','Every September since 1963',
    `<p class="lr-p">${W(`{{Lake Powell}} on the Colorado River, at the end of each September${pk&&last?`, ${POWELL_ANNUAL[0][0]} to ${last[0]}`:''} (USBR daily storage).`)}</p>
     ${pk&&last?`<ul class="lr-list">
       <li>Peak: <b>${(pk[1]/1e6).toFixed(1)}M acre-feet</b>, September ${pk[0]}.</li>
       <li>First filled to full pool (3,700 ft): 22 June 1980 (Wikipedia).</li>
       <li>September ${last[0]}: <b>${(last[1]/1e6).toFixed(2)}M acre-feet</b>${lowestSince(POWELL_ANNUAL)}.</li>
       <li>Every year’s figure: the table under the chart.</li>
     </ul>`:''}
     ${powell?`<div class="lr-chart">${powell}<div class="lr-chart-cap">${W(`{{Lake Powell}} annual storage${pk&&last?`, from a peak near ${(pk[1]/1e6).toFixed(1)}M acre-feet (${pk[0]}) to ${(last[1]/1e6).toFixed(1)}M (${last[0]})`:''} · US Bureau of Reclamation`)}</div>${powellTable}</div>`:''}`);
}
/* ", the lowest since 1964": the newest year against every earlier one */
function lowestSince(P){
  if(!P||P.length<2)return '';
  const last=P[P.length-1];
  for(let i=P.length-2;i>=0;i--)if(P[i][1]<=last[1])return i===P.length-2?'':`, the lowest since ${P[i][0]}`;
  return ', the lowest on this record';
}
/* the megadrought: the explainer, on How it works */
function secMegadrought(){
  return sec('longview','A drier baseline','A drought, and a drier baseline',
    `<ul class="lr-list">
       <li>${W(`The southwestern {{megadrought}} began in 2000: the driest multi-decade period the region has seen since at least 800 CE (Wikipedia).`)}</li>
       <li>${W(`Colorado River flows have been below average since 2000 as a result of it ({{Lake Powell}}, Wikipedia).`)}</li>
       <li>${W(`Flows have declined further from evaporation off reservoirs and, after 2000, reduced snowpack with warmer winters in the Rockies ({{Colorado River}}, Wikipedia).`)}</li>
       <li>${W(`Some researchers find the Colorado River basin is undergoing {{aridification}} (Wikipedia).`)}</li>
       <li>${W(`{{Blue Mesa Reservoir}}, the largest lake entirely in Colorado, is upstream of Lake Powell; in 2022 the need to release water to aid Lake Powell cancelled its boating season for the first time (Wikipedia).`)}</li>
       ${decadePeakLine()?`<li>On the site’s own record: ${decadePeakLine()} (<a href="long-view.html#lr-snowdecades">the long view</a>).</li>`:''}
     </ul>`);
}

/* =====================================================================
   ACT 2 — YOUR BASIN

   A hierarchy implies containment, but Colorado's water isn't contained:
   for most of the Front Range the majority of stored supply sits in a
   different basin, across the Divide. So this act is about the basin the
   water COMES FROM, and shows the basin you LIVE IN alongside whenever
   those differ — otherwise the "your basin" map would omit the reader's
   own largest reservoirs (Denver's Dillon and Williams Fork, 56% of its
   storage, are in the Colorado headwaters, not the South Platte).
   ===================================================================== */
/* stored capacity of this tap's supply, split by the basin it sits in */
function supplySplit(tap){
  const byB={};
  (tap.res||[]).forEach(id=>{const r=RESBY[id]; if(!r||r.fc)return;
    byB[r.b]=(byB[r.b]||0)+r.cap;});
  const ranked=Object.keys(byB).map(k=>[k,byB[k]]).sort((a,b)=>b[1]-a[1]);
  const tot=ranked.reduce((s,e)=>s+e[1],0);
  return {ranked,tot};
}
function splitBar(sp,hb){
  if(!sp.tot)return '';
  /* the track is decoration; the key row below carries every basin and its
     share as text, so that is the accessible representation */
  const seg=sp.ranked.map(([bid,c])=>
    `<span class="sb-seg" style="width:${(c/sp.tot*100).toFixed(1)}%;background:${BASIN_HUE[bid]||'#8FA6B2'}"></span>`
  ).join('');
  const key=sp.ranked.map(([bid,c])=>{
    const bn=BASINS.find(x=>x.id===bid).n;
    return `<span class="sb-key"><i style="background:${BASIN_HUE[bid]||'#8FA6B2'}"></i>`
      +`${bn}${bid===hb?' (where you live)':''} · <b>${Math.round(c/sp.tot*100)}%</b></span>`;
  }).join('');
  return `<div class="splitbar"><div class="sb-track" aria-hidden="true">${seg}</div><div class="sb-keys">${key}</div></div>`;
}
/* from the newest day's readings only; with none, the cell says so */
function basinStatPanel(bid){
  const t=basinToday(bid);
  const rep=RES.filter(r=>r.b===bid&&!r.fc).map(readingOf).filter(rd=>rd.today&&rd.pm!=null);
  const below=rep.filter(rd=>rd.pm<95).length;
  return `<div class="basin-panel">
       <div class="bp-cell"><div class="bp-num"${t.pct!=null?` style="color:${rampText(t.pct)}"`:''}>${t.pct!=null?t.pct+'%':'–'}</div>
         <div class="bp-lab">${t.pct!=null?`of normal storage today,<br>${t.n} of ${t.count} reporting`:`no reservoir here<br>reported today`}</div></div>
       <div class="bp-cell"><div class="bp-num">${t.count}</div>
         <div class="bp-lab">reservoirs here holding<br>${kaf(t.cap)} KAF when full</div></div>
       <div class="bp-cell"><div class="bp-num" style="color:${below?'#EF9A1B':'#2FD94F'}">${rep.length?below:'–'}</div>
         <div class="bp-lab">${rep.length?`of those reporting today<br>below normal`:`below normal:<br>no reading today`}</div></div>
     </div>`;
}
/* The drop across a basin, in prose. Gravity is the whole plumbing system —
   almost nothing here is pumped — and the sheer number of feet is the thing
   people don't picture until they see it written down. */
function dropLine(sb,b){
  const d=window.CW_BASINMAP&&CW_BASINMAP.drop?CW_BASINMAP.drop(sb):null;
  if(!d)return '';
  const ft=n=>Math.round(n).toLocaleString('en-US');
  return `<ul class="lr-list">
     <li>Highest measured point in the ${b.n}: <b>${d.hiName}</b>, ${ft(d.hi)} ft. Lowest: <b>${d.loName}</b>, ${ft(d.lo)} ft. A drop of <b>${ft(d.drop)} ft</b>.</li>
     <li>${W(`Not all of it is downhill: tunnels under the Divide move water across a watershed boundary ({{transmountain diversion|interbasin transfer}}), and {{Lake Nighthorse}} is filled by pumping from the {{Animas River|Animas}}.`)}</li>
   </ul>`;
}
/* One basin's step-down: heading, the reading instructions (which depend on
   which way the basin drains), the drop, and the diagram. */
function flowBlock(bid,bo,svg,opts){
  if(!svg)return '';
  opts=opts||{};
  const west=WEST.includes(bid);
  const inSide=west?'right':'left', outSide=west?'left':'right';
  return `<h3 class="lr-h3">How the water steps down${opts.suffix||''}</h3>
     ${opts.intro?`<p class="lr-p">${W(opts.intro)}</p>`:''}
     <p class="lr-p">Headwaters on the <b>${inSide}</b>, then each reservoir and gage in order; the water leaves the basin on the <b>${outSide}</b>${opts.tunnel?`, and for you through a tunnel under the Divide`:''}.</p>
     ${dropLine(bid,bo)}
     <div class="lr-chart cw-hover"><div class="mapscroll">${svg}</div><div class="lr-chart-cap">${bo.n} basin · ${west
       ? `<b>this basin drains west</b>, toward Utah, so the diagram reads <b>right to left</b>, the direction the water goes on a map. `
       : `<b>this basin rises east of the Divide</b> and leaves the state that way, so the diagram reads left to right. `}<b>Height runs down the page</b>,
       in order but not to scale. A height is printed only where a water surface is <b>measured</b> (DWR pool
       elevations, USGS gage datums, or the national elevation model where it resolves the lake); other
       reservoirs are placed by river position, with no number. <a href="data.html#elevation">How →</a>
       A reservoir’s percent is its newest reading; * = no reading today (the table gives its date).
       Ribbon width: typical late-July flow. ◆ gages: newest reading. <b>Dashed ribbons: tunnels</b>, drawn to the
       edge their water reaches. A schematic of order, not a channel map.</div>${
         window.CW_BASINMAP&&CW_BASINMAP.flowTable?CW_BASINMAP.flowTable(bid):''}</div>`;
}
function secMyBasin(tap){
  const hb=tap.hb;
  const sp=supplySplit(tap);
  /* the act's subject is where the water is stored, not where the reader
     stands — they are the same basin for most of the state, and different
     for most of the population */
  const sb=sp.ranked.length?sp.ranked[0][0]:hb;
  const cross=sb!==hb;
  const b=BASINS.find(x=>x.id===sb), homeB=BASINS.find(x=>x.id===hb);
  const shareOut=cross?Math.round(sp.ranked[0][1]/sp.tot*100):0;
  const homeShare=cross?Math.round((sp.ranked.filter(e=>e[0]===hb)[0]||[0,0])[1]/sp.tot*100):100;
  const map=window.CW_BASINMAP?CW_BASINMAP.render(sb,tap):'';
  const homeMap=cross&&window.CW_BASINMAP?CW_BASINMAP.render(hb,tap):'';
  const flowSVG=window.CW_BASINMAP&&CW_BASINMAP.flow?CW_BASINMAP.flow(sb,tap):'';
  /* When the supply basin isn't the one you live in, the home basin needs its
     own step-down too. Denver's supply basin is the Colorado, so showing only
     that left a Denver reader with no South Platte at all — the river running
     through their own city was missing from the page. */
  const homeFlow=cross&&window.CW_BASINMAP&&CW_BASINMAP.flow?CW_BASINMAP.flow(hb,tap):'';
  const tuns=(tap.tun||[]).map(n=>TUNNELS[n]?[n,TUNNELS[n]]:null).filter(Boolean);
  const plumbing=tuns.length
    ? `<h3 class="lr-h3">The tunnels</h3>
       <p class="lr-p">${W(`{{transmountain diversion|Tunnels under the Divide}} tied to your supply, with the year each opened:`)}</p>
       <ul class="tunlist">`
      +tuns.map(([n,t])=>`<li><span class="tun-yr">${t.year}</span><span class="tun-body"><a class="wikilink" href="https://en.wikipedia.org/wiki/${t.wiki}" target="_blank" rel="noopener"><b>${n}</b></a> · ${t.mi} mi · ${t.proj}. ${t.note.charAt(0).toUpperCase()+t.note.slice(1)}.</span></li>`).join('')
      +`</ul>`
    : `<h3 class="lr-h3">No tunnel feeds this one</h3>
       <p class="lr-p">${W(`None of the site’s tunnels under the {{Continental Divide}} brings water into this basin.`)}</p>`;
  const capCommon=`Reservoirs are drawn as glasses (size = capacity, fill = storage, color = against normal), rivers in their headwater colors, ◆ streamgages show their newest flow reading. Each glass shows its newest reading, dated in the table below. <b>Your own reservoirs are outlined in white.</b>`;
  return sec('mybasin','Act two · your basin',
    cross?'Two basins, one tap':`The ${b.n}`,
    (cross
      ? `<ul class="lr-list">
           <li>You live in the <b>${homeB.n}</b>; about <b>${homeShare}%</b> of your provider’s storage capacity is there.</li>
           <li>${W(`<b>${shareOut}%</b> is in the <b>${b.n}</b>, across the {{Continental Divide}}, and reaches you through a tunnel.`)}</li>
           <li>Both basins are mapped below. Shares are of capacity when full, from the site’s reservoir list.</li>
         </ul>
         ${splitBar(sp,hb)}
         <h3 class="lr-h3">Where your water is stored: the ${b.n}</h3>
         <p class="lr-p">${W(BASININFO[sb]||'')}</p>
         ${basinStatPanel(sb)}
         ${map?`<div class="lr-chart cw-hover"><div class="mapscroll">${map}</div><div class="lr-chart-cap">${W(`The ${b.n} basin, holding ${shareOut}% of your stored water. ${capCommon}`)}</div>${CW_BASINMAP.resTable?CW_BASINMAP.resTable(sb):''}</div>`:''}
         <div class="crossnote">${W(`↓ crosses the {{Continental Divide}}${tap.tun&&tap.tun.length?` through the <b>${tap.tun.join('</b> and <b>')}</b>`:''} ↓`)}</div>
         <h3 class="lr-h3">Where you live: the ${homeB.n}</h3>
         <p class="lr-p">${W(BASININFO[hb]||'')}</p>
         ${homeMap?`<div class="lr-chart cw-hover"><div class="mapscroll">${homeMap}</div><div class="lr-chart-cap">${W(`The ${homeB.n} basin, where you live and where the remaining ${homeShare}% is stored. ${capCommon}`)}</div>${CW_BASINMAP.resTable?CW_BASINMAP.resTable(hb):''}</div>`:''}`
      : `<p class="lr-p">${W(BASININFO[sb]||'')}</p>
         ${basinStatPanel(sb)}
         ${map?`<div class="lr-chart cw-hover"><div class="mapscroll">${map}</div><div class="lr-chart-cap">${W(`The ${b.n} basin. ${capCommon}`)}</div>${CW_BASINMAP.resTable?CW_BASINMAP.resTable(sb):''}</div>`:''}`)
    +`
     ${flowBlock(sb,b,flowSVG,{suffix:cross?' in the '+b.n:'',tunnel:cross})}
     ${flowBlock(hb,homeB,homeFlow,{suffix:' in the '+homeB.n,
       intro:`The river you live on: its own snowmelt, plus what arrives through the tunnel.`})}
     <h3 class="lr-h3">Snow in, water out</h3>
     ${cross?`<p class="lr-p">The snow that fills your largest reservoirs falls in the <b>${b.n}</b>, not where you live.</p>`:''}
     ${window.CW_HISTORY&&CW_HISTORY.hasSnowStore(sb)?`<p class="lr-p lr-aside">The ${poss(b.n)} snow and storage through water year 2026, month by month: <a href="water-year-2026.html#snowin-${sb}">the 2026 report</a>.</p>`:''}
     ${plumbing}`);
}

/* Snow in, water out, for one basin, water year 2026 (the report) */
function snowLineFor(bid){
  if(typeof SNOW_BASIN==='undefined'||!SNOW_BASIN[bid])return '';
  const b=BASINS.find(x=>x.id===bid);
  const sn=SNOW_BASIN[bid];
  const iMax=a=>a.reduce((bi,v,i)=>(v!=null&&(a[bi]==null||v>a[bi]))?i:bi,0);
  const ic=iMax(sn.cur), inr=iMax(sn.nrm);
  const pkc=sn.cur[ic], pkn=sn.nrm[inr];
  if(!(pkn>0)||pkc==null)return '';
  const rel=Math.round(pkc/pkn*100);
  return `<ul class="lr-list">
       <li>${b.n} snowpack peak: about <b>${rel}%</b> of the median peak, in ${monthName(ic)} (median: ${monthName(inr)}).</li>
       <li>Storage below: the same basin’s reservoirs, as a share of capacity, one point a month.</li>
     </ul>`;
}
function snowInOutBlock(bid){
  const b=BASINS.find(x=>x.id===bid);
  const chart=window.CW_HISTORY&&CW_HISTORY.hasSnowStore(bid)
    ?`<div class="cw-mount" data-cw="snowStore" data-basin="${bid}"></div>`:'';
  const chartTable=chart&&CW_HISTORY.snowStoreTable?CW_HISTORY.snowStoreTable(bid):'';
  return `${snowLineFor(bid)}
     ${chart?`<div class="lr-chart">${chart}<div class="lr-chart-cap">${b.n} basin, water year 2026 · top: snow-water equivalent on the basin’s long-record SNOTEL sites (NRCS). Bottom: storage as a share of supply capacity, flood-control pools left out. Band and dashed median: measured, CDSS daily basin totals since 2005, by week. 2026 storage: a monthly reconstruction (the July snapshot scaled by the basin’s monthly figure), so one dot a month. Two panels, two axes: inches of snow and percent full do not convert.</div>${chartTable}</div>`:''}`;
}
function secSnowInOut(){
  const ids=BASINS.map(x=>x.id).filter(id=>id!=='all'&&window.CW_HISTORY&&CW_HISTORY.hasSnowStore(id));
  if(!ids.length)return '';
  const pick=(location.hash.match(/^#snowin-(\w+)/)||[])[1];
  const cur=ids.includes(pick)?pick:(ids.includes('colorado')?'colorado':ids[0]);
  return sec('snowin','Snow in, water out','Each basin through the year',
    `<div class="seg seg-wrap" role="group" aria-label="Basin" id="snowin-pick">${ids.map(id=>
      `<button data-basin="${id}" aria-pressed="${id===cur}">${BASINS.find(x=>x.id===id).n}</button>`).join('')}</div>
     <div id="snowin-body">${snowInOutBlock(cur)}</div>`);
}

/* =====================================================================
   ACT 3 — YOUR TAP
   ===================================================================== */
function secTap(tap){
  const home=slopeOf(tap.hb);
  const across=[], same=[];
  (tap.res||[]).forEach(id=>{const r=RESBY[id]; if(!r)return; (slopeOf(r.b)!==home?across:same).push(r);});
  const acrossBasins=[...new Set(across.map(r=>BASINS.find(b=>b.id===r.b).n))];
  /* supply reservoirs only — flood-control pools are not part of the share */
  const totCap=across.concat(same).filter(r=>!r.fc).reduce((s,r)=>s+r.cap,0);
  const reveal=(across.length&&tap.tun&&tap.tun.length)
    ? `<p class="reveal">${W(`Much of your water starts <b>across the {{Continental Divide}}</b>, in the ${acrossBasins.join(' and ')}, and crosses beneath the mountains through the <b>${tap.tun.join('</b> and <b>')}</b>.`)}</p>`
    : '';
  const fc=(tap.fcres&&tap.fcres.length)
    ? `<p class="fc-note">${W(`The big lakes you see nearby (${tap.fcres.map(id=>cleanName(RESBY[id].n)).join(', ')}) are the flood-control reservoirs from earlier, not your supply.`)}</p>`
    : '';
  const approx=tap._approx
    ? `<p class="lr-p lr-aside">${W(`ZIP ${tap.zip}’s exact provider is not mapped yet, so this shows the nearest system that is, <b>${tap.prov}</b>, for the regional picture. Your provider, and near the Divide sometimes the basin, may differ.`)}</p>`
    : '';
  return sec('tap','Act three · your tap',tap.prov,
    approx+`<ul class="lr-list">
       <li>Your water comes through <b>${tap.prov}</b>; a neighbor on another utility may drink from another river.</li>
       <li>${W(`Colorado adopted {{prior appropriation}} in 1872: in a shortage, junior rights may get less water or none (Wikipedia).`)}</li>
     </ul>
     <div class="callout">
       <p class="co-h">A note on the words</p>
       <ul class="lr-list">
         <li><b>Provider</b>: the city department, district or company that delivers your water. Not the same as a <b>Public Water System</b> under the Safe Drinking Water Act (one provider can run several), nor a water <b>right</b>.</li>
         <li>Some entries cover a cluster of small neighboring providers.</li>
         <li>ZIP codes are postal routes, not service areas: a regional picture. <a href="data.html#providers">How providers are modelled, and the authoritative answer →</a></li>
       </ul>
     </div>
     <p class="lr-p tap-desc">${tap.desc}</p>
     ${reveal}
     ${totCap?`<ul class="lr-list">
        <li>These reservoirs hold <b>${kaf(totCap)} thousand acre-feet</b> when full.</li>
        <li>Each row: its share of your provider’s storage capacity, its newest reading with its date, and the reservoir’s median year as a line.</li>
      </ul>`:''}
     ${glassGroup('Across the Divide: West Slope',across,totCap)}
     ${glassGroup(home==='w'?'From your own basin':'From your side of the mountains',same,totCap)}
     ${same.length===1&&across.length?`<p class="lr-p lr-aside">That one reservoir is all of your provider’s storage on this side of the Divide.</p>`:''}
     ${fc}`);
}

function secAction(tap,zip){
  const pl=providerLink(tap.prov);
  const res=SAVE_RESOURCES.map(r=>`<li><a class="wikilink" href="${r.url}" target="_blank" rel="noopener">${r.lab}</a></li>`).join('');
  return sec('action','Your move','What you can actually do',
    `<p class="lr-p">Supply is set by snow; what a household can change is its use.</p>
     <ul class="lr-list">
       <li>${W(`In the United States, 50% to 70% of residential water goes on landscaping, most of it on lawns ({{Lawn}}, Wikipedia).`)}</li>
       <li>The average US household uses more water outdoors than for showering and washing clothes combined (<a class="wikilink" href="https://www.epa.gov/watersense/outdoors" target="_blank" rel="noopener">EPA WaterSense</a>).</li>
       <li>${pl?`Watering rules change by season and utility; the site does not guess yours: <a class="wikilink" href="${pl.url}" target="_blank" rel="noopener">${pl.lab} →</a>`
         :`Watering rules change by season and utility; check <b>${tap.prov}</b>’s website.`}</li>
     </ul>
     <h3 class="lr-h3">Habits</h3>
     <ul class="lr-list">
       <li>Water before dawn or after dusk; skip a cycle after rain.</li>
       <li>Replace turf with native and xeric plants.</li>
       <li>Fix leaks: toilets, taps, drip lines.</li>
       <li>Use your utility’s rebates for efficient fixtures and smart controllers.</li>
     </ul>
     <h3 class="lr-h3">Go deeper</h3>
     <ul class="lr-list lr-links">${res}</ul>
     <div class="explore-block">
       <p class="xb-h">Want the whole state, reservoir by reservoir?</p>
       <p class="xb-sub">The detailed map plots all ${RES.length} reservoirs, every gage and every tunnel at once. It is dense and best on a large screen.</p>
       <div class="xb-links">
         <a class="story-cta" href="map.html#zip=${zip}">Open the detailed map →</a>
         <a class="xb-alt" href="water-year-2026.html#player">or watch water year 2026 month by month →</a>
       </div>
     </div>`);
}

/* =====================================================================
   TODAY — the newest day's readings only
   ===================================================================== */
let liveState='loading';     /* loading | ok | failed: what Today can say */
function heroToday(){
  const day=LIVE_META.day;
  const head=`<p class="lr-eyebrow">Colorado water · today</p><h1 class="lr-title">Colorado water today</h1>`;
  if(!day)return `<header class="lr-hero">${head}<p class="lr-servedby">${liveState==='failed'
    ?'The daily readings could not be loaded, so nothing on this page can be called today’s. (Normal when the page is opened offline or as a saved file.)'
    :'Loading the daily readings…'}</p></header>`;
  const w=wyDay(day), all=basinToday('all');
  return `<header class="lr-hero">${head}
    <p class="lr-servedby">${fmtDay(day,true)} · water year ${w.wy}, day ${w.day}</p>
    ${all.pct!=null?`<p class="lr-sub today-head">The reservoirs that reported today hold <b>${all.pct}%</b> of what is usual for this week.</p>`:''}</header>`;
}
function secBasinsToday(home){
  const all=basinToday('all');
  return sec('basins','Today','Seven basins, from today’s readings',
    `${basinExplorer(home,'today')}
     ${basinTodayList()}
     <ul class="lr-list lr-cap">
       <li>Storage against the median for this week of the year.</li>
       <li>${all.n} of ${all.count} supply reservoirs reported today (Colorado DWR telemetry, ${fmtDay(LIVE_META.day)}). A reservoir with no reading today is left out, not estimated.</li>
       <li>Boundaries: USGS Watershed Boundary Dataset (public domain).</li>
     </ul>`);
}
function secBlueMesa(){
  const bm=RESBY['bluemesa']; if(!bm)return '';
  const rd=readingOf(bm);
  if(rd.pm==null)return '';
  const src=rd.kind==='reading'?'Colorado DWR telemetry':rd.kind==='obs'?(bm.s||'published reading'):'estimate';
  return sec('bluemesa','The largest lake entirely in Colorado','Blue Mesa',
    `<div class="bignum"><div class="bignum-v" style="color:${rampText(rd.pm)}">${rd.pm}%</div>
       <div class="bignum-lab">${W(`of the median for the week: {{Blue Mesa Reservoir}} ${readingWhen(rd)}, holding ${af(rd.sto)} acre-feet (${src}).`)}</div></div>
     <ul class="lr-list lr-aside">
       <li>Its link to Lake Powell: <a href="how-it-works.html#lr-longview">How it works</a>.</li>
       <li>Lake Powell year by year: <a href="long-view.html">the long view</a>.</li>
     </ul>`);
}
function renderToday(){
  const home=curTap?curTap.hb:null;
  const el=document.getElementById('today-body');
  el.innerHTML=heroToday()+(LIVE_META.day?secBasinsToday(home)+secBlueMesa():'');
  if(window.CW_HISTORY)CW_HISTORY.mountAll(el);
  wireBasinExplorer(home);
}
/* Your reservoirs, newest reading each, dated where it is not today's */
function secTapToday(tap,zip){
  const home=slopeOf(tap.hb);
  const across=[], same=[];
  (tap.res||[]).forEach(id=>{const r=RESBY[id]; if(!r)return; (slopeOf(r.b)!==home?across:same).push(r);});
  const sup=across.concat(same).filter(r=>!r.fc);
  const totCap=sup.reduce((s,r)=>s+r.cap,0);
  const nToday=sup.filter(r=>readingOf(r).today).length;
  const approx=tap._approx
    ? `<p class="lr-p lr-aside">${W(`ZIP ${tap.zip||zip}’s exact provider is not mapped yet, so this shows the nearest system that is, <b>${tap.prov}</b>, for the regional picture. Your provider, and near the Divide sometimes the basin, may differ.`)}</p>`
    : '';
  const fc=(tap.fcres&&tap.fcres.length)
    ? `<p class="fc-note">${W(`The big lakes you see nearby (${tap.fcres.map(id=>cleanName(RESBY[id].n)).join(', ')}) are flood-control reservoirs, not your supply.`)}</p>`
    : '';
  return sec('tap','Your reservoirs','Your reservoirs today',
    approx+`<p class="lr-p">${LIVE_META.day?`<b>${nToday} of ${sup.length}</b> of ${tap.prov}’s supply reservoirs reported today (${fmtDay(LIVE_META.day)}).`
        :`The daily readings are not loaded, so none of these is today’s.`}
       A reservoir with no reading today shows its last one, with its date.</p>
     ${glassGroup('Across the Divide: West Slope',across,totCap)}
     ${glassGroup(home==='w'?'From your own basin':'From your side of the mountains',same,totCap)}
     ${fc}
     <p class="lr-p lr-aside"><a href="how-it-works.html#${zip}">Follow it from your tap to its basin and its tunnels →</a><br>
       <a href="map.html#zip=${zip}">See it on the detailed map →</a></p>`);
}
function localHero(tap,zip){
  const b=BASINS.find(x=>x.id===tap.hb);
  return `<header class="lr-hero lr-hero2"><p class="lr-eyebrow">Your water · ZIP ${zip}</p>
       <h1 class="lr-title">${tap._approx?'Near '+tap.city:tap.city}</h1>
       <p class="lr-servedby">${tap._approx?'Nearest mapped system: ':'Served by '}<b>${tap.prov}</b> · ${b.n} basin</p></header>`;
}

/* =====================================================================
   HOW IT WORKS — the explainer and the ZIP trace
   ===================================================================== */
function renderHow(){
  const el=document.getElementById('how-body');
  el.innerHTML=`<header class="lr-hero"><p class="lr-eyebrow">Colorado water · how it works</p>
       <h1 class="lr-title">How it works</h1>
       <p class="lr-servedby">Where Colorado’s water comes from, where it is stored, and how it reaches your tap</p>
       <p class="lr-sub">The state first, then your ZIP. Bold terms link to their sources.</p></header>`
    +secSnowHow()+secReservoirs()+secBasinsHow()+secMegadrought();
  if(window.CW_HISTORY)CW_HISTORY.mountAll(el);
}

/* =====================================================================
   WATER YEAR 2026 — the closed year, frozen. This page loads no daily
   readings, so nothing on it can drift into the new year.
   ===================================================================== */
function secFlow2026(){
  return sec('flow','Streamflow','Streamflow, statewide, against the median',
    `<ul class="lr-list">
       <li>November to February: <b>76% to 79%</b>.</li>
       <li>March: <b>93%</b>, the melt starting early.</li>
       <li>April 60% · May 34% · June <b>27%</b>, the low.</li>
       <li>July 46% · August 55% · September <b>59%</b>.</li>
     </ul>`);
}
function secStorage2026(){
  return `<ul class="lr-list">
       <li>October to February: from 69% (Gunnison) to 116% (South Platte).</li>
       <li>Gunnison <b>23%</b> (83% in March).</li>
       <li>Colorado headwaters <b>52%</b> (93% in April).</li>
       <li>Arkansas 86% · Rio Grande 87% · San Juan &amp; Dolores 91% · South Platte 97%.</li>
       <li>Yampa &amp; White 78%, an estimate: no reservoir there reports.</li>
     </ul>`;
}
function secPowell2026(){
  return sec('record','2026 against the record','Lake Powell',
    `<ul class="lr-list">
       <li>30 September: <b>5.16M acre-feet</b>, the lowest end of a water year since 1964.</li>
       <li>Low of the year: <b>5.07M</b> on 15 September, the lowest since June 1967.</li>
       <li>Peak on record: 24.1M, September 1983. Source: USBR.</li>
       <li>Every September since 1963, and snow by decade: <a href="long-view.html">the long view</a>.</li>
     </ul>`);
}
function secMethod2026(){
  return sec('method','Method','How the figures are made',
    `<ul class="lr-list">
       <li>Storage: Colorado DWR telemetry against each reservoir’s median for the week (daily records from 2005).</li>
       <li>Streamflow: the mapped USGS and DWR gages against theirs (USGS daily values from 1991).</li>
       <li>Snow: NRCS SNOTEL snow-water equivalent on a fixed panel of long-record sites.</li>
       <li>Lake Powell: USBR Upper Colorado daily storage.</li>
       <li>Every month, basin by basin: the <a href="data.html">basin history CSV</a> on the Data page.</li>
     </ul>`);
}
function renderReport(){
  const el=document.getElementById('report-body');
  el.innerHTML=`<header class="lr-hero"><p class="lr-eyebrow">Report · water year 2026</p>
       <h1 class="lr-title">Water year 2026</h1>
       <p class="lr-servedby">1 October 2025 to 30 September 2026 · a finished year; this page is not updated</p></header>`
    +secSnowReport()+secFlow2026()+secBasinsReport(null);
  if(window.CW_HISTORY)CW_HISTORY.mountAll(el);
  wireBasinExplorer(null);
  const after=document.getElementById('report-after');
  if(after){
    after.innerHTML=secSnowInOut()+secPowell2026()+secMethod2026();
    if(window.CW_HISTORY)CW_HISTORY.mountAll(after);
    const pk=document.getElementById('snowin-pick'), body=document.getElementById('snowin-body');
    if(pk&&body)pk.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      pk.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
      body.innerHTML=snowInOutBlock(b.dataset.basin);
      if(window.CW_HISTORY)CW_HISTORY.mountAll(body);
    }));
  }
}

/* =====================================================================
   THE LONG VIEW — the record, year by year
   ===================================================================== */
function renderLongView(){
  const el=document.getElementById('longview-body');
  el.innerHTML=`<header class="lr-hero"><p class="lr-eyebrow">Colorado water · the long view</p>
       <h1 class="lr-title">The long view</h1>
       <p class="lr-servedby">The record, year by year. Each October the year just closed is added.</p></header>`
    +secPowell()+secSnowDecades();
  if(window.CW_HISTORY)CW_HISTORY.mountAll(el);
}

/* =====================================================================
   SHARED WIRING
   ===================================================================== */
function wireBasinExplorer(home){
  const bx=document.getElementById('basin-explorer'); if(!bx)return;
  const mode=bx.dataset.mode;
  const sel=document.getElementById('basin-sel');
  bx.querySelectorAll('.sbasin').forEach(p=>{
    const pick=()=>{
      curSel=p.dataset.basin;
      bx.querySelectorAll('.sbasin').forEach(x=>{
        x.classList.toggle('sel',x===p);
        x.setAttribute('aria-pressed',String(x===p));
      });
      if(sel)sel.innerHTML=basinSummaryHTML(curSel,home,mode);};
    p.addEventListener('click',pick);
    p.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();pick();}});
  });
  const svg=bx.querySelector('svg.basinmap');
  if(svg&&window.CW_CHARTS)CW_CHARTS.markHover(svg,{container:bx});
}
function renderMain(){
  if(PAGE==='today')renderToday();
  else if(PAGE==='how')renderHow();
}
function renderLocal(tap,zip){
  const el=document.getElementById('local-body');
  if(!el)return;
  el.hidden=false;
  el.innerHTML=localHero(tap,zip)+(PAGE==='how'
    ?secMyBasin(tap)+secTap(tap)+secAction(tap,zip)
    :secTapToday(tap,zip));
  if(window.CW_HISTORY)CW_HISTORY.mountAll(el);
  /* on a phone the maps are wider than the screen: open each one centred */
  el.querySelectorAll('.mapscroll').forEach(m=>{m.scrollLeft=(m.scrollWidth-m.clientWidth)/2;});
  /* the basin maps and step-downs are string-built; their tooltips attach
     to the inserted DOM via the shared delegated hover */
  el.querySelectorAll('.cw-hover').forEach(box=>{
    const svg=box.querySelector('svg');
    if(svg)window.CW_CHARTS.markHover(svg,{container:box});
  });
}

/* ---------- entry wiring (Today and How it works) ---------- */
function msg(t){const el=document.getElementById('zipmsg');if(el)el.textContent=t;}
function choosePlace(tap,zip,scroll){
  curTap=tap; curZip=zip;
  renderMain();                  /* re-render so the map marks the home basin */
  renderLocal(tap,zip);
  history.replaceState(null,'','#'+zip);
  if(scroll!==false){
    const t=document.getElementById('local-body');
    if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
  }
}
function submitZip(){
  const z=(document.getElementById('zip').value||'').trim();
  if(!/^\d{5}$/.test(z)){msg('five digits, e.g. 80302');return;}
  const t=zipLookup(z);
  if(!t){msg(/^8[01]/.test(z)
    ?'that ZIP is not mapped yet. Try a nearby city below'
    :'this covers Colorado, but wherever you are, your tap has a watershed too');return;}
  msg('');
  choosePlace(t,z);
}
function wireZip(){
  const go=document.getElementById('zipgo'), zi=document.getElementById('zip');
  if(!go||!zi)return;
  go.addEventListener('click',submitZip);
  zi.addEventListener('keydown',e=>{if(e.key==='Enter')submitZip();});
  const cc=document.getElementById('citychips');
  if(!cc)return;
  cc.innerHTML=STORY_CITIES.map(c=>{
    const bn=(BASINS.find(x=>x.id===c.b)||{}).n||'';
    const hue=(typeof BASIN_HUE!=='undefined'&&BASIN_HUE[c.b])||'#8FA6B2';
    return `<button class="citychip" data-tap="${c.tap}" data-zip="${c.zip}" title="${c.label} · ${bn} basin">`
      +`<span class="cc-city">${c.label}</span>`
      +`<span class="cc-basin"><i style="background:${hue}"></i>${bn}</span></button>`;
  }).join('');
  cc.querySelectorAll('.citychip').forEach(b=>b.addEventListener('click',()=>{
    const t=TAPS.find(x=>x.id===b.dataset.tap);
    if(t){document.getElementById('zip').value=b.dataset.zip;msg('');choosePlace(t,b.dataset.zip);}
  }));
}

/* ---------- history + boot ---------- */
/* #80302 and #zip=80302 open that ZIP's water, as old links always did */
function syncFromHash(){
  const h=location.hash.replace(/^#/,'');
  const zip=/^\d{5}$/.test(h)?h:((h.match(/(?:^|&)zip=(\d{5})/)||[])[1]);
  if(zip){
    const t=zipLookup(zip);
    if(t){curTap=t;curZip=zip;
      const zi=document.getElementById('zip'); if(zi)zi.value=zip;
      renderMain();renderLocal(t,zip);return;}
  }
  curTap=null;curZip=null;
  renderMain();
  const el=document.getElementById('local-body'); if(el){el.hidden=true;el.innerHTML='';}
}
/* an anchor into JS-built content (#lr-snow, #snowin-colorado) can only be
   honoured once that content exists */
function scrollToHashOnce(){
  const h=location.hash.replace(/^#/,'');
  if(PAGE==='report'&&/(^|&)m=/.test(h)){const p=document.getElementById('player');if(p&&p.scrollIntoView)p.scrollIntoView({block:'start'});return;}
  if(!h||/^\d{5}$/.test(h)||/=/.test(h))return;
  const t=document.getElementById(h)||(h.startsWith('snowin-')&&document.getElementById('lr-snowin'));
  if(t&&t.scrollIntoView)t.scrollIntoView({block:'start'});
}
if(PAGE==='today'||PAGE==='how'){
  wireZip();
  window.addEventListener('popstate',syncFromHash);
  window.addEventListener('cw-live',ev=>{
    const d=(ev&&ev.detail)||{};
    if(!d.gages&&!d.reservoirs){
      /* nothing came: Today says so instead of showing yesterday as today */
      liveState='failed';
      if(PAGE==='today')renderToday();
      return;
    }
    liveState='ok';
    /* remember which table views the reader opened, restore them after */
    const open=[...document.querySelectorAll('details.lr-table[open]')]
      .map(x=>x.id).filter(Boolean);
    renderMain();
    if(curTap)renderLocal(curTap,curZip);
    open.forEach(id=>{const x=document.getElementById(id);if(x)x.setAttribute('open','');});
  });
  syncFromHash();
}else if(PAGE==='report')renderReport();
else if(PAGE==='longview')renderLongView();
scrollToHashOnce();
})();
