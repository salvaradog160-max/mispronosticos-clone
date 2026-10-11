import { DEFAULTS, mergeConfig } from '../src/config';
import { createMockRepository } from '../src/data/mockRepository';
import { filterPicks, gate } from '../src/data/picksRepository';
import { confidenceToStars, passesTopAiGate } from '../src/domain/picks';
import { canAccess, entitlementsFor, isPremium, isTrialActive, startTrial } from '../src/entitlements';

const pick = (confidence: number, stars: number, odds = 1.9) => ({
  id: `p${confidence}`,
  fixtureId: 'm',
  market: 'TOTAL' as const,
  selection: 'Over 2.5',
  odds,
  confidence,
  stars,
  isSpecial: false,
  isPremium: false,
  createdAt: '2026-10-10T00:00:00.000Z',
});

describe('config', () => {
  it('usa defaults cuando remote config viene vacio', () => {
    expect(mergeConfig(null)).toEqual(DEFAULTS);
    expect(mergeConfig({})).toEqual(DEFAULTS);
  });

  it('aplica overrides de remote config', () => {
    const merged = mergeConfig({
      apiBaseUrl: 'https://api.mio.com',
      minConfidenceTopAi: 82,
      trialDays: 7,
    });
    expect(merged.apiBaseUrl).toBe('https://api.mio.com');
    expect(merged.minConfidenceTopAi).toBe(82);
    expect(merged.trialDays).toBe(7);
    expect(merged.minStarsTopAi).toBe(DEFAULTS.minStarsTopAi);
  });

  it('descarta valores no numericos', () => {
    const merged = mergeConfig({ minStarsTopAi: 'no-es-un-numero' as unknown as number });
    expect(merged.minStarsTopAi).toBe(DEFAULTS.minStarsTopAi);
  });
});

describe('reglas de pick', () => {
  it('mapea confianza a estrellas', () => {
    expect(confidenceToStars(95)).toBe(5);
    expect(confidenceToStars(87)).toBe(4);
    expect(confidenceToStars(60)).toBe(2);
  });

  it('la puerta de Top AI exige 4 estrellas y 78%', () => {
    expect(passesTopAiGate(pick(87, 4))).toBe(true);
    expect(passesTopAiGate(pick(87, 3))).toBe(false);
    expect(passesTopAiGate(pick(70, 5))).toBe(false);
  });

  it('el gate respeta los umbrales de remote config', () => {
    expect(gate(pick(82, 4), 82, 4)).toBe(true);
    expect(gate(pick(81, 4), 82, 4)).toBe(false);
  });

  it('filtra por confianza, cuota y limite', () => {
    const picks = [pick(95, 5, 1.5), pick(85, 4, 2.4), pick(80, 4, 3.0)];
    expect(filterPicks(picks, { maxOdds: 2.0 }, 78, 4).map(p => p.id)).toEqual(['p95']);
    expect(filterPicks(picks, { limit: 1 }, 78, 4)).toHaveLength(1);
    expect(filterPicks(picks, {}, 90, 4).map(p => p.id)).toEqual(['p95']);
  });
});

describe('entitlements', () => {
  const nowMs = Date.parse('2026-10-10T12:00:00.000Z');
  const free = { plan: 'free' as const, trialStartedAt: null, trialEndsAt: null };

  it('el trial dura exactamente los dias configurados', () => {
    const started = startTrial(free, 2, nowMs);
    expect(Date.parse(started.trialEndsAt!) - nowMs).toBe(2 * 24 * 60 * 60 * 1000);
    expect(isTrialActive(started, nowMs)).toBe(true);
  });

  it('el trial se caduca y deja solo topAi', () => {
    const started = startTrial(free, 2, nowMs);
    const after = nowMs + 3 * 24 * 60 * 60 * 1000;
    expect(isTrialActive(started, after)).toBe(false);
    expect(isPremium(started, after)).toBe(false);
    expect(entitlementsFor(started, after)).toEqual({ topAi: true, live: false, especiales: false });
  });

  it('durante el trial live y especiales quedan abiertos', () => {
    const started = startTrial(free, 2, nowMs);
    expect(canAccess(started, nowMs, 'live')).toBe(true);
    expect(canAccess(started, nowMs, 'especiales')).toBe(true);
  });

  it('premium no caduca', () => {
    const paid = { plan: 'premium' as const, trialStartedAt: null, trialEndsAt: null };
    expect(canAccess(paid, nowMs + 3650 * 24 * 60 * 60 * 1000, 'live')).toBe(true);
  });

  it('startTrial es idempotente', () => {
    const first = startTrial(free, 2, nowMs);
    expect(startTrial(first, 30, nowMs + 1000)).toEqual(first);
  });
});

describe('repositorio mock', () => {
  it('top picks sale ya filtrado por la puerta', async () => {
    const repo = createMockRepository(DEFAULTS);
    const result = await repo.listTopPicks({});
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(passesTopAiGate)).toBe(true);
  });

  it('especiales solo devuelve los validados', async () => {
    const repo = createMockRepository(DEFAULTS);
    const result = await repo.listSpecials();
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(p => p.isSpecial)).toBe(true);
  });
});