import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, ProgressBar, Surface, Text } from 'react-native-paper';
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

export default function TopAiScreen({ config = DEFAULTS }: Props) {
  const { data, loading, error, reload } = usePicks(config);

  return (
    <FlatList
      data={data}
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
            <Chip icon="filter-variant" compact style={styles.chip}>
              Probabilidad
            </Chip>
            <Chip icon="cash" compact style={styles.chip}>
              Cuota máx
            </Chip>
            <Chip icon="trophy" compact style={styles.chip}>
              Liga
            </Chip>
          </View>
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
            {item.market}
            {item.line ? ` ${item.line}` : ''}
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
            <Text style={styles.odds}>Cuota {item.odds.toFixed(2)}</Text>
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