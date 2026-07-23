"use strict";
const NODE=Object.fromEntries(G.nodes.map(n=>[n.id,n]));
const RESNODE={}; G.nodes.forEach(n=>{if(n.k==='res')RESNODE[n.res]=n.id;});

/* =====================================================================
   HELPERS
   ===================================================================== */
const fmt=n=>Math.round(n).toLocaleString('en-US');
const kaf=n=>(n/1000).toFixed(n<10000?1:0);
function hex2rgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function rgb2css(c){return 'rgb('+c.map(v=>Math.round(Math.max(0,Math.min(255,v)))).join(',')+')';}
const RAMPS=[[0,'#B4321E'],[55,'#D9552C'],[75,'#D99A3C'],[90,'#C9C08A'],[100,'#4FD6A0'],[112,'#35C2E8']];
function ramp(p){
  if(p<=RAMPS[0][0])return RAMPS[0][1];
  for(let i=1;i<RAMPS.length;i++){
    if(p<=RAMPS[i][0]){
      const[p0,c0]=RAMPS[i-1],[p1,c1]=RAMPS[i],t=(p-p0)/(p1-p0);
      const a=hex2rgb(c0),b=hex2rgb(c1);
      return rgb2css([0,1,2].map(j=>a[j]+(b[j]-a[j])*t));
    }
  }
  return RAMPS[RAMPS.length-1][1];
}
const GEO={n:41.0,s:37.0,w:-109.05,e:-102.05};
const PAD={l:56,r:56,t:64,b:64};
const IW=MAPW-PAD.l-PAD.r, IH=MAPH-PAD.t-PAD.b;
const px=lon=>PAD.l+(lon-GEO.w)/(GEO.e-GEO.w)*IW;
const py=lat=>PAD.t+(GEO.n-lat)/(GEO.n-GEO.s)*IH;
const geoLine=d3.line().x(p=>px(p[1])).y(p=>py(p[0])).curve(d3.curveCatmullRom.alpha(0.6));

/* =====================================================================
   STATE
   ===================================================================== */
const state={view:'map',basin:'all',mode:'blend',minCap:0,measOnly:false,mi:NOW,
  selected:null,selectedNode:null,live:{},playing:null};

/* =====================================================================
   COMPOSITION SOLVER
   ===================================================================== */
let COMP={},FLOWQ={};
(function solve(){
  const inE={};G.nodes.forEach(n=>inE[n.id]=[]);
  G.edges.forEach(e=>{if(inE[e.t])inE[e.t].push(e);});
  const done=new Set();
  for(let p=0;p<80&&done.size<G.nodes.length;p++){
    for(const n of G.nodes){
      if(done.has(n.id))continue;
      const ins=inE[n.id];
      if(!ins.length||n.k==='src'){COMP[n.id]={[n.id]:n.q||10};FLOWQ[n.id]=n.q||10;done.add(n.id);continue;}
      if(ins.every(e=>done.has(e.f))){
        const c={};let Q=0;
        for(const e of ins){
          const from=COMP[e.f],T=FLOWQ[e.f]||1,sc=(e.q||1)/T;
          for(const s in from)c[s]=(c[s]||0)+from[s]*sc;
          Q+=e.q||1;
        }
        COMP[n.id]=c;FLOWQ[n.id]=Q;done.add(n.id);
      }
    }
  }
})();
function blendColour(c){
  const parts=Object.entries(c).filter(([s])=>NODE[s]&&NODE[s].hue);
  if(!parts.length)return[150,165,175];
  const T=parts.reduce((s,[,w])=>s+w,0);
  let lin=[0,0,0],peak=0,dom=null,dW=-1;
  for(const[s,w]of parts){
    const rgb=hex2rgb(NODE[s].hue),f=w/T;
    for(let i=0;i<3;i++)lin[i]+=Math.pow(rgb[i]/255,2.2)*f;
    peak+=Math.max(...rgb)/255*f;
    if(w>dW){dW=w;dom=s;}
  }
  let out=lin.map(v=>Math.pow(Math.max(0,v),1/2.2)*255);
  const mx=Math.max(...out)/255;
  if(mx>0.01){const k=Math.min(1.55,peak/mx);out=out.map(v=>v*k);}
  const dc=hex2rgb(NODE[dom].hue);
  out=out.map((v,i)=>v*0.66+dc[i]*0.34);
  const wh=0.30*(1-dW/T);
  return out.map(v=>v*(1-wh)+235*wh);
}
function sortedParts(c){
  return Object.entries(c).filter(([s])=>NODE[s]&&NODE[s].hue)
    .sort((a,b)=>G.nodes.findIndex(n=>n.id===a[0])-G.nodes.findIndex(n=>n.id===b[0]));
}
function resColour(rid){
  const nid=RESNODE[rid];
  if(nid)return rgb2css(blendColour(COMP[nid]));
  return RESHUE_FALLBACK[rid]||'#4C7C8E';
}
function passesFilter(r){
  if(r.cap<state.minCap)return false;
  if(state.measOnly&&r.c!=='obs')return false;
  return true;
}
function radiusFor(cap){return Math.max(5.5,Math.min(30,Math.sqrt(cap)/26));}
function medianFullPct(r,mi){
  const pm=pmAt(r,mi),sto=stoAt(r,mi);
  if(!pm)return 0;
  return Math.min(140,(sto/(pm/100))/r.cap*100);
}

