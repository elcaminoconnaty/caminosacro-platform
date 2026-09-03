# B5 — Catálogo, precios y hoteles

**Cubre:** `catalogo/**`, `lib/pricing/**`, `lib/bikes/**`, `hoteles/**`

**Por qué importa:** De aquí salen todos los precios. Un dato malo aquí se propaga a todas las cotizaciones.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B5.1 El año de la tarifa.** Qué pasa el 1 de enero con las salidas del año nuevo sin tarifas cargadas. El fallback del cotizador público y el aviso `price_note`: ¿avisa de verdad o pasa desapercibido?
  `Estado: hecho` — **la pregunta ya no es hipotética: 2027 se está vendiendo hoy** y solo **2 de las 11
  rutas web** tienen tarifa 2027 cargada (una de ellas a medias). Hay 12 cotizaciones con salida en 2027,
  todas `enviada`. `tarifarRuta()` se porta bien —distingue «sin tarifa este año» de «sin tarifa nunca» y
  nunca deja una base en cero—, pero **de las 12 solo 2 llevan `price_note`**: el resto se tecleó a mano y
  no queda constancia de con qué año se calculó.
- **B5.2 Márgenes.** La regla de markup y su aplicación masiva. Comprueba que ninguna tarifa quedó vendiéndose por debajo del costo.
  `Estado: hecho` — **ninguna tarifa se vende por debajo del costo**: barridas las 74 filas de las tres
  tablas de precio, cero a costo o por debajo, con márgenes mínimos del 14,9 % (rutas), 21,9 %
  (opcionales) y 15,0 % (bicis). Las 4 filas que se apartan de la regla de markup lo hacen por 1 a 12 €,
  redondeando a precio comercial. Lo único: la bitácora del catálogo **no dice quién** en 40 de sus 67
  entradas.
- **B5.3 Rutas sin etapas.** Las de bici desde Oporto y Oviedo no tienen etapas cargadas. Mira qué sale en el PDF y en el prellenado de la documentación cuando faltan.
  `Estado: hecho` — **el código lo resuelve bien**: el PDF pone «—» en etapas y dice «Itinerario detallado en
  preparación», y el prellenado devuelve un error claro en vez de una lista vacía. El problema es de datos y
  es **más grande de lo que dice la tarea**: no son dos rutas de bici, son **cuatro rutas sin etapas y tres
  de ellas publicadas en la web** — se suma `Portugués desde Vigo`, que es de senderismo.
- **B5.4 Opcionales.** Precios por año, opcionales activos sin precio, unidades y cantidades. Qué pasa si se desactiva uno que está en cotizaciones vivas.
  `Estado: hecho` — **desactivar un opcional que alguien ya contrató lo hace invisible pero lo sigue
  cobrando**: la lista recorre el catálogo activo y la suma recorre las líneas, así que la línea deja de
  verse y sigue en el total. Los 16 opcionales están activos hoy, así que no ha mordido. Además: **ninguno
  de los 16 tiene precio 2027** (con respaldo avisado en ámbar, eso sí) y `optional_services` arrastra dos
  columnas de precio muertas.
- **B5.5 Bicis.** Tarifa por bici × ruta × año, la fianza que no entra al total, el encadenado por `parent_quote_id`.
  `Estado: hecho` — el tratamiento de la fianza en la **cotización** es ejemplar (fuera del total, por
  bicicleta, en ámbar y con sus condiciones), pero **el contrato que se firma no la menciona ni una vez**:
  cero apariciones en `template.ts` y en `contractPdf.tsx`. Y de las 42 combinaciones bici × ruta × año,
  solo **6** tienen precio, todas de `Francés Bici Ponferrada` 2026 — las otras dos rutas de bici están
  publicadas y no se les puede alquilar una bici.
- **B5.6 Hoteles.** Módulo recién hecho: duplicados, ciudades que no casan con las etapas, hoteles sin fotos, qué pasa al borrar uno en uso.
  `Estado: hecho` — **el módulo está limpio**: 6 hoteles, ninguno duplicado por nombre ni por ciudad, todos
  con fotos, teléfono y dirección, y el emparejador de localidades resuelve bien los casos difíciles
  (lo probé ejecutándolo: «Pedrouzo» encuentra «O Pedrouzo (O Pino)»). Cobertura real del prellenado: **26 %
  de las noches**, pero **6 de 6 en `Francés desde Sarria`**, que es la ruta insignia. Lo único: al borrar
  un hotel, las columnas de respaldo que deberían salvar la documentación **están vacías**.
- **B5.7 Integridad referencial.** Borrar una ruta con cotizaciones, un opcional en uso, una bici cotizada. Qué protege la base y qué no.
  `Estado: hecho` — la base **sí protege** lo importante: no se puede borrar una ruta con cotizaciones
  (`quotes.route_id` es `NO ACTION`). Pero el mensaje que ve quien lo intenta dice lo contrario de lo que
  pasa, y `quote_lines.reference_id` **no es clave foránea de nada**, así que los opcionales y las bicis no
  tienen ninguna protección de la base — solo la que ponga el código.

---

## Hallazgos

### [MEDIO] Se está vendiendo 2027 con tarifas de 2026 y casi nada lo deja anotado — `comercial.pricing` · `lib/pricing/year.ts`

El calendario ya llegó: hoy es **1 de septiembre de 2026** y en la base hay **12 cotizaciones
con salida en 2027**, las doce en estado `enviada`. Lo que hay cargado para atenderlas:

| | rutas |
|---|---|
| rutas activas y publicadas en web | **11** |
| …con las 4 tarifas de **2026** | 11 |
| …con tarifas de **2027** | **2** — y una a medias |
| rutas activas sin **ninguna** tarifa, de ningún año | **15** (todas `web=false`, pero **sí** seleccionables en el asistente) |

Las dos con 2027 son `Francés desde Sarria` (las 4 modalidades) y `Portugués desde Tui`
(**solo pensión**: le faltan `hotel_doble` y `hotel_single`). Las otras nueve rutas web no
tienen ni una fila de 2027.

**Qué pasa por cada puerta, comprobado en el código:**

- `tarifarRuta()` —asistente, WordPress, agente y BayMax— **se porta bien**. Pide solo las dos
  modalidades del tipo solicitado, y si a alguna le falta la tarifa del año devuelve
  `sin_tarifas_ano` (409) distinguiéndolo de `ruta_sin_precio` (404), con el año en el mensaje
  (`tarifar.ts:110-120`). **Nunca produce una base en cero**, que era el fallo que fui a
  buscar en el caso del año a medias de Tui: pedir hotel 2027 en esa ruta da 409, no 0 €.
- `/cotizar` **no**: usa `ratesForYearWithFallback()` y cobra con la tarifa del año anterior.
  Es la decisión que B1 ya documentó; lo que aporta B5 es **la escala**, porque hoy eso
  aplica a **9 de las 11 rutas web**, no a un caso raro.

**Cuánto cuesta, medido:** las tarifas 2027 de `Francés desde Sarria` están un **16 %** por
encima de las de 2026 (`pension_doble` 505 → 590, `hotel_doble` 615 → 715). Las dos
cotizaciones que salieron por WordPress antes de cargar 2027 lo enseñan:

| | salida | base cobrada | con tarifa 2027 | diferencia |
|---|---|---|---|---|
| **CS-2026-064** | 2027-07-19 | 2.460 € (615 × 4) | 2.860 € (715 × 4) | **−400 €** |
| **CS-2026-065** | 2027-07-19 | 2.780 € | 2.860 € | −80 € |

Las dos están `enviada`, o sea que esos clientes tienen un PDF con esos números.

**Y aquí está el hallazgo de verdad, que es el rastro.** De las 12 cotizaciones de 2027,
**solo esas 2 tienen `price_note`** —las de WordPress—. Las otras diez lo tienen en `null`:

- Cuatro usaron una tarifa 2027 real y están bien (CS-2026-068, -083, -066, -063).
- Las demás se **tecleraron a mano** porque el asistente avisa en ámbar «no hay tarifas {año}
  cargadas para esta ruta». Es el camino diseñado y el aviso está bien puesto — pero
  **después no queda constancia de nada**. CS-2026-015 (Costero desde Baiona, salida
  2027-04-08) tiene base 882 €, que es exactamente el `pension_single` de **2026** de esa
  ruta: se cotizó una salida de 2027 al precio del año anterior, sin `price_note`, sin aviso
  y sin forma de saberlo hoy salvo cruzando a mano contra `pricing`.

Sumado a lo que B1 ya dejó dicho —que el `price_note`, cuando existe, **solo se ve dentro del
PDF** y no en el expediente—, el resultado es que la plataforma no puede responder «¿qué
cotizaciones vivas se calcularon con una tarifa que ya no es la vigente?». Y esa es justo la
pregunta de enero.

**Propuesta (no se toca: es dinero):** (a) guardar en la cotización el **año de tarifa
usado**, no solo una nota de texto, y escribirlo también cuando el precio se teclea a mano;
(b) pintar en `/seguimiento` un distintivo en las cotizaciones cuyo año de tarifa no coincide
con el año de salida — es la misma columna «Falta» que proponen B2.6 y B2.7; y (c) una
consulta de arqueo que liste las cotizaciones vivas cuya base no cuadra con el catálogo de su
año de salida. Con las 12 de 2027 encima, la (c) se puede correr hoy.

### [MEDIO] Desactivar un opcional contratado lo hace invisible, pero se sigue cobrando — `seguimiento/[id]/page.tsx:158` · `OptionalsCard.tsx:70,96`

La tarjeta de opcionales del expediente se arma con dos fuentes distintas y ahí está el
problema:

- **La lista que se pinta** recorre el **catálogo**: `for (const o of catalog)`
  (`OptionalsCard.tsx:96`), y ese catálogo llega filtrado por `.eq("active", true)`
  (`page.tsx:158`).
- **La suma que se muestra** recorre las **líneas contratadas**:
  `selected.reduce((s, l) => s + Number(l.total), 0)` (`OptionalsCard.tsx:70`).

Si alguien desactiva en `/catalogo` un opcional que una cotización viva ya tiene contratado,
esa línea **desaparece de la lista** —no hay fila del catálogo donde pintarla— pero **sigue
en `quote_lines`**, sigue sumando en el subtotal de la propia tarjeta y sigue dentro de
`total_eur`, porque `recompute_quote_money()` suma las líneas sin mirar si el servicio sigue
activo.

El resultado es un expediente donde los opcionales marcados no cuadran con el total que la
misma tarjeta muestra, y donde **no hay forma de quitar la línea desde la pantalla**: para
desmarcarla haría falta la casilla que ya no se dibuja. También sigue apareciendo en el PDF y
en el correo a Pilgrim, que leen las líneas.

**Honestidad sobre el caso:** los **16** opcionales están hoy `active = true`, así que no hay
ninguna cotización afectada. Pero desactivar es la operación normal para retirar un servicio
de temporada, y hay dos opcionales con líneas vivas —`Noche extra — Pensión` (3 líneas) y
`Tour Fisterra y Costa da Morte` (3 líneas)—. El día que uno de esos se retire del catálogo,
seis expedientes empiezan a cobrar algo que no se ve.

