/**
 * Cuotas de Stake (API de datos de cuotas) leidas desde el telefono. Port de pronostico_servidor/stake_api.py.
 *
 * - SIN clave: odds-data.stake.com contesta 200 igual con una clave inventada o sin ninguna (comprobado el 18-oct-2026),
 *   asi que la app no pide ni guarda ninguna. Si Stake empezara a exigirla, un 401/403 se explica en el mensaje.
 * - El calendario /schedule/sport/soccer solo trae los partidos EN VIVO; los que van a empezar salen por pais
 *   (/schedule/sport/soccer/<pais>/x: la liga no filtra) y cada lista se corta en 50 partidos.
 */
import { afinidad } from '../arbworld/nombres';

export const BASE = 'https://odds-data.stake.com';
// Cloudflare da 403 sin un User-Agent de navegador (mismo que usa el servidor local).
export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
export const PAISES = [
  'germany', 'spain', 'england', 'italy', 'france', 'netherlands', 'portugal', 'belgium', 'turkey', 'scotland',
  'mexico', 'usa', 'brazil', 'argentina', 'colombia', 'chile', 'uruguay', 'peru', 'ecuador', 'paraguay', 'bolivia',
  'venezuela', 'costa-rica', 'international', 'austria', 'switzerland', 'greece', 'russia', 'ukraine', 'poland',
  'czech-republic', 'denmark', 'norway', 'sweden', 'croatia', 'romania', 'japan', 'australia', 'saudi-arabia',
];
export const TTL_CALENDARIO_MS = 120_000;
export const TTL_PARTIDO_MS = 30_000;
const UMBRAL = 0.6;

export interface StakeRespuesta {
  encontrado: boolean;
  error?: string;
  partido?: string;
  estado?: string | null;
  inicio?: number | null;
  invertido?: boolean;
  x2?: { h: number; d: number; a: number } | null;
  dc?: { hd?: number; da?: number; ha?: number };
  dnb?: { h: number; a: number } | null;
  btts?: { s: number; n: number } | null;
  at?: Record<string, { o: number; u: number }>;
  ah?: Record<string, { h: number; a: number }>;
  margen_x2?: number;
}

type Respuesta = { ok: boolean; status: number; text: () => Promise<string> };
export interface Deps {
  fetcher: (url: string, init: { headers: Record<string, string> }) => Promise<Respuesta>;
  ahora: () => number;
}

export class ErrorStake extends Error {
  constructor(mensaje: string, readonly fatal = false) {
    super(mensaje);
  }
}

const cache = new Map<string, { t: number; d: any }>();
export const _reiniciar = () => cache.clear();

