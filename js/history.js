"use strict";
/* =====================================================================
   HISTORY CHARTS — self-contained SVG (no d3), so the long-form story on
   index.html can draw multi-decade series without loading the map engine.
   Data is baked in js/normals.js (SNOW_DECADES, POWELL_ANNUAL, SNOW_BASIN,
   BASIN_BANDS), so every chart here also works from file://.

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
const fmtAF=n=>n<1000?String(Math.round(n)):n>=1e6?(n/1e6).toFixed(1)+'M':Math.round(n/1e3)+'k';
/* the smallest round axis top that clears `max` and divides into `n` tidy
   ticks, so an axis never reads 6.25″ / 18.75″ — and never wastes half its
   height on empty headroom either */
function niceTop(max,n){
  const raw=max/n, mag=Math.pow(10,Math.floor(Math.log10(raw)));
  const step=[1,1.5,2,2.5,3,4,5,7.5,10].map(m=>m*mag).find(s=>s>=raw)||10*mag;
  return step*n;
}

/* oldest → newest. Single hue, monotone lightness, adjacent ΔL ≥ 0.06,
   dark end 4.2:1 on the chart surface. */
const DECRAMP=['#3E8397','#4E9AB0','#61B2C8','#7ACDE0','#A9E8F4'];
const THENCOL='#4E93A8';   /* the oldest decade, where only two are drawn */
const NOWDEC='#A9E8F4';    /* the newest decade */
const NOWCOL='#FF7A45';    /* this water year — the emphasis series */
const REFCOL='#7C93A1';    /* "normal" reference lines, all charts */
const SNOWCOL='#6FC9DF';   /* snowpack, wherever it stands alone */
const STORECOL='#3F7BFF';  /* reservoir storage, wherever it stands alone */
const GRID='#1b2b36';

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

/* =====================================================================
   SNOWPACK BY DECADE — the climate signal, with the water-year calendar
   folded in rather than sitting in a chart of its own.

   The calendar used to be a separate band chart that only restated its own
   labels. Here the same three seasons divide THIS plot, so the snow curve
   visibly does what the labels claim: it climbs through the accumulation
   season, collapses through the melt season, and is gone by draw-down.
   ===================================================================== */
