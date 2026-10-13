/**
 * Lectura del mercado de OddsMath desde el telefono.
 *
 * POR QUE NO HAY SERVIDOR: la app es estatica (lee picks.json de
 * raw.githubusercontent). React Native no aplica CORS, asi que el
 * fetch directo a oddsmath funciona igual que desde el navegador.
 *
 * POR QUE NO SE GOLPEA EL SITIO: cada URL se pide una vez y se
 * guarda en memoria (cache del modulo) con el HTML crudo. Cambiar de
 * mercado en la misma pestana NO vuelve a pedir la pagina. El throttle
 * de 2 s entre peticiones evita ráfaga si el usuario cambia de casa o
 * de mercado varias veces seguidas.
 *
 * Que calcula:
 *  - P(Over linea) sin margen, por casa, de la serie de toda la pagina.
 *  - Goles esperados del mercado (lambda) por Poisson: los goles que el
 *    PRECIO implica, no un xG de modelo. Es la referencia contra la que
 *    comparar el xG propio: si el modelo dice 2.7 y el mercado 2.3, esa
 *    diferencia es la tesis.
 *  - Direccion y magnitud del movimiento en las ultimas 24 h (mismo
 *    tramo para todas las casas, para que sean comparables).
 *
 * La advertencia que ya sevio en el backtest: la linea movida NO es
 * ventaja por si sola (1X2 51.8% p=0.70 = moneda). Esto es para
 * VER que hace el mercado, no para apostar.
 */

// --- ids de mercado en OddsMath (sacados del id al final de la URL del chart) ---
export type MercadoId = '1X2' | 'O/U 1.5' | 'O/U 2.5' | 'O/U 3.5';
const MERCADOS: Record<MercadoId, number> = { '1X2': 0, 'O/U 1.5': 7, 'O/U 2.5': 6, 'O/U 3.5': 8 };

// peso bajo en casas que publican la misma serie (1XBET ~ Marathonbet).
interface CasaDef { id: number; nombre: string; peso: number }
const CASAS: CasaDef[] = [
  { id: 87, nombre: 'BetInAsia', peso: 1 },
  { id: 32, nombre: '1XBET', peso: 0.5 },
  { id: 38, nombre: 'Marathonbet', peso: 0.5 },
  { id: 16, nombre: 'Betway', peso: 1 },
  { id: 8, nombre: 'SBOBET', peso: 1 },
];

export interface PuntoSerie { over: number; under: number }
export interface Diagnostico {
  casa: string; peso: number; n: number; linea: number;
  pOverApertura: number; pOverCierre: number; pOver24h: number | null;
  deltaTotalPP: number; delta24hPP: number;
  direccion: 'hacia Over' | 'hacia Under' | 'plano';
  lambdaApertura: number | null; lambdaCierre: number | null;
  veredicto: 'plano' | 'movimiento menor' | 'movimiento marcado';
  ultimoTs: string | null;
}
export interface LecturaMercado {
  mercado: MercadoId; lineaGol: number;
  casas: Diagnostico[];
  consenso: {
    nCasas: number; pOverApertura: number; pOverCierre: number; deltaPP: number;
    direccion: 'hacia Over' | 'hacia Under' | 'plano';
    lambdaMercado: number | null; veredicto: 'plano' | 'movido';
  } | null;
  error?: string;
}

// --- Poisson ---
const fact = (n: number) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const poisson = (k: number, l: number) => Math.exp(-l) * l ** k / fact(k);
const cdf = (l: number, n: number) => { let s = 0; for (let k = 0; k <= n; k++) s += poisson(k, l); return s; };

