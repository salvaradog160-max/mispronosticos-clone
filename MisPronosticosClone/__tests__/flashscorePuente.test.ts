import { jsRecibir, leerMensaje, urlPermitida } from '../src/flashscore/puente';
import { PARTIDO_JS, VIVO_JS } from '../src/flashscore/scripts';

test('leerMensaje acepta partido y vivo, y rechaza lo demas', () => {
  expect(leerMensaje(JSON.stringify({ tipo: 'partido', texto: 'abc' }))).toEqual({ tipo: 'partido', texto: 'abc' });
  expect(leerMensaje(JSON.stringify({ tipo: 'vivo', texto: 'x' }))?.tipo).toBe('vivo');
  expect(leerMensaje(JSON.stringify({ tipo: 'otro', texto: 'abc' }))).toBeNull();
  expect(leerMensaje(JSON.stringify({ tipo: 'partido', texto: '   ' }))).toBeNull();
  expect(leerMensaje(JSON.stringify({ tipo: 'partido', texto: 'x'.repeat(2_000_001) }))).toBeNull();
  expect(leerMensaje('no es json')).toBeNull();
});

test('jsRecibir escapa comillas, saltos y separadores unicode: el texto nunca se ejecuta', () => {
  const texto = 'a"b\'c\n`${alert(1)}`  </script>';
  const js = jsRecibir({ tipo: 'partido', texto });
  expect(() => new Function(js)).not.toThrow();
  let recibido: unknown[] = [];
  new Function('window', js)({ __pgRecibir: (...a: unknown[]) => { recibido = a; } });
  expect(recibido).toEqual(['partido', texto]);
});

test('urlPermitida: solo flashscore, https', () => {
  expect(urlPermitida('https://www.flashscore.com.mx/partido/futbol/x/')).toBe(true);
  expect(urlPermitida('https://flashscore.com/')).toBe(true);
  expect(urlPermitida('about:blank')).toBe(true);
  expect(urlPermitida('https://evil.com/?u=https://www.flashscore.com.mx/')).toBe(false);
  expect(urlPermitida('https://flashscore.com.evil.com/')).toBe(false);
  expect(urlPermitida('http://www.flashscore.com.mx/')).toBe(false);
});

test('los scripts generados son JS valido, entregan por postMessage y no usan el portapapeles', () => {
  for (const js of [PARTIDO_JS, VIVO_JS]) {
    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain('ReactNativeWebView.postMessage');
    expect(js).not.toContain('navigator.clipboard');
  }
});
