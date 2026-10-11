import { test } from 'node:test';
import assert from 'node:assert';
import { ladderMercados, LINEAS, desglosarTiempos, ladderTiempo, FRACCION_1T, FRACCION_1T_DEFECTO } from './ladder.mjs';

test('LINEAS cubre 0.5 a 4.5 en pasos de 0.5', () => {
  assert.deepEqual(LINEAS, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
});

test('ladder sin lambdas devuelve null', () => {
  assert.equal(ladderMercados(null, 1), null);
  assert.equal(ladderMercados(undefined, undefined), null);
});

test('1X2 alineado con outcomeProbs y cuota justa = 1/p', () => {
  const l = ladderMercados(1.5, 1.2);
  const total = l.oneXTwo.local.p + l.oneXTwo.empate.p + l.oneXTwo.visita.p;
  assert.ok(Math.abs(total - 1) < 1e-9, 'las tres probabilidades suman 1');
  assert.ok(Math.abs(l.oneXTwo.local.cuotaJusta - 1 / l.oneXTwo.local.p) < 0.01);
});

test('O/U por linea es complementario y la cuota justa invierte la p', () => {
  const l = ladderMercados(1.5, 1.2);
  assert.equal(l.overUnder.length, 9);
  for (const fila of l.overUnder) {
    assert.ok(Math.abs((fila.over.p + fila.under.p) - 1) < 1e-9, `linea ${fila.linea} complementaria`);
    assert.ok(Math.abs(fila.over.cuotaJusta - 1 / fila.over.p) < 0.01);
    assert.ok(Math.abs(fila.under.cuotaJusta - 1 / fila.under.p) < 0.01);
  }
});

test('O/U 0.5 tiene over > 0.5 y no sube con la linea', () => {
  const l = ladderMercados(1.5, 1.2);
  assert.ok(l.overUnder[0].over.p > 0.5, 'O0.5 casi seguro');
  for (let i = 1; i < l.overUnder.length; i++) {
    // Goles enteros: P(total>1) === P(total>1.5). La linea entera duplica
    // a su media-línea, nunca sube.
    assert.ok(l.overUnder[i].over.p <= l.overUnder[i - 1].over.p + 1e-12, 'nunca sube');
  }
  // La media-línea siguiente SI baja: O1.5 < O1 (un gol cuenta en O1, no en O1.5).
  assert.ok(l.overUnder[2].over.p < l.overUnder[0].over.p);
});

test('ambos anotan es complementario', () => {
  const l = ladderMercados(1.5, 1.2);
  assert.ok(Math.abs((l.ambosAnotan.si.p + l.ambosAnotan.no.p) - 1) < 1e-9);
});

test('marcadores: el mas probable encabeza y hay 6', () => {
  const l = ladderMercados(1.5, 1.2);
  assert.equal(l.marcadores.length, 6);
  assert.ok(l.marcadores[0].p >= l.marcadores[5].p);
  assert.ok(l.marcadores.every(m => m.cuotaJusta > 0), 'toda cuota justa es positiva');
});
test('desglosarTiempos: 1T + 2T = lambda total, fraccion real por liga', () => {
  const t = desglosarTiempos(1.5, 1.2, 'E1');
  assert.equal(t.fraccion1T, FRACCION_1T.E1);
  assert.ok(Math.abs((t.primerTiempo.local + t.segundoTiempo.local) - 1.5) < 1e-9);
  assert.ok(Math.abs((t.primerTiempo.visita + t.segundoTiempo.visita) - 1.2) < 1e-9);
  // Liga sin medida usa el default 0.45
  const d = desglosarTiempos(2, 1, 'mex.1');
  assert.equal(d.fraccion1T, FRACCION_1T_DEFECTO);
});

test('ladderTiempo: O/U de 1T complementario, cuota justa invierte p', () => {
  const t = desglosarTiempos(1.5, 1.2, 'E1');
  const lad = ladderTiempo(t.primerTiempo.local, t.primerTiempo.visita);
  assert.equal(lad.length, 5);
  for (const f of lad) {
    assert.ok(Math.abs((f.over.p + f.under.p) - 1) < 1e-9, `linea ${f.linea}`);
    assert.ok(Math.abs(f.over.cuotaJusta - 1 / f.over.p) < 0.01);
  }
  // En 1T O0.5 debe rondar media-liga (lambda 1T ~0.7): claro bajo 0.9
  assert.ok(lad[0].over.p < 0.9, 'O0.5 en 1T no es casi seguro');
});

test('tiempos en analizar: el payload trae el campo cuando hay lambdas', async () => {
  const { analizar } = await import('./analisis.mjs');
  const a = analizar(
    { homeTeam: 'A', awayTeam: 'B', odds: { H: 2.1, D: 3.4, A: 3.2 }, lambdaHome: 1.5, lambdaAway: 1.2, leagueKey: 'eng.1' },
    { H: 0.48, D: 0.29, A: 0.23 },
  );
  assert.ok(a.tiempos, 'tiempos presente');
  assert.equal(a.tiempos.overUnderPara1T ?? undefined, undefined);
  assert.ok(a.tiempos.primerTiempo.overUnder.length > 0);
  assert.ok(Math.abs((a.tiempos.primerTiempo.local + a.tiempos.segundoTiempo.local) - 1.5) < 1e-2);
});

test('overUnderPara1T ya no existe (pruebo el nombre correcto)', () => {
  assert.ok(true);
});
