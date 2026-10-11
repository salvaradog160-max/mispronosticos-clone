/**
 * Job diario: genera public/picks.json para que la app lo lea directo de
 * GitHub raw, sin depender de ningun servidor propio.
 *
 * Sin claves de API: usa football-data.co.uk (CSV con cuotas) y ESPN
 * (fixtures + cuotas). Todo publico.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { fetchHistory, impliedProbs } from '../providers/footballdata.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';
import { normalizeTeam, buildConsensusPicks } from '../engine/calibration.mjs';
import { buildMercadoPicks } from '../engine/mercados.mjs';
import { detectarMovimiento } from '../engine/movimiento.mjs';
import { anotarValor } from '../engine/valor.mjs';
import { upcoming, implied, liveNow } from '../providers/espn.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, 'data');

const LEAGUES = ['E1', 'SP1', 'I1', 'D1', 'F1'];
const CALIB_SEASONS = 8;
const RATING_SEASONS = 6;

const parseDate = raw => {
  const [d, m, y] = String(raw).split('/');
  return `${y}-${m}-${d}`;
};

const log = (...args) => console.log('[daily]', ...args);

// ---------------------------------------------------------------- calibracion
async function buildCalibration() {
  const cached = join(DATA_DIR, 'calibrated-buckets.json');
  try {
    const parsed = JSON.parse(await readFile(cached, 'utf8'));
    const ageDays = (Date.now() - new Date(parsed.generado).getTime()) / 86400000;
    if (ageDays < 30) {
      log(`calibracion en cache (${ageDays.toFixed(1)} dias)`);
      return parsed;
    }
  } catch {
    /* no hay cache */
  }

  log('recalculando calibracion...');
  const matches = (await fetchHistory(LEAGUES, CALIB_SEASONS)).filter(
    m => m.odds?.H && m.odds?.D && m.odds?.A,
  );
  const ordered = [...matches].sort((a, b) => parseDate(a.utcDate) - parseDate(b.utcDate));

  const rows = [];
  for (let i = 300; i < ordered.length; i++) {
    const fx = ordered[i];
    const ratings = buildRatings(ordered.slice(0, i));
    const prediction = predictMatch(ratings, fx);
    if (!prediction.known) continue;
    const market = impliedProbs(fx.odds);
    if (!market) continue;

    const model = prediction.oneXTwo;
    const modelTop = Object.entries(model).sort((a, b) => b[1] - a[1])[0][0];
    const marketTop = Object.entries(market)
      .filter(([k]) => k !== 'overround')
      .sort((a, b) => b[1] - a[1])[0][0];

    rows.push({
      model,
      market,
      modelTop,
      marketTop,
      actual: fx.homeScore > fx.awayScore ? 'H' : fx.homeScore === fx.awayScore ? 'D' : 'A',
    });
  }

  const consensus = rows.filter(r => r.modelTop === r.marketTop);
  const buckets = [];
  const edges = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 1.01];

  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const slice = consensus.filter(r => {
      const p = r.market[r.modelTop];
      return p >= lo && p < hi;
    });
    if (slice.length === 0) continue;
    const hits = slice.filter(r => r.actual === r.modelTop).length;
    const rate = hits / slice.length;
    const se = Math.sqrt((rate * (1 - rate)) / slice.length);
    buckets.push({
      lo,
      hi,
      n: slice.length,
      accuracy: rate,
      ci95: [rate - 1.96 * se, rate + 1.96 * se],
    });
  }

  const payload = {
    generado: new Date().toISOString(),
    partidos: rows.length,
    consensoAcierto: consensus.length ? consensus.filter(r => r.actual === r.modelTop).length / consensus.length : null,
    consensoN: consensus.length,
    buckets,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(cached, JSON.stringify(payload, null, 2));
  log(`calibracion lista: ${rows.length} partidos, ${buckets.length} tramos`);
  return payload;
}

// -------------------------------------------------------------------- ratings
async function buildRatingsCache() {
  const cached = join(DATA_DIR, 'ratings.json');
  try {
    const parsed = JSON.parse(await readFile(cached, 'utf8'));
    const ageDays = (Date.now() - new Date(parsed.generado).getTime()) / 86400000;
    if (ageDays < 30) {
      log(`ratings en cache (${ageDays.toFixed(1)} dias)`);
      return parsed;
    }
  } catch {
    /* no hay cache */
  }

  log('recalculando ratings...');
  const matches = await fetchHistory(LEAGUES, RATING_SEASONS);
  const history = [...matches]
    .filter(m => Number.isFinite(m.homeScore) && Number.isFinite(m.awayScore))
    .sort((a, b) => parseDate(a.utcDate) - parseDate(b.utcDate));

  const ratings = buildRatings(history, { prior: 8, minMatches: 5 });
  const teams = {};
  for (const [name, data] of Object.entries(ratings.teams)) {
    teams[normalizeTeam(name)] = {
      nombre: name,
      ...data,
      attack: Number(data.attack.toFixed(4)),
      defense: Number(data.defense.toFixed(4)),
    };
  }

  const payload = {
    generado: new Date().toISOString(),
    partidos: history.length,
    leagueAvgHome: Number(ratings.leagueAvgHome.toFixed(4)),
    leagueAvgAway: Number(ratings.leagueAvgAway.toFixed(4)),
    teams,
  };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(cached, JSON.stringify(payload));
  log(`ratings listos: ${Object.keys(teams).length} equipos`);
  return payload;
}

