import type { EntitlementSet } from './domain/picks';

export type Plan = 'free' | 'premium';

export interface SubscriptionState {
  plan: Plan;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const isTrialActive = (state: SubscriptionState, nowMs: number): boolean => {
  if (!state.trialEndsAt) return false;
  return new Date(state.trialEndsAt).getTime() > nowMs;
};

export const isPremium = (state: SubscriptionState, nowMs: number): boolean =>
  state.plan === 'premium' || isTrialActive(state, nowMs);

export const startTrial = (
  state: SubscriptionState,
  trialDays: number,
  nowMs: number,
): SubscriptionState => {
  if (state.trialStartedAt) return state;
  return {
    ...state,
    trialStartedAt: new Date(nowMs).toISOString(),
    trialEndsAt: new Date(nowMs + trialDays * DAY_MS).toISOString(),
  };
};

export const entitlementsFor = (
  state: SubscriptionState,
  nowMs: number,
): EntitlementSet => {
  const paid = isPremium(state, nowMs);
  return { topAi: true, live: paid, especiales: paid };
};

export const canAccess = (
  state: SubscriptionState,
  nowMs: number,
  feature: keyof EntitlementSet,
): boolean => entitlementsFor(state, nowMs)[feature];