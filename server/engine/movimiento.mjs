/**
 * Deteccion de movimiento de linea.
 *
 * El problema que resuelve: la confianza de un pick sale del tramo de
 * calibracion donde cae la probabilidad de mercado. Si despues la linea
 * se mueve, el pick NO cambia pero su confianza si, y la app la
 * mostraria congelada con el valor viejo.
 *
 * Tres cosas que merece la pena avisar:
 *
 * - CAMBIO_TRAMO   la probabilidad cruzo un borde de la tabla, asi que
 *                  la confianza correcta es otra.
 * - CAMBIO_LADO    el mercado revirteo la seleccion (4.2% de los
 *                  partidos segun el historico).
 * - LINEA_GOLES    la linea de goles subio o bajo, y el pick anterior
 *                  ya no aplica.
 */

export const UMBRAL_TRAMO = 0.02;
export const UMBRAL_NOTABLE = 0.05;

/** Indice del tramo de la tabla donde cae `p`. */
export const tramoDe = (buckets, p) => {
  if (!buckets || !Array.isArray(buckets)) return -1;
  return buckets.findIndex(b => p >= b.lo && p < b.hi);
};

// Identidad del pick: partido + mercado. La linea de goles NO entra,
// porque si entrara, mover la linea pareceria un pick nuevo en vez de
// una linea movida sobre el mismo pick.
const clave = pick => `${pick.fixtureId}|${pick.market}`;

/**
 * @param anteriores  picks de la corrida previa (pueden ser [])
 * @param actuales    picks recien generados
 * @param tramos      mapa { [mercado]: buckets } para saber que tramo es cual
 */
export const detectarMovimiento = (anteriores, actuales, tramos = {}) => {
  const antes = new Map((anteriores ?? []).map(p => [clave(p), p]));
  const alertas = [];

  for (const ahora of actuales) {
    const previo = antes.get(clave(ahora));

    if (!previo) {
      if (anteriores && anteriores.length > 0) {
        alertas.push({
          tipo: 'NUEVO_PICK',
          severidad: 'baja',
          fixtureId: ahora.fixtureId,
          partido: `${ahora.homeTeam} vs ${ahora.awayTeam}`,
          mercado: ahora.market,
          detalle: `Nuevo ${ahora.market}: ${ahora.selection} al ${ahora.confidence}%`,
          antes: null,
          ahora: { confianza: ahora.confidence, probMercado: ahora.probMercado },
        });
      }
      continue;
    }

    const pa = previo.probMercado;
    const pb = ahora.probMercado;
    if (typeof pa !== 'number' || typeof pb !== 'number') continue;
    const delta = pb - pa;

    // ------------------------------------------------- la linea de goles
    if (previo.linea !== ahora.linea) {
      alertas.push({
        tipo: 'LINEA_GOLES',
        severidad: 'alta',
        fixtureId: ahora.fixtureId,
        partido: `${ahora.homeTeam} vs ${ahora.awayTeam}`,
        mercado: ahora.market,
        detalle: `La linea movio de ${previo.linea} a ${ahora.linea}. El pick de ${previo.linea} ya no aplica.`,
        antes: { linea: previo.linea, confianza: previo.confidence },
        ahora: { linea: ahora.linea, confianza: ahora.confidence },
        delta: null,
      });
      continue;
    }

    // -------------------------------------------- el mercado revirteo
    if (previo.selection !== ahora.selection) {
      alertas.push({
        tipo: 'CAMBIO_LADO',
        severidad: 'alta',
        fixtureId: ahora.fixtureId,
        partido: `${ahora.homeTeam} vs ${ahora.awayTeam}`,
        mercado: ahora.market,
        detalle: `El mercado paso de "${previo.selection}" a "${ahora.selection}". El pick anterior quedo invalidado.`,
        antes: { seleccion: previo.selection, confianza: previo.confidence },
        ahora: { seleccion: ahora.selection, confianza: ahora.confidence },
        delta: Number(delta.toFixed(4)),
      });
      continue;
    }

    // -------------------------------------------- salto de tramo
    const tAntes = tramoDe(tramos[ahora.market], pa);
    const tAhora = tramoDe(tramos[ahora.market], pb);
    if (tAntes !== -1 && tAhora !== -1 && tAntes !== tAhora) {
      const baja = ahora.confidence < previo.confidence;
      alertas.push({
        tipo: 'SALTO_TRAMO',
        severidad: Math.abs(delta) >= UMBRAL_NOTABLE || baja ? 'alta' : 'media',
        fixtureId: ahora.fixtureId,
        partido: `${ahora.homeTeam} vs ${ahora.awayTeam}`,
        mercado: ahora.market,
        detalle: `La linea se movio y ${ahora.selection} paso de ${previo.confidence}% a ${ahora.confidence}%.`,
        antes: { confianza: previo.confidence, tramo: tAntes },
        ahora: { confianza: ahora.confidence, tramo: tAhora },
        delta: Number(delta.toFixed(4)),
      });
    }
  }

  // ------------------------------------------- picks que ya no aplican
  const clavesActuales = new Set(actuales.map(clave));
  for (const previo of anteriores ?? []) {
    if (clavesActuales.has(clave(previo))) continue;
    // Si el mercado revirteo, ya se aviso arriba con el pick nuevo.
    const revirto = actuales.some(
      a => a.fixtureId === previo.fixtureId && a.market === previo.market && a.selection !== previo.selection,
    );
    if (revirto) continue;
    alertas.push({
      tipo: 'PICK_RETIRADO',
      severidad: 'media',
      fixtureId: previo.fixtureId,
      partido: `${previo.homeTeam} vs ${previo.awayTeam}`,
      mercado: previo.market,
      detalle: `${previo.selection} dejo de ser consenso: ya no aparece en los picks.`,
      antes: { confianza: previo.confidence },
      ahora: null,
      delta: null,
    });
  }

  const orden = { alta: 0, media: 1, baja: 2 };
  return alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
};

/** Quita el timestamp para poder comparar dos corridas de verdad. */
export const huella = payload =>
  JSON.stringify({
    picks: (payload.picks ?? []).map(p => [clave(p), p.confidence, p.selection, p.odds]),
    picksMercado: (payload.picksMercado ?? []).map(p => [clave(p), p.confidence, p.selection, p.odds, p.linea]),
    alertas: (payload.alertas ?? []).map(a => [a.tipo, a.fixtureId, a.detalle]),
  });