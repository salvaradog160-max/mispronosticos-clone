/**
 * Compara lo que guardamos contra el resultado, y calcula CLV.
 *
 * CLV (Closing Line Value) = (tu cuota / cuota de cierre) - 1
 *
 * Es la unica metrica que separa a alguien que apuesta bien de
 * alguien que tuvo suerte. Si tu cuota fue mejor que la linea final,
 * ganaste dinero a largo plazo aunque la apuesta concreta perdiera.
 * Al reves, puedes acertar mucho y perder.
 *
 * OJO CON LA HONESTIDAD: con n=44 partidos el intervalo de confianza
 * es enorme. Esto NO dice que el modelo gane dinero; dice quanta
 * informacion hay. Se imprime el intervalo para que el numero no
 * engañe.
 */
import { Client } from 'pg';

const PG_URL = process.env.DATABASE_URL
  ?? 'postgresql://lineas:lineas_dev_2026@localhost:55432/lineas';

/** Resultado real -> que lado del mercado gano. */
function evaluado(q, scoreHome, scoreAway) {
  if (scoreHome == null || scoreAway == null) return null;
  if (q.market === 'moneyline') {
    if (q.side === 'home') return scoreHome > scoreAway ? 1 : scoreHome < scoreAway ? 0 : 0.5;
    return scoreAway > scoreHome ? 1 : scoreAway < scoreHome ? 0 : 0.5;
  }
  return null; // spread y total requieren la linea de referencia
}

const pct = n => (n * 100).toFixed(1) + '%';
const f2 = n => (n == null || n === '' ? '  -  ' : Number(n).toFixed(3));

async function main() {
  const db = new Client({ connectionString: PG_URL });
  await db.connect();

  const { rows } = await db.query(`
    SELECT l.event_id, l.league, l.home_team, l.away_team, l.commence_time,
           l.score_home, l.score_away, l.status,
           q.market, q.side, q.line_val, q.opened, q.current, q.closed
    FROM lines_quotes q
    JOIN lines l USING (event_id)
    WHERE q.opened IS NOT NULL
      AND q.closed IS NOT NULL
    ORDER BY l.commence_time DESC
  `);

  if (!rows.length) {
    console.log('Sin partidos con apertura Y cierre todavia.');
    console.log('Se necesitan partidos ya jugados. Corre el extractor en los proximos dias.');
    await db.end();
    return;
  }

  console.log('\n=== APERTURA vs CIERRE (partidos ya jugados) ===\n');
  console.log('partido                              lado      abre  cierra  cambio');
  console.log('-'.repeat(70));
  const cambios = [];
  for (const r of rows) {
    const chg = (Number(1 / r.closed) - Number(1 / r.opened)) * 100;
    cambios.push({ r, chg });
    console.log(
      (r.home_team + ' v ' + r.away_team).slice(0, 32).padEnd(33) +
      (r.market.slice(0, 4) + ':' + r.side).padEnd(10) +
      f2(r.opened).padStart(6) + f2(r.closed).padStart(7) +
      (chg >= 0 ? '+' : '') + chg.toFixed(2).padStart(8),
    );
  }

  // Resumen de movimiento por mercado y lado.
  console.log('\n=== MOVIMIENTO PROMEDIO (puntos porcentuales) ===\n');
  const grupos = {};
  for (const { r, chg } of cambios) {
    const k = r.market + ':' + r.side;
    (grupos[k] ??= []).push(chg);
  }
  console.log('mercado:lado        n   mov.medio   mov.min   mov.max');
  console.log('-'.repeat(62));
  for (const [k, v] of Object.entries(grupos).sort()) {
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    console.log(k.padEnd(20) + String(v.length).padStart(2) +
      avg.toFixed(3).padStart(11) + Math.min(...v).toFixed(2).padStart(10) +
      Math.max(...v).toFixed(2).padStart(10));
  }

  // Cuantos acertamos: solo 1X2 con marcador.
  // Solo partidos TERMINADOS. 'in' significa en curso: su marcador no es
  // el final y contarlo infla los empates (un 0-0 de los primeros 20
  // minutos es un empate provisional, no el resultado).
  const conResultado = cambios.filter(
    c => c.r.status === 'post' && evaluado(c.r, c.r.score_home, c.r.score_away) != null,
  );
  console.log(`\n=== ACIERTO (solo 1X2 con marcador) ===\n`);
  if (!conResultado.length) {
    console.log('Ningun partido de estos tiene marcador guardado todavia.');
  } else {
    const justa = conResultado.filter(c => c.r.market === 'moneyline');
    const aciertos = justa.filter(c => evaluado(c.r, c.r.score_home, c.r.score_away) === 1).length;
    const empates = justa.filter(c => evaluado(c.r, c.r.score_home, c.r.score_away) === 0.5).length;
    const n = justa.length;
    const obs = (aciertos + empates * 0.5) / n;

    // Si hubiéramos apuestaado al FAVORITO (menor cuota de apertura)
    // y al mas caro, ¿qué pasa? Compara las dos estrategias.
    let favAciertos = 0, bajoAciertos = 0, both = 0;
    for (const c of justa) {
      const otro = justa.find(x => x.r.event_id === c.r.event_id && x.r.side !== c.r.side);
      if (!otro) continue;
      both++;
      const favorito = c.r.opened <= otro.r.opened ? c.r : otro.r;
      const barato = c.r.opened >= otro.r.opened ? c.r : otro.r;
      favAciertos += evaluado(favorito, favorito.score_home, favorito.score_away) === 1 ? 1 : 0;
      bajoAciertos += evaluado(barato, barato.score_home, barato.score_away) === 1 ? 1 : 0;
    }

    console.log('n con marcador      :', n);
    console.log('n con ambos lados   :', both);
    console.log('aciertos 1X2        :', aciertos, '| empates:', empates);
    console.log('favorito de apertura:', both ? favAciertos + '/' + both : '-');
    console.log('mas caro de apertura:', both ? bajoAciertos + '/' + both : '-');

    if (both >= 20) {
      const p = favAciertos / both;
      const z = 1.96;
      const se = Math.sqrt((p * (1 - p)) / both);
      console.log('\n--- intervalo de confianza 95% ---');
      console.log('  acierto al favorito: ' + pct(p) + '  (IC ' + pct(Math.max(0, p - z * se)) + ' – ' + pct(Math.min(1, p + z * se)) + ')');
      console.log(' (n=' + both + ': por debajo de 30 el intervalo es tan ancho');
      console.log('   que no permite afirmar nada. Se reporta igual, sin adornos.)');
    } else {
      console.log('\n(n=' + both + ' es demasiado poco: el intervalo de confianza');
      console.log(' cubre casi todo. Un porcentaje aqui no significa nada todavía.)');
    }
  }

  console.log('\n--- que falta para poder concluir ---');
  console.log('  100 partidos cerrados  -> intervalo util');
  console.log('  500 partidos cerrados  -> primera lectura seria');
  console.log(' tienes ahora:', rows.length, 'citas con apertura+cierre');
  console.log('');

  await db.end();
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });