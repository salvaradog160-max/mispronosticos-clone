/**
 * Cuotas pre-partido de Betmexico leidas del feed publico que usa su propia pagina. Port de
 * pronostico_servidor/betmexico.py.
 *
 * - Informacion que la pagina muestra a cualquiera: no hay sesion, cookie ni nada de la cuenta del usuario.
 * - Uso personal y discreto: indice de versiones (cache 60 s) + a lo mas 5 archivos (cache 5 min), 2 s entre peticiones.
 * - Es un feed de una plataforma de terceros (sptpub.com, ids de Sportradar) sin documentacion: si cambia el host o
 *   el formato falla con un mensaje claro y no inventa cuotas.
 * - Mercados Sportradar: 1 = 1X2 (1 local, 2 empate, 3 visita); 10 = doble oportunidad (9 = 1X, 10 = 12, 11 = X2);
 *   18 = totales (total=X; 12 = Mas, 13 = Menos); 16 = handicap asiatico (hcp=X; 1714 local, 1715 visita).
 * - Misma forma de salida que src/stake/api.ts, para que la herramienta trate igual las dos casas.
 */
import { afinidad } from '../arbworld/nombres';
import type { StakeRespuesta } from '../stake/api';

export const BASE = 'https://api-32-sp-c7818b61-598.sptpub.com/api/v4/prematch/brand/2668782443108110344/es-MX';
export const GAP_MS = 2000;
export const TTL_INDICE_MS = 60_000;
export const TTL_ARCHIVO_MS = 300_000;

export const WEB = 'https://betmexico.mx/deportes-elite/soccer';

export interface BetmexicoRespuesta extends StakeRespuesta {
  fuente?: string;
  /** Enlace directo al partido en betmexico.mx (null si el feed no trae el pais o la liga). */
  url?: string | null;
}

type Respuesta = { ok: boolean; status: number; text: () => Promise<string> };
export interface Deps {
  fetcher: (url: string, init: { headers: Record<string, string> }) => Promise<Respuesta>;
  ahora: () => number;
  dormir: (ms: number) => Promise<void>;
}

const cache = new Map<string, { t: number; d: any }>();
let ultima = 0;
let cola: Promise<unknown> = Promise.resolve();
export const _reiniciar = () => {
  cache.clear();
  ultima = 0;
  cola = Promise.resolve();
};

const traer = (ruta: string, ttl: number, d: Deps): Promise<any> => {
  const tarea = cola.then(async () => {
    const hit = cache.get(ruta);
    if (hit && d.ahora() - hit.t < ttl) return hit.d;
    const espera = GAP_MS - (d.ahora() - ultima);
    if (espera > 0) await d.dormir(espera);
    const r = await d.fetcher(BASE + ruta, { headers: { Accept: 'application/json' } });
    ultima = d.ahora();
    if (!r.ok) throw new Error(`Betmexico respondió ${r.status}`);
    const dato = JSON.parse(await r.text());
    cache.set(ruta, { t: ultima, d: dato });
    return dato;
  });
  cola = tarea.catch(() => undefined);
  return tarea;
};

