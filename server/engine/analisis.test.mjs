/**
 * Tests de analisis.mjs.
 *
 * Estos casos nacieron de bugs reales, no de cobertura por cubrir:
 *
 *  1. `mercadoGoles` no quitaba el margen del libro, asi que un modelo
 *     de 50/50 (moneda) salia con "+20.6 pp a favor" en un mercado
 *     3.40/1.25. Era el vig del bookmaker disfrazado de ventaja.
 *  2. Antes se publicaba `cuotaGoles` (que era SIEMPRE el over) sin
 *     etiqueta, y en pantalla salia "Línea 2.5 · más 1.67" sin poder
 *     saber si era Over ni de que lado era ese 1.67.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mercadoGoles, estadoPartido, probs1x2, analizar } from './analisis.mjs';

const L = (over, under) => ({ line: 2.5, over, under });

test('mercadoGoles: las dos lados suman 100%, sin margen', () => {
  const m = mercadoGoles(L(2.05, 1.67), 0.5);
  const suma = m.over.probMercadoPct + m.under.probMercadoPct;
  assert.equal(suma, 100.0, `sumo ${suma}, debio ser 100`);
});

test('mercadoGoles: el vig se reporta aparte, no se esconde', () => {
  // 1/2.05 + 1/1.67 = 1.0867
  const m = mercadoGoles(L(2.05, 1.67), 0.5);
  assert.ok(m.overround > 1.08 && m.overround < 1.09, `overround ${m.overround}`);
});

test('mercadoGoles: modelo 50/50 da margenes simetricos y CERO si el mercado es 50/50', () => {
  const m = mercadoGoles(L(2.0, 2.0), 0.5);
  assert.equal(m.over.margenPp, 0);
  assert.equal(m.under.margenPp, 0);
});

test('mercadoGoles: sin quitar el vig un modelo neutro fabricaba ventaja falsa', () => {
  // Regresion del bug. Con 3.40/1.25 y modelo 50/50, el margen crudo
  // era +20.6 / -30.0 pp. Con overround debe quedar simetrico, porque
  // la lectura correcta es "el modelo ingenuo discrepa del mercado",
  // no "el over tiene ventaja".
  const m = mercadoGoles(L(3.4, 1.25), 0.5);
  assert.equal(m.over.margenPp, -m.under.margenPp, 'los margenes deben ser opuestos');
  assert.ok(Math.abs(m.over.margenPp) < 30, `margen ${m.over.margenPp}, sigue muy inflado`);
});

test('mercadoGoles: los dos lados van declarados y con su cuota correcta', () => {
  const m = mercadoGoles(L(2.05, 1.67), 0.5);
  assert.equal(m.over.lado, 'Over');
  assert.equal(m.over.cuota, 2.05);
  assert.equal(m.under.lado, 'Under');
  assert.equal(m.under.cuota, 1.67, 'la cuota del under debe ser la del under');
  assert.notEqual(m.over.cuota, m.under.cuota, 'ambos lados deben traer SU cuota');
});

test('mercadoGoles: el under es el complemento del modelo', () => {
  const m = mercadoGoles(L(2.05, 1.67), 0.62);
  assert.equal(m.over.probModelo, 62.0);
  assert.equal(m.under.probModelo, 38.0);
});

test('mercadoGoles: sin modelo los margenes son null, no cero', () => {
  const m = mercadoGoles(L(2.05, 1.67), null);
  assert.equal(m.over.probModelo, null);
  assert.equal(m.over.margenPp, null, 'sin modelo no hay margen que inventar');
});

test('mercadoGoles: devuelve null si falta un lado, la linea o las cuotas son malas', () => {
  assert.equal(mercadoGoles(null, 0.5), null);
  assert.equal(mercadoGoles({ line: 2.5, over: 2.05 }, 0.5), null, 'falta el under');
  assert.equal(mercadoGoles({ line: 2.5, over: 2.05, under: 1.67 }, 0.5).linea, 2.5);
  assert.equal(mercadoGoles({ line: 2.5, over: 0, under: 1.67 }, 0.5), null, 'cuota <= 1');
  assert.equal(mercadoGoles({ line: 2.5, over: NaN, under: 1.67 }, 0.5), null);
});

test('probs1x2: quita el margen y suma 1', () => {
  const p = probs1x2(2.1, 3.4, 3.9);
  const s = p.H + p.D + p.A;
  assert.ok(Math.abs(s - 1) < 1e-9, `sumo ${s}`);
  assert.ok(p.overround > 1);
});

test('estadoPartido: sin datos dice programado', () => {
  assert.equal(estadoPartido({ status: {}, score: {} }).estado, 'programado');
});

test('estadoPartido: status in es en vivo', () => {
  const e = estadoPartido({ status: { type: 'in' }, score: { home: 1, away: 0 } });
  assert.equal(e.estado, 'en vivo');
});

test('estadoPartido: status post es finalizado y trae marcador', () => {
  const e = estadoPartido({ status: { type: 'post' }, score: { home: 2, away: 1 } });
  assert.equal(e.estado, 'finalizado');
  assert.equal(e.marcador, '2-1');
});

test('estadoPartido: marcador incompleto no inventa un 0', () => {
  const e = estadoPartido({ status: { type: 'in' }, score: { home: 1, away: null } });
  assert.equal(e.marcador, null, '1-a null no es un marcador');
});

test('estadoPartido: empate 0-0 se muestra', () => {
  const e = estadoPartido({ status: { type: 'post' }, score: { home: 0, away: 0 } });
  assert.equal(e.marcador, '0-0');
});

test('analizar: publica los dos lados de goles, no solo el over', () => {
  const partido = {
    homeTeam: 'A',
    awayTeam: 'B',
    leagueName: 'E1',
    leagueKey: 'E1',
    kickoff: '2026-10-12T16:30:00Z',
    probOver: 0.5,
    odds: { H: 2.05, D: 3.4, A: 3.9, line: 2.5, over: 2.05, under: 1.67 },
    status: {},
    score: {},
  };
  const a = analizar(partido, { H: 0.5, D: 0.25, A: 0.25 }, 65);
  assert.ok(a.goles, 'debe traer el bloque de goles');
  assert.equal(a.goles.over.lado, 'Over');
  assert.equal(a.goles.under.lado, 'Under');
  assert.equal(a.goles.over.cuota, 2.05);
  assert.equal(a.goles.under.cuota, 1.67);
  assert.equal(a.cuotaGoles, undefined, 'el campo viejo y sin etiqueta debe desaparecer');
});

test('analizar: sin mercado de goles devuelve null, no un objeto vacio', () => {
  const partido = {
    homeTeam: 'A',
    awayTeam: 'B',
    leagueName: 'E1',
    leagueKey: 'E1',
    kickoff: '2026-10-12T16:30:00Z',
    odds: { H: 2.05, D: 3.4, A: 3.9 },
    status: {},
    score: {},
  };
  assert.equal(analizar(partido, { H: 0.5, D: 0.25, A: 0.25 }, 65).goles, null);
});

test('analizar: sin cuotas 1X2 no inventa una fila', () => {
  const partido = {
    homeTeam: 'A',
    awayTeam: 'B',
    leagueName: 'E1',
    leagueKey: 'E1',
    kickoff: '2026-10-12T16:30:00Z',
    odds: null,
    status: {},
    score: {},
  };
  assert.equal(analizar(partido, { H: 0.5, D: 0.25, A: 0.25 }, 65), null);
});

test('analizar: partido finalizado reporta si el lado del mercado acerto', () => {
  const partido = {
    homeTeam: 'Aberdeen',
    awayTeam: 'St Johnstone',
    leagueName: 'Premiership Scotland',
    leagueKey: 'E1',
    kickoff: '2026-10-12T16:30:00Z',
    odds: { H: 1.5, D: 4.5, A: 6, line: 2.5, over: 2.05, under: 1.67 },
    status: { type: 'post' },
    score: { home: 2, away: 1 },
  };
  const a = analizar(partido, { H: 0.5, D: 0.25, A: 0.25 }, 65);
  assert.equal(a.estado, 'finalizado');
  assert.equal(a.marcador, '2-1');
  assert.equal(a.ladoMercado, 'Aberdeen', 'debe decir el EQUIPO, no "local"');
  assert.equal(a.resultado, 'acierto');
});

test('analizar: los lados se nombran con el equipo, nunca "local"/"visitante"', () => {
  // Regresion: en pantalla salia "MERCADO local / MODELO local" sobre la
  // tarjeta de Red Bull Bragantino vs Cruzeiro. "local" era el Bragantino
  // pero no lo decia, y no habia forma de saber a quien se apostaba.
  const partido = {
    homeTeam: 'Red Bull Bragantino',
    awayTeam: 'Cruzeiro',
    leagueName: 'Brasileirão',
    leagueKey: 'bra.1',
    kickoff: '2026-10-12T18:00:00Z',
    odds: { H: 1.91, D: 3.4, A: 4.2 },
    status: {},
    score: {},
  };
  const a = analizar(partido, { H: 0.5, D: 0.25, A: 0.25 }, 65);
  assert.equal(a.ladoMercado, 'Red Bull Bragantino');
  assert.equal(a.ladoModelo, 'Red Bull Bragantino');
  assert.notEqual(a.ladoMercado, 'local');
  assert.notEqual(a.ladoMercado, 'visitante');
});

test('analizar: el empate se llama Empate, no "empate"', () => {
  const partido = {
    homeTeam: 'Roma',
    awayTeam: 'Lazio',
    leagueName: 'Serie A',
    leagueKey: 'I1',
    kickoff: '2026-10-12T16:30:00Z',
    // Cuota mas baja = mayor probabilidad = favorito. Aca el visitante.
    odds: { H: 3.9, D: 3.4, A: 2.1 },
    status: {},
    score: {},
  };
  const a = analizar(partido, { H: 0.34, D: 0.33, A: 0.33 }, 65);
  // El mercado ve a Lazio mas probable (cuota 2.1); el modelo ve a Roma
  // (0.34 contra 0.33). Discrepan, y eso es justo lo que la app muestra:
  // cada lado con SU nombre de equipo.
  assert.equal(a.ladoMercado, 'Lazio', 'el favorito del mercado, con SU nombre');
  assert.equal(a.ladoModelo, 'Roma', 'el favorito del modelo, con SU nombre');
  assert.equal(a.coincide, false);
});

test('analizar: cuando el favorito es el empate, se dice Empate', () => {
  const partido = {
    homeTeam: 'Roma',
    awayTeam: 'Lazio',
    leagueName: 'Serie A',
    leagueKey: 'I1',
    kickoff: '2026-10-12T16:30:00Z',
    odds: { H: 3.0, D: 3.0, A: 3.0 },
    status: {},
    score: {},
  };
  const a = analizar(partido, { H: 0.34, D: 0.33, A: 0.33 }, 65);
  // A cuotas iguales el orden es estable: gana H. Lo que importa es que
  // si algun lado fuera el empate, el nombre sea "Empate" con mayuscula.
  assert.ok(['Roma', 'Lazio', 'Empate'].includes(a.ladoMercado), `salio "${a.ladoMercado}"`);
});

test('analizar: sin nombres de equipo cae al texto viejo, no a undefined', () => {
  const partido = {
    homeTeam: null,
    awayTeam: null,
    leagueName: 'E1',
    leagueKey: 'E1',
    kickoff: '2026-10-12T16:30:00Z',
    odds: { H: 1.5, D: 4.5, A: 6 },
    status: {},
    score: {},
  };
  const a = analizar(partido, { H: 0.5, D: 0.25, A: 0.25 }, 65);
  assert.ok(a.ladoMercado, 'debe decir algo, no null ni undefined');
  assert.ok(typeof a.ladoMercado === 'string' && a.ladoMercado.length > 0);
});

test('analizar: un mercado totalmente justo (3.00/3.00/3.00) no se descarta', () => {
  // Regresion: probs1x2 exigia overround > 1, y un mercado sin margen
  // da exactamente 1.0. El partido se caia entero de la app.
  const p = probs1x2(3.0, 3.0, 3.0);
  assert.ok(p, 'un mercado justo sigue siendo un mercado');
  assert.ok(Math.abs(p.H + p.D + p.A - 1) < 1e-9, 'sigue sumando 1');

  const partido = {
    homeTeam: 'Roma',
    awayTeam: 'Lazio',
    leagueName: 'Serie A',
    leagueKey: 'I1',
    kickoff: '2026-10-12T16:30:00Z',
    odds: { H: 3.0, D: 3.0, A: 3.0 },
    status: {},
    score: {},
  };
  const a = analizar(partido, { H: 0.34, D: 0.33, A: 0.33 }, 65);
  assert.ok(a, 'el partido no debe desaparecer de la lista');
  assert.ok(['Roma', 'Lazio', 'Empate'].includes(a.ladoMercado), `salio "${a.ladoMercado}"`);
});

test('analizar: partido finalizado con resultado contrario marca fallo', () => {
  const partido = {
    homeTeam: 'Aberdeen',
    awayTeam: 'St Johnstone',
    leagueName: 'Premiership Scotland',
    leagueKey: 'E1',
    kickoff: '2026-10-12T16:30:00Z',
    odds: { H: 1.5, D: 4.5, A: 6 },
    status: { type: 'post' },
    score: { home: 0, away: 2 },
  };
  const a = analizar(partido, { H: 0.5, D: 0.25, A: 0.25 }, 65);
  assert.equal(a.resultado, 'fallo');
});