#!/usr/bin/env python3
"""Genera src/flashscore/scripts.ts desde los marcadores de escritorio (~/Descargas/marcador_flashscore).

Misma logica que marcador.js / marcador_vivo.js; lo unico que cambia es el destino: en vez del
portapapeles, el texto se entrega a la app con ReactNativeWebView.postMessage.
Correr de nuevo si cambian los marcadores originales.
"""
import json, pathlib, sys

ORIGEN = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / 'Descargas' / 'marcador_flashscore')
DESTINO = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'flashscore' / 'scripts.ts'


def reemplazar_funcion(js, inicio, fin, nueva):
    a = js.index(inicio)
    b = js.index(fin, a)
    return js[:a] + nueva + js[b:]


partido = (ORIGEN / 'marcador.js').read_text(encoding='utf-8')
partido = reemplazar_funcion(
    partido, 'function overlay(text){', 'function tab(re){', '')            # el cuadro de respaldo ya no hace falta
partido = reemplazar_funcion(
    partido, 'function copyNow(text, got){', '\n  step();',
    """function copyNow(text, got){
    var n=text.split('\\n').length;
    window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'partido', texto:text, n:n, got:got}));
    toast('Enviado a la herramienta ('+n+' líneas'+(got.length?', con '+got.join(', '):', sin momios extra')+').');
  }""")
partido = partido.replace("toca el marcador otra vez.", "toca «Al análisis» otra vez.")

vivo = (ORIGEN / 'marcador_vivo.js').read_text(encoding='utf-8')
vivo = reemplazar_funcion(
    vivo, 'function overlay(text){', 'function copyNow(text, conStats){', '')
vivo = reemplazar_funcion(
    vivo, 'function copyNow(text, conStats){', '\n  var t=tab(',
    """function copyNow(text, conStats){
    var n=text.split('\\n').length;
    window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'vivo', texto:text, n:n, conStats:conStats}));
    toast('Enviado en vivo ('+n+' líneas'+(conStats?', con estadísticas':', sin estadísticas')+').');
  }""")
vivo = vivo.replace("toca el marcador otra vez.", "toca «En vivo» otra vez.")

DESTINO.write_text(
    "// GENERADO por scripts/generar-flashscore-js.py desde los marcadores de escritorio. No editar a mano.\n"
    "/* eslint-disable */\n"
    "export const PARTIDO_JS = %s;\n\nexport const VIVO_JS = %s;\n" % (json.dumps(partido, ensure_ascii=False), json.dumps(vivo, ensure_ascii=False)),
    encoding='utf-8')
print('escrito', DESTINO, len(partido), len(vivo))
