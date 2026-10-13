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
import { CuadroMercado } from '../components/CuadroMercado';
import type { AnalisisFila, TablaLiga, FilaTabla } from '../data/analisisRepository';

/**
 * Detalle del partido.
 *
 * La pestana Analisis combina modelo + historial real + H2H (sin datos
 * capturados a mano), con el cable de la cuota (apertura -> cierre).
 * No hay IA: todo sale de datos medidos. La pestana "IA en vivo" que la
 * referencia traia se quita porque no hay IA que haga ese analisis.
 */

type Pestana = 'analisis' | 'pronosticos' | 'tendencias' | 'patrones' | 'mercado' | 'h2h' | 'posiciones';

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'analisis', label: 'Análisis' },
  { id: 'pronosticos', label: 'Pronósticos' },
  { id: 'tendencias', label: 'Tendencias' },
  { id: 'patrones', label: 'Patrones' },
  { id: 'mercado', label: 'Mercado' },
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

/**
 * Color de fondo tipo formato condicional de Excel (escala 3 colores) en
 * contraste con el promedio del bloque: por arriba del promedio queda verde,
 * por abajo rojo; el mas alto es el verde mas fuerte y el mas bajo el rojo
 * mas fuerte, neutro en el promedio. Sobre fondos oscuros.
 */
const tintEscala = (p: number, prom: number, min: number, max: number) => {
  if (p >= prom) {
    const denom = max - prom;
    const a = denom <= 0 ? 0 : Math.min(1, (p - prom) / denom);
    return { backgroundColor: `rgba(74,222,128,${Math.round(a * 40) / 100})` };
  }
  const denom = prom - min;
  const a = denom <= 0 ? 0 : Math.min(1, (prom - p) / denom);
  return { backgroundColor: `rgba(239,68,68,${Math.round(a * 40) / 100})` };
};

/** Celdilla "X%" coloreada contra el promedio del bloque. */
const CeldaEscala = ({ p, prom, min, max }: { p: number; prom: number; min: number; max: number }) => (
  <View style={[s.celdaPct, tintEscala(p, prom, min, max)]}>
    <Text style={s.celdaPctTxt}>{Math.round(p)}%</Text>
  </View>
);

type TendenciasCuadroT = {
  ou: Array<{ linea: number; over: number; dev: number }>;
  aa: number;
  n: number;
};

/** Bloque completo de tendencias con escala por promedio (uno por contexto).
 * Ambos anotan va como fila propia, destacada, con su celdilla. */
const BloqueTendencias = ({ titulo, c }: { titulo: string; c: TendenciasCuadroT }) => {
  const valores = [...c.ou.map(t => t.over), c.aa];
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const prom = valores.reduce((s, v) => s + v, 0) / valores.length;
  return (
    <>
      <Text style={s.subEtiqueta}>{titulo}</Text>
      {c.ou.map(t => (
        <Fila etiqueta={`O/U ${t.linea}`} key={`${titulo}-${t.linea}`}>
          <CeldaEscala p={t.over} prom={prom} min={min} max={max} />
          {t.dev ? <Text style={s.pie}> dev {t.dev}%</Text> : null}
        </Fila>
      ))}
      <View style={s.filaAA}>
        <Text style={s.aaEtiqueta}>Ambos anotan</Text>
        <CeldaEscala p={c.aa} prom={prom} min={min} max={max} />
      </View>
    </>
  );
};

/** Tarjeta de pronostico ordenada por probabilidad (cuadro del HTML). */
const TarjetaPronostico = ({
  nombre,
  p,
  riesgo,
  cuotaJusta,
  modelo,
  historial,
}: {
  nombre: string;
  p: number;
  riesgo: string;
  cuotaJusta: number | null;
  modelo?: number | null;
  historial?: number | null;
}) => {
  const riesgoColor =
    riesgo === 'bajo' ? palette.success : riesgo === 'alto' ? palette.danger : palette.star;
  return (
    <View style={s.tarjetaPk}>
      <View style={s.pkTop}>
        <Text style={s.pkNombre} numberOfLines={1}>
          {nombre}
        </Text>
        <Text style={[s.pkRiesgo, { color: riesgoColor }]}>{riesgo}</Text>
      </View>
      {modelo != null || historial != null ? (
        <Text style={s.pkFuentes}>
          {modelo != null ? `Modelo ${Math.round(modelo * 100)}%` : 'Modelo —'}
          {historial != null ? ` · Historial ${Math.round(historial * 100)}%` : ' · Historial —'}
        </Text>
      ) : null}
      <View style={s.pkRow}>
        <View style={s.pkCol}>
          <Text style={s.pkNum}>{Math.round(p * 100)}%</Text>
          <Text style={s.pkLab}>Probabilidad</Text>
        </View>
        <View style={s.pkCol}>
          <Text style={s.pkNum}>{cuotaJusta != null ? `@${cuotaJusta.toFixed(2)}` : '@—'}</Text>
          <Text style={s.pkLab}>Cuota justa</Text>
        </View>
      </View>
    </View>
  );
};