/* =====================================================================
   D3 SCAFFOLD: svg > g.camera (zoomable) — zoom fixes click handling,
   because d3.zoom marks post-drag clicks as defaultPrevented.
   ===================================================================== */
const svg=d3.select('#viz');
const camera=svg.append('g').attr('class','camera');
const zoom=d3.zoom().scaleExtent([1,14])
  .on('zoom',ev=>{
    camera.attr('transform',ev.transform);
    const k=ev.transform.k;
    svg.attr('data-z', k>=3.2?'3':(k>=1.7?'2':'1'));
  });
svg.call(zoom).on('dblclick.zoom',null);
function viewDims(){return state.view==='map'?[MAPW,MAPH]:[FW,FH];}
function setViewBox(){const[w,h]=viewDims();svg.attr('viewBox',`0 0 ${w} ${h}`);
  zoom.translateExtent([[-w*0.15,-h*0.15],[w*1.15,h*1.15]]);}
function zoomReset(animate){
  const t=animate?svg.transition().duration(650).ease(d3.easeCubicOut):svg;
  t.call(zoom.transform,d3.zoomIdentity);
}
function zoomToBBox(x0,y0,x1,y1){
  const[w,h]=viewDims();
  const k=Math.max(1,Math.min(12,0.86*Math.min(w/(x1-x0),h/(y1-y0))));
  const tx=w/2-k*(x0+x1)/2, ty=h/2-k*(y0+y1)/2;
  svg.transition().duration(750).ease(d3.easeCubicInOut)
     .call(zoom.transform,d3.zoomIdentity.translate(tx,ty).scale(k));
}
d3.select('#z-in').on('click',()=>svg.transition().duration(250).call(zoom.scaleBy,1.4));
d3.select('#z-out').on('click',()=>svg.transition().duration(250).call(zoom.scaleBy,1/1.4));
d3.select('#z-rst').on('click',()=>zoomReset(true));

function basinBBoxMap(b){
  const pts=[];
  RES.filter(r=>r.b===b).forEach(r=>pts.push([px(r.lon),py(r.lat)]));
  RIVERS.filter(rv=>rv.b===b).forEach(rv=>rv.p.forEach(p=>pts.push([px(p[1]),py(p[0])])));
  if(!pts.length)return null;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),m=46;
  return[Math.min(...xs)-m,Math.min(...ys)-m,Math.max(...xs)+m,Math.max(...ys)+m];
}
function basinBBoxFlow(b){
  const ns=G.nodes.filter(n=>n.sys===b);
  if(!ns.length)return null;
  const xs=ns.map(n=>n.x),ys=ns.map(n=>n.y),m=70;
  return[Math.min(...xs)-m,Math.min(...ys)-m,Math.max(...xs)+m,Math.max(...ys)+m];
}
function zoomToBasin(){
  if(state.basin==='all'){zoomReset(true);return;}
  const bb=state.view==='map'?basinBBoxMap(state.basin):basinBBoxFlow(state.basin);
  if(bb)zoomToBBox(...bb);
}

/* =====================================================================
   RIBBON GEOMETRY — sampled bump-x bezier with true perpendicular
   offsets, so braid strands can never overlap.
   ===================================================================== */
function sampleBump(x0,y0,x1,y1,N){
  const mx=(x0+x1)/2, P=[[x0,y0],[mx,y0],[mx,y1],[x1,y1]], out=[];
  for(let i=0;i<=N;i++){
    const t=i/N,u=1-t;
    const x=u*u*u*P[0][0]+3*u*u*t*P[1][0]+3*u*t*t*P[2][0]+t*t*t*P[3][0];
    const y=u*u*u*P[0][1]+3*u*u*t*P[1][1]+3*u*t*t*P[2][1]+t*t*t*P[3][1];
    const dx=3*u*u*(P[1][0]-P[0][0])+6*u*t*(P[2][0]-P[1][0])+3*t*t*(P[3][0]-P[2][0]);
    const dy=3*u*u*(P[1][1]-P[0][1])+6*u*t*(P[2][1]-P[1][1])+3*t*t*(P[3][1]-P[2][1]);
    const L=Math.hypot(dx,dy)||1;
    out.push({x,y,nx:-dy/L,ny:dx/L});
  }
  return out;
}
function ribbonPath(S,W,a,b){ /* a,b: fractions across width, 0=one edge */
  const oa=(a-0.5)*W, ob=(b-0.5)*W;
  let d='M';
  S.forEach((p,i)=>{d+=(i?'L':'')+(p.x+p.nx*oa).toFixed(1)+' '+(p.y+p.ny*oa).toFixed(1);});
  for(let i=S.length-1;i>=0;i--){const p=S[i];d+='L'+(p.x+p.nx*ob).toFixed(1)+' '+(p.y+p.ny*ob).toFixed(1);}
  return d+'Z';
}
/* Port stacking: each node distributes its in/out edges across slots so
   ribbons dock side by side instead of piling on one point. */
