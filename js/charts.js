"use strict";
/* =====================================================================
   SHARED CHART CORE — the one home for what every chart used to own
   privately: the palette, formatters, the glass-glyph geometry, the
   line-path builder, fetchJSON, and the interaction layer (tooltip,
   crosshair, per-mark hover) that makes a chart answerable by touch,
   mouse and keyboard alike. No d3 in here: d3 builds some charts, but
   the interaction layer attaches to any inserted DOM, string-built or
   not, so basinmap/story marks get tooltips without a rewrite.
   Loads on every page (data.html included) before anything that draws.
   ===================================================================== */
(function(){

/* ---------- palette: every chart hex literal, one place ----------
   The site is dark-only; centralising these is what would make a second
   theme possible, not a promise of one. Series doctrine (see history.js
   header): ordinal ramps one-hue, "this year" takes the warm accent,
   "normal" is neutral + dashed everywhere, no dual axes. */
const PAL={
  DECRAMP:['#3E8397','#4E9AB0','#61B2C8','#7ACDE0','#A9E8F4'],
  THEN:'#4E93A8',      /* the oldest decade, where only two are drawn */
  NOWDEC:'#A9E8F4',    /* the newest decade */
  NOW:'#FF7A45',       /* this water year — the emphasis series */
  REF:'#7C93A1',       /* "normal" reference lines, all charts */
  SNOW:'#6FC9DF',      /* snowpack, wherever it stands alone */
  STORE:'#3F7BFF',     /* reservoir storage, wherever it stands alone */
  GRID:'#1b2b36',
  BONE:'#EDE6D6', DIM:'#5C7484', SURFACE:'#08131B',
  GLASS:{well:'#0A1620',stroke:'#54798C',strokeHi:'#8fb0c4',fc:'#8DA4B0'},
  POWELL:{line:'#4E86FF',fill:'#2F6BFF',dead:'#E2603A',crit:'#B4321E'},
  SEASON:{band:'#8FA6B2',rule:'#2A4150'},
  EVENT:'#3C5364'
};

/* ---------- text + number helpers ---------- */
const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtAF=n=>n<1000?String(Math.round(n)):n>=1e6?(n/1e6).toFixed(1)+'M':Math.round(n/1e3)+'k';
/* one kaf for the whole site: small reservoirs keep a decimal (7.9 KAF says
   more than 8), everything else rounds with locale grouping */
const kaf=n=>n<10000?(n/1000).toFixed(1):Math.round(n/1000).toLocaleString('en-US');
const af=n=>Math.round(n).toLocaleString('en-US');
/* an axis tick accumulated by repeated addition can carry FP noise —
   3.7500000000000004″ — so every tick label passes through here */
const fmtTick=v=>String(+(+v).toFixed(4));

/* the smallest round axis top that clears `max` and divides into `n` tidy
   ticks. Guarded: an all-zero series must yield a finite axis, not NaN. */
function niceTop(max,n){
  if(!(max>0))return n;
  const raw=max/n, mag=Math.pow(10,Math.floor(Math.log10(raw)));
  const step=[1,1.5,2,2.5,3,4,5,7.5,10].map(m=>m*mag).find(s=>s>=raw)||10*mag;
  return step*n;
}

/* ---------- fetchJSON: abortable, timed out, non-2xx rejects ---------- */
function fetchJSON(url,ms){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),ms||9000);
  return fetch(url,{signal:ctl.signal}).then(res=>{
    clearTimeout(to);
    if(!res.ok)throw new Error('HTTP '+res.status);
    return res.json();
  },err=>{clearTimeout(to);throw err;});
}

/* ---------- the one line-path builder for string-built marks ----------
   X takes the index, Y the value; nulls break the pen so gaps stay gaps. */
function sparkPath(arr,X,Y){
  let d='',pen=false;
  arr.forEach((v,i)=>{
    if(v==null||!isFinite(v)){pen=false;return;}
    d+=(pen?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1); pen=true;
  });
  return d;
}
/* the standard tiny sparkline (moved here from data.js) */
function sparkSVG(series,color){
  const w=100,h=20,mn=Math.min(...series),mx=Math.max(...series),rng=(mx-mn)||1;
  const X=i=>i/(series.length-1)*w, Y=v=>h-2-((v-mn)/rng)*(h-4);
  const d=sparkPath(series,X,Y);
  const lx=X(series.length-1).toFixed(1),ly=Y(series[series.length-1]).toFixed(1);
  return `<svg class="sparksvg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">`
    +`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`
    +`<circle cx="${lx}" cy="${ly}" r="1.7" fill="${color}"/></svg>`;
}

