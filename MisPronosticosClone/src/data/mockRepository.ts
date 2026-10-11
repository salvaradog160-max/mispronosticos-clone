import type { Match, Pick } from '../domain/picks';
import type { PicksQuery, PicksRepository } from './picksRepository';
import { passesTopAiGate } from '../domain/picks';
import { filterPicks } from './picksRepository';
import type { AppConfig } from '../config';

const now = () => new Date().toISOString();

const seedPicks: Pick[] = [
  {
    id: 'p1',
    fixtureId: 'm1',
    market: 'TOTAL',
    selection: 'Over 2.5',
    line: 2.5,
    odds: 1.92,
    confidence: 87,
    stars: 4,
    isSpecial: false,
    analysis: 'Promedio alto de goles en los ultimos 5 encuentros.',
    isPremium: false,
    createdAt: now(),
  },
  {
    id: 'p2',
    fixtureId: 'm2',
    market: 'BTTS',
    selection: 'Ambos marcan',
    odds: 1.78,
    confidence: 71,
    stars: 3,
    isSpecial: false,
    isPremium: false,
    createdAt: now(),
  },
  {
    id: 'p3',
    fixtureId: 'm3',
    market: 'TOTAL',
    selection: 'Over 2.5',
    line: 2.5,
    odds: 2.05,
    confidence: 91,
    stars: 5,
    isSpecial: true,
    verifiedBy: 'experto',
    analysis: 'Forma reciente y volumen de ambos ataques.',
    isPremium: false,
    createdAt: now(),
  },
];

const seedMatches: Match[] = [
  {
    id: 'm1',
    kickoff: now(),
    minute: 67,
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    homeScore: 1,
    awayScore: 1,
    leagueId: 'eng-1',
    leagueName: 'Premier League',
    status: 'live',
  },
];

export const createMockRepository = (config: AppConfig): PicksRepository => ({
  listTopPicks: async (query: PicksQuery) =>
    filterPicks(seedPicks, query, config.minConfidenceTopAi, config.minStarsTopAi).filter(
      passesTopAiGate,
    ),
  listLiveMatches: async () => seedMatches,
  listSpecials: async () => seedPicks.filter(pick => pick.isSpecial),
});