function snowStateChart(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec)return snowStateFallback();
  const keys=Object.keys(D.dec).sort();
  const W=680,H=336,padL=40,padR=58,padT=54,padB=46;
  const iw=W-padL-padR, ih=H-padT-padB, base=padT+ih;
  const X=w=>padL+w/WYW*iw;
  const all=keys.map(k=>D.dec[k].wk).concat([D.cur]).flat().filter(v=>v!=null);
  const top=niceTop(Math.max(...all)*1.02,4);
  const Y=v=>base-Math.max(0,v)/top*ih;
  const path=arr=>{                       /* break the line across data gaps */
    let d='',pen=false;
    arr.forEach((v,i)=>{ if(v==null){pen=false;return;}
      d+=(pen?'L':'M')+X(i+0.5).toFixed(1)+','+Y(v).toFixed(1); pen=true; });
    return d;
  };
  let s=`<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="Colorado snowpack across the water year, by decade. Median peak snow-water equivalent falls from `
    +`${D.dec[keys[0]].peak} inches in the ${keys[0]} to ${D.dec[keys[keys.length-1]].peak} inches in the `
    +`${keys[keys.length-1]}, and this water year peaked at ${D.curStats?D.curStats.peak:'?'} inches.">`;

  /* --- the water year's three seasons, as the plot's own background --- */
  const APR=MONSTART[6], JUL=MONSTART[9];
  s+=`<rect x="${X(APR).toFixed(1)}" y="${padT}" width="${(X(JUL)-X(APR)).toFixed(1)}" height="${ih}" fill="#8FA6B2" opacity="0.06"/>`;
  [APR,JUL].forEach(w=>{s+=`<line x1="${X(w).toFixed(1)}" y1="${padT}" x2="${X(w).toFixed(1)}" y2="${base}" stroke="#2A4150"/>`;});
  [[0,APR,'Snow accumulates'],[APR,JUL,'Melt → reservoirs fill'],[JUL,WYW,'Draw-down']].forEach(([a,b,t])=>{
    s+=`<text x="${((X(a)+X(b))/2).toFixed(1)}" y="${(padT-9).toFixed(1)}" text-anchor="middle" class="wc-band">${t}</text>`;
  });

  /* --- axes --- */
  for(let v=0;v<=top;v+=top/4)
    s+=`<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${W-padR}" y2="${Y(v).toFixed(1)}" stroke="${GRID}"/>`
      +`<text x="${padL-6}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="hc-ax">${v}″</text>`;
  MON.forEach((m,i)=>{
    s+=`<text x="${((X(MONSTART[i])+X(i===11?WYW:MONSTART[i+1]))/2).toFixed(1)}" y="${(base+15).toFixed(1)}"`
      +` text-anchor="middle" class="hc-ax">${m}</text>`;
  });

  /* --- then, now, and the gap between ---
     All five decades drawn here tangled into an unreadable braid: they sit
     within a few inches of each other and no ramp separates five overlapping
     curves at this size. So this chart carries the two ENDS — the shape of a
     1980s season against a 2020s one — and shades the gap, which is the loss
     itself. The full decade-by-decade progression is the bar chart below,
     where five values do separate cleanly. */
  const oldK=keys[0], newK=keys[keys.length-1];
  const oldW=D.dec[oldK].wk, newW=D.dec[newK].wk;
  const both=[];
  for(let i=0;i<52;i++) if(oldW[i]!=null&&newW[i]!=null) both.push(i);
  if(both.length>1){
    const fwd=both.map(i=>X(i+0.5).toFixed(1)+','+Y(oldW[i]).toFixed(1)).join('L');
    const bck=both.slice().reverse().map(i=>X(i+0.5).toFixed(1)+','+Y(newW[i]).toFixed(1)).join('L');
    s+=`<path d="M${fwd}L${bck}Z" fill="${NOWDEC}" opacity="0.12"/>`;
  }
  [[oldK,THENCOL],[newK,NOWDEC]].forEach(([k,col])=>{
    s+=`<path d="${path(D.dec[k].wk)}" fill="none" stroke="${col}" stroke-width="2.1"`
      +` vector-effect="non-scaling-stroke"><title>${k} — median peak ${D.dec[k].peak}″</title></path>`;
  });
  /* direct-labelled in early May, where the two have pulled furthest apart */
  const LBL=31.5;
  const lblAt=(k,col,dy,anchor)=>{
    const a=D.dec[k]; if(!a)return '';
    const v=a.wk[Math.round(LBL)]; if(v==null)return '';
    return `<text x="${(X(LBL)+(anchor==='end'?-7:7)).toFixed(1)}" y="${(Y(v)+dy).toFixed(1)}"`
      +` text-anchor="${anchor}" class="hc-lbl" fill="${col}">${k}</text>`;
  };
  s+=lblAt(oldK,THENCOL,-7,'start');
  s+=lblAt(newK,NOWDEC,15,'end');

  /* --- this water year, the emphasis series --- */
  if(D.cur&&D.cur.some(v=>v!=null)){
    const p=path(D.cur);
    s+=`<path d="${p}" fill="none" stroke="${NOWCOL}" stroke-width="2.6" vector-effect="non-scaling-stroke"/>`;
    const pk=D.curStats;
    if(pk&&D.cur[pk.peakWk]!=null){
      s+=`<circle cx="${X(pk.peakWk+0.5).toFixed(1)}" cy="${Y(D.cur[pk.peakWk]).toFixed(1)}" r="3.4" fill="${NOWCOL}"/>`;
      /* The annotation goes in the empty top-left of the plot, not beside the
         point: early winter is the one region no curve occupies, and the ember
         colour ties it to its line without a leader. */
      s+=`<text x="${X(0.6).toFixed(1)}" y="${(padT+22).toFixed(1)}" class="hc-lbl" fill="${NOWCOL}">`
        +`WY${D.curWY} — peak ${pk.peak}″${pk.apr1!=null?`, ${pk.apr1}″ left on 1 April`:''}</text>`;
    }
  }

  /* --- you are here --- */
  const nw=nowWeek();
  s+=`<line x1="${X(nw).toFixed(1)}" y1="${(padT-2).toFixed(1)}" x2="${X(nw).toFixed(1)}" y2="${base}" stroke="#EDE6D6" stroke-width="1.2" opacity="0.85"/>`
    +`<circle cx="${X(nw).toFixed(1)}" cy="${(padT-2).toFixed(1)}" r="2.6" fill="#EDE6D6"/>`
    +`<text x="${(X(nw)+(nw>WYW*0.8?-5:5)).toFixed(1)}" y="${(padT+9).toFixed(1)}"`
    +` text-anchor="${nw>WYW*0.8?'end':'start'}" class="wc-now">today</text>`;

  /* --- legend --- */
  const seg=(x,col,w,t)=>`<line x1="${x}" y1="-4" x2="${x+20}" y2="-4" stroke="${col}" stroke-width="${w}"/>`
    +`<text x="${x+25}" y="0" class="hc-lgd">${t}</text>`;
  s+=`<g transform="translate(${padL},16)">${seg(0,THENCOL,2.1,`${oldK} median`)}`
    +`${seg(126,NOWDEC,2.1,`${newK} median`)}${seg(252,NOWCOL,2.6,'this water year')}</g>`;
  return s+'</svg>';
}

