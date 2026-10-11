import React, { useMemo } from 'react';
import { View, Text, Image, Pressable, SectionList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AnalisisFila } from '../data/analisisRepository';
import { useAnalisis } from '../data/usePicks';
import { DEFAULTS } from '../config';
import DetalleModal from './DetalleModal';
import { palette, spacing, radius, fontSize } from '../theme';

/**
 * Pantalla de Partidos: la entrada de la app.
 *
 * Es una lista por liga con escudos, hora y el pick. Antes la entrada
 * era "Top AI", una tarjeta de estadisticas globales y luego la lista.
 * Aqui el objeto central es el PARTIDO, como en la referencia: se ve
 * que juega, cuando y que dice el modelo.
 */

const hora = (kickoff?: string) => {
  if (!kickoff) return '';
  const d = new Date(kickoff);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const dia = (kickoff?: string) => {
  if (!kickoff) return '';
  const d = new Date(kickoff);
  const hoy = new Date();
  const manana = new Date(hoy.getTime() + 864e5);
  const mismo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismo(d, hoy)) return 'Hoy';
  if (mismo(d, manana)) return 'Mañana';
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
};

const Escudo = ({ uri, size = 40, color }: { uri?: string | null; size?: number; color?: string | null }) => (
  <View
    style={[
      st.escudo,
      { width: size, height: size, borderRadius: size / 2 },
      color ? { borderColor: color } : null,
    ]}>
    {uri ? (
      <Image source={{ uri }} style={{ width: size - 8, height: size - 8 }} resizeMode="contain" />
    ) : (
      <Text style={st.escudoLetra}>
        {(color ?? '#').replace('#', '').slice(0, 2).toUpperCase()}
      </Text>
    )}
  </View>
);

/** Cuota y probabilidad. La probabilidad siempre, la cuota si existe. */
const Mercado = ({ f }: { f: AnalisisFila }) => {
  const p = Math.round((f.probModelo ?? 0) * 100);
  const margen = f.goles?.over?.margenPp ?? null;
  return (
    <View style={st.mercado}>
      <Text style={st.mercadoProb}>{p}%</Text>
      <Text style={st.mercadoLado} numberOfLines={1}>
        {f.ladoModelo}
      </Text>
      <Text style={st.mercadoCuota}>
        {f.cuotaMercado ? `@ ${f.cuotaMercado.toFixed(2)}` : 's/c'}
      </Text>
      {margen != null && (
        <Text style={[st.mercadoMargen, margen >= 0 ? st.verde : st.rojo]}>
          {margen >= 0 ? '+' : ''}
          {margen.toFixed(1)}pp
        </Text>
      )}
    </View>
  );
};

const Fila = ({ f, onPress }: { f: AnalisisFila; onPress: () => void }) => {
  const [, , local, visita] = f.partido.split(' vs ');
  return (
    <Pressable style={st.fila} onPress={onPress} android_ripple={{ color: palette.accentTint }}>
      <View style={st.equipos}>
        <View style={st.escudos}>
          <Escudo uri={f.escudoLocal} color={f.colorLocal} />
          <Text style={st.guion}>–</Text>
          <Escudo uri={f.escudoVisita} color={f.colorVisita} />
        </View>
        <View style={st.nombres}>
          <Text style={st.nombre} numberOfLines={1}>
            {local ?? f.partido}
          </Text>
          <Text style={st.nombre} numberOfLines={1}>
            {visita ?? ''}
          </Text>
        </View>
      </View>

      <View style={st.horaCol}>
        <Text style={st.hora}>{hora(f.kickoff)}</Text>
        <Text style={st.dia}>{dia(f.kickoff)}</Text>
      </View>

      <Mercado f={f} />
      <Text style={st.chevron}>›</Text>
    </Pressable>
  );
};

