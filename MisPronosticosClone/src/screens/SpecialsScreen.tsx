import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Chip, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';

interface Props {
  config?: AppConfig;
}

interface Special {
  id: string;
  title: string;
  league: string;
  confidence: number;
  validatedBy: string;
}

const specials: Special[] = [
  {
    id: 's1',
    title: 'Over 2.5 goles',
    league: 'LaLiga',
    confidence: 91,
    validatedBy: 'experto',
  },
];

export default function SpecialsScreen({ config = DEFAULTS }: Props) {
  return (
    <FlatList
      data={specials}
      keyExtractor={item => item.id}
      style={styles.screen}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text variant="bodyMedium" style={styles.muted}>
            Filtrado y confirmado por tipsters
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Surface elevation={1} style={styles.card}>
          <Text variant="titleMedium" style={styles.pick}>
            {item.title}
          </Text>
          <Text style={styles.league}>{item.league}</Text>
          <View style={styles.row}>
            <Text style={styles.confidence}>{item.confidence}%</Text>
            <Chip icon="shield-check" compact style={styles.badge}>
              Validado por {item.validatedBy}
            </Chip>
          </View>
        </Surface>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, gap: spacing.md },
  header: { gap: spacing.xs },
  title: { color: palette.text, fontWeight: '700' },
  muted: { color: palette.textMuted },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pick: { color: palette.text, fontWeight: '600' },
  league: { color: palette.textMuted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confidence: { color: palette.accent, fontWeight: '800', fontSize: 26 },
  badge: { backgroundColor: palette.accentTint },
});