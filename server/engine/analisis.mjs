/**
 * Analisis de un partido: cuota de apertura, cuota actual, cuanto se
 * movio la linea, y que dice el modelo.
 *
 * No decide si apostar. Muestra las tres cosas que hay que mirar para
 * decidir: que cree el mercado, que cree el modelo, y como se movio la
 * linea entre la apertura y ahora.
 */

/** Probabilidades de 1X2 sin margen a partir de tres cuotas. */
export const probs1x2 = (H, D, A) => {
  if (!H || !D || !A) return null;
  const raw = { H: 1 / H, D: 1 / D, A: 1 / A };
  const overround = raw.H + raw.D + raw.A;
  // `> 0` y no `> 1`: un mercado totalmente justo (3.00/3.00/3.00) da
  // overround 1.0 exacto y es perfectamente valido, solo que sin margen.
  // Con `> 1` el partido se descartaba entero y no salia en la app.
  if (!(overround > 0)) return null;
  return { H: raw.H / overround, D: raw.D / overround, A: raw.A / overround, overround };
};

/** Probabilidad de un lado del mercado de goles quitando el margen. */
const probLado = cuota => {
  if (!Number.isFinite(cuota) || cuota <= 1) return null;
  return 1 / cuota;
};

/**
 * Mercado de goles, con los dos lados explicitos.
 *
 * Antes se publicaba `lineaGoles` y `cuotaGoles` (que era SIEMPRE el
 * over) sin decir nada: en pantalla salia "Línea de goles 2.5 · más
 * 1.67" y no se podia saber si habia que jugar Over o Under. Aqui van
 * los dos lados, con su probabilidad de mercado y la del modelo.
 */
export const mercadoGoles = (o, probOverModelo) => {
  if (!o?.line || !Number.isFinite(o.over) || !Number.isFinite(o.under)) return null;
  const rOver = probLado(o.over);
  const rUnder = probLado(o.under);
  if (rOver === null || rUnder === null) return null;

  // Sin esto el mercado miente por dos lados. Las cuotas de un mercado de
  // dos lados suman 1/cuota entre 105% y 110% (el margen del bookmaker).
  // Si se comparan contra el modelo SIN quitarlo, el mercado parece peor
  // en los dos lados a la vez: con cuotas 3.40/1.25 un modelo que dice
  // 50/50 (moneda) sacaba "+20.6 pp a favor del Over" y "-30.0 pp a
  // favor del Under". Eso no es una ventaja, es el vig disfrazado de
  // analisis. Se divide entre el overround igual que probs1x2.
  const overround = rOver + rUnder;
  // `> 0` y no `> 1` a proposito: un mercado justo (2.00/2.00) da
  // overround exactamente 1.0 y es un mercado valido, solo que sin
  // margen. Solo hay que evitar dividir entre cero.
  if (!(overround > 0)) return null;
  const pOver = rOver / overround;
  const pUnder = rUnder / overround;

  const cuota = v => Number(v.toFixed(2));
  const prob = v => Number(v.toFixed(4));
  const p4 = v => (v === null ? null : Number((v * 100).toFixed(1)));

  const lado = (nombre, pMercado, cuotaMercado, pModelo) => ({
    lado: nombre,
    cuota: cuota(cuotaMercado),
    probMercado: prob(pMercado),
    probMercadoPct: p4(pMercado),
    probModelo: p4(pModelo),
    // Margen a favor de apostar este lado: lo que el modelo dice menos
    // lo que cuesta la cuota. Positivo = el modelo lo ve mejor.
    margenPp: pModelo === null ? null : Number(((pModelo - pMercado) * 100).toFixed(1)),
  });

  return {
    linea: o.line,
    /** Cuanto suma el mercado por encima de 100%. 1.08 = 8% de margen. */
    overround: Number(overround.toFixed(4)),
    over: lado('Over', pOver, o.over, probOverModelo ?? null),
    under: lado('Under', pUnder, o.under, probOverModelo === null || probOverModelo === undefined
      ? null
      : Number((1 - probOverModelo).toFixed(4))),
  };
};

/**
 * Estado del partido mas el resultado del lado que eligio el mercado.
 * El usuario necesita saber tres cosas: si ya se jogo, como quedo, y si
 * el lado que marco el mercado acertó.
 */
