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
function decadeTrend(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec)return '';
  const keys=Object.keys(D.dec).sort();
  const a=D.dec[keys[0]], z=D.dec[keys[keys.length-1]];
  if(!a||!z||!a.peak)return '';
  const drop=Math.round((1-z.peak/a.peak)*100);
  /* the late-spring gap: where the decades pull apart fastest */
  const wk=LATE_MAY_WK, ga=a.wk[wk], gz=z.wk[wk];
  const springDrop=(ga>0&&gz!=null)?Math.round((1-gz/ga)*100):null;
  return `<p class="lr-p">${W(`Stack the decades on one chart and the trend is plain. Across a
     <b>fixed</b> panel of ${D.n} long-record {{SNOTEL}} sites, the same stations in every decade so the
     comparison does not depend on which sites happened to be running, the median peak snowpack has
     fallen from <b>${a.peak}″</b> in the ${keys[0]} to <b>${z.peak}″</b> in the ${keys[keys.length-1]},
     a drop of about <b>${drop}%</b>.`)}</p>
     ${springDrop!=null?`<p class="lr-p">${W(`The loss is concentrated in spring. The
       decades barely separate in midwinter. They fan apart through <b>spring</b>, and by late May the
       ${keys[keys.length-1]} hold roughly <b>${springDrop}% less</b> water than the ${keys[0]} did. Less
       snow falls, and what does fall leaves sooner, ahead of the summer that needs it.`)}</p>`:''}`;
}
function decadeYearLine(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  const cur=D&&D.curStats;
  if(!cur)return '';
  return `<p class="lr-p">${W(`Water year ${D.curWY} sits below all of them: a peak of
       <b>${cur.peak}″</b>${cur.apr1!=null?`, and <b>${cur.apr1}″</b> left on April 1`:''}, well under
       half a normal year and the lowest line on the chart by a wide margin.`)}</p>`;
}
function secSnowHow(){
  const facts=COLORADO_FACTS.map(f=>
    `<div class="fact"><div class="fact-stat">${f.stat}</div>`
    +`<div class="fact-lab">${W(f.lab)} ${cite(f.cite)}</div></div>`).join('');
  return sec('snow','Where it begins','Colorado’s water starts as snow',
    `<p class="lr-p">${W(`Most of the water Colorado uses falls first as snow. Winter storms stack {{snowpack|snow}} on the high country, and that frozen reservoir, measured all season as {{snow water equivalent|snow-water equivalent}} (the depth of water it would melt into), is the state’s largest store of water. The lakes below are where it goes afterward.`)}</p>
     <div class="fact-grid">${facts}</div>
     <h3 class="lr-h3">A year that begins in October</h3>
     <p class="lr-p">${W(`Hydrology does not use the calendar year. The {{water year}} starts on <b>October 1</b>, when the snow that will feed next summer begins to fall. Snow piles up until about April. It melts through spring, and that {{snowmelt}} fills the reservoirs, with most of a year’s inflow arriving in a few weeks. From summer into fall the releases run and the levels fall, until the first snows start the cycle again.`)}</p>
     <p class="lr-p">${W(`Because the snow is the storage, a warm early spring can undo a decent winter. The mountains can hold a fair snowpack and still come up short if it melts too fast to catch.`)}</p>
     <p class="lr-p lr-aside">The snow season drawn week by week, with 2026 on it, is in the <a href="water-year-2026.html#lr-snow">water year 2026 report</a>. The decades side by side are on <a href="long-view.html#lr-snowdecades">the long view</a>.</p>`);
}
function secSnowReport(){
  const chart=window.CW_HISTORY&&CW_HISTORY.hasSnowChart()
    ?'<div class="cw-mount" data-cw="snowState" data-closed="1"></div>':'';
  return sec('snow','Snow','The snow that peaked early',
    `${chart?`<div class="lr-chart">${chart}<div class="lr-chart-cap">A 1980s snow season against a 2020s one, with water year 2026 on top · statewide snow-water equivalent from a fixed panel of NRCS SNOTEL sites, median across each decade’s water years. The shaded season is when the melt reaches the reservoirs.</div></div>`:''}
     ${decadeYearLine()}
     <p class="lr-p">${W(`A warm early spring can undo a decent winter, and that is roughly what happened in 2026. By the last week of May, the long-record SNOTEL sites were already bare.`)}</p>
     <p class="lr-p lr-aside">How 2026 compares with every decade since the 1980s: <a href="long-view.html#lr-snowdecades">the long view</a>.</p>`);
}
function secSnowDecades(){
  const bars=window.CW_HISTORY&&CW_HISTORY.hasDecades()
    ?'<div class="cw-mount" data-cw="snowBars"></div>':'';
  const table=window.CW_HISTORY&&CW_HISTORY.hasDecades()?CW_HISTORY.snowDecadeTable():'';
  return sec('snowdecades','Snowpack by decade','The snowpack, decade by decade',
    `${decadeTrend()}
     ${bars?`<div class="lr-chart">${bars}<div class="lr-chart-cap">Median peak snowpack, decade by decade, from the same fixed panel of sites, with water year 2026 at the end. No decade has peaked higher than the one before it, and the 2000s and 2010s tied. The dashed rule carries the 1980s level across for comparison.</div>${table}</div>`:''}`);
}

