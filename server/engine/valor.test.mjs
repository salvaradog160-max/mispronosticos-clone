import test from 'node:test';
import assert from 'node:assert/strict';
import { breakEven, margen, esRentable, evaluarPick, anotarValor, MARGEN_MINIMO, MARGEN_MAXIMO } from './valor.mjs';

test('breakEven: a cuota 2.00 necesitas 50%', () => {
  assert.equal(breakEven(2), 0.5);
});

test('breakEven: cuota alta exige mucho mas', () => {
  assert.ok(Math.abs(breakEven(1.63) - 0.6135) < 0.001);
  assert.ok(Math.abs(breakEven(1.3) - 0.7692) < 0.001);
});

test('margen negativo cuando la confianza no cubre la cuota', () => {
  // Lazio: 57% de acierto a cuota 1.63. Necesitas 61.3%. Pierde dinero.
  const m = margen(0.57, 1.63);
  assert.ok(m < 0, 'un pick que acierta y aun asi pierde debe tener margen negativo');
  assert.ok(Math.abs(m + 0.0435) < 0.002);
});

test('un pick que acierta mucho sigue sin ser rentable si la cuota es baja', () => {
  const ev = evaluarPick(0.73, 1.54);
  assert.ok(ev.margen > 0, '73% a cuota 1.54 si sale rentable');
  assert.ok(ev.rentable, 'debe superar el margen minimo');
});

test('roiUnit: acierto con margen positivo produce ROI positivo', () => {
  const ev = evaluarPick(0.73, 1.54);
  assert.ok(ev.roiUnit > 0, `ROI ${ev.roiUnit}`);
});

test('roiUnit: acierto por debajo del break-even produce ROI negativo', () => {
  const ev = evaluarPick(0.57, 1.63);
  assert.ok(ev.roiUnit < 0, 'debe perder dinero aunque acierte mas de la mitad');
});

test('roiUnit: 50% a cuota 2.00 esta exactamente en break-even', () => {
  const ev = evaluarPick(0.5, 2.0);
  assert.ok(Math.abs(ev.roiUnit) < 1e-9, 'break-even exacto');
});

test('esRentable exige el margen minimo de 5pp', () => {
  // 0.60 a 2.00 -> break-even 50%, margen +10pp: supera el minimo.
  assert.equal(esRentable(0.60, 2.0), true);
  // 0.54 a 2.00 -> break-even 50%, margen +4pp: NO alcanza el minimo.
  assert.equal(esRentable(0.54, 2.0), false, '4pp queda por debajo del minimo');
  // Justo en el minimo: 0.55 a 2.00 -> margen 5pp exacto, debe pasar.
  assert.equal(esRentable(0.55, 2.0, 0.05), true);
  assert.equal(MARGEN_MINIMO, 0.05);
});

test('esRentable: margen extremo se rechaza, casi siempre es error de dato', () => {
  // Leccion del motor de referencia: >12pp de edge no existe en la
  // realidad, es cuota vieja o dato roto. Rechazo de plano.
  // 0.90 a 1.20 -> break-even 83.3%, margen 6.7pp: normal, pasa.
  assert.equal(esRentable(0.90, 1.20), true, 'dentro del rango sano');
  // 0.90 a 1.05 -> break-even 95.2%, margen -5.2pp: ni siquiera llega al minimo.
  // 0.99 a 1.10 -> break-even 90.9%, margen 8.1pp: pasa.
  assert.equal(esRentable(0.99, 1.10), true);
  // 0.98 a 1.06 -> break-even 94.3%, margen 3.7pp: no llega al minimo.
  // 0.80 a 1.10 -> break-even 90.9%, margen negativo: se va.
  assert.equal(esRentable(0.80, 1.10), false);
  // Un 78% a 1.05 -> break-even 95.2%: margen -17pp, imposible.
  assert.equal(esRentable(0.78, 1.05), false);
  // MARGEN_MAXIMO esta definido y es razonable.
  assert.ok(MARGEN_MAXIMO >= 0.10 && MARGEN_MAXIMO <= 0.20, 'tope sano');
});

test('esRentable: margen menor a 5pp se descarta', () => {
  // 0.58 a 1.50: break-even 66.7%, margen muy negativo
  assert.equal(esRentable(0.58, 1.5), false);
});

test('esRentable: 73% a 1.54 pasa el filtro', () => {
  assert.equal(esRentable(0.73, 1.54), true);
});

test('sin cuota no se puede evaluar, no se cuela como rentable', () => {
  assert.equal(esRentable(0.73, null), false);
  assert.equal(esRentable(0.73, 0), false);
  assert.equal(esRentable(0.73, 1), false);
});

test('anotarValor separa lo que es rentable de lo que no', () => {
  const picks = [
    { id: 'a', confidence: 73, odds: 1.54 }, // 73 vs 64.9 -> +8.1pp, rentable
    { id: 'b', confidence: 57, odds: 1.63 }, // -4.3pp, no
    { id: 'c', confidence: 60, odds: 1.30 }, // cuota muy baja, no
    { id: 'd', confidence: 76, odds: 1.67 }, // +16.1pp: EXTREMO, se rechaza (cuota sospechosa)
    { id: 'e', confidence: 70, odds: 1.55 }, // 70 vs 64.5 -> +5.5pp, rentable
  ];
  const { rented, descartados } = anotarValor(picks);
  assert.deepEqual(rented.map(p => p.id), ['a', 'e'], 'rentables dentro del rango sano');
  assert.deepEqual(descartados.map(p => p.id).sort(), ['b', 'c', 'd'], 'd cae por margen extremo');
});

test('anotarValor agrega las metricas al pick', () => {
  const { rented } = anotarValor([{ id: 'a', confidence: 73, odds: 1.54 }]);
  assert.equal(typeof rented[0].roiUnit, 'number');
  assert.equal(typeof rented[0].margen, 'number');
  assert.equal(typeof rented[0].breakEven, 'number');
  assert.equal(rented[0].rentable, true);
});

test('todos los picks de la app de hoy: cuantos sobreviven', () => {
  const picks = [
    { id: 'atalanta', confidence: 73, odds: 1.54 }, // 73 vs 64.9 -> +8.1pp
    { id: 'lazio', confidence: 57, odds: 1.63 },    // 57 vs 61.3 -> -4.3pp
    { id: 'freiburg', confidence: 57, odds: 1.61 }, // -4.0pp
    { id: 'bologna', confidence: 47, odds: 1.91 },  // 47 vs 52.4 -> -5.4pp
    { id: 'torino', confidence: 44, odds: 2.30 },   // 44 vs 43.5 -> +0.5pp, insufficient
  ];
  const { rented } = anotarValor(picks);
  assert.deepEqual(rented.map(p => p.id), ['atalanta'], 'solo Atalanta tiene margen de 5pp');
});