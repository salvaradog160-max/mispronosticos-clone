/**
 * Script que se inyecta en stake.mx: abre su buscador, escribe un equipo, elige el partido cuyos
 * dos nombres se parecen a los de la herramienta y navega a su pagina. No inicia sesion ni apuesta:
 * la apuesta la hace el usuario.
 *
 * AFINIDAD_JS es la misma idea que `_afinidad` del servidor (con los prefijos mejorados: ver abajo) (pronostico_servidor/stake_api.py): tokens en comun,
 * parecido por letras y prefijos, para que «FRIBURGO» y «SC Friburgo» o «Man City» y «Manchester City» coincidan.
 */
export const AFINIDAD_JS = `
var STOP={fc:1,cf:1,sc:1,cd:1,ad:1,club:1,de:1,del:1,la:1,el:1,fk:1,afc:1,ac:1,u:1,ii:1};
function tokens(t){ t=String(t||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(); return (t.match(/[a-z0-9]+/g)||[]).filter(function(w){ return !STOP[w]; }); }
function norm(t){ return tokens(t).sort().join(' '); }
function ratio(a,b){
  if(!a.length&&!b.length) return 1;
  var m=[], i, j;
  for(i=0;i<=a.length;i++){ m.push([]); for(j=0;j<=b.length;j++) m[i].push(0); }
  for(i=1;i<=a.length;i++) for(j=1;j<=b.length;j++) m[i][j]=a[i-1]===b[j-1]?m[i-1][j-1]+1:Math.max(m[i-1][j],m[i][j-1]);
  return 2*m[a.length][b.length]/(a.length+b.length);
}
function afinidad(a,b){
  var ta=tokens(a), tb=tokens(b); if(!ta.length||!tb.length) return 0;
  var inter=ta.filter(function(x){ return tb.indexOf(x)>=0; }).length;
  var tok=inter/Math.min(ta.length,tb.length), sim=ratio(norm(a),norm(b)), pref=0;
  // prefijos solo entre las palabras que NO coinciden (Man ~ Manchester), asi Manchester City no se confunde con Manchester United
  var ua=ta.filter(function(x){ return tb.indexOf(x)<0; }), ub=tb.filter(function(x){ return ta.indexOf(x)<0; });
  if(ua.some(function(x){ return x.length>=3&&ub.some(function(y){ return y.indexOf(x)===0||x.indexOf(y)===0; }); })) pref=0.6;
  // una palabra sin pareja contenida en otra sin pareja: «gladbach» dentro de «monchengladbach»
  if(ua.some(function(x){ return x.length>=5&&ub.some(function(y){ return y.length>=5&&(y.indexOf(x)>=0||x.indexOf(y)>=0); }); })) pref=0.6;
  return Math.max(tok, sim>=0.8?sim:0, sim>=0.5?pref:0);
}
`;

export const STAKE_HOME = 'https://stake.mx/sports/soccer';

