/**
 * Descarga cuotas historicas (apertura + cierre) de las ligas de america
 * desde la API core de ESPN.
 *
 * Son ~1 request por partido, asi que esto corre aparte del job horario.
 * Los partidos ya jugados no cambian de cuota: la cache es permanente.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { historia, LIGAS_AMERICAS, ANIOS, NOMBRE_LIGA } from '../providers/espn-historia.mjs';
import { descargarOdds } from '../providers/espn-odds-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const todos = [];
for (const liga of LIGAS_AMERICAS) {
  const parts = await historia(liga, ANIOS);
  console.log(`[odds] ${NOMBRE_LIGA[liga]}: ${parts.length} partidos`);
  for (const p of parts) todos.push({ id: p.eventId ?? `${liga}-${p.utcDate}-${p.homeTeam}`, league: liga, eventId: p.eventId });
}

const conId = todos.filter(t => t.eventId);
console.log(`[odds] descargando cuotas de ${conId.length} partidos...`);

const cache = await descargarOdds(conId, {
  concurrencia: 10,
  progreso: (hechos, total) => console.log(`[odds] ${hechos}/${total}`),
});

const ok = Object.keys(cache).length;
console.log(`[odds] listo: ${ok} partidos con cuotas`);
await writeFile(join(ROOT, 'data', 'odds-america-resumen.json'), JSON.stringify({ partidos: ok, fecha: new Date().toISOString() }));