/** Cuadro de patrones (igual que el HTML: titulo + lista de frases). */
/** Iconito por tipo de patron, para leer la lista de un vistazo. */
const iconoPatron = (t: string): string => {
  if (t.includes('zig-zag')) return '⚡';
  if (t.includes('ganar por 1')) return '🎯';
  if (t.includes('empates')) return '🔁';
  if (t.includes('marcan en cadena') || t.includes('ambos anotaron')) return '🤝';
  if (t.includes('anotó')) return '⚽';
  if (t.includes('recibe menos')) return '🛡️';
  if (t.includes('recibe más') || t.includes('recibió')) return '⚠️';
  if (t.includes('victorias seguidas') || t.includes('sin perder')) return '📈';
  if (t.includes('derrotas seguidas') || t.includes('sin ganar')) return '📉';
  if (t.includes('al alza') || t.includes('forma al alza')) return '🔺';
  if (t.includes('a la baja') || t.includes('forma a la baja')) return '🔻';
  if (t.includes('goles concentrados')) return '🎲';
  if (t.includes('le pesa') || t.includes('no le pesa')) return '🏟️';
  return '•';
};

const CuadroPatron = ({ titulo, items }: { titulo: string; items: string[] }) => (
  <View style={s.cuadroPatron}>
    <Text style={s.patronTitulo}>{titulo}</Text>
    {items.length ? (
      items.map((t, i) => (
        <Text style={[s.patronItem, { color: palette.text }]} key={i}>
          {iconoPatron(t)} {t}
        </Text>
      ))
    ) : (
      <Text style={s.aviso}>Sin patrones claros.</Text>
    )}
  </View>
);

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
                      <View style={s.recomCaja}>
                        <Text style={s.recomNombre}>{fila.combinado.recomendacion.nombre}</Text>
                        <Text style={s.recomPct}>{pct0(fila.combinado.recomendacion.p)} combinada</Text>
                        <Text style={s.recomLinea}>
                          Cuota justa @{fila.combinado.recomendacion.cuotaJusta ?? '—'} · riesgo{' '}
                          {fila.combinado.recomendacion.riesgo}. Apuesta solo si tu casa paga más de @
                          {fila.combinado.recomendacion.cuotaJusta ?? '—'}.
                        </Text>
                        {fila.combinado.alternativa && (
                          <Text style={s.recomLinea}>
                            Alternativa: {fila.combinado.alternativa.nombre} ({pct0(fila.combinado.alternativa.p)}).
                          </Text>
                        )}
                        {fila.combinado.evitar && fila.combinado.evitar.length > 0 && (
                          <Text style={[s.recomLinea, { color: palette.danger }]}>
                            Evita: {fila.combinado.evitar.join('; ')}
                          </Text>
                        )}
                        {fila.combinado.calidad && (
                          <Text style={[s.recomLinea, { color: palette.star }]}>{fila.combinado.calidad}</Text>
                        )}
                      </View>
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

          {pestana === 'pronosticos' && (
            <>
              <Text style={s.seccion}>PRONÓSTICOS EN ORDEN DE PROBABILIDAD</Text>
              <Text style={s.aviso}>
                Probabilidad combinada: 50% modelo · 30% cuadros base · 20% H2H. Riesgo: bajo desde 75%,
                medio desde 60%, y sube un nivel si modelo e historial difieren 25 puntos o más. La cuota
                justa es lo mínimo que debería pagar la casa.
              </Text>
              {fila.combinado && fila.combinado.pronosticos.length > 0 ? (
                fila.combinado.pronosticos.map(pr => (
                  <TarjetaPronostico
                    nombre={pr.nombre}
                    p={pr.p}
                    riesgo={pr.riesgo}
                    cuotaJusta={pr.cuotaJusta}
                    modelo={pr.modelo}
                    historial={pr.historial}
                    key={pr.tipo}
                  />
                ))
              ) : (
                <Text style={s.aviso}>Sin pronósticos con datos suficientes.</Text>
              )}
            </>
          )}

          {pestana === 'tendencias' && (
            <>
              <Text style={s.seccion}>TENDENCIAS OVER/UNDER (HISTORIAL REAL)</Text>
              <Text style={s.aviso}>
                % de partidos del historial que pasaron la línea. Cada celda se compara contra el promedio del
                bloque: por arriba del promedio verde, por abajo rojo (el más alto es el verde más fuerte). En
                líneas enteras, dev = % que cayó justo en la línea. Últ.5 L/V junta al local y a la visita.
              </Text>

              {fila.combinado?.tendencias?.general ? (
                <>
                  <BloqueTendencias titulo="General" c={fila.combinado.tendencias.general} />
                  <Text style={s.pie}>n = {fila.combinado.tendencias.general.n} partidos</Text>

                  {fila.combinado.tendencias.lv && (
                    <BloqueTendencias titulo="Últ. 5 L/V" c={fila.combinado.tendencias.lv} />
                  )}

                  {fila.combinado.tendencias.h2h && (
                    <BloqueTendencias titulo="H2H" c={fila.combinado.tendencias.h2h} />
                  )}
                </>
              ) : (
                <Text style={s.aviso}>Sin historial suficiente para tendencias.</Text>
              )}
            </>
          )}

          {pestana === 'patrones' && (
            <>
              <Text style={s.seccion}>PATRONES (DEL MÁS RECIENTE AL MÁS ANTIGUO)</Text>
              <Text style={s.aviso}>
                Rachas y momento salen de la historia descargada: el primero de la lista es el partido más
                reciente.
              </Text>
              {fila.combinado?.patrones ? (
                (Object.entries(fila.combinado.patrones) as Array<[string, string[]]>).map(([k, items]) => (
                  <CuadroPatron
                    key={k}
                    titulo={
                      k === 'generalLocal'
                        ? 'General local'
                        : k === 'generalVisita'
                          ? 'General visita'
                          : k === 'localCasa'
                            ? 'Local en casa'
                            : k === 'visitaFuera'
                              ? 'Visita fuera'
                              : k === 'h2h'
                                ? 'H2H (histórico)'
                                : k === 'h2hCasa'
                                  ? 'H2H en casa del local'
                                  : k
                    }
                    items={items}
                  />
                ))
              ) : (
                <Text style={s.aviso}>Sin patrones con datos suficientes.</Text>
              )}
            </>
          )}

          {pestana === 'mercado' && (
            <>
              <CuadroMercado />
            </>
          )}

          {pestana === 'h2h' && (
            <>
              <Text style={s.seccion}>ENFRENTAMIENTOS DIRECTOS</Text>
              {(() => {
                const tv = fila.combinado?.temporadaVigente;
                if (tv) {
                  return (
                    <Text style={s.aviso}>
                      General/L-V usan SOLO la temporada vigente (local {tv.local ?? '—'}, visita{' '}
                      {tv.visita ?? '—'}). Aquí el H2H es el historial COMPLETO de enfrentamientos directos, no
                      solo de esta temporada — así se ven patrones que en 1 año no salen.
                    </Text>
                  );
                }
                return null;
              })()}
              {fila.combinado?.h2hPartidos && fila.combinado.h2hPartidos > 0 ? (
                <>
                  <Fila etiqueta="Partidos (histórico)">
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

                  {fila.combinado.h2hCasaPartidos && fila.combinado.h2hCasaPartidos > 0 ? (
                    <>
                      <Text style={s.subEtiqueta}>H2H jugado en casa del local</Text>
                      <Fila etiqueta="Partidos">
                        <Text style={s.valor}>{fila.combinado.h2hCasaPartidos}</Text>
                      </Fila>
                      <Fila etiqueta="Serie">
                        <Text style={s.valor}>
                          {fila.combinado.serieH2HCasa?.join(' · ') ?? '—'}
                        </Text>
                      </Fila>
                      {(() => {
                        const cc = fila.combinado?.cuadros?.h2hCasa;
                        if (!cc) return null;
                        return (
                          <>
                            <Fila etiqueta="Promedio">
                              <Text style={s.valor}>
                                {cc.gfProm.toFixed(2)} a favor · {cc.gcProm.toFixed(2)} en contra
                              </Text>
                            </Fila>
                            <Fila etiqueta="≥1 gol">
                              <Text style={s.valor}>
                                {cc.gfGe1}% a favor · {cc.gcGe1}% en contra
                              </Text>
                            </Fila>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <Text style={s.aviso}>
                      Sin enfrentamientos históricos jugados en casa del local.
                    </Text>
                  )}
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

  celdaPct: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  celdaPctTxt: { color: palette.text, fontSize: fontSize.sm, fontWeight: '800' },

  filaAA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: palette.accent,
    paddingTop: spacing.sm,
  },
  aaEtiqueta: { color: palette.accent, fontSize: fontSize.md, fontWeight: '900' },

  tarjetaPk: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  pkTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pkNombre: { color: palette.text, fontSize: fontSize.md, fontWeight: '800', flexShrink: 1 },
  pkRiesgo: { fontSize: fontSize.xs, fontWeight: '900', textTransform: 'uppercase' },
  pkFuentes: { color: palette.textMuted, fontSize: fontSize.xs },
  pkRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  pkCol: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  pkNum: { color: palette.accent, fontSize: fontSize.lg, fontWeight: '900' },
  pkLab: { color: palette.textMuted, fontSize: fontSize.xs },

  cuadroPatron: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  patronTitulo: { color: palette.star, fontSize: fontSize.sm, fontWeight: '800', marginBottom: spacing.xs },
  patronItem: { color: palette.text, fontSize: fontSize.sm, lineHeight: 21, marginTop: 3 },

  recomCaja: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  recomNombre: { color: palette.text, fontSize: fontSize.md, fontWeight: '900' },
  recomPct: { color: palette.accent, fontSize: fontSize.lg, fontWeight: '900' },
  recomLinea: { color: palette.textMuted, fontSize: fontSize.sm, lineHeight: 20 },

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