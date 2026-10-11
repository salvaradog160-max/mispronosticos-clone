import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { Alerta } from '../data/picksRepository';

const COLOR = { alta: '#ff6b6b', media: '#ffb84d', baja: '#4dd6a8' } as const;
const ICON = {
  SALTO_TRAMO: '↕',
  CAMBIO_LADO: '⇄',
  LINEA_GOLES: '◎',
  NUEVO_PICK: '+',
  PICK_RETIRADO: '−',
} as const;
const TITULO = {
  SALTO_TRAMO: 'Cambió la confianza',
  CAMBIO_LADO: 'El mercado cambió de lado',
  LINEA_GOLES: 'Cambió la línea de goles',
  NUEVO_PICK: 'Nuevo pick',
  PICK_RETIRADO: 'Pick retirado',
} as const;

export default function AlertasCard({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return null;
  const altas = alertas.filter(a => a.severidad === 'alta').length;

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.header}>
        <Text variant="titleSmall" style={styles.title}>
          Movimiento desde la última corrida
        </Text>
        {altas > 0 && (
          <View style={styles.badge}>
            <Text variant="labelSmall" style={styles.badgeText}>
              {altas} importante{altas > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      {alertas.slice(0, 6).map((a, i) => (
        <View key={`${a.tipo}-${a.fixtureId}-${i}`} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: COLOR[a.severidad] }]} />
          <View style={styles.body}>
            <Text variant="labelMedium" style={[styles.label, { color: COLOR[a.severidad] }]}>
              {ICON[a.tipo]} {TITULO[a.tipo]}
            </Text>
            <Text variant="bodySmall" style={styles.texto}>
              {a.detalle}
            </Text>
          </View>
        </View>
      ))}

      {alertas.length > 6 && (
        <Text variant="labelSmall" style={styles.mas}>
          +{alertas.length - 6} más
        </Text>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { color: palette.text, fontWeight: '600' },
  badge: { backgroundColor: 'rgba(255,107,107,0.18)', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: '#ff6b6b' },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  body: { flex: 1 },
  label: { fontWeight: '600', marginBottom: 1 },
  texto: { color: palette.textMuted, lineHeight: 16 },
  mas: { color: palette.textMuted, marginTop: spacing.xs },
});