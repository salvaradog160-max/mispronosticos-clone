/**
 * Tests de la lectura agregada en frases y de los bloques por contexto.
 *
 * Lo que se protege aqui:
 *  - local-en-casa y visitante-fuera NO se pueden volver a fusionar (el
 *    bug que escondia el dato que el usuario pidio dos veces);
 *  - la lectura cuenta sobre la MUESTRA COMPLETA, no sobre los ultimos
 *    partidos;
 *  - no se afirma una tendencia cuando el dato es 50/50 (ruido).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { historialDe } from './historial.mjs';

const P = (homeTeam, awayTeam, homeScore, awayScore, season, utcDate) => ({
  league: 'x', season, utcDate, key: `${utcDate}-${homeTeam}-${awayTeam}`,
  homeTeam, awayTeam,
  homeNorm: homeTeam.toLowerCase(), awayNorm: awayTeam.toLowerCase(),
  homeScore, awayScore,
});

const base = () => [
  // Local 'Azul' en casa: 4 partidos de la temporada vigente.
  P('Azul', 'Rojo', 2, 1, '2026', '2026-05-01'),
  P('Azul', 'Verde', 3, 0, '2026', '2026-04-20'),
  P('Azul', 'Blanco', 1, 1, '2026', '2026-04-10'),
  P('Azul', 'Negro', 2, 2, '2026', '2026-03-30'),
  // Visitante 'Rojo' de visita: 3 partidos.
  P('Gris', 'Rojo', 1, 0, '2026', '2026-05-02'),
  P('Cian', 'Rojo', 0, 2, '2026', '2026-04-21'),
  P('Rosa', 'Rojo', 3, 1, '2026', '2026-04-11'),
  // Temporada vieja, para el historico.
  P('Azul', 'Rojo', 1, 0, '2025', '2025-05-01'),
  P('Azul', 'Mora', 0, 0, '2025', '2025-04-15'),
  // H2H Azul-Rojo, incluyendo local en casa.
  P('Azul', 'Rojo', 3, 1, '2024', '2024-06-01'),
  P('Gris', 'Rojo', 1, 2, '2024', '2024-05-01'),
  P('Rojo', 'Azul', 1, 1, '2024', '2024-04-01'),
];

test('los contextos NO se fusionan: localCasa y visitaFuera son distintos', () => {
  const h = historialDe(base(), 'Azul', 'Rojo');
  const lc = h.tendencias.localCasa;
  const vf = h.tendencias.visitaFuera;
  assert.ok(lc && vf, 'deben existir ambos bloques');
  // Azul en casa: 4 (incluye el Azul-Rojo de la 2026)
  assert.equal(lc.n, 4, 'local en casa, temporada vigente');
  // Rojo de visita: 4 (Azul-Rojo, Gris, Cian, Rosa). El enfrentamiento
  // cuenta en ambos bloques, cada uno desde SU contexto. Es correcto.
  assert.equal(vf.n, 4, 'visitante de visita, temporada vigente');
  // el bloque mixto sigue existiendo pero ya no es la unica fuente
  assert.equal(h.tendencias.lv.n, lc.n + vf.n);
});

test('el historico se separa por contexto tambien', () => {
  const h = historialDe(base(), 'Azul', 'Rojo');
  assert.ok(h.tendencias.localCasaHist);
  assert.ok(h.tendencias.visitaFueraHist);
  // el historico del local en casa incluye la temporada vieja
  assert.ok(h.tendencias.localCasaHist.n > h.tendencias.localCasa.n);
});

test('la lectura cuenta sobre la muestra completa, no los ultimos partidos', () => {
  const h = historialDe(base(), 'Azul', 'Rojo');
  const lc = h.lectura.localCasa;
  assert.ok(lc, 'debe existir lectura de local en casa');
  assert.equal(lc.n, 4);
  assert.ok(lc.lineas.some(l => l.includes('4 partidos en este contexto')));
});

test('la lectura declara el n en cada afirmacion', () => {
  const h = historialDe(base(), 'Azul', 'Rojo');
  const frases = Object.values(h.lectura).filter(Boolean).flatMap(b => b.lineas);
  const conCuentas = frases.filter(l => / en \d+ de \d+ /.test(l));
  assert.ok(conCuentas.length > 0, 'debe haber frases con conteo');
  for (const f of conCuentas) {
    const m = f.match(/ en (\d+) de (\d+) /);
    assert.ok(m[1] <= m[2], `cuenta invalida: ${f}`);
  }
});

test('no afirma tendencia cuando el dato es 50/50', () => {
  // Fixture a proposito: BTTS exactamente 2 de 4 = 50%, que NO es tendencia.
  const plano = [
    P('Azul', 'Rojo', 2, 1, '2026', '2026-05-01'),  // ambos
    P('Azul', 'Gris', 3, 0, '2026', '2026-04-20'),  // no
    P('Azul', 'Cian', 0, 0, '2026', '2026-04-10'),  // no
    P('Azul', 'Rosa', 1, 1, '2026', '2026-03-30'),  // ambos
  ];
  const h = historialDe(plano, 'Azul', 'Rojo');
  const lc = h.lectura.localCasa;
  assert.equal(lc.n, 4);
  const btts = lc.lineas.find(l => l.includes('Ambos equipos'));
  assert.equal(btts, undefined, `no debe afirmar BTTS al 50%: ${btts}`);
});

test('afirma la tendencia cuando es clara', () => {
  // BTTS 3 de 4 = 75%: si es tendencia y debe declararse con su n.
  const h = historialDe(base(), 'Azul', 'Rojo');
  const lc = h.lectura.localCasa;
  const btts = lc.lineas.find(l => l.includes('Ambos equipos'));
  assert.ok(btts, '75% de BTTS si es tendencia');
  assert.ok(btts.includes('3 de 4'), `debe llevar el conteo: ${btts}`);
  // el promedio se declara siempre
  assert.ok(lc.lineas.some(l => l.startsWith('Promedio:')));
});

test('el H2H se lee tambien partido por sede', () => {
  const h = historialDe(base(), 'Azul', 'Rojo');
  assert.ok(h.lectura.h2h, 'H2H completo');
  assert.ok(h.lectura.h2hCasa, 'H2H local en casa');
  assert.ok(h.lectura.h2h.n > 0);
  // el H2H donde Azul es local es un subconjunto del H2H completo
  assert.ok(h.lectura.h2hCasa.n <= h.lectura.h2h.n);
});

test('lectura vacia devuelve null en vez de inventar', () => {
  const h = historialDe([P('Solo', 'Uno', 1, 0, '2026', '2026-01-01')], 'NoExiste', 'Tampoco');
  const vacias = Object.values(h.lectura ?? {}).filter(v => v === null);
  assert.ok(vacias.length > 0, 'sin historial debe ser null, no texto inventado');
});
