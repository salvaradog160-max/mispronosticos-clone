import { AFINIDAD_JS, buscarStakeJs } from '../src/stake/buscar';

// eslint-disable-next-line no-new-func
const afinidad = new Function(`${AFINIDAD_JS}; return afinidad;`)() as (a: string, b: string) => number;

test('afinidad: los nombres de Flashscore y Stake se reconocen', () => {
  expect(afinidad('BAYER LEVERKUSEN', 'Bayer Leverkusen')).toBe(1);
  expect(afinidad('FRIBURGO', 'SC Friburgo')).toBe(1);
  expect(afinidad('Man City', 'Manchester City')).toBeGreaterThanOrEqual(0.6);
  expect(afinidad('Borussia M\'gladbach', 'Borussia M´gladbach')).toBeGreaterThanOrEqual(0.6);
  expect(afinidad("Borussia M'gladbach", 'Borussia Monchengladbach')).toBeGreaterThanOrEqual(0.6);
  expect(afinidad('Manchester City', 'Manchester United')).toBeLessThan(0.6);
  expect(afinidad('Union Berlin', 'Hertha Berlin')).toBeLessThan(0.6);
  expect(afinidad('Real Madrid', 'Atlético Madrid')).toBeLessThan(0.6);
  expect(afinidad('Juventus', 'Lazio')).toBeLessThan(0.6);
});

test('buscarStakeJs es JS valido y los nombres se pasan escapados', () => {
  const js = buscarStakeJs('A"B\'C', 'D\nE');
  expect(() => new Function(js)).not.toThrow();
  expect(js).toContain(JSON.stringify('A"B\'C'));
  expect(js).not.toContain('apost'); // no hay codigo que toque el talon o apueste
  expect(js).toContain('stake-fin');
  expect(js).toContain('insertText');
  expect(js).toContain('isTrusted');
  expect(js).toContain('pointer-events:none');
});
