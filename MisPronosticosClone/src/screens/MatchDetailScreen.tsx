import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, radius, fontSize } from '../theme';
import { LadoGolesFila, formatKickoff, tiempoPara } from '../components/PartidoDetalle';
import type { AnalisisFila, TablaLiga, FilaTabla } from '../data/analisisRepository';

/**
 * Detalle del partido con pestanas, como la app de referencia.
 *
 * La referencia organiza el detalle en Análisis AI / IA en vivo / H2H /
 * Posiciones. Aqui se respeta esa estructura, pero cada pestana ensena
 * SOLO lo que hay. Las que no tienen dato lo dicen; no se rellenan con
 * texto de relleno que parezca informacion.
 */

type Pestana = 'analisis' | 'vivo' | 'h2h' | 'posiciones';

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'analisis', label: 'Análisis AI' },
  { id: 'vivo', label: 'IA en vivo' },
  { id: 'h2h', label: 'H2H' },
  { id: 'posiciones', label: 'Posiciones' },
];

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;

const pct0 = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${Math.round((v * 100))}%`;

const Signo = ({ v, sufijo = 'pp' }: { v: number | null | undefined; sufijo?: string }) =>
  v === null || v === undefined ? (
    <Text style={s.valor}>—</Text>
  ) : (
    <Text style={[s.valor, { color: v >= 0 ? palette.success : palette.danger }]}>
      {v > 0 ? '+' : ''}
      {v.toFixed(1)}
      {sufijo}
    </Text>
  );

const Fila = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
  <View style={s.fila}>
    <Text style={s.filaEt}>{etiqueta}</Text>
    {children}
  </View>
);

const color = (c?: string | null) => (c ? (c.startsWith('#') ? c : `#${c}`) : null);

