# B1 — Cotizador y alta

**Cubre:** `cotizaciones/**`, `app/cotizar/**`, `lib/quotes/{webQuote,agentQuote,bikeQuote,tarifar,reglas}.ts`, `api/wp/**`, `api/agente/**`

**Por qué importa:** Por aquí entra cada venta. Un error de cálculo aquí se cobra mal y se descubre tarde.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B1.1 El precio, de punta a punta.** Sigue `tarifar.ts` con un caso real: temporada alta, Semana Santa, habitaciones mixtas, noche extra. ¿Los redondeos y el suplemento se aplican una sola vez? Compara el total con una cotización ya emitida.
  `Estado: hecho` — el suplemento se aplica una sola vez en los cuatro flujos y no hay redondeos que se acumulen, pero el **editor de Seguimiento tarifa con otra fórmula** que la del resto (`precio × personas` en vez del reparto de habitaciones), corre al montar el expediente y por eso pisa cualquier base tecleada a mano; con reparto mixto no vuelve a tarifar nunca y **nunca reescribe `rooms_json`**, de donde salen el pedido a Pilgrim y el contrato. Los tres son el mismo defecto de fondo: hay dos editores y solo `editQuote.ts` sigue las reglas.
- **B1.2 Los cuatro caminos de alta dan lo mismo.** Wizard, cotizador público, WordPress y el endpoint del agente. Mismo input → ¿mismo precio, mismas líneas, mismo estado? Donde discrepen, cuál manda.
  `Estado: hecho` — tres de los cuatro (Wizard, WordPress y agente) dan el mismo precio porque comparten `tarifarRuta()`; **`/cotizar` no**: cobra una sola modalidad a todo el grupo, cae al año anterior y no guarda `rooms_json`. Estado inicial, código y validez sí coinciden en los cuatro. Y en la moneda que el cliente lee: `trm_history` está vacía, así que el COP puede no pintarse sin que nadie se entere.
- **B1.3 Alta a medias.** Si falla el PDF, el correo o la inserción de líneas, ¿qué queda en la base? Busca cotizaciones sin líneas, sin código o sin cliente. No hay transacción: di qué se rompe.
  `Estado: hecho` — no hay cotizaciones sin líneas (el schema no las necesita) ni sin código, pero sí tres puntos donde el alta queda a medias sin que nadie se entere: el error al crear el cliente se ignora, el PDF fallido no detiene el correo, y la ruta personalizada queda creada aunque la cotización falle.
- **B1.4 Validación de la entrada.** Personas fuera de rango, fecha en el pasado, ruta sin tarifa del año, correo inválido, texto larguísimo. En los endpoints públicos además: secreto, límite de peticiones, payload gigante.
  `Estado: hecho` — los tres caminos con zod validan bien salvo la fecha: ninguno rechaza el pasado, y el regex acepta días que no existen (`2026-02-31` se desliza a 9 de marzo y cotiza esa fecha en silencio; `2026-13-45` revienta con un 500). El asistente del CRM no valida **nada** en el servidor. Secreto sólido; el rate limit del endpoint de WordPress se puede saltar solo.
- **B1.5 El wizard como herramienta.** Doble clic en «crear» (¿dos cotizaciones?), catálogo que no responde, errores sin mensaje, y los avisos de `setState` en efecto que ya marca el linter en `Wizard.tsx`.
  `Estado: hecho` — nada impide crear la misma cotización dos veces (hay un caso real en producción, CS-2026-064/065), y un fallo al leer el catálogo se veía idéntico a un catálogo vacío. Los 7 avisos del linter son ruido salvo uno.
- **B1.6 Lo que falta frente a un CRM de agencia.** Duplicar una cotización, versionarla, plantillas por ruta. Solo lo que le ahorraría tiempo real a Nico; mira CRITERIOS.md.
  `Estado: hecho` — faltan tres cosas que sí cuestan plata: duplicar (la maquinaria ya existe en `bikeQuote`), versionar (editar una cotización enviada pisa el PDF que el cliente ya tiene) y el seguimiento de la cotización sin respuesta — 16 de 39 enviadas están vencidas y quietas. Las plantillas por ruta **no** hacen falta.

---

## Hallazgos

### [GRAVE] El auto-fill del editor de Seguimiento pisa la base tecleada a mano — `src/app/(dashboard)/seguimiento/[id]/QuoteEditor.tsx:154-168`

`tarifarRuta()` (asistente, cotizador web, WordPress, endpoint del agente y `editQuote.ts`)
reparte habitaciones: `dobles = floor(personas/2)`, el impar va a individual, y la base es
`dobles×2×tarifa_doble + individuales×tarifa_single`. El editor de `/seguimiento/[id]` usa
otra fórmula distinta, `catalogMatch.price_cs × people`, tanto en `recomputeFromCatalog()`
(línea 156) como en el auto-fill del `useEffect` (línea 161-167).

**Lo que muerde hoy no es la fórmula: es cuándo corre.** `autoLink` arranca en `true`
(línea 99) y el `useEffect` va **antes** de cualquier guarda de `editing`, así que se
dispara **al montar el componente** — y `page.tsx:424` monta `QuoteEditor` siempre, en cada
visita al expediente. No hace falta ni pulsar «Editar». Si la etiqueta de la cotización
resuelve a un slug con tarifa en catálogo, el campo Base queda cargado con el catálogo y
`onSubmit` lo manda tal cual (`formData.set("total_eur", totalEur)`, línea 179). Entrar a
corregir un teléfono y dar Guardar **reescribe el precio negociado con el de catálogo**,
sin un aviso.

Dos casos vivos en producción, los dos en estado `enviada` (verificados contra `pricing`):

| | `base_eur` guardada | catálogo del año de salida | qué pasa al guardar |
|---|---|---|---|
| **CS-2026-077** | 585,00 € | `pension_single` 2026 = **625** | +40 € que el cliente no aceptó |
| **CS-2026-060** | 800,00 € | `pension_single` 2027 = **790** | −10 € sobre lo pactado |

Son precios corregidos o negociados a mano, y son justo lo que la propia plataforma tiene
escrito como regla en `editQuote.ts:20-23`: *«cuando el año todavía no tiene tarifa, Nico
teclea la cifra a mano en el CRM, y corregir un correo no puede borrarle ese número»*. La
pantalla que más usa Nico viola la regla que el camino de BayMax respeta. Ese es el daño
diario, y ya está esperando en dos expedientes enviados.

**El segundo efecto, la aritmética del grupo impar.** Como la fórmula es `precio × personas`
y no el reparto, un grupo impar se cobra entero a tarifa de doble y la etiqueta queda
prometiendo algo imposible: para 5 personas, «Pensión doble», una de ellas no tiene con
quién compartir habitación. La única fila de la base con ese patrón es **CS-2026-014** (5
personas, «Pensión doble», Francés desde Sarria, `base_eur = 2525,00 €` = exactamente
`5 × 505`, contra los `4×505 + 682 = 2702 €` del reparto correcto: 177 € de diferencia)…
**y está `cancelada`**. Esos 177 € nunca se dejaron de cobrar. Barridas las 45 cotizaciones
cruzando grupo impar contra el catálogo del año de salida, no hay ninguna otra: las demás
impares son de 1 persona en individual, todas con la base correcta. Así que el reparto es un
defecto real del código que todavía no ha mordido — lo hará con el primer grupo de 3 o de 5
que alguien abra — pero hoy no hay dinero perdido por ahí. En sentido contrario el hueco
existe igual: un grupo de 3 marcado «Pensión individual» se autocarga a `3 × single`, 354 €
por encima del reparto real.

Es el único de los cinco caminos con aritmética propia.

**Propuesta (no se tocó: es dinero):** ver el hallazgo de fondo, «Dos editores de cotización
con reglas distintas». No hay que replicar el reparto en la pantalla: hay que hacer que la
pantalla llame a `actualizarCotizacion()`, que ya retarifa solo cuando cambia algo que mueve
el precio y por eso mismo **no** pisa la base tecleada a mano.

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

**Propuesta (no se tocó: es dinero):** ver el hallazgo de fondo, aquí abajo. No hay que
enseñarle a la pantalla a leer la etiqueta mixta: `editQuote.ts` ya no la necesita —saca el
reparto de `rooms_json`, que es el dato duro— y ya se niega a guardar cuando no puede
retarifar. Lo que la pantalla no puede seguir haciendo es guardar medio recálculo.

### [GRAVE] Al editar desde la pantalla, `rooms_json` se queda viejo — y de ahí salen el pedido a Pilgrim y el contrato firmado — `src/app/(dashboard)/seguimiento/[id]/actions.ts:52-70`

`rooms_json` no es un campo decorativo del alta: es **el reparto de habitaciones**, y lo
leen tres sitios, todos aguas abajo del dinero:

| Quién lo lee | Para qué |
|---|---|
| `src/lib/quotes/pilgrimEmail.ts:122-129` | la línea `Habitaciones: N dobles + N individuales` **del correo con el que se le pide el cupo a Pilgrim** |
| `src/lib/contracts/render.ts:74-84` | la acomodación que aparece en el **contrato que firma el cliente** («N habitación(es) doble(s) + N individual(es)») |
| `src/lib/quotes/pdf.ts:197-225` | las tarjetas de precio del PDF cuando el reparto es mixto |

El `patch` de `updateQuote` tiene 16 campos —cliente, ruta, fechas, personas, modalidad,
base, suplemento, costo, estado, validez, notas, `price_blocks`— y **`rooms_json` no está
en ninguno**. `QuoteEditor.tsx` tampoco lo manda: no hay un solo `formData.set("rooms_json")`
en la pantalla. Cambiar personas, ruta, fecha o modalidad desde `/seguimiento/[id]` deja el
reparto congelado en el que se calculó el día del alta, para siempre. El único camino que
sí lo reescribe es `editQuote.ts:212` (`patch.rooms_json = t.roomsJson`), el de BayMax:
otra vez los dos editores en desacuerdo (ver el hallazgo de fondo, más abajo).

