# Estado — 11-oct-2026

## Hecho (cronológico)

### Recon del APK original
- `recon/mispronosticos.apk` + `apk_raw/` + `apk_res/` (apktool) + `jadx_out/` (JADX 1.5.6)
- Tema extraído: `bg #0b0f14 · surface #0f1a2a · accent #00E0B8 · text #e8eef7`
- Backend del original NO se pudo leer (es bait de marketing / LLM). Su fuente real es paga.

### Clon funcional (`MisPronosticosClone/`)
RN 0.87.1 + firebase. 4 tabs (Top AI / En vivo / Especiales / Perfil). Verificado en emulador.
Backend del clone = **server/** Node ESM, 100% fuentes públicas (football-data.co.uk + ESPN), sin claves.

### Data pipeline (server/)
- `scripts/daily.mjs` → `public/picks.json` (la app lo lee por GitHub raw, `dataSource:'static'`)
- Calibración por buckets (n≥50) + Wilson CI + shrinkage bayesiano; regenerado con 8 temporadas
- Backtest histórico: consenso 52.1% acierto (n=35,973), ROI base −4.49%, max drawdown reportado
- `db/lineas.mjs` + Postgres (docker `lineas-postgres`): apertura y cierre de líneas ESPN

### Ladder de cuota justa + goles por tiempo (11-oct)
- `engine/ladder.mjs`: 1X2, O/U 0.5–4.5, AA, marcadores top-6, TODO como cuota justa (1/p)
- `desglosarTiempos()`: goles esperados 1T/2T con **fracción real por liga** (football-data HTHG/HTAG:
  E1 .454, SP1 .447, I1 .434, D1 .469, F1 .443; default .45). 56/56 partidos con tiempos.
- UI: sección "GOLES ESPERADOS POR TIEMPO" y "CUOTA JUSTA DEL MODELO POR MERCADO" en el detalle
- `engine/valor.mjs` MARGEN_MAXIMO=0.15: rechaza cuotas con >15pp de ventaja (error de dato)
- max drawdown en backtest + RendimientoScreen

### Automatización (11-oct)
- `db/cron-publicar.sh` cada **60 min**: daily.mjs → publicar-si-cambia.mjs (huella sin timestamp) → commit+push
- `db/cron-lineas.sh` cada **30 min**: extiende apertura/cierre en Postgres
- Barra de confianza propia (paper ProgressBar no pintaba en fila/theme oscuro)

## Queda (todos bloqueados por decisión humana)
- **Backend original y "live reasoning"**: el proyecto Firebase del original es vestigial (Firestore disabled,
  RTDB 404). Su URL real se inyecta por Remote Config → imposible de leer sin `firebase login` o capturar
  tráfico de un dispositivo con la app original en un partido en vivo. Esto NO bloquea la app clonada.
- **Activar backend propio**: la app usa `data_source='static'` (GitHub raw). Hay un server HTTP opcional
  (`server/src/index.mjs`, puerto 8787, endpoints `/picks/top` y `/picks/specials`) si se prefiere un API
  viva en vez de raw. Cambiar `picks_url` / `api_base_url` en Remote Config.
- **Cobertura de ligas**: football-data es Europa; ESPN cubre las de América. Si faltaran ligas concretas,
  la API pública de FotMob ya está verificada (endpoints `/api/data/*`, 567 ligas) pero NO integrada.

## Cómo correr
- Emulador: `~/Android/Sdk/emulator/emulator -avd mpclone -no-snapshot`
- `adb reverse tcp:8081 tcp:8081` + `npx react-native start --host 0.0.0.0`
- Tests server: `node --test engine/*.test.mjs` (124) · App: `npx jest` (20) en MisPronosticosClone/
- Debug APK: `MisPronosticosClone/android/app/build/outputs/apk/debug/app-debug.apk`

## Análisis combinado real (11-oct, tarde)

**Ya no se captura nada a mano.** El motor `engine/historial.mjs` construye los
cuadros que la herramienta manual pedía (General / L-V / H2H con promedio,
mediana, DE y ≥1 gol) desde la historia descargada: **38,685 partidos**,
football-data (Europa, 6 temporadas) + espn-historia (América, 6 años,
`limit=1000` — antes 400 recortaba MLS y perdía H2H como Nashville–Sporting KC).

- Combinada: **50% modelo · 30% base (últ.5 L/V) · 20% H2H L/V**; si falta
  fuente, se reparte. Riesgo: bajo ≥75%, medio ≥60%, sube un nivel si el
  modelo y el historial difieren ≥25 pp.
- La pestaña **Análisis** (ya sin "IA", y sin la pestaña "IA en vivo" que no
  existe) muestra: se inclina a, tabla 1X2 modelo/historial/combinada,
  recomendación con cuota justa @, pronósticos ordenados, oportunidades,
  riesgos, y tendencias O/U reales por línea.
- **H2H real** (serie G/E/P, promedio, mediana, ≥1 gol) — ya no dice
  "sin enfrentamientos" para partidos que sí los tienen.
- **Cable de la cuota** (`line_series`, un INSERT por corrida de 30'): la
  app dibuja apertura → lecturas → cierre, "de qué lado se va". 16/53
  partidos lo traen hoy (el cron de líneas los va poblando).
- Fix: tendencias O/U aceptaban solo filas crudas; con filas de equipo
  {gf,gc} daban 0%. Corregido, test añadido. Server 131/131, app 20/20.

### Nota sobre el emulador
La app debug embebe `index.android.bundle` en el APK (2.1MB). Para ver
cambios de código hay que: `npx react-native bundle --platform android
--dev true --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle
--assets-dest android/app/src/main/res` + `./gradlew app:assembleDebug` +
`adb install -r`. Metro no manda mientras el APK tenga bundle embebido.
En producción esto es lo correcto (release embebe igual).

## Forense de partidos terminados + solo liga (11-oct, noche)

- `scripts/forense.mjs`: reconstruye el análisis de un partido terminado
  con SOLO la historia previa al kickoff (sin contaminar con partidos
  posteriores) y SOLO liga. Marca cada pronóstico del ranking como
  acierto/fallo contra el marcador real.
  Uso: `node scripts/forense.mjs "P1" "Rio Ave" "Nacional" 2026-02-08 3 2`
- **Solo liga:** `espn-historia` filtra por `event.season.slug` y descarta
  playoffs/copas/all-star (decisión del usuario: las copas alteran la
  muestra). MLS bajó 2969->2851, Argentina 2423->2351.
- Ranking extendido: incluye **Over/Under y Ambos anotan combinados**
  (50% modelo Poisson + 50% historial), como la herramienta manual,
  con "modelo 72.7% · hist 100%" en cada uno.
- Emulador: bundle embebido regenerado con el ranking completo.
