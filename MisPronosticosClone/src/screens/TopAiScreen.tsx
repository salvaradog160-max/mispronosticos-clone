import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, ProgressBar, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';
import { useAnalisis } from '../data/usePicks';
import type { AnalisisFila } from '../data/analisisRepository';

interface Props {
  config?: AppConfig;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
const pp = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)} pp`);

interface Estadisticas {
  partidosHistorico: number;
  ligas: number;
  derivaMediana: number | null;
  derivaP90: number | null;
  cambioFavorito: number | null;
  consensoAcierto: number | null;
  margenCasa: number;
  nota: string;
}

/**
 * Analizador. NO decide si apostar: enseña las tres cosas que hay que
 * mirar para decidir (mercado, modelo y movimiento de la linea) y
 * dice, arriba, que no hay ventaja demostrada.
 */
export default function TopAiScreen({ config = DEFAULTS }: Props) {
  const { data, stats, loading, error, reload } = useAnalisis(config);

  const ordenados = useMemo(
    () => [...data].sort((a, b) => Math.abs(b.movimiento ?? 0) - Math.abs(a.movimiento ?? 0)),
    [data],
  );

  const discrepantes = data.filter(a => !a.coincide).length;

  return (
    <FlatList
      data={ordenados}
      keyExtractor={(item, i) => `${item.partido}-${i}`}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onRefresh={reload}
      refreshing={loading}
      ListHeaderComponent={
        <View>
          <Text variant="titleLarge" style={styles.title}>
            Análisis
          </Text>

          {stats ? (
            <Surface elevation={1} style={styles.stats}>
              <Text variant="titleSmall" style={styles.statsTitulo}>
                Lo que dicen los datos
              </Text>
              <Fila etiqueta="Ligas / partidos" valor={`${stats.ligas} · ${stats.partidosHistorico.toLocaleString('es-MX')}`} />
              <Fila etiqueta="Acierto del consenso" valor={pct(stats.consensoAcierto)} />
              <Fila etiqueta="Margen de la casa" valor={`${(stats.margenCasa * 100).toFixed(2)}%`} rojo />
              <Fila
                etiqueta="La línea se mueve (mediana)"
                valor={stats.derivaMediana === null ? '—' : `${stats.derivaMediana.toFixed(1)} pp`}
              />
              <Fila
                etiqueta="Movimiento extremo (p90)"
                valor={stats.derivaP90 === null ? '—' : `${stats.derivaP90.toFixed(1)} pp`}
              />
              <Fila
                etiqueta="Cambia el favorito"
                valor={stats.cambioFavorito === null ? '—' : pct(stats.cambioFavorito)}
              />

              <View style={styles.aviso}>
                <Text style={styles.avisoTitulo}>No hay ventaja demostrada</Text>
                <Text style={styles.avisoTexto}>
                  El modelo acierta más que el azar, pero el mercado ya lo tiene en
                  la cuota: apostar todo da −4.57%, que es el margen de la casa.
                  Estos números sirven para analizar, no para apostar en automático.
                </Text>
              </View>
            </Surface>
          ) : null}

          {data.length > 0 ? (
            <Text variant="bodySmall" style={styles.nota}>
              Ordenados por movimiento de línea. {discrepantes} de {data.length} tienen
              modelo y mercado en desacuerdo.
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={palette.accent} style={styles.loader} />
        ) : error ? (
          <Text style={styles.vacio}>No se pudo cargar: {error}</Text>
        ) : (
          <Text style={styles.vacio}>No hay partidos con cuotas en este momento.</Text>
        )
      }
      renderItem={({ item }: { item: AnalisisFila }) => (
        <Surface elevation={1} style={styles.card}>
          <View style={styles.row}>
            <Text variant="titleSmall" style={styles.partido} numberOfLines={2}>
              {item.partido}
            </Text>
            <View style={[styles.mov, item.movimiento !== null && Math.abs(item.movimiento) >= 3 ? styles.movFuerte : null]}>
              <Text style={styles.movTexto}>{pp(item.movimiento)}</Text>
            </View>
          </View>

          <Text style={styles.liga}>
            {item.liga}
            {item.calibracion === 'europea' ? '  ·  calibración heredada de Europa' : ''}
          </Text>

          <View style={styles.cifras}>
            <View style={styles.cifra}>
              <Text style={styles.etiqueta}>Mercado</Text>
              <Text style={styles.valor}>{item.ladoMercado}</Text>
              <Text style={styles.sub}>{pct(item.probMercado)}</Text>
              <Text style={styles.cuota}>
                {item.cuotaApertura != null
                  ? `${item.cuotaApertura.toFixed(2)} → ${item.cuotaMercado.toFixed(2)}`
                  : item.cuotaMercado.toFixed(2)}
              </Text>
            </View>
            <View style={styles.sep} />
            <View style={styles.cifra}>
              <Text style={styles.etiqueta}>Modelo</Text>
              <Text style={styles.valor}>{item.ladoModelo}</Text>
              <Text style={styles.sub}>{pct(item.probModelo)}</Text>
            </View>
          </View>

          <View style={styles.barraWrap}>
            <ProgressBar
              progress={item.coincide ? 1 : 0}
              color={item.coincide ? palette.accent : '#ffb84d'}
              style={styles.barra}
            />
            <Text style={[styles.veredicto, item.coincide ? styles.ok : styles.avisoColor]}>
              {item.coincide
                ? 'Mercado y modelo coinciden'
                : `Discrepan: mercado ve ${item.ladoMercado}, modelo ve ${item.ladoModelo}`}
            </Text>
          </View>

          {item.goodToLine && !item.goodToLine.ejecutable ? (
            <View style={styles.gtl}>
              <Text style={styles.gtlTexto}>
                {item.goodToLine.inalcanzable
                  ? 'Sin buen precio posible a este nivel de acierto'
                  : `Vuelve a valer si la cuota llega a ${item.goodToLine.cuotaNecesaria!.toFixed(2)} (ahora ${item.goodToLine.cuotaActual.toFixed(2)})`}
              </Text>
            </View>
          ) : item.goodToLine?.ejecutable ? (
            <View style={[styles.gtl, styles.gtlOk]}>
              <Text style={styles.gtlTextoOk}>
                Cumple el margen a cuota {item.goodToLine.cuotaActual.toFixed(2)}
              </Text>
            </View>
          ) : null}

          {item.cambioFavorito ? (
            <Text style={styles.giro}>El favorito cambió desde la apertura</Text>
          ) : null}
          {item.lineaGoles ? (
            <Text style={styles.goles}>
              Línea de goles {item.lineaGoles}
              {item.cuotaGoles ? ` · más ${item.cuotaGoles.toFixed(2)}` : ''}
            </Text>
          ) : null}
        </Surface>
      )}
    />
  );
}

const Fila = ({ etiqueta, valor, rojo }: { etiqueta: string; valor: string; rojo?: boolean }) => (
  <View style={styles.fila}>
    <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
    <Text style={[styles.filaValor, rojo ? styles.rojo : null]}>{valor}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { color: palette.text, fontWeight: '700', marginBottom: spacing.md },
  stats: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  statsTitulo: { color: palette.text, fontWeight: '700', marginBottom: spacing.sm },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  filaEtiqueta: { color: palette.textMuted, fontSize: 13 },
  filaValor: { color: palette.text, fontSize: 13, fontWeight: '600' },
  rojo: { color: '#ff6b6b' },
  aviso: { marginTop: spacing.md, padding: spacing.sm, backgroundColor: 'rgba(255,107,107,0.10)', borderRadius: radius.sm },
  avisoTitulo: { color: '#ff6b6b', fontWeight: '700', fontSize: 13, marginBottom: 3 },
  avisoTexto: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
  nota: { color: palette.textMuted, marginBottom: spacing.sm, lineHeight: 17 },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  partido: { color: palette.text, fontWeight: '600', flex: 1 },
  mov: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(77,214,168,0.15)' },
  movFuerte: { backgroundColor: 'rgba(255,184,77,0.20)' },
  movTexto: { color: palette.accent, fontSize: 12, fontWeight: '700' },
  liga: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  cifras: { flexDirection: 'row', marginTop: spacing.sm, alignItems: 'stretch' },
  cifra: { flex: 1 },
  sep: { width: 1, backgroundColor: palette.surfaceAlt, marginHorizontal: spacing.sm },
  etiqueta: { color: palette.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  valor: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 2 },
  sub: { color: palette.textMuted, fontSize: 12, marginTop: 1 },
  cuota: { color: '#4da3ff', fontSize: 12, marginTop: 1, fontWeight: '600' },
  barraWrap: { marginTop: spacing.sm },
  barra: { height: 3, backgroundColor: palette.surfaceAlt },
  veredicto: { fontSize: 12, marginTop: 6 },
  ok: { color: palette.accent },
  avisoColor: { color: '#ffb84d' },
  giro: { color: '#ffb84d', fontSize: 12, marginTop: 6, fontWeight: '600' },
  gtl: { marginTop: 6, padding: spacing.xs, backgroundColor: 'rgba(255,184,77,0.10)', borderRadius: radius.sm },
  gtlOk: { backgroundColor: 'rgba(0,224,184,0.10)' },
  gtlTexto: { color: '#ffb84d', fontSize: 12 },
  gtlTextoOk: { color: palette.accent, fontSize: 12 },
  goles: { color: palette.textMuted, fontSize: 12, marginTop: 4 },
  vacio: { color: palette.textMuted, textAlign: 'center', marginTop: spacing.xl, lineHeight: 20 },
  loader: { marginTop: spacing.xl },
});