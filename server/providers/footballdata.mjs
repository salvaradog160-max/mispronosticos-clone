/**
 * football-data.co.uk — CSV historicos con cuotas de casas de apuestas.
 * No pide key ni registro. URL: /mmz4281/{temporada}/{liga}.csv
 *
 * Las columnas de cuota vienen con la coletilla C (cerrada) y A (apertura).
 * Para backtest hay que usar la CERRADA: es la que estuvo disponible.
 */

const BASE = 'https://www.football-data.co.uk/mmz4281';

export const LEAGUES = {
  E1: 'Premier League',
  SP1: 'La Liga',
  I1: 'Serie A',
  D1: 'Bundesliga',
  F1: 'Ligue 1',
};

const num = value => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Descarga una temporada y normaliza al formato del motor.
 * Conserva ademas las cuotas: sin ellas no hay forma de medir valor.
 */
export const fetchSeason = async (league, season) => {
  const res = await fetch(`${BASE}/${season}/${league}.csv`);
  if (!res.ok) throw new Error(`football-data ${league} ${season} -> ${res.status}`);
  const text = await res.text();
  return parseCsv(text, league, season);
};

export const parseCsv = (text, league, season) => {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map(h => h.trim());
  const col = name => header.indexOf(name);

  const iDiv = col('Div');
  const iDate = col('Date');
  const iHome = col('HomeTeam');
  const iAway = col('AwayTeam');
  const iFthg = col('FTHG');
  const iFtag = col('FTAG');
  const iH = col('AvgCH') >= 0 ? col('AvgCH') : col('B365CH');
  const iD = col('AvgCD') >= 0 ? col('AvgCD') : col('B365CD');
  const iA = col('AvgCA') >= 0 ? col('AvgCA') : col('B365CA');
  const iO25 = col('AvgC>2.5');
  const iU25 = col('AvgC<2.5');
  const iH0 = col('AvgH') >= 0 ? col('AvgH') : col('B365H');
  const iD0 = col('AvgD') >= 0 ? col('AvgD') : col('B365D');
  const iA0 = col('AvgA') >= 0 ? col('AvgA') : col('B365A');
  const iO25o = col('Avg>2.5');
  const iU25o = col('Avg<2.5');
  const iAH = col('AHh');
  const iAHHo = col('AvgAHH');
  const iAHAo = col('AvgAHA');
  const iAHHc = col('AvgCAHH');
  const iAHAc = col('AvgCAHA');

  if (iFthg < 0 || iFtag < 0) throw new Error('CSV sin columnas de resultado');

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    if (cells.length < header.length) continue;
    const homeScore = num(cells[iFthg]);
    const awayScore = num(cells[iFtag]);
    if (homeScore === null || awayScore === null) continue;
    out.push({
      league,
      season,
      utcDate: cells[iDate] ?? null,
      homeTeam: cells[iHome],
      awayTeam: cells[iAway],
      homeScore,
      awayScore,
      odds: {
        H: num(cells[iH]),
        D: num(cells[iD]),
        A: num(cells[iA]),
        over25: num(cells[iO25]),
        under25: num(cells[iU25]),
      },
      // Cuota de apertura. Sirve para calibrar el caso real de la app:
      // picks generados antes del cierre, con la ultima cotizacion.
      oddsOpen: {
        H: num(cells[iH0]),
        D: num(cells[iD0]),
        A: num(cells[iA0]),
        over25: num(cells[iO25o]),
        under25: num(cells[iU25o]),
        ahHome: num(cells[iAHHo]),
        ahAway: num(cells[iAHAo]),
      },
      // Handicap Asiatico. `ahLine` viene ya con el signo que aplica al
      // local (negativo = local da goles). -0.5, 0, -1.25, ...
      ahLine: num(cells[iAH]),
      oddsCloseAH: {
        ahHome: num(cells[iAHHc]),
        ahAway: num(cells[iAHAc]),
      },
    });
  }
  return out;
};

/**
 * Ultimas temporadas hasta cubrir `count` (p.ej. 8 -> 2526, 2425, ...).
 * El formato es {inicio}{final}: 2526 = agosto 2025 a mayo 2026.
 */
export const seasonCodes = (count, lastSeason = '2526') => {
  const firstYear = Number(lastSeason.slice(0, 2));
  const lastYear = Number(lastSeason.slice(2, 4));
  const codes = [];
  for (let i = 0; i < count; i++) {
    const start = lastYear - i;
    const end = start + 1;
    codes.push(`${String(start).padStart(2, '0')}${String(end).padStart(2, '0')}`);
  }
  return codes.filter(c => Number(c.slice(0, 2)) >= firstYear - 99);
};

/**
 * Historial de varias ligas y temporadas, ordenado por fecha.
 */
export const fetchHistory = async (leagues, seasonsCount) => {
  const codes = seasonCodes(seasonsCount);
  const all = [];
  for (const league of leagues) {
    for (const season of codes) {
      try {
        all.push(...(await fetchSeason(league, season)));
      } catch (error) {
        console.warn(`[football-data] ${league} ${season}: ${error.message}`);
      }
    }
  }
  return all;
};

/**
 * Probabilidades implicitas del mercado, con el margen descontado
 * (overround). Sin descontar, las tres sumarían mas de 1.
 */
export const impliedProbs = (odds, keyH = 'H', keyD = 'D', keyA = 'A') => {
  const h = odds[keyH];
  const d = odds[keyD];
  const a = odds[keyA];
  if (!h || !d || !a) return null;
  const raw = { H: 1 / h, D: 1 / d, A: 1 / a };
  const overround = raw.H + raw.D + raw.A;
  if (!(overround > 1)) return null;
  return {
    H: raw.H / overround,
    D: raw.D / overround,
    A: raw.A / overround,
    overround,
  };
};