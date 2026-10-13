/**
 * Lectura del mercado en OddsMath: series por casa, goles esperados
 * implicitos y direccion del dinero.
 *
 * Que resuelve y por que hace falta:
 *
 * - El pick de Over/Under se genera con la cuota de apertura. Si la linea
 *   se mueve 30 minutos antes del saque, ese pick ya no es el que se
 *   esta pagando, y la app lo muestra sin avisar. `movimiento.mjs` detecta
 *   ESO, pero no guarda la serie ni la magnitud.
 *
 * - "Goles esperados del mercado" NO es xG de un modelo: es la cantidad
 *   de goles que el precio implica. Se saca de la cuota Over sin margen
 *   con la formula de Poisson. Es la referencia contra la cual comparar
 *   el xG del modelo propio. Si el modelo dice 2.7 y el mercado 2.3,
 *   la diferencia ES la tesis (y hay que poder verla).
 *
 * - "En que esta apostando la gente": el exchange (Betfair) es el unico
 *   lugar donde el volumen es dinero real. Las casas ajustan por riesgo
 *   propio y no por opinion del mercado. Por eso el dinero se lee de
 *   Betfair, no del promedio de casas.
 *
 * Fuente: paginas publicas /chart/<mercado>/<casa>/. Mismo origen que
 * usa el Lector del dashboard; oddsmath permite esto en su robots.txt y
 * no prohibe el acceso en sus terminos (uso personal, con pausa).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CACHE = join(process.env.HOME || '/tmp', '.cache', 'pronogol-mercado');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CACHE_MIN = 5;

/** id del chart por mercado. El id aparece al final de la URL del grafico. */
export const MERCADOS = {
  '1X2': 0,
  'O/U 1.5': 7,
  'O/U 2.5': 6,
  'O/U 3.5': 8,
};

/**
 * Casas y su id en oddsmath. BetInAsia (87) es la de referencia: es la
 * que.publish odds sin margenasia y la que usa el Lector.
 * `peso` baja la confianza: 1XBET y Marathonbet publican la misma serie
 * (a veces Bettogoal = Suprabets), asi que no cuentan como independientes.
 */
export const CASAS = [
  { id: 87, nombre: 'BetInAsia', peso: 1 },
  { id: 32, nombre: '1XBET', peso: 0.5 },
  { id: 38, nombre: 'Marathonbet', peso: 0.5 },
  { id: 16, nombre: 'Betway', peso: 1 },
  { id: 8, nombre: 'SBOBET', peso: 1 },
];

// --- Poisson: probabilidad de un total exacto de goles ---
const fact = n => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const poisson = (k, lambda) => Math.exp(-lambda) * lambda ** k / fact(k);
const CDF = (lambda, n) => { let s = 0; for (let k = 0; k <= n; k++) s += poisson(k, lambda); return s; };

/**
 * Lambda que hace que P(Over linea) iguale la probabilidad de mercado.
 * Bisección: el modelo es monótono en lambda, así que converge siempre.
 * Devuelve null si la probabilidad no corresponde a ninguna lambda real.
 */
