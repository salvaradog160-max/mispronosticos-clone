// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');
type JSDOM = any;
import { ORDEN_JS } from '../src/flashscore/orden';

const fila = (clases: string, equipos: string, extra = '') => `<div class="event__match ${clases}">${equipos}${extra}</div>`;
const cab = (liga: string, pais: string) =>
  `<div class="headerLeague__wrapper"><span class="headerLeague__flag" title="${pais}"></span><a class="headerLeague__title"><span class="headerLeague__title-text">${liga}</span></a></div>`;
const PAGINA = `<html><head></head><body><div class="sportName soccer">
${cab('Bundesliga', 'Alemania')}
${fila('scheduled', 'Hoffenheim', '<div class="event__time">13:00Preview</div>')}
${fila('scheduled', 'Leverkusen', '<div class="event__time">09:30Preview</div>')}
${fila('finished', 'Bayern', '')}
${cab('LaLiga', 'España')}
${fila('live', 'Celta', '<div class="event__stage">34</div>')}
${fila('scheduled', 'Sevilla', '<div class="event__time">09:30Preview</div>')}
${fila('scheduled', 'Real Madrid', '<div class="event__time">14:15Preview</div>')}
</div></body></html>`;

const montar = () => {
  const dom = new JSDOM(PAGINA, { runScripts: 'outside-only', url: 'https://www.flashscore.com.mx/' });
  dom.window.eval(ORDEN_JS);
  return dom;
};
const visibles = (dom: JSDOM) =>
  [...(dom.window.document.querySelectorAll('.sportName.soccer > *') as any)]
    .filter((e: any) => !e.classList.contains('headerLeague__wrapper'))
    .sort((a: any, b: any) => Number(a.style.order || 0) - Number(b.style.order || 0))
    .map((e: any) => (e.classList.contains('pg-hora') ? `#${(e.textContent || '').trim().split(' ')[0]}` : (e.textContent || '').replace(/\d{2}:\d{2}Preview|\d+$/g, '').trim()));

test('por hora: en vivo primero, luego por empezar de temprano a tarde, y al final los terminados', () => {
  const dom = montar();
  const orden = visibles(dom);
  expect(orden).toEqual(['#EN', 'Celta', '#09:00', 'Leverkusen', 'Sevilla', '#13:00', 'Hoffenheim', '#14:00', 'Real Madrid', '#TERMINADOS', 'Bayern']);
});

test('misma hora: se respeta el orden original de la pagina (Leverkusen antes que Sevilla)', () => {
  const o = visibles(montar());
  expect(o.indexOf('Leverkusen')).toBeLessThan(o.indexOf('Sevilla'));
});

test('cada partido lleva su liga en data-pgliga y los encabezados de liga se ocultan por CSS', () => {
  const dom = montar();
  const doc = dom.window.document;
  const liga = (n: string) => [...(doc.querySelectorAll('.event__match') as any)].find((e: any) => e.textContent?.includes(n))?.getAttribute('data-pgliga');
  expect(liga('Hoffenheim')).toBe('Alemania · Bundesliga');
  expect(liga('Real Madrid')).toBe('España · LaLiga');
  expect(doc.querySelector('.sportName')?.classList.contains('pg-on')).toBe(true);
  expect(doc.getElementById('pg-orden-css')?.textContent).toContain('.headerLeague__wrapper{display:none');
  expect(doc.getElementById('pg-orden-css')?.textContent).toContain('padding-top:16px');
});

test('volver a «por liga» restaura la lista tal cual', () => {
  const dom = montar();
  const w = dom.window as unknown as { __pgOrdenar: (m: string) => string };
  expect(w.__pgOrdenar('liga')).toBe('liga');
  const doc = dom.window.document;
  expect(doc.querySelector('.sportName')?.classList.contains('pg-on')).toBe(false);
  expect(doc.querySelectorAll('.pg-hora').length).toBe(0);
  expect([...(doc.querySelectorAll('.event__match') as any)].every((e: any) => !e.style.order && !e.hasAttribute('data-pgliga'))).toBe(true);
});

test('inyectarlo dos veces no duplica separadores ni observadores', () => {
  const dom = montar();
  dom.window.eval(ORDEN_JS);
  expect(dom.window.document.querySelectorAll('.pg-hora').length).toBe(5);   // EN VIVO, 09:00, 13:00, 14:00, TERMINADOS
});

test('si Flashscore redibuja la lista, el orden se reaplica solo', async () => {
  const dom = montar();
  const host = dom.window.document.querySelector('.sportName') as any;
  host.insertAdjacentHTML('beforeend', fila('scheduled', 'Nuevo', '<div class="event__time">08:00Preview</div>'));
  await new Promise<void>(r => setTimeout(() => r(), 400));
  expect(visibles(dom)[2]).toBe('#08:00');
  expect(visibles(dom)[3]).toBe('Nuevo');
});
