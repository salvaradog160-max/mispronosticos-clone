import { esLoginGoogle, explicarBloqueo, jsRecibir, leerMensaje, urlPermitida } from '../src/flashscore/puente';
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

test('leerMensaje: pedido de Stake valido e invalido', () => {
  expect(leerMensaje(JSON.stringify({ tipo: 'stake', l: 'BAYER LEVERKUSEN', v: 'FRIBURGO', mercado: 'Más de 2.5' }))).toEqual({
    tipo: 'stake', l: 'BAYER LEVERKUSEN', v: 'FRIBURGO', mercado: 'Más de 2.5',
  });
  expect(leerMensaje(JSON.stringify({ tipo: 'stake', l: '', v: 'x' }))).toBeNull();
  expect(leerMensaje(JSON.stringify({ tipo: 'stake', l: 'x'.repeat(121), v: 'x' }))).toBeNull();
});

test('urlStakePermitida: solo stake.mx / stake.com por https', () => {
  const { urlStakePermitida } = require('../src/flashscore/puente');
  expect(urlStakePermitida('https://stake.mx/sports/soccer')).toBe(true);
  expect(urlStakePermitida('https://www.stake.com/')).toBe(true);
  expect(urlStakePermitida('https://stake.mx.evil.com/')).toBe(false);
  expect(urlStakePermitida('http://stake.mx/')).toBe(false);
  expect(urlStakePermitida('https://evil.com/?u=https://stake.mx/')).toBe(false);
});

test('leerMensaje: aviso de fin de la busqueda en Stake', () => {
  expect(leerMensaje(JSON.stringify({ tipo: 'stake-fin', ok: true }))).toEqual({ tipo: 'stake-fin', ok: true });
  expect(leerMensaje(JSON.stringify({ tipo: 'stake-fin' }))).toEqual({ tipo: 'stake-fin', ok: false });
});

test('explicarBloqueo: el inicio de sesion con Google se explica; otros sitios, con su host', () => {
  const g = explicarBloqueo('https://accounts.google.com/o/oauth2/v2/auth?client_id=x');
  expect(g.motivo).toBe('google');
  expect(g.texto).toMatch(/Google no permite iniciar sesión dentro de otras apps/);
  expect(g.texto).toMatch(/correo y contraseña/);
  const o = explicarBloqueo('https://anuncios.ejemplo.com/ad?x=1');
  expect(o.motivo).toBe('otro');
  expect(o.host).toBe('anuncios.ejemplo.com');
});

test('esLoginGoogle: detecta Google directo y el manejador de Firebase de la casa, no paginas normales', () => {
  expect(esLoginGoogle('https://accounts.google.com/o/oauth2/v2/auth?x=1')).toBe(true);
  expect(esLoginGoogle('https://auth.betmexico.mx/__/auth/handler?apiKey=k&appName=%5BDEFAULT%5D')).toBe(true);
  expect(esLoginGoogle('https://betmexico.mx/deportes-elite/soccer/germany/bundesliga/x-1')).toBe(false);
  expect(esLoginGoogle('https://stake.mx/sports/soccer')).toBe(false);
  expect(explicarBloqueo('https://auth.betmexico.mx/__/auth/handler?apiKey=k').motivo).toBe('google');
});
