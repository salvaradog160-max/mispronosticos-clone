/**
 * Tests del modulo de mercado (lectura de OddsMath desde el telefono).
 *
 * No tocan red: el HTML se fabrica con el formato REAL de OddsMath
 * (verificado 2026-10-13 contra un partido en vivo de Serie A).
 */
import {
  parseSerie, diagnosticar, lambdaDesdeProb, probSinMargen,
  leerJsonArray, limpiarCacheMercado,
} from '../src/data/mercadoRepository';

// Formato exacto que sirve OddsMath (con la coma final que rompe JSON estricto)
const HTML_REAL = `
var local_dates = {"1":"2026-10-12 10:00:00","2":"2026-10-12 14:00:00",
  "3":"2026-10-12 18:00:00","4":"2026-10-12 22:00:00"};
var all_data = [
  {"label":"O","label_long":"Over 2.5","data":[[1,1.9],[2,1.8],[3,1.7],[4,1.6]],"color":"#72AD05"},
  {"label":"U","label_long":"Under 2.5","data":[[1,2.0],[2,2.05],[3,2.1],[4,2.2]],"color":"#FF0000"},];
var options = { x: 1 };
`;

describe('leerJsonArray', () => {
  it('aguanta la coma final "},]" que JSON estricto rechaza', () => {
    const txt = 'x = [{"a":1,"b":[2,3]},];';
    const r = leerJsonArray(txt, txt.indexOf('x'));
    expect(r).toHaveLength(1);
    expect(r[0].b).toEqual([2, 3]);
  });

  it('devuelve vacio si no hay array', () => {
    expect(leerJsonArray('nada aqui', 0)).toEqual([]);
  });
});

describe('parseSerie', () => {
  it('lee la serie Over/Under del formato real', () => {
    const s = parseSerie(HTML_REAL);
    expect(s.puntos).toHaveLength(4);
    expect(s.puntos[0]).toEqual({ over: 1.9, under: 2.0 });
    // local_dates son UTC
    expect(s.ts[0]).toBe(Date.parse('2026-10-12T10:00:00Z'));
  });

  it('no inventa serie si falta el lado Under', () => {
    const html = `var local_dates = {"1":"2026-10-12 10:00:00"};
                  var all_data = [{"label":"O","data":[[1,1.9]]},];`;
    expect(parseSerie(html).puntos).toHaveLength(0);
  });

  it('ordena los puntos por tiempo aunque vengan desordenados', () => {
    const html = `var local_dates = {"2":"2026-10-12 11:00:00","1":"2026-10-12 10:00:00"};
      var all_data = [{"label":"O","data":[[2,1.8],[1,1.9]]},
                      {"label":"U","data":[[2,2.1],[1,2.0]]},];`;
    const s = parseSerie(html);
    expect(s.ts[0]).toBeLessThan(s.ts[1]);
    expect(s.puntos[0].over).toBe(1.9);
  });
});

describe('probSinMargen', () => {
  it('quita el margen: Over a cuota menor es mas probable', () => {
    expect(probSinMargen(1.8, 2.2)).toBeGreaterThan(0.5);
    expect(Math.abs((probSinMargen(2.0, 2.0) ?? 0) - 0.5)).toBeLessThan(1e-9);
  });

  it('rechaza cuotas invalidas', () => {
    expect(probSinMargen(1, 2)).toBeNull();
    expect(probSinMargen(0.5, 0.9)).toBeNull();
  });
});

describe('lambdaDesdeProb', () => {
  it('resuelve los goles esperados desde la probabilidad de mercado', () => {
    // P(Over 2.5) ~ 53% corresponde a lambda ~2.8 (verificado con Poisson)
    const l = lambdaDesdeProb(0.53, 2.5);
    expect(l).not.toBeNull();
    expect(Math.abs((l ?? 0) - 2.8)).toBeLessThan(0.05);
  });

  it('una linea mas alta exige mas goles para la misma probabilidad', () => {
    expect(lambdaDesdeProb(0.53, 3.5)).toBeGreaterThan(lambdaDesdeProb(0.53, 2.5)!);
  });

  it('devuelve null si la probabilidad no corresponde a una linea real', () => {
    expect(lambdaDesdeProb(0.99, 2.5)).toBeNull();
    expect(lambdaDesdeProb(0.5, NaN)).toBeNull();
  });
});

describe('diagnosticar', () => {
  const serie = (over: number[]) => {
    const puntos = over.map(o => ({ over: o, under: 2.0 }));
    const ahora = Date.now();
    const ts = over.map((_, i) => ahora - (over.length - i) * 2 * 3600e3);
    return { puntos, ts };
  };

  it('marca la direccion del movimiento', () => {
    // Over con cuota cada vez menor = P(Over) subiendo = "hacia Over"
    const { puntos, ts } = serie([2.1, 2.05, 2.0, 1.95, 1.9, 1.85]);
    const d = diagnosticar(puntos, ts, 2.5);
    expect(d).not.toBeNull();
    expect(d?.direccion).toBe('hacia Over');
    expect(d?.delta24hPP).toBeGreaterThan(0);
  });

  it('pocos puntos NO es suficiente (no inventa señal)', () => {
    expect(diagnosticar([{ over: 2, under: 2 }], [Date.now()], 2.5)).toBeNull();
  });

  it('linea plana no se marca como movimiento', () => {
    const { puntos, ts } = serie(Array(12).fill(2.0));
    const d = diagnosticar(puntos, ts, 2.5);
    expect(d?.direccion).toBe('plano');
    expect(d?.veredicto).toBe('plano');
    expect(d?.delta24hPP).toBe(0);
  });
});

describe('limpiarCacheMercado', () => {
  it('existe como funcion (el boton "recargar" la usa)', () => {
    expect(typeof limpiarCacheMercado).toBe('function');
    expect(() => limpiarCacheMercado()).not.toThrow();
  });
});