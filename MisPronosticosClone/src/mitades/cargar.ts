import { fichaValida, perfilEquipo, type Ficha, type Perfil } from './modelo';

export interface FilaEnlace {
  href: string;
  mid: string;
  fecha: string;
  comp: string;
  local: string;
  visita: string;
  res: string;
}
export interface Enlaces {
  local: string;
  visita: string;
  equipos: Array<{ nombre: string; filas: FilaEnlace[] }>;
}
export type Leido<T> = { ok: true; datos: T } | { ok: false; error: string; omitir?: boolean };

/** Lo que la app sabe hacer con el lector oculto: abrir una pagina y devolver lo que el script leyo. */
export interface Lector {
  enlaces(url: string): Promise<Leido<Enlaces>>;
  ficha(url: string): Promise<Leido<Ficha>>;
}

export interface ResultadoMitades {
  local: Perfil;
  visita: Perfil;
  /** fichas leidas ahora (para guardarlas) y de cache, por mid */
  fichas: Record<string, Ficha>;
  omitidos: number;
  /** por que se omitio cada ficha (para mostrarlo; no se esconde un fallo) */
  motivos: string[];
  /** true si se detuvo antes de terminar (varias lecturas seguidas fallaron) */
  parcial: boolean;
  error?: string;
}

export interface Opciones {
  urlH2h: string;
  lector: Lector;
  cache: Map<string, Ficha>;
  dormir: (ms: number) => Promise<void>;
  /** cuantos partidos recientes por equipo (por defecto 5) */
  porEquipo?: number;
  /** pausa entre fichas que si se leen de la red (por defecto 3 s) */
  pausaMs?: number;
  /** fallos seguidos que detienen la carga (por defecto 3), para no insistir si Flashscore empieza a negar */
  maxFallosSeguidos?: number;
  alProgreso?: (hecho: number, total: number, texto: string) => void;
}

const FLASHSCORE = /^https:\/\/([a-z0-9-]+\.)*flashscore\.(com\.mx|com)\//i;

const mismoEquipo = (a: string, b: string) => {
  const n = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
  const x = n(a);
  const y = n(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** Lee los ultimos partidos de cada equipo y arma su perfil por mitades. Solo toca fichas de Flashscore, una a la vez y con pausa. */
export const cargarMitades = async (o: Opciones): Promise<ResultadoMitades | { error: string }> => {
  const N = o.porEquipo ?? 5;
  const pausa = o.pausaMs ?? 3000;
  const maxFallos = o.maxFallosSeguidos ?? 3;
  const en = await o.lector.enlaces(o.urlH2h);
  if (!en.ok) return { error: en.error };
  const pend = en.datos.equipos.map(e => ({
    nombre: e.nombre,
    filas: e.filas.filter(f => /^[GEP]$/.test(f.res) && FLASHSCORE.test(f.href) && f.mid).slice(0, N),
  }));
  const total = pend.reduce((s, e) => s + e.filas.length, 0);
  const fichas: Record<string, Ficha> = {};
  const filas: Array<Array<{ ficha: Ficha; lado: 'l' | 'v' }>> = [[], []];
  let hecho = 0;
  let omitidos = 0;
  const motivos: string[] = [];
  let fallos = 0;
  let parcial = false;
  let error: string | undefined;
  for (let i = 0; i < pend.length && !parcial; i++) {
    for (const f of pend[i].filas) {
      let ficha = o.cache.get(f.mid);
      if (!ficha) {
        await o.dormir(pausa);
        const r = await o.lector.ficha(f.href);
        if (r.ok && fichaValida(r.datos)) {
          ficha = { ...r.datos, mid: f.mid };
          o.cache.set(f.mid, ficha);
          fallos = 0;
        } else {
          omitidos += 1;
          const porque = r.ok ? 'la ficha no cuadra con el marcador final' : r.error;
          motivos.push(`${f.local} - ${f.visita}: ${porque}`);
          // un partido con prorroga o penales no es un fallo de Flashscore: se salta sin contar para detenerse
          if (!r.ok && r.omitir) {
            hecho += 1;
            continue;
          }
          fallos += 1;
          if (fallos >= maxFallos) {
            parcial = true;
            error = 'Flashscore dejó de responder; paré para no insistir. Intenta más tarde.';
            break;
          }
        }
      }
      hecho += 1;
      o.alProgreso?.(hecho, total, `${pend[i].nombre}: ${f.local} - ${f.visita}`);
      if (ficha) {
        fichas[f.mid] = ficha;
        filas[i].push({ ficha, lado: mismoEquipo(ficha.local, pend[i].nombre) ? 'l' : 'v' });
      }
    }
  }
  return {
    local: perfilEquipo(en.datos.local || pend[0].nombre, filas[0]),
    visita: perfilEquipo(en.datos.visita || pend[1].nombre, filas[1]),
    fichas,
    omitidos,
    motivos,
    parcial,
    error,
  };
};
