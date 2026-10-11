export type Market = '1X2' | 'TOTAL' | 'HANDICAP' | 'BTTS';

export type MatchStatus = 'not-started' | 'live' | 'finished';

export interface Match {
  id: string;
  kickoff: string;
  minute?: number;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  leagueId: string;
  leagueName: string;
  leagueCountry?: string;
  status: MatchStatus;
}

export interface Pick {
  id: string;
  fixtureId: string;
  market: Market;
  selection: string;
  line?: number;
  homeTeam?: string;
  awayTeam?: string;
  margen?: number | null;
  roiUnit?: number | null;
  breakEven?: number | null;
  odds: number;
  confidence: number;
  stars: number;
  isSpecial: boolean;
  verifiedBy?: string;
  reasoning?: string;
  analysis?: string;
  isPremium: boolean;
  createdAt: string;
}

export interface EntitlementSet {
  topAi: boolean;
  live: boolean;
  especiales: boolean;
}

export const confidenceToStars = (confidence: number): number => {
  if (confidence >= 88) return 5;
  if (confidence >= 78) return 4;
  if (confidence >= 68) return 3;
  if (confidence >= 55) return 2;
  return 1;
};

export const passesTopAiGate = (pick: Pick): boolean =>
  pick.stars >= 4 && pick.confidence >= 78;

export const isValuePick = (pick: Pick): boolean => pick.odds >= 1.85;

export const needsExpertValidation = (pick: Pick): boolean => pick.confidence >= 85;