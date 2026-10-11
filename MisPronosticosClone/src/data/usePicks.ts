import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppConfig } from '../config';
import type { Pick } from '../domain/picks';
import type { Alerta, MercadosInfo, PicksQuery, PicksRepository } from './picksRepository';
import { createMockRepository } from './mockRepository';
import { createApiRepository } from './apiRepository';
import { createStaticRepository } from './staticRepository';

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