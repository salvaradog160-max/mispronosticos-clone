/** Puente Flashscore -> herramienta. Funciones puras para poder probarlas sin WebView. */

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
export type Mensaje = Captura | PedidoStake | FinStake | PedidoArbworld | PedidoStakeApi | PedidoBetmexico | PedidoAbrir;

const MAX_TEXTO = 2_000_000;

/** Lee y valida el mensaje que manda el script de Flashscore; null si no es lo esperado. */
export const leerMensaje = (data: string): Mensaje | null => {
  try {
    const m = JSON.parse(data);
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
