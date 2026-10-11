# Especificación del clon — MisPronosticos AI

Base: análisis estático del APK `com.mispronosticos` (RN 0.7x + Hermes v96).
Todo marcado **[OBS]** está verificado en el binario; **[INF]** es inferencia razonada.

---

## 1. Stack (a replicar)

| Capa | Original | Clon |
|---|---|---|
| Motor | React Native + Hermes | RN ≥0.76 + Hermes (mismo) |
| UI | react-native-paper (Material) | igual |
| Navegación | @react-navigation bottom-tabs + stack | igual |
| Backend | Firebase `mispronosticos-9b4fc` | Firebase nuevo (RTDB o Firestore) |
| Auth | Firebase Auth (Google + email) | igual |
| Pagos | react-native-iap + openiap verify | igual |
| Push | Notifee + FCM | igual |
| Ads | AdMob + `refpa3665.com` | igual / opcional |
| Anti-bot | Cloudflare Turnstile | igual |
| i18n | i18next (es/en/pt/fr) | igual |

**[OBS]** Bundle: `assets/index.android.bundle`, 4.1 MB, Hermes v96.
**[OBS]** Cero `lib/*.so` → el 100% de la lógica es JS. No hay código nativo que reimplementar.
**[OBS]** Java nativo: solo `MainActivity.java` + `MainApplication.java` (shell de RN).

---

## 2. Config Firebase que hay que replicar (plantilla)

```
project_id:      <nuevo>
databaseURL:     <nuevo>.appspot.com     (o Firestore)
google_api_key:  AIza...
```

> **[INF]** El original expone la API key de Firebase en `resources.arsc` — es configuración
> de cliente, no un secreto. Firebase Realtime Database **no** lo protege por clave: la
> seguridad va en las reglas. Si el clon copia el modelo tal cual, lo critical es escribir
> reglas estrictas desde el día 1.

---

## 3. Superficie funcional (claves i18n recuperadas)

### 3.1 **Top AI** — `guides.topAi.*`, `topAi.*` **[OBS]**
Pantalla principal de picks del día.
- `topAi.title`, `topAi.hero1/hero2/heroSubtitle`
- `topAi.filters.body/Title`, `topAi.filterChipsRow`, `topAi.oddsMax`, `topAi.category`,
  `topAi.allCategories`
- `topAi.listOrder`, `topAi.listLoadFailed`, `topAi.emptyTitle`
- `topAi.save.{title,body,kicker,highlight}` → **guardar pick**
- `topAi.where.{title,body,step}` → **tutorial "dónde está"**
- `topAi.premium.{title,body,kicker}` → **paywall**
- `topAi.resultBadgeText`, `topAi.tipsSectionLabel`
- `topAi.kicker` present en es/en/pt/fr → **"Top IA"** es el nombre de la feature

Copy original: *"The best AI-generated predictions, 4-star and high accuracy"*
→ **[OBS]** el filtro por defecto es **4 estrellas o más**.

### 3.2 **Live / Análisis IA en vivo** — `guides.live.*`, `live.*` **[OBS]**
- `live.phases.{phase30,phase60,phase,title}` → **fases de análisis**
- `live.countdown.{highlight,kicker}` → cuenta regresiva al partido
- `live.picks.{title,body,kicker,features}`, `live.tipsCard`
- `live.premium.{title,body,kicker}` → **paywall bloquea parte del live**
- `live.intro.*`, `live.where.*`, `live.topBar*`

Copy original: *"live reasoning, markets and confidence on every match"*
→ **[OBS]** el "razonamiento en vivo" (live reasoning) es parte del producto y es de pago.

### 3.3 **Pronósticos especiales** — `paywall.gate.especiales`, `paywall.glossary.especiales` **[OBS]**
Módulo "validado por tipster". Bloqueado tras el trial/premium.

### 3.4 **Trial + Premium** **[OBS]**
- `trial.benefit{Analisis,Live,Specials,Top}Title` → 4 beneficios: Análisis, Live, Especiales, Top
- Copy: *"Included in trial (2 days) or Premium"* → **trial de 2 días**
- `trial.excludeSpecial`, `trial.activeOffsetX`, `trialStatusFromStartPayload`
- `iap.subscription.*`, `iap.restorePurchases`, `iap.errors.*` (17 códigos de error distintos)

### 3.5 **Auth** — `auth.*` **[OBS]**
`signIn`, `signUp`, `signOut`, `recover`, `verifyEmail`, `step1/2/3`, `trialUnavailableBody`,
`google.*`, `signInWithPopup`, `GoogleProvider`, `sendPasswordResetEmail`.