**Propuesta (no se toca: es dinero):** que la tarjeta pinte también las líneas contratadas
que ya no están en el catálogo, marcadas como «retirado del catálogo» y con su casilla para
poder quitarlas; o que desactivar un opcional avise de cuántas cotizaciones vivas lo tienen
antes de hacerlo. Lo primero es lo barato y resuelve el caso.

### [MENOR] Al borrar un hotel, el respaldo que debería salvar la documentación está vacío — `travelDocs/render.ts:150-166` · `travelDocActions.ts:126-137`

`quote_hotels.hotel_id` es `ON DELETE SET NULL` y está bien elegido: borrar un hotel del
catálogo **no** destruye las noches ya montadas. El código lo explica
(`hoteles/actions.ts:84`: «así que la documentación ya generada no se rompe») y la
confirmación de la pantalla es honesta: «Las noches que lo usaban quedarán sin hotel
asignado».

El plan B está escrito: `render.ts` lee cada campo con respaldo a la copia guardada en la
propia noche —`hotel_name: h?.name || n.hotel_name`, `address: h?.address || n.address`,
`phone: h?.phone || n.contact`—. La idea es exactamente la correcta.

**El problema es que ese respaldo no se rellena.** `saveTravelNights` inserta once campos
—`day`, `night_date`, `stage_label`, `km`, `city`, `hotel_id`, `room_label`, `regimen`,
`notes`, `position`, `quote_id`— y **no escribe `hotel_name`, `address` ni `contact`**
(`travelDocActions.ts:126-137`). Medido en producción:

| | filas |
|---|---|
| noches en `quote_hotels` | 12 |
| con `hotel_id` (las del módulo nuevo) | 6 |
| con `hotel_name` (las viejas, de texto libre) | 6 |
| con `address` | **0** |
| con `contact` | **0** |

O sea que las columnas de respaldo están llenas exactamente en las noches que **no** las
necesitan (las viejas, que no tienen `hotel_id` que se pueda anular) y vacías en las seis que
sí. Si se borra un hotel del catálogo y luego se **regenera** el Documento de Viaje, esa
noche sale sin nombre de alojamiento, sin dirección y sin teléfono — las tres cosas que el
peregrino necesita a las siete de la tarde en un pueblo que no conoce.

Va como MENOR porque hace falta borrar un hotel **y** regenerar el documento: el PDF ya
generado en Storage no cambia solo. **Propuesta:** que `saveTravelNights` copie
`hotel_name`, `address` y `contact` del hotel elegido al guardar la noche. Es una foto fija
del mismo estilo que la del precio de los opcionales, y hace que el respaldo que ya está
escrito en `render.ts` funcione de verdad.

### [MENOR] El mensaje de «no se puede borrar» dice lo contrario de lo que pasa — `src/lib/errors.ts:26`

La base **sí** protege lo importante: `quotes.route_id` es `NO ACTION`, así que Postgres
rechaza borrar una ruta que tenga cotizaciones. Hoy eso protege a 5 rutas (`Francés desde
Sarria` con 5 cotizaciones, `Portugués desde Tui` con 3, `Francés Bici Ponferrada` con 2,
`Costero desde Baiona` y `Costero desde Porto` con 1 cada una).

Lo que falla es lo que se lee. `deleteRoute` no comprueba nada antes: deja que la base
rechace y traduce el error con `mensajeError()`, que para el código `23503` devuelve:

> «No se puede completar: **hay un dato relacionado que no existe**.»

Ese texto describe el caso contrario —insertar un hijo cuyo padre no existe— y no el que
acaba de ocurrir, que es **borrar un padre que todavía tiene hijos**. Quien lo lee se pone a
buscar un dato que falta, cuando lo que pasa es que la ruta está en uso por cinco
cotizaciones. Y aplica igual a `quotes.client_id`, que es `ON DELETE RESTRICT`: intentar
borrar un cliente con cotizaciones da el mismo mensaje engañoso.

**Propuesta:** partir el `23503` en dos según la operación, o —más simple y más útil— que
`deleteRoute` cuente las cotizaciones antes de borrar y devuelva «No se puede borrar
«Francés desde Sarria»: tiene 5 cotizaciones. Desactivala en vez de borrarla», que es la
acción correcta y ya existe el campo `active`.

### [MEDIO] La fianza de la bici se anuncia en la cotización y desaparece en el contrato — `quotePdf.tsx:924-930` vs `src/lib/contracts/**`

La fianza del alquiler es plata real que el peregrino tiene que poner y que hay que
devolverle. En la **cotización** está tratada con un cuidado que se agradece: va **fuera** del
recuadro del total, en un cuadro ámbar, calculada **por bicicleta** y no por línea ni por
persona, y con el texto exacto:

> «Fianza del alquiler: N × X € = Y € — **adicional al total y reembolsable**»

Además dispara las condiciones de alquiler en el PDF, y BayMax la explica en su expediente
(`agentQuoteStatus.ts:109-116`: «la fianza NO entra al total, se cobra y se devuelve aparte»).

**El contrato no la menciona.** Buscada la palabra en `src/lib/contracts/template.ts` y
`src/lib/contracts/contractPdf.tsx`: **cero apariciones en los dos**. El documento que la
persona firma —el que fija qué se paga, cuándo y con qué condiciones— no dice que además
tendrá que dejar una fianza, ni de cuánto, ni cuándo se le devuelve, ni de qué se le puede
descontar.

Qué se rompe: el día que una bici vuelva con un golpe y haya que retener parte de la fianza,
la agencia no tiene base contractual para hacerlo, y el cliente no tiene nada firmado que le
garantice la devolución. Es el punto de fricción clásico de un alquiler y está fuera del
único documento que lo podría resolver. Y ojo con la asimetría: el cliente **sí** lo leyó en
la cotización, así que sabe que existe; lo que no hay es acuerdo sobre sus condiciones.

**Honestidad sobre el caso:** hoy hay 2 cotizaciones de bici (`Francés Bici Ponferrada`) y
ninguna ha llegado a contrato firmado, así que no ha mordido.

**Propuesta (no se toca: es texto legal y lo decide Nico, seguramente con quien redactó el
contrato):** una cláusula de fianza en `contractClauses()` que se incluya solo cuando la
cotización lleve líneas de bici —el contrato ya sabe variar por plan de pago, así que la
maquinaria de secciones condicionales existe— con importe, momento de entrega, plazo de
devolución y causas de retención. Las cinco condiciones de alquiler que ya están escritas en
`CONDICIONES_ALQUILER` (`quotePdf.tsx:752-761`) son el borrador.

### [MENOR] Dos de las tres rutas de bici no tienen tarifa de bici — `comercial.bike_prices`

La matriz es **7 bicicletas × 3 rutas × 2 años = 42 combinaciones**, y las 42 filas existen.
Con precio hay **6**: las 6 bicis con tarifa de `Francés Bici Ponferrada` **2026**. Todo lo
demás tiene `price_pilgrim` y `price_cs` en `null`:

| ruta | 2026 | 2027 |
|---|---|---|
| Francés Bici Ponferrada | **6 de 7** con precio | 0 |
| Portugués Bici Oporto | **0** | 0 |
| Primitivo Bici Oviedo | **0** | 0 |

Que 2027 esté vacío es **deliberado y está anotado en el proyecto**: faltan las tarifas que
tiene que mandar Pilgrim. No lo cuento como hallazgo. Lo que sí lo es: **`Portugués Bici
Oporto` y `Primitivo Bici Oviedo` no tienen tarifa de bici para 2026 tampoco**, y son
exactamente las dos rutas que B5.3 encontró publicadas en la web sin una sola etapa cargada.

O sea que hoy un visitante puede cotizar por la web un camino **en bici** de 240 o 311 km,
recibir un PDF sin itinerario, y cuando llegue el momento de elegir la bicicleta —que es lo
que da nombre a la ruta— el CRM responderá «Esa bicicleta no tiene tarifa 2026 para esta
ruta. Cargala en el catálogo». El producto está a la venta con sus dos piezas centrales
vacías.

**El código se porta bien**, y por eso es MENOR y no más: `alternarBici` y
`crearCotizacionConBici` comprueban `price_cs` **antes** de insertar nada
(`bikeQuote.ts:109,178`) y devuelven un error que dice exactamente qué falta y dónde
cargarlo. No se cotiza una bici a cero ni se cae al año anterior. **Propuesta:** la misma que
en B5.3 —cargar los datos, o despublicar esas dos rutas mientras tanto.

### [MENOR] `optional_services` arrastra dos columnas de precio que ya no lee nadie — `comercial.optional_services.price_cs`, `.price_pilgrim`

El precio de un opcional vive en `optional_prices`, por año (migración 0019). Pero
`optional_services` conserva sus columnas `price_cs` y `price_pilgrim` de antes de esa
migración, y quedaron a medio camino:

- En **14 de los 16** opcionales tienen valor, y coincide exactamente con el precio 2026 de
  `optional_prices`.
- En los **2 más nuevos** —`Casco de bicicleta` y `Seguro a todo riesgo para la bicicleta`,
  del módulo de bicis de agosto— están en **`null`**, porque ya se crearon con el modelo por
  año.

Lo comprobé y **hoy no las lee nadie**: los cinco sitios que consultan opcionales
(`api/wp/pricing`, `api/agente/catalogo`, `catalogo/actions`, `seguimiento/[id]/page` y
`optionals.ts`) hacen todos el join a `optional_prices`. Así que no hay ningún fallo activo.

Lo anoto porque es una trampa bien puesta para el siguiente: son dos columnas con el nombre
correcto, en la tabla correcta, con datos que parecen buenos en 14 de 16 filas. Quien las use
por descuido tendrá precios plausibles casi siempre y **cero en los dos opcionales de bici**,
que es el peor modo de fallo posible. **Propuesta:** borrarlas, o dejarlas con un comentario
de columna que diga que son históricas.

### [MEDIO] Tres rutas publicadas en la web se venden sin itinerario — `comercial.route_stages` (dato, no código)

La tarea apuntaba a las dos rutas de bici. Son **cuatro** las rutas activas sin una sola
etapa cargada, y **tres están publicadas en el cotizador público** (`web = true`):

| ruta | modalidad | web | días/noches | km | etapas |
|---|---|---|---|---|---|
| **Portugués Bici Oporto** | bici | **sí** | 7 / 6 | 240 | **0** |
| **Primitivo Bici Oviedo** | bici | **sí** | 9 / 8 | 311 | **0** |
| **Portugués desde Vigo** | senderismo | **sí** | 7 / 6 | 100 | **0** |
| Espiritual desde Tui | senderismo | no | 8 / 7 | 146 | **0** |

`Portugués desde Vigo` no estaba en el enunciado y es la que más llama la atención: es una
ruta a pie, publicada, con tarifas 2026 completas y sin itinerario.

