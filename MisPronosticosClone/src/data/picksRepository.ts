import type { Match, Pick } from '../domain/picks';
import { passesTopAiGate } from '../domain/picks';

export type MatchStatus = 'not-started' | 'live' | 'finished';

export interface PicksQuery {
  leagueId?: string;
  market?: Pick['market'];
  minConfidence?: number;
  maxOdds?: number;
  limit?: number;
}

export interface Alerta {
  tipo: 'SALTO_TRAMO' | 'CAMBIO_LADO' | 'LINEA_GOLES' | 'NUEVO_PICK' | 'PICK_RETIRADO';
  severidad: 'alta' | 'media' | 'baja';
  fixtureId: string;
  partido: string;
  mercado: string;
  detalle: string;
  delta?: number | null;
}

export interface MercadosInfo {
  overUnder25: boolean;
  handicap: boolean;
  handicapMotivo?: string;
  btts: boolean;
  bttsNota?: string;
}

export interface PicksRepository {
  listTopPicks(query: PicksQuery): Promise<Pick[]>;
  listLiveMatches(): Promise<Match[]>;
  listSpecials(): Promise<Pick[]>;
  listMercados?(): Promise<MercadosInfo | null>;
  listAlertas?(): Promise<Alerta[]>;
}

export const gate = (pick: Pick, minConfidence: number, minStars: number): boolean =>
  pick.confidence >= minConfidence && pick.stars >= minStars && pick.stars >= 1;

export const filterPicks = (
  picks: Pick[],
  query: PicksQuery,
  minConfidence: number,
  minStars: number,
): Pick[] =>
  picks
    .filter(pick => gate(pick, minConfidence, minStars))
    .filter(pick => (query.market ? pick.market === query.market : true))
    .filter(pick => (query.minConfidence ? pick.confidence >= query.minConfidence : true))
    .filter(pick => (query.maxOdds ? pick.odds <= query.maxOdds : true))
    .filter(pick => (query.leagueId ? true : true))
    .slice(0, query.limit ?? 50);