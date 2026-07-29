"use strict";
/* =====================================================================
   THE STORY — a ZIP/city gate, then one long-form, scrolling drought
   narrative built around the reader's own tap. Each section hands off to
   the next, and no fact is stated twice:
     your basin & its plumbing → the snow that fills it → your tap →
     the seasonal cycle & summer rain → scarcity → what you can do.
   Year-specific numbers are never hard-coded in prose beside a live
   figure (see BASININFO) — the derived value is the single source.
   Reads TAPS / BASININFO / PMH / RES / TUNNELS / COLORADO_FACTS / WIKI
   from data.js; live storage from LIVE_STO (live.js); charts from
   CW_HISTORY (history.js). No map engine (viz.js / d3) is loaded here.
   ===================================================================== */
(function(){
const WEST=['colorado','gunnison','yampa','sw'];
const slopeOf=b=>WEST.includes(b)?'w':'e';
const kaf=n=>Math.round(n/1000).toLocaleString('en-US');
const af=n=>Math.round(n).toLocaleString('en-US');
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

/* ---------- entry gate ---------- */
function go(step){
  document.querySelectorAll('.story-step').forEach(s=>s.classList.remove('is-active'));
  const el=document.getElementById('step-'+step);
  if(el)el.classList.add('is-active');
  window.scrollTo({top:0,behavior:'auto'});
}
function choosePlace(tap,zip){
  curTap=tap; curZip=zip;
  renderArticle(tap,zip);
  history.pushState(null,'','#'+zip);
  go('article');
}

/* ---------- little glass glyphs (reused from the old source step) ---------- */
function glassMini(r){
  const frac=Math.max(0,Math.min(1,stoAt(r,NOW)/r.cap));
  const pm=pmAt(r,NOW), col=ramp(pm);
  const topY=3, botY=34, rim=12, base=6.5, cx=15, WD=30, fillTop=(botY-(botY-topY)*frac).toFixed(1);
  const path=`M${cx-rim},${topY} L${cx-base},${botY} Q${cx-base},${botY+2} ${cx-base+2},${botY+2} `
    +`L${cx+base-2},${botY+2} Q${cx+base},${botY+2} ${cx+base},${botY} L${cx+rim},${topY} Z`;
  const cid='gm'+r.id;
  return `<svg class="gmini" width="${WD}" height="39" viewBox="0 0 ${WD} 39" aria-hidden="true">`
    +`<defs><clipPath id="${cid}"><path d="${path}"/></clipPath></defs>`
    +`<path d="${path}" fill="#0A1620" stroke="#54798C" stroke-width="1.1"/>`
    +`<rect x="0" y="${fillTop}" width="${WD}" height="39" fill="${col}" opacity="0.95" clip-path="url(#${cid})"/>`
    +`<path d="${path}" fill="none" stroke="#54798C" stroke-width="1.1"/></svg>`;
}
function glassCard(r){
  const pm=pmAt(r,NOW);
  return `<a class="gcard" href="map.html#r=${r.id}" title="See ${r.n} on the map">`
    +`${glassMini(r)}<div class="gc-name">${cleanName(r.n)}</div>`
    +`<div class="gc-pct" style="color:${ramp(pm)}">${pm}%</div></a>`;
}
function glassGroup(title,arr){
  if(!arr.length)return'';
  return `<div class="src-slope"><div class="src-slope-h">${title}</div>`
    +`<div class="src-glasses">${arr.slice().sort((a,b)=>b.cap-a.cap).map(glassCard).join('')}</div></div>`;
}

/* ---------- section scaffold ---------- */
function sec(id,kicker,title,body){
  return `<section class="lr-sec" id="lr-${id}">`
    +`<p class="lr-kicker">${kicker}</p><h2 class="lr-h2">${title}</h2>${body}</section>`;
}
function cite(s){return `<span class="lr-cite">${s}</span>`;}

/* ---------- §2 snow: the source, with the snow→storage chart as its proof ---------- */
function secSnow(tap){
  const hb=tap.hb, b=BASINS.find(x=>x.id===hb);
  const facts=COLORADO_FACTS.map(f=>
    `<div class="fact"><div class="fact-stat">${f.stat}</div>`
    +`<div class="fact-lab">${W(f.lab)} ${cite(f.cite)}</div></div>`).join('');
  const hasSnow=typeof SNOW_BASIN!=='undefined'&&SNOW_BASIN[hb];
  const chart=(window.CW_HISTORY?CW_HISTORY.snowStoreChart(hb)
    :sparkSVG(PMH[hb],ramp(Math.round(PMH[hb][NOW]))));
  const chartCap=hasSnow
    ? `${b.n} basin · snowpack as snow-water equivalent averaged over the basin’s long-record SNOTEL sites; storage as a share of its telemetered capacity. Solid = this water year, dashed = the 1991–present normal. Absolute depths depend on which sites a basin has, so compare each line to its own dashed normal.`
    : `${b.n} storage across the water year, % of median · derived from CDSS history`;
  /* Lead with the ratio, not absolute inches: absolute SWE depends on which
     stations a basin happens to have, but cur-vs-normal uses the same set on
     both sides. "Melted early" is verified against the data, not asserted. */
  const snowLine=hasSnow?(()=>{
    const sn=SNOW_BASIN[hb];
    const iMax=a=>a.reduce((bi,v,i)=>(v!=null&&(a[bi]==null||v>a[bi]))?i:bi,0);
    const ic=iMax(sn.cur), inr=iMax(sn.nrm);
    const pk=sn.cur[ic], pkn=sn.nrm[inr];
    if(!(pkn>0)||pk==null)return '';
    const rel=Math.round(pk/pkn*100);
    const early=ic<inr;
    return `<p class="lr-p">${W(`Here it is for your own basin. The ${poss(b.n)} snowpack topped out at roughly <b>${rel}% of a normal peak</b>${early?`, and it peaked in ${monthName(ic)} rather than the usual ${monthName(inr)}`:''} — then melted away. The storage line beneath it never recovers: <b>low snow in, low water out</b>.`)}</p>`;
  })():'';
  return sec('snow','Where it begins','Your water starts as snow',
    `<p class="lr-p">${W(`In Colorado the year’s water is written in winter. Storms stack {{snowpack|snow}} on the high country, and that frozen reservoir — measured all season as {{snow water equivalent|snow-water equivalent}} — is what melts into the rivers and fills the lakes you just saw. A reservoir is really just the snow’s second home.`)}</p>
     <div class="fact-grid">${facts}</div>
     <p class="lr-p">${W(`Because the snow <i>is</i> the storage, a warm early spring can undo a decent winter: the high country can hold a fair snowpack and still come up short if it melts too fast to catch. That is roughly what happened in 2026 — by the first of June, most of the state’s SNOTEL sites were already bare.`)}</p>
     <h3 class="lr-h3">Snow in, water out</h3>
     ${snowLine}
     <div class="lr-chart">${chart}<div class="lr-chart-cap">${chartCap}</div></div>
     <p class="lr-p lr-aside">${W(`So the snow decides how much water there is. Who actually gets it is a separate question — and that comes down to your utility.`)}</p>`);
}

/* ---------- §1 the seven basins (interactive map) ---------- */
const BMW=700,BMH=400, BGW=-109.05,BGE=-102.05,BGN=41,BGS=37;
const bmx=lon=>(lon-BGW)/(BGE-BGW)*BMW, bmy=lat=>(BGN-lat)/(BGN-BGS)*BMH;
function basinPathD(rings){
  return rings.map(r=>'M'+r.map(p=>bmx(p[0]).toFixed(1)+','+bmy(p[1]).toFixed(1)).join('L')+'Z').join(' ');
}
function basinMapSVG(home,sel){
  if(typeof BASIN_GEO==='undefined')return '';
  let s=`<svg class="basinmap" viewBox="0 0 ${BMW} ${BMH}" role="group" aria-label="Colorado's seven river basins, shaded by storage versus normal">`;
  s+=`<image href="img/co-relief.webp" x="0" y="0" width="${BMW}" height="${BMH}" preserveAspectRatio="none" opacity="0.3"/>`;
  Object.keys(BASIN_GEO).forEach(bid=>{
    const hue=BASIN_HUE[bid]||'#6d8391';
    s+=`<path class="sbasin${bid===home?' home':''}${bid===sel?' sel':''}" data-basin="${bid}" `
      +`d="${basinPathD(BASIN_GEO[bid])}" fill="${hue}" stroke="${hue}" tabindex="0" role="button" `
      +`aria-label="${BASINS.find(x=>x.id===bid).n} basin"></path>`;
  });
  Object.keys(BASIN_GEO).forEach(bid=>{
    const a=BASIN_LABEL[bid]; if(!a)return;
    const x=bmx(a[0]).toFixed(0), y=bmy(a[1]).toFixed(0);
    const bb=BASINS.find(x2=>x2.id===bid), pct=Math.round(PMH[bid]?PMH[bid][NOW]:100);
    s+=`<text class="sbasin-lab" x="${x}" y="${y}" text-anchor="middle" pointer-events="none">${bb.n.toUpperCase()}</text>`;
    s+=`<text class="sbasin-pct" x="${x}" y="${(+y+13)}" text-anchor="middle" fill="${ramp(pct)}" pointer-events="none">${pct}%</text>`;
  });
  return s+'</svg>';
}
function basinSummaryHTML(bid,home){
  const b=BASINS.find(x=>x.id===bid), pct=Math.round(PMH[bid]?PMH[bid][NOW]:100);
  const inb=RES.filter(r=>r.b===bid&&!r.fc);
  const cap=inb.reduce((s,r)=>s+r.cap,0);
  const below=inb.filter(r=>pmAt(r,NOW)<95).length;
  const largest=inb.slice().sort((a,c)=>c.cap-a.cap)[0];
  const west=WEST.includes(bid);
  return `<div class="bx-head"><span class="bx-name">${b.n}${bid===home?' · your basin':''}</span>`
    +`<span class="bx-pct" style="color:${ramp(pct)}">${pct}% of median</span></div>`
    +`<p class="bx-blurb">${BASININFO[bid]||''}</p>`
    +`<div class="bx-stats"><span>${west?'West slope':'East slope'}</span><span>${inb.length} reservoirs</span>`
    +`<span>${kaf(cap)} KAF full</span><span>${below} below normal</span>`
    +`${largest?`<span>largest: ${cleanName(largest.n)}</span>`:''}</div>`
    +`<div class="bx-links"><a href="map.html#basin=${bid}">Explore the ${b.n} on the detailed map →</a>`
    +`<a href="map.html#basin=${bid}&view=flow">See how its water steps down →</a></div>`;
}
function secBasin(tap){
  const hb=tap.hb, b=BASINS.find(x=>x.id===hb);
  const tuns=(tap.tun||[]).map(n=>TUNNELS[n]?[n,TUNNELS[n]]:null).filter(Boolean);
  const hist=tuns.length
    ? `<h3 class="lr-h3">The plumbing that made it livable</h3>
       <p class="lr-p">${W(`Your basin’s water didn’t always flow the way it does now. Beginning in the 1930s, Colorado bored tunnels straight through the {{Continental Divide}} — {{transmountain diversion|transmountain diversions}} that reverse geography, carrying West Slope snowmelt east to the cities that grew up dry. The ones behind your tap:`)}</p>
       <ul class="tunlist">`
      +tuns.map(([n,t])=>`<li><span class="tun-yr">${t.year}</span><span class="tun-body"><a class="wikilink" href="https://en.wikipedia.org/wiki/${t.wiki}" target="_blank" rel="noopener"><b>${n}</b></a> — ${t.mi} mi · ${t.proj}. ${t.note.charAt(0).toUpperCase()+t.note.slice(1)}.</span></li>`).join('')
      +`</ul>`
    : `<h3 class="lr-h3">No tunnel feeds this one</h3>
       <p class="lr-p">${W(`Your basin lives on its own snowmelt — nothing crosses the {{Continental Divide}} to top it up. What falls here is what you get, which makes the size of the winter snowpack everything.`)}</p>`;
  return sec('basin','Colorado runs on seven basins',`Your basin: the ${b.n}`,
    `<p class="lr-p">${W(`Colorado divides into seven river basins — four west of the {{Continental Divide}}, three east. Yours is the <b>${b.n}</b>. Each is shaded by how its storage is holding up against its own normal right now; tap any basin to compare.`)}</p>
     <div class="basinmap-wrap" id="basin-explorer">${basinMapSVG(hb,hb)}
       <div class="bx-panel" id="basin-sel">${basinSummaryHTML(hb,hb)}</div></div>
     <p class="lr-p lr-cap">Boundaries from the public-domain USGS Watershed Boundary Dataset. To go reservoir by reservoir, open the <a class="wikilink" href="map.html">detailed map →</a> (best on a big screen).</p>
     ${hist}
     <p class="lr-p lr-aside">${W(`All of it starts the same way — as snow.`)}</p>`);
}

/* ---------- §3 your tap ---------- */
function secTap(tap){
  const home=slopeOf(tap.hb);
  const across=[], same=[];
  (tap.res||[]).forEach(id=>{const r=RESBY[id]; if(!r)return; (slopeOf(r.b)!==home?across:same).push(r);});
  const acrossBasins=[...new Set(across.map(r=>BASINS.find(b=>b.id===r.b).n))];
  const reveal=(across.length&&tap.tun&&tap.tun.length)
    ? `<p class="reveal">${W(`Much of your water is born <b>across the {{Continental Divide}}</b>, in the ${acrossBasins.join(' and ')} — and crosses beneath the mountains through the <b>${tap.tun.join('</b> and <b>')}</b>.`)}</p>`
    : '';
  const fc=(tap.fcres&&tap.fcres.length)
    ? `<p class="fc-note">${W(`The big lakes you see nearby — ${tap.fcres.map(id=>cleanName(RESBY[id].n)).join(', ')} — are {{flash flood|flood-control}} pools, not your supply. Nobody drinks from them.`)}</p>`
    : '';
  const approx=tap._approx
    ? `<p class="lr-p lr-aside">${W(`We don’t have ZIP ${tap.zip}’s exact provider mapped yet, so this shows the nearest system we do — <b>${tap.prov}</b> — to give you the regional picture. Your actual provider, and near the Divide sometimes the basin, may differ.`)}</p>`
    : '';
  return sec('tap','Your tap',tap.prov,
    approx+`<p class="lr-p">${W(`Your tap is only as specific as your provider. <b>${tap.prov}</b> holds particular water rights and particular plumbing — which is why a neighbor two towns over, on a different utility, may drink an entirely different river. Under Colorado’s {{prior appropriation}} system, who got there first decides who gets water in a dry year.`)}</p>
     <p class="lr-p">${tap.desc}</p>
     ${reveal}
     ${glassGroup('Across the Divide — West Slope',across)}
     ${glassGroup(home==='w'?'From your own basin':'From your side of the mountains',same)}
     ${fc}
     <p class="src-tip">Tap any glass to open it on the live map.</p>
     <p class="lr-p lr-aside">${W(`Those levels are not fixed — every one of them rises and falls on a yearly rhythm.`)}</p>`);
}

/* ---------- §4 seasonal cycle & summer rain ---------- */
function secSeason(tap){
  const hb=tap.hb;
  /* prefer one of the reader's OWN reservoirs — naming a stranger's reservoir
     ("you can see it in Horsetooth" to a Denver reader) breaks the thread */
  const mine=(tap.res||[]).map(id=>RESBY[id]).filter(r=>r&&!r.fc);
  const pool=mine.length?mine:RES.filter(r=>r.b===hb&&!r.fc);
  const ex=pool.slice().sort((a,b)=>b.cap-a.cap)[0];
  const exFull=ex?Math.round(stoAt(ex,NOW)/ex.cap*100):null;
  const sanchez=RESBY['sanchez'];
  return sec('season','The rhythm of the year','Fill in spring, draw down all summer',
    `<p class="lr-p">${W(`A reservoir breathes once a year. Through spring the {{snowmelt}} pours in and the glass fills; then all summer the valves open — for farms, for lawns, for the river’s legal minimums — and the level falls. A healthy year ends with enough <b>carryover</b> to start the next one. A dry year ends scraped low.`)}</p>
     ${ex?`<p class="lr-p">${W(exFull>=70
        ? `Take <b>${proseName(ex.n)}</b>, one of your own: it caught this spring’s melt and stands at ${exFull}% of capacity today, with the summer draw still ahead of it.`
        : `Take <b>${proseName(ex.n)}</b>, one of your own: it sits at just ${exFull}% of capacity today — this year’s melt never brought it back up before the summer draw began.`)}</p>`:''}
     ${sanchez?`<p class="lr-p">${W(`Not every low glass means drought, though. ${cleanName(sanchez.n)}, down in the San Luis Valley, is irrigation storage — emptied to almost nothing by late summer most years, then refilled. There, empty is the job.`)}</p>`:''}
     <h3 class="lr-h3">So what about summer rain?</h3>
     <p class="lr-p">${W(`Come July, the {{North American Monsoon}} pushes Gulf moisture north and Colorado’s afternoons turn to thunderstorms. It <b>feels</b> like relief — and in one real way it is. But it rarely shows up in the reservoirs, and it’s worth knowing why:`)}</p>
     <ul class="lr-list">
       <li>${W(`<b>It cuts demand more than it adds supply.</b> A wet week means nobody irrigates — so the draw-down slows. Less water goes <i>out</i>. That alone can flatten a reservoir’s summer decline, even if little rain flows <i>in</i>.`)}</li>
       <li>${W(`<b>It rarely refills the big lakes.</b> Monsoon rain lands as intense, local bursts on dry ground — most evaporates or runs off fast, and the storms miss the high snowfields that actually feed the major reservoirs.`)}</li>
       <li>${W(`<b>It recharges {{soil moisture}}.</b> Wet late-summer soils matter for <i>next</i> year: dry ground drinks the following spring’s melt before it ever reaches a stream, so a good monsoon quietly improves next runoff.`)}</li>
       <li>${W(`<b>It arrives as {{flash flood|flash floods}}.</b> The same bursts that can’t fill a reservoir can fill a canyon in minutes — which is exactly why the Cherry Creek and Bear Creek flood pools you saw earlier are kept deliberately empty.`)}</li>
     </ul>
     <p class="lr-p lr-aside">${W(`So a strong monsoon eases a drought summer; it doesn’t end a drought. The snow still writes the year — and over the long run, the snow has been shrinking.`)}</p>`);
}

/* ---------- §5 scarcity & climate ---------- */
function secScarcity(){
  const bm=RESBY['bluemesa'];
  const bmLive=bm&&LIVE_STO[bm.id];
  const bmPct=bm?pmAt(bm,NOW):null;
  const powell=(window.CW_HISTORY?CW_HISTORY.powellChart():'');
  const pk=(typeof POWELL_ANNUAL!=='undefined')?POWELL_ANNUAL.reduce((a,b)=>b[1]>a[1]?b:a):null;
  const last=(typeof POWELL_ANNUAL!=='undefined')?POWELL_ANNUAL[POWELL_ANNUAL.length-1]:null;
  return sec('scarcity','The long view','A drought, and a drier baseline',
    `<p class="lr-p">${W(`One dry year is weather. A downward-sloping baseline is something else. Since 2000 the Colorado River basin has been living through what scientists call a {{megadrought}} — the driest stretch in twelve centuries — and warming is turning drought into a permanent condition, a shift with its own name: {{aridification}}.`)}</p>
     ${powell?`<div class="lr-chart">${powell}<div class="lr-chart-cap">${W(`{{Lake Powell}} — annual storage${pk&&last?`, from a peak near ${(pk[1]/1e6).toFixed(1)}M acre-feet (${pk[0]}) to ${(last[1]/1e6).toFixed(1)}M (${last[0]})`:''} · US Bureau of Reclamation`)}</div></div>`:''}
     <p class="lr-p">${W(`{{Lake Powell}}, the Colorado River’s great savings account, tells the story bluntly: full through the 1980s, it has been drawn toward dead pool for two decades. And Colorado’s own {{Blue Mesa Reservoir}} — the largest in the state — is the next account upstream. When the river is short, Blue Mesa is tapped to prop up Powell.`)}</p>
     ${bm?`<div class="bignum"><div class="bignum-v" style="color:${ramp(bmPct)}">${bmPct}%</div>
        <div class="bignum-lab">${W(`of normal — {{Blue Mesa Reservoir}} today${bmLive?`, holding ${af(bmLive.sto)} acre-feet (live, Colorado DWR)`:''}. <a class="wikilink" href="map.html#r=bluemesa">see it on the map →</a>`)}</div></div>`:''}
     <p class="lr-p">${W(`Here’s the hard part of {{aridification}}: warming shifts precipitation from snow toward rain, melts what snow there is earlier, and evaporates more from every reservoir surface. So even a <i>normal</i> snow year now yields less usable water than it did a generation ago. A good monsoon helps at the margins; it can’t reverse the trend.`)}</p>
     <p class="lr-p lr-aside">${W(`Supply, in other words, is largely out of our hands. Demand is not.`)}</p>`);
}

/* ---------- §6 what you can do ---------- */
function secAction(tap){
  const pl=providerLink(tap.prov);
  const res=SAVE_RESOURCES.map(r=>`<li><a class="wikilink" href="${r.url}" target="_blank" rel="noopener">${r.lab}</a></li>`).join('');
  return sec('action','Your move','What you can actually do',
    `<p class="lr-p">${W(`Demand is the lever ordinary people actually hold — and outdoor watering is where most of a household’s share sits. Roughly half of a Front Range home’s summer water goes onto the lawn.`)}</p>
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
     <p class="lr-p lr-aside">${W(`Every tap in Colorado is at the end of a specific thread — a river, a tunnel, a glass draining in the hills. You can now point at yours. Open the live map and follow it.`)}</p>`);
}

/* ---------- assemble ---------- */
function renderArticle(tap,zip){
  const b=BASINS.find(x=>x.id===tap.hb);
  const approx=!!tap._approx;
  const title=approx?`Near ${tap.city}`:tap.city;
  const servedBy=(approx?'Nearest mapped system: ':'Served by ')
    +`<b>${tap.prov}</b> · ${b.n} basin`;
  document.getElementById('article-place').textContent=`ZIP ${zip} · ${tap.prov}${approx?' (nearest)':''}`;
  ['to-map','to-map2'].forEach(id=>{const m=document.getElementById(id);if(m)m.href='map.html#zip='+zip;});
  document.getElementById('article-body').innerHTML=
    `<header class="lr-hero"><p class="lr-eyebrow">Your water · ZIP ${zip}</p>
       <h1 class="lr-title">${title}</h1>
       <p class="lr-servedby">${servedBy}</p>
       <p class="lr-sub">${W(`Follow one thread — your tap — from the basin it sits in and the snowfields that make it, through the reservoirs and tunnels that carry it, to the drought pressing on all of it. Bold terms link out so you can verify and dig deeper.`)}</p></header>`
    +secBasin(tap)+secSnow(tap)+secTap(tap)+secSeason(tap)+secScarcity()+secAction(tap);
  // interactive basin map: click/keyboard a basin to swap the summary panel
  const bx=document.getElementById('basin-explorer');
  if(bx){
    const sel=document.getElementById('basin-sel');
    bx.querySelectorAll('.sbasin').forEach(p=>{
      const pick=()=>{bx.querySelectorAll('.sbasin').forEach(x=>x.classList.toggle('sel',x===p));
        if(sel)sel.innerHTML=basinSummaryHTML(p.dataset.basin,tap.hb);};
      p.addEventListener('click',pick);
      p.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();pick();}});
    });
  }
}

