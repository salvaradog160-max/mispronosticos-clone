import { partidosDelDia, cuotasEvento } from '../providers/rapidapi-sportapi.mjs';

const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const hoy = new Date().toISOString().slice(0, 10);

for (const liga of ['mex.1', 'arg.1', 'col.1', 'chi.1', 'bra.1']) {
  for (const fecha of [ayer, hoy]) {
    const { eventos: evs } = await partidosDelDia(liga, fecha);
    if (!evs.length) continue;
    console.log(`${liga} ${fecha} -> ${evs.length} partidos`);
    for (const e of evs.slice(0, 2)) {
      const q = await cuotasEvento(e.id);
      const linea = q.sinCuotas || q.error
        ? `SIN CUOTAS (${q.error || 'no hay mercado 1X2'})`
        : `A ${q.apertura['1']}/${q.apertura['X']}/${q.apertura['2']}` +
          ` -> C ${q.cierre['1']}/${q.cierre['X']}/${q.cierre['2']}`;
      console.log(`   ${e.homeTeam.name.slice(0, 22)} vs ${e.awayTeam.name.slice(0, 22)}`);
      console.log(`      ${linea}`);
    }
  }
}