/* ---------- the glass: one geometry core ----------
   A tapered vessel — wide rim, narrow base, a canyon reservoir's
   cross-section. Coordinates are centred: base on y=0, rim at y=-h.
   Vessel area encodes capacity and the FILL level is solved so the
   filled area (not height) is the stored fraction: a reservoir holds
   less water per foot at depth, and the glass says so. */
function glassDims(cap,S){
  const h=Math.max(12,Math.min(48,Math.sqrt(cap)/16))*(S||1);
  return{h,a:h*0.52,b:h*0.28};
}
function glassPathD(h,a,b){
  const r=Math.min(3,b*0.6);
  return `M${-a},${-h} L${-b},${-r} Q${-b},0 ${-b+r},0 L${b-r},0 Q${b},0 ${b},${-r} L${a},${-h} Z`;
}
/* level y (up from base) at which filled trapezoid area = f × total area */
function fillLevel(f,h,a,b){
  if(f<=0)return 0;
  const f1=Math.min(f,1);
  let y=h*(Math.sqrt(b*b+(a*a-b*b)*f1)-b)/(a-b);
  if(f>1)y+=(f-1)*(a+b)*h/(2*a);
  return y;
}
let GLYPH_ID=0;
/* the glyph as a string, centred on the base point — wrap it in a
   <g transform> (map coordinates) or an <svg viewBox> (inline mark).
   {h, frac, col, a?, b?, stroke?, strokeW?, id?} */
function glassGlyph(o){
  const h=o.h, a=o.a!=null?o.a:h*0.42, b=o.b!=null?o.b:h*0.22;
  const d=glassPathD(h,a,b);
  const cid=o.id||('cwg'+(GLYPH_ID++));
  const y=Math.min(h,fillLevel(Math.max(0,o.frac||0),h,a,b));
  const stroke=o.stroke||PAL.GLASS.stroke, sw=o.strokeW||1;
  let s=`<defs><clipPath id="${cid}"><path d="${d}"/></clipPath></defs>`
    +`<path d="${d}" fill="${PAL.GLASS.well}" stroke="${stroke}" stroke-width="${sw}"/>`;
  if(y>0.3)s+=`<rect x="${(-a).toFixed(1)}" y="${(-y).toFixed(1)}" width="${(2*a).toFixed(1)}" height="${y.toFixed(1)}"`
    +` fill="${o.col}" opacity="0.95" clip-path="url(#${cid})"/>`;
  s+=`<path d="${d}" fill="none" stroke="${o.strokeHi||stroke}" stroke-width="${sw}"/>`;
  return s;
}

/* ---------- tooltip: one absolutely-positioned div per chart box ---------- */
function tooltip(container){
  let el=null;
  for(const c of container.children)if(c.classList&&c.classList.contains('cw-tip')){el=c;break;}
  if(!el){
    el=document.createElement('div');
    el.className='cw-tip';
    el.setAttribute('aria-hidden','true');
    try{if(getComputedStyle(container).position==='static')container.style.position='relative';}
    catch(e){container.style.position='relative';}
    container.appendChild(el);
  }
  return {
    el,
    show(px,py,html){
      el.innerHTML=html;
      el.style.display='block';
      const cw=container.clientWidth||0,w=el.offsetWidth||0,h=el.offsetHeight||0;
      let x=px+14; if(cw&&x+w>cw-4)x=Math.max(4,px-w-14);
      let y=py-h-10; if(y<2)y=py+16;
      el.style.left=Math.round(x)+'px';
      el.style.top=Math.round(Math.max(2,y))+'px';
    },
    hide(){el.style.display='none';}
  };
}

/* a visually-hidden live region, so keyboard/AT users hear what the
   crosshair is pointing at */
function srRegion(container){
  let el=null;
  for(const c of container.children)if(c.classList&&c.classList.contains('cw-sr')){el=c;break;}
  if(!el){
    el=document.createElement('div');
    el.className='cw-sr';
    el.setAttribute('aria-live','polite');
    container.appendChild(el);
  }
  return el;
}

/* ---------- crosshair: pointer + keyboard readout for x-indexed charts ----
   svg     the chart's <svg> (already in the DOM)
   o.count       number of steppable positions (keyboard)
   o.indexAt(vx) pointer x (viewBox units) -> index
   o.info(i)     -> {x, html, label} | null  (x in viewBox units; label is
                 the plain-text announcement for the live region)
   o.y0,o.y1     cursor rule extent (viewBox units)
   o.container   positioned ancestor for the tooltip (default svg parent)
   Works pre-layout: with a 0-width bounding rect, pointer coords fall back
   to 1:1 viewBox units instead of dividing by zero. */
