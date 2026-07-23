"use strict";
const NODE=Object.fromEntries(G.nodes.map(n=>[n.id,n]));
const RESNODE={}; G.nodes.forEach(n=>{if(n.k==='res')RESNODE[n.res]=n.id;});

/* =====================================================================
   HELPERS
   ===================================================================== */
const fmt=n=>Math.round(n).toLocaleString('en-US');
const kaf=n=>(n/1000).toFixed(n<10000?1:0);
/* hex2rgb, rgb2css, RAMPS, ramp — relocated to js/data.js (shared with story.js) */
const GEO={n:41.0,s:37.0,w:-109.05,e:-102.05};
const PAD={l:56,r:56,t:64,b:64};
const IW=MAPW-PAD.l-PAD.r, IH=MAPH-PAD.t-PAD.b;
const px=lon=>PAD.l+(lon-GEO.w)/(GEO.e-GEO.w)*IW;
const py=lat=>PAD.t+(GEO.n-lat)/(GEO.n-GEO.s)*IH;
const geoLine=d3.line().x(p=>px(p[1])).y(p=>py(p[0])).curve(d3.curveCatmullRom.alpha(0.6));
/* USGS site id → flow-graph node id, so a gage clicked on the geographic
   view opens the same node sheet the flow view uses. */
const GAGE_NODE={};
G.nodes.forEach(n=>{if(n.gage&&GAGE_NODE[n.gage]==null)GAGE_NODE[n.gage]=n.id;});

/* =====================================================================
   STATE
   ===================================================================== */
const state={view:'map',basin:'all',mode:'blend',minCap:0,measOnly:false,mi:NOW,
  selected:null,selectedNode:null,live:{},playing:null,tap:null};

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
  if(state.measOnly&&r.c!=='obs'&&!LIVE_STO[r.id])return false;
  return true;
}
/* ---- the glass ----
   Reservoirs are drawn as tapered vessels — wide rim, narrow base — the
   cross-section of a canyon reservoir. Vessel area encodes capacity, and
   the fill level is solved so the filled AREA (not height) is the stored
   fraction: a reservoir holds less water per foot at depth, and the
   glass says so. Base center sits on the geographic point. */
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
let GID=0;
function drawGlass(grp,r,color,S,bright){
  const {h,a,b}=glassDims(r.cap,S), est=r.c==='est'&&!LIVE_STO[r.id];
  grp.append('rect').attr('x',-a-5).attr('y',-h-6).attr('width',2*a+10).attr('height',h+18)
     .attr('fill','transparent');
  const d=glassPathD(h,a,b);
  grp.append('path').attr('d',d).attr('fill','#0A1620')
     .attr('stroke',est?(bright?'#4E7488':'#3A5A6B'):(bright?'#7FA6BC':'#54798C'))
     .attr('stroke-width',est?(bright?1.3:1):(bright?1.6:1.3))
     .attr('stroke-dasharray',est?'2.5 2.5':null);
  const cid='c'+r.id+(GID++);
  grp.append('clipPath').attr('id',cid).append('path').attr('d',d);
  const y=Math.min(h,fillLevel(stoAt(r,state.mi)/r.cap,h,a,b));
  if(y>0.3){
    grp.append('rect').attr('x',-a).attr('y',-y).attr('width',2*a).attr('height',y)
       .attr('fill',color).attr('opacity',bright?1:.92).attr('clip-path',`url(#${cid})`);
    grp.append('line').attr('x1',-a).attr('x2',a).attr('y1',-y).attr('y2',-y)
       .attr('stroke','#071119').attr('stroke-width',.8).attr('opacity',.6).attr('clip-path',`url(#${cid})`);
  }
  const med=medianFullPct(r,state.mi)/100;
  if(med>0){
    const ym=fillLevel(med,h,a,b);
    const wm=b+(a-b)*Math.min(ym/h,1);
    grp.append('line').attr('x1',-wm-3).attr('x2',wm+3).attr('y1',-ym).attr('y2',-ym)
       .attr('stroke','#EDE6D6').attr('stroke-width',1.4).attr('opacity',.9);
  }
  return {h,a,b};
}
function glassRing(grp,r,S){
  const {h,a,b}=glassDims(r.cap,S);
  grp.append('path').attr('d',glassPathD(h+7,a+5,b+5)).attr('transform','translate(0,3.5)')
     .attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.4);
}
/* storage trend as cfs, + = drawing down. Live weekly slope when we have
   it and the timeline sits on now; else the monthly reconstruction —
   snapshot-only on both sides of the difference, so live values never
   get compared against reconstructed ones. */
