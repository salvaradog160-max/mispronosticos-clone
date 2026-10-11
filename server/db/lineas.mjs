/**
 * Descarga lineas de ESPN y guarda apertura/cierre en Postgres.
 *
 * POR QUE NO HAY POLLER: ESPN expone `open` y `close` por evento en su
 * core API, gratis y sin limite. El historico ya existe; solo hay que
 * guardarlo. Un poller cada 5 minutos seria trabajo para重建 el mismo
 * dato.
 *
 * El truco esta en el scoreboard: `site.api.../scoreboard` trae la
 * cuota ACTUAL pero no el open/close. El open/close vive en
 * `sports.core.api.espn.com` y hay que pedirlo evento por evento.
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

const PG_URL = process.env.DATABASE_URL
  ?? 'postgresql://lineas:lineas_dev_2026@localhost:55432/lineas';

const LEAGUES = (process.env.LIGAS ?? 'eng.1,esp.1,ita.1,ger.1,fra.1,mex.1,arg.1,bra.1,por.1,ned.1').split(',');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) lineas/1.0';
const get = async url => {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json();
};

// Americana -> decimal. El core API de ESPN trae americano (+160 / -110).
const toDecimal = a => {
  const n = Number(a);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
};

/** Partidos de una liga, del scoreboard publico. */
const scoreboard = async league => {
  const d = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?limit=100`);
  return (d.events ?? []).map(e => {
    const c = e.competitions?.[0] ?? {};
    const h = c.competitors?.find(x => x.homeAway === 'home');
    const a = c.competitors?.find(x => x.homeAway === 'away');
    const provider = (c.odds?.[0]?.provider?.id) ?? '100';
    const state = c.status?.type?.state ?? null;

    // ESPN devuelve score "0" en partidos POR JUGAR. No es un cero real,
    // es un valor por defecto. Guardarlo como 0-0 hacia que un partido sin
    // jugar se cuente como empate. Solo hay marcador si empezo.
    const empezada = state === 'in' || state === 'post';

    return {
      eventId: String(e.id),
      league,
      homeTeam: h?.team?.displayName ?? 'Local',
      awayTeam: a?.team?.displayName ?? 'Visitante',
      homeId: h?.team?.id ?? null,
      awayId: a?.team?.id ?? null,
      commenceTime: e.date,
      status: state,
      scoreHome: empezada && h?.score != null ? Number(h.score) : null,
      scoreAway: empezada && a?.score != null ? Number(a.score) : null,
      bookmaker: 'draftkings',
      provider,
    };
  });
};

/**
 * Linea completa de un partido, con apertura y cierre.
 *
 * ESPN responde 404 en core API cuando aun no hay casa asignada, y
 * devuelve `close: null` mientras el partido no ha empezado. Los dos
 * casos son normales, no errores.
 */
const lineaEvento = async (league, ev) => {
  const url =
    `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${league}` +
    `/events/${ev.eventId}/competitions/${ev.eventId}/odds/${ev.provider}`;

  let o;
  try {
    o = await get(url);
  } catch {
    return { ...ev, quotes: [] };      // sin linea todavia
  }

  const quotes = [];

  // Cada mercado lee SU PROPIO campo. Antes se usaba `moneyLine` para los
  // dos y por eso el handicap salia copia del 1X2:
  //   moneyLine    = 225   <- precio del 1X2 (local gana)
  //   spreadOdds   = -145  <- precio del handicap (local -0.5)
  const push = (market, side, line, node, campo) => {
    const f = campo ?? 'moneyLine';
    const opened = toDecimal(node?.open?.[f]?.american);
    const current = toDecimal(node?.[f]);
    const closed = toDecimal(node?.close?.[f]?.american);
    if (opened == null && current == null && closed == null) return;
    quotes.push({ market, side, line: line ?? null, opened, current, closed });
  };

  push('moneyline', 'home', null, o.homeTeamOdds, 'moneyLine');
  push('moneyline', 'away', null, o.awayTeamOdds, 'moneyLine');

  // Handicap: el precio va en spreadOdds y la linea en pointSpread.
  // La linea de apertura puede diferir de la actual (p. ej. abrio en
  // -0.5 y esta en -1.0), asi que se guarda la que corresponda.
  const lineaActual = o.spread ?? null;
  const lineaApertura = Number(o.open?.pointSpread?.american);
  const lineaCierre = Number(o.close?.pointSpread?.american);

  for (const [side, node] of [['home', o.homeTeamOdds], ['away', o.awayTeamOdds]]) {
    const sp = node?.spreadOdds ?? node?.open?.spread;
    if (sp == null) continue;
    quotes.push({
      market: 'spread',
      side,
      line: lineaActual,
      opened: toDecimal(node?.open?.spread?.american),
      current: toDecimal(node?.spreadOdds),
      closed: toDecimal(node?.close?.spread?.american),
    });
  }
  void lineaApertura;
  void lineaCierre;

  // Total de goles: over/under salen como numero plano, no como objeto.
  // OJO: `open.overOdds` llega NULL en ESPN, asi que el mercado total no
  // tiene apertura. No se inventa: se guarda lo que hay.
  const ou = o.overOdds != null ? toDecimal(o.overOdds) : null;
  const un = o.underOdds != null ? toDecimal(o.underOdds) : null;
  if (ou != null || toDecimal(o.open?.overOdds) != null || toDecimal(o.close?.overOdds) != null) {
    quotes.push({ market: 'total', side: 'over', line: o.overUnder ?? null,
      opened: toDecimal(o.open?.overOdds), current: ou, closed: toDecimal(o.close?.overOdds) });
  }
  if (un != null || toDecimal(o.open?.underOdds) != null || toDecimal(o.close?.underOdds) != null) {
    quotes.push({ market: 'total', side: 'under', line: o.overUnder ?? null,
      opened: toDecimal(o.open?.underOdds), current: un, closed: toDecimal(o.close?.underOdds) });
  }

  return { ...ev, quotes };
};

/** Variacion en puntos porcentuales de probabilidad implicita. */
const movePct = (opened, current) => {
  if (opened == null || current == null || opened <= 1 || current <= 1) return null;
  return ((1 / current) - (1 / opened)) * 100;
};

/** Anota el error con que consulta fallo: tres INSERT casi iguales fallan igual de opaco. */
const qdb = async (db, sql, etiqueta, params) => {
  try {
    return await db.query(sql, params);
  } catch (e) {
    e.message = `[${etiqueta}] ${e.message}`;
    throw e;
  }
};

const guardar = async (db, ev) => {
  await qdb(db,
    `INSERT INTO lines (event_id, league, home_team, away_team, home_id, away_id,
                        commence_time, status, score_home, score_away, bookmaker)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (event_id) DO UPDATE SET
       status      = EXCLUDED.status,
       score_home  = EXCLUDED.score_home,
       score_away  = EXCLUDED.score_away,
       last_seen_at= now(),
       times_seen  = lines.times_seen + 1`,
    'lines', [ev.eventId, ev.league, ev.homeTeam, ev.awayTeam, ev.homeId, ev.awayId,
     ev.commenceTime, ev.status, ev.scoreHome, ev.scoreAway, ev.bookmaker ?? 'draftkings'],
  );

  for (const q of ev.quotes) {
    // El cierre NUNCA se sobrescribe con null: mientras no exista se
    // conserva el que hubiera. Perder el cierre al re-consultar seria
    // perder el unico dato que no se puede recuperar.
    await qdb(db,
      `INSERT INTO lines_quotes (event_id, market, side, line_val, opened, current, closed)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (event_id, market, side) DO UPDATE SET
         current   = COALESCE(EXCLUDED.current,   lines_quotes.current),
         closed    = COALESCE(EXCLUDED.closed,    lines_quotes.closed),
         opened    = COALESCE(EXCLUDED.opened,    lines_quotes.opened),
         line_val  = COALESCE(EXCLUDED.line_val,  lines_quotes.line_val),
         captured_at = now()`,
      'lines_quotes', [ev.eventId, q.market, q.side, q.line, q.opened, q.current, q.closed],
    );

    const mv = movePct(q.opened, q.current);
    await qdb(db,
      `INSERT INTO line_movements (event_id, market, side, opened, current, closed, move_pct, complete)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (event_id, market, side) DO UPDATE SET
         opened=EXCLUDED.opened, current=EXCLUDED.current,
         closed=COALESCE(EXCLUDED.closed, line_movements.closed),
         move_pct=EXCLUDED.move_pct,
         complete = COALESCE(line_movements.complete, EXCLUDED.complete),
         computed_at = now()`,
      'line_movements', [ev.eventId, q.market, q.side, q.opened, q.current, q.closed, mv, q.closed != null],
    );

    // El cable del telefono: UNA lectura por corrida (append, no upsert).
    // Asi se ve como se fue moviendo la cuota de apertura a cierre,
    // "de que lado se va". Si en esta corrida no hay valor, no se anade
    // fila (evita ruido de puntos sin dato).
    if (q.opened != null || q.current != null || q.closed != null) {
      await qdb(db,
        `INSERT INTO line_series (event_id, market, side, line_val, opened, current, closed, move_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        'line_series', [ev.eventId, q.market, q.side, q.line, q.opened, q.current, q.closed, mv],
      );
    }
  }
};

