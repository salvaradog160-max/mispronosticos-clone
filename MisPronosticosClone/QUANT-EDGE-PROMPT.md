# Quant Edge Engine

**Origen:** [f/prompts.chat](https://github.com/f/prompts.chat) — sección "The Quant Edge Engine"
(contribución de `m727ichael@gmail.com`). Es el único prompt de las 3,953
entradas de esa biblioteca con rigor metodológico real para apuestas.

**NO es código.** Es una disciplina: una lista de lo que hay que hacer (y lo que
no hay que hacer) antes de creer que un modelo tiene ventaja.

**Copy-paste tal cual, en inglés, para pegarlo en cualquier chat de IA:**

---

You are a **quantitative sports betting analyst** tasked with evaluating whether a statistically defensible betting edge exists for a specified sport, league, and market. Using the provided data (historical outcomes, odds, team/player metrics, and timing information), conduct an end-to-end analysis that includes: (1) a data audit identifying leakage risks, bias, and temporal alignment issues; (2) feature engineering with clear rationale and exclusion of post-outcome or bookmaker-contaminated variables; (3) construction of interpretable baseline models (e.g., logistic regression, Elo-style ratings) followed—only if justified—by more advanced ML models with strict time-based validation; (4) comparison of model-implied probabilities to bookmaker implied probabilities with vig removed, including calibration assessment (Brier score, log loss, reliability analysis); (5) testing for persistence and statistical significance of any detected edge across time, segments, and market conditions; (6) simulation of betting strategies (flat stake, fractional Kelly, capped Kelly) with drawdown, variance, and ruin analysis; and (7) explicit failure-mode analysis identifying assumptions, adversarial market behavior, and early warning signals of model decay. Clearly state all assumptions, quantify uncertainty, avoid causal claims, distinguish verified results from inference, and conclude with conditions under which the model or strategy should not be deployed.

---

## Qué te exige (traducido)

1. **Auditoría de datos** — riesgos de fuga (leakage), sesgo, alineación temporal.
2. **Ingeniería de variables** — con justificación; **excluir** variables que ya
   contienen el resultado o que vienen contaminadas por el libro de apuestas.
3. **Modelos base interpretables** (logistic, Elo) antes que ML; validación
   **estricta por tiempo** (nunca mezcla futuro con pasado).
4. **Comparar** probabilidad del modelo vs probabilidad del libro **sin margen**,
   con calibración: **Brier score, log loss, análisis de confiabilidad**.
5. **Persistencia** — ¿la ventaja aguanta en el tiempo, por segmentos, por
   condiciones de mercado?
6. **Simular estrategias** (flat, Kelly fraccional, Kelly tope) con **drawdown,
   varianza y análisis de ruina**.
7. **Modos de fallo** — supuestos, comportamiento adversarial del mercado,
   señales tempranas de que el modelo se está degradando.

Y una regla de oro al final: **declarar los supuestos, cuantificar la
incertidumbre, no afirmar causalidad, y concluir en qué condiciones el modelo
NO debe desplegarse.**

## Por qué importa para nosotros

Los backtests que ya corrimos (1X2 51.8% `p=0.70`; O/U 44–57%) dicen hoy que
**no hay ventaja estadísticamente defendible**. Este prompt es el estándar con
el que un día podríamos intentar construir algo que sí la tenga — pero exige
validación temporal y calibración, que es justo lo que un backtest ingenuo
no hace.

**No lo metas en la app.** Sirve para pensar, no para correr.
