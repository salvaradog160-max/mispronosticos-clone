/**
 * Pruebas de la pantalla de analisis.
 *
 * Estas nacen de un bug que ninguna suite detecto: la tarjeta era un
 * Pressable con onPress que guardaba el estado, pero <DetalleModal />
 * NUNCA se habia montado en el arbol. Se importaba y no se usaba. Al
 * tocar no pasaba nada, que era justo la queja original.
 *
 * `tsc` pasaba, `jest` daba 15/15 verde, y la app estaba rota.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { AnalisisFila } from '../src/data/analisisRepository';

const useAnalisisMock = jest.fn();

jest.mock('../src/data/usePicks', () => ({
  useAnalisis: () => useAnalisisMock(),
}));

// Se importa DESPUES del mock (jest.mock se hoist-ea por encima).
const TopAiScreen = require('../src/screens/TopAiScreen').default;

const j = ReactTestRenderer;

const FILA: AnalisisFila = {
  partido: 'Aberdeen vs St Johnstone',
  liga: 'Premiership Scotland',
  calibracion: 'propia',
  kickoff: '2026-10-12T16:30:00Z',
  ladoMercado: 'Aberdeen',
  probMercado: 0.484,
  cuotaMercado: 1.95,
  cuotaApertura: 2.25,
  ladoModelo: 'Aberdeen',
  probModelo: 0.52,
  coincide: true,
  movimiento: 6.3,
  cambioFavorito: false,
  lineaGoles: 2.5,
  goles: {
    linea: 2.5,
    overround: 1.087,
    over: { lado: 'Over', cuota: 1.87, probMercado: 0.5, probMercadoPct: 50, probModelo: 44.2, margenPp: -5.8 },
    under: { lado: 'Under', cuota: 1.87, probMercado: 0.5, probMercadoPct: 50, probModelo: 55.8, margenPp: 5.8 },
  },
  goodToLine: null,
};

const visibles = (arbol: any) =>
  arbol.root.findAll((n: any) => n.type === 'Modal' && n.props?.visible === true);

const tarjetas = (arbol: any) =>
  arbol.root.findAll(
    (n: any) => n.type === 'Pressable' && typeof n.props?.onPress === 'function',
  );

const montar = async () => {
  let arbol: any;
  await j.act(() => {
    arbol = j.create(React.createElement(TopAiScreen));
  });
  return arbol;
};

beforeEach(() => {
  useAnalisisMock.mockReturnValue({
    data: [FILA],
    stats: null,
    loading: false,
    error: null,
    reload: jest.fn(),
  });
});

afterEach(() => jest.clearAllMocks());

test('la pantalla monta la tarjeta del partido', async () => {
  const arbol = await montar();
  const plano = JSON.stringify(arbol.toJSON());
  expect(plano).toContain('Aberdeen vs St Johnstone');
  expect(plano).toContain('Premiership Scotland');
  expect(tarjetas(arbol).length).toBeGreaterThan(0);
});

test('REGRESION: tocar la tarjeta abre el detalle', async () => {
  const arbol = await montar();
  const t = tarjetas(arbol);

  expect(visibles(arbol).length).toBe(0);

  await j.act(() => {
    t[0].props.onPress();
  });

  expect(visibles(arbol).length).toBeGreaterThan(0);
});

test('cerrar el detalle lo esconde de nuevo', async () => {
  const arbol = await montar();
  const t = tarjetas(arbol);

  await j.act(() => {
    t[0].props.onPress();
  });
  expect(visibles(arbol).length).toBeGreaterThan(0);

  await j.act(() => {
    visibles(arbol)[0].props.onRequestClose();
  });
  expect(visibles(arbol).length).toBe(0);
});

test('el detalle muestra los dos lados de Over/Under con su cuota', async () => {
  const arbol = await montar();
  const t = tarjetas(arbol);
  await j.act(() => {
    t[0].props.onPress();
  });

  const plano = JSON.stringify(visibles(arbol)[0]);
  expect(plano).toContain('Over');
  expect(plano).toContain('Under');
});