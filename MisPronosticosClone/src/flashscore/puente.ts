/** Puente Flashscore -> herramienta. Funciones puras para poder probarlas sin WebView. */
import { fichaValida, type Ficha } from '../mitades/modelo';

export type TipoCaptura = 'partido' | 'vivo';
export interface Captura {
  tipo: TipoCaptura;
  texto: string;
}
/** Peticion de la herramienta: abrir en Stake el partido de la tarjeta que se toco. */
export interface PedidoStake {
  tipo: 'stake';
  l: string;
  v: string;
  mercado: string;
}
/** Peticion de la herramienta: movimiento de cuota de un partido en Arbworld (la app lo lee; la herramienta no puede por CORS). */
export interface PedidoArbworld {
  tipo: 'arbworld';
  id: number;
  l: string;
  v: string;
  m: string;
}
/** Peticion de la herramienta: cuotas de Stake (API) para un partido; la app guarda la clave y hace la consulta. */
export interface PedidoStakeApi {
  tipo: 'stakeapi';
  id: number;
  l: string;
  v: string;
}
/** Peticion de la herramienta: cuotas de Betmexico (feed publico de su pagina); la app las lee. */
export interface PedidoBetmexico {
  tipo: 'betmexico';
  id: number;
  l: string;
  v: string;
}
/** Peticion de la herramienta: abrir el partido de una tarjeta en una casa (el usuario apuesta por su cuenta). */
export interface PedidoAbrir {
  tipo: 'abrir';
  casa: 'stake' | 'betmexico';
  l: string;
  v: string;
  mercado: string;
}
/** El script de Stake avisa al terminar (haya encontrado el partido o no). */
export interface FinStake {
  tipo: 'stake-fin';
  ok: boolean;
}
/** La herramienta entrega al arrancar las fichas de mitades que ya guardo (un partido terminado no cambia). */
export interface CacheMitades {
  tipo: 'mitades-cache';
  fichas: Ficha[];
}
/** El boton «Mitades» de la app, ya dentro de la pagina de Flashscore, manda la direccion del partido abierto. */
export interface PedidoMitades {
  tipo: 'mitades-pedir';
  urlH2h: string | null;
}
export type Mensaje = PedidoMitades | Captura | PedidoStake | FinStake | PedidoArbworld | PedidoStakeApi | PedidoBetmexico | PedidoAbrir | CacheMitades;

const MAX_TEXTO = 2_000_000;

const esFicha = (f: any): f is Ficha =>
  !!f && typeof f.mid === 'string' && f.mid.length <= 40 && typeof f.local === 'string' && typeof f.visita === 'string' &&
  Number.isInteger(f.gl) && Number.isInteger(f.gv) && Array.isArray(f.goles) && f.goles.length <= 30 &&
  f.goles.every((g: any) => [g?.m, g?.x, g?.l, g?.v].every(Number.isInteger) && (g.t === 1 || g.t === 2)) && fichaValida(f);

/** Lee y valida el mensaje que manda el script de Flashscore; null si no es lo esperado. */
export const leerMensaje = (data: string): Mensaje | null => {
  try {
    const m = JSON.parse(data);
    if (m?.tipo === 'mitades-pedir') return { tipo: 'mitades-pedir', urlH2h: typeof m.url === 'string' ? urlH2h(m.url) : null };
    if (m?.tipo === 'mitades-cache') {
      const vals = m.fichas && typeof m.fichas === 'object' ? Object.values(m.fichas) : [];
      return { tipo: 'mitades-cache', fichas: vals.slice(0, 300).filter(esFicha) as Ficha[] };
    }
    if (m?.tipo === 'abrir') {
      const ok = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 120;
      if ((m.casa !== 'stake' && m.casa !== 'betmexico') || !ok(m.l) || !ok(m.v)) return null;
      return { tipo: 'abrir', casa: m.casa, l: m.l, v: m.v, mercado: typeof m.mercado === 'string' ? m.mercado.slice(0, 120) : '' };
    }
    if (m?.tipo === 'betmexico') {
      const ok = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 120;
      if (!ok(m.l) || !ok(m.v) || !Number.isInteger(m.id)) return null;
      return { tipo: 'betmexico', id: m.id, l: m.l, v: m.v };
    }
    if (m?.tipo === 'stakeapi') {
      const ok = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 120;
      if (!ok(m.l) || !ok(m.v) || !Number.isInteger(m.id)) return null;
      return { tipo: 'stakeapi', id: m.id, l: m.l, v: m.v };
    }
    if (m?.tipo === 'arbworld') {
      const ok = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 120;
      if (!ok(m.l) || !ok(m.v) || !ok(m.m) || !Number.isInteger(m.id)) return null;
      return { tipo: 'arbworld', id: m.id, l: m.l, v: m.v, m: m.m };
    }
    if (m?.tipo === 'stake-fin') return { tipo: 'stake-fin', ok: m.ok === true };
    if (m?.tipo === 'stake') {
      const ok = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 120;
      if (!ok(m.l) || !ok(m.v)) return null;
      return { tipo: 'stake', l: m.l, v: m.v, mercado: typeof m.mercado === 'string' ? m.mercado.slice(0, 120) : '' };
    }
    if ((m?.tipo !== 'partido' && m?.tipo !== 'vivo') || typeof m.texto !== 'string') return null;
    if (!m.texto.trim() || m.texto.length > MAX_TEXTO) return null;
    return { tipo: m.tipo, texto: m.texto };
  } catch {
    return null;
  }
};

