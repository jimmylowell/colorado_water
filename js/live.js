"use strict";
/* =====================================================================
   LIVE OVERLAY — the page renders fully from the js/data.js snapshot,
   then data/live.json upgrades it in place: USGS streamflow + Colorado
   DWR CDSS reservoir storage, fetched ONCE A DAY by a scheduled GitHub
   Action (.github/workflows/refresh-data.yml → scripts/fetch_live.py)
   and committed to the repo. Visitors download one small same-origin
   file; no browser ever hits the government APIs. The ingestion rules
   (dropout-sensor rejection, staleness cutoff, cap sanity) live in the
   fetch script now.
   On file:// or offline the fetch fails quietly and the snapshot stands.
   ===================================================================== */
(function(){
/* also loads on data.html, where viz.js (state, draw, renderSheet) is absent */
const S=typeof state!=='undefined'?state:{live:{}};
const redraw=()=>{if(typeof draw!=='undefined'){draw();renderSheet();}};
const fetchJSON=window.CW_CHARTS.fetchJSON;
const BAKED_URL='data/live.json';

function ingest(j){
  let nG=0,nR=0;
  Object.entries(j.gages||{}).forEach(([site,v])=>{
    if(isFinite(v)&&v>=0){S.live[site]=v;nG++;}
  });
  Object.entries(j.res||{}).forEach(([id,o])=>{
    if(o&&isFinite(o.sto)&&o.sto>0){LIVE_STO[id]={sto:o.sto,asOf:o.asOf};nR++;}
  });
  Object.entries(j.delta||{}).forEach(([id,v])=>{if(isFinite(v))LIVE_DELTA[id]=v;});
  return {nG,nR,at:new Date(Date.parse(j.generated))};
}
/* Derive statewide % of normal from the baked weekly medians (js/normals.js):
   streamflow = Σ live flow / Σ gage median; storage = capacity-weighted mean of
   each live reservoir's (live / its median). Updates the matching headline
   tiles in place so the strip shows a real, current, derived number. */
function deriveStats(asOf){
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
    const at=(asOf||new Date()).toLocaleDateString('en-US',{day:'numeric',month:'short'});
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
  status('Loading the daily readings…');
  let got=null;
  try{
    const j=await fetchJSON(BAKED_URL,10000);
    if(j&&j.generated)got=ingest(j);
  }catch(e){}
  if(got&&(got.nG||got.nR)){
    deriveStats(got.at);
    const at=got.at.toLocaleDateString('en-US',{day:'numeric',month:'short'});
    status(`Live: <b style="color:var(--bone)">${got.nR}</b> reservoirs (DWR telemetry) · `
      +`<b style="color:var(--bone)">${got.nG}</b> gages (USGS) · readings gathered ${at}, `
      +`refreshed daily. Everything else shows the dated snapshot.`);
    redraw();
  }else{
    const snap=new Date(SNAP_DATE+'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
    status('Couldn’t load the daily readings — showing the snapshot of '+snap+'. '
      +'(Normal when viewing this page offline or as a saved file.)');
  }
  busy=false;
  window.dispatchEvent(new CustomEvent('cw-live',{detail:{gages:got?got.nG:0,reservoirs:got?got.nR:0}}));
}
/* live gage discharge by USGS site id — the story page has no `state`, so
   expose the same object it would have read from viz.js */
window.CW_LIVEQ=S.live;
/* The first refresh waits for DOMContentLoaded: with deferred scripts every
   `cw-live` listener is registered by then, so a fast response can no longer
   fire the event before anyone is listening. */
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>refresh());
else refresh();
})();
