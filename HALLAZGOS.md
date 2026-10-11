# MisPronosticos AI — Recon del APK

Fecha: 2026-10-10 · App: `com.mispronosticos` · Play Store (`mispronosticos.com`)

## Qué se hizo
1. Descarga del APK desde mirror público (APKPure CDN).
2. Descompresión + `strings` sobre `classes*.dex` y `assets/`.
3. Decompilación con JADX 1.5.6 → `recon/jadx_out/sources/`.

## Arquitectura
| Capa | Hallazgo |
|---|---|
| UI | **React Native** (no Kotlin/Compose, no Flutter) |
| Bundle JS | `assets/index.android.bundle`, 4.1 MB, **Hermes bytecode** |
| Nativo | Kotlin壳 mínimo: `MainActivity.java`, `MainApplication.java` |
| Binarios `.so` | **ninguno** → no hace falta Ghidra/Hopper |
| UI kit | react-native-paper (Material) + AntDesign refs |
| Navegación | @react-navigation (bottom-tabs + stack + material-top-tabs) |
| Idioma | i18next (es/en/pt/fr + más) |

## Backend — Firebase `mispronosticos-9b4fc`
Hallado en `resources.arsc` (valores de `google-services.json` bakeados), NO en el bundle JS:

- `project_id`: `mispronosticos-9b4fc`
- `databaseURL`: `mispronosticos-9b4fc.appspot.com`
- `google_api_key`: `AIzaSyB...[REDACTADA-third-party]`
- `default_web_client_id` presente

Módulos Firebase presentes en el bundle: `firestore`, `auth`, `messaging` (FCM/push),
`analytics`, `remoteconfig`, `crashlytics`, `integrity` (Play Integrity).

## Servicios de terceros
| Servicio | Uso |
|---|---|
| `api.ipinfo.io?token=e5e1b36ad127b9...` | **token vivo hardcodeado en el bundle** — geo del usuario |
| `challenges.cloudflare.com/turnstile` | Turnstile anti-bot (login/registro) |
| `kit.openiap.dev/v1/purchase/verify` | verificación de compras (react-native-iap) |
| `refpa3665.com` | red de anuncios / referidos |
| Google AdMob (`admob-gmats`) | ads |
| Notifee | notificaciones push locales |
| `socket.io-client` | socket en vivo (el endpoint no aparece en el bundle) |

## Funcionalidad declarada (bundle + web)
- Picks del día con **confianza en %** y estrellas (4★ / 5★).
- **Análisis IA en vivo**: recalcula probabilidades minuto a minuto durante el partido.
- Módulo "pronósticos especiales" con **badge de validación humana**.
- Histórico de picks / análisis guardados.
- Rating de tienda (`rate 5 star` / `setIdentifyConfidence`).
-，显得 "Top AI" diario, ranking por confianza.
- Login Google + email, trial, IAP (`trial`, `trialExpired`, `iap.errors.alreadyOwned`, `restorePurchases`).

## Cosas que faltan por extraer (siguiente fase)
El **algoritmo de los picks vive en el Hermes bytecode**, no es legible con `strings`.
Hace falta `hermes-dec` / `hbctool` para descompilar `index.android.bundle` a JS legible,
o REA (ya instalado) con su análisis de JS.

## Caveats
- El bundle es bytecode: los nombres de variables del string table aparecen **concatenados**
  sin separadores. `grep` sobre URLs/`strings` da falsos negativos. Usar extracción por offsets.
- No se ha tocado ni re-empaquetado el APK. Todo es lectura estática.

## Artefactos
```
recon/mispronosticos.apk     # APK original
recon/apk_raw/               # contenido descomprimido (incluye index.android.bundle)
recon/jadx_out/sources/      # Java/Kotlin decompilado
```