function layoutFlow(){
  const qf=qFactor(state.mi);
  const qmax=Math.max(...G.edges.map(e=>e.q||1));
  const Wof=e=>{
    const live=NODE[e.t].gage&&state.live[NODE[e.t].gage];
    const q=(live||e.q||1)*qf;
    return Math.max(2.4,26*Math.sqrt(Math.min(1.5,q/qmax)));
  };
  G.edges.forEach(e=>{e.W=Wof(e);});
  G.nodes.forEach(n=>{
    const inn=G.edges.filter(e=>e.t===n.id).sort((a,b)=>NODE[a.f].y-NODE[b.f].y);
    const out=G.edges.filter(e=>e.f===n.id).sort((a,b)=>NODE[a.t].y-NODE[b.t].y);
    const Hin=inn.reduce((s,e)=>s+e.W,0), Hout=out.reduce((s,e)=>s+e.W,0);
    n.Hin=Hin;n.Hout=Hout;
    let c=-Hin/2; inn.forEach(e=>{e.tOff=c+e.W/2;c+=e.W;});
    c=-Hout/2; out.forEach(e=>{e.sOff=c+e.W/2;c+=e.W;});
  });
}

/* =====================================================================
   DRAW: MAP
   ===================================================================== */
function drawMap(){
  camera.selectAll('*').remove();
  const g=camera;

  const defs=g.append('defs');
  const glow=defs.append('filter').attr('id','glow').attr('x','-40%').attr('y','-40%').attr('width','180%').attr('height','180%');
  glow.html('<feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>');

  g.append('rect').attr('x',px(GEO.w)).attr('y',py(GEO.n)).attr('width',IW).attr('height',IH)
   .attr('fill','#08131B').attr('stroke','#2A4351').attr('stroke-width',1.2);

  const grid=g.append('g').attr('opacity',.5);
  for(let lon=-108;lon>=-103;lon--)grid.append('line').attr('x1',px(lon)).attr('x2',px(lon)).attr('y1',py(GEO.n)).attr('y2',py(GEO.s)).attr('stroke','#14252F').attr('stroke-width',.6);
  for(let lat=38;lat<=40;lat++)grid.append('line').attr('y1',py(lat)).attr('y2',py(lat)).attr('x1',px(GEO.w)).attr('x2',px(GEO.e)).attr('stroke','#14252F').attr('stroke-width',.6);

  const ig=g.append('g');
  INTERSTATES.forEach(hw=>{
    ig.append('path').attr('d',geoLine(hw.p)).attr('fill','none').attr('stroke','#3A3F46').attr('stroke-width',3.2).attr('stroke-linecap','round').attr('opacity',.9);
    ig.append('path').attr('d',geoLine(hw.p)).attr('fill','none').attr('stroke','#8C8577').attr('stroke-width',1.1).attr('stroke-dasharray','7 5').attr('opacity',.75);
    hw.shields.forEach(s=>{
      const sx=px(s[0]),sy=py(s[1]);
      ig.append('rect').attr('x',sx-12).attr('y',sy-7).attr('width',24).attr('height',14).attr('rx',3).attr('fill','#8C8577').attr('stroke','#0A1721');
      ig.append('text').attr('x',sx).attr('y',sy+3).attr('class','ilbl').attr('text-anchor','middle').text(hw.n);
    });
  });

  g.append('path').attr('d',geoLine(DIVIDE)).attr('fill','none').attr('stroke','#4E6E80')
   .attr('stroke-width',1.4).attr('stroke-dasharray','1 5').attr('stroke-linecap','round').attr('opacity',.9);
  g.append('text').attr('x',px(-106.9)).attr('y',py(38.05)).attr('class','lbl-big')
   .attr('transform',`rotate(-72 ${px(-106.9)} ${py(38.05)})`).text('CONTINENTAL DIVIDE');

  const rl=g.append('g').attr('class','riverlayer').style('mix-blend-mode','screen');
  RIVERS.forEach(rv=>{
    const on=state.basin==='all'||rv.b===state.basin;
    rl.append('path').attr('d',geoLine(rv.p)).attr('fill','none')
      .attr('stroke',on?'#2E7E96':'#1A2E39').attr('stroke-width',rv.w*(on?1.6:1))
      .attr('stroke-linecap','round').attr('opacity',on?.95:.3)
      .attr('filter',on?'url(#glow)':null);
  });

  const rlab=g.append('g');
  RIVERS.forEach(rv=>{
    if(rv.w<1.5||!(state.basin==='all'||rv.b===state.basin))return;
    const i=Math.floor(rv.p.length/2),mid=rv.p[i];
    const a=rv.p[Math.max(0,i-1)],b=rv.p[Math.min(rv.p.length-1,i+1)];
    const ang=Math.atan2(py(b[0])-py(a[0]),px(b[1])-px(a[1]))*180/Math.PI;
    rlab.append('text').attr('x',px(mid[1])).attr('y',py(mid[0])-7)
      .attr('class','lbl-riv '+(rv.w>=2?'':'t2')).attr('text-anchor','middle')
      .attr('transform',`rotate(${Math.max(-42,Math.min(42,ang))} ${px(mid[1])} ${py(mid[0])-7})`)
      .text(rv.n);
  });

  const cg=g.append('g');
  CITIES.forEach(c=>{
    cg.append('rect').attr('x',px(c.lon)-1.6).attr('y',py(c.lat)-1.6).attr('width',3.2).attr('height',3.2).attr('fill','#5C7484');
    cg.append('text').attr('x',px(c.lon)+6).attr('y',py(c.lat)+3).attr('class','lbl2 t2').text(c.n);
  });

  const list=RES.filter(r=>(state.basin==='all'||r.b===state.basin)&&passesFilter(r))
    .slice().sort((a,b)=>b.cap-a.cap);
  const rg=g.append('g');
  list.forEach(r=>{
    const cx=px(r.lon),cy=py(r.lat),rad=radiusFor(r.cap);
    const grp=rg.append('g').attr('class','node-hit').attr('tabindex',0).attr('role','button')
      .attr('aria-label',r.n);
    drawGlyph(grp,rad,cx,cy,r,resColour(r.id));
    if(state.selected===r.id)
      grp.append('circle').attr('cx',cx).attr('cy',cy).attr('r',rad+5).attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.4);
    const tier=r.cap>=60000?'':'t2';
    grp.append('text').attr('x',cx).attr('y',cy+rad+12).attr('class','lbl '+tier).attr('text-anchor','middle')
      .text(r.n.replace(/ (Reservoir|Res\.|Lake)$/,''));
    grp.append('text').attr('x',cx).attr('y',cy+rad+23).attr('class','pmlbl '+tier).attr('text-anchor','middle')
      .attr('fill',ramp(pmAt(r,state.mi))).text(pmAt(r,state.mi)+'% of normal');
    grp.on('click',ev=>{if(ev.defaultPrevented)return;
      state.selected=r.id;state.selectedNode=RESNODE[r.id]||null;draw();renderSheet();});
    grp.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
      state.selected=r.id;state.selectedNode=RESNODE[r.id]||null;draw();renderSheet();}});
  });

  g.append('text').attr('x',PAD.l).attr('y',40).attr('class','lbl-big')
   .text((state.basin==='all'?'ALL BASINS':BASINS.find(b=>b.id===state.basin).n.toUpperCase())
     +' · '+list.length+' RESERVOIRS · '+kaf(list.reduce((s,r)=>s+r.cap,0))+' KAF CAPACITY · '+MONTHS[state.mi].toUpperCase());

  d3.select('#viewnote').text('Fill colour = source water · fill height = storage · bone tick = normal level · zoom in for more labels · drag to pan');
}

