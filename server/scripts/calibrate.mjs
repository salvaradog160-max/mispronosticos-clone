/**
 * Calibracion medida sobre historico real con cuotas de mercado.
 *
 * Responde: cuando el modelo y el mercado coinciden en un lado, y el
 * mercado le pone probabilidad P, que porcentaje REAL se acertó?
 *
 * Eso es lo unico que la app puede mostrar con honestidad. No es la
 * probabilidad del modelo (que es peor que el mercado), es la empirica.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUES_HISTORIA } from '../config/ligas.mjs';
import { fetchHistory, impliedProbs } from '../providers/footballdata.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';
import { calibrateConsensus, consistencyGroups, measuredAccuracy } from '../engine/calibration.mjs';

const LEAGUES = LEAGUES_HISTORIA;
const SEASONS = 8;

const parseDate = raw => {
  const [d, m, y] = String(raw).split('/');
  return `${y}-${m}-${d}`;
};

console.log(`[cal] descargando ${LEAGUES.length} ligas x ${SEASONS} temporadas...`);
const matches = (await fetchHistory(LEAGUES, SEASONS)).filter(
  m => m.odds?.H && m.odds?.D && m.odds?.A,
);
console.log(`[cal] partidos con cuotas: ${matches.length}`);

const ordered = [...matches].sort((a, b) => parseDate(a.utcDate) - parseDate(b.utcDate));

const rows = [];
for (let i = 300; i < ordered.length; i++) {
  const fx = ordered[i];
  const ratings = buildRatings(ordered.slice(0, i));
  const prediction = predictMatch(ratings, fx);
  if (!prediction.known) continue;

  const market = impliedProbs(fx.odds);
  if (!market) continue;

  const model = prediction.oneXTwo;
  const modelTop = Object.entries(model).sort((a, b) => b[1] - a[1])[0][0];
  const marketTop = Object.entries(market)
    .filter(([k]) => k !== 'overround')
    .sort((a, b) => b[1] - a[1])[0][0];

  rows.push({
    league: fx.league,
    date: fx.utcDate,
    model,
    market,
    modelTop,
    marketTop,
    actual: fx.homeScore > fx.awayScore ? 'H' : fx.homeScore === fx.awayScore ? 'D' : 'A',
    edge: model[modelTop] - market[modelTop],
  });
}

console.log(`[cal] evaluados: ${rows.length}`);

const agree = rows.filter(r => r.modelTop === r.marketTop);
const disagree = rows.filter(r => r.modelTop !== r.marketTop);
const modelRight = disagree.filter(r => r.actual === r.modelTop).length;
const marketRight = disagree.filter(r => r.actual === r.marketTop).length;

console.log('\n=== CUANDO DISCREPAN (no es que un lado acierte mas, es definicion) ===');
console.log(`  desacuerdos: ${disagree.length}`);
console.log(`    gano el modelo:  ${modelRight}  (${((modelRight / disagree.length) * 100).toFixed(1)}%)`);
console.log(`    gano el mercado: ${marketRight}  (${((marketRight / disagree.length) * 100).toFixed(1)}%)`);
console.log(`  cuando coinciden: ${agree.length} partidos, se resuelve con la calibracion de abajo`);

const consensusHits = rows.filter(r => r.modelTop === r.marketTop && r.actual === r.modelTop).length;
const consensusN = rows.filter(r => r.modelTop === r.marketTop).length;
console.log(
  `\n  Cuando coinciden: ${consensusHits}/${consensusN} = ${((consensusHits / consensusN) * 100).toFixed(1)}%`,
);

const buckets = calibrateConsensus(rows);
console.log('\n=== CALIBRACION DE LOS PICKS DE CONSENSO ===');
console.log('  tramo           n     acierto real');
for (const b of buckets) {
  if (b.n === 0) continue;
  console.log(
    `  ${String(b.lo).padEnd(4)}-${String(b.hi).padEnd(6)} ${String(b.n).padStart(5)}   ${(b.accuracy * 100).toFixed(1)}%  [${(b.ci95[0] * 100).toFixed(1)}-${(b.ci95[1] * 100).toFixed(1)}]`,
  );
}

const out = join(fileURLToPath(new URL('..', import.meta.url)), 'data', 'calibrated-buckets.json');
await mkdir(join(fileURLToPath(new URL('..', import.meta.url)), 'data'), { recursive: true });
await writeFile(
  out,
  JSON.stringify(
    {
      generado: new Date().toISOString(),
      partidos: rows.length,
      ligas: LEAGUES,
      temporadas: SEASONS,
      consensoAcierto: consensusHits / consensusN,
      consensoN: consensusN,
      buckets: buckets.filter(b => b.n > 0),
    },
    null,
    2,
  ),
);

console.log(`\n[cal] escrito: ${out}`);
console.log(`[cal] reinicia el server para que lo cargue.`);