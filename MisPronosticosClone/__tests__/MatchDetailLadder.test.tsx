/**
 * Prueba de render del detalle con la escalera de cuota justa.
 *
 * El ladder (1X2, O/U 0.5-4.5, ambos anotan y marcadores) llega en el
 * payload del server como `fila.ladder`. Aqui se monta el modal abierto
 * con una fila que lo trae y se verifica que se dibuja de verdad en el
 * arbol, no solo que tsc compila.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { AnalisisFila } from '../src/data/analisisRepository';

jest.mock('../src/data/usePicks', () => ({
  useAnalisis: () => mockUseAnalisis(),
}));

const MatchDetailScreen = jest.requireActual('../src/screens/MatchDetailScreen').default;

const FILA: AnalisisFila = {
  partido: 'Nashville SC vs Sporting Kansas City',
  liga: 'MLS',
  calibracion: 'propia',
  kickoff: '2026-10-14T18:30:00Z',
  ladoMercado: 'Nashville SC',
  probMercado: 0.74,
  cuotaMercado: 1.24,
  cuotaApertura: 1.24,
  ladoModelo: 'Sporting Kansas City',
  probModelo: 0.41,
  coincide: false,
  movimiento: 0,
  cambioFavorito: false,
  lineaGoles: 3.5,
  goles: {
    linea: 3.5,
    overround: 1.07,
    over: { lado: 'Over', cuota: 1.83, probMercado: 0.51, probMercadoPct: 51, probModelo: 51.5, margenPp: 0.5 },
    under: { lado: 'Under', cuota: 1.91, probMercado: 0.49, probMercadoPct: 49, probModelo: 48.5, margenPp: -0.5 },
  },
  lambdaHome: 1.42,
  lambdaAway: 1.18,
  ladder: {
    oneXTwo: {
      local: { p: 0.41, cuotaJusta: 2.44 },
      empate: { p: 0.27, cuotaJusta: 3.7 },
      visita: { p: 0.32, cuotaJusta: 3.12 },
    },
    overUnder: [
      { linea: 0.5, over: { p: 0.88, cuotaJusta: 1.14 }, under: { p: 0.12, cuotaJusta: 8.33 } },
      { linea: 1, over: { p: 0.68, cuotaJusta: 1.47 }, under: { p: 0.32, cuotaJusta: 3.12 } },
      { linea: 4.5, over: { p: 0.09, cuotaJusta: 11.11 }, under: { p: 0.91, cuotaJusta: 1.1 } },
    ],
    ambosAnotan: {
      si: { p: 0.55, cuotaJusta: 1.82 },
      no: { p: 0.45, cuotaJusta: 2.22 },
    },
    marcadores: [
      { marcador: '1-1', p: 0.12, cuotaJusta: 8.33 },
      { marcador: '2-1', p: 0.1, cuotaJusta: 10.0 },
    ],
  },
  goodToLine: null,
  tiempos: {
    fraccion1T: 0.454,
    primerTiempo: {
      local: 0.64,
      visita: 0.54,
      overUnder: [
        { linea: 0.5, over: { p: 0.66, cuotaJusta: 1.52 }, under: { p: 0.34, cuotaJusta: 2.94 } },
        { linea: 1.5, over: { p: 0.26, cuotaJusta: 3.85 }, under: { p: 0.74, cuotaJusta: 1.35 } },
      ],
    },
    segundoTiempo: {
      local: 0.78,
      visita: 0.64,
      overUnder: [
        { linea: 0.5, over: { p: 0.73, cuotaJusta: 1.37 }, under: { p: 0.27, cuotaJusta: 3.7 } },
      ],
    },
  },
};

let mockUseAnalisis: any = jest.fn();

const textos = (nodo: any, visto = new WeakSet()): string[] => {
  if (nodo === null || nodo === undefined) return [];
  if (typeof nodo === 'string') return [nodo];
  if (typeof nodo === 'number') return [String(nodo)];
  if (typeof nodo !== 'object') return [];
  if (visto.has(nodo)) return [];
  visto.add(nodo);
  if (Array.isArray(nodo)) return nodo.flatMap(n => textos(n, visto));
  const hijos = nodo.children ?? nodo.props?.children;
  return hijos ? textos(hijos, visto) : [];
};

test('el detalle dibuja la escalera de cuota justa por mercado', async () => {
  mockUseAnalisis.mockReturnValue([FILA]);

  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <MatchDetailScreen fila={FILA} onCerrar={() => {}} />,
    );
  });
  const txt = textos(renderer!.toJSON());
  const plano = txt.join(' | ');
  expect(plano).toContain('CUOTA JUSTA DEL MODELO POR MERCADO');
  expect(plano).toContain('Over / Under (goles)');
  expect(plano).toContain('Ambos anotan');
  expect(plano).toContain('Marcadores más probables');
  expect(plano).toContain('1-1');
  expect(plano).toContain('GOLES ESPERADOS POR TIEMPO');
  expect(plano).toContain('PRIMER TIEMPO');
  expect(plano).toContain('SEGUNDO TIEMPO');
});