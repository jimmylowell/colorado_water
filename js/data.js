"use strict";
/* =====================================================================
   PALETTE — seven hues, reused only between systems that never mix
   ===================================================================== */
const H={blue:'#2F6BFF',cyan:'#00D6E6',green:'#2FD94F',lime:'#C6E01A',orange:'#FF8A2B',red:'#FF3355',magenta:'#C24BFF'};

/* =====================================================================
   RESERVOIRS  (c:'obs' = published reading; c:'est' = basin-scaled)
   ===================================================================== */
const STATEWIDE=[
 {k:'Statewide storage',v:'75%',n:'of 1991–2020 median · NRCS, 1 Jun',cls:'mid',spark:'storage'},
 {k:'Statewide streamflow',v:'44%',n:'of normal · USGS gages, 20 Jul',cls:'low',spark:'flow'},
 {k:'Peak snowpack',v:'melted',n:'91% of SNOTEL sites bare by 1 Jun',cls:'low'},
 {k:'Denver Water system',v:'77%',n:'full vs. 97% normal · 20 Jul',cls:'mid',spark:'denver'},
 {k:'Colorado R. at Cameo',v:'1,520',n:'cfs · USGS 09095500',cls:'low',spark:'flow'},
 {k:'Reservoir capacity used',v:'54%',n:'statewide · NRCS, 1 Jun',cls:'mid',spark:'storage'}
];

