/** Puente Flashscore -> herramienta. Funciones puras para poder probarlas sin WebView. */

export type TipoCaptura = 'partido' | 'vivo';
export interface Captura {
  tipo: TipoCaptura;
  texto: string;
}

const MAX_TEXTO = 2_000_000;

/** Lee y valida el mensaje que manda el script de Flashscore; null si no es lo esperado. */
export const leerMensaje = (data: string): Captura | null => {
  try {
    const m = JSON.parse(data);
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

/** Solo se navega dentro de Flashscore; los anuncios que abren otros sitios se bloquean. */
export const urlPermitida = (url: string): boolean =>
  url.startsWith('about:') || /^https:\/\/([a-z0-9-]+\.)*flashscore\.(com\.mx|com)(\/|$)/i.test(url);
