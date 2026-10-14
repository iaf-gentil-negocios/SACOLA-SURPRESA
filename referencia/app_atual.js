(function(){
const D=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id);
const brl=v=>'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl0=v=>'R$ '+Math.round(v||0).toLocaleString('pt-BR');
const int=v=>Math.round(v||0).toLocaleString('pt-BR');
const pct=(v,d=0)=>((v||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d})+'%';
const n1=v=>(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dec=v=>(v||0).toFixed(2).replace('.',',');
const NICHO={F:'Feminino',M:'Masculino',I:'Infantil',U:'Unissex'};
const fmtD=s=>{const p=String(s).split('-');return p.length===3?p[2]+'/'+p[1]:s;};

// SKU: [sku,desc,cat,sub,nicho,preco,promo,marca,vmdRede,curva,regular,c15desc,bso]
const SK=D.skus.map(a=>({sku:a[0],desc:a[1],cat:a[2]||'SEM CATEGORIA',sub:a[3],n:a[4],preco:a[5],promo:a[6],marca:a[7]||'',vr:a[8]||0,curva:a[9]||0,reg:a[10],c15:a[11]||0,bso:a[12]||0}));
const MARCA_F=new Set(['NATIVA SPA','LILY','ESSENCE','FLORATTA','ELYSEE','LIZ','GLAMOUR','INTENSE','MAKE B.','HER CODE','ACCORDES','CELEBRE','THE BLEND']);
const MARCA_M=new Set(['MALBEC','QUASAR','ZAAD','UOMINI','ARBO','BOTICARIO MEN','CLASH','BOTICA 214 MEN']);
SK.forEach(s=>{if(s.n==='U'){if(MARCA_F.has(s.marca))s.n='F';else if(MARCA_M.has(s.marca))s.n='M';}});
(function(){const rank=k=>{const v=SK.map((s,i)=>[s[k],i]).sort((a,b)=>a[0]-b[0]);const r=[];v.forEach(([x,i],j)=>r[i]=j/(SK.length-1));return r;};
  // força só com dados da cobertura: venda da rede (VMD) 55%, preço 25%, tamanho regular 20%
  const rv=rank('vr'),rp=rank('preco');
  SK.forEach((s,i)=>{s.forca=Math.round(100*(0.55*rv[i]+0.25*rp[i]+0.2*s.reg));});})();

const BANHO=new Set(['SABONETE CORPO','CUIDADOS COM A PELE','ÓLEOS','DESODORANTES','PERFUMARIA']);
const ROSTO=new Set(['CUIDADOS FACIAIS','SOLAR','MAQUIAGEM','CUIDADOS COM A BARBA']);
const TEMAS=[
 {k:'ela',n:'Presente para Ela',hero:s=>s.n==='F',ag:s=>s.n==='F'||s.n==='U'},
 {k:'ele',n:'Presente para Ele',hero:s=>s.n==='M',ag:s=>s.n==='M'||s.n==='U'},
 {k:'inf',n:'Infantil',hero:s=>s.n==='I',ag:s=>s.n==='I'||(s.n==='U'&&BANHO.has(s.cat))},
 {k:'linha',n:'Linha completa',hero:s=>!!s.marca&&s.marca!=='SEM CLASSIFICACAO',ag:(s,h)=>s.marca===h.marca,linha:true},
 {k:'banho',n:'Ritual de banho e corpo',hero:s=>BANHO.has(s.cat)&&s.n!=='I',ag:(s,h)=>BANHO.has(s.cat)&&s.cat!=='PERFUMARIA'&&(s.n==='U'||s.n===h.n)},
 {k:'rosto',n:'Rotina de rosto e make',hero:s=>ROSTO.has(s.cat)&&s.n!=='I',ag:(s,h)=>ROSTO.has(s.cat)&&(s.n==='U'||s.n===h.n)},
 {k:'cabelo',n:'Cuidado com os cabelos',hero:s=>s.cat==='CABELOS',ag:(s,h)=>s.cat==='CABELOS'&&(s.n==='U'||s.n===h.n)}];

const CIC={15:{n:'Ciclo 15',ini:'2026-10-16',fim:'2026-11-01',saz:0.1541},16:{n:'Ciclo 16',ini:'2026-11-02',fim:'2026-11-29',saz:0.4031},17:{n:'Ciclo 17',ini:'2026-11-30',fim:'2026-12-25',saz:0.4428}};
const DEF={metaTot:6000000,ciclo:'15',metaModo:'saz',metaCic:{},divBase:'fat',vSem:4,
  pMin:180,pMax:200,dMin:20,dMax:50,dAlvo:35,trava:true,heroC15:true,heroValPromo:true,heroMin:99.9,heroPct:30,heroEst:10,
  useHub:true,useER:false,fCut1:73,fCut2:47,cobPar:180,maxFraco:1,iMin:3,iMax:6,maxCat:2,maxUse:6,exPromo:true,
  temas:['ela','ele','inf','linha','banho','rosto','cabelo'],lim:{}};
let P=JSON.parse(JSON.stringify(DEF));
try{const s=JSON.parse(localStorage.getItem('mixSacola.v10')||'null');if(s)P=Object.assign(P,s);}catch(e){}
const NUMS=['metaTot','vSem','pMin','pMax','dMin','dMax','heroMin','heroPct','cobPar','maxFraco','iMin','iMax','maxCat'];
const CHK=['trava','heroC15','heroValPromo','exPromo','useHub','useER'];
const TXT=['ciclo','metaModo','divBase'];

const ST=D.stores.map((s,i)=>{const r=D.rows[i],items=new Map();for(let j=0;j<r.length;j+=6)items.set(r[j],{est:r[j+1],vmd:r[j+2]/1000,custo:r[j+3]/100});
  const k=D.months.indexOf('2026-07');let fat=0,bol=0;for(let m=k;m<k+3;m++){fat+=s.f[m];bol+=s.o[m];}
  return {i,n:s.n,p:s.p,v:s.v||0,fat,bol,items};});
const PRACAS=[...new Set(ST.map(s=>s.p))].sort();
const HUBS=(D.hubs||[]).map(h=>{const items=new Map();for(let j=0;j<h.rows.length;j+=6)items.set(h.rows[j],{est:h.rows[j+1],custo:h.rows[j+3]/100});return {n:h.n,p:h.p,t:h.t||'hub',items};});

function buildForm(){
  $('temas').innerHTML=TEMAS.map(t=>`<label><input type="checkbox" id="tm_${t.k}" data-tm="${t.k}"> ${t.n}</label>`).join('');
  fill(); $('metaModo').onchange=()=>{read();run();}; $('ciclo').onchange=()=>{read();run();}; $('divBase').onchange=()=>{read();run();};
}
function fill(){NUMS.forEach(k=>$(k).value=P[k]);CHK.forEach(k=>$(k).checked=!!P[k]);TXT.forEach(k=>$(k).value=P[k]);
  document.querySelectorAll('[data-tm]').forEach(e=>e.checked=P.temas.includes(e.dataset.tm));}
function read(){NUMS.forEach(k=>{const v=parseFloat($(k).value);if(!isNaN(v))P[k]=v;});CHK.forEach(k=>P[k]=$(k).checked);TXT.forEach(k=>{if($(k).value)P[k]=$(k).value;});
  P.temas=[...document.querySelectorAll('[data-tm]')].filter(e=>e.checked).map(e=>e.dataset.tm);
  document.querySelectorAll('[data-lim]').forEach(e=>{const [pr,f]=e.dataset.lim.split('|');const v=parseFloat(e.value);P.lim[pr]=P.lim[pr]||{};if(isNaN(v))delete P.lim[pr][f];else P.lim[pr][f]=v;});
  document.querySelectorAll('[data-mc]').forEach(e=>{const v=parseFloat(e.value);if(isNaN(v))delete P.metaCic[e.dataset.mc];else P.metaCic[e.dataset.mc]=v;});
  if(P.pMax<P.pMin)P.pMax=P.pMin;if(P.dMax<P.dMin)P.dMax=P.dMin;if(P.iMax<P.iMin)P.iMax=P.iMin;
  try{localStorage.setItem('mixSacola.v10',JSON.stringify(P));}catch(e){}}

function rng(seed){let t=seed>>>0;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^t>>>15,1|t);r^=r+Math.imul(r^r>>>7,61|r);return((r^r>>>14)>>>0)/4294967296;};}
const days=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5)+1;

