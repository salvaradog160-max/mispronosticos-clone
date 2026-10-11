
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarTabla, mapearFila } from './espn.mjs';

/**
 * Tabla de posiciones.
 *
 * Salen de un caso real: ESPN las entrega DESORDENADAS (llegaron
 * 3, 9, 8, 5, 6) y con el escudo en `team.logos[0].href` en vez de
 * `team.logo`, que es como viene en el scoreboard. Sin las dos
 * correcciones la tabla sale ilegible y sin escudos.
 */

test('ordena por puntos, luego diferencia, luego ganados', () => {
  const filas = [
    { equipo: 'C', puntos: 21, diferencia: 6, ganados: 5 },
    { equipo: 'A', puntos: 26, diferencia: 2, ganados: 8 },
    { equipo: 'B', puntos: 24, diferencia: 3, ganados: 7 },
    { equipo: 'D', puntos: 21, diferencia: 9, ganados: 5 },
  ];
  const out = ordenarTabla(filas);
  assert.deepEqual(out.map(f => f.equipo), ['A', 'B', 'D', 'C'], 'D tiene mas diferencia que C');
  assert.deepEqual(out.map(f => f.posicion), [1, 2, 3, 4], 'la posicion se renumera');
});

test('desempate completo: misma diferencia decide el que ganaste mas', () => {
  const out = ordenarTabla([
    { equipo: 'X', puntos: 20, diferencia: 3, ganados: 4 },
    { equipo: 'Y', puntos: 20, diferencia: 3, ganados: 6 },
  ]);
  assert.equal(out[0].equipo, 'Y');
});

test('el escudo sale de logos[0].href, no de logo', () => {
  // En standings el escudo viene como ARRAY; en scoreboard como string.
  const fila = mapearFila(
    {
      team: {
        displayName: 'Boca Juniors',
        color: '0060f0',
        logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/5.png' }],
      },
      stats: [
        { name: 'rank', value: 3 },
        { name: 'gamesPlayed', value: 12 },
        { name: 'wins', value: 5 },
        { name: 'ties', value: 6 },
        { name: 'losses', value: 1 },
        { name: 'points', value: 21 },
        { name: 'pointDifferential', value: 6 },
        { name: 'pointsFor', value: 19 },
        { name: 'pointsAgainst', value: 13 },
      ],
    },
  );
  assert.equal(fila.escudo, 'https://a.espncdn.com/i/teamlogos/soccer/500/5.png');
  assert.equal(fila.puntos, 21);
  assert.equal(fila.ganados, 5);
});

test('ties de ESPN son EMPATES, no derrotas', () => {
  // Trampa de nombre: en una liga de puntos `ties` son los empates.
  const stats = n => ({ name: n, value: 3 });
  const fila = mapearFila({
    team: { displayName: 'X' },
    stats: [
      stats('gamesPlayed'), stats('wins'), stats('ties'), stats('losses'),
      stats('points'), stats('pointDifferential'), stats('pointsFor'), stats('pointsAgainst'),
    ],
  });
  assert.equal(fila.empatados, 3, 'ties -> empatados');
  assert.equal(fila.perdidos, 3, 'losses -> perdidos');
});

test('una fila sin stats no rompe: los numeros ausentes son 0, no NaN', () => {
  const fila = mapearFila({ team: { displayName: 'Y' }, stats: [] });
  assert.equal(fila.puntos, 0);
  assert.equal(fila.pj, 0);
  assert.equal(fila.equipo, 'Y');
  assert.equal(fila.escudo, null);
});
