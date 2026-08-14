"use strict";
/* =====================================================================
   HYDROGRAPH — a small gov-style daily chart in the data sheet.
   Reservoirs: trailing year of daily STORAGE (Colorado DWR CDSS).
   Gages: trailing year of daily discharge (USGS NWIS).
   Both come from data/hydro.json, baked daily by the same GitHub Action
   as data/live.json — one same-origin bundle for every station, smaller
   than a single raw USGS response, so the browser never queries the
   government APIs. Offline, reservoirs fall back to the site's monthly
   reconstruction.
   ===================================================================== */
(function(){
const CACHE={};
const W=294,HT=138,M={l:37,r:6,t:10,b:26};
const IW2=W-M.l-M.r, IH2=HT-M.t-M.b;

const fetchJSON=url=>window.CW_CHARTS.fetchJSON(url,12000);
let BUNDLE=null;
function bundle(){
  if(!BUNDLE){
    BUNDLE=fetchJSON('data/hydro.json').then(j=>{
      if(!j||!j.series||!j.start)throw new Error('empty');
      return j;
    });
    BUNDLE.catch(()=>{BUNDLE=null;}); /* allow retry next time */
  }
  return BUNDLE;
}
function ensure(kind,key){
  const ck=kind+':'+key;
  if(!CACHE[ck]){
    CACHE[ck]=bundle().then(j=>{
      const arr=j.series[ck];
      if(!arr)throw new Error('no series');
      /* noon avoids the day sliding across midnight-DST boundaries */
      const t0=Date.parse(j.start+'T12:00:00');
      const pts=[];
      arr.forEach((v,i)=>{if(v!=null&&isFinite(v)&&v>=0)pts.push({t:t0+i*864e5,v});});
      if(!pts.length)throw new Error('empty');
      return pts;
    });
    CACHE[ck].catch(()=>{delete CACHE[ck];});
  }
  return CACHE[ck];
}

const MABBR=['J','F','M','A','M','J','J','A','S','O','N','D'];
const MON3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function chart(el,pts,opts){
  if(!el||!el.isConnected)return;
  const t0=pts[0].t,t1=pts[pts.length-1].t;
  const ymax=opts.ymax||Math.max(...pts.map(p=>p.v))*1.06||1;
  const x=t=>M.l+(t-t0)/((t1-t0)||1)*IW2;
  const y=v=>M.t+IH2-Math.min(1,v/ymax)*IH2;
  let line='',area='M'+M.l+','+(M.t+IH2);
  pts.forEach((p,i)=>{
    const c=(i?'L':'M')+x(p.t).toFixed(1)+','+y(p.v).toFixed(1);
    line+=c; area+='L'+x(p.t).toFixed(1)+','+y(p.v).toFixed(1);
  });
  area+='L'+x(t1).toFixed(1)+','+(M.t+IH2)+'Z';
  /* month ticks: first of each month, every other labelled */
  let ticks='';
  const d0=new Date(t0);
  for(let d=new Date(d0.getFullYear(),d0.getMonth()+1,1),i=0;d.getTime()<t1;d.setMonth(d.getMonth()+1),i++){
    const tx=x(d.getTime());
    ticks+=`<line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="${M.t+IH2}" y2="${M.t+IH2+3}" stroke="#8a8069" stroke-width="1"/>`;
    if(i%2===0)ticks+=`<text x="${tx.toFixed(1)}" y="${M.t+IH2+12}" text-anchor="middle" font-size="8" fill="#6d6450" font-family="var(--mono)">${MABBR[d.getMonth()]}</text>`;
  }
  const yt=[0,.5,1].map(f=>{
    const v=ymax*f, yy=y(v);
    return `<line x1="${M.l-3}" x2="${W-M.r}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#c9bfa4" stroke-width="${f?0.6:1}" ${f?'stroke-dasharray="2 3"':''}/>`
      +`<text x="${M.l-6}" y="${(yy+3).toFixed(1)}" text-anchor="end" font-size="8" fill="#6d6450" font-family="var(--mono)">${opts.fmtY(v)}</text>`;
  }).join('');
  const extra=(opts.lines||[]).map(l=>{
    const yy=y(l.v);
    return yy>M.t-1?`<line x1="${M.l}" x2="${W-M.r}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${l.color}" stroke-width="1" stroke-dasharray="${l.dash||'4 3'}"/>`
      +`<text x="${W-M.r}" y="${(yy-3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${l.color}" font-family="var(--mono)">${l.label}</text>`:'';
  }).join('');
  /* historical envelope: shaded weekly min–max band + a median line */
  let bandSVG='';
  if(opts.band&&opts.band.length>1){
    const b=opts.band;
    const top=b.map(p=>x(p.t).toFixed(1)+','+y(p.hi).toFixed(1)).join('L');
    const bot=b.slice().reverse().map(p=>x(p.t).toFixed(1)+','+y(p.lo).toFixed(1)).join('L');
    const med='M'+b.map(p=>x(p.t).toFixed(1)+','+y(p.med).toFixed(1)).join('L');
    bandSVG=`<path d="M${top}L${bot}Z" fill="#6d6450" opacity="0.16"/>`
      +`<path d="${med}" fill="none" stroke="#6d6450" stroke-width="1" stroke-dasharray="3 3" opacity="0.85"/>`;
  }
  el.innerHTML=`
    <svg viewBox="0 0 ${W} ${HT}" style="display:block;width:100%" role="img"
      aria-label="${(opts.caption||'daily chart').replace(/"/g,'&quot;')}">
      ${yt}
      ${bandSVG}
      <path d="${area}" fill="${opts.color}" opacity="${opts.dotted?0:.22}"/>
      <path d="${line}" fill="none" stroke="#1A2730" stroke-width="1.5"
        ${opts.dotted?'stroke-dasharray="2 4"':''} stroke-linejoin="round"/>
      ${extra}${ticks}
      <line x1="${M.l}" x2="${W-M.r}" y1="${M.t+IH2}" y2="${M.t+IH2}" stroke="#8a8069" stroke-width="1"/>
    </svg>
    <div class="hydro-cap">${opts.caption}</div>`;
  /* the shared crosshair: pointer AND touch AND keyboard, unlike the
     mousemove-only cursor this replaces */
  window.CW_CHARTS.crosshair(el.querySelector('svg'),{
    count:pts.length, y0:M.t, y1:M.t+IH2, container:el,
    indexAt:vx=>{
      const t=t0+Math.max(0,Math.min(1,(vx-M.l)/IW2))*(t1-t0);
      let lo=0,hi=pts.length-1;
      while(hi-lo>1){const mid=(lo+hi)>>1;(pts[mid].t<t?lo=mid:hi=mid);}
      return (t-pts[lo].t<pts[hi].t-t)?lo:hi;
    },
    info:i=>{
      const p=pts[i]; if(!p)return null;
      const d=new Date(p.t);
      const ds=d.getDate()+' '+MON3[d.getMonth()]+' '+d.getFullYear();
      return {x:x(p.t),
        html:`<div class="tt-h">${ds}</div><div class="tt-d"><b>${opts.fmtY(p.v)}</b>${opts.unit?' '+opts.unit:''}</div>`,
        label:ds+': '+opts.fmtY(p.v)+(opts.unit?' '+opts.unit:'')};
    }
  });
}

/* historical weekly min/median/max envelope for a reservoir, sampled across
   the chart's time span [t0,t1] from the baked RES_BANDS / RES_NORMALS.
   Week indexing is data.js's weekIdx — the same key the medians are baked on. */
const wkOf=t=>weekIdx(new Date(t));
function resBand(id,t0,t1){
  const bands=(typeof RES_BANDS!=='undefined')&&RES_BANDS[id];
  const meds=(typeof RES_NORMALS!=='undefined')&&RES_NORMALS[id];
  if(!bands||!meds)return null;
  const out=[];
  for(let t=t0;t<t1;t+=7*864e5){const i=wkOf(t);out.push({t,lo:bands[0][i],hi:bands[1][i],med:meds[i]});}
  const iL=wkOf(t1);out.push({t:t1,lo:bands[0][iL],hi:bands[1][iL],med:meds[iL]});
  return out;
}
function monthlyFallback(el,r,failed){
  /* offline: the site's own basin-scaled monthly reconstruction, dotted.
     `failed` = a live fetch was attempted and lost — say so, out loud. */
  const now=new Date(SNAP_DATE).getTime();
  const pts=MONTHS.map((m,i)=>({t:now-(NOW-i)*30.4*864e5,v:stoAt(r,i)}));
  chart(el,pts,{
    color:resColour(r.id),ymax:r.cap*1.05,dotted:true,
    fmtY:v=>(v/1000).toFixed(0)+'k',unit:'AF',
    band:resBand(r.id,pts[0].t,pts[pts.length-1].t),
    lines:[{v:r.cap,color:'#8a5a1d',label:'capacity'}],
    caption:(failed?'couldn’t load the baked daily storage — showing the ':'')
      +'basin-scaled monthly reconstruction (snapshot '+SNAP_DATE+') · '
      +'shaded = 2005–now weekly min–max, dashed = median'
  });
}

function mount(el,opts){
  if(!el)return;
  if(opts.kind==='res'){
    const r=opts.r;
    if(!r.dwr){monthlyFallback(el,r);return;}
    el.innerHTML='<div class="hydro-cap">loading daily storage…</div>';
    ensure('res',r.dwr).then(pts=>{
      const band=resBand(r.id,pts[0].t,pts[pts.length-1].t);
      chart(el,pts,{
        color:resColour(r.id),ymax:r.cap*1.05,
        fmtY:v=>(v/1000).toFixed(0)+'k',unit:'AF',
        band:band,
        lines:[{v:r.cap,color:'#8a5a1d',label:'capacity'}],
        caption:band?'daily storage (AF) · shaded = 2005–now weekly min–max, dashed = median · DWR '+r.dwr
                     :'daily storage (AF), trailing 12 months · DWR telemetry '+r.dwr
      });
    }).catch(()=>monthlyFallback(el,r,true));
  }else{
    el.innerHTML='<div class="hydro-cap">loading daily flows…</div>';
    ensure('gage',opts.site).then(pts=>{
      chart(el,pts,{
        color:'#2E7E96',
        fmtY:v=>v>=10000?(v/1000).toFixed(0)+'k':String(Math.round(v)),unit:'cfs',
        caption:'daily mean flow (cfs), trailing 12 months · USGS '+opts.site
      });
    }).catch(()=>{el.innerHTML='<div class="hydro-cap">daily flow chart needs a connection</div>';});
  }
}
window.CW_HYDRO={mount,ensure};
})();
