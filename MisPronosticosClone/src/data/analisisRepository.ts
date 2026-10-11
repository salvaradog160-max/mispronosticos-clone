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
}

export interface AnalisisStats {
  partidosHistorico: number;
  ligas: number;
  derivaMediana: number | null;
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
