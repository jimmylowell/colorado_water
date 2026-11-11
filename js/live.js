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
    const at=got.at.toLocaleDateString('en-US',{day:'numeric',month:'short'});
    /* Once the water year the story covers has closed, the live readings are
       the NEW year's carryover — say so, with the day count, so the reader
       can tell the finished story from the running numbers. */
    const wyStart=new Date(SNAP_DATE.slice(0,4)+'-10-01T00:00:00');
    const dayN=Math.floor((got.at-wyStart)/864e5)+1;
    const lead=dayN>=1
      ? `Water year ${wyStart.getFullYear()+1}, day ${dayN} · carryover: `
      : `Live: `;
    status(lead+`<b style="color:var(--bone)">${got.nR}</b> reservoirs (DWR telemetry) · `
      +`<b style="color:var(--bone)">${got.nG}</b> gages (USGS, DWR) · readings gathered ${at}, `
      +`refreshed daily. Everything else shows the dated snapshot.`);
    /* the masthead date: pages that show "snapshot <date>" also get the
       readings date once it is known, so the first thing a reader sees is
       not a six-week-old date */
    const al=document.getElementById('asof-live');
    if(al){const b=al.querySelector('b');
      if(b)b.textContent=got.at.toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
      al.hidden=false;}
    redraw();
  }else{
    const snap=new Date(SNAP_DATE+'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
    status('Couldn’t load the daily readings, so this shows the snapshot of '+snap+'. '
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
