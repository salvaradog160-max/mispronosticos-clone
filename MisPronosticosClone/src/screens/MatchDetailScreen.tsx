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
 * Detalle del partido.
 *
 * La pestana Analisis combina modelo + historial real + H2H (sin datos
 * capturados a mano), con el cable de la cuota (apertura -> cierre).
 * No hay IA: todo sale de datos medidos. La pestana "IA en vivo" que la
 * referencia traia se quita porque no hay IA que haga ese analisis.
 */

type Pestana = 'analisis' | 'h2h' | 'posiciones';

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'analisis', label: 'Análisis' },
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

              {fila.serie && fila.serie.length > 0 && (
                <>
                  <Text style={s.seccion}>CABLE DE LA CUOTA (apertura → cierre)</Text>
                  <Text style={s.aviso}>
                    El teléfono: apertura es el emisor, el cierre el receptor, y esto es cómo se mueve el cable entre
                    los dos. Cada lectura es una corrida de 30 minutos.
                  </Text>
                  {fila.serie.slice(0, 12).map((p, i, arr) => {
                    const esApertura = i === 0;
                    const esCierre = p.closed != null && (i === arr.length - 1 || arr[i + 1]?.closed == null);
                    return (
                      <Fila
                        etiqueta={`${p.market === 'moneyline' ? '1X2' : p.market} ${p.side}${p.line != null ? ` ${p.line}` : ''}`}
                        key={`${p.capturedAt}-${i}`}>
                        <Text style={[s.valor, esCierre && { color: palette.accent }]} numberOfLines={1}>
                          {esApertura ? `apertura ${Number(p.opened ?? p.current).toFixed(2)}` : ''}
                          {esApertura ? ' → ' : ''}
                          {Number(p.current ?? p.opened).toFixed(2)}
                          {p.movePct != null ? ` (${p.movePct >= 0 ? '+' : ''}${p.movePct.toFixed(1)}pp)` : ''}
                          {esCierre ? ' ← cierre' : ''}
                        </Text>
                      </Fila>
                    );
                  })}
                  <Text style={s.pie}>
                    {(() => {
                      const m = fila.serie.filter(x => x.market === 'moneyline' && x.side === 'home');
                      if (m.length < 2) return 'Solo hay 1 lectura todavía; el cable se dibuja con más corridas.';
                      const ab = m[0].current ?? m[0].opened;
                      const ce = m[m.length - 1].closed ?? m[m.length - 1].current;
                      const d = ab != null && ce != null ? ce - ab : null;
                      return d == null
                        ? 'El cable aún no definió hacia dónde va.'
                        : `De la apertura al cierre, el local ${d > 0 ? 'subió' : 'bajó'} ${Math.abs(d).toFixed(2)} en decimal (${d > 0 ? 'el mercado le quita' : 'el mercado le da confianza al'} local).`;
                    })()}
                  </Text>
                </>
              )}

              {fila.combinado && (
                <>
                  <Text style={s.seccion}>ANÁLISIS COMBINADO</Text>
                  <Text style={s.aviso}>
                    Combina el modelo con la estadística real del historial (base y H2H). Orienta, no garantiza.
                    Pesos: 50% modelo · 30% base (últ.5 L/V) · 20% H2H L/V.
                  </Text>
                  <Fila etiqueta="Se inclina a">
                    <Text style={s.valor}>
                      {fila.combinado.inclina ?? '—'} · {pct0(fila.combinado.pCombinada)} ·{' '}
                      {fila.combinado.confianza}
                    </Text>
                  </Fila>

                  <Text style={s.subEtiqueta}>1X2 (modelo / historial / combinada)</Text>
                  {fila.combinado.tabla.map(t => (
                    <Fila etiqueta={{ H: 'Local', D: 'Empate', A: 'Visita' }[t.lado]} key={t.lado}>
                      <Text style={s.valor}>
                        {pct0(t.modelo)} / {pct0(t.historial)} / {pct0(t.combinada)}
                      </Text>
                    </Fila>
                  ))}

                  {fila.combinado.recomendacion && (
                    <>
                      <Text style={s.subEtiqueta}>Recomendación</Text>
                      <Fila etiqueta={fila.combinado.recomendacion.nombre}>
                        <Text style={s.valor}>
                          {pct0(fila.combinado.recomendacion.p)} · riesgo {fila.combinado.recomendacion.riesgo} · @
                          {fila.combinado.recomendacion.cuotaJusta}
                        </Text>
                      </Fila>
                      <Text style={s.pie}>
                        Cuota justa @{fila.combinado.recomendacion.cuotaJusta}: apuesta solo si tu casa paga más de
                        eso. Riesgo {fila.combinado.recomendacion.riesgo}: bajo ~75%, medio ~60%, y sube un nivel si el
                        modelo y el historial difieren 25 puntos o más.
                      </Text>
                    </>
                  )}

                  {fila.combinado.pronosticos.length > 0 && (
                    <>
                      <Text style={s.subEtiqueta}>Pronósticos (en orden de probabilidad)</Text>
                      {fila.combinado.pronosticos.map(pr => (
                        <Fila etiqueta={pr.nombre} key={pr.tipo}>
                          <Text style={s.valor} numberOfLines={1}>
                            {pct0(pr.p)} · {pr.riesgo} · @{pr.cuotaJusta}
                          </Text>
                        </Fila>
                      ))}
                    </>
                  )}

                  {fila.combinado.oportunidades.length > 0 && (
                    <>
                      <Text style={s.subEtiqueta}>Oportunidades</Text>
                      {fila.combinado.oportunidades.map((o, i) => (
                        <Text style={[s.bullet, { color: palette.success }]} key={`o${i}`}>• {o}</Text>
                      ))}
                    </>
                  )}

                  {fila.combinado.riesgos.length > 0 && (
                    <>
                      <Text style={s.subEtiqueta}>Riesgos</Text>
                      {fila.combinado.riesgos.map((o, i) => (
                        <Text style={[s.bullet, { color: palette.star }]} key={`r${i}`}>• {o}</Text>
                      ))}
                    </>
                  )}

                  {fila.combinado.tendencias?.general && (
                    <>
                      <Text style={s.subEtiqueta}>Tendencias Over/Under (historial real)</Text>
                      {fila.combinado.tendencias.general.ou.map(t => (
                        <Fila etiqueta={`O/U ${t.linea}`} key={t.linea}>
                          <Text style={[s.valor, t.over >= 60 ? { color: palette.success } : t.over <= 40 ? { color: palette.danger } : {}]}>
                            Over {t.over}%{t.dev ? ` (dev ${t.dev}%)` : ''}
                          </Text>
                        </Fila>
                      ))}
                      <Fila etiqueta="Ambos anotan">
                        <Text style={s.valor}>
                          Sí {fila.combinado.tendencias.general.aa}%
                        </Text>
                      </Fila>
                      <Text style={s.pie}>
                        % de partidos del historial que pasaron la línea. Verde = tendencia a Over, rojo = a Under.
                      </Text>
                    </>
                  )}
                </>
              )}

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

              {fila.tiempos && (
                <>
                  <Text style={s.seccion}>GOLES ESPERADOS POR TIEMPO</Text>
                  <Text style={s.aviso}>
                    Del total, un {Math.round(fila.tiempos.fraccion1T * 100)}% cae en el primer tiempo según la
                    media real de la liga (medida en football-data).
                  </Text>

                  {(
                    [
                      ['PRIMER TIEMPO', fila.tiempos.primerTiempo],
                      ['SEGUNDO TIEMPO', fila.tiempos.segundoTiempo],
                    ] as Array<[string, typeof fila.tiempos.primerTiempo]>
                  ).map(([nombre, t]) => (
                      <React.Fragment key={String(nombre)}>
                        <Text style={s.subEtiqueta}>{nombre}</Text>
                        <Fila etiqueta={`${local ?? 'Local'} (goles esperados)`}>
                          <Text style={s.valor}>{t.local.toFixed(2)}</Text>
                        </Fila>
                        <Fila etiqueta={`${visita ?? 'Visita'} (goles esperados)`}>
                          <Text style={s.valor}>{t.visita.toFixed(2)}</Text>
                        </Fila>
                        {t.overUnder.map((f: any) => (
                          <Fila etiqueta={`${f.linea} goles`} key={`${nombre}-${f.linea}`}>
                            <Text style={s.valor} numberOfLines={1}>
                              O@{f.over.cuotaJusta?.toFixed(2) ?? '—'} · U@
                              {f.under.cuotaJusta?.toFixed(2) ?? '—'}
                            </Text>
                          </Fila>
                        ))}
                      </React.Fragment>
                    ),
                  )}
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

          {pestana === 'h2h' && (
            <>
              <Text style={s.seccion}>ENFRENTAMIENTOS DIRECTOS</Text>
              {fila.combinado?.h2hPartidos && fila.combinado.h2hPartidos > 0 ? (
                <>
                  <Fila etiqueta="Partidos">
                    <Text style={s.valor}>{fila.combinado.h2hPartidos}</Text>
                  </Fila>
                  <Fila etiqueta="Serie (desde el local)">
                    <Text style={s.valor}>
                      {fila.combinado.serieH2H?.join(' · ') ?? '—'}
                    </Text>
                  </Fila>
                  {(() => {
                    const c = fila.combinado?.cuadros?.h2h;
                    if (!c) return null;
                    return (
                      <>
                        <Text style={s.subEtiqueta}>Goles por partido (local)</Text>
                        <Fila etiqueta="Promedio">
                          <Text style={s.valor}>{c.gfProm.toFixed(2)} a favor · {c.gcProm.toFixed(2)} en contra</Text>
                        </Fila>
                        <Fila etiqueta="Mediana">
                          <Text style={s.valor}>{c.gfMed.toFixed(1)} · {c.gcMed.toFixed(1)}</Text>
                        </Fila>
                        <Fila etiqueta="≥1 gol">
                          <Text style={s.valor}>{c.gfGe1}% a favor · {c.gcGe1}% en contra</Text>
                        </Fila>
                        <Fila etiqueta="Desv. estándar">
                          <Text style={s.valor}>±{c.gfDe.toFixed(2)} · ±{c.gcDe.toFixed(2)}</Text>
                        </Fila>
                      </>
                    );
                  })()}
                </>
              ) : (
                <Text style={s.aviso}>
                  Sin historial de enfrentamientos directos entre estos dos equipos en la base descargada.
                </Text>
              )}
              <Text style={s.pie}>
                H2H real desde la historia descargada (football-data + ESPN). No se inventa: si no hay partidos, queda
                vacío.
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
  bullet: { color: palette.text, fontSize: fontSize.sm, lineHeight: 21, marginTop: 4, paddingRight: spacing.md },
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