**Qué sale, renderizado de verdad** (PDF generado con los datos reales de `Portugués Bici
Oporto`, 2 personas, salida 2-nov-2026):

- El cuadro de arriba sale **correcto y honesto**: «7 días · 6 noches», «240 km», dificultad
  «Media» y un **«—» en ETAPAS** en vez de un cero o un hueco. Las fechas también cuadran
  («2 – 8 de Noviembre 2026»), porque sin etapas el cálculo cae en `route.days`, que aquí sí
  coincide.
- La sección Itinerario dice: *«Itinerario detallado en preparación. Te lo enviamos confirmado
  al reservar.»* Es una frase escrita a propósito para este caso, no un fallo.
- El resto de la página queda en blanco: el documento pierde su parte más vendedora.

**Y el prellenado de la documentación también avisa bien**: `prefillTravelNights` corta con
«La ruta no tiene etapas con alojamiento cargadas en el catálogo»
(`travelDocActions.ts:53`), en vez de proponer una lista vacía.

**O sea que no hay ningún hallazgo de código: el hallazgo es comercial.** Hoy un visitante
puede cotizar y comprar por la web un Primitivo en bici de 9 días y 311 km —una ruta de
1.000 € largos— y recibir una oferta cuyo itinerario dice «en preparación». El itinerario
etapa por etapa es lo que se está vendiendo, y en tres de las once rutas publicadas no
existe. Después, al preparar su documentación de viaje, habrá que teclear las 6 u 8 noches a
mano porque el prellenado no puede ayudar.

Ninguna de las cuatro tiene cotizaciones todavía, así que **no ha mordido**. Pero están
publicadas, con precio, y son cotizables hoy.

**Propuesta:** cargar las etapas de las cuatro (es dato, no código), y mientras tanto quitar
el `web = true` de las tres publicadas para que no se puedan cotizar desde fuera. Y, para que
no vuelva a pasar, un aviso en `/catalogo` en la ruta que esté publicada con cero etapas —del
mismo estilo que el que propongo para el año de tarifa incompleto.

### Lo que sí está bien: el módulo de hoteles y lo que la base protege

**Los hoteles**, aunque el módulo sea reciente, están impecables como dato: **6 hoteles, los
6 activos, los 6 con fotos, ciudad, dirección y teléfono**, ningún nombre repetido y ninguna
ciudad repetida — así que el caso de «dos hoteles en la misma localidad, gana el primero» que
el código contempla no se da hoy.

- **El emparejador de localidades está mejor pensado de lo que parece, y lo verifiqué
  ejecutándolo.** Mi primer cruce en SQL con `lower(btrim())` decía que `Pensión Rosella`
  («O Pedrouzo (O Pino)») no casaba con ninguna etapa («Pedrouzo»). **Me equivocaba yo, no el
  código**: `normalizarLugar()` quita tildes, paréntesis y el artículo gallego o castellano
  inicial, así que las dos cadenas normalizan a `pedrouzo` y casan. Probado con la función
  real: «Pedrouzo» → Pensión Rosella. La cabecera del archivo explica por qué existe: «con
  igualdad exacta, dos de las seis noches del Sarria → Santiago se quedaban sin hotel».
- **Y se niega a adivinar de más**: nunca hace «contiene» a secas, solo exacto o prefijo en
  cualquiera de los dos sentidos, con el motivo escrito: «una propuesta mala es peor que
  ninguna, **porque se acepta sin mirar**». Es la clase de criterio que separa una sugerencia
  útil de una trampa.
- **La cobertura del prellenado, medida con la función real** sobre las 275 noches con
  localidad de las rutas activas: **71 (26 %)**. Pero el reparto no es casual: `Francés desde
  Sarria` está al **6 de 6**, `Melide` al 6 de 7, y todas las variantes largas del Francés
  reciben las mismas 6 propuestas porque comparten el tramo final. El catálogo se sembró
  para la ruta que más se vende y ahí está completo; lo demás llegará. No es un defecto, es
  un módulo a medio poblar, y conviene que el número quede escrito para saber desde dónde se
  avanza.

**Lo que la base protege, y lo que no** (mapa completo de claves foráneas del catálogo):

| relación | `ON DELETE` | efecto |
|---|---|---|
| `quotes.route_id` | **`NO ACTION`** | **no se puede borrar una ruta con cotizaciones** ✔ |
| `quotes.client_id` | `RESTRICT` | no se puede borrar un cliente con cotizaciones ✔ |
| `pricing.route_id`, `route_stages.route_id` | `CASCADE` | borrar una ruta se lleva sus precios y etapas ✔ |
| `bike_prices.bike_id` / `.route_id`, `optional_prices.optional_id` | `CASCADE` | idem, correcto |
| `quote_hotels.hotel_id` | `SET NULL` | la noche sobrevive al borrado del hotel ✔ |
| `route_catalogs.route_id`, `welcome_letters.route_id` | `SET NULL` | el documento sobrevive ✔ |

**El hueco a nombrar: `quote_lines.reference_id` no es clave foránea de nada.** Es la columna
que apunta al opcional o a la bici de cada línea, y no puede serlo porque apunta a **dos**
tablas distintas según el `type` — es una referencia polimórfica, y la solución elegida
(guardar el id suelto y filtrar siempre por `type`) es razonable. Pero hay que ser consciente
de lo que se pierde: la base **no impide** borrar un opcional o una bici que estén cotizados,
ni deja rastro de que la línea quedó apuntando al vacío. Que la línea sobreviva es lo
correcto —lleva su propio precio congelado y su descripción— pero es el mismo hueco que el
hallazgo de los opcionales desactivados: **la protección aquí no la da la base, la tiene que
dar la pantalla**, y hoy no la da.

### Lo que sí está bien: el módulo de bicis es el mejor cerrado del catálogo

- **La fianza no contamina el total.** Se calcula aparte (`fianzaTotal = bikeUnits ×
  FIANZA_POR_BICI_EUR`), sale del recuadro del total y va en ámbar, con el comentario que
  explica por qué: «es plata que el peregrino [pone] … adicional al total y reembolsable». Y
  la unidad de cálculo es la correcta: **por bicicleta**, con el comentario advirtiendo de los
  dos errores fáciles («no por línea ni por persona»).
- **El año de la tarifa de bici es coincidencia exacta, sin respaldo, y está argumentado**:
  «una bici de 2027 cotizada con tarifa 2026 es plata perdida en cada reserva, y acá sí hay
  dónde teclear el precio». Es la decisión contraria a la de `/cotizar` y aquí es la correcta,
  porque el alquiler es un costo directo sin margen que lo absorba.
- **Los dos caminos comprueban el precio antes de escribir**, con mensajes accionables que
  nombran la bici, el año y dónde cargarlo.
- **El encadenado por `parent_quote_id` está bien hecho**: `crearCotizacionConBici` copia la
  cotización madre, arrastra sus opcionales, **borra la nueva si algo falla**
  (`bikeQuote.ts:248-252`) y el expediente pinta el «← Viene de CS-… / Continúa en CS-… →».
  B1 ya lo señaló como el patrón que le falta al asistente, y B2/B3 confirmaron que
  `quotes.parent_quote_id` es `ON DELETE SET NULL`, así que borrar la madre no arrastra a la
  hija. La cadena está cerrada por los dos extremos.
- **Desmarcar una bici filtra por `type='bike'`**, «a propósito … `reference_id` es la única
  llave que comparten» con los opcionales: quitar una bici no puede borrar un opcional con el
  mismo id.
- **La regla de margen de las bicis es la suya** (`pilgrim ÷ 0,85`, sin el suelo de 100 € de
  las rutas) y el código advierte de no confundirlas. Verificado en B5.2: las 7 filas con
  precio cumplen la regla y ninguna va bajo costo.

### Lo que sí está bien: el modelo de opcionales por año está bien resuelto

- **El precio se congela en la línea.** `alternarOpcional` copia `price_cs` y `price_pilgrim`
  a `unit_price` y `cost_unit` de la línea (`optionals.ts:47-48`), con el motivo escrito: «el
  precio queda como snapshot en la línea, así que cambiarle la fecha después no la re-tarifa
  sola». Es lo correcto: repreciar el catálogo **no** mueve lo ya cotizado.
- **El año de referencia se elige por la salida y el respaldo se avisa.** Usa
  `optionalPricesForYear(filas, quoteYear(start_date))` con caída al año anterior, y la
  tarjeta lo dice en ámbar con enlace al catálogo de ese año (`OptionalsCard.tsx:92,113`). Eso
  importa porque **ninguno de los 16 opcionales tiene precio 2027 cargado**: las 12
  cotizaciones de 2027 que existen añadirían opcionales a precio de 2026, pero **avisando**,
  que es la diferencia con el caso de las rutas de B5.1.
- **Si no hay precio en ningún año, no se inserta nada** y el mensaje dice qué hacer: «Ese
  opcional no tiene precio cargado en ningún año. Cargalo en el catálogo.»
- **La unidad decide la cantidad, y las unidades están bien puestas.** `isPerPerson` mira si
  la unidad contiene «persona» y usa `people`; el resto arranca en 1. Repasadas las 16
  unidades reales (`por persona`, `por noche`, `por unidad`, `por vehículo`), todas encajan
  con esa regla: los tres traslados son `por vehículo` (1 por defecto, correcto), las noches
  extra `por noche`, y los tours `por persona`.
- **Desmarcar acota por `reference_id` y por tipo**, y las líneas de bici y de opcionales
  llegan a tarjetas distintas con el motivo escrito: «mezclarlas haría que desmarcar en una
  borrara líneas de la otra» (`page.tsx:159-161`). Es un error que ya alguien previó.

Queda dicho aparte, porque es del mismo hallazgo de B2 y no lo repito aquí: cambiar el número
de personas **no** re-cuantifica las líneas «por persona» ya contratadas.

### Lo que sí está bien: los itinerarios que existen están completos y bien formados

Comprobado sobre las 27 rutas activas:

- **Todas las rutas con etapas tienen exactamente las noches que dicen tener.** Crucé
  `routes.nights` contra el número de etapas con `accommodation`, que es el criterio que usa
  el prellenado (`travelDocActions.ts:51`: «una noche por etapa CON alojamiento; las etapas
  de "fin de servicios" no lo traen»). En las 23 rutas con itinerario cargado, **la cuenta da
  exacta en las 23**: cero descuadres. Ese era el fallo silencioso que fui a buscar —una ruta
  que propusiera 5 noches para un viaje de 7— y no existe.
- **El patrón «N+1 etapas, N con alojamiento» se respeta sin excepción**: cada ruta tiene una
  etapa más que noches, que es la de fin de servicios. La disciplina de carga del catálogo es
  buena.
- **Los tres consumidores de las etapas degradan bien cuando faltan**: el PDF (mensaje en vez
  de tabla vacía), el prellenado (error explícito) y el cuadro de estadísticas («—»). Ninguno
  imprime un cero, un `undefined` ni una tabla con cabecera y nada debajo.

### [MENOR] La bitácora del catálogo dice qué cambió pero no quién, en 40 de 67 entradas — `comercial.pricing_history` · trigger `pricing_audit`

