#!/usr/bin/env node
/* Data + string-chart smoke test — pure node, zero dependencies.
   Evaluates the baked data and every chart that renders to a string
   (basin maps, step-down diagrams, shared-core marks) and asserts the
   invariants the charts depend on. Run: node scripts/smoke_data.mjs */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=f=>readFileSync(path.join(ROOT,f),'utf8');

const src=['js/normals.js','js/data.js','js/charts.js','js/basins_geo.js','js/basinmap.js']
  .map(read).join('\n');
const extract=`
var REAL=BASINS.filter(b=>b.id!=='all');
return JSON.stringify({
  basins:REAL.map(b=>b.id),
  tcap:BASIN_TCAP, bands:BASIN_BANDS, snowBasin:Object.keys(SNOW_BASIN),
  resnorm:Object.keys(RES_NORMALS),
  res:RES.map(r=>({id:r.id,b:r.b,cap:r.cap,fc:!!r.fc,dwr:r.dwr||null})),
  powell:POWELL_ANNUAL,
  decades:SNOW_DECADES,
  niceTop0:window.CW_CHARTS.niceTop(0,4),
  niceTop1:window.CW_CHARTS.niceTop(37,4),
  fmtTick:window.CW_CHARTS.fmtTick(3.7500000000000004),
  escd:window.CW_CHARTS.esc('<b>&'),
  kafSmall:window.CW_CHARTS.kaf(7864),
  kafBig:window.CW_CHARTS.kaf(1234567),
  glyph:window.CW_CHARTS.glassGlyph({h:20,frac:0.5,col:'#fff'}),
  glyphEmpty:window.CW_CHARTS.glassGlyph({h:20,frac:0,col:'#fff'}),
  spark:window.CW_CHARTS.sparkSVG([1,2,3],'#fff'),
  sparkGap:window.CW_CHARTS.sparkPath([1,null,3],i=>i*10,v=>v),
  table:window.CW_CHARTS.dataTable({head:['a','b'],rows:[['x',1]]}),
  maps:Object.fromEntries(REAL.map(b=>[b.id,window.CW_BASINMAP.render(b.id,null)])),
  flows:Object.fromEntries(REAL.map(b=>[b.id,window.CW_BASINMAP.flow(b.id,null)]))
});`;
const out=new Function('var window={};'+src+';'+extract)();
const d=JSON.parse(out);

let failures=0;
const ok=(cond,msg)=>{
  if(cond){console.log('  ok  '+msg);}
  else{failures++;console.error('  FAIL '+msg);}
};
const clean=(s,what)=>{
  ok(typeof s==='string'&&s.length>0,what+' renders');
  ok(!/NaN|undefined|Infinity/.test(s),what+' has no NaN/undefined/Infinity');
};
const vbOK=s=>{
  const m=s.match(/viewBox="([^"]+)"/);
  return !!m&&m[1].split(/[\s,]+/).map(Number).every(isFinite);
};

console.log('data invariants');
ok(d.basins.length===7,'seven basins');
for(const b of d.basins){
  ok(b in d.tcap,`BASIN_TCAP has ${b}`);
  ok(b in d.bands,`BASIN_BANDS has ${b}`);
  ok(d.snowBasin.includes(b),`SNOW_BASIN has ${b}`);
  const bb=d.bands[b];
  ok(bb.length===3&&bb.every(a=>a.length===52&&a.every(Number.isFinite)),
    `${b} bands are 3×52 finite`);
  ok(bb[0].every((v,i)=>v<=bb[1][i]&&bb[1][i]<=bb[2][i]),
    `${b} bands ordered min≤median≤max`);
  /* the fc fix, locked in: the band denominator equals the client's
     supply-only telemetered capacity for the same basin */
  const cli=d.res.filter(r=>r.b===b&&!r.fc&&r.dwr&&d.resnorm.includes(r.id))
    .reduce((s,r)=>s+r.cap,0);
  ok(d.tcap[b]===cli,`${b} BASIN_TCAP === Σ non-fc telemetered caps (${cli})`);
}
ok(d.powell.length>50&&d.powell.every(p=>Number.isFinite(p[1])&&p[1]>0),
  'POWELL_ANNUAL finite positive');
ok(d.powell.every((p,i)=>i===0||p[0]>d.powell[i-1][0]),'POWELL_ANNUAL years monotone');
ok(d.decades&&d.decades.dec&&Object.keys(d.decades.dec).length>=4,'SNOW_DECADES present');
ok(Object.values(d.decades.dec).every(x=>x.wk.length===52),'decade weeks 52-long');

console.log('shared core');
ok(Number.isFinite(d.niceTop0)&&d.niceTop0>0,'niceTop(0,4) finite ('+d.niceTop0+')');
ok(d.niceTop1>=37,'niceTop clears max');
ok(d.fmtTick==='3.75','fmtTick strips FP noise ('+d.fmtTick+')');
ok(d.escd==='&lt;b&gt;&amp;','esc escapes <>&');
ok(d.kafSmall==='7.9'&&d.kafBig==='1,235','kaf: '+d.kafSmall+' / '+d.kafBig);
clean(d.glyph,'glassGlyph half');
clean(d.glyphEmpty,'glassGlyph empty');
clean(d.spark,'sparkSVG');
ok(d.sparkGap.split('M').length===3,'sparkPath breaks at null');
clean(d.table,'dataTable');
ok(/<th scope="row">x<\/th>/.test(d.table),'dataTable row header');

console.log('string charts (basin map + step-down, all 7 basins)');
for(const b of d.basins){
  clean(d.maps[b],`render(${b})`);
  ok(vbOK(d.maps[b]),`render(${b}) viewBox finite`);
  ok(/aria-label="[^"]+"/.test(d.maps[b]),`render(${b}) aria-label`);
  clean(d.flows[b],`flow(${b})`);
  ok(vbOK(d.flows[b]),`flow(${b}) viewBox finite`);
  ok(/aria-label="[^"]*[^"\s][^"]*"/.test(d.flows[b]),`flow(${b}) aria-label`);
}

if(failures){console.error('\n'+failures+' FAILURES');process.exit(1);}
console.log('\nsmoke_data: all green');
