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
  `Estado: pendiente`
- **B5.4 Opcionales.** Precios por año, opcionales activos sin precio, unidades y cantidades. Qué pasa si se desactiva uno que está en cotizaciones vivas.
  `Estado: pendiente`
- **B5.5 Bicis.** Tarifa por bici × ruta × año, la fianza que no entra al total, el encadenado por `parent_quote_id`.
  `Estado: pendiente`
- **B5.6 Hoteles.** Módulo recién hecho: duplicados, ciudades que no casan con las etapas, hoteles sin fotos, qué pasa al borrar uno en uso.
  `Estado: pendiente`
- **B5.7 Integridad referencial.** Borrar una ruta con cotizaciones, un opcional en uso, una bici cotizada. Qué protege la base y qué no.
  `Estado: pendiente`

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

`Estado: pendiente`

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