**No es teórico. CS-2026-080, estado `enviada`, editada el 1-sep-2026** (verificado en
producción):

| | valor en la base |
|---|---|
| `people` | 14 |
| `modality` | «Pensión, habitación doble» |
| `rooms_json` | `{tipo: pension, dobles: 8, individuales: 0, tarifa_doble: 575}` |
| camas que declara | **16** |
| `base_eur` | 8750 = 625 × 14, con el `pension_doble` 2026 de hoy — no con los 575 de `rooms_json` |

Nació de 16 personas y se bajó a 14 desde la pantalla: la base se recalculó, el reparto no.
Es la **única** de las 45 filas de producción donde las camas de `rooms_json` no cuadran con
`people` (barridas las 15 que lo tienen), pero es exactamente la que está `enviada` y viva.

Qué se rompe, si esa cotización sigue el recorrido normal:

- El correo a Pilgrim pide **8 dobles para 14 personas**: una habitación de más, del orden
  de una plaza y media de coste que la agencia paga y no cobra.
- El contrato que firma el cliente dice «8 habitación(es) doble(s)» para 14 personas. Si
  alguien lo lee, la agencia queda comprometida a algo que no cuadra; si no lo lee, lo
  descubre el hotel el día de la llegada.
- Y las tarifas dentro de `rooms_json` (575 €) tampoco se refrescan, así que un PDF de
  reparto mixto puede pintar tarjetas con la tarifa vieja mientras el total se cobra con la
  nueva.

**El mismo campo tiene un segundo agujero, en el alta:** de los cuatro caminos, `/cotizar`
es el único que **no escribe `rooms_json`** al crear (`cotizar/actions.ts:143-168`: no
aparece en el insert). El informe original lo despachaba como una casilla «no» de la tabla
comparativa; lo que significa de verdad es que toda cotización nacida en el cotizador
público llega al contrato y al pedido de Pilgrim **sin línea de habitaciones** —
`contracts/render.ts:82` cae al `modality`, que para un grupo impar dice «Pensión doble» —
y sin tarjetas de reparto en el PDF. Hoy es latente: en producción no hay ninguna fila con
`source = 'web'` (39 `interna`, 5 `wordpress`, 1 `baymax`), así que ese cotizador aún no ha
producido una venta. Las 30 filas sin `rooms_json` son del asistente y de antes de que el
campo existiera.

**Propuesta (no se tocó: toca proveedor y documento firmado):** ver el hallazgo de fondo —
que la pantalla llame a `actualizarCotizacion()`, que ya reescribe `rooms_json` bien. Como
parche mínimo mientras tanto, que `updateQuote` recalcule el reparto cuando cambien
personas/ruta/modalidad, y que `/cotizar` guarde el `roomsJson` que su propio cálculo ya
tiene a mano. Y por separado, revisar CS-2026-080 antes de que se le mande el pedido a
Pilgrim: hoy declara dos camas de más.

### El hallazgo de fondo: hay **dos editores de cotización** y solo uno sigue las reglas

Los tres GRAVE de arriba no son tres defectos sueltos. Son el mismo: **la misma cotización,
editada por la pantalla o editada por BayMax, no queda igual.** Eso es «un dato, un sitio»
roto en el sitio más caro de la plataforma.

| | `QuoteEditor.tsx` + `[id]/actions.ts` (la pantalla) | `editQuote.ts` → `actualizarCotizacion()` (BayMax) |
|---|---|---|
| Fórmula del precio | `price_cs × people` (`QuoteEditor.tsx:156,163`) | `tarifarRuta()`: reparto real de habitaciones |
| Cuándo retarifa | **al montar**, siempre que la etiqueta case con el catálogo (`:161-167`) | solo si cambia ruta, modalidad, fecha o personas (`:143`) |
| Base tecleada a mano | la pisa con el catálogo | **la respeta**, y está escrito como regla (`:20-23`) |
| Etiqueta mixta | `modalityToSlug()` devuelve `null` → no retarifa nada (`:68`) | `modalidadGuardada()` la resuelve por `rooms_json` (`:53-56`) |
| Año sin tarifa | guarda igual, con la base vieja | **no guarda nada**: `sin_tarifas_ano` y la fila queda como estaba (`:200`) |
| `rooms_json` | no lo toca nunca | lo reescribe (`:212`) |
| `price_blocks` tecleados | los conserva aunque el precio cambie | los suelta y lo avisa (`:214-217`) |
| PDF | lo regenera | lo regenera |

Las tres columnas de la derecha que están en negrita son **exactamente** los tres GRAVE. El
camino de BayMax, que se escribió después y con el problema a la vista, ya los resolvió los
tres. La pantalla —la que más usa Nico, la que toca las cotizaciones que ya se enviaron— se
quedó con la primera versión.

**Propuesta (no se tocó: es dinero, y hay que decidirla con Nico).** El arreglo deja de ser
«replicar el reparto en la pantalla» y pasa a ser **reuso**: que `updateQuote` llame a
`actualizarCotizacion()` para todo lo que mueve plata —ruta, modalidad, fecha, personas— y
se quede solo con lo que hoy es suyo (estado, notas, validez, datos del cliente). Un editor,
una regla, y los tres GRAVE se cierran de una vez.

Un cabo que hay que atar antes, y que conviene decir para que la propuesta no suene más
barata de lo que es: **`ParcheCotizacion` no acepta un precio a mano** (`editQuote.ts:30-41`),
y la pantalla sí necesita poder teclearlo — es precisamente el caso que la regla de
`editQuote.ts:20-23` protege, el año sin tarifa cargada. Así que el trabajo real es añadirle
a `actualizarCotizacion()` un override explícito de base y costo que **solo** se aplique
cuando el usuario haya tocado esos campos, en vez de dispararse solo al montar. Sigue siendo
mucho menos que reescribir la aritmética por segunda vez.

### [MEDIO] CS-2026-058 tiene un `cost_eur` que la próxima recalculada borra — dato en producción

`comercial.recompute_quote_money()` deriva `cost_eur = cost_base_eur +
season_supplement_cost_eur + líneas`. Revisadas las 45 cotizaciones de la base, **solo
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

### [MEDIO] La agencia cobra en pesos y el cotizador público no pinta ni un peso — `src/lib/trm.ts:31,70-80` · `src/app/cotizar/PublicQuoter.tsx:93,320-324`

CRITERIOS §4 pide los números «en dos monedas, con la tasa del día del movimiento y no la
de hoy». Camino Sacro le cobra en pesos a un cliente colombiano lo que le paga en euros a
Pilgrim, así que el COP no es un adorno: es la única cifra que ese cliente entiende de
verdad. Tres cosas, en orden de peso:

**1. `comercial.trm_history` está vacía. Cero filas.** Verificado. `getTRMHoy()` intenta,
en este orden: la fila de hoy en `trm_history` → dos APIs externas → la última fila
guardada. Con la tabla vacía los dos extremos no existen, así que **el único camino vivo es
que una de las dos APIs conteste dentro de esa misma petición**. Y que la tabla lleve vacía
toda la vida del proyecto es la prueba de que el `upsert` de la línea 70 no ha escrito
nunca: o las APIs no responden (`TRM_API_PRIMARY` / `TRM_API_FALLBACK`), o el insert lo
rechaza la base. No se puede saber cuál, porque **ninguno de los dos fallos deja rastro**:
el `catch {}` de la línea 31 se traga el de las APIs y el `upsert` solo desestructura
`data`, nunca `error`. Es el mismo patrón de `catch` mudo que el contrato manda arreglar,
en el sitio donde impide diagnosticar el problema.

**2. Cuando falla, `/cotizar` no dice nada.** La cifra en pesos está detrás de
`{totalCop && …}` (`PublicQuoter.tsx:320`): si `trm` es `null`, el bloque simplemente **no
se dibuja** y el visitante ve solo euros, sin explicación ni aviso. El CRM sí es honesto —
`Topbar.tsx:18` pinta «TRM no disponible»— y el contrato también, con su `valor_total_cop:
"—"` (`contracts/render.ts:119-120`). El cotizador público, que es el único de los tres que
habla con un cliente, es el único que calla.

**3. El peso que se le muestra no se archiva en ninguna parte.** `quotes` no tiene una sola
columna de COP ni de TRM (comprobado en el esquema): el número en pesos se calcula en
pantalla (`total × trmEurCop`) y se pierde al cerrar la pestaña. Y eso choca con la promesa
que la propia cotización imprime: `valid_until` = hoy + 30 días. **Lo que aguanta 30 días
es el euro; el peso no.** Con la TRM moviéndose lo normal, el cliente que vuelve el día 25
con la captura de pantalla y el CRM que le cotiza hoy están mirando dos números distintos, y
no hay forma de saber cuál se le prometió porque la tasa de ese día no se guardó — ni
siquiera está la fila en `trm_history`. Para una agencia que vende en pesos lo que paga en
euros, esa es la fuga de margen clásica del oficio, y hoy no es medible.

**Propuesta (la política de tasa es decisión de Nico y toca B3/B6; lo de B1 es esto):**
(a) que el `upsert` y el `catch {}` de `trm.ts` registren el fallo en vez de tragárselo, que
es lo único que hace falta para saber por qué la tabla lleva vacía desde el principio;
(b) que `/cotizar` diga «tasa del día no disponible» en vez de omitir la línea; y
(c) guardar en la cotización la TRM con la que se le mostró el precio —dos columnas,
`trm_eur_cop` y su fecha—, para que la validez de 30 días signifique algo en la moneda en la
que se cobra.

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
- Cuadre general: de las **45** cotizaciones de producción, `total_eur` coincide con
  `base + suplemento + líneas` en **las 45**: cero descuadres. Por el lado del proveedor,
  `cost_eur` vs `cost_base + suplemento de costo + líneas` descuadra en **una sola** fila,
  el `cost_eur` de CS-2026-058 anotado arriba.

---

