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