const estadoConResultado = (partido, ladoMercado) => {
  const base = estadoPartido(partido);
  const sgL = partido.score?.home;
  const sgV = partido.score?.away;
  const out = {
    estado: base.estado,
    marcador: base.marcador,
    resultado: null,
  };
  if (base.estado !== 'finalizado' || !Number.isFinite(sgL) || !Number.isFinite(sgV)) {
    return out;
  }
  const real = sgL > sgV ? 'H' : sgL < sgV ? 'A' : 'D';
  out.resultado =
    real === ladoMercado ? 'acierto' : real === 'D' || ladoMercado === 'D' ? 'empate' : 'fallo';
  return out;
};

/** Estado del partido: lo que el usuario necesita para saber si ya ocurrio. */
export const estadoPartido = partido => {
  const s = partido.status || {};
  const tipo = s.type || null;
  const sgLocal = partido.score?.home;
  const sgVisita = partido.score?.away;

  let estado = 'programado';
  if (tipo === 'in') estado = 'en vivo';
  else if (tipo === 'post' || Number.isFinite(sgLocal) && Number.isFinite(sgVisita)) {
    estado = 'finalizado';
  }

  const out = { estado, tipo, marcador: null };
  if (estado === 'finalizado' && Number.isFinite(sgLocal) && Number.isFinite(sgVisita)) {
    out.marcador = `${sgLocal}-${sgVisita}`;
  }
  return out;
};

const NOMBRE = { H: 'local', D: 'empate', A: 'visitante' };

/**
 * Nombre real del lado, no "local"/"visitante".
 *
 * En pantalla salia "MERCADO local / MODELO local" sobre la tarjeta de
 * Red Bull Bragantino vs Cruzeiro. "local" SI era Bragantino, pero no lo
 * decia, y al lado del otro no habia forma de saber a quien jugaba uno.
 * Cuando hay nombres se usan; si faltan, se avisa con el texto viejo.
 */
const nombreLado = (lado, partido) => {
  if (lado === 'D') return 'Empate';
  if (lado === 'H') return partido.homeTeam || NOMBRE.H;
  if (lado === 'A') return partido.awayTeam || NOMBRE.A;
  return NOMBRE[lado] ?? lado;
};

/**
 * @param partido  { homeTeam, awayTeam, kickoff, leagueName, odds }
 * @param probs    probabilidades del modelo (ya sin margen)
 */
/**
 * Las ligas de america se analizan con ratings propios (ESPN da
 * resultados historicos) y ademas con cuotas propias (la tabla
 * unificada incluye sus 2,082 partidos con apertura y cierre), asi que
 * ya no hay ninguna liga que herede calibracion de otra. La tabla es
 * una sola para todos: por eso `calibracion` siempre dice "propia".
 */
export const LIGAS_SIN_CALIBRACION = new Set();

import { goodToLine } from './valor.mjs';
import { overProb, bttsProb } from './poisson.mjs';
import { ladderMercados, desglosarTiempos, ladderTiempo } from './ladder.mjs';
import { riesgoDe, pronosticos as pronosticosDe, cuotaJusta } from './historial.mjs';

/** Ladder por tiempo: divide lambdas y arma el O/U de cada mitad. */
const tiemposLadder = (lambdaHome, lambdaAway, ligaKey) => {
  const t = desglosarTiempos(lambdaHome, lambdaAway, ligaKey);
  if (!t) return null;
  return {
    fraccion1T: t.fraccion1T,
    primerTiempo: {
      local: Number(t.primerTiempo.local.toFixed(3)),
      visita: Number(t.primerTiempo.visita.toFixed(3)),
      overUnder: ladderTiempo(t.primerTiempo.local, t.primerTiempo.visita),
    },
    segundoTiempo: {
      local: Number(t.segundoTiempo.local.toFixed(3)),
      visita: Number(t.segundoTiempo.visita.toFixed(3)),
      // En 2T las lambdas son mas altas que en 1T: entra la linea 2.5.
      overUnder: ladderTiempo(t.segundoTiempo.local, t.segundoTiempo.visita, [0.5, 1, 1.5, 2, 2.5]),
    },
  };
};

