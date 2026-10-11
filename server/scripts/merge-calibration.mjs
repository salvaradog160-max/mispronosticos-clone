/**
 * Fusion conservadora de las tablas de apertura y cierre.
 *
 * Resultado de calibrate-ab.mjs: ambas tablas son casi identicas
 * (deriva mediana 1.6 pp, el favorito solo cambia en el 4.2% de los
 * partidos). Aun asi, para no sobre-declarar, cada tramo toma el
 * ACIERTO MENOR de las dos y el IC MAS ANCHO.
 *
 * Escribe data/calibrated-buckets.json, que es lo que leen daily.mjs
 * y el servidor HTTP.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ab = JSON.parse(await readFile(join(ROOT, 'data', 'calibration-ab.json'), 'utf8'));

const porTramo = new Map();
for (const b of ab.apertura.buckets) porTramo.set(`${b.lo}-${b.hi}`, b);
for (const b of ab.cierre.buckets) porTramo.set(`${b.lo}-${b.hi}`, b);

const fusion = [];
for (const [k, a] of porTramo) {
  const c = ab.cierre.buckets.find(x => `${x.lo}-${x.hi}` === k);
  const candidates = [a, c].filter(Boolean);
  fusion.push({
    lo: a.lo,
    hi: a.hi,
    // Las dos tablas contienen LOS MISMOS partidos (una medida con la
    // cuota de apertura, otra con la de cierre). Sumarlas seria
    // contarlos dos veces e inflar la muestra. Se toma el maximo.
    n: Math.max(...candidates.map(b => b.n)),
    accuracy: Math.min(...candidates.map(b => b.accuracy)),
    ci95: [
      Math.min(...candidates.map(b => b.ci95[0])),
      Math.max(...candidates.map(b => b.ci95[1])),
    ],
  });
}
fusion.sort((a, b) => a.lo - b.lo);

const payload = {
  generado: new Date().toISOString(),
  partidos: ab.partidos,
  metodo: 'consenso modelo+mercado, fusion conservadora apertura/cierre',
  nota: 'Cada tramo toma el menor acierto de las dos tablas y el IC mas ancho.',
  deriva: ab.deriva,
  consensoAcierto: Math.min(ab.apertura.acierto, ab.cierre.acierto),
  consensoN: Math.min(ab.apertura.n, ab.cierre.n),
  buckets: fusion,
};

await writeFile(join(ROOT, 'data', 'calibrated-buckets.json'), JSON.stringify(payload, null, 2));

console.log('tramo        acierto  n        IC95');
for (const b of fusion) {
  console.log(
    `${b.lo.toFixed(2)}-${b.hi.toFixed(2)}     ${(b.accuracy * 100).toFixed(1)}%     ${String(b.n).padEnd(7)} ${(b.ci95[0] * 100).toFixed(1)}-${(b.ci95[1] * 100).toFixed(1)}%`,
  );
}
console.log('\nescrito: server/data/calibrated-buckets.json');