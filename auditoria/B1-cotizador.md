# B1 — Cotizador y alta

**Cubre:** `cotizaciones/**`, `app/cotizar/**`, `lib/quotes/{webQuote,agentQuote,bikeQuote,tarifar,reglas}.ts`, `api/wp/**`, `api/agente/**`

**Por qué importa:** Por aquí entra cada venta. Un error de cálculo aquí se cobra mal y se descubre tarde.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B1.1 El precio, de punta a punta.** Sigue `tarifar.ts` con un caso real: temporada alta, Semana Santa, habitaciones mixtas, noche extra. ¿Los redondeos y el suplemento se aplican una sola vez? Compara el total con una cotización ya emitida.
  `Estado: en curso` — leo `lib/quotes/tarifar.ts` y `seasons.ts` línea a línea, reconstruyo el cálculo y lo contrasto contra cotizaciones reales de la BD (Supabase MCP, solo SELECT).
- **B1.2 Los cuatro caminos de alta dan lo mismo.** Wizard, cotizador público, WordPress y el endpoint del agente. Mismo input → ¿mismo precio, mismas líneas, mismo estado? Donde discrepen, cuál manda.
  `Estado: pendiente`
- **B1.3 Alta a medias.** Si falla el PDF, el correo o la inserción de líneas, ¿qué queda en la base? Busca cotizaciones sin líneas, sin código o sin cliente. No hay transacción: di qué se rompe.
  `Estado: pendiente`
- **B1.4 Validación de la entrada.** Personas fuera de rango, fecha en el pasado, ruta sin tarifa del año, correo inválido, texto larguísimo. En los endpoints públicos además: secreto, límite de peticiones, payload gigante.
  `Estado: pendiente`
- **B1.5 El wizard como herramienta.** Doble clic en «crear» (¿dos cotizaciones?), catálogo que no responde, errores sin mensaje, y los avisos de `setState` en efecto que ya marca el linter en `Wizard.tsx`.
  `Estado: pendiente`
- **B1.6 Lo que falta frente a un CRM de agencia.** Duplicar una cotización, versionarla, plantillas por ruta. Solo lo que le ahorraría tiempo real a Nico; mira CRITERIOS.md.
  `Estado: pendiente`

---

## Hallazgos

_(Vacío. Se escribe según se encuentra, nunca al final.)_

---

## Arreglos aplicados

_(Solo lo pequeño y reversible. Un commit por arreglo.)_

---

## Crítica del experto

`Estado: pendiente`

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