const RES=[
 {id:'granby',dwr:'GRARESCO',n:'Lake Granby',lat:40.150,lon:-105.910,cap:539758,sto:366074,pm:84,b:'colorado',r:'Colorado River',c:'obs',d:'7 Jun 2026',s:'USBR ARCWEB'},
 {id:'shadow',dwr:'SHARESCO',n:'Shadow Mountain',lat:40.222,lon:-105.848,cap:18369,sto:17450,pm:99,b:'colorado',r:'Colorado River',c:'est'},
 {id:'willow',dwr:'WILRESCO',n:'Willow Creek Res.',lat:40.143,lon:-106.018,cap:10553,sto:7280,pm:80,b:'colorado',r:'Willow Creek',c:'est'},
 {id:'wmsfork',dwr:'WLFRESCO',n:'Williams Fork Res.',lat:39.958,lon:-106.203,cap:96822,sto:42094,pm:56,b:'colorado',r:'Williams Fork',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'wolford',n:'Wolford Mountain',lat:40.100,lon:-106.340,cap:65985,sto:41400,pm:80,b:'colorado',r:'Muddy Creek',c:'est'},
 {id:'greenmtn',dwr:'GRERESCO',n:'Green Mountain',lat:39.880,lon:-106.330,cap:154645,sto:34947,pm:50,b:'colorado',r:'Blue River',c:'obs',d:'22 Jul 2026',s:'USBR via Snoflo'},
 {id:'dillon',dwr:'DILRESCO',n:'Dillon Reservoir',lat:39.610,lon:-106.060,cap:257304,sto:199482,pm:82,b:'colorado',r:'Blue River',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'ruedi',dwr:'RUERESCO',n:'Ruedi Reservoir',lat:39.362,lon:-106.820,cap:102373,sto:70170,pm:102,b:'colorado',r:'Fryingpan River',c:'obs',d:'15 Jul 2026',s:'USBR via Snoflo'},
 {id:'homestake',dwr:'HOMRESCO',n:'Homestake Res.',lat:39.420,lon:-106.420,cap:43600,sto:19355,pm:49,b:'colorado',r:'Homestake Creek',c:'est'},
 {id:'vega',n:'Vega Reservoir',lat:39.230,lon:-107.790,cap:33171,sto:23900,pm:80,b:'colorado',r:'Plateau Creek',c:'est'},
 {id:'riflegap',dwr:'RIFRESCO',n:'Rifle Gap',lat:39.630,lon:-107.750,cap:13600,sto:3200,pm:26,b:'colorado',r:'Rifle Creek',c:'est'},
 {id:'taylor',n:'Taylor Park Res.',lat:38.820,lon:-106.600,cap:106225,sto:66900,pm:70,b:'gunnison',r:'Taylor River',c:'est'},
 {id:'bluemesa',dwr:'BLMRESCO',n:'Blue Mesa Res.',lat:38.460,lon:-107.200,cap:940700,sto:259379,pm:54,b:'gunnison',r:'Gunnison River',c:'obs',d:'17 Jul 2026',s:'USBR via Snoflo'},
 {id:'morrow',n:'Morrow Point',lat:38.480,lon:-107.420,cap:117190,sto:114834,pm:99,b:'gunnison',r:'Gunnison River',c:'obs',d:'29 Jun 2026',s:'USBR'},
 {id:'crystalg',n:'Crystal Reservoir',lat:38.510,lon:-107.580,cap:25236,sto:22700,pm:97,b:'gunnison',r:'Gunnison River',c:'est'},
 {id:'paonia',n:'Paonia Reservoir',lat:38.990,lon:-107.340,cap:20950,sto:13200,pm:70,b:'gunnison',r:'N. Fork Gunnison',c:'est'},
 {id:'ridgway',n:'Ridgway Reservoir',lat:38.200,lon:-107.750,cap:84590,sto:53300,pm:70,b:'gunnison',r:'Uncompahgre River',c:'est'},
 {id:'crawford',n:'Crawford Res.',lat:38.710,lon:-107.600,cap:14395,sto:9070,pm:70,b:'gunnison',r:'Smith Fork',c:'est'},
 {id:'stagecoach',n:'Stagecoach Res.',lat:40.280,lon:-106.860,cap:33275,sto:23300,pm:78,b:'yampa',r:'Yampa River',c:'est'},
 {id:'steamboatl',dwr:'STELAKCO',n:'Steamboat Lake',lat:40.790,lon:-106.950,cap:26000,sto:18200,pm:78,b:'yampa',r:'Willow Creek',c:'est'},
 {id:'elkhead',n:'Elkhead Reservoir',lat:40.550,lon:-107.400,cap:25610,sto:17900,pm:78,b:'yampa',r:'Elkhead Creek',c:'est'},
 {id:'mcphee',dwr:'MCPRESCO',n:'McPhee Reservoir',lat:37.550,lon:-108.600,cap:381195,sto:210000,pm:69,b:'sw',r:'Dolores River',c:'est'},
 {id:'vallecito',dwr:'VALRESCO',n:'Vallecito Res.',lat:37.380,lon:-107.570,cap:129700,sto:71500,pm:69,b:'sw',r:'Los Pinos River',c:'est'},
 {id:'lemon',n:'Lemon Reservoir',lat:37.380,lon:-107.660,cap:40146,sto:22100,pm:69,b:'sw',r:'Florida River',c:'est'},
 {id:'nighthorse',dwr:'BASRESCO',n:'Lake Nighthorse',lat:37.230,lon:-107.900,cap:123541,sto:117000,pm:97,b:'sw',r:'Animas (pumped)',c:'est'},
 {id:'navajo',n:'Navajo Reservoir',lat:37.000,lon:-107.400,cap:1708600,sto:969000,pm:70,b:'sw',r:'San Juan River',c:'obs',d:'1 Jul 2026',s:'USBR UC Region'},
 {id:'riogrande',dwr:'RIORESCO',n:'Rio Grande Res.',lat:37.730,lon:-107.270,cap:52192,sto:34500,pm:86,b:'rio',r:'Rio Grande',c:'est'},
 {id:'platoro',dwr:'PLARESCO',n:'Platoro Reservoir',lat:37.350,lon:-106.530,cap:59570,sto:39400,pm:86,b:'rio',r:'Conejos River',c:'est'},
 {id:'sanchez',dwr:'SANRESCO',n:'Sanchez Reservoir',lat:37.100,lon:-105.420,cap:103000,sto:2451,pm:4,b:'rio',r:'Ventero Creek',c:'est'},
 {id:'turquoise',dwr:'TURQLACO',n:'Turquoise Lake',lat:39.250,lon:-106.400,cap:129432,sto:94500,pm:91,b:'arkansas',r:'Lake Fork Arkansas',c:'est'},
 {id:'twinlakes',dwr:'TWIRESCO',n:'Twin Lakes',lat:39.080,lon:-106.350,cap:141000,sto:103000,pm:91,b:'arkansas',r:'Lake Creek',c:'est'},
 {id:'pueblo',n:'Pueblo Reservoir',lat:38.260,lon:-104.720,cap:357000,sto:196000,pm:93,b:'arkansas',r:'Arkansas River',c:'est'},
 {id:'trinidad',n:'Trinidad Lake',lat:37.140,lon:-104.600,cap:114000,sto:22800,pm:52,b:'arkansas',r:'Purgatoire River',c:'est'},
 {id:'johnmartin',dwr:'JMRCADCO',n:'John Martin Res.',lat:38.070,lon:-102.930,cap:616000,sto:31000,pm:41,b:'arkansas',r:'Arkansas River',c:'est'},
 {id:'antero',n:'Antero Reservoir',lat:39.000,lon:-105.900,cap:20122,sto:16100,pm:90,b:'platte',r:'South Platte River',c:'est'},
 {id:'spinney',dwr:'SPIRESCO',n:'Spinney Mtn Res.',lat:38.972,lon:-105.622,cap:53651,sto:25239,pm:66,b:'platte',r:'South Platte River',c:'est'},
 {id:'elevenmile',n:'Eleven Mile Canyon',lat:38.930,lon:-105.480,cap:97779,sto:98664,pm:104,b:'platte',r:'South Platte River',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'cheesman',dwr:'CHERESCO',n:'Cheesman Reservoir',lat:39.200,lon:-105.270,cap:79064,sto:59114,pm:88,b:'platte',r:'South Platte River',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'strontia',dwr:'STRRESCO',n:'Strontia Springs',lat:39.420,lon:-105.130,cap:7864,sto:6849,pm:95,b:'platte',r:'South Platte River',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'chatfield',dwr:'CHARESCO',n:'Chatfield Res.',lat:39.540,lon:-105.070,cap:28709,sto:24148,pm:92,b:'platte',r:'South Platte River',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 /* fc:1 = USACE flood-control pools — drawn because everyone sees them,
    flagged because nobody drinks them. cap = permanent multipurpose pool,
    not the far larger flood space held empty behind each dam. */
 {id:'cherrycreek',dwr:'CHRRESCO',fc:1,n:'Cherry Creek Res.',lat:39.6506,lon:-104.8543,cap:13077,sto:11381,pm:100,b:'platte',r:'Cherry Creek',c:'obs',d:'22 Jul 2026',s:'USACE dam · DWR telemetry'},
 {id:'bearcreek',dwr:'BCRRESCO',fc:1,n:'Bear Creek Lake',lat:39.6537,lon:-105.1408,cap:1996,sto:899,pm:100,b:'platte',r:'Bear Creek',c:'obs',d:'22 Jul 2026',s:'USACE dam · DWR telemetry'},
 {id:'marston',n:'Marston Reservoir',lat:39.650,lon:-105.080,cap:19108,sto:18265,pm:99,b:'platte',r:'Denver system',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'gross',dwr:'GROSRECO',n:'Gross Reservoir',lat:39.950,lon:-105.360,cap:41811,sto:23389,pm:70,b:'platte',r:'S. Boulder Creek',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'ralston',n:'Ralston Reservoir',lat:39.830,lon:-105.250,cap:10776,sto:10113,pm:98,b:'platte',r:'Ralston Creek',c:'obs',d:'16 Jul 2026',s:'Denver Water CSV'},
 {id:'standley',dwr:'STALAKCO',n:'Standley Lake',lat:39.870,lon:-105.130,cap:42000,sto:33600,pm:90,b:'platte',r:'Clear Creek (div.)',c:'est'},
 {id:'horsetooth',dwr:'HORTOOCO',n:'Horsetooth Res.',lat:40.570,lon:-105.170,cap:156735,sto:141000,pm:96,b:'platte',r:'C-BT terminal',c:'est'},
 {id:'carter',dwr:'CARTERCO',n:'Carter Lake',lat:40.330,lon:-105.220,cap:108900,sto:88200,pm:84,b:'platte',r:'C-BT terminal',c:'obs',d:'Jul 2026',s:'Northern Water via Snoflo'},
 {id:'boyd',n:'Boyd Lake',lat:40.440,lon:-105.050,cap:48871,sto:12200,pm:32,b:'platte',r:'Big Thompson (div.)',c:'est'},
 {id:'jackson',n:'Jackson Lake',lat:40.380,lon:-104.090,cap:35000,sto:27650,pm:79,b:'platte',r:'S. Platte (div.)',c:'est'},
 {id:'prewitt',n:'Prewitt Reservoir',lat:40.630,lon:-103.400,cap:28840,sto:22780,pm:79,b:'platte',r:'S. Platte (div.)',c:'est'},
 {id:'nsterling',n:'North Sterling',lat:40.790,lon:-103.130,cap:74590,sto:58900,pm:79,b:'platte',r:'S. Platte (div.)',c:'est'}
];
const RESBY=Object.fromEntries(RES.map(r=>[r.id,r]));
const RESHUE_FALLBACK={shadow:H.blue,willow:H.blue,wolford:H.blue,riflegap:H.blue,paonia:H.magenta,crawford:H.magenta,
  marston:H.green,ralston:H.cyan,standley:H.lime,prewitt:H.orange};

/* =====================================================================
   HISTORICAL BASIN STORAGE — % of 1991–2020 median, end of month.
   Anchors from NRCS reports (Dec, Mar, Apr, May); other months
   interpolated; July carries the June reading forward.
   ===================================================================== */
const MONTHS=['Oct 2025','Nov 2025','Dec 2025','Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026','Jul 2026'];
const PMH={
 colorado:[91,90,88,88,89,91,93,84,80,80],
 gunnison:[90,86,79,78,77,76,75,72,70,70],
 yampa:  [92,89,85,84,83,82,81,80,78,78],
 sw:     [84,80,77,76,75,74,73,71,69,69],
 rio:    [118,120,122,121,120,119,118,96,86,86],
 arkansas:[100,100,100,100,100,99,100,96,91,91],
 platte: [98,99,100,100,99,100,93,92,90,90]
};
/* Statewide streamflow % of normal by month — note the record-early March
   melt spike. Illustrative series anchored to NRCS/USGS statements. */
const FLOWPCT=[55,50,48,45,46,135,70,55,34,44];
const NOW=9;
/* LIVE_STO is filled by live.js with {sto, asOf} per reservoir id when a
   fresh DWR telemetry reading arrives; the snapshot stands otherwise.
   LIVE_DELTA holds the week's storage trend as cfs (+ = drawing down). */
const LIVE_STO={};
const LIVE_DELTA={};
function pmFactor(b,mi){ return (PMH[b]?PMH[b][mi]/PMH[b][NOW]:1); }
function stoAt(r,mi){
  if(mi===NOW&&LIVE_STO[r.id])return Math.min(r.cap*1.05,LIVE_STO[r.id].sto);
  return Math.min(r.cap*1.02, r.sto*pmFactor(r.b,mi));
}
function pmAt(r,mi){
  if(mi===NOW&&LIVE_STO[r.id]&&r.pm>0&&r.sto>0)
    return Math.round(LIVE_STO[r.id].sto/(r.sto/(r.pm/100))*100);
  return Math.round(r.pm*pmFactor(r.b,mi));
}
function qFactor(mi){ return FLOWPCT[mi]/FLOWPCT[NOW]; }

/* =====================================================================
   GEOGRAPHIC LAYER
   ===================================================================== */
const RIVERS=[
 {n:'Colorado River',src:'h_co',blendTo:'x_utah',w:3.2,b:'colorado',p:[[40.25,-105.83],[40.15,-105.92],[40.09,-106.02],[40.06,-106.39],[39.85,-106.65],[39.66,-107.07],[39.55,-107.32],[39.53,-107.78],[39.45,-108.05],[39.33,-108.22],[39.11,-108.36],[39.07,-108.57],[39.16,-108.73],[39.20,-109.05]]},
 {n:'Blue River',src:'h_bl',w:1.8,b:'colorado',p:[[39.42,-106.06],[39.48,-106.04],[39.61,-106.06],[39.72,-106.10],[39.88,-106.33],[40.06,-106.39]]},
 {n:'Fraser River',src:'h_fr',w:1.3,b:'colorado',p:[[39.89,-105.78],[39.94,-105.82],[39.99,-105.86],[40.06,-105.92],[40.09,-106.00]]},
 {n:'Williams Fork',src:'h_wf',w:1.3,b:'colorado',p:[[39.80,-106.05],[39.90,-106.16],[39.96,-106.20],[40.03,-106.28]]},
 {n:'Eagle River',src:'h_eg',w:1.6,b:'colorado',p:[[39.36,-106.31],[39.50,-106.38],[39.59,-106.43],[39.63,-106.52],[39.65,-106.83],[39.65,-106.95],[39.66,-107.07]]},
 {n:'Roaring Fork',src:'h_rf',w:1.8,b:'colorado',p:[[39.11,-106.56],[39.19,-106.82],[39.30,-106.95],[39.37,-107.03],[39.40,-107.21],[39.48,-107.28],[39.55,-107.32]]},
 {n:'Fryingpan R.',hue:H.red,w:1.1,b:'colorado',p:[[39.32,-106.58],[39.36,-106.82],[39.37,-107.03]]},
 {n:'Crystal River',hue:H.red,w:1.1,b:'colorado',p:[[39.07,-107.19],[39.19,-107.24],[39.30,-107.22],[39.40,-107.21]]},
 {n:'Plateau Creek',src:'h_pl',w:1.0,b:'colorado',p:[[39.23,-107.79],[39.20,-108.00],[39.19,-108.20],[39.11,-108.36]]},
 {n:'Gunnison River',src:'h_gu',blendTo:'gu_gj',w:2.4,b:'gunnison',p:[[38.66,-106.85],[38.55,-106.93],[38.46,-107.20],[38.48,-107.42],[38.51,-107.58],[38.57,-107.68],[38.74,-108.07],[38.98,-108.44],[39.06,-108.56]]},
 {n:'Taylor River',hue:H.magenta,w:1.2,b:'gunnison',p:[[38.82,-106.60],[38.75,-106.72],[38.66,-106.85]]},
 {n:'East River',hue:H.magenta,w:1.0,b:'gunnison',p:[[38.87,-106.95],[38.75,-106.90],[38.66,-106.85]]},
 {n:'Uncompahgre R.',src:'h_un',w:1.3,b:'gunnison',p:[[38.02,-107.67],[38.20,-107.75],[38.48,-107.88],[38.62,-108.00],[38.74,-108.07]]},
 {n:'N. Fork Gunnison',hue:H.magenta,w:1.2,b:'gunnison',p:[[38.99,-107.34],[38.87,-107.59],[38.80,-107.72],[38.76,-107.98]]},
 {n:'Yampa River',src:'h_ya',blendTo:'yj2',w:2.0,b:'yampa',p:[[40.28,-106.86],[40.40,-106.85],[40.48,-106.83],[40.52,-107.20],[40.52,-107.55],[40.51,-108.08],[40.44,-108.55],[40.44,-108.98]]},
 {n:'Elk River',src:'h_el',w:1.1,b:'yampa',p:[[40.79,-106.90],[40.65,-106.90],[40.50,-106.86]]},
 {n:'Elkhead Creek',src:'h_eh',w:0.9,b:'yampa',p:[[40.55,-107.40],[40.53,-107.48],[40.52,-107.55]]},
 {n:'Little Snake R.',src:'h_ls',w:1.1,b:'yampa',p:[[41.00,-107.60],[40.80,-107.90],[40.62,-108.20],[40.51,-108.30]]},
 {n:'White River',src:'h_wh',w:1.6,b:'yampa',p:[[39.98,-107.24],[40.04,-107.60],[40.04,-107.91],[40.09,-108.40],[40.09,-108.80],[40.09,-109.05]]},
 {n:'Dolores River',src:'h_do',blendTo:'do1',w:1.6,b:'sw',p:[[37.69,-108.03],[37.47,-108.50],[37.60,-108.63],[38.00,-108.75],[38.30,-108.90],[38.68,-108.98],[38.83,-109.05]]},
 {n:'San Miguel R.',src:'h_sm',w:1.2,b:'sw',p:[[37.94,-107.81],[38.02,-108.06],[38.13,-108.29],[38.22,-108.60],[38.30,-108.88]]},
 {n:'Animas River',src:'h_an',w:1.5,b:'sw',p:[[37.81,-107.66],[37.60,-107.75],[37.44,-107.83],[37.27,-107.88],[36.99,-108.00]]},
 {n:'San Juan River',src:'h_sj',blendTo:'sjj',w:1.7,b:'sw',p:[[37.62,-107.01],[37.45,-107.02],[37.27,-107.01],[37.14,-107.20],[37.00,-107.40]]},
 {n:'Los Pinos R.',src:'h_lp',w:1.0,b:'sw',p:[[37.55,-107.50],[37.38,-107.57],[37.15,-107.60],[37.00,-107.55]]},
 {n:'Piedra River',hue:H.cyan,w:0.9,b:'sw',p:[[37.50,-107.30],[37.30,-107.28],[37.10,-107.28],[37.02,-107.35]]},
 {n:'Rio Grande',src:'h_rg',blendTo:'rgj2',w:2.0,b:'rio',p:[[37.73,-107.27],[37.85,-106.93],[37.67,-106.64],[37.68,-106.35],[37.58,-106.15],[37.47,-105.87],[37.20,-105.70],[36.99,-105.68]]},
 {n:'Conejos River',src:'h_cj',w:1.1,b:'rio',p:[[37.35,-106.53],[37.25,-106.30],[37.15,-106.05],[37.09,-105.90]]},
 {n:'Alamosa River',hue:H.red,w:0.8,b:'rio',p:[[37.35,-106.60],[37.38,-106.20],[37.42,-105.95]]},
 {n:'Arkansas River',src:'h_ar',blendTo:'arj3',w:2.4,b:'arkansas',p:[[39.25,-106.30],[39.18,-106.32],[39.04,-106.27],[38.84,-106.13],[38.53,-105.99],[38.44,-105.24],[38.27,-104.61],[38.05,-103.72],[37.99,-103.54],[38.07,-102.93],[38.09,-102.62],[38.05,-102.05]]},
 {n:'Purgatoire R.',src:'h_pu',w:1.1,b:'arkansas',p:[[37.14,-104.60],[37.17,-104.50],[37.45,-104.10],[37.75,-103.60],[38.05,-103.23]]},
 {n:'Fountain Creek',src:'h_fo',w:1.1,b:'arkansas',p:[[38.95,-104.85],[38.83,-104.82],[38.55,-104.70],[38.27,-104.61]]},
 {n:'Huerfano R.',src:'h_hu',w:0.8,b:'arkansas',p:[[37.70,-105.20],[38.00,-104.80],[38.15,-104.55]]},
 {n:'South Platte R.',src:'h_sp',blendTo:'spj3',w:2.4,b:'platte',p:[[39.00,-105.90],[38.93,-105.48],[39.20,-105.27],[39.28,-105.16],[39.54,-105.07],[39.75,-105.00],[39.98,-104.82],[40.38,-104.60],[40.25,-103.80],[40.62,-103.21],[40.98,-102.26],[41.00,-102.05]]},
 {n:'Cache la Poudre',src:'h_cp',w:1.4,b:'platte',p:[[40.70,-105.85],[40.66,-105.50],[40.59,-105.08],[40.48,-104.85],[40.40,-104.63]]},
 {n:'Big Thompson R.',src:'h_bt',w:1.2,b:'platte',p:[[40.38,-105.62],[40.38,-105.30],[40.40,-105.07],[40.34,-104.72],[40.32,-104.62]]},
 {n:'St. Vrain Creek',src:'h_bo',w:1.1,b:'platte',p:[[40.22,-105.55],[40.18,-105.28],[40.16,-105.10],[40.13,-104.85],[40.15,-104.72]]},
 {n:'S. Boulder Ck',src:'h_bo',w:0.9,b:'platte',p:[[39.95,-105.60],[39.95,-105.36],[39.98,-105.15],[40.02,-104.98]]},
 {n:'Clear Creek',src:'h_cc',w:1.1,b:'platte',p:[[39.71,-105.70],[39.74,-105.45],[39.75,-105.22],[39.78,-105.02]]},
 {n:'Cherry Creek',hue:H.orange,w:0.9,b:'platte',p:[[39.39,-104.75],[39.55,-104.80],[39.65,-104.86],[39.70,-104.94],[39.75,-105.00]]},
 {n:'Bear Creek',hue:H.lime,w:0.9,b:'platte',p:[[39.63,-105.60],[39.65,-105.35],[39.654,-105.14],[39.65,-105.02]]},
 {n:'North Platte R.',hue:'#4C7C8E',w:1.2,b:'platte',p:[[40.55,-106.20],[40.73,-106.28],[40.90,-106.32],[41.00,-106.35]]}
];
const DIVIDE=[[41.00,-106.30],[40.72,-106.42],[40.42,-105.83],[40.25,-105.78],[39.98,-105.72],[39.80,-105.78],[39.66,-105.88],[39.50,-106.10],[39.35,-106.20],[39.12,-106.36],[38.80,-106.42],[38.50,-106.32],[38.20,-106.55],[37.85,-106.70],[37.48,-106.80],[37.20,-106.72],[37.00,-106.62]];

/* Transmountain tunnels drawn on the geographic view.
   f/t: reservoir id or [lat,lon] portal; fb/tb: basins for the filter. */
const MAP_TUNNELS=[
 {n:'Adams Tunnel',hue:H.blue,f:'granby',t:'carter',fb:'colorado',tb:'platte'},
 {n:'Roberts Tunnel',hue:H.green,f:'dillon',t:[39.45,-105.72],fb:'colorado',tb:'platte'},
 {n:'Moffat Tunnel',hue:H.cyan,f:[39.90,-105.77],t:'gross',fb:'colorado',tb:'platte'},
 {n:'Boustead Tunnel',hue:H.red,f:[39.32,-106.58],t:'turquoise',fb:'colorado',tb:'arkansas'},
 {n:'Homestake Tunnel',hue:H.lime,f:'homestake',t:'turquoise',fb:'colorado',tb:'arkansas'},
 {n:'Twin Lakes Tunnel',hue:H.red,f:[39.11,-106.56],t:'twinlakes',fb:'colorado',tb:'arkansas'}
];
const CITIES=[
 {n:'Denver',lat:39.74,lon:-105.00},{n:'Grand Junction',lat:39.07,lon:-108.55},
 {n:'Pueblo',lat:38.25,lon:-104.61},{n:'Fort Collins',lat:40.58,lon:-105.08},
 {n:'Durango',lat:37.27,lon:-107.88},{n:'Alamosa',lat:37.47,lon:-105.87},
 {n:'Steamboat Springs',lat:40.48,lon:-106.83},{n:'Lamar',lat:38.09,lon:-102.62},
 {n:'Glenwood Springs',lat:39.55,lon:-107.32},{n:'Colorado Springs',lat:38.83,lon:-104.82}
];
const INTERSTATES=[
 {n:'I-70',shields:[[-107.95,39.50],[-105.60,39.72],[-103.30,39.29]],
  p:[[39.13,-109.05],[39.09,-108.73],[39.09,-108.55],[39.11,-108.30],[39.24,-108.10],[39.37,-107.98],[39.45,-107.90],[39.53,-107.78],[39.55,-107.32],[39.64,-107.06],[39.65,-106.83],[39.64,-106.52],[39.64,-106.37],[39.60,-106.14],[39.63,-106.07],[39.68,-105.92],[39.74,-105.51],[39.74,-105.22],[39.75,-105.00],[39.74,-104.80],[39.60,-104.60],[39.40,-104.10],[39.26,-103.69],[39.31,-103.10],[39.30,-102.27],[39.28,-102.05]]},
 {n:'I-25',shields:[[-104.55,37.45],[-104.87,39.20],[-104.99,40.48]],
  p:[[36.99,-104.48],[37.17,-104.50],[37.40,-104.60],[37.63,-104.78],[37.90,-104.72],[38.10,-104.62],[38.25,-104.61],[38.55,-104.70],[38.83,-104.82],[39.10,-104.86],[39.37,-104.86],[39.55,-104.90],[39.74,-105.00],[39.91,-104.98],[40.16,-104.98],[40.40,-104.99],[40.55,-105.03],[40.72,-105.00],[41.00,-104.93]]},
 {n:'I-76',shields:[[-103.55,40.45]],
  p:[[39.79,-104.98],[39.92,-104.86],[40.10,-104.60],[40.25,-103.80],[40.45,-103.50],[40.63,-103.21],[40.83,-102.75],[40.99,-102.26],[41.00,-102.05]]}
];
const BASINS=[
 {id:'all',n:'All basins'},{id:'colorado',n:'Colorado headwaters'},{id:'gunnison',n:'Gunnison'},
 {id:'yampa',n:'Yampa & White'},{id:'sw',n:'San Juan & Dolores'},{id:'rio',n:'Rio Grande'},
 {id:'arkansas',n:'Arkansas'},{id:'platte',n:'South Platte'}
];

/* =====================================================================
   FLOW GRAPH — both slopes, spine at x = 720
   ===================================================================== */
const SPINE=720, FW=1440, FH=1210, MAPW=1200, MAPH=860;
const G={
nodes:[
 {id:'h_ya',l:'Yampa headwaters',x:700,y:92,k:'src',hue:H.green,q:40,sys:'yampa',side:'w'},
 {id:'stagecoach',l:'Stagecoach Res.',x:614,y:92,k:'res',res:'stagecoach',sys:'yampa',side:'w'},
 {id:'ya_stmbt',l:'Yampa at Steamboat',x:492,y:106,k:'gage',gage:'09239500',sys:'yampa',side:'w'},
 {id:'h_el',l:'Elk River',x:700,y:152,k:'src',hue:H.lime,q:45,sys:'yampa',side:'w'},
 {id:'steamboatl',l:'Steamboat Lake',x:614,y:152,k:'res',res:'steamboatl',sys:'yampa',side:'w'},
 {id:'yj1',l:'',x:398,y:124,k:'cf',sys:'yampa',side:'w'},
 {id:'h_eh',l:'Elkhead Creek',x:700,y:210,k:'src',hue:H.orange,q:12,sys:'yampa',side:'w'},
 {id:'elkhead',l:'Elkhead Res.',x:614,y:210,k:'res',res:'elkhead',sys:'yampa',side:'w'},
 {id:'ya_may',l:'Yampa near Maybell',x:286,y:142,k:'gage',gage:'09251000',sys:'yampa',side:'w'},
 {id:'h_ls',l:'Little Snake River',x:700,y:266,k:'src',hue:H.red,q:25,sys:'yampa',side:'w'},
 {id:'ls1',l:'',x:358,y:266,k:'pt',sys:'yampa',side:'w'},
 {id:'yj2',l:'',x:194,y:160,k:'cf',sys:'yampa',side:'w'},
 {id:'h_wh',l:'White River headwaters',x:700,y:320,k:'src',hue:H.cyan,q:60,sys:'yampa',side:'w'},
 {id:'wh_meek',l:'White at Meeker',x:452,y:322,k:'gage',gage:'09304500',sys:'yampa',side:'w'},
 {id:'wh_rang',l:'Rangely',x:288,y:324,k:'pt',sys:'yampa',side:'w'},
 {id:'x_green',l:'Green River → UTAH',x:96,y:202,k:'exit',sys:'yampa',side:'w'},

 {id:'h_co',l:'Colorado headwaters',x:700,y:380,k:'src',hue:H.blue,q:90,sys:'colorado',side:'w'},
 {id:'granby',l:'Lake Granby',x:614,y:380,k:'res',res:'granby',sys:'colorado',side:'w'},
 {id:'cj1',l:'',x:548,y:392,k:'cf',sys:'colorado',side:'w'},
 {id:'h_fr',l:'Fraser River',x:700,y:432,k:'src',hue:H.cyan,q:45,sys:'colorado',side:'w'},
 {id:'fr1',l:'Fraser at Granby',x:614,y:432,k:'pt',sys:'colorado',side:'w'},
 {id:'cj2',l:'',x:494,y:406,k:'cf',sys:'colorado',side:'w'},
 {id:'h_wf',l:'Williams Fork',x:700,y:482,k:'src',hue:H.blue,q:60,sys:'colorado',side:'w'},
 {id:'wmsfork',l:'Williams Fork Res.',x:614,y:482,k:'res',res:'wmsfork',sys:'colorado',side:'w'},
 {id:'co_krem',l:'Colorado nr Kremmling',x:434,y:422,k:'gage',gage:'09058000',sys:'colorado',side:'w'},
 {id:'h_bl',l:'Blue River',x:700,y:536,k:'src',hue:H.green,q:60,sys:'colorado',side:'w'},
 {id:'dillon',l:'Dillon Reservoir',x:614,y:536,k:'res',res:'dillon',sys:'colorado',side:'w'},
 {id:'greenmtn',l:'Green Mountain',x:526,y:536,k:'res',res:'greenmtn',sys:'colorado',side:'w'},
 {id:'cj3',l:'at Dotsero',x:374,y:436,k:'cf',sys:'colorado',side:'w'},
 {id:'h_eg',l:'Eagle River',x:700,y:590,k:'src',hue:H.lime,q:55,sys:'colorado',side:'w'},
 {id:'homestake',l:'Homestake Res.',x:614,y:590,k:'res',res:'homestake',sys:'colorado',side:'w'},
 {id:'eg_gyp',l:'Eagle below Gypsum',x:454,y:590,k:'gage',gage:'09070500',sys:'colorado',side:'w'},
 {id:'co_glen',l:'Colorado at Glenwood',x:308,y:450,k:'gage',gage:'09085100',sys:'colorado',side:'w'},
 {id:'h_rf',l:'Roaring Fork',x:700,y:644,k:'src',hue:H.red,q:120,sys:'colorado',side:'w'},
 {id:'ruedi',l:'Ruedi Reservoir',x:614,y:644,k:'res',res:'ruedi',sys:'colorado',side:'w'},
 {id:'rf_glen',l:'Roaring Fork at Glenwood',x:444,y:644,k:'gage',gage:'09085000',sys:'colorado',side:'w'},
 {id:'co_cameo',l:'Colorado near Cameo',x:244,y:466,k:'gage',gage:'09095500',sys:'colorado',side:'w'},
 {id:'h_pl',l:'Plateau Creek',x:700,y:696,k:'src',hue:H.lime,q:20,sys:'colorado',side:'w'},
 {id:'vega',l:'Vega Reservoir',x:614,y:696,k:'res',res:'vega',sys:'colorado',side:'w'},
 {id:'cj4',l:'Grand Junction',x:170,y:482,k:'cf',sys:'colorado',side:'w'},
 {id:'x_utah',l:'Colorado River → UTAH',x:96,y:500,k:'exit',gage:'09163500',sys:'colorado',side:'w'},

 {id:'h_gu',l:'Gunnison headwaters',x:700,y:764,k:'src',hue:H.magenta,q:70,sys:'gunnison',side:'w'},
 {id:'taylor',l:'Taylor Park Res.',x:616,y:764,k:'res',res:'taylor',sys:'gunnison',side:'w'},
 {id:'gu_gun',l:'Gunnison nr Gunnison',x:508,y:764,k:'gage',gage:'09114500',sys:'gunnison',side:'w'},
 {id:'bluemesa',l:'Blue Mesa',x:408,y:766,k:'res',res:'bluemesa',sys:'gunnison',side:'w'},
 {id:'morrow',l:'Morrow Point',x:330,y:764,k:'res',res:'morrow',sys:'gunnison',side:'w'},
 {id:'crystalg',l:'Crystal',x:274,y:762,k:'res',res:'crystalg',sys:'gunnison',side:'w'},
 {id:'gj1',l:'',x:220,y:754,k:'cf',sys:'gunnison',side:'w'},
 {id:'gu_gj',l:'Gunnison nr Grand Jct',x:176,y:662,k:'gage',gage:'09152500',sys:'gunnison',side:'w'},
 {id:'h_un',l:'Uncompahgre River',x:700,y:822,k:'src',hue:H.magenta,q:30,sys:'gunnison',side:'w'},
 {id:'ridgway',l:'Ridgway Reservoir',x:616,y:822,k:'res',res:'ridgway',sys:'gunnison',side:'w'},

 {id:'h_do',l:'Dolores headwaters',x:700,y:886,k:'src',hue:H.orange,q:25,sys:'sw',side:'w'},
 {id:'mcphee',l:'McPhee Reservoir',x:614,y:886,k:'res',res:'mcphee',sys:'sw',side:'w'},
 {id:'h_sm',l:'San Miguel River',x:700,y:936,k:'src',hue:H.red,q:30,sys:'sw',side:'w'},
 {id:'sm1',l:'',x:446,y:936,k:'pt',sys:'sw',side:'w'},
 {id:'do1',l:'',x:320,y:896,k:'cf',sys:'sw',side:'w'},
 {id:'x_dolores',l:'Dolores → Colorado R., UTAH',x:96,y:882,k:'exit',sys:'sw',side:'w'},

 {id:'h_an',l:'Animas headwaters',x:700,y:998,k:'src',hue:H.green,q:70,sys:'sw',side:'w'},
 {id:'nighthorse',l:'Lake Nighthorse',x:560,y:960,k:'res',res:'nighthorse',sys:'sw',side:'w'},
 {id:'an_dur',l:'Animas at Durango',x:458,y:1000,k:'gage',gage:'09361500',sys:'sw',side:'w'},
 {id:'h_fl',l:'Florida River',x:700,y:1048,k:'src',hue:H.lime,q:15,sys:'sw',side:'w'},
 {id:'lemon',l:'Lemon Reservoir',x:616,y:1048,k:'res',res:'lemon',sys:'sw',side:'w'},
 {id:'h_lp',l:'Los Pinos River',x:700,y:1100,k:'src',hue:H.magenta,q:25,sys:'sw',side:'w'},
 {id:'vallecito',l:'Vallecito Res.',x:616,y:1100,k:'res',res:'vallecito',sys:'sw',side:'w'},
 {id:'h_sj',l:'San Juan headwaters',x:700,y:1152,k:'src',hue:H.blue,q:60,sys:'sw',side:'w'},
 {id:'sj_pag',l:'Pagosa Springs',x:516,y:1152,k:'pt',sys:'sw',side:'w'},
 {id:'navajo',l:'Navajo Reservoir',x:348,y:1114,k:'res',res:'navajo',sys:'sw',side:'w'},
 {id:'sj_arch',l:'San Juan nr Archuleta',x:244,y:1070,k:'gage',gage:'09355500',sys:'sw',side:'w'},
 {id:'sjj',l:'Farmington, N.M.',x:156,y:1018,k:'cf',sys:'sw',side:'w'},
 {id:'x_powell',l:'San Juan → LAKE POWELL',x:96,y:980,k:'exit',sys:'sw',side:'w'},

 {id:'h_sp',l:'South Platte headwaters',x:740,y:152,k:'src',hue:H.orange,q:40,sys:'platte',side:'e'},
 {id:'antero',l:'Antero Reservoir',x:816,y:152,k:'res',res:'antero',sys:'platte',side:'e'},
 {id:'elevenmile',l:'Eleven Mile',x:892,y:152,k:'res',res:'elevenmile',sys:'platte',side:'e'},
 {id:'cheesman',l:'Cheesman',x:966,y:160,k:'res',res:'cheesman',sys:'platte',side:'e'},
 {id:'nf_sp',l:'North Fork South Platte',x:884,y:238,k:'pt',sys:'platte',side:'e'},
 {id:'strontia',l:'Strontia Springs',x:1036,y:180,k:'res',res:'strontia',sys:'platte',side:'e'},
 {id:'chatfield',l:'Chatfield',x:1100,y:196,k:'res',res:'chatfield',sys:'platte',side:'e'},
 {id:'sp_den',l:'S. Platte at Denver',x:1160,y:212,k:'gage',gage:'06714000',sys:'platte',side:'e'},
 {id:'h_cc',l:'Clear Creek',x:740,y:304,k:'src',hue:H.lime,q:90,sys:'platte',side:'e'},
 {id:'cc_gold',l:'Clear Creek at Golden',x:954,y:304,k:'pt',sys:'platte',side:'e'},
 {id:'spj1',l:'',x:1204,y:234,k:'cf',sys:'platte',side:'e'},
 {id:'h_bo',l:'S. Boulder & St. Vrain',x:740,y:368,k:'src',hue:H.magenta,q:25,sys:'platte',side:'e'},
 {id:'gross',l:'Gross Reservoir',x:816,y:368,k:'res',res:'gross',sys:'platte',side:'e'},
 {id:'bo1',l:'St. Vrain at Longmont',x:994,y:368,k:'pt',sys:'platte',side:'e'},
 {id:'spj2',l:'',x:1244,y:256,k:'cf',sys:'platte',side:'e'},
 {id:'h_bt',l:'Big Thompson',x:740,y:432,k:'src',hue:H.red,q:35,sys:'platte',side:'e'},
 {id:'carter',l:'Carter Lake',x:816,y:432,k:'res',res:'carter',sys:'platte',side:'e'},
 {id:'boyd',l:'Boyd Lake',x:892,y:432,k:'res',res:'boyd',sys:'platte',side:'e'},
 {id:'bt1',l:'Big Thompson at Loveland',x:1036,y:432,k:'pt',sys:'platte',side:'e'},
 {id:'spj3',l:'',x:1280,y:278,k:'cf',sys:'platte',side:'e'},
 {id:'h_cp',l:'Cache la Poudre',x:740,y:496,k:'src',hue:H.orange,q:60,sys:'platte',side:'e'},
 {id:'horsetooth',l:'Horsetooth Res.',x:816,y:496,k:'res',res:'horsetooth',sys:'platte',side:'e'},
 {id:'cp_ftc',l:'Poudre at Fort Collins',x:1036,y:496,k:'gage',gage:'06752000',sys:'platte',side:'e'},
 {id:'sp_kersey',l:'S. Platte at Kersey',x:1310,y:302,k:'gage',gage:'06754000',sys:'platte',side:'e'},
 {id:'sp_plains',l:'plains diversions',x:1288,y:394,k:'pt',sys:'platte',side:'e'},
 {id:'nsterling',l:'North Sterling',x:1216,y:454,k:'res',res:'nsterling',sys:'platte',side:'e'},
 {id:'jackson',l:'Jackson Lake',x:1354,y:454,k:'res',res:'jackson',sys:'platte',side:'e'},
 {id:'x_nebraska',l:'South Platte → NEBRASKA',x:1354,y:328,k:'exit',sys:'platte',side:'e'},

 {id:'h_ar',l:'Arkansas headwaters',x:740,y:568,k:'src',hue:H.orange,q:70,sys:'arkansas',side:'e'},
 {id:'turquoise',l:'Turquoise Lake',x:816,y:568,k:'res',res:'turquoise',sys:'arkansas',side:'e'},
 {id:'twinlakes',l:'Twin Lakes',x:894,y:598,k:'res',res:'twinlakes',sys:'arkansas',side:'e'},
 {id:'ar_park',l:'Arkansas at Parkdale',x:1016,y:632,k:'gage',gage:'07094500',sys:'arkansas',side:'e'},
 {id:'pueblo',l:'Pueblo Reservoir',x:1112,y:662,k:'res',res:'pueblo',sys:'arkansas',side:'e'},
 {id:'ar_pue',l:'below Pueblo',x:1174,y:680,k:'pt',sys:'arkansas',side:'e'},
 {id:'h_fo',l:'Fountain Creek',x:740,y:738,k:'src',hue:H.cyan,q:90,sys:'arkansas',side:'e'},
 {id:'fo1',l:'Colorado Springs',x:984,y:738,k:'pt',sys:'arkansas',side:'e'},
 {id:'arj1',l:'',x:1220,y:698,k:'cf',sys:'arkansas',side:'e'},
 {id:'h_hu',l:'Huerfano & Apishapa',x:740,y:798,k:'src',hue:H.green,q:20,sys:'arkansas',side:'e'},
 {id:'hu1',l:'',x:1036,y:798,k:'pt',sys:'arkansas',side:'e'},
 {id:'arj2',l:'',x:1258,y:714,k:'cf',sys:'arkansas',side:'e'},
 {id:'h_pu',l:'Purgatoire River',x:740,y:858,k:'src',hue:H.magenta,q:15,sys:'arkansas',side:'e'},
 {id:'trinidad',l:'Trinidad Lake',x:816,y:858,k:'res',res:'trinidad',sys:'arkansas',side:'e'},
 {id:'pu1',l:'at Las Animas',x:1096,y:858,k:'pt',sys:'arkansas',side:'e'},
 {id:'arj3',l:'',x:1290,y:730,k:'cf',sys:'arkansas',side:'e'},
 {id:'johnmartin',l:'John Martin Res.',x:1302,y:792,k:'res',res:'johnmartin',sys:'arkansas',side:'e'},
 {id:'x_kansas',l:'Arkansas → KANSAS',x:1360,y:704,k:'exit',sys:'arkansas',side:'e'},

 {id:'h_rg',l:'Rio Grande headwaters',x:740,y:940,k:'src',hue:H.blue,q:80,sys:'rio',side:'e'},
 {id:'riogrande',l:'Rio Grande Res.',x:816,y:940,k:'res',res:'riogrande',sys:'rio',side:'e'},
 {id:'rg_dn',l:'Rio Grande at Del Norte',x:966,y:954,k:'gage',gage:'08220000',sys:'rio',side:'e'},
 {id:'rg_ala',l:'Alamosa',x:1096,y:974,k:'pt',sys:'rio',side:'e'},
 {id:'h_cj',l:'Conejos River',x:740,y:1028,k:'src',hue:H.green,q:25,sys:'rio',side:'e'},
 {id:'platoro',l:'Platoro Reservoir',x:816,y:1028,k:'res',res:'platoro',sys:'rio',side:'e'},
 {id:'cj_mog',l:'Conejos at Mogote',x:1026,y:1028,k:'pt',sys:'rio',side:'e'},
 {id:'rgj1',l:'',x:1166,y:994,k:'cf',sys:'rio',side:'e'},
 {id:'h_tr',l:'Trinchera & Culebra',x:740,y:1098,k:'src',hue:H.red,q:15,sys:'rio',side:'e'},
 {id:'sanchez',l:'Sanchez Reservoir',x:816,y:1098,k:'res',res:'sanchez',sys:'rio',side:'e'},
 {id:'tr1',l:'',x:1086,y:1098,k:'pt',sys:'rio',side:'e'},
 {id:'rgj2',l:'',x:1244,y:1010,k:'cf',sys:'rio',side:'e'},
 {id:'cb',l:'Closed Basin Project',x:986,y:1158,k:'src',hue:H.lime,q:40,sys:'rio',side:'e'},
 {id:'rgj3',l:'',x:1300,y:1026,k:'cf',sys:'rio',side:'e'},
 {id:'x_newmexico',l:'Rio Grande → NEW MEXICO',x:1358,y:1042,k:'exit',sys:'rio',side:'e'}
],
edges:[
 {f:'h_ya',t:'stagecoach',q:40},{f:'stagecoach',t:'ya_stmbt',q:90},{f:'ya_stmbt',t:'yj1',q:90},
 {f:'h_el',t:'steamboatl',q:45},{f:'steamboatl',t:'yj1',q:45},
 {f:'h_eh',t:'elkhead',q:12},{f:'elkhead',t:'yj1',q:12},
 {f:'yj1',t:'ya_may',q:180},
 {f:'h_ls',t:'ls1',q:25},{f:'ls1',t:'yj2',q:25},{f:'ya_may',t:'yj2',q:180},
 {f:'yj2',t:'x_green',q:205},
 {f:'h_wh',t:'wh_meek',q:60},{f:'wh_meek',t:'wh_rang',q:200},{f:'wh_rang',t:'x_green',q:190},
 {f:'h_co',t:'granby',q:90},{f:'granby',t:'cj1',q:90},
 {f:'h_fr',t:'fr1',q:45},{f:'fr1',t:'cj1',q:45},{f:'cj1',t:'cj2',q:135},
 {f:'h_wf',t:'wmsfork',q:60},{f:'wmsfork',t:'cj2',q:60},{f:'cj2',t:'co_krem',q:195},
 {f:'h_bl',t:'dillon',q:60},{f:'dillon',t:'greenmtn',q:95},{f:'greenmtn',t:'co_krem',q:250},
 {f:'co_krem',t:'cj3',q:700},
 {f:'h_eg',t:'homestake',q:55},{f:'homestake',t:'eg_gyp',q:250},{f:'eg_gyp',t:'cj3',q:250},
 {f:'cj3',t:'co_glen',q:1100},
 {f:'h_rf',t:'ruedi',q:120},{f:'ruedi',t:'rf_glen',q:630},{f:'rf_glen',t:'co_glen',q:630},
 {f:'co_glen',t:'co_cameo',q:1520},
 {f:'h_pl',t:'vega',q:20},{f:'vega',t:'cj4',q:40},
 {f:'co_cameo',t:'cj4',q:1520},{f:'gu_gj',t:'cj4',q:600},
 {f:'cj4',t:'x_utah',q:1710},
 {f:'h_gu',t:'taylor',q:70},{f:'taylor',t:'gu_gun',q:290},{f:'gu_gun',t:'bluemesa',q:290},
 {f:'bluemesa',t:'morrow',q:400},{f:'morrow',t:'crystalg',q:400},{f:'crystalg',t:'gj1',q:400},
 {f:'h_un',t:'ridgway',q:30},{f:'ridgway',t:'gj1',q:120},{f:'gj1',t:'gu_gj',q:600},
 {f:'h_do',t:'mcphee',q:25},{f:'mcphee',t:'do1',q:25},
 {f:'h_sm',t:'sm1',q:30},{f:'sm1',t:'do1',q:90},{f:'do1',t:'x_dolores',q:115},
 {f:'h_an',t:'an_dur',q:320},{f:'an_dur',t:'nighthorse',q:40,dash:true},
 {f:'h_fl',t:'lemon',q:15},{f:'lemon',t:'an_dur',q:35},
 {f:'an_dur',t:'sjj',q:320},
 {f:'h_lp',t:'vallecito',q:25},{f:'vallecito',t:'navajo',q:60},
 {f:'h_sj',t:'sj_pag',q:60},{f:'sj_pag',t:'navajo',q:180},
 {f:'navajo',t:'sj_arch',q:750},{f:'sj_arch',t:'sjj',q:750},{f:'sjj',t:'x_powell',q:1100},
 {f:'granby',t:'carter',q:340,dash:true,tun:'Adams Tunnel'},
 {f:'granby',t:'horsetooth',q:210,dash:true,tun:'Adams Tunnel'},
 {f:'dillon',t:'nf_sp',q:300,dash:true,tun:'Roberts Tunnel'},
 {f:'fr1',t:'gross',q:60,dash:true,tun:'Moffat Tunnel'},
 {f:'ruedi',t:'turquoise',q:130,dash:true,tun:'Boustead Tunnel'},
 {f:'homestake',t:'turquoise',q:60,dash:true,tun:'Homestake Tunnel'},
 {f:'h_rf',t:'twinlakes',q:80,dash:true,tun:'Twin Lakes Tunnel'},
 {f:'h_sp',t:'antero',q:40},{f:'antero',t:'elevenmile',q:40},{f:'elevenmile',t:'cheesman',q:113},
 {f:'cheesman',t:'strontia',q:203},{f:'nf_sp',t:'strontia',q:300},
 {f:'strontia',t:'chatfield',q:113},{f:'chatfield',t:'sp_den',q:150},{f:'sp_den',t:'spj1',q:260},
 {f:'h_cc',t:'cc_gold',q:90},{f:'cc_gold',t:'spj1',q:90},{f:'spj1',t:'spj2',q:350},
 {f:'h_bo',t:'gross',q:25},{f:'gross',t:'bo1',q:60},{f:'bo1',t:'spj2',q:70},{f:'spj2',t:'spj3',q:420},
 {f:'h_bt',t:'carter',q:35},{f:'carter',t:'boyd',q:180},{f:'boyd',t:'bt1',q:150},{f:'bt1',t:'spj3',q:150},
 {f:'spj3',t:'sp_kersey',q:570},
 {f:'h_cp',t:'horsetooth',q:60},{f:'horsetooth',t:'cp_ftc',q:130},{f:'cp_ftc',t:'sp_kersey',q:130},
 {f:'sp_kersey',t:'sp_plains',q:340},{f:'sp_plains',t:'nsterling',q:120},{f:'sp_plains',t:'jackson',q:90},
 {f:'sp_kersey',t:'x_nebraska',q:250},
 {f:'h_ar',t:'turquoise',q:70},{f:'turquoise',t:'twinlakes',q:200},
 {f:'twinlakes',t:'ar_park',q:480},{f:'ar_park',t:'pueblo',q:430},{f:'pueblo',t:'ar_pue',q:600},
 {f:'ar_pue',t:'arj1',q:600},
 {f:'h_fo',t:'fo1',q:90},{f:'fo1',t:'arj1',q:90},{f:'arj1',t:'arj2',q:690},
 {f:'h_hu',t:'hu1',q:20},{f:'hu1',t:'arj2',q:20},{f:'arj2',t:'arj3',q:710},
 {f:'h_pu',t:'trinidad',q:15},{f:'trinidad',t:'pu1',q:25},{f:'pu1',t:'arj3',q:25},
 {f:'arj3',t:'johnmartin',q:735},{f:'johnmartin',t:'x_kansas',q:300},
 {f:'h_rg',t:'riogrande',q:80},{f:'riogrande',t:'rg_dn',q:320},{f:'rg_dn',t:'rg_ala',q:280},
 {f:'rg_ala',t:'rgj1',q:280},
 {f:'h_cj',t:'platoro',q:25},{f:'platoro',t:'cj_mog',q:60},{f:'cj_mog',t:'rgj1',q:60},
 {f:'rgj1',t:'rgj2',q:340},
 {f:'h_tr',t:'sanchez',q:15},{f:'sanchez',t:'tr1',q:20},{f:'tr1',t:'rgj2',q:20},
 {f:'rgj2',t:'rgj3',q:360},{f:'cb',t:'rgj3',q:40,dash:true},
 {f:'rgj3',t:'x_newmexico',q:400}
]};
/*__DATA_END__*/

/* =====================================================================
   YOUR TAP — ZIP prefixes to water systems, matched longest-prefix-first.
   A deliberately simplified educational map of who drinks what: providers
   blend sources and trade shares, so treat res/tun as the headline story,
   not a utility diagram. loc = approximate service-area center.
   ===================================================================== */
const TAPS=[
 {id:'denver',hb:'platte',city:'Denver & inner suburbs',prov:'Denver Water',loc:[39.74,-104.99],
  res:['dillon','wmsfork','gross','ralston','cheesman','elevenmile','antero','strontia','marston'],
  tun:['Roberts Tunnel','Moffat Tunnel'],fcres:['cherrycreek','bearcreek'],zips:['802','8011','8012'],
  desc:'About half of Denver Water’s supply starts west of the Divide: Blue River water banked in Dillon rides the 23-mile Roberts Tunnel, and Fraser & Williams Fork water crosses beneath the Moffat. The rest is South Platte water stored in Cheesman, Eleven Mile and Antero, staged through Strontia Springs and Marston on the way to the taps.'},
 {id:'aurora',hb:'platte',city:'Aurora',prov:'Aurora Water',loc:[39.71,-104.81],
  res:['spinney','homestake','twinlakes'],tun:['Homestake Tunnel'],fcres:['cherrycreek'],zips:['8001','8004'],
  desc:'Aurora reaches farther than almost anyone: Eagle River water from Homestake (shared with Colorado Springs) crosses the Divide to Turquoise and Twin Lakes, then comes north — while Spinney Mountain Reservoir on the South Platte is its big high-country savings account, joined by Arkansas rights and one of the state’s largest reuse systems.'},
 {id:'arvada',hb:'platte',city:'Arvada',prov:'City of Arvada',loc:[39.80,-105.10],
  res:['ralston'],tun:['Moffat Tunnel'],zips:['8000'],
  desc:'Arvada drinks Clear Creek water plus Fraser River water that crosses under the Divide in the Moffat Tunnel, both settled into Ralston Reservoir above town.'},
 {id:'northmetro',hb:'platte',city:'Westminster · Northglenn · Thornton',prov:'north metro utilities',loc:[39.87,-105.04],
  res:['standley'],tun:[],zips:['8003'],
  desc:'The north metro cities lean on Clear Creek water stored in Standley Lake, with Thornton also pulling South Platte water. (Wheat Ridge is a Denver Water customer — the simplification shows.)'},
 {id:'broomfield',hb:'platte',city:'Broomfield · Lafayette · Louisville',prov:'east Boulder County utilities',loc:[39.94,-105.06],
  res:['granby','carter'],tun:['Adams Tunnel'],zips:['8002'],
  desc:'These towns blend local creek supplies with Colorado–Big Thompson water: Lake Granby storage that crosses beneath Rocky Mountain National Park in the Adams Tunnel.'},
 {id:'boulder',hb:'platte',city:'Boulder',prov:'City of Boulder',loc:[40.015,-105.27],
  res:['granby','carter'],tun:['Adams Tunnel'],zips:['8030'],
  desc:'Boulder’s backbone is its own high country — Barker Reservoir on Middle Boulder Creek and the Silver Lake watershed (too small to draw here) — topped up with C-BT water from Lake Granby via the Adams Tunnel.'},
 {id:'golden',hb:'platte',city:'Golden',prov:'City of Golden',loc:[39.755,-105.22],
  res:[],tun:[],zips:['8040','80419'],
  desc:'Golden drinks Clear Creek itself — direct diversions upstream of town, treated at the foot of the canyon. Follow the lime ribbon on the map.'},
 {id:'summit',hb:'colorado',city:'Summit County',prov:'Breckenridge · Frisco · Dillon districts',loc:[39.63,-106.07],
  res:['dillon'],tun:['Roberts Tunnel'],zips:['80424','80435','80443','80497','80498'],
  desc:'Local taps drink young Blue River and tributary water — while the big reservoir in the middle of the county, Dillon, belongs to Denver, and its water leaves through the Roberts Tunnel under the Divide.'},
 {id:'leadville',hb:'arkansas',city:'Leadville',prov:'Parkville Water District',loc:[39.25,-106.29],
  res:['turquoise'],tun:['Boustead Tunnel','Homestake Tunnel'],zips:['80461'],
  desc:'Leadville sits at the very top of the Arkansas. Next door, Turquoise Lake stores West Slope water that arrived through the Boustead and Homestake tunnels on its way to cities far downstream.'},
 {id:'grandcounty',hb:'colorado',city:'Grand County',prov:'Fraser · Granby · Grand Lake systems',loc:[39.94,-105.82],
  res:['granby','shadow','willow'],tun:['Adams Tunnel','Moffat Tunnel'],zips:['80442','80446','80447','80478','80482'],
  desc:'You live at the source. The Fraser and upper Colorado rise here — and much of that water leaves: Granby and Shadow Mountain feed the Adams Tunnel east, and Moffat Tunnel diversions skim the Fraser. What stays runs the rivers you see out the window.'},
 {id:'steamboat',hb:'yampa',city:'Steamboat Springs',prov:'Mount Werner Water & city',loc:[40.48,-106.83],
  res:['stagecoach'],tun:[],zips:['80487','80477'],
  desc:'Steamboat drinks Fish Creek and Yampa-basin water; Stagecoach Reservoir upstream backstops the town and keeps the Yampa flowing through dry stretches.'},
 {id:'craig',hb:'yampa',city:'Craig',prov:'City of Craig',loc:[40.52,-107.55],
  res:['elkhead'],tun:[],zips:['81625'],
  desc:'Craig draws from the Yampa as it passes town, with Elkhead Reservoir upstream as the buffer against late-summer lows.'},
 {id:'longmont',hb:'platte',city:'Longmont',prov:'City of Longmont',loc:[40.17,-105.10],
  res:['granby'],tun:['Adams Tunnel'],zips:['8050'],
  desc:'Longmont drinks the St. Vrain — stored in Ralph Price Reservoir up Button Rock Canyon (too small to draw) — blended with C-BT water from Lake Granby via the Adams Tunnel.'},
 {id:'estes',hb:'platte',city:'Estes Park',prov:'Town of Estes Park',loc:[40.377,-105.52],
  res:['granby'],tun:['Adams Tunnel'],zips:['80517'],
  desc:'Estes sits on the C-BT’s doorstep: Granby water emerges from the Adams Tunnel just above town on its way to the Front Range, and local Glacier Creek supplies fill the taps.'},
 {id:'fortcollins',hb:'platte',city:'Fort Collins',prov:'Fort Collins Utilities',loc:[40.585,-105.08],
  res:['horsetooth','granby'],tun:['Adams Tunnel'],zips:['8052'],
  desc:'Fort Collins splits its supply between the Cache la Poudre — diverted at the canyon mouth — and C-BT water that started in Lake Granby, crossed under the park in the Adams Tunnel, and waits in Horsetooth above town.'},
 {id:'loveland',hb:'platte',city:'Loveland · Berthoud',prov:'Loveland Water & Power',loc:[40.40,-105.07],
  res:['carter','granby'],tun:['Adams Tunnel'],zips:['8053','80513'],
  desc:'Loveland drinks the Big Thompson plus C-BT water staged in Carter Lake — Lake Granby water that crossed beneath the Divide in the Adams Tunnel.'},
 {id:'greeley',hb:'platte',city:'Greeley · Evans',prov:'Greeley Water',loc:[40.42,-104.71],
  res:['boyd','granby'],tun:['Adams Tunnel'],zips:['8063','80620','80621','80645','80651'],
  desc:'Greeley pipes Poudre water from Bellvue and Big Thompson water from near Loveland, backed by C-BT shares; Boyd Lake stores the irrigation side of the ledger.'},
 {id:'neplains',hb:'platte',city:'Northeastern plains',prov:'Sterling · Fort Morgan & districts',loc:[40.63,-103.21],
  res:['nsterling','prewitt','jackson'],tun:[],zips:['807'],
  desc:'Out here the river goes underground: towns pump the South Platte’s alluvial aquifer while North Sterling, Prewitt and Jackson bank the surface water that keeps the wells legal and the fields green.'},
 {id:'springs',hb:'arkansas',city:'Colorado Springs',prov:'Colorado Springs Utilities',loc:[38.83,-104.82],
  res:['homestake','turquoise','twinlakes','pueblo'],tun:['Homestake Tunnel','Boustead Tunnel'],zips:['808','809'],
  desc:'Roughly three-quarters of the Springs’ water is born on the West Slope: Eagle River water through the Homestake Tunnel and Fry-Ark water through the Boustead, staged in Turquoise and Twin Lakes — plus the Southern Delivery pipeline pumping uphill from Pueblo Reservoir, and Pikes Peak’s own watersheds.'},
 {id:'pueblo',hb:'arkansas',city:'Pueblo',prov:'Pueblo Water',loc:[38.27,-104.61],
  res:['pueblo','turquoise','twinlakes'],tun:['Boustead Tunnel'],zips:['8100'],
  desc:'Pueblo drinks the Arkansas — native flows plus Fryingpan water that crossed the Divide in the Boustead Tunnel — all staged through Pueblo Reservoir just west of town.'},
 {id:'searkansas',hb:'arkansas',city:'Lower Arkansas valley',prov:'La Junta · Lamar & districts',loc:[38.09,-102.62],
  res:['johnmartin','pueblo'],tun:[],zips:['810'],
  desc:'The lower valley lives on the Arkansas and its aquifer, with John Martin Reservoir as the interstate bank account Colorado keeps with Kansas.'},
 {id:'trinidad',hb:'arkansas',city:'Trinidad',prov:'City of Trinidad',loc:[37.17,-104.50],
  res:['trinidad'],tun:[],zips:['81082'],
  desc:'Trinidad drinks the Purgatoire, moderated by Trinidad Lake just upstream.'},
 {id:'slv',hb:'rio',city:'San Luis Valley',prov:'Alamosa · Monte Vista & districts',loc:[37.47,-105.87],
  res:['riogrande','platoro','sanchez'],tun:[],zips:['811'],
  desc:'Valley towns mostly pump the aquifers beneath the floor of the San Luis Valley — recharged by the Rio Grande and Conejos, which Rio Grande and Platoro reservoirs meter out under a three-state compact.'},
 {id:'durango',hb:'sw',city:'Durango',prov:'City of Durango',loc:[37.27,-107.88],
  res:['lemon','nighthorse'],tun:[],zips:['81301','81303','81326'],
  desc:'Durango drinks the Florida River (via Lemon Reservoir) and the Animas — with Lake Nighthorse, filled by pumping Animas water uphill, as the new insurance policy.'},
 {id:'cortez',hb:'sw',city:'Cortez · Montezuma County',prov:'Montezuma Water Co.',loc:[37.35,-108.59],
  res:['mcphee'],tun:[],zips:['81321','81323'],
  desc:'Nearly everything here — town taps and bean fields alike — comes out of McPhee Reservoir, the Dolores River’s big catch.'},
 {id:'southwest',hb:'sw',city:'Southwest Colorado',prov:'regional districts',loc:[37.27,-107.20],
  res:['vallecito','lemon','nighthorse','navajo','mcphee'],tun:[],zips:['813'],
  desc:'San Juan country runs on its snow-fed rivers — Pine, Florida, Animas, San Juan, Dolores — with Vallecito, Lemon and McPhee holding the spring surge for the dry months, and Navajo banking the San Juan at the state line.'},
 {id:'gunnisontown',hb:'gunnison',city:'Gunnison valley',prov:'Gunnison · Crested Butte',loc:[38.55,-106.93],
  res:['taylor','bluemesa'],tun:[],zips:['81230','81231','81224','81225'],
  desc:'The upper Gunnison valley drinks its own snowmelt — East River, Taylor (metered by Taylor Park Reservoir) — before the water piles into Blue Mesa, Colorado’s largest reservoir, on its way west.'},
 {id:'arkheadwaters',hb:'arkansas',city:'Upper Arkansas valley',prov:'Salida · Buena Vista · Cañon City',loc:[38.53,-106.00],
  res:['twinlakes','turquoise'],tun:['Boustead Tunnel','Twin Lakes Tunnel'],zips:['812'],
  desc:'These towns drink the young Arkansas — a river that runs higher than nature intended in summer, because Fry-Ark tunnel imports from the Roaring Fork and Eagle ride it downstream to Front Range cities.'},
 {id:'montrose',hb:'gunnison',city:'Uncompahgre valley',prov:'Montrose · Delta & Project',loc:[38.48,-107.88],
  res:['ridgway','bluemesa'],tun:[],zips:['814'],
  desc:'The Uncompahgre valley drinks its namesake river, steadied by Ridgway Reservoir — and its farms famously borrow the Gunnison itself, through a 1909 tunnel out of the Black Canyon.'},
 {id:'grandjunction',hb:'colorado',city:'Grand Junction',prov:'GJ · Ute Water · Clifton',loc:[39.07,-108.55],
  res:['vega'],tun:[],zips:['8150','8152'],
  desc:'Grand Valley taps drink the Grand Mesa: Kannah Creek and Plateau Creek supplies (Vega sits atop the same mesa), high above the Colorado River the orchards and vineyards drink below.'},
 {id:'aspen',hb:'colorado',city:'Aspen · Carbondale',prov:'Roaring Fork utilities',loc:[39.19,-106.82],
  res:['ruedi'],tun:['Twin Lakes Tunnel','Boustead Tunnel'],zips:['81611','81612','81615','81621','81623'],
  desc:'Aspen drinks Castle and Maroon creeks; Ruedi Reservoir backstops the Fryingpan. Meanwhile the top of your own watershed is exported — Twin Lakes and Boustead tunnel diversions carry Roaring Fork headwaters under the Divide to the Arkansas.'},
 {id:'vail',hb:'colorado',city:'Vail · Eagle valley',prov:'Eagle River Water & Sanitation',loc:[39.64,-106.37],
  res:['homestake'],tun:['Homestake Tunnel'],zips:['81620','81657','81632','81631','81645','81649'],
  desc:'The Eagle valley drinks Gore Creek and Eagle River wells — while Homestake Reservoir, high in your basin, sends its share under the Divide to Colorado Springs and Aurora.'},
 {id:'glenwood',hb:'colorado',city:'Colorado mainstem towns',prov:'Glenwood · Rifle · New Castle',loc:[39.55,-107.32],
  res:['ruedi','riflegap'],tun:[],zips:['816'],
  desc:'Towns along the middle Colorado drink their side creeks — Grizzly and No Name at Glenwood, Rifle Creek behind Rifle Gap — beside a river already carrying half the West Slope’s story past their doors.'}
];

/* =====================================================================
   SHARED PURE HELPERS — used by both viz.js and story.js. Kept in
   data.js because it loads first on every page.
   ===================================================================== */
function hex2rgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function rgb2css(c){return 'rgb('+c.map(v=>Math.round(Math.max(0,Math.min(255,v)))).join(',')+')';}
const RAMPS=[[0,'#B4321E'],[55,'#D9552C'],[75,'#D99A3C'],[90,'#C9C08A'],[100,'#4FD6A0'],[112,'#35C2E8']];
function ramp(p){
  if(p<=RAMPS[0][0])return RAMPS[0][1];
  for(let i=1;i<RAMPS.length;i++){
    if(p<=RAMPS[i][0]){
      const[p0,c0]=RAMPS[i-1],[p1,c1]=RAMPS[i],t=(p-p0)/(p1-p0);
      const a=hex2rgb(c0),b=hex2rgb(c1);
      return rgb2css([0,1,2].map(j=>a[j]+(b[j]-a[j])*t));
    }
  }
  return RAMPS[RAMPS.length-1][1];
}
const SPARKCOL={low:'#FF7A45',mid:'#EFD01B',ok:'#2FD94F'};
function sparkSVG(series,color){
  const w=100,h=20,mn=Math.min(...series),mx=Math.max(...series),rng=(mx-mn)||1;
  const X=i=>i/(series.length-1)*w, Y=v=>h-2-((v-mn)/rng)*(h-4);
  const d=series.map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1)).join('');
  const lx=X(series.length-1).toFixed(1),ly=Y(series[series.length-1]).toFixed(1);
  return `<svg class="sparksvg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">`
    +`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`
    +`<circle cx="${lx}" cy="${ly}" r="1.7" fill="${color}"/></svg>`;
}
function zipLookup(zip){
  let best=null,bestLen=0;
  TAPS.forEach(t=>t.zips.forEach(p=>{
    if(zip.startsWith(p)&&p.length>bestLen){best=t;bestLen=p.length;}
  }));
  return best;
}

