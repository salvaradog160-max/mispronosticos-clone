/**
 * Ratings por equipo y construccion de picks.
 *
 * Modelo Dixon-Coles simplificado: UN attack y UN defense por equipo, mas una
 * ventaja de local global. No se separan los ratings por local/visitante porque
 * cuando un equipo solo juega de un lado los parametros del otro salen de
 * partidos que nunca disputo y el rating se vuelve basura silenciosamente.
 *
 * Funciones puras: sin I/O.
 */
import {
  expectedGoals,
  outcomeProbs,
  overProb,
  bttsProb,
  starsFromProbability,
  clamp,
} from './poisson.mjs';

export const DEFAULT_HOME_ADVANTAGE = 1.08;
export const RATING_FLOOR = 0.35;
export const RATING_CEIL = 2.6;
export const DEFAULT_LEAGUE_AVG = 1.35;

/**
 * Medias de liga y ratings por equipo desde partidos ya jugados.
 *
 * Shrinkage hacia 1 con peso n/(n+prior): un equipo con pocos partidos no debe
 * extremarse por tener 2 buenos. trusted marca si hay muestra suficiente.
 */
export const buildRatings = (matches, { minMatches = 5, prior = 8 } = {}) => {
  const totals = new Map();
  let homeGoals = 0;
  let awayGoals = 0;
  let played = 0;

  for (const m of matches) {
    if (!Number.isFinite(m.homeScore) || !Number.isFinite(m.awayScore)) continue;
    homeGoals += m.homeScore;
    awayGoals += m.awayScore;
    played += 1;

    for (const [team, gf, ga] of [
      [m.homeTeam, m.homeScore, m.awayScore],
      [m.awayTeam, m.awayScore, m.homeScore],
    ]) {
      const entry = totals.get(team) ?? { gf: 0, ga: 0, played: 0 };
      entry.gf += gf;
      entry.ga += ga;
      entry.played += 1;
      totals.set(team, entry);
    }
  }

  if (played === 0 || totals.size === 0) {
    return {
      leagueAvgHome: DEFAULT_LEAGUE_AVG,
      leagueAvgAway: DEFAULT_LEAGUE_AVG,
      leagueAvgGoals: DEFAULT_LEAGUE_AVG,
      teams: {},
    };
  }

  const leagueAvgHome = homeGoals / played;
  const leagueAvgAway = awayGoals / played;
  const leagueAvgGoals = (homeGoals + awayGoals) / (played * 2);

  const teams = {};
  for (const [team, entry] of totals) {
    const n = entry.played;
    const w = n / (n + prior);
    const rawAttack = entry.gf / n / leagueAvgGoals;
    const rawDefense = entry.ga / n / leagueAvgGoals;
    teams[team] = {
      played: n,
      attack: clamp(1 + w * (rawAttack - 1), RATING_FLOOR, RATING_CEIL),
      defense: clamp(1 + w * (rawDefense - 1), RATING_FLOOR, RATING_CEIL),
      goalsFor: entry.gf,
      goalsAgainst: entry.ga,
      trusted: n >= minMatches,
    };
  }

  return { leagueAvgHome, leagueAvgAway, leagueAvgGoals, teams };
};

const rating = (ratings, team, field) => ratings.teams[team]?.[field] ?? 1;

/**
 * Distribucion de un partido a partir de los ratings.
 */
export const predictMatch = (ratings, fixture, { homeAdvantage = DEFAULT_HOME_ADVANTAGE } = {}) => {
  const home = fixture.homeTeam;
  const away = fixture.awayTeam;
  const known = Boolean(ratings.teams[home]) && Boolean(ratings.teams[away]);

  const { lambdaHome, lambdaAway } = expectedGoals({
    leagueAvgHome: ratings.leagueAvgHome,
    leagueAvgAway: ratings.leagueAvgAway,
    homeAttack: rating(ratings, home, 'attack'),
    awayAttack: rating(ratings, away, 'attack'),
    homeDefense: rating(ratings, away, 'defense'),
    awayDefense: rating(ratings, home, 'defense'),
    homeAdvantage,
  });

  const over25 = overProb(lambdaHome, lambdaAway, 2.5);

  return {
    lambdaHome,
    lambdaAway,
    totalGoals: lambdaHome + lambdaAway,
    oneXTwo: outcomeProbs(lambdaHome, lambdaAway),
    over25,
    under25: 1 - over25,
    over35: overProb(lambdaHome, lambdaAway, 3.5),
    btts: bttsProb(lambdaHome, lambdaAway),
    known,
  };
};

const confidenceFrom = probability => Math.round(clamp(probability, 0, 1) * 100);

/**
 * Mercados disponibles para un partido, ordenados por fuerza del pronostico.
 * Devuelve vacio si el equipo no tiene historial suficiente.
 */
export const buildPicks = (
  ratings,
  fixture,
  { minProbability = 0.5, markets = ['1X2', 'TOTAL', 'BTTS'] } = {},
) => {
  const p = predictMatch(ratings, fixture);
  if (!p.known) return [];
  if (!ratings.teams[fixture.homeTeam]?.trusted || !ratings.teams[fixture.awayTeam]?.trusted) return [];

  const candidates = [];

  if (markets.includes('1X2')) {
    const { H, D, A } = p.oneXTwo;
    if (H >= minProbability)
      candidates.push({ market: '1X2', selection: 'Gana ' + fixture.homeTeam, line: undefined, probability: H });
    if (D >= minProbability)
      candidates.push({ market: '1X2', selection: 'Empate', line: undefined, probability: D });
    if (A >= minProbability)
      candidates.push({ market: '1X2', selection: 'Gana ' + fixture.awayTeam, line: undefined, probability: A });
  }

  if (markets.includes('TOTAL')) {
    if (p.over25 >= minProbability)
      candidates.push({ market: 'TOTAL', selection: 'Over 2.5', line: 2.5, probability: p.over25 });
    if (p.under25 >= minProbability)
      candidates.push({ market: 'TOTAL', selection: 'Under 2.5', line: 2.5, probability: p.under25 });
  }

  if (markets.includes('BTTS') && p.btts >= minProbability) {
    candidates.push({ market: 'BTTS', selection: 'Ambos marcan', line: undefined, probability: p.btts });
  }

  return candidates
    .map(c => ({
      ...c,
      stars: starsFromProbability(c.probability),
      confidence: confidenceFrom(c.probability),
      lambdaHome: Number(p.lambdaHome.toFixed(3)),
      lambdaAway: Number(p.lambdaAway.toFixed(3)),
    }))
    .sort((a, b) => b.probability - a.probability);
};