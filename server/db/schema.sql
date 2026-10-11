-- Historial de lineas de apuesta.
--
-- ESPN da `open` y `close` POR EVENTO en su core API, gratis y sin limite.
-- No hace falta ni pagar historico ni correr un poller cada 5 minutos:
-- el dato ya existe y solo hay que guardarlo.
--
-- Modelo basado en BetTrack (MIT) pero recortado a lo que de verdad
-- produce esta fuente. Sin Redis, sin Bull, sin auth, sin dashboard React.

CREATE TABLE IF NOT EXISTS lines (
  -- ESPN event id. Es el mismo en scoreboard y en el core API.
  event_id      TEXT PRIMARY KEY,
  league        TEXT NOT NULL,
  home_team     TEXT NOT NULL,
  away_team     TEXT NOT NULL,
  home_id       TEXT,
  away_id       TEXT,
  commence_time TIMESTAMPTZ NOT NULL,
  status        TEXT,
  score_home    INT,
  score_away    INT,
  bookmaker     TEXT NOT NULL DEFAULT 'draftkings',
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  times_seen    INT  NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS lines_league_idx     ON lines (league);
CREATE INDEX IF NOT EXISTS lines_commence_idx  ON lines (commence_time DESC);
CREATE INDEX IF NOT EXISTS lines_status_idx    ON lines (status);

-- Una fila por mercado y lado. Valores en DECIMAL (cuota en punto), no
-- FLOAT: 1.95 no es representable exacto en binario y al promediar
-- snapshots el error se acumula.
CREATE TABLE IF NOT EXISTS lines_quotes (
  id         BIGSERIAL PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES lines(event_id) ON DELETE CASCADE,
  market     TEXT NOT NULL,              -- 'moneyline' | 'total' | 'spread'
  side       TEXT NOT NULL,              -- 'home' | 'away' | 'over' | 'under'
  line_val   DECIMAL(6,2),               -- 2.50 = linea de goles; handicap
  opened     DECIMAL(6,3),               -- apertura segun ESPN
  current    DECIMAL(6,3),               -- ultima lectura
  closed     DECIMAL(6,3),               -- cierre; NULL hasta que empieza
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, market, side)
);

CREATE INDEX IF NOT EXISTS quotes_event_idx ON lines_quotes (event_id);

-- Un evento con apertura y cierre ya es un resultado utilizable.
CREATE TABLE IF NOT EXISTS line_movements (
  id         BIGSERIAL PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES lines(event_id) ON DELETE CASCADE,
  market     TEXT NOT NULL,
  side       TEXT NOT NULL,
  opened     DECIMAL(6,3),
  current    DECIMAL(6,3),
  closed     DECIMAL(6,3),
  -- Cambio en probabilidad implicita, en puntos porcentuales.
  -- Positivo = el mercado fue mas generoso de lo que abre, la accion cae.
  move_pct   DECIMAL(8,4),
  complete   BOOLEAN NOT NULL DEFAULT FALSE,  -- ¿hay cierre ya?
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, market, side)
);