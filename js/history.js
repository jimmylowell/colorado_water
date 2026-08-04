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
  if(!D||!D.dec){snowStateFallback(el);return;}
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
function snowStateFallback(el){
  if(typeof SNOW_BASIN==='undefined'){el.innerHTML='';return;}
  const ids=Object.keys(SNOW_BASIN); if(!ids.length){el.innerHTML='';return;}
  const mean=(key,i)=>{let s=0,n=0;ids.forEach(b=>{const v=SNOW_BASIN[b][key][i];
    if(v!=null){s+=v;n++;}});return n?s/n:null;};
  const cur=[],nrm=[];
  for(let i=0;i<10;i++){cur.push(mean('cur',i));nrm.push(mean('nrm',i));}
  const MID=MONTH_WK.map(wyOf);
  drawPanels(el,[{title:'Snowpack · snow-water equivalent',unit:'″',
    cur:{pts:series(MID,cur),dots:false,area:true,col:SNOWCOL},
    med:{pts:series(MID,nrm)}}],
    'Statewide snowpack across the water year, this year against the normal.',
    i=>{
      const si=nearSample(MID,cur,i);
      if(si<0)return null;
      return {rows:[`snow (mid-${monShort(si)}): <b>${inch(cur[si])}</b> this year · ${inch(nrm[si])} normal`],
        label:`mid-${monShort(si)}: ${inch(cur[si])} this year, ${inch(nrm[si])} normal`};
    });
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
   Each panel keeps its own y-axis and its own title; the x-axis — the
   FULL water year in weeks, the same axis as the snowpack chart above —
   is shared, so a reader compares SHAPE and TIMING without the chart
   implying that 15 inches of snow "equals" 60% full.

   Provenance is drawn, not just captioned: the storage band and median
   are MEASURED (CDSS daily basin totals since 2005, weekly), while
   "this year" is the site's monthly reconstruction — so it is drawn as
   ten dots at the end-of-month weeks it is actually anchored to, and
   never pretends to weekly resolution. (The old chart sampled the
   median at MID-month against a series anchored at month END — a
   built-in two-week phase error, now structurally impossible.)
   ===================================================================== */
const MONTH_WK=[41,45,49,2,6,10,14,19,23,27];  // mid-month calendar week, Oct..Jul (snow sampling)
const EOM_WK=[43,47,51,4,8,12,17,21,25,30];    // end-of-month calendar week, Oct..Jul (stoAt/PMH anchor)
const wyOf=w=>(w-39+52)%52;                    // calendar week index -> weeks since Oct 1
const monShort=mi=>MONTHS[mi].split(' ')[0];
/* pair monthly values with their water-year week positions */
const series=(pos,vals)=>vals.map((v,mi)=>v==null?null:[pos[mi]+0.5,v]).filter(Boolean);
/* nearest monthly sample to water-year week i, or -1 if none lands close */
function nearSample(pos,vals,i){
  let bi=-1,bd=2.6;
  pos.forEach((w,mi)=>{
    const d=Math.abs(w-i);
    if(d<bd&&vals[mi]!=null){bd=d;bi=mi;}
  });
  return bi;
}

/* panels: [{title, unit, top?, band?{lo,hi: 52 wy-indexed}, med:{wk:52 wy-indexed}|{pts},
            cur?{pts, dots, area, col}}] — rowsAt(i) supplies the crosshair content. */
function drawPanels(el,panels,ariaLabel,rowsAt){
  const W=680,padL=44,padR=14,padT=44,gap=40,PH=118,padB=30;
  const iw=W-padL-padR;
  const H=padT+panels.length*PH+(panels.length-1)*gap+padB;
  const X=d3.scaleLinear().domain([0,WYW]).range([padL,padL+iw]);
  const svg=d3.select(el).html('').append('svg')
    .attr('class','histchart').attr('viewBox',`0 0 ${W} ${H}`)
    .attr('preserveAspectRatio','xMidYMid meet').attr('role','img')
    .attr('aria-label',ariaLabel);
  /* One legend for all panels. Each panel owns its colour, so the legend
     encodes LINE STYLE and stays neutral — a coloured swatch here would name
     a hue that only one of the panels actually uses. */
  const hasBand=panels.some(p=>p.band);
  const lg=svg.append('g').attr('transform',`translate(${padL},12)`);
  lg.append('line').attr('x1',0).attr('x2',18).attr('y1',-4).attr('y2',-4)
    .attr('stroke',REFCOL).attr('stroke-width',2.4);
  lg.append('text').attr('class','hc-lgd').attr('x',23).attr('y',0).text('solid = this water year');
  lg.append('line').attr('x1',158).attr('x2',178).attr('y1',-4).attr('y2',-4)
    .attr('stroke',REFCOL).attr('stroke-width',1.4).attr('stroke-dasharray','4 3');
  lg.append('text').attr('class','hc-lgd').attr('x',184).attr('y',0).text('dashed = normal median');
  if(hasBand){
    lg.append('rect').attr('x',330).attr('y',-9).attr('width',18).attr('height',9)
      .attr('fill',REFCOL).attr('opacity',0.22);
    lg.append('text').attr('class','hc-lgd').attr('x',353).attr('y',0).text('shaded = full measured range');
  }
  let lastBase=0;
  panels.forEach((p,pi)=>{
    const t=padT+pi*(PH+gap), b=t+PH; lastBase=b;
    const allV=[].concat(
      p.cur?p.cur.pts.map(d=>d[1]):[],
      p.med&&p.med.pts?p.med.pts.map(d=>d[1]):[],
      p.med&&p.med.wk?p.med.wk:[],
      p.band?p.band.hi:[]).filter(v=>v!=null);
    const top=p.top||niceTop(Math.max(1,...allV)*1.05,2);
    const Y=v=>b-Math.max(0,Math.min(top,v))/top*PH;
    svg.append('text').attr('class','hc-ptitle').attr('x',padL).attr('y',t-8).text(p.title);
    [0,top/2,top].forEach(v=>{
      svg.append('line').attr('x1',padL).attr('x2',W-padR)
        .attr('y1',Y(v)).attr('y2',Y(v)).attr('stroke',GRID);
      svg.append('text').attr('class','hc-ax').attr('x',padL-6).attr('y',Y(v)+3)
        .attr('text-anchor','end').text(fmtTick(v)+p.unit);
    });
    /* the measured range, drawn first so everything reads on top of it */
    if(p.band){
      const wks=d3.range(52);
      const area=d3.area().x(i=>X(i+0.5))
        .y0(i=>Y(p.band.lo[i])).y1(i=>Y(p.band.hi[i]));
      svg.append('path').attr('d',area(wks)).attr('fill',REFCOL).attr('opacity',0.14);
    }
    if(p.med){
      const d=p.med.wk
        ?d3.line().x(i=>X(i+0.5)).y(i=>Y(p.med.wk[i]))(d3.range(52))
        :d3.line().x(q=>X(q[0])).y(q=>Y(q[1]))(p.med.pts);
      if(d)svg.append('path').attr('d',d).attr('fill','none')
        .attr('stroke',REFCOL).attr('stroke-width',1.4).attr('stroke-dasharray','4 3');
    }
    if(p.cur&&p.cur.pts.length>1){
      const ln=d3.line().x(q=>X(q[0])).y(q=>Y(q[1]));
      /* Area only where the quantity IS a stock — inches of water sitting in
         the mountains. A percentage-of-capacity has no meaningful area. */
      if(p.cur.area){
        const first=p.cur.pts[0],last=p.cur.pts[p.cur.pts.length-1];
        svg.append('path')
          .attr('d',`M${X(first[0])},${b} L`+p.cur.pts.map(q=>X(q[0]).toFixed(1)+','+Y(q[1]).toFixed(1)).join('L')+` L${X(last[0])},${b} Z`)
          .attr('fill',p.cur.col).attr('opacity',0.13);
      }
      svg.append('path').attr('d',ln(p.cur.pts)).attr('fill','none')
        .attr('stroke',p.cur.col).attr('stroke-width',2.4).attr('vector-effect','non-scaling-stroke');
      /* dots at the anchor weeks make a monthly reconstruction LOOK monthly */
      if(p.cur.dots)svg.selectAll(null).data(p.cur.pts).enter().append('circle')
        .attr('cx',q=>X(q[0])).attr('cy',q=>Y(q[1])).attr('r',2.7).attr('fill',p.cur.col);
      const last=p.cur.pts[p.cur.pts.length-1];
      svg.append('circle').attr('cx',X(last[0])).attr('cy',Y(last[1]))
        .attr('r',3.4).attr('fill',p.cur.col);
    }
  });
  /* the shared month axis, identical to the seasonal snow chart above */
  MON.forEach((m,i)=>svg.append('text').attr('class','hc-ax')
    .attr('x',(X(MONSTART[i])+X(i===11?WYW:MONSTART[i+1]))/2).attr('y',lastBase+16)
    .attr('text-anchor','middle').text(m));

  crosshair(svg.node(),{
    count:52, y0:padT, y1:lastBase,
    container:el.closest('.lr-chart')||el,
    indexAt:vx=>{
      const i=Math.round((vx-padL)/iw*WYW-0.5);
      return isFinite(i)?Math.max(0,Math.min(51,i)):0;
    },
    info:i=>{
      const r=rowsAt(i);
      if(!r)return null;
      return {x:X(i+0.5),
        html:`<div class="tt-h">${wkLabel(i)}</div><div class="tt-d">${r.rows.join('<br>')}</div>`,
        label:wkLabel(i)+': '+r.label};
    }
  });
}

/* Snowpack and storage for one basin — the relationship that matters, as
   two panels rather than the dual axis this used to be. */
function snowStoreChart(el,basinId){
  const snow=(typeof SNOW_BASIN!=='undefined')&&SNOW_BASIN[basinId];
  const bb=(typeof BASIN_BANDS!=='undefined')&&BASIN_BANDS[basinId];
  const tcap=(typeof BASIN_TCAP!=='undefined')&&BASIN_TCAP[basinId];
  const bn=(BASINS.find(b=>b.id===basinId)||{}).n||'';
  const MID=MONTH_WK.map(wyOf), EOM=EOM_WK.map(wyOf);
  const panels=[];
  let sto=null, med=null, lo=null, hi=null;
  if(snow)panels.push({title:'Snowpack · snow-water equivalent',unit:'″',
    cur:{pts:series(MID,snow.cur),dots:false,area:true,col:SNOWCOL},
    med:{pts:series(MID,snow.nrm)}});
  if(bb&&tcap){
    /* BASIN_TCAP and the client set are the same population by construction
       (supply-only, telemetered — asserted in the smoke tests), so numerator
       and denominator finally agree */
    const tel=RES.filter(r=>r.b===basinId&&!r.fc&&r.dwr
      &&typeof RES_NORMALS!=='undefined'&&RES_NORMALS[r.id]);
    if(tel.length){
      sto=MONTHS.map((_,mi)=>tel.reduce((s,r)=>s+stoAt(r,mi),0)/tcap*100);
      const wy=i=>(i+39)%52;                 /* wy week -> calendar week */
      med=d3.range(52).map(i=>bb[1][wy(i)]/tcap*100);
      lo=d3.range(52).map(i=>bb[0][wy(i)]/tcap*100);
      hi=d3.range(52).map(i=>bb[2][wy(i)]/tcap*100);
      panels.push({title:'Reservoir storage · share of capacity',unit:'%',top:100,
        band:{lo,hi},med:{wk:med},
        cur:{pts:series(EOM,sto),dots:true,area:false,col:STORECOL}});
    }
  }
  if(!panels.length){el.innerHTML='';return;}
  drawPanels(el,panels,
    `${bn} basin: snowpack and reservoir storage across the water year, `
    +`this year against the normal, on two separate scales.`,
    i=>{
      const rows=[]; let label='';
      if(snow){
        const si=nearSample(MID,snow.cur,i), ni=nearSample(MID,snow.nrm,i);
        if(si>=0)rows.push(`snow (mid-${monShort(si)}): <b>${inch(snow.cur[si])}</b> this yr · ${inch(snow.nrm[si])} normal`);
        else if(ni>=0)rows.push(`snow (mid-${monShort(ni)}): ${inch(snow.nrm[ni])} normal`);
      }
      if(med){
        rows.push(`storage median <b>${Math.round(med[i])}%</b> · range ${Math.round(lo[i])}–${Math.round(hi[i])}%`);
        const ci=nearSample(EOM,sto,i);
        if(ci>=0)rows.push(`this year (end of ${monShort(ci)}): <b>${Math.round(sto[ci])}%</b>`);
        label=`storage median ${Math.round(med[i])} percent`;
      }
      return rows.length?{rows,label:label||'snowpack'}:null;
    });
}
/* the two-panel chart as text: one row per month of the water year so far */
function snowStoreTable(basinId){
  const snow=(typeof SNOW_BASIN!=='undefined')&&SNOW_BASIN[basinId];
  const bb=(typeof BASIN_BANDS!=='undefined')&&BASIN_BANDS[basinId];
  const tcap=(typeof BASIN_TCAP!=='undefined')&&BASIN_TCAP[basinId];
  if(!snow&&!(bb&&tcap))return '';
  const tel=RES.filter(r=>r.b===basinId&&!r.fc&&r.dwr
    &&typeof RES_NORMALS!=='undefined'&&RES_NORMALS[r.id]);
  const rows=MONTHS.map((m,mi)=>{
    const sc=snow?inch(snow.cur[mi]):'—', sn=snow?inch(snow.nrm[mi]):'—';
    let tc='—',tm='—';
    if(bb&&tcap&&tel.length){
      tc=Math.round(tel.reduce((s,r)=>s+stoAt(r,mi),0)/tcap*100)+'%';
      tm=Math.round(bb[1][EOM_WK[mi]]/tcap*100)+'%';
    }
    return [m,sc,sn,tc,tm];
  });
  return dataTable({
    id:'tbl-snowstore-'+basinId,
    caption:'Snow is sampled mid-month (NRCS SNOTEL); storage at month end. '
      +'Storage median is the CDSS 2005–present weekly median for that week; '
      +'"this year" storage is the site’s monthly reconstruction (live where telemetered).',
    head:['Month','Snow this yr','Snow normal','Storage this yr','Storage median'],
    rows
  });
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
    else if(kind==='snowStore')snowStoreChart(el,el.dataset.basin);
  });
}
/* availability predicates, so story.js can decide whether to emit a chart
   block (with its caption) at all */
const hasDecades=()=>!!((typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES&&SNOW_DECADES.dec);
const hasSnowChart=()=>hasDecades()||(typeof SNOW_BASIN!=='undefined'&&Object.keys(SNOW_BASIN).length>0);
const hasPowell=()=>!!((typeof POWELL_ANNUAL!=='undefined')&&POWELL_ANNUAL.length);
const hasSnowStore=bid=>!!(((typeof SNOW_BASIN!=='undefined')&&SNOW_BASIN[bid])
  ||((typeof BASIN_BANDS!=='undefined')&&BASIN_BANDS[bid]));

window.CW_HISTORY={mountAll,snowDecadeTable,powellTable,snowStoreTable,
  hasDecades,hasSnowChart,hasPowell,hasSnowStore};
})();