### [MEDIO] Los dos cotizadores públicos dan dos precios distintos para el mismo viaje — `src/app/cotizar/actions.ts:106` vs `src/lib/quotes/tarifar.ts:123-132`

`/cotizar` (el cotizador público que vive en la propia plataforma) calcula
`baseEur = precioPorPersona × people`: una sola modalidad para todo el grupo. El cotizador
de caminosacro.com (`webQuote.ts` → `tarifarRuta()`) reparte habitaciones: pares en doble y
el impar en individual.

Caso concreto, con tarifas reales de la base: **3 personas, Francés desde Sarria, pensión,
salida 2026-10-15**.
- Por caminosacro.com: `2×505 + 682 = 1692 €` (etiqueta «Pensión · 1 doble + 1 individual»).
- Por `/cotizar` eligiendo «pensión doble»: `3 × 505 = 1515 €` (etiqueta «Pensión doble»).

**177 € de diferencia por la misma solicitud**, y el segundo número además promete algo
imposible: tres personas no caben en habitaciones dobles. La discrepancia está documentada
como decisión deliberada (`webQuote.ts:20-23`), pero el efecto para el cliente es que dos
puertas de la misma agencia cotizan el mismo viaje a dos precios. **Manda `tarifarRuta()`**:
es la que refleja las habitaciones que Pilgrim va a reservar de verdad.

**Propuesta (no se tocó: es dinero):** o `/cotizar` pasa a `tarifarRuta()` como los otros
tres, o deja de ofrecer «doble» para grupos impares.

### [MEDIO] `/cotizar` cotiza con la tarifa del año anterior donde los otros tres se niegan — `src/app/cotizar/actions.ts:94-96`

`/cotizar` usa `ratesForYearWithFallback()` y sale con la nota «Precio de referencia
{año}…». `webQuote.ts`, `agentQuote.ts` y `editQuote.ts` usan `ratesForYear()` (coincidencia
exacta) y devuelven `sin_tarifas_ano` (409). Mismo visitante, misma ruta, salida en un año
sin tarifas cargadas: por una puerta se lleva un PDF con precio y por la otra un «no
disponible». También está documentado como decisión aparte (`pricing/year.ts:18-21`), pero
hoy nada avisa en el CRM de que esa cotización nació con una tarifa vieja salvo el texto de
`price_note` dentro del PDF. **Propuesta:** mostrar el `price_note` como aviso ámbar en el
expediente de Seguimiento, no solo dentro del documento.

### [MENOR] El único camino que no genera el PDF es el del CRM — `src/app/(dashboard)/cotizaciones/nueva/actions.ts:96-132`

`crearCotizacionWordPress`, `crearCotizacionAgente` y `crearCotizacionPublica` llaman a
`renderAndStoreQuotePdf()` antes de responder. El asistente inserta y hace `redirect()` sin
generar nada: la cotización aterriza en el expediente con `pdf_path` en null hasta que
alguien pulse «Generar PDF» (la pantalla de detalle tampoco lo genera sola). En producción
hay 2 cotizaciones internas así. No es grave porque se ve el botón, pero es un paso manual
que los otros tres no piden.

### [MENOR] `cost_eur` se escribe a mano en los cuatro caminos de alta

La GUIA (§D4) dice que `cost_eur` es derivado y que un flujo nuevo debe escribir
`cost_base_eur` + `season_supplement_cost_eur` y dejar que el RPC arme el total. Los cuatro
lo escriben directo igual: `webQuote.ts:131`, `agentQuote.ts:145`, `cotizar/actions.ts:163`
y `nueva/actions.ts:119`. En el alta el valor coincide (todavía no hay líneas), así que hoy
no muerde — pero es exactamente la costumbre que produjo el `cost_eur` descuadrado de
CS-2026-058. **Propuesta:** quitar `cost_eur`/`total_eur` de los cuatro inserts y llamar
`recompute_quote_total` después, que ya es lo que hacen los dos caminos de edición.

### [MENOR] El asistente no sabe cotizar un grupo entero en individual — `Wizard.tsx:38-41`

El selector de alojamiento del asistente solo ofrece «Pensión» y «Hotel», y el reparto
automático siempre mete a los pares en doble. El endpoint del agente sí acepta
`pension_single`/`hotel_single` para todo el grupo (`agentQuote.ts:87`), y `tarifarRuta()`
lo soporta con `todosIndividuales`. Dos amigas que quieren cada una su habitación se cotizan
por Telegram pero no por la pantalla: en el asistente hay que irse a «Personalizada» y
teclear el precio. **Propuesta:** una casilla «todos en individual» que ya está soportada
por el motor.

### Lo que coincide en los cuatro caminos

Verificado leyendo los cuatro inserts, no por confianza:

| | Wizard | `/cotizar` | WordPress | Agente |
|---|---|---|---|---|
| Motor de precio | `tarifarRuta` (replicado en cliente) | **propio** | `tarifarRuta` | `tarifarRuta` |
| Año de tarifa | exacto | **con caída** | exacto | exacto |
| Estado inicial | `sin_enviar` (elegible) | `sin_enviar` | `sin_enviar` | `sin_enviar` |
| Código | `next_quote_code()` | idem | idem | idem |
| Validez | hoy + 30 | hoy + 30 | hoy + 30 | hoy + 30 |
| Dedup de cliente | por teléfono | por teléfono | por teléfono | por teléfono |
| Tope de personas | 30 | 12 | 12 | 30 |
| `rooms_json` | sí | **no** ⚠ | sí | sí |
| PDF al crear | **no** | sí | sí | sí |
| Correo al crear | no | sí | sí | no (lo aprueba Nico) |

- ⚠ El «no» de `rooms_json` en `/cotizar` **no es una casilla menor de esta tabla**: de ese
  campo salen la línea «Habitaciones» del correo a Pilgrim y la acomodación del contrato
  firmado. Ver el GRAVE de `rooms_json`, que además cubre el caso peor —el de las
  cotizaciones que sí lo tienen y se quedan con el reparto viejo al editarlas—.
- El reparto de habitaciones del Wizard (`Wizard.tsx:112-113,199-201`) es aritméticamente
  idéntico al de `tarifarRuta` y produce las mismas etiquetas; el Wizard es cliente y no
  puede llamar al módulo server-only, pero la duplicación está bien hecha.
- `marcarCotizacionEnviada()` es el único sitio que promueve a `enviada`, y solo desde
  `sin_enviar` (`marcarEnviada.ts:32`): un reenvío de cortesía no devuelve a «Enviada» una
  venta ya pagada. Las 39 filas con estado avanzado y `email_sent_at` en null son todas
  anteriores al 28-ago-2026, o sea previas a la migración 0033; no hay ninguna nueva.
- La autenticación de los dos endpoints públicos está bien: `timingSafeEqual`, secretos
  distintos para WordPress y para el agente, y si la variable de entorno falta se deniega
  en vez de dejar pasar (`api/wp/auth.ts:12-20`).

### [MEDIO] Si falla la creación del cliente, la cotización nace huérfana y nadie se entera — `webQuote.ts:98-103`, `agentQuote.ts:111-116`, `cotizar/actions.ts:130-135`, `nueva/actions.ts:60-65`

Los cuatro caminos hacen lo mismo:

```ts
const { data: creado } = await supabase.from("clients").insert({...}).select("id").single();
clientId = creado?.id ?? null;
```

El `error` ni se desestructura. Si el insert falla, `clientId` queda en `null` y **la
cotización se crea igual**, sin cliente del directorio y sin un solo mensaje.

El disparador realista no es exótico: `comercial.clients` tiene `UNIQUE (phone)`, y el
patrón es leer-y-después-insertar sin transacción. Dos peticiones simultáneas con el mismo
teléfono —el visitante que da doble clic en «Cotizar», o dos pestañas abiertas— hacen que
la segunda pierda la carrera contra la clave única: su cotización aterriza con
`client_id = null`. Lo mismo si el teléfono viene con un formato que la columna rechaza.

Qué se rompe: esa cotización no queda enlazada al directorio, así que el cliente no
aparece con su historial y todo lo que resuelve datos por `client_id` se queda sin ellos.
En producción hay 11 cotizaciones con `client_id` nulo, pero **todas son del seed del
1-may-2026**: el mecanismo está en el código y todavía no ha mordido. Vale arreglarlo antes.

**Propuesta:** mirar el `error` del insert y, si es violación de unicidad, releer el cliente
por teléfono (que es justo el que acaba de ganar la carrera) en vez de seguir con `null`.
Cualquier otro error debería abortar el alta con mensaje, no crear una cotización coja.

### [MEDIO] Si el PDF falla, el correo sale igual y la cotización queda marcada «Enviada» — `webQuote.ts:147-173` y `cotizar/actions.ts:178-215`

En los dos caminos que mandan correo al crear, el fallo del PDF solo hace `console.error`.
Después `firmarPdf()` devuelve `null`, `enviarCorreoWebhook()` se llama igual con
`pdf_url: null` —y el workflow de n8n adjunta el PDF **descargándolo de `pdf_url`**
(`lib/email/webhook.ts:3-5`)—, y si el webhook responde ok se llama
`marcarCotizacionEnviada()`.

Resultado: el cliente recibe «te enviamos tu cotización» sin cotización, y en el CRM el
expediente dice ✓ Enviada, que es precisamente el estado que impide que alguien lo note y
lo reenvíe. El único rastro está en los logs de Railway. El disparador no es teórico: es la
trampa de `@react-pdf/renderer` («Font family not registered») que el propio TABLERO lista,
o un Storage caído.

**Propuesta (no se tocó: cambia el estado de la venta):** si no hay PDF, no marcar
`enviada` y dejar el aviso visible en el expediente. Como mínimo, guardar el motivo del
fallo en la cotización en vez de solo en el log.

### [MEDIO] La ruta personalizada del asistente queda creada aunque la cotización falle, y reintentar la duplica — `Wizard.tsx:334-377` + `catalogo/actions.ts:285-333`

