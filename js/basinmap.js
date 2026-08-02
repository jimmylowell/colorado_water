"use strict";
/* =====================================================================
   BASIN MAP — one basin, filling the frame: its real boundary, the rivers
   that drain it, its reservoirs as glasses, the gages measuring it, and any
   tunnel crossing the line. Self-contained SVG (no d3, no viz.js), so the
   story can draw it without loading the statewide map engine.
   Reads BASIN_GEO / RIVERS / RES / G / MAP_TUNNELS / GAGE_META from the
   baked data; live flows from window.CW_LIVEQ when present.
   ===================================================================== */
(function(){

/* source-node hue lookup, rebuilt from the flow graph (NODE lives in viz.js) */
const HUE_OF={}, NODE_ALL={};
if(typeof G!=='undefined')G.nodes.forEach(n=>{if(n.hue)HUE_OF[n.id]=n.hue; NODE_ALL[n.id]=n;});
/* Which side of the Divide a node sits on. Because a west-draining basin is
   mirrored, LEFT is west and RIGHT is east in every one of these diagrams —
   so water entering or leaving can be routed by compass alone. */
const sideOf=id=>{const n=NODE_ALL[id]; return n&&n.side?n.side:null;};
/* basin name trimmed to fit a margin label */
function shortBasin(id){
  const b=(typeof BASINS!=='undefined')&&BASINS.find(x=>x.id===id);
  return b?b.n.replace(' headwaters','').replace(' & White','').replace(' & Dolores',''):'';
}
const basinOf=id=>{const n=NODE_ALL[id]; return n?shortBasin(n.sys):'';};

function bboxOf(rings){
  let x0=180,y0=90,x1=-180,y1=-90;
  rings.forEach(r=>r.forEach(p=>{
    if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1];
  }));
  return [x0,y0,x1,y1];
}
/* fit one basin to the frame, correcting longitude for latitude so shapes
   aren't stretched the way a raw lon/lat plot would stretch them */
function project(bid,W,H,pad){
  const rings=BASIN_GEO[bid];
  const [x0,y0,x1,y1]=bboxOf(rings);
  const k=Math.cos(((y0+y1)/2)*Math.PI/180);
  const fx=lon=>lon*k, fy=lat=>-lat;
  const ax0=fx(x0),ax1=fx(x1),ay0=fy(y1),ay1=fy(y0);
  const w=(ax1-ax0)||1, h=(ay1-ay0)||1;
  const s=Math.min((W-2*pad)/w,(H-2*pad)/h);
  const ox=(W-w*s)/2-ax0*s, oy=(H-h*s)/2-ay0*s;
  return {x:lon=>fx(lon)*s+ox, y:lat=>fy(lat)*s+oy, s};
}
const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* a glass glyph whose area tracks capacity and whose fill level is storage */
function glass(P,r,scale){
  const cx=P.x(r.lon), cy=P.y(r.lat);
  const h=Math.max(11,Math.min(34,Math.sqrt(r.cap)/scale));
  const rim=h*0.40, base=h*0.21;
  const frac=Math.max(0,Math.min(1,stoAt(r,NOW)/r.cap));
  const top=cy-h/2, bot=cy+h/2;
  const col=r.fc?'#8DA4B0':ramp(pmAt(r,NOW));
  const path=`M${(cx-rim).toFixed(1)},${top.toFixed(1)} L${(cx-base).toFixed(1)},${bot.toFixed(1)} `
    +`L${(cx+base).toFixed(1)},${bot.toFixed(1)} L${(cx+rim).toFixed(1)},${top.toFixed(1)} Z`;
  const fillTop=(bot-(bot-top)*frac).toFixed(1);
  const cid='bg'+r.id;
  return {cx,cy,h,svg:`<g class="bm-res" data-res="${r.id}" tabindex="0" role="button"`
      +` aria-label="${esc(r.n)}, ${r.fc?'flood control':pmAt(r,NOW)+'% of normal'}">`
      +`<title>${esc(r.n)} — ${r.fc?'flood control pool':pmAt(r,NOW)+'% of normal'}</title>`
      +`<defs><clipPath id="${cid}"><path d="${path}"/></clipPath></defs>`
      +`<path d="${path}" fill="#0A1620" stroke="#6d8ea3" stroke-width="1"/>`
      +`<rect x="${(cx-rim).toFixed(1)}" y="${fillTop}" width="${(rim*2).toFixed(1)}" height="${h.toFixed(1)}"`
      +` fill="${col}" clip-path="url(#${cid})"/>`
      +`<path d="${path}" fill="none" stroke="#8fb0c4" stroke-width="1"/></g>`};
}

function render(bid,tap){
  if(typeof BASIN_GEO==='undefined'||!BASIN_GEO[bid])return '';
  const W=700,H=430,PAD=26;
  const P=project(bid,W,H,PAD);
  const b=BASINS.find(x=>x.id===bid);
  const hue=(typeof BASIN_HUE!=='undefined'&&BASIN_HUE[bid])||'#6d8391';
  const mine=new Set([].concat(tap&&tap.res||[],tap&&tap.fcres||[]));
  let s=`<svg class="basinmap-detail" viewBox="0 0 ${W} ${H}" role="img"`
    +` aria-label="${esc(b.n)} basin: its rivers, reservoirs and streamgages.">`;

  /* the basin itself */
  const d=BASIN_GEO[bid].map(r=>'M'+r.map(p=>P.x(p[0]).toFixed(1)+','+P.y(p[1]).toFixed(1)).join('L')+'Z').join(' ');
  s+=`<path d="${d}" fill="${hue}" fill-opacity="0.07" stroke="${hue}" stroke-opacity="0.65" stroke-width="1.2"/>`;

  /* rivers draining it, in their source colours */
  const inB=[];
  RIVERS.forEach(rv=>{ if(rv.b!==bid)return;
    const hx=(rv.src&&HUE_OF[rv.src])||rv.hue||'#2E7E96';
    const pts=rv.p.map(p=>P.x(p[1]).toFixed(1)+','+P.y(p[0]).toFixed(1));
    s+=`<path d="M${pts.join('L')}" fill="none" stroke="${hx}" stroke-width="${(rv.w*1.15).toFixed(1)}"`
      +` stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
    inB.push({rv,pts});
  });

  /* tunnels that cross this basin's line — water arriving or leaving. Their
     labels join the same collision pass as everything else (below). */
  const tunLabels=[];
  if(typeof MAP_TUNNELS!=='undefined')MAP_TUNNELS.forEach(tn=>{
    if(tn.fb!==bid&&tn.tb!==bid)return;
    const pt=q=>Array.isArray(q)?[P.x(q[1]),P.y(q[0])]:(RESBY[q]?[P.x(RESBY[q].lon),P.y(RESBY[q].lat)]:null);
    const a=pt(tn.f),c=pt(tn.t); if(!a||!c)return;
    const leaving=tn.fb===bid;
    s+=`<path d="M${a[0].toFixed(1)},${a[1].toFixed(1)} L${c[0].toFixed(1)},${c[1].toFixed(1)}"`
      +` fill="none" stroke="${tn.hue}" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.9"><title>${esc(tn.n)}</title></path>`;
    tunLabels.push({x:(a[0]+c[0])/2, y:(a[1]+c[1])/2-5,
      t:tn.n+(leaving?' ↗ out':' ↘ in'), cls:'bm-tun', cw:5.0, pri:-500});
  });

  /* gages — what the river is actually doing today */
  if(typeof GAGE_META!=='undefined'){
    const liveQ=window.CW_LIVEQ||{};
    Object.keys(GAGE_META).forEach(site=>{
      const m=GAGE_META[site]; if(m.basin!==bid)return;
      const gx=P.x(m.lon),gy=P.y(m.lat), q=liveQ[site];
      s+=`<g class="bm-gage"><title>${esc(m.name)} — ${q!=null?Math.round(q)+' cfs now':'USGS '+site}</title>`
        +`<path d="M${gx.toFixed(1)},${(gy-5).toFixed(1)} L${(gx+5).toFixed(1)},${gy.toFixed(1)} `
        +`L${gx.toFixed(1)},${(gy+5).toFixed(1)} L${(gx-5).toFixed(1)},${gy.toFixed(1)} Z"`
        +` fill="${q!=null?'#00D6E6':'#0A1620'}" stroke="#0A1620" stroke-width="1"/>`;
      if(q!=null)s+=`<text class="bm-q" x="${gx.toFixed(1)}" y="${(gy+15).toFixed(1)}" text-anchor="middle">${Math.round(q).toLocaleString('en-US')} cfs</text>`;
      s+=`</g>`;
    });
  }

  /* reservoirs, biggest first so labels favour them */
  const res=RES.filter(r=>r.b===bid).sort((a,c)=>c.cap-a.cap);
  const maxCap=res.length?res[0].cap:1;
  const scale=Math.sqrt(maxCap)/32;
  const cand=[];   /* every label competes in ONE collision pass */
  res.forEach((r,i)=>{
    const g=glass(P,r,scale);
    s+=g.svg;
    const isMine=mine.has(r.id);
    if(i<7||isMine)cand.push({pri:(isMine?1e9:0)+r.cap, x:g.cx, y:g.cy+g.h/2+11,
      t:r.n.replace(/ (Reservoir|Res\.)$/,''), cls:'bm-lab'+(isMine?' mine':''), cw:5.3});
  });
  /* river names on the biggest rivers — lower priority than reservoirs, so a
     river label yields rather than sitting on top of a reservoir's name */
  inB.sort((a,c)=>c.rv.w-a.rv.w).slice(0,3).forEach(({rv,pts})=>{
    const mid=pts[Math.floor(pts.length/2)].split(',');
    cand.push({pri:-1000+rv.w, x:+mid[0], y:+mid[1]-6, t:rv.n, cls:'bm-riv', cw:5.6});
  });
  tunLabels.forEach(t=>cand.push(t));
  const placed=[];
  cand.sort((a,c)=>c.pri-a.pri).forEach(L=>{
    const half=L.t.length*L.cw/2;
    /* keep labels inside the frame */
    const x=Math.max(half+4,Math.min(W-half-4,L.x));
    const box=[x-half,L.y-8,x+half,L.y+4];
    if(placed.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]))return;
    placed.push(box);
    s+=`<text class="${L.cls}" x="${x.toFixed(1)}" y="${L.y.toFixed(1)}" text-anchor="middle">${esc(L.t)}</text>`;
  });

  return s+'</svg>';
}