function drawdownCfs(r,mi){
  if(mi===NOW&&LIVE_DELTA[r.id]!=null)return LIVE_DELTA[r.id];
  if(mi>0){
    const snap=m=>Math.min(r.cap*1.02,r.sto*pmFactor(r.b,m));
    return -(snap(mi)-snap(mi-1))/30.4*0.50417;
  }
  return 0;
}
function medianFullPct(r,mi){
  if(r.fc)return 0; /* flood pools have no "normal storage" to compare against */
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

/* ---- semantic zoom ----
   Geometry lives in the camera transform; labels counter-scale so text
   stays a constant screen size, and more of them surface as k grows.
   LABELS: anchored label groups, revealed by priority and culled on
   screen-space collision, biggest reservoirs first.
   CSTEXT: loose texts (rivers, flow view) scaled about their own anchor. */
let LABELS=[],CSTEXT=[],curT=d3.zoomIdentity,lastPass=0;
const thrCap=k=>k>=3?0:60000*Math.pow((3-k)/2,2);
const thrSub=k=>k>=4.2?0:60000*Math.pow((4.2-k)/3.2,2);
function applyZoom(){
  const k=curT.k, sg=Math.pow(k,-0.65);
  camera.selectAll('g.gfx').attr('transform',`scale(${sg})`);
  camera.selectAll('g.lab').attr('transform',`scale(${1/k})`);
  camera.selectAll('.zw').attr('stroke-width',function(){return this.dataset.bw*Math.pow(k,-0.7);});
  CSTEXT.forEach(t=>{
    const s=Math.pow(k,-t.p);
    t.el.setAttribute('transform',(t.rot?`rotate(${t.rot} ${t.x} ${t.y}) `:'')
      +`translate(${t.x*(1-s)},${t.y*(1-s)}) scale(${s})`);
    if(t.minK!=null||t.o!=null)
      t.el.style.opacity=(t.minK!=null&&k<t.minK)?0:(t.o==null?1:t.o);
  });
  const now=performance.now();
  if(now-lastPass>120){lastPass=now;labelPass();}
}
function labelPass(){
  const k=curT.k,placed=[],tN=thrCap(k),tS=thrSub(k);
  LABELS.slice().sort((a,b)=>b.pri-a.pri).forEach(L=>{
    let vis=L.minK?k>=L.minK:L.pri>=tN;
    const sub=!!L.sub&&L.pri>=tS;
    if(vis){
      const sx=curT.applyX(L.x),sy=curT.applyY(L.y);
      const box=[sx+L.bx0,sy+L.by0,sx+L.bx1,sy+L.by1+(sub?12:0)];
      if(placed.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]))vis=false;
      else placed.push(box);
    }
    L.el.style.opacity=vis?1:0;
    if(L.sub)L.sub.style.display=sub?null:'none';
  });
}
const zoom=d3.zoom().scaleExtent([1,14])
  .on('zoom',ev=>{curT=ev.transform;camera.attr('transform',curT);applyZoom();})
  .on('end',()=>{lastPass=0;labelPass();});
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
   .attr('fill','#08131B').attr('stroke','#2A4351').attr('stroke-width',1.2)
   .on('click',ev=>{if(ev.defaultPrevented)return;
     if(state.selected||state.selectedNode){state.selected=null;state.selectedNode=null;commit();}});

  /* baked Natural Earth shaded relief (public domain), cropped to the map
     bounds — a faint sense of the mountains. Geographic view only. */
  g.append('image').attr('href','img/co-relief.webp').attr('xlink:href','img/co-relief.webp')
   .attr('x',px(GEO.w)).attr('y',py(GEO.n)).attr('width',IW).attr('height',IH)
   .attr('preserveAspectRatio','none').attr('opacity',0.5).attr('pointer-events','none');

  const grid=g.append('g').attr('opacity',.5);
  for(let lon=-108;lon>=-103;lon--)grid.append('line').attr('x1',px(lon)).attr('x2',px(lon)).attr('y1',py(GEO.n)).attr('y2',py(GEO.s)).attr('stroke','#14252F').attr('stroke-width',.6);
  for(let lat=38;lat<=40;lat++)grid.append('line').attr('y1',py(lat)).attr('y2',py(lat)).attr('x1',px(GEO.w)).attr('x2',px(GEO.e)).attr('stroke','#14252F').attr('stroke-width',.6);

  const ig=g.append('g');
  INTERSTATES.forEach(hw=>{
    ig.append('path').attr('d',geoLine(hw.p)).attr('fill','none').attr('stroke','#3A3F46').attr('class','zw').attr('data-bw',3.2).attr('stroke-width',3.2).attr('stroke-linecap','round').attr('opacity',.9);
    ig.append('path').attr('d',geoLine(hw.p)).attr('fill','none').attr('stroke','#8C8577').attr('class','zw').attr('data-bw',1.1).attr('stroke-width',1.1).attr('stroke-dasharray','7 5').attr('opacity',.75);
    hw.shields.forEach(s=>{
      const gfx=ig.append('g').attr('transform',`translate(${px(s[0])},${py(s[1])})`)
        .append('g').attr('class','gfx');
      gfx.append('rect').attr('x',-12).attr('y',-7).attr('width',24).attr('height',14).attr('rx',3).attr('fill','#8C8577').attr('stroke','#0A1721');
      gfx.append('text').attr('x',0).attr('y',3).attr('class','ilbl').attr('text-anchor','middle').text(hw.n);
    });
  });

  g.append('path').attr('d',geoLine(DIVIDE)).attr('fill','none').attr('stroke','#4E6E80')
   .attr('class','zw').attr('data-bw',1.4).attr('stroke-width',1.4).attr('stroke-dasharray','1 5').attr('stroke-linecap','round').attr('opacity',.9);
  g.append('text').attr('x',px(-106.9)).attr('y',py(38.05)).attr('class','lbl-big')
   .attr('transform',`rotate(-72 ${px(-106.9)} ${py(38.05)})`).text('CONTINENTAL DIVIDE');

  /* rivers wear their flow-view source hue; mainstems that accumulate
     sources fade along their length to the downstream blend */
  const rl=g.append('g').attr('class','riverlayer').style('mix-blend-mode','screen');
  RIVERS.forEach((rv,ri)=>{
    const on=state.basin==='all'||rv.b===state.basin;
    const w=rv.w*(on?1.6:1);
    let stroke='#1A2E39';
    if(on){
      const base=rv.src&&NODE[rv.src]?NODE[rv.src].hue:(rv.hue||'#2E7E96');
      if(rv.blendTo&&COMP[rv.blendTo]){
        const p0=rv.p[0],p1=rv.p[rv.p.length-1];
        const lg=defs.append('linearGradient').attr('id','rg'+ri).attr('gradientUnits','userSpaceOnUse')
          .attr('x1',px(p0[1])).attr('y1',py(p0[0])).attr('x2',px(p1[1])).attr('y2',py(p1[0]));
        lg.append('stop').attr('offset','0%').attr('stop-color',base);
        lg.append('stop').attr('offset','100%').attr('stop-color',rgb2css(blendColour(COMP[rv.blendTo])));
        stroke=`url(#rg${ri})`;
      }else stroke=base;
    }
    rl.append('path').attr('d',geoLine(rv.p)).attr('fill','none')
      .attr('stroke',stroke).attr('class','zw').attr('data-bw',w).attr('stroke-width',w)
      .attr('stroke-linecap','round').attr('opacity',on?.8:.3)
      .attr('filter',on?'url(#glow)':null);
  });

  const rlab=g.append('g');
  RIVERS.forEach(rv=>{
    if(!(state.basin==='all'||rv.b===state.basin))return;
    const i=Math.floor(rv.p.length/2),mid=rv.p[i];
    const a=rv.p[Math.max(0,i-1)],b=rv.p[Math.min(rv.p.length-1,i+1)];
    const ang=Math.max(-42,Math.min(42,Math.atan2(py(b[0])-py(a[0]),px(b[1])-px(a[1]))*180/Math.PI));
    const X=px(mid[1]),Y=py(mid[0])-7;
    const el=rlab.append('text').attr('x',X).attr('y',Y)
      .attr('class','lbl-riv').attr('text-anchor','middle').text(rv.n);
    CSTEXT.push({el:el.node(),x:X,y:Y,rot:ang,p:0.8,
      minK:rv.w>=2?0.1:(rv.w>=1.3?1.6:3)});
  });

  /* transmountain tunnels: dashed, marching toward the thirsty side */
  const tg=g.append('g');
  MAP_TUNNELS.forEach(tn=>{
    const P=pt=>Array.isArray(pt)?[px(pt[1]),py(pt[0])]:[px(RESBY[pt].lon),py(RESBY[pt].lat)];
    const [x0,y0]=P(tn.f),[x1,y1]=P(tn.t);
    const tapT=state.tap?state.tap.tun.includes(tn.n):null;
    const on=(state.basin==='all'||tn.fb===state.basin||tn.tb===state.basin)&&tapT!==false;
    const w=tapT?2.6:1.8;
    const mx=(x0+x1)/2,my=(y0+y1)/2-14;
    tg.append('path').attr('d',`M${x0},${y0} Q${mx},${my} ${x1},${y1}`)
      .attr('fill','none').attr('stroke',on?tn.hue:'#1A2E39')
      .attr('class','zw'+(on?' mapdash':'')).attr('data-bw',w).attr('stroke-width',w)
      .attr('stroke-dasharray','5 4').attr('stroke-linecap','round')
      .attr('opacity',tapT?1:(on?.85:(state.tap?.15:.25)));
    if(on)CSTEXT.push({el:tg.append('text').attr('x',mx).attr('y',my-4).attr('class','lbl2')
      .attr('text-anchor','middle').text(tn.n).node(),x:mx,y:my-4,p:0.8,minK:tapT?0.1:1.7});
  });

  const cg=g.append('g');
  CITIES.forEach(c=>{
    const node=cg.append('g').attr('transform',`translate(${px(c.lon)},${py(c.lat)})`);
    node.append('g').attr('class','gfx')
      .append('rect').attr('x',-1.6).attr('y',-1.6).attr('width',3.2).attr('height',3.2).attr('fill','#5C7484');
    const lab=node.append('g').attr('class','lab');
    lab.append('text').attr('x',6).attr('y',3).attr('class','lbl2').text(c.n);
    LABELS.push({el:lab.node(),x:px(c.lon),y:py(c.lat),pri:90000,minK:1.6,
      bx0:4,by0:-7,bx1:8+c.n.length*6.8,by1:7});
  });

  /* USGS streamgages — small diamonds; click for the gage sheet (flow,
     % of normal, what the water is). Aqua = a live reading is in. */
  if(typeof GAGE_META!=='undefined'){
    const gaugeG=g.append('g');
    Object.keys(GAGE_META).forEach(site=>{
      const m=GAGE_META[site], nid=GAGE_NODE[site];
      const on=state.basin==='all'||m.basin===state.basin;
      const cx=px(m.lon),cy=py(m.lat), live=state.live[site];
      const node=gaugeG.append('g').attr('transform',`translate(${cx},${cy})`)
        .attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',m.name)
        .attr('opacity',on?(state.tap?.55:1):.28);
      const gfx=node.append('g').attr('class','gfx');
      if(!state.selected&&state.selectedNode===nid)
        gfx.append('path').attr('d','M0,-9 L9,0 L0,9 L-9,0 Z')
          .attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.3);
      gfx.append('path').attr('d','M0,-5 L5,0 L0,5 L-5,0 Z')
        .attr('fill',live!=null?'#00D6E6':'#0A1620')
        .attr('stroke',live!=null?'#0A1620':'#4E7488').attr('stroke-width',1.1);
      const short=m.name.split(/,| At | Near | Below | Nr /i)[0].trim();
      const lab=node.append('g').attr('class','lab');
      lab.append('text').attr('x',8).attr('y',3).attr('class','lbl2').text(short);
      LABELS.push({el:lab.node(),x:cx,y:cy,pri:40000,minK:2.2,
        bx0:6,by0:-6,bx1:10+short.length*6,by1:6});
      if(nid){
        const pick=ev=>{if(ev.defaultPrevented)return;
          state.selected=null;state.selectedNode=nid;commit();};
        node.on('click',pick);
        node.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();pick(ev);}});
      }
    });
  }

  const tapRes=state.tap?new Set(state.tap.res):null;
  const tapFc=state.tap&&state.tap.fcres?new Set(state.tap.fcres):null;
  const list=RES.filter(r=>(state.basin==='all'||r.b===state.basin)&&passesFilter(r))
    .slice().sort((a,b)=>b.cap-a.cap);
  const rg=g.append('g');
  list.forEach(r=>{
    const cx=px(r.lon),cy=py(r.lat);
    const isTap=tapRes&&tapRes.has(r.id);
    const isFcTap=tapFc&&tapFc.has(r.id);
    const node=rg.append('g').attr('transform',`translate(${cx},${cy})`)
      .attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',r.n)
      .attr('opacity',tapRes&&!isTap&&!isFcTap?.3:1);
    const gfx=node.append('g').attr('class','gfx');
    drawGlass(gfx,r,resColour(r.id),1);
    if(state.selected===r.id)glassRing(gfx,r,1);
    else if(isTap)glassRing(gfx,r,1);
    const dd=drawdownCfs(r,state.mi);
    if(Math.abs(dd)>15){
      const gd=glassDims(r.cap,1),tx=gd.a+5,ty=-gd.h*0.55;
      gfx.append('path')
        .attr('d',dd>0?`M${tx},${ty} l8,0 l-4,6.5 z`:`M${tx},${ty+6.5} l8,0 l-4,-6.5 z`)
        .attr('fill',dd>0?'#00D6E6':'#5C7484').attr('opacity',.95);
    }
    const lab=node.append('g').attr('class','lab');
    const name=r.n.replace(/ (Reservoir|Res\.|Lake)$/,'');
    lab.append('text').attr('x',0).attr('y',13).attr('class','lbl').attr('text-anchor','middle')
      .text(name);
    LABELS.push({el:lab.node(),x:cx,y:cy,
      pri:isTap?1e9+r.cap:(isFcTap?5e8:(tapRes?r.cap*0.02:r.cap)),
      bx0:-name.length*3.4,by0:3,bx1:name.length*3.4,by1:16,minK:isTap||isFcTap?0.1:null});
    node.on('click',ev=>{if(ev.defaultPrevented)return;
      state.selected=r.id;state.selectedNode=RESNODE[r.id]||null;commit();});
    node.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
      state.selected=r.id;state.selectedNode=RESNODE[r.id]||null;commit();}});
  });

  if(state.tap){ /* the reader's tap, marked on the map */
    const hx=px(state.tap.loc[1]),hy=py(state.tap.loc[0]);
    const hg=g.append('g').attr('transform',`translate(${hx},${hy})`);
    const hgfx=hg.append('g').attr('class','gfx');
    hgfx.append('circle').attr('r',9).attr('fill','none').attr('stroke','#EDE6D6')
      .attr('stroke-width',1.2).attr('opacity',.55);
    hgfx.append('circle').attr('r',3.4).attr('fill','#EDE6D6').attr('stroke','#071119').attr('stroke-width',1.2);
    const hlab=hg.append('g').attr('class','lab');
    hlab.append('text').attr('x',0).attr('y',-14).attr('class','lbl').attr('text-anchor','middle')
      .attr('fill','#EDE6D6').text('ZIP '+state.tap.zip+' — your tap');
    LABELS.push({el:hlab.node(),x:hx,y:hy,pri:2e9,minK:0.1,
      bx0:-62,by0:-24,bx1:62,by1:-4});
  }

  g.append('text').attr('x',PAD.l).attr('y',40).attr('class','lbl-big')
   .text((state.basin==='all'?'ALL BASINS':BASINS.find(b=>b.id===state.basin).n.toUpperCase())
     +' · '+list.length+' RESERVOIRS · '+kaf(list.reduce((s,r)=>s+r.cap,0))+' KAF CAPACITY · '+MONTHS[state.mi].toUpperCase());

  d3.select('#viewnote').text('Glasses = reservoirs (level = storage) · ◆ = USGS gages · dashed lines = tunnels under the Divide · click anything for detail · zoom in for more labels');
}

