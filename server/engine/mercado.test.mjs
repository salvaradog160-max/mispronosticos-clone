/**
 * Tests del motor de mercado.
 *
 * No tocan red: el HTML de OddsMath se fabricó con el formato real
 * (verificado 2026-10-13 contra un partido en vivo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSerie, diagnosticar, lambdaDesdeProb, probSinMargen, leerJsonArray,
} from './mercado.mjs';

// --- HTML con el formato exacto que sirve OddsMath ---
const htmlReal = `
var local_dates = {"1":"2026-10-12 10:00:00","2":"2026-10-12 14:00:00",
  "3":"2026-10-12 18:00:00","4":"2026-10-12 22:00:00"};
var all_data = [{"label":"O","label_long":"Over 2.5","data":[[1,1.9],[2,1.8],[3,1.7],[4,1.6]],"color":"#72AD05"},
                {"label":"U","label_long":"Under 2.5","data":[[1,2.0],[2,2.05],[3,2.1],[4,2.2]],"color":"#FF0000"},];
var options = { x: 1 };
`;

test('parseSerie: lee Over y Under con el formato real', () => {
  const s = parseSerie(htmlReal);
  assert.equal(s.puntos.length, 4, 'debe leer los 4 puntos');
  assert.equal(s.ts.length, 4);
  assert.equal(s.puntos[0].over, 1.9);
  assert.equal(s.puntos[0].under, 2.0);

  // local_dates son UTC
  assert.equal(s.ts[0], Date.parse('2026-10-12T10:00:00Z'));
});

test('parseSerie: une Over y Under por indice', () => {
  const html = `
  var local_dates = {"1":"2026-10-12 10:00:00","2":"2026-10-12 11:00:00"};
  var all_data = [{"label":"O","data":[[1,1.9],[2,1.8]]},
                  {"label":"U","data":[[1,2.0],[2,2.1]]},];
  `;
  const s = parseSerie(html);
  assert.equal(s.puntos.length, 2);
  assert.deepEqual(s.puntos[0], { over: 1.9, under: 2.0 });
  assert.deepEqual(s.puntos[1], { over: 1.8, under: 2.1 });
});

test('parseSerie: devuelve vacio si no hay Over/Under pareados', () => {
  const html = `var local_dates = {"1":"2026-10-12 10:00:00"};
                var all_data = [{"label":"O","data":[[1,1.9]]},];`;
  assert.equal(parseSerie(html).puntos.length, 0, 'Over sin Under no es serie');
});

test('leerJsonArray: aguanta coma final (",]") que JSON estricto rechaza', () => {
  // asi termina all_data en OddsMath: objeto con coma antes del corchete
  const txt = 'x = [{"a":1,"b":[2,3]},];';
  const r = leerJsonArray(txt, txt.indexOf('x'));
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].b, [2, 3]);
});

test('probSinMargen: quita el margen y da la probabilidad real', () => {
  // 2.00 y 2.00 -> libro justo -> 50%
  assert.ok(Math.abs(probSinMargen(2.0, 2.0) - 0.5) < 1e-9);
  // el Over a cuota menor es mas probable
  assert.ok(probSinMargen(1.8, 2.2) > 0.5);
  assert.equal(probSinMargen(1, 2), null, 'cuota <= 1 es invalida');
});

test('lambdaDesdeProb: resuelve los goles esperados desde la cuota', () => {
  // Poisson con lambda ~2.8 -> P(Over 2.5) ~0.53 (el caso del partido real)
  const lambda = lambdaDesdeProb(0.53, 2.5);
  assert.ok(Math.abs(lambda - 2.8) < 0.05, `esperado ~2.8, dio ${lambda}`);
  // linea mas alta exige mas goles para la misma probabilidad
  assert.ok(lambdaDesdeProb(0.53, 3.5) > lambdaDesdeProb(0.53, 2.5));
  // probabilidad no representable
  assert.equal(lambdaDesdeProb(0.99, 2.5), null);
  assert.equal(lambdaDesdeProb(0.5, NaN), null);
});

test('diagnosticar: marca la direccion del movimiento', () => {
  // 24h con Over bajando de cuota = P(Over) subiendo = 'hacia Over'
  const puntos = [];
  const ahora = Date.now();
  const ts = [];
  for (let i = 0; i < 12; i++) {
    puntos.push({ over: 2.1 - i * 0.03, under: 1.75 }); // over cada vez mas probable
    ts.push(ahora - (12 - i) * 2 * 3600e3);
  }
  const d = diagnosticar(puntos, ts, 2.5);
  assert.ok(d.suficiente);
  assert.equal(d.direccion, 'hacia Over');
  assert.ok(d.delta24hPP > 0, 'el delta de 24h debe ser positivo');
  assert.equal(d.veredicto, 'movimiento marcado');
});

test('diagnosticar: pocos puntos NO es suficiente (no inventa señal)', () => {
  const d = diagnosticar([{ over: 2, under: 2 }], [Date.now()], 2.5);
  assert.equal(d.suficiente, false, 'con 1 punto no se puede diagnosticar movimiento');
});

test('diagnosticar: linea plana no se marca como movimiento', () => {
  const puntos = [], ts = [];
  const ahora = Date.now();
  for (let i = 0; i < 12; i++) {
    puntos.push({ over: 2.0, under: 2.0 }); // siempre 50/50
    ts.push(ahora - (12 - i) * 2 * 3600e3);
  }
  const d = diagnosticar(puntos, ts, 2.5);
  assert.equal(d.direccion, 'plano');
  assert.equal(d.veredicto, 'plano');
  assert.equal(d.delta24hPP, 0);
});