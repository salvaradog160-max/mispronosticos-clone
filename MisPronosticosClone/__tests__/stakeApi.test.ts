import { ESPERADO, MUESTRA } from '../__fixtures__/stakeApiMuestra';
import { BASE, PAISES, UA, _reiniciar, buscarStake } from '../src/stake/api';
import { leerMensaje } from '../src/flashscore/puente';

const VACIO = { schedule: [] };

/** Servidor de mentira: solo conoce el calendario de Alemania y el detalle de ese partido. */
const montar = (opciones: { status?: number } = {}) => {
  const pedidos: Array<{ url: string; cabeceras: Record<string, string> }> = [];
  let t = 1_000_000;
  const deps = {
    ahora: () => t,
    fetcher: async (url: string, init: { headers: Record<string, string> }) => {
      pedidos.push({ url, cabeceras: init.headers });
      if (opciones.status) return { ok: false, status: opciones.status, text: async () => '' };
      const ruta = url.replace(BASE, '');
      let cuerpo: unknown;
      if (ruta === '/schedule/sport/soccer') cuerpo = VACIO;
      else if (ruta.startsWith('/schedule/sport/soccer/germany/')) cuerpo = MUESTRA.calendario;
      else if (ruta.startsWith('/schedule/sport/soccer/')) cuerpo = VACIO;
      else if (ruta === `/fixtures/${MUESTRA.slug}`) cuerpo = MUESTRA.detalle;
      else return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) };
    },
  };
  return { deps, pedidos };
};

beforeEach(() => _reiniciar());

test('misma salida que la version Python (stake_api.py) con equipos en el mismo orden y al reves', async () => {
  const { deps } = montar();
  expect(await buscarStake('Hoffenheim', 'Bayer Leverkusen', deps)).toEqual(ESPERADO.normal);
  _reiniciar();
  expect(await buscarStake('Bayer Leverkusen', 'Hoffenheim', deps)).toEqual(ESPERADO.invertido);
});

test('en espanol y con nombres a medias tambien encuentra el partido', async () => {
  const { deps } = montar();
  const r = await buscarStake('HOFFENHEIM', 'BAYER LEVERKUSEN', deps);
  expect(r.encontrado).toBe(true);
  expect(r.x2).toEqual(ESPERADO.normal.x2);
});

test('partido ausente: mensaje claro, igual que Python', async () => {
  const { deps } = montar();
  const r = await buscarStake('Equipo Fantasma', 'Otro Ficticio', deps);
  expect(r.encontrado).toBe(false);
  expect(r.error).toBe(ESPERADO.ausente.error);
});

test('no manda ninguna clave: solo Accept y un User-Agent de navegador (Cloudflare da 403 sin el)', async () => {
  const { deps, pedidos } = montar();
  await buscarStake('Hoffenheim', 'Bayer Leverkusen', deps);
  expect(pedidos.length).toBeGreaterThan(2);
  for (const p of pedidos) {
    expect(p.url.startsWith(BASE)).toBe(true);
    expect(Object.keys(p.cabeceras).sort()).toEqual(['Accept', 'User-Agent']);
    expect(p.cabeceras['User-Agent']).toBe(UA);
  }
});

test('para en cuanto hay un casi exacto (no recorre los 39 paises) y la cache evita repetir peticiones', async () => {
  const { deps, pedidos } = montar();
  await buscarStake('Hoffenheim', 'Bayer Leverkusen', deps);
  expect(pedidos.length).toBeLessThan(PAISES.length);
  const antes = pedidos.length;
  await buscarStake('Hoffenheim', 'Bayer Leverkusen', deps);
  expect(pedidos.length).toBe(antes);            // todo sale de cache
});

test('clave rechazada (401/403) y limite (429): mensaje claro y se detiene', async () => {
  for (const status of [401, 403]) {
    _reiniciar();
    const { deps, pedidos } = montar({ status });
    const r = await buscarStake('Hoffenheim', 'Bayer Leverkusen', deps);
    expect(r.encontrado).toBe(false);
    expect(r.error).toMatch(/rechaz/i);
    expect(r.error).toMatch(/exija una clave/);
    expect(pedidos.length).toBe(1);               // no insiste con los demas paises
  }
  _reiniciar();
  const { deps } = montar({ status: 429 });
  expect((await buscarStake('a', 'b', deps)).error).toMatch(/429/);
});

test('403 de Cloudflare (HTML) se distingue de una clave rechazada (JSON)', async () => {
  const deps = {
    ahora: () => 1,
    fetcher: async () => ({ ok: false, status: 403, text: async () => '<html><title>Just a moment...</title> cloudflare' }),
  };
  const r = await buscarStake('a', 'b', deps);
  expect(r.error).toMatch(/Cloudflare/);
  expect(r.error).not.toMatch(/exija una clave/);
});

test('leerMensaje: pedido de la API de Stake', () => {
  expect(leerMensaje(JSON.stringify({ tipo: 'stakeapi', id: 7, l: 'A', v: 'B' }))).toEqual({ tipo: 'stakeapi', id: 7, l: 'A', v: 'B' });
  expect(leerMensaje(JSON.stringify({ tipo: 'stakeapi', id: 'x', l: 'A', v: 'B' }))).toBeNull();
  expect(leerMensaje(JSON.stringify({ tipo: 'stakeapi', id: 1, l: '', v: 'B' }))).toBeNull();
});