El catálogo es lo único de la plataforma con bitácora de precios de verdad, y está bien
montada: un **trigger de base de datos** (`pricing_audit AFTER UPDATE … log_price_change()`),
no una llamada desde la aplicación. Eso significa que **ningún camino la puede puentear** — ni
el asistente, ni la pantalla, ni el SQL Editor. Guarda campo, valor viejo, valor nuevo y
fecha, para `price_cs` y `price_pilgrim`. Hoy tiene 67 filas entre el 1-may y el 1-sep.

Lo que falta es la columna `changed_by`: **está vacía en 40 de las 67**. Y no es aleatorio:
se llena cuando el cambio llega con una sesión de usuario, y queda nula cuando llega por el
cliente de servicio o por el **SQL Editor** — que es exactamente como la GUIA dice que se
cambian los precios y los suplementos. O sea que la mitad larga de los cambios de precio del
histórico no se pueden atribuir a nadie, y son justo los que se hicieron por el camino
recomendado.

Es MENOR porque el *qué* y el *cuándo* sí están, que es lo que salva un descuadre; y porque
para dos personas la pregunta «¿quién?» tiene dos respuestas posibles. Lo anoto porque es el
mismo hueco del punto 7 de CRITERIOS que B1 levantó para `quotes` y B2 para los pagos, y aquí
la infraestructura ya existe: solo le falta rellenarse. **Propuesta:** que los cambios por SQL
Editor se hagan con un `set local` de identidad, o —más simple— que la pantalla de catálogo
sea el único camino y el `changed_by` salga de la sesión.

### Lo que sí está bien: los márgenes, y la regla que los sostiene

La respuesta a la pregunta directa de la tarea es **no, ninguna tarifa quedó vendiéndose por
debajo del costo**. Barridas las tres tablas de precio, fila a fila:

| tabla | filas con costo | a costo o por debajo | margen mínimo |
|---|---|---|---|
| `pricing` (rutas) | 51 | **0** | 14,9 % |
| `optional_prices` | 16 | **0** | 21,9 % |
| `bike_prices` | 7 | **0** | 15,0 % |

- **Hay dos reglas de markup y están bien separadas**, cada una con su comentario advirtiendo
  de la otra: las rutas usan `max(pilgrim + 100, pilgrim / 0.85)` —un suelo de 100 € que
  protege las rutas baratas, donde un 15 % no paga el trabajo— y las bicis usan `pilgrim / 0.85`
  a secas, «NO es la regla de las rutas» (`catalogo/actions.ts:207-210`). Confundirlas era el
  error fácil y está explícitamente prevenido.
- **La aplicación masiva avisa de lo que hace**: el botón dice literalmente «Aplicar
  `max(Pilgrim+100, Pilgrim÷0.85)` a todas las filas {year} con precio Pilgrim. **Sobrescribe
  los precios CS actuales de {year}**» (`PricingTable.tsx:145`). No hay sorpresa, y como el
  trigger registra cada cambio, un masivo mal dado se puede reconstruir desde
  `pricing_history`.
- **Las 4 filas que no cumplen la regla no son un descuido, son redondeo comercial**, y
  conviene dejarlo dicho para que nadie las «corrija»:

  | ruta | año | modalidad | según la regla | precio real | margen |
  |---|---|---|---|---|---|
  | Francés desde Sarria | 2027 | pension_doble | 602 | **590** | 14,9 % |
  | Francés desde Sarria | 2027 | pension_single | 791 | **790** | 14,9 % |
  | Francés desde Sarria | 2027 | hotel_single | 911 | **910** | 14,9 % |
  | Camino a Fisterra | 2026 | pension_single | 545 | **543** | 18,0 % |

  Son de 1 a 12 € por debajo, y las tres primeras son precios redondos (590, 790, 910). Es
  alguien bajando a la cifra bonita, no un error de cálculo. El único efecto es que el margen
  queda en 14,9 % en vez de 15 %.
- **El costo del proveedor no cruza al navegador** en el cotizador público: `cotizar/page.tsx`
  selecciona solo `price_cs` y lo dice («`price_pilgrim` (costo del proveedor) jamás cruza al
  navegador»), y los suplementos del lado Pilgrim se ponen en 0 antes de pasar al componente
  «de lo contrario viajarían en el HTML». Ese es el fallo clásico de un cotizador y aquí está
  cerrado a conciencia.

### [MENOR] Un año cargado a medias no avisa a quien carga los precios — `comercial.pricing`, `Portugués desde Tui` 2027

`Portugués desde Tui` tiene las tarifas 2027 de `pension_doble` y `pension_single` y **no**
las de hotel. El motor lo resuelve bien de cara al cliente (409 con mensaje claro), así que
no se cobra mal; pero de cara a quien administra el catálogo, **nada indica que ese año quedó
incompleto**. La pantalla de precios muestra lo que hay, y «hay tarifas 2027» y «hay *todas*
las tarifas 2027» se ven igual.

Con 11 rutas × 4 modalidades × 2 años son 88 celdas que hoy se vigilan a ojo, y el modo de
fallo es que un cliente pida hotel y reciba un «no disponible» por un hueco que nadie sabía
que estaba. **Propuesta:** en `/catalogo`, marcar en ámbar la ruta cuyo año tenga menos de
las cuatro modalidades, y un contador arriba del estilo «2027: 2 de 11 rutas completas». Es
lectura, no toca dinero.

---

## Arreglos aplicados

_(Solo lo pequeño y reversible. Un commit por arreglo.)_

---

## Crítica del experto

`Estado: hecho` — crítico independiente (tercer intento; los dos primeros murieron por el
límite de gasto, el primero antes de escribir nada). Los cinco puntos del plan están cerrados
y cada uno tiene su conclusión escrita:

1. Rehacer contra producción los **cuatro números** del bloque: 2 de 11 rutas con tarifa 2027;
   cero tarifas a costo o por debajo en 74 filas; 26 % de cobertura de hoteles con 6/6 en
   Sarria; 4 rutas activas sin etapas (3 publicadas).
2. Recalcular la cobertura de hoteles **ejecutando `hotelParaLugar`** con los datos reales,
   no con SQL equivalente.
3. Juzgar dos etiquetas: el **MEDIO de la fianza** ausente del contrato y el **MENOR de
   `errors.ts`** (¿es B5 o B6?).
4. Buscar el **GRAVE que falta**: qué pasa hoy de verdad al cotizar una salida de 2027 en una
   ruta sin tarifa de ese año, por cada puerta de entrada (`/cotizar`, asistente, WP, agente).
5. Contra `CRITERIOS.md` punto 8: qué trae de serie un CRM de agencia en catálogo, tarifas y
   proveedores que aquí falte.

Cerrado el 2-sep-2026: (1) números rehechos contra producción, (2) cobertura recalculada
ejecutando `hotelParaLugar`, (3) las dos etiquetas juzgadas, (4) las cuatro puertas recorridas
una por una, (5) el oficio medido contra el esquema. Veredicto al final.

---

### [MEDIO] La protección de borrado que el bloque da por buena cubre 12 de las 45 cotizaciones — `comercial.quotes.route_id` · `travelDocActions.ts:41`

La sección «Lo que la base protege» es la parte del bloque que más confianza transmite y es
donde más flojea, porque **está medida sobre el esquema y no sobre los datos**. La tabla de
claves foráneas es correcta: `quotes.route_id` es `NO ACTION` y Postgres rechaza borrar una
ruta que tenga cotizaciones. Lo que no se comprobó es cuántas cotizaciones tienen esa columna
llena.

**En producción, `route_id` está en `NULL` en 33 de las 45 cotizaciones.** El enlace real entre
un expediente y su ruta es, en el 73 % de los casos, **el texto de `route_name`**:

| ruta | cotizaciones | con `route_id` | **solo por nombre** |
|---|---|---|---|
| Francés desde Sarria | 21 | 5 | **16** |
| Portugués desde Tui | 8 | 3 | **5** |
| Costero desde Baiona | 4 | 1 | **3** |
| Frances desde Sarria 6 etapas (Melide) | 2 | **0** | **2** |
| Portugués desde Porto | 1 | **0** | **1** |
| Francés desde Saint Jean Pied de Port | 1 | **0** | **1** |
| Camino Portugués – Viana do Castelo (personalizada) | 1 | **0** | **1** |
| *«Portugues desde Tui»* (sin tilde, **no existe en el catálogo**) | 1 | **0** | **1** |
| *(sin `route_name`)* | 3 | 0 | — |
| Francés Bici Ponferrada | 2 | 2 | 0 |
| Costero desde Porto | 1 | 1 | 0 |

Tres consecuencias, todas comprobables:

1. **Cuatro rutas con cotizaciones se pueden borrar hoy sin que la base diga nada**, porque
   ninguno de sus expedientes tiene `route_id`: las dos del «6 etapas (Melide)», `Portugués
   desde Porto`, `Saint Jean` y la personalizada. La pantalla no avisa (ése es el MENOR de
   `errors.ts`) **y la base tampoco**, porque no hay a qué agarrarse. El bloque dice «la base
   sí protege lo importante»; lo correcto es «la base protege las 12 cotizaciones que tienen
   la columna llena, y hay 33 que no».
2. **Renombrar una ruta rompe sus expedientes en silencio.** `updateRoute` actualiza
   `routes.name` y **no toca `quotes.route_name`** (`catalogo/actions.ts`, `updateRoute`), y
   `prefillTravelNights` busca la ruta así: `.from("routes").eq("name", quote.route_name)`
   (`travelDocActions.ts:41`) — **por nombre, teniendo `quotes.route_id` a mano**. Renombrar
   `Frances desde Sarria 6 etapas (Melide)` —que tiene la falta de ortografía a la vista y es
   justo lo que uno arregla un martes por la tarde— deja sus dos expedientes sin prellenado de
   documentación: «No encontré la ruta en el catálogo».
3. **Ya hay un huérfano real, no hipotético:** una cotización con `route_name = "Portugues
   desde Tui"`, sin tilde, que no casa con ninguna ruta. Ese expediente **no puede prellenar su
   Documento de Viaje hoy**, y el mensaje que da no dice que el problema es una tilde.

Es el incumplimiento más claro del «un dato, un sitio» de `CRITERIOS.md` en todo el bloque, y
además el punto 8: la ruta —que es el producto— se referencia como texto libre.

**Propuesta (dato + código pequeño, pero lo dejo anotado porque toca expedientes vivos):**
(a) rellenar `route_id` en las 33 cotizaciones cruzando por nombre, y arreglar a mano la de la
tilde; (b) que `prefillTravelNights` use `quote.route_id` y caiga al nombre solo si es `NULL`
—dos líneas, y es lo que ya hizo `pdf.ts` según el commit `adc6466`: «el asistente ahora
escribe `route_id` y `pdf.ts` ya no depende de resolver la ruta por nombre»; el prellenado se
quedó atrás—; y (c) una vez rellenada la columna, la protección de borrado que el bloque
celebra empieza a ser verdad.

