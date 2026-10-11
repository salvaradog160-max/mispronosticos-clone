import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRatings, predictMatch, buildPicks } from './ratings.mjs';

const mk = (homeTeam, awayTeam, homeScore, awayScore) => ({ homeTeam, awayTeam, homeScore, awayScore });

test('buildRatings: promedia la liga correctamente', () => {
  const matches = [
    mk('A', 'B', 2, 0),
    mk('C', 'D', 0, 1),
    mk('A', 'C', 3, 1),
    mk('B', 'D', 1, 2),
  ];
  const ratings = buildRatings(matches);
  assert.equal(ratings.leagueAvgHome, 1.5);
  assert.equal(ratings.leagueAvgAway, 1);
  assert.equal(ratings.leagueAvgGoals, 1.25);
});

test('buildRatings: un solo attack/defense por equipo, sin separar local y visitante', () => {
  const ratings = buildRatings([mk('A', 'B', 2, 1), mk('A', 'B', 3, 0)]);
  const team = ratings.teams.A;
  assert.equal(team.attackHome, undefined);
  assert.equal(team.defenseAway, undefined);
  assert.ok(Number.isFinite(team.attack) && Number.isFinite(team.defense));
});

test('buildRatings: un equipo con solo partidos de local no rompe el modelo', () => {
  const matches = Array.from({ length: 20 }, (_, i) => mk('SOLO_LOCAL', 'R' + i, 4, 0));
  const ratings = buildRatings(matches);
  const team = ratings.teams['SOLO_LOCAL'];
  assert.ok(Number.isFinite(team.attack) && Number.isFinite(team.defense));
});

const padWithNeutrals = (extra, n = 30) => {
  const base = [];
  for (let i = 0; i < n; i++) base.push(mk('N' + i, 'N' + ((i + 1) % n), 1, 1));
  return [...extra, ...base];
};

test('buildRatings: con menos partidos el rating se acerca mas a la media', () => {
  const one = padWithNeutrals([mk('T', 'R', 2, 1)], 30);
  const many = padWithNeutrals(Array.from({ length: 20 }, () => mk('T', 'R', 2, 1)), 30);
  const a = buildRatings(one).teams.T;
  const b = buildRatings(many).teams.T;
  assert.ok(a.attack > 1, 'sigue mejor que la media');
  assert.ok(b.attack > a.attack, 'a mas muestra, mas se aleja de la media');
  assert.ok(Math.abs(b.attack - 1) > Math.abs(a.attack - 1), 'la muestra grande debe estar mas lejos');
});

test('buildRatings: marca equipos sin historial como no conocidos', () => {
  const ratings = buildRatings([mk('A', 'B', 1, 1), mk('A', 'B', 1, 1), mk('A', 'B', 1, 1)]);
  assert.ok(!ratings.teams.DESCONOCIDO);
});

test('buildRatings: ignora partidos sin resultado', () => {
  const ratings = buildRatings([mk('A', 'B', 2, 1), mk('A', 'B', null, null)]);
  assert.equal(ratings.teams.A.played, 1);
  assert.equal(ratings.teams.B.played, 1);
});

/**
 * Liga artificial pero realista: cada equipo juega la mitad de local y la mitad
 * de visitante, y la media de goles por bando queda pareja.
 */
const buildStrongWeakLeague = () => {
  const matches = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const rival = 'RIVAL' + i;
    matches.push(mk('FUERTE', rival, 3, 1));
    matches.push(mk(rival, 'FUERTE', 1, 3));
    matches.push(mk(rival, 'DEBIL', 3, 0));
    matches.push(mk('DEBIL', rival, 0, 3));
    matches.push(mk('NEUTRO' + i, 'NEUTRO' + ((i + 1) % n), 1, 1));
    matches.push(mk('NEUTRO' + ((i + 1) % n), 'NEUTRO' + i, 1, 1));
  }
  return matches;
};

