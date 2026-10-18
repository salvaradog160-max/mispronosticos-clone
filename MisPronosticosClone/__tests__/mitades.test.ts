const { JSDOM } = require('jsdom');
import { ENLACES_JS, FICHA_JS } from '../src/mitades/extraer';
import { cargarMitades, type Lector } from '../src/mitades/cargar';
import { fichaValida, perfilEquipo, resumirFicha, type Ficha } from '../src/mitades/modelo';

// Fichas reales leidas de Flashscore el 18-oct-2026 (marcador acumulado tras cada gol).
const g = (m: number, t: 1 | 2, l: number, v: number, x = 0) => ({ m, x, t, l, v });
const LEV_FRI: Ficha = { mid: 'r7ZNv3no', fecha: '2026-10-18', local: 'Bayer Leverkusen', visita: 'Friburgo', gl: 2, gv: 1, goles: [g(14, 1, 0, 1), g(19, 1, 1, 1), g(76, 2, 2, 1)] };
const CIN_NE: Ficha = { mid: '0f3Szx7e', fecha: '2026-10-14', local: 'Cincinnati', visita: 'New England', gl: 2, gv: 3, goles: [g(13, 1, 1, 0), g(21, 1, 1, 1), g(43, 1, 1, 2), g(51, 2, 1, 3), g(67, 2, 2, 3)] };
const ATL_CIN: Ficha = { mid: 'CheNVkPb', fecha: '2026-10-10', local: 'Atlanta Utd', visita: 'Cincinnati', gl: 1, gv: 3, goles: [g(52, 2, 0, 1), g(69, 2, 1, 1), g(84, 2, 1, 2), g(90, 2, 1, 3, 7)] };

describe('resumen por mitades', () => {
  test('Leverkusen 2-1 Friburgo: 1T 1-1 (empate al descanso), gol de la victoria al 76', () => {
    expect(resumirFicha(LEV_FRI, 'l')).toEqual({ gf1: 1, gc1: 1, gf2: 1, gc2: 0, tardios: 1, empateDescanso: true });
    expect(resumirFicha(LEV_FRI, 'v')).toEqual({ gf1: 1, gc1: 1, gf2: 0, gc2: 1, tardios: 1, empateDescanso: true });
  });

  test('Atlanta 1-3 Cincinnati: nada en el 1T, 4 goles en el 2T, 2 tardios (84 y 90+7)', () => {
    const r = resumirFicha(ATL_CIN, 'v');
    expect(r).toEqual({ gf1: 0, gc1: 0, gf2: 3, gc2: 1, tardios: 2, empateDescanso: true });
  });

  test('un gol visitante se distingue por el marcador acumulado, no por un selector', () => {
    expect(resumirFicha(CIN_NE, 'l')).toMatchObject({ gf1: 1, gc1: 2, gf2: 1, gc2: 1 });
  });

  test('fichaValida exige que el ultimo marcador sea el final y que cada gol sume uno', () => {
    expect(fichaValida(LEV_FRI)).toBe(true);
    expect(fichaValida({ ...LEV_FRI, gl: 3 })).toBe(false);
    expect(fichaValida({ ...LEV_FRI, goles: [g(14, 1, 0, 2), g(19, 1, 1, 2), g(76, 2, 2, 2)] })).toBe(false);
    expect(fichaValida({ ...LEV_FRI, gl: 0, gv: 0, goles: [] })).toBe(true);
  });

  test('perfil: promedios por partido, parte del 2T y n visible', () => {
    const p = perfilEquipo('Cincinnati', [
      { ficha: CIN_NE, lado: 'l' },
      { ficha: ATL_CIN, lado: 'v' },
    ]);
    expect(p.n).toBe(2);
    expect(p.total1).toBeCloseTo(1.5); // 3 goles en el 1T de CIN-NE, 0 en ATL-CIN
    expect(p.total2).toBeCloseTo(3); // 2 + 4
    expect(p.pct2).toBeCloseTo(6 / 9);
    expect(p.empatesDescanso).toBe(1);
  });

  test('perfil sin partidos no revienta', () => {
    expect(perfilEquipo('X', [])).toMatchObject({ n: 0, total1: 0, total2: 0, pct2: 0 });
  });
});

