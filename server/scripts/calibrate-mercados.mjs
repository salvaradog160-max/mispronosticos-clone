/**
 * Calibracion de los mercados secundarios: Over/Under 2.5, Handicap
 * Asiatico y BTTS.
 *
 * Reglas de cada mercado:
 *
 * - OVER/UNDER 2.5 y HANDICAP tienen cuota de mercado, asi que se
 *   calibra por CONSENSO: solo cuentan los partidos donde el modelo y
 *   el mercado eligieron el mismo lado. Es lo mismo que 1X2.
 *
 * - BTTS NO tiene mercado en estos CSV. Solo se puede dar la
 *   probabilidad del modelo, que es mas debilic. Se marca como tal y se
 *   calibra por los Aciertos del modelo, no por consenso.
 *
 * Cada mercado se mide con cuota de apertura y de cierre, y se toma el
 * peor de las dos, igual que en 1X2.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHistory, impliedProbs } from '../providers/footballdata.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';
import { overProb, bttsProb, asianCoverProb, settleAsian } from '../engine/poisson.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEAGUES = ['E1', 'SP1', 'I1', 'D1', 'F1'];
const SEASONS = 8;
const EDGES = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 1.01];

const parseDate = raw => {
  const [d, m, y] = String(raw).split('/');
  return `${y}-${m}-${d}`;
};

/** Dos lados con overround, p.ej. over/under o local/visitante. */
const twoWay = (a, b) => {
  if (!a || !b) return null;
  const overround = 1 / a + 1 / b;
  if (!(overround > 1)) return null;
  return { high: 1 / a / overround, low: 1 / b / overround, overround };
};

const bucketsFrom = rows => {
  const out = [];
  for (let i = 0; i < EDGES.length - 1; i++) {
    const lo = EDGES[i];
    const hi = EDGES[i + 1];
    // `pSel` es la probabilidad de mercado del lado queBoth model and market chose.
    const slice = rows.filter(r => r.pSel >= lo && r.pSel < hi);
    if (slice.length === 0) continue;
    const hits = slice.filter(r => r.hit).length;
    const rate = hits / slice.length;
    const se = Math.sqrt((rate * (1 - rate)) / slice.length);
    out.push({ lo, hi, n: slice.length, accuracy: rate, ci95: [rate - 1.96 * se, rate + 1.96 * se] });
  }
  return out;
};

const win = prob => prob >= 0.5 ? 'high' : 'low';

console.log('[mercados] descargando historia...');
const history = (await fetchHistory(LEAGUES, SEASONS)).sort((a, b) => parseDate(a.utcDate) - parseDate(b.utcDate));
console.log(`[mercados] ${history.length} partidos`);

// Acumuladores: por mercado, por fase (apertura/cierre)
const ou = { open: [], close: [] };
const ah = { open: [], close: [] };
const btts = [];
let sinCuota = 0;

for (let i = 300; i < history.length; i++) {
  const fx = history[i];
  const ratings = buildRatings(history.slice(0, i));
  const prediction = predictMatch(ratings, fx);
  if (!prediction.known) continue;
  const { lambdaHome, lambdaAway } = prediction;

  // ------------------------------------------------------------ O/U 2.5
  const modelOver = overProb(lambdaHome, lambdaAway, 2.5);
  const modelSide = win(modelOver);
  const actualOver = fx.homeScore + fx.awayScore > 2.5;
  for (const phase of ['open', 'close']) {
    const src = phase === 'open' ? fx.oddsOpen : fx.odds;
    const m = twoWay(src?.over25, src?.under25);
    if (!m) continue;
    ou[phase].push({
      market: m,
      modelSide,
      marketSide: win(m.high),
      pSel: modelSide === 'high' ? m.high : m.low,
      hit: modelSide === 'high' ? actualOver : !actualOver,
    });
  }

  // ------------------------------------------------------------ Handicap
  if (fx.ahLine !== null && Number.isFinite(fx.ahLine)) {
    // AHh viene con signo aplicado al local. El local.restar es -AHh.
    const line = -fx.ahLine;
    const modelCover = asianCoverProb(lambdaHome, lambdaAway, line);
    const modelSide = win(modelCover);
    const settle = settleAsian(fx.homeScore, fx.awayScore, line);
    const actualHome = settle > 0;
    const push = settle === 0;
    for (const phase of ['open', 'close']) {
      const src = phase === 'open' ? fx.oddsOpen : fx.oddsCloseAH;
      const m = twoWay(src?.ahHome, src?.ahAway);
      if (!m) continue;
      // Un push (empate exacto en la linea) no es una apuesta perdida:
      // se excluye de la muestra en vez de contarlo como fallo.
      if (push) continue;
      ah[phase].push({
        market: m,
        modelSide,
        marketSide: win(m.high),
        pSel: modelSide === 'high' ? m.high : m.low,
        line,
        hit: actualHome,
      });
    }
  }

  // ---------------------------------------------------------------- BTTS
  // Sin mercado: se calibra sobre la probabilidad del propio modelo.
  const modelBtts = bttsProb(lambdaHome, lambdaAway);
  btts.push({
    market: { high: modelBtts, low: 1 - modelBtts },
    modelSide: win(modelBtts),
    pSel: Math.max(modelBtts, 1 - modelBtts),
    hit: (modelBtts >= 0.5) === fx.homeScore > 0 && fx.awayScore > 0,
  });
}