/* §3 what reservoirs actually do (education) */
function secReservoirs(){
  const sanchez=RESBY['sanchez'];
  return sec('reservoirs','The lakes','What a reservoir is really for',
    `<p class="lr-p">${W(`A reservoir is a <b>delay</b>. It catches a spring flood that would otherwise run to Utah in three weeks and pays it back over the twelve months you need it. That is why levels are supposed to fall all summer, and why a low lake in September is not automatically a crisis.`)}</p>
     <p class="lr-p">${W(`What matters is <b>carryover</b>: the water still in storage when the next water year begins. A healthy year ends with a cushion. A dry year ends low, and the following winter has to make up the difference.`)}</p>
     ${sanchez?`<p class="lr-p">${W(`Purpose matters too. ${cleanName(sanchez.n)}, in the San Luis Valley, is irrigation storage, emptied to almost nothing by late summer most years and then refilled. There, empty is the job. Elsewhere, empty is a warning.`)}</p>`:''}
     <p class="lr-p">${W(`Some well-known lakes are not supply at all. Cherry Creek and Bear Creek are Army Corps of Engineers {{flash flood|flood-control}} reservoirs. The water you sail on is a small permanent pool, and most of each dam’s capacity is kept empty, waiting for a storm.`)}</p>
     <h3 class="lr-h3">So what about summer rain?</h3>
     <p class="lr-p">${W(`Come July the {{North American Monsoon}} pushes Gulf moisture north and Colorado’s afternoons turn to thunderstorms. It feels like relief, and in one way it is, but it rarely shows up in the reservoirs:`)}</p>
     <ul class="lr-list">
       <li>${W(`<b>It cuts demand more than it adds supply.</b> A wet week means nobody irrigates, so the drawdown slows. Less water goes out, and that alone can flatten a summer decline even if little rain flows in.`)}</li>
       <li>${W(`<b>It rarely refills the big lakes.</b> Monsoon rain lands as intense, local bursts on dry ground. Most of it evaporates or runs off fast, and the storms miss the high country that feeds the major reservoirs.`)}</li>
       <li>${W(`<b>It recharges {{soil moisture}}.</b> Wet late-summer soil matters for next year. Dry ground absorbs the following spring’s melt before it reaches a stream.`)}</li>
       <li>${W(`<b>It arrives as {{flash flood|flash floods}}.</b> The same bursts that cannot fill a reservoir can fill a canyon in minutes, which is what the empty flood pools are for.`)}</li>
     </ul>
     <p class="lr-p lr-aside">${W(`A strong monsoon eases a drought summer. It does not end a drought. The snowpack decides the year.`)}</p>`);
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
    <p class="bxl-note">100% is normal: the median storage for this week of the year across the
      record, not full. Below 100% the basin holds less than it usually does at this point in the
      year. Basins are shaded against their <i>own</i> normal, so they can be read side by side.${
      mode==='today'?' A basin drawn dark had no reservoir reporting today.':''}</p>
  </div>`;
}
function basinSummaryHTML(bid,home,mode){
  const b=BASINS.find(x=>x.id===bid);
  const slope=`<span>${WEST.includes(bid)?'West slope':'East slope'}</span>`;
  if(mode==='today'){
    const t=basinToday(bid);
    return `<div class="bx-head"><span class="bx-name">${b.n}${bid===home?' · your basin':''}</span>`
      +`<span class="bx-pct"${t.pct!=null?` style="color:${rampText(t.pct)}"`:''}>${t.pct!=null?t.pct+'% of normal today':'no reading today'}</span></div>`
      +`<p class="bx-blurb">${BASININFO[bid]||''}</p>`
      +`<div class="bx-stats">${slope}<span>${t.n} of ${t.count} reservoirs reported today</span>`
      +`<span>${kaf(t.cap)} KAF full</span></div>`;
  }
  const st=basinStats(bid);
  return `<div class="bx-head"><span class="bx-name">${b.n}${bid===home?' · your basin':''}</span>`
    +`<span class="bx-pct" style="color:${rampText(st.pct)}">${st.pct}% of normal on 30 September</span></div>`
    +`<p class="bx-blurb">${BASININFO[bid]||''}</p>`
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
    `<p class="lr-p">${W(`Colorado drains into seven river basins, four west of the {{Continental Divide}} and three east, matching the state’s seven water divisions. They do not share a fate. Each lives on its own snowpack, so in the same year one can be near normal while another is deep in drought.`)}</p>
     <p class="lr-p lr-aside">Each basin against its own normal: <a href="index.html">today</a>, from the day’s readings, and on <a href="water-year-2026.html#lr-basins">30 September 2026</a>, where water year 2026 ended.</p>`);
}
function secBasinsReport(home){
  return sec('basins','Where each basin ended','Seven basins on 30 September 2026',
    `<p class="lr-p">${W(`Each basin is colored by how much water it held on 30 September 2026 against its <i>own</i> normal. That is the carryover water year 2027 starts from. Tap any basin for its details.`)}</p>
     ${basinExplorer(home,'yearend')}
     <p class="lr-p lr-cap">Boundaries from the public-domain USGS Watershed Boundary Dataset; storage derived from Colorado DWR telemetry against each basin’s own record, as monthly figures in the <a href="data.html">basin history CSV</a>.</p>`);
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
    `<p class="lr-p">${W(`{{Lake Powell}}, the Colorado River’s savings account, shows the long trend plainly: full through the 1980s, drawn toward dead pool over two decades.`)}</p>
     ${powell?`<div class="lr-chart">${powell}<div class="lr-chart-cap">${W(`{{Lake Powell}} annual storage${pk&&last?`, from a peak near ${(pk[1]/1e6).toFixed(1)}M acre-feet (${pk[0]}) to ${(last[1]/1e6).toFixed(1)}M (${last[0]})`:''} · US Bureau of Reclamation`)}</div>${powellTable}</div>`:''}`);
}
/* the megadrought: the explainer, on How it works */
function secMegadrought(){
  return sec('longview','A drier baseline','A drought, and a drier baseline',
    `<p class="lr-p">${W(`One dry year is weather. A falling baseline is something else. Since 2000 the Colorado River basin has been in what scientists call a {{megadrought}}, the driest stretch in at least twelve centuries, and warming is making the dryness structural. That shift has its own name: {{aridification}}.`)}</p>
     <p class="lr-p">${W(`Colorado’s own {{Blue Mesa Reservoir}}, the largest in the state, is the next account upstream of {{Lake Powell}}. When the river runs short, Blue Mesa is released to prop Powell up.`)}</p>
     <p class="lr-p">${W(`The hard part of {{aridification}} is that warming shifts precipitation from snow toward rain, melts the snow earlier, and evaporates more from every reservoir surface. Even a <i>normal</i> snow year now yields less usable water than it did a generation ago.`)}</p>
     <p class="lr-p lr-aside">Lake Powell’s every September since 1963 is on <a href="long-view.html">the long view</a>.</p>`);
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
  return `<p class="lr-p">${W(`It is mostly downhill. Between the highest point measured in the
    ${b.n}, <b>${d.hiName}</b> at ${ft(d.hi)} feet, and the lowest, <b>${d.loName}</b> at ${ft(d.lo)},
    the water drops <b>${ft(d.drop)} feet</b>. Every reservoir on the way is a step on that staircase,
    and gravity does most of the work. Not all of it: {{Lake Nighthorse}} was filled by pumping the
    {{Animas River|Animas}} uphill, and every {{transmountain diversion|tunnel under the Divide}} carries
    water sideways, across a watershed boundary it would never cross on its own.`)}</p>`;
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
     <p class="lr-p">${W(`Follow it in order. Snowmelt enters at the headwaters on the <b>${inSide}</b>,
       passes through each reservoir and gage in turn, and leaves the basin on the
       <b>${outSide}</b>${opts.tunnel?`, including, for you, through a tunnel under the Divide`:''}.
       Every drop is routed through the same handful of structures.`)}</p>
     ${dropLine(bid,bo)}
     <div class="lr-chart cw-hover"><div class="mapscroll">${svg}</div><div class="lr-chart-cap">${bo.n} basin · ${west
       ? `<b>this basin drains west</b>, toward Utah, so the diagram reads <b>right to left</b>, the direction the water goes on a map. `
       : `<b>this basin rises east of the Divide</b> and leaves the state that way, so the diagram reads left to right. `}<b>Height runs down the page</b>.
       The spacing is <i>not</i> to scale, since a linear axis would crush the lower half of the basin into a
       stripe, but the order is. A height is printed only where there is a <b>measured</b> water surface (live
       DWR pool elevations, USGS gage datums, or the national elevation model where it clearly resolves the lake).
       Reservoirs without one are placed by their position on the river and carry no number.
       <a href="data.html#elevation">How that is worked out →</a>
       A reservoir’s percent is its newest reading; one marked * did not report today, and the table gives its date.
       Ribbon width tracks how much water each reach carries (typical late-July flows). ◆ gages show the newest
       reading where there is one. <b>Dashed ribbons are tunnels</b>, and they run to whichever edge their water reaches:
       on the West Slope the river leaves to the left, toward Utah, while the tunnels break away to the right,
       east under the Divide. A schematic of the order things happen in, not a channel map.</div>${
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
    ? `<h3 class="lr-h3">The plumbing that made it livable</h3>
       <p class="lr-p">${W(`Your basin’s water did not always flow the way it does now. Beginning in the 1930s, Colorado bored tunnels through the {{Continental Divide}}, {{transmountain diversion|transmountain diversions}} that carry West Slope snowmelt east to the cities that grew up dry. The ones tied to your supply:`)}</p>
       <ul class="tunlist">`
      +tuns.map(([n,t])=>`<li><span class="tun-yr">${t.year}</span><span class="tun-body"><a class="wikilink" href="https://en.wikipedia.org/wiki/${t.wiki}" target="_blank" rel="noopener"><b>${n}</b></a> · ${t.mi} mi · ${t.proj}. ${t.note.charAt(0).toUpperCase()+t.note.slice(1)}.</span></li>`).join('')
      +`</ul>`
    : `<h3 class="lr-h3">No tunnel feeds this one</h3>
       <p class="lr-p">${W(`Your basin lives on its own snowmelt. Nothing crosses the {{Continental Divide}} to top it up, so the size of the winter snowpack is everything.`)}</p>`;
  const capCommon=`Reservoirs are drawn as glasses (size = capacity, fill = storage, color = against normal), rivers in their headwater colors, ◆ streamgages show their newest flow reading. Each glass shows its newest reading, dated in the table below. <b>Your own reservoirs are outlined in white.</b>`;
  return sec('mybasin','Act two · your basin',
    cross?'Two basins, one tap':`The ${b.n}`,
    (cross
      ? `<p class="lr-p">${W(`This is the part that surprises people. You live in the <b>${homeB.n}</b>, but only about <b>${homeShare}%</b> of the water your utility stores is kept there. The larger share, <b>${shareOut}%</b>, sits in the <b>${b.n}</b>, on the far side of the {{Continental Divide}}, and reaches you through a tunnel. A map of the basin you stand in would leave out your biggest reservoirs, so here are both.`)}</p>
         ${splitBar(sp,hb)}
         <h3 class="lr-h3">Where your water is stored: the ${b.n}</h3>
         <p class="lr-p">${BASININFO[sb]||''}</p>
         ${basinStatPanel(sb)}
         ${map?`<div class="lr-chart cw-hover"><div class="mapscroll">${map}</div><div class="lr-chart-cap">${W(`The ${b.n} basin, holding ${shareOut}% of your stored water. ${capCommon}`)}</div>${CW_BASINMAP.resTable?CW_BASINMAP.resTable(sb):''}</div>`:''}
         <div class="crossnote">${W(`↓ crosses the {{Continental Divide}}${tap.tun&&tap.tun.length?` through the <b>${tap.tun.join('</b> and <b>')}</b>`:''} ↓`)}</div>
         <h3 class="lr-h3">Where you live: the ${homeB.n}</h3>
         <p class="lr-p">${BASININFO[hb]||''}</p>
         ${homeMap?`<div class="lr-chart cw-hover"><div class="mapscroll">${homeMap}</div><div class="lr-chart-cap">${W(`The ${homeB.n} basin, where you live and where the remaining ${homeShare}% is stored. ${capCommon}`)}</div>${CW_BASINMAP.resTable?CW_BASINMAP.resTable(hb):''}</div>`:''}`
      : `<p class="lr-p">${BASININFO[sb]||''}</p>
         ${basinStatPanel(sb)}
         ${map?`<div class="lr-chart cw-hover"><div class="mapscroll">${map}</div><div class="lr-chart-cap">${W(`The ${b.n} basin. ${capCommon}`)}</div>${CW_BASINMAP.resTable?CW_BASINMAP.resTable(sb):''}</div>`:''}`)
    +`
     ${flowBlock(sb,b,flowSVG,{suffix:cross?' in the '+b.n:'',tunnel:cross})}
     ${flowBlock(hb,homeB,homeFlow,{suffix:' in the '+homeB.n,
       intro:`And the river you live on. The ${homeB.n} runs its own staircase, fed by
         its own snow plus, near the top, whatever arrives through the tunnel.`})}
     <h3 class="lr-h3">Snow in, water out</h3>
     ${cross?`<p class="lr-p">${W(`This is why the crossing matters. The snow that fills your largest reservoirs falls in the <b>${b.n}</b>, not where you live. A dry winter there shows up in your summer.`)}</p>`:''}
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
  return `<p class="lr-p">${W(`The ${poss(b.n)} snowpack topped out at roughly <b>${rel}% of a normal peak</b>${ic<inr?`, and it peaked in ${monthName(ic)} rather than the usual ${monthName(inr)}`:''}, then melted away. The storage line beneath it never recovers: <b>low snow in, low water out</b>.`)}</p>`;
}
function snowInOutBlock(bid){
  const b=BASINS.find(x=>x.id===bid);
  const chart=window.CW_HISTORY&&CW_HISTORY.hasSnowStore(bid)
    ?`<div class="cw-mount" data-cw="snowStore" data-basin="${bid}"></div>`:'';
  const chartTable=chart&&CW_HISTORY.snowStoreTable?CW_HISTORY.snowStoreTable(bid):'';
  return `${snowLineFor(bid)}
     ${chart?`<div class="lr-chart">${chart}<div class="lr-chart-cap">${b.n} basin, water year 2026 · two panels sharing the water year: snowpack as snow-water equivalent over the basin’s long-record SNOTEL sites, and storage as a share of its telemetered <i>supply</i> capacity (flood-control pools excluded on both sides). <b>The shaded band and dashed median are measured</b>, from CDSS daily basin totals since 2005, weekly. <b>The 2026 storage is a monthly reconstruction</b> (the July snapshot scaled by the basin’s derived factors), which is why it is drawn as one dot per month rather than a continuous curve. The two panels are not on one axis, because that would imply an exchange rate between inches of snow and percent full that does not exist.</div>${chartTable}</div>`:''}`;
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
    approx+`<p class="lr-p">${W(`Your tap is only as specific as your provider. <b>${tap.prov}</b> holds particular water rights and particular plumbing, which is why a neighbor two towns over, on a different utility, may drink from a different river. Under Colorado’s {{prior appropriation}} system, seniority decides who gets water in a dry year.`)}</p>
     <div class="callout">
       <p class="co-h">A note on the words</p>
       <p class="co-p">We say <b>provider</b> for the city department, special district or company that delivers your water. That is not the same as a <b>Public Water System</b>, the unit the federal Safe Drinking Water Act regulates (one provider can operate several), and not the same as a water <b>right</b>, which Colorado administers separately. Some entries here cover a cluster of small neighboring providers rather than one.</p>
       <p class="co-p">ZIP codes are postal routes, not service-area boundaries, so treat this as a regional picture. <a href="data.html#providers">How we model providers, and where to get the authoritative answer →</a></p>
     </div>
     <p class="lr-p">${tap.desc}</p>
     ${reveal}
     ${totCap?`<p class="lr-p">${W(`Between them, the reservoirs below hold <b>${kaf(totCap)} thousand acre-feet</b>
        when full. Each row shows its share of your provider’s stored supply, its newest reading with that reading’s date, and
        where that sits against the <i>shape</i> of a normal year at that reservoir. Storage is meant to fall
        through the summer. What matters is whether it is falling faster than usual.`)}</p>`:''}
     ${glassGroup('Across the Divide: West Slope',across,totCap)}
     ${glassGroup(home==='w'?'From your own basin':'From your side of the mountains',same,totCap)}
     ${same.length===1&&across.length?`<p class="lr-p lr-aside">${W(`That single reservoir is the whole of your
        near-side storage, which is why the tunnel matters. Most of what you drink is stored on the other
        side of the mountains, and this one lake is the local buffer between it and your tap.`)}</p>`:''}
     ${fc}`);
}