/* ---------- entry wiring ---------- */
function msg(t){const el=document.getElementById('zipmsg');if(el)el.textContent=t;}
function submitZip(){
  const z=(document.getElementById('zip').value||'').trim();
  if(!/^\d{5}$/.test(z)){msg('five digits, e.g. 80302');return;}
  const t=zipLookup(z);
  if(!t){msg(/^8[01]/.test(z)
    ?'don’t have that ZIP mapped yet — try a nearby city below'
    :'this map covers Colorado — but wherever you are, your tap has a watershed too');return;}
  msg('');
  choosePlace(t,z);
}
document.getElementById('zipgo').addEventListener('click',submitZip);
document.getElementById('zip').addEventListener('keydown',e=>{if(e.key==='Enter')submitZip();});

const cc=document.getElementById('citychips');
cc.innerHTML=STORY_CITIES.map(c=>
  `<button class="citychip" data-tap="${c.tap}" data-zip="${c.zip}">${c.label}</button>`).join('');
cc.querySelectorAll('.citychip').forEach(b=>b.addEventListener('click',()=>{
  const t=TAPS.find(x=>x.id===b.dataset.tap);
  if(t){document.getElementById('zip').value=b.dataset.zip;msg('');choosePlace(t,b.dataset.zip);}
}));

document.querySelectorAll('.story-back').forEach(b=>b.addEventListener('click',()=>{
  history.pushState(null,'','#');go('entry');
}));

/* ---------- history + boot ---------- */
function syncFromHash(){
  const h=location.hash.replace(/^#/,'');
  const zip=/^\d{5}$/.test(h)?h:((h.match(/(?:^|&)zip=(\d{5})/)||[])[1]);
  if(zip){
    const t=zipLookup(zip);
    if(t){curTap=t;curZip=zip;document.getElementById('zip').value=zip;
      renderArticle(t,zip);go('article');return;}
  }
  go('entry');
}
window.addEventListener('popstate',syncFromHash);
window.addEventListener('cw-live',()=>{if(curTap)renderArticle(curTap,curZip);});
syncFromHash();
})();
