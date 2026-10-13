import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';

import { palette, spacing, radius, fontSize } from '../theme';
import {
  leerMercado, limpiarCacheMercado,
  type LecturaMercado, type MercadoId, type Diagnostico,
} from '../data/mercadoRepository';

const MERCADOS: MercadoId[] = ['O/U 1.5', 'O/U 2.5', 'O/U 3.5'];

const colorDireccion = (d: Diagnostico['direccion']) =>
  d === 'hacia Over' ? palette.success : d === 'hacia Under' ? palette.danger : palette.textMuted;

const iconoVeredicto = (v: string) =>
  v === 'plano' ? '➖' : v === 'movimiento menor' || v === 'movido' ? '↗️' : '🔥';

/**
 * Cuadro para revisar un partido de OddsMath pegando su URL.
 *
 * Por que un cuadro y no una lista automatica: los partidos de la app
 * vienen de ESPN y OddsMath usa otro identificador. Pegar el enlace es
 * lo unico que asegura revisar EXACTAMENTE el partido pedido, sin
 * adivinar ni mapear una base de datos entera.
 *
 * El boton de limpiar cache existe porque la lectura se cachea en
 * memoria para no golpear el sitio: a los 10 minutos el mercado ya
 * cambio y hay que poder volver a pedirlo limpio.
 */
