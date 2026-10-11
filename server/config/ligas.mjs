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
export const LIGAS_ESPIN = [
  'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
  'ned.1', 'por.1', 'bel.1', 'tur.1', 'sco.1',
  'ita.2', 'esp.2', 'ger.2',
  'mex.1', 'arg.1', 'bra.1', 'usa.1', 'col.1',
];