const Escudo = ({ uri, alt, size = 56 }: { uri?: string | null; alt: string; size?: number }) => {
  const [fallo, setFallo] = useState(false);
  const ini = alt
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
  if (!uri || fallo) {
    return (
      <View style={[s.escudoVacio, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={s.escudoIni}>{ini || '?'}</Text>
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

/** Primera letra del equipo, para resaltar las dos filas de la tabla. */
const esDelPartido = (equipo: string, local: string, visita: string) => {
  const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const e = n(equipo);
  return e === n(local) || e === n(visita) || e.includes(n(local).slice(0, 8)) || e.includes(n(visita).slice(0, 8));
};

function Tabla({ tabla, local, visita }: { tabla: TablaLiga; local: string; visita: string }) {
  return (
    <View>
      {tabla.grupos.map((g, gi) => (
        <View key={gi} style={{ marginBottom: spacing.lg }}>
          <Text style={s.grupo}>{g.nombre ?? tabla.ligaNombre}</Text>
          <View style={s.tablaCab}>
            <Text style={[s.tablaCel, s.colPos]}>#</Text>
            <Text style={[s.tablaCel, s.colEq]}>EQUIPO</Text>
            <Text style={[s.tablaCel, s.colNum]}>PTS</Text>
            <Text style={[s.tablaCel, s.colNum]}>PJ</Text>
            <Text style={[s.tablaCel, s.colNum]}>G</Text>
            <Text style={[s.tablaCel, s.colNum]}>E</Text>
            <Text style={[s.tablaCel, s.colNum]}>P</Text>
          </View>
          {g.equipos.map(e => {
            const es = esDelPartido(e.equipo, local, visita);
            return (
              <View key={e.equipo} style={[s.tablaFila, es && s.tablaFilaSel]}>
                <Text style={[s.tablaCel, s.colPos, es && s.tablaSel]}>{e.posicion}</Text>
                <View style={[s.colEq, s.eqCaja]}>
                  {e.escudo ? (
                    <Image source={{ uri: e.escudo }} style={s.eqEscudo} resizeMode="contain" />
                  ) : null}
                  <Text style={[s.tablaCel, s.eqNombre, es && s.tablaSel]} numberOfLines={1}>
                    {e.equipo}
                  </Text>
                </View>
                <Text style={[s.tablaCel, s.colNum, s.tablaSel]}>{e.puntos}</Text>
                <Text style={[s.tablaCel, s.colNum]}>{e.pj}</Text>
                <Text style={[s.tablaCel, s.colNum]}>{e.ganados}</Text>
                <Text style={[s.tablaCel, s.colNum]}>{e.empatados}</Text>
                <Text style={[s.tablaCel, s.colNum]}>{e.perdidos}</Text>
              </View>
            );
          })}
        </View>
      ))}
      <Text style={s.leyenda}>PTS puntos · PJ jugados · G ganados · E empatados · P perdidos</Text>
    </View>
  );
}

export default function MatchDetailScreen({
  fila,
  tabla,
  onCerrar,
}: {
  fila: AnalisisFila | null;
  tabla?: TablaLiga | null;
  onCerrar: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pestana, setPestana] = useState<Pestana>('analisis');
  if (!fila) return null;

  const [local, visita] = fila.partido.split(' vs ');
  const enVivo = fila.estado === 'en vivo';
  const final = fila.estado === 'finalizado';
  const g = fila.goles;

  return (
    <Modal visible animationType="slide" onRequestClose={onCerrar}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Cabecera */}
        <View style={s.cabecera}>
          <Pressable onPress={onCerrar} style={s.cerrar} hitSlop={12}>
            <Text style={s.cerrarTxt}>‹</Text>
          </Pressable>
          <Text style={s.cabTitulo} numberOfLines={1}>
            {fila.liga}
          </Text>
          <View style={s.cerrar} />
        </View>

        {/* Hero del partido */}
        <View style={s.hero}>
          <View style={s.heroEq}>
            <Escudo uri={fila.escudoLocal} alt={local ?? ''} />
            <Text style={s.heroNombre} numberOfLines={2}>
              {local}
            </Text>
          </View>

          <View style={s.heroCentro}>
            {fila.marcador ? (
              <Text style={[s.heroMarcador, enVivo && { color: palette.danger }]}>
                {fila.marcador}
              </Text>
            ) : (
              <Text style={s.heroHora}>{formatKickoff(fila.kickoff)}</Text>
            )}
            {enVivo && <Text style={s.enVivo}>EN VIVO</Text>}
            {final && <Text style={s.final}>FINAL</Text>}
            {!enVivo && !final && (
              <Text style={s.heroTiempo}>{tiempoPara(fila.kickoff) ?? ''}</Text>
            )}
          </View>

          <View style={s.heroEq}>
            <Escudo uri={fila.escudoVisita} alt={visita ?? ''} />
            <Text style={[s.heroNombre, { textAlign: 'right' }]} numberOfLines={2}>
              {visita}
            </Text>
          </View>
        </View>

        {fila.sede ? <Text style={s.sede}>📍 {fila.sede}</Text> : null}

        {/* Pestanas */}
        <View style={s.tabs}>
          {PESTANAS.map(p => (
            <Pressable
              key={p.id}
              onPress={() => setPestana(p.id)}
              style={[s.tab, pestana === p.id && s.tabActiva]}>
              <Text style={[s.tabTxt, pestana === p.id && s.tabTxtActiva]} numberOfLines={1}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={s.cuerpo}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 40 }}>
          {pestana === 'analisis' && (
            <>
              <Text style={s.seccion}>MERCADO 1X2 — QUIÉN GANA</Text>
              <Fila etiqueta="Dice el mercado">
                <Text style={s.valor} numberOfLines={1}>
                  {fila.ladoMercado} · {pct0(fila.probMercado)}
                </Text>
              </Fila>
              <Fila etiqueta="Dice el modelo">
                <Text style={s.valor} numberOfLines={1}>
                  {fila.ladoModelo} · {pct0(fila.probModelo)}
                </Text>
              </Fila>
              <Fila etiqueta="Coinciden">
                <Text style={[s.valor, { color: fila.coincide ? palette.success : palette.star }]}>
                  {fila.coincide ? 'Sí' : 'No'}
                </Text>
              </Fila>
              <Fila etiqueta="Cuota apertura → actual">
                <Text style={s.valor}>
                  {fila.cuotaApertura != null ? fila.cuotaApertura.toFixed(2) : '—'} →{' '}
                  {fila.cuotaMercado != null ? fila.cuotaMercado.toFixed(2) : '—'}
                </Text>
              </Fila>
              <Fila etiqueta="Movimiento de línea">
                <Signo v={fila.movimiento} />
              </Fila>
              {fila.cambioFavorito && <Text style={s.aviso}>El favorito cambió desde la apertura.</Text>}

              {g ? (
                <>
                  <Text style={s.seccion}>MERCADO DE GOLES — LÍNEA {g.linea}</Text>
                  <LadoGolesFila lado={g.over} />
                  <LadoGolesFila lado={g.under} />
                  {g.overround != null && (
                    <Text style={s.aviso}>
                      El mercado suma {(g.overround * 100).toFixed(1)}%: el {(100 * (g.overround - 1)).toFixed(1)}% es
                      margen de la casa.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={s.aviso}>Este partido no tiene mercado de goles con cuota.</Text>
              )}

              {(fila.lambdaHome != null || fila.lambdaAway != null) && (
                <>
                  <Text style={s.seccion}>GOLES ESPERADOS (MODELO)</Text>
                  <Fila etiqueta={local ?? 'Local'}>
                    <Text style={s.valor}>
                      {fila.lambdaHome != null ? fila.lambdaHome.toFixed(2) : '—'}
                    </Text>
                  </Fila>
                  <Fila etiqueta={visita ?? 'Visita'}>
                    <Text style={s.valor}>
                      {fila.lambdaAway != null ? fila.lambdaAway.toFixed(2) : '—'}
                    </Text>
                  </Fila>
                </>
              )}

              {fila.ladder && (
                <>
                  <Text style={s.seccion}>CUOTA JUSTA DEL MODELO POR MERCADO</Text>
                  <Text style={s.aviso}>
                    Es lo que la estadística del modelo diría que debería pagar (1 ÷ probabilidad). No es la cuota de
                    tu casa: si tu casa paga más, hay valor según el modelo.
                  </Text>

                  <Text style={s.subEtiqueta}>1X2</Text>
                  <Fila etiqueta={`Gana ${local ?? 'Local'}`}>
                    <Text style={s.valor} numberOfLines={1}>
                      {pct0(fila.ladder.oneXTwo.local.p)} · @{' '}
                      {fila.ladder.oneXTwo.local.cuotaJusta?.toFixed(2) ?? '—'}
                    </Text>
                  </Fila>
                  <Fila etiqueta="Empate">
                    <Text style={s.valor} numberOfLines={1}>
                      {pct0(fila.ladder.oneXTwo.empate.p)} · @{' '}
                      {fila.ladder.oneXTwo.empate.cuotaJusta?.toFixed(2) ?? '—'}
                    </Text>
                  </Fila>
                  <Fila etiqueta={`Gana ${visita ?? 'Visita'}`}>
                    <Text style={s.valor} numberOfLines={1}>
                      {pct0(fila.ladder.oneXTwo.visita.p)} · @{' '}
                      {fila.ladder.oneXTwo.visita.cuotaJusta?.toFixed(2) ?? '—'}
                    </Text>
                  </Fila>

                  <Text style={s.subEtiqueta}>Over / Under (goles)</Text>
                  {fila.ladder.overUnder.map(f => (
                    <Fila etiqueta={`${f.linea} goles`} key={f.linea}>
                      <Text style={s.valor} numberOfLines={1}>
                        O@{f.over.cuotaJusta?.toFixed(2) ?? '—'} · U@
                        {f.under.cuotaJusta?.toFixed(2) ?? '—'}
                      </Text>
                    </Fila>
                  ))}

                  <Text style={s.subEtiqueta}>Ambos anotan</Text>
                  <Fila etiqueta="Sí">
                    <Text style={s.valor} numberOfLines={1}>
                      {pct0(fila.ladder.ambosAnotan.si.p)} · @{' '}
                      {fila.ladder.ambosAnotan.si.cuotaJusta?.toFixed(2) ?? '—'}
                    </Text>
                  </Fila>
                  <Fila etiqueta="No">
                    <Text style={s.valor} numberOfLines={1}>
                      {pct0(fila.ladder.ambosAnotan.no.p)} · @{' '}
                      {fila.ladder.ambosAnotan.no.cuotaJusta?.toFixed(2) ?? '—'}
                    </Text>
                  </Fila>

                  <Text style={s.subEtiqueta}>Marcadores más probables</Text>
                  {fila.ladder.marcadores.map(m => (
                    <Fila etiqueta={m.marcador} key={m.marcador}>
                      <Text style={s.valor} numberOfLines={1}>
                        {pct0(m.p)} · @{m.cuotaJusta?.toFixed(2) ?? '—'}
                      </Text>
                    </Fila>
                  ))}
                </>
              )}

              {fila.goodToLine && (
                <>
                  <Text style={s.seccion}>A QUÉ PRECIO VALDRÍA</Text>
                  {fila.goodToLine.ejecutable ? (
                    <Text style={s.bien}>
                      Ejecutable a {fila.goodToLine.cuotaActual?.toFixed(2) ?? '—'}.
                    </Text>
                  ) : fila.goodToLine.inalcanzable ? (
                    <Text style={s.mal}>Sin buen precio posible a este nivel de acierto.</Text>
                  ) : (
                    <Text style={s.aviso}>
                      Necesitaría cuota {fila.goodToLine.cuotaNecesaria?.toFixed(2) ?? '—'} y está a{' '}
                      {fila.goodToLine.cuotaActual?.toFixed(2) ?? '—'}.
                    </Text>
                  )}
                </>
              )}

              <Text style={s.pie}>
                El modelo no decide si apostar. Enseña mercado, modelo y movimiento para que decidas tú.
              </Text>
            </>
          )}

          {pestana === 'vivo' && (
            <>
              <Text style={s.seccion}>ESTADO DEL PARTIDO</Text>
              {enVivo || final ? (
                <>
                  <Fila etiqueta="Marcador">
                    <Text style={[s.valor, enVivo && { color: palette.danger }]}>
                      {fila.marcador ?? '—'}
                    </Text>
                  </Fila>
                  <Fila etiqueta="Estado">
                    <Text style={s.valor}>{enVivo ? 'En vivo' : 'Finalizado'}</Text>
                  </Fila>
                </>
              ) : (
                <Text style={s.aviso}>
                  El partido no ha empezado. Aquí aparecerá el marcador cuando ruede el balón.
                </Text>
              )}
              <Text style={s.pie}>
                Lectura en vivo del modelo sobre el estado del partido. Se alimenta del mismo dato que el resto de la
                app.
              </Text>
            </>
          )}

          {pestana === 'h2h' && (
            <>
              <Text style={s.seccion}>ENFRENTAMIENTOS DIRECTOS</Text>
              <Text style={s.aviso}>
                Sin historial de enfrentamientos para este partido.
              </Text>
              <Text style={s.pie}>
                La fuente de cuotas actual no publica el historial de enfrentamientos. No se rellena con datos
                inventados: la pestaña queda vacía hasta que haya una fuente real.
              </Text>
            </>
          )}

          {pestana === 'posiciones' && (
            <>
              {tabla ? (
                <Tabla tabla={tabla} local={local ?? ''} visita={visita ?? ''} />
              ) : (
                <>
                  <Text style={s.seccion}>TABLA DE POSICIONES</Text>
                  <Text style={s.aviso}>
                    Sin tabla disponible para {fila.liga}.
                  </Text>
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },

  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cerrar: { width: 40, alignItems: 'flex-start' },
  cerrarTxt: { color: palette.accent, fontSize: 34, lineHeight: 34, fontWeight: '300' },
  cabTitulo: { flex: 1, color: palette.textMuted, fontSize: fontSize.sm, textAlign: 'center' },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  heroEq: { flex: 1, alignItems: 'center', gap: spacing.sm },
  heroNombre: { color: palette.text, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' },
  heroCentro: { alignItems: 'center', paddingHorizontal: spacing.sm, minWidth: 92 },
  heroMarcador: { color: palette.text, fontSize: 34, fontWeight: '900' },
  heroHora: { color: palette.text, fontSize: fontSize.lg, fontWeight: '800' },
  heroTiempo: { color: palette.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  enVivo: { color: palette.danger, fontSize: fontSize.xs, fontWeight: '900', marginTop: 2 },
  final: { color: palette.textMuted, fontSize: fontSize.xs, fontWeight: '800', marginTop: 2 },

  sede: {
    color: palette.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },

  escudoVacio: { backgroundColor: palette.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  escudoIni: { color: palette.textMuted, fontSize: fontSize.md, fontWeight: '800' },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: palette.surfaceAlt,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActiva: { borderBottomColor: palette.accent },
  tabTxt: { color: palette.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  tabTxtActiva: { color: palette.accent },

  cuerpo: { flex: 1 },
  seccion: {
    color: palette.accent,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subEtiqueta: {
    color: palette.star,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.surfaceAlt,
  },
  filaEt: { color: palette.textMuted, fontSize: fontSize.sm, flexShrink: 1 },
  valor: { color: palette.text, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'right' },

  aviso: { color: palette.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
  bien: { color: palette.success, fontSize: fontSize.md, fontWeight: '700' },
  mal: { color: palette.danger, fontSize: fontSize.md, fontWeight: '700' },
  pie: {
    color: palette.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },

  grupo: {
    color: palette.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  tablaCab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  tablaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.surfaceAlt,
  },
  tablaFilaSel: { backgroundColor: palette.accentTint },
  tablaCel: { color: palette.textMuted, fontSize: fontSize.xs },
  tablaSel: { color: palette.text, fontWeight: '800' },
  colPos: { width: 22, textAlign: 'center' },
  colEq: { flex: 1 },
  colNum: { width: 30, textAlign: 'center' },
  eqCaja: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eqEscudo: { width: 18, height: 18 },
  eqNombre: { flexShrink: 1 },
  leyenda: {
    color: palette.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});