function crosshair(svg,o){
  const vb=(svg.getAttribute('viewBox')||'0 0 100 100').split(/[\s,]+/).map(Number);
  const container=o.container||svg.parentNode;
  const tip=tooltip(container), sr=srRegion(container);
  const NS='http://www.w3.org/2000/svg';
  const line=document.createElementNS(NS,'line');
  line.setAttribute('class','cw-cursor');
  line.setAttribute('y1',o.y0);line.setAttribute('y2',o.y1);
  line.style.display='none';
  svg.appendChild(line);
  let cur=-1;
  const vxOf=ev=>{
    const r=svg.getBoundingClientRect();
    const sx=r.width>0?vb[2]/r.width:1;
    return (ev.clientX-r.left)*sx+vb[0];
  };
  function show(i,ev){
    const d=o.info(i);
    if(!d){hide();return;}
    cur=i;
    line.setAttribute('x1',d.x);line.setAttribute('x2',d.x);
    line.style.display='';
    const r=svg.getBoundingClientRect(), cr=container.getBoundingClientRect();
    const px=r.width>0?(d.x-vb[0])/vb[2]*r.width+(r.left-cr.left):d.x;
    const py=ev&&ev.clientY!=null?ev.clientY-cr.top:(r.height||vb[3])*0.25;
    tip.show(px,py,d.html);
    if(d.label!=null)sr.textContent=d.label;
  }
  function hide(){line.style.display='none';tip.hide();cur=-1;}
  svg.style.touchAction='pan-y';        /* horizontal drags read the chart,
                                           vertical still scrolls the page */
  svg.addEventListener('pointermove',ev=>show(o.indexAt(vxOf(ev)),ev));
  svg.addEventListener('pointerdown',ev=>show(o.indexAt(vxOf(ev)),ev));
  svg.addEventListener('pointerleave',hide);
  if(o.count>0){
    if(!svg.hasAttribute('tabindex'))svg.setAttribute('tabindex','0');
    svg.addEventListener('keydown',ev=>{
      if(ev.key==='Escape'){hide();return;}
      let i=null;
      if(ev.key==='ArrowLeft')i=cur<0?o.count-1:Math.max(0,cur-1);
      else if(ev.key==='ArrowRight')i=cur<0?0:Math.min(o.count-1,cur+1);
      else if(ev.key==='Home')i=0;
      else if(ev.key==='End')i=o.count-1;
      if(i==null)return;
      ev.preventDefault();
      show(i,null);
    });
    svg.addEventListener('blur',hide);
  }
  return {show,hide};
}

/* ---------- per-mark hover: bars, glyphs, ribbons ----------
   Delegated on `root`; any descendant with data-tip gets a tooltip on
   pointerover, tap, and keyboard focus. data-tip is small pre-escaped
   HTML built by the caller. */
function markHover(root,opts){
  opts=opts||{};
  const container=opts.container||root.closest('.lr-chart')||root.parentNode;
  const tip=tooltip(container), sr=srRegion(container);
  const find=t=>t&&t.closest?t.closest('[data-tip]'):null;
  const over=ev=>{
    const t=find(ev.target);
    if(!t||!root.contains(t)){tip.hide();return;}
    const r=t.getBoundingClientRect(), cr=container.getBoundingClientRect();
    tip.show(r.left-cr.left+r.width/2, r.top-cr.top, t.getAttribute('data-tip'));
    const lab=t.getAttribute('aria-label');
    if(lab)sr.textContent=lab;
  };
  root.addEventListener('pointerover',over);
  root.addEventListener('pointerdown',over);
  root.addEventListener('pointerout',ev=>{if(!find(ev.relatedTarget))tip.hide();});
  root.addEventListener('focusin',over);
  root.addEventListener('focusout',()=>tip.hide());
  root.addEventListener('keydown',ev=>{if(ev.key==='Escape')tip.hide();});
}

/* ---------- the table view every chart carries ----------
   {id?, summary?, caption?, head:[...], rows:[[...]], note?, open?}
   First cell of each row is the row header. Values are the caller's
   responsibility to escape where they come from generated data. */
function dataTable(o){
  const cell=(v,i)=>i===0?`<th scope="row">${v}</th>`:`<td>${v}</td>`;
  return `<details class="lr-table"${o.id?` id="${o.id}"`:''}${o.open?' open':''}>`
    +`<summary>${o.summary||'The numbers behind this chart'}</summary>`
    +`<table class="dtab">${o.caption?`<caption>${o.caption}</caption>`:''}`
    +`<thead><tr>${o.head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead>`
    +`<tbody>${o.rows.map(r=>`<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>`
    +(o.note?`<p class="dt-note">${o.note}</p>`:'')
    +`</details>`;
}

window.CW_CHARTS={PAL,esc,fmtAF,kaf,af,fmtTick,niceTop,fetchJSON,
  sparkPath,sparkSVG,glassDims,glassPathD,fillLevel,glassGlyph,
  tooltip,srRegion,crosshair,markHover,dataTable};
})();
