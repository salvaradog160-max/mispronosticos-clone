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
import { combinar, riesgoDe, pronosticos as pronosticosDe, cuotaJusta } from './historial.mjs';

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
    ladder: ladderMercados(partido.lambdaHome, partido.lambdaAway),

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
 * y el H2H y produce: combinada 50/30/20, riesgo, pronosticos,
 * oportunidades y riesgos. Si no, null.
 */
const historialCombinado = (partido, probs) => {
  const h = partido.historial;
  if (!h) return { combinado: null };

  const { pBase, pH2H } = h.probs ?? {};
  const pModelo = probs;

  // Combinada pedida: 50% modelo, 30% cuadro base (ult.5 L/V), 20% H2H L/V.
  const { pComb, usados } = combinar(pModelo, pBase, pH2H);
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
  if (pts.localCasa && pts.localGral && pmt(pts.localCasa) - pmt(pts.localGral) >= 0.3)
    oportunidades.push(`El local rinde mejor en casa (${pmt(pts.localCasa)} vs ${pmt(pts.localGral)} pts por partido).`);
  if (pts.visitaFuera && pts.visitaGral && pmt(pts.visitaFuera) - pmt(pts.visitaGral) <= -0.3)
    oportunidades.push(`La visita baja fuera de casa (${pmt(pts.visitaFuera)} vs ${pmt(pts.visitaGral)} pts por partido).`);
  if (pts.localCasa && pts.visitaFuera && pmt(pts.localCasa) - pmt(pts.visitaFuera) >= 1)
    oportunidades.push(`Forma últ. 5 L/V: ${pts.localCasa.pts} pts local vs ${pts.visitaFuera.pts} visita. Respalda a Local.`);
  if (pts.localGral && pts.visitaGral && pmt(pts.localGral) - pmt(pts.visitaGral) >= 1)
    oportunidades.push(`Forma últ. 5 General: ${pts.localGral.pts} pts local vs ${pts.visitaGral.pts} visita. Respalda a Local.`);
  if (h.patrones?.visitaFuera?.some(p => p.includes('sin ganar')))
    oportunidades.push(`Patrón Visita: ${h.patrones.visitaFuera.find(p => p.includes('sin ganar'))}.`);

  if (pts.localCasa && pts.localGral && pmt(pts.localCasa) - pmt(pts.localGral) <= -0.3)
    riesgos.push(`El local rinde menos en casa (${pmt(pts.localCasa)} vs ${pmt(pts.localGral)} pts por partido).`);
  if (h.patrones?.visitaFuera?.some(p => p.includes('anotó')))
    riesgos.push(`Patrón Visita: ${h.patrones.visitaFuera.find(p => p.includes('anotó'))}.`);
  if (!h.cuadros?.generalLocal?.n || h.cuadros.generalLocal.n < 4)
    riesgos.push(`Poca historia del local en la base (${h.cuadros?.generalLocal?.n ?? 0} de 5 partidos).`);

  return {
    combinado: {
      // Se inclina (combinada). orienta, no garantiza.
      inclina: ladoNombre[inclina],
      pCombinada: Number((pComb[inclina] ?? 0).toFixed(4)),
      confianza: pComb[inclina] >= 0.75 ? 'alta' : pComb[inclina] >= 0.6 ? 'media' : 'baja',
      fuentes: usados,
      pesos: { modelo: 0.5, base: 0.3, h2h: 0.2 },
      // 1X2: modelo, historial y combinada
      tabla: ['H', 'D', 'A'].map(l => ({
        lado: l,
        modelo: Number((probs[l] ?? 0).toFixed(4)),
        historial: Number((pBase?.[l] ?? 0).toFixed(4)),
        combinada: Number((pComb[l] ?? 0).toFixed(4)),
      })),
      recomendacion: pro[0] ?? null,
      pronosticos: pro,
      oportunidades: oportunidades.slice(0, 5),
      riesgos: riesgos.slice(0, 5),
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
    },
  };
};


