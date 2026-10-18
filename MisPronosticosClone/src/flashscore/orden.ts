/**
 * Lista de partidos de Flashscore ordenada por HORA en vez de por liga.
 *
 * La lista movil es un solo contenedor (.sportName.soccer) con encabezados de liga (.headerLeague__wrapper) y partidos
 * (.event__match) como hermanos. En lugar de mover nodos (Flashscore los reutiliza y su navegacion sigue funcionando),
 * se vuelve flex y se asigna `order` a cada hijo: los encabezados de liga se ocultan, cada partido muestra su liga en una
 * linea pequena y se insertan separadores por hora. Orden: en vivo primero, luego por empezar por hora, al final los
 * terminados. Un MutationObserver reaplica el orden cuando Flashscore re-dibuja la lista (cambio de dia, filtros).
 *
 * window.__pgOrdenar('hora' | 'liga') cambia el modo; se recuerda en localStorage.
 */
export const ORDEN_JS = `(function(){
  if(window.__pgOrdenInit){ return; } window.__pgOrdenInit=true;
  var KEY='pg-orden', HOST='.sportName.soccer';
  var modo='hora'; try{ var g=localStorage.getItem(KEY); if(g==='liga'||g==='hora') modo=g; }catch(e){}
  function estilo(){
    if(document.getElementById('pg-orden-css')) return;
    var s=document.createElement('style'); s.id='pg-orden-css';
    s.textContent='.pg-on{display:flex!important;flex-direction:column!important}'
      +'.pg-on .headerLeague__wrapper{display:none!important}'
      +'.pg-on .event__match[data-pgliga]{padding-top:16px!important;box-sizing:border-box}'
      +'.pg-on .event__match[data-pgliga]::before{content:attr(data-pgliga);display:block;position:absolute;left:14px;top:3px;font:600 10px/1 sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#7f8ba0;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      +'.pg-on .event__match{position:relative}'
      +'.pg-hora{display:flex;align-items:center;gap:8px;padding:6px 14px;font:700 13px sans-serif;letter-spacing:.08em;color:#0b2a44;background:#dfe9f5;border-top:1px solid #c5d3e3;border-bottom:1px solid #c5d3e3}'
      +'.pg-hora small{font-weight:600;color:#4a6683;letter-spacing:.04em}';
    (document.head||document.documentElement).appendChild(s);
  }
  function minutos(t){ var m=/(\\d{1,2}):(\\d{2})/.exec(t||''); return m?(+m[1])*60+(+m[2]):null; }
  function ligaDe(h){
    var t=h.querySelector('.headerLeague__title-text,.headerLeague__title'), f=h.querySelector('.headerLeague__flag');
    var a=t?t.textContent.trim():'', b=f?(f.getAttribute('title')||'').trim():'';
    return b?(b+' · '+a):a;
  }
  function aplicar(){
    var host=document.querySelector(HOST); if(!host) return;
    {
      var hijos=[].slice.call(host.children);
      [].forEach.call(host.querySelectorAll('.pg-hora'),function(n){ n.parentNode.removeChild(n); });
      if(modo!=='hora'){
        host.classList.remove('pg-on');
        hijos.forEach(function(e){ e.style.order=''; if(e.removeAttribute) e.removeAttribute('data-pgliga'); });
        return;
      }
      estilo(); host.classList.add('pg-on');
      var liga='', horas={}, vivos=0, prog=0, fin=0;
      hijos.forEach(function(e){
        if(e.classList.contains('headerLeague__wrapper')){ liga=ligaDe(e); e.style.order='0'; return; }
        if(!e.classList.contains('event__match')){ e.style.order='99999'; return; }
        e.setAttribute('data-pgliga',liga);
        var live=e.classList.contains('live')||e.classList.contains('event__match--live')||!!e.querySelector('.event__stage');
        var sch=e.classList.contains('scheduled')||e.classList.contains('event__match--scheduled');
        var tm=e.querySelector('.event__time'), m=sch&&tm?minutos(tm.textContent):null;
        if(live){ e.style.order=String(1000+vivos++); }
        else if(m!==null){ e.style.order=String(10000+m*10+5); horas[Math.floor(m/60)]=1; prog++; }
        else if(sch){ e.style.order='60000'; }
        else { e.style.order=String(70000+fin++); }
      });
      Object.keys(horas).forEach(function(h){
        var d=document.createElement('div'); d.className='pg-hora'; d.style.order=String(10000+(+h)*600+1);
        d.innerHTML=('0'+h).slice(-2)+':00 <small>en adelante</small>'; host.appendChild(d);
      });
      if(vivos){ var v=document.createElement('div'); v.className='pg-hora'; v.style.order='999'; v.innerHTML='EN VIVO <small>'+vivos+' partidos</small>'; host.appendChild(v); }
      if(fin){ var f=document.createElement('div'); f.className='pg-hora'; f.style.order='69999'; f.innerHTML='TERMINADOS <small>'+fin+' partidos</small>'; host.appendChild(f); }
    }
  }
  var t=null;
  function programar(){ if(t) clearTimeout(t); t=setTimeout(aplicar,120); }
  function nuestro(n){ return n.nodeType===1&&n.classList&&n.classList.contains('pg-hora'); }
  // solo cuenta lo que cambia Flashscore: los separadores que insertamos nosotros no deben reactivar el orden (seria un bucle)
  new MutationObserver(function(ms){
    for(var i=0;i<ms.length;i++){
      if(ms[i].type!=='childList') continue;
      var nodos=[].slice.call(ms[i].addedNodes).concat([].slice.call(ms[i].removedNodes));
      if(nodos.length&&!nodos.every(nuestro)){ programar(); return; }
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
  window.__pgOrdenar=function(m){ modo=(m==='liga')?'liga':'hora'; try{ localStorage.setItem(KEY,modo); }catch(e){} aplicar(); return modo; };
  window.__pgOrdenModo=function(){ return modo; };
  aplicar();
})(); true;`;
