import { ESPERADO, MUESTRA } from '../__fixtures__/betmexicoMuestra';
import { BASE, GAP_MS, WEB, TTL_ARCHIVO_MS, _reiniciar, buscarBetmexico } from '../src/betmexico/api';
import { leerMensaje } from '../src/flashscore/puente';

const montar = (opciones: { status?: number } = {}) => {
  const pedidos: string[] = [];
  const dormidos: number[] = [];
  let t = 5_000_000;
  const deps = {
    ahora: () => t,
    dormir: async (ms: number) => { dormidos.push(ms); t += ms; },
    fetcher: async (url: string, init: { headers: Record<string, string> }) => {
      pedidos.push(url);
      expect(Object.keys(init.headers)).toEqual(['Accept']);                 // sin cookies, sin sesion, sin claves
      if (opciones.status) return { ok: false, status: opciones.status, text: async () => '' };
      const ruta = url.replace(BASE, '');
      if (ruta === '/0') return { ok: true, status: 200, text: async () => JSON.stringify(MUESTRA.indice) };
      if (ruta === MUESTRA.ruta) return { ok: true, status: 200, text: async () => JSON.stringify(MUESTRA.archivo) };
      return { ok: false, status: 404, text: async () => '' };
    },
  };
  return { deps, pedidos, dormidos, avanzar: (ms: number) => { t += ms; } };
};

beforeEach(() => _reiniciar());

test('misma salida que la version Python (betmexico.py), equipos en orden normal y al reves', async () => {
  const { deps } = montar();
  expect(await buscarBetmexico('Hoffenheim', 'Bayer Leverkusen', deps)).toEqual(ESPERADO.normal);
  expect(await buscarBetmexico('Bayer Leverkusen', 'Hoffenheim', deps)).toEqual(ESPERADO.invertido);
});

test('partido ausente: mensaje claro, igual que Python', async () => {
  const { deps } = montar();
  expect((await buscarBetmexico('Equipo Fantasma', 'Otro Ficticio', deps)).error).toBe(ESPERADO.ausente.error);
});

test('enlace directo: pais, liga, slug del partido e id del feed (el mismo que abre la pagina)', async () => {
  const { deps } = montar();
  const r = await buscarBetmexico('Hoffenheim', 'Bayer Leverkusen', deps);
  expect(r.url).toBe('https://betmexico.mx/deportes-elite/soccer/germany/bundesliga/tsg-hoffenheim-bayer-leverkusen-2721030337223331885');
  expect(r.url?.startsWith(WEB)).toBe(true);
});

test('sin pais o liga en el feed no inventa enlace (url null) pero si devuelve las cuotas', async () => {
  const { deps } = montar();
  const sinNombres = { ...MUESTRA.archivo, categories: {}, tournaments: {} };
  const d2 = { ...deps, fetcher: async (url: string, init: { headers: Record<string, string> }) => (url.endsWith(MUESTRA.ruta) ? { ok: true, status: 200, text: async () => JSON.stringify(sinNombres) } : deps.fetcher(url, init)) };
  const r = await buscarBetmexico('Hoffenheim', 'Bayer Leverkusen', d2);
  expect(r.encontrado).toBe(true);
  expect(r.url).toBeNull();
  expect(r.x2).toEqual({ h: 2.62, d: 3.9, a: 2.34 });
});

test('mapeo de mercados: 1X2, doble oportunidad, totales y handicap con valores reales', async () => {
  const { deps } = montar();
  const r = await buscarBetmexico('HOFFENHEIM', 'BAYER LEVERKUSEN', deps);
  expect(r.x2).toEqual({ h: 2.62, d: 3.9, a: 2.34 });
  expect(r.dc).toEqual({ hd: 1.54, da: 1.44, ha: 1.22 });
  expect(r.at?.['2.5']).toEqual({ o: 1.35, u: 3 });
  expect(r.ah?.['-0.25']).toEqual({ h: 2.28, a: 1.58 });
  expect(r.margen_x2).toBeGreaterThan(0);
  expect(r.btts).toBeNull();
  expect(r.inicio).toBe(1792938600000);
});

test('discrecion: indice + un archivo, 2 s entre peticiones y todo de cache en la segunda busqueda', async () => {
  const { deps, pedidos, dormidos, avanzar } = montar();
  await buscarBetmexico('Hoffenheim', 'Bayer Leverkusen', deps);
  expect(pedidos.length).toBe(2);
  expect(dormidos.every(ms => ms > 0 && ms <= GAP_MS)).toBe(true);
  await buscarBetmexico('Hoffenheim', 'Bayer Leverkusen', deps);
  expect(pedidos.length).toBe(2);                                   // indice (60 s) y archivo (5 min) en cache
  avanzar(TTL_ARCHIVO_MS + 1);
  await buscarBetmexico('Hoffenheim', 'Bayer Leverkusen', deps);
  expect(pedidos.length).toBe(4);                                   // cache vencida: vuelve a bajar
});

test('error de red o de formato: respuesta clara, no excepcion ni cuotas inventadas', async () => {
  const { deps } = montar({ status: 503 });
  const r = await buscarBetmexico('a', 'b', deps);
  expect(r.encontrado).toBe(false);
  expect(r.error).toMatch(/503/);
  expect(r.x2).toBeUndefined();
});

test('leerMensaje: pedido de Betmexico', () => {
  expect(leerMensaje(JSON.stringify({ tipo: 'betmexico', id: 4, l: 'A', v: 'B' }))).toEqual({ tipo: 'betmexico', id: 4, l: 'A', v: 'B' });
  expect(leerMensaje(JSON.stringify({ tipo: 'betmexico', id: 'x', l: 'A', v: 'B' }))).toBeNull();
});
