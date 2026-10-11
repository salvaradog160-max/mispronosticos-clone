/**
 * Adaptador de OpenLigaDB (https://www.openligadb.de).
 *
 * No pide key ni registro. Solo Bundesliga, 2.Bundesliga y DFB-Pokal,
 * pero con historia suficiente para medir el motor de verdad.
 */

const BASE = 'https://api.openligadb.de';

export const fetchLeagues = async () => {
  const res = await fetch(`${BASE}/getavailableleagues`);
  if (!res.ok) throw new Error(`openligadb leagues -> ${res.status}`);
  return res.json();
};

/**
 * Devuelve el leagueId mas reciente de un shortcut (bl1, bl2, dfb-pokal).
 */
export const findLeagueId = async shortcut => {
  const leagues = await fetchLeagues();
  const candidates = leagues
    .filter(l => l.leagueShortcut === shortcut)
    .map(l => ({ id: l.leagueId, season: Number(l.leagueSeason) }));
  if (candidates.length === 0) throw new Error(`liga no encontrada: ${shortcut}`);
  candidates.sort((a, b) => b.season - a.season);
  return candidates[0];
};

/**
 * Partidos de una temporada, normalizados al formato que espera el motor.
 * Los partidos sin resultado (matchIsFinished false) se descartan.
 */
export const fetchSeason = async (shortcut, season) => {
  const res = await fetch(`${BASE}/getmatchdata/${shortcut}/${season}`);
  if (!res.ok) throw new Error(`openligadb ${shortcut} ${season} -> ${res.status}`);
  const rows = await res.json();
  return rows
    .filter(m => m.matchIsFinished)
    .map(m => {
      const final =
        (m.matchResults ?? []).find(r => r.resultTypeKind === 'After90Minutes') ??
        (m.matchResults ?? []).find(r => r.resultOrderID === 2);
      if (!final) return null;
      return {
        utcDate: m.matchDateTimeUTC ?? m.matchDateTime,
        homeTeam: m.team1?.teamName ?? `H${m.matchID}`,
        awayTeam: m.team2?.teamName ?? `A${m.matchID}`,
        homeScore: final.pointsTeam1,
        awayScore: final.pointsTeam2,
      };
    })
    .filter(
      m =>
        m !== null &&
        Number.isFinite(m.homeScore) &&
        Number.isFinite(m.awayScore) &&
        m.homeScore >= 0 &&
        m.awayScore >= 0,
    );
};

/**
 * Ultimas temporadas disponibles para un shortcut, de la mas nueva a la mas vieja.
 */
export const fetchSeasons = async (shortcut, count) => {
  const leagues = await fetchLeagues();
  const seasons = leagues
    .filter(l => l.leagueShortcut === shortcut)
    .map(l => Number(l.leagueSeason))
    .filter(s => Number.isFinite(s))
    .sort((a, b) => b - a)
    .slice(0, count);
  return seasons;
};

/**
 * Todas las temporadas pedidas, aplanadas y ordenadas por fecha.
 */
export const fetchHistory = async (shortcut, seasonsCount) => {
  const seasons = await fetchSeasons(shortcut, seasonsCount);
  const all = [];
  for (const season of seasons) {
    try {
      all.push(...(await fetchSeason(shortcut, season)));
    } catch (error) {
      console.warn(`[openligadb] temporada ${season} fallo: ${error.message}`);
    }
  }
  all.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  return all;
};