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

test('token invalido (404) reintenta sin token y, si el repo es publico, carga', async () => {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({ username: 'github', password: 'vencido' });
  const f = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => payload });
  (globalThis as any).fetch = f;
  await expect(createStaticRepository(DEFAULTS).listMercados!()).resolves.toBeNull();
  expect(f).toHaveBeenCalledTimes(2);
  expect(f.mock.calls[0][1]).toEqual({ headers: { Authorization: 'token vencido' } });
  expect(f.mock.calls[1][1]).toBeUndefined();
});

test('404 sugiere pegar el token en Perfil', async () => {
  (globalThis as any).fetch = mockFetch(404);
  await expect(createStaticRepository(DEFAULTS).listMercados!()).rejects.toThrow(/revisa el token en Perfil/);
});
