import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarMovimiento, tramoDe, huella } from './movimiento.mjs';

const BUCKETS = [
  { lo: 0.5, hi: 0.55, accuracy: 0.527 },
  { lo: 0.55, hi: 0.6, accuracy: 0.597 },
  { lo: 0.6, hi: 0.7, accuracy: 0.646 },
];
const TRAMOS = { '1X2': BUCKETS, TOTAL: BUCKETS };

const pick = ({
  id = 'p1',
  fixtureId = 'f1',
  market = '1X2',
  linea = null,
  homeTeam = 'Local',
  awayTeam = 'Visitante',
  selection = 'Gana Local',
  confidence = 65,
  probMercado = 0.61,
  odds = 1.6,
} = {}) => ({ id, fixtureId, market, linea, homeTeam, awayTeam, selection, confidence, probMercado, odds });

test('tramoDe: encuentra el indice correcto', () => {
  assert.equal(tramoDe(BUCKETS, 0.52), 0);
  assert.equal(tramoDe(BUCKETS, 0.61), 2);
  assert.equal(tramoDe(BUCKETS, 0.99), -1);
  assert.equal(tramoDe([], 0.5), -1);
});

test('sin corrida previa no hay alertas de movimiento', () => {
  const r = detectarMovimiento([], [pick()], TRAMOS);
  assert.equal(r.length, 0, 'no debe avisar nada en la primera corrida');
});

test('sin cambios no hay alertas', () => {
  const r = detectarMovimiento([pick()], [pick()], TRAMOS);
  assert.equal(r.length, 0);
});

test('movimiento dentro del mismo tramo no avisa', () => {
  const r = detectarMovimiento([pick({ probMercado: 0.615, confidence: 65 })], [pick({ probMercado: 0.63, confidence: 65 })], TRAMOS);
  assert.equal(r.length, 0, '0.615 y 0.63 estan en el mismo tramo');
});

test('cruce de tramo dispara SALTO_TRAMO y baja la confianza', () => {
  const antes = pick({ probMercado: 0.61, confidence: 65 });
  const ahora = pick({ probMercado: 0.57, confidence: 60 });
  const r = detectarMovimiento([antes], [ahora], TRAMOS);
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'SALTO_TRAMO');
  assert.equal(r[0].antes.confianza, 65);
  assert.equal(r[0].ahora.confianza, 60);
  assert.equal(r[0].severidad, 'alta', 'bajar la confianza es alta severidad');
});

test('subir de tramo tambien avisa', () => {
  const r = detectarMovimiento([pick({ probMercado: 0.57, confidence: 60 })], [pick({ probMercado: 0.62, confidence: 65 })], TRAMOS);
  assert.equal(r[0].tipo, 'SALTO_TRAMO');
});

test('cambio de lado del mercado es severidad alta', () => {
  const antes = pick({ selection: 'Gana Local', probMercado: 0.52 });
  const ahora = pick({ selection: 'Gana Visitante', probMercado: 0.52 });
  const r = detectarMovimiento([antes], [ahora], TRAMOS);
  assert.equal(r[0].tipo, 'CAMBIO_LADO');
  assert.equal(r[0].severidad, 'alta');
});

test('cambio de linea de goles invalida el pick anterior', () => {
  const antes = pick({ market: 'TOTAL', linea: 2.5, selection: 'Más de 2.5', confidence: 70 });
  const ahora = pick({ market: 'TOTAL', linea: 3, selection: 'Más de 3', confidence: 60 });
  const r = detectarMovimiento([antes], [ahora], TRAMOS);
  assert.equal(r[0].tipo, 'LINEA_GOLES');
  assert.equal(r[0].antes.linea, 2.5);
  assert.equal(r[0].ahora.linea, 3);
});

test('pick que desaparece sin giro del mercado se avisa como retirado', () => {
  const r = detectarMovimiento([pick()], [], TRAMOS);
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'PICK_RETIRADO');
});

test('pick retirado por giro del mercado no duplica aviso', () => {
  const antes = pick({ selection: 'Gana Local', probMercado: 0.52 });
  const ahora = pick({ selection: 'Gana Visitante', probMercado: 0.52 });
  const r = detectarMovimiento([antes], [ahora], TRAMOS);
  assert.equal(r.filter(x => x.tipo === 'PICK_RETIRADO').length, 0);
  assert.equal(r.filter(x => x.tipo === 'CAMBIO_LADO').length, 1);
});

test('pick nuevo con corrida previa previa genera aviso de baja severidad', () => {
  const r = detectarMovimiento([pick({ fixtureId: 'f1' })], [pick({ fixtureId: 'f1' }), pick({ fixtureId: 'f2', id: 'p2' })], TRAMOS);
  const nuevos = r.filter(x => x.tipo === 'NUEVO_PICK');
  assert.equal(nuevos.length, 1);
  assert.equal(nuevos[0].fixtureId, 'f2');
  assert.equal(nuevos[0].severidad, 'baja');
});

test('las alertas salen ordenadas por severidad', () => {
  const antes = [pick({ fixtureId: 'f1', probMercado: 0.61, confidence: 65 })];
  const ahora = [
    pick({ fixtureId: 'f1', probMercado: 0.57, confidence: 60 }),
    pick({ fixtureId: 'f2', id: 'p2' }),
  ];
  const r = detectarMovimiento(antes, ahora, TRAMOS);
  assert.equal(r[0].severidad, 'alta');
});

test('pick sin probMercado se ignora en vez de romper', () => {
  const antes = pick({ probMercado: undefined });
  const ahora = pick({ probMercado: 0.57 });
  assert.doesNotThrow(() => detectarMovimiento([antes], [ahora], TRAMOS));
});

test('huella ignora el timestamp', () => {
  const a = { generado: '2026-01-01', picks: [pick()], alertas: [] };
  const b = { generado: '2026-01-02', picks: [pick()], alertas: [] };
  assert.equal(huella(a), huella(b));
});

test('huella SI nota un cambio de confianza', () => {
  const a = { picks: [pick({ confidence: 65 })], alertas: [] };
  const b = { picks: [pick({ confidence: 60 })], alertas: [] };
  assert.notEqual(huella(a), huella(b));
});