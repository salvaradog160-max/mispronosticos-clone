import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, radius, fontSize } from '../theme';
import { useAnalisis } from '../data/usePicks';
import type { AnalisisFila } from '../data/analisisRepository';
import DetalleModal from './DetalleModal';
import { DEFAULTS } from '../config';

/**
 * Pantalla de entrada: los partidos del dia.
 *
 * La app de referencia no abre con estadisticas globales, abre con la
 * lista de partidos. El objeto central es el PARTIDO, y lo primero que
 * se ve de el son los escudos. Por eso esta pantalla va antes que
 * cualquier tarjeta de resumen.
 */

const hhmm = (iso?: string | null) => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const diaRelativo = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 864e5);
  const manana = new Date(hoy.getTime() + 864e5);
  const mismo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismo(d, hoy)) return 'Hoy';
  if (mismo(d, manana)) return 'Manana';
  if (mismo(d, ayer)) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** El color de ESPN viene sin '#' (C8142F); sin el, RN lo ignora. */
const color = (c?: string | null) => (c ? (c.startsWith('#') ? c : `#${c}`) : null);

const Escudo = ({ uri, alt, size = 42 }: { uri?: string | null; alt: string; size?: number }) => {
  const [fallo, setFallo] = useState(false);
  const iniciales = alt
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();

  if (!uri || fallo) {
    return (
      <View style={[s.escudo, s.escudoVacio, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={s.escudoIniciales}>{iniciales || '?'}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => setFallo(true)}
    />
  );
};

/** Fecha y hora, o el marcador si el partido ya empezo. */
const Estado = ({ f }: { f: AnalisisFila }) => {
  const enVivo = f.estado === 'en vivo';
  const final = f.estado === 'finalizado';
  if ((enVivo || final) && f.marcador) {
    return (
      <View style={s.estadoCaja}>
        <Text style={[s.marcador, enVivo && { color: palette.danger }]}>{f.marcador}</Text>
        <Text style={[s.estadoTxt, enVivo && { color: palette.danger }]}>
          {enVivo ? 'EN VIVO' : 'FINAL'}
        </Text>
      </View>
    );
  }
  return (
    <View style={s.estadoCaja}>
      <Text style={s.hora}>{hhmm(f.kickoff)}</Text>
      <Text style={s.dia}>{diaRelativo(f.kickoff)}</Text>
    </View>
  );
};

/** Movimiento de linea: de donde salio a donde esta. */
const Movimiento = ({ f }: { f: AnalisisFila }) => {
  if (f.movimiento == null || f.cuotaApertura == null) return null;
  const sube = f.movimiento > 0;
  return (
    <View style={s.mov}>
      <Text style={s.movTexto}>
        {f.cuotaApertura.toFixed(2)} → {f.cuotaMercado.toFixed(2)}
      </Text>
      <Text style={[s.movPp, { color: sube ? palette.success : palette.danger }]}>
        {sube ? '+' : ''}
        {f.movimiento.toFixed(1)}pp
      </Text>
    </View>
  );
};

const Fila = ({ f, onPress }: { f: AnalisisFila; onPress: () => void }) => {
  const [local, visita] = f.partido.split(' vs ');
  const pct = Math.round((f.probModelo ?? 0) * 100);

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: palette.accentTint }}
      style={({ pressed }) => [s.fila, pressed && { opacity: 0.85 }]}>
      <View style={s.filaTop}>
        <View style={s.equipo}>
          <Escudo uri={f.escudoLocal} alt={local ?? ''} />
          <Text style={s.nombre} numberOfLines={1}>
            {local}
          </Text>
        </View>

        <Estado f={f} />

        <View style={[s.equipo, s.equipoDer]}>
          <Text style={[s.nombre, s.nombreDer]} numberOfLines={1}>
            {visita}
          </Text>
          <Escudo uri={f.escudoVisita} alt={visita ?? ''} />
        </View>
      </View>

      <View style={s.filaBottom}>
        <View style={s.pick}>
          <Text style={s.pickEtiqueta}>PICK</Text>
          <Text style={s.pickValor} numberOfLines={1}>
            {f.ladoModelo} · {pct}%
          </Text>
          <Text style={s.pickCuota}>@ {f.cuotaMercado?.toFixed(2) ?? '—'}</Text>
        </View>
        <Movimiento f={f} />
        <Text style={s.chevron}>›</Text>
      </View>

      {f.sede ? (
        <Text style={s.sede} numberOfLines={1}>
          {f.sede}
        </Text>
      ) : null}
    </Pressable>
  );
};

