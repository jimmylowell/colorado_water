"use strict";
/* =====================================================================
   HISTORY CHARTS — the story page's chart engine, built on the vendored
   d3 (scales + selections) with the shared interaction layer from
   js/charts.js: every chart gets a pointer/keyboard crosshair or
   per-mark tooltips, and a table view. Data is baked in js/normals.js
   (SNOW_DECADES, POWELL_ANNUAL, SNOW_BASIN, BASIN_BANDS), so everything
   here still works from file://; d3 is vendored, never fetched.

   CONTRACT: story.js emits <div class="cw-mount" data-cw="…"> markers
   inside its innerHTML, then calls CW_HISTORY.mountAll(root). Charts
   build real DOM in place, which is what lets the listeners survive.

   COLOUR RULES (validated, not eyeballed — see the dataviz checks):
   - Decades are an ORDINAL series, so they take one hue on a monotone
     lightness ramp (DECRAMP): the reader sees the order in the colour and
     never has to match five labels to five look-alike marks. That works for
     the decade BARS; it does not work for five overlapping seasonal curves,
     which is why the curve chart draws only the first and last decade.
   - "This year" is the EMPHASIS series and takes the warm accent, which is
     the one thing on the page far enough from the cyan ramp to never be
     confused with a decade (OKLab ΔE ≈ 30 vs ≈ 10 between ramp steps).
   - "Normal" reference lines are neutral + dashed in every chart, so hue is
     free to mean "this year" and the baseline reads the same way everywhere.
   - NO dual-axis charts. Two measures on different scales get two stacked
     panels sharing an x-axis — aligning two y-scales invents a correlation.
   ===================================================================== */
