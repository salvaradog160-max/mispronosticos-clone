/**
 * Analisis de un partido: cuota de apertura, cuota actual, cuanto se
 * movio la linea, y que dice el modelo.
 *
 * No decide si apostar. Muestra las tres cosas que hay que mirar para
 * decidir: que cree el mercado, que cree el modelo, y como se movio la
 * linea entre la apertura y ahora.
 */

/** Probabilidades de 1X2 sin margen a partir de tres cuotas. */
export const probs1x2 = (H, D, A) => {
  if (!H || !D || !A) return null;
  const raw = { H: 1 / H, D: 1 / D, A: 1 / A };
  const overround = raw.H + raw.D + raw.A;
  if (!(overround > 1)) return null;
  return { H: raw.H / overround, D: raw.D / overround, A: raw.A / overround, overround };
};

const NOMBRE = { H: 'local', D: 'empate', A: 'visitante' };

/**
 * @param partido  { homeTeam, awayTeam, kickoff, leagueName, odds }
 * @param probs    probabilidades del modelo (ya sin margen)
 */
export const analizar = (partido, probs) => {
  const o = partido.odds;
  const actual = o ? probs1x2(o.H, o.D, o.A) : null;
  const apertura = o?.apertura?.H ? probs1x2(o.apertura.H, o.apertura.D, o.apertura.A) : null;

  if (!actual || !probs) return null;

  const ladoMercado = Object.entries({ H: actual.H, D: actual.D, A: actual.A })
    .sort((a, b) => b[1] - a[1])[0][0];
  const ladoModelo = Object.entries({ H: probs.H, D: probs.D, A: probs.A })
    .sort((a, b) => b[1] - a[1])[0][0];

  // Probabilidades: sobre ellas se mide el movimiento, en puntos porcentuales.
  const cuotaProbAhora = actual[ladoMercado];
  const cuotaProbApertura = apertura ? apertura[ladoMercado] : null;

  // Cuotas decimales reales. Confundir esto con la probabilidad fue un
  // bug: salia "cuota 0.46", que no es una cuota valida.
  const cuotaAhora = o[ladoMercado];
  const cuotaAbierta = o?.apertura?.[ladoMercado] ?? null;

  return {
    partido: `${partido.homeTeam} vs ${partido.awayTeam}`,
    liga: partido.leagueName,
    kickoff: partido.kickoff,

    // Que dice el mercado
    favoritoMercado: ladoMercado,
    ladoMercado: NOMBRE[ladoMercado],
    probMercado: Number(cuotaProbAhora.toFixed(4)),
    cuotaMercado: Number(cuotaAhora.toFixed(2)),
    cuotaApertura: cuotaAbierta === null ? null : Number(cuotaAbierta.toFixed(2)),

    // Que dice el modelo
    ladoModelo: NOMBRE[ladoModelo],
    probModelo: Number(probs[ladoModelo].toFixed(4)),
    coincide: ladoMercado === ladoModelo,

    // Movimiento de linea, en puntos porcentuales
    movimiento: cuotaProbApertura
      ? Number(((cuotaProbAhora - cuotaProbApertura) * 100).toFixed(2))
      : null,
    cambioFavorito:
      apertura &&
      Object.entries({ H: apertura.H, D: apertura.D, A: apertura.A })
        .sort((a, b) => b[1] - a[1])[0][0] !== ladoMercado,

    lineaGoles: o?.line ?? null,
    cuotaGoles: o?.over ?? null,
  };
};
