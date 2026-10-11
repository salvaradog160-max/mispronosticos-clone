import { fetchMatches, buildXgDataset } from '../providers/statsbomb.mjs';
import { buildRatings } from '../engine/ratings.mjs';
import { expectedGoals, outcomeProbs, overProb, bttsProb } from '../engine/poisson.mjs';

const COMP = 11;
const SEASON = 27;

console.log('[sb] descargando La Liga 2015/16 (eventos con xG)');
const matches = await fetchMatches(COMP, SEASON);
console.log(`[sb] partidos en el dataset: ${matches.length}`);

let lastPct = -1;
const rows = await buildXgDataset(matches, {
  concurrency: 10,
  onProgress: (done, total) => {
    const pct = Math.floor((done / total) * 10) * 10;
    if (pct !== lastPct) {
      lastPct = pct;
      process.stdout.write(`\r[sb] eventos ${done}/${total}`);
    }
  },
});
console.log(`\n[sb] partidos con xG: ${rows.length}`);

const totalXgHome = rows.reduce((s, r) => s + r.homeXg, 0) / rows.length;
const totalXgAway = rows.reduce((s, r) => s + r.awayXg, 0) / rows.length;
const goalsHome = rows.reduce((s, r) => s + r.homeScore, 0) / rows.length;
const goalsAway = rows.reduce((s, r) => s + r.awayScore, 0) / rows.length;
console.log(
  `[sb] xG medio: local ${totalXgHome.toFixed(2)} visitante ${totalXgAway.toFixed(2)}`,
);
console.log(
  `[sb] goles medios: local ${goalsHome.toFixed(2)} visitante ${goalsAway.toFixed(2)}`,
);

/** Ratings basados en xG: attack/defense sobre goles esperados, no goles reales. */
const buildXgRatings = (games, { minMatches = 5, prior = 8 } = {}) => {
  const totals = new Map();
  let xgH = 0;
  let xgA = 0;
  let played = 0;

  for (const m of games) {
    if (!Number.isFinite(m.homeXg) || !Number.isFinite(m.awayXg)) continue;
    if (!Number.isFinite(m.homeScore) || !Number.isFinite(m.awayScore)) continue;
    xgH += m.homeXg;
    xgA += m.awayXg;
    played += 1;
    for (const [team, xgf, xga, gf, ga] of [
      [m.homeTeam, m.homeXg, m.awayXg, m.homeScore, m.awayScore],
      [m.awayTeam, m.awayXg, m.homeXg, m.awayScore, m.homeScore],
    ]) {
      const e = totals.get(team) ?? { xgf: 0, xga: 0, gf: 0, ga: 0, played: 0 };
      e.xgf += xgf;
      e.xga += xga;
      e.gf += gf;
      e.ga += ga;
      e.played += 1;
      totals.set(team, e);
    }
  }

  const avgXgH = xgH / played;
  const avgXgA = xgA / played;
  const avgGoals = (xgH + xgA) / (played * 2);

  const teams = {};
  for (const [team, e] of totals) {
    const n = e.played;
    const w = n / (n + prior);
    const clamp = (v, lo = 0.35, hi = 2.6) => Math.min(hi, Math.max(lo, v));
    teams[team] = {
      played: n,
      attack: clamp(1 + w * (e.xgf / n / avgGoals - 1)),
      defense: clamp(1 + w * (e.xga / n / avgGoals - 1)),
      attackGoals: clamp(1 + w * (e.gf / n / avgGoals - 1)),
      defenseGoals: clamp(1 + w * (e.ga / n / avgGoals - 1)),
      trusted: n >= minMatches,
    };
  }
  return { leagueAvgHome: avgXgH, leagueAvgAway: avgXgA, leagueAvgGoals: avgGoals, teams };
};

const evaluate = (ratingsFn, atkField, defField, label) => {
  let n = 0;
  let hits = 0;
  let brier = 0;
  let overHits = 0;
  let overTotal = 0;
  let bttsHits = 0;

  for (let i = 100; i < rows.length; i++) {
    const fx = rows[i];
    const ratings = ratingsFn(rows.slice(0, i));
    if (!ratings.teams[fx.homeTeam] || !ratings.teams[fx.awayTeam]) continue;
    const r = ratings.teams[fx.homeTeam];
    const a = ratings.teams[fx.awayTeam];
    if (!r.trusted || !a.trusted) continue;

    const { lambdaHome, lambdaAway } = expectedGoals({
      leagueAvgHome: ratings.leagueAvgHome,
      leagueAvgAway: ratings.leagueAvgAway,
      homeAttack: r[atkField],
      awayAttack: a[atkField],
      homeDefense: a[defField],
      awayDefense: r[defField],
      homeAdvantage: 1.08,
    });

    const p = outcomeProbs(lambdaHome, lambdaAway);
    const actual = fx.homeScore > fx.awayScore ? 'H' : fx.homeScore === fx.awayScore ? 'D' : 'A';
    const top = Object.entries(p).sort((x, y) => y[1] - x[1])[0];
    n += 1;
    if (top[0] === actual) hits += 1;
    brier += (p.H - (actual === 'H' ? 1 : 0)) ** 2 + (p.D - (actual === 'D' ? 1 : 0)) ** 2 + (p.A - (actual === 'A' ? 1 : 0)) ** 2;

    const over = overProb(lambdaHome, lambdaAway, 2.5) >= 0.5;
    overTotal += 1;
    if (over === (fx.homeScore + fx.awayScore > 2.5)) overHits += 1;

    const btts = bttsProb(lambdaHome, lambdaAway) >= 0.5;
    bttsHits += btts === (fx.homeScore > 0 && fx.awayScore > 0) ? 1 : 0;
  }

  const se = Math.sqrt((hits / n) * (1 - hits / n) / n);
  console.log(
    `\n[${label}] n=${n}  1X2=${((hits / n) * 100).toFixed(1)}%  Over2.5=${((overHits / overTotal) * 100).toFixed(1)}%  BTTS=${((bttsHits / overTotal) * 100).toFixed(1)}%  Brier=${(brier / n).toFixed(4)}  (+/-${(1.96 * se * 100).toFixed(1)} pp)`,
  );
  return { n, rate: hits / n, se };
};

console.log('\n=== GOLES vs xG (misma temporada, mismos partidos) ===');
const goalsRun = evaluate(h => buildRatings(h, {}), 'attack', 'defense', 'GOLES');
const xgRun = evaluate(h => buildXgRatings(h, {}), 'attack', 'defense', 'xG  ');

const diff = xgRun.rate - goalsRun.rate;
const combined = Math.sqrt(goalsRun.se ** 2 + xgRun.se ** 2);
console.log(`\n  diferencia xG - goles = ${(diff * 100).toFixed(2)} pp   z = ${(diff / combined).toFixed(2)}`);
console.log(
  diff / combined > 1.96
    ? '  -> el xG MEJORA el modelo de forma significativa'
    : '  -> el xG NO mejora el modelo de forma significativa',
);