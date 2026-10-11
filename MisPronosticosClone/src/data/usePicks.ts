import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppConfig } from '../config';
import type { Match, Pick } from '../domain/picks';
import type { Alerta, MercadosInfo, PicksQuery, PicksRepository } from './picksRepository';
import { createMockRepository } from './mockRepository';
import { createApiRepository } from './apiRepository';
import { createStaticRepository } from './staticRepository';
import type { Repository } from './analisisRepository';

export interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const useRepo = (config: AppConfig): PicksRepository =>
  useMemo(() => {
    if (config.dataSource === 'mock') return createMockRepository(config);
    if (config.dataSource === 'static') return createStaticRepository(config);
    return createApiRepository(config);
  }, [config.apiBaseUrl, config.dataSource, config.picksUrl]);

export const usePicks = (config: AppConfig, query: PicksQuery = {}): AsyncState<Pick[]> => {
  const repo = useRepo(config);
  const [data, setData] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = JSON.stringify(query);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    repo
      .listTopPicks(JSON.parse(key))
      .then(d => {
        if (vivo) setData(d);
      })
      .catch((e: Error) => {
        if (vivo) setError(e.message ?? 'No se pudieron cargar los picks');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [repo, key, nonce]);

  return { data, loading, error, reload };
};

/** Alertas de movimiento de linea desde la ultima corrida. */
export const useAlertas = (config: AppConfig): AsyncState<Alerta[]> => {
  const repo = useRepo(config);
  const [data, setData] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    const getter = repo.listAlertas;
    if (!getter) {
      setData([]);
      setLoading(false);
      return () => {
        vivo = false;
      };
    }
    getter
      .call(repo)
      .then(d => {
        if (vivo) setData(d);
      })
      .catch(() => {
        if (vivo) setData([]);
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [repo, nonce]);

  return { data, loading, error, reload };
};

/** Que mercados estan operativos y cuales no, con el motivo. */
export const useMercados = (config: AppConfig): AsyncState<MercadosInfo | null> => {
  const repo = useRepo(config);
  const [data, setData] = useState<MercadosInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    const getter = repo.listMercados;
    if (!getter) {
      setLoading(false);
      return () => {
        vivo = false;
      };
    }
    getter
      .call(repo)
      .then(d => {
        if (vivo) setData(d);
      })
      .catch(() => {
        if (vivo) setData(null);
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [repo, nonce]);

  return { data, loading, error, reload };
};
/** Partidos en juego, marcador real. */
export const useLiveMatches = (config: AppConfig): AsyncState<Match[]> => {
  const repo = useRepo(config);
  const [data, setData] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    repo
      .listLiveMatches()
      .then(d => {
        if (vivo) setData(d);
      })
      .catch((e: Error) => {
        if (vivo) setError(e.message ?? 'No se pudieron cargar los partidos');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [repo, nonce]);

  return { data, loading, error, reload };
};

import type { AnalisisFila as AnalisisRow, AnalisisStats as EstadisticasRow } from './analisisRepository';

export interface AnalisisState {
  data: AnalisisRow[];
  stats: EstadisticasRow | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Analizador: mercado vs modelo vs movimiento de linea. */
export const useAnalisis = (config: AppConfig): AnalisisState => {
  const repo = useRepo(config);
  const [data, setData] = useState<AnalisisRow[]>([]);
  const [stats, setStats] = useState<EstadisticasRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    const leer = (repo as unknown as Repository).listAnalisis;
    if (!leer) {
      setData([]);
      setLoading(false);
      return () => {
        vivo = false;
      };
    }
    leer
      .call(repo)
      .then(r => {
        if (vivo) {
          setData(r.analisis);
          setStats(r.estadisticas);
        }
      })
      .catch((e: Error) => {
        if (vivo) setError(e.message ?? 'No se pudo cargar el analisis');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [repo, nonce]);

  return { data, stats, loading, error, reload };
};
