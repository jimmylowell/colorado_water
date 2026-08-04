"use strict";
/* =====================================================================
   THE STORY — one page in three acts, widening then narrowing:

     ACT 1  COLORADO   snowpack, the water year, what reservoirs do,
                       the seven basins as they stand, the long view
       ── the ZIP gate sits here, once the reader knows what they're
          looking at and has a reason to want their own ──
     ACT 2  YOUR BASIN basin stats, a basin-focused map with its rivers,
                       reservoirs and live gage flows, and its plumbing
     ACT 3  YOUR TAP   the utility, its reservoirs, and what you can do

   Act 1 renders on load; Acts 2-3 render once a place is chosen. The
   statewide reservoir-by-reservoir map is deliberately NOT used here — it
   is offered once, at the very end, as a detail view.

   Year-specific numbers are never hard-coded in prose beside a live figure
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
  Mar:'March',Apr:'April',May:'May',Jun:'June',Jul:'July'};
const monthName=mi=>FULLMON[MONTHS[mi].split(' ')[0]]||MONTHS[mi];
const W=n=>wikify(n);
let curTap=null, curZip=null;

/* ---------- shared pieces ---------- */
function sec(id,kicker,title,body){
  return `<section class="lr-sec" id="lr-${id}">`
    +`<p class="lr-kicker">${kicker}</p><h2 class="lr-h2">${title}</h2>${body}</section>`;
}
const cite=s=>`<span class="lr-cite">${s}</span>`;

function glassMini(r){
  const frac=Math.max(0,Math.min(1,stoAt(r,NOW)/r.cap));
  const col=r.fc?PAL.GLASS.fc:ramp(pmAt(r,NOW));
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
  const w=104,h=26,wi=Math.min(51,weekIdx());
  /* Scale to the curve itself, NOT to capacity: against a full-pool top, a
     reservoir that swings between 40% and 70% draws as a flat line and the
     seasonal shape — the whole point of this mark — disappears. */
  const top=Math.max(...nrm,stoAt(r,NOW))*1.08;
  const X=i=>i/51*w, Y=v=>h-1-(v/top)*(h-2);
  const d=sparkPath(nrm,X,Y);
  const now=stoAt(r,NOW), col=r.fc?PAL.GLASS.fc:ramp(pmAt(r,NOW));
  return `<svg class="resspark" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="A normal year at ${cleanName(r.n)} peaks in early summer; today's level is marked.">
    <path d="${d} L${w},${h} L0,${h} Z" fill="#8FA6B2" opacity="0.10"/>
    <path d="${d}" fill="none" stroke="#7C93A1" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <line x1="${X(wi).toFixed(1)}" y1="0" x2="${X(wi).toFixed(1)}" y2="${h}" stroke="#54798C" stroke-width="0.8"/>
    <circle cx="${X(wi).toFixed(1)}" cy="${Y(Math.min(now,top)).toFixed(1)}" r="2.6" fill="${col}"/></svg>`;
}
/* One reservoir, as a row of facts rather than a cup on its own. `share` is
   this reservoir's slice of everything the provider stores, which is the piece
   that makes a single-reservoir group meaningful. */