(function(){
const {PAL,fmtAF,fmtTick,niceTop,crosshair,markHover,dataTable}=window.CW_CHARTS;
const DECRAMP=PAL.DECRAMP, THENCOL=PAL.THEN, NOWDEC=PAL.NOWDEC, NOWCOL=PAL.NOW,
      REFCOL=PAL.REF, SNOWCOL=PAL.SNOW, STORECOL=PAL.STORE, GRID=PAL.GRID;

/* ---------- water-year x-axis shared by the seasonal charts ----------
   Weeks since Oct 1, so the chart reads left-to-right as one season. */
const WYW=365/7;                                    /* 52.14 weeks */
const MON=['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'];
const MONSTART=[0,31,61,92,123,151,182,212,243,273,304,335].map(d=>d/7);
/* today's position in the water year, in weeks since Oct 1 */
function nowWeek(d){
  d=d||new Date();
  const y=d.getMonth()>=9?d.getFullYear():d.getFullYear()-1;
  return Math.max(0,Math.min(WYW,(d-new Date(y,9,1))/6048e5));
}
/* a water-year week index as a readable date ("wk of May 3") */
const wkLabel=i=>'wk of '+new Date(2000,9,4+i*7)
  .toLocaleDateString('en-US',{month:'short',day:'numeric'});
const inch=v=>v==null?'—':fmtTick(v)+'″';

/* =====================================================================
   SNOWPACK BY DECADE — the climate signal, with the water-year calendar
   folded in rather than sitting in a chart of its own.

   The calendar used to be a separate band chart that only restated its own
   labels. Here the same three seasons divide THIS plot, so the snow curve
   visibly does what the labels claim: it climbs through the accumulation
   season, collapses through the melt season, and is gone by draw-down.
   ===================================================================== */
function snowStateChart(el){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec){el.innerHTML=snowStateFallback();return;}
  const keys=Object.keys(D.dec).sort();
  const W=680,H=336,padL=40,padR=58,padT=54,padB=46;
  const iw=W-padL-padR, ih=H-padT-padB, base=padT+ih;
  const X=d3.scaleLinear().domain([0,WYW]).range([padL,padL+iw]);
  const all=keys.map(k=>D.dec[k].wk).concat([D.cur]).flat().filter(v=>v!=null);
  const top=niceTop(Math.max(...all)*1.02,4);
  const Y=d3.scaleLinear().domain([0,top]).range([base,padT]);
  const wkLine=d3.line().defined(v=>v!=null)
    .x((v,i)=>X(i+0.5)).y(v=>Y(Math.max(0,v)));
  const oldK=keys[0], newK=keys[keys.length-1];
  const oldW=D.dec[oldK].wk, newW=D.dec[newK].wk;

  const svg=d3.select(el).html('').append('svg')
    .attr('class','histchart').attr('viewBox',`0 0 ${W} ${H}`)
    .attr('preserveAspectRatio','xMidYMid meet').attr('role','img')
    .attr('aria-label',`Colorado snowpack across the water year, by decade. Median peak snow-water equivalent falls from `
      +`${D.dec[oldK].peak} inches in the ${oldK} to ${D.dec[newK].peak} inches in the `
      +`${newK}, and this water year peaked at ${D.curStats?D.curStats.peak:'?'} inches.`);

  /* --- the water year's three seasons, as the plot's own background --- */
  const APR=MONSTART[6], JUL=MONSTART[9];
  svg.append('rect').attr('x',X(APR)).attr('y',padT)
    .attr('width',X(JUL)-X(APR)).attr('height',ih)
    .attr('fill',PAL.SEASON.band).attr('opacity',0.06);
  [APR,JUL].forEach(w=>svg.append('line')
    .attr('x1',X(w)).attr('x2',X(w)).attr('y1',padT).attr('y2',base)
    .attr('stroke',PAL.SEASON.rule));
  [[0,APR,'Snow accumulates'],[APR,JUL,'Melt → reservoirs fill'],[JUL,WYW,'Draw-down']]
    .forEach(([a,b,t])=>svg.append('text').attr('class','wc-band')
      .attr('x',(X(a)+X(b))/2).attr('y',padT-9).attr('text-anchor','middle').text(t));

  /* --- axes --- */
  for(let v=0;v<=top;v+=top/4){
    svg.append('line').attr('x1',padL).attr('x2',W-padR)
      .attr('y1',Y(v)).attr('y2',Y(v)).attr('stroke',GRID);
    svg.append('text').attr('class','hc-ax').attr('x',padL-6).attr('y',Y(v)+3)
      .attr('text-anchor','end').text(fmtTick(v)+'″');
  }
  MON.forEach((m,i)=>svg.append('text').attr('class','hc-ax')
    .attr('x',(X(MONSTART[i])+X(i===11?WYW:MONSTART[i+1]))/2).attr('y',base+15)
    .attr('text-anchor','middle').text(m));

  /* --- then, now, and the gap between ---
     All five decades drawn here tangled into an unreadable braid: they sit
     within a few inches of each other and no ramp separates five overlapping
     curves at this size. So this chart carries the two ENDS — the shape of a
     1980s season against a 2020s one — and shades the gap, which is the loss
     itself. The full decade-by-decade progression is the bar chart below,
     where five values do separate cleanly. */
  const both=[];
  for(let i=0;i<52;i++) if(oldW[i]!=null&&newW[i]!=null) both.push(i);
  if(both.length>1){
    const fwd=both.map(i=>X(i+0.5).toFixed(1)+','+Y(oldW[i]).toFixed(1)).join('L');
    const bck=both.slice().reverse().map(i=>X(i+0.5).toFixed(1)+','+Y(newW[i]).toFixed(1)).join('L');
    svg.append('path').attr('d',`M${fwd}L${bck}Z`).attr('fill',NOWDEC).attr('opacity',0.12);
  }
  [[oldK,THENCOL],[newK,NOWDEC]].forEach(([k,col])=>{
    svg.append('path').attr('d',wkLine(D.dec[k].wk)).attr('fill','none')
      .attr('stroke',col).attr('stroke-width',2.1).attr('vector-effect','non-scaling-stroke');
  });
  /* direct-labelled in early May, where the two have pulled furthest apart */
  const LBL=31.5;
  [[oldK,THENCOL,-7,'start'],[newK,NOWDEC,15,'end']].forEach(([k,col,dy,anchor])=>{
    const v=D.dec[k]&&D.dec[k].wk[Math.round(LBL)];
    if(v==null)return;
    svg.append('text').attr('class','hc-lbl').attr('fill',col)
      .attr('x',X(LBL)+(anchor==='end'?-7:7)).attr('y',Y(v)+dy)
      .attr('text-anchor',anchor).text(k);
  });

  /* --- this water year, the emphasis series --- */
  if(D.cur&&D.cur.some(v=>v!=null)){
    svg.append('path').attr('d',wkLine(D.cur)).attr('fill','none')
      .attr('stroke',NOWCOL).attr('stroke-width',2.6).attr('vector-effect','non-scaling-stroke');
    const pk=D.curStats;
    if(pk&&D.cur[pk.peakWk]!=null){
      svg.append('circle').attr('cx',X(pk.peakWk+0.5)).attr('cy',Y(D.cur[pk.peakWk]))
        .attr('r',3.4).attr('fill',NOWCOL);
      /* The annotation goes in the empty top-left of the plot, not beside the
         point: early winter is the one region no curve occupies, and the ember
         colour ties it to its line without a leader. */
      svg.append('text').attr('class','hc-lbl').attr('fill',NOWCOL)
        .attr('x',X(0.6)).attr('y',padT+22)
        .text(`WY${D.curWY} — peak ${pk.peak}″${pk.apr1!=null?`, ${pk.apr1}″ left on 1 April`:''}`);
    }
  }

  /* --- you are here --- */
  const nw=nowWeek();
  svg.append('line').attr('x1',X(nw)).attr('x2',X(nw)).attr('y1',padT-2).attr('y2',base)
    .attr('stroke',PAL.BONE).attr('stroke-width',1.2).attr('opacity',0.85);
  svg.append('circle').attr('cx',X(nw)).attr('cy',padT-2).attr('r',2.6).attr('fill',PAL.BONE);
  svg.append('text').attr('class','wc-now')
    .attr('x',X(nw)+(nw>WYW*0.8?-5:5)).attr('y',padT+9)
    .attr('text-anchor',nw>WYW*0.8?'end':'start').text('today');

  /* --- legend --- */
  const lg=svg.append('g').attr('transform',`translate(${padL},16)`);
  [[0,THENCOL,2.1,`${oldK} median`],[126,NOWDEC,2.1,`${newK} median`],
   [252,NOWCOL,2.6,'this water year']].forEach(([x,col,w,t])=>{
    lg.append('line').attr('x1',x).attr('x2',x+20).attr('y1',-4).attr('y2',-4)
      .attr('stroke',col).attr('stroke-width',w);
    lg.append('text').attr('class','hc-lgd').attr('x',x+25).attr('y',0).text(t);
  });

  /* --- crosshair: the season, week by week --- */
  crosshair(svg.node(),{
    count:52, y0:padT, y1:base,
    container:el.closest('.lr-chart')||el,
    indexAt:vx=>{
      const i=Math.round((vx-padL)/iw*WYW-0.5);
      return isFinite(i)?Math.max(0,Math.min(51,i)):0;
    },
    info:i=>{
      if(!(i>=0&&i<52))return null;
      const rows=[
        `${oldK} median <b>${inch(oldW[i])}</b>`,
        `${newK} median <b>${inch(newW[i])}</b>`,
        `WY${D.curWY} <b>${inch(D.cur?D.cur[i]:null)}</b>`];
      return {x:X(i+0.5),
        html:`<div class="tt-h">${wkLabel(i)}</div><div class="tt-d">${rows.join('<br>')}</div>`,
        label:`${wkLabel(i)}: ${oldK} ${inch(oldW[i])}, ${newK} ${inch(newW[i])}, this year ${inch(D.cur?D.cur[i]:null)}`};
    }
  });
}

/* Median peak snowpack, decade by decade — the progression the seasonal chart
   deliberately leaves out. Five values as columns separate cleanly where five
   overlapping curves could not, and an ordinal ramp puts the order in the
   colour as well as the position. */
function snowDecadeBars(el){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec){el.innerHTML='';return;}
  const keys=Object.keys(D.dec).sort();
  const cur=D.curStats;
  const bars=keys.map((k,i)=>({k,v:D.dec[k].peak,n:D.dec[k].n,
    col:DECRAMP[Math.round(i/(keys.length-1||1)*(DECRAMP.length-1))]}));
  if(cur)bars.push({k:'WY'+D.curWY,v:cur.peak,col:NOWCOL,now:true});
  const W=680,H=196,padL=40,padR=14,padT=30,padB=40;
  const iw=W-padL-padR, ih=H-padT-padB, base=padT+ih;
  const top=niceTop(Math.max(...bars.map(b=>b.v))*1.02,4);
  const Y=d3.scaleLinear().domain([0,top]).range([base,padT]);
  const slot=iw/bars.length, bw=Math.min(64,slot-16);
  const ref=bars[0].v;

  const svg=d3.select(el).html('').append('svg')
    .attr('class','histchart').attr('viewBox',`0 0 ${W} ${H}`)
    .attr('preserveAspectRatio','xMidYMid meet').attr('role','img')
    .attr('aria-label',`Median peak snowpack by decade: ${bars.map(b=>b.k+' '+b.v+' inches').join(', ')}.`);

  for(let v=0;v<=top;v+=top/4){
    svg.append('line').attr('x1',padL).attr('x2',W-padR)
      .attr('y1',Y(v)).attr('y2',Y(v)).attr('stroke',GRID);
    svg.append('text').attr('class','hc-ax').attr('x',padL-6).attr('y',Y(v)+3)
      .attr('text-anchor','end').text(fmtTick(v)+'″');
  }
  /* the 1980s level carried across, so every later bar is read against it */
  svg.append('line').attr('x1',padL).attr('x2',W-padR)
    .attr('y1',Y(ref)).attr('y2',Y(ref)).attr('stroke',THENCOL)
    .attr('stroke-dasharray','4 3').attr('opacity',0.8);

  const g=svg.selectAll('g.bar').data(bars).enter().append('g');
  g.each(function(b,i){
    const sel=d3.select(this);
    const x=padL+i*slot+(slot-bw)/2, ty=Y(b.v), r=4;
    /* rounded data-end, square to the baseline */
    sel.append('path').attr('fill',b.col).attr('d',
      `M${x.toFixed(1)},${base} L${x.toFixed(1)},${(ty+r).toFixed(1)} Q${x.toFixed(1)},${ty.toFixed(1)} ${(x+r).toFixed(1)},${ty.toFixed(1)}`
      +` L${(x+bw-r).toFixed(1)},${ty.toFixed(1)} Q${(x+bw).toFixed(1)},${ty.toFixed(1)} ${(x+bw).toFixed(1)},${(ty+r).toFixed(1)}`
      +` L${(x+bw).toFixed(1)},${base} Z`);
    /* value inside the bar top: above it, the labels collided with the
       1980s reference rule */
    sel.append('text').attr('class','hc-barval').attr('x',x+bw/2).attr('y',ty+15)
      .attr('text-anchor','middle').text(fmtTick(b.v)+'″');
    sel.append('text').attr('class','hc-ax').attr('x',x+bw/2).attr('y',base+15)
      .attr('text-anchor','middle').text(b.k);
    if(b.n&&b.n<10)sel.append('text').attr('class','hc-ax').attr('x',x+bw/2)
      .attr('y',base+26).attr('text-anchor','middle').text(b.n+' yrs');
    if(b.now)sel.append('text').attr('class','hc-ax').attr('x',x+bw/2)
      .attr('y',base+26).attr('text-anchor','middle').text('so far');
    /* the hit target is the full slot height, far bigger than the mark */
    const delta=b.now||i===0?null:Math.round((b.v/ref-1)*100);
    sel.append('rect').attr('x',padL+i*slot).attr('y',padT)
      .attr('width',slot).attr('height',ih).attr('fill','transparent')
      .attr('tabindex',0)
      .attr('aria-label',`${b.k}: median peak ${b.v} inches`
        +(delta!=null?`, ${delta}% vs the ${keys[0]}`:''))
      .attr('data-tip',`<div class="tt-h">${b.k}${b.now?' (so far)':''}</div>`
        +`<div class="tt-d">median peak <b>${inch(b.v)}</b>`
        +(b.n?`<br>${b.n} water years`:'')
        +(delta!=null?`<br>vs ${keys[0]}: <b>${delta>0?'+':''}${delta}%</b>`:'')
        +`</div>`);
  });
  svg.append('text').attr('class','hc-ax').attr('fill',THENCOL)
    .attr('x',W-padR).attr('y',Y(ref)-6).attr('text-anchor','end').text(keys[0]+' level');
  markHover(el,{container:el.closest('.lr-chart')||el});
}