/** Lambda (goles esperados) que produce la P(Over linea) del mercado. */
export function lambdaDesdeProb(overProb: number, linea: number): number | null {
  if (!(overProb > 0.02 && overProb < 0.98) || !Number.isFinite(linea)) return null;
  let lo = 0.05, hi = 7;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (1 - cdf(mid, linea) < overProb) lo = mid; else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

/** Probabilidad sin margen (libro justo permitido). */
export function probSinMargen(over: number, under: number): number | null {
  if (!(over > 1 && under > 1)) return null;
  const libro = 1 / over + 1 / under;
  if (!(libro >= 1)) return null;
  return 1 / over / libro;
}

/**
 * Lee el array JSON que empieza despues de `desde` contando corchetes y
 * respetando cadenas. Necesario porque el HTML anida corchetes en `data`
 * y cierra con "],;" (coma final) que JSON estricto rechaza.
 */
export function leerJsonArray(texto: string, desde = 0): any[] {
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
        for (const cand of [bruto, bruto.replace(/,\s*([\]}])/g, '$1')]) {
          try { const v = JSON.parse(cand); if (Array.isArray(v)) return v; } catch { /* siguiente */ }
        }
        return [];
      }
    }
  }
  return [];
}

/**
 * Serie temporal de un chart de OddsMath.
 * Formato real: local_dates = {"1":"2026-10-12 10:00:00",...} (UTC)
 *               all_data = [{label:"O", data:[[idx,cuota],...]}, {label:"U",...}]
 */
export function parseSerie(html: string): { puntos: PuntoSerie[]; ts: number[] } {
  const mF = html.match(/local_dates\s*=\s*(\{[\s\S]*?\});/);
  if (!mF) return { puntos: [], ts: [] };
  let fechas: Record<string, string>;
  try { fechas = JSON.parse(mF[1]); } catch { return { puntos: [], ts: [] }; }

  const tsDe = (idx: number) => {
    const s = fechas[String(idx)]; if (!s) return null;
    const t = Date.parse(s.replace(' ', 'T') + 'Z'); // OddsMath publica UTC
    return Number.isFinite(t) ? t : null;
  };

  const series = leerJsonArray(html, html.indexOf('all_data'));
  const ov: Record<string, number> = {}, un: Record<string, number> = {};
  for (const s of series) {
    const lbl = String(s.label || '').toUpperCase();
    const dest = lbl.startsWith('O') && !lbl.startsWith('U') ? ov : lbl.startsWith('U') ? un : null;
    if (!dest) continue;
    for (const par of s.data || []) {
      const [idx, cuota] = par;
      if (typeof cuota === 'number' && cuota > 1) dest[String(idx)] = cuota;
    }
  }
  if (!Object.keys(ov).length || !Object.keys(un).length) return { puntos: [], ts: [] };

  const puntos: PuntoSerie[] = [], ts: number[] = [];
  for (const idx of Object.keys(ov)) {
    const o = ov[idx], u = un[idx], t = tsDe(Number(idx));
    if (o && u && t) { puntos.push({ over: o, under: u }); ts.push(t); }
  }
  const orden = ts.map((_, i) => i).sort((a, b) => ts[a] - ts[b]);
  return { puntos: orden.map(i => puntos[i]), ts: orden.map(i => ts[i]) };
}

/** Direccion y magnitud del movimiento, con ventana fija de 24 h. */
export function diagnosticar(puntos: PuntoSerie[], ts: number[], linea: number): Omit<Diagnostico, 'casa' | 'peso'> | null {
  if (puntos.length < 4 || ts.length < 4) return null;
  const probs = puntos.map(p => probSinMargen(p.over, p.under)).filter((p): p is number => p != null);
  if (probs.length < 4) return null;

  const primero = probs[0], ultimo = probs[probs.length - 1];
  const fin = ts[ts.length - 1], corte = fin - 24 * 3600e3;
  const desde = ts.findIndex(t => t >= corte);
  const ventana = probs.slice(desde >= 0 ? desde : 0);
  const pVentana = ventana[0];

  const d24 = (ultimo - pVentana) * 100;
  return {
    n: probs.length, linea,
    pOverApertura: Math.round(primero * 1000) / 10,
    pOverCierre: Math.round(ultimo * 1000) / 10,
    pOver24h: Math.round(pVentana * 1000) / 10,
    deltaTotalPP: Math.round((ultimo - primero) * 100 * 10) / 10,
    delta24hPP: Math.round(d24 * 10) / 10,
    direccion: d24 > 0 ? 'hacia Over' : d24 < 0 ? 'hacia Under' : 'plano',
    lambdaApertura: lambdaDesdeProb(primero, linea),
    lambdaCierre: lambdaDesdeProb(ultimo, linea),
    veredicto: Math.abs(d24) < 1 ? 'plano' : Math.abs(d24) < 2.5 ? 'movimiento menor' : 'movimiento marcado',
    ultimoTs: new Date(fin).toISOString(),
  };
}

