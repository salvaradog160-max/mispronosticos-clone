/**
 * Configuracion de ligas, en un solo lugar.
 *
 * El historico con CUOTAS viene de football-data.co.uk. Solo se puede
 * construir un modelo donde hay historia con precios: sin cuotas
 * historicas no hay "consenso" que calibrar, y un modelo sin comparar
 * contra el mercado no tiene ninguna ventaja demostrable.
 *
 * Eso deja fuera a Liga MX: football-data.co.uk no la publica (404).
 * Para meterla haria falta una API con clave. Ver README.
 */

/** Divisiones de football-data.co.uk usadas para historia + calibracion. */
export const LEAGUES_HISTORIA = [
  'E1',  // Premier League
  'SP1', // La Liga
  'I1',  // Serie A
  'D1',  // Bundesliga
  'F1',  // Ligue 1
  'N1',  // Eredivisie
  'P1',  // Primeira Liga
  'B1',  // Belgian Pro League
  'T1',  // Super Lig
  'G1',  // Gamma Ethniki (Greece)
  'SC0', // Premiership Scotland
  'I2',  // Serie B
  'SP2', // LaLiga 2
  'D2',  // 2. Bundesliga
];

export const NOMBRES_LIGA = {
  // ESPN (slugs). Sin estos, `NOMBRES_LIGA[league] ?? league` se escapaba
  // crudo y en pantalla salia "sco.1" en vez de "Premiership Scotland".
  // Ojo: son claves DISTINTAS a las de football-data (sco.1 != SC0), por
  // eso hacen falta las dos familias.
  'eng.1': 'Premier League',
  'esp.1': 'La Liga',
  'esp.2': 'LaLiga 2',
  'ita.1': 'Serie A',
  'ita.2': 'Serie B',
  'ger.1': 'Bundesliga',
  'ger.2': '2. Bundesliga',
  'fra.1': 'Ligue 1',
  'ned.1': 'Eredivisie',
  'por.1': 'Primeira Liga',
  'bel.1': 'Belgian Pro League',
  'tur.1': 'Super Lig',
  'sco.1': 'Premiership Scotland',

  // ESPN — america
  'mex.1': 'Liga MX',
  'bra.1': 'Brasileirão',
  'usa.1': 'MLS',
  'arg.1': 'Liga Profesional',
  'col.1': 'Liga BetPlay',
  'chi.1': 'Liga Chile',
  'per.1': 'Liga Peruana',
  'uru.1': 'Liga Uruguaya',
  // football-data.co.uk
  E1: 'Premier League',
  SP1: 'La Liga',
  I1: 'Serie A',
  D1: 'Bundesliga',
  F1: 'Ligue 1',
  N1: 'Eredivisie',
  P1: 'Primeira Liga',
  B1: 'Belgian Pro League',
  T1: 'Super Lig',
  G1: 'Super League Greece',
  SC0: 'Premiership',
  I2: 'Serie B',
  SP2: 'LaLiga 2',
  D2: '2. Bundesliga',
};

/** Divisiones de ESPN para los partidos por venir (con su clave propia). */
/**
 * ligas de america: ESPN da resultados historicos, NO cuotas
 * historicas. El modelo se construye igual; la calibracion es la
 * europea y por eso el analisis las marca distinto.
 */
export const LIGAS_AMERICA = ['mex.1', 'bra.1', 'usa.1', 'arg.1', 'col.1', 'chi.1'];

export const LIGAS_ESPIN = [
  'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
  'ned.1', 'por.1', 'bel.1', 'tur.1', 'sco.1',
  'ita.2', 'esp.2', 'ger.2',
  'mex.1', 'arg.1', 'bra.1', 'usa.1', 'col.1',
];