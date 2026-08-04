"use strict";
/* =====================================================================
   LIVE OVERLAY — the page renders fully from the js/data.js snapshot,
   then these two CORS-open endpoints upgrade it in place:
     · USGS NWIS instantaneous values — streamflow at the ~18 gages
     · Colorado DWR CDSS telemetry — latest STORAGE for mapped reservoirs
   On file:// or offline both fetches fail quietly and the snapshot stands.
   ===================================================================== */
(function(){
/* also loads on data.html, where viz.js (state, draw, renderSheet) is absent */
const S=typeof state!=='undefined'?state:{live:{}};
const redraw=()=>{if(typeof draw!=='undefined'){draw();renderSheet();}};
const GAGES=[...new Set(G.nodes.filter(n=>n.gage).map(n=>n.gage))];
const USGS_URL='https://waterservices.usgs.gov/nwis/iv/?format=json&sites='+GAGES.join(',')
  +'&parameterCd=00060&siteStatus=all';
const DWR=RES.filter(r=>r.dwr);
const CDSS_URL='https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrystation/'
  +'?format=json&parameter=STORAGE&abbrev='+DWR.map(r=>r.dwr).join('%2C');
const pad2=n=>String(n).padStart(2,'0');
const dstr=d=>pad2(d.getMonth()+1)+'%2F'+pad2(d.getDate())+'%2F'+d.getFullYear();
const CDSS_WEEK_URL='https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesday/'
  +'?format=json&parameter=STORAGE&abbrev='+DWR.map(r=>r.dwr).join('%2C')
  +'&startDate='+dstr(new Date(Date.now()-8*864e5))+'&endDate='+dstr(new Date());

function fetchJSON(url,ms){
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),ms||9000);
  return fetch(url,{signal:ctl.signal}).then(res=>{
    clearTimeout(to);
    if(!res.ok)throw new Error('HTTP '+res.status);
    return res.json();
  },err=>{clearTimeout(to);throw err;});
}
function ingestUSGS(j){
  let n=0;
  ((j.value&&j.value.timeSeries)||[]).forEach(ts=>{
    const site=ts.sourceInfo&&ts.sourceInfo.siteCode&&ts.sourceInfo.siteCode[0]&&ts.sourceInfo.siteCode[0].value;
    const vv=ts.values&&ts.values[0]&&ts.values[0].value&&ts.values[0].value[0];
    const v=vv?parseFloat(vv.value):NaN;
    if(site&&isFinite(v)&&v>=0){S.live[site]=v;n++;}
  });
  return n;
}
function ingestCDSS(j){
  const byAb=Object.fromEntries(DWR.map(r=>[r.dwr,r]));
  const cutoff=Date.now()-14*864e5; /* ignore stations gone quiet */
  /* A station can return several rows for one timestamp — some are dropout
     sensors reading 0 that would clobber the real value (Cheesman does this).
     Keep the largest plausible reading per station, and reject exact zeros:
     a working storage gage doesn't read 0, and genuinely-empty reservoirs
     have no telemetry here anyway. */
  const best={};
  ((j&&j.ResultList)||[]).forEach(row=>{
    const r=byAb[row.abbrev];if(!r)return;
    const v=row.measValue,t=Date.parse(row.measDateTime);
    if(!isFinite(v)||v<=0||!(t>cutoff))return;
    if(v>r.cap*1.15)return; /* unit mixup or bad reading */
    const cur=best[row.abbrev];
    if(!cur||v>cur.v)best[row.abbrev]={v,asOf:String(row.measDateTime).slice(0,10)};
  });
  Object.entries(best).forEach(([ab,b])=>{LIVE_STO[byAb[ab].id]={sto:b.v,asOf:b.asOf};});
  return Object.keys(LIVE_STO).length;
}
function ingestWeek(j){
  /* week of daily storage → trend in cfs (1 AF/day = 0.50417 cfs) */
  const byAb={};
  ((j&&j.ResultList)||[]).forEach(row=>{
    if(!isFinite(row.measValue)||row.measValue<=0)return;
    (byAb[row.abbrev]=byAb[row.abbrev]||[]).push({t:Date.parse(row.measDate),v:row.measValue});
  });
  const idByAb=Object.fromEntries(DWR.map(r=>[r.dwr,r.id]));
  Object.entries(byAb).forEach(([ab,pts])=>{
    if(pts.length<3||!idByAb[ab])return;
    pts.sort((a,b)=>a.t-b.t);
    const days=(pts[pts.length-1].t-pts[0].t)/864e5;
    if(days<2)return;
    const afday=(pts[pts.length-1].v-pts[0].v)/days;
    LIVE_DELTA[idByAb[ab]]=-afday*0.50417; /* falling storage = releasing */
  });
}
/* Derive statewide % of normal from the baked weekly medians (js/normals.js):
   streamflow = Σ live flow / Σ gage median; storage = capacity-weighted mean of
   each live reservoir's (live / its median). Updates the matching headline
   tiles in place so the strip shows a real, current, derived number. */