function resRow(r,share){
  const pm=pmAt(r,NOW), col=r.fc?'#8DA4B0':ramp(pm);
  const live=LIVE_STO[r.id];
  const now=stoAt(r,NOW);
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
      <div class="rr-af">${r.fc?'':`${af(now)} AF today`}</div>
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
   These used to be two sections, and the calendar had a band chart of its own
   that did nothing but restate its own labels. The seasons are now the
   BACKGROUND of the snowpack chart, where the snow curve visibly does what
   they claim — so the calendar earns its place instead of occupying a figure. */
const LATE_MAY_WK=33;    /* water-year week index covering ~20–26 May */
function decadeLine(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec)return '';
  const keys=Object.keys(D.dec).sort();
  const a=D.dec[keys[0]], z=D.dec[keys[keys.length-1]];
  if(!a||!z||!a.peak)return '';
  const drop=Math.round((1-z.peak/a.peak)*100);
  /* the late-spring gap: where the decades pull apart fastest */
  const wk=LATE_MAY_WK, ga=a.wk[wk], gz=z.wk[wk];
  const springDrop=(ga>0&&gz!=null)?Math.round((1-gz/ga)*100):null;
  const cur=D.curStats;
  return `<p class="lr-p">${W(`Stack the decades on one chart and the trend is not subtle. Across a
     <b>fixed</b> panel of ${D.n} long-record {{SNOTEL}} sites — the same stations in every decade, so the
     comparison isn’t an artefact of which gauges happened to be running — the median peak snowpack has
     fallen from <b>${a.peak}″</b> in the ${keys[0]} to <b>${z.peak}″</b> in the ${keys[keys.length-1]},
     a drop of about <b>${drop}%</b>.`)}</p>
     ${springDrop!=null?`<p class="lr-p">${W(`And the loss is worst exactly where it hurts most. The
       decades barely separate in midwinter; they fan apart through <b>spring</b>, and by late May the
       ${keys[keys.length-1]} hold roughly <b>${springDrop}% less</b> water than the ${keys[0]} did. It
       isn’t only that less snow falls — what does fall leaves sooner, ahead of the summer that needs
       it.`)}</p>`:''}
     ${cur?`<p class="lr-p">${W(`Against that, this water year barely registers: a peak of
       <b>${cur.peak}″</b>${cur.apr1!=null?`, and just <b>${cur.apr1}″</b> left on April 1`:''} — well under
       half a normal year, and the lowest line on the chart by a wide margin.`)}</p>`:''}`;
}
function secSnow(){
  const facts=COLORADO_FACTS.map(f=>
    `<div class="fact"><div class="fact-stat">${f.stat}</div>`
    +`<div class="fact-lab">${W(f.lab)} ${cite(f.cite)}</div></div>`).join('');
  const chart=window.CW_HISTORY?CW_HISTORY.snowStateChart():'';
  const bars=window.CW_HISTORY&&CW_HISTORY.snowDecadeBars?CW_HISTORY.snowDecadeBars():'';
  const table=window.CW_HISTORY&&CW_HISTORY.snowDecadeTable?CW_HISTORY.snowDecadeTable():'';
  return sec('snow','Where it begins','Colorado’s water starts as snow',
    `<p class="lr-p">${W(`Nearly every drop Colorado uses falls first as snow. Winter storms stack {{snowpack|snow}} on the high country, and that frozen reservoir — measured all season as {{snow water equivalent|snow-water equivalent}}, the depth of water it would melt into — is the state’s real storage. The lakes below are just where it goes afterwards.`)}</p>
     <div class="fact-grid">${facts}</div>
     <h3 class="lr-h3">A year that begins in October</h3>
     <p class="lr-p">${W(`Hydrology doesn’t use the calendar year. The {{water year}} starts on <b>October 1</b>, because that is when the snow that will feed next summer begins to fall — so that is how the chart below reads, left to right. Snow piles up until about April. It melts through spring, and that {{snowmelt}} is what fills the reservoirs, most of a year’s inflow arriving in a few weeks. Then from summer into fall the valves open and the levels fall, until the first snows start the whole thing again.`)}</p>
     ${chart?`<div class="lr-chart">${chart}<div class="lr-chart-cap">A 1980s snow season against a 2020s one, with this year on top · statewide snow-water equivalent from a fixed panel of NRCS SNOTEL sites, median across each decade’s water years. The shaded season is when the melt reaches the reservoirs.</div></div>`:''}
     ${decadeLine()}
     ${bars?`<div class="lr-chart">${bars}<div class="lr-chart-cap">Median peak snowpack, decade by decade — the same fixed panel of sites. No decade has peaked higher than the one before it, and the 2000s and 2010s tied. The dashed rule carries the 1980s level across for comparison.</div>${table}</div>`:''}
     <p class="lr-p">${W(`Because the snow <i>is</i> the storage, a warm early spring can undo a decent winter: the mountains can hold a fair snowpack and still come up short if it melts too fast to catch. That is roughly what happened in 2026 — by the last week of May, the long-record SNOTEL sites were already bare.`)}</p>`);
}

/* §3 what reservoirs actually do (education) */
function secReservoirs(){
  const sanchez=RESBY['sanchez'];
  return sec('reservoirs','The lakes','What a reservoir is really for',
    `<p class="lr-p">${W(`A reservoir isn’t a supply of water — it is a <b>delay</b>. It catches a spring flood that would otherwise run to Utah in three weeks, and pays it back over the twelve months you need it. That is why levels are supposed to fall all summer, and why a low lake in September is not automatically a crisis.`)}</p>
     <p class="lr-p">${W(`What matters is <b>carryover</b>: the water still in storage when the next water year begins. A healthy year ends with a cushion. A dry year ends scraped low, and the following winter has to make up the difference before anyone is comfortable again.`)}</p>
     ${sanchez?`<p class="lr-p">${W(`Purpose matters too. ${cleanName(sanchez.n)}, in the San Luis Valley, is irrigation storage — emptied to almost nothing by late summer most years, then refilled. There, empty is the job. Elsewhere, empty is a warning.`)}</p>`:''}
     <p class="lr-p">${W(`And some famous lakes aren’t supply at all. Cherry Creek and Bear Creek are Army Corps {{flash flood|flood-control}} pools: the water you sail on is a small permanent pond, and the dam’s real capacity is kept deliberately <i>empty</i>, waiting for a storm. Nobody drinks from them.`)}</p>
     <h3 class="lr-h3">So what about summer rain?</h3>
     <p class="lr-p">${W(`Come July the {{North American Monsoon}} pushes Gulf moisture north and Colorado’s afternoons turn to thunderstorms. It <b>feels</b> like relief — and in one real way it is — but it rarely shows up in the reservoirs:`)}</p>
     <ul class="lr-list">
       <li>${W(`<b>It cuts demand more than it adds supply.</b> A wet week means nobody irrigates, so the draw-down slows. Less water goes <i>out</i> — that alone can flatten a summer decline even if little rain flows <i>in</i>.`)}</li>
       <li>${W(`<b>It rarely refills the big lakes.</b> Monsoon rain lands as intense, local bursts on dry ground — most evaporates or runs off fast, and the storms miss the high snowfields that feed the major reservoirs.`)}</li>
       <li>${W(`<b>It recharges {{soil moisture}}.</b> Wet late-summer soil matters for <i>next</i> year: dry ground drinks the following spring’s melt before it ever reaches a stream.`)}</li>
       <li>${W(`<b>It arrives as {{flash flood|flash floods}}.</b> The same bursts that can’t fill a reservoir can fill a canyon in minutes — which is exactly what those empty flood pools are for.`)}</li>
     </ul>
     <p class="lr-p lr-aside">${W(`So a strong monsoon eases a drought summer; it doesn’t end a drought. The snow still writes the year.`)}</p>`);
}