/* Median peak snowpack, decade by decade — the progression the seasonal chart
   deliberately leaves out. Five values as columns separate cleanly where five
   overlapping curves could not, and an ordinal ramp puts the order in the
   colour as well as the position. */
function snowDecadeBars(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec)return '';
  const keys=Object.keys(D.dec).sort();
  const cur=D.curStats;
  const bars=keys.map((k,i)=>({k,v:D.dec[k].peak,n:D.dec[k].n,
    col:DECRAMP[Math.round(i/(keys.length-1||1)*(DECRAMP.length-1))]}));
  if(cur)bars.push({k:'WY'+D.curWY,v:cur.peak,col:NOWCOL,now:true});
  const W=680,H=196,padL=40,padR=14,padT=30,padB=40;
  const iw=W-padL-padR, ih=H-padT-padB, base=padT+ih;
  const top=niceTop(Math.max(...bars.map(b=>b.v))*1.02,4);
  const Y=v=>base-v/top*ih;
  const slot=iw/bars.length, bw=Math.min(64,slot-16);
  let s=`<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="Median peak snowpack by decade: ${bars.map(b=>b.k+' '+b.v+' inches').join(', ')}.">`;
  for(let v=0;v<=top;v+=top/4)
    s+=`<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${W-padR}" y2="${Y(v).toFixed(1)}" stroke="${GRID}"/>`
      +`<text x="${padL-6}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="hc-ax">${v}″</text>`;
  /* the 1980s level carried across, so every later bar is read against it */
  const ref=bars[0].v;
  s+=`<line x1="${padL}" y1="${Y(ref).toFixed(1)}" x2="${W-padR}" y2="${Y(ref).toFixed(1)}" stroke="${THENCOL}" stroke-dasharray="4 3" opacity="0.8"/>`;
  bars.forEach((b,i)=>{
    const x=padL+i*slot+(slot-bw)/2, ty=Y(b.v), r=4;
    /* rounded data-end, square to the baseline */
    s+=`<path d="M${x.toFixed(1)},${base} L${x.toFixed(1)},${(ty+r).toFixed(1)} Q${x.toFixed(1)},${ty.toFixed(1)} ${(x+r).toFixed(1)},${ty.toFixed(1)}`
      +` L${(x+bw-r).toFixed(1)},${ty.toFixed(1)} Q${(x+bw).toFixed(1)},${ty.toFixed(1)} ${(x+bw).toFixed(1)},${(ty+r).toFixed(1)}`
      +` L${(x+bw).toFixed(1)},${base} Z" fill="${b.col}"><title>${b.k} — median peak ${b.v}″</title></path>`
      /* value inside the bar top: above it, the labels collided with the
         1980s reference rule */
      +`<text x="${(x+bw/2).toFixed(1)}" y="${(ty+15).toFixed(1)}" text-anchor="middle" class="hc-barval">${b.v}″</text>`
      +`<text x="${(x+bw/2).toFixed(1)}" y="${(base+15).toFixed(1)}" text-anchor="middle" class="hc-ax">${b.k}</text>`;
    if(b.n&&b.n<10)
      s+=`<text x="${(x+bw/2).toFixed(1)}" y="${(base+26).toFixed(1)}" text-anchor="middle" class="hc-ax">${b.n} yrs</text>`;
    if(b.now)
      s+=`<text x="${(x+bw/2).toFixed(1)}" y="${(base+26).toFixed(1)}" text-anchor="middle" class="hc-ax">so far</text>`;
  });
  s+=`<text x="${W-padR}" y="${(Y(ref)-6).toFixed(1)}" text-anchor="end" class="hc-ax" fill="${THENCOL}">${keys[0]} level</text>`;
  return s+'</svg>';
}