### 3.6 **Mercados y filtros** **[OBS]**
Mercados presentes en el bundle: **1X2, Over/Under (TOTAL), Handicap, Ambos marcan (BTTS)**,
copas/marcador. Topes observados: `2.5`, `3.5`.
Filtros: rango de probabilidad (%), precio máximo (`topAi.oddsMax`), liga, categoría,
"pick de valor" vs "pick normal".
> Copy original: *"Value pick means attractive odds with more variance. Normal pick excludes those."*

---

## 4. Modelo de datos **[INF salvo campos marcados OBS]**

### Match / Fixture
```
id, kickoff (OBS), minute (OBS),
homeTeam, awayTeam (OBS: awayTeam),
homeScore, awayScore,
leagueId, leagueName, leagueCountry,
status: not-started | live | finished (OBS: "not-started", "league_failed_to_score")
```

### Pick / Análisis
```
id, fixtureId,
market (OBS),        // 1X2 | TOTAL | HANDICAP | BTTS
selection (OBS),     // "Over" | "Under" | "Gana X" | "Ambos marcan" | ...
line: 2.5 | 3.5 (OBS)
odds (OBS),          // decimal
confidence (OBS),    // 0..100
stars (OBS),         // 1..5   [INF] derivado de confidence
isSpecial (OBS),     // validado por humano
verifiedBy, reasoning (OBS),
analysis (OBS),      // texto largo
isPremium, tier, plan (OBS),
status (OBS), createdAt
```

### 用户 / Suscripción
```
userId (OBS), plan (OBS: free|premium), trialExpiresAt,
entitlements: { topAi, live, especiales } (INF, de trial.benefit*)
```

### Reglas de elegibilidad de "Top AI" **[OBS]**
- confianza alta
- estrellas ≥ 4
- `odds` dentro del rango del filtro del usuario
- excluye los que el usuario marcó como no guardians / ya guardados

---

## 5. Reglas de negocio a reconstruir

| # | Regla | Estado |
|---|---|---|
| R1 | Pick entra a Top AI si `confidence >= umbral` y `stars >= 4` | OBS (copy) |
| R2 | Default del listado = solo Premium + alta confianza | OBS (copy) |
| R3 | El módulo "Especiales" exige `isSpecial` (validación humana) | OBS (copy) |
| R4 | Trial = 2 días; al expirar, `especiales` y parte de `live` se bloquean | OBS (copy) |
| R5 | En vivo: confianza se recalcula por minuto según marcador/stats | INF (del copy del sitio) |
| R6 | "Value pick" vs "Normal pick" según dispersión de la cuota | OBS (definición en copy) |
| R7 | Live/Especiales = Premium | OBS (paywall.*) |

> **R5 es la única regla que NO está en el binario.** El cálculo de probabilidad minuto a
> minuto casi seguro ocurre en el **backend** (Firebase Functions / Cloud Run), no en el
> cliente — el bundle solo *renderiza* el resultado que le llega. Para clonar eso hace falta
> observar el tráfico real con el dispositivo en una sesión de partido.

---

## 6. Endpoints / backend **[OBS parcial]**

```
Firebase RTDB:  mispronosticos-9b4fc.appspot.com   [OBS, resources.arsc]
socket.io:      cliente presente, URL no está en el bundle  [OBS ausencia]
Turnstile:      challenges.cloudflare.com            [OBS]
ipinfo:         api.ipinfo.io?token=...              [OBS]
Open IAP:       kit.openiap.dev/v1/purchase/verify   [OBS]
Ads:            refpa3665.com, admob-gmats            [OBS]
```

La URL de socket.io y la lógica de "live reasoning" **no están en el bundle** → están en el
backend o se arman en runtime.

---

## 7. Trabajo pendiente para completar el clon

1. **Traza con dispositivo real**: sesión de partido en vivo + Charles/mitmproxy para ver
   qué llega por socket.io y qué devuelve el backend en cada minuto. Eso destapa R5.
2. **Reglas de Firebase** del original: se pueden intentar con el `databaseURL` público
   (lectura anónima) para ver la forma del documento `picks` real.
3. **UI**: los recursos del APK (`res/`) traen todos los drawables y estilos exactos.
   `apktool d` para extraerlos.

---

## Caveats de honestidad
- **No se ha ejecutado ni modificado la app.** Todo es análisis estático del APK.
- Los campos marcados **[INF]** no están verificados contra datos reales.
- R5 no está en el cliente. Clonar "live reasoning" sin observar tráfico = inventarlo.