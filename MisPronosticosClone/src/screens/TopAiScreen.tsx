import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, ProgressBar, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { Pick, Market } from '../domain/picks';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';
import { usePicks, useAlertas } from '../data/usePicks';
import AlertasCard from '../components/AlertasCard';

interface Props {
  config?: AppConfig;
}

const Stars = ({ value }: { value: number }) => (
  <Text style={styles.stars}>{'\u2605'.repeat(value)}{'\u2606'.repeat(5 - value)}</Text>
);

const MERCADOS: { key: Market; label: string }[] = [
  { key: '1X2', label: '1X2' },
  { key: 'TOTAL', label: 'Goles' },
];

export default function TopAiScreen({ config = DEFAULTS }: Props) {
  const [mercado, setMercado] = useState<Market>('1X2');
  const { data, loading, error, reload } = usePicks(config, { market: mercado });
  const { data: alertas } = useAlertas(config);
  const visibles = useMemo(() => data.filter(p => p.market === mercado), [data, mercado]);

  return (
    <FlatList
      data={visibles}
      keyExtractor={item => item.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      onRefresh={reload}
      refreshing={loading}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {config.minStarsTopAi} estrellas o más · mínimo {config.minConfidenceTopAi}%
          </Text>
          <View style={styles.chips}>
            {MERCADOS.map(m => (
              <Chip
                key={m.key}
                compact
                style={[styles.chip, mercado === m.key && styles.chipOn]}
                selected={mercado === m.key}
                onPress={() => setMercado(m.key)}
                showSelectedCheck={false}
              >
                {m.label}
              </Chip>
            ))}
          </View>
          <AlertasCard alertas={alertas} />
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={palette.accent} style={styles.loader} />
        ) : error ? (
          <Text style={styles.error}>No se pudo cargar: {error}</Text>
        ) : (
          <Text style={styles.empty}>Sin picks que cumplan el filtro.</Text>
        )
      }
      renderItem={({ item }: { item: Pick }) => (
        <Surface elevation={1} style={styles.card}>
          <View style={styles.row}>
            <Text variant="titleMedium" style={styles.market}>
              {item.selection}
            </Text>
            <Stars value={item.stars} />
          </View>
          <Text variant="bodySmall" style={styles.muted}>
            {/* En 1X2 la seleccion ya trae el equipo ("Gana X"), asi que
                repetir el partido seria redundante. En goles si hace falta. */}
            {item.homeTeam && item.awayTeam && !item.selection.includes(item.homeTeam)
              ? `${item.homeTeam} vs ${item.awayTeam}`
              : item.line
                ? `${item.market} · línea ${item.line}`
                : item.market}
          </Text>
          <View style={styles.progressWrap}>
            <Text style={styles.confidence}>{item.confidence}%</Text>
            <ProgressBar
              progress={item.confidence / 100}
              color={palette.accent}
              style={styles.bar}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.odds}>
              Cuota {item.odds.toFixed(2)}
              {item.margen !== null && item.margen !== undefined
                ? `  ·  margen +${(item.margen * 100).toFixed(1)}pp`
                : ''}
            </Text>
            {item.isSpecial ? (
              <Chip icon="shield-check" compact style={styles.special}>
                Validado
              </Chip>
            ) : null}
          </View>
          {item.analysis ? (
            <Text variant="bodySmall" style={styles.muted}>
              {item.analysis}
            </Text>
          ) : null}
        </Surface>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  subtitle: { color: palette.textMuted },
  chips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chipOn: { backgroundColor: palette.accent, opacity: 0.85 },
  chip: { backgroundColor: palette.surfaceAlt },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  market: { color: palette.text, fontWeight: '600' },
  stars: { color: palette.star, fontSize: 14, letterSpacing: 1 },
  muted: { color: palette.textMuted },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confidence: { color: palette.accent, fontWeight: '700', width: 56 },
  bar: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: palette.border },
  odds: { color: palette.blue, fontWeight: '600' },
  special: { backgroundColor: palette.accentTint },
  loader: { marginTop: spacing.xl },
  error: { color: palette.danger, marginTop: spacing.lg },
  empty: { color: palette.textMuted, marginTop: spacing.lg },
});