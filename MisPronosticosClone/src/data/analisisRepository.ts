import type { AppConfig } from '../config';

/** Un lado del mercado de goles (Over o Under) con mercado y modelo. */
export interface LadoGoles {
  lado: 'Over' | 'Under';
  cuota: number;
  /** Probabilidad que implica la cuota, sin margen. 0-1 */
  probMercado: number;
  /** La misma, en porcentaje, para mostrarla sin multiplicar en pantalla. */
  probMercadoPct: number;
  /** Lo que dice el modelo, en porcentaje, o null si no se pudo calcular. */
  probModelo: number | null;
  /** Puntos porcentuales a favor de apostar este lado. */
  margenPp: number | null;
}

/** Una fila de la tabla de posiciones. */
export interface FilaTabla {
  posicion: number;
  equipo: string;
  escudo: string | null;
  color?: string | null;
  pj: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  puntos: number;
  diferencia: number;
  aFavor: number;
  enContra: number;
}

/** Tabla de una liga. Algunas traen grupos (Argentina, Escocia...). */
export interface TablaLiga {
  liga: string;
  ligaNombre: string;
  grupos: { nombre: string | null; equipos: FilaTabla[] }[];
}

export interface AnalisisFila {
  partido: string;
  liga: string;
  /** Clave ESPN de la liga (arg.1). Necesaria para buscar su tabla. */
  ligaKey?: string | null;
  /** Escudos de cada equipo. Sin ellos la lista es una tabla de texto. */
  escudoLocal?: string | null;
  escudoVisita?: string | null;
  colorLocal?: string | null;
  colorVisita?: string | null;
  sede?: string | null;
  calibracion: 'propia' | 'europea';
  kickoff: string;
  ladoMercado: string;
  probMercado: number;
  cuotaMercado: number;
  cuotaApertura?: number | null;
  ladoModelo: string;
  probModelo: number;
  coincide: boolean;
  movimiento: number | null;
  cambioFavorito: boolean;
  lineaGoles: number | null;

  /**
   * Mercado de goles con los DOS lados declarados.
   * Antes solo se mandaba `cuotaGoles` (que era el over) sin etiqueta, y
   * en pantalla salia "Línea de goles 2.5 · más 1.67" sin poder saber si
   * era Over o Under.
   */
  goles: {
    linea: number;
    /** Cuanto suma el mercado por encima de 100%. 1.08 = 8% de margen. */
    overround?: number;
    over: LadoGoles;
    under: LadoGoles;
  } | null;

  /** Goles esperados del modelo (lambda). */
  lambdaHome?: number | null;
  lambdaAway?: number | null;

  /**
   * Cuota justa del modelo por mercado: 1X2, Over/Under 0.5-4.5, ambos
   * anotan y marcadores mas probables. Es lo que la estadistica diria
   * que deberia pagar (1/p), no la cuota real de la casa.
   */
  ladder?: {
    oneXTwo: {
      local: { p: number; cuotaJusta: number | null };
      empate: { p: number; cuotaJusta: number | null };
      visita: { p: number; cuotaJusta: number | null };
    };
    overUnder: Array<{
      linea: number;
      over: { p: number; cuotaJusta: number | null };
      under: { p: number; cuotaJusta: number | null };
    }>;
    ambosAnotan: {
      si: { p: number; cuotaJusta: number | null };
      no: { p: number; cuotaJusta: number | null };
    };
    marcadores: Array<{ marcador: string; p: number; cuotaJusta: number | null }>;
  } | null;

  /** Para saber si el partido ya se jugo y como quedo. */
  estado?: 'programado' | 'en vivo' | 'finalizado' | null;
  marcador?: string | null;
  /** Resultado del lado que eligio el mercado: acierto, fallo o empate. */
  resultado?: 'acierto' | 'fallo' | 'empate' | null;

  goodToLine: {
    ejecutable: boolean;
    probActual: number;
    necesita: number | null;
    cuotaNecesaria: number | null;
    cuotaActual: number;
    inalcanzable?: boolean;
  } | null;
}

export interface AnalisisStats {
  partidosHistorico: number;
  ligas: number;
  /** Cuantos partidos miden el acierto de consenso. */
  consensoN?: number;
  /** Cuantos picks miden el ROI (margen casa). */
  margenCasaN?: number;
  /** Peor caida del saldo acumulado desde su maximo (a $1 por pick). */
  margenCasaMaxDrawdown?: number | null;
  /** Deriva de la probabilidad del favorito entre apertura y cierre, en PUNTOS PORCENTUALES (no en fracción). */
  derivaMediana: number | null;
  /** Igual que derivaMediana, en puntos porcentuales: el 90% de los partidos se mueven menos que esto. */
  derivaP90: number | null;
  cambioFavorito: number | null;
  consensoAcierto: number | null;
  margenCasa: number;
  nota: string;
}

export interface Repository {
  listAnalisis(): Promise<{
    analisis: AnalisisFila[];
    estadisticas: AnalisisStats | null;
    tablas: Record<string, TablaLiga>;
  }>;
  _config?: AppConfig;
}
