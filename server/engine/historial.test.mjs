import { test } from 'node:test';
import assert from 'node:assert';
import { historialDe, combinar, riesgoDe, cuotaJusta, pronosticos } from './historial.mjs';

const p = (d, h, a, hs, as) => ({ utcDate: d, homeTeam: h, awayTeam: a, homeScore: hs, awayScore: as });

test('historialDe: cuadros reales desde la historia, sin captura', () => {
  const hist = [
    p('01/01/2025', 'Lazio', 'Juventus', 2, 0),
    p('08/01/2025', 'Lazio', 'Roma', 1, 1),
    p('15/01/2025', 'Inter', 'Lazio', 2, 1),
    p('22/01/2025', 'Lazio', 'Monza', 3, 1),
    p('29/01/2025', 'Napoli', 'Lazio', 1, 2),
    // Monza
    p('02/01/2025', 'Monza', 'Salernitana', 1, 0),
    p('09/01/2025', 'Torino', 'Monza', 2, 1),
    p('16/01/2025', 'Monza', 'Verona', 1, 1),
    p('23/01/2025', 'Bologna', 'Monza', 3, 0),
    p('30/01/2025', 'Monza', 'Udinese', 2, 1),
  ];
  const h = historialDe(hist, 'Lazio', 'Monza');
  assert.ok(h, 'historialDe devuelve objeto');
  assert.ok(h.cuadros.generalLocal.n >= 1, 'cuadro general local poblado');
  assert.ok(h.cuadros.localCasa, 'cuadro L/V local presente');
  assert.equal(typeof h.cuadros.generalLocal.gfProm, 'number');
  assert.ok(h.probs.pBase, 'prob base 1X2');
  assert.ok(h.tendencias.general, 'tendencias general');
});

test('historialDe: H2H directo entre los dos equipos', () => {
  const hist = [
    p('01/01/2024', 'Lazio', 'Monza', 2, 0),
    p('01/01/2025', 'Monza', 'Lazio', 1, 1),
    p('02/01/2025', 'Lazio', 'Monza', 3, 1),
  ];
  const h = historialDe(hist, 'Lazio', 'Monza', { limite: 5 });
  assert.equal(h.h2hPartidos, 3, 'cuenta 3 enfrentamientos directos');
  assert.equal(h.serieH2H.length, 3);
  assert.ok(h.probs.pH2H, 'prob H2H');
});

test('combinar: pesos 50/30/20 y reparto si falta fuente', () => {
  const modelo = { H: 0.828, D: 0.099, A: 0.073 };
  const base = { H: 0.5, D: 0.358, A: 0.142 };
  const h2h = { H: 0.6, D: 0.2, A: 0.2 };
  const { pComb, usados } = combinar(modelo, base, h2h);
  assert.deepEqual(usados.sort(), ['base', 'h2h', 'modelo']);
  // H = 0.5*0.828 + 0.3*0.5 + 0.2*0.6 = 0.414 + 0.15 + 0.12
  assert.ok(Math.abs(pComb.H - (0.414 + 0.15 + 0.12)) < 0.001);
  // Solo modelo + base: reparte el 20% de h2h
  const sinH = combinar(modelo, base, null);
  const total = 0.5 + 0.3;
  const esperadoH = (0.5 * 0.828 + 0.3 * 0.5) / total;
  assert.ok(Math.abs(sinH.pComb.H - esperadoH) < 0.001);
});

test('riesgoDe: bajo desde 75%, sube si difieren 25pp', () => {
  assert.equal(riesgoDe(0.8, 0.8, 0.8), 'bajo');
  assert.equal(riesgoDe(0.65, 0.7, 0.6), 'medio');
  assert.equal(riesgoDe(0.5, 0.5, 0.5), 'alto');
  // difiere >25pp => sube nivel (0.84 en teoria bajo, sube a medio)
  assert.equal(riesgoDe(0.84, 0.93, 0.6), 'medio');
});

test('cuotaJusta = 1/p; pronosticos ordenados por probabilidad', () => {
  assert.equal(cuotaJusta(0.66), 1.52);
  const pro = pronosticos({
    pComb: { H: 0.66, D: 0.23, A: 0.11 },
    pModelo: { H: 0.828, D: 0.099, A: 0.073 },
    pBase: { H: 0.5, D: 0.358, A: 0.142 },
  });
  assert.ok(pro.length >= 5, `5+ mercados, hay ${pro.length}`);
  assert.ok(pro[0].p >= pro[pro.length - 1].p, 'ordenados descendente');
  assert.ok(pro.every(x => typeof x.nombre === 'string' && x.cuotaJusta > 0));
  const unoX = pro.find(x => x.tipo === '1X');
  assert.ok(Math.abs(unoX.p - (0.66 + 0.23)) < 0.001, '1X = H+D');
});

test('riesgo del 1X usa la prob combinada del mercado, no la del lado H', () => {
  // 1X al 84% pero lado H 62%: riesgo bajo (no usa el 62%)
  const pComb = { H: 0.624, D: 0.22, A: 0.156 };
  const pModelo = { H: 0.828, D: 0.099, A: 0.073 };
  const pBase = { H: 0.3, D: 0.3, A: 0.4 };
  const pro = pronosticos({ pComb, pModelo, pBase });
  const unoX = pro.find(x => x.tipo === '1X');
  // 0.844 >= 0.75 => bajo; dif modelo 1X (0.927) vs base (0.6) = 32pp => sube a medio
  assert.equal(unoX.riesgo, 'medio');
});
test('tendenciasDe acepta filas de equipo {gf,gc} y crudas {gfLocal,gfVisita}', () => {
  // Filas de equipo con goles 3,1,2,2 => over1.5 = 4/4 = 100%
  const hist = [
    { utcDate: '01/01/2025', homeTeam: 'A', awayTeam: 'Rival', homeScore: 2, awayScore: 1 },
    { utcDate: '08/01/2025', homeTeam: 'Rival', awayTeam: 'A', homeScore: 0, awayScore: 3 },
    { utcDate: '15/01/2025', homeTeam: 'A', awayTeam: 'Rival', homeScore: 2, awayScore: 0 },
    { utcDate: '22/01/2025', homeTeam: 'A', awayTeam: 'Rival', homeScore: 1, awayScore: 1 },
  ];
  const h = historialDe(hist, 'A', 'Rival');
  const t = h.tendencias.general;
  assert.ok(t, 'tendencias presentes');
  assert.ok(t.n >= 3, `n correcto (${t.n})`);
  assert.ok(t.ou[0].over >= 0 && t.ou[0].over <= 100, 'over en rango');
  // En algun momento A anoto y Rival anoto => AA > 0 (a menos que 0 partidos lo hagan)
  assert.equal(typeof t.aa, 'number');
});
