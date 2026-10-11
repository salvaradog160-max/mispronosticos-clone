/**
 * Valor esperado real de los picks.
 *
 * Una confianza alta NO es una buena apuesta. A cuota 1.63 necesitas
 * 61.3% para no perder dinero, asi que un pick de 57% que acierta la
 * mayoria de las veces igual pierde plata.
 *
 * Aqui se mide, sobre los partidos ya jugados, que le paso al bolsillo
 * con la regla "publico lo que supera el 50% de acierto" frente a otras
 * reglas mas exigentes. Sin esto, la opcion C seria una improving.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUES_HISTORIA } from '../config/ligas.mjs';
import { fetchHistory, impliedProbs } from '../providers/footballdata.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';
import { normalizeTeam } from '../engine/calibration.mjs';
import { lookupBucket } from '../engine/calibration.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LEAGUES = LEAGUES_HISTORIA;
const SEASONS = 8;

const parseDate = raw => {
  const [d, m, y] = String(raw).split('/');
  return `${y}-${m}-${d}`;
};

const buckets = JSON.parse(await readFile(join(ROOT, 'data', 'calibrated-buckets.json'), 'utf8')).buckets;

console.log('[ev] descargando historia...');
const history = (await fetchHistory(LEAGUES, SEASONS))
  .filter(m => m.odds?.H && m.odds?.D && m.odds?.A)
  .sort((a, b) => parseDate(a.utcDate) - parseDate(b.utcDate));

// Cada partido con las cuotas tal como las vio el operador: la ultima
// disponible, no el cierre. Por eso se recalcula el bucket con la
// probabilidad de apertura del partido equivalente.
const picks = [];
for (let i = 300; i < history.length; i++) {
  const fx = history[i];
  const ratings = buildRatings(history.slice(0, i));
  const prediction = predictMatch(ratings, fx);
  if (!prediction.known) continue;

  const market = impliedProbs(fx.odds);
  if (!market) continue;

  const top = Object.entries(prediction.oneXTwo).sort((a, b) => b[1] - a[1])[0];
  const [sel, modelProb] = top;
  const marketTop = Object.entries(market).filter(([k]) => k !== 'overround').sort((a, b) => b[1] - a[1])[0];
  if (sel !== marketTop[0]) continue;

  const cal = lookupBucket(buckets, market[sel]);
  if (!cal) continue;

  const odds = fx.odds[sel];
  const actual = fx.homeScore > fx.awayScore ? 'H' : fx.homeScore === fx.awayScore ? 'D' : 'A';
  const won = actual === sel;

  picks.push({
    liga: fx.league,
    odds,
    confidence: cal.confidence / 100,
    won,
    // lo que deja el Boleto
    roi: won ? odds - 1 : -1,
  });
}

console.log(`[ev] ${picks.length} picks de consenso listos`);

/** Juega una regla y devuelve el rendimiento por unidad apostada. */
const evaluar = (nombre, filtro) => {
  const usados = picks.filter(filtro);
  if (usados.length === 0) return { nombre, n: 0 };
  const roi = usados.reduce((s, p) => s + p.roi, 0) / usados.length;
  const acierto = usados.filter(p => p.won).length / usados.length;
  const bajo = usados.filter(p => !p.won).length;
  // La varianza del ROI NO es la binomial del acierto: cada pick aporta
  // una cantidad distinta de dinero. Se calcula sobre los retornos
  // individuales, que es lo unico honesto.
  const retornos = usados.map(p => p.roi);
  const media = roi;
  const varianza = retornos.reduce((s, r) => s + (r - media) ** 2, 0) / usados.length;
  const se = Math.sqrt(varianza / usados.length);
  return {
    nombre,
    n: usados.length,
    acierto,
    roi,
    z: se > 0 ? roi / se : 0,
    ic: se > 0 ? [roi - 1.96 * se, roi + 1.96 * se] : [roi, roi],
    cobertura: usados.length / picks.length,
  };
};

const reglas = [
  ['todos los picks (sin filtro)', () => true],
  ['C: acierto > 50%', p => p.confidence > 0.5],
  ['C+ : acierto > 55%', p => p.confidence > 0.55],
  ['C++: acierto > 60%', p => p.confidence > 0.6],
  ['C+++: acierto > 65%', p => p.confidence > 0.65],
  ['EV positivo: acierto > 1/cuota', p => p.confidence > 1 / p.odds],
  ['EV+5%: acierto > 1/cuota + 5pp', p => p.confidence > 1 / p.odds + 0.05],
  ['EV+10%: acierto > 1/cuota + 10pp', p => p.confidence > 1 / p.odds + 0.1],
];

const resultados = reglas.map(([n, f]) => evaluar(n, f));

// Desglose por liga para el filtro de produccion.
const porLiga = {};
for (const p of picks.filter(p => p.confidence > 1 / p.odds + 0.05)) {
  porLiga[p.liga] = porLiga[p.liga] ?? { n: 0, roi: 0, gana: 0 };
  porLiga[p.liga].n++;
  porLiga[p.liga].roi += p.roi;
  if (p.roi > 0) porLiga[p.liga].gana++;
}
console.log('\nEV+5pp POR LIGA (solo lo que pasa el filtro)');
console.log('liga      n     ROI      acierto');
for (const [k, v] of Object.entries(porLiga).sort((a, b) => b[1].n - a[1].n)) {
  const roi = v.roi / v.n;
  console.log(`${k.padEnd(8)} ${String(v.n).padEnd(5)} ${(roi * 100).toFixed(2).padStart(7)}%   ${(100 * v.gana / v.n).toFixed(0)}%`);
}

console.log('\nregla                      n      acierto    ROI      z      cobertura');
console.log('-'.repeat(76));
for (const r of resultados) {
  if (!r.n) { console.log(`${r.nombre.padEnd(26)} 0      —         —       —      —`); continue; }
  console.log(
    `${r.nombre.padEnd(26)} ${String(r.n).padEnd(6)} ${(r.acierto * 100).toFixed(1).padStart(6)}%  ${(r.roi * 100 >= 0 ? '+' : '') + (r.roi * 100).toFixed(2)}%   ${r.z.toFixed(2).padStart(5)}   ${(r.cobertura * 100).toFixed(0)}%`,
  );
}

const base = resultados[0];
const c = resultados[1];
console.log('\n---');
console.log(`Base (todo):            ROI ${(base.roi * 100).toFixed(2)}% sobre ${base.n} picks`);
console.log(`C (acierto > 50%):      ROI ${(c.roi * 100).toFixed(2)}% sobre ${c.n} picks`);
if (c.roi > 0) console.log('  -> C GANA dinero sobre el filtro');
else console.log('  -> C NO gana dinero. Filtro insuficiente.');

await writeFile(join(ROOT, 'data', 'ev-backtest.json'), JSON.stringify({ generado: new Date().toISOString(), resultados }, null, 2));
console.log('\nescrito: server/data/ev-backtest.json');