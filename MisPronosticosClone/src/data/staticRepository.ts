import type { AppConfig } from '../config';
import type { Match, Pick } from '../domain/picks';
import type { PicksQuery, PicksRepository } from './picksRepository';

export interface DailyPayload {
  generado: string;
  fuente: string;
  calibracion: {
    partidos: number;
    consensoAcierto: number | null;
    consensoN: number;
    nota: string;
  };
  resumen: { partidosConDatos: number; picks: number; enVivo: number };
  picks: ServerPickShape[];
  picksMercado?: ServerPickShape[];
  live: ServerMatchShape[];
  mercados?: {
    overUnder25: boolean;
    handicap: boolean;
    handicapMotivo?: string;
    btts: boolean;
    bttsNota?: string;
  };
}

interface ServerPickShape {
  id: string;
  fixtureId: string;
  league: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  linea?: number | null;
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

interface ServerMatchShape {
  id: string;
  leagueName: string;
  kickoff: string;
  minute: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
}

const toPick = (raw: ServerPickShape): Pick => ({
  id: raw.id,
  fixtureId: raw.fixtureId,
  market: (raw.market ?? '1X2') as Pick['market'],
  selection: raw.selection,
  line: raw.linea ?? undefined,
  odds: raw.odds ?? 0,
  confidence: raw.confidence,
  stars: raw.stars,
  isSpecial: raw.isSpecial,
  isPremium: raw.isPremium,
  createdAt: raw.kickoff,
  reasoning: raw.nMuestra
    ? `Medido sobre ${raw.nMuestra.toLocaleString('es-MX')} partidos · rango ${raw.rango?.[0]}–${raw.rango?.[1]}%`
    : undefined,
});

export const createStaticRepository = (config: AppConfig): PicksRepository => {
  let cache: DailyPayload | null = null;

  const load = async (): Promise<DailyPayload> => {
    if (cache) return cache;
    const url = `${config.picksUrl.replace(/\/$/, '')}?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} leyendo picks.json`);
    cache = (await res.json()) as DailyPayload;
    return cache;
  };

  return {
    listTopPicks: async (query: PicksQuery) => {
      const data = await load();
      const todos = [...data.picks, ...(data.picksMercado ?? [])];
      let picks = todos.map(toPick);
      if (query.market) picks = picks.filter(p => p.market === query.market);
      if (query.minConfidence) picks = picks.filter(p => p.confidence >= query.minConfidence!);
      if (query.maxOdds) picks = picks.filter(p => p.odds > 0 && p.odds <= query.maxOdds!);
      return picks.sort((a, b) => b.confidence - a.confidence).slice(0, query.limit ?? 60);
    },
    listMercados: async () => {
      const data = await load();
      return data.mercados ?? null;
    },
    listLiveMatches: async () => {
      const data = await load();
      return data.live.map(
        (m): Match => ({
          id: m.id,
          kickoff: m.kickoff,
          minute: m.minute ? parseInt(m.minute, 10) : undefined,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeScore: m.homeScore ?? undefined,
          awayScore: m.awayScore ?? undefined,
          leagueId: m.leagueName,
          leagueName: m.leagueName,
          status: 'live',
        }),
      );
    },
    listSpecials: async () => {
      const data = await load();
      return data.picks.filter(p => p.isSpecial).map(toPick);
    },
  };
};