/* The numbers behind the decade chart — the table view, so no value in that
   plot is reachable only by matching a colour. */
function snowDecadeTable(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec)return '';
  const keys=Object.keys(D.dec).sort();
  const wkDate=w=>{const d=new Date(2001,9,1); d.setDate(d.getDate()+w*7+3);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  const row=(lab,st,sub)=>[
    lab+(sub?` <span class="dt-sub">${sub}</span>`:''),
    st.peak+'″', wkDate(st.peakWk), st.apr1==null?'—':st.apr1+'″'];
  const first=D.dec[keys[0]], last=D.dec[keys[keys.length-1]];
  const drop=Math.round((1-last.peak/first.peak)*100);
  const rows=keys.map(k=>row(k,D.dec[k],D.dec[k].n<10?`(${D.dec[k].n} yrs)`:''));
  if(D.curStats)rows.push(row('WY'+D.curWY,D.curStats,'so far'));
  return dataTable({
    id:'tbl-decades',
    caption:`Median across each decade's water years, from one fixed panel of `
      +`${D.n} SNOTEL sites (${D.elev?D.elev[0].toLocaleString('en-US')+'–'+D.elev[1].toLocaleString('en-US')+' ft':''}) `
      +`that have reported in every year since ${first.y0}.`,
    head:['Decade','Peak snowpack','Peak date','April 1'],
    rows,
    note:`Median peak snowpack fell <b>${drop}%</b> from the ${keys[0]} to the `
      +`${keys[keys.length-1]} (${first.peak}″ → ${last.peak}″). The ${keys[keys.length-1]} covers `
      +`${last.n} water years, so it is the least settled figure here.`
  });
}