describe('cargarMitades', () => {
  const fila = (f: Ficha, res = 'G') => ({
    href: `https://www.flashscore.com.mx/partido/futbol/a/b/?mid=${f.mid}`,
    mid: f.mid,
    fecha: '',
    comp: 'MLS',
    local: f.local,
    visita: f.visita,
    res,
  });
  const lectorDe = (fichas: Ficha[], fallar: string[] = []) => {
    const pedidos: string[] = [];
    const lector: Lector = {
      enlaces: async () => ({
        ok: true,
        datos: {
          local: 'Cincinnati',
          visita: 'Atlanta Utd',
          equipos: [
            { nombre: 'Cincinnati', filas: [fila(CIN_NE, 'P')] },
            { nombre: 'Atlanta Utd', filas: [fila(ATL_CIN, 'P'), { ...fila(LEV_FRI), res: '' }] },
          ],
        },
      }),
      ficha: async url => {
        pedidos.push(url);
        const f = fichas.find(x => url.includes(x.mid));
        return f && !fallar.some(m => url.includes(m)) ? { ok: true, datos: f } : { ok: false, error: 'no' };
      },
    };
    return { lector, pedidos };
  };
  const dormir = jest.fn(async () => undefined);

  test('lee cada ficha una sola vez, con pausa, y solo partidos terminados', async () => {
    const { lector, pedidos } = lectorDe([CIN_NE, ATL_CIN, LEV_FRI]);
    const cache = new Map<string, Ficha>();
    const r = await cargarMitades({ urlH2h: 'u', lector, cache, dormir });
    if ('error' in r && !('local' in r)) throw new Error(r.error);
    const ok = r as Exclude<typeof r, { error: string }>;
    expect(pedidos).toHaveLength(2); // la fila sin resultado (no terminada) se ignora
    expect(dormir).toHaveBeenCalledTimes(2);
    expect(ok.local.n).toBe(1);
    expect(ok.visita.n).toBe(1);
    expect(ok.visita.total2).toBe(4); // Atlanta: 4 goles en el 2T
    expect(cache.size).toBe(2);
  });

  test('con cache no se pide nada a la red y no hay pausa', async () => {
    const { lector, pedidos } = lectorDe([CIN_NE, ATL_CIN]);
    const cache = new Map<string, Ficha>([[CIN_NE.mid, CIN_NE], [ATL_CIN.mid, ATL_CIN]]);
    dormir.mockClear();
    await cargarMitades({ urlH2h: 'u', lector, cache, dormir });
    expect(pedidos).toHaveLength(0);
    expect(dormir).not.toHaveBeenCalled();
  });

  test('una ficha incoherente se omite y se cuenta', async () => {
    const mala = { ...ATL_CIN, gl: 5 };
    const { lector } = lectorDe([CIN_NE, mala]);
    const r: any = await cargarMitades({ urlH2h: 'u', lector, cache: new Map(), dormir });
    expect(r.omitidos).toBe(1);
    expect(r.visita.n).toBe(0);
    expect(r.local.n).toBe(1);
  });

  test('si fallan 3 seguidas se detiene y avisa (no insiste con Flashscore)', async () => {
    const mk = (mid: string) => ({ ...CIN_NE, mid });
    const fs = ['a1', 'a2', 'a3', 'a4'].map(mk);
    const lector: Lector = {
      enlaces: async () => ({ ok: true, datos: { local: 'A', visita: 'B', equipos: [{ nombre: 'A', filas: fs.map(f => fila(f)) }, { nombre: 'B', filas: [] }] } }),
      ficha: async () => ({ ok: false, error: 'x' }),
    };
    const pedir = jest.spyOn(lector, 'ficha');
    const r: any = await cargarMitades({ urlH2h: 'u', lector, cache: new Map(), dormir, maxFallosSeguidos: 3 });
    expect(pedir).toHaveBeenCalledTimes(3);
    expect(r.parcial).toBe(true);
    expect(r.error).toMatch(/dej/);
  });

  test('un partido con prorroga se salta y NO cuenta para detenerse; el motivo queda a la vista', async () => {
    const fs = ['b1', 'b2', 'b3', 'b4'].map(mid => ({ ...CIN_NE, mid }));
    const lector: Lector = {
      enlaces: async () => ({ ok: true, datos: { local: 'Cincinnati', visita: 'B', equipos: [{ nombre: 'Cincinnati', filas: fs.map(f => fila(f)) }, { nombre: 'B', filas: [] }] } }),
      ficha: async url => (/b[123]/.test(url) ? { ok: false, error: 'El partido tuvo prórroga o penales.', omitir: true } : { ok: true, datos: fs[3] }),
    };
    const r: any = await cargarMitades({ urlH2h: 'u', lector, cache: new Map(), dormir, maxFallosSeguidos: 3 });
    expect(r.parcial).toBe(false);
    expect(r.omitidos).toBe(3);
    expect(r.motivos[0]).toMatch(/prórroga/);
    expect(r.local.n).toBe(1);
  });

  test('si no hay enlaces devuelve el error del lector', async () => {
    const lector: Lector = { enlaces: async () => ({ ok: false, error: 'sin h2h' }), ficha: async () => ({ ok: false, error: '' }) };
    expect(await cargarMitades({ urlH2h: 'u', lector, cache: new Map(), dormir })).toEqual({ error: 'sin h2h' });
  });

  test('no sigue enlaces que no sean de Flashscore', async () => {
    const { lector, pedidos } = lectorDe([CIN_NE]);
    const base = await lector.enlaces('u');
    if (!base.ok) throw new Error('x');
    base.datos.equipos[0].filas[0].href = 'https://malo.example/?mid=0f3Szx7e';
    const l2: Lector = { ...lector, enlaces: async () => base };
    await cargarMitades({ urlH2h: 'u', lector: l2, cache: new Map(), dormir });
    expect(pedidos).toHaveLength(1); // solo la de Atlanta
  });
});

