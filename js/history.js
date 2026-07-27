"use strict";
/* =====================================================================
   HISTORY CHARTS — self-contained SVG (no d3), so the long-form story on
   index.html can draw multi-decade series without loading the map engine.
   Data is baked in js/normals.js (POWELL_ANNUAL), so it works from file://.
   ===================================================================== */
(function(){
const NS='http://www.w3.org/2000/svg';
const fmtAF=n=>n>=1e6?(n/1e6).toFixed(1)+'M':Math.round(n/1e3)+'k';

/* Lake Powell — annual end-of-September storage, 1963→now. The long decline
   is the climate story: a reservoir that filled through the 1980s and has
   been drawn down toward dead pool since 2000. */
function powellChart(){
  if(typeof POWELL_ANNUAL==='undefined'||!POWELL_ANNUAL.length)return '';
  const W=680,H=280,padL=44,padR=14,padT=18,padB=28;
  const iw=W-padL-padR, ih=H-padT-padB;
  const yrs=POWELL_ANNUAL.map(d=>d[0]), vals=POWELL_ANNUAL.map(d=>d[1]);
  const y0=yrs[0], y1=yrs[yrs.length-1];
  const vmax=Math.max(...vals), CAP=24322000; /* Powell live capacity ~24.3 MAF */
  const top=Math.max(vmax,CAP*0.5);
  const X=y=>padL+(y-y0)/(y1-y0)*iw;
  const Y=v=>padT+ih-(v/top)*ih;
  const line=POWELL_ANNUAL.map((d,i)=>(i?'L':'M')+X(d[0]).toFixed(1)+','+Y(d[1]).toFixed(1)).join('');
  const area=`M${X(y0).toFixed(1)},${(padT+ih).toFixed(1)} `+
    POWELL_ANNUAL.map(d=>'L'+X(d[0]).toFixed(1)+','+Y(d[1]).toFixed(1)).join(' ')+
    ` L${X(y1).toFixed(1)},${(padT+ih).toFixed(1)} Z`;
  const gy=[0.25,0.5,0.75,1].map(f=>f*top);
  const grid=gy.map(v=>`<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${W-padR}" y2="${Y(v).toFixed(1)}" stroke="#1b2b36"/>`
    +`<text x="${padL-6}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="hc-ax">${fmtAF(v)}</text>`).join('');
  const xt=[1970,1985,2000,2015].filter(y=>y>=y0&&y<=y1)
    .map(y=>`<text x="${X(y).toFixed(1)}" y="${H-8}" text-anchor="middle" class="hc-ax">${y}</text>`).join('');
  const last=POWELL_ANNUAL[POWELL_ANNUAL.length-1];
  const peak=POWELL_ANNUAL.reduce((a,b)=>b[1]>a[1]?b:a);
  return `<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="Lake Powell annual storage from ${y0} to ${y1}, declining from a peak near ${fmtAF(peak[1])} acre-feet to ${fmtAF(last[1])}.">
    <defs><linearGradient id="powfill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2F6BFF" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#2F6BFF" stop-opacity="0.02"/></linearGradient></defs>
    ${grid}${xt}
    <path d="${area}" fill="url(#powfill)"/>
    <path d="${line}" fill="none" stroke="#4E86FF" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
    <circle cx="${X(peak[0]).toFixed(1)}" cy="${Y(peak[1]).toFixed(1)}" r="3" fill="#8FB4FF"/>
    <circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="3.4" fill="#FF7A45"/>
  </svg>`;
}

/* A basin's water-year so far — the 10 monthly % values, drawn big. */
function wyChart(series,color){
  if(!series||!series.length)return '';
  const W=680,H=150,padL=34,padR=12,padT=14,padB=24, iw=W-padL-padR, ih=H-padT-padB;
  const mn=Math.min(80,Math.min(...series)-4), mx=Math.max(120,Math.max(...series)+4), rng=mx-mn;
  const X=i=>padL+i/(series.length-1)*iw, Y=v=>padT+ih-((v-mn)/rng)*ih;
  const line=series.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join('');
  const base=Y(100);
  const labs=['Oct','Dec','Feb','Apr','Jun','Jul'];
  const idx=[0,2,4,6,8,9];
  const xt=idx.map((i,k)=>`<text x="${X(i).toFixed(1)}" y="${H-7}" text-anchor="middle" class="hc-ax">${labs[k]}</text>`).join('');
  return `<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="Basin storage percent of median across the water year.">
    <line x1="${padL}" y1="${base.toFixed(1)}" x2="${W-padR}" y2="${base.toFixed(1)}" stroke="#3a4c3a" stroke-dasharray="3 3"/>
    <text x="${W-padR}" y="${(base-5).toFixed(1)}" text-anchor="end" class="hc-ax" fill="#6f7f6f">normal (100%)</text>
    ${xt}
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${X(series.length-1).toFixed(1)}" cy="${Y(series[series.length-1]).toFixed(1)}" r="3.2" fill="${color}"/>
  </svg>`;
}

/* A basin's storage across the water year (Oct→Jul) as % of its telemetered
   capacity, over the historical min–max band and median (baked BASIN_BANDS).
   Falls back to the plain % -of-median line where no band is available. */
const MONTH_WK=[41,45,49,2,6,10,14,19,23,27];  // ~mid-month week index, Oct..Jul
function basinChart(basinId){
  const bb=(typeof BASIN_BANDS!=='undefined')&&BASIN_BANDS[basinId];
  const tcapB=(typeof BASIN_TCAP!=='undefined')&&BASIN_TCAP[basinId];
  if(!bb||!tcapB)return wyChart(PMH[basinId],ramp(Math.round(PMH[basinId][NOW])));
  const tel=RES.filter(r=>r.b===basinId&&!r.fc&&r.dwr&&typeof RES_NORMALS!=='undefined'&&RES_NORMALS[r.id]);
  const tcap=tel.reduce((s,r)=>s+r.cap,0)||tcapB;
  const band=MONTH_WK.map(w=>({lo:bb[0][w]/tcap*100,med:bb[1][w]/tcap*100,hi:bb[2][w]/tcap*100}));
  const cur=tel.length?MONTHS.map((_,mi)=>tel.reduce((s,r)=>s+stoAt(r,mi),0)/tcap*100):[];
  const W=680,H=196,padL=40,padR=14,padT=14,padB=26, iw=W-padL-padR, ih=H-padT-padB;
  const X=i=>padL+i/9*iw, Y=v=>padT+ih-Math.max(0,Math.min(100,v))/100*ih;
  const col=ramp(Math.round(cur.length?cur[NOW]:PMH[basinId][NOW]));
  const top=band.map((p,i)=>X(i).toFixed(1)+','+Y(p.hi).toFixed(1)).join('L');
  const bot=band.map((p,i)=>X(i).toFixed(1)+','+Y(p.lo).toFixed(1)).reverse().join('L');
  const med='M'+band.map((p,i)=>X(i).toFixed(1)+','+Y(p.med).toFixed(1)).join('L');
  const line=cur.length?'M'+cur.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join('L'):'';
  const gy=[0,25,50,75,100].map(v=>`<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${W-padR}" y2="${Y(v).toFixed(1)}" stroke="#1b2b36"/>`
    +`<text x="${padL-6}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="hc-ax">${v}%</text>`).join('');
  const labs=['Oct','Dec','Feb','Apr','Jun','Jul'],idx=[0,2,4,6,8,9];
  const xt=idx.map((i,k)=>`<text x="${X(i).toFixed(1)}" y="${H-7}" text-anchor="middle" class="hc-ax">${labs[k]}</text>`).join('');
  return `<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="${BASINS.find(b=>b.id===basinId).n} basin storage across the water year, versus the historical range.">
    ${gy}${xt}
    <path d="M${top}L${bot}Z" fill="#8FA6B2" opacity="0.14"/>
    <path d="${med}" fill="none" stroke="#8FA6B2" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.9"/>
    ${line?`<path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
       <circle cx="${X(9).toFixed(1)}" cy="${Y(cur[NOW]).toFixed(1)}" r="3.4" fill="${col}"/>`:''}
  </svg>`;
}
/* Snowpack vs reservoir storage across the water year — the relationship that
   matters: the snow (left axis, SWE) is the incoming water; it peaks in spring
   and melts into the reservoirs (right axis, % of capacity). Solid = this year,
   dashed = normal, so a low snow line above a low storage line tells the story. */
function snowStoreChart(basinId){
  const snow=(typeof SNOW_BASIN!=='undefined')&&SNOW_BASIN[basinId];
  const bb=(typeof BASIN_BANDS!=='undefined')&&BASIN_BANDS[basinId];
  const tcapB=(typeof BASIN_TCAP!=='undefined')&&BASIN_TCAP[basinId];
  if(!snow&&!(bb&&tcapB))return wyChart(PMH[basinId],ramp(Math.round(PMH[basinId][NOW])));
  const W=680,H=236,padL=34,padR=40,padT=30,padB=34, iw=W-padL-padR, ih=H-padT-padB;
  const base=padT+ih, X=i=>padL+i/9*iw;
  const hue=(typeof BASIN_HUE!=='undefined'&&BASIN_HUE[basinId])||'#8FA6B2';
  const SNOW='#7FD8E6';
  // storage % of telemetered capacity: this year + normal median
  let stCur=null,stNrm=null;
  if(bb&&tcapB){
    const tel=RES.filter(r=>r.b===basinId&&!r.fc&&r.dwr&&typeof RES_NORMALS!=='undefined'&&RES_NORMALS[r.id]);
    const tcap=tel.reduce((s,r)=>s+r.cap,0)||tcapB;
    if(tel.length){stCur=MONTHS.map((_,mi)=>tel.reduce((s,r)=>s+stoAt(r,mi),0)/tcap*100);}
    stNrm=MONTH_WK.map(w=>bb[1][w]/tcap*100);
  }
  const Yt=p=>base-Math.max(0,Math.min(100,p))/100*ih;
  const snowMax=snow?Math.max(1,...snow.cur.concat(snow.nrm).filter(v=>v!=null))*1.1:1;
  const Ys=v=>base-(v==null?0:v)/snowMax*ih;
  const poly=(arr,Y)=>arr.map((v,i)=>(v==null?'':(X(i).toFixed(1)+','+Y(v).toFixed(1)))).filter(Boolean);
  let s=`<svg class="histchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="${BASINS.find(b=>b.id===basinId).n} snowpack and reservoir storage across the water year.">`;
  // gridlines on the storage (right) axis
  s+=[0,50,100].map(p=>`<line x1="${padL}" y1="${Yt(p).toFixed(1)}" x2="${W-padR}" y2="${Yt(p).toFixed(1)}" stroke="#1b2b36"/>`
    +`<text x="${W-padR+5}" y="${(Yt(p)+3).toFixed(1)}" class="hc-ax" fill="${hue}">${p}%</text>`).join('');
  // month labels
  const labs=['Oct','Dec','Feb','Apr','Jun','Jul'],idx=[0,2,4,6,8,9];
  s+=idx.map((i,k)=>`<text x="${X(i).toFixed(1)}" y="${H-8}" text-anchor="middle" class="hc-ax">${labs[k]}</text>`).join('');
  // snowpack: this-year area + line, normal dashed
  if(snow){
    const pts=poly(snow.cur,Ys);
    if(pts.length>1){
      s+=`<path d="M${X(0).toFixed(1)},${base} L${pts.join('L')} L${X(9).toFixed(1)},${base} Z" fill="${SNOW}" opacity="0.15"/>`;
      s+=`<path d="M${pts.join('L')}" fill="none" stroke="${SNOW}" stroke-width="1.8" vector-effect="non-scaling-stroke"/>`;
    }
    s+=`<path d="M${poly(snow.nrm,Ys).join('L')}" fill="none" stroke="${SNOW}" stroke-width="1.1" stroke-dasharray="3 3" opacity="0.8"/>`;
    s+=`<text x="${padL-4}" y="${(padT-6).toFixed(1)}" class="hc-ax" fill="${SNOW}">SWE in</text>`;
  }
  // storage: normal dashed + this-year bold line
  if(stNrm)s+=`<path d="M${poly(stNrm,Yt).join('L')}" fill="none" stroke="${hue}" stroke-width="1.1" stroke-dasharray="3 3" opacity="0.85"/>`;
  if(stCur){s+=`<path d="M${poly(stCur,Yt).join('L')}" fill="none" stroke="${hue}" stroke-width="2.4" vector-effect="non-scaling-stroke"/>`;
    s+=`<circle cx="${X(9).toFixed(1)}" cy="${Yt(stCur[NOW]).toFixed(1)}" r="3.4" fill="${hue}"/>`;}
  // legend
  s+=`<g transform="translate(${padL},14)" font-family="var(--mono)" font-size="9">`
    +`<line x1="0" y1="-3" x2="16" y2="-3" stroke="${SNOW}" stroke-width="1.8"/><text x="20" y="0" fill="#8DA4B0">snowpack</text>`
    +`<line x1="92" y1="-3" x2="108" y2="-3" stroke="${hue}" stroke-width="2.4"/><text x="112" y="0" fill="#8DA4B0">storage</text>`
    +`<text x="182" y="0" fill="#5C7484">solid = this year · dashed = normal</text></g>`;
  return s+'</svg>';
}
window.CW_HISTORY={powellChart,wyChart,basinChart,snowStoreChart};
})();
