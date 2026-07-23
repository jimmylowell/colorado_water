"use strict";
/* =====================================================================
   THE STORY — a clean, click-through intro: ZIP or city → your basin →
   where your water actually comes from → Explore the live map.
   Reads TAPS / BASININFO / PMH / RES from data.js; live storage from
   LIVE_STO (filled by live.js). No map engine (viz.js) is loaded here.
   ===================================================================== */
(function(){
const WEST=['colorado','gunnison','yampa','sw'];
const slopeOf=b=>WEST.includes(b)?'w':'e';
const kaf=n=>Math.round(n/1000).toLocaleString('en-US');
const cleanName=n=>n.replace(/ (Reservoir|Res\.|Lake|Canyon)$/,'');
let curTap=null, curZip=null;

/* ---- steps ---- */
function go(step){
  document.querySelectorAll('.story-step').forEach(s=>s.classList.remove('is-active'));
  const el=document.getElementById('step-'+step);
  if(el)el.classList.add('is-active');
  window.scrollTo({top:0,behavior:'auto'});
}
function choosePlace(tap,zip){
  curTap=tap; curZip=zip;
  renderBasin(tap); renderSource(tap,zip);
  const m=document.getElementById('to-map'); if(m)m.href='map.html#zip='+zip;
  history.pushState(null,'','#'+zip);
  go('basin');
}

/* ---- step 1: your basin ---- */
function renderBasin(tap){
  const hb=tap.hb, b=BASINS.find(x=>x.id===hb);
  const pct=Math.round(PMH[hb][NOW]);
  const inb=RES.filter(r=>r.b===hb&&!r.fc);
  const cap=inb.reduce((s,r)=>s+r.cap,0);
  document.getElementById('basin-body').innerHTML=
    `<p class="story-kicker">You live in the</p>`
    +`<h2 class="story-h2">${b.n} basin</h2>`
    +`<p class="story-prose">${BASININFO[hb]}</p>`
    +`<div class="basin-panel">`
    +`<div class="bp-cell"><div class="bp-num" style="color:${ramp(pct)}">${pct}%</div>`
    +`<div class="bp-lab">of the 1991–2020 median<br>in storage today</div></div>`
    +`<div class="bp-cell bp-spark">${sparkSVG(PMH[hb],ramp(pct))}`
    +`<div class="bp-lab">the water year so far · Oct → Jul</div></div>`
    +`<div class="bp-cell"><div class="bp-num">${inb.length}</div>`
    +`<div class="bp-lab">reservoirs here holding<br>${kaf(cap)} KAF when full</div></div>`
    +`</div>`;
}

/* ---- step 2: your water source ---- */
function glassMini(r){
  const frac=Math.max(0,Math.min(1,stoAt(r,NOW)/r.cap));
  const pm=pmAt(r,NOW), col=ramp(pm);
  const topY=3, botY=34, rim=12, base=6.5, cx=15, W=30, fillTop=(botY-(botY-topY)*frac).toFixed(1);
  const path=`M${cx-rim},${topY} L${cx-base},${botY} Q${cx-base},${botY+2} ${cx-base+2},${botY+2} `
    +`L${cx+base-2},${botY+2} Q${cx+base},${botY+2} ${cx+base},${botY} L${cx+rim},${topY} Z`;
  const cid='gm'+r.id;
  return `<svg class="gmini" width="${W}" height="39" viewBox="0 0 ${W} 39" aria-hidden="true">`
    +`<defs><clipPath id="${cid}"><path d="${path}"/></clipPath></defs>`
    +`<path d="${path}" fill="#0A1620" stroke="#54798C" stroke-width="1.1"/>`
    +`<rect x="0" y="${fillTop}" width="${W}" height="39" fill="${col}" opacity="0.95" clip-path="url(#${cid})"/>`
    +`<path d="${path}" fill="none" stroke="#54798C" stroke-width="1.1"/></svg>`;
}
function glassCard(r){
  const pm=pmAt(r,NOW);
  return `<a class="gcard" href="map.html#r=${r.id}" title="See ${r.n} on the map">`
    +`${glassMini(r)}<div class="gc-name">${cleanName(r.n)}</div>`
    +`<div class="gc-pct" style="color:${ramp(pm)}">${pm}%</div></a>`;
}
function group(title,arr){
  if(!arr.length)return'';
  return `<div class="src-slope"><div class="src-slope-h">${title}</div>`
    +`<div class="src-glasses">${arr.slice().sort((a,b)=>b.cap-a.cap).map(glassCard).join('')}</div></div>`;
}
function renderSource(tap,zip){
  const home=slopeOf(tap.hb);
  const across=[], same=[];
  (tap.res||[]).forEach(id=>{const r=RESBY[id]; if(!r)return; (slopeOf(r.b)!==home?across:same).push(r);});
  const acrossBasins=[...new Set(across.map(r=>BASINS.find(b=>b.id===r.b).n))];
  const reveal=(across.length&&tap.tun&&tap.tun.length)
    ? `<p class="reveal">Much of your water is born <b>across the Continental Divide</b>, in the `
      +`${acrossBasins.join(' and ')} — and crosses beneath the mountains through the `
      +`<b>${tap.tun.join('</b> and <b>')}</b>.</p>`
    : '';
  const fc=(tap.fcres&&tap.fcres.length)
    ? `<p class="fc-note">The big lakes you see nearby — `
      +`${tap.fcres.map(id=>cleanName(RESBY[id].n)).join(', ')} — are flood-control pools, `
      +`not your supply. Nobody drinks from them.</p>`
    : '';
  document.getElementById('source-body').innerHTML=
    `<p class="story-kicker">Your tap</p>`
    +`<h2 class="story-h2">${tap.prov}</h2>`
    +`<p class="story-prose">${tap.desc}</p>`
    +reveal
    +group('Across the Divide — West Slope',across)
    +group(home==='w'?'Your basin':'Your side of the mountains',same)
    +fc
    +`<p class="src-tip">Tap any glass to open it on the live map.</p>`;
}

/* ---- entry wiring ---- */
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

document.getElementById('to-source').addEventListener('click',()=>go('source'));
document.querySelectorAll('.story-back').forEach(b=>b.addEventListener('click',()=>{
  const to=b.dataset.to;
  if(to==='entry'){history.pushState(null,'','#');go('entry');}
  else go(to);
}));

/* ---- history + boot ---- */
function syncFromHash(){
  const h=location.hash.replace(/^#/,'');
  const zip=/^\d{5}$/.test(h)?h:((h.match(/(?:^|&)zip=(\d{5})/)||[])[1]);
  if(zip){
    const t=zipLookup(zip);
    if(t){curTap=t;curZip=zip;document.getElementById('zip').value=zip;
      renderBasin(t);renderSource(t,zip);
      const m=document.getElementById('to-map');if(m)m.href='map.html#zip='+zip;
      go('basin');return;}
  }
  go('entry');
}
window.addEventListener('popstate',syncFromHash);
window.addEventListener('cw-live',()=>{if(curTap){renderBasin(curTap);renderSource(curTap,curZip);}});
syncFromHash();
})();
