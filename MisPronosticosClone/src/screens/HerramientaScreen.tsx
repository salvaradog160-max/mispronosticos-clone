import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { palette, spacing } from '../theme';
import { PARTIDO_JS, VIVO_JS } from '../flashscore/scripts';
import { jsRecibir, leerMensaje, urlPermitida, urlStakePermitida } from '../flashscore/puente';
import { STAKE_HOME, buscarStakeJs } from '../stake/buscar';
import { buscarArbworld } from '../arbworld/arbworld';

/**
 * Pronostico de Goles dentro de la app. El HTML va empaquetado en
 * android/app/src/main/assets/herramienta (scripts/copiar-herramienta.sh).
 * Segundo WebView con Flashscore: los botones «Enviar» ejecutan el mismo
 * marcador de escritorio, pero el texto va a la herramienta y no al portapapeles.
 * Tercer WebView con Stake: al tocar una tarjeta de pronostico en la herramienta, el visor busca ese partido
 * por los nombres de los equipos y abre su pagina. El usuario inicia sesion y apuesta por su cuenta.
 * «Traer de Stake» (API), Movimiento (Arbworld) y el historial siguen sin servidor local.
 */
export const HERRAMIENTA_URI = 'file:///android_asset/herramienta/index.html';
export const FLASHSCORE_URI = 'https://www.flashscore.com.mx/';

type Vista = 'herramienta' | 'flashscore' | 'stake';

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
      <View style={styles.barra}>
        <Button compact mode={vista === 'herramienta' ? 'contained' : 'text'} onPress={() => setVista('herramienta')}>
          Herramienta
        </Button>
        <Button compact mode={vista === 'flashscore' ? 'contained' : 'text'} onPress={abrirFlashscore}>
          Flashscore
        </Button>
        <Button compact mode={vista === 'stake' ? 'contained' : 'text'} onPress={() => { setStakeMontado(true); setVista('stake'); }}>
          Stake
        </Button>
        {vista === 'flashscore' && (
          <>
            <Button compact disabled={!puedeVolver} onPress={() => flash.current?.goBack()}>
              ←
            </Button>
            <Button compact onPress={() => flash.current?.injectJavaScript(PARTIDO_JS + '; true;')}>
              Al análisis
            </Button>
            <Button compact onPress={() => flash.current?.injectJavaScript(VIVO_JS + '; true;')}>
              En vivo
            </Button>
          </>
        )}
      </View>

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
              if (!c || c.tipo === 'stake' || c.tipo === 'stake-fin' || c.tipo === 'arbworld') return;
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  barra: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    backgroundColor: palette.surface,
  },
  web: { flex: 1, backgroundColor: palette.bg },
  oculto: { display: 'none' },
});
