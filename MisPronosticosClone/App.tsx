import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { DEFAULTS, mergeConfig, type AppConfig } from './src/config';
import { firebaseReady, loadRemoteConfig } from './src/firebase';

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    loadRemoteConfig()
      .then(snapshot => {
        if (cancelled) return;
        const next = mergeConfig(snapshot);
        console.info(
          `[firebase] ready=${firebaseReady} api=${next.apiBaseUrl} conf=${next.minConfidenceTopAi}`,
        );
        setConfig(next);
      })
      .catch(error => {
        console.warn('[firebase] remote config fallo', String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <RootNavigator config={config} />
    </SafeAreaProvider>
  );
}