const main = async () => {
  const db = new Client({ connectionString: PG_URL });
  await db.connect();
  let partidos = 0, conLinea = 0, citas = 0, conCierre = 0;

  for (const league of LEAGUES) {
    let eventos = [];
    try {
      eventos = await scoreboard(league);
    } catch (e) {
      console.log(`  ${league.padEnd(7)} scoreboard fallo: ${e.message}`);
      continue;
    }
    let n = 0;
    for (const ev of eventos) {
      partidos++;
      const full = await lineaEvento(league, ev);
      await guardar(db, full);
      if (full.quotes.length) { conLinea++; citas += full.quotes.length; }
      if (full.quotes.some(q => q.closed != null)) conCierre++;
      n++;
    }
    console.log(`  ${league.padEnd(7)} ${n} partidos, ${full(conLinea)}`);
  }

  await db.end();
  const resumen = await new Client({ connectionString: PG_URL });
  const r = await resumen.query(`
    SELECT (SELECT count(*) FROM lines)                                        AS partidos,
           (SELECT count(*) FROM lines_quotes)                                AS citas,
           (SELECT count(*) FROM lines_quotes WHERE opened IS NOT NULL)       AS con_apertura,
           (SELECT count(*) FROM lines_quotes WHERE closed IS NOT NULL)       AS con_cierre`);
  const t = r.rows[0];
  console.log(`\nTotal: ${t.partidos} partidos · ${t.citas} citas · ${t.con_apertura} con apertura · ${t.con_cierre} con cierre`);
  await resumen.end();
};
const full = n => String(n).padStart(4);

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });