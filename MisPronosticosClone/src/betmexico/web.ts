/** Visor de Betmexico: la pagina publica de apuestas. El usuario inicia sesion y apuesta por su cuenta; la app solo busca el partido. */
export const BETMEXICO_HOME = 'https://betmexico.mx/deportes/futbol/proximos-partidos';

/** El visor solo navega por betmexico.mx (y su plataforma sptpub.com para el sitio de apuestas). */
export const urlBetmexicoPermitida = (url: string): boolean =>
  url.startsWith('about:') || /^https:\/\/([a-z0-9-]+\.)*(betmexico\.mx|sptpub\.com)(\/|$)/i.test(url);