El asistente crea, en este orden y sin transacción: **1)** la ruta, **2)** sus filas de
`pricing`, **3)** sus etapas, **4)** la cotización. Si el paso 4 falla, los tres primeros
quedan escritos: una ruta con precios y etapas, en el catálogo, sin ninguna cotización
detrás. Se ve en `/catalogo` y en el propio selector del asistente.

Y lo que hace daño de verdad es el reintento. `createRoute()` no comprueba si ya existe una
ruta con ese nombre; solo desambigua el **slug** (`uniqueRouteSlug`). Darle otra vez a
«Guardar» crea una **segunda ruta con el mismo nombre**. A partir de ahí:

- `src/lib/quotes/pdf.ts:42-46` resuelve la ruta con `.eq("name", quote.route_name)
  .maybeSingle()`. Con dos filas del mismo nombre eso devuelve error y `route` queda en
  `null`: **el PDF sale sin días, sin km y con el itinerario en blanco**, en silencio.
- El editor de Seguimiento resuelve la tarifa con `yearRates.find(p => p.route_name ===
  routeName)` y toma la primera que aparezca, que puede ser la de la ruta gemela vacía.

Hoy no hay nombres duplicados en producción (28 rutas, ninguno repetido), así que esto es
una mina sin pisar. **Propuesta:** que `createRoute()` rechace un nombre que ya existe con
un mensaje claro, y que el asistente cree la ruta **después** de tener la cotización
guardada, o la borre si el alta falla — como ya hace bien `bikeQuote.ts:248-252`.

### Lo que sí está bien

- **No hay cotizaciones sin líneas, porque el schema no las necesita.** La ruta y el
  alojamiento viven en `quotes.base_eur`, no en `quote_lines`; las líneas son solo
  opcionales, bicis, personalizadas y descuentos. De las 45 cotizaciones de producción, 39
  no tienen ninguna línea y todas están correctas. La pregunta «¿hay cotizaciones sin
  líneas?» no aplica a este modelo.
- **No puede haber cotizaciones sin código ni con código repetido.** `code` es `NOT NULL`
  con `UNIQUE`, y `next_quote_code()` hace `insert … on conflict (year) do update` sobre
  `quote_codes`, que toma el candado de fila: dos altas simultáneas se serializan. Además
  se resincroniza contra el máximo real de `quotes`, así que un borrado no rompe la serie.
- **`quote_lines.total` es una columna generada** (`quantity * unit_price`), así que ninguna
  línea puede guardarse con un total que no cuadre con su cantidad y su precio.
- **El único flujo que crea en dos pasos sí compensa**: si fallan las líneas de la
  cotización de bici, borra la cotización recién creada (`bikeQuote.ts:248-252`). Es el
  patrón que le falta al asistente con la ruta personalizada.
- `quote_lines` cae en cascada al borrar la cotización, y `quotes.client_id` es
  `ON DELETE RESTRICT`: no se puede borrar un cliente y dejar cotizaciones apuntando al
  vacío.

### [MEDIO] Nadie rechaza una fecha de salida en el pasado — los cuatro caminos

Ninguno de los cuatro valida que la salida sea futura. Lo único que hay es el atributo
`min={hoyMas(7)}` del `<input type="date">` de `/cotizar` (`PublicQuoter.tsx:246`), que es
del navegador y no del servidor; el asistente del CRM ni eso (`Wizard.tsx:643`).

Caso concreto: `POST /api/wp/quote` con `start_date: "2026-01-15"` (pasado, pero del año en
curso, así que hay tarifas) crea una cotización completa, con PDF y **con correo al
cliente**, para un viaje que ya se fue. Igual por `/cotizar`, por el endpoint del agente y
por el asistente. Fechas más viejas se cortan de rebote, no por validación: el año no tiene
tarifas cargadas y `ratesForYear` devuelve vacío.

Qué se rompe: se le manda al cliente una cotización imposible y entra al embudo de
Seguimiento y al calendario como una salida más. Se pierde una hora en aclararlo y algo de
credibilidad. **Propuesta:** una sola comprobación en `tarifarRuta()` —que ya es el paso
común de tres de los cuatro— rechazando salidas anteriores a hoy, con excepción explícita
para el alta retroactiva del CRM si Nico la necesita.

### [MEDIO] `2026-02-31` se desliza a 9 de marzo y se cotiza esa fecha en silencio — `api/wp/quote/route.ts:10`, `api/agente/cotizacion/route.ts:10`, `cotizar/actions.ts:21`

Los tres esquemas de zod validan la fecha de salida con `.regex(/^\d{4}-\d{2}-\d{2}$/)`:
comprueban la **forma**, no que el día exista. `2026-02-31` pasa el filtro, y `new Date()`
lo normaliza al 3 de marzo sin quejarse. A partir de ahí todo el cálculo corre sobre una
fecha que **el cliente no pidió**: se tarifa esa salida, se calcula la fecha fin (`+6 días`
= 9 de marzo), se guarda la cotización y se le manda el PDF. Comprobado en Node con la
misma función del código:

```
2026-02-31 -> 2026-03-09   (¡se corrige sola y sigue!)
2026-02-30 -> 2026-03-08
```

Nadie ve nada raro: no hay error, no hay aviso, y el PDF sale con fechas coherentes entre
sí. La única señal es que no son las que pidió quien cotizó. Si la salida cae en otro mes,
además puede cruzar a otra temporada y cambiar el suplemento. El disparador realista es un
formulario de WordPress con un selector de día suelto o un integrador que arme la fecha
concatenando campos.

**Propuesta:** cambiar el `.regex()` por un refine que compruebe que la fecha existe de
verdad (`new Date(iso)` válido **y** que el ISO de vuelta coincida con lo que llegó). Son
tres líneas, cierran también el 500 de abajo y dejan el sitio donde meter la validación de
fecha pasada.

### [MENOR] `2026-13-45` devuelve un 500 «interno» donde tocaba un 422 de validación — `api/wp/quote/route.ts:10`, `api/agente/cotizacion/route.ts:10`

El mismo `.regex()` del hallazgo de arriba acepta también fechas que no se pueden
normalizar, y esas sí revientan:

```
2026-13-45 -> THROW RangeError: Invalid time value   (sumarDias)
2026-99-01 -> THROW RangeError: Invalid time value
```

`sumarDias()` (`tarifar.ts:74-78` y su copia en `cotizar/actions.ts:51-55`) hace
`d.toISOString()` sobre un `Invalid Date` y lanza; el `try/catch` de la ruta lo convierte en
**500 «interno»**, así que el integrador de WordPress ve un error de servidor y abre un
ticket por un dato mal formado suyo.

Es MENOR y no MEDIO por lo que **no** cuesta: no se pierde dinero, no lo ve ningún cliente
—el endpoint está detrás de un secreto compartido, o sea que lo dispara un integrador, no un
visitante—, el reventón ocurre **antes** de tocar la base en los tres caminos (no deja
cliente ni cotización a medias) y queda en el log. Lo cara es la fecha que sí se desliza, no
esta. Se arregla con el mismo refine.

### [MEDIO] El asistente del CRM no valida nada en el servidor — `src/app/(dashboard)/cotizaciones/nueva/actions.ts:96-126`

`createQuote` es una server action que toma el `FormData` y lo inserta tal cual. No hay
zod, ni rangos, ni longitudes:

- `people: num(formData.get("people")) ?? 1` — sin mínimo ni máximo. El tope de 30 vive
  solo en el `<input max={30}>` y en el `onChange` del componente (`Wizard.tsx:487`).
- `client_email` — sin `.email()`. El único filtro es el `type="email"` del navegador. Un
  correo mal escrito se guarda y después la tarjeta de correo del expediente intenta
  mandárselo.
- `notes`, `client_name`, `route_name` — sin tope de longitud. El endpoint del agente sí
  topa las notas en 2000 (`api/agente/cotizacion/route.ts:15`). Aquí una nota pegada de
  varias páginas entra entera y luego va al PDF.
- `start_date` / `end_date` — sin validar; los rechaza la columna `date` de Postgres, con un
  mensaje de base de datos.

Es el único de los cuatro caminos sin validación de servidor, y encima es el que más usa
Nico. Está detrás de login, así que no es un agujero de seguridad: es que el primer filtro
real está en Postgres. **Propuesta:** el mismo esquema zod que ya existe en el endpoint del
agente, reutilizado en la action.

### [MENOR] El límite de peticiones de `/api/wp/quote` se cuenta sobre una IP que manda el propio cliente — `api/wp/quote/route.ts:17,60`

`visitor_ip` es un campo **del cuerpo de la petición**, no de la conexión. Quien tenga el
secreto (o cualquier bug en el WordPress que lo exponga) puede omitirlo o rotarlo y el
techo de 60/hora no cuenta nada. El comentario dice que el límite fino de 5/hora lo pone
WordPress con sus transients, así que la defensa real está fuera de la plataforma. En
`/cotizar` sí se lee de `x-forwarded-for` (`cotizar/actions.ts:66`), que es lo correcto.
Además, los dos contadores viven en memoria del proceso y se **vacían enteros** al pasar de
5000 IPs (`hits.clear()`), lo que es un reset gratis para quien vaya rotando direcciones.
No es urgente —el endpoint está detrás de un secreto compartido— pero conviene no
confundirlo con un límite de verdad. **Propuesta:** usar `x-forwarded-for` también aquí y
dejar `visitor_ip` solo como dato informativo.

### Lo que sí está bien

- **El secreto de los endpoints server-to-server está bien hecho** (`api/wp/auth.ts:12-20`):
  comparación con `timingSafeEqual`, secretos distintos para WordPress y para el agente
  («filtrar uno no abre la puerta del otro»), y si la variable de entorno falta **se
  deniega** en vez de dejar pasar, que es el error clásico.
- **Personas fuera de rango**: bien topado donde importa. `/cotizar` y `/api/wp/quote` en
  1..12 por zod; el endpoint del agente en 1..30, y además `crearCotizacionAgente` lo
  vuelve a comprobar por dentro (`agentQuote.ts:72-74`), así que no depende solo de la
  capa HTTP. `editQuote.ts:129-131` también valida el rango al editar.
