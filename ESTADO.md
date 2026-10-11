# Estado — 10-oct-2026

## Hecho

### REA instalado
MCP `rea` v6.3.0 registrado en `~/.config/opencode/opencode.json`.
Skill `reverse-engineer-anything` en `~/.agents/skills/`.
Ghidra / Hopper **no instalados** — no hacen falta: la app no tiene `.so`.

### Recon del APK
- `recon/mispronosticos.apk` — original
- `recon/apk_raw/` — descomprimido, incluye `assets/index.android.bundle`
- `recon/apk_res/` — apktool 3.0.3 (smali + recursos + manifest)
- `recon/jadx_out/` — JADX 1.5.6
- `recon/apk_raw/assets/index.android.bundle.ALLSTRINGS.txt` — 9,886 strings

### Tema extraído del bundle (paleta real)
```
bg          #0b0f14      surface      #0f1a2a     surfaceAlt #243042
text        #e8eef7      textMuted    #94a3b8     border     #5c6f8a
accent      #00E0B8      accentDim    #00a878     tint       rgba(0,224,184,.1)
blue        #2196f3      star         #fbbf24     success    #4ade80
overlay     rgba(28,44,70,0.8)
```

### Clon compilando
`MisPronosticosClone/` — RN 0.87.1, Hermes, paper, react-navigation v7,
firebase (app/auth/messaging/analytics/crashlytics/remote-config), i18next.

- `src/theme.ts` — paleta
- `src/domain/picks.ts` — tipos + reglas (`passesTopAiGate`, `confidenceToStars`)
- `src/screens/{TopAi,Live,Specials,Profile}Screen.tsx`
- `src/navigation/RootNavigator.tsx` — 4 tabs

`tsc --noEmit` limpio · `jest` 1/1 verde · `gradlew assembleDebug` **EXIT=0**
APK: `android/app/build/outputs/apk/debug/app-debug.apk` (167 MB, todas las ABIs).

### Verificado corriendo en emulador
AVD `mpclone` (Android 15, API 35, pixel_6, x86_64, KVM).
Instalado, las 4 tabs navegadas y capturadas: Top AI · En vivo · Especiales · Perfil.
Logcat limpio, sin errores JS ni crashes.

```
~/Android/Sdk/emulator/emulator -avd mpclone -no-snapshot   # arrancar
adb reverse tcp:8081 tcp:8081                              # sin esto no carga el bundle
npx react-native start --host 0.0.0.0                      # Metro (PID en /tmp/opencode/metro.pid)
```

## Capa de datos lista (10-oct, tarde)

`src/config.ts` — los 5 parámetros de Remote Config, con fallback. **La URL del backend
va aquí, no hardcodeada** — que es justo lo que el original hace y por eso no lo encontramos
en el bundle.

`src/firebase/index.ts` — init opcional. `firebaseReady` es false sin `google-services.json`
y la app sigue corriendo con el repositorio mock.

`src/data/` — interfaz `PicksRepository` + `createMockRepository` + `createApiRepository`.
Cambias de uno a otro sin tocar las pantallas.

`src/entitlements.ts` — trial de N días + Premium. Regla extraída del original:
**Top AI siempre abierto; Live y Especiales requieren trial activo o plan premium.**

`android/app/build.gradle` — el plugin de google-services se aplica **solo si existe el
json**, así el build no se rompe sin él.

Verificado: `tsc` limpio · **15/15 tests** · `assembleDebug` EXIT=0 · app corriendo en emulador.

### Firebase conectado (10-oct, noche)

Proyecto **`mispronosticos-clone-222af`** creado, app Android registrada con
package `com.mispronosticosclone`, `google-services.json` en su sitio y agregado
al `.gitignore`.

Confirmado en el emulador por logcat:
```
ReactNativeJS: [firebase] ready=true api=https://api.mispronosticos.local conf=78
```

- Las pantallas ya leen del repositorio (`usePicks`), no de datos hardcodeados.
- El filtro funciona de verdad: de 3 picks mock solo salen 2 (el de 71%/3★ se
  descarta por la puerta de Top AI).
- `api_base_url` sigue apuntando a `.local` → el repositorio mock sigue activo.
  En cuanto lo cambies en Remote Config, la app pega contra el backend real sin
  tocar código.

**Dos cosas que fix:** Crashlytics reventaba el arranque sin su plugin de Gradle
(`IllegalStateException: The Crashlytics build ID is missing`). Agregado el plugin.
El bloque `crashlytics { mappingFileUploadEnabled = false }` **no** se deja — el plugin
registra la extensión bajo otro nombre en esta versión de AGP; solo importa en builds
release, y para eso hay que revisarlo.

**Pendiente cosmético:** la `ProgressBar` de react-native-paper no pinta dentro de una
fila (`flexDirection: 'row'`), aunque sí funciona en columna. En Live se ve, en Top AI no.
El número de % ya está a la vista, así que no bloquea nada.

### Script de arranque
`setup-firebase.sh` — login, lista de proyectos, dónde pegar el json, y los 5 parámetros
de Remote Config que hay que publicar.

## Bloqueado / requiere acción humana

### El backend del original **no se pudo leer**
Sondeado todo lo público del proyecto `mispronosticos-9b4fc`:

| Servicio | Resultado |
|---|---|
| RTDB `*.appspot.com/.json` | **404** — instancia no existe (el `databaseURL` del `google-services.json` es vestigial) |
| Firestore REST | **403 SERVICE_DISABLED** — la API nunca se activó |
| Firebase Hosting `web.app` / `firebaseapp.com` | **404 "Site Not Found"** |
| Cloud Functions | 404 |
| Remote Config REST | **401** — exige OAuth, no sirve la API key |

Conclusión: ese proyecto Firebase solo sirve **Auth / Analytics / Crashlytics / FCM /
Remote Config / Installations**. El backend de datos vive en otro sitio, y **su URL se
inyecta en runtime desde Remote Config** (por eso no aparece en el bundle).

**Para desbloquearlo hace falta una sesión autenticada**: tu cuenta de Firebase
(`firebase login`) para leer la Remote Config del proyecto, o un dispositivo con la app
instalada + proxy para ver el tráfico.

### El algoritmo de "live reasoning" no está en el cliente
El bundle solo *renderiza* lo que llega del backend. Sin ver tráfico de un partido en
curso, R5 sería inventada.

## Siguiente paso recomendado
1. `firebase login` y leer Remote Config del proyecto → sale la URL del backend.
2. Instalar el APK debug en un dispositivo y capturar tráfico en un partido en vivo.