/* Pre-SNOW_DECADES fallback: this year against the normal, no decades. */
function snowStateFallback(){
  if(typeof SNOW_BASIN==='undefined')return '';
  const ids=Object.keys(SNOW_BASIN); if(!ids.length)return '';
  const mean=(key,i)=>{let s=0,n=0;ids.forEach(b=>{const v=SNOW_BASIN[b][key][i];
    if(v!=null){s+=v;n++;}});return n?s/n:null;};
  const cur=[],nrm=[];
  for(let i=0;i<10;i++){cur.push(mean('cur',i));nrm.push(mean('nrm',i));}
  return panelChart([{title:'Snowpack · snow-water equivalent',unit:'″',
    cur:cur,nrm:nrm,col:SNOWCOL,area:true}],'Statewide snowpack across the water year.');
}

/* =====================================================================
   LAKE POWELL — annual end-of-September storage, 1963→now, against the
   two elevations that decide what the dam can still do, and the four
   years that changed the river.
   ===================================================================== */
/* Storage at the dam's two hard elevations, in acre-feet.
   - Minimum power pool, elev 3,490 ft: the reservoir sat there in Aug-Sep
     1964 while filling, holding 4.00 MAF (USBR daily record). Sedimentation
     has since cut capacity ~6.8% — the same record shows elev 3,525 ft at
     5.91 MAF in 1965 but 5.51 MAF in 2026 — so today's figure is ~3.7 MAF.
   - Dead pool, elev 3,370 ft: total capacity 25.16 MAF (USGS 2018 survey)
     less live capacity ~23.3 MAF (USBR) leaves ~1.9 MAF below the outlets. */
