/**
 * Informe forense de un partido TERMINADO.
 *
 * Reconstruye el analisis completo tal como se habria visto ANTES del
 * partido, usando SOLO la historia anterior al kickoff (nunca partidos
 * posteriores: contaminaria) y SOLO partidos de liga (las copas alteran
 * la muestra, decision del usuario). Al final marca cada pronostico del
 * ranking como ACIERTO / FALLO / EMPATE contra el marcador real.
 *
 * Uso:
 *   node scripts/forense.mjs "P1" "Rio Ave" "Nacional" 2026-02-08 1 0
 *   (liga, local, visita, fecha YYYY-MM-DD del kickoff, goles local, goles visita)
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';
import { historialDe, combinar, pronosticos } from '../engine/historial.mjs';
import { overProb, bttsProb } from '../engine/poisson.mjs';
import { ladderMercados, desglosarTiempos } from '../engine/ladder.mjs';
import { normalizeTeam } from '../engine/calibration.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(ROOT, 'data');

const [lg, local, visita, fecha, gh, ga] = process.argv.slice(2);
if (!lg || !local || !visita || !fecha || gh == null || ga == null) {
  console.error('uso: node scripts/forense.mjs "LIGA" "Local" "Visita" YYYY-MM-DD GOLES_LOCAL GOLES_VISITA');
  process.exit(1);
}

/** Fecha en clave YYYYMMDD (acepta DD/MM/YYYY y ISO). */
const clave = d => {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d ?? '');
  return dm ? `${dm[3]}${dm[2].padStart(2, '0')}${dm[1].padStart(2, '0')}` : '00000000';
};
const KICKOFF = clave(fecha);

const cache = JSON.parse(await readFile(join(DATA_DIR, 'cache', 'history.json'), 'utf8'));
const todos = cache.history ?? [];

// 1) Solo partidos de la MISMA liga, anteriores al kickoff, en orden.
const ligaSet = new Set([lg, ...(cache.ligas??[])]);
const previos = todos
  .filter(p => p.league === lg || p.leagueName === lg)
  .filter(p => clave(p.utcDate) < KICKOFF)
  .filter(p => Number.isFinite(p.homeScore) && Number.isFinite(p.awayScore))
  .sort((a, b) => clave(a.utcDate) - clave(b.utcDate));
console.log(`\n=== FORENSE: ${local} vs ${visita} (${fecha}) ===`);
console.log(`liga ${lg} · historia previa al kickoff: ${previos.length} partidos (solo liga, sin copas)`);

// 2) Ratings con solo esa historia previa. Los equipos se normalizan
// igual que predictMatch (que recibe nombres normalizados), si no el
// rating no encuentra al equipo.
const normPrevios = previos.map(m => ({ ...m, homeTeam: normalizeTeam(m.homeTeam), awayTeam: normalizeTeam(m.awayTeam) }));
const ratings = buildRatings(normPrevios, { prior: 8, minMatches: 5 });
const home = normalizeTeam(local);
const away = normalizeTeam(visita);
if (!ratings.teams[home] || !ratings.teams[away]) {
  console.error('un equipo no tiene rating con esta historia previa.');
  process.exit(1);
}

// 3) Modelo Poisson y el analisis combinado con historia previa.
const pred = predictMatch(ratings, { homeTeam: home, awayTeam: away });
const pModelo = pred.oneXTwo;
const h = historialDe(previos, local, visita);
const { pBase, pH2H } = h?.probs ?? {};
const { pComb, usados } = combinar(pModelo, pBase, pH2H);
const golesModelo = {
  over25: pred.over25, over1_5: overProb(pred.lambdaHome, pred.lambdaAway, 1.5),
  over3_5: overProb(pred.lambdaHome, pred.lambdaAway, 3.5),
  over4_5: overProb(pred.lambdaHome, pred.lambdaAway, 4.5),
  btts: bttsProb(pred.lambdaHome, pred.lambdaAway),
};
const pro = pronosticos({ pComb, pModelo, pBase, golesModelo, tendHist: h?.tendencias?.general ?? null });

const pct = v => `${(v * 100).toFixed(1)}%`;
const line = '─'.repeat(64);

// 4) Resultado real y como se resuelve cada mercado.
const ghN = Number(gh), gaN = Number(ga);
const solve = t => {
  if (t === '1') return ghN > gaN;
  if (t === 'X') return ghN === gaN;
  if (t === '2') return gaN > ghN;
  if (t === '1X') return ghN >= gaN;
  if (t === 'X2') return gaN >= ghN;
  const m = /^O([\d.]+)$/.exec(t);
  if (m) return ghN + gaN > Number(m[1]);
  const u = /^U([\d.]+)$/.exec(t);
  if (u) return ghN + gaN < Number(u[1]);
  if (t.startsWith('AA')) return ghN >= 1 && gaN >= 1;
  return null;
};

console.log(`\n${line}\nSE INCLINA/COMBINADA (modelo 50 · base 30 · H2H 20)\n${line}`);
const ladoNombre = { H: 'Local', D: 'Empate', A: 'Visita' };
const inclina = ['H','D','A'].sort((a,b)=>(pComb[b]??0)-(pComb[a]??0))[0];
console.log(`inclina a ${ladoNombre[inclina]} ${pct(pComb[inclina])} · base ${pBase?pct(pBase.H):'s/d'} H2H ${pH2H?pct(pH2H.H):'s/d'}`);

console.log(`\n${line}\nPRONOSTICOS ORDENADOS POR PROBABILIDAD\n${line}`);
console.log('(verde = se cumplio, rojo = fallo, amarillo = empata condiciones)');
for (const p of pro) {
  const res = solve(p.tipo);
  const ok = res === true ? 'SI ' : res === false ? 'NO ' : ' = ';
  console.log(
    `${ok} ${p.nombre.padEnd(24)} ${pct(p.p).padStart(6)}  @${(p.cuotaJusta ?? 0).toFixed(2).padStart(5)}  riesgo ${p.riesgo.padEnd(5)}` +
    (p.modelo != null && p.historial != null
      ? `  modelo ${pct(p.modelo)}·hist ${pct(p.historial)}`
      : p.modelo != null ? `  modelo ${pct(p.modelo)}` : p.historial != null ? `  hist ${pct(p.historial)}` : '')
  );
}

// 5) Detalle del marcador real
console.log(`\n${line}\nRESULTADO REAL: ${local} ${ghN}-${gaN} ${visita} · total goles ${ghN + gaN}\n${line}`);

// 6) Datos de base (cuadros)
if (h) {
  console.log(`\nH2H previo (directo): ${h.h2hPartidos} partidos · serie (local) ${(h.serieH2H??[]).join(' ')}`);
  const c = h.cuadros;
  console.log(`Local casa: GF ${c.localCasa.gfProm} GC ${c.localCasa.gcProm} (n=${c.localCasa.n})`);
  console.log(`Visita fuera: GF ${c.visitaFuera.gfProm} GC ${c.visitaFuera.gcProm} (n=${c.visitaFuera.n})`);
}