function drawGlyph(grp,R,cx,cy,r,color){
  const est=r.c==='est';
  grp.append('circle').attr('cx',cx).attr('cy',cy).attr('r',R).attr('fill','#0A1620')
     .attr('stroke',est?'#3A5A6B':'#54798C').attr('stroke-width',est?1:1.3)
     .attr('stroke-dasharray',est?'2.5 2.5':null);
  const cid='c'+r.id+Math.floor(Math.random()*1e5);
  grp.append('clipPath').attr('id',cid).append('circle').attr('cx',cx).attr('cy',cy).attr('r',R);
  const fillPct=Math.min(105,stoAt(r,state.mi)/r.cap*100);
  const h=Math.max(0,Math.min(1,fillPct/100))*2*R;
  if(h>0.3){
    grp.append('rect').attr('x',cx-R).attr('y',cy+R-h).attr('width',2*R).attr('height',h)
       .attr('fill',color).attr('opacity',.92).attr('clip-path',`url(#${cid})`);
    grp.append('line').attr('x1',cx-R).attr('x2',cx+R).attr('y1',cy+R-h).attr('y2',cy+R-h)
       .attr('stroke','#071119').attr('stroke-width',.8).attr('opacity',.6).attr('clip-path',`url(#${cid})`);
  }
  const med=medianFullPct(r,state.mi);
  if(med>0){
    const hm=Math.max(0,Math.min(1,med/100))*2*R;
    grp.append('line').attr('x1',cx-R-3).attr('x2',cx+R+3).attr('y1',cy+R-hm).attr('y2',cy+R-hm)
       .attr('stroke','#EDE6D6').attr('stroke-width',1.4).attr('opacity',.9);
  }
}

/* =====================================================================
   DRAW: FLOW — sankey ribbons with port stacking
   ===================================================================== */
