import type { AppConfig } from '../config';
import type { Match, Pick } from '../domain/picks';
import type { PicksQuery, PicksRepository } from './picksRepository';

const withTimeout = async <T>(ms: number, promise: Promise<T>): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
};

export interface ServerPick {
  id: string;
  fixtureId: string;
  league: string;
  leagueName?: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  odds: number | null;
  confidence: number;
  stars: number;
  isSpecial: boolean;
  isPremium: boolean;
  probMercado?: number;
  nMuestra?: number;
  rango?: number[];
}

export interface ServerMatch {
  id: string;
  league: string;
  leagueName: string;
  kickoff: string;
  status: string;
  minute: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
}

export const createApiRepository = (config: AppConfig, timeoutMs = 12000): PicksRepository => {
  const get = async <T>(path: string): Promise<T> => {
    const url = `${config.apiBaseUrl.replace(/\/$/, '')}${path}`;
    const res = await withTimeout(
      timeoutMs,
      fetch(url, { headers: { accept: 'application/json' } }),
    );
    if (!res.ok) {
      const body = await res.text();
      let detalle = body.slice(0, 200);
      try {
        detalle = (JSON.parse(body) as { detalle?: string }).detalle ?? detalle;
      } catch {
        /* respuesta no JSON */
      }
      throw new Error(`${res.status} ${detalle}`);
    }
    return (await res.json()) as T;
  };

  const toPick = (raw: ServerPick): Pick => ({
    id: raw.id,
    fixtureId: raw.fixtureId,
    market: (raw.market === 'TOTAL' || raw.market === 'BTTS' || raw.market === 'HANDICAP'
      ? raw.market
      : '1X2') as Pick['market'],
    selection: raw.selection,
    odds: raw.odds ?? 1,
    confidence: raw.confidence,
    stars: raw.stars,
    isSpecial: raw.isSpecial,
    isPremium: raw.isPremium,
    leagueName: raw.leagueName,
    kickoff: raw.kickoff,
    createdAt: raw.kickoff,
    reasoning: raw.nMuestra
      ? `Medido sobre ${raw.nMuestra} partidos · rango ${raw.rango?.[0]}–${raw.rango?.[1]}%`
      : undefined,
  });

  return {
    listTopPicks: async (query: PicksQuery) => {
      const params = new URLSearchParams();
      if (query.leagueId) params.set('league', query.leagueId);
      if (query.minConfidence) params.set('minConfidence', String(query.minConfidence));
      if (query.maxOdds) params.set('maxOdds', String(query.maxOdds));
      if (query.limit) params.set('limit', String(query.limit));
      const body = await get<{ picks: ServerPick[] }>(`/picks/top?${params.toString()}`);
      return body.picks.map(toPick);
    },

    listLiveMatches: async () => {
      const body = await get<{ matches: ServerMatch[] }>('/matches/live');
      return body.matches.map(
        (m): Match => ({
          id: m.id,
          kickoff: m.kickoff,
          minute: m.minute ? parseInt(m.minute, 10) : undefined,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeScore: m.homeScore ?? undefined,
          awayScore: m.awayScore ?? undefined,
          leagueId: m.league,
          leagueName: m.leagueName,
          status: 'live',
        }),
      );
    },

    listSpecials: async () => {
      const body = await get<{ picks: ServerPick[] }>('/picks/specials');
      return body.picks.filter(p => p.isSpecial).map(toPick);
    },
  };
};