/* §4 the seven basins — the state as it stands right now */
const BMW=700,BMH=400, BGW=-109.05,BGE=-102.05,BGN=41,BGS=37;
const bmx=lon=>(lon-BGW)/(BGE-BGW)*BMW, bmy=lat=>(BGN-lat)/(BGN-BGS)*BMH;
function basinPathD(rings){
  return rings.map(r=>'M'+r.map(p=>bmx(p[0]).toFixed(1)+','+bmy(p[1]).toFixed(1)).join('L')+'Z').join(' ');
}
/* Choropleth: fill encodes storage vs that basin's own normal (ramp), at a
   CONSTANT opacity — selection/hover live on the stroke only, because varying
   fill-opacity would read as a different storage value. */
function stateBasinsSVG(home,sel){
  if(typeof BASIN_GEO==='undefined')return '';
  let s=`<svg class="basinmap" viewBox="0 0 ${BMW} ${BMH}" role="group" aria-label="Colorado's seven river basins, shaded by storage against each basin's own normal">`;
  s+=`<image href="img/co-relief.webp" x="0" y="0" width="${BMW}" height="${BMH}" preserveAspectRatio="none" opacity="0.3"/>`;
  Object.keys(BASIN_GEO).forEach(bid=>{
    const pct=Math.round(PMH[bid]?PMH[bid][NOW]:100);
    const bn=BASINS.find(x=>x.id===bid).n;
    s+=`<path class="sbasin${bid===home?' home':''}${bid===sel?' sel':''}" data-basin="${bid}" `
      +`d="${basinPathD(BASIN_GEO[bid])}" fill="${ramp(pct)}" tabindex="0" role="button" `
      +`aria-label="${bn} basin, ${pct}% of normal storage"><title>${bn} — ${pct}% of normal</title></path>`;
  });
  Object.keys(BASIN_GEO).forEach(bid=>{
    const a=BASIN_LABEL[bid]; if(!a)return;
    const x=bmx(a[0]).toFixed(0), y=bmy(a[1]).toFixed(0);
    const bb=BASINS.find(x2=>x2.id===bid), pct=Math.round(PMH[bid]?PMH[bid][NOW]:100);
    /* neutral, not ramp-coloured: the fill beneath already carries the value */
    s+=`<text class="sbasin-lab" x="${x}" y="${y}" text-anchor="middle" pointer-events="none">${bb.n.toUpperCase()}</text>`;
    s+=`<text class="sbasin-pct" x="${x}" y="${(+y+13)}" text-anchor="middle" pointer-events="none">${pct}%</text>`;
  });
  return s+'</svg>'+basinLegend();
}
/* The old legend showed five evenly-spaced swatches sampled at 55/70/85/100/112%
   — but `ramp()` is a piecewise scale with UNEVEN stops, so a swatch's position
   in that row said nothing about the value it stood for, and the row carried no
   numbers at all. This builds the bar straight from RAMPS: every stop sits at its
   true position on a 0–120% scale, so the legend and the map are the same scale.
   Ticks are labelled, and 100% is called out as the thing being compared to. */