let R=null;
function run(){
  read();
  const C=CIC[P.ciclo]||CIC[15],dias=days(C.ini,C.fim),semanas=dias/7,diasTot=days(CIC[15].ini,CIC[17].fim);
  const metaDe=c=>P.metaModo==='man'&&P.metaCic[c]!=null?P.metaCic[c]:P.metaModo==='lin'?P.metaTot*days(CIC[c].ini,CIC[c].fim)/diasTot:P.metaTot*CIC[c].saz;
  const metaPer=metaDe(P.ciclo); const promoOk=P.ciclo==='15';
  const base=s=>P.divBase==='vend'?s.v:s.fat;
  const totBase=ST.reduce((a,s)=>a+base(s),0)||1;
  const temas=TEMAS.filter(t=>P.temas.includes(t.k));
  const seed=Date.now()%100000;
  const pracas=PRACAS.map((pn,pi)=>{
    const ss=ST.filter(s=>s.p===pn),L=P.lim[pn]||{};
    const lim={pMin:L.pMin??P.pMin,pMax:L.pMax??P.pMax,dMax:(L.dMax??P.dMax)/100,dMin:P.dMin/100};
    if(lim.pMax<lim.pMin)lim.pMax=lim.pMin; if(lim.dMax<lim.dMin)lim.dMax=lim.dMin;
    const metaSug=metaPer*ss.reduce((a,s)=>a+base(s),0)/totBase,meta=L.meta??metaSug;
    const agg=new Map();
    ss.forEach(s=>s.items.forEach((it,k)=>{let a=agg.get(k);if(!a){a={k,est:0,estH:0,vmd:0,cst:0,lojas:0};agg.set(k,a);}a.est+=it.est;a.vmd+=it.vmd;a.cst+=it.custo*it.est;if(it.est>0)a.lojas++;}));
    const hubsP=HUBS.filter(h=>h.p===pn&&((h.t==='hub'&&P.useHub)||(h.t==='er'&&P.useER)));
    hubsP.forEach(hb=>hb.items.forEach((it,k)=>{let a=agg.get(k);if(!a){a={k,est:0,estH:0,vmd:0,cst:0,lojas:0};agg.set(k,a);}a.estH+=it.est;a.cst+=it.custo*it.est;}));
    const pool=[];
    agg.forEach(a=>{const s=SK[a.k];const tot=a.est+a.estH;if(!s||s.preco<=0||tot<3)return;
      const cob=a.vmd>0?tot/a.vmd:Infinity,forte=s.forca>=P.fCut1,media=s.forca>=P.fCut2,parado=cob>=P.cobPar;
      pool.push({...s,k:a.k,est:tot,estL:a.est,estH:a.estH,lojas:a.lojas,custo:tot?a.cst/tot:0,cob,parado,cls:forte?'Forte':media?'Média':'Fraca',tier:forte&&parado?1:media&&parado?2:forte?3:media?4:9});});
    return {pn,pi,stores:ss,hubs:hubsP,pool,lim,meta,metaSug,mixes:[],vend:ss.reduce((a,s)=>a+s.v,0),fat:ss.reduce((a,s)=>a+s.fat,0)};
  });

  pracas.forEach(PR=>{
    const {pMin,pMax,dMin,dMax}=PR.lim,dAlvo=Math.min(dMax,Math.max(dMin,P.dAlvo/100));
    const pMid=(pMin+pMax)/2,cheioLo=pMin/(1-dMin),cheioHi=pMax/(1-dMax),cheioT=pMid/(1-dAlvo);
    const priceIn=v=>{const c=[];for(let x=Math.ceil((pMin+0.1)/5)*5;x<=pMax+0.1+1e-9;x+=5)c.push(x-0.1);if(!c.length)c.push(Math.round(pMax)-0.1);let b=c[0];c.forEach(x=>{if(Math.abs(x-v)<Math.abs(b-v))b=x;});return b;};
    PR.alvoSac=Math.ceil(PR.meta/pMid);
    const rand=rng(seed+PR.pi*7919),uses=new Map(),seen=new Set(),heroUsed=new Map();
    const free=x=>(uses.get(x.k)||0)<P.maxUse;
    const valH=h=>P.heroValPromo&&promoOk&&h.c15?h.preco*(1-h.c15/100):h.preco;
    const stock=new Map();PR.pool.forEach(x=>stock.set(x.k,x.est));
    let mixN=0;
    const sig=PR.pn.split(' ').filter(w=>w.length>2).map(w=>w[0]).join('').toUpperCase()||PR.pn.slice(0,2).toUpperCase();
    const tryMix=(T,att)=>{
      const hAll=PR.pool.filter(x=>T.hero(x)&&x.reg&&x.preco>=P.heroMin&&x.est>=P.heroEst&&(P.heroC15&&promoOk?x.c15>0:x.cls==='Forte'));
      const hs=hAll.filter(h=>free(h)&&(heroUsed.get(h.k)||0)<1+Math.floor(att/8));if(!hs.length)return null;
      const hero=hs[Math.floor(rand()*hs.length)],hv=valH(hero);
      const items=[{...hero,role:'Herói',val:hv}];let sum=hv;const catC={[hero.cat]:1},used=new Set([hero.k]);
      const ok=x=>!used.has(x.k)&&free(x)&&T.ag(x,hero)&&(catC[x.cat]||0)<P.maxCat&&(!(P.exPromo&&promoOk)||!x.c15);
      const cand=PR.pool.filter(x=>x.tier<9&&ok(x)).map(x=>({x,r:x.tier+(x.marca&&x.marca===hero.marca?-1.2:0)+rand()*0.8})).sort((a,b)=>a.r-b.r).map(o=>o.x);
      for(const x of cand){if(items.length>=P.iMax)break;if(sum>=cheioT*0.95&&items.length>=P.iMin)break;if(!ok(x)||sum+x.preco>cheioHi)continue;
        items.push({...x,role:'Agregado',val:x.preco});sum+=x.preco;catC[x.cat]=(catC[x.cat]||0)+1;used.add(x.k);}
      if(sum<cheioLo&&items.length<P.iMax&&P.maxFraco>0){let best=null,bd=Infinity;PR.pool.forEach(x=>{if(x.tier!==9||!ok(x))return;const s2=sum+x.preco;if(s2>cheioHi)return;const d=Math.abs(cheioT-s2);if(d<bd){bd=d;best=x;}});
        if(best){items.push({...best,role:'Mimo',val:best.preco});sum+=best.preco;used.add(best.k);}}
      if(items.length<P.iMin||sum<cheioLo||sum>cheioHi)return null;
      if(hv/sum<P.heroPct/100)return null;
      if(T.linha&&items.filter(x=>x.marca===hero.marca).length<3)return null;
      let preco=priceIn(sum*(1-dAlvo)),d=1-preco/sum;
      if(d<dMin-0.002||d>dMax+0.002){preco=priceIn(sum*(1-(d<dMin?dMin:dMax)));d=1-preco/sum;}
      if(d<dMin-0.002||d>dMax+0.002)return null;
      const custo=items.reduce((a,x)=>a+x.custo,0);if(P.trava&&preco<custo)return null;
      const key=items.map(x=>x.k).sort().join('-');if(seen.has(key))return null;seen.add(key);
      items.forEach(x=>uses.set(x.k,(uses.get(x.k)||0)+1));heroUsed.set(hero.k,(heroUsed.get(hero.k)||0)+1);
      mixN++;return {id:`${sig}-${String(mixN).padStart(2,'0')}`,tema:T.n,tk:T.k,hero,items,cheio:sum,preco,desc:d,custo,plan:0,cap:0,lojasQ:{}};
    };
    const alloc=()=>{const st=new Map(stock);PR.mixes.forEach(m=>m.plan=0);let left=PR.alvoSac,prog=true;
      while(left>0&&prog){prog=false;for(const m of PR.mixes){if(left<=0)break;if(m.items.every(x=>(st.get(x.k)||0)>=1)){m.items.forEach(x=>st.set(x.k,st.get(x.k)-1));m.plan++;left--;prog=true;}}}
      return PR.alvoSac-left;};
    let planned=0;
    for(let round=0;round<15;round++){let novo=0;
      for(const T of temas){for(let a=0;a<20;a++){const m=tryMix(T,a+round*4);if(m){PR.mixes.push(m);novo++;break;}}}
      planned=alloc();if(planned>=PR.alvoSac||!novo||PR.mixes.length>=100)break;}
    planned=alloc();
    PR.mixes=PR.mixes.filter(m=>m.plan>0);
    PR.mixes.forEach(m=>{m.cap=Math.min(...m.items.map(x=>stock.get(x.k)||0));});
    {const used=new Map();PR.mixes.forEach(m=>m.items.forEach(x=>used.set(x.k,(used.get(x.k)||0)+m.plan)));let hu=0,tu=0;PR.pool.forEach(x=>{const u=used.get(x.k)||0;tu+=u;hu+=Math.max(0,u-x.estL);});PR.hubUn=hu;PR.totUn=tu;PR.hubEst=PR.pool.reduce((a,x)=>a+x.estH,0);}
    PR.plan=planned;PR.rec=PR.mixes.reduce((a,m)=>a+m.plan*m.preco,0);PR.custo=PR.mixes.reduce((a,m)=>a+m.plan*m.custo,0);
    const tb=PR.stores.reduce((a,s)=>a+base(s),0)||1;
    // cotas inteiras por unidade (maior resto) e entrega em blocos: cada unidade recebe poucos mixes, em quantidade maior
    const U=PR.stores.map(s=>{const q=PR.plan*base(s)/tb;return {s,q,need:Math.floor(q),fr:q-Math.floor(q),got:0,mix:{},rec:0,custo:0};});
    let rest=PR.plan-U.reduce((a,u)=>a+u.need,0);U.slice().sort((a,b)=>b.fr-a.fr).forEach(u=>{if(rest>0){u.need++;rest--;}});
    const remain=new Map(PR.mixes.map(m=>[m,m.plan]));
    U.slice().sort((a,b)=>b.need-a.need).forEach(u=>{let need=u.need;while(need>0){let best=null;remain.forEach((r,m)=>{if(r>0&&(!best||r>remain.get(best)))best=m;});if(!best)break;
      const cap=Math.max(3,Math.ceil(u.need/5))-(u.mix[best.id]||0);if(cap<=0){const alt=[...remain].filter(([m,r])=>r>0&&(u.mix[m.id]||0)<Math.max(3,Math.ceil(u.need/5))).sort((a,b)=>b[1]-a[1])[0];if(alt)best=alt[0];}
      const take=Math.min(need,remain.get(best),Math.max(1,Math.max(3,Math.ceil(u.need/5))-(u.mix[best.id]||0)));remain.set(best,remain.get(best)-take);need-=take;u.got+=take;u.mix[best.id]=(u.mix[best.id]||0)+take;u.rec+=take*best.preco;u.custo+=take*best.custo;best.lojasQ[u.s.n]=(best.lojasQ[u.s.n]||0)+take;}});
    PR.units=U.map(u=>Object.assign(u,{meta:PR.meta*base(u.s)/tb,cap:u.s.v*P.vSem*semanas}));
    PR.capVend=PR.vend*P.vSem*semanas;
  });
  R={pracas,dias,semanas,metaPer,C,metaDe,promoOk};
  render();
}

