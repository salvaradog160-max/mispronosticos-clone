import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import { WebView } from 'react-native-webview';
import { spacing } from '../theme';
import { PARTIDO_JS, VIVO_JS } from '../flashscore/scripts';
import { jsRecibir, leerMensaje, urlPermitida, urlStakePermitida } from '../flashscore/puente';
import { STAKE_HOME, buscarStakeJs } from '../stake/buscar';
import { buscarArbworld } from '../arbworld/arbworld';
import { buscarStake as buscarStakeApi } from '../stake/api';
import { buscarBetmexico } from '../betmexico/api';

/**
 * Pronostico de Goles dentro de la app. El HTML va empaquetado en
 * android/app/src/main/assets/herramienta (scripts/copiar-herramienta.sh).
 * Segundo WebView con Flashscore: los botones «Enviar» ejecutan el mismo
 * marcador de escritorio, pero el texto va a la herramienta y no al portapapeles.
 * Tercer WebView con Stake: al tocar una tarjeta de pronostico en la herramienta, el visor busca ese partido
 * por los nombres de los equipos y abre su pagina. El usuario inicia sesion y apuesta por su cuenta.
 * «Traer de Stake» (API), Movimiento (Arbworld) y el historial siguen sin servidor local.
 */
type Vista = 'herramienta' | 'flashscore' | 'stake';
const COLOR = { fondo: '#060a11', barra: '#0a1424', texto: '#eaf1ff', apagado: '#7f93b3', acento: '#2ee6a8' };
const PESTANAS: Array<{ id: Vista; nombre: string; icono: 'chart-donut' | 'soccer' | 'ticket-confirmation' }> = [
  { id: 'herramienta', nombre: 'Análisis', icono: 'chart-donut' },
  { id: 'flashscore', nombre: 'Flashscore', icono: 'soccer' },
  { id: 'stake', nombre: 'Stake', icono: 'ticket-confirmation' },
];

export const HERRAMIENTA_URI = 'file:///android_asset/herramienta/index.html';
export const FLASHSCORE_URI = 'https://www.flashscore.com.mx/';