const BXL_MAX=120;
function basinLegend(){
  const grad=RAMPS.map(([v,c])=>`${c} ${(Math.min(v,BXL_MAX)/BXL_MAX*100).toFixed(1)}%`).join(',');
  const ticks=[0,25,50,75,100,BXL_MAX];
  return `<div class="bx-legend">
    <div class="bxl-cap">Storage vs this basin’s own normal</div>
    <div class="bxl-scale">
      <div class="bxl-bar" style="background:linear-gradient(90deg,${grad})"></div>
      <div class="bxl-ticks">${ticks.map(v=>
        `<span class="bxl-tick${v===100?' is-norm':''}" style="left:${(v/BXL_MAX*100).toFixed(1)}%">`
        +`<i></i><b>${v}%</b></span>`).join('')}</div>
    </div>
    <p class="bxl-note">100% is normal — the median storage for this week of the year across the
      record, not “full”. Below 100% the basin is holding less than it usually does now; above,
      more. Basins are shaded against their <i>own</i> normal, so they can be read side by side.</p>
  </div>`;
}
function basinSummaryHTML(bid,home){
  const b=BASINS.find(x=>x.id===bid), st=basinStats(bid);
  return `<div class="bx-head"><span class="bx-name">${b.n}${bid===home?' · your basin':''}</span>`
    +`<span class="bx-pct" style="color:${ramp(st.pct)}">${st.pct}% of normal</span></div>`
    +`<p class="bx-blurb">${BASININFO[bid]||''}</p>`
    +`<div class="bx-stats"><span>${WEST.includes(bid)?'West slope':'East slope'}</span><span>${st.count} reservoirs</span>`
    +`<span>${kaf(st.cap)} KAF full</span><span>${st.below} below normal</span>`
    +`${st.largest?`<span>largest: ${cleanName(st.largest.n)}</span>`:''}</div>`;
}
function secBasinsState(home){
  return sec('basins','The state right now','Seven basins, seven different years',
    `<p class="lr-p">${W(`Colorado drains into seven river basins — four west of the {{Continental Divide}}, three east. They do not share a fate: each lives on its own snowpack, so in the same year one can be near normal while another is deep in drought. Each is coloured below by how much water it is holding against its <i>own</i> normal, so they can be read side by side. Tap any basin for its details.`)}</p>
     <div class="basinmap-wrap" id="basin-explorer">${stateBasinsSVG(home,home||'colorado')}
       <div class="bx-panel" id="basin-sel">${basinSummaryHTML(home||'colorado',home)}</div></div>
     <p class="lr-p lr-cap">Boundaries from the public-domain USGS Watershed Boundary Dataset; storage derived from Colorado DWR telemetry against each basin’s own record.</p>`);
}

/* §5 the long view */
function secLongView(){
  const bm=RESBY['bluemesa'];
  const bmLive=bm&&LIVE_STO[bm.id];
  const bmPct=bm?pmAt(bm,NOW):null;
  const powell=(window.CW_HISTORY?CW_HISTORY.powellChart():'');
  const pk=(typeof POWELL_ANNUAL!=='undefined')?POWELL_ANNUAL.reduce((a,b)=>b[1]>a[1]?b:a):null;
  const last=(typeof POWELL_ANNUAL!=='undefined')?POWELL_ANNUAL[POWELL_ANNUAL.length-1]:null;
  return sec('longview','The long view','A drought, and a drier baseline',
    `<p class="lr-p">${W(`One dry year is weather. A downward-sloping baseline is something else. Since 2000 the Colorado River basin has been living through what scientists call a {{megadrought}} — the driest stretch in twelve centuries — and warming is turning drought into a permanent condition, a shift with its own name: {{aridification}}.`)}</p>
     ${powell?`<div class="lr-chart">${powell}<div class="lr-chart-cap">${W(`{{Lake Powell}} — annual storage${pk&&last?`, from a peak near ${(pk[1]/1e6).toFixed(1)}M acre-feet (${pk[0]}) to ${(last[1]/1e6).toFixed(1)}M (${last[0]})`:''} · US Bureau of Reclamation`)}</div></div>`:''}
     <p class="lr-p">${W(`{{Lake Powell}}, the Colorado River’s great savings account, tells the story bluntly: full through the 1980s, drawn toward dead pool over two decades. Colorado’s own {{Blue Mesa Reservoir}} — the largest in the state — is the next account upstream, and when the river runs short Blue Mesa is tapped to prop Powell up.`)}</p>
     ${bm?`<div class="bignum"><div class="bignum-v" style="color:${ramp(bmPct)}">${bmPct}%</div>
        <div class="bignum-lab">${W(`of normal — {{Blue Mesa Reservoir}} today${bmLive?`, holding ${af(bmLive.sto)} acre-feet (live, Colorado DWR)`:''}.`)}</div></div>`:''}
     <p class="lr-p">${W(`Here is the hard part of {{aridification}}: warming shifts precipitation from snow toward rain, melts what snow there is earlier, and evaporates more from every reservoir surface. Even a <i>normal</i> snow year now yields less usable water than it did a generation ago.`)}</p>`);
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
  const seg=sp.ranked.map(([bid,c])=>{
    const bn=BASINS.find(x=>x.id===bid).n, pctv=Math.round(c/sp.tot*100);
    return `<span class="sb-seg" style="width:${(c/sp.tot*100).toFixed(1)}%;background:${BASIN_HUE[bid]||'#8FA6B2'}"`
      +` title="${bn}: ${pctv}% of your stored water"></span>`;
  }).join('');
  const key=sp.ranked.map(([bid,c])=>{
    const bn=BASINS.find(x=>x.id===bid).n;
    return `<span class="sb-key"><i style="background:${BASIN_HUE[bid]||'#8FA6B2'}"></i>`
      +`${bn}${bid===hb?' (where you live)':''} · <b>${Math.round(c/sp.tot*100)}%</b></span>`;
  }).join('');
  return `<div class="splitbar"><div class="sb-track">${seg}</div><div class="sb-keys">${key}</div></div>`;
}
function basinStatPanel(bid){
  const st=basinStats(bid);
  return `<div class="basin-panel">
       <div class="bp-cell"><div class="bp-num" style="color:${ramp(st.pct)}">${st.pct}%</div>
         <div class="bp-lab">of normal storage<br>right now</div></div>
       <div class="bp-cell"><div class="bp-num">${st.count}</div>
         <div class="bp-lab">reservoirs here holding<br>${kaf(st.cap)} KAF when full</div></div>
       <div class="bp-cell"><div class="bp-num" style="color:${st.below?'#EF9A1B':'#2FD94F'}">${st.below}</div>
         <div class="bp-lab">of them sitting<br>below normal</div></div>
     </div>`;
}
/* The drop across a basin, in prose. Gravity is the whole plumbing system —
   almost nothing here is pumped — and the sheer number of feet is the thing
   people don't picture until they see it written down. */
