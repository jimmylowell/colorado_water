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
  let n=0;
  const byAb=Object.fromEntries(DWR.map(r=>[r.dwr,r]));
  const cutoff=Date.now()-14*864e5; /* ignore stations gone quiet */
  ((j&&j.ResultList)||[]).forEach(row=>{
    const r=byAb[row.abbrev],v=row.measValue,t=Date.parse(row.measDateTime);
    if(!r||!isFinite(v)||v<0||!(t>cutoff))return;
    if(v>r.cap*1.15)return; /* unit mixup or bad reading */
    LIVE_STO[r.id]={sto:v,asOf:String(row.measDateTime).slice(0,10)};
  });
  return Object.keys(LIVE_STO).length;
}
function ingestWeek(j){
  /* week of daily storage → trend in cfs (1 AF/day = 0.50417 cfs) */
  const byAb={};
  ((j&&j.ResultList)||[]).forEach(row=>{
    if(!isFinite(row.measValue))return;
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
refresh();
})();