- **Ruta sin tarifa del año**: es el caso mejor resuelto de todo el bloque.
  `tarifarRuta()` distingue «no hay tarifa de este año» (409 `sin_tarifas_ano`) de «esta
  ruta no tiene precio en ningún año» (404 `ruta_sin_precio`), y las dos pantallas lo dicen
  en ámbar antes de que se teclee nada.
- **El precio nunca llega del navegador**: `/cotizar` lo recalcula en el servidor y el
  comentario lo dice explícitamente (`cotizar/actions.ts:76-77`); WordPress no manda
  ningún precio (`webQuote.ts:56-57`). Un usuario que edite el formulario no puede
  abaratarse el viaje.
- **Honeypot** en los dos caminos públicos (`website` y `honeypot`, ambos `max(0)`), y
  `terms_accepted: z.literal(true)` en el de WordPress: no se puede crear una cotización
  web sin aceptar términos.
- Longitudes topadas en los tres esquemas zod (nombre 120, correo 160, teléfono 40, notas
  2000), así que el «texto larguísimo» solo entra por el asistente.

### [MEDIO] Nada impide crear dos veces la misma cotización, y ya pasó — CS-2026-064 y CS-2026-065 en producción

Ninguno de los cuatro caminos deduplica ni pide confirmación. En la base están estas dos:

| | CS-2026-064 | CS-2026-065 |
|---|---|---|
| creada | 2026-08-06 18:04:**10** | 2026-08-06 18:04:**29** |
| cliente | Leidy Lorena Marín Castro | la misma (`client_id` idéntico) |
| ruta / salida / personas | Francés desde Sarria · 2027-07-19 · 4 | idéntico |

**19 segundos de diferencia**, mismo origen (`wordpress`). Es un doble envío: el visitante
volvió a pulsar. Cada una generó su código, su PDF y **su correo al cliente**, así que esa
persona recibió dos cotizaciones del mismo viaje con dos referencias distintas — y en
Seguimiento quedan dos expedientes para una sola venta, uno de los cuales alguien tendrá
que cerrar a mano.

Un matiz que hay que decir para no cargarle a este hallazgo lo que no le toca: las dos
**nacieron con el mismo precio** (615 × 4 = 2460 € de base, 2780 € de total). La diferencia
que hoy se ve entre ellas —CS-2026-065 está en 2780 € de base y 3100 € de total— es
posterior, del cambio del 1-sep-2026, y pertenece al hallazgo de la edición sin bitácora,
no al duplicado. El duplicado se sostiene solo: mismo cliente, misma ruta, misma fecha,
mismas personas, 19 segundos.

En el asistente del CRM el botón sí se deshabilita mientras guarda (`Wizard.tsx:710`), que
tapa el doble clic normal pero no dos pestañas ni un Enter repetido; en los endpoints no hay
nada. **Propuesta:** antes de insertar, buscar una cotización del mismo cliente, ruta, fecha
y personas creada en los últimos minutos y devolver esa en vez de crear otra. Es la
protección que ya se echa de menos con un caso real encima.

### [MEDIO] Un catálogo que no responde se veía exactamente igual que un catálogo vacío — `src/app/(dashboard)/cotizaciones/nueva/page.tsx:9-18`

La página del asistente lanzaba las tres consultas y **descartaba el `error` de todas**,
quedándose con `data || []`. Si la consulta de `routes` falla, el selector «Camino» sale sin
una sola opción y no hay nada que explique por qué. Si la que falla es la de `pricing`, es
peor: las rutas se ven, pero cada combinación muestra el aviso ámbar
*«⚠ No hay tarifas {año} cargadas para esta ruta — ingresá los precios a mano»*
(`Wizard.tsx:553`), que en ese momento es **mentira**: las tarifas existen, lo que falló fue
leerlas. El aviso está redactado justamente para empujar a teclear el precio a mano, así
que la consecuencia previsible es una cotización con precios inventados sobre un catálogo
que estaba bien. **Arreglado** (ver abajo).

### [MENOR] Los 7 avisos de `setState` en efecto son ruido, menos uno — `Wizard.tsx`

`npx eslint` marca 7 errores de `react-hooks/set-state-in-effect` en `Wizard.tsx`
(líneas 94, 173, 188, 207, 243, 249, 262) y 1 en `QuoteEditor.tsx` (165), más un
`eslint-disable` ya inútil en `QuoteEditor.tsx:167`. Revisados uno a uno, seis de los siete
son auto-fill legítimo: no encadenan bucles, solo cuestan un render extra en un formulario
que se usa unas cuantas veces al día. No los llamaría un hallazgo por sí solos.

El que sí importa es el de **`QuoteEditor.tsx:165`**, y no por el render de más sino por lo
que hace: es el auto-fill que se dispara con solo abrir «Editar» y reescribe la base con
`price_cs × people` — el GRAVE de B1.1. El linter estaba señalando el sitio correcto por el
motivo equivocado.

Lo que sí conviene saber: con 8 errores en pie, `npm run lint` falla, así que el linter no
puede usarse hoy como puerta de nada. **Propuesta:** o se arreglan, o se silencian con un
`eslint-disable` **por línea y con motivo escrito**, para que el próximo error de verdad no
se pierda entre los ocho de siempre.

### Lo que sí está bien

- **El botón de crear se deshabilita y cambia de texto** mientras guarda
  (`Wizard.tsx:710-713`, «Creando…»): el estado «cargando» está.
- **El buscador de cliente por teléfono tiene los tres estados**: «Buscando…», «✓ Cliente
  existente: X» y «Cliente nuevo (se creará al guardar)» (`Wizard.tsx:80-86`), con debounce
  de 500 ms y limpieza del timeout. Es el detalle mejor hecho del formulario.
- **Los fallos de la ruta personalizada sí se cuentan**: si falla crear la ruta se muestra
  el error, y si falla el itinerario el mensaje distingue el caso a medias («la ruta se creó
  pero el itinerario falló», `Wizard.tsx:363-365`).
- El aviso del reparto de habitaciones bajo el selector de alojamiento
  (`Wizard.tsx:505-509`) dice en texto plano cuántas dobles y cuántas individuales salen
  para ese número de personas, antes de guardar. Es lo que evita la sorpresa que sí produce
  el editor de Seguimiento.

### [MEDIO] No se puede duplicar una cotización, y el motor para hacerlo ya está escrito — no existe en `cotizaciones/**` ni en `seguimiento/**`

Buscado en todo el código: no hay ninguna acción de duplicar, clonar ni «cotizar también
en hotel». Para ofrecerle a la misma persona el mismo viaje en otra modalidad, en otras
fechas o con otro número de personas hay que volver al asistente y teclearlo entero:
cliente, ruta, fechas, alojamiento, precios.

Que pasa de verdad, en la base: CS-2026-060, CS-2026-062 y CS-2026-063 son tres
cotizaciones de la misma ventana de mayo 2027 con distinta modalidad y distinto número de
personas; CS-2026-010 y CS-2026-011 son la misma clienta con dos rutas. Es la operación
normal de una agencia —dar dos o tres opciones— y hoy cuesta tres formularios completos.

Lo llamativo es que **el patrón ya está implementado y probado**:
`crearCotizacionConBici()` (`bikeQuote.ts:190-258`) copia una cotización a otra nueva con
`parent_quote_id`, arrastra sus líneas de opcionales, borra la nueva si algo falla, y el
expediente ya sabe pintar el «← Viene de CS-… / Continúa en CS-… →». Generalizar eso a un
botón «Duplicar» es reusar código que ya funciona, no construir nada.

### [MEDIO] Editar una cotización ya enviada pisa el PDF que el cliente tiene en el correo — `src/app/(dashboard)/seguimiento/[id]/actions.ts:71-78`

`updateQuote` hace `update` sobre la fila y acto seguido `renderAndStoreQuotePdf()`, que
**sobrescribe el archivo en Storage**. No queda copia de lo que se le cotizó antes, ni en
la base ni en el bucket. El catálogo sí tiene su bitácora (`comercial.pricing_history`);
las cotizaciones no tienen nada equivalente.

Caso vivo en producción: **CS-2026-065** está en estado `enviada` —o sea, el cliente ya
recibió su PDF— y hoy dice que ese viaje vale 3100 €, mientras su gemela CS-2026-064, creada
19 segundos antes y con exactamente los mismos datos, sigue en 2780 €. Las dos nacieron
iguales, así que a CS-2026-065 le movieron el precio después de enviarla.

Y aquí está la prueba del propio hallazgo: **no se puede saber qué campo cambió, ni quién,
ni si fue una sola vez.** Lo único que hay es `updated_at = 2026-09-01 21:25`, que dice que
la fila cambió, no qué columna. Sería deshonesto escribir «se modificó `base_eur`»: esa
afirmación necesitaría justo la bitácora que no existe. Si mañana el cliente reclama con su
PDF de 2780 € en la mano, no hay forma de saber quién tiene razón — punto 7 de CRITERIOS,
«la diferencia entre saber y creer».

**Y la aritmética de esa fila apunta a un segundo camino, latente.** Los 2780 € de base de
hoy son exactamente `2460 + 320`: la base de su gemela **más el suplemento de temporada**.
No sale del catálogo (`hotel_doble` 2027 = 715, y 715 × 4 = 2860). El único sitio del código
que produce ese número es `QuoteEditor.tsx:90` — `initialBase = quote.base_eur ?? Number(quote.total_eur)`
—, que siembra el campo Base con el **total** (base + suplemento + opcionales) cuando la
base viene nula; al guardar, el RPC le vuelve a sumar el suplemento y la base queda inflada.
Hoy no hay ninguna fila con `base_eur` nula, así que no se puede reproducir y no lo doy por
probado; pero es un camino real del código y produce el único número inexplicado de la base.
Merece mirarse junto con lo anterior.