function dropLine(sb,b){
  const d=window.CW_BASINMAP&&CW_BASINMAP.drop?CW_BASINMAP.drop(sb):null;
  if(!d)return '';
  const ft=n=>Math.round(n).toLocaleString('en-US');
  return `<p class="lr-p">${W(`And it is mostly downhill. Between the highest point we measure in the
    ${b.n} — <b>${d.hiName}</b>, at ${ft(d.hi)} feet — and the lowest, <b>${d.loName}</b> at ${ft(d.lo)},
    the water drops <b>${ft(d.drop)} feet</b>. Every reservoir on the way is a step on that staircase,
    and gravity does most of the work. Not all of it, though: a few of Colorado's boldest moves push
    back the other way — {{Lake Nighthorse}} was filled by pumping the {{Animas River|Animas}} uphill —
    and every {{transmountain diversion|tunnel under the Divide}} carries water <i>sideways</i>, across
    a watershed boundary it would never have crossed on its own.`)}</p>`;
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
       <b>${outSide}</b>${opts.tunnel?` — including, for you, through a tunnel under the Divide`:''} —
       every drop routed through the same handful of structures.`)}</p>
     ${dropLine(bid,bo)}
     <div class="lr-chart">${svg}<div class="lr-chart-cap">${bo.n} basin · ${west
       ? `<b>this basin drains west</b>, toward Utah, so the diagram reads <b>right to left</b> — the direction the water really goes on a map. `
       : `<b>this basin rises east of the Divide</b> and leaves the state that way, so the diagram reads left to right. `}<b>Height runs down the page</b>,
       so it falls the way the water does. The spacing is <i>not</i> to scale — a true linear axis would crush the
       lower half of the basin into a stripe — but the order is. A height is printed only where we have a
       <b>measured</b> water surface (live DWR gauge readings, USGS gage datums, or the national elevation model
       where it clearly resolves the lake); the reservoirs without one are placed by their position on the river
       instead, and deliberately carry no number. <a href="data.html#elevation">How that is worked out →</a>
       Ribbon width tracks how much water each reach carries (typical late-July flows); ◆ gages show live readings
       where available. <b>Dashed ribbons are tunnels</b>, and they run to whichever edge their water actually
       reaches — so on the West Slope the river leaves to the left, toward Utah, while the tunnels break away to
       the right, east under the Divide. A schematic of the order things happen in, not a channel map.</div></div>`;
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
  const hasSnow=typeof SNOW_BASIN!=='undefined'&&SNOW_BASIN[sb];
  const chart=window.CW_HISTORY?CW_HISTORY.snowStoreChart(sb):'';
  const snowLine=hasSnow?(()=>{
    const sn=SNOW_BASIN[sb];
    const iMax=a=>a.reduce((bi,v,i)=>(v!=null&&(a[bi]==null||v>a[bi]))?i:bi,0);
    const ic=iMax(sn.cur), inr=iMax(sn.nrm);
    const pkc=sn.cur[ic], pkn=sn.nrm[inr];
    if(!(pkn>0)||pkc==null)return '';
    const rel=Math.round(pkc/pkn*100);
    return `<p class="lr-p">${W(`The ${poss(b.n)} snowpack topped out at roughly <b>${rel}% of a normal peak</b>${ic<inr?`, and it peaked in ${monthName(ic)} rather than the usual ${monthName(inr)}`:''} — then melted away. The storage line beneath it never recovers: <b>low snow in, low water out</b>.`)}</p>`;
  })():'';
  const tuns=(tap.tun||[]).map(n=>TUNNELS[n]?[n,TUNNELS[n]]:null).filter(Boolean);
  const plumbing=tuns.length
    ? `<h3 class="lr-h3">The plumbing that made it livable</h3>
       <p class="lr-p">${W(`Your basin’s water didn’t always flow the way it does now. Beginning in the 1930s, Colorado bored tunnels straight through the {{Continental Divide}} — {{transmountain diversion|transmountain diversions}} that reverse geography, carrying West Slope snowmelt east to the cities that grew up dry. The ones tied to your supply:`)}</p>
       <ul class="tunlist">`
      +tuns.map(([n,t])=>`<li><span class="tun-yr">${t.year}</span><span class="tun-body"><a class="wikilink" href="https://en.wikipedia.org/wiki/${t.wiki}" target="_blank" rel="noopener"><b>${n}</b></a> — ${t.mi} mi · ${t.proj}. ${t.note.charAt(0).toUpperCase()+t.note.slice(1)}.</span></li>`).join('')
      +`</ul>`
    : `<h3 class="lr-h3">No tunnel feeds this one</h3>
       <p class="lr-p">${W(`Your basin lives on its own snowmelt — nothing crosses the {{Continental Divide}} to top it up. What falls here is what you get, which makes the size of the winter snowpack everything.`)}</p>`;
  const capCommon=`reservoirs drawn as glasses (size = capacity, fill = storage, colour = against normal), rivers in their headwater colours, ◆ streamgages showing live flow. <b>Your own reservoirs are outlined in white.</b>`;
  return sec('mybasin','Act two · your basin',
    cross?'Two basins, one tap':`The ${b.n}`,
    (cross
      ? `<p class="lr-p">${W(`Here is the part that surprises people. You live in the <b>${homeB.n}</b> — but only about <b>${homeShare}%</b> of the water your utility stores is actually kept there. The larger share, <b>${shareOut}%</b>, sits in the <b>${b.n}</b>, on the far side of the {{Continental Divide}}, and is carried to you through a tunnel. A basin map of where you <i>stand</i> would leave out your biggest reservoirs entirely, so here are both.`)}</p>
         ${splitBar(sp,hb)}
         <h3 class="lr-h3">Where your water is stored — the ${b.n}</h3>
         <p class="lr-p">${BASININFO[sb]||''}</p>
         ${basinStatPanel(sb)}
         ${map?`<div class="lr-chart">${map}<div class="lr-chart-cap">${W(`The ${b.n} basin, holding ${shareOut}% of your stored water — ${capCommon}`)}</div></div>`:''}
         <div class="crossnote">${W(`↓ crosses the {{Continental Divide}}${tap.tun&&tap.tun.length?` through the <b>${tap.tun.join('</b> and <b>')}</b>`:''} ↓`)}</div>
         <h3 class="lr-h3">Where you live — the ${homeB.n}</h3>
         <p class="lr-p">${BASININFO[hb]||''}</p>
         ${homeMap?`<div class="lr-chart">${homeMap}<div class="lr-chart-cap">${W(`The ${homeB.n} basin, where you live and where the remaining ${homeShare}% is stored — ${capCommon}`)}</div></div>`:''}`
      : `<p class="lr-p">${BASININFO[sb]||''}</p>
         ${basinStatPanel(sb)}
         ${map?`<div class="lr-chart">${map}<div class="lr-chart-cap">${W(`The ${b.n} basin — ${capCommon}`)}</div></div>`:''}`)
    +`
     ${flowBlock(sb,b,flowSVG,{suffix:cross?' in the '+b.n:'',tunnel:cross})}
     ${flowBlock(hb,homeB,homeFlow,{suffix:' in the '+homeB.n,
       intro:`And the river you actually live on. The ${homeB.n} runs its own staircase, fed by
         its own snow — plus, near the top, whatever arrives through the tunnel.`})}
     <h3 class="lr-h3">Snow in, water out</h3>
     ${cross?`<p class="lr-p">${W(`And this is why that crossing matters: the snow that fills your largest reservoirs falls in the <b>${b.n}</b>, not where you live. A dry winter over there shows up in your summer.`)}</p>`:''}
     ${snowLine}
     ${chart?`<div class="lr-chart">${chart}<div class="lr-chart-cap">${b.n} basin · two scales, two panels — snowpack as snow-water equivalent over the basin’s long-record SNOTEL sites, storage as a share of its telemetered capacity. They share the water year on the x-axis so you can compare timing and shape; they are deliberately <i>not</i> stacked on one axis, which would imply an exchange rate between inches of snow and percent full that doesn’t exist.</div></div>`:''}
     ${plumbing}`);
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
    ? `<p class="reveal">${W(`Much of your water is born <b>across the {{Continental Divide}}</b>, in the ${acrossBasins.join(' and ')} — and crosses beneath the mountains through the <b>${tap.tun.join('</b> and <b>')}</b>.`)}</p>`
    : '';
  const fc=(tap.fcres&&tap.fcres.length)
    ? `<p class="fc-note">${W(`The big lakes you see nearby — ${tap.fcres.map(id=>cleanName(RESBY[id].n)).join(', ')} — are the flood-control pools from earlier, not your supply.`)}</p>`
    : '';
  const approx=tap._approx
    ? `<p class="lr-p lr-aside">${W(`We don’t have ZIP ${tap.zip}’s exact provider mapped yet, so this shows the nearest system we do — <b>${tap.prov}</b> — to give you the regional picture. Your actual provider, and near the Divide sometimes the basin, may differ.`)}</p>`
    : '';
  return sec('tap','Act three · your tap',tap.prov,
    approx+`<p class="lr-p">${W(`Your tap is only as specific as your provider. <b>${tap.prov}</b> holds particular water rights and particular plumbing — which is why a neighbour two towns over, on a different utility, may drink an entirely different river. Under Colorado’s {{prior appropriation}} system, who got there first decides who gets water in a dry year.`)}</p>
     <div class="callout">
       <p class="co-h">A note on the words</p>
       <p class="co-p">We say <b>provider</b> — the city department, special district or company that delivers your water. That is deliberately not the same as a <b>Public Water System</b>, the unit the federal Safe Drinking Water Act actually regulates (one provider can operate several), and not the same as a water <b>right</b>, which Colorado administers on a separate track. Some entries here also cover a cluster of small neighbouring providers rather than one.</p>
       <p class="co-p">ZIP codes are postal routes, not service-area boundaries, so treat this as a regional picture. <a href="data.html#providers">How we model providers, and where to get the authoritative answer →</a></p>
     </div>
     <p class="lr-p">${tap.desc}</p>
     ${reveal}
     ${totCap?`<p class="lr-p">${W(`Between them, the reservoirs below hold <b>${kaf(totCap)} thousand acre-feet</b>
        when full. Each row shows how big a share of your provider’s stored supply it is, how much is in it
        today, and — the part a single number can’t tell you — where that sits against the <i>shape</i> of a
        normal year at that reservoir. Storage is meant to fall through the summer; what matters is whether
        it is falling faster than usual.`)}</p>`:''}
     ${glassGroup('Across the Divide — West Slope',across,totCap)}
     ${glassGroup(home==='w'?'From your own basin':'From your side of the mountains',same,totCap)}
     ${same.length===1&&across.length?`<p class="lr-p lr-aside">${W(`That single reservoir is the whole of your
        near-side storage — which is exactly why the tunnel matters. Most of what you drink is banked on the
        other side of the mountains, and this one lake is the local buffer between it and your tap.`)}</p>`:''}
     ${fc}`);
}

