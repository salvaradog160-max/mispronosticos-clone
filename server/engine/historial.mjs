/**
 * Motor de historial real para el analisis combinado.
 *
 * Sustituye los cuadros que la herramienta manual pedia capturar
 * (Ultimos 5 General / L-V / H2H con cada GF/GC) por calculo directo
 * sobre la historia descargada (football-data Europa + espn-historia
 * America). El usuario no captura nada: la estadistica sale de los
 * partidos reales disponibles.
 *
 * Pesos de la combinada (igual que la herramienta manual):
 *   50% modelo Poisson  30% cuadro base (ult.5 L/V)  20% H2H L/V
 * Si falta una fuente, su peso se reparte entre las que existen.
 *
 * Riesgo: bajo >=75%, medio >=60%, y sube un nivel si el modelo y el
 * historial difieren 25 pp o mas en el lado recomendado.
 */

/** Desviacion estandar muestral. */
const desvEst = values => {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const varianza = values.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(varianza);
};

const mediana = values => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Estadistica de un bloque de partidos: gol a favor/contra. */
const metricasGoles = partidos => {
  const gf = partidos.map(p => p.gf);
  const gc = partidos.map(p => p.gc);
  const prom = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const ge1 = arr => arr.filter(v => v >= 1).length / (arr.length || 1);
  return {
    n: partidos.length,
    gfProm: Number(prom(gf).toFixed(2)),
    gcProm: Number(prom(gc).toFixed(2)),
    gfMed: Number(mediana(gf).toFixed(2)),
    gcMed: Number(mediana(gc).toFixed(2)),
    gfDe: Number(desvEst(gf).toFixed(2)),
    gcDe: Number(desvEst(gc).toFixed(2)),
    gfGe1: Number((ge1(gf) * 100).toFixed(0)),
    gcGe1: Number((ge1(gc) * 100).toFixed(0)),
  };
};

/** Muestra un partido desde la perspectiva de un equipo. */
const desdeEquipo = (p, equipo) => {
  const local = p.homeNorm === equipo;
  const visita = p.awayNorm === equipo;
  if (!local && !visita) return null;
  const res =
    p.homeScore > p.awayScore ? (local ? 'G' : 'P') : p.homeScore < p.awayScore ? (local ? 'P' : 'G') : 'E';
  return {
    res,
    gf: local ? p.homeScore : p.awayScore,
    gc: local ? p.awayScore : p.homeScore,
    fecha: p.utcDate,
    key: p.key,
    local,
    rival: local ? p.awayTeam : p.homeTeam,
  };
};

/** Ultimos `n` partidos de un equipo (G general; enCasa separa L/V). */
const ultimosDe = (partidos, equipo, { n = 5, enCasa = null } = {}) => {
  const filtrados = partidos
    .map(p => desdeEquipo(p, equipo))
    .filter(p => p && (enCasa === null || p.local === enCasa))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)))
    .slice(0, n);
  return filtrados.map(p => ({ gf: p.gf, gc: p.gc, res: p.res, fecha: p.fecha }));
};

/** Prs de 1X2 desde resultados (G/E/P): proporcion de partidos. */
const probs1x2de = filas => {
  if (!filas.length) return null;
  const G = filas.filter(f => f.res === 'G').length;
  const E = filas.filter(f => f.res === 'E').length;
  const P = filas.filter(f => f.res === 'P').length;
  const total = filas.length;
  const g = (G + E * 0.5) / total; // el empate reparte: medio punto
  return {
    H: G / total,
    D: E / total,
    A: P / total,
  };
};

/** Tendencias O/U y AA de un conjunto de partidos. Acepta las filas de
 * equipo {gf, gc} (perspectiva de un equipo) o las crudas
 * {gfLocal, gfVisita}: ambas se normalizan a {local, visita}. */
const tendenciasDe = (partidos, lineas = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]) => {
  if (!partidos?.length) return null;
  const norm = partidos.map(p => ({
    goles: (p.goles ?? (p.gf ?? 0) + (p.gc ?? 0)),
    local: (p.gfLocal ?? p.gf ?? 0),
    visita: (p.gfVisita ?? p.gc ?? 0),
  })).filter(p => Number.isFinite(p.local) && Number.isFinite(p.visita));
  if (!norm.length) return null;
  const n = norm.length;
  const ou = lineas.map(linea => {
    const over = norm.filter(p => p.goles > linea).length / n;
    const exacto = Number.isInteger(linea) ? norm.filter(p => p.goles === linea).length / n : 0;
    return {
      linea,
      over: Number((over * 100).toFixed(0)),
      dev: Number((exacto * 100).toFixed(0)),
    };
  });
  const aa = norm.filter(p => p.local >= 1 && p.visita >= 1).length / n;
  return { ou, aa: Number((aa * 100).toFixed(0)), n };
};

