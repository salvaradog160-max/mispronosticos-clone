import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { palette, spacing } from '../theme';
import { PARTIDO_JS, VIVO_JS } from '../flashscore/scripts';
import { jsRecibir, leerMensaje, urlPermitida } from '../flashscore/puente';

/**
 * Pronostico de Goles dentro de la app. El HTML va empaquetado en
 * android/app/src/main/assets/herramienta (scripts/copiar-herramienta.sh).
 * Segundo WebView con Flashscore: los botones «Enviar» ejecutan el mismo
 * marcador de escritorio, pero el texto va a la herramienta y no al portapapeles.
 * Stake, Movimiento (Arbworld) y el historial siguen sin servidor local.
 */
export const HERRAMIENTA_URI = 'file:///android_asset/herramienta/index.html';
export const FLASHSCORE_URI = 'https://www.flashscore.com.mx/';

type Vista = 'herramienta' | 'flashscore';

export default function HerramientaScreen() {
  const [vista, setVista] = useState<Vista>('herramienta');
  const [flashMontado, setFlashMontado] = useState(false);
  const [puedeVolver, setPuedeVolver] = useState(false);
  const herramienta = useRef<WebView<{}>>(null);
  const flash = useRef<WebView<{}>>(null);

  const abrirFlashscore = () => {
    setFlashMontado(true);
    setVista('flashscore');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.barra}>
        <Button compact mode={vista === 'herramienta' ? 'contained' : 'text'} onPress={() => setVista('herramienta')}>
          Herramienta
        </Button>
        <Button compact mode={vista === 'flashscore' ? 'contained' : 'text'} onPress={abrirFlashscore}>
          Flashscore
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
          domStorageEnabled
          allowFileAccess
          setSupportMultipleWindows={false}
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
            domStorageEnabled
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={r => urlPermitida(r.url)}
            onNavigationStateChange={s => setPuedeVolver(s.canGoBack)}
            onMessage={e => {
              const c = leerMensaje(e.nativeEvent.data);
              if (!c) return;
              setVista('herramienta');
              herramienta.current?.injectJavaScript(jsRecibir(c));
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