function secAction(tap,zip){
  const pl=providerLink(tap.prov);
  const res=SAVE_RESOURCES.map(r=>`<li><a class="wikilink" href="${r.url}" target="_blank" rel="noopener">${r.lab}</a></li>`).join('');
  return sec('action','Your move','What you can actually do',
    `<p class="lr-p">${W(`Supply is largely out of our hands. Demand is not — and outdoor watering is where most of a household’s share sits. Roughly half of a Front Range home’s summer water goes onto the lawn.`)}</p>
     ${pl?`<p class="lr-p"><b>Your provider’s current rules.</b> Watering restrictions change through the season and by utility — we won’t guess yours. Check the source directly: <a class="wikilink" href="${pl.url}" target="_blank" rel="noopener">${pl.lab} →</a></p>`
        :`<p class="lr-p"><b>Your provider’s current rules.</b> Watering restrictions vary by utility and change through the season — check <b>${tap.prov}</b>’s website for the current status before you set a sprinkler timer.</p>`}
     <h3 class="lr-h3">Simple, high-leverage habits</h3>
     <ul class="lr-list">
       <li>Water before dawn or after dusk, and skip a cycle after rain — the monsoon does the watering for you.</li>
       <li>Trade thirsty turf for native and xeric plantings; a single low-water bed can cut a big share of summer use.</li>
       <li>Fix the quiet leaks — a running toilet or a drip line can waste more than the whole indoor household.</li>
       <li>Take the utility rebates for efficient fixtures and smart controllers; they exist because saving water is cheaper than finding more.</li>
     </ul>
     <h3 class="lr-h3">Go deeper</h3>
     <ul class="lr-list lr-links">${res}</ul>
     <p class="lr-p lr-aside">${W(`Every tap in Colorado is at the end of a specific thread — a river, a tunnel, a glass draining in the hills. You can now point at yours.`)}</p>
     <div class="explore-block">
       <p class="xb-h">Want the whole state, reservoir by reservoir?</p>
       <p class="xb-sub">The detailed map plots all ${RES.length} reservoirs, every gage and every tunnel at once. It is dense — best on a large screen.</p>
       <div class="xb-links">
         <a class="story-cta" href="map.html#zip=${zip}">Open the detailed map →</a>
         <a class="xb-alt" href="timeline.html">or watch the water year month by month →</a>
       </div>
     </div>`);
}