/** Puntos (W=3,E=1,P=0) y pts por partido de una serie (perspectiva equipo). */
const puntosDe = filas => {
  if (!filas.length) return null;
  const pts = filas.reduce((s, f) => s + (f.res === 'G' ? 3 : f.res === 'E' ? 1 : 0), 0);
  return { pts, porPartido: Number((pts / filas.length).toFixed(2)), n: filas.length };
};

/**
 * Patrones de una serie: rachas y lo que el equipo hizo seguido.
 * Las series vienen del mas reciente al mas antiguo.
 */
const patronesDe = (filas, equipo) => {
  const out = [];
  if (filas.length < 2) return out;
  const en = (i, res) => filas[i]?.res === res;

  // Rachas desde el mas reciente
  let racha = 1;
  for (let i = 1; i < filas.length && filas[i].res === filas[0].res; i++) racha++;
  const nRacha = racha;
  const suf = nRacha >= 3 ? ` (${nRacha} seguidos)` : '';
  if (filas[0].res === 'G' && nRacha >= 2) out.push(`${equipo}: ${nRacha} victorias seguidas`);
  if (filas[0].res === 'P' && nRacha >= 2) out.push(`${equipo}: ${nRacha} derrotas seguidas`);

  // Sin perder / sin ganar
  const vistos = filas.slice(0, 5);
  if (!vistos.some(f => f.res === 'P')) out.push(`${equipo}: ${vistos.length} sin perder`);
  if (!vistos.some(f => f.res === 'G')) out.push(`${equipo}: ${vistos.length} sin ganar`);

  // Anoto / recibio / ambos
  if (filas.slice(0, 3).every(f => f.gf >= 1)) out.push(`${equipo}: anotó en sus últimos ${Math.min(3, filas.length)}`);
  if (filas.slice(0, 3).every(f => f.gc >= 1)) out.push(`${equipo}: recibió gol en sus últimos ${Math.min(3, filas.length)}`);
  if (filas.slice(0, 2).every(f => f.gf >= 1 && f.gc >= 1)) out.push(`${equipo}: ambos anotaron en sus últimos ${Math.min(2, filas.length)}`);

  // Momento: ultimos 2 vs anteriores (goles a favor)
  if (filas.length >= 4) {
    const reciente = filas.slice(0, 2);
    const previo = filas.slice(2);
    const mR = reciente.reduce((s, f) => s + f.gf, 0) / 2;
    const mP = previo.reduce((s, f) => s + f.gf, 0) / previo.length;
    if (mR >= mP + 1) out.push(`Goles a favor al alza: ${mR.toFixed(1)} por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
    else if (mP >= mR + 1) out.push(`Goles a favor a la baja: ${mR.toFixed(1)} por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
  }
  return out;
};

/** Racha de un equipo en su contexto (para la vista de patrones). */
const rachaDe = filas => {
  if (!filas.length) return null;
  let n = 1;
  for (let i = 1; i < filas.length && filas[i].res === filas[0].res; i++) n++;
  const nombre = { G: 'sin perder', P: 'ganó', E: 'sin ganar' };
  return `${n} ${n === 1 ? nombre[filas[0].res] : nombre[filas[0].res] === 'ganó' ? `victorias seguidas` : `partidos ${filas[0].res === 'G' ? 'sin perder' : 'sin ganar'}`}`;
};

/** Combina modelo + base + H2H con pesos o reparto si falta fuente. */
export const combinar = (pModelo, pBase, pH2H, { wM = 0.5, wB = 0.3, wH = 0.2 } = {}) => {
  const lados = ['H', 'D', 'A'];
  let usadoM = 0, usadoB = 0, usadoH = 0;
  if (pModelo) usadoM = wM;
  if (pBase) usadoB = wB;
  if (pH2H) usadoH = wH;
  const totalPeso = usadoM + usadoB + usadoH;

  const pComb = {};
  for (const lado of lados) {
    let acc = 0;
    if (pModelo) acc += wM * pModelo[lado];
    if (pBase) acc += wB * pBase[lado];
    if (pH2H) acc += wH * pH2H[lado];
    pComb[lado] = totalPeso > 0 ? acc / totalPeso : 0;
  }
  const usados = [];
  if (pModelo) usados.push('modelo');
  if (pBase) usados.push('base');
  if (pH2H) usados.push('h2h');
  return { pComb, usados };
};

/** Riesgo de una apuesta por su prob y la dispersion modelo-historial. */
export const riesgoDe = (p, pModeloVal = null, pBaseVal = null) => {
  const prob = Number(p) || 0;
  let nivel = prob >= 0.75 ? 'bajo' : prob >= 0.6 ? 'medio' : 'alto';
  if (pModeloVal != null && pBaseVal != null) {
    const dif = Math.abs(pModeloVal - pBaseVal) * 100;
    if (dif >= 25) nivel = nivel === 'bajo' ? 'medio' : 'alto';
  }
  return nivel;
};

/** Cuota justa = lo minimo que deberia pagar la casa (1 / prob). */
export const cuotaJusta = p => (p > 0 ? Number((1 / p).toFixed(2)) : null);

/**
 * Pronosticos ordenados por probabilidad. Mercados que se pueden
 * comparar con modelo e historial sin inventar.
 */
export const pronosticos = ({ pComb, pModelo, pBase }) => {
  const out = [];
  const ladoNombre = { H: 'Gana local', D: 'Empate', A: 'Gana visita' };
  for (const lado of ['H', 'D', 'A']) {
    out.push({
      tipo: lado === 'H' ? '1' : lado === 'D' ? 'X' : '2',
      nombre: ladoNombre[lado],
      p: pComb[lado] ?? 0,
      riesgo: riesgoDe(pComb[lado] ?? 0, pModelo?.[lado] ?? null, pBase?.[lado] ?? null),
      cuotaJusta: cuotaJusta(pComb[lado] ?? 0),
    });
  }
  // 1X = H + D con cuota justa 1/(pH+pD). El riesgo se calcula sobre la
  // prob COMBINADA del mercado (84%, no la del lado H solo): esa es la
  // regla de la herramienta manual.
  const pHm = pModelo ? pModelo.H + pModelo.D : null;
  const pBm = pBase ? pBase.H + pBase.D : null;
  const p1x = (pComb.H ?? 0) + (pComb.D ?? 0);
  out.push({ tipo: '1X', nombre: 'Local o empate', p: p1x, riesgo: riesgoDe(p1x, pHm, pBm), cuotaJusta: cuotaJusta(p1x) });
  const pAhm = pModelo ? pModelo.A + pModelo.D : null;
  const pAhmB = pBase ? pBase.A + pBase.D : null;
  const p2x = (pComb.A ?? 0) + (pComb.D ?? 0);
  out.push({ tipo: 'X2', nombre: 'Visita o empate', p: p2x, riesgo: riesgoDe(p2x, pAhm, pAhmB), cuotaJusta: cuotaJusta(p2x) });

  // Over/Under y AA salen del historial real; a falta de modelo de goles
  // para el mismo mercado se usa el historial como fuente unica.
  return out.sort((a, b) => b.p - a.p);
};

/**
 * Motor completo. `history` = partidos crudos (football-data + america),
 * `home/away` = nombres normalizados. Devuelve cuadros, probs, combinada,
 * riesgo, pronosticos y tendencias; null si no hay suficiente historia.
 */
export const historialDe = (history, homeRaw, awayRaw, { limite = 5 } = {}) => {
  if (!history?.length) return null;
  const norm = n => String(n).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|afc|as|ac|ss|us|ud|cd|rc|sc|ca|sv|vfl|vfb|tsg|bsc|1\.?\s*fc)\b/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
  const home = norm(homeRaw);
  const away = norm(awayRaw);

  // utcDate llega en DD/MM/YYYY (football-data) o ISO (espn-historia).
  // Se pasa a una clave YYYYMMDD para ordenar bien en las dos fuentes.
  const claveFecha = d => {
    if (typeof d !== 'string') return '00000000';
    const iso = /^\d{4}-\d{2}-\d{2}/.exec(d);
    if (iso) return iso[0].replace(/-/g, '');
    const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d);
    return dm ? `${dm[3]}${dm[2].padStart(2, '0')}${dm[1].padStart(2, '0')}` : '00000000';
  };

  const partidos = history.map(p => ({
    homeTeam: p.homeTeam,
    awayTeam: p.awayTeam,
    homeNorm: norm(p.homeTeam),
    awayNorm: norm(p.awayTeam),
    homeScore: p.homeScore,
    awayScore: p.awayScore,
    utcDate: p.utcDate,
    key: claveFecha(p.utcDate),
    goles: (p.homeScore ?? 0) + (p.awayScore ?? 0),
    gfLocal: p.homeScore ?? 0,
    gfVisita: p.awayScore ?? 0,
  })).filter(p => Number.isFinite(p.homeScore) && Number.isFinite(p.awayScore));

  // Cuadros
  const cuadroGeneralL = ultimosDe(partidos, home, { n: limite });
  const cuadroGeneralV = ultimosDe(partidos, away, { n: limite });
  const cuadroLocalCasa = ultimosDe(partidos, home, { n: limite, enCasa: true });
  const cuadroVisitaFuera = ultimosDe(partidos, away, { n: limite, enCasa: false });

  // H2H directo (solo enfrentamientos entre ambos)
  const h2h = partidos
    .filter(p => (p.homeNorm === home && p.awayNorm === away) ||
                  (p.homeNorm === away && p.awayNorm === home))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)))
    .slice(0, limite);
  const h2hLocalVisto = h2h.map(p =>
    p.homeNorm === home
      ? { gf: p.homeScore, gc: p.awayScore, res: p.homeScore > p.awayScore ? 'G' : p.homeScore < p.awayScore ? 'P' : 'E' }
      : { gf: p.awayScore, gc: p.homeScore, res: p.awayScore > p.homeScore ? 'G' : p.awayScore < p.homeScore ? 'P' : 'E' });

  const pBase = probs1x2de([...cuadroLocalCasa, ...cuadroVisitaFuera]);
  const pH2H = probs1x2de(h2hLocalVisto);
  const pGeneral = probs1x2de([...cuadroGeneralL, ...cuadroGeneralV]);

  // Puntos y rachas
  const ptsLocalCasa = puntosDe(cuadroLocalCasa);
  const ptsLocalGral = puntosDe(cuadroGeneralL);
  const ptsVisitaFuera = puntosDe(cuadroVisitaFuera);
  const ptsVisitaGral = puntosDe(cuadroGeneralV);

  // H2H en df goles por partido (desde el local)
  const h2hLocalReal = h2h.filter(p => p.homeNorm === home);
  const h2hVisitaReal = h2h.filter(p => p.awayNorm === home);

  return {
    home: homeRaw,
    away: awayRaw,
    cuadros: {
      generalLocal: metricasGoles(cuadroGeneralL),
      generalVisita: metricasGoles(cuadroGeneralV),
      localCasa: metricasGoles(cuadroLocalCasa),
      visitaFuera: metricasGoles(cuadroVisitaFuera),
      h2h: metricasGoles(h2hLocalVisto),
    },
    puntos: {
      localCasa: ptsLocalCasa,
      localGral: ptsLocalGral,
      visitaFuera: ptsVisitaFuera,
      visitaGral: ptsVisitaGral,
    },
    probs: { pBase, pH2H, pGeneral },
    patrones: {
      generalLocal: patronesDe(cuadroGeneralL, homeRaw),
      generalVisita: patronesDe(cuadroGeneralV, awayRaw),
      localCasa: patronesDe(cuadroLocalCasa, `${homeRaw} en casa`),
      visitaFuera: patronesDe(cuadroVisitaFuera, `${awayRaw} fuera`),
      h2h: patronesDe(h2hLocalVisto, 'H2H'),
    },
    pesoEstadio: {
      local: {
        casa: ptsLocalCasa?.porPartido ?? null,
        general: ptsLocalGral?.porPartido ?? null,
        dif: ptsLocalCasa && ptsLocalGral ? Number((ptsLocalCasa.porPartido - ptsLocalGral.porPartido).toFixed(2)) : null,
      },
      visita: {
        fuera: ptsVisitaFuera?.porPartido ?? null,
        general: ptsVisitaGral?.porPartido ?? null,
        dif: ptsVisitaFuera && ptsVisitaGral ? Number((ptsVisitaFuera.porPartido - ptsVisitaGral.porPartido).toFixed(2)) : null,
      },
    },
    serieH2H: h2hLocalVisto.slice(0, 5).map(f => f.res),
    h2hPartidos: h2h.length,
    tendencias: {
      general: tendenciasDe([...cuadroGeneralL, ...cuadroGeneralV]),
      lv: tendenciasDe([...cuadroLocalCasa, ...cuadroVisitaFuera]),
      h2h: tendenciasDe(h2h),
    },
  };
};