// --- cache en memoria + throttle ---
const cacheHtml = new Map<string, string>();
let ultimaPeticion = 0;
const THROTTLE_MS = 2000;

async function bajar(url: string): Promise<string> {
  const guardado = cacheHtml.get(url);
  if (guardado) return guardado;
  const ahora = Date.now();
  const espera = Math.max(0, THROTTLE_MS - (ahora - ultimaPeticion));
  if (espera) await new Promise<void>(r => setTimeout(() => r(), espera));
  ultimaPeticion = Date.now();
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  cacheHtml.set(url, html);
  return html;
}

/** Limpia la cache (boton "recargar"). */
export function limpiarCacheMercado() { cacheHtml.clear(); }

/**
 * Analiza un partido de OddsMath para un mercado dado.
 * Descarga SOLO los charts de las casas que falten (las demas salen
 * de la cache), y omite en silencio las casas que no publican ese grafico.
 */
export async function leerMercado(urlPartido: string, mercado: MercadoId = 'O/U 2.5'): Promise<LecturaMercado> {
  const mid = MERCADOS[mercado];
  const lineaGol = parseFloat(mercado.replace(/^O\/U\s*/, ''));
  if (mid == null) return { mercado, lineaGol: NaN, casas: [], consenso: null, error: `Mercado no soportado: ${mercado}` };

  const base = urlPartido.split('#')[0].split('?')[0].replace(/\/chart\/.*/, '').replace(/\/?$/, '/');
  const casas: Diagnostico[] = [];

  for (const c of CASAS) {
    try {
      const html = await bajar(`${base}chart/${mid}/${c.id}/`);
      const { puntos, ts } = parseSerie(html);
      const d = diagnosticar(puntos, ts, lineaGol);
      if (d) casas.push({ casa: c.nombre, peso: c.peso, ...d });
    } catch { /* esa casa no tiene el grafico: se omite sin ruido */ }
  }

  if (!casas.length) {
    return { mercado, lineaGol, casas: [], consenso: null, error: `Ninguna casa publica grafico de ${mercado} para ese partido.` };
  }

  const pesoTot = casas.reduce((a, c) => a + c.peso, 0);
  const media = (k: 'pOverApertura' | 'pOverCierre') => casas.reduce((a, c) => a + c[k] * c.peso, 0) / pesoTot;
  const pCierre = media('pOverCierre'), pApertura = media('pOverApertura');

  return {
    mercado, lineaGol, casas,
    consenso: {
      nCasas: casas.length,
      pOverApertura: Math.round(pApertura * 10) / 10,
      pOverCierre: Math.round(pCierre * 10) / 10,
      deltaPP: Math.round((pCierre - pApertura) * 10) / 10,
      direccion: pCierre > pApertura ? 'hacia Over' : pCierre < pApertura ? 'hacia Under' : 'plano',
      lambdaMercado: lambdaDesdeProb(pCierre / 100, lineaGol),
      veredicto: Math.abs(pCierre - pApertura) < 1 ? 'plano' : 'movido',
    },
  };
}