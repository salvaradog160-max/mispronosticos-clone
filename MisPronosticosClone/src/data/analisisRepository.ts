import type { AppConfig } from '../config';

export interface AnalisisFila {
  partido: string;
  liga: string;
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
  cuotaGoles: number | null;
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
  listAnalisis(): Promise<{ analisis: AnalisisFila[]; estadisticas: AnalisisStats | null }>;
  _config?: AppConfig;
}
