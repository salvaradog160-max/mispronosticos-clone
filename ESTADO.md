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
