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

`Estado: en curso` — crítico independiente (segundo intento; el primero murió antes de
escribir nada). Plan numerado, escribo cada conclusión en cuanto la tengo:

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

Voy por: (1).

Lo que la auditoría pedía que revisen:

- El **MEDIO de la fianza ausente del contrato**: si merece esa etiqueta dado que aún no hay
  ningún contrato de bici firmado.
- Los números de **cobertura de hoteles** (26 %, 6/6 en Sarria): los calculé ejecutando
  `hotelParaLugar` contra los datos reales, pero conviene una segunda pasada.
- Si el **MENOR de `errors.ts`** (el mensaje del 23503) se sale del alcance de B5 y pertenece
  más a B6.

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
