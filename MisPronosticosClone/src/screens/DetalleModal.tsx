import React from 'react';
import { Modal, ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import type { AnalisisFila } from '../data/analisisRepository';
import { palette, radius, spacing, fontSize } from '../theme';
import { LadoGolesFila, EstadoBadge, formatKickoff, tiempoPara } from '../components/PartidoDetalle';

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;

const Fila = ({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) => (
  <View style={s.fila}>
    <Text style={s.filaEt}>{etiqueta}</Text>
    <Text style={[s.filaVal, color ? { color } : null]}>{valor}</Text>
  </View>
);

/**
 * Detalle completo de un partido.
 *
 * Antes al tocar una tarjeta no pasaba nada. Aqui esta todo: los tres
 * mercados (1X2, Over/Under) con cuota de mercado y probabilidad del
 * modelo, los goles esperados, el precio al que volveria a valer, y el
 * resultado si el partido ya se jugo.
 */
export default function DetalleModal({
  fila,
  onCerrar,
}: {
  fila: AnalisisFila | null;
  onCerrar: () => void;
}) {
  return (
    <Modal visible={!!fila} animationType="slide" transparent onRequestClose={onCerrar}>
      <View style={s.fondo}>
        <Pressable style={s.tapa} onPress={onCerrar} />
        <View style={s.hoja}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {fila ? (
              <>
                <View style={s.cabecera}>
                  <Text style={s.titulo}>{fila.partido}</Text>
                  <Text style={s.liga}>
                    {fila.liga} · {formatKickoff(fila.kickoff)}
                    {tiempoPara(fila.kickoff) ? ` · ${tiempoPara(fila.kickoff)}` : ''}
                  </Text>
                  <EstadoBadge fila={fila} />
                </View>

                <Text style={s.seccion}>MERCADO 1X2 — QUIEN GANA</Text>
                <Fila etiqueta="El mercado ve" valor={`${fila.ladoMercado}  ${pct(fila.probMercado)}`} />
                <Fila
                  etiqueta="Cuota"
                  valor={
                    fila.cuotaApertura != null
                      ? `${fila.cuotaApertura.toFixed(2)} → ${fila.cuotaMercado.toFixed(2)}`
                      : fila.cuotaMercado.toFixed(2)
                  }
                  color={palette.blue}
                />
                <Fila etiqueta="El modelo ve" valor={`${fila.ladoModelo}  ${pct(fila.probModelo)}`} />
                <Fila
                  etiqueta="Movimiento de la línea"
                  valor={fila.movimiento === null ? '—' : `${fila.movimiento > 0 ? '+' : ''}${fila.movimiento} pp`}
                  color={Math.abs(fila.movimiento ?? 0) >= 3 ? palette.star : palette.textMuted}
                />
                {fila.cambioFavorito ? (
                  <Text style={s.aviso}>El favorito cambió desde la apertura.</Text>
                ) : null}

                {fila.goles ? (
                  <>
                    <Text style={s.seccion}>MERCADO DE GOLES — LÍNEA {fila.goles.linea}</Text>
                    <LadoGolesFila lado={fila.goles.over} />
                    <LadoGolesFila lado={fila.goles.under} />
                  </>
                ) : (
                  <Text style={s.aviso}>Este partido no tiene mercado de goles con cuota.</Text>
                )}

                {fila.lambdaHome != null && fila.lambdaAway != null ? (
                  <>
                    <Text style={s.seccion}>GOLES ESPERADOS (MODELO)</Text>
                    <Fila etiqueta="Local" valor={fila.lambdaHome.toFixed(2)} />
                    <Fila etiqueta="Visitante" valor={fila.lambdaAway.toFixed(2)} />
                    <Fila
                      etiqueta="Total"
                      valor={(fila.lambdaHome + fila.lambdaAway).toFixed(2)}
                    />
                  </>
                ) : null}

                {fila.goodToLine ? (
                  <>
                    <Text style={s.seccion}>A QUÉ PRECIO VALERÍA</Text>
                    {fila.goodToLine.ejecutable ? (
                      <Text style={s.bien}>
                        Cumple el margen a cuota {fila.goodToLine.cuotaActual.toFixed(2)}
                      </Text>
                    ) : fila.goodToLine.inalcanzable ? (
                      <Text style={s.mal}>Sin buen precio posible a este nivel de acierto.</Text>
                    ) : (
                      <Text style={s.aviso}>
                        Vuelve a valer si la cuota llega a{' '}
                        {fila.goodToLine.cuotaNecesaria?.toFixed(2)} (ahora{' '}
                        {fila.goodToLine.cuotaActual.toFixed(2)}).
                      </Text>
                    )}
                  </>
                ) : null}

                <View style={s.pie}>
                  <Text style={s.pieTxt}>
                    Calendación con {fila.calibracion === 'propia' ? 'cuotas propias' : 'cuotas heredadas'}.
                    No es recomendación de apuesta.
                  </Text>
                </View>
              </>
            ) : null}
          </ScrollView>

          <Pressable style={s.cerrar} onPress={onCerrar}>
            <Text style={s.cerrarTxt}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.overlay },
  tapa: { flex: 1 },
  hoja: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
    padding: spacing.lg,
  },
  cabecera: { marginBottom: spacing.md },
  titulo: { color: palette.text, fontSize: fontSize.xl, fontWeight: '800' },
  liga: { color: palette.textMuted, fontSize: fontSize.md, marginTop: 4 },
  seccion: {
    color: palette.accent,
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: 6,
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  filaEt: { color: palette.textMuted, fontSize: fontSize.md, flex: 1 },
  filaVal: { color: palette.text, fontSize: fontSize.md, fontWeight: '700' },
  aviso: { color: palette.star, fontSize: fontSize.md, marginTop: 6, lineHeight: 21 },
  bien: { color: palette.accent, fontSize: fontSize.md, fontWeight: '700', lineHeight: 21 },
  mal: { color: palette.danger, fontSize: fontSize.md, fontWeight: '700', lineHeight: 21 },
  pie: { marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.border },
  pieTxt: { color: palette.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  cerrar: {
    marginTop: spacing.lg,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cerrarTxt: { color: palette.text, fontSize: fontSize.md, fontWeight: '700' },
});