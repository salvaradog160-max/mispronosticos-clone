import { test } from 'node:test';
import assert from 'node:assert';
import { ladderMercados, LINEAS } from './ladder.mjs';

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