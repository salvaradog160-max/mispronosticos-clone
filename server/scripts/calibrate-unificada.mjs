/**
 * Calibracion unificada: ligas europeas (football-data) + ligas de
 * america (ESPN core API), con APERTURA y CIERRE propias de cada liga.
 *
 * Una sola tabla para todas, no una por liga: con lo que se vio en el
 * backtest de EV (ROI saltando de +15% a -21% entre ligas) una tabla
 * por liga seria sobreajustar ruido.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHistory } from '../providers/footballdata.mjs';
import { LEAGUES_HISTORIA } from '../config/ligas.mjs';
import { historia, LIGAS_AMERICAS, ANIOS, NOMBRE_LIGA } from '../providers/espn-historia.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EDGES = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 1.01];

const parseDate = raw => {
  const [d, m, y] = String(raw).split('/');
  return `${y}-${m}-${d}`;
};

const probs = (H, D, A) => {
  if (!H || !D || !A) return null;
  const r = { H: 1 / H, D: 1 / D, A: 1 / A };
  const o = r.H + r.D + r.A;
  if (!(o > 1)) return null;
  return { H: r.H / o, D: r.D / o, A: r.A / o };
};

const ladoTop = p => Object.entries(p).sort((a, b) => b[1] - a[1])[0][0];

/** Une los partidos de europa (CSV) con los de america (ESPN core). */
const reunir = async () => {
  const europa = (await fetchHistory(LEAGUES_HISTORIA, 8))
    .filter(m => m.odds?.H && m.odds?.D && m.odds?.A && m.oddsOpen?.H)
    .map(m => ({
      fecha: parseDate(m.utcDate),
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      region: 'europa',
      ap: probs(m.oddsOpen.H, m.oddsOpen.D, m.oddsOpen.A),
      ci: probs(m.odds.H, m.odds.D, m.odds.A),
    }));

  const cache = JSON.parse(await readFile(join(ROOT, 'data', 'odds-historicas.json'), 'utf8'));
  const america = [];
  for (const liga of LIGAS_AMERICAS) {
    const parts = await historia(liga, ANIOS);
    for (const p of parts) {
      const o = cache[p.eventId];
      if (!o) continue;
      const ap = probs(o.H, o.D, o.A);
      const ci = probs(o.Hc, o.Dc, o.Ac);
      if (!ap || !ci) continue;
      america.push({
        fecha: p.utcDate,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        region: NOMBRE_LIGA[liga] ?? liga,
        ap,
        ci,
      });
    }
  }

  return { europa, america };
};

const { europa, america } = await reunir();
const todos = [...europa, ...america].sort((a, b) => a.fecha.localeCompare(b.fecha));
console.log(`[cal] europa ${europa.length} + america ${america.length} = ${todos.length} partidos`);

const rows = [];
for (let i = 300; i < todos.length; i++) {
  const fx = todos[i];
  const ratings = buildRatings(todos.slice(0, i), { prior: 8, minMatches: 5 });
  const pred = predictMatch(ratings, fx);
  if (!pred.known) continue;

  const modelTop = ladoTop(pred.oneXTwo);
  if (!fx.ap || !fx.ci) continue;
  const apTop = ladoTop(fx.ap);
  const ciTop = ladoTop(fx.ci);

  rows.push({
    modelTop,
    ap: fx.ap,
    ci: fx.ci,
    apTop,
    ciTop,
    region: fx.region,
    actual: fx.homeScore > fx.awayScore ? 'H' : fx.homeScore === fx.awayScore ? 'D' : 'A',
  });
}

if (rows.length === 0) {
  console.error('[cal] ERROR: cero partidos evaluados. predictMatch devolvio known=false en todos.');
  process.exit(1);
}

const tabla = sel => {
  const out = [];
  for (let i = 0; i < EDGES.length - 1; i++) {
    const lo = EDGES[i];
    const hi = EDGES[i + 1];
    const slice = rows.filter(sel).filter(r => r.ci[r.modelTop] >= lo && r.ci[r.modelTop] < hi);
    if (slice.length === 0) continue;
    const hits = slice.filter(r => r.actual === r.modelTop).length;
    const rate = hits / slice.length;
    const se = Math.sqrt((rate * (1 - rate)) / slice.length);
    out.push({ lo, hi, n: slice.length, accuracy: rate, ci95: [rate - 1.96 * se, rate + 1.96 * se] });
  }
  return out;
};

const consensoCierre = rows.filter(r => r.modelTop === r.ciTop);
const consensoApertura = rows.filter(r => r.modelTop === r.apTop);

// Cuanto se movio la probabilidad del favorito entre apertura y cierre,
// en puntos porcentuales. Antes esto se llamaba "mediana" pero era la
// media: son estadisticas distintas y la media queda arrastrada por los
// partidos con derivas grandes.
const derivas = rows
  .map(r => Math.abs(r.ci[r.modelTop] - r.ap[r.modelTop]) * 100)
  .sort((a, b) => a - b);

const percentil = (lista, p) => {
  if (!lista.length) return null;
  const i = (lista.length - 1) * p;
  const bajo = Math.floor(i);
  const alto = Math.ceil(i);
  if (bajo === alto) return Number(lista[bajo].toFixed(2));
  return Number((lista[bajo] + (lista[alto] - lista[bajo]) * (i - bajo)).toFixed(2));
};

const payload = {
  generado: new Date().toISOString(),
  partidos: rows.length,
  europa: europa.length,
  america: america.length,
  nota: 'Una sola tabla para todas las ligas. Con apertura y cierre propios.',
  deriva: {
    mediana: percentil(derivas, 0.5),
    media: Number((derivas.reduce((s, v) => s + v, 0) / derivas.length).toFixed(2)),
    p90: percentil(derivas, 0.9),
    cambioFavorito: rows.filter(r => r.apTop !== r.ciTop).length / rows.length,
  },
  consensoAcierto: consensoCierre.filter(r => r.actual === r.modelTop).length / consensoCierre.length,
  consensoN: consensoCierre.length,
  consensoAperturaAcierto:
    consensoApertura.filter(r => r.actual === r.modelTop).length / consensoApertura.length,
  buckets: tabla(r => r.modelTop === r.ciTop),
  bucketsApertura: tabla(r => r.modelTop === r.apTop),
};

await mkdir(join(ROOT, 'data'), { recursive: true });
await writeFile(join(ROOT, 'data', 'calibrated-buckets.json'), JSON.stringify(payload, null, 2));

const pct = v => (v === null ? 'n/d' : `${(v * 100).toFixed(1)}%`);
console.log(`\nconsenso por CIERRE:    ${pct(payload.consensoAcierto)} (n=${payload.consensoN})`);
console.log(`consenso por APERTURA:  ${pct(payload.consensoAperturaAcierto)}`);
console.log(`cambio de favorito:     ${pct(payload.deriva.cambioFavorito)}`);
console.log('\ntramo      acierto  n       IC95');
for (const b of payload.buckets) {
  console.log(`${b.lo.toFixed(2)}-${b.hi.toFixed(2)}  ${(b.accuracy * 100).toFixed(1)}%   ${String(b.n).padEnd(7)} ${(b.ci95[0] * 100).toFixed(1)}-${(b.ci95[1] * 100).toFixed(1)}%`);
}
console.log('\nescrito: server/data/calibrated-buckets.json');