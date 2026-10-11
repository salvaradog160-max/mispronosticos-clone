import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Match, Pick } from '../domain/picks';
import type { AppConfig } from '../config';
import type { PicksQuery, PicksRepository } from './picksRepository';
import { createMockRepository } from './mockRepository';
import { createApiRepository } from './apiRepository';
import { createStaticRepository } from './staticRepository';

export interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export const useRepository = (config: AppConfig): PicksRepository =>
  useMemo(() => {
    if (config.dataSource === 'mock') return createMockRepository(config);
    if (config.dataSource === 'static') return createStaticRepository(config);
    return createApiRepository(config);
  }, [config.apiBaseUrl, config.dataSource, config.picksUrl]);

export const usePicks = (config: AppConfig, query: PicksQuery = {}): AsyncState<Pick[]> => {
  const repo = useRepository(config);
  const key = JSON.stringify(query);
  const [state, setState] = useState<AsyncState<Pick[]>>({
    data: [],
    loading: true,
    error: null,
    reload: () => {},
  });

  const load = useCallback(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));
    repo
      .listTopPicks(query)
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null, reload: load });
      })
      .catch(error => {
        if (!cancelled)
          setState({
            data: [],
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            reload: load,
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key]);

  useEffect(() => load(), [load]);

  return state;
};

export const useLiveMatches = (config: AppConfig): AsyncState<Match[]> => {
  const repo = useRepository(config);
  const [state, setState] = useState<AsyncState<Match[]>>({
    data: [],
    loading: true,
    error: null,
    reload: () => {},
  });

  const load = useCallback(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));
    repo
      .listLiveMatches()
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null, reload: load });
      })
      .catch(error => {
        if (!cancelled)
          setState({ data: [], loading: false, error: String(error), reload: load });
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  useEffect(() => load(), [load]);

  return state;
};