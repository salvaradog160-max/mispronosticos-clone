import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';
import { usePicks } from '../data/usePicks';

interface Props {
  config?: AppConfig;
}

/**
 * Perfil sin planes, sin pagos y sin bloqueos. Todo el contenido de la
 * app esta disponible siempre: el filtro de valor esperado ya garantiza
 * que lo que se ve tiene respaldo medido, asi que no hace falta un muro
 * de pago encima.
 */
export default function ProfileScreen({ config = DEFAULTS }: Props) {
  const { data } = usePicks(config);

  const publicadas = data.filter(p => p.odds > 0).length;
  const conMargen = data.filter(p => (p.margen ?? 0) > 0).length;

  const origen =
    config.dataSource === 'static'
      ? 'GitHub Actions (se actualiza cada hora)'
      : config.dataSource === 'api'
        ? `Servidor ${config.apiBaseUrl}`
        : 'Datos de prueba';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Surface elevation={1} style={styles.card}>
        <Text variant="titleMedium" style={styles.title}>
          Cómo funciona
        </Text>
        <Text style={styles.body}>
          Cada pick necesita dos cosas: que el modelo y el mercado coincidan, y
          que la probabilidad supere lo que cuesta la cuota por 5 puntos. Los
          que no cumplen, no se publican.
        </Text>
        <Text style={styles.body}>
          Todos los porcentajes salen de partidos ya jugados, no de
          intuiciones ni de modelos de lenguaje.
        </Text>
      </Surface>

      <Surface elevation={1} style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Picks hoy</Text>
          <Text style={styles.value}>{publicadas}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Con margen positivo</Text>
          <Text style={styles.value}>{conMargen}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Mercados</Text>
          <Text style={styles.value}>1X2 · Goles</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Fuente</Text>
          <Text style={styles.valueSmall}>{origen}</Text>
        </View>
      </Surface>

      <Surface elevation={1} style={styles.card}>
        <Text variant="titleSmall" style={styles.title}>
          Datos
        </Text>
        <Text style={styles.body}>football-data.co.uk y ESPN. Todo público, sin credenciales de terceros.</Text>
        <Text style={styles.body}>El margen histórico medido es pequeño. Trata esto como una herramienta, no como una máquina de dinero.</Text>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  title: { color: palette.text, fontWeight: '700', marginBottom: spacing.xs },
  body: { color: palette.textMuted, lineHeight: 19, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  label: { color: palette.textMuted, fontSize: 14 },
  value: { color: palette.accent, fontWeight: '700', fontSize: 16 },
  valueSmall: { color: palette.text, fontSize: 13, flexShrink: 1, textAlign: 'right', marginLeft: spacing.sm },
});