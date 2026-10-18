import { ARBWORLD_OU25 } from '../__fixtures__/arbworldOu25';
import { AFINIDAD_JS } from '../src/stake/buscar';
import { afinidad } from '../src/arbworld/nombres';
import { MERCADOS, GAP_MS, TTL_MS, _reiniciar, buscarArbworld, elegir, parsear } from '../src/arbworld/arbworld';
import { leerMensaje } from '../src/flashscore/puente';

const html = ARBWORLD_OU25;
const [, ETQ] = MERCADOS.ou25;

beforeEach(() => _reiniciar());

test('parsear: filas reales de Arbworld con apertura, actual, liga, hora y volumen', () => {
  const filas = parsear(html, ETQ);
  expect(filas.length).toBe(3);
  for (const f of filas) {
    expect(f.casa && f.fuera && f.liga && f.utc).toBeTruthy();
    expect(f.res.map(r => r.et)).toEqual(['under', 'over']);
    for (const r of f.res) {
      expect(r.apertura).toBeGreaterThan(1);
      expect(r.actual).toBeGreaterThan(1);
      expect(r.cambio_pct).toBeCloseTo(Math.round((r.actual / r.apertura - 1) * 1000) / 10, 5);
    }
  }
  expect(filas.some(f => f.casa === 'Leverkusen' && f.fuera === 'Freiburg')).toBe(true);
});

test('parsear: ignora filas con menos celdas de las esperadas', () => {
  expect(parsear(html, ['1', 'X', '2', '4'])).toEqual([]);
});

test('elegir: casa FRIBURGO/LEVERKUSEN en espanol, y con equipos al reves', () => {
  const filas = parsear(html, ETQ);
  const a = elegir(filas, 'BAYER LEVERKUSEN', 'FRIBURGO', 'ou25');
  expect(a.encontrado).toBe(true);
  expect(a.partido).toBe('Leverkusen - Freiburg');
  expect(a.invertido).toBe(false);
  const b = elegir(filas, 'FRIBURGO', 'BAYER LEVERKUSEN', 'ou25');
  expect(b.encontrado).toBe(true);
  expect(b.invertido).toBe(true);
  expect(b.res).toEqual(a.res);                 // en O/U no se voltea nada
  expect(elegir(filas, 'Equipo Fantasma', 'Otro Ficticio', 'ou25').encontrado).toBe(false);
});

test('elegir: en 1X2 con equipos al reves se voltean Local y Visita', () => {
  const fila = { casa: 'A', fuera: 'B', liga: 'L', utc: 'U', volumen: '1', res: [
    { et: '1', apertura: 2, actual: 1.8, cambio_pct: -10 },
    { et: 'X', apertura: 3, actual: 3, cambio_pct: 0 },
    { et: '2', apertura: 4, actual: 4.4, cambio_pct: 10 },
  ] };
  const r = elegir([fila], 'B', 'A', '1x2');
  expect(r.invertido).toBe(true);
  expect(r.res?.map(x => [x.et, x.actual])).toEqual([['1', 4.4], ['X', 3], ['2', 1.8]]);
});

test('bajar: cache de 5 min y 5 s entre peticiones; una sola descarga por mercado', async () => {
  let t = 1_000_000;
  const pedidos: string[] = [];
  const dormidos: number[] = [];
  const deps = {
    fetcher: async (url: string, init: { headers: Record<string, string> }) => {
      pedidos.push(url);
      expect(init.headers['User-Agent']).toMatch(/uso personal/);
      return { ok: true, status: 200, text: async () => html };
    },
    ahora: () => t,
    dormir: async (ms: number) => { dormidos.push(ms); t += ms; },
  };
  await buscarArbworld('Juventus', 'Lazio', 'ou25', deps);
  await buscarArbworld('BAYER LEVERKUSEN', 'FRIBURGO', 'ou25', deps);      // misma pagina: sale de cache
  expect(pedidos).toEqual(['https://arbworld.net/dropping-odds/football/over-under-2-5']);
  await buscarArbworld('Juventus', 'Lazio', '1x2', deps);                  // otra pagina: espera el hueco de 5 s
  expect(pedidos.length).toBe(2);
  expect(dormidos.length).toBe(1);
  expect(dormidos[0]).toBeGreaterThan(0);
  expect(dormidos[0]).toBeLessThanOrEqual(GAP_MS);
  t += TTL_MS + 1;
  await buscarArbworld('Juventus', 'Lazio', 'ou25', deps);                 // cache vencida: vuelve a bajar
  expect(pedidos.length).toBe(3);
});

test('buscarArbworld: nunca toca /api/, mercado desconocido y errores de red como respuesta, no excepcion', async () => {
  for (const [ruta] of Object.values(MERCADOS)) expect(ruta).not.toMatch(/api/i);
  expect((await buscarArbworld('a', 'b', 'zzz')).error).toMatch(/Mercado no soportado/);
  const falla = { fetcher: async () => ({ ok: false, status: 503, text: async () => '' }), ahora: () => 5, dormir: async () => undefined };
  const r = await buscarArbworld('a', 'b', 'ou25', falla);
  expect(r.encontrado).toBe(false);
  expect(r.error).toMatch(/503/);
});

test('afinidad TS y AFINIDAD_JS (la que se inyecta en Stake) dan lo mismo', () => {
  // eslint-disable-next-line no-new-func
  const js = new Function(`${AFINIDAD_JS}; return afinidad;`)() as (a: string, b: string) => number;
  const pares = [
    ['BAYER LEVERKUSEN', 'Bayer Leverkusen'], ['FRIBURGO', 'SC Friburgo'], ["Borussia M'gladbach", 'Borussia Monchengladbach'],
    ['Man City', 'Manchester City'], ['Manchester City', 'Manchester United'], ['Union Berlin', 'Hertha Berlin'],
    ['Real Madrid', 'Atlético Madrid'], ['Juventus', 'Lazio'], ['Atletico Madrid', 'Atletico de Madrid'],
  ];
  for (const [a, b] of pares) expect(afinidad(a, b)).toBeCloseTo(js(a, b), 10);
});

test('leerMensaje: pedido de Arbworld valido e invalido', () => {
  expect(leerMensaje(JSON.stringify({ tipo: 'arbworld', id: 3, l: 'A', v: 'B', m: 'ou25' }))).toEqual({ tipo: 'arbworld', id: 3, l: 'A', v: 'B', m: 'ou25' });
  expect(leerMensaje(JSON.stringify({ tipo: 'arbworld', id: 'x', l: 'A', v: 'B', m: 'ou25' }))).toBeNull();
  expect(leerMensaje(JSON.stringify({ tipo: 'arbworld', id: 1, l: '', v: 'B', m: 'ou25' }))).toBeNull();
});
