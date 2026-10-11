import { getApps } from '@react-native-firebase/app';
import { getAnalytics } from '@react-native-firebase/analytics';
import { getAuth } from '@react-native-firebase/auth';
import { getRemoteConfig, fetchAndActivate, ensureInitialized } from '@react-native-firebase/remote-config';
import { RC_KEYS } from '../config';

export const firebaseReady = getApps().length > 0;

export const analytics = () => (firebaseReady ? getAnalytics() : null);
export const auth = () => (firebaseReady ? getAuth() : null);

export interface RemoteSnapshot {
  apiBaseUrl?: string;
  liveSocketUrl?: string;
  minConfidenceTopAi?: number;
  minStarsTopAi?: number;
  trialDays?: number;
}

interface RemoteConfigReader {
  getString(key: string): string;
}

export const loadRemoteConfig = async (): Promise<RemoteSnapshot> => {
  if (!firebaseReady) {
    console.info('[firebase] sin google-services.json, usando defaults');
    return {};
  }
  const rc = getRemoteConfig() as unknown as RemoteConfigReader;
  await ensureInitialized(rc as never);
  await fetchAndActivate(rc as never);
  const read = (key: string) => {
    const value = rc.getString(key);
    return value.length > 0 ? value : undefined;
  };
  const readNum = (key: string) => {
    const raw = read(key);
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    apiBaseUrl: read(RC_KEYS.apiBaseUrl),
    liveSocketUrl: read(RC_KEYS.liveSocketUrl),
    minConfidenceTopAi: readNum(RC_KEYS.minConfidenceTopAi),
    minStarsTopAi: readNum(RC_KEYS.minStarsTopAi),
    trialDays: readNum(RC_KEYS.trialDays),
  };
};