export const CuadroMercado = () => {
  const [url, setUrl] = useState('');
  const [mercado, setMercado] = useState<MercadoId>('O/U 2.5');
  const [datos, setDatos] = useState<LecturaMercado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = async (forzar: boolean) => {
    const u = url.trim();
    if (!u.includes('oddsmath.com')) {
      setError('Pega un enlace de partido de oddsmath.com');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      if (forzar) limpiarCacheMercado();
      const r = await leerMercado(u, mercado);
      setDatos(r);
      if (r.error) setError(r.error);
    } catch (e) {
      setError(`No se pudo leer: ${e instanceof Error ? e.message : String(e)}`);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  };

  const c = datos?.consenso;

  return (
    <View>
      <Text style={st.titulo}>Mercado (OddsMath)</Text>
      <Text style={st.nota}>
        Pega el enlace del partido para ver la línea y hacia dónde se está moviendo.
      </Text>

      <TextInput
        style={st.input}
        placeholder="https://www.oddsmath.com/football/..."
        placeholderTextColor={palette.textMuted}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />

      <View style={st.filaMercados}>
        {MERCADOS.map(m => (
          <Pressable
            key={m}
            onPress={() => setMercado(m)}
            style={[st.chip, mercado === m && st.chipActivo]}
          >
            <Text style={[st.chipTxt, mercado === m && st.chipTxtActivo]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <View style={st.filaBotones}>
        <Pressable style={[st.boton, st.botonPrimario]} onPress={() => buscar(false)} disabled={cargando}>
          <Text style={st.botonTxt}>{cargando ? 'Leyendo…' : 'Ver mercado'}</Text>
        </Pressable>
        <Pressable
          style={[st.boton, st.botonSec]}
          onPress={() => buscar(true)}
          disabled={cargando || !datos}
        >
          <Text style={st.botonSecTxt}>🗑 Limpiar caché y recargar</Text>
        </Pressable>
      </View>

      {cargando && <ActivityIndicator color={palette.accent} style={{ marginTop: spacing.sm }} />}

      {error && <Text style={st.error}>{error}</Text>}

      {c && (
        <View style={st.tarjeta}>
          <View style={st.cabecera}>
            <Text style={st.mercado}>{datos?.mercado}</Text>
            <Text style={[st.veredicto, { color: c.direccion === 'hacia Over' ? palette.success : c.direccion === 'hacia Under' ? palette.danger : palette.textMuted }]}>
              {iconoVeredicto(c.veredicto)} {c.direccion}
            </Text>
          </View>

          <View style={st.cifras}>
            <View style={st.cifra}>
              <Text style={st.cifraEt}>Goles esperados (mercado)</Text>
              <Text style={st.cifraVal}>{c.lambdaMercado ?? '—'}</Text>
              <Text style={st.cifraSub}>línea {datos?.lineaGol}</Text>
            </View>
            <View style={st.cifra}>
              <Text style={st.cifraEt}>P(Over) cierre</Text>
              <Text style={st.cifraVal}>{c.pOverCierre.toFixed(1)}%</Text>
              <Text style={st.cifraSub}>apertura {c.pOverApertura.toFixed(1)}%</Text>
            </View>
            <View style={st.cifra}>
              <Text style={st.cifraEt}>Movimiento</Text>
              <Text style={[st.cifraVal, { color: c.deltaPP >= 0 ? palette.success : palette.danger }]}>
                {c.deltaPP > 0 ? '+' : ''}{c.deltaPP.toFixed(1)} pp
              </Text>
              <Text style={st.cifraSub}>{c.nCasas} casas</Text>
            </View>
          </View>

          <Text style={st.subtitulo}>Por casa</Text>
          <View style={st.encabezado}>
            <Text style={[th, st.colCasa]}>Casa</Text>
            <Text style={[th, st.colPct]}>Over</Text>
            <Text style={[th, st.colPct]}>Goles</Text>
            <Text style={[th, st.colPct]}>24 h</Text>
          </View>
          {datos?.casas.map(k => (
            <View key={k.casa} style={st.filaCasa}>
              <Text style={st.colCasa} numberOfLines={1}>{k.casa}</Text>
              <Text style={st.colPct}>{k.pOverCierre.toFixed(0)}%</Text>
              <Text style={st.colPct}>{k.lambdaCierre ?? '—'}</Text>
              <Text style={[st.colPct, { color: colorDireccion(k.direccion) }]}>
                {k.delta24hPP > 0 ? '+' : ''}{k.delta24hPP.toFixed(1)}
              </Text>
            </View>
          ))}

          <Text style={st.aviso}>
            El movimiento por sí solo no es ventaja (medido: 1X2 51.8%, igual que la moneda).
            Esto sirve para ver qué está haciendo el mercado, no para apostar.
          </Text>
        </View>
      )}
    </View>
  );
};

const th = { color: palette.textMuted, fontSize: fontSize.xs, fontWeight: '700' } as const;

const st = StyleSheet.create({
  titulo: { color: palette.text, fontSize: fontSize.lg, fontWeight: '800', marginBottom: spacing.xs },
  nota: { color: palette.textMuted, fontSize: fontSize.sm, marginBottom: spacing.sm, lineHeight: 18 },
  subtitulo: { color: palette.text, fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: palette.text,
    padding: spacing.sm,
    fontSize: fontSize.sm,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  filaMercados: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm, borderWidth: 1, borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActivo: { backgroundColor: palette.accentTint, borderColor: palette.accent },
  chipTxt: { color: palette.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  chipTxtActivo: { color: palette.accent },
  filaBotones: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  boton: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  botonPrimario: { backgroundColor: palette.accent },
  botonSec: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  botonTxt: { color: palette.bg, fontWeight: '800', fontSize: fontSize.sm },
  botonSecTxt: { color: palette.text, fontWeight: '600', fontSize: fontSize.xs },
  error: { color: palette.danger, fontSize: fontSize.sm, marginTop: spacing.sm },
  tarjeta: {
    backgroundColor: palette.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: palette.border, padding: spacing.md, marginTop: spacing.md,
  },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  mercado: { color: palette.accent, fontSize: fontSize.md, fontWeight: '800' },
  veredicto: { fontSize: fontSize.sm, fontWeight: '800' },
  cifras: { flexDirection: 'row', gap: spacing.sm },
  cifra: { flex: 1, backgroundColor: palette.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm },
  cifraEt: { color: palette.textMuted, fontSize: 10, marginBottom: 2 },
  cifraVal: { color: palette.text, fontSize: fontSize.lg, fontWeight: '800' },
  cifraSub: { color: palette.textMuted, fontSize: 9 },
  encabezado: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: palette.border },
  filaCasa: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: palette.surfaceAlt },
  colCasa: { flex: 2, color: palette.text, fontSize: fontSize.xs },
  colPct: { flex: 1, color: palette.text, fontSize: fontSize.xs, textAlign: 'right' },
  aviso: { color: palette.textMuted, fontSize: 10, marginTop: spacing.md, lineHeight: 14 },
});