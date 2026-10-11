/**
 * Cuotas historicas via RapidAPI "sportapi7" (proveedor rapidsportapi).
 *
 * Es la unica fuente encontrada que devuelve apertura Y cierre para
 * ligas fuera de Europa (Liga MX, MLS, Brasil, Argentina, Colombia).
 * El endpoint oficial de Sofascore devuelve 403 desde IPs de datacenter
 * y su mirror en RapidAPI (`sofascore.p.rapidapi.com`) responde
 * "Endpoint does not exist": autentica pero no tiene API montada.
 *
 * OJO con el formato: las cuotas vienen FRACCIONALES (ingles, "61/100"),
 * no decimales. Hay que convertirlas siempre antes de comparar.
 *
 *   decimal = (numerador / denominador) + 1
 *
 * Endpoints usados:
 *   GET /api/v1/category/{id}/scheduled-events/{date}   partidos por fecha
 *   GET /api/v1/event/{id}/odds/1/all                   cuotas 1X2 / O-U
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(ROOT, 'data', 'odds-sportapi.json');
const HOST = process.env.SPORTAPI_HOST || 'sportapi7.p.rapidapi.com';
const KEY = process.env.SPORTAPI_KEY || '';

/** uniqueTournament id por liga, en el espacio de ids de Sofascore. */
export const TORNEOS = {
  E1: 17, SP1: 8, I1: 23, D1: 35, F1: 34, N1: 37, P1: 238,
  B1: 325, T1: 52, G1: 185, SC0: 36,
  'mex.1': 11621, 'arg.1': 155, 'col.1': 11539, 'chi.1': 11653,
};

/** category id (pais) -> nombre, para listar partidos por fecha. */
export const CATEGORIAS = {
  E1: 1, SP1: 32, I1: 31, D1: 30, F1: 7, N1: 35, P1: 44,
  B1: 13, T1: 46, G1: 67, SC0: 22,
  'mex.1': 12, 'arg.1': 48, 'col.1': 274, 'chi.1': 49,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const pedir = async (path, intentos = 3) => {
  if (!KEY) throw new Error('SPORTAPI_KEY no configurada');
  for (let i = 0; i < intentos; i++) {
    const res = await fetch(`https://${HOST}${path}`, {
      headers: { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST },
    });
    if (res.ok) return res.json();

    const cuerpo = await res.text().catch(() => '');
    // La cuota mensual no se recupera reintentando: hay que decirlo de
    // inmediato para no seguir gastando tiempo y requests en un 403.
    if (res.status === 429 && /quota/i.test(cuerpo)) {
      throw new Error('CUOTA_AGOTADA: plan sin requests disponibles este mes');
    }
    if (res.status === 429) { await sleep(1500 * (i + 1)); continue; }
    throw new Error(`${path} -> HTTP ${res.status}: ${cuerpo.slice(0, 120)}`);
  }
  throw new Error(`${path} -> sin respuesta tras ${intentos} intentos`);
};

/**
 * Cuota fraccional ("61/100", "11/25") -> decimal.
 * "61/100" son 0.61 unidades netas, o sea 1.61 en decimal.
 * Devuelve null si el formato no es el esperado, para no inventar un
 * numero: una cuota mal parseada contaminaria la calibracion entera.
 */
export const fraccionalADecimal = valor => {
  if (valor === null || valor === undefined) return null;
  const partes = String(valor).split('/');
  if (partes.length !== 2) return null;
  const num = Number(partes[0]);
  const den = Number(partes[1]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  const decimal = num / den + 1;
  return decimal > 1 ? Number(decimal.toFixed(3)) : null;
};

/**
 * Cuotas 1X2 de un partido.
 * Devuelve { apertura: {1,X,2}, cierre: {1,X,2} } en decimal, o null si
 * el partido no tiene mercado 1X2 completo.
 */
export const cuotas1x2 = payload => {
  const mercados = (payload?.markets || []).filter(
    m => m.marketGroup === '1X2' && m.marketPeriod === 'Full-time'
  );
  if (!mercados.length) return null;

  const leer = (campo) => {
    const salida = {};
    for (const c of mercados[0].choices || []) {
      const v = fraccionalADecimal(c[campo]);
      if (v !== null) salida[c.name] = v;
    }
    return salida;
  };

  const apertura = leer('initialFractionalValue');
  const cierre = leer('fractionalValue');
  const completa = o => ['1', 'X', '2'].every(k => Number.isFinite(o[k]));
  if (!completa(apertura) || !completa(cierre)) return null;
  return { apertura, cierre };
};

/** Parte la cuota decimal sin margen en probabilidades. */
export const sinMargen = mercado => {
  const claves = Object.keys(mercado);
  const inversas = claves.map(k => 1 / mercado[k]);
  const suma = inversas.reduce((a, b) => a + b, 0);
  const salida = {};
  claves.forEach((k, i) => { salida[k] = Number((inversas[i] / suma).toFixed(4)); });
  return salida;
};

const leerCache = async () => {
  try { return JSON.parse(await readFile(CACHE, 'utf8')); }
  catch { return {}; }
};

const guardarCache = async cache => {
  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache));
};