/* =====================================================================
   RENDER
   ===================================================================== */
function renderState(){
  const home=curTap?curTap.hb:null;
  document.getElementById('state-body').innerHTML=
    `<header class="lr-hero"><p class="lr-eyebrow">Colorado water · a drought story</p>
       <h1 class="lr-title">The water year</h1>
       <p class="lr-servedby">Where Colorado’s water comes from, where it is stored, and how much of it there is right now</p>
       <p class="lr-sub">${W(`Start with the whole state: the snow that makes the water, the calendar it runs on, and the seven basins holding what’s left. Then find your own. Bold terms link out so you can verify and dig deeper.`)}</p></header>`
    +secSnow()+secReservoirs()+secBasinsState(home)+secLongView();
  wireBasinExplorer(home);
}
function wireBasinExplorer(home){
  const bx=document.getElementById('basin-explorer'); if(!bx)return;
  const sel=document.getElementById('basin-sel');
  bx.querySelectorAll('.sbasin').forEach(p=>{
    const pick=()=>{bx.querySelectorAll('.sbasin').forEach(x=>x.classList.toggle('sel',x===p));
      if(sel)sel.innerHTML=basinSummaryHTML(p.dataset.basin,home);};
    p.addEventListener('click',pick);
    p.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();pick();}});
  });
}
function renderLocal(tap,zip){
  const b=BASINS.find(x=>x.id===tap.hb);
  const el=document.getElementById('local-body');
  el.hidden=false;
  el.innerHTML=
    `<header class="lr-hero lr-hero2"><p class="lr-eyebrow">Your water · ZIP ${zip}</p>
       <h1 class="lr-title">${tap._approx?'Near '+tap.city:tap.city}</h1>
       <p class="lr-servedby">${tap._approx?'Nearest mapped system: ':'Served by '}<b>${tap.prov}</b> · ${b.n} basin</p></header>`
    +secMyBasin(tap)+secTap(tap)+secAction(tap,zip);
}