// ---- scripts de extraccion contra paginas con la estructura real observada ----
const conInnerText = (dom: any) => {
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    get() {
      const out: string[] = [];
      const rec = (n: any) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) {
            const t = c.textContent.trim();
            if (t) out.push(t);
          } else rec(c);
        }
      };
      rec(this);
      return out.join('\n');
    },
  });
};
const correr = (html: string, js: string, url: string) =>
  new Promise<any>(resolve => {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url, pretendToBeVisual: true });
    conInnerText(dom);
    dom.window.ReactNativeWebView = { postMessage: (s: string) => resolve(JSON.parse(s)) };
    dom.window.eval(js);
  });

const inc = (min: string, icono: string, lineas: string[]) =>
  `<div class="smv__incident"><div class="smv__timeBox">${min}</div><svg data-testid="${icono}"></svg>${lineas.slice(1).map(l => `<span>${l}</span>`).join('')}</div>`;
const FICHA_HTML = `<html><head><title>LEV 2-1 FRE | Bayer Leverkusen vs Friburgo 18/10/2026 | Fútbol - Flashscore | Partido</title></head><body>
<div>FINALIZADO</div>
<div class="smv__incidentsHeader"><span>1ER TIEMPO</span><span>1 - 1</span></div>
${inc("14'", 'wcl-icon-incidents-goal-soccer', ["14'", '0 - 1', 'Scherhant D.', '(Treu P.)'])}
${inc("19'", 'wcl-icon-incidents-goal-soccer', ["19'", '1 - 1', 'Maza I.', '(Schick P.)'])}
${inc("39'", 'card-ico yellowCard-ico', ["39'", 'Treu P.'])}
<div class="smv__incidentsHeader"><span>2DO TIEMPO</span><span>1 - 0</span></div>
${inc("59'", 'wcl-icon-incidents-substitution', ["59'", 'Tella N.', 'Moreira A.'])}
${inc("76'", 'wcl-icon-incidents-goal-soccer', ["76'", '2 - 1', 'Schick P.', '(Maza I.)'])}
</body></html>`;