/**
 * Cuotas de un evento concreto, con cache en disco.
 * Un partido ya jugado no cambia de cuota, asi que la cache es segura.
 */
export const cuotasEvento = async (eventId, { cache = null } = {}) => {
  const propia = cache === null;
  const almacen = propia ? await leerCache() : cache;
  if (almacen[eventId]) return almacen[eventId];

  try {
    const payload = await pedir(`/api/v1/event/${eventId}/odds/1/all`);
    const cuotas = cuotas1x2(payload);
    const registro = cuotas
      ? { eventId, ...cuotas, probApertura: sinMargen(cuotas.apertura), probCierre: sinMargen(cuotas.cierre) }
      : { eventId, sinCuotas: true };
    almacen[eventId] = registro;
    if (propia) await guardarCache(almacen);
    return registro;
  } catch (err) {
    almacen[eventId] = { eventId, error: String(err.message || err) };
    if (propia) await guardarCache(almacen);
    return almacen[eventId];
  }
};

/**
 * Partidos de una liga (pais) en una fecha YYYY-MM-DD.
 * Devuelve { eventos, error }. Antes esto devolvia [] en silencio y un
 * "0 partidos" parecia "no hubo partidos ese dia", cuando en realidad
 * era cuota agotada. esos dos casos hay que distinguirlos.
 */
export const partidosDelDia = async (liga, fecha) => {
  const cat = CATEGORIAS[liga];
  if (!cat) return { eventos: [], error: `liga desconocida: ${liga}` };
  try {
    const payload = await pedir(`/api/v1/category/${cat}/scheduled-events/${fecha}`);
    return { eventos: payload.events || [], error: null };
  } catch (err) {
    return { eventos: [], error: String(err.message || err) };
  }
};

/** true si la API respondio que se acabo la cuota del plan. */
export const cuotaAgotada = error => /quota/i.test(String(error || ''));

/**
 * Cuotas concurrentes para una lista de eventos, con limite deconcurrencia
 * para no comerse la cuota de la API de un jalon.
 */
export const cuotasLote = async (eventIds, concurrencia = 5) => {
  const cache = await leerCache();
  const pendientes = eventIds.filter(id => !cache[id]);
  const salida = {};

  let i = 0;
  const worker = async () => {
    while (i < pendientes.length) {
      const id = pendientes[i++];
      cache[id] = await cuotasEvento(id, { cache });
      salida[id] = cache[id];
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrencia, pendientes.length) }, worker)
  );
  if (pendientes.length) await guardarCache(cache);

  for (const id of eventIds) if (cache[id]) salida[id] = cache[id];
  return salida;
};