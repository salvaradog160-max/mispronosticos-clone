/**
 * Backtest walk-forward y metricas de calibracion.
 *
 * Regla de oro: para cada partido solo se usan los partidos ANTERIORES.
 * Si el rating de un equipo incluye partidos que aun no se jugaban, el
 * resultado es una backtest envenenada y no dice nada.
 */
import { buildRatings, predictMatch } from './ratings.mjs';

const hasScore = m => Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore);

export const sortByDate = matches =>
  [...matches].sort((a, b) => new Date(a.utcDate ?? a.date ?? 0) - new Date(b.date ? b.date : b.utcDate ?? 0));

/**
 * Corre el modelo partido por partido usando solo historico previo.
 *
 * @returns {{n:number, evaluated:Array, skipped:number}}
 */
export const walkForward = (matches, { minHistory = 40, markets = ['1X2', 'TOTAL', 'BTTS'] } = {}) => {
  const ordered = sortByDate(matches);
  const evaluated = [];
  let skipped = 0;

  for (let i = minHistory; i < ordered.length; i++) {
    const fixture = ordered[i];
    if (!hasScore(fixture)) continue;

    const history = ordered.slice(0, i).filter(hasScore);
    const ratings = buildRatings(history);
    const prediction = predictMatch(ratings, fixture);

    if (!prediction.known) {
      skipped += 1;
      continue;
    }

    const actual = {
      home: fixture.homeScore,
      away: fixture.awayScore,
      total: fixture.homeScore + fixture.awayScore,
    };

    evaluated.push({
      date: fixture.utcDate ?? fixture.date ?? null,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      actual,
      predicted: {
        oneXTwo: prediction.oneXTwo,
        over25: prediction.over25,
        under25: prediction.under25,
        btts: prediction.btts,
        lambdaHome: prediction.lambdaHome,
        lambdaAway: prediction.lambdaAway,
      },
    });
  }

  return { n: evaluated.length, evaluated, skipped };
};

/**
 * Aciertos y acierto por mercado. Se evalua solo la prediccion mas probable
 * de cada mercado (no el mercado completo), que es como se consume el pick.
 */
export const hitRates = (evaluated) => {
  const tally = { '1X2': { hits: 0, total: 0 }, TOTAL: { hits: 0, total: 0 }, BTTS: { hits: 0, total: 0 } };

  for (const row of evaluated) {
    const { actual, predicted } = row;

    const outcomes = [
      ['H', actual.home > actual.away],
      ['D', actual.home === actual.away],
      ['A', actual.home < actual.away],
    ];
    const best = outcomes.reduce((a, b) => (predicted.oneXTwo[a[0]] >= predicted.oneXTwo[b[0]] ? a : b));
    tally['1X2'].total += 1;
    if (best[1]) tally['1X2'].hits += 1;

    const overHits = actual.total > 2.5;
    const predictOver = predicted.over25 >= predicted.under25;
    tally.TOTAL.total += 1;
    if (predictOver === overHits) tally.TOTAL.hits += 1;

    tally.BTTS.total += 1;
    const predictBtts = predicted.btts >= 0.5;
    const actualBtts = actual.home > 0 && actual.away > 0;
    if (predictBtts === actualBtts) tally.BTTS.hits += 1;
  }

  const out = {};
  for (const [market, { hits, total }] of Object.entries(tally)) {
    out[market] = { hits, total, rate: total > 0 ? hits / total : null };
  }
  return out;
};

/**
 * Brier score multiclase sobre 1X2. Mas bajo es mejor.
 * 1.0 es "predecir siempre la misma clase".
 */
export const brierScore = evaluated => {
  if (evaluated.length === 0) return null;
  let sum = 0;
  for (const { actual, predicted } of evaluated) {
    const truth = {
      H: actual.home > actual.away ? 1 : 0,
      D: actual.home === actual.away ? 1 : 0,
      A: actual.home < actual.away ? 1 : 0,
    };
    const { H, D, A } = predicted.oneXTwo;
    sum += (H - truth.H) ** 2 + (D - truth.D) ** 2 + (A - truth.A) ** 2;
  }
  return sum / evaluated.length;
};

/**
 * Curva de calibracion: para cada tramo de probabilidad, que porcentaje real
 * ocurrio. Si el modelo esta bien calibrado, real ~ probabilidad.
 */