const POW_MINPOWER=3700000, POW_DEADPOOL=1900000;
/* Only events that this chart's own series can corroborate, or that are
   matters of record at Glen Canyon Dam. */
const POW_EVENTS=[
  {y:1980,t:'first full pool',row:0},
  {y:1983,t:'record runoff',row:1},
  {y:2000,t:'megadrought begins',row:0},
  {y:2022,t:'lowest on record',row:1}
];
function powellChart(el){
  if(typeof POWELL_ANNUAL==='undefined'||!POWELL_ANNUAL.length){el.innerHTML='';return;}
  const W=680,H=330,padL=46,padR=62,padT=52,padB=28;
  const iw=W-padL-padR, ih=H-padT-padB, base=padT+ih;
  const yrs=POWELL_ANNUAL.map(d=>d[0]), vals=POWELL_ANNUAL.map(d=>d[1]);
  const y0=yrs[0], y1=yrs[yrs.length-1];
  const top=Math.ceil(Math.max(...vals)*1.06/5e6)*5e6;
  const X=d3.scaleLinear().domain([y0,y1]).range([padL,padL+iw]);
  const Y=d3.scaleLinear().domain([0,top]).range([base,padT]);
  const last=POWELL_ANNUAL[POWELL_ANNUAL.length-1];
  const peak=POWELL_ANNUAL.reduce((a,b)=>b[1]>a[1]?b:a);
  const byYear=Object.fromEntries(POWELL_ANNUAL);

  const svg=d3.select(el).html('').append('svg')
    .attr('class','histchart').attr('viewBox',`0 0 ${W} ${H}`)
    .attr('preserveAspectRatio','xMidYMid meet').attr('role','img')
    .attr('aria-label',`Lake Powell end-of-September storage from ${y0} to ${y1}: filled through the 1980s to a peak of `
      +`${fmtAF(peak[1])} acre-feet in ${peak[0]}, then declined to ${fmtAF(last[1])} in ${last[0]}, `
      +`approaching the ${fmtAF(POW_MINPOWER)} acre-feet needed to generate power.`);
  const grad=svg.append('defs').append('linearGradient').attr('id','powfill')
    .attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',1);
  grad.append('stop').attr('offset',0).attr('stop-color',PAL.POWELL.fill).attr('stop-opacity',0.30);
  grad.append('stop').attr('offset',1).attr('stop-color',PAL.POWELL.fill).attr('stop-opacity',0.02);

  /* gridlines */
  for(let v=0;v<=top;v+=top/5){
    svg.append('line').attr('x1',padL).attr('x2',W-padR)
      .attr('y1',Y(v)).attr('y2',Y(v)).attr('stroke',GRID);
    svg.append('text').attr('class','hc-ax').attr('x',padL-6).attr('y',Y(v)+3)
      .attr('text-anchor','end').text(fmtAF(v));
  }
  [1970,1985,2000,2015].filter(y=>y>=y0&&y<=y1).forEach(y=>
    svg.append('text').attr('class','hc-ax').attr('x',X(y)).attr('y',H-8)
      .attr('text-anchor','middle').text(y));

  /* the years that changed the river — rules behind the data */
  POW_EVENTS.filter(e=>e.y>=y0&&e.y<=y1).forEach(e=>{
    const x=X(e.y), ly=20+e.row*15, anchor=x>W-150?'end':(x<110?'start':'middle');
    svg.append('line').attr('x1',x).attr('x2',x).attr('y1',ly+4).attr('y2',base)
      .attr('stroke',PAL.EVENT);
    svg.append('text').attr('class','hc-evt')
      .attr('x',x+(anchor==='end'?4:anchor==='start'?-4:0)).attr('y',ly)
      .attr('text-anchor',anchor).text(e.y+' '+e.t);
  });

  /* the series */
  const line=d3.line().x(d=>X(d[0])).y(d=>Y(d[1]));
  const area=d3.area().x(d=>X(d[0])).y0(base).y1(d=>Y(d[1]));
  svg.append('path').attr('d',area(POWELL_ANNUAL)).attr('fill','url(#powfill)');
  svg.append('path').attr('d',line(POWELL_ANNUAL)).attr('fill','none')
    .attr('stroke',PAL.POWELL.line).attr('stroke-width',2).attr('vector-effect','non-scaling-stroke');
  POW_EVENTS.filter(e=>e.y>=y0&&e.y<=y1&&byYear[e.y]!=null).forEach(e=>
    svg.append('circle').attr('cx',X(e.y)).attr('cy',Y(byYear[e.y])).attr('r',3)
      .attr('fill','#0B1922').attr('stroke','#A8C4FF').attr('stroke-width',1.5));

  /* The two elevations that decide what the dam can still do sit ON TOP of the
     series — they are limits the water is measured against, so the water must
     not paint over them. */
  svg.append('rect').attr('x',padL).attr('y',Y(POW_MINPOWER))
    .attr('width',iw).attr('height',base-Y(POW_MINPOWER))
    .attr('fill',PAL.POWELL.crit).attr('opacity',0.22);
  svg.append('line').attr('x1',padL).attr('x2',W-padR)
    .attr('y1',Y(POW_MINPOWER)).attr('y2',Y(POW_MINPOWER)).attr('stroke',NOWCOL);
  svg.append('text').attr('class','hc-thr').attr('fill',NOWCOL)
    .attr('x',padL+5).attr('y',Y(POW_MINPOWER)-5)
    .text('minimum power pool · 3,490 ft · no hydropower below this');
  svg.append('line').attr('x1',padL).attr('x2',W-padR)
    .attr('y1',Y(POW_DEADPOOL)).attr('y2',Y(POW_DEADPOOL)).attr('stroke',PAL.POWELL.dead);
  svg.append('text').attr('class','hc-thr').attr('fill',PAL.POWELL.dead)
    .attr('x',W-padR-4).attr('y',Y(POW_DEADPOOL)+11).attr('text-anchor','end')
    .text('dead pool · 3,370 ft · nothing flows downstream');

  /* today's end of the line — labelled out in the right margin, clear of the
     2022 marker it used to sit on top of */
  svg.append('circle').attr('cx',X(last[0])).attr('cy',Y(last[1])).attr('r',3.6).attr('fill',NOWCOL);
  svg.append('text').attr('class','hc-lbl').attr('fill',NOWCOL)
    .attr('x',X(last[0])+7).attr('y',Y(last[1])+3).text(fmtAF(last[1]));
  svg.append('text').attr('class','hc-ax')
    .attr('x',X(last[0])+7).attr('y',Y(last[1])+14).text(last[0]);

  /* --- crosshair: year by year, measured against the two limits --- */
  const evByYear=Object.fromEntries(POW_EVENTS.map(e=>[e.y,e.t]));
  crosshair(svg.node(),{
    count:POWELL_ANNUAL.length, y0:padT, y1:base,
    container:el.closest('.lr-chart')||el,
    indexAt:vx=>{
      const y=Math.round(X.invert(vx));
      let best=0,bd=Infinity;
      yrs.forEach((yy,i)=>{const dd=Math.abs(yy-y);if(dd<bd){bd=dd;best=i;}});
      return best;
    },
    info:i=>{
      const d=POWELL_ANNUAL[i]; if(!d)return null;
      const pctPeak=Math.round(d[1]/peak[1]*100);
      const head=d[1]-POW_MINPOWER;
      const rows=[
        `storage <b>${fmtAF(d[1])} AF</b> (${pctPeak}% of the ${peak[0]} peak)`,
        head>=0?`<b>${fmtAF(head)} AF</b> above minimum power pool`
               :`<b>${fmtAF(-head)} AF</b> below minimum power pool`];
      if(evByYear[d[0]])rows.push(`<b>${evByYear[d[0]]}</b>`);
      return {x:X(d[0]),
        html:`<div class="tt-h">${d[0]}</div><div class="tt-d">${rows.join('<br>')}</div>`,
        label:`${d[0]}: ${fmtAF(d[1])} acre-feet, ${pctPeak}% of peak`};
    }
  });
}
/* every year in the chart, as text — the reachable-without-hover view */
function powellTable(){
  if(typeof POWELL_ANNUAL==='undefined'||!POWELL_ANNUAL.length)return '';
  const peak=POWELL_ANNUAL.reduce((a,b)=>b[1]>a[1]?b:a);
  return dataTable({
    id:'tbl-powell',
    summary:'Every year in this chart',
    caption:`Lake Powell storage on (or nearest) September 30, in acre-feet · USBR. `
      +`Minimum power pool ≈ ${fmtAF(POW_MINPOWER)} AF, dead pool ≈ ${fmtAF(POW_DEADPOOL)} AF.`,
    head:['Year','End-of-Sept storage (AF)','% of '+peak[0]+' peak'],
    rows:POWELL_ANNUAL.map(d=>[d[0],Math.round(d[1]).toLocaleString('en-US'),
      Math.round(d[1]/peak[1]*100)+'%'])
  });
}

