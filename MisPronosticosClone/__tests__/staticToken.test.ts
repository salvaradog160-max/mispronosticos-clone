import * as Keychain from 'react-native-keychain';
import { createStaticRepository } from '../src/data/staticRepository';
import { DEFAULTS } from '../src/config';

const payload = { picks: [], mercados: null };
const mockFetch = (status: number) =>
  jest.fn().mockResolvedValue({ ok: status === 200, status, json: async () => payload });

afterEach(() => jest.clearAllMocks());

test('sin token no manda Authorization', async () => {
  const f = mockFetch(200);
  (globalThis as any).fetch = f;
  await createStaticRepository(DEFAULTS).listMercados!();
  expect(f.mock.calls[0][1]).toBeUndefined();
});

test('con token manda Authorization: token <t>', async () => {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({ username: 'github', password: 'ghp_x' });
  const f = mockFetch(200);
  (globalThis as any).fetch = f;
  await createStaticRepository(DEFAULTS).listMercados!();
  expect(f.mock.calls[0][1]).toEqual({ headers: { Authorization: 'token ghp_x' } });
});

test('404 sugiere pegar el token en Perfil', async () => {
  (globalThis as any).fetch = mockFetch(404);
  await expect(createStaticRepository(DEFAULTS).listMercados!()).rejects.toThrow(/pega el token en Perfil/);
});
