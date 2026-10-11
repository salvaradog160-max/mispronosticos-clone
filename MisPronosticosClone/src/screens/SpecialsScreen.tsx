import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, ProgressBar, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { Pick } from '../domain/picks';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';
import { usePicks } from '../data/usePicks';

interface Props {
  config?: AppConfig;
}

const Stars = ({ value }: { value: number }) => (
  <Text style={styles.stars}>{'\u2605'.repeat(value)}{'\u2606'.repeat(5 - value)}</Text>
);

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '\u2014' : `${(v * 100).toFixed(1)}%`);

/**
 * "Especiales" = donde el modelo mas se aleja de la cuota, ordenado por
 * esa diferencia.
 *
 * OJO con el nombre: esto NO es "las mejores apuestas". El margen que se
 * ve es la diferencia entre lo que dice el modelo y lo que dice el
 * mercado, y el backtest completo (22,833 partidos) da ROI de -4.6% al
 * seguir esas diferencias. Se muestran porque son los partidos donde el
 * modelo y el mercado mas discrepan, que es informacion; no porque sean
 * recomendaciones.
 */
export default function SpecialsScreen({ config = DEFAULTS }: Props) {
  const { data, loading, error, reload } = usePicks(config);

  const mejores = useMemo(
    () =>
      [...data]
        .filter(p => p.odds > 0 && p.margen !== null && p.margen !== undefined)
        .sort((a, b) => (b.margen ?? 0) - (a.margen ?? 0))
        .slice(0, 10),
    [data],
  );

  return (
    <FlatList
      data={mejores}
      keyExtractor={item => item.id}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onRefresh={reload}
      refreshing={loading}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title}>
            Donde más difieren del mercado
          </Text>
          <Text style={styles.muted}>
            Ordenados por cuánto le ganan a la cuota. Cada porcentaje sale
            del modelo y de partidos ya jugados, no de tipsters.
          </Text>
          <View style={styles.aviso}>
            <Text style={styles.avisoTitulo}>No son recomendaciones</Text>
            <Text style={styles.avisoTexto}>
              Seguir estas diferencias dio -4.6% en el backtest de 22,833
              partidos. Se muestran como análisis de dónde está el
              desacuerdo, no como apuestas.
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={palette.accent} style={styles.loader} />
        ) : error ? (
          <Text style={styles.empty}>No se pudo cargar: {error}</Text>
        ) : (
          <Text style={styles.empty}>
            Hoy ningún pick supera el margen mínimo. Antes que inventar
            uno, la pantalla queda vacía.
          </Text>
        )
      }
      renderItem={({ item }: { item: Pick }) => (
        <Surface elevation={1} style={styles.card}>
          <View style={styles.row}>
            <Text variant="titleMedium" style={styles.sel}>
              {item.selection}
            </Text>
            <Stars value={item.stars} />
          </View>

          <Text variant="bodySmall" style={styles.muted}>
            {item.homeTeam && item.awayTeam ? `${item.homeTeam} vs ${item.awayTeam}` : item.market}
            {item.line ? ` · línea ${item.line}` : ''}
          </Text>

          <View style={styles.progressWrap}>
            <View style={styles.progressLabels}>
              <Text style={styles.confidence}>{item.confidence}%</Text>
              <Text style={styles.needs}>necesita {pct(item.breakEven)}</Text>
            </View>
            <ProgressBar progress={item.confidence / 100} color={palette.accent} style={styles.bar} />
          </View>

          <View style={styles.row}>
            <Text style={styles.odds}>Cuota {item.odds.toFixed(2)}</Text>
            {item.margen !== null && item.margen !== undefined ? (
              <Text style={styles.margen}>margen +{(item.margen * 100).toFixed(1)} pp</Text>
            ) : null}
          </View>
        </Surface>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { marginBottom: spacing.md },
  title: { color: palette.text, fontWeight: '700', marginBottom: spacing.xs },
  muted: { color: palette.textMuted, lineHeight: 18 },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sel: { color: palette.text, fontWeight: '600', flex: 1 },
  stars: { color: palette.accent, fontSize: 16, letterSpacing: 1 },
  progressWrap: { marginTop: spacing.sm },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  confidence: { color: palette.accent, fontWeight: '800', fontSize: 26 },
  needs: { color: palette.textMuted, fontSize: 12 },
  bar: { height: 5, borderRadius: 3, backgroundColor: palette.surfaceAlt, marginTop: 4 },
  odds: { color: '#4da3ff', fontSize: 16, fontWeight: '600' },
  margen: { color: palette.accent, fontSize: 14, fontWeight: '700' },
  aviso: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.accent,
  },
  avisoTitulo: { color: palette.text, fontWeight: '700', marginBottom: 4 },
  avisoTexto: { color: palette.textMuted, lineHeight: 18 },
  empty: { color: palette.textMuted, textAlign: 'center', marginTop: spacing.xl, lineHeight: 20 },
  loader: { marginTop: spacing.xl },
});