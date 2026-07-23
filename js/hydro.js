"use strict";
/* =====================================================================
   HYDROGRAPH — a small gov-style daily chart in the data sheet.
   Reservoirs: trailing year of daily STORAGE from Colorado DWR CDSS.
   Gages: trailing year of daily discharge from USGS NWIS.
   Offline, reservoirs fall back to the site's monthly reconstruction.
   Both endpoints are CORS-open; series are cached per station.
   ===================================================================== */
(function(){
const CACHE={};
const W=294,HT=138,M={l:37,r:6,t:10,b:26};
const IW2=W-M.l-M.r, IH2=HT-M.t-M.b;

function pad2(n){return String(n).padStart(2,'0');}
function cdssURL(abbrev){
  const now=new Date(), ago=new Date(now.getTime()-365*864e5);
  const f=d=>pad2(d.getMonth()+1)+'%2F'+pad2(d.getDate())+'%2F'+d.getFullYear();
  return 'https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesday/'
    +'?format=json&parameter=STORAGE&abbrev='+abbrev+'&startDate='+f(ago)+'&endDate='+f(now);
}
function usgsURL(site){
  return 'https://waterservices.usgs.gov/nwis/dv/?format=json&sites='+site
    +'&parameterCd=00060&period=P365D';
}
function fetchJSON(url){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),12000);
  return fetch(url,{signal:ctl.signal}).then(res=>{
    clearTimeout(to);
    if(!res.ok)throw new Error('HTTP '+res.status);
    return res.json();
  },err=>{clearTimeout(to);throw err;});
}
function ensure(kind,key){
  const ck=kind+':'+key;
  if(!CACHE[ck]){
    CACHE[ck]=(kind==='res'
      ? fetchJSON(cdssURL(key)).then(j=>((j&&j.ResultList)||[])
          .map(row=>({t:Date.parse(row.measDate),v:row.measValue}))
          .filter(p=>isFinite(p.t)&&isFinite(p.v)&&p.v>=0))
      : fetchJSON(usgsURL(key)).then(j=>{
          const ts=j.value&&j.value.timeSeries&&j.value.timeSeries[0];
          const vv=(ts&&ts.values&&ts.values[0]&&ts.values[0].value)||[];
          return vv.map(p=>({t:Date.parse(p.dateTime),v:parseFloat(p.value)}))
            .filter(p=>isFinite(p.t)&&isFinite(p.v)&&p.v>=0);
        })
    ).then(pts=>{pts.sort((a,b)=>a.t-b.t);if(!pts.length)throw new Error('empty');return pts;});
    CACHE[ck].catch(()=>{delete CACHE[ck];}); /* allow retry next time */
  }
  return CACHE[ck];
}

const MABBR=['J','F','M','A','M','J','J','A','S','O','N','D'];
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
  el.innerHTML=`
    <svg viewBox="0 0 ${W} ${HT}" style="display:block;width:100%">
      ${yt}
      <path d="${area}" fill="${opts.color}" opacity="${opts.dotted?0:.22}"/>
      <path d="${line}" fill="none" stroke="#1A2730" stroke-width="1.5"
        ${opts.dotted?'stroke-dasharray="2 4"':''} stroke-linejoin="round"/>
      ${extra}${ticks}
      <line x1="${M.l}" x2="${W-M.r}" y1="${M.t+IH2}" y2="${M.t+IH2}" stroke="#8a8069" stroke-width="1"/>
      <rect class="hydro-hit" x="${M.l}" y="${M.t}" width="${IW2}" height="${IH2}" fill="transparent"/>
      <g class="hydro-cursor" style="display:none">
        <line y1="${M.t}" y2="${M.t+IH2}" stroke="#1A2730" stroke-width="0.7" stroke-dasharray="2 2"/>
        <text y="${M.t+8}" font-size="8.5" fill="#1A2730" font-family="var(--mono)"></text>
      </g>
    </svg>
    <div class="hydro-cap">${opts.caption}</div>`;
  const svg=el.querySelector('svg'),cur=el.querySelector('.hydro-cursor'),
        cl=cur.querySelector('line'),ct=cur.querySelector('text');
  el.querySelector('.hydro-hit').addEventListener('mousemove',ev=>{
    const box=svg.getBoundingClientRect();
    const mx=(ev.clientX-box.left)/box.width*W;
    const t=t0+Math.max(0,Math.min(1,(mx-M.l)/IW2))*(t1-t0);
    let lo=0,hi=pts.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;(pts[mid].t<t?lo=mid:hi=mid);}
    const p=(t-pts[lo].t<pts[hi].t-t)?pts[lo]:pts[hi];
    const xx=x(p.t);
    cur.style.display='';
    cl.setAttribute('x1',xx);cl.setAttribute('x2',xx);
    ct.setAttribute('x',xx+(xx>W-90?-4:4));
    ct.setAttribute('text-anchor',xx>W-90?'end':'start');
    const d=new Date(p.t);
    ct.textContent=opts.fmtY(p.v)+' · '+d.getDate()+' '+
      ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  });
  el.querySelector('.hydro-hit').addEventListener('mouseleave',()=>{cur.style.display='none';});
}

function monthlyFallback(el,r){
  /* offline: the site's own basin-scaled monthly reconstruction, dotted */
  const now=new Date('2026-07-22').getTime();
  const pts=MONTHS.map((m,i)=>({t:now-(NOW-i)*30.4*864e5,v:stoAt(r,i)}));
  chart(el,pts,{
    color:resColour(r.id),ymax:r.cap*1.05,dotted:true,
    fmtY:v=>(v/1000).toFixed(0)+'k',
    lines:[{v:r.cap,color:'#8a5a1d',label:'capacity'}],
    caption:'basin-scaled monthly reconstruction — live daily chart needs a connection'
  });
}

function mount(el,opts){
  if(!el)return;
  if(opts.kind==='res'){
    const r=opts.r;
    if(!r.dwr){monthlyFallback(el,r);return;}
    el.innerHTML='<div class="hydro-cap">loading daily storage…</div>';
    ensure('res',r.dwr).then(pts=>{
      const med=r.pm>0&&r.sto>0?r.sto/(r.pm/100):null;
      chart(el,pts,{
        color:resColour(r.id),ymax:r.cap*1.05,
        fmtY:v=>(v/1000).toFixed(0)+'k',
        lines:[{v:r.cap,color:'#8a5a1d',label:'capacity'}]
          .concat(med?[{v:med,color:'#1d5c4a',label:'normal today',dash:'2 3'}]:[]),
        caption:'daily storage (AF), trailing 12 months · DWR telemetry '+r.dwr
      });
    }).catch(()=>monthlyFallback(el,r));
  }else{
    el.innerHTML='<div class="hydro-cap">loading daily flows…</div>';
    ensure('gage',opts.site).then(pts=>{
      chart(el,pts,{
        color:'#2E7E96',
        fmtY:v=>v>=10000?(v/1000).toFixed(0)+'k':String(Math.round(v)),
        caption:'daily mean flow (cfs), trailing 12 months · USGS '+opts.site
      });
    }).catch(()=>{el.innerHTML='<div class="hydro-cap">daily flow chart needs a connection</div>';});
  }
}
window.CW_HYDRO={mount,ensure};
})();