export function lambdaDesdeProb(overProb, linea) {
  if (!(overProb > 0.02 && overProb < 0.98) || !Number.isFinite(linea)) return null;
  let lo = 0.05, hi = 7;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const p = 1 - CDF(mid, linea); // P(Over linea) con Poisson(lambda)
    if (p < overProb) lo = mid; else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

/** Probabilidad de mercado sin margen a partir de las dos cuotas. */
export function probSinMargen(over, under) {
  if (!(over > 1 && under > 1)) return null;
  const libro = 1 / over + 1 / under;
  // Un libro justo (== 1) es legitimo: es una apuesta sin margen.
  // Solo se rechaza si el libro es 0, o si es NaN por datos malos.
  if (!(libro >= 1)) return null;
  return 1 / over / libro;
}

// --- descarga con cache en disco ---
async function bajar(url, cacheMin = CACHE_MIN) {
  await mkdir(CACHE, { recursive: true });
  const f = join(CACHE, createHash('sha1').update(url).digest('hex') + '.html');
  try {
    const st = await import('node:fs/promises').then(m => m.stat(f));
    if (Date.now() - st.mtimeMs < cacheMin * 60000) {
      return { html: await readFile(f, 'utf8'), cacheado: true };
    }
  } catch { /* no existe: se descarga */ }

  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  const html = await r.text();
  await mkdir(dirname(f), { recursive: true });
  await writeFile(f, html).catch(() => {});
  return { html, cacheado: false };
}

/**
 * Lee un array JSON que empieza en el primer '[' DESPUES de `desde`,
 * contando corchetes y respetando cadenas. Devuelve [] si no cierra.
 *
 * Hace falta porque el HTML de OddsMath anida corchetes dentro de `data`
 * y cierra con "],;" (coma antes del punto y coma), asi que una regex
 * lazy "[\\s\\S]*?]" cortaria en el primer corchete interno.
 */
export function leerJsonArray(texto, desde = 0) {
  if (desde < 0) return [];
  const ini = texto.indexOf('[', desde);
  if (ini < 0) return [];
  let nivel = 0, enCadena = false, esc = false;
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === '[') nivel++;
    else if (c === ']') {
      nivel--;
      if (nivel === 0) {
        const bruto = texto.slice(ini, i + 1);
        // OddsMath deja coma final (",]" / "},"]) que JSON estricto rechaza
        for (const cand of [bruto, bruto.replace(/,\s*([\]}])/g, '$1')]) {
          try {
            const v = JSON.parse(cand);
            if (Array.isArray(v)) return v;
          } catch { /* siguiente intento */ }
        }
        return [];
      }
    }
  }
  return [];
}

/**
 * Saca la serie temporal de un chart de OddsMath.
 *
 * Formato real de la pagina (verificado 2026-10-13):
 *   var local_dates = {"1":"2026-10-08 00:42:13", ...}   -> objeto indexado, UTC
 *   var all_data = [{"label":"O","label_long":"Over 2.5",
 *                    "data":[[1,1.787],[2,1.763],...]}, ...]
 *
 * `data` son pares [indice, cuota] y el indice es la clave de local_dates.
 * Cada serie trae Over y Under (a veces tambien el inverso del exchange).
 */
export function parseSerie(html) {
  // --- fechas ---
  const mFechas = html.match(/local_dates\s*=\s*(\{[\s\S]*?\});/);
  if (!mFechas) return { puntos: [], ts: [] };
  let fechas;
  try { fechas = JSON.parse(mFechas[1]); } catch { return { puntos: [], ts: [] }; }

  const tsDe = idx => {
    const s = fechas[String(idx)];
    if (!s) return null;
    const t = new Date(s.replace(' ', 'T') + 'Z').getTime(); // OddsMath publica UTC
    return Number.isFinite(t) ? t : null;
  };

  // --- series ---
  // El array cierra como "],;" (con coma) no "];", y el cuerpo contiene
  // otros corchetes anidados, asi que se corta por el terminador real.
  const iDatos = html.indexOf('all_data');
  const series = leerJsonArray(html, iDatos);
  if (!series.length) return { puntos: [], ts: [] };

  const aPuntos = {};
  for (const s of series) {
    const lbl = String(s.label || '').toUpperCase();
    const esOver = lbl.startsWith('O') && !lbl.startsWith('U');
    const esUnder = lbl.startsWith('U');
    if (!esOver && !esUnder) continue;
    const destino = esOver ? (aPuntos.over ||= {}) : (aPuntos.under ||= {});
    for (const par of s.data || []) {
      const [idx, cuota] = par;
      if (typeof cuota === 'number' && cuota > 1) destino[String(idx)] = cuota;
    }
  }
  if (!aPuntos.over || !aPuntos.under) return { puntos: [], ts: [] };

  // --- une por indice ---
  const puntos = [], ts = [];
  for (const idx of Object.keys(aPuntos.over)) {
    const o = aPuntos.over[idx], u = aPuntos.under[idx], t = tsDe(idx);
    if (o && u && t) { puntos.push({ over: o, under: u }); ts.push(t); }
  }
  // la pagina puede traer los indices desordenados: se ordena por tiempo
  const orden = ts.map((t, i) => i).sort((a, b) => ts[a] - ts[b]);
  return {
    puntos: orden.map(i => puntos[i]),
    ts: orden.map(i => ts[i]),
  };
}