/* =====================================================================
   FLOW — the same basin as a step-down: headwaters on the left, then every
   reservoir, gage and confluence the water passes through, to where it
   leaves the basin. Ribbon width tracks how much water each reach carries.
   x = longest-path rank from the flow graph in data.js.
   y = ELEVATION ORDER — see below.
   ===================================================================== */
/* Vertical position is the real physical staircase: every node is placed in
   order of how high it actually sits, so the diagram falls the way the water
   does. The spacing is deliberately NOT to scale — an honest linear axis would
   crush a basin's dozen lower reservoirs into a stripe while one headwater sat
   alone at the top — so the ORDER is exact and the gaps are not. Elevations
   come from js/normals.js: RES_ELEV (CDSS live pool elevation where a
   reservoir is telemetered, else the 3DEP water surface) and GAGE_META.elev
   (the surveyed USGS gage datum). */
function elevOf(n){
  if(n.k==='res'&&typeof RES_ELEV!=='undefined'&&RES_ELEV[n.res]!=null){
    const v=RES_ELEV[n.res];
    return typeof v==='number'?v:(v.ft!=null?v.ft:null);
  }
  if(n.k==='gage'&&typeof GAGE_META!=='undefined'&&GAGE_META[n.gage]&&GAGE_META[n.gage].elev!=null)
    return GAGE_META[n.gage].elev;
  return null;
}
const ftLab=v=>Math.round(v).toLocaleString('en-US')+' ft';

