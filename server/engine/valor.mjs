/**
 * Filtro de valor esperado.
 *
 * Ser "confidente" no es rentable. Con cuota 1.63 necesitas 61.3% para
 * no perder, asi que un pick de 57% acierta a menudo y aun asi pierde
 * plata. El filtro correcto no pregunta cuanto acierta, sino si acierta
 * MAS de lo que la cuota cobra.
 *
 * El margen de 5 puntos sale del backtest: EV+0%, +5% y +10% medidos
 * sobre 9,219 picks de consenso en 5 ligas x 8 temporadas.
 */
import { lookupBucket } from './calibration.mjs';

/** Probabilidad de mercado que paga la cuota. */
export const breakEven = odds => 1 / odds;

/**
 * Cuanto margen tiene el pick sobre lo que cuesta.
 * Positivo = el modelo cree que vale mas de lo que paga el mercado.
 */
export const margen = (confidence, odds) => confidence - breakEven(odds);

/** Filtro de produccion: EV+5pp. El unico que dio dinero en el backtest. */
export const MARGEN_MINIMO = 0.05;

export const esRentable = (confidence, odds, margenMinimo = MARGEN_MINIMO) => {
  if (!odds || odds <= 1) return false;
  return margen(confidence, odds) >= margenMinimo;
};

/**
 * Calcula el valor esperado de un pick.
 * @returns {{roiUnit: number, margen: number, breakEven: number, rentable: boolean}}
 */
export const evaluarPick = (confidence, odds, margenMinimo = MARGEN_MINIMO) => {
  if (!odds || odds <= 1) {
    return { roiUnit: null, margen: null, breakEven: null, rentable: false };
  }
  const be = breakEven(odds);
  // ROI por unidad apostada: si acierta, gana (cuota-1); si falla, -1.
  const roiUnit = confidence * (odds - 1) - (1 - confidence);
  return {
    roiUnit,
    margen: confidence - be,
    breakEven: be,
    rentable: margen(confidence, odds) >= margenMinimo,
  };
};

/**
 * Anota una lista de picks con su metricas de valor esperado y separa
 * los que no son rentables.
 */
export const anotarValor = (picks, margenMinimo = MARGEN_MINIMO) => {
  const rented = [];
  const descartados = [];

  for (const p of picks) {
    const ev = evaluarPick(p.confidence / 100, p.odds, margenMinimo);
    const anotado = { ...p, ...ev };
    if (ev.rentable) rented.push(anotado);
    else descartados.push({ ...p, ...ev });
  }

  return { rented, descartados };
};

export { lookupBucket };
/**
 * `good_to_line`: a que precio vuelve a valer un pick.
 *
 * Idea tomada de un sistema de betting ajeno: cuando la linea se mueve
 * en contra y el pick deja de cumplir su umbral, no basta con avisar
 * "ya no es rentable". Lo util es decir a que precio vuelve a servir.
 *
 * @param confianza  0..1, lo que mide la calibracion para ese tramo
 * @param probActual 0..1, probabilidad de mercado de ese lado ahora
 * @param margenMinimo margen exigido sobre el break-even
 * @returns {{ejecutable, probActual, necesita, cuotaNecesaria, cuotaActual}}
 */
export const goodToLine = (confianza, probActual, margenMinimo = MARGEN_MINIMO) => {
  const ejecutable = margen(confianza, probActual) >= margenMinimo;
  if (ejecutable) {
    return { ejecutable: true, probActual, necesita: null, cuotaNecesaria: null, cuotaActual: 1 / probActual };
  }
  // La probabilidad de mercado tiene que BAJAR hasta que el margen alcance
  // el minimo. Si nunca alcanza, no hay buen precio: se descarta.
  const necesita = confianza - margenMinimo;
  if (necesita <= 0 || necesita >= 1) {
    return { ejecutable: false, probActual, necesita: null, cuotaNecesaria: null, cuotaActual: 1 / probActual, inalcanzable: true };
  }
  return {
    ejecutable: false,
    probActual,
    necesita,
    cuotaNecesaria: 1 / necesita,
    cuotaActual: 1 / probActual,
  };
};
