# B1 — Cotizador y alta

**Cubre:** `cotizaciones/**`, `app/cotizar/**`, `lib/quotes/{webQuote,agentQuote,bikeQuote,tarifar,reglas}.ts`, `api/wp/**`, `api/agente/**`

**Por qué importa:** Por aquí entra cada venta. Un error de cálculo aquí se cobra mal y se descubre tarde.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B1.1 El precio, de punta a punta.** Sigue `tarifar.ts` con un caso real: temporada alta, Semana Santa, habitaciones mixtas, noche extra. ¿Los redondeos y el suplemento se aplican una sola vez? Compara el total con una cotización ya emitida.
  `Estado: hecho` — el suplemento se aplica una sola vez en los cuatro flujos y no hay redondeos que se acumulen, pero el **editor de Seguimiento tarifa con otra fórmula** que la del resto (`precio × personas` en vez del reparto de habitaciones) y con reparto mixto no vuelve a tarifar nunca.
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

### [GRAVE] El editor de Seguimiento cobra el grupo impar a tarifa de doble — `src/app/(dashboard)/seguimiento/[id]/QuoteEditor.tsx:154-168`

`tarifarRuta()` (asistente, cotizador web, WordPress, endpoint del agente y `editQuote.ts`)
reparte habitaciones: `dobles = floor(personas/2)`, el impar va a individual, y la base es
`dobles×2×tarifa_doble + individuales×tarifa_single`. El editor de `/seguimiento/[id]` usa
otra fórmula distinta, `catalogMatch.price_cs × people`, tanto en `recomputeFromCatalog()`
(línea 156) como en el auto-fill que corre al abrir el formulario (línea 165).

Caso real en la base: **CS-2026-014**, 5 personas, «Pensión doble», Francés desde Sarria.
`base_eur = 2525,00 €` = exactamente `5 × 505` (la tarifa doble 2026 de esa ruta, que no ha
cambiado). El reparto correcto es 2 dobles + 1 individual = `4×505 + 682 = 2702 €`.
**177 € menos cobrados**, y la etiqueta queda diciendo «Pensión doble» para 5 personas —
una de las cuales no tiene con quién compartir habitación. Con más personas impares el
hueco es el mismo por cada impar; en sentido contrario, un grupo de 3 marcado «Pensión
individual» se autocarga a `3 × single` y cobra **354 € de más** sobre el reparto real.

El bloque de auto-fill se dispara solo con abrir «Editar» (`autoLink` arranca en `true`),
así que basta entrar a corregir un teléfono y dar Guardar para que la base se reescriba
con la fórmula mala.

**Propuesta (no se tocó: es dinero):** que el editor llame a la misma `tarifarRuta()` que
todos los demás, o como mínimo replique el reparto `dobles×2×doble + impar×single` y
escriba la etiqueta con `etiquetaModalidad()`. Es el único de los cinco caminos que tiene
su propia aritmética.

### [GRAVE] Al editar una cotización de reparto mixto la base se queda congelada — `src/app/(dashboard)/seguimiento/[id]/QuoteEditor.tsx:59-68,124-128`

Toda cotización de grupo impar que crea el asistente o el cotizador web lleva etiqueta
mixta: «Pensión · 1 doble + 1 individual». `modalityToSlug()` devuelve `null` a propósito
para esas etiquetas (línea 68), así que `catalogMatch` es `null` y **ni el auto-fill ni el
botón «Cargar del catálogo» funcionan nunca** en esas cotizaciones.

Lo grave no es que no autocargue, es lo que sí se guarda igual: `season_supplement_eur`,
`season_kind`, `price_blocks` y `people` **sí** se recalculan y se escriben
(`QuoteEditor.tsx:186-189` → `actions.ts:58-65`), mientras `base_eur` se guarda con el
valor viejo. Caso concreto con datos de hoy: **CS-2026-058**, 3 personas, «Pensión · 1
doble + 1 individual», `base_eur = 1692 €`. Se abre el editor, se cambia Personas de 3 a
6 y se guarda: queda una cotización de **6 personas facturando la base de 3** (1692 €), con
el suplemento sí actualizado a 6×80 = 480 €, y sin un solo aviso en pantalla. El único
texto que aparece es «Modalidad custom — sin precio en catálogo», que además miente: no es
una modalidad custom, es la etiqueta estándar que escribe el propio asistente.

