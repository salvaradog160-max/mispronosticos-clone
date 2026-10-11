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
import { LEAGUES_HISTORIA, LIGAS_ESPIN, LIGAS_AMERICA, NOMBRES_LIGA } from '../config/ligas.mjs';
import { fetchHistory, impliedProbs } from '../providers/footballdata.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';
import { normalizeTeam, buildConsensusPicks } from '../engine/calibration.mjs';
import { buildMercadoPicks } from '../engine/mercados.mjs';
import { lookupBucket } from '../engine/calibration.mjs';
import { detectarMovimiento } from '../engine/movimiento.mjs';
import { anotarValor } from '../engine/valor.mjs';
import { analizar } from '../engine/analisis.mjs';
import { upcoming, implied, liveNow } from '../providers/espn.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, 'data');

const LEAGUES = LEAGUES_HISTORIA;
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
  // Sin esto, las ligas de america salen dos veces: ya estan en
  // LIGAS_ESPIN y LIGAS_AMERICA las repite.
  const targets = [...new Set([...LIGAS_ESPIN, ...LIGAS_AMERICA])];
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

  // Si aun no se calibraron los mercados secundarios, se sigue solo con 1X2.
  let mercados = { overUnder25: { operativo: false }, handicap: { operativo: false }, btts: { operativo: false } };
  try {
    mercados = JSON.parse(await readFile(join(DATA_DIR, 'calibration-mercados.json'), 'utf8'));
  } catch {
    console.log('[daily] sin calibracion de mercados, se publica solo 1X2');
  }
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

  const analisis = withData
    .map(f => {
      const p = f.prediction.oneXTwo;
      const total = p.H + p.D + p.A;
      const probs = total > 0 ? { H: p.H / total, D: p.D / total, A: p.A / total } : null;
      if (!probs) return null;
      // overround (~1.05) es el valor mas alto del objeto: si no se
      // excluye, gana el sort y se busca un tramo para una probabilidad
      // de 105%. Por eso H/D/A van aparte.
      const lado = ['H', 'D', 'A'].sort((a, b) => f.market[b] - f.market[a])[0];
      const cal = lookupBucket(calibration.buckets, f.market[lado]);
      // El modelo calcula su propio Over/Under y los goles esperados.
      // Sin esto la tarjeta no puede decir "Over 2.5 a 1.69, el modelo
      // lo pone en 58%", que es justo lo que el usuario pedia.
      const pred = f.prediction;
      const conGoles = {
        ...f,
        probOver: pred.over25 ?? null,
        lambdaHome: pred.lambdaHome ?? null,
        lambdaAway: pred.lambdaAway ?? null,
        score: f.score ?? null,
        status: f.status ?? null,
      };
      return analizar(conGoles, probs, cal ? cal.confidence / 100 : null);
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.movimiento ?? 0) - Math.abs(a.movimiento ?? 0));

  return {
    fixtures: withData.length,
    analisis,
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

// ROI real medido por el backtest, no un numero fijo en el codigo.
const roiBacktest = await (async () => {
  try {
    const bt = JSON.parse(await readFile(join(DATA_DIR, 'ev-backtest.json'), 'utf8'));
    const todos = bt.resultados?.find(r => /todos los picks/.test(r.nombre));
    return todos ? { ...todos, generado: bt.generado } : null;
  } catch {
    return null;
  }
})();
const ratings = await buildRatingsCache();
const { fixtures, picks, picksMercado, live, mercados, descartados, analisis } = await buildPicks(calibration.buckets, ratings);

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
  analisis,
  estadisticas: {
    partidosHistorico: calibration.partidos,
    ligas: LEAGUES.length,
    derivaMediana: calibration.deriva?.mediana ?? null,
    derivaP90: calibration.deriva?.p90 ?? null,
    cambioFavorito: calibration.deriva?.cambioFavorito ?? null,
    consensoAcierto: calibration.consensoAcierto,
    // El margen de la casa se lee del backtest, no va fijo en el codigo:
    // si el backtest se vuelve a correr con mas partidos, la app tiene
    // que reflejar el numero nuevo y no el de la vez pasada.
    margenCasa: roiBacktest?.roi ?? null,
    margenCasaN: roiBacktest?.n ?? null,
    backtestGenerado: roiBacktest?.generado ?? null,
    nota: 'El margen de la casa se mide como ROI de apostar todos los picks de consenso, medido por el backtest.',
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
log(`partidos analizados: ${analisis.length} (con movimiento de linea: ${analisis.filter(a => a.movimiento !== null).length})`);
log(`alertas: ${alertas.length} (alta ${payload.resumenAlertas.alta} / media ${payload.resumenAlertas.media} / baja ${payload.resumenAlertas.baja})`);
for (const a of alertas.slice(0, 5)) log(`  [${a.severidad}] ${a.tipo}: ${a.detalle}`);
log(`partidos en vivo: ${live.length}`);
log(`escrito: ${path}`);
for (const p of [...picks, ...picksMercado].slice(0, 5)) {
  log(`  ${p.selection} @ ${p.odds?.toFixed(2)} -> ${p.confidence}% (margen ${(p.margen * 100).toFixed(1)}pp)`);
}