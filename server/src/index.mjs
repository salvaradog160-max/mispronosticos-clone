/**
 * Servidor HTTP del clon. Sin dependencias: node:http puro.
 *
 * Endpoints que consume la app React Native:
 *   GET /health
 *   GET /picks/top?league=&minConfidence=&maxOdds=&limit=
 *   GET /matches/live
 *   GET /picks/specials
 *
 * Los picks salen de CALIBRACION MEDIDA sobre historico real, no de
 * probabilidades inventadas. Ver engine/calibration.mjs.
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveNow, upcoming, implied, LEAGUES } from '../providers/espn.mjs';
import { buildConsensusPicks, normalizeTeam } from '../engine/calibration.mjs';
import { buildRatings, predictMatch } from '../engine/ratings.mjs';


const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);

const loadJson = async name => {
  const path = join(ROOT, 'data', name);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
};

// Los buckets calibrados se generan aparte (scripts/calibrate.mjs) y se
// cachean en disco. Si no existen, /picks/top lo dice claro en vez de
// inventar numeros.
const calibrated = await loadJson('calibrated-buckets.json');
let buckets = calibrated?.buckets ?? null;
let upcomingCache = null;
let upcomingAt = 0;

// Ratings precalculados desde football-data.co.uk (historico con cuotas).
// Se construyen una vez y se cachean: recalcularlos en cada peticion
// tardaria minutos.
let ratingsCache = null;

const getRatings = async () => {
  if (ratingsCache) return ratingsCache;
  try {
    const raw = JSON.parse(await readFile(join(ROOT, 'data', 'ratings.json'), 'utf8'));
    ratingsCache = raw;
  } catch {
    ratingsCache = { teams: {} };
  }
  return ratingsCache;
};

const attachPrediction = async rows => {
  const ratings = await getRatings();
  return rows
    .map(row => {
      const market = row.odds ? implied(row.odds) : null;
      if (!market) return { ...row, market: null, prediction: null };
      const home = normalizeTeam(row.homeTeam);
      const away = normalizeTeam(row.awayTeam);
      if (!ratings.teams[home] || !ratings.teams[away]) {
        return { ...row, market, prediction: null };
      }
      return { ...row, market, prediction: predictMatch(ratings, { homeTeam: home, awayTeam: away }) };
    })
    .filter(row => row.prediction && row.market);
};

const refreshUpcoming = async () => {
  const fresh = Date.now() - upcomingAt < 5 * 60 * 1000;
  if (upcomingCache && fresh) return upcomingCache;

  const targets = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'mex.1'];
  const rows = await Promise.allSettled(targets.map(l => upcoming(l, 3)));
  const raw = rows
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(m => m.status !== 'post');
  upcomingCache = await attachPrediction(raw);
  upcomingAt = Date.now();
  console.log(`[server] upcoming: ${raw.length} partidos, ${upcomingCache.length} con modelo+mercado`);
  return upcomingCache;
};

const json = (res, body, code = 200) => {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
  });
  res.end(JSON.stringify(body));
};

const lanAddress = () => {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    json(res, {});
    return;
  }

  try {
    if (path === '/health') {
      return json(res, {
        ok: true,
        calibrado: Boolean(buckets && buckets.length > 0),
        upcomingConDatos: upcomingCache?.length ?? null,
        upcoming: upcomingCache?.length ?? null,
        ahora: new Date().toISOString(),
      });
    }

    if (path === '/leagues') {
      return json(res, Object.entries(LEAGUES).map(([code, name]) => ({ code, name })));
    }

    if (path === '/matches/live') {
      const rows = await liveNow();
      return json(res, { matches: rows });
    }

    if (path === '/picks/top' || path === '/picks/specials') {
      if (!buckets || buckets.length === 0) {
        return json(
          res,
          {
            error: 'sin_calibracion',
            detalle:
              'Todavia no hay calibracion medida. Corre: node scripts/calibrate.mjs',
          },
          503,
        );
      }

      const upcomingRows = await refreshUpcoming();
      let picks = buildConsensusPicks(upcomingRows, buckets);

      const league = url.searchParams.get('league');
      if (league) picks = picks.filter(p => p.league === league);

      const minConfidence = Number(url.searchParams.get('minConfidence') ?? 0);
      if (minConfidence) picks = picks.filter(p => p.confidence >= minConfidence);

      const maxOdds = Number(url.searchParams.get('maxOdds') ?? 0);
      if (maxOdds) picks = picks.filter(p => p.odds && p.odds <= maxOdds);

      const limit = Number(url.searchParams.get('limit') ?? 20);
      return json(res, { picks: picks.slice(0, limit), total: picks.length });
    }

    // Movimiento de linea y goles esperados del mercado, leido de OddsMath.
    // ?url=<partido de oddsmath>&mercado=O/U 2.5 (por defecto).
    if (path === '/mercado') {
      const urlPartido = url.searchParams.get('url');
      if (!urlPartido || !urlPartido.includes('oddsmath.com')) {
        return json(res, {
          error: 'url_invalida',
          detalle: 'Falta ?url=https://www.oddsmath.com/football/... o no es de oddsmath.',
        }, 400);
      }
      // solo lectura de paginas publicas; el motor cachea 5 min en disco
      const { leerMercado } = await import('../engine/mercado.mjs');
      const mercado = url.searchParams.get('mercado') ?? 'O/U 2.5';
      const datos = await leerMercado(urlPartido, mercado);
      if (!datos.casas?.length) {
        return json(res, {
          error: 'sin_datos',
          detalle: `Ninguna casa publico grafico de ${mercado} para ese partido.`,
          mercado,
        }, 404);
      }
      return json(res, datos);
    }

    return json(res, { error: 'no_encontrado', path }, 404);
  } catch (error) {
    return json(res, { error: 'error_servidor', detalle: String(error) }, 500);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddress();
  console.log(`[server] escuchando en 0.0.0.0:${PORT}`);
  console.log(`[server] desde esta maquina:  http://localhost:${PORT}/health`);
  if (lan) console.log(`[server] desde tu telefono:    http://${lan}:${PORT}/health`);
  console.log(`[server] calibracion: ${buckets ? 'cargada' : 'PENDIENTE (node scripts/calibrate.mjs)'}`);
});