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
    season: p.season ?? null,
    local,
    rival: local ? p.awayTeam : p.homeTeam,
  };
};

/**
 * Partidos de un equipo. G general, enCasa separa L/V, season filtra a
 * una temporada concreta. Si de define season se devuelven TODOS los de
 * esa temporada (la ventana es la temporada vigente, no un tope fijo).
 */
const partidosDe = (partidos, equipo, { enCasa = null, season = null } = {}) => {
  const filtrados = partidos
    .map(p => desdeEquipo(p, equipo))
    .filter(p => p && (enCasa === null || p.local === enCasa) && (season === null || String(p.season ?? '') === String(season)))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)));
  return filtrados;
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
 * Patrones de una serie: rachas, forma (puntos), goles y el contexto
 * local/fuera cuando llega. Las series vienen del mas reciente al mas
 * antiguo. Cuanto mas filas, mas patrones finos se pueden ver.
 */
const patronesDe = (filas, equipo, { enCasa = null } = {}) => {
  const out = [];
  if (filas.length < 2) return out;
  const en = (i, res) => filas[i]?.res === res;
  // "en casa" se lee del primer partido de la serie: describe el equipo
  // analizado en la serie que recibio (general, L/V, H2H...).
  const contexto = enCasa === true ? ' en casa' : enCasa === false ? ' fuera' : '';

  // Rachas desde el mas reciente
  let racha = 1;
  for (let i = 1; i < filas.length && filas[i].res === filas[0].res; i++) racha++;
  const nRacha = racha;
  const suf = nRacha >= 3 ? ` (${nRacha} seguidos)` : '';
  if (filas[0].res === 'G' && nRacha >= 2) out.push(`${equipo}${contexto}: ${nRacha} victorias seguidas`);
  if (filas[0].res === 'P' && nRacha >= 2) out.push(`${equipo}${contexto}: ${nRacha} derrotas seguidas`);

  // Sin perder / sin ganar
  const vistos = filas.slice(0, 5);
  if (!vistos.some(f => f.res === 'P')) out.push(`${equipo}${contexto}: ${vistos.length} sin perder`);
  if (!vistos.some(f => f.res === 'G')) out.push(`${equipo}${contexto}: ${vistos.length} sin ganar`);

  // Rompe racha: el ultimo cambio el signo del anterior (G tras varias P, etc.)
  const ultimo = filas[0].res;
  const prev = filas[1].res;
  if (ultimo !== prev) {
    const desc = { G: 'ganó', P: 'perdió', E: 'empató' }[ultimo];
    // cuenta racha previa del signo contrario
    let nPrev = 1;
    for (let i = 1; i < filas.length && filas[i].res === prev; i++) nPrev++;
    if (nPrev >= 3 && (ultimo === 'G')) out.push(`${equipo}${contexto}: ganó el último tras ${nPrev} sin ganar`);
    if (nPrev >= 3 && (ultimo === 'P')) out.push(`${equipo}${contexto}: perdió el último tras ${nPrev} sin perder`);
  }

  // Anoto / recibio / ambos
  if (filas.slice(0, 3).every(f => f.gf >= 1)) out.push(`${equipo}${contexto}: anotó en sus últimos ${Math.min(3, filas.length)}`);
  if (filas.slice(0, 3).every(f => f.gc >= 1)) out.push(`${equipo}${contexto}: recibió gol en sus últimos ${Math.min(3, filas.length)}`);
  if (filas.slice(0, 2).every(f => f.gf >= 1 && f.gc >= 1)) out.push(`${equipo}${contexto}: ambos anotaron en sus últimos ${Math.min(2, filas.length)}`);

  // Momento goles a favor: ultimos 2 vs anteriores
  if (filas.length >= 4) {
    const reciente = filas.slice(0, 2);
    const previo = filas.slice(2);
    const mR = reciente.reduce((s, f) => s + f.gf, 0) / 2;
    const mP = previo.reduce((s, f) => s + f.gf, 0) / previo.length;
    if (mR >= mP + 1) out.push(`${equipo}${contexto}: goles a favor al alza, ${mR.toFixed(1)} por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
    else if (mP >= mR + 1) out.push(`${equipo}${contexto}: goles a favor a la baja, ${mR.toFixed(1)} por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
  }

  // Momento goles en contra (recibe menos/mas)
  if (filas.length >= 4) {
    const reciente = filas.slice(0, 2);
    const previo = filas.slice(2);
    const mR = reciente.reduce((s, f) => s + f.gc, 0) / 2;
    const mP = previo.reduce((s, f) => s + f.gc, 0) / previo.length;
    if (mP >= mR + 1) out.push(`${equipo}${contexto}: recibe menos, ${mR.toFixed(1)} por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
    else if (mR >= mP + 1) out.push(`${equipo}${contexto}: recibe más, ${mR.toFixed(1)} por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
  }

  // Forma por puntos (3/1/0): ultimos 2 vs anteriores
  if (filas.length >= 4) {
    const pts = f => (f.res === 'G' ? 3 : f.res === 'E' ? 1 : 0);
    const reciente = filas.slice(0, 2);
    const previo = filas.slice(2);
    const mR = reciente.reduce((s, f) => s + pts(f), 0) / 2;
    const mP = previo.reduce((s, f) => s + pts(f), 0) / previo.length;
    if (mR >= mP + 0.5) out.push(`${equipo}${contexto}: forma al alza, ${mR.toFixed(1)} pts por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
    else if (mP >= mR + 0.5) out.push(`${equipo}${contexto}: forma a la baja, ${mR.toFixed(1)} pts por partido en los últimos 2 contra ${mP.toFixed(1)} antes`);
  }

  // Goles concentrados: la desviacion supera el promedio (goles en pocos partidos)
  if (filas.length >= 4) {
    const gfs = filas.map(f => f.gf);
    const prom = gfs.reduce((s, v) => s + v, 0) / gfs.length;
    const de = Math.sqrt(gfs.reduce((s, v) => s + (v - prom) ** 2, 0) / gfs.length);
    if (prom > 0 && de > prom * 1.25)
      out.push(`${equipo}${contexto}: goles concentrados, la desviación (${de.toFixed(2)}) supera el promedio (${prom.toFixed(2)})`);
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
 *
 * Ademas del 1X2 (combinada 50/30/20), acepta el modelo Poisson de
 * goles (`golesModelo`: {over1_5, over2_5, over3_5, btts}) y las
 * tendencias reales del historial (`tendHist`: {overPct por linea,
 * aa}) para generar los mercados O/U y Ambos anotan combinados, como
 * la herramienta manual.
 */
export const pronosticos = ({ pComb, pModelo, pBase, golesModelo, tendHist }) => {
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

  // Over/Under y AA combinados (50/50 modelo Poisson vs historial),
  // siguiendo la herramienta manual: "Modelo X% · Historial Y%".
  const lineas = [1.5, 2.5, 3.5, 4.5];
  const f = (side, tipo, nombre, pModeloGol, pHist) => {
    if (pModeloGol == null && pHist == null) return;
    const pM = pModeloGol ?? 0.5;
    const pH = pHist == null ? pModeloGol : pHist / 100;
    // 50/50; si falta una fuente se usa la otra
    const usado = pHist == null ? 1 : pModeloGol == null ? 1 : 2;
    const p = pHist == null || pModeloGol == null ? Math.max(pM, pH) : (pM + pH) / 2;
    out.push({
      tipo,
      nombre,
      p,
      riesgo: riesgoDe(p, pModeloGol ?? null, pHist == null ? null : pHist),
      cuotaJusta: cuotaJusta(p),
      modelo: pModeloGol == null ? null : Number(pModeloGol.toFixed(4)),
      historial: pHist == null ? null : Number((pHist / 100).toFixed(4)),
      fuente: usado,
    });
  };

  for (const linea of lineas) {
    const key = `over${String(linea).replace('.', '_')}`;
    const pM = golesModelo?.[key] ?? (linea === 2.5 ? golesModelo?.over25 : null);
    const pH = tendHist?.ou?.find(o => o.linea === linea)?.over ?? null;
    f('over', `O${linea}`, `Más de ${linea} goles`, pM, pH);
  }

  const aaM = golesModelo?.btts ?? null;
  const aaH = tendHist?.aa ?? null;
  f('aa', 'AA', 'Ambos anotan: Sí', aaM, aaH);

  return out.sort((a, b) => b.p - a.p);
};

/**
 * Motor completo. `history` = partidos crudos (football-data + america),
 * `home/away` = nombres normalizados. Devuelve cuadros, probs, combinada,
 * riesgo, pronosticos y tendencias; null si no hay suficiente historia.
 */
export const historialDe = (history, homeRaw, awayRaw) => {
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
    season: p.season ?? null,
  })).filter(p => Number.isFinite(p.homeScore) && Number.isFinite(p.awayScore));

  // La temporada vigente de cada equipo es la mas reciente en la que
  // jugo dentro de la base. General / Local-en-casa / Visita-fuera se
  // calculan SOLO con esa temporada (todos sus partidos, sin tope); el
  // H2H usa el historial completo de enfrentamientos directos.
  const temporadaVigenteDe = equipo => {
    const seasons = partidos
      .filter(p => p.homeNorm === equipo || p.awayNorm === equipo)
      .map(p => String(p.season ?? ''))
      .filter(Boolean);
    if (!seasons.length) return null;
    return seasons.sort().pop();
  };
  const tempHome = temporadaVigenteDe(home);
  const tempAway = temporadaVigenteDe(away);

  const cuadroGeneralL = partidosDe(partidos, home, { season: tempHome });
  const cuadroGeneralV = partidosDe(partidos, away, { season: tempAway });
  const cuadroLocalCasa = partidosDe(partidos, home, { enCasa: true, season: tempHome });
  const cuadroVisitaFuera = partidosDe(partidos, away, { enCasa: false, season: tempAway });

  // H2H directo: historial COMPLETO de enfrentamientos directos (todas
  // las temporadas en la base), dividido en: todos, y los que el local
  // jugo en su cancha. Se leen desde la perspectiva del local.
  const h2h = partidos
    .filter(p => (p.homeNorm === home && p.awayNorm === away) ||
                  (p.homeNorm === away && p.awayNorm === home))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)));
  const leerDesdeLocal = p =>
    p.homeNorm === home
      ? { gf: p.homeScore, gc: p.awayScore, res: p.homeScore > p.awayScore ? 'G' : p.homeScore < p.awayScore ? 'P' : 'E' }
      : { gf: p.awayScore, gc: p.homeScore, res: p.awayScore > p.homeScore ? 'G' : p.awayScore < p.homeScore ? 'P' : 'E' };
  const h2hLocalVisto = h2h.map(leerDesdeLocal);
  const h2hCasaVisto = h2h.filter(p => p.homeNorm === home).map(leerDesdeLocal);

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
    temporadaVigente: { local: tempHome, visita: tempAway },
    cuadros: {
      generalLocal: metricasGoles(cuadroGeneralL),
      generalVisita: metricasGoles(cuadroGeneralV),
      localCasa: metricasGoles(cuadroLocalCasa),
      visitaFuera: metricasGoles(cuadroVisitaFuera),
      h2h: metricasGoles(h2hLocalVisto),
      h2hCasa: metricasGoles(h2hCasaVisto),
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
      localCasa: patronesDe(cuadroLocalCasa, `${homeRaw}`, { enCasa: true }),
      visitaFuera: patronesDe(cuadroVisitaFuera, `${awayRaw}`, { enCasa: false }),
      h2h: patronesDe(h2hLocalVisto, 'H2H'),
      h2hCasa: patronesDe(h2hCasaVisto, 'H2H', { enCasa: true }),
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
    serieH2H: h2hLocalVisto.slice(0, 6).map(f => f.res),
    serieH2HCasa: h2hCasaVisto.slice(0, 6).map(f => f.res),
    h2hPartidos: h2h.length,
    h2hCasaPartidos: h2hCasaVisto.length,
    tendencias: {
      general: tendenciasDe([...cuadroGeneralL, ...cuadroGeneralV]),
      lv: tendenciasDe([...cuadroLocalCasa, ...cuadroVisitaFuera]),
      h2h: tendenciasDe(h2h.map(p => ({ gfLocal: p.homeScore, gfVisita: p.awayScore }))),
    },
  };
};