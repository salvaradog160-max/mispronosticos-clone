/**
 * Descarga cuotas (apertura + cierre) de las ligas no europeas via
 * RapidAPI sportapi7 y las guarda en el formato que espera la
 * calibracion.
 *
 * Uso:  node --env-file=.env scripts/descargar-odds-sportapi.mjs [dias]
 *
 * Son 1 request por partido. Se cachea en data/odds-sportapi.json,
 * asi que repetir un dia ya descargado no gasta cuota.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIAS, partidosDelDia, cuotasEvento, cuotaAgotada } from '../providers/rapidapi-sportapi.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'data', 'odds-america-sportapi.json');

/** Solo las ligas que ESPN no cubre bien con cuota de cierre. */
const LIGAS = ['mex.1', 'arg.1', 'col.1', 'chi.1', 'B1'];

const dias = Number(process.argv[2] || 3);
const hoy = new Date();
const registros = [];
let conCuotas = 0;
let total = 0;
let agotada = false;

for (let d = dias; d >= 1 && !agotada; d--) {
  const fecha = new Date(hoy.getTime() - d * 86400000).toISOString().slice(0, 10);

  for (const liga of LIGAS) {
    if (!CATEGORIAS[liga] || agotada) continue;
    const { eventos, error } = await partidosDelDia(liga, fecha);

    if (error) {
      if (cuotaAgotada(error)) {
        console.log(`\nCUOTA AGOTADA en ${liga} ${fecha}. Parando.`);
        console.log('Lo ya descargado se conserva. La cuota se reinicia el proximo mes.');
        agotada = true;
        break;
      }
      console.log(`  ${liga} ${fecha}: ${error}`);
      continue;
    }
    if (!eventos.length) continue;

    for (const ev of eventos) {
      if (agotada) break;
      total++;
      const q = await cuotasEvento(ev.id);
      if (q.sinCuotas || q.error || !q.cierre) continue;
      conCuotas++;
      registros.push({
        eventId: ev.id,
        fecha,
        liga,
        casa: ev.homeTeam?.name || '',
        visita: ev.awayTeam?.name || '',
        score: `${ev.homeScore?.normaltime ?? ev.homeScore?.current ?? ''}-${ev.awayScore?.normaltime ?? ev.awayScore?.current ?? ''}`,
        mercado: '1X2',
        cuotaApertura: q.apertura,
        cuotaCierre: q.cierre,
        probApertura: q.probApertura,
        probCierre: q.probCierre,
      });
    }
    console.log(`  ${liga} ${fecha}: ${eventos.length} partidos, ${conCuotas} con cuota en total`);
  }
}

await mkdir(join(ROOT, 'data'), { recursive: true });
const previas = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => []);
const porId = new Map(previas.map(r => [r.eventId, r]));
for (const r of registros) porId.set(r.eventId, r);
const salida = [...porId.values()];

await writeFile(OUT, JSON.stringify(salida, null, 1));

console.log(`\npartidos vistos hoy: ${total}`);
console.log(`con cuota 1X2 completa: ${registros.length}`);
console.log(`acumulado en disco: ${salida.length}`);
console.log(`guardado en ${OUT}`);
if (agotada) process.exitCode = 2;