function deriveStats(){
  const out={};
  if(typeof gageMedianNow==='function'){
    let num=0,den=0;
    Object.entries(S.live).forEach(([site,v])=>{
      const m=gageMedianNow(site);
      if(m>0&&isFinite(v)){num+=v;den+=m;}
    });
    if(den>0)out.flow=Math.round(num/den*100);
  }
  if(typeof resMedianNow==='function'){
    let num=0,den=0;
    RES.forEach(r=>{
      const lv=LIVE_STO[r.id],m=resMedianNow(r);
      if(r.fc||!lv||!(m>0))return;
      num+=(lv.sto/m)*r.cap;den+=r.cap;
    });
    if(den>0)out.storage=Math.round(num/den*100);
  }
  if(typeof STATEWIDE!=='undefined'){
    const at=new Date().toLocaleDateString('en-US',{day:'numeric',month:'short'});
    STATEWIDE.forEach(s=>{
      if(s.k==='Statewide streamflow'&&out.flow!=null){s.v=out.flow+'%';s.n='of the weekly median · USGS gages, '+at+' · derived';}
      if(s.k==='Statewide storage'&&out.storage!=null){s.v=out.storage+'%';s.n='of the weekly median · DWR telemetry, '+at+' · derived';}
    });
    if(typeof renderStrip==='function')renderStrip();
  }
  window.CW_STATS=out;
  return out;
}
function status(html){
  const el=document.getElementById('livestat');
  if(el)el.innerHTML=html;
}
let busy=false;
async function refresh(){
  if(busy)return;
  busy=true;
  const btn=document.getElementById('live');
  if(btn)btn.disabled=true;
  status('Contacting USGS and Colorado DWR…');
  const [usgs,cdss,week]=await Promise.allSettled([
    fetchJSON(USGS_URL),fetchJSON(CDSS_URL),fetchJSON(CDSS_WEEK_URL,12000)]);
  const nG=usgs.status==='fulfilled'?ingestUSGS(usgs.value):0;
  const nR=cdss.status==='fulfilled'?ingestCDSS(cdss.value):0;
  if(week.status==='fulfilled')ingestWeek(week.value);
  deriveStats();
  if(nG||nR){
    const at=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    status(`Live: <b style="color:var(--bone)">${nR}</b> reservoirs (DWR telemetry) · `
      +`<b style="color:var(--bone)">${nG}</b> gages (USGS) · as of ${at}. `
      +`Everything else shows the dated snapshot.`);
    redraw();
  }else{
    status('Couldn’t reach the live services — showing the snapshot of 22 Jul 2026. '
      +'(Normal when viewing this page offline or as a saved file.)');
  }
  if(btn)btn.disabled=false;
  busy=false;
  window.dispatchEvent(new CustomEvent('cw-live',{detail:{gages:nG,reservoirs:nR}}));
}
const btn=document.getElementById('live');
if(btn)btn.addEventListener('click',refresh);
window.CW_LIVE={refresh,USGS_URL,CDSS_URL,GAGES};
/* live gage discharge by USGS site id — the story page has no `state`, so
   expose the same object it would have read from viz.js */
window.CW_LIVEQ=S.live;
/* The first refresh waits for DOMContentLoaded: with deferred scripts every
   `cw-live` listener is registered by then, so a fast response can no longer
   fire the event before anyone is listening. */
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>refresh());
else refresh();
})();
