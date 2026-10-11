/**
 * StatsBomb Open Data — eventos a nivel de disparo con xG real.
 *
 * Repo publico en GitHub, licencia CC BY-NC-SA. Sin key y sin scraping:
 * los archivos se bajan del repo y se cachean en disco, asi el backtest
 * siempre es reproducible.
 *
 * Layout real del repo: data/matches/{comp}/{season}.json y
 * data/events/{match_id}.json (plano, sin carpetas).
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const CACHE = join(fileURLToPath(new URL('..', import.meta.url)), '.cache', 'statsbomb');

const cachePath = name => join(CACHE, `${name}.json`);

export const cachedFetch = async (name, url, { retries = 3 } = {}) => {
  const path = cachePath(name);
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  await mkdir(CACHE, { recursive: true });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      await writeFile(path, JSON.stringify(data));
      return data;
    } catch (error) {
      if (attempt === retries) throw new Error(`${name}: ${error.message}`);
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
};

export const fetchMatches = (competitionId, seasonId) =>
  cachedFetch(`matches_${competitionId}_${seasonId}`, `${RAW}/matches/${competitionId}/${seasonId}.json`);

export const fetchEvents = matchId => cachedFetch(`events_${matchId}`, `${RAW}/events/${matchId}.json`);

/**
 * Suma el xG de los disparos. Solo cuenta tiros, no goles: esa diferencia
 * es justamente lo que separa "goles" de "calidad de oportunidad".
 */
export const xgFromEvents = events => {
  let xg = 0;
  let shots = 0;
  let goals = 0;

  for (const event of events) {
    if (event.type?.name !== 'Shot') continue;
    shots += 1;
    const value = event.shot?.statsbomb_xg;
    if (Number.isFinite(value)) xg += value;
    if (event.shot?.outcome?.name === 'Goal') goals += 1;
  }

  return { xg: Number(xg.toFixed(3)), shots, goals };
};

export const buildXgDataset = async (matches, { concurrency = 8, onProgress } = {}) => {
  const rows = [];
  let done = 0;

  for (let i = 0; i < matches.length; i += concurrency) {
    const batch = matches.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async match => {
        try {
          const events = await fetchEvents(match.match_id);
          const homeName = match.home_team.home_team_name;
          const awayName = match.away_team.away_team_name;
          const home = xgFromEvents(events.filter(e => e.team?.name === homeName));
          const away = xgFromEvents(events.filter(e => e.team?.name === awayName));
          return {
            utcDate: `${match.match_date}T00:00:00Z`,
            homeTeam: homeName,
            awayTeam: awayName,
            homeScore: match.home_score,
            awayScore: match.away_score,
            homeXg: home.xg,
            awayXg: away.xg,
            homeShots: home.shots,
            awayShots: away.shots,
          };
        } catch {
          return null;
        }
      }),
    );

    for (const row of results) if (row) rows.push(row);
    done += batch.length;
    if (onProgress) onProgress(done, matches.length);
  }

  rows.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  return rows;
};