describe('FICHA_JS', () => {
  test('lee solo los goles, con mitad y marcador acumulado', async () => {
    const m = await correr(FICHA_HTML, FICHA_JS, 'https://www.flashscore.com.mx/partido/futbol/a/b/?mid=r7ZNv3no');
    expect(m).toMatchObject({ tipo: 'mitades-ficha', ok: true });
    expect(m.ficha).toEqual({ mid: 'r7ZNv3no', fecha: '2026-10-18', local: 'Bayer Leverkusen', visita: 'Friburgo', gl: 2, gv: 1, goles: [g(14, 1, 0, 1), g(19, 1, 1, 1), g(76, 2, 2, 1)] });
    expect(fichaValida(m.ficha)).toBe(true);
  });

  test('un 0-0 terminado sin incidentes de gol es valido', async () => {
    const html = '<html><head><title>A 0-0 B | Alfa vs Beta 01/10/2026 | x</title></head><body><div>FINALIZADO</div><div class="smv__incident"><svg data-testid="card"></svg></div></body></html>';
    const m = await correr(html, FICHA_JS, 'https://www.flashscore.com.mx/partido/futbol/a/b/?mid=zz');
    expect(m.ok).toBe(true);
    expect(m.ficha.goles).toEqual([]);
  });

  test('con prorroga se marca como no usable y como omitible (no es un fallo de Flashscore)', async () => {
    const html = FICHA_HTML.replace('<div>FINALIZADO</div>', '<div>FINALIZADO</div><div>PRÓRROGA</div>');
    const m = await correr(html, FICHA_JS, 'https://www.flashscore.com.mx/partido/futbol/a/b/?mid=zz');
    expect(m).toMatchObject({ ok: false, omitir: true });
  });

  test('un penal o autogol (icono distinto) tambien cuenta; tarjetas y cambios no', async () => {
    const html = `<html><head><title>CIN 3-3 CAM | Cincinnati vs Charlotte 12/09/2026 | x</title></head><body><div>FINALIZADO</div>
      <div class="smv__incident"><div class="smv__timeBox">2'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>1 - 0</span></div>
      <div class="smv__incident"><div class="smv__timeBox">17'</div><svg data-testid="wcl-icon-incidents-penalty-soccer"></svg><span>1 - 1</span><span>Biel P.</span><span>(Penalti)</span></div>
      <div class="smv__incident"><div class="smv__timeBox">30'</div><svg data-testid="card-ico yellowCard-ico"></svg><span>Pérez J.</span></div>
      <div class="smv__incident"><div class="smv__timeBox">60'</div><svg data-testid="wcl-icon-incidents-substitution"></svg><span>Uno A.</span><span>Dos B.</span></div>
      <div class="smv__incident"><div class="smv__timeBox">70'</div><svg data-testid="wcl-icon-incidents-own-goal"></svg><span>2 - 1</span><span>(Autogol)</span></div>
      <div class="smv__incident"><div class="smv__timeBox">80'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>2 - 2</span></div>
      <div class="smv__incident"><div class="smv__timeBox">88'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>3 - 2</span></div>
      <div class="smv__incident"><div class="smv__timeBox">90+1'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>3 - 3</span></div></body></html>`;
    const m = await correr(html, FICHA_JS, 'https://www.flashscore.com.mx/partido/futbol/a/b/?mid=zz');
    expect(m.ficha.goles.map((x: any) => x.m)).toEqual([2, 17, 70, 80, 88, 90]);
    expect(fichaValida(m.ficha)).toBe(true);
  });

  test('si la lista de incidentes se dibuja por partes, espera y lee de nuevo hasta que los goles cuadren', async () => {
    const parcial = `<html><head><title>CFM 0-2 COL | CF Montreal vs Columbus Crew 19/09/2026 | x</title></head><body><div>FINALIZADO</div>
      <div id="l"><div class="smv__incident"><div class="smv__timeBox">57'</div><span>0 - 1</span><span>Farsi M.</span></div></div></body></html>`;
    const m = await new Promise<any>(resolve => {
      const dom = new JSDOM(parcial, { runScripts: 'outside-only', url: 'https://www.flashscore.com.mx/partido/futbol/a/b/?mid=zz', pretendToBeVisual: true });
      conInnerText(dom);
      dom.window.ReactNativeWebView = { postMessage: (s: string) => resolve(JSON.parse(s)) };
      dom.window.eval(FICHA_JS);
      setTimeout(() => {
        const d = dom.window.document.createElement('div');
        d.className = 'smv__incident';
        d.innerHTML = `<div class="smv__timeBox">68'</div><span>0 - 2</span><span>Méndez B.</span>`;
        dom.window.document.getElementById('l').appendChild(d);
      }, 300);
    });
    expect(m.ok).toBe(true);
    expect(m.ficha.goles.map((x: any) => x.m)).toEqual([57, 68]);
  });

  test('version movil, sin encabezados de tiempo: la mitad sale del minuto (45+2 es 1T, 46 es 2T, 90+7 es 2T)', async () => {
    const html = `<html><head><title>ATL 1-3 CIN | Atlanta Utd vs Cincinnati 10/10/2026 | x</title></head><body><div>FINALIZADO</div>
      <div class="smv__verticalSections"><div class="smv__incident"><div class="smv__timeBox">44'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>0 - 1</span></div>
      <div class="smv__incident"><div class="smv__timeBox">45+2'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>0 - 2</span></div>
      <div class="smv__incident"><div class="smv__timeBox">51'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>1 - 2</span></div>
      <div class="smv__incident"><div class="smv__timeBox">90+7'</div><svg data-testid="wcl-icon-incidents-goal-soccer"></svg><span>1 - 3</span></div></div></body></html>`;
    const m = await correr(html, FICHA_JS, 'https://www.flashscore.com.mx/partido/futbol/a/b/?mid=zz');
    expect(m.ok).toBe(true);
    expect(m.ficha.goles.map((x: any) => [x.m, x.x, x.t])).toEqual([[44, 0, 1], [45, 2, 1], [51, 0, 2], [90, 7, 2]]);
    expect(fichaValida(m.ficha)).toBe(true);
  });
});

