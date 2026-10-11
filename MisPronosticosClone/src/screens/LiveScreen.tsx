import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, ProgressBar, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';

interface Props {
  config?: AppConfig;
}

const phases = [
  { id: 'p30', label: 'Minuto 30', done: true },
  { id: 'p60', label: 'Minuto 60', done: false },
  { id: 'p90', label: 'Final', done: false },
];

export default function LiveScreen({ config = DEFAULTS }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text variant="bodyMedium" style={styles.muted}>
        La IA recalcula probabilidades mientras se juega el partido
      </Text>

      <Surface elevation={1} style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.league}>Premier League</Text>
          <Text style={styles.minute}>67'</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.team}>Arsenal</Text>
          <Text style={styles.score}>1 - 1</Text>
          <Text style={styles.team}>Chelsea</Text>
        </View>
        <Text style={styles.muted}>Posesión · tiros · contexto H2H</Text>
      </Surface>

      <Text variant="titleSmall" style={styles.section}>
        Fases del analisis
      </Text>
      {phases.map(phase => (
        <View key={phase.id} style={styles.phase}>
          <Text style={styles.phaseLabel}>{phase.label}</Text>
          <ProgressBar
            progress={phase.done ? 1 : 0}
            color={phase.done ? palette.accent : palette.surfaceAlt}
            style={styles.bar}
          />
        </View>
      ))}

      <Surface elevation={1} style={styles.card}>
        <Text style={styles.market}>Over 2.5 goles</Text>
        <Text style={styles.confidence}>87%</Text>
        <Button mode="contained" style={styles.cta} textColor={palette.bg}>
          Ver pick con contexto
        </Button>
        <Text variant="bodySmall" style={styles.locked}>
          El razonamiento en vivo es Premium
        </Text>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, gap: spacing.md },
  title: { color: palette.text, fontWeight: '700' },
  muted: { color: palette.textMuted },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  league: { color: palette.textMuted, fontSize: 12 },
  minute: { color: palette.accent, fontWeight: '700' },
  team: { color: palette.text, fontWeight: '600', flex: 1, textAlign: 'center' },
  score: { color: palette.text, fontWeight: '800', fontSize: 18 },
  section: { color: palette.textMuted, marginTop: spacing.sm },
  phase: { gap: spacing.xs },
  phaseLabel: { color: palette.text },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: palette.surfaceAlt },
  market: { color: palette.text, fontWeight: '600', fontSize: 16 },
  confidence: { color: palette.accent, fontWeight: '800', fontSize: 32 },
  cta: { backgroundColor: palette.accent, borderRadius: radius.md },
  locked: { color: palette.textMuted, textAlign: 'center' },
});