/* =====================================================================
   STACKED PANELS — the honest form for two measures on different scales.
   Each panel keeps its own y-axis and its own title; the x-axis (the water
   year, Oct→Jul) is shared, so a reader compares SHAPE and TIMING without
   the chart implying that 15 inches of snow "equals" 60% full.
   ===================================================================== */
const MONTH_WK=[41,45,49,2,6,10,14,19,23,27];  // ~mid-month week index, Oct..Jul
function panelChart(panels,label){
  const W=680,padL=44,padR=14,padT=44,gap=36,PH=112,padB=26;
  const iw=W-padL-padR;
  const H=padT+panels.length*PH+(panels.length-1)*gap+padB;
  const X=i=>padL+i/9*iw;
  const labs=['Oct','Dec','Feb','Apr','Jun','Jul'],idx=[0,2,4,6,8,9];
  let s=`<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">`;
  /* One legend for both panels. Each panel owns its colour, so the legend
     encodes LINE STYLE and stays neutral — a coloured swatch here would name
     a hue that only one of the two panels actually uses. */
  s+=`<g transform="translate(${padL},12)">`
    +`<line x1="0" y1="-4" x2="18" y2="-4" stroke="${REFCOL}" stroke-width="2.4"/><text x="23" y="0" class="hc-lgd">solid = this water year</text>`
    +`<line x1="168" y1="-4" x2="188" y2="-4" stroke="${REFCOL}" stroke-width="1.4" stroke-dasharray="4 3"/>`
    +`<text x="194" y="0" class="hc-lgd">dashed = normal (1991–present median)</text></g>`;
  panels.forEach((p,pi)=>{
    const t=padT+pi*(PH+gap), b=t+PH;
    const vals=p.cur.concat(p.nrm).filter(v=>v!=null);
    const top=p.max||niceTop(Math.max(1,...vals)*1.05,2);
    const Y=v=>b-Math.max(0,Math.min(top,v))/top*PH;
    const pts=a=>a.map((v,i)=>v==null?null:X(i).toFixed(1)+','+Y(v).toFixed(1)).filter(Boolean);
    s+=`<text x="${padL}" y="${(t-8).toFixed(1)}" class="hc-ptitle">${p.title}</text>`;
    [0,top/2,top].forEach(v=>{
      s+=`<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${W-padR}" y2="${Y(v).toFixed(1)}" stroke="${GRID}"/>`
        +`<text x="${padL-6}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="hc-ax">`
        +`${v%1?v.toFixed(1):v}${p.unit}</text>`;});
    const cp=pts(p.cur), np=pts(p.nrm);
    if(np.length>1)s+=`<path d="M${np.join('L')}" fill="none" stroke="${REFCOL}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    if(cp.length>1){
      /* Area only where the quantity IS a stock — inches of water sitting in
         the mountains. A percentage-of-capacity has no meaningful area. */
      if(p.area)s+=`<path d="M${X(0).toFixed(1)},${b} L${cp.join('L')} L${X(cp.length-1).toFixed(1)},${b} Z" fill="${p.col}" opacity="0.13"/>`;
      s+=`<path d="M${cp.join('L')}" fill="none" stroke="${p.col}" stroke-width="2.4" vector-effect="non-scaling-stroke"/>`;
      const li=p.cur.reduce((bi,v,i)=>v!=null?i:bi,-1);
      if(li>=0)s+=`<circle cx="${X(li).toFixed(1)}" cy="${Y(p.cur[li]).toFixed(1)}" r="3.4" fill="${p.col}"/>`;
    }
    if(pi===panels.length-1)
      s+=idx.map((i,k)=>`<text x="${X(i).toFixed(1)}" y="${(b+16).toFixed(1)}" text-anchor="middle" class="hc-ax">${labs[k]}</text>`).join('');
  });
  return s+'</svg>';
}

/* Snowpack and storage for one basin — the relationship that matters, as
   two panels rather than the dual axis this used to be. */
function snowStoreChart(basinId){
  const snow=(typeof SNOW_BASIN!=='undefined')&&SNOW_BASIN[basinId];
  const bb=(typeof BASIN_BANDS!=='undefined')&&BASIN_BANDS[basinId];
  const tcapB=(typeof BASIN_TCAP!=='undefined')&&BASIN_TCAP[basinId];
  const bn=(BASINS.find(b=>b.id===basinId)||{}).n||'';
  const panels=[];
  if(snow)panels.push({title:'Snowpack · snow-water equivalent',unit:'″',
    cur:snow.cur,nrm:snow.nrm,col:SNOWCOL,area:true});
  if(bb&&tcapB){
    const tel=RES.filter(r=>r.b===basinId&&!r.fc&&r.dwr&&typeof RES_NORMALS!=='undefined'&&RES_NORMALS[r.id]);
    const tcap=tel.reduce((s,r)=>s+r.cap,0)||tcapB;
    if(tel.length)panels.push({title:'Reservoir storage · share of capacity',unit:'%',max:100,
      cur:MONTHS.map((_,mi)=>tel.reduce((s,r)=>s+stoAt(r,mi),0)/tcap*100),
      nrm:MONTH_WK.map(w=>bb[1][w]/tcap*100),col:STORECOL,area:false});
  }
  if(!panels.length)return wyChart(PMH[basinId],ramp(Math.round(PMH[basinId][NOW])));
  return panelChart(panels,`${bn} basin: snowpack and reservoir storage across the water year, `
    +`this year against the normal, on two separate scales.`);
}

/* A basin's water-year so far — the 10 monthly % values. Last-resort fallback
   for a basin with neither baked snowpack nor a storage band. */
function wyChart(series,color){
  if(!series||!series.length)return '';
  const W=680,H=150,padL=34,padR=12,padT=14,padB=24, iw=W-padL-padR, ih=H-padT-padB;
  const mn=Math.min(80,Math.min(...series)-4), mx=Math.max(120,Math.max(...series)+4), rng=mx-mn;
  const X=i=>padL+i/(series.length-1)*iw, Y=v=>padT+ih-((v-mn)/rng)*ih;
  const line=series.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join('');
  const base=Y(100);
  const labs=['Oct','Dec','Feb','Apr','Jun','Jul'], idx=[0,2,4,6,8,9];
  const xt=idx.map((i,k)=>`<text x="${X(i).toFixed(1)}" y="${H-7}" text-anchor="middle" class="hc-ax">${labs[k]}</text>`).join('');
  return `<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="Basin storage percent of median across the water year.">
    <line x1="${padL}" y1="${base.toFixed(1)}" x2="${W-padR}" y2="${base.toFixed(1)}" stroke="${REFCOL}" stroke-dasharray="4 3"/>
    <text x="${W-padR}" y="${(base-5).toFixed(1)}" text-anchor="end" class="hc-ax">normal (100%)</text>
    ${xt}
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${X(series.length-1).toFixed(1)}" cy="${Y(series[series.length-1]).toFixed(1)}" r="3.2" fill="${color}"/>
  </svg>`;
}

/* =====================================================================
   MOUNTING — story.js writes <div class="cw-mount" data-cw="…"> markers
   into its innerHTML, then calls mountAll(root); each chart builds real
   DOM in place so its crosshair/tooltip listeners survive.
   ===================================================================== */
function mountAll(root){
  if(!root)return;
  root.querySelectorAll('.cw-mount[data-cw]').forEach(el=>{
    const kind=el.dataset.cw;
    if(kind==='snowState')snowStateChart(el);
    else if(kind==='snowBars')snowDecadeBars(el);
    else if(kind==='powell')powellChart(el);
    else if(kind==='snowStore')el.innerHTML=snowStoreChart(el.dataset.basin);
  });
}
/* availability predicates, so story.js can decide whether to emit a chart
   block (with its caption) at all */
const hasDecades=()=>!!((typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES&&SNOW_DECADES.dec);
const hasSnowChart=()=>hasDecades()||(typeof SNOW_BASIN!=='undefined'&&Object.keys(SNOW_BASIN).length>0);
const hasPowell=()=>!!((typeof POWELL_ANNUAL!=='undefined')&&POWELL_ANNUAL.length);
const hasSnowStore=bid=>!!(((typeof SNOW_BASIN!=='undefined')&&SNOW_BASIN[bid])
  ||((typeof BASIN_BANDS!=='undefined')&&BASIN_BANDS[bid])
  ||(typeof PMH!=='undefined'&&PMH[bid]));

window.CW_HISTORY={mountAll,snowDecadeTable,powellTable,
  hasDecades,hasSnowChart,hasPowell,hasSnowStore};
})();
