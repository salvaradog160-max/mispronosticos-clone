/**
 * Movimiento de cuota (apertura -> actual) desde Arbworld «Dropping Odds», leido en el telefono.
 *
 * Los terminos de Arbworld prohiben los robots sin permiso escrito (arbworld.net/info/privacy); usarlo asi es
 * decision del usuario (uso personal). Por eso este modulo es discreto, igual que el del servidor local
 * (pronostico_servidor/arbworld.py): una peticion por mercado, cache de 5 min, minimo 5 s entre peticiones
 * (el Crawl-delay de su robots.txt) y solo las paginas de tablas; NUNCA toca /api/ (vetado en robots.txt).
 * Los datos son del exchange de Betfair, no de las casas del usuario.
 */
import { afinidad } from './nombres';

export const BASE = 'https://arbworld.net/dropping-odds/football/';
export const UA = 'pronostico-local/1.0 (uso personal, bajo volumen)';
export const TTL_MS = 5 * 60 * 1000;
export const GAP_MS = 5000;

/** mercado -> [ruta, etiquetas de las columnas en el orden de la pagina] */
export const MERCADOS: Record<string, [string, string[]]> = {
  '1x2': ['1x2', ['1', 'X', '2']],
  ou15: ['over-under-1-5', ['under', 'over']],
  ou25: ['over-under-2-5', ['under', 'over']],
  ou35: ['over-under-3-5', ['under', 'over']],
};

export interface Resultado {
  et: string;
  apertura: number;
  actual: number;
  cambio_pct: number;
}
export interface Fila {
  casa: string;
  fuera: string;
  liga: string;
  utc: string;
  volumen: string | null;
  res: Resultado[];
}
export interface Respuesta {
  encontrado: boolean;
  error?: string;
  filas?: number;
  partido?: string;
  liga?: string;
  utc?: string;
  volumen_gbp?: string | null;
  invertido?: boolean;
  mercado?: string;
  fuente?: string;
  res?: Resultado[];
}

const FILA = /<tr class="[^"]*" data-row-key=[\s\S]*?<\/tr>/g;
const CELDA = /<span class="open">([^<]*)<\/span><span class="current">([^<]*)<\/span>/g;

const entidades = (t: string) =>
  t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&pound;/g, '£');

const attr = (fila: string, nombre: string): string => {
  const m = new RegExp(`\\b${nombre}="([^"]*)"`).exec(fila);
  return m ? entidades(m[1]) : '';
};

const num = (s: string): number | null => {
  const n = parseFloat(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const parsear = (texto: string, etiquetas: string[]): Fila[] => {
  const out: Fila[] = [];
  for (const fila of texto.match(FILA) ?? []) {
    const celdas = [...fila.matchAll(CELDA)];
    if (celdas.length < etiquetas.length) continue;
    const res: Resultado[] = [];
    let ok = true;
    for (let i = 0; i < etiquetas.length; i++) {
      const ap = num(celdas[i][1]);
      const ac = num(celdas[i][2]);
      if (ap === null || ac === null) {
        ok = false;
        break;
      }
      res.push({ et: etiquetas[i], apertura: ap, actual: ac, cambio_pct: Math.round((ac / ap - 1) * 1000) / 10 });
    }
    if (!ok) continue;
    const vol = /class="vl-vol">([^<]*)</.exec(fila);
    out.push({
      casa: attr(fila, 'data-home'),
      fuera: attr(fila, 'data-away'),
      liga: attr(fila, 'data-league'),
      utc: attr(fila, 'data-utc'),
      volumen: vol ? entidades(vol[1]).replace('£', '').replace(/,/g, '').trim() : null,
      res,
    });
  }
  return out;
};

export const elegir = (filas: Fila[], local: string, visita: string, mercado: string): Respuesta => {
  let mejor: Fila | null = null;
  let mejorPt = 0;
  let inv = false;
  for (const f of filas) {
    const a = Math.min(afinidad(local, f.casa), afinidad(visita, f.fuera));
    const b = Math.min(afinidad(local, f.fuera), afinidad(visita, f.casa));
    const [pt, vuelta] = a >= b ? [a, false] : [b, true];
    if (pt > mejorPt) {
      mejor = f;
      mejorPt = pt;
      inv = vuelta;
    }
  }
  if (!mejor || mejorPt < 0.6) {
    return {
      encontrado: false,
      filas: filas.length,
      error: `No encontré «${local} - ${visita}» entre las ${filas.length} filas de Arbworld (solo trae las 40 con más movimiento y partidos por jugar).`,
    };
  }
  let res = mejor.res;
  if (inv && mercado === '1x2') res = [{ ...res[2], et: '1' }, res[1], { ...res[0], et: '2' }];   // local/visita al reves: se voltean 1 y 2
  return {
    encontrado: true,
    partido: `${mejor.casa} - ${mejor.fuera}`,
    liga: mejor.liga,
    utc: mejor.utc,
    volumen_gbp: mejor.volumen,
    invertido: inv,
    mercado,
    fuente: 'Betfair Exchange vía Arbworld',
    res,
  };
};

type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface Deps {
  fetcher: Fetcher;
  ahora: () => number;
  dormir: (ms: number) => Promise<void>;
}

const depsReales = (): Deps => ({
  fetcher: (url, init) => fetch(url, init),
  ahora: () => Date.now(),
  dormir: ms => new Promise<void>(r => setTimeout(() => r(), ms)),
});

const cache = new Map<string, { t: number; texto: string }>();
let ultima = 0;
let cola: Promise<unknown> = Promise.resolve();

/** Pagina de un mercado con cache de 5 min y 5 s entre peticiones; las llamadas se encolan de a una. */
export const bajar = (ruta: string, d: Deps): Promise<string> => {
  const tarea = cola.then(async () => {
    const hit = cache.get(ruta);
    if (hit && d.ahora() - hit.t < TTL_MS) return hit.texto;
    const espera = GAP_MS - (d.ahora() - ultima);
    if (espera > 0) await d.dormir(espera);
    const r = await d.fetcher(BASE + ruta, { headers: { 'User-Agent': UA } });
    ultima = d.ahora();
    if (!r.ok) throw new Error(`Arbworld respondió ${r.status}`);
    const texto = await r.text();
    cache.set(ruta, { t: ultima, texto });
    return texto;
  });
  cola = tarea.catch(() => undefined);
  return tarea;
};

export const buscarArbworld = async (local: string, visita: string, mercado: string, d: Deps = depsReales()): Promise<Respuesta> => {
  const m = MERCADOS[mercado];
  if (!m) return { encontrado: false, error: `Mercado no soportado: ${mercado} (usa ${Object.keys(MERCADOS).join(', ')}).` };
  try {
    return elegir(parsear(await bajar(m[0], d), m[1]), local, visita, mercado);
  } catch (e) {
    return { encontrado: false, error: `No pude leer Arbworld: ${e instanceof Error ? e.message : String(e)}` };
  }
};

/** Solo para pruebas. */
export const _reiniciar = () => {
  cache.clear();
  ultima = 0;
  cola = Promise.resolve();
};
