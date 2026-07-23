"use strict";
/* =====================================================================
   THE STORY — a ZIP/city gate, then one long-form, scrolling drought
   narrative built around the reader's own tap:
     snow → your basin & its plumbing → your tap → the seasonal cycle &
     summer rain → scarcity & a changing climate → what you can do.
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

/* ---------- §1 snow ---------- */
function secSnow(tap){
  const hb=tap.hb, b=BASINS.find(x=>x.id===hb);
  const facts=COLORADO_FACTS.map(f=>
    `<div class="fact"><div class="fact-stat">${f.stat}</div>`
    +`<div class="fact-lab">${W(f.lab)} ${cite(f.cite)}</div></div>`).join('');
  return sec('snow','Where it begins','Your water starts as snow',
    `<p class="lr-p">${W(`In Colorado the year’s water is written in winter. Storms stack {{snowpack|snow}} on the high country, and that frozen reservoir — measured all season as {{snow water equivalent|snow-water equivalent}} — is what melts into rivers and fills the lakes below. The reservoirs you’ll see in a moment are really just the snow’s second home.`)}</p>
     <div class="fact-grid">${facts}</div>
     <p class="lr-p">${W(`This is why hydrologists start counting on October 1 — the {{water year}} — and why a warm, early spring can undo a decent winter: the ${b.n} high country can hold a fair snowpack and still come up short if it melts too fast to catch. That is roughly what happened in 2026. By the first of June, most of the state’s SNOTEL sites were already bare.`)}</p>
     <p class="lr-p lr-aside">${W(`And summer rain? A good {{North American Monsoon|monsoon}} soaks the lawn and eases the strain, but it rarely refills a reservoir — more on that below. First, follow the snow down into your own basin.`)}</p>`);
}

/* ---------- §2 your basin + its plumbing ---------- */
function secBasin(tap){
  const hb=tap.hb, b=BASINS.find(x=>x.id===hb);
  const pct=Math.round(PMH[hb][NOW]);
  const inb=RES.filter(r=>r.b===hb&&!r.fc);
  const cap=inb.reduce((s,r)=>s+r.cap,0);
  const largest=inb.slice().sort((a,b)=>b.cap-a.cap)[0];
  const below=inb.filter(r=>pmAt(r,NOW)<95).length;
  const chart=(window.CW_HISTORY?CW_HISTORY.wyChart(PMH[hb],ramp(pct)):sparkSVG(PMH[hb],ramp(pct)));
  const tuns=(tap.tun||[]).map(n=>TUNNELS[n]?[n,TUNNELS[n]]:null).filter(Boolean);
  const hist=tuns.length
    ? `<h3 class="lr-h3">The plumbing that made it livable</h3>
       <p class="lr-p">${W(`Your basin’s water didn’t always flow the way it does now. Beginning in the 1930s, Colorado bored tunnels straight through the {{Continental Divide}} — {{transmountain diversion|transmountain diversions}} that reverse geography, carrying West Slope snowmelt east to the cities that grew up dry. The ones behind your tap:`)}</p>
       <ul class="tunlist">`
      +tuns.map(([n,t])=>`<li><span class="tun-yr">${t.year}</span><span class="tun-body"><a class="wikilink" href="https://en.wikipedia.org/wiki/${t.wiki}" target="_blank" rel="noopener"><b>${n}</b></a> — ${t.mi} mi · ${t.proj}. ${t.note}.</span></li>`).join('')
      +`</ul>`
    : `<p class="lr-p">${W(`Your basin lives on its own snowmelt — no tunnel under the {{Continental Divide}} feeds it. What falls here is what you get, which makes the size of the winter snowpack everything.`)}</p>`;
  return sec('basin','Your basin',`The ${b.n} basin`,
    `<p class="lr-p">${BASININFO[hb]}</p>
     <div class="basin-panel">
       <div class="bp-cell"><div class="bp-num" style="color:${ramp(pct)}">${pct}%</div>
         <div class="bp-lab">of the 1991–2020 median<br>in storage today</div></div>
       <div class="bp-cell"><div class="bp-num">${inb.length}</div>
         <div class="bp-lab">reservoirs here holding<br>${kaf(cap)} KAF when full</div></div>
       <div class="bp-cell"><div class="bp-num" style="color:${below?'#EF9A1B':'#2FD94F'}">${below}</div>
         <div class="bp-lab">of them sitting<br>below normal now</div></div>
     </div>
     <div class="lr-chart">${chart}<div class="lr-chart-cap">${b.n} storage across the water year, % of median · derived from CDSS history</div></div>
     ${largest?`<p class="lr-p">${W(`The basin’s biggest single glass is <b>${cleanName(largest.n)}</b> — ${kaf(largest.cap)} KAF full, ${pmAt(largest,NOW)}% of normal today.`)}</p>`:''}
     ${hist}`);
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
  return sec('tap','Your tap',tap.prov,
    `<p class="lr-p">${W(`Your tap is only as specific as your provider. <b>${tap.prov}</b> holds particular water rights and particular plumbing — which is why a neighbor two towns over, on a different utility, may drink an entirely different river. Under Colorado’s {{prior appropriation}} system, who got there first decides who gets water in a dry year.`)}</p>
     <p class="lr-p">${tap.desc}</p>
     ${reveal}
     ${glassGroup('Across the Divide — West Slope',across)}
     ${glassGroup(home==='w'?'From your own basin':'From your side of the mountains',same)}
     ${fc}
     <p class="src-tip">Tap any glass to open it on the live map.</p>`);
}

