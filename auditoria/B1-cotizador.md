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
  `Estado: hecho` — tres de los cuatro (Wizard, WordPress y agente) dan el mismo precio porque comparten `tarifarRuta()`; **`/cotizar` no**: cobra una sola modalidad a todo el grupo y cae al año anterior. Estado inicial, código y validez sí coinciden en los cuatro.
- **B1.3 Alta a medias.** Si falla el PDF, el correo o la inserción de líneas, ¿qué queda en la base? Busca cotizaciones sin líneas, sin código o sin cliente. No hay transacción: di qué se rompe.
  `Estado: hecho` — no hay cotizaciones sin líneas (el schema no las necesita) ni sin código, pero sí tres puntos donde el alta queda a medias sin que nadie se entere: el error al crear el cliente se ignora, el PDF fallido no detiene el correo, y la ruta personalizada queda creada aunque la cotización falle.
- **B1.4 Validación de la entrada.** Personas fuera de rango, fecha en el pasado, ruta sin tarifa del año, correo inválido, texto larguísimo. En los endpoints públicos además: secreto, límite de peticiones, payload gigante.
  `Estado: hecho` — los tres caminos con zod validan bien salvo la fecha (ninguno rechaza el pasado y `2026-13-45` pasa el regex y revienta); el asistente del CRM no valida **nada** en el servidor. Secreto sólido; el rate limit del endpoint de WordPress se puede saltar solo.
- **B1.5 El wizard como herramienta.** Doble clic en «crear» (¿dos cotizaciones?), catálogo que no responde, errores sin mensaje, y los avisos de `setState` en efecto que ya marca el linter en `Wizard.tsx`.
  `Estado: hecho` — nada impide crear la misma cotización dos veces (hay un caso real en producción, CS-2026-064/065), y un fallo al leer el catálogo se veía idéntico a un catálogo vacío. Los 7 avisos del linter son ruido salvo uno.
- **B1.6 Lo que falta frente a un CRM de agencia.** Duplicar una cotización, versionarla, plantillas por ruta. Solo lo que le ahorraría tiempo real a Nico; mira CRITERIOS.md.
  `Estado: en curso` — busco en el código si ya existe duplicar/versionar/plantillas antes de reclamarlas, y mido cada hueco contra lo que cuesta hoy en la base real.

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
| `rooms_json` | sí | **no** | sí | sí |
| PDF al crear | **no** | sí | sí | sí |
| Correo al crear | no | sí | sí | no (lo aprueba Nico) |

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

### [MEDIO] Una fecha con formato correcto pero imposible tumba el endpoint con un 500 — `api/wp/quote/route.ts:10`, `api/agente/cotizacion/route.ts:10`, `cotizar/actions.ts:21`

Los tres esquemas de zod validan la fecha con `.regex(/^\d{4}-\d{2}-\d{2}$/)`, que acepta
`2026-13-45` y `2026-99-01`. Comprobado en Node con la misma función del código:

```
2026-13-45 -> THROW RangeError: Invalid time value   (sumarDias)
2026-99-01 -> THROW RangeError: Invalid time value
2026-02-31 -> 2026-03-09                              (¡se corrige sola y sigue!)
```

`sumarDias()` (`tarifar.ts:74-78` y su copia en `cotizar/actions.ts:51-55`) hace
`d.toISOString()` sobre un `Invalid Date` y lanza. En `/api/wp/quote` y
`/api/agente/cotizacion` el `try/catch` de la ruta lo convierte en **500 «interno»** cuando
debería ser un 422 de validación — el integrador de WordPress ve un error de servidor y
abre un ticket por un dato mal formado suyo. Y `2026-02-31` ni siquiera falla: se
desliza a 9 de marzo y se cotiza esa fecha, distinta de la que pidió el cliente.

Lo bueno: el reventón ocurre **antes** de tocar la base en los tres caminos, así que no deja
cliente ni cotización a medias.

**Propuesta:** cambiar el `.regex()` por un refine que compruebe que la fecha existe de
verdad (`new Date(iso)` válido y que el ISO de vuelta coincida). Son tres líneas y quita el
500, el falso 3 de marzo y de paso permite meter ahí la validación de fecha pasada.

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
que cerrar a mano. Encima las dos quedaron con precios distintos (2460 € y 2780 € de base),
así que el cliente tiene dos números para el mismo viaje.

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

`Estado: pendiente`

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