const fila2 = (fecha: string, comp: string, l: string, v: string, a: number, b: number, res: string, mid: string, extra = '') =>
  `<a class="h2h__row" href="https://www.flashscore.com.mx/partido/futbol/x/y/?mid=${mid}"><span>${fecha}</span>${extra}<span>${comp}</span><span>${l}</span><span>${v}</span><span>${a}</span><span>${b}</span><span>${res}</span></a>`;
const H2H_HTML = `<html><head><title>CIN 0-1 COL | Cincinnati vs Columbus Crew 18/10/2026 | Fútbol - Flashscore | H2H</title></head><body>
<div class="h2h__section">${fila2('14.10.26', 'MLS', 'Cincinnati', 'New England Revolution', 2, 3, 'P', 'm1')}${fila2('11.08.26', 'LC', 'Cincinnati', 'Atlas', 1, 2, 'P', 'm2', '<span>Tras pen.</span>')}</div>
<div class="h2h__section">${fila2('14.10.26', 'MLS', 'Columbus Crew', 'Charlotte', 3, 1, 'G', 'm3')}</div>
<div class="h2h__section">${fila2('25.07.26', 'MLS', 'Columbus Crew', 'Cincinnati', 2, 1, '', 'm4')}</div>
</body></html>`;

describe('ENLACES_JS', () => {
  test('toma las dos primeras secciones (ultimos de cada equipo) y no el H2H', async () => {
    const m = await correr(H2H_HTML, ENLACES_JS, 'https://www.flashscore.com.mx/partido/futbol/a/b/h2h/general/?mid=jZWQCjyA');
    expect(m.ok).toBe(true);
    expect(m.local).toBe('Cincinnati');
    expect(m.visita).toBe('Columbus Crew');
    expect(m.equipos.map((e: any) => e.filas.map((f: any) => f.mid))).toEqual([['m1', 'm2'], ['m3']]);
    expect(m.equipos[0].filas[0]).toMatchObject({ fecha: '14.10.26', comp: 'MLS', local: 'Cincinnati', visita: 'New England Revolution', res: 'P' });
  });

  test('la linea "Tras pen." no desplaza los nombres de los equipos', async () => {
    const m = await correr(H2H_HTML, ENLACES_JS, 'https://www.flashscore.com.mx/partido/futbol/a/b/h2h/general/?mid=jZWQCjyA');
    expect(m.equipos[0].filas[1]).toMatchObject({ comp: 'LC', local: 'Cincinnati', visita: 'Atlas' });
  });
});