test('predictMatch: un favorito claro domina el 1X2', () => {
  const ratings = buildRatings(buildStrongWeakLeague());
  const p = predictMatch(ratings, { homeTeam: 'FUERTE', awayTeam: 'DEBIL' });
  assert.ok(p.oneXTwo.H > 0.5, `H=${p.oneXTwo.H}`);
  assert.ok(p.lambdaHome > p.lambdaAway * 1.5, `λ ${p.lambdaHome} vs ${p.lambdaAway}`);
  assert.ok(p.lambdaHome > 1.5, `un equipo que gana 3-1 debe modelarse arriba de 1.5 λ`);
});

test('predictMatch: partido entre equipos parecidos queda cerca de la paridad', () => {
  const ratings = buildRatings(buildStrongWeakLeague());
  const p = predictMatch(ratings, { homeTeam: 'NEUTRO0', awayTeam: 'NEUTRO1' });
  assert.ok(p.oneXTwo.H > p.oneXTwo.A, 'la ventaja de campo siempre inclina a local');
  assert.ok(p.oneXTwo.H < 0.55, `no debe ser un favorito absoluto: ${p.oneXTwo.H}`);
});

test('predictMatch: marca known=false si falta un equipo', () => {
  const ratings = buildRatings([mk('A', 'B', 2, 1)]);
  assert.equal(predictMatch(ratings, { homeTeam: 'A', awayTeam: 'FANTASMA' }).known, false);
});

test('buildPicks: devuelve vacio para partidos sin datos', () => {
  const ratings = buildRatings([mk('A', 'B', 2, 1)]);
  assert.deepEqual(buildPicks(ratings, { homeTeam: 'A', awayTeam: 'FANTASMA' }), []);
});

test('buildPicks: respeta el minimo de probabilidad', () => {
  const matches = [];
  for (let i = 0; i < 15; i++) matches.push(mk('FUERTE', 'R' + i, 4, 0));
  for (let i = 0; i < 15; i++) matches.push(mk('R' + i, 'DEBIL', 0, 4));
  for (let i = 0; i < 10; i++) matches.push(mk('R' + i, 'Z' + i, 1, 1));
  const ratings = buildRatings(matches);

  const loose = buildPicks(ratings, { homeTeam: 'FUERTE', awayTeam: 'DEBIL' }, { minProbability: 0.3 });
  const tight = buildPicks(ratings, { homeTeam: 'FUERTE', awayTeam: 'DEBIL' }, { minProbability: 0.8 });
  assert.ok(loose.length >= tight.length);
  for (const pick of tight) assert.ok(pick.probability >= 0.8);
});

test('buildPicks: no inventa mercados que el modelo no soporta', () => {
  const matches = [];
  for (let i = 0; i < 15; i++) matches.push(mk('A', 'R' + i, 1, 1));
  const ratings = buildRatings(matches);
  const picks = buildPicks(ratings, { homeTeam: 'A', awayTeam: 'R0' }, { markets: ['TOTAL'] });
  for (const pick of picks) assert.equal(pick.market, 'TOTAL');
});

test('buildPicks: devuelve probabilidades coherentes con el mercado', () => {
  const matches = [];
  for (let i = 0; i < 15; i++) matches.push(mk('MUY FUERTE', 'R' + i, 5, 0));
  for (let i = 0; i < 15; i++) matches.push(mk('R' + i, 'MUY DEBIL', 0, 5));
  for (let i = 0; i < 10; i++) matches.push(mk('R' + i, 'Z' + i, 2, 2));
  const ratings = buildRatings(matches);
  const picks = buildPicks(ratings, { homeTeam: 'MUY FUERTE', awayTeam: 'MUY DEBIL' }, { minProbability: 0.4 });
  assert.ok(picks.length > 0);
  for (const pick of picks) {
    assert.ok(pick.probability >= 0.4 && pick.probability <= 1);
    assert.ok(pick.stars >= 1 && pick.stars <= 5);
    assert.ok(pick.confidence >= 40);
  }
});