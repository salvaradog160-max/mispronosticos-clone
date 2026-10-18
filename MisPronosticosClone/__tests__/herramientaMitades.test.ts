const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
declare const __dirname: string;

const HTML = fs.readFileSync(path.join(__dirname, '..', 'android/app/src/main/assets/herramienta/index.html'), 'utf8');

const perfil = (equipo: string, n: number, o: object = {}) => ({
  equipo, n, gf1: 0.6, gc1: 0.4, gf2: 1.2, gc2: 1.2, total1: 1.0, total2: 2.4, pct2: 0.7, tardios: 0.8, empatesDescanso: 2, ...o,
});

const abrir = (almacen: Record<string, string> = {}) => {
  const enviados: any[] = [];
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://localhost/', pretendToBeVisual: true,
    beforeParse(w: any) {
      w.ReactNativeWebView = { postMessage: (s: string) => enviados.push(JSON.parse(s)) };
      Object.entries(almacen).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.HTMLElement.prototype.scrollIntoView = () => {};
    } });
  return { dom, w: dom.window, enviados };
};

test('al abrir entrega a la app las fichas que ya guardo', () => {
  const f = { mid: 'm1', local: 'A', visita: 'B', gl: 0, gv: 0, goles: [] };
  const { enviados } = abrir({ pg_mitades_v2: JSON.stringify({ m1: f }) });
  expect(enviados).toContainEqual({ tipo: 'mitades-cache', fichas: { m1: f } });
});

test('muestra el perfil de cada mitad con su n y la tabla de probabilidades', () => {
  const { w } = abrir();
  w.__pgMitades({ local: perfil('Cincinnati', 5), visita: perfil('Columbus Crew', 4, { total1: 1.75, total2: 1.75 }), fichas: {}, omitidos: 0, parcial: false });
  const t = w.document.getElementById('mt-body').textContent;
  expect(t).toContain('Cincinnati');
  expect(t).toContain('n = 5 partidos');
  expect(t).toContain('n = 4 partidos');
  expect(t).toContain('muestra chica'); // n = 4 < 5
  expect(t).toContain('70% de sus goles caen en el 2T');
  expect(t).toContain('Llegó empatado al descanso en 2 de 5');
  expect(t).toMatch(/1er tiempo.*Más de 0\.5/s);
  expect(t).toContain('no se ha comprobado que bata al mercado');
});

test('la probabilidad Poisson sale bien: media 2.0 => P(mas de 1.5) = 59.4%', () => {
  const { w } = abrir();
  // l1 = l2 = 1.0 en las dos mitades => suma 2.0 en el partido
  w.__pgMitades({ local: perfil('A', 5, { total1: 1, total2: 1 }), visita: perfil('B', 5, { total1: 1, total2: 1 }), fichas: {}, omitidos: 0, parcial: false });
  const filas = [...w.document.querySelectorAll('.mtab tbody tr')].map((tr: any) => tr.textContent);
  expect(filas[2]).toContain('Partido');
  expect(filas[2]).toContain('59.4%'); // 1 - e^-2 (1 + 2)
  expect(filas[0]).toContain('63.2%'); // mitad con media 1: 1 - e^-1
});

test('guarda las fichas nuevas y recuerda el ultimo resultado al reabrir', () => {
  const a = abrir();
  const f = { mid: 'zz', local: 'A', visita: 'B', gl: 1, gv: 0, goles: [{ m: 5, x: 0, t: 1, l: 1, v: 0 }] };
  a.w.__pgMitades({ local: perfil('A', 1), visita: perfil('B', 1), fichas: { zz: f }, omitidos: 0, parcial: false });
  const guardado = { pg_mitades_v2: a.w.localStorage.getItem('pg_mitades_v2'), pg_mitades_ultimo: a.w.localStorage.getItem('pg_mitades_ultimo') };
  expect(JSON.parse(guardado.pg_mitades_v2 as string).zz.mid).toBe('zz');
  const b = abrir(guardado as any);
  expect(b.w.document.getElementById('mt-body').textContent).toContain('n = 1 partidos');
});

test('un error de la app se muestra en vez de dejar la seccion vacia', () => {
  const { w } = abrir();
  w.__pgMitades({ estado: 'error', texto: 'Flashscore no respondió.' });
  expect(w.document.getElementById('mt-body').textContent).toContain('Flashscore no respondió.');
});

test('sin partidos terminados lo dice', () => {
  const { w } = abrir();
  w.__pgMitades({ local: perfil('A', 0), visita: perfil('B', 0), fichas: {}, omitidos: 3, parcial: true });
  expect(w.document.getElementById('mt-body').textContent).toContain('No encontré partidos terminados');
});