### [MEDIO] Cuando la tarifa se queda en el año viejo, el **costo** también: la utilidad del tablero es ficción — `cotizar/actions.ts:110-114` · `seguimiento/page.tsx:80`

El bloque midió bien lo que se dejó de cobrar (−400 € en CS-2026-064) pero se quedó en la mitad
del daño. `cost_base_eur` se congela **de la misma fila de tarifa vieja**
(`costBaseEur = price_pilgrim × personas`), y ese costo es el que el tablero usa para la
utilidad: `utilidad: total - (q.cost_eur || 0)` (`seguimiento/page.tsx:80`). O sea que la
cotización no solo se vendió barata: **se vendió barata y encima parece rentable**.

CS-2026-064, con los números reales de `pricing` (2026 → 2027 de `Francés desde Sarria`,
`hotel_doble`: costo Pilgrim **515 → 608**):

| | lo que dice el CRM | lo que va a pasar |
|---|---|---|
| venta | 2.780 € | 2.780 € |
| costo Pilgrim | 2.260 € *(515×4 + 50×4)* | **2.632 €** *(608×4 + 50×4)* |
| **utilidad** | **520 € — 18,7 %** | **148 € — 5,3 %** |

El tablero muestra **3,5 veces la utilidad** que ese viaje va a dejar, y lo suma al total de
`/seguimiento`. Eso no es un aviso que pasa desapercibido: es un número que dice lo contrario
de la verdad justo en la pantalla que se usa para decidir. Es el punto 4 de `CRITERIOS.md`
—«los números cuadran solos… margen real»— roto por el mismo mecanismo que el punto 1.

**Propuesta (no se toca: es dinero):** el arqueo que el propio bloque propone en su punto (c)
debe comparar **las dos cifras, precio y costo**, contra el catálogo del año de salida; y
mientras la cotización esté viva, el costo debería poder re-resolverse al año correcto aunque
el precio al cliente no se mueva — es la cifra interna, no la que el cliente firmó.

### Ajuste de altura al hallazgo del año de la tarifa: la puerta que el bloque señala no ha cotizado nunca

Esto no le quita valor al hallazgo, pero sí le cambia el tamaño, y conviene que esté escrito
antes de que alguien priorice por él. El bloque dice: «`/cotizar` **no** [se porta bien]: usa
`ratesForYearWithFallback` y cobra con la tarifa del año anterior… hoy eso aplica a **9 de las
11 rutas web**». Comprobado contra los datos:

- **`/cotizar` no ha creado ni una sola cotización.** Las 45 se reparten en
  `interna` **39**, `wordpress` **5**, `baymax` **1**; `source = "web"`, que es lo único que
  escribe `cotizar/actions.ts:165`, aparece **cero** veces en cinco meses.
- **La puerta que sí cotiza desde fuera ya está arreglada.** `webQuote.ts` pasó a `tarifarRuta`
  con **año exacto** y hoy escribe `price_note: null` con el motivo puesto: «estas cotizaciones
  son siempre con la tarifa del año de salida». Una salida 2027 sin tarifa devuelve **409
  `sin_tarifas_ano`**, no un precio viejo.
- Por eso **los −400 € y los −80 € de CS-2026-064 y ‑065 son daño ya ocurrido, de agosto, bajo
  el código anterior** (el `price_note` de fallback lo escribía `webQuote` desde `adc6466`), no
  una hemorragia abierta.

Lo que queda vivo del hallazgo, y sigue siendo un MEDIO bien puesto, es **el rastro**: 10 de
las 12 cotizaciones de 2027 no dejan constancia de con qué año se calcularon, y `price_note`
solo se ve dentro del PDF. Mantengo la etiqueta. Lo que corrijo es la lectura de urgencia: el
riesgo vivo no está en `/cotizar` —que nadie usa— sino en **lo tecleado a mano en el CRM**, que
es de donde salen 39 de las 45.

### [MENOR] `price_note` se escribe una vez y no se corrige nunca: una de las dos que existen ya miente — `cotizar/actions.ts:167`

`price_note` aparece en cuatro sitios del código y **solo uno lo escribe**: la creación en
`/cotizar`. Nadie lo actualiza ni lo borra al editar el precio en el expediente. Ya se nota:
**CS-2026-065** tiene hoy `cost_base_eur = 2.432 € = 608 × 4`, que es el **costo Pilgrim de
2027** —o sea que alguien la re-tarifó a mano y bien—, y sin embargo conserva la nota:

> «Precio de referencia **2026**. Para salidas en 2027 queda sujeto a confirmación.»

Si se regenera el PDF, el cliente recibe un documento cuyo precio ya es del año correcto y cuyo
pie sigue diciendo que es una referencia del año anterior sujeta a confirmación. Es MENOR
porque juega a favor del cliente y no cuesta plata, pero va en dirección contraria al punto 7
de `CRITERIOS.md`: el rastro que el propio bloque reclama solo sirve si se mantiene.
**Propuesta:** que guardar el precio a mano borre la nota, o —mejor, y es la propuesta (a) del
propio bloque— que se guarde el **año de tarifa usado** como dato y la nota se derive de él.

---

## Las dos etiquetas que me pidieron juzgar

### La fianza de la bici ausente del contrato: **MEDIO → MENOR**

Bajo la etiqueta, y el argumento es de dato, no de criterio. El bloque se apoya en que «el
cliente **sí** lo leyó en la cotización, así que sabe que existe; lo que no hay es acuerdo sobre
sus condiciones». **Eso no ha pasado nunca.** En `comercial.quote_lines` hay **6 líneas en
total, las 6 de tipo `optional`: cero líneas de tipo `bike`**. Nadie ha cotizado jamás una
bicicleta, así que ningún PDF ha impreso jamás el cuadro ámbar de la fianza —que se dibuja
solo cuando hay líneas de bici—, y ningún cliente sabe que existe. No hay asimetría, no hay
contrato firmado, y no hay nada que reclamar.

El hallazgo **sigue siendo cierto y hay que arreglarlo**, y por eso no lo borro: es deuda real
con una fecha de vencimiento clara. Pero por la vara del TABLERO —MEDIO es «se rompe en un caso
realista» y MENOR es «deuda que hoy no muerde»— esto es MENOR con una condición que conviene
escribir en el propio hallazgo: **es bloqueante antes de la primera venta de bici**, junto con
las dos cosas que tampoco están (las tarifas de bici de las otras dos rutas y sus etapas). El
módulo de bicis no está a medio auditar: está a medio nacer, y las tres cosas se cargan juntas.

### El MENOR de `errors.ts`: **se queda en B5**, con media propuesta prestada a B6

No se sale del alcance. El hallazgo se dispara borrando una ruta desde `/catalogo`, que es
territorio de B5, y **la mejor de las dos propuestas es de B5**: que `deleteRoute` cuente las
cotizaciones antes de borrar y diga «tiene 5 cotizaciones, desactivala». Eso no se toca en
`errors.ts`, se toca en `catalogo/actions.ts`, y además es la única de las dos que da la acción
correcta en vez de un texto menos malo.

Lo que sí es de B6 es la otra mitad: `mensajeError` lo usan **33 archivos**, y partir el `23503`
en dos según la operación es un cambio de plataforma que afecta a todos. Mi recomendación es
dejarlo en B5 —quien lo arregle arreglará `deleteRoute`, que es donde muerde— y que B8 lo cruce
con B6 para que el retoque del diccionario no se haga dos veces ni se pierda. Y añado un dato
que refuerza el hallazgo y que el bloque no tenía: con `route_id` vacío en 33 de 45, **hoy el
mensaje engañoso ni siquiera aparecería** en cuatro de las rutas con cotizaciones, porque el
borrado directamente no falla.

---

### Rehechos los cuatro números del bloque: tres cuadran, uno se quedó viejo en 24 horas

Los volví a sacar contra producción hoy (2-sep-2026). **Tres de los cuatro cuadran exactos** y
lo digo sin adornos, porque el bloque se lo ganó: los números de esta auditoría están medidos,
no estimados.

| lo que dice el bloque | lo que da hoy | |
|---|---|---|
| 11 rutas web, **2** con tarifa 2027, una a medias | 11 web · **2** con alguna fila 2027 · **1** con las 4 modalidades | ✔ |
| 15 rutas activas sin ninguna tarifa | **15** | ✔ |
| 12 cotizaciones con salida 2027, **2** con `price_note` | **12** · **2** | ✔ |
| **74 filas** de precio con costo, **0** bajo costo, mínimos 14,9 / 21,9 / 15,0 % | 51 + 16 + 7 = **74** · **0** · **14,9 / 21,9 / 15,0** | ✔ |
| cobertura de hoteles **26 %** (71 de 275), **6/6** en `Francés desde Sarria` | **25,8 %** (71 de 275), 6/6 | ✔ |
| **4 rutas activas sin etapas**, 3 publicadas | **5** rutas activas sin etapas, 3 publicadas | ✘ |

**El que falla, y por qué importa poco pero conviene corregirlo:** son **cinco**, no cuatro.
La que falta en la tabla del bloque es **`Norte desde Vilalba`** — activa, `web = false`, cero
etapas, cero cotizaciones — y es peor que las otras cuatro porque además tiene **`days`,
`nights` y `km` en `NULL`**: no es una ruta a medio cargar, es una ruta vacía que existe. Las
otras cuatro al menos tienen días, noches y kilómetros. No cambia la etiqueta del hallazgo
(sigue siendo MEDIO y sigue siendo dato, no código), pero la tabla debería tener cinco filas y
la propuesta debería decir «cargar las etapas de las cuatro **y decidir qué hacer con la
quinta, que no tiene ni días**».

### [MEDIO] La foto del catálogo de hoteles caducó en 24 horas: hoy son 11, y 5 de 6 localidades tienen dos — `comercial.hotels` · `travelDocActions.ts:56-59`

Esto es lo que más me interesa de mi encargo, porque no es que el auditor se equivocara: es que
midió bien y el suelo se movió al día siguiente. La auditoría cerró con «**6 hoteles**, ningún
nombre repetido y **ninguna ciudad repetida** — así que el caso de "dos hoteles en la misma
localidad, gana el primero" que el código contempla **no se da hoy**». Era verdad el 1 de
septiembre. **Hoy, 2 de septiembre, hay 11 hoteles activos**: se cargaron cinco más, todos con
`created_at` de hoy.

| localidad | hoteles hoy |
|---|---|
| Sarria | Siete en el Camino · **Pensión Sarria** |
| Portomarín | Pensión Mar · **Pensión a Casona da Ponte** |
| Palas de Rei | Pensión A Fonte · **Pensión Santirso** *(ciudad escrita «Palas de rei»)* |
| Arzúa | Pensión O Retiro · **Casona de Nené** |
| O Pedrouzo | Pensión Rosella · **Pensión Arca** *(ciudad escrita «O pedrouzo»)* |
| Santiago de Compostela | Hostal Suso |