export default function PartidosScreen() {
  const insets = useSafeAreaInsets();
  const { data, loading, error } = useAnalisis(DEFAULTS);
  const [detalle, setDetalle] = useState<AnalisisFila | null>(null);

  const secciones = useMemo(() => {
    const mapa = new Map<string, AnalisisFila[]>();
    for (const f of data) {
      const k = f.liga || 'Sin liga';
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(f);
    }
    return [...mapa.entries()]
      .map(([liga, filas]) => ({
        title: liga,
        data: filas.sort(
          (a, b) => (a.kickoff ?? '').localeCompare(b.kickoff ?? '') || a.partido.localeCompare(b.partido),
        ),
      }))
      .sort((a, b) => b.data.length - a.data.length || a.title.localeCompare(b.title));
  }, [data]);

  if (loading) {
    return (
      <View style={[s.centro, { paddingTop: insets.top }]}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={s.cargando}>Cargando partidos…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <View style={[s.cabecera, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={s.titulo}>Partidos</Text>
        <Text style={s.sub}>
          {data.length} partidos · {secciones.length} ligas
          {error ? ' · sin conexion' : ''}
        </Text>
      </View>

      <SectionList
        sections={secciones}
        keyExtractor={f => `${f.partido}-${f.kickoff}`}
        renderSectionHeader={({ section }) => (
          <View style={s.seccion}>
            <Text style={s.seccionTitulo}>{section.title}</Text>
            <Text style={s.seccionConteo}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => <Fila f={item} onPress={() => setDetalle(item)} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={s.centro}>
            <Text style={s.cargando}>Sin partidos disponibles</Text>
          </View>
        }
      />

      <DetalleModal fila={detalle} onCerrar={() => setDetalle(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  cargando: { color: palette.textMuted, fontSize: fontSize.md },

  cabecera: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  titulo: { color: palette.text, fontSize: fontSize.xxl, fontWeight: '800' },
  sub: { color: palette.textMuted, fontSize: fontSize.sm, marginTop: 2 },

  seccion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  seccionTitulo: { color: palette.accent, fontSize: fontSize.md, fontWeight: '800' },
  seccionConteo: { color: palette.textMuted, fontSize: fontSize.sm },

  fila: {
    backgroundColor: palette.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.surfaceAlt,
  },
  filaTop: { flexDirection: 'row', alignItems: 'center' },
  equipo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  equipoDer: { justifyContent: 'flex-end' },
  nombre: { color: palette.text, fontSize: fontSize.sm, fontWeight: '700', flexShrink: 1 },
  nombreDer: { textAlign: 'right' },

  escudo: { backgroundColor: palette.surfaceAlt },
  escudoVacio: { alignItems: 'center', justifyContent: 'center' },
  escudoIniciales: { color: palette.textMuted, fontSize: fontSize.xs, fontWeight: '800' },

  estadoCaja: { alignItems: 'center', minWidth: 64, paddingHorizontal: spacing.xs },
  hora: { color: palette.text, fontSize: fontSize.md, fontWeight: '800' },
  dia: { color: palette.textMuted, fontSize: fontSize.xs },
  marcador: { color: palette.text, fontSize: fontSize.lg, fontWeight: '900' },
  estadoTxt: { color: palette.textMuted, fontSize: fontSize.xs, fontWeight: '700' },

  filaBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.surfaceAlt,
    gap: spacing.sm,
  },
  pick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pickEtiqueta: {
    color: palette.accent,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pickValor: { color: palette.text, fontSize: fontSize.sm, fontWeight: '600', flexShrink: 1 },
  pickCuota: { color: palette.textMuted, fontSize: fontSize.sm, fontWeight: '700' },

  mov: { alignItems: 'flex-end' },
  movTexto: { color: palette.textMuted, fontSize: fontSize.xs },
  movPp: { fontSize: fontSize.xs, fontWeight: '800' },

  chevron: { color: palette.textMuted, fontSize: fontSize.xl, marginLeft: spacing.xs },

  sede: { color: palette.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
});
