import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, radius, fontSize } from '../theme';
import { useAnalisis } from '../data/usePicks';
import { DEFAULTS } from '../config';

/**
 * Rendimiento: lo que el modelo acierta de verdad, sin adornos.
 *
 * La referencia tiene una pestana "Guardados" que ensena "tu
 * rendimiento" con % de efectividad. Aqui el concepto se mantiene pero
 * con datos reales medidos, no con la cuenta del usuario (que no
 * existe). La regla es: si el numero no invita a apostar, se dice.
 */

const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export default function RendimientoScreen() {
  const insets = useSafeAreaInsets();
  const { stats, data } = useAnalisis(DEFAULTS);

  const hoy = useMemo(() => {
    const pendientes = data.filter(f => !f.resultado);
    const conRes = data.filter(f => f.resultado);
    const aciertos = conRes.filter(f => f.resultado === 'acierto').length;
    const fallos = conRes.filter(f => f.resultado === 'fallo').length;
    const empates = conRes.filter(f => f.resultado === 'empate').length;
    return { pendientes: pendientes.length, resueltos: conRes.length, aciertos, fallos, empates };
  }, [data]);

  const consensoAcierto = stats?.consensoAcierto ?? null;
  const consensoN = stats?.consensoN ?? null;

  const roi = stats?.margenCasa ?? null;
  const roiN = stats?.margenCasaN ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 40 }}>
      <Text style={s.titulo}>Rendimiento</Text>
      <Text style={s.sub}>Lo que el modelo hace de verdad, medido. No promesas.</Text>

      {/* Consenso */}
      <View style={s.tarjeta}>
        <Text style={s.tarjetaLabel}>ACUERDO MERCADO + MODELO · ACIERTO MEDIDO</Text>
        {consensoAcierto != null ? (
          <>
            <Text style={s.numGrande}>{Math.round(consensoAcierto * 1000) / 10}%</Text>
            <Text style={s.tarjetaNota}>
              sobre {consensoN?.toLocaleString('es-MX') ?? '?'} partidos de consenso
            </Text>
            <Text style={s.mal}>
              Acierta a poco más de la mitad, y una moneda acierta el 50%. No hay ventaja demostrada.
            </Text>
          </>
        ) : (
          <Text style={s.tarjetaNota}>Sin datos de consenso aún.</Text>
        )}
      </View>

      {/* ROI / margen casa */}
      <View style={s.tarjeta}>
        <Text style={s.tarjetaLabel}>ROI DE APOSTAR LOS PICKS DE CONSENSO</Text>
        {roi != null ? (
          <>
            <Text style={[s.numGrande, { color: roi >= 0 ? palette.success : palette.danger }]}>
              {(roi * 100).toFixed(2)}%
            </Text>
            <Text style={s.tarjetaNota}>sobre {roiN?.toLocaleString('es-MX') ?? '?'} picks</Text>
            <Text style={s.mal}>
              Negativo: cuesta dinero. Esto es el margen real de la casa, no un número fijo en el código.
            </Text>
          </>
        ) : (
          <Text style={s.tarjetaNota}>Sin backtest cargado.</Text>
        )}
      </View>

      {/* Hoy */}
      <View style={s.tarjeta}>
        <Text style={s.tarjetaLabel}>PARTIDOS DE HOY (DÍA DE HOY)</Text>
        <View style={s.hoyFilas}>
          <Text style={s.hoyNum}>{hoy.pendientes}</Text>
          <Text style={s.hoyEt}>pendientes</Text>
          <Text style={[s.hoyNum, { color: palette.success }]}>{hoy.aciertos}</Text>
          <Text style={s.hoyEt}>aciertos</Text>
          <Text style={[s.hoyNum, { color: palette.danger }]}>{hoy.fallos}</Text>
          <Text style={s.hoyEt}>fallos</Text>
          <Text style={[s.hoyNum, { color: palette.textMuted }]}>{hoy.empates}</Text>
          <Text style={s.hoyEt}>empates</Text>
        </View>
        <Text style={s.tarjetaNota}>
          {hoy.resueltos} de {hoy.resueltos + hoy.pendientes} con resultado. El marcador se
          resuelve solo cuando el partido termina.
        </Text>
      </View>

      {/* Semana */}
      <View style={s.tarjeta}>
        <Text style={s.tarjetaLabel}>HISTÓRICO DEL MODELO (BACKTEST)</Text>
        <Text style={s.tarjetaNota}>
          Calibrado sobre {stats?.partidosHistorico?.toLocaleString('es-MX') ?? '?'} partidos en{' '}
          {stats?.ligas ?? '?'} ligas.
        </Text>
        <Text style={s.diasTitulo}>Barras por día (no disponibles)</Text>
        <View style={s.dias}>
          {DIAS.map(d => (
            <View key={d} style={s.diaCaja}>
              <Text style={s.diaLetra}>{d}</Text>
              <View style={s.diaBarra}>
                <View style={s.diaBarraVacia} />
              </View>
            </View>
          ))}
        </View>
        <Text style={s.mal}>
          El payload del día no trae el desglose por día de la semana todavía. No se dibujan
          barras con ceros para que parezcan datos.
        </Text>
      </View>

      <Text style={s.pie}>
        Todo lo de esta pantalla viene de mediciones (estadisticas del payload y resultados
        resueltos), no de estimaciones. Si los números fueran buenos, lo dirían; no lo son.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  titulo: { color: palette.text, fontSize: fontSize.xxl, fontWeight: '800' },
  sub: { color: palette.textMuted, fontSize: fontSize.sm, marginTop: 2, marginBottom: spacing.lg },

  tarjeta: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.surfaceAlt,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  tarjetaLabel: {
    color: palette.accent,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  numGrande: { color: palette.text, fontSize: fontSize.xxl, fontWeight: '900' },
  tarjetaNota: { color: palette.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  mal: { color: palette.danger, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
  bien: { color: palette.success, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },

  hoyFilas: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap' },
  hoyNum: { color: palette.text, fontSize: fontSize.xl, fontWeight: '800' },
  hoyEt: { color: palette.textMuted, fontSize: fontSize.sm, marginRight: spacing.sm },

  diasTitulo: { color: palette.text, fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.md },
  dias: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  diaCaja: { alignItems: 'center', gap: 4, flex: 1 },
  diaLetra: { color: palette.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  diaBarra: { height: 32, width: 10, borderRadius: 4, backgroundColor: palette.surfaceAlt, justifyContent: 'flex-end', overflow: 'hidden' },
  diaBarraVacia: { height: 2, backgroundColor: palette.surfaceAlt },

  pie: {
    color: palette.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },
});