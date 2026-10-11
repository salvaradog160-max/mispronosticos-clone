/**
 * Cuotas historicas de ESPN via la API "core".
 *
 * site.api.espn.com (la que usa el provider normal) devuelve `odds: [null]`
 * para partidos ya jugados. sports.core.api.espn.com SI las devuelve,
 * con apertura y cierre. Eso permite calibrar las ligas de america con
 * sus propias cuotas en vez de heredar la tabla europea.
 *
 * Es un request por partido, asi que va con concurrencia limitada y se
 * cachea aparte: los partidos ya jugados no cambian de cuota.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const leerCache = async () => {
  try {
    return JSON.parse(await readFile(CACHE, 'utf8'));
  } catch {
    return {};
  }
};

const guardarCache = async cache => {
  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache));
};
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues';
const CACHE = join(ROOT, 'data', 'odds-historicas.json');

const americano = n => (n >= 0 ? n + 100 : n - 100) / 100;

/**
 * Cuota americana -> decimal. Una cuota americana siempre vale >=100 o
 * <=-100; una decimal vive entre 1 y ~400. El umbral va en 100 porque
 * un +115 americano es 2.15 en decimal, pero si lo miro como numero
 * "115 > 1" lo tomaria por decimal.
 */
const desdeAmericano = v => americano(Number(v));

const decimal = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.decimal !== undefined && v.decimal !== null) return Number(v.decimal);
    const alt = v.alternateDisplayValue ?? v.american ?? v.value;
    if (alt === undefined || alt === null) return null;
    const n = Number(alt);
    return Math.abs(n) >= 100 || n <= -1 ? desdeAmericano(n) : n;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) >= 100 ? desdeAmericano(n) : n;
};

/** La linea de goles vive en alternateDisplayValue ("2.5"), no en value. */
const lineaDe = bloque => {
  const cand = bloque?.total?.alternateDisplayValue ?? bloque?.total?.american ?? bloque?.total?.value;
  const n = Number(String(cand ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Cuotas de un partido ya jugado.
 * @returns {apertura, cierre, total} con 1X2 y over/under en decimal.
 */
export const oddsDe = async (liga, eventId) => {
  const url = `${CORE}/${liga}/events/${eventId}/competitions/${eventId}/odds`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;

  const data = await res.json();
  const item = (data.items ?? [])[0];
  if (!item) return null;

  const ap = item.open ?? {};
  const ci = item.close ?? {};
  const h = item.homeTeamOdds ?? {};
  const a = item.awayTeamOdds ?? {};

  const entrada = {
    // Apertura: el core la da en decimal.
    H: decimal(h.open?.moneyLine),
    D: decimal(ap.draw),
    A: decimal(a.open?.moneyLine),
    // Cierre: en americano, hay que convertirlo.
    Hc: decimal(h.moneyLine),
    Dc: decimal(ci.draw ?? item.drawOdds?.moneyLine),
    Ac: decimal(a.moneyLine),
    // Total de goles.
    linea: lineaDe(ci) ?? lineaDe(ap) ?? item.overUnder ?? null,
    over: decimal(ci.over ?? ap.over),
    under: decimal(ci.under ?? ap.under),
  };

  const completo = entrada.H && entrada.D && entrada.A && entrada.Hc && entrada.Dc && entrada.Ac;
  return completo ? entrada : null;
};

/**
 * Descarga las cuotas de una lista de partidos, saltando los que ya
 * estan en cache. Va por tandas: un request por partido son miles.
 */
export const descargarOdds = async (partidos, { concurrencia = 8, progreso } = {}) => {
  const cache = await leerCache();
  const faltan = partidos.filter(p => !cache[p.id]);

  let hechos = 0;
  const cola = [...faltan];

  const trabajador = async () => {
    while (cola.length > 0) {
      const p = cola.shift();
      try {
        const o = await oddsDe(p.league, p.eventId);
        if (o) cache[p.id] = o;
      } catch {
        // Un partido sin cuotas no rompe el lote.
      }
      hechos++;
      if (hechos % 100 === 0) {
        progreso?.(hechos, faltan.length);
        await guardarCache(cache);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  await guardarCache(cache);
  progreso?.(hechos, faltan.length);
  return cache;
};

/** Cuotas cacheadas de un partido, o null. */
export const oddsCacheadas = async eventId => (await leerCache())[eventId] ?? null;