/**
 * Picks de Over/Under 2.5 y BTTS para los partidos de hoy.
 *
 * Solo se generan para los mercados que el backtest marco como
 * operativos. El handicap asiatico queda fuera a proposito: su
 * consenso acierta 48.4%, por debajo de la moneda.
 */
import { overProb, bttsProb } from '../engine/poisson.mjs';
import { lookupBucket, normalizeTeam } from '../engine/calibration.mjs';

const twoWay = (a, b) => {
  if (!a || !b) return null;
  const overround = 1 / a + 1 / b;
  if (!(overround > 1)) return null;
  return { high: 1 / a / overround, low: 1 / b / overround };
};

// ESPN llama a los campos over/under; football-data over25/under25.
const totals = odds => ({
  over: odds?.over ?? odds?.over25,
  under: odds?.under ?? odds?.under25,
  line: odds?.line ?? 2.5,
});

/**
 * @param fixtures  partidos con `market` (1X2) y `prediction` (lambdas)
 * @param mercados  calibration-mercados.json
 */
export const buildMercadoPicks = (fixtures, mercados, { limit = 25 } = {}) => {
  const out = [];

  // ------------------------------------------------------- Over/Under 2.5
  if (mercados?.overUnder25?.operativo) {
    for (const f of fixtures) {
      const t = totals(f.rawOdds);
      // La calibracion es solo para la linea 2.5.
      if (!t.over || !t.under || Math.abs(Number(t.line) - 2.5) > 0.001) continue;
      const market = twoWay(t.over, t.under);
      if (!market) continue;

      const modelOver = overProb(f.prediction.lambdaHome, f.prediction.lambdaAway, 2.5);
      const modelHigh = modelOver >= 0.5;
      const marketHigh = market.high >= 0.5;
      if (modelHigh !== marketHigh) continue;

      const pSel = modelHigh ? market.high : market.low;
      const cal = lookupBucket(mercados.overUnder25.fusionado, pSel);
      if (!cal) continue;

      out.push({
        id: `ou-${f.id}`,
        fixtureId: f.id,
        league: f.leagueName,
        kickoff: f.kickoff,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        market: 'TOTAL',
        linea: Number(t.line),
        selection: modelHigh ? 'Más de 2.5 goles' : 'Menos de 2.5 goles',
        odds: modelHigh ? t.over : t.under,
        probMercado: Number(pSel.toFixed(4)),
        confidence: cal.confidence,
        stars: cal.stars,
        nMuestra: cal.nMuestra,
        rango: cal.rango,
        isSpecial: false,
        isPremium: false,
      });
    }
  }

  // ------------------------------------------------------------------ BTTS
  if (mercados?.btts?.operativo) {
    for (const f of fixtures) {
      const model = bttsProb(f.prediction.lambdaHome, f.prediction.lambdaAway);
      const yes = model >= 0.5;
      const pSel = Math.max(model, 1 - model);
      const cal = lookupBucket(mercados.btts.buckets, pSel);
      if (!cal) continue;

      // Sin mercado, sin cuota. Se marca para que la app no la invente.
      out.push({
        id: `btts-${f.id}`,
        fixtureId: f.id,
        league: f.leagueName,
        kickoff: f.kickoff,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        market: 'BTTS',
        linea: null,
        selection: yes ? 'Ambos marcan' : 'Alguno no marca',
        odds: null,
        probMercado: Number(pSel.toFixed(4)),
        confidence: cal.confidence,
        stars: cal.stars,
        nMuestra: cal.nMuestra,
        rango: cal.rango,
        sinCuota: true,
        isSpecial: false,
        isPremium: false,
      });
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
};