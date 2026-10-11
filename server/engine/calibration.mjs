/**
 * Calibracion y consistencia, medida sobre historico real.
 *
 * Idea central: el modelo Poisson por si solo es PEOR que el mercado
 * (43.5% vs 52.7% en 5 ligas, 4 temporadas). Lo que si funciona es el
 * punto donde ambos coinciden. Aqui se mide QUE TANTA RAZON tiene cada
 * tipo de pick, usando solo partidos ya jugados.
 *
 * Ningun numero de este modulo es inventado: todo sale de conteos.
 */

/** Normaliza nombres de equipo para poder emparejar entre fuentes. */
/**
 * Busca el tramo de confianza que contiene `probMercado` y devuelve la
 * confianza medida. Igual que la 1X2 pero para O/U y BTTS.
 */
export const lookupBucket = (buckets, probMercado) => {
  if (!buckets || buckets.length === 0) return null;
  const b = buckets.find(x => probMercado >= x.lo && probMercado < x.hi);
  if (!b) return null;
  return {
    confidence: Math.round(b.accuracy * 100),
    stars: Math.max(1, Math.min(5, Math.round(b.accuracy * 5))),
    nMuestra: b.n,
    rango: [Number((b.ci95[0] * 100).toFixed(1)), Number((b.ci95[1] * 100).toFixed(1))],
  };
};

export const normalizeTeam = name =>
  String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|afc|as|ac|ss|us|ud|cd|rc|sc|ca|sv|vfl|vfb|tsg|bsc|1\.?\s*fc)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

/**
 * Agrupa por tipo de consistencia y mide el acierto real de cada grupo.
 *
 * tipo:
 *   'consenso'  -> modelo y mercado coinciden en el lado
 *   'modelo'    -> el modelo escoge algo que el mercado no
 *   'mercado'   -> el mercado escoge algo que el modelo no
 */
export const consistencyGroups = rows => {
  const groups = { consenso: [], modelo: [], mercado: [] };

  for (const row of rows) {
    if (row.modelTop === row.marketTop) {
      if (row.actual === row.modelTop) groups.consenso.push(row);
    } else if (row.modelTop === row.actual) {
      groups.modelo.push(row);
    } else {
      groups.mercado.push(row);
    }
  }
  return groups;
};

/**
 * Acierto empirico de cada grupo. Es la UNICA fuente de verdad para
 * mostrar una confianza en pantalla.
 */
export const measuredAccuracy = rows => {
  if (rows.length === 0) return { n: 0, hits: 0, accuracy: null, ci95: null };
  const hits = rows.filter(r => r.actual === r.modelTop).length;
  const rate = hits / rows.length;
  const se = Math.sqrt((rate * (1 - rate)) / rows.length);
  return {
    n: rows.length,
    hits,
    accuracy: rate,
    ci95: [rate - 1.96 * se, rate + 1.96 * se],
  };
};

/**
 * Calibracion por tramos de probabilidad DEL MERCADO sobre los picks de
 * consenso. Devuelve la probabilidad empirica por tramo, que es la que
 * debe mostrarse en la app en lugar de la probabilidad del modelo.
 */
export const calibrateConsensus = (rows, edges = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 1.01]) => {
  const consensus = rows.filter(r => r.modelTop === r.marketTop);
  const buckets = [];

  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const slice = consensus.filter(r => {
      const p = r.market[r.modelTop];
      return p >= lo && p < hi;
    });
    const m = measuredAccuracy(slice);
    buckets.push({
      lo,
      hi,
      n: m.n,
      accuracy: m.accuracy,
      ci95: m.ci95,
    });
  }
  return buckets;
};

/**
 * Devuelve la confianza medida para un tramo de probabilidad de mercado.
 * Si el tramo no tiene muestra suficiente devuelve null y el llamador
 * NO debe mostrar ese pick.
 */
export const measuredConfidenceFor = (buckets, marketProb) => {
  const bucket = buckets.find(b => marketProb >= b.lo && marketProb < b.hi);
  if (!bucket || bucket.n < 50 || bucket.accuracy === null) return null;
  return {
    confidence: Math.round(bucket.accuracy * 100),
    n: bucket.n,
    ci95: bucket.ci95.map(v => Number((v * 100).toFixed(1))),
    tramo: [bucket.lo, bucket.hi],
  };
};

/**
 * Filtro final de un pick de consenso. Exige muestra suficiente.
 */
export const MIN_SAMPLE = 50;

export const buildConsensusPicks = (upcoming, buckets, { limit = 20 } = {}) => {
  const out = [];

  for (const fixture of upcoming) {
    const prediction = fixture.prediction;
    if (!prediction) continue;

    const entries = Object.entries(prediction.oneXTwo);
    const modelTop = entries.sort((a, b) => b[1] - a[1])[0][0];
    const market = fixture.market;
    if (!market) continue;

    const marketTop = Object.entries(market)
      .filter(([k]) => k !== 'overround')
      .sort((a, b) => b[1] - a[1])[0][0];

    if (modelTop !== marketTop) continue;

    const marketProb = market[modelTop];
    const measured = measuredConfidenceFor(buckets, marketProb);
    if (!measured) continue;

    out.push({
      id: `${fixture.id}-${modelTop}`,
      fixtureId: fixture.id,
      league: fixture.league,
      kickoff: fixture.kickoff,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      market: modelTop === 'H' ? '1X2' : '1X2',
      selection:
        modelTop === 'H' ? `Gana ${fixture.homeTeam}` : modelTop === 'A' ? `Gana ${fixture.awayTeam}` : 'Empate',
      line: undefined,
      odds: fixture.odds ? fixture.odds[modelTop] : null,
      confidence: measured.confidence,
      stars: measured.confidence >= 52 ? 4 : measured.confidence >= 48 ? 3 : 2,
      isSpecial: false,
      isPremium: false,
      probMercado: Number(marketProb.toFixed(3)),
      nMuestra: measured.n,
      rango: measured.ci95,
      createdAt: new Date().toISOString(),
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
};