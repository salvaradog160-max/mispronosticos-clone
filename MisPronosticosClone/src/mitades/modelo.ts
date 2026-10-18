/** Goles por mitades: funciones puras (sin WebView) para resumir fichas de Flashscore y armar el perfil de cada equipo. */

/** Un gol de la ficha: minuto, tiempo agregado, mitad y marcador acumulado DESPUES del gol (local - visita). */
export interface Gol {
  m: number;
  x: number;
  t: 1 | 2;
  l: number;
  v: number;
}

export interface Ficha {
  mid: string;
  fecha: string;
  local: string;
  visita: string;
  gl: number;
  gv: number;
  goles: Gol[];
}

export interface ResumenFicha {
  gf1: number;
  gc1: number;
  gf2: number;
  gc2: number;
  /** goles desde el minuto 76 (incluye el tiempo agregado) */
  tardios: number;
  /** marcador al descanso: true si iban empatados */
  empateDescanso: boolean;
}

/** Resume una ficha desde el punto de vista de un lado ('l' = el equipo jugo de local). */
export const resumirFicha = (f: Ficha, lado: 'l' | 'v'): ResumenFicha => {
  const r: ResumenFicha = { gf1: 0, gc1: 0, gf2: 0, gc2: 0, tardios: 0, empateDescanso: false };
  let pl = 0;
  let l1 = 0;
  let v1 = 0;
  for (const g of f.goles) {
    const lo = g.l > pl;
    const propio = lado === 'l' ? lo : !lo;
    const k = g.t === 1 ? (propio ? 'gf1' : 'gc1') : propio ? 'gf2' : 'gc2';
    r[k] += 1;
    if (g.t === 2 && g.m >= 76) r.tardios += 1;
    if (g.t === 1) {
      l1 = g.l;
      v1 = g.v;
    }
    pl = g.l;
  }
  r.empateDescanso = l1 === v1;
  return r;
};

/** Una ficha es coherente si el ultimo marcador acumulado es el marcador final y cada gol suma exactamente uno. */
export const fichaValida = (f: Ficha): boolean => {
  let pl = 0;
  let pv = 0;
  for (const g of f.goles) {
    const dl = g.l - pl;
    const dv = g.v - pv;
    if (!((dl === 1 && dv === 0) || (dl === 0 && dv === 1))) return false;
    pl = g.l;
    pv = g.v;
  }
  return pl === f.gl && pv === f.gv;
};

export interface Perfil {
  equipo: string;
  n: number;
  gf1: number;
  gc1: number;
  gf2: number;
  gc2: number;
  /** goles totales por partido en cada mitad (propios + recibidos) */
  total1: number;
  total2: number;
  /** parte de los goles que cae en la 2a mitad */
  pct2: number;
  /** goles tardios (76'+) por partido */
  tardios: number;
  /** partidos que llegaron empatados al descanso, de n */
  empatesDescanso: number;
}

export const perfilEquipo = (equipo: string, filas: Array<{ ficha: Ficha; lado: 'l' | 'v' }>): Perfil => {
  const n = filas.length;
  const s = { gf1: 0, gc1: 0, gf2: 0, gc2: 0, tardios: 0, emp: 0 };
  for (const { ficha, lado } of filas) {
    const r = resumirFicha(ficha, lado);
    s.gf1 += r.gf1;
    s.gc1 += r.gc1;
    s.gf2 += r.gf2;
    s.gc2 += r.gc2;
    s.tardios += r.tardios;
    if (r.empateDescanso) s.emp += 1;
  }
  const d = n || 1;
  const t1 = s.gf1 + s.gc1;
  const t2 = s.gf2 + s.gc2;
  return {
    equipo,
    n,
    gf1: s.gf1 / d,
    gc1: s.gc1 / d,
    gf2: s.gf2 / d,
    gc2: s.gc2 / d,
    total1: t1 / d,
    total2: t2 / d,
    pct2: t1 + t2 ? t2 / (t1 + t2) : 0,
    tardios: s.tardios / d,
    empatesDescanso: s.emp,
  };
};