/* =====================================================================
   STORY — per-basin education blurbs + city quick-picks (js/story.js)
   ===================================================================== */
const BASININFO={
 colorado:'The Colorado River is born here in the high country astride the Divide — and it is the most heavily borrowed water in the West. Front Range cities reach across the mountains to tap it, and seven states plus Mexico divide what is left downstream. In 2026 its headwater reservoirs held around 80% of the median, and slipping.',
 gunnison:'The Gunnison gathers off the West Elk and San Juan high country into Blue Mesa — Colorado’s largest reservoir and a linchpin of the Upper Colorado system. When Blue Mesa drops, it is felt all the way to Lake Powell. Water year 2026 hit the Gunnison hard: about 70% of median, among the steepest declines in the state.',
 yampa:'The Yampa is one of the last great free-flowing rivers in the West, running wild through northwest Colorado. Ranching, Steamboat, and the sage country all lean on its snowmelt. A warm, early melt left it near 78% of median in 2026.',
 sw:'The San Juan Mountains feed the Animas, Dolores, and San Juan — rivers that water the Four Corners and fill Navajo and McPhee before crossing into New Mexico and Lake Powell. It is dry country that lives or dies by the snowpack, and 2026 ran near 69% of median, one of the lowest in the state.',
 rio:'The Rio Grande rises in the San Juans and crosses the San Luis Valley, where three states share every drop by compact and farmers pump a shrinking aquifer between deliveries. The valley opened 2026 with a rare surplus that drained away by summer, to about 86% of median.',
 arkansas:'The Arkansas begins as steep snowmelt near Leadville and runs the length of southern Colorado to Kansas. It carries more water than nature gave it — Fry-Ark tunnel imports from the West Slope ride it downstream to Pueblo and the plains. Storage held near 91% of median in 2026, propped up by those imports.',
 platte:'The South Platte drains the Front Range, where most of Colorado lives — and most of its water is imported. Denver, Boulder, and the northern cities pull nearly half their supply across the Divide through tunnels. Native storage sat near 90% of median in 2026, but the real story is how much rides in from the other side of the mountains.'
};
const STORY_CITIES=[
 {label:'Denver',tap:'denver',zip:'80202'},
 {label:'Colorado Springs',tap:'springs',zip:'80903'},
 {label:'Boulder',tap:'boulder',zip:'80302'},
 {label:'Fort Collins',tap:'fortcollins',zip:'80521'},
 {label:'Grand Junction',tap:'grandjunction',zip:'81501'},
 {label:'Pueblo',tap:'pueblo',zip:'81003'},
 {label:'Durango',tap:'durango',zip:'81301'},
 {label:'Vail',tap:'vail',zip:'81657'}
];