export default function PartidosScreen() {
  const insets = useSafeAreaInsets();
  const { data, loading } = useAnalisis(DEFAULTS);
  const [detalle, setDetalle] = React.useState<AnalisisFila | null>(null);

  const secciones = useMemo(() => {
    const porLiga = new Map<string, AnalisisFila[]>();
    for (const f of data) {
      const k = `${dia(f.kickoff)}|${f.liga}`;
      if (!porLiga.has(k)) porLiga.set(k, []);
      porLiga.get(k)!.push(f);
    }
    return [...porLiga.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, data]) => {
        const [d, liga] = k.split('|');
        return {
          title: d,
          subtitle: liga,
          data: data.sort(
            (x, y) => (x.kickoff ?? '').localeCompare(y.kickoff ?? '') || x.partido.localeCompare(y.partido),
          ),
        };
      });
  }, [data]);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.cabecera}>
        <Text style={st.titulo}>Partidos</Text>
        <Text style={st.subtitulo}>
          {loading ? 'Cargando…' : `${data.length} partidos · ${secciones.length} secciones`}
        </Text>
      </View>

      <SectionList
        sections={secciones}
        keyExtractor={f => f.partido + f.kickoff}
        renderSectionHeader={({ section }) => (
          <View style={st.seccion}>
            <Text style={st.seccionDia}>{section.title}</Text>
            <Text style={st.seccionLiga}>{section.subtitle}</Text>
          </View>
        )}
        renderItem={({ item }) => <Fila f={item} onPress={() => setDetalle(item)} />}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        ListEmptyComponent={
          <View style={st.vacio}>
            <Text style={st.vacioTexto}>Sin partidos disponibles</Text>
          </View>
        }
      />
      {detalle && (
        <DetalleModal fila={detalle} onCerrar={() => setDetalle(null)} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  cabecera: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  titulo: { color: palette.text, fontSize: fontSize.xxl, fontWeight: '800' },
  subtitulo: { color: palette.textMuted, fontSize: fontSize.sm, marginTop: 2 },

  seccion: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xs,
  },
  seccionDia: { color: palette.accent, fontSize: fontSize.md, fontWeight: '800' },
  seccionLiga: { color: palette.textMuted, fontSize: fontSize.sm, flex: 1 },

  fila: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: palette.surface, marginHorizontal: spacing.md,
    marginBottom: spacing.sm, borderRadius: radius.md,
    padding: spacing.sm, borderWidth: 1, borderColor: palette.surfaceAlt,
  },
  equipos: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  escudos: { flexDirection: 'row', alignItems: 'center' },
  guion: { color: palette.textMuted, fontSize: fontSize.sm, marginHorizontal: 4 },
  escudo: {
    backgroundColor: palette.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: palette.surfaceAlt,
  },
  escudoLetra: { color: palette.text, fontWeight: '800', fontSize: fontSize.sm },
  nombres: { flex: 1 },
  nombre: { color: palette.text, fontSize: fontSize.md, fontWeight: '600' },

  horaCol: { alignItems: 'center', width: 52, marginHorizontal: 4 },
  hora: { color: palette.text, fontSize: fontSize.md, fontWeight: '700' },
  dia: { color: palette.textMuted, fontSize: fontSize.xs },

  mercado: { alignItems: 'flex-end', minWidth: 68 },
  mercadoProb: { color: palette.accent, fontSize: fontSize.lg, fontWeight: '800' },
  mercadoLado: { color: palette.textMuted, fontSize: fontSize.xs, maxWidth: 78 },
  mercadoCuota: { color: palette.text, fontSize: fontSize.sm, fontWeight: '700' },
  mercadoMargen: { fontSize: fontSize.xs, fontWeight: '700' },
  verde: { color: palette.success },
  rojo: { color: palette.danger },

  chevron: { color: palette.textMuted, fontSize: fontSize.xl, marginLeft: 4 },

  vacio: { padding: spacing.xl, alignItems: 'center' },
  vacioTexto: { color: palette.textMuted, fontSize: fontSize.md },
});