function flow(bid,tap){
  if(typeof G==='undefined')return '';
  const inB=G.nodes.filter(n=>n.sys===bid);
  if(inB.length<2)return '';
  const has={}; inB.forEach(n=>has[n.id]=n);
  const internal=G.edges.filter(e=>has[e.f]&&has[e.t]);
  const exports_=G.edges.filter(e=>has[e.f]&&!has[e.t]);
  /* Water ARRIVING from another basin — the transmountain tunnels. Without
     these the South Platte's biggest reservoirs appear to fill from nothing. */
  const imports_=G.edges.filter(e=>!has[e.f]&&has[e.t]&&e.tun);

  /* longest-path rank so every node sits downstream of its inputs */
  const rank={}; inB.forEach(n=>rank[n.id]=0);
  for(let pass=0;pass<inB.length;pass++){
    let moved=false;
    internal.forEach(e=>{ if(rank[e.t]<rank[e.f]+1){rank[e.t]=rank[e.f]+1;moved=true;} });
    if(!moved)break;
  }
  const maxR=Math.max(...inB.map(n=>rank[n.id]));

  /* --- place EVERY node on the staircase ---
     Reservoirs and gages carry a measured surface elevation. Confluences,
     river points and headwater markers do not, and neither do the reservoirs
     whose height we could not verify — so they are inferred from the one
     physical fact the river guarantees: water only runs downhill, so a node
     sits BELOW everything upstream of it and ABOVE everything downstream.
     Bracket it between the nearest measured ancestor and descendant. (An
     earlier version averaged immediate neighbours instead, which collapsed on
     a headwater reservoir with nothing measured on either side and dropped
     Homestake — the highest reservoir in its basin — into the middle.)
     Nothing here is ever LABELLED: an inferred node shows no number. */
  const est={}, measured={};
  inB.forEach(n=>{const e=elevOf(n); if(e!=null){est[n.id]=e; measured[n.id]=1;}});
  const nMeasured=Object.keys(measured).length;
  const useElev=nMeasured>=3;
  const up={}, down={};
  inB.forEach(n=>{up[n.id]=[]; down[n.id]=[];});
  internal.forEach(e=>{down[e.f].push(e.t); up[e.t].push(e.f);});
  const nearestMeasured=(startId,adj,pick)=>{
    const seen={}, q=adj[startId].slice(); let best=null;
    while(q.length){
      const id=q.shift(); if(seen[id])continue; seen[id]=1;
      if(measured[id]){best=best==null?est[id]:pick(best,est[id]); continue;}
      (adj[id]||[]).forEach(x=>{if(!seen[x])q.push(x);});
    }
    return best;
  };
  const mv=Object.keys(measured).map(k=>est[k]);
  const hi=mv.length?Math.max(...mv):1, lo=mv.length?Math.min(...mv):0;
  inB.forEach(n=>{
    if(measured[n.id])return;
    const a=nearestMeasured(n.id,up,Math.min);     /* lowest thing above it */
    const b=nearestMeasured(n.id,down,Math.max);   /* highest thing below it */
    /* Start from where the node sits along the river — headwaters high, exit
       low — then CLAMP that guess into the bracket the graph proves. A bare
       bracket is too weak on its own: Homestake's only measured relation is a
       gage 4,000 ft below it, so "somewhere above 6,122 ft" would have parked
       the basin's highest reservoir just above that gage. */
    let v=hi-(hi-lo)*(maxR?rank[n.id]/maxR:0.5);
    if(a!=null)v=Math.min(v,a-40);
    if(b!=null)v=Math.max(v,b+40);
    if(a!=null&&b!=null&&a-40<b+40)v=(a+b)/2;      /* bracket too tight to split */
    est[n.id]=v;
    /* a source is above what it feeds; an exit below what feeds it */
    if(n.k==='src')est[n.id]+=250;
    else if(n.k==='exit')est[n.id]-=250;
  });

  /* A West Slope basin drains toward Utah, so its diagram runs RIGHT to LEFT —
     headwaters on the right, the state line on the left — matching both the
     compass and the statewide flow view, where west-slope exits already sit at
     the left edge. Reading a Yampa or Gunnison step-down left-to-right meant
     reading it backwards against the map beside it. `side` comes from the flow
     graph in data.js. */
  const flowsWest=inB.filter(n=>n.side==='w').length>inB.length/2;
  const mySide=flowsWest?'w':'e';
  /* An export leaves toward its destination's side, an import arrives from its
     origin's side — so a tunnel out of the Colorado headwaters runs RIGHT, east
     under the Divide, while the river itself carries on LEFT toward Utah. Both
     used to be drawn off the downstream edge, which pointed the tunnels feeding
     Denver back at Utah. */
  const outSideOf=e=>sideOf(e.t)||mySide;
  const inSideOf=e=>sideOf(e.f)||(flowsWest?'e':'w');
  const usesLeft=exports_.some(e=>outSideOf(e)==='w')||imports_.some(e=>inSideOf(e)==='w');
  const usesRight=exports_.some(e=>outSideOf(e)==='e')||imports_.some(e=>inSideOf(e)==='e');
  const W=700, padT=52, padB=44;
  const padLeft=usesLeft?104:52, padRight=usesRight?104:52;
  const xHead=flowsWest?W-padRight:padLeft, xTail=flowsWest?padLeft:W-padRight;
  const X=r=>xHead+(maxR?r/maxR:0)*(xTail-xHead);
  const pos={};
  let H, order=null;
  if(useElev){
    /* one slot per node, highest first; ties broken by flow order */
    order=inB.slice().sort((a,b)=>(est[b.id]-est[a.id])||(rank[a.id]-rank[b.id]));
    const span=Math.min(760,Math.max(150,(order.length-1)*31));
    H=padT+padB+span;
    order.forEach((n,i)=>{
      pos[n.id]={x:X(rank[n.id]), y:padT+(order.length>1?span*i/(order.length-1):span/2)};
    });
  }else{
    /* no elevations baked yet — the original rank-column layout */
    const cols={}; inB.forEach(n=>(cols[rank[n.id]]=cols[rank[n.id]]||[]).push(n));
    Object.values(cols).forEach(c=>c.sort((a,b)=>a.y-b.y));
    const rows=Math.max(...Object.values(cols).map(c=>c.length));
    H=Math.max(210,padT+padB+rows*78);
    Object.keys(cols).forEach(r=>{
      const c=cols[r], sp=H-padT-padB;
      c.forEach((n,i)=>{pos[n.id]={x:X(+r), y:padT+sp*((i+0.5)/c.length)};});
    });
  }

  const maxQ=Math.max(1,...internal.concat(exports_).map(e=>e.q||0));
  const wOf=q=>1.6+Math.sqrt((q||0)/maxQ)*13;
  const hueOf=n=>n.hue||HUE_OF[n.id]||'#3E7C93';
  let s=`<svg class="basinflow" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="How water steps down through the ${esc(BASINS.find(x=>x.id===bid).n)} basin, from headwaters to where it leaves.">`;

  /* ribbons first, so nodes sit on top */
  internal.forEach(e=>{
    const a=pos[e.f],b=pos[e.t]; if(!a||!b)return;
    const mx=(a.x+b.x)/2;
    s+=`<path d="M${a.x.toFixed(1)},${a.y.toFixed(1)} C${mx.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}"`
      +` fill="none" stroke="${hueOf(has[e.f])}" stroke-width="${wOf(e.q).toFixed(1)}"`
      +` stroke-linecap="round" opacity="0.55"><title>${esc(has[e.f].l||e.f)} → ${esc(has[e.t].l||e.t)} · ${(e.q||0).toLocaleString('en-US')} cfs</title></path>`;
  });
  /* water leaving the basin */
  /* Water leaving the basin, off whichever edge its destination lies on. The
     label hugs the frame: run it from the ribbon end instead and the longer
     tunnel names overflow. */
  const edgeGeom=west=>west
    ? {x2:padLeft-22, tx:4, anc:'start'}
    : {x2:W-padRight+22, tx:W-4, anc:'end'};
  exports_.forEach(e=>{
    const a=pos[e.f]; if(!a)return;
    const west=outSideOf(e)==='w', g=edgeGeom(west);
    s+=`<path d="M${a.x.toFixed(1)},${a.y.toFixed(1)} L${g.x2.toFixed(1)},${a.y.toFixed(1)}"`
      +` fill="none" stroke="${hueOf(has[e.f])}" stroke-width="${wOf(e.q).toFixed(1)}"`
      +` stroke-linecap="round" opacity="0.4" stroke-dasharray="${e.dash?'5 4':'none'}"/>`
      +`<text class="bf-out" text-anchor="${g.anc}" x="${g.tx}" y="${(a.y-7).toFixed(1)}">`
      +`${e.tun?esc(e.tun):'leaves the'}</text>`
      +`<text class="bf-out" text-anchor="${g.anc}" x="${g.tx}" y="${(a.y+5).toFixed(1)}">`
      /* naming the destination beats repeating "under the Divide" six times */
      +`${e.tun?(west?'← '+esc(basinOf(e.t)):esc(basinOf(e.t))+' →'):(west?'← basin':'basin →')}</text>`;
  });
  /* Water arriving from the other side of the Divide. */
  imports_.forEach(e=>{
    const b=pos[e.t]; if(!b)return;
    const west=inSideOf(e)==='w', g=edgeGeom(west);
    s+=`<path d="M${g.x2.toFixed(1)},${b.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}"`
      +` fill="none" stroke="${hueOf(has[e.t])}" stroke-width="${wOf(e.q).toFixed(1)}"`
      +` stroke-linecap="round" opacity="0.45" stroke-dasharray="5 4"/>`
      +`<text class="bf-out" text-anchor="${g.anc}" x="${g.tx}" y="${(b.y-7).toFixed(1)}">`
      +`${esc(e.tun)}</text>`
      +`<text class="bf-out" text-anchor="${g.anc}" x="${g.tx}" y="${(b.y+5).toFixed(1)}">`
      +`${west?esc(basinOf(e.f))+' →':'← '+esc(basinOf(e.f))}</text>`;
  });

  const liveQ=window.CW_LIVEQ||{};
  const mine=new Set([].concat(tap&&tap.res||[]));
  const labels=[];
  inB.forEach(n=>{
    const p=pos[n.id]; if(!p)return;
    const g=`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
    let glyph='', lab=n.l||'';
    if(n.k==='res'){
      const r=RESBY[n.res];
      const col=r?(r.fc?'#8DA4B0':ramp(pmAt(r,NOW))):'#8DA4B0';
      const frac=r?Math.max(0,Math.min(1,stoAt(r,NOW)/r.cap)):0.5;
      const w=13,h=17,top=-h/2,bot=h/2,rimw=w/2,basew=w/2*0.55;
      const path=`M${-rimw},${top} L${-basew},${bot} L${basew},${bot} L${rimw},${top} Z`;
      const cid='bf'+n.id;
      glyph=`<defs><clipPath id="${cid}"><path d="${path}"/></clipPath></defs>`
        +`<path d="${path}" fill="#0A1620" stroke="#8fb0c4" stroke-width="1"/>`
        +`<rect x="${-rimw}" y="${(bot-h*frac).toFixed(1)}" width="${w}" height="${h}" fill="${col}" clip-path="url(#${cid})"/>`
        +`<path d="${path}" fill="none" stroke="${mine.has(n.res)?'#EDE6D6':'#8fb0c4'}" stroke-width="${mine.has(n.res)?1.6:1}"/>`;
      if(r&&!r.fc)lab=(n.l||'').replace(/ (Res\.|Reservoir)$/,'')+' · '+pmAt(r,NOW)+'%';
      else lab=(n.l||'').replace(/ (Res\.|Reservoir)$/,'');
    }else if(n.k==='gage'){
      const q=liveQ[n.gage];
      glyph=`<path d="M0,-6 L6,0 L0,6 L-6,0 Z" fill="${q!=null?'#00D6E6':'#0A1620'}" stroke="#0A1620" stroke-width="1"/>`;
      lab=(n.l||'').replace(/^.*? (nr|at|near) /i,'@ ');
      if(q!=null)lab+=' · '+Math.round(q).toLocaleString('en-US')+' cfs';
    }else if(n.k==='src'){
      glyph=`<circle r="5" fill="${hueOf(n)}"/>`;
      lab=(n.l||'').replace(/ headwaters$/,'');
    }else{
      glyph=`<circle r="3" fill="#5C7484"/>`;
      lab='';
    }
    const mEl=measured[n.id]?est[n.id]:null;
    s+=`<g transform="${g}"><title>${esc(n.l||n.id)}${mEl!=null?' — '+ftLab(mEl):''}</title>${glyph}</g>`;
    if(!lab)return;
    /* In the staircase each node owns its own row, so labels sit BESIDE the
       glyph rather than above/below it — stacking them vertically would run a
       two-line label straight into the row above. Labels lean away from the
       downstream edge so they never collide with the "leaves the basin"
       arrows; on a west-flowing basin that edge is the left one. */
    const atTail=rank[n.id]===maxR;
    const toLeft=useElev&&(flowsWest?!atTail:atTail);
    labels.push({
      pri:(n.k==='res'?3e6+(RESBY[n.res]?RESBY[n.res].cap:0):(n.k==='gage'?2e6:1e6)),
      x:useElev?p.x+(toLeft?-11:11):p.x,
      y:useElev?p.y-1:p.y+(rank[n.id]%2===0?-13:21),
      anchor:useElev?(toLeft?'end':'start'):'middle',
      t:lab,
      /* the height goes on a second line — the whole point of the layout, but
         not worth doubling the label's width for */
      sub:(useElev&&mEl!=null)?ftLab(mEl):'',
      cls:'bf-lab'+(n.k==='res'&&mine.has(n.res)?' mine':'')});
  });
  /* neighbouring ranks sit closer than the labels are wide, so place by
     priority with a collision test and clamp everything inside the frame */
  const placed=[];
  labels.sort((a,b)=>b.pri-a.pri).forEach(L=>{
    const wid=Math.max(L.t.length,L.sub.length)*5.5;
    let x=L.x, x0, x1;
    if(L.anchor==='middle'){x=Math.max(wid/2+3,Math.min(W-wid/2-3,x)); x0=x-wid/2; x1=x+wid/2;}
    else if(L.anchor==='end'){x=Math.max(wid+3,x); x0=x-wid; x1=x;}
    else {x=Math.min(W-wid-3,x); x0=x; x1=x+wid;}
    const box=[x0,L.y-8,x1,L.y+(L.sub?13:3)];
    if(placed.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]))return;
    placed.push(box);
    s+=`<text class="${L.cls}" x="${x.toFixed(1)}" y="${L.y.toFixed(1)}" text-anchor="${L.anchor}">${esc(L.t)}`
      +(L.sub?`<tspan class="bf-elev" x="${x.toFixed(1)}" dy="10">${esc(L.sub)}</tspan>`:'')
      +`</text>`;
  });
  s+=flowsWest
    ? `<text class="bf-cap" x="${W-6}" y="18" text-anchor="end">HEADWATERS</text>`
      +`<text class="bf-cap" x="6" y="18">← DOWNSTREAM</text>`
    : `<text class="bf-cap" x="${padLeft-14}" y="18">HEADWATERS</text>`
      +`<text class="bf-cap" x="${W-6}" y="18" text-anchor="end">DOWNSTREAM →</text>`;
  if(useElev){
    /* This used to be a full-height rotated axis down one margin. Once tunnels
       started leaving on the side opposite the river, BOTH margins carry exit
       labels and there was nowhere for it to stand without overlapping them —
       so the note moved into the caption row instead. No ticks either way: a
       tick would promise a linear height this axis does not have. */
    s+=`<text class="bf-cap" x="${(W/2).toFixed(0)}" y="18" text-anchor="middle">`
      +`↑ HIGHER · ORDER, NOT TO SCALE</text>`;
  }
  return s+'</svg>';
}

/* How far the water actually falls crossing this basin — the highest and
   lowest MEASURED points in its flow graph. Used by the story's prose so the
   number beside the step-down comes from the same data the diagram is drawn
   from. Returns null if too little of the basin is measured to be meaningful. */
function drop(bid){
  if(typeof G==='undefined')return null;
  const pts=G.nodes.filter(n=>n.sys===bid)
    .map(n=>({n,e:elevOf(n)})).filter(o=>o.e!=null);
  if(pts.length<2)return null;
  const hi=pts.reduce((a,b)=>b.e>a.e?b:a), lo=pts.reduce((a,b)=>b.e<a.e?b:a);
  if(hi.e-lo.e<200)return null;
  const nm=o=>(o.n.l||'').replace(/ (Res\.|Reservoir)$/,'').replace(/^.*? (nr|at|near) /i,'');
  return {hi:hi.e,lo:lo.e,drop:hi.e-lo.e,hiName:nm(hi),loName:nm(lo)};
}

window.CW_BASINMAP={render,flow,drop};
})();