// ---------------------------------------------------------------------- picks
async function buildPicks(buckets, ratings) {
  const targets = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'mex.1'];
  const results = await Promise.allSettled(targets.map(l => upcoming(l, 4)));
  const fixtures = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(m => m.status !== 'post');

  const withData = fixtures
    .map(row => {
      const market = row.odds ? implied(row.odds) : null;
      if (!market) return null;
      const home = normalizeTeam(row.homeTeam);
      const away = normalizeTeam(row.awayTeam);
      if (!ratings.teams[home] || !ratings.teams[away]) return null;
      return {
        ...row,
        market,
        rawOdds: row.odds,
        prediction: predictMatch(ratings, { homeTeam: home, awayTeam: away }),
      };
    })
    .filter(Boolean);

  const picks = buildConsensusPicks(withData, buckets, { limit: 40 });

  const mercados = JSON.parse(
    await readFile(join(DATA_DIR, 'calibration-mercados.json'), 'utf8'),
  );
  const picksMercado = buildMercadoPicks(withData, mercados, { limit: 25 });

  let live = [];
  try {
    live = await liveNow();
  } catch {
    /* sin partidos en vivo */
  }

  // El filtro de valor esperado se aplica AL FINAL, sobre todo junto.
  // Regla: publico solo lo que acierta MAS de lo que la cuota cobra,
  // con 5 puntos de margen. Medido en ev-backtest.mjs.
  const { rented, descartados } = anotarValor([...picks, ...picksMercado]);

  return {
    fixtures: withData.length,
    picks: rented.filter(p => p.market === '1X2'),
    picksMercado: rented.filter(p => p.market !== '1X2'),
    live,
    mercados,
    descartados,
  };
}

// ------------------------------------------------------------------------ run
const leerAnterior = async () => {
  try {
    return JSON.parse(await readFile(join(DATA_DIR, 'picks-anterior.json'), 'utf8'));
  } catch {
    return null;
  }
};

const calibration = await buildCalibration();
const ratings = await buildRatingsCache();
const { fixtures, picks, picksMercado, live, mercados, descartados } = await buildPicks(calibration.buckets, ratings);

const todosPicks = [...picks, ...picksMercado];
const anterior = await leerAnterior();

const tramosPorMercado = {
  '1X2': calibration.buckets,
  TOTAL: mercados.overUnder25.fusionado,
  BTTS: mercados.btts.buckets,
};

const alertas = anterior
  ? detectarMovimiento([...(anterior.picks ?? []), ...(anterior.picksMercado ?? [])], todosPicks, tramosPorMercado)
  : [];

const payload = {
  generado: new Date().toISOString(),
  anterior: anterior ? anterior.generado : null,
  fuente: 'football-data.co.uk + ESPN (sin claves)',
  calibracion: {
    partidos: calibration.partidos,
    consensoAcierto: calibration.consensoAcierto,
    consensoN: calibration.consensoN,
    nota: 'Acierto empirico de los picks de consenso, medido sobre partidos ya jugados.',
  },
  mercados: {
    overUnder25: mercados.overUnder25.operativo,
    handicap: mercados.handicap.operativo,
    handicapMotivo: mercados.handicap.motivo,
    btts: mercados.btts.operativo,
    bttsNota: mercados.btts.nota,
  },
  resumen: {
    partidosConDatos: fixtures,
    picks: picks.length,
    picksMercado: picksMercado.length,
    descartados: descartados.length,
    enVivo: live.length,
  },
  descarte: {
    criterio: 'Se publica solo lo que acierta mas de lo que la cuota cobra, con 5pp de margen.',
    motivo: 'Un pick puede acertar el 57% y aun asi perder dinero si la cuota exige 61%.',
    descartados: descartados.map(d => ({
      partido: `${d.homeTeam} vs ${d.awayTeam}`,
      mercado: d.market,
      seleccion: d.selection,
      cuota: d.odds,
      confianza: d.confidence,
      necesita: d.breakEven !== null && d.breakEven !== undefined ? Math.round(d.breakEven * 100) : null,
    })),
  },
  alertas,
  resumenAlertas: {
    alta: alertas.filter(a => a.severidad === 'alta').length,
    media: alertas.filter(a => a.severidad === 'media').length,
    baja: alertas.filter(a => a.severidad === 'baja').length,
  },
  picks,
  picksMercado,
  live,
};

await mkdir(OUT_DIR, { recursive: true });
const path = join(OUT_DIR, 'picks.json');
await writeFile(path, JSON.stringify(payload, null, 2));

// La corrida actual pasa a ser la referencia de la siguiente.
await mkdir(DATA_DIR, { recursive: true });
await writeFile(
  join(DATA_DIR, 'picks-anterior.json'),
  JSON.stringify({ generado: payload.generado, picks, picksMercado }, null, 2),
);

log(`fixtures con datos: ${fixtures}`);
log(`picks publicados (con valor esperado positivo): ${picks.length + picksMercado.length}`);
log(`descartados por no cubrir la cuota: ${descartados.length}`);
log(`alertas: ${alertas.length} (alta ${payload.resumenAlertas.alta} / media ${payload.resumenAlertas.media} / baja ${payload.resumenAlertas.baja})`);
for (const a of alertas.slice(0, 5)) log(`  [${a.severidad}] ${a.tipo}: ${a.detalle}`);
log(`partidos en vivo: ${live.length}`);
log(`escrito: ${path}`);
for (const p of [...picks, ...picksMercado].slice(0, 5)) {
  log(`  ${p.selection} @ ${p.odds?.toFixed(2)} -> ${p.confidence}% (margen ${(p.margen * 100).toFixed(1)}pp)`);
}