const num = (x: unknown): number | null => {
  const v = parseFloat(String(x));
  return Number.isFinite(v) && v > 1 ? v : null;
};
const g = (x: number) => String(x);
const spec = (variante: string, clave: string): number | null => {
  for (const parte of String(variante).split('|')) {
    if (parte.startsWith(clave + '=')) {
      const v = parseFloat(parte.split('=')[1]);
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
};

export const parsearEvento = (ev: any, inv: boolean): StakeRespuesta => {
  const mk = ev.markets ?? {};
  const out: StakeRespuesta = { encontrado: true, x2: null, dc: {}, dnb: null, btts: null, at: {}, ah: {} };
  const m1 = (mk['1'] ?? {})[''] ?? {};
  const h = num(m1['1']?.k), d = num(m1['2']?.k), a = num(m1['3']?.k);
  if (h && d && a) out.x2 = { h, d, a };
  const m10 = (mk['10'] ?? {})[''] ?? {};
  for (const [sid, clave] of [['9', 'hd'], ['11', 'da'], ['10', 'ha']] as const) {
    const v = num(m10[sid]?.k);
    if (v) out.dc![clave] = v;
  }
  for (const [variante, outs] of Object.entries<any>(mk['18'] ?? {})) {
    const t = spec(variante, 'total');
    const o = num(outs['12']?.k), u = num(outs['13']?.k);
    if (t !== null && o && u) out.at![g(t)] = { o, u };
  }
  for (const [variante, outs] of Object.entries<any>(mk['16'] ?? {})) {
    const t = spec(variante, 'hcp');
    const hh = num(outs['1714']?.k), aa = num(outs['1715']?.k);
    if (t !== null && hh && aa) out.ah![g(t)] = { h: hh, a: aa };
  }
  if (out.x2) out.margen_x2 = Math.round((Object.values(out.x2).reduce((s, v) => s + 1 / v, 0) - 1) * 10000) / 10000;
  if (inv) {
    if (out.x2) out.x2 = { h: out.x2.a, d: out.x2.d, a: out.x2.h };
    if (Object.keys(out.dc!).length) out.dc = { hd: out.dc!.da, da: out.dc!.hd, ha: out.dc!.ha };
    const ah: Record<string, { h: number; a: number }> = {};
    for (const [k, v] of Object.entries(out.ah!)) ah[g(-parseFloat(k))] = { h: v.a, a: v.h };
    out.ah = ah;
  }
  return out;
};

/** Enlace directo: /deportes-elite/soccer/<pais>/<liga>/<slug-del-partido>-<id>. null si falta algun dato. */
export const urlPartido = (id: string, ev: any, cats: Record<string, any>, tors: Record<string, any>): string | null => {
  const d = ev?.desc ?? {};
  const cat = cats[d.category]?.slug;
  const tor = tors[d.tournament]?.slug;
  return cat && tor && d.slug ? `${WEB}/${cat}/${tor}/${d.slug}-${id}` : null;
};

export const buscarBetmexico = async (local: string, visita: string, d: Deps): Promise<BetmexicoRespuesta> => {
  try {
    const idx = await traer('/0', TTL_INDICE_MS, d);
    const versiones: number[] = [...(idx.top_events_versions ?? []), ...(idx.rest_events_versions ?? [])];
    let mejor: any = null;
    let mejorId = '';
    let mejorPt = 0;
    let inv = false;
    let vistos = 0;
    let hechos = 0;
    const cats: Record<string, any> = {};
    const tors: Record<string, any> = {};
    for (const v of versiones) {
      const arch = await traer(`/${v}`, TTL_ARCHIVO_MS, d);
      hechos++;
      Object.assign(cats, arch.categories ?? {});
      Object.assign(tors, arch.tournaments ?? {});
      for (const [id, ev] of Object.entries<any>(arch.events ?? {})) {
        const desc = ev.desc ?? {};
        const comp = desc.competitors ?? [];
        if (desc.type !== 'match' || desc.sport !== '1' || comp.length !== 2) continue;
        vistos++;
        const a = Math.min(afinidad(local, comp[0].name), afinidad(visita, comp[1].name));
        const b = Math.min(afinidad(local, comp[1].name), afinidad(visita, comp[0].name));
        const [pt, vuelta] = a >= b ? [a, false] : [b, true];
        if (pt > mejorPt) {
          mejor = ev;
          mejorId = id;
          mejorPt = pt;
          inv = vuelta as boolean;
        }
      }
      if (mejorPt >= 0.9) break;
    }
    if (mejor && mejorPt >= 0.6 && !urlPartido(mejorId, mejor, cats, tors)) {
      for (const v of versiones.slice(hechos)) {              // los nombres de pais y liga pueden venir en otro archivo
        const arch = await traer(`/${v}`, TTL_ARCHIVO_MS, d);
        Object.assign(cats, arch.categories ?? {});
        Object.assign(tors, arch.tournaments ?? {});
        if (urlPartido(mejorId, mejor, cats, tors)) break;
      }
    }
    if (!mejor || mejorPt < 0.6) {
      return { encontrado: false, error: `No encontré «${local} - ${visita}» entre los ${vistos} partidos de fútbol por jugar de Betmexico.` };
    }
    const comp = mejor.desc.competitors;
    return {
      ...parsearEvento(mejor, inv),
      partido: `${comp[0].name} - ${comp[1].name}`,
      estado: 'active',
      inicio: Number(mejor.desc.scheduled ?? 0) * 1000,
      invertido: inv,
      fuente: 'Betmexico (feed público de su página)',
      url: urlPartido(mejorId, mejor, cats, tors),
    };
  } catch (e) {
    return { encontrado: false, error: `No pude leer el feed de Betmexico: ${e instanceof Error ? e.message : String(e)}` };
  }
};
