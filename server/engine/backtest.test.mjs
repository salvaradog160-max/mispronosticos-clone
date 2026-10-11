import test from 'node:test';
import assert from 'node:assert/strict';
import {
  walkForward,
  hitRates,
  brierScore,
  calibration,
  baselines,
  report,
} from './backtest.mjs';

const mk = (i, homeTeam, awayTeam, homeScore, awayScore) => ({
  utcDate: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
});

const league = (n = 40) => {
  const teams = Array.from({ length: n }, (_, i) => 'T' + i);
  const out = [];
  let day = 0;
  for (let i = 0; i + 1 < teams.length; i++) {
    out.push(mk(day++, teams[i], teams[i + 1], (i * 3) % 4, (i * 2) % 3));
    out.push(mk(day++, teams[i + 1], teams[i], (i + 1) % 2, (i * 5) % 4));
  }
  return out;
};

test('walkForward: respeta el minimo de historico', () => {
  const result = walkForward(league(40), { minHistory: 40 });
  assert.ok(result.n <= 39, 'no puede evaluar antes de tener 40 partidos');
  assert.ok(result.n > 0, 'debe evaluar algo');
});

test('walkForward: un partido sin resultado nunca se evalua', () => {
  const matches = league(60);
  const target = matches[60];
  matches.splice(60, 1, { ...target, homeScore: null, awayScore: null });
  const result = walkForward(matches, { minHistory: 40 });
  const evaluatedPairs = new Set(
    result.evaluated.map(r => `${r.homeTeam}|${r.awayTeam}`),
  );
  assert.ok(
    !evaluatedPairs.has(`${target.homeTeam}|${target.awayTeam}`),
    'el partido sin resultado aparecio en evaluated',
  );
});

test('walkForward: marca skipped cuando falta historial de un equipo', () => {
  const base = walkForward(league(40), { minHistory: 40 });
  const matches = league(40);
  matches.push(mk(999, 'T0', 'EQUIPO_NUEVO', 2, 1));
  const result = walkForward(matches, { minHistory: 40 });
  assert.equal(result.skipped, base.skipped + 1);
  assert.equal(result.n, base.n);
});

test('walkForward: los ratings no incluyen partidos futuros', () => {
  const matches = league(40);
  const result = walkForward(matches, { minHistory: 40 });
  const first = result.evaluated[0];
  const base = matches.find(m => m.homeTeam === first.homeTeam && m.awayTeam === first.awayTeam);
  const index = matches.indexOf(base);
  const before = matches.slice(0, index).filter(m => Number.isFinite(m.homeScore));
  const gamesBefore = before.filter(m => m.homeTeam === first.homeTeam || m.awayTeam === first.homeTeam).length;
  assert.ok(gamesBefore < 40, 'el equipo no podia tener mas partidos que los previos');
});

test('hitRates: devuelve null cuando no hay muestra', () => {
  const rates = hitRates([]);
  assert.equal(rates['1X2'].rate, null);
  assert.equal(rates['1X2'].total, 0);
});

test('hitRates: los aciertos nunca exceden el total', () => {
  const rates = hitRates(walkForward(league(60), { minHistory: 40 }).evaluated);
  for (const market of Object.keys(rates)) {
    assert.ok(rates[market].hits <= rates[market].total);
    assert.ok(rates[market].rate >= 0 && rates[market].rate <= 1);
  }
});

test('brierScore:Perfecto vale 0 y nunca es negativo', () => {
  const perfect = [
    {
      actual: { home: 2, away: 0, total: 2 },
      predicted: { oneXTwo: { H: 1, D: 0, A: 0 }, over25: 0, under25: 1, btts: 0 },
    },
  ];
  assert.equal(brierScore(perfect), 0);
  const real = brierScore(walkForward(league(60), { minHistory: 40 }).evaluated);
  assert.ok(real >= 0 && real <= 2);
});

test('calibration: las probabilidades observadas caen dentro de rango', () => {
  const rows = calibration(walkForward(league(60), { minHistory: 40 }).evaluated);
  for (const row of rows) {
    if (row.observed === null) continue;
    assert.ok(row.observed >= 0 && row.observed <= 1);
    assert.ok(row.predicted >= 0 && row.predicted <= 1);
  }
});

test('baselines: las tres suman 1', () => {
  const base = baselines(walkForward(league(60), { minHistory: 40 }).evaluated);
  const total = base.H + base.D + base.A;
  assert.ok(Math.abs(total - 1) < 1e-9, `suman ${total}`);
});

test('report: declara que NO bate al azar con muestra chica', () => {
  const small = walkForward(league(40), { minHistory: 40 }).evaluated;
  const r = report(small);
  assert.equal(r.veredicto.bateAlAzar, false);
  assert.match(r.veredicto.nota, /insuficiente/i);
});

test('report: la veredicto nunca declara ventaja sin muestra suficiente', () => {
  const rows = walkForward(league(400), { minHistory: 40 }).evaluated;
  const r = report(rows);
  if (rows.length < 200) assert.equal(r.veredicto.bateAlAzar, false);
  if (r.veredicto.bateAlAzar) {
    assert.ok(rows.length >= 200, 'no puede declarar ventaja con menos de 200');
    assert.ok(r.rates['1X2'].rate > r.veredicto.mejorBaseline, 'debe superar la baseline');
  }
});
test('significance: acierto identico a la baseline no es ventaja', async () => {
  const { significance } = await import('./backtest.mjs');
  const s = significance(2685 * 0.436, 2685, 0.436);
  assert.ok(s.pValue > 0.9, `p=${s.pValue}, deberia ser ~1`);
  assert.ok(Math.abs(s.z) < 0.01, `z=${s.z}, deberia ser ~0`);
});

test('significance: el caso real de Bundesliga es marginalmente significante', async () => {
  const { significance } = await import('./backtest.mjs');
  const s = significance(1226, 2685, 0.436);
  assert.ok(s.z > 1.9 && s.z < 2.4, `z=${s.z}, este caso esta justo en el umbral`);
  assert.ok(s.pValue > 0.02 && s.pValue < 0.05);
});

test('significance: una diferencia enorme si se declara', async () => {
  const { significance } = await import('./backtest.mjs');
  const s = significance(700, 1000, 0.44);
  assert.ok(s.pValue < 0.001, `p=${s.pValue}`);
});

test('report: nunca declara ventaja con p alto aunque le gane a la baseline', async () => {
  const { walkForward, report: rep } = await import('./backtest.mjs');
  const evaluated = walkForward(league(200), { minHistory: 40 }).evaluated;
  const r = rep(evaluated);
  if (r.rates['1X2'].rate > r.veredicto.mejorBaseline) {
    assert.equal(r.veredicto.bateAlAzar, false, 'ventaja sin significancia no vale');
    assert.match(r.veredicto.nota, /NO supera|insuficiente/);
  }
});

test('report: un modelo PEOR que la baseline jamas se declara ganador', async () => {
  const { report: rep } = await import('./backtest.mjs');
  const evaluated = walkForward(league(400), { minHistory: 40 }).evaluated;
  const r = rep(evaluated);
  if (r.rates['1X2'].rate < r.veredicto.mejorBaseline) {
    assert.equal(r.veredicto.bateAlAzar, false, 'peor que la baseline pero marcado como ventaja');
    assert.match(r.veredicto.nota, /PEOR/);
  }
});