export const analizar = (partido, probs, confianza = null) => {
  const o = partido.odds;
  const actual = o ? probs1x2(o.H, o.D, o.A) : null;
  const apertura = o?.apertura?.H ? probs1x2(o.apertura.H, o.apertura.D, o.apertura.A) : null;

  if (!actual || !probs) return null;

  const ladoMercado = Object.entries({ H: actual.H, D: actual.D, A: actual.A })
    .sort((a, b) => b[1] - a[1])[0][0];
  const ladoModelo = Object.entries({ H: probs.H, D: probs.D, A: probs.A })
    .sort((a, b) => b[1] - a[1])[0][0];

  // Probabilidades: sobre ellas se mide el movimiento, en puntos porcentuales.
  const cuotaProbAhora = actual[ladoMercado];
  const cuotaProbApertura = apertura ? apertura[ladoMercado] : null;

  // Cuotas decimales reales. Confundir esto con la probabilidad fue un
  // bug: salia "cuota 0.46", que no es una cuota valida.
  const cuotaAhora = o[ladoMercado];
  const cuotaAbierta = o?.apertura?.[ladoMercado] ?? null;

  return {
    partido: `${partido.homeTeam} vs ${partido.awayTeam}`,
    liga: partido.leagueName,
    // Clave de liga (arg.1, bra.1...). El nombre no sirve para pedir la
    // tabla de posiciones: ESPN la indexa por clave.
    ligaKey: partido.leagueKey ?? null,
    // Escudos. La app de referencia es guiada visualmente por los
    // escudos; sin ellos la lista es una tabla de texto. Vienen en la
    // misma respuesta del scoreboard, asi que no cuestan nada extra.
    escudoLocal: partido.homeLogo ?? null,
    escudoVisita: partido.awayLogo ?? null,
    colorLocal: partido.homeColor ?? null,
    colorVisita: partido.awayColor ?? null,
    sede: partido.venue ?? null,
    calibracion: LIGAS_SIN_CALIBRACION.has(partido.leagueKey) ? 'europea' : 'propia',
    kickoff: partido.kickoff,

    // Que dice el mercado
    favoritoMercado: ladoMercado,
    ladoMercado: nombreLado(ladoMercado, partido),
    probMercado: Number(cuotaProbAhora.toFixed(4)),
    cuotaMercado: Number(cuotaAhora.toFixed(2)),
    cuotaApertura: cuotaAbierta === null ? null : Number(cuotaAbierta.toFixed(2)),

    // Que dice el modelo
    ladoModelo: nombreLado(ladoModelo, partido),
    probModelo: Number(probs[ladoModelo].toFixed(4)),
    coincide: ladoMercado === ladoModelo,

    // Movimiento de linea, en puntos porcentuales
    movimiento: cuotaProbApertura
      ? Number(((cuotaProbAhora - cuotaProbApertura) * 100).toFixed(2))
      : null,
    cambioFavorito:
      apertura &&
      Object.entries({ H: apertura.H, D: apertura.D, A: apertura.A })
        .sort((a, b) => b[1] - a[1])[0][0] !== ladoMercado,

    // Mercado de goles con los dos lados declarados. Antes solo se
    // publicaba la cuota del over sin etiqueta y en pantalla se leia
    // "Linea de goles 2.5 - mas 1.67", sin poder saber si era Over o
    // Under.
    goles: mercadoGoles(o, partido.probOver ?? null),
    lineaGoles: o?.line ?? null,

    // Goles esperados del modelo. Antes se calculaban adentro pero no
    // salian en el payload: la tarjeta "GOLES ESPERADOS (MODELO)" de la
    // app estaba muerta. Ahora viajan.
    lambdaHome: partido.lambdaHome ?? null,
    lambdaAway: partido.lambdaAway ?? null,

    // Escalera de cuota justa por mercado (1X2, O/U 0.5-4.5, AA y
    // marcadores), sacada de las lambdas reales del modelo. Es la misma
    // cuenta que la herramienta manual, pero con datos reales. Si el
    // partido no trae lambdas, null.
    ladder: (partido.ladder = ladderMercados(partido.lambdaHome, partido.lambdaAway)),

    // Goles esperados desglosados en primer y segundo tiempo, con la
    // fraccion real de goles por tiempo medida por liga (HTHG/HTAG de
    // football-data). De ahi sale tambien el ladder O/U de cada tiempo.
    tiempos: tiemposLadder(partido.lambdaHome, partido.lambdaAway, partido.leagueKey),

    // Estado: si ya se jogo, con que marcador quedo y si el lado que
    // eligio el mercado acertó.
    ...estadoConResultado(partido, ladoMercado),

    // A que precio volveria a valer. `confianza` viene de la tabla
    // calibrada segun la probabilidad de mercado actual.
    goodToLine: confianza === null ? null : goodToLine(confianza, cuotaProbAhora),

    // El cable del telefono: serie temporal de la cuota (apertura ->
    // lecturas -> cierre). Viene de Postgres (line_series). null si no
    // hay lecturas todavia.
    serie: partido.serie ?? null,

    // Analisis combinado: modelo + historial real + H2H. El motor de
    // historial (engine/historial.mjs) construye los cuadros que la
    // herramienta manual pedia capturar, pero con datos reales. El
    // usuario no llena nada.
    ...historialCombinado(partido, probs),
  };
};

