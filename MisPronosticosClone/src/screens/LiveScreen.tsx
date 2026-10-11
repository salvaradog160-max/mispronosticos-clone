import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { Match } from '../domain/picks';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';
import { useLiveMatches } from '../data/usePicks';

interface Props {
  config?: AppConfig;
}

/**
 * En vivo muestra SOLO partidos que estan jugando de verdad, con el
 * marcador real de ESPN.
 *
 * No recalcula probabilidades durante el partido: no hay feed de
 * estadisticas por minuto en las fuentes publicas que usamos, y
 * prefiero una pantalla vacia a una que finja.
 */
export default function LiveScreen({ config = DEFAULTS }: Props) {
  const { data, loading, error, reload } = useLiveMatches(config);

  const enJuego = useMemo(() => data.filter(m => m.status === 'live'), [data]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} tintColor={palette.accent} />
      }
    >
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.title}>
          Partidos en juego
        </Text>
        <Text variant="bodyMedium" style={styles.muted}>
          Marcador real de ESPN, actualizado cada hora.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={palette.accent} style={styles.loader} />
      ) : error ? (
        <Text style={styles.vacio}>No se pudo cargar: {error}</Text>
      ) : enJuego.length === 0 ? (
        <Surface elevation={1} style={styles.card}>
          <Text variant="bodyMedium" style={styles.vacioTitulo}>
            No hay partidos en juego ahora mismo
          </Text>
          <Text style={styles.muted}>
            Esta pantalla solo muestra partidos que ya empezaron. Vuelve
            durante un horario de liga.
          </Text>
        </Surface>
      ) : (
        enJuego.map(m => (
          <Surface key={m.id} elevation={1} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.liga}>{m.leagueName ?? ''}</Text>
              {m.minute ? <Text style={styles.minuto}>{m.minute}'</Text> : null}
            </View>
            <View style={styles.marcador}>
              <Text style={styles.equipo}>{m.homeTeam}</Text>
              <Text style={styles.marcadorTexto}>
                {m.homeScore ?? '-'} - {m.awayScore ?? '-'}
              </Text>
              <Text style={styles.equipo}>{m.awayTeam}</Text>
            </View>
          </Surface>
        ))
      )}

      <Surface elevation={1} style={styles.card}>
        <Text variant="titleSmall" style={styles.tituloSeccion}>
          Lo que esta pantalla NO hace
        </Text>
        <Text style={styles.muted}>
          No recalcula probabilidades mientras se juega. Necesitaríamos
          estadísticas por minuto y las fuentes públicas que usamos no las
          dan. Cuando haya datos de verdad, se agrega; mientras tanto, mejor
          vacío que inventado.
        </Text>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  header: { marginBottom: spacing.md },
  title: { color: palette.text, fontWeight: '700', marginBottom: spacing.xs },
  muted: { color: palette.textMuted, lineHeight: 18 },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liga: { color: palette.textMuted, fontSize: 13 },
  minuto: { color: palette.accent, fontWeight: '700' },
  marcador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  equipo: { color: palette.text, fontSize: 16, fontWeight: '600', flex: 1 },
  marcadorTexto: { color: palette.accent, fontSize: 22, fontWeight: '800', paddingHorizontal: spacing.sm },
  vacio: { color: palette.textMuted, textAlign: 'center', marginTop: spacing.lg, lineHeight: 19 },
  vacioTitulo: { color: palette.text, fontWeight: '600', marginBottom: spacing.xs },
  tituloSeccion: { color: palette.text, fontWeight: '700', marginBottom: spacing.xs },
  loader: { marginTop: spacing.xl },
});