function drawFlow(){
  camera.selectAll('*').remove();
  layoutFlow();
  const g=camera;
  const dimmed=id=>state.basin!=='all'&&NODE[id]&&NODE[id].sys!==state.basin;

  const defs=g.append('defs');
  G.edges.forEach((e,i)=>{
    const a=NODE[e.f],b=NODE[e.t];
    const lg=defs.append('linearGradient').attr('id','eg'+i).attr('gradientUnits','userSpaceOnUse')
      .attr('x1',a.x).attr('y1',a.y).attr('x2',b.x).attr('y2',b.y);
    lg.append('stop').attr('offset','0%').attr('stop-color',rgb2css(blendColour(COMP[e.f])));
    lg.append('stop').attr('offset','100%').attr('stop-color',rgb2css(blendColour(COMP[e.t])));
  });

  /* spine */
  const sp=g.append('g');
  sp.append('line').attr('x1',SPINE).attr('x2',SPINE).attr('y1',60).attr('y2',FH-46)
    .attr('stroke','#31586B').attr('stroke-width',1.4).attr('stroke-dasharray','2 7').attr('stroke-linecap','round');
  sp.append('text').attr('x',SPINE).attr('y',50).attr('class','lbl-big').attr('text-anchor','middle').text('CONTINENTAL DIVIDE');
  sp.append('text').attr('x',SPINE-26).attr('y',72).attr('class','lbl2 t2').attr('text-anchor','end')
    .text('◀ WEST SLOPE — Colorado River system');
  sp.append('text').attr('x',SPINE+26).attr('y',72).attr('class','lbl2 t2').attr('text-anchor','start')
    .text('EAST SLOPE — Platte · Arkansas · Rio Grande ▶');

  /* ribbons */
  const layer=g.append('g').style('mix-blend-mode','screen');
  G.edges.forEach((e,i)=>{
    const a=NODE[e.f],b=NODE[e.t];
    const y0=a.y+(e.sOff||0), y1=b.y+(e.tOff||0);
    const faded=dimmed(e.f)&&dimmed(e.t);
    if(e.dash){ /* tunnels and pumps: dashed stroked pipe, not a ribbon */
      const mx=(a.x+b.x)/2;
      layer.append('path')
        .attr('d',`M${a.x} ${y0} C${mx} ${y0}, ${mx} ${y1}, ${b.x} ${y1}`)
        .attr('fill','none')
        .attr('stroke',faded?'#1B3240':(state.mode==='braid'?rgb2css(blendColour(COMP[e.f])):`url(#eg${i})`))
        .attr('stroke-width',Math.min(e.W,9)).attr('stroke-linecap','round')
        .attr('stroke-dasharray','8 7').attr('opacity',faded?.4:.85);
      return;
    }
    const S=sampleBump(a.x,y0,b.x,y1,26);
    if(faded){
      layer.append('path').attr('d',ribbonPath(S,e.W,0,1)).attr('fill','#152A36').attr('opacity',.5);
      return;
    }
    if(state.mode==='blend'){
      layer.append('path').attr('d',ribbonPath(S,e.W,0,1)).attr('fill',`url(#eg${i})`).attr('opacity',.92);
    }else{
      const parts=sortedParts(COMP[e.f]);
      const T=parts.reduce((s,p)=>s+p[1],0)||1;
      let acc=0;
      parts.forEach(([sid,w])=>{
        const a0=acc/T, a1=(acc+w)/T; acc+=w;
        layer.append('path').attr('d',ribbonPath(S,e.W,a0,a1)).attr('fill',NODE[sid].hue).attr('opacity',.92);
      });
    }
  });

  /* nodes */
  const ng=g.append('g');
  G.nodes.forEach(n=>{
    const faded=dimmed(n.id);
    const col=faded?'#2A4757':rgb2css(blendColour(COMP[n.id]));
    const anchor=n.side==='w'?'end':'start', off=n.side==='w'?-11:11;

    if(n.k==='cf'||n.k==='pt'){ /* junction capsule sized to its throughput */
      const Hn=Math.max(n.Hin||0,n.Hout||0,5);
      ng.append('rect').attr('x',n.x-3.5).attr('y',n.y-Hn/2-2).attr('width',7).attr('height',Hn+4)
        .attr('rx',3.5).attr('fill',col).attr('stroke','#071119').attr('stroke-width',1).attr('opacity',faded?.4:.95);
      if(n.l)ng.append('text').attr('x',n.x).attr('y',n.y-Hn/2-8).attr('class','lbl2 t2')
        .attr('text-anchor','middle').text(n.l);
      return;
    }
    if(n.k==='src'){
      ng.append('circle').attr('cx',n.x).attr('cy',n.y).attr('r',5.5)
        .attr('fill',faded?'#2A4757':n.hue).attr('stroke','#08131B').attr('stroke-width',1.5);
      ng.append('text').attr('x',n.x+off).attr('y',n.y+3.5).attr('class','lbl')
        .attr('text-anchor',anchor).attr('opacity',faded?.35:1).text(n.l);
      return;
    }
    if(n.k==='res'){
      const r=RESBY[n.res];if(!r)return;
      const dimRes=faded||!passesFilter(r);
      const rad=Math.max(8,Math.min(23,Math.sqrt(r.cap)/32));
      const grp=ng.append('g').attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',r.n)
        .attr('opacity',dimRes&&!faded?.45:1);
      if(dimRes){
        grp.append('circle').attr('cx',n.x).attr('cy',n.y).attr('r',rad).attr('fill','#0D1B24')
           .attr('stroke','#2A4757').attr('stroke-width',1).attr('stroke-dasharray',r.c==='est'?'2.5 2.5':null);
      }else{
        drawGlyph(grp,rad,n.x,n.y,r,col);
      }
      if(state.selected===r.id)
        grp.append('circle').attr('cx',n.x).attr('cy',n.y).attr('r',rad+5).attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.4);
      grp.append('text').attr('x',n.x).attr('y',n.y+rad+12).attr('class','lbl'+(rad<12?' t2':''))
        .attr('text-anchor','middle').attr('opacity',faded?.35:1).text(n.l);
      if(!dimRes)grp.append('text').attr('x',n.x).attr('y',n.y+rad+23).attr('class','pmlbl'+(rad<12?' t2':''))
        .attr('text-anchor','middle').attr('fill',ramp(pmAt(r,state.mi))).text(pmAt(r,state.mi)+'%');
      grp.on('click',ev=>{if(ev.defaultPrevented)return;
        state.selected=r.id;state.selectedNode=n.id;draw();renderSheet();});
      grp.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
        state.selected=r.id;state.selectedNode=n.id;draw();renderSheet();}});
      return;
    }
    if(n.k==='gage'){
      const live=state.live[n.gage];
      const grp=ng.append('g').attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',n.l);
      grp.append('rect').attr('x',n.x-4.5).attr('y',n.y-4.5).attr('width',9).attr('height',9)
        .attr('fill',col).attr('stroke','#071119').attr('stroke-width',1.4)
        .attr('transform',`rotate(45 ${n.x} ${n.y})`);
      if(state.selectedNode===n.id&&!state.selected)
        grp.append('circle').attr('cx',n.x).attr('cy',n.y).attr('r',11).attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.3);
      grp.append('text').attr('x',n.x).attr('y',n.y-16).attr('class','lbl').attr('text-anchor','middle')
        .attr('opacity',faded?.35:1).text(n.l);
      const edge=G.edges.find(e=>e.t===n.id);
      const q=live!=null?live:(edge?Math.round(edge.q*qFactor(state.mi)):null);
      grp.append('text').attr('x',n.x).attr('y',n.y-6).attr('class','gval').attr('text-anchor','middle')
        .attr('fill',live!=null?'#00D6E6':null).attr('opacity',faded?.35:1)
        .text(q!=null?fmt(q)+' cfs'+(live!=null?' · live':''):'');
      grp.append('text').attr('x',n.x).attr('y',n.y+17).attr('class','gid t3').attr('text-anchor','middle')
        .text('USGS '+n.gage);
      grp.on('click',ev=>{if(ev.defaultPrevented)return;
        state.selectedNode=n.id;state.selected=null;draw();renderSheet();});
      grp.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
        state.selectedNode=n.id;state.selected=null;draw();renderSheet();}});
      return;
    }
    if(n.k==='exit'){
      const dir=n.side==='w'?-1:1;
      const grp=ng.append('g').attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',n.l);
      grp.append('path').attr('d',`M${n.x-10*dir} ${n.y-10} L${n.x+10*dir} ${n.y} L${n.x-10*dir} ${n.y+10} Z`)
        .attr('fill',col).attr('opacity',faded?.35:.95);
      if(state.selectedNode===n.id&&!state.selected)
        grp.append('circle').attr('cx',n.x).attr('cy',n.y).attr('r',14).attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.3);
      grp.append('text').attr('x',n.x).attr('y',n.y-17).attr('class','xlbl').attr('text-anchor','middle')
        .attr('opacity',faded?.35:1).text(n.l);
      grp.append('text').attr('x',n.x).attr('y',n.y+23).attr('class','xq').attr('text-anchor','middle')
        .attr('opacity',faded?.35:1).text(fmt(FLOWQ[n.id]*qFactor(state.mi))+' cfs leaving');
      grp.on('click',ev=>{if(ev.defaultPrevented)return;
        state.selectedNode=n.id;state.selected=null;draw();renderSheet();});
      grp.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
        state.selectedNode=n.id;state.selected=null;draw();renderSheet();}});
    }
  });

  /* tunnel labels at the spine */
  G.edges.filter(e=>e.tun).forEach(e=>{
    const a=NODE[e.f],b=NODE[e.t];
    if(state.basin!=='all'&&a.sys!==state.basin&&b.sys!==state.basin)return;
    const t=(SPINE-a.x)/(b.x-a.x), y=(a.y+(e.sOff||0))+((b.y+(e.tOff||0))-(a.y+(e.sOff||0)))*t;
    ng.append('circle').attr('cx',SPINE).attr('cy',y).attr('r',3.2).attr('fill','#08131B').attr('stroke','#C7D4DA').attr('stroke-width',1.1);
    ng.append('text').attr('x',SPINE+8).attr('y',y-5).attr('class','lbl t2').text(e.tun);
  });

  g.append('text').attr('x',44,).attr('y',30).attr('class','lbl-big')
   .text('FLOW & MIXING · '+MONTHS[state.mi].toUpperCase()+' · RIBBON WIDTH = FLOW · COLOUR = SOURCE MIX');

  d3.select('#viewnote').text(state.mode==='blend'
    ?'Blend · ribbon colour is the flow-weighted mix of everything upstream · dashed = tunnel under the Divide'
    :'Braid · each ribbon splits into its true source shares — widths are the arithmetic · dashed = tunnel under the Divide');
}