**Propuesta:** ni versiones completas ni un histórico grande. Lo mínimo que resuelve el
problema son dos cosas: (a) no sobrescribir el PDF de una cotización que ya salió —
guardarlo con sufijo de versión, que el bucket ya está organizado por año y código; y (b)
una tabla `quote_history` con el mismo patrón de `pricing_history` (campo, valor viejo,
valor nuevo, quién, cuándo) para los cuatro campos que mueven plata.

### [MEDIO] La cotización enviada que nadie contesta no la persigue nadie — no existe `api/cron/recordatorios-cotizacion`

En `src/app/api/cron/` hay **un solo** endpoint: `recordatorios-contrato`. La cadencia de
insistir cada 4 días hasta 5 veces existe para la firma del contrato, que es el final del
recorrido, y no existe para el principio, que es donde se cae la mayoría.

Los números de producción de hoy:

- **39** cotizaciones en estado `enviada`.
- **16** de ellas con la `valid_until` ya vencida y ahí quietas.
- **3** en total llegaron alguna vez a `aceptada` o más allá.

Y `valid_until` se calcula en las cuatro altas, se imprime en el PDF que el cliente recibe
—o sea, se le promete una fecha— y en la lista de `/seguimiento` **no se pinta**: se
consulta en la query (`seguimiento/page.tsx:35`) y no llega a la tabla. Solo se ve entrando
al expediente uno por uno. CRITERIOS dice que esto «es lo que más plata deja sobre la mesa
cuando falta», y aquí la infraestructura para arreglarlo ya está montada: el cron de n8n, el
emisor único de correo y las plantillas de `email_templates`.

**Propuesta, por orden de lo que cuesta:** primero, pintar la validez en la lista de
Seguimiento y marcar en rojo la vencida — es una columna. Después, un
`/api/cron/recordatorios-cotizacion` clonado del de contratos: a los 8 días sin respuesta
un correo, y avisar a `reservas@` cuando la validez esté por vencer.

### Lo que NO hace falta

- **Plantillas por ruta.** El asistente ya autocarga tarifa, días, fecha fin, etapas y las
  tarjetas del PDF en cuanto se elige ruta + alojamiento + fecha; una plantilla encima de
  eso ahorraría dos clics. El hueco real no es la plantilla, es duplicar una cotización que
  ya existe (arriba).
- **Versionado completo con historial navegable.** Para dos personas es maquinaria de más:
  con no pisar el PDF ya enviado y una bitácora de los campos de dinero se cubre el
  problema real.
- Y por dejarlo dicho: `pricing`, `optional_prices` y `bike_prices` ya son datos por año
  con su bitácora, así que el punto 8 de CRITERIOS —«un proveedor no es texto libre»— está
  cubierto en el cotizador. El texto libre que queda (`route_name` en cotizaciones viejas
  sin `route_id`) es deuda histórica, no diseño.

---

## Arreglos aplicados

### `/cotizar` prometía una descarga que no existía — `src/app/cotizar/PublicQuoter.tsx:124-137`

Cuando el correo no salía, la pantalla de éxito decía «**Descarga tu cotización aquí
abajo**»… y el botón de descarga solo se dibuja `{exito.pdfUrl && …}`. Si además falló el
PDF —que es justo el caso en que también suele fallar el correo, porque el correo depende
del PDF— el visitante veía la frase señalando a un botón que no estaba. Ahora ese caso
tiene su propio mensaje: dice que la cotización quedó guardada, da el código y manda a
WhatsApp, que es el único camino que de verdad le queda. `npx tsc --noEmit` limpio.

### Dos formularios que se quedaban mudos si la action reventaba — `src/app/cotizar/PublicQuoter.tsx:97-116` y `src/app/(dashboard)/cotizaciones/nueva/Wizard.tsx:377-387`

Los dos hacían `const r = await accion(...); if (r.error) setError(...)`, sin `try`. Si la
server action lanzaba en vez de devolver `{ok:false}` —y lanza, por ejemplo, con la fecha
`2026-13-45` del hallazgo de arriba, o si Supabase no responde— la promesa se rechazaba, el
`startTransition` terminaba y la pantalla volvía al formulario **sin éxito, sin error y sin
nada que leer**: el visitante no sabe si su cotización se creó o no. Ahora cada uno atrapa
el fallo y dice qué pasó. En el asistente se reenvía el `NEXT_REDIRECT` para no romper la
redirección del caso exitoso. `npx tsc --noEmit` limpio.

### El asistente ya distingue «el catálogo está vacío» de «el catálogo falló» — `src/app/(dashboard)/cotizaciones/nueva/page.tsx:9,44-53`

La página descartaba el `error` de las consultas de rutas y de precios y se quedaba con
`data || []`. Ahora se recogen los dos y, si alguno falla, sale un aviso rojo arriba del
asistente diciendo qué no se pudo leer y —lo importante— **que no se teclee un precio a
mano dando por hecho que la tarifa no existe**, porque el aviso ámbar del formulario dice
exactamente eso cuando en realidad la consulta se cayó. El asistente se sigue renderizando:
el aviso informa, no bloquea. `npx tsc --noEmit` limpio.

---

## Crítica del experto

`Estado: hecho` — los dos GRAVE se sostienen (el primero es más ancho de lo que dice y su
caso testigo está cancelado); faltan dos hallazgos del mismo peso —`rooms_json` congelado
al editar, que alimenta el contrato y el pedido a Pilgrim, y la moneda— y hay tres
afirmaciones que corregir. **VEREDICTO: revisar.**

Todo lo que sigue está comprobado contra el código y contra la base de producción
(`comercial`, solo SELECT). Donde corrijo al auditor, digo con qué.

### 1. Los dos GRAVE son ciertos — y el primero es peor de lo que dice

**Confirmado en código.** `QuoteEditor.tsx:154-168` calcula `catalogMatch.price_cs * people`
en las dos rutas (botón y auto-fill), mientras `tarifar.ts:126` hace
`enDoble * tarifaDoble + individuales * tarifaSingle`. `modalityToSlug()` (línea 68)
devuelve `null` para la etiqueta mixta, y `updateQuote` (`[id]/actions.ts:58-65`) escribe
`people`, `season_supplement_eur`, `season_kind` y `price_blocks` con `base_eur` vieja.
Las dos mecánicas son exactamente como se describen.

**Comprobado en la base.** Tarifas 2026 de Francés desde Sarria: `pension_doble` 505,
`pension_single` 682. CS-2026-014: 5 personas, «Pensión doble», `base_eur = 2525.00` =
505 × 5; el reparto correcto son 2702 €. La aritmética del hallazgo cuadra.

**Tres correcciones, todas en contra del informe salvo la última:**

a) **El caso testigo es una cotización `cancelada`.** CS-2026-014 está en estado
   `cancelada` desde antes de la auditoría. Los 177 € nunca se dejaron de cobrar. Y es la
   **única** fila de toda la base con grupo impar y etiqueta de doble: barrí las 45
   cotizaciones cruzando `people % 2 = 1` contra `pricing` del año de salida y las otras
   16 son grupos de 1 persona en individual, todas con la base correcta. Escribir «**177 €
   menos cobrados**» en negrita sobre una cotización cancelada infla la evidencia. El
   hallazgo sigue siendo GRAVE —el código va a morder al primer grupo de 3 o 5 que se
   edite— pero hay que decir que hoy no ha mordido, igual que el propio informe tuvo el
   cuidado de decirlo en el hallazgo del `client_id` nulo y en el de las rutas duplicadas.

b) **El daño real del auto-fill no es el grupo impar: es que pisa cualquier precio
   tecleado a mano, y eso sí está pasando hoy.** El efecto de `QuoteEditor.tsx:161-167`
   arranca con `autoLink = true` y los hooks corren **antes** del `if (!editing)`, así que
   se dispara al montar el componente, que `page.tsx:424` monta siempre — no hace falta ni
   pulsar «Editar». Si la etiqueta resuelve a un slug con tarifa en catálogo, el campo
   Base queda cargado con el catálogo y la base guardada se pierde en el primer Guardar.
   Dos casos vivos, los dos `enviada`:
   - **CS-2026-077**: `base_eur = 585.00`, catálogo `pension_single` 2026 = **625**.
   - **CS-2026-060**: `base_eur = 800.00`, catálogo `pension_single` 2027 = **790**.

   Son precios negociados o corregidos a mano. Cualquiera de las dos, abierta y guardada
   para tocar un teléfono, revierte al catálogo sin avisar. Y esto choca de frente con la
   regla que la propia plataforma tiene escrita en `editQuote.ts:20-23`: «cuando el año
   todavía no tiene tarifa, Nico teclea la cifra a mano en el CRM, y **corregir un correo
   no puede borrarle ese número**». La pantalla que más usa Nico viola la regla que el
   camino de BayMax respeta.

c) **La propuesta se queda corta, y el arreglo ya está escrito.** El informe propone «que
   el editor llame a la misma `tarifarRuta()`» y, para el mixto, «o entiende la etiqueta o
   bloquea el guardado». No hace falta inventar ninguna de las dos: `editQuote.ts`
   (`actualizarCotizacion`, el camino de BayMax) ya resuelve **exactamente** este problema
   —`modalidadGuardada()` en la línea 53 saca tipo y reparto de `rooms_json`, «el dato duro
   que sobrevive a cualquier etiqueta mixta»—, ya retarifa solo cuando cambia algo que
   mueve el precio, ya se niega a guardar si el año no tiene tarifa, y ya regenera el PDF.
   El hallazgo de verdad, que el informe no nombra, es que **hay dos editores de
   cotización que no se comportan igual**: la misma cotización editada por BayMax y editada
   por la pantalla da resultados distintos. Eso es «un dato, un sitio» roto en el sitio más
   caro, y convierte el arreglo en «la pantalla llama a `actualizarCotizacion()`» en vez de
   en un rediseño.

### 2. Lo que el informe afirma y no sostiene

