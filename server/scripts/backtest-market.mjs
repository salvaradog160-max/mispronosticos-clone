import { fetchHistory, impliedProbs, LEAGUES } from '../providers/footballdata.mjs';
import { walkForward, hitRates, brierScore, baselines } from '../engine/backtest.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';

const leagues = (process.argv[2] ?? 'E1').split(',');
const seasons = Number(process.argv[3] ?? 6);

console.log(`[bd] ligas: ${leagues.join(', ')} — ultimas ${seasons} temporadas`);

const matches = await fetchHistory(leagues, seasons);
const withOdds = matches.filter(m => m.odds?.H && m.odds?.D && m.odds?.A);
console.log(`[bd] partidos: ${matches.length}   con cuotas: ${withOdds.length}`);

const ordered = [...withOdds].sort(
  (a, b) => new Date(a.utcDate.split('/').reverse().join('-')) - new Date(b.utcDate.split('/').reverse().join('-')),
);

const rows = [];
for (let i = 200; i < ordered.length; i++) {
  const fx = ordered[i];
  const history = ordered.slice(0, i);
  const ratings = buildRatings(history);
  const p = predictMatch(ratings, fx);
  if (!p.known) continue;
  const market = impliedProbs(fx.odds);
  if (!market) continue;

  const actual =
    fx.homeScore > fx.awayScore ? 'H' : fx.homeScore === fx.awayScore ? 'D' : 'A';
  rows.push({
    league: fx.league,
    season: fx.season,
    date: fx.utcDate,
    teams: `${fx.homeTeam} - ${fx.awayTeam}`,
    actual,
    model: p.oneXTwo,
    market,
    odds: fx.odds,
    modelTop: Object.entries(p.oneXTwo).sort((a, b) => b[1] - a[1])[0][0],
    marketTop: Object.entries(market)
      .filter(([k]) => k !== 'overround')
      .sort((a, b) => b[1] - a[1])[0][0],
    edge: Object.fromEntries(
      Object.keys(p.oneXTwo).map(k => [k, p.oneXTwo[k] - market[k]]),
    ),
  });
}

console.log(`[bd] evaluados con mercado: ${rows.length}`);
if (rows.length === 0) process.exit(1);

const n = rows.length;
const modelHits = rows.filter(r => r.modelTop === r.actual).length;
const marketHits = rows.filter(r => r.marketTop === r.actual).length;
const agreeHits = rows.filter(r => r.modelTop === r.marketTop && r.actual === r.modelTop).length;
const agree = rows.filter(r => r.modelTop === r.marketTop).length;

const modelRate = modelHits / n;
const marketRate = marketHits / n;
const base = baselines(
  rows.map(r => ({
    actual: {
      home: r.actual === 'H' ? 1 : 0,
      away: r.actual === 'A' ? 1 : 0,
      total: 0,
    },
    predicted: r.model,
  })),
);
const bestBase = Math.max(...Object.values(base));
const se = rate => Math.sqrt((rate * (1 - rate)) / n);
const z = (modelRate - marketRate) / Math.sqrt(se(modelRate) ** 2 + se(marketRate) ** 2);

console.log('\n=== MODELO vs MERCADO (1X2) ===');
console.log(`  modelo           ${(modelRate * 100).toFixed(1)}%  (${modelHits}/${n})`);
console.log(`  mercado          ${(marketRate * 100).toFixed(1)}%  (${marketHits}/${n})`);
console.log(`  baseline trivial ${(bestBase * 100).toFixed(1)}%`);
console.log(`  z(modelo-mercado)= ${z.toFixed(3)}`);

console.log('\n=== CUANDO MODELO Y MERCADO COINCIDEN ===');
console.log(`  aciertan ${agreeHits}/${agree} = ${((agreeHits / agree) * 100).toFixed(1)}%`);

console.log('\n=== ACIERGO CUANDO HAY VALOR (edge modelo - mercado > umbral) ===');
for (const threshold of [0.02, 0.05, 0.08, 0.1]) {
  const valued = rows.filter(r => r.edge[r.modelTop] > threshold);
  if (valued.length < 30) {
    console.log(`  edge > ${(threshold * 100).toFixed(0)}%: n=${valued.length} (insuficiente)`);
    continue;
  }
  const hits = valued.filter(r => r.actual === r.modelTop).length;
  const rate = hits / valued.length;
  const avgOdds = valued.reduce((s, r) => s + r.odds[r.modelTop], 0) / valued.length;
  console.log(
    `  edge > ${(threshold * 100).toFixed(0)}%: n=${String(valued.length).padStart(5)}  acierto=${(rate * 100).toFixed(1)}%  cuota media=${avgOdds.toFixed(2)}  ROI=${((rate * avgOdds - 1) * 100).toFixed(1)}%`,
  );
}

console.log('\n=== POR LIGA (acierto del modelo) ===');
for (const league of leagues) {
  const slice = rows.filter(r => r.league === league);
  if (slice.length === 0) continue;
  const hits = slice.filter(r => r.actual === r.modelTop).length;
  const mHits = slice.filter(r => r.actual === r.marketTop).length;
  console.log(
    `  ${(LEAGUES[league] ?? league).padEnd(15)} modelo ${((hits / slice.length) * 100).toFixed(1)}%  mercado ${((mHits / slice.length) * 100).toFixed(1)}%  n=${slice.length}`,
  );
}

const toBrierRows = r => ({
  actual: { home: r.actual === 'H' ? 1 : 0, away: r.actual === 'A' ? 1 : 0, total: 0 },
  predicted: { oneXTwo: r.model },
});
const toBrierRowsMarket = r => ({
  actual: { home: r.actual === 'H' ? 1 : 0, away: r.actual === 'A' ? 1 : 0, total: 0 },
  predicted: { oneXTwo: { H: r.market.H, D: r.market.D, A: r.market.A } },
});

console.log(`\n  Brier modelo  ${brierScore(rows.map(toBrierRows)).toFixed(4)}   [menor es mejor]`);
console.log(`  Brier mercado ${brierScore(rows.map(toBrierRowsMarket)).toFixed(4)}`);
void walkForward;
void hitRates;