/* =====================================================================
   SHEET
   ===================================================================== */
function compBlockHTML(nodeId,title){
  const parts=sortedParts(COMP[nodeId]);
  if(parts.length<2)return'';
  const T=parts.reduce((a,p)=>a+p[1],0)||1;
  return `<div style="font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#6d6450;margin:14px 0 4px">${title}</div>
    <div class="compbar">${parts.map(([sid,w])=>`<div style="width:${(w/T*100).toFixed(2)}%;background:${NODE[sid].hue}"></div>`).join('')}</div>
    <div class="complist">${parts.slice().sort((a,b)=>b[1]-a[1]).map(([sid,w])=>
      `<div><span class="sw" style="background:${NODE[sid].hue}"></span>${NODE[sid].l}<b>${(w/T*100).toFixed(0)}%</b></div>`).join('')}</div>`;
}
function renderSheet(){
  const s=document.getElementById('sheet');
  const mi=state.mi, past=mi!==NOW;

  if(state.selectedNode&&!state.selected){
    const n=NODE[state.selectedNode];
    const live=n.gage&&state.live[n.gage];
    s.innerHTML=`
      <div class="tag"><span>${n.k==='exit'?'State line':'Gage'}</span><span>${n.gage?'USGS '+n.gage:'—'}</span></div>
      <h2>${n.l}</h2>
      <div class="sub">${n.side==='w'?'West slope':'East slope'} · ${BASINS.find(b=>b.id===n.sys).n}</div>
      <table class="rows">
        <tr><td class="lab">Flow (${MONTHS[mi]})</td><td>${fmt((live||FLOWQ[state.selectedNode])*(live?1:qFactor(mi)))} cfs${live?' · live':''}</td></tr>
        <tr><td class="lab">Headwaters upstream</td><td>${sortedParts(COMP[state.selectedNode]).length}</td></tr>
      </table>
      ${compBlockHTML(state.selectedNode,'What this water is')}
      <div class="prov"><b>Composition</b> is traced edge by edge from the headwaters, with diversions taking a proportional slice. Base flows are typical late-July 2026 values${past?', scaled by the statewide monthly flow index for '+MONTHS[mi]:''}.</div>`;
    return;
  }
  if(!state.selected){
    s.innerHTML=`<div class="tag"><span>Data sheet</span><span>—</span></div>
      <div class="empty">Click a reservoir for its storage against the 1991–2020 normal, or a gage diamond on the flow view to see what that water is made of.
      <br><br>Drag the timeline to Oct 2025 and press play — watch the Rio Grande's October surplus drain and the Gunnison sink through spring.</div>`;
    return;
  }
  const r=RESBY[state.selected];
  const sto=stoAt(r,mi), pm=pmAt(r,mi);
  const fill=sto/r.cap*100, med=medianFullPct(r,mi);
  const deficit=pm?Math.round(sto/(pm/100)-sto):null;
  const badge=r.c==='obs'&&!past?`<span class="badge obs">measured</span>`:`<span class="badge est">${past?'reconstructed':'basin estimate'}</span>`;
  const col=resColour(r.id), nid=RESNODE[r.id];
  s.innerHTML=`
    <div class="tag"><span>${BASINS.find(b=>b.id===r.b).n}</span>${badge}</div>
    <h2>${r.n}</h2>
    <div class="sub">on the ${r.r} · ${MONTHS[mi]}</div>
    <div class="srcline"><span class="sw" style="background:${col}"></span>colour of the water that fills it</div>
    <div class="gauge">
      <div class="gaugebar">
        <div class="gaugefill" style="width:${Math.min(100,fill).toFixed(1)}%;background:${col}"></div>
        <div class="gaugemed" style="left:${Math.min(100,med).toFixed(1)}%"></div>
      </div>
      <div class="gaugelbl"><span>${fill.toFixed(0)}% full</span><span>normal: ${med.toFixed(0)}%</span></div>
    </div>
    <table class="rows">
      <tr><td class="lab">Storage</td><td>${fmt(sto)} AF</td></tr>
      <tr><td class="lab">Capacity</td><td>${fmt(r.cap)} AF</td></tr>
      <tr><td class="lab">Percent of normal</td><td style="color:${ramp(pm)}">${pm}%</td></tr>
      ${deficit>0?`<tr><td class="lab">Below normal by</td><td>${fmt(deficit)} AF</td></tr>`:''}
      <tr><td class="lab">Reading</td><td>${past?'basin-scaled':(r.d||'1 Jun 2026 basin')}</td></tr>
    </table>
    ${nid?compBlockHTML(nid,'Water arriving here'):''}
    <div class="prov">${past
      ? `<b>Timeline mode</b> — storage rescaled by the ${BASINS.find(b=>b.id===r.b).n} basin's NRCS monthly percent of median (interpolated between reports). A reconstruction of basin conditions, not a gage record for this reservoir.`
      : r.c==='obs'
        ? `<b>Source</b> ${r.s}. Storage as published for ${r.d}. Percent of normal compares to the NRCS 1991–2020 median for this calendar day.`
        : `<b>Estimate</b> No same-day public reading was available; scaled to the basin's reported percent of median (NRCS, 1 June 2026).`}</div>`;
}

/* =====================================================================
   CHROME
   ===================================================================== */
function renderStrip(){
  document.getElementById('strip').innerHTML=STATEWIDE.map(s=>
    `<div class="stat"><div class="k">${s.k}</div><div class="v ${s.cls}">${s.v}</div><div class="n">${s.n}</div></div>`).join('');
}
function renderChips(){
  const box=d3.select('#chips');
  box.selectAll('*').remove();
  box.selectAll('button').data(BASINS).join('button')
    .attr('class','chip').attr('aria-pressed',d=>String(d.id===state.basin)).text(d=>d.n)
    .on('click',(ev,d)=>{state.basin=d.id;renderChips();draw();zoomToBasin();});
}
function renderLegend(){
  const used={
    [H.blue]:'Colorado & San Juan headwaters · Rio Grande',
    [H.cyan]:'Fraser (Moffat Tunnel) · White · Fountain Creek',
    [H.green]:'Blue River (Roberts Tunnel) · Yampa · Animas',
    [H.lime]:'Eagle (Homestake) · Clear Creek · Elk',
    [H.orange]:'Dolores · native South Platte · native Arkansas',
    [H.red]:'Roaring Fork (Fry-Ark) · Big Thompson · San Miguel',
    [H.magenta]:'Gunnison · Los Pinos · Purgatoire · St. Vrain'
  };
  document.getElementById('huekey').innerHTML=Object.entries(used).map(([c,v])=>
    `<div class="keyrow"><span class="swatch" style="background:${c}"></span>${v}</div>`).join('');
}
function draw(){ if(state.view==='map')drawMap(); else drawFlow(); }
function setView(v){
  state.view=v;
  d3.select('#btn-map').attr('aria-pressed',String(v==='map'));
  d3.select('#btn-flow').attr('aria-pressed',String(v==='flow'));
  document.getElementById('modewrap').style.display=v==='flow'?'flex':'none';
  setViewBox();zoomReset(false);draw();
  if(state.basin!=='all')zoomToBasin();
}
d3.select('#btn-map').on('click',()=>setView('map'));
d3.select('#btn-flow').on('click',()=>setView('flow'));
d3.select('#btn-blend').on('click',()=>{state.mode='blend';
  d3.select('#btn-blend').attr('aria-pressed','true');d3.select('#btn-braid').attr('aria-pressed','false');draw();});
d3.select('#btn-braid').on('click',()=>{state.mode='braid';
  d3.select('#btn-blend').attr('aria-pressed','false');d3.select('#btn-braid').attr('aria-pressed','true');draw();});
d3.selectAll('.capbtn').on('click',function(){
  state.minCap=+this.dataset.cap;
  d3.selectAll('.capbtn').attr('aria-pressed',function(){return String(+this.dataset.cap===state.minCap);});
  draw();
});
d3.select('#btn-meas').on('click',function(){
  state.measOnly=!state.measOnly;
  d3.select(this).attr('aria-pressed',String(state.measOnly));
  draw();
});

/* timeline */
const slider=document.getElementById('tslider'), monthlbl=document.getElementById('monthlbl');
function setMonth(mi){
  state.mi=mi; slider.value=mi;
  monthlbl.innerHTML='<small>storage timeline</small>'+MONTHS[mi];
  draw(); renderSheet();
}
slider.addEventListener('input',()=>setMonth(+slider.value));
const playBtn=document.getElementById('play');
playBtn.addEventListener('click',()=>{
  if(state.playing){clearInterval(state.playing);state.playing=null;playBtn.textContent='▶';return;}
  let mi=state.mi>=NOW?0:state.mi;
  setMonth(mi);
  playBtn.textContent='⏸';
  state.playing=setInterval(()=>{
    mi++;
    if(mi>NOW){clearInterval(state.playing);state.playing=null;playBtn.textContent='▶';return;}
    setMonth(mi);
  },850);
});

/* live USGS pull, with a paste-JSON fallback for locked-down contexts */
const GAGES=[...new Set(G.nodes.filter(n=>n.gage).map(n=>n.gage))];
const LIVEURL='https://waterservices.usgs.gov/nwis/iv/?format=json&sites='+GAGES.join(',')+'&parameterCd=00060&siteStatus=all';
function ingest(j){
  let n=0;
  ((j.value&&j.value.timeSeries)||[]).forEach(ts=>{
    const site=ts.sourceInfo&&ts.sourceInfo.siteCode&&ts.sourceInfo.siteCode[0]&&ts.sourceInfo.siteCode[0].value;
    const vv=ts.values&&ts.values[0]&&ts.values[0].value&&ts.values[0].value[0];
    const v=vv?parseFloat(vv.value):NaN;
    if(site&&isFinite(v)&&v>=0){state.live[site]=v;n++;}
  });
  return n;
}
d3.select('#live').on('click',async()=>{
  const btn=document.getElementById('live'),out=document.getElementById('livestat');
  btn.disabled=true;out.textContent='Requesting '+GAGES.length+' gages…';
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),9000);
  try{
    const res=await fetch(LIVEURL,{signal:ctl.signal});
    clearTimeout(to);
    if(!res.ok)throw new Error('HTTP '+res.status);
    const n=ingest(await res.json());
    out.innerHTML=n?`Updated <b style="color:var(--bone)">${n}</b> of ${GAGES.length} gages — labels and ribbon widths now use live readings.`
      :'The request succeeded but returned no discharge values.';
    if(n&&state.view!=='flow')setView('flow');else draw();
  }catch(err){
    clearTimeout(to);
    out.innerHTML=`This page can't reach USGS directly (the hosting sandbox blocks outside requests). `+
      `<a href="${LIVEURL}" target="_blank" rel="noopener">Open the data URL</a>, copy everything, and paste it below — same result.`;
    document.getElementById('paste').style.display='block';
  }
  btn.disabled=false;
});
d3.select('#pastego').on('click',()=>{
  const out=document.getElementById('livestat');
  try{
    const n=ingest(JSON.parse(document.getElementById('pastebox').value));
    out.innerHTML=n?`Parsed <b style="color:var(--bone)">${n}</b> live gage readings from the pasted JSON.`:'Parsed, but found no discharge values.';
    if(n&&state.view!=='flow')setView('flow');else draw();
  }catch(e){out.textContent='That didn\u2019t parse as USGS JSON — copy the whole response, braces and all.';}
});

/* boot */
renderStrip();renderChips();renderLegend();renderSheet();
setViewBox();draw();
