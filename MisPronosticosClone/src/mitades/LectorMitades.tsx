import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { urlPermitida } from '../flashscore/puente';
import { ENLACES_JS, FICHA_JS } from './extraer';
import type { Enlaces, Leido, Lector } from './cargar';
import type { Ficha } from './modelo';

const ESPERA_MS = 25000;

/**
 * WebView invisible que abre UNA pagina de Flashscore a la vez (la misma sesion de la app) y devuelve lo que
 * ENLACES_JS / FICHA_JS leen de ella. Solo navega dentro de Flashscore.
 */
const LectorMitades = forwardRef<Lector, {}>((_, ref) => {
  const web = useRef<WebView<{}>>(null);
  const [uri, setUri] = useState('about:blank');
  const pedido = useRef<{ tipo: 'mitades-enlaces' | 'mitades-ficha'; js: string; fin: (m: any) => void; inyectado: boolean; t: ReturnType<typeof setTimeout> } | null>(null);

  const leer = <T,>(url: string, tipo: 'mitades-enlaces' | 'mitades-ficha', js: string): Promise<Leido<T>> =>
    new Promise(resolve => {
      if (!urlPermitida(url)) return resolve({ ok: false, error: 'Dirección no permitida.' });
      const terminar = (m: any) => {
        if (!pedido.current) return;
        clearTimeout(pedido.current.t);
        pedido.current = null;
        if (m?.ok) resolve({ ok: true, datos: (m.ficha ?? m) as T });
        else resolve({ ok: false, error: m?.error ?? 'No pude leer la página.', omitir: m?.omitir === true, bloqueo: m?.bloqueo === true });
      };
      pedido.current = { tipo, js, fin: terminar, inyectado: false, t: setTimeout(() => terminar({ ok: false, error: 'La página tardó demasiado.' }), ESPERA_MS) };
      setUri(url);
      // misma direccion que la anterior: no hay onLoadEnd nuevo, se recarga a mano
      web.current?.injectJavaScript(`if(location.href===${JSON.stringify(url)}){location.reload();} true;`);
    });

  useImperativeHandle(ref, () => ({
    enlaces: url => leer<Enlaces>(url, 'mitades-enlaces', ENLACES_JS),
    ficha: url => leer<Ficha>(url, 'mitades-ficha', FICHA_JS),
  }));

  return (
    <View style={styles.oculto} pointerEvents="none">
      <WebView
        ref={web}
        source={{ uri }}
        originWhitelist={['https://*', 'about:*']}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={r => urlPermitida(r.url)}
        onLoadEnd={e => {
          const p = pedido.current;
          if (!p || p.inyectado || !/flashscore/i.test(e.nativeEvent.url)) return;
          p.inyectado = true;
          web.current?.injectJavaScript(p.js);
        }}
        onMessage={e => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (pedido.current && m?.tipo === pedido.current.tipo) pedido.current.fin(m);
          } catch {
            /* mensaje ajeno: se ignora */
          }
        }}
      />
    </View>
  );
});
LectorMitades.displayName = 'LectorMitades';
export default LectorMitades;

const styles = StyleSheet.create({
  oculto: { position: 'absolute', width: 360, height: 640, left: -2000, top: 0, opacity: 0 },
});