let selP=-1,selU='',selT='all',pnP=-1,pnU='',cur='painel';
const S=k=>R.pracas.reduce((a,p)=>a+p[k],0);
const TITLES={painel:['Dados gerais','Vendas, receita e margem estimadas por praça e unidade'],limites:['Limites e metas','Meta da estratégia, metas por ciclo e por praça'],regras:['Regras do mix','Como o herói e as surpresas são escolhidos'],mix:['Mix','Mixes gerados por praça e unidade'],como:['Como funciona','Passo a passo do cálculo e origem dos dados']};
function render(){renderHead();renderPainel();renderMetas();renderLim();renderMix();renderComo();}
function renderHead(){
  const t=TITLES[cur];$('pTitle').textContent=t[0];$('pSub').textContent=t[1];
  $('periodBadge').textContent=`${R.C.n} · ${fmtD(R.C.ini)} a ${fmtD(R.C.fim)} · meta ${brl0(R.metaPer)}`;
}
const kc=(l,v,s)=>`<div class="card"><div class="lab">${l}</div><div class="rev"><b style="font-size:1.6rem">${v}</b>${s?`<div class="row">${s}</div>`:''}</div></div>`;

const openCards=new Set();
function renderMetas(){
  // resumo dos 3 ciclos dentro de Limites
  let h='<div class="cgrid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));margin-top:14px">';
  ['15','16','17'].forEach(c=>{const C=CIC[c],m=R.metaDe(c);
    h+=`<div class="mini ${c===P.ciclo?'cur':''}"><div class="lab">${C.n} · ${fmtD(C.ini)} a ${fmtD(C.fim)}</div><b>${brl0(m)}</b><span>${pct(C.saz,1)} das vendas de 2025</span>
    ${P.metaModo==='man'?`<input type="number" id="mc${c}" data-mc="${c}" step="10000" value="${P.metaCic[c]??''}" placeholder="${Math.round(P.metaTot*C.saz)}" aria-label="Meta do ${C.n}">`:''}</div>`;});
  const tot=['15','16','17'].reduce((a,c)=>a+R.metaDe(c),0);
  h+=`<div class="mini"><div class="lab">Total até 25/12</div><b>${brl0(tot)}</b><span>meta informada ${brl0(P.metaTot)}</span></div></div>`;
  $('cycSum').innerHTML=h;
  $('cycTabs').innerHTML=['15','16','17'].map(c=>`<button class="ctab" role="tab" type="button" data-c="${c}" aria-selected="${c===P.ciclo}">${CIC[c].n}<small>${fmtD(CIC[c].ini)} a ${fmtD(CIC[c].fim)} · ${brl0(R.metaDe(c))}</small></button>`).join('');
  $('cycTabs').querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{$('ciclo').value=b.dataset.c;read();run();toast(CIC[b.dataset.c].n+' carregado.');});
}
const sacMid=p=>(p.lim.pMin+p.lim.pMax)/2;
function pracaStats(p){
  const sem=R.semanas,mes=R.dias/30,pm=sacMid(p),v=p.vend||0;
  return {sem,mes,pm,v,metaSem:p.meta/sem,metaMes:p.meta/mes,vendSem:v?p.meta/v/sem:0,vendMes:v?p.meta/v/mes:0,sac:p.meta/pm,sacVendSem:v?p.meta/pm/v/sem:0};
}
function renderLim(){
  $('limInfo').innerHTML=`<b>${R.C.n}</b> · ${fmtD(R.C.ini)} a ${fmtD(R.C.fim)} · ${R.dias} dias · meta ${brl0(R.metaPer)}`;
  let h='';
  R.pracas.forEach(p=>{const L=P.lim[p.pn]||{},v=f=>L[f]!=null?L[f]:'',st=pracaStats(p),ok=p.plan>=p.alvoSac;
    h+=`<div class="card pc"><div class="pchead"><h3>${esc(p.pn)}</h3><button class="btn ghost sm" type="button" data-exp="${p.pi}">Extrair card</button></div>
    <div class="facts"><span class="chip n">${p.stores.length} lojas</span><span class="chip n">${p.vend} vendedoras</span>${p.hubs.length?'<span class="chip n">com HUB</span>':''}</div>
    <div class="kpi2"><div><span>Meta no ciclo</span><b>${brl0(p.meta)}</b></div><div><span>Por semana</span><b>${brl0(st.metaSem)}</b></div><div><span>Vendedora/sem.</span><b>${brl0(st.vendSem)}</b><em>${n1(st.sacVendSem)} sacolas</em></div></div>
    <div class="fields">
     <div class="field full"><label for="l${p.pi}meta">Meta da praça no ciclo (R$)</label><input type="number" step="1000" id="l${p.pi}meta" data-lim="${esc(p.pn)}|meta" value="${v('meta')}" placeholder="${Math.round(p.metaSug)}"></div>
     <div class="field"><label for="l${p.pi}pMin">Valor mín. do mix</label><input type="number" step="5" id="l${p.pi}pMin" data-lim="${esc(p.pn)}|pMin" value="${v('pMin')}" placeholder="${P.pMin}"></div>
     <div class="field"><label for="l${p.pi}pMax">Valor máx. do mix</label><input type="number" step="5" id="l${p.pi}pMax" data-lim="${esc(p.pn)}|pMax" value="${v('pMax')}" placeholder="${P.pMax}"></div>
     <div class="field full"><label for="l${p.pi}dMax">Desconto máximo (%)</label><input type="number" step="1" id="l${p.pi}dMax" data-lim="${esc(p.pn)}|dMax" value="${v('dMax')}" placeholder="${P.dMax}"></div></div>
    <details class="more" data-open="${p.pi}" ${openCards.has(p.pi)?'open':''}><summary>Ver metas detalhadas</summary>
     <div class="out"><span>Vendedoras na praça</span><b>${st.v}</b><span>Meta por semana</span><b>${brl0(st.metaSem)}</b><span>Meta por mês</span><b>${brl0(st.metaMes)}</b><span>Por vendedora/semana</span><b>${brl0(st.vendSem)} · ${n1(st.sacVendSem)} sac.</b><span>Por vendedora/mês</span><b>${brl0(st.vendMes)}</b><span>Sacolas no ciclo</span><b>${int(st.sac)}</b><span>Valor cheio até</span><b>${brl0(p.lim.pMax/(1-p.lim.dMax))}</b><span>Estoque cobre</span><b>${ok?'sim':'não: '+int(p.plan)+' sacolas'}</b>${p.hubs.length?`<span>Itens vindos do HUB</span><b>${int(p.hubUn)} de ${int(p.totUn)}</b>`:''}</div>
     <div class="tw" style="margin-top:10px"><table><thead><tr><th>Unidade</th><th class="n">Vend.</th><th class="n">Meta</th><th class="n">Vend./sem.</th></tr></thead><tbody>
     ${p.units.slice().sort((a,b)=>b.meta-a.meta).map(u=>`<tr><td>${esc(u.s.n)}</td><td class="n">${u.s.v}</td><td class="n">${brl0(u.meta)}</td><td class="n">${u.s.v?brl0(u.meta/u.s.v/st.sem):'—'}</td></tr>`).join('')}</tbody></table></div>
    </details></div>`;});
  $('limCards').innerHTML=h;
  document.querySelectorAll('details.more').forEach(d=>d.ontoggle=()=>{const i=+d.dataset.open;d.open?openCards.add(i):openCards.delete(i);});
  document.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>exportCards([R.pracas[+b.dataset.exp]]));
}
const forcaTxt=x=>`força ${x.forca} (${x.cls.toLowerCase()})`;
const cobTxt=x=>x.cob===Infinity?'sem venda':int(x.cob)+' dias';
function mixCard(m,PR,qU){
  const sur=m.items.filter(x=>x.role!=='Herói');
  const row=x=>`<div class="it"><span class="tag ${x.role==='Herói'?'h':''}">${x.role==='Herói'?'HERÓI':x.role==='Mimo'?'MIMO':'SURPRESA'}</span>1× ${esc(x.desc)}${x.role!=='Herói'&&x.marca&&x.marca===m.hero.marca?' · <b>mesma linha</b>':''}
   <span class="sm">${x.role==='Herói'&&x.c15&&P.heroValPromo?`${brl(x.val)} na promoção do ciclo (−${x.c15}% de ${brl(x.preco)})`:brl(x.preco)} · ${forcaTxt(x)} · cobertura ${cobTxt(x)}${x.parado?' · parado':''} · ${int(x.estL)} un. nas lojas${x.estH?` + ${int(x.estH)} no HUB/apoio`:''} · SKU ${x.sku}</span></div>`;
  const lojas=Object.entries(m.lojasQ).sort((a,b)=>b[1]-a[1]);
  return `<article class="kit"><h3>${m.id} · ${esc(m.tema)}</h3>
   <div class="chips"><span class="chip">${esc(PR.pn)}</span><span class="chip n">${NICHO[m.hero.n]}</span>${m.hero.c15?`<span class="chip g">Herói em promoção · −${m.hero.c15}%</span>`:''}<span class="chip">${sur.length} surpresa${sur.length>1?'s':''}</span></div>
   <div class="items">${m.items.map(row).join('')}</div>
   <div class="price"><b>${brl(m.preco)}</b><s>${brl(m.cheio)}</s><span class="off">${n1(m.desc*100)}% off</span></div>
   <div class="info">${qU!=null?`<b>${qU}</b> nesta unidade · `:''}<b>${m.plan}</b> sacolas na praça · receita ${brl0(m.plan*m.preco)} · margem ${brl0(m.plan*(m.preco-m.custo))}<br><span style="font-size:.85rem">Unidades: ${lojas.map(([n,q])=>`${esc(n)} (${q})`).join(', ')||'—'}</span></div>
   <div class="quote">"${esc(m.tema)}: ${esc(m.hero.desc)} garantido + ${sur.length} surpresa${sur.length>1?'s':''}. Vale ${brl0(m.cheio)}, sai por ${brl(m.preco)}."</div></article>`;
}
function renderMix(){
  const tms=TEMAS.filter(t=>P.temas.includes(t.k)),prs=selP>=0?[R.pracas[selP]]:R.pracas,units=selP>=0?R.pracas[selP].stores.map(s=>s.n).sort():[];
  let h=`<div class="bar"><div class="grp">
   <label class="lab" for="mP">Praça</label><select id="mP"><option value="-1">Todas</option>${R.pracas.map(p=>`<option value="${p.pi}" ${p.pi===selP?'selected':''}>${esc(p.pn)}</option>`).join('')}</select>
   <label class="lab" for="mU">Unidade</label><select id="mU" ${selP<0?'disabled':''}><option value="">Todas</option>${units.map(u=>`<option ${u===selU?'selected':''}>${esc(u)}</option>`).join('')}</select>
   <label class="lab" for="mT">Tema</label><select id="mT"><option value="all">Todos</option>${tms.map(t=>`<option value="${t.k}" ${selT===t.k?'selected':''}>${t.n}</option>`).join('')}</select></div>
   <button class="btn ghost sm" id="cpMix" type="button">Copiar mixes para Excel</button></div>`;
  let n=0;
  prs.forEach(PR=>{const ms=PR.mixes.filter(m=>(selT==='all'||m.tk===selT)&&(!selU||m.lojasQ[selU]));if(!ms.length)return;
    const rec=selU?ms.reduce((a,m)=>a+(m.lojasQ[selU]||0)*m.preco,0):ms.reduce((a,m)=>a+m.plan*m.preco,0);
    h+=`<h2 class="sec">${esc(PR.pn)}${selU?' · '+esc(selU):''} <span class="chip">${ms.length} mixes</span> <span class="chip g">${brl0(rec)}</span></h2><div class="kits">${ms.map(m=>mixCard(m,PR,selU?m.lojasQ[selU]:null)).join('')}</div>`;n+=ms.length;});
  if(!n)h+=`<div class="empty">Nenhum mix neste filtro. Em "Limites por praça", amplie a faixa de valor ou o desconto máximo, ou em "Regras do mix" desmarque "Usar só produtos em promoção no ciclo".</div>`;
  h+=`<textarea class="copy" id="cpArea" hidden readonly aria-label="Texto para copiar"></textarea>`;
  $('v-mix').innerHTML=h;
  $('mP').onchange=e=>{selP=+e.target.value;selU='';renderMix();};
  $('mU').onchange=e=>{selU=e.target.value;renderMix();};
  $('mT').onchange=e=>{selT=e.target.value;renderMix();};
  $('cpMix').onclick=()=>{const L=[['Praça','Mix','Tema','Preço','Valor cheio','Desconto %','Sacolas praça','Unidade','Sacolas unidade','Papel','Visível','SKU','Produto','Preço item','Promo C15 %','Força'].join('\t')];
    R.pracas.forEach(p=>p.mixes.forEach(m=>Object.entries(m.lojasQ).forEach(([u,q])=>m.items.forEach(x=>L.push([p.pn,m.id,m.tema,dec(m.preco),dec(m.cheio),dec(m.desc*100),m.plan,u,q,x.role==='Agregado'?'Surpresa':x.role,x.role==='Herói'?'Sim':'Não',x.sku,x.desc,dec(x.preco),x.c15||'',x.forca].join('\t'))))));
    copyText(L.join('\n'),$('cpArea'),'Mixes copiados. Cole no Excel.');};
}
const meter=v=>`<div class="bar-meter" title="${pct(v)}"><i style="width:${Math.min(100,v*100)}%"></i></div>`;
function renderPainel(){
  const prs=pnP>=0?[R.pracas[pnP]]:R.pracas,units=pnP>=0?R.pracas[pnP].stores.map(s=>s.n).sort():[];
  let h=`<div class="bar"><div class="grp"><label class="lab" for="pP">Praça</label><select id="pP"><option value="-1">Todas</option>${R.pracas.map(p=>`<option value="${p.pi}" ${p.pi===pnP?'selected':''}>${esc(p.pn)}</option>`).join('')}</select>
  <label class="lab" for="pU">Unidade</label><select id="pU" ${pnP<0?'disabled':''}><option value="">Todas</option>${units.map(u=>`<option ${u===pnU?'selected':''}>${esc(u)}</option>`).join('')}</select></div>
  <button class="btn ghost sm" id="cpPn" type="button">Copiar tabela para Excel</button></div>`;
  let U=[];prs.forEach(p=>p.units.forEach(u=>U.push({p,u})));if(pnU)U=U.filter(o=>o.u.s.n===pnU);
  const t=U.reduce((a,o)=>({meta:a.meta+o.u.meta,sac:a.sac+o.u.got,rec:a.rec+o.u.rec,cus:a.cus+o.u.custo,v:a.v+o.u.s.v,cap:a.cap+o.u.cap}),{meta:0,sac:0,rec:0,cus:0,v:0,cap:0});
  const pm=t.sac?t.rec/t.sac:0;
  h+=`<div class="cgrid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));margin-bottom:8px">${kc('Meta do ciclo',brl0(t.meta))}${kc('Vendas estimadas',int(t.sac),'sacolas')}${kc('Receita planejada',brl0(t.rec),pct(t.rec/(t.meta||1))+' da meta')}${kc('Margem bruta',brl0(t.rec-t.cus),pct((t.rec-t.cus)/(t.rec||1))+' da receita')}${kc('Vendas por vendedora por semana',n1(t.sac/(t.v||1)/R.semanas),`com ${P.vSem}/semana: ${brl0(t.cap*pm)}`)}</div>
  ${!R.promoOk?'<div class="card helpbox" style="margin:10px 0">As promoções deste ciclo ainda não foram carregadas. Os heróis estão sendo escolhidos entre os produtos fortes.</div>':''}`;
  if(pnP<0){h+=`<h2 class="sec">Por praça</h2><div class="tw"><table><thead><tr><th>Praça</th><th class="n">Lojas</th><th class="n">Vendedoras</th><th class="n">Meta</th><th class="n">Sacolas</th><th class="n">Receita</th><th>% da meta</th><th class="n">Margem</th><th class="n">Margem %</th><th class="n">Vendas por vendedora por semana</th><th class="n">Itens do HUB</th></tr></thead><tbody>`;
    R.pracas.forEach(p=>{h+=`<tr class="click" data-p="${p.pi}" tabindex="0"><td><b>${esc(p.pn)}</b></td><td class="n">${p.stores.length}</td><td class="n">${p.vend}</td><td class="n">${brl0(p.meta)}</td><td class="n">${int(p.plan)}</td><td class="n"><b>${brl0(p.rec)}</b></td><td>${meter(p.rec/(p.meta||1))}</td><td class="n">${brl0(p.rec-p.custo)}</td><td class="n">${pct((p.rec-p.custo)/(p.rec||1))}</td><td class="n">${n1(p.plan/(p.vend||1)/R.semanas)}</td><td class="n">${p.hubs.length?pct(p.hubUn/(p.totUn||1)):'sem HUB'}</td></tr>`;});
    h+=`</tbody></table></div>`;}
  h+=`<h2 class="sec">Por unidade</h2><div class="tw"><table><thead><tr><th>Praça</th><th>Unidade</th><th class="n">Vendedoras</th><th class="n">Meta</th><th class="n">Sacolas</th><th class="n">Receita</th><th class="n">Margem</th><th class="n">Vendas por vendedora por semana</th><th>Mixes (qtd)</th></tr></thead><tbody>`;
  U.sort((a,b)=>a.p.pn.localeCompare(b.p.pn)||b.u.rec-a.u.rec).forEach(({p,u})=>{const vs=u.s.v?u.got/u.s.v/R.semanas:null;
    h+=`<tr><td>${esc(p.pn)}</td><td>${esc(u.s.n)}</td><td class="n">${u.s.v||'<span class="chip w">0</span>'}</td><td class="n">${brl0(u.meta)}</td><td class="n">${int(u.got)}</td><td class="n"><b>${brl0(u.rec)}</b></td><td class="n">${brl0(u.rec-u.custo)}</td><td class="n">${vs==null?'—':n1(vs)}${vs!=null&&vs>P.vSem*2?' <span class="chip w">alto</span>':''}</td><td style="font-size:.8rem">${Object.entries(u.mix).map(([i,q])=>`${i}×${q}`).join(' ')||'—'}</td></tr>`;});
  h+=`</tbody></table></div><textarea class="copy" id="cpArea2" hidden readonly aria-label="Texto para copiar"></textarea>`;
  $('v-painel').innerHTML=h;
  $('pP').onchange=e=>{pnP=+e.target.value;pnU='';renderPainel();};
  $('pU').onchange=e=>{pnU=e.target.value;renderPainel();};
  $('v-painel').querySelectorAll('tr[data-p]').forEach(tr=>{const go=()=>{pnP=+tr.dataset.p;pnU='';renderPainel();};tr.onclick=go;tr.onkeydown=e=>{if(e.key==='Enter')go();};});
  $('cpPn').onclick=()=>{const L=[['Ciclo','Praça','Unidade','Vendedoras','Meta','Sacolas','Receita','Custo','Margem'].join('\t')];U.forEach(({p,u})=>L.push([P.ciclo,p.pn,u.s.n,u.s.v,dec(u.meta),u.got,dec(u.rec),dec(u.custo),dec(u.rec-u.custo)].join('\t')));copyText(L.join('\n'),$('cpArea2'),'Tabela copiada. Cole no Excel.');};
}
function renderComo(){
  $('v-como').innerHTML=`<div class="doc"><ol>
  <li><b>Meta por ciclo.</b> A meta de ${brl0(P.metaTot)} vai até 25/12 e é dividida entre os ciclos 15 (16/10 a 01/11), 16 (02/11 a 29/11) e 17 (30/11 a 25/12). Por padrão, cada ciclo recebe o peso que teve nas vendas de 2025: ${pct(CIC[15].saz,1)}, ${pct(CIC[16].saz,1)} e ${pct(CIC[17].saz,1)}.</li>
  <li><b>Meta por praça e loja.</b> A meta do ciclo é dividida ${P.divBase==='vend'?'pelo número de vendedoras':'pelo faturamento de jul–set/26'}. Em "Limites por praça" dá para digitar a meta de cada praça.</li>
  <li><b>Faixa de preço.</b> Cada praça tem valor mínimo e máximo do mix (o que o cliente paga) e desconto máximo. O valor cheio dos produtos fica entre valor ÷ (1 − desconto).</li>
  <li><b>Herói.</b> Produto forte que aparece na comunicação${P.heroC15?', em promoção no ciclo':''}, a partir de ${brl(P.heroMin)}. Entre os produtos que passam, a escolha respeita a faixa de preço e de desconto da praça.${P.heroValPromo?' Na conta do "vale R$" entra com o preço promocional, para a vantagem anunciada ser real.':''}</li>
  <li><b>Surpresas.</b> Produtos ocultos com força, priorizando os parados. No máximo ${P.maxFraco} produto fraco por sacola.</li>
  <li><b>HUB.</b> ${P.useHub?'O estoque do HUB entra no estoque da praça onde ele fica (Natal, Mossoró, Oeste do Ceará e São Luís). As lojas são usadas primeiro; o que faltar vem do HUB.':'O estoque dos HUBs está desligado.'}</li>
  <li><b>Quantidade.</b> A aplicação gera mixes até o estoque somado da praça cobrir as sacolas da meta e divide as sacolas entre as lojas. Cada loja recebe uns 5 mixes diferentes.</li>
  <li><b>Margem.</b> Receita menos custo dos produtos, sem impostos e taxas.</li></ol>
  <h2 class="sec">Dados</h2><ul><li>Estoque, custo, preço e venda: planilha de cobertura de 07/10/2026.</li><li>Promoções: base do ciclo 15. Ciclos 16 e 17 aguardam as bases.</li><li>Faturamento: histórico de vendas até 06/10/2026.</li><li>Vendedoras: 332 consultoras, sem QDB. São José do Campestre não tem vendedora na lista.</li></ul></div>`;
}

