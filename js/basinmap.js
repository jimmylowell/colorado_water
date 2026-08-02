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
const HUE_OF={};
if(typeof G!=='undefined')G.nodes.forEach(n=>{if(n.hue)HUE_OF[n.id]=n.hue;});

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
   Laid out from the flow graph in data.js by longest-path rank.
   ===================================================================== */
function flow(bid,tap){
  if(typeof G==='undefined')return '';
  const inB=G.nodes.filter(n=>n.sys===bid);
  if(inB.length<2)return '';
  const has={}; inB.forEach(n=>has[n.id]=n);
  const internal=G.edges.filter(e=>has[e.f]&&has[e.t]);
  const exports_=G.edges.filter(e=>has[e.f]&&!has[e.t]);

  /* longest-path rank so every node sits downstream of its inputs */
  const rank={}; inB.forEach(n=>rank[n.id]=0);
  for(let pass=0;pass<inB.length;pass++){
    let moved=false;
    internal.forEach(e=>{ if(rank[e.t]<rank[e.f]+1){rank[e.t]=rank[e.f]+1;moved=true;} });
    if(!moved)break;
  }
  const maxR=Math.max(...inB.map(n=>rank[n.id]));
  const cols={}; inB.forEach(n=>(cols[rank[n.id]]=cols[rank[n.id]]||[]).push(n));
  Object.values(cols).forEach(c=>c.sort((a,b)=>a.y-b.y));
  const rows=Math.max(...Object.values(cols).map(c=>c.length));

  const W=700, padL=42, padR=104, padT=46, padB=42;
  const H=Math.max(210,padT+padB+rows*78);
  const X=r=>maxR?padL+r/maxR*(W-padL-padR):padL;
  const pos={};
  Object.keys(cols).forEach(r=>{
    const c=cols[r], span=H-padT-padB;
    c.forEach((n,i)=>{pos[n.id]={x:X(+r), y:padT+span*((i+0.5)/c.length)};});
  });

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
  exports_.forEach(e=>{
    const a=pos[e.f]; if(!a)return;
    const x2=W-padR+34;
    s+=`<path d="M${a.x.toFixed(1)},${a.y.toFixed(1)} L${x2.toFixed(1)},${a.y.toFixed(1)}"`
      +` fill="none" stroke="${hueOf(has[e.f])}" stroke-width="${wOf(e.q).toFixed(1)}"`
      +` stroke-linecap="round" opacity="0.4" stroke-dasharray="${e.dash?'5 4':'none'}"/>`
      +`<text class="bf-out" x="${(x2+5).toFixed(1)}" y="${(a.y-7).toFixed(1)}">`
      +`${e.tun?esc(e.tun):'leaves the'}</text>`
      +`<text class="bf-out" x="${(x2+5).toFixed(1)}" y="${(a.y+5).toFixed(1)}">`
      +`${e.tun?'(tunnel)':'basin →'}</text>`;
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
    s+=`<g transform="${g}"><title>${esc(n.l||n.id)}</title>${glyph}</g>`;
    if(lab)labels.push({
      pri:(n.k==='res'?3e6+(RESBY[n.res]?RESBY[n.res].cap:0):(n.k==='gage'?2e6:1e6)),
      x:p.x, y:p.y+(rank[n.id]%2===0?-13:21), t:lab,
      cls:'bf-lab'+(n.k==='res'&&mine.has(n.res)?' mine':'')});
  });
  /* neighbouring ranks sit closer than the labels are wide, so place by
     priority with a collision test and clamp everything inside the frame */
  const placed=[];
  labels.sort((a,b)=>b.pri-a.pri).forEach(L=>{
    const half=L.t.length*2.75;
    const x=Math.max(half+3,Math.min(W-half-3,L.x));
    const box=[x-half,L.y-8,x+half,L.y+3];
    if(placed.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]))return;
    placed.push(box);
    s+=`<text class="${L.cls}" x="${x.toFixed(1)}" y="${L.y.toFixed(1)}" text-anchor="middle">${esc(L.t)}</text>`;
  });
  s+=`<text class="bf-cap" x="6" y="16">HEADWATERS</text>`
    +`<text class="bf-cap" x="${W-6}" y="16" text-anchor="end">DOWNSTREAM →</text>`;
  return s+'</svg>';
}

window.CW_BASINMAP={render,flow};
})();