/**
 * Descanso del analisis combinado. Si el partido trae `historial`
 * (motor de historial real), junta el modelo con la base (ult.5 L/V)
 * y el H2H y produce: probabilidades del modelo, riesgo, pronosticos,
 * oportunidades y riesgos. Si no, null.
 */
const historialCombinado = (partido, probs) => {
  const h = partido.historial;
  if (!h) return { combinado: null };

  const { pBase } = h.probs ?? {};
  const pModelo = probs;

  // Solo modelo: la mezcla con base/H2H se quito (backtest 17-oct-2026).
  // `pComb`/`combinado` se conservan como nombres del contrato con la app.
  const pComb = { H: pModelo.H, D: pModelo.D, A: pModelo.A };
  const usados = ['modelo'];
  // Mercados de goles del modelo (Poisson con las lambdas) para anadir
  // O/U y AA combinados al ranking, como hace la herramienta manual.
  const lm = partido.lambdaHome;
  const la = partido.lambdaAway;
  const golesModelo =
    lm != null && la != null
      ? {
          over25: overProb(lm, la, 2.5),
          over1_5: overProb(lm, la, 1.5),
          over3_5: overProb(lm, la, 3.5),
          over4_5: overProb(lm, la, 4.5),
          btts: bttsProb(lm, la),
        }
      : null;
  const pro = pronosticosDe({
    pComb,
    pModelo,
    pBase,
    golesModelo,
    tendHist: h.tendencias?.general ?? null,
  });
  const inclina = [...['H', 'D', 'A']].sort((a, b) => (pComb[b] ?? 0) - (pComb[a] ?? 0))[0];
  const ladoNombre = { H: 'Local', D: 'Empate', A: 'Visita' };

  // Oportunidades y riesgos (texto real, como la herramienta manual).
  const oportunidades = [];
  const riesgos = [];

  const pts = h.puntos ?? {};
  const pmt = (o) => o?.porPartido ?? null;
  // Peso del estadio local: cuantos puntos rinde en casa vs su general.
  // Un dif claro en cualquiera de las dos direcciones es un dato fino.
  const pesoLocal = h.pesoEstadio?.local ?? {};
  const pesoVisita = h.pesoEstadio?.visita ?? {};
  if (pesoLocal.dif != null && pesoLocal.dif >= 0.3)
    oportunidades.push(`Peso del estadio local: rinde mejor en casa (${pmt(pts.localCasa)} vs ${pmt(pts.localGral)} pts por partido, +${pesoLocal.dif.toFixed(1)}).`);
  if (pesoLocal.dif != null && pesoLocal.dif <= -0.3)
    riesgos.push(`No le pesa el estadio al local: rinde menos en casa (${pmt(pts.localCasa)} vs ${pmt(pts.localGral)} pts por partido).`);
  if (pts.localCasa && pts.visitaFuera && pmt(pts.localCasa) - pmt(pts.visitaFuera) >= 1)
    oportunidades.push(`Forma L/V: ${pts.localCasa.pts} pts local en casa vs ${pts.visitaFuera.pts} visita fuera. Respalda a Local.`);
  if (pts.localGral && pts.visitaGral && pmt(pts.localGral) - pmt(pts.visitaGral) >= 1)
    oportunidades.push(`H2H General: ${pts.localGral.pts} pts local vs ${pts.visitaGral.pts} visita. Respalda a Local.`);
  if (pts.visitaFuera && pts.visitaGral && pmt(pts.visitaFuera) - pmt(pts.visitaGral) <= -0.3)
    oportunidades.push(`La visita baja fuera de casa (${pmt(pts.visitaFuera)} vs ${pmt(pts.visitaGral)} pts por partido).`);

  // Patrones: el mejor del local en casa, el mejor H2H L/V y la forma
  // del visitante se convierten en oportunidades o riesgos finos.
  const pat = h.patrones ?? {};
  const mejorPatron = (lista, busqueda) => (lista ?? []).find(p => p.toLowerCase().includes(busqueda));
  const ganoUltimoLocal = mejorPatron(pat.localCasa, 'ganó el último');
  if (ganoUltimoLocal) oportunidades.push(`Patrón Local: ${ganoUltimoLocal}.`);
  const h2hVictoria = mejorPatron(pat.h2hCasa, 'victorias seguidas');
  if (h2hVictoria) oportunidades.push(`Patrón H2H L/V (local): ${h2hVictoria}.`);
  const visitaSinGanar = mejorPatron(pat.visitaFuera, 'sin ganar');
  if (visitaSinGanar) oportunidades.push(`Patrón Visita: ${visitaSinGanar}.`);
  const localRecibeMas = mejorPatron(pat.localCasa, 'recibe más');
  if (localRecibeMas) riesgos.push(`Patrón Local: ${localRecibeMas}.`);
  const visitaFormaAlza = mejorPatron(pat.visitaFuera, 'forma al alza');
  if (visitaFormaAlza) riesgos.push(`Patrón Visita: ${visitaFormaAlza}.`);
  const visitaRecibeMenos = mejorPatron(pat.visitaFuera, 'recibe menos');
  if (visitaRecibeMenos) riesgos.push(`Patrón Visita: ${visitaRecibeMenos}.`);
  const h2hDerrotas = mejorPatron(pat.h2h, 'derrotas seguidas');
  if (h2hDerrotas) riesgos.push(`Patrón H2H: ${h2hDerrotas}.`);

  // Peso del estadio CONTRA ESTE rival: el local en H2H en casa vs su
  // general en casa. Si en los enfrentamientos jugados en su cancha rinde
  // menos que en su temporada, al local no le pesa el estadio con este rival.
  const h2hCasaCuadro = h.cuadros?.h2hCasa ?? null;
  const localCasaCuadro = h.cuadros?.localCasa ?? null;
  if (h2hCasaCuadro && localCasaCuadro && h2hCasaCuadro.n >= 2 && localCasaCuadro.n >= 4) {
    const pptsH2HCasa = (h2hCasaCuadro.gfProm - h2hCasaCuadro.gcProm);
    const pptsLocalCasa = (localCasaCuadro.gfProm - localCasaCuadro.gcProm);
    if (pptsLocalCasa - pptsH2HCasa >= 0.5)
      riesgos.push(`Contra este rival, al local no le pesa su estadio: en H2H en casa promedia ${h2hCasaCuadro.gfProm.toFixed(1)}-${h2hCasaCuadro.gcProm.toFixed(1)} contra su general en casa de ${localCasaCuadro.gfProm.toFixed(1)}-${localCasaCuadro.gcProm.toFixed(1)}.`);
    else if (pptsH2HCasa - pptsLocalCasa >= 0.5)
      oportunidades.push(`A este rival le pesa el estadio del local: en H2H en casa promedia ${h2hCasaCuadro.gfProm.toFixed(1)}-${h2hCasaCuadro.gcProm.toFixed(1)} vs su general en casa de ${localCasaCuadro.gfProm.toFixed(1)}-${localCasaCuadro.gcProm.toFixed(1)}.`);
  }

  // Goles concentrados (DE > promedio) del local: la base no es estable.
  const gConcentrado = (pat.localCasa ?? []).find(p => p.includes('goles concentrados'));
  if (gConcentrado) riesgos.push(`Los goles de Local en su base se concentran en pocos partidos (${gConcentrado.split(') ')[1] ?? ''}DE sobre el promedio).`);

  // % over real del historial general, por linea (para comparar modelo).
  const tendOver = linea => {
    const t = h.tendencias?.general?.ou?.find(o => o.linea === linea);
    return t?.over ?? null;
  };

  // Coincidencias modelo-historial de los mercados de goles: si difieren
  // mas de 20 puntos es un riesgo/oportunidad fino.
  const coincidencias = [];
  const divergencias = [];
  const merc = partido.ladder ?? null;
  if (merc?.overUnder) {
    for (const f of merc.overUnder) {
      const pM = f.over?.p ?? null;      // modelo (prob over)
      const pB = tendOver(f.linea);      // historial (over %)
      if (pM == null || pB == null) continue;
      const dif = (pM - pB / 100) * 100;
      if (Math.abs(dif) >= 20) {
        const linea = `Más de ${f.linea} goles`;
        const dirM = pM > pB / 100 ? 'modelo arriba' : 'modelo abajo';
        divergencias.push(`${linea}: modelo ${Math.round(pM * 100)}% contra historial ${pB}% (${dirM} ${Math.round(Math.abs(dif))}pp).`);
      } else if (Math.abs(dif) < 5) {
        const linea = `Más de ${f.linea} goles`;
        coincidencias.push(`${linea}: modelo ${Math.round(pM * 100)}% e historial ${pB}% coinciden.`);
      }
    }
  }
  for (const c of coincidencias.slice(0, 2)) oportunidades.push(`${c}`);
  for (const d of divergencias.slice(0, 3)) riesgos.push(`${d}`);

  if (h.cuadros?.generalLocal?.n && h.cuadros.generalLocal.n < 4)
    riesgos.push(`Poca historia del local en la temporada vigente (${h.cuadros.generalLocal.n} partidos).`);

  // Recomendacion: la apuesta principal = el primer pronostico; si no hay
  // modelo de goles o el historial es corto, se marca la calidad.
  const recomendacion = pro[0] ?? null;
  const calidadNotas = () => {
    const notas = [];
    if (partido.lambdaHome != null && partido.lambdaAway != null &&
        (partido.lambdaHome + partido.lambdaAway) > 5) {
      notas.push('λ total alta');
    }
    const deL = h.cuadros?.generalLocal?.gfDe ?? null;
    const promL = h.cuadros?.generalLocal?.gfProm ?? null;
    if (deL != null && promL != null && deL > promL * 1.25) notas.push('goles irregulares en la base');
    if ((h.cuadros?.generalLocal?.n ?? 0) < 4) notas.push('historial corto de la temporada');
    return notas.length ? `Calidad de datos media: ${notas.join(' y ')}.` : 'Calidad de datos buena.';
  };
  const calidad = calidadNotas();

  return {
    combinado: {
      // Se inclina (combinada). orienta, no garantiza.
      inclina: ladoNombre[inclina],
      pCombinada: Number((pComb[inclina] ?? 0).toFixed(4)),
      confianza: pComb[inclina] >= 0.75 ? 'alta' : pComb[inclina] >= 0.6 ? 'media' : 'baja',
      fuentes: usados,
      pesos: { modelo: 1, base: 0, h2h: 0 },
      // 1X2: modelo, historial y combinada
      tabla: ['H', 'D', 'A'].map(l => ({
        lado: l,
        modelo: Number((probs[l] ?? 0).toFixed(4)),
        historial: Number((pBase?.[l] ?? 0).toFixed(4)),
        combinada: Number((pComb[l] ?? 0).toFixed(4)),
      })),
      recomendacion: recomendacion,
      // Alternativa segura: el mercado con menor dispersion modelo-hist historial.
      alternativa: pro[1] ?? null,
      demasPronosticos: pro.slice(2),
      // "Evita": los mercados donde modelo e historial NO coinciden.
      evitar: divergencias,
      coinciden: coincidencias,
      calidad: calidad,
      pronosticos: pro,
      oportunidades: oportunidades.slice(0, 6),
      riesgos: riesgos.slice(0, 6),
      cuotaJusta: cuotaJusta,
      serieH2H: h.serieH2H ?? [],
      h2hPartidos: h.h2hPartidos ?? 0,
      serieH2HCasa: h.serieH2HCasa ?? [],
      h2hCasaPartidos: h.h2hCasaPartidos ?? 0,
      temporadaVigente: h.temporadaVigente ?? null,
      // Datos de base (cuadros reales)
      cuadros: h.cuadros,
      puntos: h.puntos,
      pesoEstadio: h.pesoEstadio,
      patrones: h.patrones,
      tendencias: h.tendencias,
      // `lectura` lo arma historial.mjs, pero se perdia al copiar campo por
      // campo: la pestana Tendencias la busca y nunca la encontraba.
      lectura: h.lectura ?? null,
    },
  };
};