- **«CS-2026-065 … su `base_eur` se modificó el 1-sep-2026 a las 21:25»** — no se puede
  saber eso. Lo único que hay es `updated_at`, que dice que la fila cambió, no qué columna.
  El hallazgo cuya tesis es «no hay bitácora» usa como prueba una bitácora que no existe.
  La observación **es correcta y el hallazgo se sostiene** (no hay `quote_history`, el PDF
  se sobrescribe), pero hay que escribirla como lo que es: «la fila cambió y no hay forma
  de saber qué campo ni quién».
- **Y la aritmética de esa fila apunta a otra cosa que el informe no persiguió.**
  CS-2026-065 tiene hoy `base_eur = 2780.00`, que es exactamente `2460 + 320`, o sea la
  base de su gemela CS-2026-064 **más el suplemento de temporada**. No es el catálogo:
  `hotel_doble` 2027 son 715 €, y 715 × 4 = 2860. El único camino del código que produce
  ese número es `QuoteEditor.tsx:90` — `initialBase = quote.base_eur ?? quote.total_eur` —,
  que siembra el campo Base con el **total** (base + suplemento + opcionales) cuando la
  base viene nula, y al guardar el RPC vuelve a sumarle el suplemento. Hoy no hay ninguna
  fila con `base_eur` nula, así que es un camino latente y no lo puedo probar; pero es
  latente **y** produce el único número inexplicado de la base. Merece una línea.
- **«las dos quedaron con precios distintos (2460 € y 2780 €)»** en el hallazgo del
  duplicado: eso no es cierto en el momento del duplicado. Las dos nacieron iguales
  (615 × 4 = 2460 de base, 2780 de total); la diferencia es posterior, del cambio del
  1-sep. El duplicado se sostiene solo (mismo cliente, misma ruta, 19 s), pero atribuirle
  una diferencia de precio que no causó es sumar un cargo que no le toca.
- **Los conteos bailan.** «las 38 cotizaciones de la base», «de las 38 … coincide en las
  38» conviven con «de las 45 cotizaciones de producción». Son 45. El cuadre sí se
  sostiene —lo repetí sobre las 45 y `total_eur = base + suplemento + líneas` da 0
  descuadres, y el único descuadre de `cost_eur` es CS-2026-058, tal cual dice el
  informe—, pero un lector que ve «38» piensa que quedaron 7 sin mirar.

Lo demás lo verifiqué y está bien: 39 `enviada`, 16 de ellas vencidas, 11 `client_id`
nulos, 2 sin PDF, `descuadre_total = 0`, `descuadre_costo = 1`. El apartado «Lo que sí está
bien» no es relleno: cada afirmación que revisé (suplemento una sola vez, sin redondeos,
año exacto, temporadas que no se suman, `quote_lines.total` generada) aguanta.

### 3. El hueco caro que no se miró: `rooms_json` se queda viejo, y de ahí salen el contrato y el pedido a Pilgrim

Este es el que me hace pedir revisión. El informe mira `rooms_json` una sola vez, como una
casilla «sí/no» en la tabla de los cuatro caminos de alta, y nunca pregunta **quién lo lee
después**. Lo leen tres sitios, todos aguas abajo del dinero:

- `src/lib/quotes/pilgrimEmail.ts:122` — arma la línea `Habitaciones: N dobles + N
  individuales` **del correo con el que se le pide el cupo a Pilgrim**.
- `src/lib/contracts/render.ts:76` — la acomodación que aparece en el **contrato que firma
  el cliente**.
- `src/lib/quotes/pdf.ts:199` — las tarjetas de precio del PDF en reparto mixto.

Y `updateQuote` (`[id]/actions.ts:52-70`) **no lo toca nunca**. Cambiar personas, ruta,
fecha o modalidad desde la pantalla deja el reparto congelado para siempre. `editQuote.ts:212`
sí lo reescribe (`patch.rooms_json = t.roomsJson`): otra vez, los dos editores en desacuerdo.

No es teórico. **CS-2026-080**, estado `enviada`, editada el 1-sep-2026:

| | valor en la base |
|---|---|
| `people` | 14 |
| `rooms_json` | `{dobles: 8, individuales: 0, tarifa_doble: 575}` |
| camas que declara | **16** |
| `base_eur` | 8750 = 625 × 14 (el catálogo de hoy, no los 575 de `rooms_json`) |

Se creó con 16 personas y se bajó a 14 desde la pantalla. Si esa cotización pasa a
contrato y a pedido, **le pedimos a Pilgrim 8 dobles para 14 personas** —una habitación de
más, del orden de una plaza y media de coste— y el contrato que firma el cliente dice «8
habitación(es) doble(s)». Es la única fila de la base con `rooms_json` incoherente, o sea
que la tasa de aparición es «una de cada dos cotizaciones editadas con cambio de personas».
Completa la frase de CRITERIOS sin esfuerzo: se pierde dinero con el proveedor y se pierde
la confianza de alguien que ya firmó. Yo esto lo pongo **GRAVE**, y es del mismo párrafo de
código que los dos GRAVE que sí se reportaron: el auditor leyó `updateQuote` entero y no se
preguntó qué campos faltaban en el `patch`.

De paso, esto le da peso al «`rooms_json`: **no**» de `/cotizar` que la tabla despacha sin
comentario: toda cotización nacida en `/cotizar` llega al contrato y al pedido de Pilgrim
**sin línea de habitaciones**, y encima con la etiqueta «Pensión doble» para un grupo impar.
No es una casilla de una tabla comparativa; es el pedido al proveedor.

### 4. El otro hueco: la plataforma cobra en pesos y la auditoría no menciona el peso ni una vez

CRITERIOS §4 pide los números «en dos monedas, con la tasa del día del movimiento y no la
de hoy», y `app/cotizar/**` es alcance explícito de B1. El informe no dice una palabra de
la moneda. Lo que hay:

- `src/app/cotizar/page.tsx:24` lee `getTRMHoy()` y `PublicQuoter.tsx:93` pinta
  `totalCop = total × trmEurCop` — la única cifra que un cliente colombiano de verdad lee.
- **`comercial.trm_history` está vacía.** Cero filas. Con la tabla vacía, `getTRMHoy()`
  solo devuelve algo si las dos APIs externas responden en esa petición; si fallan, el
  `catch {}` de `trm.ts:31` se las traga, devuelve `null` y **la pantalla simplemente no
  pinta pesos**, sin un solo aviso. Que la tabla lleve vacía toda la vida del proyecto es
  la prueba de que ese camino no ha escrito nunca. Aguas abajo, `contracts/render.ts:119-120`
  imprime `valor_total_cop: "—"` y `trm: "—"` en el contrato.
- El COP que se le muestra al visitante **no se guarda en la cotización**. La `valid_until`
  le promete 30 días; el precio en euros aguanta, el número en pesos que él capturó en
  pantalla no, y no queda registro de cuál fue. Para una agencia que vende en pesos lo que
  paga en euros, esa es la fuga de margen clásica del oficio.

No pido resolver la política de tasa aquí —eso es decisión de Nico y toca B3/B6—, pero un
auditor de un cotizador de agencia no puede cerrar el bloque sin decir que la única moneda
que entiende el cliente hoy no se pinta y no se archiva.

### 5. Prioridad: dos cambios y una advertencia

- **Sube a GRAVE:** `rooms_json` congelado en `updateQuote` (§3). Toca proveedor y
  documento firmado.
- **Baja a MENOR la mitad del hallazgo de la fecha imposible:** el 500 en
  `/api/wp/quote` con `2026-13-45` no le cuesta a nadie dinero, ni un cliente, ni una hora
  —lo dispara un integrador con el secreto, revienta antes de tocar la base y se ve en el
  log—. Lo que sí es MEDIO, y es lo que hay que dejar en primer plano, es **`2026-02-31`
  que se desliza a 9 de marzo y cotiza en silencio una fecha distinta de la que pidió el
  cliente**. Mismo arreglo de tres líneas, pero el titular está puesto en la mitad menos
  grave.
- **Advertencia de orden, no de etiqueta:** «la cotización enviada que nadie contesta»
  está bien clasificada como MEDIO según la letra del TABLERO (no es dinero perdido por un
  bug), pero **por plata esperada es el primer hallazgo del bloque**: 16 de 39 vencidas y
  quietas, 3 aceptadas en total, y la infraestructura ya montada. Cuando esto llegue a
  `SINTESIS.md`, que no quede sepultado entre los MEDIO por orden alfabético de gravedad.
  Y su primera mitad —pintar `valid_until` en la lista de `/seguimiento`, que ya se
  consulta y se tira— es una columna: es el mejor retorno por línea de todo el bloque.

### 6. Lo que sobra, y lo que está bien calibrado

Poco sobra, la verdad. Dos matices y nada más:

- **«El único camino que no genera el PDF es el del CRM»** (MENOR) es correcto pero puede
  ser deliberado: el asistente redirige al expediente y Nico revisa antes de mandar nada.
  Antes de «arreglarlo» conviene preguntar, no vaya a ser que se le empiece a generar PDF
  a cotizaciones internas que nunca salen.
- **Los 7 avisos de `setState` en efecto**: el propio hallazgo concluye que seis son ruido.
  Es honesto, y la observación de que con 8 errores en pie `npm run lint` no sirve de
  puerta vale más que el hallazgo. Pero es un hallazgo que se anula a sí mismo; en la
  síntesis cabe como una línea de la sección de herramientas, no como entrada propia.

Y el crédito donde toca: los apartados «Lo que sí está bien» son lo mejor del informe.
Están verificados uno por uno contra el código y contra filas reales, no asumidos, y
distinguen bien las decisiones deliberadas (el fallback de año de `/cotizar`, la modalidad
única del cotizador público) de los descuidos. La tabla de los cuatro caminos y el
diagnóstico de `next_quote_code()` con su candado de fila son trabajo de oficio. Y los tres
arreglos aplicados son exactamente lo que el contrato pide: pequeños, reversibles y sobre
mensajes que mentían.

