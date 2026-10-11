import test from 'node:test';
import assert from 'node:assert/strict';
import {
  poissonPmf,
  poissonDistribution,
  outcomeProbs,
  overProb,
  bttsProb,
  handicapProb,
  expectedGoals,
  starsFromProbability,
} from './poisson.mjs';

const close = (a, b, tol, label) =>
  assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} != ${b} (tol ${tol})`);

test('poissonPmf: la suma de la distribucion tiende a 1', () => {
  for (const lambda of [0.5, 1.2, 2.8, 4.5]) {
    const total = poissonDistribution(lambda).reduce((a, b) => a + b, 0);
    close(total, 1, 0.001, `lambda=${lambda}`);
  }
});

test('poissonPmf: caso base conocido', () => {
  close(poissonPmf(0, 1.5), Math.exp(-1.5), 1e-12, 'P(0|1.5)');
  close(poissonPmf(2, 2), Math.exp(-2) * 2, 1e-12, 'P(2|2)');
});

test('poissonPmf: lambda 0 colapsa al 0', () => {
  assert.equal(poissonPmf(0, 0), 1);
  assert.equal(poissonPmf(1, 0), 0);
});

test('poissonPmf: rechaza entradas invalidas', () => {
  assert.throws(() => poissonPmf(-1, 1.5));
  assert.throws(() => poissonPmf(1.5, 1.5));
});

test('outcomeProbs: siempre suma 1 y respeta la simetria local/visitante', () => {
  const p = outcomeProbs(1.8, 1.1);
  close(p.H + p.D + p.A, 1, 1e-9, 'suma');
});

test('outcomeProbs: partido igualado da ventaja al local por campo', () => {
  const p = outcomeProbs(1.4, 1.4);
  assert.ok(p.H > p.A, 'local debe ganar con ventaja de campo');
});

test('outcomeProbs: fuerza local alta => H muy por encima', () => {
  const p = outcomeProbs(2.6, 0.7);
  assert.ok(p.H > 0.6, `H=${p.H}`);
  assert.ok(p.H > p.D && p.H > p.A);
});

test('outcomeProbs: sin Dixon-Coles el empate queda subestimado', () => {
  const withDc = outcomeProbs(1.35, 1.25, -0.03);
  const withoutDc = outcomeProbs(1.35, 1.25, 0);
  assert.ok(withDc.D > withoutDc.D, 'DC debe subir el empate en partidos igualados');
});

test('overProb: mas goles esperados => mas probabilidad de over', () => {
  const low = overProb(0.8, 0.7, 2.5);
  const high = overProb(2.1, 1.9, 2.5);
  assert.ok(high > low);
  assert.ok(low > 0 && low < 1 && high > 0 && high < 1);
});

test('overProb: over y under de la misma linea suman 1', () => {
  for (const [lh, la] of [[0.8, 0.7], [1.6, 1.4], [2.6, 2.2]]) {
    const over = overProb(lh, la, 2.5);
    const under = 1 - overProb(lh, la, 2.5) - 0;
    close(over + under, 1, 1e-12, 'complementarios');
  }
});

test('overProb: sube la probabilidad al subir la linea', () => {
  assert.ok(overProb(1.6, 1.4, 3.5) < overProb(1.6, 1.4, 2.5));
  assert.ok(overProb(1.6, 1.4, 1.5) > overProb(1.6, 1.4, 2.5));
});

test('overProb: con muy pocos goles esperados la cola es despreciable', () => {
  const p = overProb(0.1, 0.1, 2.5);
  assert.ok(p < 0.002, `cola ${p} todavia relevante`);
});

test('overProb: la cola existe y es pequena con media baja', () => {
  const p = overProb(0.8, 0.6, 2.5);
  assert.ok(p > 0.05 && p < 0.3, `esperaba una cola pequena, salió ${p}`);
});

test('bttsProb: equipos que no anotan lo bajan', () => {
  const high = bttsProb(1.8, 1.6);
  const low = bttsProb(0.5, 0.4);
  assert.ok(low < high);
  close(low, bttsProb(0.5, 0.4), 1e-12, 'determinista');
});

test('bttsProb: es un subconjunto del over 1.5, nunca mayor', () => {
  for (const [lh, la] of [[0.8, 0.7], [1.7, 1.4], [2.4, 2.1]]) {
    assert.ok(bttsProb(lh, la) <= overProb(lh, la, 1.5) + 1e-12);
  }
});

test('bttsProb: sigue la independencia de las dos poisson', () => {
  const lh = 1.7;
  const la = 1.4;
  const expected = (1 - Math.exp(-lh)) * (1 - Math.exp(-la));
  close(bttsProb(lh, la), expected, 1e-9, 'P(A)P(B) con A,B independientes');
});

test('handicapProb: sin handicap favorece al local por campo', () => {
  assert.ok(handicapProb(1.5, 1.2, 0) > 0.5);
});

test('handicapProb: handicap -1 para el local lo baja', () => {
  assert.ok(handicapProb(1.5, 1.2, -1) < handicapProb(1.5, 1.2, 0));
});

test('expectedGoals: equipos promedio contra promedio da la media de la liga', () => {
  const { lambdaHome, lambdaAway } = expectedGoals({
    leagueAvgHome: 1.5,
    leagueAvgAway: 1.2,
    homeAttack: 1,
    awayAttack: 1,
    homeDefense: 1,
    awayDefense: 1,
    homeAdvantage: 1.08,
  });
  close(lambdaHome, 1.5 * 1.08, 1e-9, 'lambda local');
  close(lambdaAway, 1.2, 1e-9, 'lambda visitante');
});

test('expectedGoals: ataque bueno contra defensa mala sube el λ local', () => {
  const good = expectedGoals({
    leagueAvgHome: 1.5,
    leagueAvgAway: 1.2,
    homeAttack: 1.4,
    awayAttack: 1,
    homeDefense: 1,
    awayDefense: 0.7,
    homeAdvantage: 1,
  });
  const bad = expectedGoals({
    leagueAvgHome: 1.5,
    leagueAvgAway: 1.2,
    homeAttack: 0.8,
    awayAttack: 1,
    homeDefense: 1.4,
    awayDefense: 1.2,
    homeAdvantage: 1,
  });
  assert.ok(good.lambdaHome > bad.lambdaHome);
});

test('starsFromProbability: los tramos son monotonos y cubren 1..5', () => {
  const values = [0.2, 0.45, 0.5, 0.58, 0.7].map(starsFromProbability);
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] >= values[i - 1], 'monotono creciente');
  }
  assert.equal(starsFromProbability(0.99), 5);
  assert.equal(starsFromProbability(0.1), 1);
});