export const calibration = (evaluated, buckets = [0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 1.01]) => {
  const rows = [];
  for (let i = 0; i < buckets.length - 1; i++) {
    const lo = buckets[i];
    const hi = buckets[i + 1];
    const slice = evaluated.filter(row => {
      const { H, D, A } = row.predicted.oneXTwo;
      const top = Math.max(H, D, A);
      return top >= lo && top < hi;
    });
    if (slice.length === 0) {
      rows.push({ lo, hi, n: 0, predicted: null, observed: null });
      continue;
    }
    let hits = 0;
    let predictedSum = 0;
    for (const row of slice) {
      const probs = row.predicted.oneXTwo;
      predictedSum += Math.max(probs.H, probs.D, probs.A);
      const outcomes = [
        ['H', row.actual.home > row.actual.away],
        ['D', row.actual.home === row.actual.away],
        ['A', row.actual.home < row.actual.away],
      ];
      const best = outcomes.reduce((a, b) => (probs[a[0]] >= probs[b[0]] ? a : b));
      if (best[1]) hits += 1;
    }
    rows.push({ lo, hi, n: slice.length, predicted: predictedSum / slice.length, observed: hits / slice.length });
  }
  return rows;
};

/**
 * Baseline: predecir siempre H, siempre D, siempre A.
 * Si el modelo no le gana a la mejor de las tres, no esta aportando nada.
 */
export const baselines = evaluated => {
  const counts = { H: 0, D: 0, A: 0 };
  for (const { actual } of evaluated) {
    if (actual.home > actual.away) counts.H += 1;
    else if (actual.home === actual.away) counts.D += 1;
    else counts.A += 1;
  }
  const n = evaluated.length || 1;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]));
};

/**
 * Reporte completo. Incluye una lectura honesta de si el modelo bate al azar.
 */
/**
 * Z de dos proporciones: mide si el acierto supera a la baseline por mas
 * que el ruido esperado. Devuelve z, p-valor aproximado y margen de confianza.
 */
export const significance = (hits, total, baselineRate) => {
  if (total === 0) return null;
  const rate = hits / total;
  const se = Math.sqrt((baselineRate * (1 - baselineRate)) / total);
  if (se === 0) return null;
  const z = (rate - baselineRate) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const halfWidth = 1.96 * se;
  return {
    rate,
    baseline: baselineRate,
    z: Number(z.toFixed(3)),
    pValue: Number(pValue.toFixed(4)),
    margen95: [Number((rate - halfWidth).toFixed(4)), Number((rate + halfWidth).toFixed(4))],
  };
};

/** Aproximacion de la CDF normal (Abramowitz-Stegun 7.1.26). */
const normalCdf = z => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
};

export const report = evaluated => {
  const rates = hitRates(evaluated);
  const brier = brierScore(evaluated);
  const base = baselines(evaluated);
  const bestBaseline = Math.max(...Object.values(base));
  const oneXTwo = rates['1X2'];
  const stats = significance(oneXTwo.hits, oneXTwo.total, bestBaseline);

  const MIN_N = 200;
  const MAX_P = 0.05;

  let verdict;
  if (oneXTwo.total < MIN_N) {
    verdict = {
      bateAlAzar: false,
      pValue: null,
      nota: `Muestra insuficiente (${oneXTwo.total}/${MIN_N}). No se puede concluir nada.`,
    };
  } else if (!stats || stats.pValue > MAX_P) {
    verdict = {
      bateAlAzar: false,
      pValue: stats?.pValue ?? null,
      nota: `NO supera a la baseline de forma significativa (p=${stats?.pValue}). La diferencia cae dentro del ruido.`,
    };
  } else if (stats.rate <= stats.baseline) {
    verdict = {
      bateAlAzar: false,
      pValue: stats.pValue,
      nota: `Es PEOR que la baseline (${(stats.rate * 100).toFixed(1)}% vs ${(stats.baseline * 100).toFixed(1)}%), y la diferencia es significativa.`,
    };
  } else {
    verdict = {
      bateAlAzar: true,
      pValue: stats.pValue,
      nota: `Supera a la baseline con p=${stats.pValue}, por debajo del umbral ${MAX_P}. Margen real: +${((stats.rate - stats.baseline) * 100).toFixed(1)} pp.`,
    };
  }

  return {
    n: evaluated.length,
    rates,
    brier,
    baselines: base,
    significance: stats,
    calibration: calibration(evaluated),
    veredicto: {
      oneXTwoRate: oneXTwo.rate,
      mejorBaseline: bestBaseline,
      ...verdict,
    },
  };
};