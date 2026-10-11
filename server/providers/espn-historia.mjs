/**
 * Historia desde ESPN para ligas sin CSV historico en football-data.co.uk
 * (Liga MX, Brasil, MLS, Argentina, Colombia, Chile...).
 *
 * ESPN SI da resultados historicos completos. NO da cuotas historicas
 * de partidos ya jugados: el campo `odds` viene como [null]. Por eso
 * estas ligas pueden alimentar el MODELO (ratings) pero no la
 * CALIBRACION, que necesita cuotas de mercado del pasado.
 *
 * La calibracion que se muestra para ellas viene de las ligas
 * europeas. Es una hipotesis, y por eso el analisis las marca como
 * `calibracion: 'europea'` en vez de inventar un numero local.
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

const NOMBRES = {
  'mex.1': 'Liga MX',
  'bra.1': 'Brasileirão',
  'usa.1': 'MLS',
  'arg.1': 'Liga Profesional',
  'col.1': 'Liga BetPlay',
  'chi.1': 'Liga Chile',
  'per.1': 'Liga Peruana',
  'uru.1': 'Liga Uruguaya',
  'ecu.1': 'LigaPro',
  'ven.1': 'Liga FUTVE',
};

export const NOMBRE_LIGA = NOMBRES;

/**
 * Una temporada de una liga.
 * @returns Partidos con resultado, o [] si la liga no existe.
 */
export const temporada = async (liga, anio, limite = 400) => {
  const url = `${BASE}/${liga}/scoreboard?dates=${anio}&limit=${limite}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return [];

  const data = await res.json();
  const out = [];

  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    if (!comp.status?.type?.completed) continue;

    const local = comp.competitors.find(x => x.homeAway === 'home');
    const visita = comp.competitors.find(x => x.homeAway === 'away');
    if (!local || !visita) continue;

    const hg = Number(local.score);
    const ag = Number(visita.score);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;

    out.push({
      league: liga,
      leagueName: NOMBRES[liga] ?? liga,
      season: String(anio),
      utcDate: event.date.slice(0, 10),
      homeTeam: local.team.displayName,
      awayTeam: visita.team.displayName,
      homeScore: hg,
      awayScore: ag,
      // Sin cuotas historicas: ESPN las devuelve como null.
      odds: null,
      oddsOpen: null,
    });
  }

  return out;
};

/** Varias temporadas, de la mas reciente hacia atras. */
export const historia = async (liga, anios) => {
  const todos = [];
  for (const anio of anios) {
    try {
      const p = await temporada(liga, anio);
      todos.push(...p);
      if (p.length === 0) continue;
    } catch {
      // Liga no disponible en ESPN: se sigue con la siguiente.
    }
  }
  return todos;
};

export const LIGAS_AMERICAS = ['mex.1', 'bra.1', 'usa.1', 'arg.1', 'col.1', 'chi.1'];

/** Anios a pedir. 2026 suele estar a medias. */
export const ANIOS = [2026, 2025, 2024];