/* The numbers behind the decade chart — the table view, so no value in that
   plot is reachable only by matching a colour. */
function snowDecadeTable(){
  const D=(typeof SNOW_DECADES!=='undefined')&&SNOW_DECADES;
  if(!D||!D.dec)return '';
  const keys=Object.keys(D.dec).sort();
  const wkDate=w=>{const d=new Date(2001,9,1); d.setDate(d.getDate()+w*7+3);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  const row=(lab,st,sub)=>`<tr><th scope="row">${lab}${sub?` <span class="dt-sub">${sub}</span>`:''}</th>`
    +`<td>${st.peak}″</td><td>${wkDate(st.peakWk)}</td><td>${st.apr1==null?'—':st.apr1+'″'}</td></tr>`;
  const first=D.dec[keys[0]], last=D.dec[keys[keys.length-1]];
  const drop=Math.round((1-last.peak/first.peak)*100);
  return `<details class="lr-table"><summary>The numbers behind this chart</summary>
    <table class="dtab"><caption>Median across each decade's water years, from one fixed panel of
      ${D.n} SNOTEL sites (${D.elev?D.elev[0].toLocaleString('en-US')+'–'+D.elev[1].toLocaleString('en-US')+' ft':''})
      that have reported in every year since ${first.y0}.</caption>
      <thead><tr><th scope="col">Decade</th><th scope="col">Peak snowpack</th>
        <th scope="col">Peak date</th><th scope="col">April 1</th></tr></thead>
      <tbody>${keys.map(k=>row(k,D.dec[k],D.dec[k].n<10?`(${D.dec[k].n} yrs)`:'')).join('')}
        ${D.curStats?row('WY'+D.curWY,D.curStats,'so far'):''}</tbody></table>
    <p class="dt-note">Median peak snowpack fell <b>${drop}%</b> from the ${keys[0]} to the
      ${keys[keys.length-1]} (${first.peak}″ → ${last.peak}″). The ${keys[keys.length-1]} covers
      ${last.n} water years, so it is the least settled figure here.</p></details>`;
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
function powellChart(){
  if(typeof POWELL_ANNUAL==='undefined'||!POWELL_ANNUAL.length)return '';
  const W=680,H=330,padL=46,padR=62,padT=52,padB=28;
  const iw=W-padL-padR, ih=H-padT-padB, base=padT+ih;
  const yrs=POWELL_ANNUAL.map(d=>d[0]), vals=POWELL_ANNUAL.map(d=>d[1]);
  const y0=yrs[0], y1=yrs[yrs.length-1];
  const top=Math.ceil(Math.max(...vals)*1.06/5e6)*5e6;
  const X=y=>padL+(y-y0)/(y1-y0)*iw;
  const Y=v=>base-(v/top)*ih;
  const line=POWELL_ANNUAL.map((d,i)=>(i?'L':'M')+X(d[0]).toFixed(1)+','+Y(d[1]).toFixed(1)).join('');
  const area=`M${X(y0).toFixed(1)},${base} `+POWELL_ANNUAL.map(d=>'L'+X(d[0]).toFixed(1)+','+Y(d[1]).toFixed(1)).join(' ')
    +` L${X(y1).toFixed(1)},${base} Z`;
  const last=POWELL_ANNUAL[POWELL_ANNUAL.length-1];
  const peak=POWELL_ANNUAL.reduce((a,b)=>b[1]>a[1]?b:a);
  const byYear=Object.fromEntries(POWELL_ANNUAL);

  let s=`<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="Lake Powell end-of-September storage from ${y0} to ${y1}: filled through the 1980s to a peak of
     ${fmtAF(peak[1])} acre-feet in ${peak[0]}, then declined to ${fmtAF(last[1])} in ${last[0]},
     approaching the ${fmtAF(POW_MINPOWER)} acre-feet needed to generate power.">
    <defs><linearGradient id="powfill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2F6BFF" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#2F6BFF" stop-opacity="0.02"/></linearGradient></defs>`;

  /* gridlines */
  for(let v=0;v<=top;v+=top/5)
    s+=`<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${W-padR}" y2="${Y(v).toFixed(1)}" stroke="${GRID}"/>`
      +`<text x="${padL-6}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="hc-ax">${fmtAF(v)}</text>`;
  [1970,1985,2000,2015].filter(y=>y>=y0&&y<=y1).forEach(y=>{
    s+=`<text x="${X(y).toFixed(1)}" y="${H-8}" text-anchor="middle" class="hc-ax">${y}</text>`;});

  /* the years that changed the river — rules behind the data */
  POW_EVENTS.filter(e=>e.y>=y0&&e.y<=y1).forEach(e=>{
    const x=X(e.y), ly=20+e.row*15, anchor=x>W-150?'end':(x<110?'start':'middle');
    const tx=x+(anchor==='end'?4:anchor==='start'?-4:0);
    s+=`<line x1="${x.toFixed(1)}" y1="${(ly+4).toFixed(1)}" x2="${x.toFixed(1)}" y2="${base}" stroke="#3C5364"/>`
      +`<text x="${tx.toFixed(1)}" y="${ly}" text-anchor="${anchor}" class="hc-evt">${e.y} ${e.t}</text>`;
  });

  /* the series */
  s+=`<path d="${area}" fill="url(#powfill)"/>
    <path d="${line}" fill="none" stroke="#4E86FF" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  POW_EVENTS.filter(e=>e.y>=y0&&e.y<=y1&&byYear[e.y]!=null).forEach(e=>{
    s+=`<circle cx="${X(e.y).toFixed(1)}" cy="${Y(byYear[e.y]).toFixed(1)}" r="3" fill="#0B1922" stroke="#A8C4FF" stroke-width="1.5"/>`;
  });

  /* The two elevations that decide what the dam can still do sit ON TOP of the
     series — they are limits the water is measured against, so the water must
     not paint over them. */
  s+=`<rect x="${padL}" y="${Y(POW_MINPOWER).toFixed(1)}" width="${iw}" height="${(base-Y(POW_MINPOWER)).toFixed(1)}" fill="#B4321E" opacity="0.22"/>`
    +`<line x1="${padL}" y1="${Y(POW_MINPOWER).toFixed(1)}" x2="${W-padR}" y2="${Y(POW_MINPOWER).toFixed(1)}" stroke="${NOWCOL}"/>`
    +`<text x="${padL+5}" y="${(Y(POW_MINPOWER)-5).toFixed(1)}" class="hc-thr" fill="${NOWCOL}">minimum power pool · 3,490 ft · no hydropower below this</text>`
    +`<line x1="${padL}" y1="${Y(POW_DEADPOOL).toFixed(1)}" x2="${W-padR}" y2="${Y(POW_DEADPOOL).toFixed(1)}" stroke="#E2603A"/>`
    +`<text x="${W-padR-4}" y="${(Y(POW_DEADPOOL)+11).toFixed(1)}" text-anchor="end" class="hc-thr" fill="#E2603A">dead pool · 3,370 ft · nothing flows downstream</text>`;

  /* today's end of the line — labelled out in the right margin, clear of the
     2022 marker it used to sit on top of */
  s+=`<circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="3.6" fill="${NOWCOL}"/>
    <text x="${(X(last[0])+7).toFixed(1)}" y="${(Y(last[1])+3).toFixed(1)}" class="hc-lbl" fill="${NOWCOL}">${fmtAF(last[1])}</text>
    <text x="${(X(last[0])+7).toFixed(1)}" y="${(Y(last[1])+14).toFixed(1)}" class="hc-ax">${last[0]}</text>`;
  return s+'</svg>';
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

window.CW_HISTORY={powellChart,wyChart,snowStoreChart,snowStateChart,snowDecadeBars,snowDecadeTable};
})();