/** Resumen de direccion y magnitud del movimiento de una serie. */
export function diagnosticar(puntos, ts, linea = 2.5) {
  if (puntos.length < 4) return { suficiente: false, n: puntos.length };

  const probs = puntos.map(p => probSinMargen(p.over, p.under));
  const conP = probs.filter(p => p != null);
  if (conP.length < 4) return { suficiente: false, n: puntos.length };

  const primero = conP[0], ultimo = conP[conP.length - 1];
  // ventana final: ultimas 24h del rango disponible (mismo tramo para todas las casas)
  const fin = ts[ts.length - 1], corte = fin - 24 * 3600e3;
  const desde = ts.findIndex(t => t >= corte);
  const idx = desde >= 0 ? desde : 0;
  const ventana = conP.slice(idx);
  const aperturaVentana = ventana[0];

  const dTotal = (ultimo - primero) * 100;
  const d24 = (ultimo - aperturaVentana) * 100;

  // magnitud: cambios individuales mayores a 0.8 pp
  const saltos = [];
  for (let i = 1; i < conP.length; i++) {
    const d = (conP[i] - conP[i - 1]) * 100;
    if (Math.abs(d) >= 0.8) saltos.push({ ts: ts[i], pp: Math.round(d * 10) / 10 });
  }

  const veredicto =
    Math.abs(d24) < 1 ? 'plano' : Math.abs(d24) < 2.5 ? 'movimiento menor' : 'movimiento marcado';

  return {
    suficiente: true,
    n: conP.length,
    linea,
    pOverApertura: Math.round(primero * 1000) / 10,
    pOverCierre: Math.round(ultimo * 1000) / 10,
    pOver24h: aperturaVentana != null ? Math.round(aperturaVentana * 1000) / 10 : null,
    deltaTotalPP: Math.round(dTotal * 10) / 10,
    delta24hPP: Math.round(d24 * 10) / 10,
    direccion: d24 > 0 ? 'hacia Over' : d24 < 0 ? 'hacia Under' : 'plano',
    lambdaApertura: lambdaDesdeProb(primero, linea),
    lambdaCierre: lambdaDesdeProb(ultimo, linea),
    saltos: saltos.slice(-8),
    veredicto,
    ultimoTs: fin ? new Date(fin).toISOString() : null,
  };
}

/**
 * Lee un mercado de un partido en todas las casas conocidas y devuelve
 * el diagnostico de cada una mas un consenso ponderado.
 */
export async function leerMercado(urlPartido, mercado = 'O/U 2.5') {
  const mid = MERCADOS[mercado];
  if (mid == null) throw new Error(`Mercado no soportado: ${mercado}`);
  const base = urlPartido.split('#')[0].split('?')[0].replace(/\/chart\/.*/, '').replace(/\/?$/, '/');
  const lineaGol = parseFloat(String(mercado).replace(/^O\/U\s*/, ''));
  if (!Number.isFinite(lineaGol)) throw new Error(`No se pudo leer la linea de goles de: ${mercado}`);

  const casas = [];
  for (const c of CASAS) {
    try {
      const { html } = await bajar(`${base}chart/${mid}/${c.id}/`);
      const { puntos, ts } = parseSerie(html);
      const d = diagnosticar(puntos, ts, lineaGol);
      if (d.suficiente) casas.push({ ...c, ...d });
    } catch { /* esa casa no tiene el chart en este partido: se omite */ }
  }

  if (!casas.length) return { mercado, casas: [], consenso: null };

  // consenso ponderado por peso de casa (las duplicadas pesan menos)
  const pesoTot = casas.reduce((s, c) => s + c.peso, 0);
  const media = k => casas.reduce((s, c) => s + (c[k] ?? 0) * c.peso, 0) / pesoTot;
  const pCierre = media('pOverCierre');
  const pApertura = media('pOverApertura');

  return {
    mercado,
    lineaGol,
    casas,
    consenso: {
      nCasas: casas.length,
      pOverApertura: Math.round(pApertura * 10) / 10,
      pOverCierre: Math.round(pCierre * 10) / 10,
      deltaPP: Math.round((pCierre - pApertura) * 10) / 10,
      direccion: pCierre > pApertura ? 'hacia Over' : pCierre < pApertura ? 'hacia Under' : 'plano',
      // pOverCierre viene en puntos porcentuales (0-100); la formula
      // de Poisson espera probabilidad (0-1).
      lambdaMercado: lambdaDesdeProb(pCierre / 100, lineaGol),
      veredicto: Math.abs(pCierre - pApertura) < 1 ? 'plano' : 'movido',
    },
  };
}