// ---------- extração para gerentes (HTML independente com simulador)
const slug=t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
function gerenteData(p){const st=pracaStats(p);
  return {pn:p.pn,lojas:p.stores.length,vend:st.v,meta:p.meta,pm:st.pm,pMin:p.lim.pMin,pMax:p.lim.pMax,
    units:p.units.slice().sort((a,b)=>b.meta-a.meta).map(u=>({n:u.s.n,v:u.s.v,meta:u.meta})),
    mixes:p.mixes.map(m=>({id:m.id,tema:m.tema,hero:m.hero.desc,preco:m.preco,cheio:m.cheio,desc:m.desc,n:m.items.length-1,lojas:m.lojasQ}))};}
function gerenteHTML(list){
  const data={ciclo:R.C.n,ini:fmtD(R.C.ini),fim:fmtD(R.C.fim),dias:R.dias,semanas:R.semanas,gerado:new Date().toLocaleDateString('pt-BR'),pracas:list.map(gerenteData)};
  const title=`Meta Sacola Surpresa · ${R.C.n}${list.length===1?' · '+list[0].pn:''}`;
  const css=`:root{--bg:#eef7f3;--sf:#fff;--row:#f3f6f8;--ink:#0f2747;--tx:#1f2d3d;--mu:#5f6f80;--ln:#dde7e3;--gr:#2fd38a;--grs:#dff7ea;--grt:#137a4b;--in:#e6f4fb;--int:#1f3b56;--wa:#8a5a00;--was:#fff1d6;--bd:#b4342b;--bds:#fde4e1;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0d1714;--sf:#15211d;--row:#1b2925;--ink:#e6f0ff;--tx:#dbe5e1;--mu:#93a6a0;--ln:#263632;--gr:#34d892;--grs:#173c2b;--grt:#6ee7a8;--in:#15303d;--int:#cfe6f3;--wa:#f0bf5e;--was:#3a2e14;--bd:#f39a90;--bds:#3d1f1c;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.w{max-width:1100px;margin:0 auto;padding:20px 16px 48px}h1{margin:0;color:var(--ink);font-size:1.5rem}h2{color:var(--ink);font-size:1.12rem;margin:24px 0 10px}
.sub{color:var(--mu)}.card{background:var(--sf);border:1px solid var(--ln);border-radius:16px;padding:18px;min-width:0}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px}.k span{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mu);font-weight:600}.k b{font-size:1.45rem;color:var(--ink);font-variant-numeric:tabular-nums}.k em{display:block;font-style:normal;color:var(--mu);font-size:.85rem}
label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mu);font-weight:600;margin-bottom:4px}input,select{font:inherit;color:var(--tx);background:var(--sf);border:1px solid var(--ln);border-radius:10px;padding:9px 12px;width:100%}
.tw{overflow-x:auto;background:var(--sf);border:1px solid var(--ln);border-radius:14px}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{padding:9px 12px;border-bottom:1px solid var(--ln);text-align:left;vertical-align:top}th{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mu);background:var(--row)}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td input{width:90px;padding:6px 8px;text-align:right}
.res{background:var(--in);color:var(--int);border-radius:14px;padding:16px;margin-top:14px}.res b{font-variant-numeric:tabular-nums}.big{font-size:1.8rem;font-weight:800;color:var(--ink)}
.ok{background:var(--grs);color:var(--grt)}.wa{background:var(--was);color:var(--wa)}.bd{background:var(--bds);color:var(--bd)}.pill{display:inline-block;font-size:.8rem;font-weight:700;padding:3px 10px;border-radius:999px}
.bar{height:10px;border-radius:999px;background:var(--row);overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;background:var(--gr)}
.mx{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}.mx .card h3{margin:0 0 6px;font-size:1rem;color:var(--ink)}.mu{color:var(--mu);font-size:.85rem}
.top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}`;
  const js=`const D=JSON.parse(document.getElementById('d').textContent);const $=i=>document.getElementById(i);
const brl=v=>'R$ '+Math.round(v||0).toLocaleString('pt-BR');const n1=v=>(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1});const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cur=0;const sel=$('pr');if(D.pracas.length>1){sel.innerHTML=D.pracas.map((p,i)=>'<option value="'+i+'">'+esc(p.pn)+'</option>').join('');sel.onchange=()=>{cur=+sel.value;draw();};}else{sel.parentElement.hidden=true;}
function draw(){const p=D.pracas[cur],S=D.semanas,M=D.dias/30,vs=p.vend?p.meta/p.pm/p.vend/S:0;
 $('ph').textContent=p.pn;
 $('kp').innerHTML=[['Meta no ciclo',brl(p.meta),Math.round(p.meta/p.pm).toLocaleString('pt-BR')+' sacolas'],['Meta por semana',brl(p.meta/S),''],['Meta por mês',brl(p.meta/M),''],['Por vendedora/semana',brl(p.vend?p.meta/p.vend/S:0),n1(vs)+' sacolas'],['Por vendedora/mês',brl(p.vend?p.meta/p.vend/M:0),''],['Vendedoras',p.vend,p.lojas+' lojas']].map(k=>'<div class="card k"><span>'+k[0]+'</span><b>'+k[1]+'</b>'+(k[2]?'<em>'+k[2]+'</em>':'')+'</div>').join('');
 $('sPm').value=Math.round(p.pm*100)/100;$('sVs').value=Math.round(vs*10)/10;$('sV').value=p.vend;
 $('ut').innerHTML=p.units.map((u,i)=>'<tr><td>'+esc(u.n)+'</td><td class="n">'+u.v+'</td><td class="n">'+brl(u.meta)+'</td><td class="n">'+(u.v?n1(u.meta/p.pm/u.v/S):'—')+'</td><td class="n"><input type="number" step="0.5" min="0" id="u'+i+'" aria-label="Vendas por vendedora por semana em '+esc(u.n)+'"></td><td class="n" id="ur'+i+'"></td><td class="n" id="up'+i+'"></td></tr>').join('');
 p.units.forEach((u,i)=>{$('u'+i).value=u.v?Math.round(u.meta/p.pm/u.v/S*10)/10:0;$('u'+i).oninput=sim;});
 $('mx').innerHTML=p.mixes.map(m=>'<div class="card"><h3>'+esc(m.id)+' · '+esc(m.tema)+'</h3><div><b>Herói:</b> '+esc(m.hero)+' + '+m.n+' surpresa'+(m.n>1?'s':'')+'</div><div class="mu">'+brl(m.preco)+' · vale '+brl(m.cheio)+' · '+Math.round(m.desc*100)+'% off</div><div class="mu" style="margin-top:6px">'+Object.entries(m.lojas).map(([l,q])=>esc(l)+': '+q).join(' · ')+'</div></div>').join('')||'<p class="mu">Sem mixes gerados.</p>';
 sim();}
function sim(){const p=D.pracas[cur],S=D.semanas,pm=+$('sPm').value||p.pm,vs=+$('sVs').value||0,v=+$('sV').value||0;
 const sac=v*vs*S,rec=sac*pm,r=rec/(p.meta||1),need=p.meta/pm/(v||1)/S;
 $('sr').className='res '+(r>=1?'ok':r>=.8?'wa':'bd');
 $('sr').innerHTML='<div class="big">'+brl(rec)+'</div><div><b>'+Math.round(sac).toLocaleString('pt-BR')+'</b> sacolas no ciclo · <b>'+Math.round(r*100)+'%</b> da meta · '+(r>=1?'sobra '+brl(rec-p.meta):'faltam '+brl(p.meta-rec))+'</div><div class="bar"><i style="width:'+Math.min(100,r*100)+'%"></i></div><div style="margin-top:8px">Para bater a meta com '+v+' vendedoras a '+brl(pm)+' por sacola: <b>'+n1(need)+'</b> vendas por vendedora por semana.</div>';
 let tr=0;p.units.forEach((u,i)=>{const x=+$('u'+i).value||0,rr=u.v*x*S*pm;tr+=rr;$('ur'+i).textContent=brl(rr);const q=rr/(u.meta||1);$('up'+i).innerHTML='<span class="pill '+(q>=1?'ok':q>=.8?'wa':'bd')+'">'+Math.round(q*100)+'%</span>';});
 $('ut2').innerHTML='Soma das lojas: <b>'+brl(tr)+'</b> · '+Math.round(tr/(p.meta||1)*100)+'% da meta da praça';}
['sPm','sVs','sV'].forEach(i=>$(i).oninput=sim);draw();`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body><div class="w">
<div class="top"><div><h1>Sacola Surpresa · <span id="ph"></span></h1><div class="sub">${esc(R.C.n)} · ${fmtD(R.C.ini)} a ${fmtD(R.C.fim)} · ${R.dias} dias · gerado em ${data.gerado}</div></div><div style="min-width:220px"><label for="pr">Praça</label><select id="pr"></select></div></div>
<h2>Metas da praça</h2><div class="g" id="kp"></div>
<h2>Simulador da praça</h2><div class="card"><p class="sub" style="margin-top:0">Mude os números para ver se a praça consegue vender mais (ou menos) que o estimado.</p>
<div class="g"><div><label for="sVs">Vendas por vendedora por semana</label><input type="number" id="sVs" step="0.5" min="0"></div><div><label for="sV">Vendedoras vendendo</label><input type="number" id="sV" step="1" min="0"></div><div><label for="sPm">Preço médio da sacola (R$)</label><input type="number" id="sPm" step="5" min="0"></div></div>
<div class="res" id="sr"></div></div>
<h2>Metas e simulador por loja</h2><p class="sub">Coloque a estimativa de vendas por vendedora por semana de cada loja.</p><div class="tw"><table><thead><tr><th>Loja</th><th class="n">Vendedoras</th><th class="n">Meta</th><th class="n">Meta em vendas/vend./sem.</th><th class="n">Sua estimativa</th><th class="n">Receita estimada</th><th class="n">% da meta</th></tr></thead><tbody id="ut"></tbody></table></div><p id="ut2" style="margin-top:8px"></p>
<h2>Mixes da praça e quantidade por loja</h2><p class="sub">O herói é o produto que aparece na comunicação; as surpresas ficam ocultas.</p><div class="mx" id="mx"></div>
</div><script type="application/json" id="d">${JSON.stringify(data).replace(/</g,'\\u003c')}<\/script><script>${js}<\/script></body></html>`;
}
async function exportCards(list){
  const html=gerenteHTML(list),name=`sacola-surpresa-ciclo${P.ciclo}-${list.length===1?slug(list[0].pn):'todas-as-pracas'}.html`;
  let dl=null;try{if(window.claude&&window.claude.use)dl=await Promise.race([window.claude.use('downloads'),new Promise(r=>setTimeout(()=>r(null),1500))]);}catch(e){}
  if(!dl){try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=name;document.body.appendChild(a);a.click();a.remove();toast('Arquivo gerado: '+name);}catch(e){toast('Não foi possível salvar o arquivo nesta visualização.');}return;}
  try{await dl.save({filename:name,data:html});toast('Arquivo pronto: '+name);}catch(e){if(e&&e.code==='declined')return;toast(e&&e.code==='rate_limited'?'Já existe um download aberto. Conclua ou cancele e tente de novo.':'Não foi possível gerar o arquivo agora.');}
}
function copyText(t,area,msg){const fb=()=>{area.hidden=false;area.value=t;area.focus();area.select();toast('Texto selecionado abaixo. Use Ctrl+C para copiar.');};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(()=>toast(msg)).catch(fb);else fb();}
let tt;function toast(m){const el=$('toast');el.textContent=m;el.hidden=false;clearTimeout(tt);tt=setTimeout(()=>el.hidden=true,2600);}
function showTab(t){cur=t;document.querySelectorAll('.mi').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));['painel','limites','regras','mix','como'].forEach(k=>$('v-'+k).hidden=k!==t);if(R)renderHead();}
document.querySelectorAll('.mi').forEach(b=>b.onclick=()=>showTab(b.dataset.t));
$('confirmMeta').onclick=()=>{read();run();toast('Meta confirmada. Metas por ciclo, praça e loja atualizadas.');};
$('expAll').onclick=()=>exportCards(R.pracas);
$('runBtn').onclick=()=>{run();toast('Mixes gerados.');};
$('resetBtn').onclick=()=>{P=JSON.parse(JSON.stringify(DEF));fill();run();toast('Padrões restaurados.');};
buildForm();showTab('painel');run();
const hs=(location.hash||'').slice(1);if(['painel','limites','regras','mix','como'].includes(hs))showTab(hs);
})();