O sea que **el caso que la auditoría dio por inexistente es hoy la norma: pasa en 5 de las 6
localidades del catálogo**. Y la exención («es una propuesta que se revisa fila por fila») la
desmiente el propio comentario del código dos archivos más allá: «una propuesta mala es peor
que ninguna, **porque se acepta sin mirar**».

**Lo grave del empate no es que haya empate, es quién lo desempata.** `prefillTravelNights`
lee los hoteles con `supabase.from("hotels").select("id,name,city").eq("active", true)` — **sin
`.order()`** (`travelDocActions.ts:56-59`). `hotelParaLugar` resuelve el empate con `.find()`,
que devuelve el primero del array; y el orden de ese array no lo decide el código, lo decide
Postgres. En una tabla de 11 filas hoy sale el orden físico —los antiguos primero—, pero
**cualquier `UPDATE` sobre una ficha puede moverla de sitio en el heap** y cambiar quién gana
sin que nadie toque una línea de código. Lo comprobé ejecutando la función real con la lista en
los dos órdenes:

```
"Sarria"      -> Siete en el Camino   |  orden inverso: Pensión Sarria      <<< CAMBIA
"Portomarín"  -> Pensión Mar          |  orden inverso: Casona da Ponte     <<< CAMBIA
"Palas de Rei"-> Pensión A Fonte      |  orden inverso: Pensión Santirso    <<< CAMBIA
"Arzúa"       -> Pensión O Retiro     |  orden inverso: Casona de Nené      <<< CAMBIA
"Pedrouzo"    -> Pensión Rosella      |  orden inverso: Pensión Arca        <<< CAMBIA
```

Las cinco cambian. Qué se rompe: el prellenado propone un alojamiento, Nico acepta la fila, y
el Documento de Viaje sale con **el nombre, la dirección y el teléfono de una pensión en la que
el peregrino no está reservado**. En `Francés desde Sarria`, que es la ruta insignia y la que
está al 6 de 6, eso son las seis noches del viaje. Es el error que más caro se paga en esta
agencia: llegar caminando a las siete de la tarde a una pensión que no te espera.

**Arreglo pequeño y reversible, pero no lo aplico porque no es mío:** basta añadir un
`.order("name")` (o `.order("created_at")`) a esa consulta para que el desempate sea al menos
**estable y explicable**. Es una línea, no toca dinero y lo dejo como propuesta para la ronda
de revisión junto al arreglo de verdad, que es: si hay más de un hotel en la localidad, **no
proponer ninguno** y marcar la fila para que se elija a mano —coherente con el criterio que el
propio archivo defiende— o dejar elegir entre los dos en la tarjeta.

**De paso, dos duplicados de escritura que el módulo no impide:** «Palas de Rei» / «Palas de
rei» y «O Pedrouzo (O Pino)» / «O pedrouzo». `normalizarLugar` los empareja bien —lo verifiqué,
los dos normalizan a `palas de rei`—, así que no rompen nada hoy; pero la ciudad es texto libre
sin normalizar al guardar, y es la llave por la que se busca. Con veinte hoteles, «Santiago» y
«Santiago de Compostela» convivirán en la tabla.

### La cobertura de hoteles: 25,8 %, verificada ejecutando la función, y el número no se movió con 5 hoteles más

Rehíce el cálculo como pedía el encargo: **ejecutando `hotelParaLugar` de verdad** (`npx tsx`
sobre `src/lib/travelDocs/lugares.ts`) contra las 275 etapas con alojamiento de las rutas
activas, no con SQL equivalente. El resultado confirma al auditor:

```
con los 6 hoteles de la auditoría : { tot: 275, hit: 71, pct: '25.8' }
con los 11 hoteles de hoy         : { tot: 275, hit: 71, pct: '25.8' }
```

Y **6 de 6 en `Francés desde Sarria`**: sus seis paradas —Sarria, Portomarín, Palas de Rei,
Arzúa, Pedrouzo, Santiago— tienen ficha. El número está bien y el método también.

Lo que añade la segunda pasada es la lectura, y va en contra de la conclusión optimista del
bloque («no es un defecto, es un módulo a medio poblar; lo demás llegará»): **el catálogo casi
se duplicó hoy y la cobertura no subió ni una noche**. Los cinco hoteles nuevos cayeron en las
mismas cinco localidades que ya estaban cubiertas. No es una crítica a quien los cargó —tener
un segundo hotel en Sarria es útil por disponibilidad—, pero sí desmonta la idea de que esto se
arregla solo con el tiempo: hay que cargar **localidades nuevas**, no más fichas en las mismas
seis. Así queda hoy el prellenado en las 8 rutas web que tienen etapas, ejecutado ruta por ruta:

| ruta web | noches con hotel propuesto |
|---|---|
| Francés desde Sarria | **6 / 6** |
| Frances desde Sarria 6 etapas (Melide) | 6 / 7 |
| Primitivo desde Lugo | 3 / 6 |
| Francés Bici Ponferrada | 2 / 5 |
| **Portugués desde Tui** (la 2ª más cotizada) | **1 / 7** |
| **Costero desde Baiona** | **1 / 7** |
| Inglés desde Ferrol | 1 / 6 |
| Camino a Fisterra | 1 / 4 |

Ese «1» de las cuatro últimas es siempre la misma noche: Santiago. Y como el catálogo crece por localidad y no por noche, el número
útil para seguirlo no es «cuántos hoteles hay» sino **«cuántas de las 275 noches tienen ficha»**
— que es exactamente el que dejó escrito el auditor, y por eso conviene que quede.

---

### [GRAVE] Un opcional con la fila del año creada y sin precio se cotiza a **0 €**, sin aviso — `lib/pricing/year.ts:78-88` · `lib/quotes/optionals.ts:34-37`

Éste es el GRAVE que le faltaba al bloque, y está justo donde la auditoría miró sin verlo.
La auditoría escribió dos veces que el modelo de opcionales por año está bien resuelto —«el
respaldo se avisa en ámbar» y «si no hay precio en ningún año, no se inserta nada»—. Las dos
frases son ciertas **solo cuando el año que falta no tiene fila**. Y en producción hay dos
opcionales que **sí la tienen, vacía**.

**El dato, medido hoy** (`comercial.optional_prices`, 18 filas):

| opcional | 2026 | 2027 |
|---|---|---|
| los otros 14 | precio | *(sin fila)* |
| **Casco de bicicleta** | 52 / 40 | **fila creada, `NULL` / `NULL`** |
| **Seguro a todo riesgo para la bicicleta** | 42 / 32 | **fila creada, `NULL` / `NULL`** |

**El código, ejecutado de verdad** (`npx tsx` sobre `optionalPricesForYear` con esas filas
reales):

```
casco 2027 => { price_pilgrim: 0, price_cs: 0, priceYear: 2027, isFallback: false }
tour  2027 => { price_pilgrim: 50, price_cs: 65, priceYear: 2026, isFallback: true }
```

La cadena es de tres eslabones, y cada uno por separado parece razonable:

1. `ratesForYearWithFallback` decide si hay tarifa del año **contando filas**, no precios:
   `const exact = ratesForYear(rows, year); if (exact.length > 0) return {…isFallback:false}`.
   Una fila con los dos precios en `NULL` cuenta como año cargado. **El respaldo no se
   dispara.**
2. `alternarOpcional` convierte los `NULL` en ceros antes de llegar ahí —
   `price_cs: Number(p.price_cs) || 0` (`optionals.ts:36`)— así que el año 2027 «tiene
   precio»: cero.
3. La guarda que debería atajarlo es `if (!precio)`, y `precio` **existe**: es
   `{price_cs: 0, price_pilgrim: 0}`. El mensaje «Ese opcional no tiene precio cargado en
   ningún año» no llega nunca.

**Qué ve Nico y qué pasa.** En cualquiera de las **12 cotizaciones vivas con salida en 2027**,
la tarjeta de opcionales pinta «Casco de bicicleta — Pilgrim 0 € — 0 €», **sin la etiqueta
ámbar «precio 2026»** que sí llevan los otros catorce (`OptionalsCard.tsx:161`, condicionada a
`isFallback`), y **sin el aviso de cabecera** por el mismo motivo. Una casilla. Al marcarla se
inserta una línea con `unit_price = 0` y `cost_unit = 0`, `recompute_quote_money()` la suma
tal cual, y esa línea viaja al PDF, al total y al correo a Pilgrim como servicio contratado.

**Cuánto cuesta.** Con las tarifas 2026 que sí están cargadas, y siendo los dos opcionales
`por persona` (así que la cantidad arranca en `people`):

| | precio CS | costo Pilgrim | 2 personas |
|---|---|---|---|
| Casco de bicicleta | 52 € | 40 € | 104 € regalados |
| Seguro a todo riesgo | 42 € | 32 € | 84 € regalados |
| **total** | | | **188 € de venta y 144 € de costo real que Pilgrim factura igual** |

Y el daño es doble, porque `cost_unit = 0` mete el costo a cero: la utilidad del expediente
sale **inflada** justo en la línea que la está destruyendo. Es el modo de fallo que la propia
auditoría nombró bien para las columnas muertas de `optional_services` —«precios plausibles
casi siempre y cero en los dos opcionales de bici, que es el peor modo de fallo posible»— y
que no vio que ya estaba ocurriendo por otra puerta.

**Honestidad sobre el caso:** barrí `quote_lines` y **hoy no hay ninguna línea a 0 €**, así
que todavía no ha mordido. Lo etiqueto GRAVE igualmente y no MEDIO por tres razones: (a) el
estado de datos que lo dispara **ya existe en producción**, no hay que hacer nada raro para
llegar —a diferencia del MEDIO del opcional desactivado, que necesita que alguien desactive—;
(b) basta **un clic** en cualquiera de las 12 cotizaciones de 2027, y son el camino normal de
trabajo de los próximos meses; y (c) falla **en silencio y hacia abajo**: no hay error, no hay
ámbar, y el número que queda mal es el que nadie vuelve a mirar. El bloque decía que su mayor
riesgo era vender 2027 con tarifa de 2026; el riesgo real es venderlo a **cero**.

**Contraste que confirma que es un descuido y no una decisión:** el módulo de bicis, para el
mismo problema y con los mismos datos, sí tiene la guarda: `if (!bike.price_cs) return {error:
"Esa bicicleta no tiene tarifa … Cargala en el catálogo."}` (`bikeQuote.ts:109,178`), y por eso
las 35 filas de `bike_prices` sin precio no cotizan nada a cero. La auditoría lo elogió en
`bike_prices` sin preguntarse por qué el gemelo de `optional_prices` no la tenía.

**Propuesta (no se toca: es dinero, y la regla del TABLERO manda anotarlo).** Tres arreglos,
del más barato al más completo:
1. En `optionals.ts:37`, cambiar la guarda a `if (!precio || !precio.price_cs)` con el mismo
   mensaje accionable que usan las bicis. Dos palabras, cierra la fuga.
2. En `year.ts`, que `ratesForYearWithFallback` **filtre las filas sin precio antes de decidir
   el año**: un año con la fila vacía debe comportarse como un año sin fila, y entonces el
   respaldo en ámbar vuelve a funcionar solo. Es el arreglo correcto y beneficia a todo el que
   use la función.
