/**
 * Scripts que se inyectan en el lector oculto (un WebView con Flashscore) para leer goles por mitades.
 * Solo leen la pagina que ya se cargo; no hacen peticiones propias. Cada uno avisa con ReactNativeWebView.postMessage.
 *
 * ENLACES_JS: en la pagina H2H de un partido, devuelve los ultimos partidos de cada equipo (con enlace a su ficha).
 * FICHA_JS: en la ficha de un partido terminado, devuelve los goles con minuto, mitad y marcador acumulado.
 */

export const ENLACES_JS = `(function(){
  var post=function(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} };
  // Flashscore (o su proteccion) pide verificar que eres humano o niega el acceso: parar, no insistir.
  function bloqueo(){
    var t=(document.title||''), c=(document.body&&document.body.innerText)||'';
    return /just a moment|attention required|access denied|un momento|acceso denegado|too many requests/i.test(t)
      ||(c.length<2500&&/captcha|verifica(r)? que (eres|no eres)|verify you are|are you a robot|too many requests|demasiadas (solicitudes|peticiones)|acceso denegado|access denied/i.test(c));
  }
  var t0=Date.now();
  function lineas(el){ return (el.innerText||'').split('\\n').map(function(s){return s.trim();}).filter(Boolean); }
  function intentar(){
    if(bloqueo()) return post({tipo:'mitades-enlaces',ok:false,bloqueo:true,error:'Flashscore pidió verificación o negó el acceso.'});
    var secs=[].slice.call(document.querySelectorAll('.h2h__section')).slice(0,2);
    var filas=secs.map(function(s){ return [].slice.call(s.querySelectorAll('a.h2h__row')); });
    if(secs.length<2||!filas[0].length||!filas[1].length){
      if(Date.now()-t0<12000) return setTimeout(intentar,500);
      return post({tipo:'mitades-enlaces',ok:false,error:'No encontré los últimos partidos en la página.'});
    }
    var tit=(document.title||'').split('|'), duelo=(tit[1]||'').replace(/\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s*$/,'').split(' vs ');
    var local=(duelo[0]||'').trim(), visita=(duelo.slice(1).join(' vs ')||'').trim();
    var equipos=filas.map(function(rs,i){
      return { nombre:i===0?local:visita, filas:rs.slice(0,12).map(function(a){
        var L=lineas(a).filter(function(x){ return !/^tras\\b/i.test(x); });
        var mid=(/[?&]mid=([^&#]+)/.exec(a.href)||[])[1]||'';
        return { href:a.href, mid:mid, fecha:L[0]||'', comp:L[1]||'', local:L[2]||'', visita:L[3]||'', res:L[L.length-1]||'' };
      }) };
    });
    post({tipo:'mitades-enlaces',ok:true,local:local,visita:visita,equipos:equipos});
  }
  intentar();
})();
true;`;

export const FICHA_JS = `(function(){
  var post=function(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} };
  var t0=Date.now();
  // Flashscore (o su proteccion) pide verificar que eres humano o niega el acceso: parar, no insistir.
  function bloqueo(){
    var t=(document.title||''), c=(document.body&&document.body.innerText)||'';
    return /just a moment|attention required|access denied|un momento|acceso denegado|too many requests/i.test(t)
      ||(c.length<2500&&/captcha|verifica(r)? que (eres|no eres)|verify you are|are you a robot|too many requests|demasiadas (solicitudes|peticiones)|acceso denegado|access denied/i.test(c));
  }
  function intentar(){
    if(bloqueo()) return post({tipo:'mitades-ficha',ok:false,bloqueo:true,error:'Flashscore pidió verificación o negó el acceso.'});
    var tit=(document.title||''), m=/\\b(\\d+)-(\\d+)\\b/.exec(tit.split('|')[0]||'');
    var cuerpo=(document.body&&document.body.innerText)||'';
    var final=/^FINALIZADO$/m.test(cuerpo);
    var items=document.querySelectorAll('.smv__incidentsHeader, .smv__incident');
    if(!(m&&final&&(items.length||Date.now()-t0>5000))){
      if(Date.now()-t0<14000) return setTimeout(intentar,500);
      return post({tipo:'mitades-ficha',ok:false,error:'La ficha no cargó a tiempo.'});
    }
    var mid=(/[?&]mid=([^&#]+)/.exec(location.search)||[])[1]||'';
    var partes=(tit.split('|')[1]||'').trim(), f=/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})\\s*$/.exec(partes), duelo=partes.replace(/\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s*$/,'').split(' vs ');
    // Un gol es cualquier incidente con marcador acumulado en su 2a linea (penal, autogol y gol normal usan iconos distintos); la validacion posterior descarta lo raro.
    // La mitad sale del minuto (45+x sigue siendo 1T; 46 en adelante es 2T): el encabezado cambia entre la version de escritorio y la movil.
    var extra=/(^|\\n)\\s*(TRAS )?(PR[OÓ]RROGA|PENALES|PENALTIS)/i.test(cuerpo), goles=[];
    [].forEach.call(items,function(e){
      var L=(e.innerText||'').split('\\n').map(function(s){return s.trim();}).filter(Boolean);
      var tm=/^(\\d+)(?:\\+(\\d+))?'/.exec(L[0]||''), sc=/^(\\d+)\\s*-\\s*(\\d+)$/.exec(L[1]||'');
      if(!tm||!sc) return;
      var min=+tm[1], ex=+(tm[2]||0);
      if(min>90) extra=true;
      goles.push({m:min,x:ex,t:min<=45?1:2,l:+sc[1],v:+sc[2]});
    });
    // La lista de incidentes se dibuja por partes: si los goles aun no suman el marcador final, se espera y se vuelve a leer.
    var pl=0, pv=0, coherente=true;
    goles.forEach(function(x){ var dl=x.l-pl, dv=x.v-pv; if(!((dl===1&&dv===0)||(dl===0&&dv===1))) coherente=false; pl=x.l; pv=x.v; });
    if(!extra&&(!coherente||pl!==+m[1]||pv!==+m[2])&&Date.now()-t0<12000) return setTimeout(intentar,700);
    post({tipo:'mitades-ficha',ok:!extra,omitir:extra||undefined,error:extra?'El partido tuvo prórroga o penales.':undefined,
      ficha:{mid:mid,fecha:f?f[3]+'-'+f[2]+'-'+f[1]:'',local:(duelo[0]||'').trim(),visita:(duelo.slice(1).join(' vs ')||'').trim(),gl:+m[1],gv:+m[2],goles:goles}});
  }
  intentar();
})();
true;`;
