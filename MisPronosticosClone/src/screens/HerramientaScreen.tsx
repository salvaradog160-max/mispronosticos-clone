import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { palette } from '../theme';

/**
 * Pronostico de Goles dentro de la app. Fase 0: el HTML va empaquetado en
 * android/app/src/main/assets/herramienta (ver scripts/copiar-herramienta.sh)
 * y se abre tal cual. Sin el servidor local de la PC, «Traer de Stake»,
 * «Movimiento» y el historial avisan que no estan disponibles; el modelo
 * (pegar datos de Flashscore y calcular) funciona completo.
 */
export const HERRAMIENTA_URI = 'file:///android_asset/herramienta/index.html';

export default function HerramientaScreen() {
  return (
    <View style={styles.screen}>
      <WebView
        source={{ uri: HERRAMIENTA_URI }}
        originWhitelist={['file://*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        setSupportMultipleWindows={false}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  web: { flex: 1, backgroundColor: palette.bg },
});
