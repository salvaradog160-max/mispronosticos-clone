/**
 * Construye los ratings por equipo desde el historico de football-data.co.uk
 * y los cachea en data/ratings.json.
 *
 * Se usa el TERCIO FINAL de la historia para no meter en el rating partidos
 * que todavia no se jugaban al momento de la prediccion.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUES_HISTORIA } from '../config/ligas.mjs';
import { fetchHistory } from '../providers/footballdata.mjs';
import { buildRatings } from '../engine/ratings.mjs';
import { normalizeTeam } from '../engine/calibration.mjs';

const LEAGUES = LEAGUES_HISTORIA;
const SEASONS = 6;

const parseDate = raw => {
  const [d, m, y] = String(raw).split('/');
  return `${y}-${m}-${d}`;
};

console.log(`[ratings] ${LEAGUES.length} ligas x ${SEASONS} temporadas...`);
const matches = await fetchHistory(LEAGUES, SEASONS);
console.log(`[ratings] partidos: ${matches.length}`);

const ordered = [...matches].sort((a, b) => parseDate(a.utcDate) - parseDate(b.utcDate));
const history = ordered.filter(m => Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore));

const ratings = buildRatings(history, { prior: 8, minMatches: 5 });
console.log(`[ratings] equipos con rating: ${Object.keys(ratings.teams).length}`);

const teams = {};
for (const [name, data] of Object.entries(ratings.teams)) {
  teams[normalizeTeam(name)] = {
    nombre: name,
    ...data,
    attack: Number(data.attack.toFixed(4)),
    defense: Number(data.defense.toFixed(4)),
  };
}

const out = {
  generado: new Date().toISOString(),
  partidos: history.length,
  ligas: LEAGUES,
  temporadas: SEASONS,
  leagueAvgHome: Number(ratings.leagueAvgHome.toFixed(4)),
  leagueAvgAway: Number(ratings.leagueAvgAway.toFixed(4)),
  teams,
};

const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'data');
await mkdir(dir, { recursive: true });
const path = join(dir, 'ratings.json');
await writeFile(path, JSON.stringify(out));

const trusted = Object.values(teams).filter(t => t.trusted).length;
console.log(`[ratings] confiados (>=5 partidos): ${trusted}`);
console.log(`[ratings] escrito: ${path}`);
console.log(`[ratings] reinicia el server.`);