/* =====================================================================
   DRAW: FLOW — sankey ribbons with port stacking
   ===================================================================== */
function drawFlow(){
  camera.selectAll('*').remove();
  layoutFlow();
  const g=camera;
  const dimmed=id=>state.basin!=='all'&&NODE[id]&&NODE[id].sys!==state.basin;

  /* downstream reach of the selected node: everything else steps back */
  let DOWN=null;
  if(state.selectedNode&&NODE[state.selectedNode]){
    DOWN=new Set([state.selectedNode]);
    let grew=true;
    while(grew){grew=false;G.edges.forEach(e=>{if(DOWN.has(e.f)&&!DOWN.has(e.t)){DOWN.add(e.t);grew=true;}});}
  }
  const offN=id=>DOWN&&!DOWN.has(id);
  const qf=qFactor(state.mi);

  g.append('rect').attr('x',0).attr('y',0).attr('width',FW).attr('height',FH)
    .attr('fill','transparent')
    .on('click',ev=>{if(ev.defaultPrevented)return;
      if(state.selected||state.selectedNode){state.selected=null;state.selectedNode=null;commit();}});

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
  CSTEXT.push({el:sp.append('text').attr('x',SPINE-26).attr('y',72).attr('class','lbl2').attr('text-anchor','end')
    .text('◀ WEST SLOPE — Colorado River system').node(),x:SPINE-26,y:72,p:0.5});
  CSTEXT.push({el:sp.append('text').attr('x',SPINE+26).attr('y',72).attr('class','lbl2').attr('text-anchor','start')
    .text('EAST SLOPE — Platte · Arkansas · Rio Grande ▶').node(),x:SPINE+26,y:72,p:0.5});

  /* ribbons */
  const layer=g.append('g').style('mix-blend-mode','screen');
  G.edges.forEach((e,i)=>{
    const a=NODE[e.f],b=NODE[e.t];
    const y0=a.y+(e.sOff||0), y1=b.y+(e.tOff||0);
    const faded=dimmed(e.f)&&dimmed(e.t);
    const off=DOWN&&!(DOWN.has(e.f)&&DOWN.has(e.t));
    const op=off?.18:.92;
    if(e.dash){ /* tunnels and pumps: dashed stroked pipe, not a ribbon */
      const mx=(a.x+b.x)/2;
      layer.append('path')
        .attr('d',`M${a.x} ${y0} C${mx} ${y0}, ${mx} ${y1}, ${b.x} ${y1}`)
        .attr('fill','none')
        .attr('stroke',faded?'#1B3240':(state.mode==='braid'?rgb2css(blendColour(COMP[e.f])):`url(#eg${i})`))
        .attr('stroke-width',Math.min(e.W,9)).attr('stroke-linecap','round')
        .attr('stroke-dasharray','8 7').attr('class',faded||off?null:'tunanim')
        .attr('opacity',faded?.4:(off?.18:.85));
      return;
    }
    const S=sampleBump(a.x,y0,b.x,y1,26);
    if(faded){
      layer.append('path').attr('d',ribbonPath(S,e.W,0,1)).attr('fill','#152A36').attr('opacity',.5);
      return;
    }
    if(state.mode==='blend'){
      layer.append('path').attr('d',ribbonPath(S,e.W,0,1)).attr('fill',`url(#eg${i})`).attr('opacity',op);
    }else{
      const parts=sortedParts(COMP[e.f]);
      const T=parts.reduce((s,p)=>s+p[1],0)||1;
      let acc=0;
      parts.forEach(([sid,w])=>{
        const a0=acc/T, a1=(acc+w)/T; acc+=w;
        layer.append('path').attr('d',ribbonPath(S,e.W,a0,a1)).attr('fill',NODE[sid].hue).attr('opacity',op);
      });
    }
    if(!off){ /* drift dashes downstream; a release visibly speeds the march */
      const live=NODE[e.t].gage&&state.live[NODE[e.t].gage];
      const q=(live||e.q||1)*qf;
      const dur=Math.max(1.2,Math.min(8,140/Math.sqrt(q+1)));
      const mx=(a.x+b.x)/2;
      layer.append('path')
        .attr('d',`M${a.x} ${y0} C${mx} ${y0}, ${mx} ${y1}, ${b.x} ${y1}`)
        .attr('fill','none').attr('stroke','#EAF6FF').attr('opacity',.16)
        .attr('stroke-width',Math.min(3,e.W*0.25)).attr('stroke-linecap','round')
        .attr('stroke-dasharray','10 26').attr('class','flowanim')
        .style('animation-duration',dur.toFixed(2)+'s');
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
        .attr('rx',3.5).attr('fill',col).attr('stroke','#071119').attr('stroke-width',1)
        .attr('opacity',faded?.4:(offN(n.id)?.2:.95));
      if(n.l)CSTEXT.push({el:ng.append('text').attr('x',n.x).attr('y',n.y-Hn/2-8).attr('class','lbl2')
        .attr('text-anchor','middle').text(n.l).node(),x:n.x,y:n.y-Hn/2-8,p:0.5,minK:1.7,o:faded||offN(n.id)?.35:1});
      return;
    }
    if(n.k==='src'){
      ng.append('g').attr('transform',`translate(${n.x},${n.y})`).append('g').attr('class','gfx')
        .append('circle').attr('r',5.5)
        .attr('fill',faded?'#2A4757':n.hue).attr('stroke','#08131B').attr('stroke-width',1.5)
        .attr('opacity',offN(n.id)?.25:1);
      CSTEXT.push({el:ng.append('text').attr('x',n.x+off).attr('y',n.y+3.5).attr('class','lbl')
        .attr('text-anchor',anchor).text(n.l).node(),x:n.x+off,y:n.y+3.5,p:0.5,o:faded||offN(n.id)?.35:1});
      return;
    }
    if(n.k==='res'){
      const r=RESBY[n.res];if(!r)return;
      const dimRes=faded||!passesFilter(r)||offN(n.id);
      const dims=glassDims(r.cap,0.8);
      const grp=ng.append('g').attr('transform',`translate(${n.x},${n.y})`)
        .attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',r.n)
        .attr('opacity',dimRes&&!faded?.45:1);
      const gfx=grp.append('g').attr('class','gfx')
        .append('g').attr('transform',`translate(0,${dims.h/2})`); /* center vessel on the node */
      gfx.append('rect').attr('x',-dims.a-5).attr('y',-dims.h-5).attr('width',2*dims.a+10)
        .attr('height',dims.h+10).attr('rx',4).attr('fill','#071119').attr('opacity',.78);
      if(dimRes){
        gfx.append('path').attr('d',glassPathD(dims.h,dims.a,dims.b)).attr('fill','#0D1B24')
           .attr('stroke','#2A4757').attr('stroke-width',1).attr('stroke-dasharray',r.c==='est'?'2.5 2.5':null);
      }else{
        drawGlass(gfx,r,col,0.8,true);
      }
      if(state.selected===r.id)glassRing(gfx,r,0.8);
      /* storage trend: is the glass being drawn down to feed the river? */
      const dd=drawdownCfs(r,state.mi);
      const ly=dims.h/2*1.25+12;
      const lab=grp.append('g').attr('class','lab');
      lab.append('text').attr('x',0).attr('y',ly).attr('class','lbl')
        .attr('text-anchor','middle').text(n.l);
      const sub=lab.append('text').attr('x',0).attr('y',ly+11.5).attr('class','pmlbl')
        .attr('text-anchor','middle').attr('fill',ramp(pmAt(r,state.mi)))
        .text(pmAt(r,state.mi)+'%'+(dimRes?'':(dd>15?' · drawing down ~'+fmt(dd)+' cfs':(dd<-15?' · filling ~'+fmt(-dd)+' cfs':''))));
      if(!dimRes&&Math.abs(dd)>15){
        const tx=dims.a+7,ty=-dims.h*0.5;
        gfx.append('path')
          .attr('d',dd>0?`M${tx},${ty} l9,0 l-4.5,7 z`:`M${tx},${ty+7} l9,0 l-4.5,-7 z`)
          .attr('fill',dd>0?'#00D6E6':'#5C7484').attr('opacity',.95);
      }
      const nm=n.l||r.n;
      LABELS.push({el:lab.node(),x:n.x,y:n.y,pri:r.cap,sub:sub.node(),
        bx0:-nm.length*3.4,by0:ly-9,bx1:nm.length*3.4,by1:ly+4});
      if(faded)lab.attr('opacity',.35);
      grp.on('click',ev=>{if(ev.defaultPrevented)return;ev.stopPropagation();
        state.selected=r.id;state.selectedNode=n.id;commit();});
      grp.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
        state.selected=r.id;state.selectedNode=n.id;commit();}});
      return;
    }
    if(n.k==='gage'){
      const live=state.live[n.gage];
      const dimG=faded||offN(n.id);
      const grp=ng.append('g').attr('transform',`translate(${n.x},${n.y})`)
        .attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',n.l)
        .attr('opacity',dimG&&!faded?.35:1);
      grp.append('g').attr('class','gfx')
        .append('rect').attr('x',-4.5).attr('y',-4.5).attr('width',9).attr('height',9)
        .attr('fill',col).attr('stroke','#071119').attr('stroke-width',1.4)
        .attr('transform','rotate(45)');
      if(state.selectedNode===n.id&&!state.selected)
        grp.append('circle').attr('r',11).attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.3);
      const edge=G.edges.find(e=>e.t===n.id);
      const q=live!=null?live:(edge?Math.round(edge.q*qf):null);
      const lab=grp.append('g').attr('class','lab');
      lab.append('text').attr('x',0).attr('y',-17).attr('class','lbl').attr('text-anchor','middle').text(n.l);
      lab.append('text').attr('x',0).attr('y',-6).attr('class','gval').attr('text-anchor','middle')
        .attr('fill',live!=null?'#00D6E6':null)
        .text(q!=null?fmt(q)+' cfs'+(live!=null?' · live':''):'');
      if(faded)lab.attr('opacity',.35);
      LABELS.push({el:lab.node(),x:n.x,y:n.y,pri:250000,
        bx0:-n.l.length*3.4,by0:-26,bx1:n.l.length*3.4,by1:-1});
      CSTEXT.push({el:grp.append('text').attr('x',0).attr('y',17).attr('class','gid').attr('text-anchor','middle')
        .text('USGS '+n.gage).node(),x:0,y:17,p:0.5,minK:3.2});
      grp.on('click',ev=>{if(ev.defaultPrevented)return;
        state.selectedNode=n.id;state.selected=null;commit();});
      grp.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
        state.selectedNode=n.id;state.selected=null;commit();}});
      return;
    }
    if(n.k==='exit'){
      const dir=n.side==='w'?-1:1;
      const dimX=faded||offN(n.id);
      const grp=ng.append('g').attr('class','node-hit').attr('tabindex',0).attr('role','button').attr('aria-label',n.l);
      grp.append('path').attr('d',`M${n.x-10*dir} ${n.y-10} L${n.x+10*dir} ${n.y} L${n.x-10*dir} ${n.y+10} Z`)
        .attr('fill',col).attr('opacity',dimX?.3:.95);
      if(state.selectedNode===n.id&&!state.selected)
        grp.append('circle').attr('cx',n.x).attr('cy',n.y).attr('r',14).attr('fill','none').attr('stroke','#EDE6D6').attr('stroke-width',1.3);
      CSTEXT.push({el:grp.append('text').attr('x',n.x).attr('y',n.y-17).attr('class','xlbl').attr('text-anchor','middle')
        .text(n.l).node(),x:n.x,y:n.y-17,p:0.5,o:dimX?.35:1});
      CSTEXT.push({el:grp.append('text').attr('x',n.x).attr('y',n.y+23).attr('class','xq').attr('text-anchor','middle')
        .text(fmt(FLOWQ[n.id]*qFactor(state.mi))+' cfs leaving').node(),x:n.x,y:n.y+23,p:0.5,o:dimX?.35:1});
      grp.on('click',ev=>{if(ev.defaultPrevented)return;
        state.selectedNode=n.id;state.selected=null;commit();});
      grp.on('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();
        state.selectedNode=n.id;state.selected=null;commit();}});
    }
  });

  /* tunnel labels at the spine */
  G.edges.filter(e=>e.tun).forEach(e=>{
    const a=NODE[e.f],b=NODE[e.t];
    if(state.basin!=='all'&&a.sys!==state.basin&&b.sys!==state.basin)return;
    const t=(SPINE-a.x)/(b.x-a.x), y=(a.y+(e.sOff||0))+((b.y+(e.tOff||0))-(a.y+(e.sOff||0)))*t;
    ng.append('circle').attr('cx',SPINE).attr('cy',y).attr('r',3.2).attr('fill','#08131B').attr('stroke','#C7D4DA').attr('stroke-width',1.1);
    CSTEXT.push({el:ng.append('text').attr('x',SPINE+8).attr('y',y-5).attr('class','lbl').text(e.tun).node(),
      x:SPINE+8,y:y-5,p:0.5,minK:1.7});
  });

  g.append('text').attr('x',44,).attr('y',30).attr('class','lbl-big')
   .text('FLOW & MIXING · '+MONTHS[state.mi].toUpperCase()+' · RIBBON WIDTH = FLOW · COLOUR = SOURCE MIX');

  d3.select('#viewnote').text(DOWN
    ?'Showing where '+(NODE[state.selectedNode].l||'this water')+'’s water goes — everything off its downstream path is dimmed · click open water to clear'
    :state.mode==='blend'
    ?'Blend · ribbon colour is the flow-weighted mix of everything upstream · ▼ = drawing down storage · dashed = tunnel under the Divide'
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
/* storage-gauge fill split into its separate source-water colours */
function fillSegments(r,col){
  const nid=RESNODE[r.id];
  const parts=nid?sortedParts(COMP[nid]):[];
  if(parts.length<2)return `<span style="width:100%;background:${col}"></span>`;
  const T=parts.reduce((a,p)=>a+p[1],0)||1;
  return parts.map(([sid,w])=>`<span style="width:${(w/T*100).toFixed(2)}%;background:${NODE[sid].hue}" title="${NODE[sid].l} · ${(w/T*100).toFixed(0)}%"></span>`).join('');
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
        ${(()=>{const med=n.gage&&gageMedianNow(n.gage);
          if(live&&med>0){const p=Math.round(live/med*100);
            return `<tr><td class="lab">Percent of normal</td><td style="color:${ramp(p)}">${p}%</td></tr>`;}
          return '';})()}
        <tr><td class="lab">Headwaters upstream</td><td>${sortedParts(COMP[state.selectedNode]).length}</td></tr>
      </table>
      ${n.gage?'<div class="hydro" id="hydrobox"></div>':''}
      ${compBlockHTML(state.selectedNode,'What this water is')}
      <div class="prov">${live&&gageMedianNow(n.gage)>0?`<b>Live · measured flow, derived %.</b> Flow is the USGS instantaneous reading; percent of normal = that reading ÷ this gage's median for this week, built from the USGS daily record since 1991 (<span style="font-family:var(--mono)">scripts/build_normals.py</span>). `:''}<b>Composition</b> is traced edge by edge from the headwaters, with diversions taking a proportional slice — a schematic model. Base flows are typical late-July 2026 values${past?', scaled by the statewide monthly flow index for '+MONTHS[mi]:''}.</div>`;
    if(n.gage&&window.CW_HYDRO)CW_HYDRO.mount(document.getElementById('hydrobox'),{kind:'gage',site:n.gage,label:n.l});
    return;
  }
  if(state.tap&&!state.selected){
    const t=state.tap;
    const rows=t.res.map(id=>{
      const r=RESBY[id];if(!r)return'';
      const pm=pmAt(r,mi);
      return `<tr class="taprow" data-res="${id}" style="cursor:pointer">
        <td class="lab" style="text-transform:none;font-size:11px">${r.n}</td>
        <td style="color:${ramp(pm)}">${pm}%<span style="color:#8a8069;font-weight:400"> · ${kaf(stoAt(r,mi))} KAF</span></td></tr>`;
    }).join('');
    s.innerHTML=`
      <div class="tag"><span>Your water · ZIP ${t.zip}</span><span class="badge obs">tap</span></div>
      <h2>${t.city}</h2>
      <div class="sub">${t.prov}${t._approx?' · nearest mapped system':''}</div>
      ${t._approx?`<div class="prov" style="margin-top:0;margin-bottom:10px;font-size:11px">No exact provider on file for ZIP ${t.zip}, so this is the nearest system we map — your actual provider, and near the Divide sometimes the basin, may differ.</div>`:''}
      <div class="prov" style="margin-top:0;margin-bottom:12px;font-size:11px;color:#3c3a33">${t.desc}</div>
      ${t.res.length?`<div style="font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#6d6450;margin:12px 0 4px">Your reservoirs today</div>
      <table class="rows">${rows}</table>`:''}
      ${t.fcres&&t.fcres.length?`<div style="font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#6d6450;margin:12px 0 4px">The lakes you see — not your supply</div>
      <table class="rows">${t.fcres.map(id=>{const r=RESBY[id];return r?`<tr class="taprow" data-res="${id}" style="cursor:pointer">
        <td class="lab" style="text-transform:none;font-size:11px">${r.n}</td>
        <td style="color:#6d6450;font-weight:400">flood control</td></tr>`:'';}).join('')}</table>`:''}
      ${t.tun.length?`<div class="prov"><b>Crossing the Divide for you:</b> ${t.tun.join(' · ')}</div>`:''}
      <div class="prov">A simplified picture — providers blend sources and trade shares. Click a highlighted glass for its details, or <a href="#" id="tapclear2" style="color:#1A2730">clear</a> to see the whole state.</div>`;
    s.querySelectorAll('.taprow').forEach(el=>el.addEventListener('click',()=>{
      state.selected=el.dataset.res;state.selectedNode=RESNODE[el.dataset.res]||null;commit();}));
    const c2=s.querySelector('#tapclear2');
    if(c2)c2.addEventListener('click',ev=>{ev.preventDefault();clearTap();});
    return;
  }
  if(!state.selected){
    s.innerHTML=`<div class="tag"><span>Data sheet</span><span>—</span></div>
      <div class="empty">Click a reservoir for its storage against the 1991–2020 normal, or a gage diamond on the flow view to see what that water is made of.
      <br><br>Enter your ZIP code above the map to light up the reservoirs and tunnels behind your own tap — or open the <a href="timeline.html" style="color:#1A2730">timeline</a> to watch the 2026 drought arrive month by month.</div>`;
    return;
  }
  const r=RESBY[state.selected];
  const sto=stoAt(r,mi), pm=pmAt(r,mi);
  const fill=sto/r.cap*100, med=medianFullPct(r,mi);
  const deficit=pm?Math.round(sto/(pm/100)-sto):null;
  const lv=!past&&LIVE_STO[r.id];
  const badge=r.fc?`<span class="badge est">flood control</span>`
    :lv?`<span class="badge obs">live</span>`
    :r.c==='obs'&&!past?`<span class="badge obs">measured</span>`
    :`<span class="badge est">${past?'reconstructed':'basin estimate'}</span>`;
  const col=resColour(r.id), nid=RESNODE[r.id];
  s.innerHTML=`
    <div class="tag"><span>${BASINS.find(b=>b.id===r.b).n}</span>${badge}</div>
    <h2>${r.n}</h2>
    <div class="sub">on the ${r.r} · ${MONTHS[mi]}</div>
    <div class="gauge">
      <div class="gaugebar">
        <div class="gaugefill" style="width:${Math.min(100,fill).toFixed(1)}%">${fillSegments(r,col)}</div>
        ${r.fc?'':`<div class="gaugemed" style="left:${Math.min(100,med).toFixed(1)}%"></div>`}
      </div>
      <div class="gaugelbl"><span>${fill.toFixed(0)}% full</span><span>${r.fc?'of the permanent pool':'normal: '+med.toFixed(0)+'%'}</span></div>
    </div>
    <table class="rows">
      <tr><td class="lab">Storage</td><td>${fmt(sto)} AF</td></tr>
      <tr><td class="lab">${r.fc?'Permanent pool':'Capacity'}</td><td>${fmt(r.cap)} AF</td></tr>
      ${r.fc?`<tr><td class="lab">Role</td><td>flood control · USACE</td></tr>`
        :`<tr><td class="lab">Percent of normal</td><td style="color:${ramp(pm)}">${pm}%</td></tr>`}
      ${!r.fc&&deficit>0?`<tr><td class="lab">Below normal by</td><td>${fmt(deficit)} AF</td></tr>`:''}
      <tr><td class="lab">Reading</td><td>${past?'basin-scaled':(lv?lv.asOf+' · live':(r.d||'1 Jun 2026 basin'))}</td></tr>
      ${(()=>{
        const dd=drawdownCfs(r,mi);
        if(dd>15)return `<tr><td class="lab">Storage trend</td><td style="color:#8a3a1d">drawing down ~${fmt(dd)} cfs</td></tr>`;
        if(dd<-15)return `<tr><td class="lab">Storage trend</td><td style="color:#1d5c4a">filling ~${fmt(-dd)} cfs</td></tr>`;
        return '';
      })()}
    </table>
    <div class="hydro" id="hydrobox"></div>
    <div class="prov">${r.fc
      ? `<b>Flood control</b> A U.S. Army Corps of Engineers dam — nobody drinks from this lake. The pool shown${lv?' (live via DWR '+r.dwr+', read '+lv.asOf+')':''} is the small permanent one kept for recreation and sediment; the dam's far larger flood space sits empty on purpose, waiting for a storm. It's on this map because you see it from the highway — and because the water you <b>do</b> drink is somewhere else entirely.`
      : past
      ? `<b>Timeline mode</b> — storage rescaled by the ${BASINS.find(b=>b.id===r.b).n} basin's NRCS monthly percent of median (interpolated between reports). A reconstruction of basin conditions, not a gage record for this reservoir.`
      : lv
        ? `<b>Live · measured storage, derived %.</b> Storage from Colorado DWR telemetry (station ${r.dwr}), read ${lv.asOf}. ${resMedianNow(r)?`Percent of normal = that reading ÷ this reservoir's own median for this week of the year, built from CDSS daily storage since 2005 (<span style="font-family:var(--mono)">scripts/build_normals.py</span>).`:`Percent of normal compares to the basin's NRCS median.`}`
      : r.c==='obs'
        ? `<b>Source</b> ${r.s}. Storage as published for ${r.d}. Percent of normal compares to the NRCS 1991–2020 median for this calendar day.`
        : `<b>Estimate</b> No same-day public reading was available; scaled to the basin's reported percent of median (NRCS, 1 June 2026).`}</div>
    ${state.tap?`<div class="prov"><a href="#" id="backtap" style="color:#1A2730">← back to your water (ZIP ${state.tap.zip})</a></div>`:''}`;
  const bt=s.querySelector('#backtap');
  if(bt)bt.addEventListener('click',ev=>{ev.preventDefault();
    state.selected=null;state.selectedNode=null;commit();});
  if(window.CW_HYDRO)CW_HYDRO.mount(document.getElementById('hydrobox'),{kind:'res',r});
}

/* =====================================================================
   CHROME
   ===================================================================== */
/* monthly series behind a headline stat, so the tile shows its own trend */
function statSeries(kind){
  if(kind==='flow')return FLOWPCT.slice();
  if(kind==='denver')return MONTHS.map((_,i)=>(PMH.colorado[i]+PMH.platte[i])/2);
  if(kind==='storage'){
    const capB={};RES.forEach(r=>{if(!r.fc)capB[r.b]=(capB[r.b]||0)+r.cap;});
    return MONTHS.map((_,i)=>{
      let num=0,den=0;
      for(const b in PMH){const c=capB[b]||0;num+=PMH[b][i]*c;den+=c;}
      return den?num/den:0;
    });
  }
  return null;
}
/* SPARKCOL, sparkSVG — relocated to js/data.js (shared with story.js) */
function renderStrip(){
  const el=document.getElementById('strip');if(!el)return;
  el.innerHTML=STATEWIDE.map(s=>{
    const series=s.spark?statSeries(s.spark):null;
    return `<div class="stat"><div class="k">${s.k}</div><div class="v ${s.cls}">${s.v}</div>`
      +`<div class="n">${s.n}</div>`
      +(series?`<div class="spark" title="Oct 2025 → Jul 2026">${sparkSVG(series,SPARKCOL[s.cls]||'#8DA4B0')}</div>`:'')
      +`</div>`;
  }).join('');
}
function renderChips(){
  const box=d3.select('#chips');
  if(box.empty())return;
  box.selectAll('*').remove();
  box.selectAll('button').data(BASINS).join('button')
    .attr('class','chip').attr('aria-pressed',d=>String(d.id===state.basin)).text(d=>d.n)
    .on('click',(ev,d)=>{state.basin=d.id;renderChips();pushHistory();draw();zoomToBasin();});
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
  const el=document.getElementById('huekey');if(!el)return;
  el.innerHTML=Object.entries(used).map(([c,v])=>
    `<div class="keyrow"><span class="swatch" style="background:${c}"></span>${v}</div>`).join('');
}
/* ---- mobile per-ZIP list (the map is hard to use on a phone) ---- */
function miniGlass(r){
  const frac=Math.max(0,Math.min(1,stoAt(r,state.mi)/r.cap));
  const col=r.fc?'#8DA4B0':ramp(pmAt(r,state.mi));
  const topY=3,botY=30,rim=11,base=6,cx=14,WD=28,fillTop=(botY-(botY-topY)*frac).toFixed(1);
  const path=`M${cx-rim},${topY} L${cx-base},${botY} Q${cx-base},${botY+2} ${cx-base+2},${botY+2} `
    +`L${cx+base-2},${botY+2} Q${cx+base},${botY+2} ${cx+base},${botY} L${cx+rim},${topY} Z`;
  const cid='zl'+r.id;
  return `<svg width="${WD}" height="34" viewBox="0 0 ${WD} 34" aria-hidden="true">`
    +`<defs><clipPath id="${cid}"><path d="${path}"/></clipPath></defs>`
    +`<path d="${path}" fill="#0A1620" stroke="#54798C" stroke-width="1"/>`
    +`<rect x="0" y="${fillTop}" width="${WD}" height="34" fill="${col}" opacity=".95" clip-path="url(#${cid})"/>`
    +`<path d="${path}" fill="none" stroke="#54798C" stroke-width="1"/></svg>`;
}
function renderZipList(){
  const el=document.getElementById('ziplist'); if(!el||typeof GAGE_META==='undefined')return;
  const t=state.tap;
  let head, resIds, fcIds=[], gageSites;
  if(t){
    head=`Your water · ZIP ${t.zip} · ${t.prov}`;
    resIds=(t.res||[]); fcIds=(t.fcres||[]);
    gageSites=Object.keys(GAGE_META).filter(s=>GAGE_META[s].basin===t.hb);
  }else{
    const b=state.basin;
    head=b==='all'?'All Colorado — largest reservoirs':BASINS.find(x=>x.id===b).n+' basin';
    resIds=RES.filter(r=>(b==='all'||r.b===b)&&!r.fc).slice().sort((a,c)=>c.cap-a.cap).slice(0,14).map(r=>r.id);
    gageSites=Object.keys(GAGE_META).filter(s=>b==='all'||GAGE_META[s].basin===b);
  }
  const resRow=id=>{const r=RESBY[id];if(!r)return'';const pm=pmAt(r,state.mi);
    return `<button class="zl-row" data-res="${id}"><span class="zl-g">${miniGlass(r)}</span>`
      +`<span class="zl-n">${r.n.replace(/ (Reservoir|Res\.|Lake)$/,'')}</span>`
      +`<span class="zl-p" style="color:${r.fc?'#8DA4B0':ramp(pm)}">${r.fc?'flood':pm+'%'}</span></button>`;};
  const gageRow=s=>{const nid=GAGE_NODE[s],live=state.live[s];
    const med=(typeof gageMedianNow==='function')?gageMedianNow(s):null;
    const pct=(live!=null&&med>0)?Math.round(live/med*100):null;
    const nm=GAGE_META[s].name.split(/,| At | Near | Below | Nr /i)[0].trim();
    return `<button class="zl-row zl-gage" data-node="${nid||''}"><span class="zl-g zl-dia">◆</span>`
      +`<span class="zl-n">${nm}</span>`
      +`<span class="zl-p" style="color:${pct!=null?ramp(pct):'#5C7484'}">`
      +`${pct!=null?pct+'%':(live!=null?Math.round(live)+' cfs':'gage')}</span></button>`;};
  el.innerHTML=`<div class="zl-head">${head}</div>`
    +(resIds.length?`<div class="zl-sec">Reservoirs</div>`+resIds.map(resRow).join(''):'')
    +(fcIds.length?`<div class="zl-sec">Flood-control lakes you see</div>`+fcIds.map(resRow).join(''):'')
    +(gageSites.length?`<div class="zl-sec">Streamgages</div>`+gageSites.map(gageRow).join(''):'');
  const focusSheet=()=>{const s=document.getElementById('sheet');if(s)s.scrollIntoView({behavior:'smooth',block:'start'});};
  el.querySelectorAll('.zl-row[data-res]').forEach(b=>b.addEventListener('click',()=>{
    state.selected=b.dataset.res;state.selectedNode=RESNODE[b.dataset.res]||null;commit();focusSheet();}));
  el.querySelectorAll('.zl-row[data-node]').forEach(b=>b.addEventListener('click',()=>{
    if(!b.dataset.node)return;state.selected=null;state.selectedNode=b.dataset.node;commit();focusSheet();}));
}

function draw(){
  LABELS=[];CSTEXT=[];
  if(state.view==='map')drawMap(); else drawFlow();
  applyZoom();lastPass=0;labelPass();
  renderZipList();
}
/* fullscreen the map+sheet stage */
d3.select('#z-fs').on('click',()=>{
  const stage=document.querySelector('.stage');if(!stage)return;
  const on=stage.classList.toggle('fs');
  document.body.classList.toggle('fs-on',on);
  setTimeout(()=>{setViewBox();applyZoom();lastPass=0;labelPass();},80);
});
function setView(v,push){
  state.view=v;
  d3.select('#btn-map').attr('aria-pressed',String(v==='map'));
  d3.select('#btn-flow').attr('aria-pressed',String(v==='flow'));
  const mw=document.getElementById('modewrap');if(mw)mw.style.display=v==='flow'?'flex':'none';
  setViewBox();zoomReset(false);draw();
  if(state.basin!=='all')zoomToBasin();
  if(push)pushHistory();
}
d3.select('#btn-map').on('click',()=>setView('map',true));
d3.select('#btn-flow').on('click',()=>setView('flow',true));
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

/* timeline — present only on timeline.html; guarded elsewhere */
const slider=document.getElementById('tslider'), monthlbl=document.getElementById('monthlbl');
function setMonth(mi){
  state.mi=mi;
  if(slider)slider.value=mi;
  if(monthlbl)monthlbl.innerHTML='<small>storage timeline</small>'+MONTHS[mi];
  replaceHistory();draw();renderSheet();
}
if(slider)slider.addEventListener('input',()=>setMonth(+slider.value));
const playBtn=document.getElementById('play');
if(playBtn)playBtn.addEventListener('click',()=>{
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

/* =====================================================================
   URL STATE — the map's navigable state lives in the location hash, so
   the browser Back button walks selections/ZIP/view and links are
   shareable. Selection & tap actions pushState; restore never pushes.
   ===================================================================== */
let restoring=false;
function stateHash(){
  const p=[];
  if(state.tap)p.push('zip='+state.tap.zip);
  if(state.view==='flow')p.push('view=flow');
  if(state.basin!=='all')p.push('basin='+state.basin);
  if(state.selected)p.push('r='+state.selected);
  else if(state.selectedNode)p.push('n='+state.selectedNode);
  if(slider&&state.mi!==NOW)p.push('m='+state.mi);
  return p.join('&');
}
function writeHistory(replace){
  if(restoring)return;
  const h=stateHash(),url=location.pathname+(h?'#'+h:'');
  try{replace?history.replaceState(null,'',url):history.pushState(null,'',url);}catch(e){}
}
function pushHistory(){writeHistory(false);}
function replaceHistory(){writeHistory(true);}
function commit(){pushHistory();draw();renderSheet();}
function syncControls(){
  d3.select('#btn-map').attr('aria-pressed',String(state.view==='map'));
  d3.select('#btn-flow').attr('aria-pressed',String(state.view==='flow'));
  const mw=document.getElementById('modewrap');if(mw)mw.style.display=state.view==='flow'?'flex':'none';
  renderChips();
  const zc=document.getElementById('zipclear');if(zc)zc.style.display=state.tap?'':'none';
  if(zipInput&&state.tap)zipInput.value=state.tap.zip;
  if(slider)slider.value=state.mi;
  if(monthlbl)monthlbl.innerHTML='<small>storage timeline</small>'+MONTHS[state.mi];
}
function restoreFromHash(){
  const raw=location.hash.replace(/^#/,'');
  const q={};
  if(/^\d{5}$/.test(raw))q.zip=raw; /* legacy /#80302 links */
  else raw.split('&').forEach(kv=>{const i=kv.indexOf('=');if(i>0)q[kv.slice(0,i)]=decodeURIComponent(kv.slice(i+1));});
  restoring=true;
  const t=q.zip&&/^\d{5}$/.test(q.zip)?zipLookup(q.zip):null;
  state.tap=t?Object.assign({zip:q.zip},t):null;
  state.basin=(q.basin&&BASINS.some(b=>b.id===q.basin))?q.basin:'all';
  state.selected=(q.r&&RESBY[q.r])?q.r:null;
  state.selectedNode=state.selected?(RESNODE[state.selected]||null):((q.n&&NODE[q.n])?q.n:null);
  state.mi=(q.m!=null&&+q.m>=0&&+q.m<=NOW)?+q.m:NOW;
  state.view=(q.view==='flow')?'flow':'map';
  restoring=false;
  syncControls();
  setViewBox();draw();renderSheet();
  if(state.tap)frameTap(state.tap);
  else if(state.basin!=='all')zoomToBasin();
  else zoomReset(false);
}
window.addEventListener('popstate',restoreFromHash);

/* =====================================================================
   YOUR TAP — ZIP lookup: longest matching prefix in TAPS wins
   ===================================================================== */
/* zipLookup — relocated to js/data.js (shared with story.js) */
function zipMsg(txt){const el=document.getElementById('zipmsg');if(el)el.textContent=txt;}
function frameTap(t){
  const pts=(t.res||[]).concat(t.fcres||[]).map(id=>RESBY[id]).filter(Boolean)
    .map(r=>[px(r.lon),py(r.lat)]).concat([[px(t.loc[1]),py(t.loc[0])]]);
  if(!pts.length)return;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),m=70;
  zoomToBBox(Math.min(...xs)-m,Math.min(...ys)-m,Math.max(...xs)+m,Math.max(...ys)+m);
}
function applyTap(zip){
  if(!/^\d{5}$/.test(zip)){zipMsg('five digits, e.g. 80302');return;}
  const t=zipLookup(zip);
  if(!t){
    zipMsg(/^8[01]/.test(zip)
      ?'don’t have that ZIP mapped yet — try your nearest larger town'
      :'this map covers Colorado — but wherever you are, your tap has a watershed too');
    return;
  }
  state.tap=Object.assign({zip},t);
  zipMsg('');
  const zc=document.getElementById('zipclear');if(zc)zc.style.display='';
  state.selected=null;state.selectedNode=null;
  if(state.view!=='map')setView('map');else draw();
  renderSheet();
  frameTap(state.tap);
  pushHistory();
}
function clearTap(){
  state.tap=null;state.selected=null;state.selectedNode=null;
  const zc=document.getElementById('zipclear');if(zc)zc.style.display='none';
  zipMsg('');
  draw();renderSheet();zoomReset(true);
  pushHistory();
}
const zipInput=document.getElementById('zip');
if(zipInput){
  const zg=document.getElementById('zipgo');if(zg)zg.addEventListener('click',()=>applyTap(zipInput.value.trim()));
  zipInput.addEventListener('keydown',ev=>{if(ev.key==='Enter')applyTap(zipInput.value.trim());});
  const zc=document.getElementById('zipclear');if(zc)zc.addEventListener('click',clearTap);
}

/* boot — live fetches are wired up in js/live.js */
renderStrip();renderChips();renderLegend();
setViewBox();
if(location.hash)restoreFromHash();
else{renderSheet();draw();}
