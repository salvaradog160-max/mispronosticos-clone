import { fetchHistory } from '../providers/openligadb.mjs';
import { walkForward, report } from '../engine/backtest.mjs';

const shortcut = process.argv[2] ?? 'bl1';
const seasons = Number(process.argv[3] ?? 8);

console.log(`[backtest] OpenLigaDB ${shortcut}, ultimas ${seasons} temporadas`);

const matches = await fetchHistory(shortcut, seasons);
console.log(`[backtest] partidos descargados: ${matches.length}`);
if (matches.length === 0) {
  console.error('[backtest] sin datos, abortando');
  process.exit(1);
}

const { n, skipped } = walkForward(matches, { minHistory: 100 });
console.log(`[backtest] evaluados: ${n}   descartados por falta de historial: ${skipped}`);

if (n === 0) {
  console.error('[backtest] nada evaluable');
  process.exit(1);
}

const r = report(walkForward(matches, { minHistory: 100 }).evaluated);

console.log('\n=== ACIEGO POR MERCADO ===');
for (const [market, { hits, total, rate }] of Object.entries(r.rates)) {
  const pct = rate === null ? 'n/a' : (rate * 100).toFixed(1) + '%';
  console.log(`  ${market.padEnd(6)} ${String(hits).padStart(4)}/${String(total).padEnd(4)}  ${pct}`);
}

console.log('\n=== BASELINE (adivinar siempre el mas frecuente) ===');
for (const [k, v] of Object.entries(r.baselines)) {
  console.log(`  ${k}: ${(v * 100).toFixed(1)}%`);
}
console.log(`  mejor baseline: ${(r.veredicto.mejorBaseline * 100).toFixed(1)}%`);

console.log(`\n  Brier score (1X2): ${r.brier?.toFixed(4)}   [0 = perfecto, ~1 = inútil]`);

console.log('\n=== SIGNIFICANCIA vs baseline ===');
if (r.significance) {
  const s = r.significance;
  console.log(`  acierto  ${(s.rate * 100).toFixed(1)}%`);
  console.log(`  baseline ${(s.baseline * 100).toFixed(1)}%`);
  console.log(`  z = ${s.z}   p = ${s.pValue}`);
  console.log(`  margen 95%: ${(s.margen95[0] * 100).toFixed(1)}% - ${(s.margen95[1] * 100).toFixed(1)}%`);
  console.log(`  la baseline (${(s.baseline * 100).toFixed(1)}%) ${s.margen95[0] > s.baseline ? 'queda DENTRO' : 'queda FUERA'} del margen`);
}

console.log('\n=== CALIBRACION (predicho vs observado) ===');
console.log('  tramo          n    predicho   observado');
for (const row of r.calibration) {
  if (row.n === 0) continue;
  console.log(
    `  ${String(row.lo).padEnd(5)}-${String(row.hi).padEnd(6)} ${String(row.n).padStart(4)}` +
      `   ${(row.predicted * 100).toFixed(1).padStart(6)}%   ${(row.observed * 100).toFixed(1).padStart(6)}%`,
  );
}

console.log('\n=== VEREDICTO ===');
console.log(`  Acierto 1X2: ${(r.veredicto.oneXTwoRate * 100).toFixed(1)}%`);
console.log(`  Bate al azar: ${r.veredicto.bateAlAzar ? 'SI' : 'NO'}`);
console.log(`  ${r.veredicto.nota}`);