**Propuesta (no se tocó: es dinero):** o el editor entiende la etiqueta mixta y retarifa con
el reparto, o bloquea el guardado cuando cambian personas/ruta/fecha y la base no se pudo
recalcular. Lo que no puede es guardar medio recálculo.

### [MEDIO] CS-2026-058 tiene un `cost_eur` que la próxima recalculada borra — dato en producción

`comercial.recompute_quote_money()` deriva `cost_eur = cost_base_eur +
season_supplement_cost_eur + líneas`. Revisadas las 38 cotizaciones de la base, **solo
CS-2026-058** no cuadra: `cost_base_eur = 0`, `season_supplement_cost_eur = 0`, cero
líneas, y sin embargo `cost_eur = 1540,00 €` (escrito a mano antes de que el costo fuera
derivado, migración D4 de la GUIA).

Es una mina: la próxima vez que alguien marque un opcional, edite la cotización o BayMax
la toque, el RPC pone `cost_eur = 0` y el KPI «Costo Pilgrim» pasa de 1540 € a 0, con lo
que la utilidad de esa venta salta de 392 € a 1932 €. Nadie se entera hasta que se cierran
los números.

**Propuesta (no se tocó: toca dinero y hay que decidirlo con Nico):** rellenar
`cost_base_eur = 1540` en esa fila para que el derivado dé lo mismo que hoy, y de paso una
consulta de salud que liste cotizaciones donde `cost_eur <> cost_base + suplemento +
líneas`.

### [MENOR] La Semana Santa se acaba en 2028 y no hay dónde renovarla — `src/lib/seasons.ts:85-89` y `comercial.settings.key='season_supplements'`

`dates_by_year` solo tiene 2026, 2027 y 2028, tanto en el default del código como en la
fila real de `settings` (verificada). Una salida de Semana Santa 2029 —cotizable ya desde
finales de 2027— pasa por `detectSeason()` sin coincidir con ningún rango y sale como
temporada regular: 40 €/persona menos de venta y 25 € menos de costo, sin ningún aviso. Y
según la GUIA los suplementos solo se cambian por SQL Editor, así que no hay pantalla donde
notarlo. **Propuesta:** avisar en ámbar cuando la fecha de salida cae en un año sin
`dates_by_year`, en vez de resolver «regular» en silencio.

### Lo que sí está bien

- **El suplemento se aplica una sola vez** en los cinco caminos. `tarifarRuta()` devuelve
  `baseEur` y `suplementoEur` separados (`tarifar.ts:132-133`) y `totalEur = base +
  suplemento`; en la BD `recompute_quote_money()` vuelve a sumar `base_eur +
  season_supplement_eur + líneas` sobre las columnas, nunca sobre `total_eur`. Correr el
  RPC dos veces da el mismo número. El asistente (`nueva/actions.ts:111-114`), el editor
  (`[id]/actions.ts:60-61`) y `editQuote.ts:207-208` escriben siempre base y suplemento en
  campos distintos.
- **No hay redondeos que acumulen.** No hay un solo `Math.round`/`toFixed` en el camino del
  dinero: los `toFixed(2)` son de presentación y de serializar el formulario, y las columnas
  son `numeric(10,2)`. Nada se redondea dos veces.
- **La tarifa es la del año de salida, con coincidencia exacta.** `quoteYear()` parsea el
  ISO a mano para no perder el año por zona horaria (`year.ts:57-60`) y `ratesForYear()` no
  cae al año anterior en el CRM ni en el cotizador de la web. Verificado contra la base:
  CS-2026-081 y CS-2026-033, de rutas sin tarifa 2027 cargada, tienen la base tecleada a
  mano, no una tarifa 2026 colada.
- **Temporada alta y Semana Santa no se suman entre sí**: `detectSeason()` retorna en el
  primer match de Semana Santa y solo si no hay, evalúa alta (`seasons.ts:37-67`). El
  viaje que cruza dos temporadas cobra una sola.
- **La comparativa del PDF no puede contradecir el total cobrado**: la tarjeta elegida
  siempre sale de `base_eur / personas` (`pdf.ts:110-111`), no del override de
  `price_blocks`. Verificado con CS-2026-080, que tiene `price_blocks` de 575 € heredado de
  otra ruta y aun así el PDF muestra los 625 € reales.
- Cuadre general: de las 38 cotizaciones de producción, `total_eur` coincide con
  `base + suplemento + líneas` en **las 38**. El único descuadre es el `cost_eur` de
  CS-2026-058 anotado arriba.

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
