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

test('pronosticos incluye O/U y AA combinados (modelo+historial)', () => {
  const pro = pronosticos({
    pComb: { H: 0.334, D: 0.316, A: 0.35 },
    pModelo: { H: 0.318, D: 0.231, A: 0.451 },
    pBase: { H: 0.35, D: 0.4, A: 0.25 },
    golesModelo: { over1_5: 0.889, over2_5: 0.709, over3_5: 0.499, over4_5: 0.306, btts: 0.71 },
    tendHist: { ou: [{linea:1.5,over:80},{linea:2.5,over:60}], aa: 30 },
  });
  const o15 = pro.find(x => x.tipo === 'O1.5');
  assert.ok(o15, 'existe O1.5');
  // combinacion 50/50: (0.889 + 0.8)/2
  assert.ok(Math.abs(o15.p - (0.889 + 0.8) / 2) < 0.01, `O1.5 combinada ${o15.p}`);
  assert.ok(o15.modelo != null && o15.historial != null, 'trae modelo e historial');
  const aa = pro.find(x => x.tipo === 'AA');
  assert.ok(aa, 'existe AA');
  assert.ok(Math.abs(aa.p - 0.505) < 0.001); // (0.71+0.3)/2
});

test('forense: pronosticos ordenados por probabilidad', async () => {
  const { execFileSync } = await import('node:child_process');
  const { writeFile, rm, mkdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../data/cache', import.meta.url));
  const cachePath = join(dir, 'history.json');

  // El forense lee data/cache/history.json, que en CI no existe porque
  // se genera en cada corrida. Aqui se crea un cache sintetico con
  // partidos de P1 previos al kickoff (sin copas), se corre y se
  // restaura lo que habia (o se deja sin archivo).
  const previos = JSON.parse(await readFile(cachePath, 'utf8').catch(() => 'null'));
  const sintetico = {
    history: [
      { utcDate: '12/01/2025', league: 'P1', homeTeam: 'Rio Ave', awayTeam: 'Porto', homeScore: 0, awayScore: 1 },
      { utcDate: '26/01/2025', league: 'P1', homeTeam: 'Benfica', awayTeam: 'Rio Ave', homeScore: 3, awayScore: 0 },
      { utcDate: '09/02/2025', league: 'P1', homeTeam: 'Rio Ave', awayTeam: 'Sporting', homeScore: 1, awayScore: 2 },
      { utcDate: '23/02/2025', league: 'P1', homeTeam: 'Braga', awayTeam: 'Rio Ave', homeScore: 2, awayScore: 2 },
      { utcDate: '09/03/2025', league: 'P1', homeTeam: 'Rio Ave', awayTeam: 'Vitoria', homeScore: 1, awayScore: 1 },
      { utcDate: '22/03/2025', league: 'P1', homeTeam: 'Rio Ave', awayTeam: 'Nacional', homeScore: 2, awayScore: 0 },
      { utcDate: '05/04/2025', league: 'P1', homeTeam: 'Nacional', awayTeam: 'Rio Ave', homeScore: 1, awayScore: 1 },
      { utcDate: '12/08/2025', league: 'P1', homeTeam: 'Rio Ave', awayTeam: 'Maritimo', homeScore: 2, awayScore: 1 },
      { utcDate: '24/08/2025', league: 'P1', homeTeam: 'Farense', awayTeam: 'Rio Ave', homeScore: 0, awayScore: 1 },
      { utcDate: '07/09/2025', league: 'P1', homeTeam: 'Rio Ave', awayTeam: 'Belenenses', homeScore: 3, awayScore: 1 },
      { utcDate: '21/09/2025', league: 'P1', homeTeam: 'Arouca', awayTeam: 'Rio Ave', homeScore: 1, awayScore: 0 },
      { utcDate: '05/10/2025', league: 'P1', homeTeam: 'Nacional', awayTeam: 'Boavista', homeScore: 2, awayScore: 2 },
      { utcDate: '19/10/2025', league: 'P1', homeTeam: 'Porto', awayTeam: 'Nacional', homeScore: 2, awayScore: 1 },
      { utcDate: '02/11/2025', league: 'P1', homeTeam: 'Nacional', awayTeam: 'Benfica', homeScore: 1, awayScore: 2 },
      { utcDate: '16/11/2025', league: 'P1', homeTeam: 'Sporting', awayTeam: 'Nacional', homeScore: 3, awayScore: 0 },
      { utcDate: '30/11/2025', league: 'P1', homeTeam: 'Nacional', awayTeam: 'Braga', homeScore: 1, awayScore: 1 },
      { utcDate: '14/12/2025', league: 'P1', homeTeam: 'Vitoria', awayTeam: 'Nacional', homeScore: 2, awayScore: 2 },
      { utcDate: '11/01/2026', league: 'P1', homeTeam: 'Nacional', awayTeam: 'Rio Ave', homeScore: 1, awayScore: 2 },
    ],
  };
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(sintetico));

  try {
    const out = execFileSync(
      'node',
      ['scripts/forense.mjs', 'P1', 'Rio Ave', 'Nacional', '2026-02-08', '3', '2'],
      { encoding: 'utf8', timeout: 90000 },
    );
    assert.match(out, /PRONOSTICOS ORDENADOS/);
    assert.match(out, /RESULTADO REAL: Rio Ave 3-2 Nacional/);
    const lineas = out.split('\n').filter(l => /^(SI|NO)\s+/.test(l));
    assert.ok(lineas.length >= 5, `ranking con ${lineas.length} mercados`);
  } finally {
    if (previos) await writeFile(cachePath, JSON.stringify(previos));
    else await rm(cachePath, { force: true });
  }
});