export default function HerramientaScreen({ pantallaCompleta = false }: { pantallaCompleta?: boolean }) {
  const insets = useSafeAreaInsets();
  const [vista, setVista] = useState<Vista>('herramienta');
  const [flashMontado, setFlashMontado] = useState(false);
  const [stakeMontado, setStakeMontado] = useState(false);
  const [puedeVolver, setPuedeVolver] = useState(false);
  const herramienta = useRef<WebView<{}>>(null);
  const flash = useRef<WebView<{}>>(null);
  const stake = useRef<WebView<{}>>(null);
  const pendienteStake = useRef<{ l: string; v: string } | null>(null);
  const intentosStake = useRef(0);
  const consultarStakeApi = (id: number, l: string, v: string) => {
    buscarStakeApi(l, v, { fetcher: (url, init) => fetch(url, init), ahora: () => Date.now() }).then(r =>
      herramienta.current?.injectJavaScript(`window.__pgStakeRespuesta && window.__pgStakeRespuesta(${id}, ${JSON.stringify(r)}); true;`),
    );
  };

  const abrirStake = (l: string, v: string) => {
    pendienteStake.current = { l, v };
    intentosStake.current = 0;
    setStakeMontado(true);
    setVista('stake');
    // Si el visor ya existe, se recarga la portada para que onLoadEnd lance la busqueda con el buscador a la vista.
    stake.current?.injectJavaScript(`window.location.href=${JSON.stringify(STAKE_HOME)}; true;`);
  };

  // Atras de Android: dentro de Flashscore retrocede en su historial y, sin historial, vuelve a la herramienta.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (vista === 'herramienta') return false;
      if (vista === 'flashscore' && puedeVolver) flash.current?.goBack();
      else setVista('herramienta');
      return true;
    });
    return () => sub.remove();
  }, [vista, puedeVolver]);

  const abrirFlashscore = () => {
    setFlashMontado(true);
    setVista('flashscore');
  };

  return (
    <View style={[styles.screen, pantallaCompleta && { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.cuerpo}>
      <View style={[styles.web, vista !== 'herramienta' && styles.oculto]}>
        <WebView
          ref={herramienta}
          source={{ uri: HERRAMIENTA_URI }}
          originWhitelist={['file://*']}
          javaScriptEnabled
          webviewDebuggingEnabled={__DEV__}
          domStorageEnabled
          allowFileAccess
          setSupportMultipleWindows={false}
          onMessage={e => {
            const m = leerMensaje(e.nativeEvent.data);
            if (m?.tipo === 'stake') abrirStake(m.l, m.v);
            if (m?.tipo === 'stakeapi') consultarStakeApi(m.id, m.l, m.v);
            if (m?.tipo === 'betmexico') {
              buscarBetmexico(m.l, m.v, {
                fetcher: (url, init) => fetch(url, init),
                ahora: () => Date.now(),
                dormir: ms => new Promise<void>(r => setTimeout(() => r(), ms)),
              }).then(r =>
                herramienta.current?.injectJavaScript(`window.__pgBmRespuesta && window.__pgBmRespuesta(${m.id}, ${JSON.stringify(r)}); true;`),
              );
            }
            if (m?.tipo === 'arbworld') {
              // Arbworld se lee desde la app (la pagina de la herramienta no puede por CORS) y la respuesta vuelve por el mismo puente.
              buscarArbworld(m.l, m.v, m.m).then(r =>
                herramienta.current?.injectJavaScript(`window.__pgArbRespuesta && window.__pgArbRespuesta(${m.id}, ${JSON.stringify(r)}); true;`),
              );
            }
          }}
          style={styles.web}
        />
      </View>

      {flashMontado && (
        <View style={[styles.web, vista !== 'flashscore' && styles.oculto]}>
          <WebView
            ref={flash}
            source={{ uri: FLASHSCORE_URI }}
            originWhitelist={['https://*']}
            javaScriptEnabled
            webviewDebuggingEnabled={__DEV__}
            domStorageEnabled
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={r => urlPermitida(r.url)}
            onNavigationStateChange={s => setPuedeVolver(s.canGoBack)}
            onMessage={e => {
              const c = leerMensaje(e.nativeEvent.data);
              if (!c || c.tipo === 'stake' || c.tipo === 'stake-fin' || c.tipo === 'arbworld' || c.tipo === 'stakeapi' || c.tipo === 'betmexico') return;
              setVista('herramienta');
              herramienta.current?.injectJavaScript(jsRecibir(c));
            }}
            style={styles.web}
          />
        </View>
      )}

      {stakeMontado && (
        <View style={[styles.web, vista !== 'stake' && styles.oculto]}>
          <WebView
            ref={stake}
            source={{ uri: STAKE_HOME }}
            originWhitelist={['https://*']}
            javaScriptEnabled
            webviewDebuggingEnabled={__DEV__}
            domStorageEnabled
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={r => urlStakePermitida(r.url)}
            onMessage={e => {
              const m = leerMensaje(e.nativeEvent.data);
              if (m?.tipo === 'stake-fin') pendienteStake.current = null;
            }}
            onLoadEnd={e => {
              // Cloudflare recarga la pagina al pasar su verificacion: el pedido sigue pendiente hasta que el script avise del fin.
              const p = pendienteStake.current;
              if (!p || !/^https:\/\/([a-z0-9-]+\.)*stake\.(mx|com)\/(en\/|es\/)?sports/i.test(e.nativeEvent.url)) return;
              if (++intentosStake.current > 6) {
                pendienteStake.current = null;
                return;
              }
              stake.current?.injectJavaScript(buscarStakeJs(p.l, p.v));
            }}
            style={styles.web}
          />
        </View>
      )}

        {vista === 'flashscore' && (
          <View style={styles.flota} pointerEvents="box-none">
            <View style={styles.pastilla}>
              <Pressable style={[styles.accionIcono, !puedeVolver && styles.apagado]} disabled={!puedeVolver} onPress={() => flash.current?.goBack()} accessibilityLabel="Atrás">
                <MaterialDesignIcons name="arrow-left" size={20} color={COLOR.texto} />
              </Pressable>
              <Pressable style={styles.accion} onPress={() => flash.current?.injectJavaScript(PARTIDO_JS + '; true;')} accessibilityLabel="Enviar el partido al análisis">
                <MaterialDesignIcons name="chart-donut" size={18} color={COLOR.fondo} />
                <Text style={styles.accionTxt}>Al análisis</Text>
              </Pressable>
              <Pressable style={[styles.accion, styles.accionSec]} onPress={() => flash.current?.injectJavaScript(VIVO_JS + '; true;')} accessibilityLabel="Enviar el partido en vivo">
                <MaterialDesignIcons name="flash-outline" size={18} color={COLOR.texto} />
                <Text style={[styles.accionTxt, { color: COLOR.texto }]}>En vivo</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.barraInf}>
        {PESTANAS.map(t => {
          const activa = vista === t.id;
          return (
            <Pressable
              key={t.id}
              style={styles.pestana}
              accessibilityRole="tab"
              accessibilityState={{ selected: activa }}
              onPress={() => {
                if (t.id === 'flashscore') abrirFlashscore();
                else if (t.id === 'stake') { setStakeMontado(true); setVista('stake'); }
                else setVista('herramienta');
              }}>
              <View style={[styles.icoCaja, activa && styles.icoCajaOn]}>
                <MaterialDesignIcons name={t.icono} size={22} color={activa ? COLOR.acento : COLOR.apagado} />
              </View>
              <Text style={[styles.pestanaTxt, activa && { color: COLOR.acento }]}>{t.nombre}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.fondo },
  cuerpo: { flex: 1 },
  web: { flex: 1, backgroundColor: COLOR.fondo },
  oculto: { display: 'none' },
  flota: { position: 'absolute', left: 0, right: 0, bottom: spacing.md, alignItems: 'center' },
  pastilla: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: 6, borderRadius: 999,
    backgroundColor: 'rgba(10,20,36,0.94)', borderWidth: 1, borderColor: 'rgba(120,170,255,0.3)', elevation: 10,
  },
  accionIcono: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: COLOR.acento },
  accionSec: { backgroundColor: 'rgba(255,255,255,0.1)' },
  accionTxt: { color: COLOR.fondo, fontWeight: '700', fontSize: 14 },
  apagado: { opacity: 0.35 },
  barraInf: {
    flexDirection: 'row', backgroundColor: COLOR.barra, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 6, paddingBottom: 4,
  },
  pestana: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  icoCaja: { width: 58, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  icoCajaOn: { backgroundColor: 'rgba(46,230,168,0.16)' },
  pestanaTxt: { color: COLOR.apagado, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.3 },
});