const traer = async (ruta: string, ttl: number, d: Deps): Promise<any> => {
  const hit = cache.get(ruta);
  if (hit && d.ahora() - hit.t < ttl) return hit.d;
  const r = await d.fetcher(BASE + ruta, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (r.status === 401 || r.status === 403) {
    // Cloudflare contesta con una pagina HTML; la API, con JSON. Asi se sabe de quien es el rechazo.
    let cuerpo = '';
    try {
      cuerpo = (await r.text()).slice(0, 400).toLowerCase();
    } catch {
      cuerpo = '';
    }
    if (cuerpo.includes('cloudflare') || cuerpo.includes('<html') || cuerpo.includes('just a moment')) {
      throw new ErrorStake(`Cloudflare bloqueó la consulta desde el teléfono (${r.status}); reintenta en un momento.`, true);
    }
    throw new ErrorStake(`Stake rechazó la consulta (${r.status}). Puede que ahora exija una clave de API; antes no la pedía.`, true);
  }
  if (r.status === 429) throw new ErrorStake('Stake dice que hay demasiadas consultas (429). Espera un momento.', true);
  if (!r.ok) throw new ErrorStake(`Stake respondió ${r.status}.`);
  const dato = JSON.parse(await r.text());
  cache.set(ruta, { t: d.ahora(), d: dato });
  return dato;
};

function* planos(d: any): Generator<any> {
  for (const g of d?.groups ?? []) {
    for (const sub of g?.markets ?? []) {
      for (const m of Array.isArray(sub) ? sub : [sub]) yield m;
    }
  }
}

const ok = (outs: any[]): boolean => outs.length > 0 && outs.every(o => (o.active ?? true) && (o.odds || 0) > 1);

const spec = (m: any, clave: string): number | null => {
  for (const parte of String(m.specifiers ?? '').split('|')) {
    if (parte.startsWith(clave + '=')) {
      const n = parseFloat(parte.split('=')[1]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
};

const g = (x: number) => String(x);          // equivale al '%g' de Python

export const parsearPartido = (d: any, nombre: string, inv: boolean): StakeRespuesta => {
  const [casa, fuera] = nombre.split(' - ').map(p => p.trim());
  const out: StakeRespuesta = { encontrado: true, invertido: inv, x2: null, dc: {}, dnb: null, btts: null, at: {}, ah: {} };
  const vistos = new Set<string>();
  for (const m of planos(d)) {
    const n = m.name;
    const outs: any[] = m.outcomes ?? [];
    if (!ok(outs)) continue;
    const o = outs.map(x => x.odds as number);
    if (n === '1x2' && outs.length === 3 && out.x2 === null) {
      out.x2 = { h: o[0], d: o[1], a: o[2] };
    } else if (n === 'Double Chance' && !Object.keys(out.dc!).length) {
      for (const x of outs) {
        const nm: string = x.name ?? '';
        if (nm.includes('Draw') && nm.startsWith(casa)) out.dc!.hd = x.odds;
        else if (nm.includes('Draw') && nm.includes(fuera)) out.dc!.da = x.odds;
        else if (!nm.includes('Draw')) out.dc!.ha = x.odds;
      }
    } else if (n === 'Draw No Bet' && outs.length === 2 && out.dnb === null) {
      out.dnb = { h: o[0], a: o[1] };
    } else if (n === 'Both Teams to Score' && outs.length === 2 && out.btts === null) {
      out.btts = { s: o[0], n: o[1] };
    } else if ((n === 'Asian Total' || n === 'Total') && outs.length === 2) {
      const t = spec(m, 'total');
      if (t !== null && !vistos.has('at' + t)) {
        vistos.add('at' + t);
        out.at![g(t)] = { o: o[0], u: o[1] };
      }
    } else if (n === 'Asian Handicap' && outs.length === 2) {
      const h = spec(m, 'hcp');
      if (h !== null && !vistos.has('ah' + h)) {
        vistos.add('ah' + h);
        out.ah![g(h)] = { h: o[0], a: o[1] };
      }
    }
  }
  if (out.x2) out.margen_x2 = Math.round((Object.values(out.x2).reduce((s, v) => s + 1 / v, 0) - 1) * 10000) / 10000;
  if (inv) {          // el calendario de Stake lo trae con local/visita al reves de la herramienta: se voltean los lados
    if (out.x2) out.x2 = { h: out.x2.a, d: out.x2.d, a: out.x2.h };
    if (Object.keys(out.dc!).length) out.dc = { hd: out.dc!.da, da: out.dc!.hd, ha: out.dc!.ha };
    if (out.dnb) out.dnb = { h: out.dnb.a, a: out.dnb.h };
    const ah: Record<string, { h: number; a: number }> = {};
    for (const [k, v] of Object.entries(out.ah!)) ah[g(-parseFloat(k))] = { h: v.a, a: v.h };
    out.ah = ah;
  }
  return out;
};

export const buscarStake = async (local: string, visita: string, d: Deps): Promise<StakeRespuesta> => {
  let mejor: any = null;
  let mejorPt = 0;
  let inv = false;
  const cands: Array<[number, string]> = [];
  const evaluar = (cal: any) => {
    for (const dia of cal?.schedule ?? []) {
      for (const f of dia.fixtures ?? []) {
        const partes = String(f.name ?? '').split(' - ');
        if (partes.length !== 2) continue;
        const a = Math.min(afinidad(local, partes[0]), afinidad(visita, partes[1]));
        const b = Math.min(afinidad(local, partes[1]), afinidad(visita, partes[0]));
        let [pt, vuelta] = a >= b ? [a, false] : [b, true];
        pt += f.status !== 'ended' ? 0.01 : 0;
        cands.push([pt, f.name]);
        if (pt > mejorPt) {
          mejor = f;
          mejorPt = pt;
          inv = vuelta as boolean;
        }
      }
    }
  };
  try {
    evaluar(await traer('/schedule/sport/soccer', TTL_CALENDARIO_MS, d));
    for (const pais of PAISES) {
      if (mejorPt >= 0.9) break;
      try {
        evaluar(await traer(`/schedule/sport/soccer/${pais}/x`, TTL_CALENDARIO_MS, d));
      } catch (e) {
        if (e instanceof ErrorStake && e.fatal) throw e;        // un pais que no existe no frena la busqueda; un bloqueo o limite si
      }
    }
    if (!mejor || mejorPt < UMBRAL) {
      const cerca = cands.sort((x, y) => y[0] - x[0]).slice(0, 3).filter(c => c[0] > 0.2).map(c => c[1]);
      return {
        encontrado: false,
        error: `No encontré «${local} - ${visita}» en el calendario de Stake.${cerca.length ? ` Lo más parecido: ${cerca.join('; ')}.` : ''}`,
      };
    }
    const det = await traer(`/fixtures/${mejor.slug}`, TTL_PARTIDO_MS, d);
    return { ...parsearPartido(det, mejor.name, inv), partido: mejor.name, estado: mejor.status ?? null, inicio: mejor.date ?? null };
  } catch (e) {
    return { encontrado: false, error: e instanceof ErrorStake ? e.message : `No pude hablar con Stake: ${e instanceof Error ? e.message : String(e)}` };
  }
};