VEREDICTO: revisar

Falta esto, y es concreto:

1. **Hallazgo nuevo, GRAVE:** `updateQuote` no reescribe `rooms_json`, y de ahí salen la
   línea «Habitaciones» del correo a Pilgrim (`pilgrimEmail.ts:122`), la acomodación del
   contrato firmado (`contracts/render.ts:76`) y las tarjetas del PDF mixto
   (`pdf.ts:199`). Caso vivo: CS-2026-080, 14 personas con `rooms_json` de 8 dobles (16
   camas), estado `enviada`. Documentar el efecto sobre el pedido al proveedor y sobre el
   contrato, y anotar que `/cotizar` ni siquiera lo escribe al crear.
2. **Ampliar el GRAVE de `QuoteEditor`** con lo que hoy no dice: el auto-fill corre al
   **montar** la página del expediente (`page.tsx:424` monta el editor siempre; los hooks
   van antes del `if (!editing)`), y por tanto **pisa cualquier base tecleada a mano**, no
   solo la de los grupos impares. Casos vivos y `enviada`: CS-2026-077 (585 € contra 625 €
   de catálogo) y CS-2026-060 (800 € contra 790 €). Y decir explícitamente que esto
   contradice la regla escrita en `editQuote.ts:20-23`.
3. **Corregir la evidencia de CS-2026-014**: está `cancelada`; los 177 € no se perdieron.
   Es la única fila de la base con ese patrón. El hallazgo sigue GRAVE por el código, pero
   la frase en negrita tiene que decir la verdad.
4. **Nombrar el hallazgo de fondo que atraviesa los dos GRAVE:** hay **dos editores de
   cotización** —`QuoteEditor.tsx` + `[id]/actions.ts` y `editQuote.ts`— con reglas
   distintas de retarifado, de etiqueta mixta y de `rooms_json`, y el segundo ya hace bien
   las tres cosas. La propuesta pasa de «replicar el reparto» a «la pantalla llama a
   `actualizarCotizacion()`», que es reuso, no obra nueva.
5. **Añadir la moneda al bloque:** `comercial.trm_history` está vacía, `getTRMHoy()` se
   traga el fallo en un `catch {}` y el COP no se pinta en `/cotizar` ni se archiva en la
   cotización que se le promete al cliente por 30 días. Aunque el arreglo viva en otro
   bloque, la omisión es de B1 (§4 de CRITERIOS, y `app/cotizar/**` es alcance de B1).
6. **Arreglar tres afirmaciones**: (a) «`base_eur` se modificó» en CS-2026-065 → «la fila
   cambió y no hay forma de saber qué campo ni quién», y añadir que `2780 = 2460 + 320`
   apunta al `initialBase = base ?? total` de `QuoteEditor.tsx:90` como sospechoso latente;
   (b) quitar del hallazgo del duplicado que las gemelas «quedaron con precios distintos»
   —nacieron iguales—; (c) cuadrar los conteos: son **45** cotizaciones, no 38.
7. **Reetiquetar** el hallazgo de la fecha imposible para que el titular sea `2026-02-31 →
   9 de marzo` (MEDIO) y el 500 quede como el detalle MENOR que es.

---

## Revisión tras la crítica

`Estado: hecho` — los siete puntos del veredicto, resueltos. Todo lo que sigue se comprobó
antes de escribirlo: contra el código, y contra `comercial` en producción (solo SELECT). Los
hallazgos se corrigieron **en su sitio**, en la sección Hallazgos, para que este archivo sea
la verdad y no haya que leer tres versiones. Aquí queda solo el registro de qué cambió.

**No se tocó código en esta ronda**: es revisión del informe.

### Qué cambió, y por qué

1. **Hallazgo nuevo, GRAVE — `updateQuote` nunca reescribe `rooms_json`.** El crítico tenía
   razón: el `patch` tiene 16 campos y `rooms_json` no está en ninguno, ni la pantalla lo
   manda. Verificado también quién lo lee después —`pilgrimEmail.ts:122` (el pedido de cupo
   a Pilgrim), `contracts/render.ts:74` (el contrato firmado), `pdf.ts:197` (las tarjetas
   del mixto)— y el caso vivo: CS-2026-080, `people = 14` con `rooms_json` de 8 dobles,
   estado `enviada`. Confirmado además que es la **única** de las 15 filas con `rooms_json`
   donde las camas no cuadran con `people`. Se añadió como segundo agujero del mismo campo
   que `/cotizar` no lo escribe al crear, con la honestidad de que hoy es latente: en
   producción no hay ni una fila con `source = 'web'` (39 `interna`, 5 `wordpress`,
   1 `baymax`).

2. **GRAVE 1 reescrito, con otro titular.** El crítico acertó en las dos cosas. El auto-fill
   está en un `useEffect` sin guarda de `editing` y `page.tsx:424` monta el editor siempre:
   corre al **montar**, así que pisa cualquier base tecleada a mano, no solo la de los
   grupos impares. Casos vivos y `enviada`, verificados contra `pricing`: CS-2026-077
   (585 € contra 625 € de catálogo) y CS-2026-060 (800 € contra 790 €). Y CS-2026-014 está
   efectivamente `cancelada`: los «177 € menos cobrados» salieron de la negrita y del
   titular, y ahora el hallazgo dice que el reparto es un defecto real que **todavía no ha
   mordido**. El título pasó de «cobra el grupo impar a tarifa de doble» a «pisa la base
   tecleada a mano», que es el daño diario y verificable.

3. **La moneda, que no aparecía ni una vez, es ahora un MEDIO propio.** `comercial.trm_history`
   tiene **0 filas** (verificado), así que el único camino vivo de `getTRMHoy()` es que una
   de las dos APIs conteste en esa misma petición. Y no se puede saber por qué lleva vacía:
   el `catch {}` de `trm.ts:31` se traga el fallo de las APIs y el `upsert` de la línea 70
   solo desestructura `data`, nunca `error`. Cuando falla, `/cotizar` **omite la línea del
   COP sin decir nada** (`{totalCop && …}`), mientras el CRM sí es honesto («TRM no
   disponible»). Y `quotes` no tiene ni una columna de COP o TRM: el peso que se le muestra
   al cliente no se archiva, aunque la cotización le prometa 30 días de validez — lo que
   aguanta 30 días es el euro, no el peso.

4. **Tres afirmaciones corregidas.** (a) De CS-2026-065 solo consta `updated_at`: se
   reescribió como «la fila cambió y no hay forma de saber qué campo ni quién», que es
   justamente la tesis del hallazgo, y se añadió el sospechoso latente que el crítico
   detectó —`2780 = 2460 + 320` apunta a `initialBase = base ?? total` de
   `QuoteEditor.tsx:90`—, dicho como lo que es: un camino real del código que hoy no se
   puede reproducir porque no hay ninguna fila con `base_eur` nula. (b) Las gemelas del
   duplicado **nacieron iguales**; la diferencia de precio es posterior y se le devolvió al
   hallazgo al que pertenece. (c) Los conteos: son **45** cotizaciones. Repetido el cuadre
   sobre las 45 — `total_eur = base + suplemento + líneas` da **0** descuadres, y
   `cost_eur` descuadra en **una sola** fila, CS-2026-058, tal como decía el informe.

5. **Nombrado el hallazgo de fondo, que era lo más valioso de la crítica.** Verificado
   `editQuote.ts` línea a línea: `modalidadGuardada()` saca el reparto de `rooms_json`
   (`:53-56`), solo retarifa si cambia ruta/modalidad/fecha/personas (`:143`), no guarda
   nada si el año no tiene tarifa (`:200`) y reescribe `rooms_json` (`:212`). Es cierto: ya
   resuelve las tres cosas. Los tres GRAVE dejaron de proponer aritmética nueva y ahora
   apuntan todos a la misma propuesta —**que la pantalla llame a `actualizarCotizacion()`**—,
   con la tabla de las ocho diferencias entre los dos editores. Se anota el único cabo que
   la vuelve trabajo y no un cambio de una línea: `ParcheCotizacion` no acepta un precio a
   mano, y la pantalla lo necesita para el año sin tarifa cargada.

6. **Prioridades.** `rooms_json` entra como GRAVE. El hallazgo de la fecha imposible se
   partió en dos: el titular es ahora **`2026-02-31 → 9 de marzo`** (MEDIO), que cotiza en
   silencio una fecha que el cliente no pidió, y el 500 de `2026-13-45` queda aparte como
   **MENOR**, con el motivo escrito de por qué no cuesta nada. Mismo arreglo de tres líneas
   para los dos.

7. **Coherencia del archivo.** Puestas al día las líneas de resumen de B1.1, B1.2 y B1.4, y
   marcado con ⚠ el «no» de `rooms_json` de `/cotizar` en la tabla de los cuatro caminos,
   que era donde el informe original lo despachaba sin comentario.

### Lo que se deja explícitamente como estaba

- La **advertencia de orden** del crítico sobre «la cotización enviada que nadie contesta»:
  sigue MEDIO, que es lo que dice la letra del TABLERO, pero por plata esperada es el
  primer hallazgo del bloque (16 de 39 vencidas y quietas, 3 aceptadas en total, verificado
  otra vez). Eso es un aviso para `SINTESIS.md`, no un cambio de etiqueta aquí.
- El resto de lo que el crítico dio por sólido no se reabrió: una ronda, y lo que aguanta
  aguanta.

### Propuestas menores anotadas en esta ronda (no se tocó nada)

- Revisar **CS-2026-080** antes de que salga su pedido a Pilgrim: hoy declara 8 dobles para
  14 personas, dos camas de más.
- Que `trm.ts` deje de tragarse sus dos fallos (`catch {}` en la línea 31 y el `error` del
  `upsert` que nunca se lee): sin eso no hay forma de saber por qué `trm_history` lleva
  vacía toda la vida del proyecto. Es un `catch` mudo de los que el contrato manda arreglar,
  pero está en el camino del dinero y toca decidirlo con Nico.
