import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { AnalisisFila, LadoGoles } from '../data/analisisRepository';
import { palette, radius, spacing, fontSize } from '../theme';

/** Hora local del partido: "sáb 12 oct, 16:30". */
export const formatKickoff = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Cuanto falta para que empiece. */
export const tiempoPara = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.round((t - Date.now()) / 60000);
  if (mins < 0) return null;
  if (mins < 60) return `en ${mins} min`;
  const horas = Math.round(mins / 60);
  if (horas < 24) return `en ${horas} h`;
  return `en ${Math.round(horas / 24)} d`;
};

/**
 * Una fila de Over/Under.
 *
 * El problema que resuelve: antes la app imprimía "Línea de goles 2.5 ·
 * más 1.67" y no se sabía si había que jugar Over o Under, ni si ese
 * 1.67 era el del over o el del under. Aquí el lado va escrito, con su
 * cuota y las dos probabilidades.
 *
 * OJO con el texto: dice "a favor/en contra DEL MERCADO", no "gana".
 * `margenPp` es modelo menos mercado. Un modelo ingenuo (50/50) contra
 * un mercado cargado sale con margenes enormes y aun asi el backtest da
 * ROI -4.6%: discrepancia no es rentabilidad. Que se lea como texto
 * gris de analisis, no como una senal para apostar.
 */
export function LadoGolesFila({
  lado,
  compacto = false,
}: {
  lado: LadoGoles;
  compacto?: boolean;
}) {
  const margen = lado.margenPp;
  const aFavor = (margen ?? 0) >= 0;
  const flecha = lado.lado === 'Over' ? '⬆' : '⬇';
  const conMargen = margen !== null;

  return (
    <View style={[s.lado, compacto ? s.ladoCompacto : null]}>
      <View style={s.ladoFila1}>
        <Text style={[s.ladoNombre, aFavor ? s.nombreBien : s.nombreMal]}>
          {lado.lado} {flecha}
        </Text>
        <Text style={s.ladoCuota}>@ {lado.cuota.toFixed(2)}</Text>
      </View>

      <View style={s.barraWrap}>
        <View style={[s.barra, { width: `${Math.max(4, lado.probMercadoPct)}%` }]} />
      </View>

      <Text style={s.ladoTexto}>
        mercado {lado.probMercadoPct.toFixed(1)}%
        {lado.probModelo !== null ? `  ·  modelo ${lado.probModelo.toFixed(1)}%` : ''}
      </Text>
      {conMargen ? (
        <Text style={[s.ladoMargen, aFavor ? s.margenBien : s.margenMal]}>
          {aFavor ? '+' : ''}
          {margen} pp {aFavor ? 'a favor' : 'en contra'} del mercado
        </Text>
      ) : null}
    </View>
  );
}

/** Etiqueta de estado, con el marcador si el partido ya se jugó. */
export function EstadoBadge({ fila }: { fila: AnalisisFila }) {
  if (fila.estado === 'finalizado') {
    const ok = fila.resultado === 'acierto';
    const mal = fila.resultado === 'fallo';
    const texto = `Finalizado ${fila.marcador ?? ''}`.trim() +
      (ok ? ' · acertó el mercado' : mal ? ' · no acertó' : '');
    return (
      <View style={[s.badge, ok ? s.bOk : mal ? s.bMal : s.bNeutro]}>
        <Text style={[s.bTxt, ok ? s.tOk : mal ? s.tMal : s.tNeutro]}>{texto}</Text>
      </View>
    );
  }
  if (fila.estado === 'en vivo') {
    return (
      <View style={[s.badge, s.bVivo]}>
        <Text style={[s.bTxt, s.tVivo]}>● EN VIVO</Text>
      </View>
    );
  }
  return null;
}

const s = StyleSheet.create({
  lado: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    marginTop: 6,
  },
  ladoCompacto: { paddingVertical: 5, marginTop: 5 },
  ladoFila1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ladoNombre: { fontSize: fontSize.md, fontWeight: '800' },
  nombreBien: { color: palette.accent },
  nombreMal: { color: palette.textMuted },
  ladoCuota: { color: palette.blue, fontSize: fontSize.md, fontWeight: '800' },
  barraWrap: {
    height: 5,
    backgroundColor: palette.border,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  barra: { height: 5, backgroundColor: palette.blue },
  ladoTexto: { color: palette.textMuted, fontSize: fontSize.sm, marginTop: 5 },
  ladoMargen: { fontSize: fontSize.sm, marginTop: 2, fontWeight: '700' },
  margenBien: { color: palette.accent },
  margenMal: { color: palette.danger },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: 5,
  },
  bOk: { backgroundColor: 'rgba(74,222,128,0.15)' },
  bMal: { backgroundColor: 'rgba(239,68,68,0.15)' },
  bNeutro: { backgroundColor: palette.surfaceAlt },
  bVivo: { backgroundColor: 'rgba(239,68,68,0.22)' },
  bTxt: { fontSize: fontSize.sm, fontWeight: '700' },
  tOk: { color: palette.success },
  tMal: { color: palette.danger },
  tNeutro: { color: palette.textMuted },
  tVivo: { color: palette.danger },
});