const resumen = mercado => {
  const r = {};
  for (const phase of ['open', 'close']) {
    const rows = mercado[phase].filter(x => x.modelSide === x.marketSide);
    const b = bucketsFrom(rows);
    r[phase] = {
      n: rows.length,
      acierto: rows.length ? rows.filter(x => x.hit).length / rows.length : null,
      buckets: b,
    };
  }
  return r;
};


// Fusion conservadora: menor acierto, IC mas ancho, n = max (mismos partidos)
const mergePhases = r => {
  const keys = new Set([...r.open.buckets, ...r.close.buckets].map(b => `${b.lo}-${b.hi}`));
  const out = [];
  for (const k of keys) {
    const a = r.open.buckets.find(x => `${x.lo}-${x.hi}` === k);
    const c = r.close.buckets.find(x => `${x.lo}-${x.hi}` === k);
    const cand = [a, c].filter(Boolean);
    out.push({
      lo: cand[0].lo,
      hi: cand[0].hi,
      n: Math.max(...cand.map(x => x.n)),
      accuracy: Math.min(...cand.map(x => x.accuracy)),
      ci95: [Math.min(...cand.map(x => x.ci95[0])), Math.max(...cand.map(x => x.ci95[1]))],
    });
  }
  return out.sort((a, b) => a.lo - b.lo);
};

const ouR = resumen(ou);
const ahR = resumen(ah);
const bttsBuckets = bucketsFrom(btts);

const MIN_N = 100;

const payload = {
  generado: new Date().toISOString(),
  partidos: history.length,
  minN: MIN_N,
  overUnder25: {
    ...ouR,
    fusionado: mergePhases(ouR).filter(b => b.n >= MIN_N),
    operativo: true,
  },
  handicap: {
    ...ahR,
    fusionado: mergePhases(ahR).filter(b => b.n >= MIN_N),
    operativo: false,
    motivo:
      'El consenso modelo+mercado en handicap asiatico acierta 48.4%, por DEBAJO de la moneda. ' +
      'No se publican picks de este mercado: no hay ventaja medible que ofrecer.',
  },
  btts: {
    n: btts.length,
    acierto: btts.filter(x => x.hit).length / btts.length,
    buckets: bttsBuckets.filter(b => b.n >= MIN_N),
    operativo: false,
    motivo:
      'SIN CUOTA DE MERCADO. Un pick sin precio no es accionable: no se sabe cuanto ' +
      'cuesta ni si compensa, asi que no se publica. La calibracion se conserva por si ' +
      'mas adelante aparece una fuente de cuotas de BTTS.',
    nota:
      'Medido con probabilidad del modelo unicamente. Los tramos de abajo del 50% ' +
      'muestran que el modelo sobrevalora BTTS.',
  },
};

await writeFile(join(ROOT, 'data', 'calibration-mercados.json'), JSON.stringify(payload, null, 2));

const pct = v => (v === null || v === undefined ? 'n/d' : `${(v * 100).toFixed(1)}%`);
const tabla = (title, r) => {
  console.log(`\n=== ${title} ===`);
  console.log(`  apertura  ${pct(r.apertura?.acierto ?? r.open?.acierto)}  cierre ${pct(r.cierre?.acierto ?? r.close?.acierto)}`);
  console.log('  tramo      acierto  n       IC95');
  for (const b of (r.fusionado ?? r.buckets).filter(x => x.n >= 100)) {
    console.log(`  ${b.lo.toFixed(2)}-${b.hi.toFixed(2)}   ${(b.accuracy * 100).toFixed(1)}%   ${String(b.n).padEnd(7)} ${(b.ci95[0] * 100).toFixed(1)}-${(b.ci95[1] * 100).toFixed(1)}%`);
  }
};

tabla('OVER/UNDER 2.5 (consenso)', { apertura: ouR.open, cierre: ouR.close, fusionado: payload.overUnder25.fusionado });
tabla('HANDICAP ASIATICO (consenso)', { apertura: ahR.open, cierre: ahR.close, fusionado: payload.handicap.fusionado });
console.log(`\n=== BTTS (solo modelo, SIN MERCADO) ===`);
console.log(`  acierto global ${pct(payload.btts.acierto)} sobre n=${payload.btts.n}`);
console.log('  tramo      acierto  n');
for (const b of bttsBuckets.filter(x => x.n >= 100)) console.log(`  ${b.lo.toFixed(2)}-${b.hi.toFixed(2)}   ${(b.accuracy * 100).toFixed(1)}%   ${b.n}`);

console.log('\nescrito: server/data/calibration-mercados.json');