function secAction(tap,zip){
  const pl=providerLink(tap.prov);
  const res=SAVE_RESOURCES.map(r=>`<li><a class="wikilink" href="${r.url}" target="_blank" rel="noopener">${r.lab}</a></li>`).join('');
  return sec('action','Your move','What you can actually do',
    `<p class="lr-p">${W(`Supply is largely out of our hands. Demand is not, and outdoor watering is where most of a household’s share sits. Roughly half of a Front Range home’s summer water goes onto the lawn.`)}</p>
     ${pl?`<p class="lr-p"><b>Your provider’s current rules.</b> Watering restrictions change through the season and by utility, and this site does not guess yours. Check the source directly: <a class="wikilink" href="${pl.url}" target="_blank" rel="noopener">${pl.lab} →</a></p>`
        :`<p class="lr-p"><b>Your provider’s current rules.</b> Watering restrictions vary by utility and change through the season. Check <b>${tap.prov}</b>’s website for the current status before you set a sprinkler timer.</p>`}
     <h3 class="lr-h3">Simple, high-leverage habits</h3>
     <ul class="lr-list">
       <li>Water before dawn or after dusk, and skip a cycle after rain.</li>
       <li>Replace thirsty turf with native and xeric plantings. A single low-water bed can cut a big share of summer use.</li>
       <li>Fix the quiet leaks. A running toilet or a leaking drip line can waste more than the rest of the household uses indoors.</li>
       <li>Use the utility rebates for efficient fixtures and smart controllers. They exist because saving water is cheaper than finding more.</li>
     </ul>
     <h3 class="lr-h3">Go deeper</h3>
     <ul class="lr-list lr-links">${res}</ul>
     <p class="lr-p lr-aside">${W(`Every tap in Colorado is at the end of a specific thread: a river, a tunnel, a reservoir in the hills. You can now point at yours.`)}</p>
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
     <p class="lr-p lr-cap">Storage against the median for this week of the year. ${all.n} of ${all.count} supply reservoirs reported today (Colorado DWR telemetry, ${fmtDay(LIVE_META.day)}); a reservoir with no reading today is left out of these figures, not estimated. Boundaries from the public-domain USGS Watershed Boundary Dataset.</p>`);
}
function secBlueMesa(){
  const bm=RESBY['bluemesa']; if(!bm)return '';
  const rd=readingOf(bm);
  if(rd.pm==null)return '';
  const src=rd.kind==='reading'?'Colorado DWR telemetry':rd.kind==='obs'?(bm.s||'published reading'):'estimate';
  return sec('bluemesa','The state’s largest reservoir','Blue Mesa',
    `<div class="bignum"><div class="bignum-v" style="color:${rampText(rd.pm)}">${rd.pm}%</div>
       <div class="bignum-lab">${W(`of normal for the week: {{Blue Mesa Reservoir}} ${readingWhen(rd)}, holding ${af(rd.sto)} acre-feet (${src}).`)}</div></div>
     <p class="lr-p lr-aside">Why Blue Mesa matters downstream: <a href="how-it-works.html#lr-longview">How it works</a>. Lake Powell year by year: <a href="long-view.html">the long view</a>.</p>`);
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
       <p class="lr-sub">${W(`Start with the whole state: the snow that makes the water, the calendar it runs on, and the seven basins. Then find your own. Bold terms link to sources.`)}</p></header>`
    +secSnowHow()+secReservoirs()+secBasinsHow()+secMegadrought();
  if(window.CW_HISTORY)CW_HISTORY.mountAll(el);
}

/* =====================================================================
   WATER YEAR 2026 — the closed year, frozen. This page loads no daily
   readings, so nothing on it can drift into the new year.
   ===================================================================== */
function secYear2026(){
  return sec('year','The year','1 October 2025 to 30 September 2026',
    `<p class="lr-p">The winter looked survivable on paper: statewide streamflow held between <b>76% and 79% of the median</b> from November through February, and basin storage ranged from 69% of median in the Gunnison to 116% in the South Platte. Then March turned warm early. Flow jumped to <b>93%</b> that month as the snow started melting, and by the first of June <b>91% of the state’s SNOTEL snow-measurement sites were bare</b> (NRCS). The melt that should have carried rivers through summer had already come and gone. Statewide streamflow fell to <b>34% in May</b> and bottomed at <b>27% in June</b>, then recovered only partway, to <b>59% in September</b>.</p>
     <p class="lr-p">The reservoirs show where it hurt. At the end of September the <b>Gunnison basin stood at 23% of its median storage</b>, down from 83% in March, and the <b>Colorado headwaters at 52%</b>, down from 93% in April. East of the Divide the year ended close to normal: the <b>South Platte at 97%</b>, the <b>Arkansas at 86%</b>, and the <b>Rio Grande at 87%</b>. The San Juan and Dolores ended at 91%. The Yampa and White has no reservoir still reporting telemetry, so its 78% is an estimate.</p>
     <p class="lr-p">That end-of-September storage is the <b>carryover</b> water year 2027 starts from. <a href="index.html">Today</a> shows the new year’s readings, with its day count. The <a href="#player">month-by-month player</a> below plays water year 2026 from October to September.</p>
     <p class="lr-p lr-aside">Monthly figures are this site’s own derivation: reservoir storage from Colorado DWR’s CDSS telemetry against each reservoir’s median for the week, and streamflow from the mapped USGS and DWR gages against theirs. Every month, basin by basin, is in the <a href="data.html">basin history CSV</a>.</p>`);
}
function renderReport(){
  const el=document.getElementById('report-body');
  el.innerHTML=`<header class="lr-hero"><p class="lr-eyebrow">Report · water year 2026</p>
       <h1 class="lr-title">Water year 2026</h1>
       <p class="lr-servedby">1 October 2025 to 30 September 2026 · a finished year; this page is not updated</p></header>`
    +secYear2026()+secSnowReport()+secBasinsReport(null);
  if(window.CW_HISTORY)CW_HISTORY.mountAll(el);
  wireBasinExplorer(null);
  const after=document.getElementById('report-after');
  if(after){
    after.innerHTML=secSnowInOut()
      +sec('record','2026 against the record','The long view',
        `<p class="lr-p">Lake Powell’s every September since 1963, and the snowpack decade by decade since the 1980s, are on <a href="long-view.html">the long view</a>.</p>`);
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
