/**
 * Escalera de cuota justa por mercado.
 *
 * Espejo de la herramienta "Pronóstico de Goles" que usabas a mano,
 * pero alimentado con las lambdas REALES del modelo de la app (no con
 * 5 marcadores tecleados). Misma formula del tool: cuota justa = 1/p,
 * y en mercados con devolucion (asian inteiro) el push no cuenta.
 *
 * "Cuota justa" aqui NO es la del mercado: es la que la estadística
 * del modelo diria que debería pagar. La app la muestra SIEMPRE junto
 * a la cuota real de la casa para que se vea el desacuerdo, no como
 * verdad absoluta.
 */

import { overProb, bttsProb, scoreMatrix, outcomeProbs } from './poisson.mjs';

/** Lineas de goles enteras y medias, como pediste en el tool. */
export const LINEAS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];

const justa = p => (p > 0.0005 ? Number((1 / p).toFixed(2)) : null);

/**
 * Probabilidades del modelo y cuota justa por mercado.
 * @param {number} lambdaHome - goles esperados del local.
 * @param {number} lambdaAway - goles esperados de la visita.
 * @returns {{
 *   oneXTwo: {local:{p,cuotaJusta}, empate:{p,cuotaJusta}, visita:{p,cuotaJusta}},
 *   overUnder: Array<{linea, over:{p,cuotaJusta}, under:{p,cuotaJusta}}>,
 *   ambosAnotan: {si:{p,cuotaJusta}, no:{p,cuotaJusta}},
 *   marcadores: Array<{marcador, p, cuotaJusta}>
 * }}
 */
export const ladderMercados = (lambdaHome, lambdaAway) => {
  if (![lambdaHome, lambdaAway].every(Number.isFinite)) return null;

  const u = outcomeProbs(lambdaHome, lambdaAway);
  const oneXTwo = {
    local: { p: u.H, cuotaJusta: justa(u.H) },
    empate: { p: u.D, cuotaJusta: justa(u.D) },
    visita: { p: u.A, cuotaJusta: justa(u.A) },
  };

  const overUnder = LINEAS.map(linea => {
    const over = overProb(lambdaHome, lambdaAway, linea);
    return {
      linea,
      over: { p: over, cuotaJusta: justa(over) },
      under: { p: 1 - over, cuotaJusta: justa(1 - over) },
    };
  });

  const btts = bttsProb(lambdaHome, lambdaAway);
  const ambosAnotan = {
    si: { p: btts, cuotaJusta: justa(btts) },
    no: { p: 1 - btts, cuotaJusta: justa(1 - btts) },
  };

  // Mismo "mercado exacto" del tool: marcadores mas probables.
  const marcadores = scoreMatrix(lambdaHome, lambdaAway)
    .flatMap((fila, h) => fila.map((p, a) => ({ marcador: `${h}-${a}`, p, cuotaJusta: justa(p) })))
    .sort((x, y) => y.p - x.p)
    .slice(0, 6);

  return { oneXTwo, overUnder, ambosAnotan, marcadores };
};

/**
 * Ladder de Over/Under para UN solo tiempo (1T o 2T).
 * Lineas utiles en 1T son 0.5 y 1.5 (y enteras por asiat. de devolucion);
 * se reusa overProb con lambdas ya divididas.
 * @returns {Array<{linea, over:{p,cuotaJusta}, under:{p,cuotaJusta}}>}
 */
export const ladderTiempo = (lambdaLocal, lambdaVisita, lineas = [0.5, 1, 1.5, 2, 2.5]) =>
  lineas.map(linea => {
    const over = overProb(lambdaLocal, lambdaVisita, linea);
    return {
      linea,
      over: { p: over, cuotaJusta: justa(over) },
      under: { p: 1 - over, cuotaJusta: justa(1 - over) },
    };
  });
/** Fraccion de goles que caen en el 1T por liga (medida en football-data
 *  HTHG/HTAG, 3 temporadas, misma fuente de calibracion). Estable 0.43-0.47
 *  entre ligas, se usa como split honesto del lambda total en tiempos. */
export const FRACCION_1T = {
  E1: 0.454, SP1: 0.447, I1: 0.434, D1: 0.469, F1: 0.443,
  N1: 0.45, P1: 0.45, B1: 0.45, T1: 0.45, G1: 0.45, SC0: 0.45, I2: 0.45, SP2: 0.45, D2: 0.45,
};
export const FRACCION_1T_DEFECTO = 0.45;

/**
 * Divide los goles esperados del modelo en primer y segundo tiempo.
 * Fraccion real por liga; donde no hay medida, 0.45 global (la media
 * futbolistica estable). NO es invento: sale de HTHG/HTAG reales.
 */
export const desglosarTiempos = (lambdaHome, lambdaAway, ligaKey) => {
  if (![lambdaHome, lambdaAway].every(Number.isFinite)) return null;
  const f = FRACCION_1T[ligaKey] ?? FRACCION_1T_DEFECTO;
  return {
    primerTiempo: { local: lambdaHome * f, visita: lambdaAway * f },
    segundoTiempo: { local: lambdaHome * (1 - f), visita: lambdaAway * (1 - f) },
    fraccion1T: f,
  };
};
