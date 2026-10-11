/**
 * Proveedor ESPN — resultados en vivo y fixtures, sin key.
 * Cubre 500+ competiciones, incluida Liga MX.
 */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

export const LEAGUES = {
  'eng.1': 'Premier League',
  'esp.1': 'La Liga',
  'ita.1': 'Serie A',
  'ger.1': 'Bundesliga',
  'fra.1': 'Ligue 1',
  'mex.1': 'Liga MX',
  'usa.1': 'MLS',
  'arg.1': 'Liga Profesional',
  'bra.1': 'Brasileirao',
};

/**
 * American odds (+175 / -120) a decimal (2.75 / 1.833).
 */
export const americanToDecimal = value => {
  const raw = String(value ?? '').replace('+', '').trim();
  const num = Number(raw);
  if (!Number.isFinite(num) || num === 0) return null;
  return num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
};

/**
 * Extrae cuotas de la app del proveedor. ESPN usa formato americano,
 * no decimal como el resto de nuestras fuentes: hay que convertir.
 */
const extractOdds = comp => {
  const odds = comp?.odds?.[0];
  if (!odds) return null;

  const ml = odds.moneyline;
  const decimal = {
    H: americanToDecimal(ml?.home?.close?.odds ?? ml?.home?.open?.odds),
    A: americanToDecimal(ml?.away?.close?.odds ?? ml?.away?.open?.odds),
    D: americanToDecimal(odds.drawOdds?.moneyLine),
  };
  if (!decimal.H || !decimal.A || !decimal.D) return null;

  const total = odds.total?.over?.close ?? odds.total?.over?.open;
  const under = odds.total?.under?.close ?? odds.total?.under?.open;

  // Cuota de APERTURA. Es la que permite medir cuanto se movio la
  // linea: `close` en un partido por jugar es solo la ultima
  // cotizacion, no el cierre real.
  const apertura = {
    H: americanToDecimal(ml?.home?.open?.odds),
    A: americanToDecimal(ml?.away?.open?.odds),
    D: decimal.D,
    over: americanToDecimal(odds.total?.over?.open?.odds),
    under: americanToDecimal(odds.total?.under?.open?.odds),
  };

  return {
    ...decimal,
    apertura,
    provider: odds.provider?.name ?? 'ESPN',
    line: odds.overUnder ?? (Number(String(total?.line ?? '').replace(/[oO]/, '')) || null),
    over: americanToDecimal(total?.odds),
    under: americanToDecimal(under?.odds),
  };
};

/**
 * Probabilidades implicitas del mercado, con el margen descontado.
 * Sin descontar, las tres sumarian mas de 1.
 */
export const implied = odds => {
  if (!odds?.H || !odds?.D || !odds?.A) return null;
  const raw = { H: 1 / odds.H, D: 1 / odds.D, A: 1 / odds.A };
  const overround = raw.H + raw.D + raw.A;
  if (!(overround > 1)) return null;
  return {
    H: raw.H / overround,
    D: raw.D / overround,
    A: raw.A / overround,
    overround,
  };
};

const norm = name =>
  String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|afc|cd|rc|sc|club|atletico de|atl|deportivo)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

/**
 * Marcador de una fecha (YYYYMMDD) para una liga.
 * status: pre | in | post
 */
export const scoreboard = async (league, yyyymmdd) => {
  const url = `${BASE}/${league}/scoreboard?dates=${yyyymmdd}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`espn ${league} -> ${res.status}`);
  const data = await res.json();

  return (data.events ?? []).map(event => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');

    return {
      id: String(event.id),
      league,
      leagueName: LEAGUES[league] ?? league,
      kickoff: event.date,
      status: event.status?.type?.state ?? 'pre',
      statusDetail: event.status?.type?.shortDetail ?? '',
      minute: event.status?.displayClock ?? null,
      period: event.status?.period ?? null,
      homeTeam: home?.team?.displayName ?? null,
      awayTeam: away?.team?.displayName ?? null,
      homeKey: norm(home?.team?.displayName ?? ''),
      awayKey: norm(away?.team?.displayName ?? ''),
      homeScore: home?.score != null ? Number(home.score) : null,
      awayScore: away?.score != null ? Number(away.score) : null,
      venue: comp?.venue?.fullName ?? null,
      odds: extractOdds(comp),
    };
  });
};

/** Los proximos N dias de una liga, agrupados por fecha. */
export const upcoming = async (league, days = 3, from = new Date()) => {
  const out = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(from);
    date.setDate(date.getDate() + d);
    const key = date.toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const rows = await scoreboard(league, key);
      for (const row of rows) out.push({ ...row, day: key });
    } catch {
      /* sin datos ese dia */
    }
  }
  return out;
};

export const liveNow = async (leagues = Object.keys(LEAGUES)) => {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const results = await Promise.allSettled(leagues.map(l => scoreboard(l, today)));
  const rows = [];
  for (const r of results) {
    if (r.status === 'fulfilled') rows.push(...r.value.filter(m => m.status === 'in'));
  }
  return rows;
};