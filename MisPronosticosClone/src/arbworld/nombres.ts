/**
 * Parecido entre nombres de equipo («BAYER LEVERKUSEN» ~ «Bayer Leverkusen», «FRIBURGO» ~ «SC Friburgo»).
 * Mismo criterio que AFINIDAD_JS (src/stake/buscar.ts), que se inyecta como texto en stake.mx; una prueba
 * comprueba que las dos versiones den lo mismo.
 */
const STOP = new Set(['fc', 'cf', 'sc', 'cd', 'ad', 'club', 'de', 'del', 'la', 'el', 'fk', 'afc', 'ac', 'u', 'ii']);

const tokens = (t: string): string[] =>
  (String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => !STOP.has(w));

const norm = (t: string) => tokens(t).sort().join(' ');

const ratio = (a: string, b: string): number => {
  if (!a.length && !b.length) return 1;
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) m.push(new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) m[i][j] = a[i - 1] === b[j - 1] ? m[i - 1][j - 1] + 1 : Math.max(m[i - 1][j], m[i][j - 1]);
  return (2 * m[a.length][b.length]) / (a.length + b.length);
};

export const afinidad = (a: string, b: string): number => {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const inter = ta.filter(x => tb.includes(x)).length;
  const tok = inter / Math.min(ta.length, tb.length);
  const sim = ratio(norm(a), norm(b));
  let pref = 0;
  const ua = ta.filter(x => !tb.includes(x));
  const ub = tb.filter(x => !ta.includes(x));
  if (ua.some(x => x.length >= 3 && ub.some(y => y.startsWith(x) || x.startsWith(y)))) pref = 0.6;
  if (ua.some(x => x.length >= 5 && ub.some(y => y.length >= 5 && (y.includes(x) || x.includes(y))))) pref = 0.6;
  return Math.max(tok, sim >= 0.8 ? sim : 0, sim >= 0.5 ? pref : 0);
};
