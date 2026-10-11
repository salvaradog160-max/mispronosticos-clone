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

const mockUseAnalisis = jest.fn();

jest.mock('../src/data/usePicks', () => ({
  useAnalisis: () => mockUseAnalisis(),
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

/**
 * Recoge todo el texto del arbol sin serializarlo entero.
 *
 * `JSON.stringify(arbol.toJSON())` revienta con "Converting circular
 * structure to JSON": React Native mete props que se referencian entre
 * si (ListHeaderComponent). Se recorre a mano y se corta el ciclo con
 * un WeakSet.
 */
const textos = (nodo: any, visto = new WeakSet()): string[] => {
  if (nodo === null || nodo === undefined) return [];
  if (typeof nodo === 'string') return [nodo];
  if (typeof nodo === 'number') return [String(nodo)];
  if (typeof nodo !== 'object') return [];
  if (visto.has(nodo)) return [];
  visto.add(nodo);
  if (Array.isArray(nodo)) return nodo.flatMap(n => textos(n, visto));
  const hijos = nodo.children ?? nodo.props?.children;
  const propios = hijos ? textos(hijos, visto) : [];
  return propios;
};

// Se busca por la PROPIEDAD, no por el tipo: en el test renderer de RN
// `Pressable` se aplana a un `View` y `Modal` no siempre conserva el
// nombre, asi que `n.type === 'Pressable'` devuelve 0 sin avisar.
const visibles = (arbol: any) =>
  arbol.root.findAll((n: any) => n.props?.visible === true && n.props?.onRequestClose);

const tarjetas = (arbol: any) =>
  arbol.root.findAll(
    (n: any) => typeof n.props?.onPress === 'function' && n.props?.onPress.length === 0,
  );

const montar = async () => {
  let arbol: any;
  await j.act(() => {
    arbol = j.create(React.createElement(TopAiScreen));
  });
  return arbol;
};

beforeEach(() => {
  mockUseAnalisis.mockReturnValue({
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
  const texto = textos(arbol.toJSON()).join(' | ');
  expect(texto).toContain('Aberdeen vs St Johnstone');
  expect(texto).toContain('Premiership Scotland');
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

  const texto = textos(visibles(arbol)[0].toJSON ? visibles(arbol)[0].toJSON() : visibles(arbol)[0]).join(' | ');
  expect(texto).toContain('Over');
  expect(texto).toContain('Under');
});