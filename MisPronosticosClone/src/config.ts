export type DataSource = 'mock' | 'api' | 'static';

export const RC_KEYS = {
  apiBaseUrl: 'api_base_url',
  dataSource: 'data_source',
  picksUrl: 'picks_url',
  liveSocketUrl: 'live_socket_url',
  minConfidenceTopAi: 'min_confidence_top_ai',
  minStarsTopAi: 'min_stars_top_ai',
  trialDays: 'trial_days',
} as const;

export interface AppConfig {
  apiBaseUrl: string;
  picksUrl: string;
  dataSource: DataSource;
  liveSocketUrl: string;
  minConfidenceTopAi: number;
  minStarsTopAi: number;
  trialDays: number;
}

export const DEFAULTS: AppConfig = {
  apiBaseUrl: 'http://192.168.1.79:8787',
  picksUrl: 'https://raw.githubusercontent.com/salvaradog160-max/mispronosticos-clone/main/server/public/picks.json',
  dataSource: 'static',
  liveSocketUrl: '',
  minConfidenceTopAi: 78,
  minStarsTopAi: 4,
  trialDays: 2,
};

const num = (raw: unknown, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const mergeConfig = (
  raw: Partial<Record<keyof typeof RC_KEYS, string | number | undefined>> | null | undefined,
  base: AppConfig = DEFAULTS,
): AppConfig => {
  if (!raw) return base;
  return {
    apiBaseUrl: String(raw.apiBaseUrl ?? '') || base.apiBaseUrl,
    dataSource:
      raw.dataSource === 'api' || raw.dataSource === 'static' || raw.dataSource === 'mock'
        ? raw.dataSource
        : base.dataSource,
    picksUrl: String(raw.picksUrl ?? '') || base.picksUrl,
    liveSocketUrl: String(raw.liveSocketUrl ?? '') || base.liveSocketUrl,
    minConfidenceTopAi: num(raw.minConfidenceTopAi, base.minConfidenceTopAi),
    minStarsTopAi: num(raw.minStarsTopAi, base.minStarsTopAi),
    trialDays: num(raw.trialDays, base.trialDays),
  };
};