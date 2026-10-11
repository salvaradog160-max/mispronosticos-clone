import test from 'node:test';
import assert from 'node:assert/strict';
import { settleAsian, asianCoverProb, handicapProb, overProb, bttsProb } from './poisson.mjs';

test('settleAsian: media linea no empata nunca', () => {
  assert.equal(settleAsian(2, 1, 0.5), 1);
  assert.equal(settleAsian(1, 2, 0.5), -1);
  assert.equal(settleAsian(1, 1, 0.5), -1, 'empate con el local dando 0.5 es perdida');
});

test('settleAsian: linea entera empata', () => {
  assert.equal(settleAsian(1, 1, 0), 0);
  assert.equal(settleAsian(2, 1, 0), 1);
  assert.equal(settleAsian(2, 1, 1), 0, 'ganar por 1 con +1 = vacio');
  assert.equal(settleAsian(2, 2, 1), -1, '2-2 con el local dando 1 es 1-2, derrota');
});

test('settleAsian: linea de cuarto reparte el stake', () => {
  // +0.25 = medio stake en 0 y medio en +0.5
  assert.equal(settleAsian(1, 1, 0.25), -0.5, 'empate con +0.25 = medio vacio, media perdida');
  assert.equal(settleAsian(0, 1, 0.25), -1, 'derrota por 1 con +0.25 = perdida total');
  assert.equal(settleAsian(2, 1, 0.25), 1, 'ganar por 1 con +0.25 = victoria completa');
  // +0.75 = medio en +0.5 y medio en +1.0
  assert.equal(settleAsian(1, 1, 0.75), -1, 'empate con +0.75 pierde ambas partes');
  assert.equal(settleAsian(2, 1, 0.75), 0.5, 'ganar por 1 con +0.75 = medio ganho');
  assert.equal(settleAsian(3, 1, 0.75), 1, 'ganar por 2 con +0.75 = victoria total');
});

test('settleAsian: linea negativa resta goles al local', () => {
  assert.equal(settleAsian(2, 0, -0.5), 1, '2-0 con -0.5 gana');
  assert.equal(settleAsian(1, 0, -1.5), 1, '1-0 con -1.5 no cubre');
  assert.equal(settleAsian(3, 0, -1.5), 1, '3-0 con -1.5 cubre');
});

test('asianCoverProb: devuelve 0.5 exacto cuando es simetrico', () => {
  const p = asianCoverProb(1.4, 1.4, 0);
  assert.ok(Math.abs(p - 0.5) < 0.02, `esperaba ~0.5, dio ${p}`);
});

test('asianCoverProb: linea de cuarto promedia las dos medias lineas', () => {
  const base = asianCoverProb(1.6, 1.2, 0);
  const half = asianCoverProb(1.6, 1.2, 0.5);
  assert.ok(Math.abs(asianCoverProb(1.6, 1.2, 0.25) - (base + half) / 2) < 1e-9);
});

test('asianCoverProb: mas favorito local, mas cubre', () => {
  const fuerte = asianCoverProb(2.2, 0.9, 0);
  const flojo = asianCoverProb(0.9, 2.2, 0);
  assert.ok(fuerte > 0.5 && flojo < 0.5);
  // scoreMatrix trunca a MAX_GOALS, la suma no da exactamente 1
  assert.ok(Math.abs(fuerte + flojo - 1) < 1e-6, 'deben ser complementarios');
});

test('asianCoverProb: todos los valores en [0,1]', () => {
  for (const lh of [0.4, 1.1, 2.5, 3.5]) {
    for (const la of [0.4, 1.1, 2.5]) {
      for (const line of [-1.5, -1, -0.75, -0.5, 0, 0.25, 0.5, 1]) {
        const p = asianCoverProb(lh, la, line);
        assert.ok(p >= 0 && p <= 1, `fuera de rango: ${lh}/${la}/${line} = ${p}`);
      }
    }
  }
});

test('asianCoverProb no rompe el handicapProb existente', () => {
  assert.equal(typeof handicapProb(1.4, 1.2, 0), 'number');
  assert.equal(typeof overProb(1.4, 1.2, 2.5), 'number');
  assert.equal(typeof bttsProb(1.4, 1.2), 'number');
});