3. Y, ya en el catálogo, no crear filas de precio vacías, o marcarlas en la pantalla: las dos
   filas 2027 en blanco son las que abrieron el hueco.

Mientras no se toque, el parche de datos es de un minuto: borrar esas dos filas 2027 vacías
de `optional_prices` devuelve a esos dos opcionales al respaldo en ámbar de los otros catorce.

---

## Punto 4 — las cuatro puertas, una por una

El encargo pedía cerrar esto por puerta y no en general, así que lo ejecuté por las cuatro.
El resultado es más tranquilizador de lo que el bloque hace pensar en **tres** de ellas, y
peor de lo que nadie había mirado en **la cuarta**. Ninguna de las cuatro produce hoy el
desastre que se temía —cobrar 2027 con tarifa 2026 en silencio—; lo que producen es otra cosa.

| puerta | `source` | cotizaciones | qué hace hoy con una salida 2027 sin tarifa de ese año |
|---|---|---|---|
| `/cotizar` | `web` | **0** | cae al año anterior + `price_note`. **Nadie ha usado esta puerta jamás.** |
| WordPress | `wordpress` | 5 | `tarifarRuta` exacto → **409 `sin_tarifas_ano`**, no crea nada. La web manda el lead a `/api/wp/lead`. |
| BayMax / Telegram | `baymax` | 1 | mismo `tarifarRuta` → 409 **con `detalle` en castellano**: «La ruta no tiene tarifa pensión cargada para 2027». |
| Wizard del CRM | `interna` | **39** | avisa en ámbar y **deja teclear las dos cifras a mano, precio y costo, sin ninguna comprobación**. |

Las dos puertas de máquina —WP y BayMax— comparten `tarifarRuta` y **son las únicas dos que
no se pueden equivocar de año**: exigen coincidencia exacta y, si falta, no escriben nada.
La de BayMax es la mejor resuelta de la plataforma en este punto, porque además devuelve el
`detalle` legible y llega a Nico por Telegram tal cual; `webQuote` se come ese `detalle`
(`webQuote.ts:78` devuelve solo `error`) y el visitante recibe un código de máquina, pero eso
lo resuelve WordPress y no cuesta plata.

Lo que sí importa está en las otras dos, y son hallazgos nuevos.

### [MEDIO] El lead de «este año todavía no tiene tarifa» sale por correo y **no deja ni una fila**: no se puede seguir, ni contar, ni recuperar — `app/api/wp/lead/route.ts`

Cuando la web devuelve 409, quien atiende a esa persona es `/api/wp/lead`. Está bien pensado
—existe porque el `wp_mail()` de WordPress nunca llegó a Microsoft 365, y su comentario lo dice
con todas las letras: «sin esto, estos leads se pierden en silencio»—. Manda dos correos por
el webhook de n8n: el acuse al visitante y el aviso a `reservas@`.

**Y ahí se acaba.** Barrí el archivo entero: **no tiene una sola llamada a `.insert()`**, ni a
ninguna tabla; `lib/email/webhook.ts` tampoco escribe nada. Un lead de 2027 no queda en
`clients`, no queda en `quotes`, no queda en ningún sitio de la plataforma. Consecuencias:

1. **No aparece en `/seguimiento`.** La pantalla donde se ve «qué falta hacer» no sabe que esa
   persona existe. El punto 3 de `CRITERIOS.md` —«no dejar caer a nadie… es lo que más plata
   deja sobre la mesa cuando falta»— se rompe justo en el grupo de clientes que más cuesta
   conseguir: los que ya llenaron el formulario entero.
2. **Nadie sabe cuántos son.** No puedo decir en esta auditoría cuántos leads de 2027 se han
   perdido, y no por falta de ganas: **es inmedible por construcción**. Lo único que queda es
   un correo en una bandeja y una ejecución de n8n que caduca.
3. **Si el correo falla, no queda nada de nada.** El único rastro del fallo es
   `console.error("[wp-lead] no salió el correo:", error)` (`route.ts:168`) — un log de
   Railway que nadie mira, sin reintento y sin fila a la que volver.
4. **Es la puerta con más exposición a 2027**, y lo dice el propio comentario del endpoint:
   «hoy, casi todo 2027». Con 9 de las 11 rutas web sin tarifa 2027, hoy **este es el camino
   normal** de un visitante que pide el año que viene, no la excepción.

Que el 409 no cree una cotización es **correcto** —no se puede calcular lo que no tiene
tarifa—. Lo que no es correcto es que tampoco cree un **lead**. Son dos decisiones distintas
que aquí se tomaron como una sola.

**Propuesta (no lo toco: crea datos de venta):** que `/api/wp/lead` inserte el cliente y una
fila mínima —cotización en `sin_enviar` con `total_eur = 0` y el motivo (`sin_tarifas_ano` /
`a_medida`) en una columna o en `notes`—, o una tabla `leads` propia si no se quiere ensuciar
`quotes`. Con eso el lead entra al embudo, se ve en `/seguimiento`, se puede convertir en
cotización cuando se carguen las tarifas del año, y de paso da la cifra que hoy no existe:
cuánta demanda de 2027 se está atendiendo a mano.

### [MEDIO] Cuatro rutas se venden con el catálogo **vacío**, y el «costo Pilgrim» que queda grabado es el precio de venta × 0,85 — `Wizard.tsx:204-210` y `:699`

Ésta es la puerta de las 39 cotizaciones, y es la que nadie había mirado por dentro. El Wizard
se porta bien con el **precio**: `catalogBySlug` usa `ratesForYear` exacto (`Wizard.tsx:153`),
no autocarga nada si el año no está y pinta el aviso «⚠ No hay tarifas 2027 cargadas para esta
ruta — ingresá los precios a mano» (`:619`). Hasta ahí, correcto.

El problema es el campo de al lado. **`costEur` arranca en `"0"`** (`:99`) y solo se
autocarga desde el catálogo `if (!autoLink || !ratesOk) return` (`:205`) — es decir, **cuando
el año no tiene tarifa, el costo no se calcula, se teclea**, y no hay ninguna validación que
lo mire: `onSubmit` acepta `cost_base_eur = 0` sin decir nada (`:316`), mientras que el precio
de venta sí tiene su guarda («Ponele tu precio por persona a las habitaciones…», `:356`).

Lo que pasa de verdad, medido en las cotizaciones reales:

| cotización | ruta | filas de precio en el catálogo | venta | «costo Pilgrim» grabado | costo ÷ venta |
|---|---|---|---|---|---|
| CS-2026-008 | Francés desde Saint Jean | **0, en ningún año** | 4.570 € | 3.888 € | **0,8508** |
| CS-2026-033 | Portugués desde Porto | **0, en ningún año** | 3.840 € | 3.264 € | **0,8500** |
| CS-2026-081 | Costero desde Porto | **0, en ningún año** | 2.900 € | 2.466 € | **0,8503** |
| CS-2026-084 | Norte desde Vilalba | **0, en ningún año** | 870 € | 706 € | 0,8115 |

**12.180 € cotizados sobre rutas que no tienen una sola fila de tarifa**, y en tres de las
cuatro el costo es el precio multiplicado por 0,85 con cuatro decimales de exactitud. Eso no
es un costo: es **la regla de markup aplicada al revés**. La plataforma calcula el precio
dividiendo el costo entre 0,85; aquí se hizo lo contrario, y el resultado es que la utilidad
de esos expedientes es **15,0 % por definición, pase lo que pase con la factura de Pilgrim**.

Por qué importa y por qué no es un pecado de Nico sino del formulario: cuando el catálogo no
tiene la ruta, el CRM le pide **dos** números y trata al segundo como si fuera un dato del
proveedor, cuando en realidad no tiene de dónde sacarlo. La casilla se llama «Costo Pilgrim €
(total grupo)» y la de al lado enseña «Utilidad proyectada» calculada con ella (`:305`), así
que la pantalla afirma un margen que ella misma acaba de inventar. Es el mismo daño que el
MEDIO de la tarifa vieja —el tablero suma utilidades ficticias— por una segunda puerta, y esta
sí está **abierta hoy**: CS-2026-084 se creó el **2 de septiembre de 2026**, mientras se
escribía esta auditoría.

Un caso aparte, en la misma puerta: **CS-2026-015** (Costero desde Baiona, salida 2027-04-08)
tiene grabado `882 / 750`, que es **exactamente la fila `pension_single` de 2026** de esa ruta,
que no tiene 2027. O sea que el aviso ámbar hizo su trabajo, Nico tecleó a mano… y tecleó los
números del año viejo. El aviso dice «ingresá los precios a mano» pero **no dice de qué año
son los que tiene a la vista, ni deja constancia de cuál usó**: sin `price_note`, sin columna
de año de tarifa, sin nada. Es la misma pérdida silenciosa que el bloque atribuyó a `/cotizar`
—la puerta que nadie usa—, ocurriendo por la puerta que se usa el 87 % de las veces.

**Propuesta (no se toca: es dinero).** Tres cosas, de menor a mayor:
1. Que el Wizard **no acepte `cost_base_eur = 0`** con un precio de venta mayor que cero: la
   misma guarda que ya tiene el precio, con el mismo tono.
2. Que el aviso ámbar diga **qué año está viendo** y ofrezca «copiar las tarifas de 2026»
   como acción explícita, que es lo que Nico hace a mano igual. Copiado a propósito y anotado
   es otra cosa que copiado sin dejar rastro.
3. Que la cotización guarde **el año de tarifa usado** — la propuesta (a) que ya hacía el
   bloque, que aquí gana su segundo motivo: sirve tanto para el fallback automático como para
   lo tecleado.

### Sobre el GRAVE del punto 4: no hay un quinto hallazgo, y lo digo a propósito

El encargo daba por hecho que en el punto 4 había un GRAVE. Recorridas las cuatro puertas, **no
lo hay**: las dos automáticas se niegan a cotizar el año que falta, la tercera no la usa nadie
y la cuarta avisa antes de dejar teclear. El GRAVE de este bloque es el del **opcional a 0 €**,
y salió de tirar de este mismo hilo —el año que falta— pero por la rama de los opcionales, que
es donde no hay ni aviso ni negativa. Los dos hallazgos de arriba son MEDIO honestos y no los
subo: no hay pérdida demostrada, hay margen inventado y leads sin rastro. Inflar la etiqueta
para cumplir con la hipótesis del encargo sería exactamente lo que el TABLERO prohíbe.

### Dos números del bloque que ya se movieron otra vez (2-sep, tarde)

- Las cotizaciones con salida en 2027 son **13, no 12**: entró **CS-2026-084** hoy mismo.
  Sigue habiendo **2** con `price_note` (ahora 11 sin rastro, no 10).
- **`Norte desde Vilalba` ya no tiene cero cotizaciones.** Es la ruta que señalé arriba como
  «activa, sin etapas, sin `days`, sin `nights`, sin `km`, sin una sola tarifa» — y hoy tiene
  una cotización enviada de 870 €. La ruta vacía dejó de ser una curiosidad del catálogo el
  mismo día en que la anoté.