/** JS completo para inyectar en stake.mx con los nombres de la herramienta. */
export const buscarStakeJs = (local: string, visita: string): string => `(function(L,V){
if(window.__pgStakeBusy) return; window.__pgStakeBusy=true;
${AFINIDAD_JS}
var ID='__pg_toast_stake';
function toast(m,ok){
  var d=document.getElementById(ID);
  if(!d){ d=document.createElement('div'); d.id=ID; d.style.cssText='position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:8px;font:600 14px/1.4 sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none'; document.body.appendChild(d); }
  d.style.background=ok===false?'#b3261e':'#1e7b46'; d.textContent=m;
}
function fin(ok){ try{ window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'stake-fin',ok:!!ok})); }catch(e){} }
function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
function termino(n){ var t=tokens(n).filter(function(w){ return w.length>=3; }).sort(function(a,b){ return b.length-a.length; }); return t[0]||''; }
function campo(){ return document.querySelector('input[data-testid="search"]'); }
function cloudflare(){ var t=(document.title||'')+' '+((document.body&&document.body.innerText)||'').slice(0,400); return /just a moment|performing security verification|verificaci[oó]n de seguridad/i.test(t); }
function boton(){
  var b=document.querySelector('button[aria-label="Buscar"],button[aria-label="Search"],[data-testid="search-button"]'); if(b) return b;
  var bs=[].slice.call(document.querySelectorAll('button'));
  return bs.filter(function(x){ return /^(buscar|search|browse|explorar|examinar|navegar)$/i.test((x.getAttribute('aria-label')||x.getAttribute('title')||x.innerText||'').trim()); })[0]||null;
}
async function abrirBusqueda(){
  for(var i=0;i<60;i++){                       // hasta 24 s: Cloudflare + carga de la pagina
    if(campo()) return campo();
    var b=cloudflare()?null:boton();
    if(b){ b.click(); for(var j=0;j<8;j++){ await sleep(350); if(campo()) return campo(); } }
    await sleep(400);
  }
  return null;
}
function escribir(inp,txt){
  inp.focus(); inp.select();
  var ok=false; try{ ok=document.execCommand('insertText',false,txt); }catch(e){}
  if(!ok||inp.value!==txt){                      // respaldo si execCommand no esta disponible
    var set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    set.call(inp,txt); inp.dispatchEvent(new Event('input',{bubbles:true}));
  }
}
function panel(inp){ var p=inp, n=0; while(p&&n<14&&!p.querySelector('a[href*="/sports/"]')){ p=p.parentElement; n++; } return p; }
function candidatos(inp){
  var p=panel(inp), porHref={}; if(!p) return [];
  [].slice.call(p.querySelectorAll('a[href*="/sports/soccer/"]')).forEach(function(a){
    var h=a.getAttribute('href').split('?')[0]; if(!/\\/\\d+-/.test(h)) return;
    var t=(a.innerText||'').replace(/\\s+/g,' ').trim(); if(t.indexOf(' - ')<0) return;
    if(!porHref[h]||t.length>porHref[h].length) porHref[h]=t;
  });
  return Object.keys(porHref).map(function(h){
    var ps=porHref[h].split(' - '), a=ps[0], b=ps.slice(1).join(' - ');
    var p1=Math.min(afinidad(L,a),afinidad(V,b)), p2=Math.min(afinidad(L,b),afinidad(V,a));
    return {href:h, texto:porHref[h], pt:Math.max(p1,p2)};
  }).sort(function(x,y){ return y.pt-x.pt; });
}
function esperarToque(inp,ms){                 // el buscador movil de Stake solo se activa con un toque REAL (isTrusted)
  return new Promise(function(res){
    var hecho=false;
    function ok(e){ if(hecho||!e.isTrusted) return; hecho=true; inp.removeEventListener('focusin',ok,true); inp.removeEventListener('pointerdown',ok,true); res(true); }
    inp.addEventListener('focusin',ok,true); inp.addEventListener('pointerdown',ok,true);
    setTimeout(function(){ if(!hecho){ hecho=true; res(false); } },ms);
  });
}
async function esperarResultado(inp,n){
  for(var i=0;i<n;i++){ await sleep(400); var c=candidatos(inp); if(c.length&&c[0].pt>=0.6) return c[0]; }
  return null;
}
async function buscar(txt){
  var inp=await abrirBusqueda(); if(!inp) return {error:true};
  escribir(inp,txt);
  var m=await esperarResultado(inp,12);
  if(m) return {mejor:m};
  toast('Toca una vez el buscador de Stake y lo relleno por ti.');
  var toco=await esperarToque(inp,40000);
  if(!toco) return {mejor:null};
  await sleep(1500);                              // la carga diferida del buscador
  escribir(inp,txt);
  return {mejor:await esperarResultado(inp,20)};
}
(async function(){
  if(cloudflare()){ window.__pgStakeBusy=false; return; }      // la pagina se recargara al pasar la verificacion; la app reinyecta
  toast('Buscando el partido en Stake…');
  var terminos=[termino(L),termino(V)].filter(function(x,i,a){ return x&&a.indexOf(x)===i; });
  if(!terminos.length){ toast('Sin nombres de equipo para buscar.',false); fin(false); return; }
  for(var k=0;k<terminos.length;k++){
    var r=await buscar(terminos[k]);
    if(r.error){ toast('No encuentro el buscador de Stake. Usa «Browse» y busca a mano.',false); fin(false); return; }
    if(r.mejor){ toast('Abriendo: '+r.mejor.texto); fin(true); await sleep(500); location.href=location.origin+r.mejor.href; return; }
  }
  toast('No encontré «'+L+' - '+V+'» en Stake. Búscalo a mano en «Browse».',false); fin(false);
})();
})(${JSON.stringify(local)},${JSON.stringify(visita)});`;