import { leerMensaje, urlH2h } from '../src/flashscore/puente';

describe('puente de mitades', () => {
  test('urlH2h arma la pagina H2H desde la ficha, el resumen o el propio H2H', () => {
    const esperado = 'https://www.flashscore.com.mx/partido/futbol/columbus-crew-pQ8rarA7/fc-cincinnati-8btog05R/h2h/general/?mid=jZWQCjyA';
    expect(urlH2h('https://www.flashscore.com.mx/partido/futbol/columbus-crew-pQ8rarA7/fc-cincinnati-8btog05R/?mid=jZWQCjyA')).toBe(esperado);
    expect(urlH2h('https://www.flashscore.com.mx/partido/futbol/columbus-crew-pQ8rarA7/fc-cincinnati-8btog05R/resumen/momios/?mid=jZWQCjyA')).toBe(esperado);
    expect(urlH2h(esperado)).toBe(esperado);
  });

  test('urlH2h no acepta la lista, otros sitios ni enlaces sin mid', () => {
    expect(urlH2h('https://www.flashscore.com.mx/')).toBeNull();
    expect(urlH2h('https://malo.example/partido/futbol/a/b/?mid=abc')).toBeNull();
    expect(urlH2h('https://www.flashscore.com.mx/partido/futbol/a/b/')).toBeNull();
    expect(urlH2h('https://www.flashscore.com.mx.malo.example/partido/futbol/a/b/?mid=abc')).toBeNull();
  });

  test('mitades-pedir lleva la direccion H2H o null', () => {
    expect(leerMensaje(JSON.stringify({ tipo: 'mitades-pedir', url: 'https://www.flashscore.com.mx/partido/futbol/a/b/?mid=x1' }))).toEqual({
      tipo: 'mitades-pedir',
      urlH2h: 'https://www.flashscore.com.mx/partido/futbol/a/b/h2h/general/?mid=x1',
    });
    expect(leerMensaje(JSON.stringify({ tipo: 'mitades-pedir', url: 'https://www.flashscore.com.mx/' }))).toEqual({ tipo: 'mitades-pedir', urlH2h: null });
  });

  test('mitades-cache descarta fichas inventadas o incoherentes y acepta las buenas', () => {
    const m: any = leerMensaje(JSON.stringify({ tipo: 'mitades-cache', fichas: { a: LEV_FRI, b: { ...LEV_FRI, mid: 'b', gl: 9 }, c: 'x', d: { mid: 'd' } } }));
    expect(m.tipo).toBe('mitades-cache');
    expect(m.fichas.map((f: Ficha) => f.mid)).toEqual(['r7ZNv3no']);
  });
});
