/**
 * Comparacion apertura vs cierre.
 *
 * La app genera picks con la ULTIMA cotizacion disponible (ESPN), que
 * cae entre la apertura y el cierre. Calibrar solo con el cierre (lo que
 * hacia antes) aplica a esos picks una tabla medida en otro momento del
 * mercado.
 *
 * Aqui se miden las dos tablas y, sobre todo, CUANTO se mueve la linea,
 * para saber si la diferencia importa o es ruido.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUES_HISTORIA } from '../config/ligas.mjs';
import { fetchHistory, impliedProbs } from '../providers/footballdata.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';
import { normalizeTeam } from '../engine/calibration.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEAGUES = LEAGUES_HISTORIA;
const SEASONS = 8;
const EDGES = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 1.01];

const parseDate = raw => {
  const [d, m, y] = String(raw).split('/');
  return `${y}-${m}-${d}`;
};

const bucketsFrom = (rows, key) => {
  const consensus = rows.filter(r => r.modelTop === r[`${key}Top`]);
  const out = [];
  for (let i = 0; i < EDGES.length - 1; i++) {
    const lo = EDGES[i];
    const hi = EDGES[i + 1];
    const slice = consensus.filter(r => {
      const p = r[key][r.modelTop];
      return p >= lo && p < hi;
    });
    if (slice.length === 0) continue;
    const hits = slice.filter(r => r.actual === r.modelTop).length;
    const rate = hits / slice.length;
    const se = Math.sqrt((rate * (1 - rate)) / slice.length);
    out.push({ lo, hi, n: slice.length, accuracy: rate, ci95: [rate - 1.96 * se, rate + 1.96 * se] });
  }
  return { buckets: out, n: consensus.length, acierto: consensus.length ? consensus.filter(r => r.actual === r.modelTop).length / consensus.length : null };
};

console.log('[recal] descargando historia...');
const history = (await fetchHistory(LEAGUES, SEASONS))
  .filter(m => m.odds?.H && m.odds?.D && m.odds?.A)
  .sort((a, b) => parseDate(a.utcDate) - parseDate(b.utcDate));
console.log(`[recal] ${history.length} partidos con cuota`);

const rows = [];
for (let i = 300; i < history.length; i++) {
  const fx = history[i];
  const ratings = buildRatings(history.slice(0, i));
  const prediction = predictMatch(ratings, fx);
  if (!prediction.known) continue;

  const close = impliedProbs(fx.odds);
  const open = fx.oddsOpen?.H && fx.oddsOpen?.D && fx.oddsOpen?.A ? impliedProbs(fx.oddsOpen) : null;
  if (!close || !open) continue;

  const modelTop = Object.entries(prediction.oneXTwo).sort((a, b) => b[1] - a[1])[0][0];
  const topOf = m => Object.entries(m).filter(([k]) => k !== 'overround').sort((a, b) => b[1] - a[1])[0][0];

  rows.push({
    model: prediction.oneXTwo,
    close,
    open,
    modelTop,
    closeTop: topOf(close),
    openTop: topOf(open),
    actual: fx.homeScore > fx.awayScore ? 'H' : fx.homeScore === fx.awayScore ? 'D' : 'A',
  });
}
console.log(`[recal] ${rows.length} partidos evaluados`);

// ------------------------------------------------------------------ deriva
const drifts = rows.map(r => Math.abs(r.close[r.modelTop] - r.open[r.modelTop])).sort((a, b) => a - b);
const q = p => drifts[Math.floor(drifts.length * p)];
const drift = {
  media: drifts.reduce((a, b) => a + b, 0) / drifts.length,
  mediana: q(0.5),
  p75: q(0.75),
  p90: q(0.9),
};

// Cuantos cambios de favorito entre apertura y cierre
let cambios = 0;
for (const r of rows) if (r.openTop !== r.closeTop) cambios++;

const apertura = bucketsFrom(rows, 'open');
const cierre = bucketsFrom(rows, 'close');

const payload = {
  generado: new Date().toISOString(),
  partidos: rows.length,
  deriva: { ...drift, cambiosFavorito: cambios, pctCambioFavorito: cambios / rows.length },
  apertura,
  cierre,
};
await writeFile(join(ROOT, 'data', 'calibration-ab.json'), JSON.stringify(payload, null, 2));

const pct = v => (v === null ? 'n/d' : `${(v * 100).toFixed(1)}%`);

console.log('\n=== DERIVA DE LA LINEA (prob. del favorito) ===');
console.log(`  media      ${(drift.media * 100).toFixed(1)} pp`);
console.log(`  mediana    ${(drift.mediana * 100).toFixed(1)} pp`);
console.log(`  p75        ${(drift.p75 * 100).toFixed(1)} pp`);
console.log(`  p90        ${(drift.p90 * 100).toFixed(1)} pp`);
console.log(`  cambio de favorito  ${cambios}/${rows.length} (${pct(cambios / rows.length)})`);

console.log('\n=== ACIERTO DEL CONSENSO ===');
console.log(`  apertura (n=${apertura.n}): ${pct(apertura.acierto)}`);
console.log(`  cierre  (n=${cierre.n}): ${pct(cierre.acierto)}`);

console.log('\n=== TABLA: apertura vs cierre ===');
console.log('  tramo        apertura              cierre');
const n = Math.max(apertura.buckets.length, cierre.buckets.length);
for (let i = 0; i < n; i++) {
  const a = apertura.buckets[i];
  const c = cierre.buckets[i];
  const fmt = b => (b ? `${(b.accuracy * 100).toFixed(1)}% (n=${b.n})`.padEnd(20) : '—'.padEnd(20));
  const rango = a ?? c;
  console.log(`  ${rango.lo.toFixed(2)}-${rango.hi.toFixed(2)}  ${fmt(a)} ${fmt(c)}`);
}
console.log('\nescrito: server/data/calibration-ab.json');