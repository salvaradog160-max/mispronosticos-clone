/**
 * Modelo de goles Poisson bivariado independiente.
 *
 * Solo matematica pura: sin I/O, sin estado, sin dependencias.
 * Se prueba con node --test.
 */

const MAX_GOALS = 15;

const FACTORIAL = (() => {
  const f = [1];
  for (let i = 1; i <= MAX_GOALS; i++) f[i] = f[i - 1] * i;
  return f;
})();

/**
 * pmf de Poisson: P(X=k | lambda)
 */
export const poissonPmf = (k, lambda) => {
  if (k < 0 || !Number.isInteger(k)) throw new Error(`k invalido: ${k}`);
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k > MAX_GOALS) return 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FACTORIAL[k];
};

/**
 * Vector de probabilidad de goles 0..MAX_GOALS.
 * Suma ~1 porque se trunca a MAX_GOALS; con lambda menor a 6 la cola es despreciable.
 */
export const poissonDistribution = lambda => {
  const out = [];
  for (let k = 0; k <= MAX_GOALS; k++) out.push(poissonPmf(k, lambda));
  return out;
};

/**
 * Matriz de resultados. rows = goles local, cols = goles visitante.
 */
export const scoreMatrix = (lambdaHome, lambdaAway) => {
  const ph = poissonDistribution(lambdaHome);
  const pa = poissonDistribution(lambdaAway);
  const rows = [];
  for (let h = 0; h <= MAX_GOALS; h++) {
    const row = [];
    for (let a = 0; a <= MAX_GOALS; a++) row.push(ph[h] * pa[a]);
    rows.push(row);
  }
  return rows;
};

const normalize = obj => {
  const total = Object.values(obj).reduce((sum, v) => sum + v, 0);
  if (total <= 0) throw new Error('probabilidades degeneradas');
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v / total;
  return out;
};

/**
 * Probabilidades de 1X2 con Dixon-Coles aplicado por deficit bajo.
 * Sin la correccion, el modelo subestima el empate y sobreestima el 0-0/1-1/2-2.
 */
export const outcomeProbs = (lambdaHome, lambdaAway, rho = -0.03) => {
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const adjusted = matrix.map(row => [...row]);

  const dc = (h, a) => {
    if (h > 2 || a > 2) return 1;
    if (h === 0 && a === 0) return 1 - lambdaHome * lambdaAway * rho;
    if (h === 0 && a === 1) return 1 + lambdaHome * rho;
    if (h === 1 && a === 0) return 1 + lambdaAway * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
  };

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) adjusted[h][a] = matrix[h][a] * dc(h, a);
  }

  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      if (h > a) home += adjusted[h][a];
      else if (h === a) draw += adjusted[h][a];
      else away += adjusted[h][a];
    }
  }
  return normalize({ H: home, D: draw, A: away });
};

/**
 * P(goles totales > line). line puede ser 2.5, 3.5, etc.
 */
export const overProb = (lambdaHome, lambdaAway, line = 2.5) => {
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  let over = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      if (h + a > line) over += matrix[h][a];
    }
  }
  return Math.min(1, over);
};

/**
 * P(ambos equipos anotan).
 */
export const bttsProb = (lambdaHome, lambdaAway) => {
  const homeZero = Math.exp(-lambdaHome);
  const awayZero = Math.exp(-lambdaAway);
  return Math.min(1, 1 - homeZero - awayZero + homeZero * awayZero);
};

/**
 * Handicap asiatico por goles. Devuelve la probabilidad de que el local
 * cubra el handicap (positivo = local resta goles).
 */
export const handicapProb = (lambdaHome, lambdaAway, line = 0) => {
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  let cover = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const diff = h - a + line;
      if (diff >= 0) cover += matrix[h][a];
      else cover += matrix[h][a] / 2;
    }
  }
  return cover;
};

/**
 * Liquida un handicap asiatico. `line` positivo = el local resta esa
 * cantidad de goles. Devuelve 1 (gana), 0 (empate/void), -1 (pierde), y
 * +-0.5 para medio-ganeo / media-pérdida en líneas de cuarto.
 */
export const settleAsian = (homeScore, awayScore, line) => {
  const quarter = Math.abs(line * 2) % 1 !== 0;
  if (quarter) {
    // x.25 -> (x.0, x.5) ; x.75 -> (x.5, x+1.0)
    const lower = Math.floor(line * 2) / 2;
    return (settleAsian(homeScore, awayScore, lower) + settleAsian(homeScore, awayScore, lower + 0.5)) / 2;
  }
  const diff = homeScore - awayScore - line;
  if (diff > 0) return 1;
  if (diff === 0) return 0;
  return -1;
};

/**
 * Probabilidad de que el local cubra un handicap asiatico, contando el
 * empate como 0.5. Maneja lineas de cuarto partiendo el stake.
 */
export const asianCoverProb = (lambdaHome, lambdaAway, line) => {
  const quarter = Math.abs(line * 2) % 1 !== 0;
  if (quarter) {
    const lower = Math.floor(line * 2) / 2;
    return (asianCoverProb(lambdaHome, lambdaAway, lower) + asianCoverProb(lambdaHome, lambdaAway, lower + 0.5)) / 2;
  }
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  let cover = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const diff = h - a - line;
      if (diff > 0) cover += matrix[h][a];
      else if (diff === 0) cover += matrix[h][a] / 2;
    }
  }
  return cover;
};

/**
 * Goles esperados (xG) de un partido a partir de los ratings de equipo.
 *
 * attack  = poder ofensivo relativo a la media de la liga (>1 mejor)
 * defense = poder defensivo relativo a la media de la liga (>1 peor)
 */
export const expectedGoals = ({ leagueAvgHome, leagueAvgAway, homeAttack, awayAttack, homeDefense, awayDefense, homeAdvantage = 1.08 }) => {
  const lambdaHome = leagueAvgHome * homeAttack * awayDefense * homeAdvantage;
  const lambdaAway = leagueAvgAway * awayAttack * homeDefense;
  return { lambdaHome, lambdaAway };
};

/**
 * Confianza NO es "probabilidad de acertar". Es una medida de cuan dominante
 * es el pronostico, derivada de cuan lejos esta la probabilidad del lado
 * favorito de ser la mas alta. Se reporta siempre junto a la probabilidad
 * cruda para que no se confunda.
 */
export const dominanceConfidence = probs => {
  const sorted = Object.values(probs).sort((a, b) => b - a);
  return sorted[0] - sorted[1];
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Estrellas: mapeo por tramos de probabilidad del lado elegido.
 * El original usa 4 estrellas como puerta de "Top AI"; aqui 4+ es alta confianza.
 */
export const starsFromProbability = probability => {
  if (probability >= 0.62) return 5;
  if (probability >= 0.55) return 4;
  if (probability >= 0.48) return 3;
  if (probability >= 0.42) return 2;
  return 1;
};