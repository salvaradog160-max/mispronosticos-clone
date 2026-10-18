import { leerToken } from '../tokenStore';
import type { AppConfig } from '../config';
import type { Match, Pick } from '../domain/picks';
import type { AnalisisFila, AnalisisStats, TablaLiga } from './analisisRepository';
import type { PicksQuery, PicksRepository } from './picksRepository';

export interface Alerta {
  tipo: 'SALTO_TRAMO' | 'CAMBIO_LADO' | 'LINEA_GOLES' | 'NUEVO_PICK' | 'PICK_RETIRADO';
  severidad: 'alta' | 'media' | 'baja';
  fixtureId: string;
  partido: string;
  mercado: string;
  detalle: string;
  delta?: number | null;
}

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
  alertas?: Alerta[];
  live: ServerMatchShape[];
  analisis?: AnalisisFila[];
  estadisticas?: AnalisisStats | null;
  /** Tablas de posiciones por clave de liga (sco.1, arg.1...). */
  standings?: Record<string, TablaLiga>;
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
  leagueName?: string;
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
  margen?: number | null;
  roiUnit?: number | null;
  breakEven?: number | null;
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
  homeTeam: raw.homeTeam,
  awayTeam: raw.awayTeam,
  margen: raw.margen ?? null,
  roiUnit: raw.roiUnit ?? null,
  breakEven: raw.breakEven ?? null,
  odds: raw.odds ?? 0,
  confidence: raw.confidence,
  stars: raw.stars,
  isSpecial: raw.isSpecial,
  isPremium: raw.isPremium,
  leagueName: raw.leagueName,
  kickoff: raw.kickoff,
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
    // Repo privado: raw.githubusercontent pide el token; publico, no hace falta.
    // Un token vencido o invalido da 404 incluso en un repo publico: se reintenta sin el.
    const token = await leerToken();
    let res = await fetch(url, token ? { headers: { Authorization: `token ${token}` } } : undefined);
    if (token && (res.status === 401 || res.status === 403 || res.status === 404)) {
      res = await fetch(url);
    }
    if (!res.ok) {
      const pista = res.status === 404 || res.status === 401 ? ' (si el repo es privado, revisa el token en Perfil)' : '';
      throw new Error(`${res.status} leyendo picks.json${pista}`);
    }
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
    listAnalisis: async () => {
      const d = await load();
      return {
        analisis: d.analisis ?? [],
        estadisticas: d.estadisticas ?? null,
        // Tablas por clave de liga (sco.1, arg.1...). Puede venir vacio:
        // las ligas sin tabla simplemente no aparecen.
        tablas: d.standings ?? {},
      };
    },
    listAlertas: async () => {
      const d = await load();
      return d.alertas ?? [];
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