/** JS que se inyecta en la herramienta. JSON.stringify escapa el texto; los separadores de linea unicode se escapan a mano (rompen JS viejo). */
export const jsRecibir = (c: Captura): string => {
  const lit = JSON.stringify(c.texto).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.__pgRecibir && window.__pgRecibir(${JSON.stringify(c.tipo)}, ${lit}); true;`;
};

/** El visor de Stake solo navega por stake.mx / stake.com. */
export const urlStakePermitida = (url: string): boolean =>
  url.startsWith('about:') || /^https:\/\/([a-z0-9-]+\.)*stake\.(mx|com)(\/|$)/i.test(url);

/** Solo se navega dentro de Flashscore; los anuncios que abren otros sitios se bloquean. */
export const urlPermitida = (url: string): boolean =>
  url.startsWith('about:') || /^https:\/\/([a-z0-9-]+\.)*flashscore\.(com\.mx|com)(\/|$)/i.test(url);

export interface Bloqueo {
  motivo: 'google' | 'otro';
  host: string;
  texto: string;
}

/** Inicio de sesion con Google (directo o por el manejador de Firebase que usan las casas antes de saltar a Google). */
export const esLoginGoogle = (url: string): boolean =>
  /^https?:\/\/accounts\.google\.[a-z.]+\//i.test(url) || /\/__\/auth\/(handler|iframe)/i.test(url) || /accounts\.google\.[a-z.]+/i.test(url);

/** Explica por que el visor no deja abrir una direccion externa (p. ej. el inicio de sesion con Google). */
export const explicarBloqueo = (url: string): Bloqueo => {
  const host = (/^https?:\/\/([^/?#:]+)/i.exec(url)?.[1] ?? '').toLowerCase();
  if (esLoginGoogle(url)) {
    return {
      motivo: 'google',
      host,
      texto:
        'Google no permite iniciar sesión dentro de otras apps. Entra con tu correo y contraseña de la casa (si creaste la cuenta con Google, usa «Olvidé mi contraseña» con ese mismo Gmail) o abre la página en Chrome, donde Google sí funciona.',
    };
  }
  return { motivo: 'otro', host, texto: `El visor no abre direcciones de otros sitios (${host || 'desconocido'}). Puedes abrir la página en tu navegador.` };
};

/** Pagina H2H del partido que se esta viendo en Flashscore (de ahi salen los ultimos partidos de cada equipo); null si no es una ficha de partido. */
export const urlH2h = (url: string): string | null => {
  const m = /^(https:\/\/(?:[a-z0-9-]+\.)*flashscore\.(?:com\.mx|com))\/partido\/futbol\/([^/?#]+)\/([^/?#]+)\/(?:[^?#]*)?(\?[^#]*)?/i.exec(url);
  const mid = m?.[4] ? /[?&]mid=([A-Za-z0-9]+)/.exec(m[4])?.[1] : undefined;
  return m && mid ? `${m[1]}/partido/futbol/${m[2]}/${m[3]}/h2h/general/?mid=${mid}` : null;
};

/** JS que el boton «Mitades» inyecta en Flashscore: avisa a la app que partido esta abierto. */
export const PEDIR_MITADES_JS = "window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'mitades-pedir',url:location.href})); true;";