/* ---------- entry wiring ---------- */
function msg(t){const el=document.getElementById('zipmsg');if(el)el.textContent=t;}
function choosePlace(tap,zip,scroll){
  curTap=tap; curZip=zip;
  renderState();                 /* re-render so the map marks the home basin */
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
    ?'don’t have that ZIP mapped yet — try a nearby city below'
    :'this covers Colorado — but wherever you are, your tap has a watershed too');return;}
  msg('');
  choosePlace(t,z);
}
document.getElementById('zipgo').addEventListener('click',submitZip);
document.getElementById('zip').addEventListener('keydown',e=>{if(e.key==='Enter')submitZip();});

const cc=document.getElementById('citychips');
cc.innerHTML=STORY_CITIES.map(c=>{
  const bn=(BASINS.find(x=>x.id===c.b)||{}).n||'';
  const hue=(typeof BASIN_HUE!=='undefined'&&BASIN_HUE[c.b])||'#8FA6B2';
  return `<button class="citychip" data-tap="${c.tap}" data-zip="${c.zip}" title="${c.label} — ${bn} basin">`
    +`<span class="cc-city">${c.label}</span>`
    +`<span class="cc-basin"><i style="background:${hue}"></i>${bn}</span></button>`;
}).join('');
cc.querySelectorAll('.citychip').forEach(b=>b.addEventListener('click',()=>{
  const t=TAPS.find(x=>x.id===b.dataset.tap);
  if(t){document.getElementById('zip').value=b.dataset.zip;msg('');choosePlace(t,b.dataset.zip);}
}));

/* ---------- history + boot ---------- */
function syncFromHash(){
  const h=location.hash.replace(/^#/,'');
  const zip=/^\d{5}$/.test(h)?h:((h.match(/(?:^|&)zip=(\d{5})/)||[])[1]);
  if(zip){
    const t=zipLookup(zip);
    if(t){curTap=t;curZip=zip;
      const zi=document.getElementById('zip'); if(zi)zi.value=zip;
      renderState();renderLocal(t,zip);return;}
  }
  curTap=null;curZip=null;
  renderState();
  const el=document.getElementById('local-body'); if(el){el.hidden=true;el.innerHTML='';}
}
window.addEventListener('popstate',syncFromHash);
window.addEventListener('cw-live',()=>{
  renderState();
  if(curTap)renderLocal(curTap,curZip);
});
syncFromHash();
})();
