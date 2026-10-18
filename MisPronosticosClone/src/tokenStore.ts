import * as Keychain from 'react-native-keychain';

/**
 * Token fino de GitHub (solo lectura, Contents: read) para bajar picks.json
 * cuando el repo es privado. Vive en el Keychain/Keystore del telefono: no va
 * en el repo, ni en Remote Config, ni en AsyncStorage.
 */
const SERVICE = 'github_picks_token';

export const leerToken = async (): Promise<string | null> => {
  try {
    const c = await Keychain.getGenericPassword({ service: SERVICE });
    return c ? c.password : null;
  } catch {
    return null;
  }
};

export const guardarToken = async (token: string): Promise<boolean> => {
  const limpio = token.trim();
  if (!limpio) return false;
  try {
    return !!(await Keychain.setGenericPassword('github', limpio, { service: SERVICE }));
  } catch {
    return false;
  }
};

export const borrarToken = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    // sin Keychain no hay nada que borrar
  }
};