---

---

## Punto 5 — el oficio: qué trae de serie un CRM de agencia que aquí falte

`CRITERIOS.md` punto 8: «un proveedor no es texto libre. Alojamientos, tarifas y cupos como
datos, no como frases escritas a mano». Medido contra el esquema real, no contra un folleto de
Lemax.

**Lo que ya está, y conviene decirlo antes de la lista de lo que falta**, porque es más de lo
que uno esperaría en una plataforma de dos personas: `pricing_history` y `bike_price_history`
(el rastro del punto 7), `provider_payments` con `invoice_number` y `receipt_path` (lo pagado
al proveedor, con soporte), `quote_hotels` con `hotel_id` **y** copia del nombre, dirección y
contacto (el alojamiento del expediente sí es un dato, no una frase), `parent_quote_id` (las
versiones de una misma cotización del punto 1), `route_catalogs` (el catálogo del proveedor
archivado) y `trm_history` (la tasa del día del movimiento, punto 4). Nada de esto es obvio y
casi todo está bien resuelto. Lo que falta es de otra naturaleza.

### 1. La tarifa no tiene vigencia: tiene **año**. Y ése es el mecanismo detrás de medio bloque

`comercial.pricing` **ya nació con la forma correcta**: `valid_from date, valid_to date`, con
un `unique (route_id, modality, season, valid_from)`. La migración 0017 las jubiló a propósito
y lo dejó escrito: «valid_from/valid_to nunca se usaron… se dejan quietas: siguen muertas». Lo
comprobé: **51 filas, 0 con vigencia**. Y la otra dimensión corrió la misma suerte: `season`
existe en la tabla y tiene **un solo valor distinto en las 51 filas** (`regular`), porque la
temporada se resolvió aparte, como un recargo plano por persona en `settings.season_supplements`.

Todos los CRM de la lista —Lemax, Tourplan, Ezus— tarifan por **rango de fechas**, y no por
gusto: es como funciona el precio de un operador. Cambiar eso por un entero `year` tiene una
consecuencia mecánica que atraviesa este bloque entero: **el catálogo caduca de golpe, todo a
la vez, a medianoche del 31 de diciembre**. No hay tarifa que empiece el 15 de marzo ni que
termine cuando Pilgrim mande la lista nueva; hay 2026 y hay 2027. De ahí salen, en cadena, el
hallazgo B5.1, el MEDIO del costo congelado, el MENOR del año a medias y —por la puerta de los
opcionales— el GRAVE del 0 €. Se está pagando el precio de esa simplificación en cinco sitios
distintos.

**No propongo reescribirlo**: funciona, es más simple de operar y `CRITERIOS.md` prohíbe
expresamente reescribir lo que funciona. Lo que sí propongo es que quede escrito en `GUIA.md`
como la decisión que es —«tarifamos por año natural, no por vigencia»— con su consecuencia al
lado, porque hoy el que llega nuevo la deduce a base de tropezar con ella.

### 2. El itinerario y el catálogo de hoteles **no están unidos**: 280 etapas, 93 textos, 12 fichas

Es el punto 8 en su forma más literal, y explica por qué la cobertura no sube. `route_stages`
guarda el alojamiento como `accommodation text`, **sin ninguna clave foránea a `hotels`**:

- **280 etapas** con alojamiento escrito.
- **93 textos distintos** para esos 280.
- **12 fichas de hotel** en el catálogo (eran 6 el 1-sep, 11 ayer, 12 hoy).

Y el contenido delata que la columna no significa lo que su nombre dice: los valores más
repetidos son `santiago` (18), `arzúa` (12), `pedrouzo` (11), `sarria` (10) — **localidades, no
alojamientos** — y hay **9 etapas cuyo alojamiento es, literalmente, la palabra `hotel`**. Ésas
nueve no van a casar con ninguna ficha jamás, porque `normalizarLugar` las reduce a `hotel` y
buscará una ciudad llamada así.

Todo el aparato de `hotelParaLugar` y `normalizarLugar` —que está bien escrito y que el bloque
elogia con razón— **existe para suplir una relación que no está en la base**. Por eso los cinco
hoteles nuevos de ayer no movieron la cobertura ni una noche: el problema no es cuántas fichas
hay, es que la unión se hace comparando cadenas de texto. Un `hotel_id` opcional en
`route_stages` —o, más barato, una columna `city` separada de `accommodation`— convierte el
25,8 % en un número que se puede subir a propósito en vez de por casualidad.

### 3. No hay cupo, ni «confirmado con el proveedor»: la disponibilidad solo existe como prosa

Busqué cupo, allotment, disponibilidad y stock en todo el esquema y en el código del catálogo:
**no existe la idea en ninguna tabla**. Donde sí aparece la palabra es en el PDF, cinco veces,
y siempre como aviso legal: «quedan sujetos a disponibilidad hasta que se realice el pago
inicial», «las etapas pueden ajustarse según la disponibilidad de alojamientos».

Que no haya cupos de verdad es **razonable** —quien tiene las camas es Pilgrim, y esto es una
reventa; pedir un motor de inventario aquí sería justo lo que `CRITERIOS.md` llama una función
de CRM corporativo que no aplica—. Lo que sí falta y es barato es un escalón antes: **nada
distingue una cotización cuyas plazas ya se confirmaron con Pilgrim de una que todavía no**. No
hay una fecha de «confirmado con el proveedor» ni en `quotes` ni en `quote_hotels`, y ése es
justo el dato que decide si el precio sigue en pie y si la cotización se puede cobrar sin
riesgo. Hoy eso vive en la cabeza de Nico y en el hilo de correo con Pilgrim.

### 4. El costo estimado nunca se enfrenta a la factura (cabo suelto entre bloques)

`provider_payments` guarda `amount_eur` e `invoice_number` (6 pagos registrados) y
`/seguimiento` los lee (`page.tsx:40`), pero la utilidad se sigue calculando con la estimación:
`utilidad: total - (q.cost_eur || 0)` (`page.tsx:80`). Es decir que **el margen que muestra la
plataforma nunca se corrige con lo que Pilgrim facturó de verdad**, ni siquiera cuando la
factura ya está cargada. Sumado a los dos MEDIO de este bloque —el costo congelado en el año
viejo y el costo tecleado al 85 %— el resultado es que la cifra de utilidad de `/seguimiento`
es, hoy, una estimación en tres capas sin ningún punto en que se cierre contra la realidad.

Lo dejo anotado aquí como **cabo suelto para B8**, no como hallazgo de B5: la pantalla es de
B2 y el dinero es de B6. Lo que aporta B5 es la mitad de la explicación —de dónde salen los
costos que esa pantalla suma— y las tres formas en que pueden estar mal.

---

Lo que la auditoría pedía que revisen — **las tres respondidas**:

- El **MEDIO de la fianza ausente del contrato**: respondido, **baja a MENOR** (cero líneas de
  bici cotizadas en la historia; ningún cliente ha leído nunca ese cuadro). Bloqueante antes de
  la primera venta de bici.
- Los números de **cobertura de hoteles**: respondido, **25,8 % (71 de 275) y 6/6 en Sarria**,
  recalculado ejecutando `hotelParaLugar` con `npx tsx`. El auditor tenía razón, y el número no
  se movió al pasar de 6 a 11 hoteles.
- El **MENOR de `errors.ts`**: respondido, **se queda en B5** (se dispara borrando una ruta y el
  arreglo bueno es `deleteRoute`), con la mitad del diccionario prestada a B6.

---

## VEREDICTO: revisar

El bloque **está bien hecho y sus números son de verdad**: cuatro de los cinco los rehice
contra producción y cuadran exactos, y el método —medir, no estimar— se sostiene. Lo que lo
manda a revisión no es que esté mal, es que la crítica le añadió **un GRAVE, cinco MEDIO y un
MENOR** que no tenía, y varios cambian lo que hay que hacer el lunes. No hay nada aquí que
invalide la auditoría; hay cosas que hacen falta antes de darla por cerrada.

Los huecos concretos para la ronda de revisión, en orden de lo que cuesta dejarlos:

1. **El GRAVE del opcional a 0 €** (`year.ts:78-88` · `optionals.ts:34-37`). Decidir con Nico
   entre el parche de datos (borrar las dos filas 2027 vacías de `optional_prices`, un minuto,
   reversible) y el arreglo de código (filtrar filas sin precio en `ratesForYearWithFallback`).
   **Es lo único de este bloque que puede regalar dinero con un solo clic.**
2. **El desempate de hoteles sin `.order()`** (`travelDocActions.ts:56-59`). Una línea, no toca
   dinero, y hoy decide cuál de dos pensiones sale impresa en el Documento de Viaje en **5 de
   las 6 localidades**. Es el arreglo con mejor relación entre lo que cuesta y lo que evita.
   Lo dejé sin aplicar por no meter mano en código de otro bloque.
3. **`route_id` en NULL en 33 de 45 cotizaciones**, y `prefillTravelNights` resolviendo la ruta
   por nombre. Hay que decidir el relleno de la columna (dato) y las dos líneas de
   `travelDocActions.ts:41` (código). Incluye arreglar a mano la cotización con
   `«Portugues desde Tui»` sin tilde, que **hoy no puede prellenar su documentación**.
4. **Las cuatro rutas que se venden con el catálogo vacío** (12.180 € cotizados) y el costo
   tecleado al 85 % del precio. Decisión de negocio: o se cargan las tarifas de esas rutas, o
   el Wizard deja de aceptar `cost_base_eur = 0` y de llamar «Costo Pilgrim» a un número que
   no lo es.
5. **El lead de `sin_tarifas_ano` que no deja fila.** Decidir si entra a `quotes` como
   `sin_enviar` o a una tabla propia. Mientras no se decida, **no se puede saber cuántos son**,
   y ése es el argumento: hoy la respuesta a «cuánta demanda de 2027 estamos perdiendo» es
   literalmente inaveriguable.
6. **Los tres números del bloque que ya caducaron** y hay que dejar al día en el texto:
   **12 → 13** cotizaciones con salida 2027, **4 → 5** rutas activas sin etapas (falta
   `Norte desde Vilalba`, que además ya tiene una cotización de 870 €), y **6 → 12** hoteles.
   El catálogo se está moviendo todos los días; conviene fechar cada cifra al anotarla.
7. **Dos cosas de dato puro para Nico**, que no son código: cargar las etapas de las rutas
   publicadas sin itinerario, y decidir qué se hace con `Norte desde Vilalba` —activa, sin
   días, sin noches, sin km, sin etapas, sin una sola tarifa, y ya vendida—.

Lo que **no** hace falta revisar: los márgenes (74 filas barridas, ninguna bajo costo), el
módulo de bicis (el mejor cerrado del catálogo, aunque esté a medio nacer), el modelo de
opcionales por año en su diseño —el fallo es la guarda, no el modelo— y la cobertura de
hoteles, que ya tiene dos cálculos independientes que dan lo mismo.


---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