/* ---------- §4 seasonal cycle & summer rain ---------- */
function secSeason(tap){
  const hb=tap.hb;
  const inb=RES.filter(r=>r.b===hb&&!r.fc);
  const largest=inb.slice().sort((a,b)=>b.cap-a.cap)[0];
  const sanchez=RESBY['sanchez'];
  return sec('season','The rhythm of the year','Fill in spring, draw down all summer',
    `<p class="lr-p">${W(`A reservoir breathes once a year. Through spring the {{snowmelt}} pours in and the glass fills; then all summer the valves open — for farms, for lawns, for the river’s legal minimums — and the level falls. A healthy year ends with enough <b>carryover</b> to start the next one. A dry year ends scraped low.`)}</p>
     ${largest?`<p class="lr-p">${W(`You can see it in <b>${cleanName(largest.n)}</b>: filled by early summer, it now sits at ${Math.round(stoAt(largest,NOW)/largest.cap*100)}% of capacity and falling as the season draws it down.`)}</p>`:''}
     ${sanchez?`<p class="lr-p">${W(`Some reservoirs are built to empty. ${cleanName(sanchez.n)} in the San Luis Valley is irrigation storage — drawn down to nearly nothing by late summer most years, then refilled. Emptiness there isn’t always drought; it’s the job.`)}</p>`:''}
     <h3 class="lr-h3">So what about summer rain?</h3>
     <p class="lr-p">${W(`Come July, the {{North American Monsoon}} pushes Gulf moisture north and Colorado’s afternoons turn to thunderstorms. It <b>feels</b> like relief — and in one real way it is. But it rarely shows up in the reservoirs, and it’s worth knowing why:`)}</p>
     <ul class="lr-list">
       <li>${W(`<b>It cuts demand more than it adds supply.</b> A wet week means nobody irrigates — so the draw-down slows. Less water goes <i>out</i>. That alone can flatten a reservoir’s summer decline, even if little rain flows <i>in</i>.`)}</li>
       <li>${W(`<b>It rarely refills the big lakes.</b> Monsoon rain lands as intense, local bursts on dry ground — most evaporates or runs off fast, and the storms miss the high snowfields that actually feed the major reservoirs.`)}</li>
       <li>${W(`<b>It recharges {{soil moisture}}.</b> Wet late-summer soils matter for <i>next</i> year: dry ground drinks the following spring’s melt before it ever reaches a stream, so a good monsoon quietly improves next runoff.`)}</li>
       <li>${W(`<b>It arrives as {{flash flood|flash floods}}.</b> The same bursts that can’t fill a reservoir can fill a canyon in minutes — which is exactly why the Cherry Creek and Bear Creek flood pools you saw earlier are kept deliberately empty.`)}</li>
     </ul>
     <p class="lr-p lr-aside">${W(`So a strong monsoon eases a drought summer; it doesn’t end a drought. The snow still writes the year.`)}</p>`);
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
        <div class="bignum-lab">${W(`{{Blue Mesa Reservoir}} today — ${bmLive?`${af(bmLive.sto)} AF, live from Colorado DWR`:'of its normal storage'}. <a class="wikilink" href="map.html#r=bluemesa">see it on the map →</a>`)}</div></div>`:''}
     <p class="lr-p">${W(`Here’s the hard part of {{aridification}}: warming shifts precipitation from snow toward rain, melts what snow there is earlier, and evaporates more from every reservoir surface. So even a <i>normal</i> snow year now yields less usable water than it did a generation ago. A good monsoon helps at the margins; it can’t reverse the trend.`)}</p>`);
}

/* ---------- §6 what you can do ---------- */
function secAction(tap){
  const pl=providerLink(tap.prov);
  const res=SAVE_RESOURCES.map(r=>`<li><a class="wikilink" href="${r.url}" target="_blank" rel="noopener">${r.lab}</a></li>`).join('');
  return sec('action','Your move','What you can actually do',
    `<p class="lr-p">${W(`Drought is easy to ignore from a working tap. But demand is the one lever ordinary people hold, and summer outdoor watering is where most of it lives — half of a Front Range household’s summer water goes on the lawn.`)}</p>
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
  document.getElementById('article-place').textContent=`${tap.city} · ${b.n} basin`;
  ['to-map','to-map2'].forEach(id=>{const m=document.getElementById(id);if(m)m.href='map.html#zip='+zip;});
  document.getElementById('article-body').innerHTML=
    `<header class="lr-hero"><p class="lr-eyebrow">Your water, from the snow down</p>
       <h1 class="lr-title">${tap.city}</h1>
       <p class="lr-sub">${W(`Follow one thread — your tap — from the snowfields that make it, through the reservoirs and tunnels that carry it, to the drought pressing on all of it. Bold terms link out so you can verify and dig deeper.`)}</p></header>`
    +secSnow(tap)+secBasin(tap)+secTap(tap)+secSeason(tap)+secScarcity()+secAction(tap);
  // wire glass clicks are plain links; nothing else to bind
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
