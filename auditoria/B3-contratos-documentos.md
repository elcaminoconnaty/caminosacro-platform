# B3 — Contratos y documentos

**Cubre:** `ContractCard`, `contractActions`, `lib/contracts/**`, `contrato/[token]/**`, `TravelDocCard`, `travelDocActions`, `lib/travelDocs/**`, `documentacion/[token]/**`, `PilgrimFilesCard`, `lib/{quotePdf,travelDocPdf,asistenciaPdf,receiptPdf,pdfChrome}`

**Por qué importa:** Aquí está lo que el cliente firma y lo que se lleva al Camino. Y las tres rutas públicas sin sesión.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B3.1 Las rutas por token.** `/contrato`, `/documentacion`, `/correo`: entropía del token, caducidad, revocación, y **qué se filtra** — mira qué datos de terceros aparecen en cada página y en los nombres de archivo.
  `Estado: hecho` — la parte de seguridad está bien resuelta (256 bits de entropía, buckets privados,
  la firma revalida todo en el servidor); lo que falla es de trato: el viajero que vuelve a abrir su
  enlace ya firmado ve **«Enlace no válido»**, porque firmar pone el token en `null` y deja
  inalcanzable la rama amable. Y dos de las tres páginas no fijan `Referrer-Policy`.
- **B3.2 La firma como prueba.** Qué se guarda de la firma y si serviría en una disputa: quién, cuándo, desde dónde, sobre qué texto exacto. Ojo al límite de peticiones (ya se supo que va por token y no por IP).
  `Estado: hecho` — **sin hallazgos de fondo: la firma serviría en una disputa.** Queda constancia de
  quién, cuándo, desde dónde y sobre qué texto exacto, el contrato firmado es inmutable por los siete
  guardas de `contractActions.ts`, y la autorización de habeas data va dentro del PDF hasheado. Lo
  único: el `doc_hash` se guarda y **no lo lee nadie** — no hay forma de verificar la integridad desde
  el producto.
- **B3.3 Los cinco generadores de PDF.** Textos largos, nombres larguísimos, 20 viajeros, campos vacíos. Busca desbordes, solapes y datos que se quedan en blanco sin avisar. Renderiza de verdad con `scripts/docs_smoke.tsx`.
  `Estado: hecho` — renderizados los cinco con datos hostiles: **ninguno revienta** y los campos vacíos se
  resuelven con elegancia. Dos defectos de maquetación: la cabecera del **documento de viaje se vuelve
  ilegible** con un nombre de ruta de más de ~60 caracteres (el titular y los datos del cliente se pisan),
  y **ningún PDF desactiva el guionado** de `@react-pdf`, así que ya hoy se parten palabras a la mitad con
  una ruta real del catálogo.
- **B3.4 Storage.** Rutas y políticas de los buckets, archivos huérfanos, qué se borra al borrar una cotización. **Pasaportes**: quién puede llegar a ellos y por cuánto tiempo.
  `Estado: hecho` — los buckets son privados y están bien organizados, pero **borrar una cotización deja
  atrás el pasaporte y el contrato firmado**: en Storage hay hoy pasaportes de CS-2026-044 y CS-2026-048,
  dos cotizaciones que ya no existen. `deleteQuote` solo borra 2 de los 8 tipos de archivo del expediente,
  y el contrato que esas personas firmaron les promete el derecho de supresión.
- **B3.5 Coherencia entre los tres documentos.** Cotización, contrato y documentación de viaje salen de los mismos datos: comprueba que dicen lo mismo (precio, fechas, personas, condiciones) en un expediente real.
  `Estado: hecho` — los 8 contratos de producción cuadran hoy con su cotización en precio, fechas y
  personas. Pero **el PDF de la cotización calcula el fin del viaje por su cuenta** y ya discrepa del dato
  guardado en dos expedientes vivos (CS-2026-080 por un día, CS-2026-081 por dos), y `variables_json` es
  una foto fija que solo se refresca si alguien se acuerda de pulsar un botón.
- **B3.6 Qué pasa al borrar.** Borrar una cotización con contratos firmados, documentación enviada y archivos de Pilgrim. ¿Cascadas correctas? ¿Se puede borrar algo que no debería borrarse?
  `Estado: hecho` — **las cascadas están bien diseñadas** (incluidos los dos `SET NULL` deliberados), pero
  `deleteQuote` **no tiene una sola guarda**: borra igual una cotización con contrato firmado, dinero
  cobrado y documentación enviada, y el `confirm()` no dice nada de eso. Hoy hay tres expedientes así, a
  un clic y una confirmación genérica.

---

## Hallazgos

### [MEDIO] El viajero que vuelve a abrir su contrato firmado ve «Enlace no válido» — `contrato/[token]/page.tsx:38-47` · `contrato/[token]/actions.ts:186`

`page.tsx` tiene escrita la rama amable para este caso, con su mensaje y su fecha:

```tsx
if (contract.status === "firmado") {
  return <Aviso titulo="¡Contrato ya firmado!" detalle={`Este contrato fue firmado el …`} />;
}
```

**Esa rama no se puede alcanzar nunca.** La página busca el contrato por `\.eq("token", token)`,
y `firmarContrato()` cierra la operación poniendo **`token: null`** (`actions.ts:186`, junto a
`token_expires_at: null`). Un contrato firmado ya no tiene token, así que la consulta no
devuelve fila y el flujo cae dos líneas antes, en el `if (!contract)`:

> «**Enlace no válido** — Este enlace de firma no existe o fue anulado. Escríbenos y te
> enviamos uno nuevo.»

Verificado en producción: los **3** contratos en estado `firmado` tienen los tres `token = null`.
O sea que hoy, si cualquiera de esas tres personas abre otra vez el enlace que tiene en su
correo —para comprobar que firmó, para enseñárselo a quien viaja con ella, o simplemente
porque le dio a «atrás»—, la plataforma le dice que su enlace **no existe o fue anulado** y la
manda a escribir a reservas@. Justo después de haber firmado un contrato y subido su
pasaporte. Es el momento de máxima desconfianza posible y el mensaje es el peor de los que
hay escritos.

No es un fallo de seguridad —anular el token al firmar está bien— es que la pantalla no
distingue «este token nunca existió» de «este token ya cumplió su función».

**Propuesta:** que la página, cuando no encuentre contrato por token, mire si hay uno firmado
para ese mismo enlace antes de dar el mensaje duro. La forma barata sin tocar el borrado del
token es guardar el token usado en otra columna (`token_used`) al firmar, o no anularlo y
apoyarse en el `status !== "enviado"` que ya se comprueba —el flujo de firma revalida estado y
expiración por su cuenta en el servidor (`actions.ts:79-84`), así que dejar el token vivo no
abre nada—. Con eso la rama que ya está escrita empieza a funcionar.

### [MENOR] Dos de las tres páginas públicas no fijan `Referrer-Policy` — `contrato/[token]/page.tsx` · `documentacion/[token]/page.tsx` vs `correo/[token]/route.ts:47`

`/correo/[token]` está cuidado al detalle: `Content-Security-Policy` restrictivo,
`X-Robots-Tag`, `Cache-Control: no-store` y **`Referrer-Policy: no-referrer`**. Las otras dos
rutas por token solo declaran `robots: { index: false, follow: false }` en su `metadata`, y no
hay ningún `headers()` global en `next.config.ts` que las cubra.

**Por qué es MENOR y no más:** el token va en el *path*, y el valor por defecto de los
navegadores modernos (`strict-origin-when-cross-origin`) manda solo el origen cuando el
destino es otro dominio — que es justo el caso del redirect a `*.supabase.co` del
descargador. Así que hoy el token no se filtra. Lo anoto porque la protección depende del
navegador y no de la plataforma, la página de documentación es **de token permanente** (no
caduca nunca, solo se revoca), y la vacuna es una entrada en `headers()` de `next.config.ts`
que además cubriría lo que se añada mañana. El propio proyecto ya demostró que sabe hacerlo,
en `/correo`.

### [MEDIO] Se puede borrar de un clic un expediente firmado y pagado, y el aviso no dice qué se lleva por delante — `seguimiento/[id]/actions.ts:100` · `QuotesTable.tsx:133`

`deleteQuote` no comprueba **nada** antes de borrar: ni el estado de la venta, ni si hay
contratos firmados, ni si hay pagos recibidos, ni si la documentación de viaje ya salió.
Toma el id y borra. La única barrera es un `window.confirm` del navegador:

> «¿Borrar la cotización **CS-2026-004 — Nombre del cliente** por completo? Esta acción no se
> puede deshacer.»

Verdadera pero muda: no menciona que ese expediente tiene **un contrato firmado**, **970 €
cobrados en dos pagos** y sus recibos emitidos. El botón está en cada fila de la lista de
`/seguimiento`, al lado del desplegable de estado que B2 describe como «la pantalla rápida
que se usa desde el celular».

Los tres expedientes que hoy están en esa situación:

| | estado | cobrado | contratos |
|---|---|---|---|
| **CS-2026-004** | `pago_parcial` | 970,00 € | 1 firmado |
| **CS-2026-034** | `pago_completo` | 860,00 € | 1 firmado |
| **CS-2026-058** | `enviada` | 0 € | 1 firmado de 3 |

Qué se lleva por delante un clic de más: las filas de `client_payments` y
`provider_payments` —o sea **el registro contable de un dinero que sí entró**—, los
contratos con su `signer_ip`, su `doc_hash` y su constancia de firma electrónica, los
viajeros con sus números de pasaporte, y el expediente de documentación de viaje. Y, por el
hallazgo de Storage de más abajo, **los archivos no se van con ellos**: quedan el PDF del
contrato firmado y la foto del pasaporte, ya sin nada que diga de quién eran.

**Propuesta (no se toca: es borrado de datos):** que `deleteQuote` cuente antes de borrar y
devuelva un error cuando haya contratos firmados o pagos registrados —«este expediente tiene
1 contrato firmado y 970 € cobrados; anúlalo en vez de borrarlo»—, dejando el borrado libre
para las cotizaciones sin rastro, que son la mayoría. Y que el `confirm()` diga lo que hay
dentro. El estado `cancelada` ya existe y es la herramienta correcta para lo demás.

### [MEDIO] El PDF de la cotización dice un día de regreso y la base dice otro — `src/lib/quotePdf.tsx:509-521`

El PDF de la cotización **no usa `end_date`** para la línea de fechas de la portada. La
calcula:

```ts
const days = (stagesCount > 0 ? stagesCount + 2 : (route?.days ?? 0)) + extraNights;
const displayEndDate = quote.start_date && days > 0 ? sumarDiasIso(quote.start_date, days - 1) : quote.end_date;
```

O sea: **fin = salida + (etapas con km) + 1**. Está hecho a propósito y comentado —para que el
rango cuadre con la tabla de itinerario del propio PDF y con las noches extra—, pero el resto
de la plataforma usa el `end_date` guardado: el **contrato** (`contracts/render.ts:46,74` →
`fecha_fin`), la **documentación de viaje** y la lista de Seguimiento. Cuando la ruta del
catálogo no tiene tantas etapas como noches tiene la cotización, los documentos se separan.

**Dos casos vivos, cruzando `route_stages` contra `quotes`:**

| | salida | `end_date` guardado | etapas con km | fin que pinta el PDF | desfase |
|---|---|---|---|---|---|
| **CS-2026-080** (`enviada`) | 2026-10-18 | **24 oct** | 6 | 18 + 6 + 1 = **25 oct** | 1 día |
| **CS-2026-081** (`enviada`) | 2027-04-01 | **13 abr** | 13 | 1 + 13 + 1 = **15 abr** | **2 días** |

Las dos están `enviada`, o sea que esos clientes **ya tienen en su correo un PDF que dice que
el viaje termina dos días más tarde** de lo que dirá su contrato cuando lo firmen y de lo que
dice el calendario del CRM. Para un producto donde el cliente compra el vuelo de vuelta por
su cuenta, dos días es exactamente el error que se paga caro.

No es que una de las dos cifras sea la buena: es que hay **dos fuentes de verdad** para el
mismo dato. O el itinerario del catálogo está incompleto para esas rutas (6 etapas para 6
noches, cuando el PDF asume llegada + etapas + fin), o el `end_date` está mal. Lo que no
puede es que cada documento resuelva la duda por su cuenta y en silencio.

**Propuesta (no se toca: cambia lo que dice un documento ya enviado):** que el PDF avise
cuando su cálculo no coincida con `end_date` en vez de imponer el suyo —un aviso en el CRM,
no en el documento del cliente—, y decidir con Nico cuál manda. Y revisar esas dos rutas:
`Costero desde Baiona` y `Costero desde Porto` son las que tienen el itinerario descuadrado.

### [MEDIO] Las variables del contrato son una foto fija y solo se refrescan a mano — `contractActions.ts:334-368` · `ContractCard.tsx:474`

Al crear un contrato, sus datos del viaje se copian a `contracts.variables_json`: precio,
fechas, personas, modalidad, habitaciones. A partir de ahí **el contrato deja de mirar la
cotización**. Editar la cotización —cambiar el precio, las fechas, el número de personas— no
toca los contratos ya creados y no avisa de nada.

Refrescarlos existe, pero es un **botón que hay que acordarse de pulsar**: `applySharedToAll`
solo se llama desde `ContractCard.tsx:474`. Buscado en todo `src/`: no hay ninguna otra
llamada, ni desde `updateQuote`, ni desde `actualizarCotizacion()`, ni desde ningún efecto.
Y en la pantalla nada marca que un contrato esté desactualizado respecto de su cotización.

**Honestidad sobre el caso:** hoy no hay ni una divergencia. Crucé los **8** contratos de
producción contra su cotización y los ocho coinciden al céntimo en total, fechas y personas
—incluido CS-2026-034, cuyo contrato es del 27-jul y cuya cotización se tocó el 4-ago—. El
mecanismo está abierto, no ha mordido.

Lo que lo hace probable es lo que ya está documentado en los otros bloques: B2 dejó dicho que
`updateQuote` reescribe 16 columnas **en cada guardado**, y B1 que el auto-fill del editor se
dispara al montar la página. Un guardado de rutina cambia el precio de la cotización y deja
el contrato diciendo el viejo, sin una señal.

**Y hay un caso concreto que ya está preparado para salir mal.** El renglón de habitaciones
del contrato sale de `rooms_json` (`contracts/render.ts:74-84`), y B1 documentó que
**CS-2026-080 tiene `rooms_json` de 8 dobles con 14 personas** porque `updateQuote` nunca lo
reescribe. Si a ese expediente se le crean hoy sus contratos, cada viajero firmará un
documento que dice «**8 habitación(es) doble(s)**» para un grupo de 14. El defecto de B1 no se
queda en el pedido a Pilgrim: aterriza en el documento que la gente firma.

**Propuesta:** que la tarjeta de contratos marque en ámbar «este contrato se creó con datos
distintos a los de la cotización» comparando los cuatro campos que mueven plata, con el botón
de refrescar al lado. No hace falta sincronizar solo —un contrato ya enviado no debe cambiar
sin que alguien lo decida—, hace falta que se **vea**.

### [GRAVE] Borrar una cotización deja atrás el pasaporte y el contrato firmado — `seguimiento/[id]/actions.ts:100-116`

`deleteQuote` borra de Storage exactamente **dos** archivos:

```ts
const { data: q } = await supabase.from("quotes").select("pdf_path, hotels_pdf_path")…
await removeStoragePath(supabase, q.pdf_path);
await removeStoragePath(supabase, q.hotels_pdf_path);
const { error } = await supabase.from("quotes").delete().eq("id", id);
```

Las tablas hijas sí caen en cascada —`contracts`, `travel_docs`, `client_payments`,
`provider_payments`, `quote_lines`, `quote_travelers`—, y con ellas desaparecen **las filas
que guardaban la ruta de cada archivo**. Los archivos, no. Quedan en Storage sin una sola
referencia en la base, invisibles desde el producto:

| lo que queda huérfano | columna que se borró en cascada |
|---|---|
| **la foto del pasaporte** | `contracts.passport_path` |
| el contrato firmado y el sin firmar | `contracts.signed_pdf_path`, `contracts.pdf_path` |
| documento de viaje, seguro, etiqueta de equipaje | `travel_docs.*_pdf_path` |
| los recibos de pago | `client_payments.receipt_path` |
| los documentos que mandó Pilgrim | subcarpeta `pilgrim/` del expediente |

**No es teórico: ya pasó.** Cruzando `storage.objects` contra las rutas guardadas:

- En `comercial-passports` hay **2 fotos de pasaporte de cotizaciones que ya no existen**:
  `2026/CS-2026-044/Pasaporte-CS-2026-044-…jpg` y
  `2026/CS-2026-048/Pasaporte-CS-2026-048-…jpg`. Comprobado: no hay ninguna fila en `quotes`
  con esos códigos. Alguien borró esos dos expedientes y las fotos del documento de identidad
  de esas personas siguen ahí.
- En `comercial-contracts` hay **4 PDF de contrato** en la misma situación, todos de
  cotizaciones borradas.
- En `comercial-quotes`, 3 PDF huérfanos (esos sí, solo dinero de almacenamiento).

**Por qué es GRAVE y no una tarea de limpieza.** El contrato que esas personas firmaron dice,
en su cláusula de tratamiento de datos (`contracts/template.ts:262`), que *«EL VIAJERO podrá
ejercer sus derechos de conocer, actualizar, rectificar y **suprimir** sus datos, y revocar
la autorización, escribiendo a reservas@caminosacro.com»*. Hoy la plataforma **no puede
cumplir esa promesa**: borrar el expediente —que es la única herramienta de borrado que
existe— deja precisamente el dato más sensible, la imagen del pasaporte, y encima lo deja
donde ya nadie lo puede encontrar, porque el índice que decía dónde estaba se fue con la
cascada. Es una obligación de la Ley 1581 que la propia empresa se impuso por escrito y que
el software incumple en silencio.

Matiz honesto: los buckets son **privados** (verificado en `storage.buckets`), así que no hay
nada expuesto a internet. El problema no es una filtración; es que el dato sobrevive al
registro que lo justificaba y nadie sabe que está ahí.

**Propuesta (no se toca: es borrado de datos y hay que decidirlo con Nico):** que
`deleteQuote` lea, antes de borrar, las rutas de las tablas hijas —son cinco `select` a
tablas que ya se van a borrar— y las quite de Storage; y una consulta de arqueo, del mismo
estilo que la de B2, que liste objetos de Storage sin fila que los referencie. La segunda
mitad hace falta igual, porque ya hay huérfanos de antes.

### [MENOR] El pasaporte se sube antes de que la firma quede registrada — `contrato/[token]/actions.ts:120-131`

El orden de `firmarContrato` es: **1)** subir el pasaporte, **2)** renderizar el PDF firmado,
**3)** subirlo, **4)** el `update` condicional que cierra el contrato. Si algo falla en 2, 3
o 4 —o si el `update` no encuentra fila porque otra pestaña ganó la carrera— **el pasaporte
ya está en el bucket** y nada lo borra ni lo referencia. El viajero ve un mensaje de error,
reintenta, y sube otra copia con otra marca de tiempo.

Es el mecanismo que alimenta el hallazgo de arriba desde el otro lado. Contribuye a que en
`comercial-passports` haya **30 objetos y solo 3 referenciados**; la mayor parte de esa
diferencia son las pruebas de julio (`CS-TEST-*`, 27 archivos), pero el patrón es el mismo y
en un caso real produce copias del pasaporte de alguien que nadie sabe que existen.

**Propuesta:** subir el pasaporte **después** del `update` condicional, o borrarlo si alguno
de los pasos siguientes falla — el patrón que `bikeQuote.ts:248-252` ya usa bien.

### [MENOR] `scripts/cleanup_orphans.ts` no limpia huérfanos: borra un archivo concreto a mano

El nombre promete una herramienta de mantenimiento. El contenido son catorce líneas que
borran **un** archivo con el nombre escrito a fuego:

```ts
const { data, error } = await sb.storage.from("comercial-quotes").remove(["CS-2026-002.pdf"]);
```

Fue un apaño puntual y se quedó. El riesgo no es que haga daño —no lo hace— sino que su
nombre dice que el problema de los huérfanos está atendido cuando no lo está: es
exactamente el script que alguien buscaría al leer el hallazgo de arriba. **Propuesta:**
renombrarlo a lo que hace, o convertirlo en el arqueo de verdad que hace falta.

### [MEDIO] La cabecera del documento de viaje se vuelve ilegible con un nombre de ruta largo — `src/lib/travelDocPdf.tsx` (cabecera fija de página)

La cabecera que se repite en todas las páginas del Documento de Viaje pone a la izquierda el
nombre de la ruta en versalitas y a la derecha el bloque del cliente (nombre, teléfono,
correo). Los dos son texto libre y **no hay recorte ni ancho máximo**: cuando el nombre de la
ruta pasa de unos **60 caracteres**, el de la izquierda se mete por debajo del de la derecha
y los dos quedan impresos uno encima del otro.

Renderizado de verdad, no leído (`@react-pdf`, misma versión del proyecto):

| nombre de ruta | caracteres | resultado |
|---|---|---|
| `Francés desde Sarria` | 20 | limpio |
| `Camino Portugués - Viana do Castelo (personalizada)` — **el más largo del catálogo real** | 51 | limpio |
| `Camino Portugues Viana do Castelo personalizada grupo colegio ABC` | 65 | **se pisan**: «…GRUPO COLE**Cliente: Ad**riana del Socorro…» |
| el de la prueba hostil | 89 | ilegible por completo |

**Honestidad sobre el caso:** con los datos de hoy no pasa. La ruta más larga en `routes`
tiene 51 caracteres y el nombre de cliente más largo 35, y esa combinación sale bien. Lo que
lo hace alcanzable —y no una hipótesis— es que **nada impide un nombre más largo**: las rutas
personalizadas se crean desde el asistente con el nombre a mano, y B1 ya dejó anotado que
`nueva/actions.ts` no pone tope de longitud ni a `route_name` ni a `client_name`. El propio
catálogo enseña hacia dónde va la cosa: el nombre más largo que existe ya lleva un
«(personalizada)» pegado al final. Un «(personalizada)» más un «grupo colegio X» y se cruza
el umbral.

Y el documento donde revienta es el peor de los cinco: el Documento de Viaje es **el que el
peregrino lleva en el celular durante el Camino**, y la cabecera rota se repite en todas sus
páginas.

**Propuesta:** un `maxLines={1}` con `textOverflow: "ellipsis"` en el bloque de la izquierda,
o darle un ancho fijo a las dos columnas de la cabecera para que ninguna pueda invadir la
otra. Y, aguas arriba, el tope de longitud en `route_name` que B1 ya propuso.

### [MENOR] Ningún PDF desactiva el guionado, y ya se parten palabras con datos reales — los cinco generadores

`@react-pdf/renderer` corta palabras por la mitad con guion cuando no caben, y solo deja de
hacerlo si se registra un `Font.registerHyphenationCallback`. Buscado en todo `src/`: **no
hay ninguno**. Así que el comportamiento está activo en los cinco documentos.

No es teórico y no hace falta un dato inventado para verlo. Con la ruta **real** `Camino
Portugués - Viana do Castelo (personalizada)`, la portada de la cotización imprime el titular
en dos líneas partiendo la última palabra:

> Camino Portugués - Viana do Castelo **(per-**
> **sonalizada)**

Y en el Documento de Viaje, la etiqueta de alojamiento `Pensión · 9 dobles + 2 individuales`
sale como **«2 individ-uales»**. En un titular de 30 pt de la portada de una oferta comercial
eso se ve, y en español el guionado por sílabas que hace la librería no es el correcto (parte
donde cabe, no donde toca).

**Propuesta:** una línea, una vez, junto al registro de fuentes:
`Font.registerHyphenationCallback((w) => [w])`, que desactiva el corte y manda la palabra
entera a la línea siguiente. Es reversible y no cambia ningún dato.

### [MENOR] En la portada de la cotización, el código de cotización se sube encima de la foto — `src/lib/quotePdf.tsx:563` (`coverEyebrow`)

El bloque de texto de la portada está anclado abajo y crece hacia arriba. Con un titular de
dos líneas **y** un nombre de cliente de tres, el primer renglón —`COTIZACIÓN DE VIAJE ·
CS-2026-…`, en dorado de 7 pt— se sale de la banda verde y queda impreso **sobre la
fotografía**, donde no se lee. Comprobado renderizando: con titular corto está holgado, con
titular largo y cliente corto queda al filo, y con los dos largos se monta.

Va como MENOR y no como MEDIO porque hace falta bastante más de lo que hay en producción
(la peor combinación real —51 y 35 caracteres— sale perfecta) y porque lo que se pierde es el
código de la cotización, que aparece otras veces en el documento. Mismo origen que el
hallazgo de arriba y mismo tipo de arreglo: reservarle alto al bloque o limitar las líneas
del titular.

### Lo que sí está bien: las cascadas están pensadas, no puestas por defecto

El mapa de claves foráneas que apuntan a `quotes` es correcto y tiene dos decisiones
deliberadas que se agradecen:

| tabla | `ON DELETE` | |
|---|---|---|
| `client_payments`, `provider_payments`, `contracts`, `travel_docs`, `quote_lines`, `quote_travelers`, `quote_hotels`, `quote_pilgrim_files` | `CASCADE` | lo que solo existe dentro del expediente se va con él |
| **`email_log.quote_id`** | **`SET NULL`** | el correo que se le mandó al cliente **sobrevive** al borrado, y con él su `/correo/[token]`: el enlace que esa persona tiene guardado sigue funcionando |
| **`quotes.parent_quote_id`** | **`SET NULL`** | borrar la cotización madre no arrastra a la de bici que salió de ella |

Las dos de `SET NULL` son justo las que un `CASCADE` automático habría estropeado. Y no hay
ninguna tabla con `NO ACTION` que dejara el borrado a medias con un error de clave foránea.

- **Borrar sí confirma con el dato correcto**: el `confirm()` incluye el código y el nombre
  del cliente (`QuotesTable.tsx:133`), no un «¿estás seguro?» genérico. El problema es lo que
  *no* dice, no lo que dice.

### Lo que sí está bien: los tres documentos cuentan la misma historia

- **Los 8 contratos cuadran con su cotización.** Comprobado uno a uno contra `quotes`: total,
  fecha de inicio, fecha de fin y número de personas coinciden en los ocho. No hay ni un
  expediente con el contrato diciendo un precio y la plataforma otro.
- **El refresco de variables respeta lo que es de cada quien.** `applySharedToAll` mezcla los
  datos compartidos del viaje pero conserva nombre, correo, teléfono, tipo y número de
  documento y dirección **de cada firmante** (`contractActions.ts:350-359`), y **se salta los
  contratos firmados** contándolos aparte (`omitidos`). Es la semántica correcta: refrescar
  no puede pisar los datos personales de un acompañante ni tocar lo ya firmado.
- **La dirección del acompañante se deja vacía a propósito** hasta que firma
  (`contractActions.ts:243-244`: «la del titular sí viene de la cotización; la de un
  acompañante no se conoce hasta que firma»), en vez de rellenarla con la del titular. Es
  exactamente el tipo de detalle que separa un contrato válido de uno copiado.
- **El renglón de habitaciones es el mismo dato en los tres sitios**: `rooms_json` alimenta el
  contrato, el correo a Pilgrim y las tarjetas del PDF. Un dato, un sitio — el problema no es
  el diseño, es que B1 encontró que `updateQuote` no lo actualiza.

### Lo que sí está bien: Storage está bien pensado

- **Los nueve buckets `comercial-*` son privados** (`public = false`, verificado en
  `storage.buckets`). Los únicos públicos son los tres del Estudio de Contenido, fuera de
  alcance. Nada del expediente de un cliente se sirve por URL abierta.
- **Un solo sitio decide dónde vive cada archivo.** `lib/storage/paths.ts` es el módulo más
  disciplinado que he leído en la plataforma: estructura `{bucket}/{año}/{código}/`, un
  comentario que explica el porqué de cada excepción, saneado de nombres sin tildes ni
  signos, y marca de tiempo donde los nombres se repiten de verdad —los documentos de
  Pilgrim, «manda el mismo nombre al confirmar y otra vez corregido dos semanas después, y
  el segundo no puede pisar al primero»—. Todo lo de un cliente queda junto y navegable.
- **El sufijo de posición en los contratos está bien resuelto**: en un grupo hay un contrato
  por viajero y sin ese sufijo se pisarían el PDF; el viajero 1 conserva el nombre de siempre
  para no romper los contratos que ya existían.
- **Las políticas RLS son coherentes**: cada bucket tiene sus cuatro políticas
  (SELECT/INSERT/UPDATE/DELETE) para el rol `authenticated`, sin excepciones ni huecos. Que
  cualquier usuario autenticado pueda leer cualquier pasaporte es proporcionado hoy —la
  plataforma tiene dos usuarios y los dos son los dueños—, pero conviene saberlo el día que
  entre una tercera cuenta (una asistente, un contador): no hay separación por persona.

### Lo que sí está bien: los cinco generadores aguantan lo que se les eche

Renderizados de verdad contra `@react-pdf`, siete combinaciones hostiles —nombre de 92
caracteres, ruta de 89, notas de más de 700 palabras, 20 viajeros, 20 noches de itinerario,
plan financiado de 12 cuotas con pagaré, y dos documentos con **todos** los campos
opcionales vacíos—:

- **Ninguno lanzó una excepción.** Los siete produjeron PDF válido: cotización hostil (6
  págs.), cotización vacía (5), recibo (1), documento de viaje de 20 noches (18), asistencia
  (9), contrato financiado con sello de firma (8) y contrato vacío (5).
- **Los campos vacíos no se quedan mudos: se resuelven.** La cotización sin ruta, sin fechas,
  sin cliente y sin total imprime «Camino de Santiago» como titular de respaldo, omite la
  línea de fechas en vez de dejar un rango roto, y pone «—» donde van el peregrino y la
  validez. No hay ni un hueco en blanco sin explicar ni un `undefined` impreso.
- **Los 20 viajeros y las 20 noches paginan bien.** El itinerario del Documento de Viaje
  reparte las noches por páginas sin cortar una tarjeta a la mitad, y las «Observaciones» de
  más de 700 palabras fluyen dentro de su caja sin desbordarla ni tapar lo de abajo.
- **El recibo aguanta el nombre de 92 caracteres** envolviéndolo en dos líneas, y el bloque
  de cifras —monto recibido, TRM aplicada, equivalente, total, abonado, saldo— queda alineado
  y legible con un pago en COP de ocho dígitos.
- **El sello de firma del contrato no se descuadra** con un user-agent de iPhone completo: lo
  recorta a 160 caracteres (`contractPdf.tsx:228`), que es justo lo que hace falta para que no
  empuje el resto del sello fuera de la página.

Un detalle que **no** es un fallo, por dejarlo dicho para quien lo vea y lo reporte: en el
recibo conviven «9194,25 EUR» y «24.680,50 EUR» sin punto de millar en el primero. No es una
incoherencia del código —los dos salen del mismo `Intl.NumberFormat("es-ES")`— sino la regla
del español, que **no agrupa los números de cuatro cifras**. Está bien como está; cambiarlo
sería apartarse de la norma a propósito.

### [MENOR] El hash del contrato se guarda y no lo lee nadie — `contrato/[token]/actions.ts:185` · `contractPdf.tsx:230`

`doc_hash` es el SHA-256 del PDF firmado. Se calcula, se guarda en la fila, se manda en los
dos correos… y **no se vuelve a leer jamás**. Buscado en todo `src/`: las únicas apariciones
son las dos escrituras, la declaración de tipo de `contractActions.ts:53` y la línea del PDF.
No hay ninguna pantalla, acción ni script que recalcule el hash del archivo de Storage y lo
compare con el de la base. Es decir: la plataforma **produce** la prueba de integridad y no
tiene forma de **usarla**. Si algún día hiciera falta responder «¿este PDF es el que se
firmó?», hay que hacerlo a mano por fuera.

Y la línea del sello que lo imprimiría —`{signature.doc_hash && <Text>Huella SHA-256 del
documento aceptado: …</Text>}` (`contractPdf.tsx:230`)— **nunca se dibuja**, porque al firmar
se pasa `doc_hash: null` a propósito (`actions.ts:151`). Eso último es correcto y no tiene
arreglo: el hash es del propio PDF, así que no puede ir dentro de él sin cambiarlo. Pero deja
una condición muerta en la plantilla que puede confundir a quien la lea. El destinatario sí
puede comprobarlo: el correo le da la huella y él tiene el PDF adjunto.

**Propuesta:** un botón «Verificar integridad» en la tarjeta del contrato que baje el archivo,
lo hashee y diga si coincide — son cinco líneas con `sha256Hex()`, que ya existe—, y un
comentario en `contractPdf.tsx:230` explicando por qué esa condición nunca se cumple al
firmar.

### Lo que sí está bien: la firma aguanta como prueba

Fui a buscarle los agujeros clásicos y no los tiene. Es el trabajo más sólido de la
plataforma, así que va con detalle:

- **La constancia es completa y está en el propio documento.** El sello del PDF
  (`contractPdf.tsx:217-232`) imprime, bajo el título «Constancia de firma electrónica — Ley
  527 de 1999 / Decreto 2364 de 2012»: firmante, tipo y número de documento, **fecha y hora
  con zona horaria explícita** (`America/Bogota`), **dirección IP** y **dispositivo**
  (user-agent). En la base quedan además `signature_image`, `signed_at`, `signer_ip`,
  `signer_user_agent`, `doc_hash` y el `signed_pdf_path`. Verificado en producción: los **3**
  contratos firmados tienen los tres su IP, su hash y su pasaporte. Ninguno a medias.
- **«Sobre qué texto exacto» tiene respuesta, y es la buena.** El PDF firmado se renderiza en
  el servidor con las cláusulas de `contractClauses(v, plan)` y se guarda entero en
  `comercial-contracts`; el hash es de ese archivo. Lo importante: la **autorización de
  tratamiento de datos** no es solo el texto del checkbox —que vive en el JSX y cambiaría con
  un deploy—, sino una **cláusula del contrato** (`template.ts:262`), completa, con la
  transferencia internacional a España, la Ley 1581, el Decreto 1377 y la mención a la SIC. O
  sea que va dentro del PDF hasheado y firmado. Ese era el hueco que esperaba encontrar y no
  está.
- **Un contrato firmado es inmutable desde el CRM.** `contractActions.ts` tiene **siete**
  guardas `status === "firmado"` (líneas 299, 349, 401, 470, 582, 604 y el filtro de 342),
  una en cada camino que podría tocarlo: editar variables, editar en lote, regenerar el PDF,
  reenviar, y anular el enlace. Y `generateContractPdf` escribe en el nombre **sin** sufijo
  `-firmado`, así que ni por accidente puede pisar el documento firmado.
- **No se puede firmar dos veces ni fuera de plazo.** La acción revalida **en el servidor** lo
  mismo que la página —existencia, `status === "enviado"`, expiración— en vez de fiarse del
  render (`actions.ts:79-84`), y el cierre es un `update … .eq("status", "enviado")`
  condicional (línea 190): dos envíos simultáneos y el segundo no encuentra fila que
  actualizar. Es el patrón correcto y es raro verlo.
- **El rate limit está bien pensado y documentado.** Va por **token** (8/hora), que es lo que
  frena la fuerza bruta contra un contrato concreto, y por IP con un tope holgado (120/hora)
  con el motivo escrito: un grupo que firma desde el mismo WiFi no puede quedar bloqueado en
  el viajero 11. Comparte con `/cotizar` el `hits.clear()` al pasar de 5000 claves, que B1 ya
  anotó como reset gratis; aquí importa menos porque el token es de 256 bits y no hay nada que
  adivinar.
- **Las entradas están validadas de verdad**: tipo MIME del pasaporte contra una lista blanca
  (con HEIC contemplado, «algunos Android lo mandan tal cual»), 12 MB de tope, la firma tiene
  que ser un `data:image/png;base64,` de menos de 400.000 caracteres, y nombre y documento con
  longitud mínima. El `bodySizeLimit: "15mb"` de `next.config.ts` está puesto con el caso real
  documentado: «por ahí se cayó la primera firma real».
- **La ficha del viajero se actualiza con el nombre y el pasaporte reales**, y si eso falla se
  registra pero **no se invalida la firma** (`actions.ts:196-207`), con el criterio escrito.
  Es la decisión correcta: una firma registrada no se puede tumbar por un efecto secundario.

### Lo que sí está bien: las tres rutas por token

Es el bloque mejor construido de lo auditado hasta ahora, y conviene dejarlo dicho con
detalle porque son las tres puertas sin sesión de la plataforma.

- **Entropía sobrada.** `randomBytes(32).toString("hex")` en los tres generadores
  (`contracts/render.ts:167`, `travelDocs/render.ts:22` y el de correo): **256 bits**, 64
  caracteres hex. No hay nada que adivinar, y las tres páginas rechazan de entrada cualquier
  token de menos de 32 caracteres antes de tocar la base.
- **Los tres buckets sensibles son privados.** Verificado en `storage.buckets`: los nueve
  `comercial-*` —incluido `comercial-passports`— tienen `public = false`. Los únicos públicos
  son los tres del Estudio de Contenido, que está fuera de alcance.
- **Nada se sirve desde Storage directamente.** El descargador
  (`documentacion/[token]/descargar/[doc]/route.ts`) valida el token, comprueba `revoked_at`,
  y **firma la URL en ese momento con 60 segundos de vida**, lo justo para el redirect. El
  enlace que el peregrino tiene en el correo es estable y no caduca; lo que caduca es la
  firma. Es la solución correcta al problema que el propio archivo explica en su cabecera.
- **`/correo/[token]` sirve el HTML exacto que se envió**, guardado en `email_log`, y no lo
  vuelve a armar — con el motivo escrito: si se regenerara, un cambio de plantilla haría que
  esa página dijera algo distinto de lo que el cliente tiene en su bandeja, y en el caso de la
  cotización ese correo **es la oferta comercial**. Encima lo sirve con `default-src 'none'`.
  Es criterio de oficio, no de programador.
- **Caducidad y revocación, cada una donde toca.** El contrato tiene `token_expires_at` y se
  puede anular a mano (`contractActions.ts:607` pone `token: null` y devuelve el contrato a
  `borrador`). La documentación de viaje **no caduca a propósito** —el peregrino la abre
  durante el viaje y meses después— y a cambio tiene `revoked_at`, que las dos rutas
  comprueban.
- **No se filtran datos de terceros.** `ContractVariables` es de **un** viajero: nombre,
  documento, correo, teléfono y dirección suyos, más los datos del viaje que comparte el
  grupo (ruta, fechas, personas, total). Un viajero de un grupo de 14 no ve el pasaporte, el
  correo ni el teléfono de los otros trece. Y los nombres de archivo de Storage no llevan
  datos personales: el pasaporte se guarda como
  `comercial-passports/2026/CS-2026-034/Pasaporte-CS-2026-034-{marca}.jpg` —código y marca de
  tiempo, ningún nombre— mientras la atribución al viajero vive en
  `contracts.passport_path`, que es donde debe estar.
- **`PUBLIC_PATHS` de `proxy.ts:19-22` está cuadrado** con las rutas que existen: `/contrato`,
  `/documentacion` y `/correo` están, y el `some()` compara `path === p || path.startsWith(p + "/")`,
  así que no hay prefijos colados de más.

---

## Arreglos aplicados

_(Solo lo pequeño y reversible. Un commit por arreglo.)_

---

## Crítica del experto

`Estado: hecho` — tercer agente crítico (los dos primeros murieron por el límite de gasto).
**Los cinco puntos están cerrados y el veredicto es `revisar`** (al final de la sección).

**Resumen:** los números del auditor son exactos, pero tres etiquetas están mal puestas, tres
afirmaciones del informe son falsas o imprecisas, y faltan ocho hallazgos (cuatro de código, cuatro
de oficio).

Plan de verificación, en este orden; cada punto se escribe aquí en cuanto se cierra:

1. **GRAVE de Storage** — rehacer el recuento de huérfanos contra `storage.objects` cruzando las
   **cinco** columnas de ruta (`contracts.passport_path/signed_pdf_path/pdf_path`,
   `travel_docs.*_pdf_path`, `client_payments.receipt_path`, `quote_pilgrim_files`, `quotes.*`) y
   decidir si GRAVE aguanta con buckets privados y sin filtración.
2. **Las dos fechas de regreso** (CS-2026-080 y CS-2026-081) — aritmética `fin = salida + etapas + 1`
   contra `route_stages`, y de dónde viene el descuadre: itinerario del catálogo o `end_date`.
3. **Umbrales de maquetación de B3.3** — renderizar de verdad y afinar el corte entre 51 y 65
   caracteres que el auditor dejó sin afinar.
4. **Lo que el auditor no miró** — viajeros sin contrato, tokens de `travel_docs` (colisión,
   revocación, reutilización), `email_log` tras el borrado, y el hueco entre `quote_travelers` y
   `contracts`.
5. **Oficio** — qué trae de serie un CRM de agencia en contratos y documentos que aquí falta y le
   cueste caro a una agencia de dos personas (contra `CRITERIOS.md`).

La nota original del auditor, que se conserva porque explica por qué esta sección estaba vacía:

> **la dejo sin empezar a propósito.** La auditoría de B3 la escribió este
mismo agente en esta misma sesión, y criticarse a uno mismo no tiene independencia: repetiría
los mismos puntos ciegos y daría por buena la misma evidencia. Que la haga un agente distinto,
como en B1 y B2. Lo que más agradecería que le miren:

- El **GRAVE de Storage**: verificar el cruce (2 pasaportes y 4 contratos de cotizaciones
  borradas) y decidir si la etiqueta GRAVE aguanta, dado que los buckets son privados y no hay
  filtración — mi argumento es la promesa de supresión del contrato firmado, no la exposición.
- Las **dos fechas de regreso** (CS-2026-080 y CS-2026-081): comprobar la aritmética
  `fin = salida + etapas + 1` contra `route_stages`, y si el descuadre es del itinerario del
  catálogo o del `end_date`.
- Los **umbrales de maquetación** de B3.3: los medí renderizando, pero el corte exacto entre 51
  y 65 caracteres no lo afiné.

---

### 1. El GRAVE de Storage: los números son exactos, pero la etiqueta está en el hallazgo equivocado

**El recuento se sostiene, y lo hice más ancho que el auditor.** Él cruzó «cinco columnas de
ruta»; en `comercial` hay **trece** (`quotes`×2, `contracts`×3, `travel_docs`×3,
`client_payments`, `provider_payments`, `quote_pilgrim_files`, `route_catalogs`,
`welcome_letters`). Crucé las trece contra `storage.objects` y el resultado es **idéntico al
suyo, al archivo**:

| bucket | objetos | huérfanos | de ellos `CS-TEST` | huérfanos reales |
|---|---|---|---|---|
| `comercial-contracts` | 65 | 54 | 50 | **4** (CS-2026-044 y -048, firmado y sin firmar) |
| `comercial-passports` | 31 | 27 | 25 | **2** (CS-2026-044 y -048) |
| `comercial-quotes` | 46 | 3 | 0 | 3 (los tres `ZZ_Prueba` de agosto) |
| `comercial-docs` / `comercial-catalogs` | 12 / 8 | 1 / 1 | 0 | 0 — son los genéricos (`Asistencia-en-Viaje`, catálogo de bicis), no van atados a expediente |
| `comercial-hotel-fotos` | 32 | 32 | 0 | **0** |

Dos precisiones que hay que dejar escritas para que el siguiente no se asuste:

- **`comercial-hotel-fotos` no tiene huérfanos.** Sus 32 objetos no aparecen en ninguna columna
  de ruta porque se referencian desde el **jsonb** `hotels.photos`. Comprobado: los 32 están
  referenciados. Cualquier arqueo que se escriba tiene que contemplar ese jsonb o dará 32 falsos
  positivos y alguien borrará las fotos del catálogo.
- Los tres huérfanos de `comercial-quotes` no son daño: son PDF de cotizaciones de prueba
  (`ZZ_Prueba_Anio_2027`, `ZZ_Prueba_Arnes`) borradas a propósito.

**Lo que el auditor no midió y cambia la escala del problema:** se han emitido **83 códigos** y
quedan **45 cotizaciones**. O sea que en esta plataforma se han borrado **38 expedientes**.
Borrar no es el caso raro: es rutina. Un `deleteQuote` sin guardas que se usa 38 veces no es una
hipótesis de manual, es el botón que más se ha pulsado de los destructivos.

**Y una corrección al argumento, en contra del auditor:** él escribe *«las fotos del documento de
identidad de esas personas siguen ahí»*, dando por hecho que son dos peregrinos reales. Los dos
archivos pesan **exactamente 75.368 bytes cada uno** y se subieron el mismo 24-jul-2026 con 45
minutos de diferencia (17:40 y 18:26). Es la misma imagen subida dos veces, en la tarde de la
ronda de pruebas de contratos por viajero. No es prueba concluyente, pero es un indicio fuerte de
que 044 y 048 fueron **expedientes de prueba con código real**, no clientes. La frase, tal como
está, exagera lo que la evidencia aguanta y hay que matizarla.

**Sobre la etiqueta: GRAVE se queda, pero pegada a otro hallazgo.** Contra la definición del
TABLERO —dinero, corrupción de datos, filtración, o algo que el cliente ve caerse— el archivo
huérfano no cumple ninguna: los buckets son privados (lo verifiqué), no hay pesos de por medio y
el cliente no ve nada. Lo que sí cumple, y de largo, es **lo que el borrado destruye**, que el
auditor filó como MEDIO:

> `deleteQuote` borra en cascada la fila de `contracts`, y con ella `signer_ip`, `signed_at`,
> `signature_image`, `signer_user_agent` y `doc_hash` — **la prueba de firma electrónica
> completa** que B3.2 celebra como lo mejor construido de la plataforma. Y borra
> `quote_travelers`, con los números de pasaporte. Verificado en `pg_constraint`: las diez FK
> hacia `quotes` son ocho `CASCADE` y dos `SET NULL`, y `contracts` es `CASCADE`.
> Lo que queda en Storage es un PDF firmado **sin atribución**: ninguna fila dice quién lo firmó,
> cuándo ni desde dónde. Eso ya pasó **dos veces** (los cuatro PDF de 044 y 048).

O sea: la plataforma dedica siete guardas `status === "firmado"` a que nadie toque un contrato
firmado desde el CRM… y deja que el botón de la papelera de la lista de Seguimiento lo borre
entero, con su prueba legal, tras un `confirm()` que no lo menciona. Esa asimetría es el hallazgo
GRAVE de este bloque.

**Propuesta de re-etiquetado (con evidencia, no de oficio):**

- *«Se puede borrar de un clic un expediente firmado y pagado»* → **de MEDIO a GRAVE**. Destruye
  una prueba legal irrecuperable y el registro contable de dinero cobrado (970 € y 860 € en dos
  de los tres expedientes vivos), sin guarda, sin aviso concreto y sin papelera. 38 borrados de
  historial dicen que el gesto es cotidiano.
- *«Borrar una cotización deja atrás el pasaporte y el contrato firmado»* → **de GRAVE a MEDIO**.
  El mecanismo es real y el recuento exacto, pero con buckets privados, sin filtración y con la
  evidencia apuntando a expedientes de prueba, lo que hay es una promesa de supresión que el
  software no puede cumplir y un almacén que nadie puede enumerar desde el producto. Es serio y
  hay que arreglarlo; no es de la misma familia que perder la prueba de una firma.

Las dos propuestas del auditor (leer las rutas hijas antes de borrar, y un arqueo de verdad)
siguen siendo las correctas. Que el arqueo contemple `hotels.photos` y los genéricos.

### 2. Las dos fechas de regreso: una no existe, la otra es mucho peor de lo que dice el informe

Comprobé la aritmética contra `route_stages` y `routes`, y el resultado corrige el hallazgo en
las dos direcciones.

**Primero, la fórmula del informe está incompleta.** No es `fin = salida + etapas + 1`, es
`fin = salida + etapas + 1 + noches_extra` (`quotePdf.tsx:510,517`: `days = stagesCount + 2 +
extraNights`). En estos dos casos no hay noches extra, así que el resultado no cambia; pero la
fórmula escrita así induce a error a quien la use para revisar otros expedientes.

**CS-2026-080 no tiene descuadre.** Su `start_date` es **2026-10-17**, no 2026-10-18. La ruta
`Costero desde Baiona` tiene 8 filas de itinerario: `Llegada a Baiona` (km nulo), 6 etapas con km
y `Santiago · Fin de servicios` (km nulo). O sea `stagesCount = 6`, `days = 8`,
`fin = 17 oct + 7 = **24 oct**` — exactamente el `end_date` guardado, y exactamente
`routes.days = 8 / nights = 7`. Cuadra todo. Aviso honesto: la cotización tiene
`updated_at = 2-sep 13:44`, o sea que se tocó **después** de escribirse la auditoría, así que no
puedo distinguir entre «el auditor se equivocó de fecha de salida» y «alguien movió la salida un
día para que cuadrara». Lo segundo sería grave por otro motivo y conviene preguntárselo a Nico.

**CS-2026-081 sí, y el informe se queda muy corto.** El descuadre no es una línea de fechas: es
**el PDF entero vendiendo dos noches más de las que se cotizaron.**

`Costero desde Porto` tiene 14 filas: una de llegada (día 1, `km = '0'`, creada el 1-sep) y
**13 etapas con km**, y **le falta la fila de fin de servicios** que sí tiene Baiona. El
generador ignora las filas de la base y arma el itinerario él mismo —`Llegada` + las 13 etapas
caminadas + `Fin de servicios`— así que pinta **15 filas**. Y de `stagesCount` cuelga todo lo
demás del documento, no solo la portada:

| en el PDF de CS-2026-081 | lo que imprime | lo que se cotizó |
|---|---|---|
| línea de fechas de portada | 1 abr – **15 abr** | 1 abr – 13 abr (`end_date`) |
| cuadro de stats | **15 DÍAS / 14 NOCHES** | 13 días / 12 noches (`routes.days/nights`) |
| tabla de itinerario | **15 filas**, con alojamiento nombrado en 14 | 12 noches |
| «Qué incluye» (`quotePdf.tsx:690`, `INCLUIDO_DEFAULT(nights)`) | «**14 noches** en acomodación privada con baño privado» y «**14 desayunos** incluidos» | 12 y 12 |

Esa cotización está **`enviada`**, son 2 personas a 1.450 € y su PDF está en Storage
(`CS-2026-081_Heidy_Carstens_Costero_desde_Porto.pdf`). O sea que hay una oferta comercial en el
correo de una clienta que promete por escrito **dos noches de alojamiento y dos desayunos que
nadie coticó, nadie pidió a Pilgrim y nadie pagó**, con el hotel de cada una nombrado en la
tabla. Si la clienta acepta y se planta en Padrón la noche del 14, la diferencia la pone Camino
Sacro. Eso ya no es «dos fuentes de verdad para una fecha»: es dinero.

**Y no son dos casos: son trece rutas.** Crucé `routes.days` contra `stagesCount + 2` en las 22
rutas que tienen itinerario cargado. **Trece no cuadran**:

| desfase | rutas |
|---|---|
| **+3** | `Francés desde Ponferrada` |
| **+2** | `Costero desde Porto`, `Francés desde Astorga`, `Burgos`, `León`, `Logroño`, `Pamplona`, `Saint Jean Pied de Port`, `Inglés desde A Coruña`, `Portugués desde Lisboa`, `Primitivo desde Oviedo` |
| **+1** | `Camino Portugués - Viana do Castelo (personalizada)`, `Costero desde Vigo` |
| **−4** | **`Portugués desde Porto`** (el catálogo dice 12 días; el PDF pintaría 8) |
| 0 | las otras 9 |

Lo que ha salvado a la plataforma hasta hoy es la suerte: de las **seis** rutas que alguna vez se
han cotizado, cinco están en el grupo que cuadra. La primera cotización de `Portugués desde
Porto` sacará un PDF que le promete al cliente **cuatro días menos** de Camino que los que
cobra —o, en las de +2, dos noches de más—. No hay ninguna alerta, ninguna validación y ningún
sitio donde eso se vea antes de que el PDF salga por correo.

**Dónde está el error: en el itinerario del catálogo, no en `end_date`.** El `end_date` de las dos
cotizaciones es coherente con `routes.days/nights`, que es lo que se usó para poner el precio. La
convención buena está en `Costero desde Baiona` y en las nueve que cuadran: la fila de llegada y
la de fin **existen en `route_stages` con `km` nulo**, y `stagesCount + 2` las recupera. Las trece
descuadradas cargaron solo las etapas caminadas. `Costero desde Porto` está a medias: alguien le
metió la fila de llegada el 1-sep (con `km = '0'` en vez de nulo, que por suerte el filtro
`km > 0` también descarta) y no le puso la de fin.

**Re-etiquetado propuesto:** *«El PDF de la cotización dice un día de regreso y la base dice
otro»* → **de MEDIO a GRAVE**, y reescrito, porque el título describe un síntoma menor del
problema. Lo que hay es: un PDF ya enviado que promete alojamiento no cotizado, y trece rutas del
catálogo armadas para repetirlo. Se pierde **dinero** y se pierde **la confianza de alguien que
ya recibió una oferta**, que son dos de las cuatro puertas de GRAVE del TABLERO.

**Propuesta (no se toca: cambia lo que dice un documento ya enviado y toca el catálogo):**
1. Completar `route_stages` de las 13 rutas descuadradas con sus filas de llegada y fin en `km`
   nulo — es dato, no código, y es una migración.
2. Una validación que impida generar el PDF cuando `stagesCount + 2 ≠ routes.days`, con el aviso
   en el CRM diciendo qué ruta arreglar. Es la red que hace falta igual, porque las rutas
   personalizadas se cargan a mano.
3. Avisar a la clienta de CS-2026-081 antes de que acepte, y decidir con Nico qué se hace con esa
   oferta.

### 3. Los umbrales de maquetación: el número es bueno, la descripción no

Rendericé el Documento de Viaje con `@react-pdf` a doce longitudes de nombre de ruta, con el
**nombre de cliente más largo que existe hoy** (35 caracteres) y un correo de 32, y medí las cajas
con `pdftotext -bbox` en vez de mirarlas. Resultado:

| caracteres del nombre de ruta | ¿se pisan? | ¿se sale del margen derecho? |
|---|---|---|
| 51 (`Camino Portugués - Viana do Castelo (personalizada)`, el más largo real) | no, sobran 35 pt | no |
| 55 | no, sobran 9 pt | no |
| **56** | al filo (1,5 pt) | **sí, +0,2 pt** |
| **58** | **sí, +7,5 pt** | sí, +4 pt |
| 65 (el ejemplo del auditor) | sí | sí, +8 pt |
| 74 | sí | **+29 pt: el bloque del cliente se sale del papel** (A4 mide 595,3 pt y el texto llega a 592) |
| 78 | — | **+35 pt: el correo queda cortado por el borde de la hoja** (llega a 598,2) |

**El umbral exacto está entre 56 y 58 caracteres**, no «unos 60»: el auditor lo estimó a ojo y se
quedó a dos caracteres. Buen ojo — el hallazgo es correcto y el margen real hasta el catálogo de
hoy es de **cinco caracteres**, no de nueve. Con un nombre de cliente más corto el umbral sube;
con uno más largo baja. O sea que el defecto no es «una ruta de más de 60», es «ruta + cliente que
juntos pasan de ~92 caracteres», y **ninguno de los dos campos tiene tope** (B1 ya lo dejó dicho).

Dos correcciones a la descripción, una que resta y otra que suma:

- **Resta: no es «la cabecera que se repite en todas las páginas».** La cabecera `fixed` es
  `PageHeader` de `pdfChrome.tsx:76`, y solo lleva «Camino Sacro» y el número de página; esa está
  bien. El bloque que se rompe es el `clientBar` de `travelDocPdf.tsx:476`, que aparece **una sola
  vez, en la página del itinerario**. La frase «la cabecera rota se repite en todas sus páginas»
  del informe es falsa y hay que quitarla: es el argumento con el que se justifica la etiqueta.
- **Suma: el solape no es el peor de los dos fallos.** Antes de pisarse, el bloque del cliente
  **se va por fuera del margen derecho**, y a partir de ~74 caracteres se sale del papel: el
  teléfono y el correo del cliente quedan cortados por el borde de la hoja, no tapados por otro
  texto. Eso el auditor no lo vio, y es lo que de verdad se lleva un dato por delante. Viene de
  que `clientBar` es un `flexDirection:"row"` con `justifyContent:"space-between"` y ningún hijo
  con ancho máximo: en Yoga, sin `flexShrink`, la columna derecha se desplaza fuera de la caja en
  vez de comprimirse.

**Etiqueta: se queda en MEDIO**, pero por otro motivo del que dice el informe. Pierde fuerza (es
una página, no todas) y gana precisión (se pierde el teléfono y el correo del cliente por el borde
del papel, en el documento que el peregrino lleva en el Camino).

La propuesta del auditor (`maxLines` con elipsis o ancho fijo a las dos columnas) es la correcta;
añadiría **`flexShrink: 1` y un `maxWidth` a la columna derecha**, que es lo que impide el
desborde del papel aunque el nombre de la ruta se recorte bien.

**Lo del guionado, confirmado.** `grep -rn "registerHyphenationCallback" src/ scripts/` no devuelve
nada: el corte de palabra por guion está activo en los cinco generadores. La propuesta de una línea
sigue en pie y es de las pocas de este bloque que se pueden aplicar sin decidir nada con Nico.

### 4. Lo que el auditor no miró: cuatro huecos, y dos cosas que están mejor de lo que parecen

Miré las cuatro cosas del plan. **Dos están bien resueltas** y hay que decirlo, porque el
siguiente que pase no tiene por qué volver a gastarse el presupuesto en ellas:

- **El hueco entre `quote_travelers` y `contracts` está tapado, y bien.** La FK es
  `contracts_traveler_id_fkey … ON DELETE CASCADE`, o sea que borrar un viajero se llevaría por
  delante su contrato firmado. `saveTravelers` (`contractActions.ts:91-108`) lo sabe: lee los
  `traveler_id` que ya tienen contrato, los mete en un `Set` de protegidos y **se niega a
  borrarlos**, devolviendo un aviso que la tarjeta enseña. Está comentado en el código con el
  motivo exacto. Es de lo mejor pensado del bloque.
- **Los tokens de `travel_docs` no tienen ningún agujero.** 32 bytes de `randomBytes` (256 bits,
  `render.ts:22`), `travel_docs_token_key` **único** en la base (colisión descartada, no por
  probabilidad sino por constraint), `revoked_at` que la página pública comprueba
  (`documentacion/[token]/page.tsx:49`) y `rotateTravelDocToken` que emite uno nuevo y deja el
  viejo muerto. Que **no caduquen es deliberado y correcto**: el peregrino abre esa página
  durante el Camino y meses después. Único ruido: `travel_docs_token_idx` es un índice btree
  sobre `token` **duplicado** del `travel_docs_token_key` que ya existe — sobra, cuesta
  escrituras y no aporta nada.

Y **el cron de recordatorios existe y está bien hecho**, cosa que la auditoría no menciona en
ningún sitio: `api/cron/recordatorios-contrato/route.ts` reenvía el enlace cada 4 días hasta 5
veces, con tono creciente, **renovando el vencimiento del token en cada envío** (que era la
trampa evidente: insistir hasta el día 20 con un enlace que muere el 21) y disparando un aviso
interno en el último. Eso cubre el punto 3 de `CRITERIOS.md` mejor que la mayoría de lo que he
visto en este bloque.

Ahora los cuatro huecos.

#### 4.1 · El contrato es el único correo que no deja rastro

`lib/contracts/email.ts:11` llama directo a `enviarCorreoWebhook` y **nunca a `registrarEnvio`**.
Los otros tres emisores sí lo hacen: `lib/quotes/clientEmail.ts:146`,
`lib/quotes/sendPilgrimEmail.ts:115`, `lib/travelDocs/email.ts:222`. O sea que de los cuatro
tipos de correo, el único que **no** se anota en `comercial.email_log` es justo el que tiene valor
legal y el que más veces se manda (el envío inicial más hasta cinco recordatorios automáticos:
seis correos por viajero, todos invisibles). Verificado en producción: las 12 filas de `email_log`
son `tipo` `cliente` y `documentacion`; **cero de contrato**, con cinco contratos enviados.

Tres consecuencias, todas reales:

- **El panel de correos del expediente miente por omisión.** `seguimiento/[id]/page.tsx:190` lee
  `email_log` para pintar el «enviado / sin enviar» de cada tarjeta; los contratos nunca aparecen
  ahí. Si Johana dice «no me llegó nada», no hay a qué dirección se mandó, ni cuándo, ni el
  `message_id` de Brevo, ni versión web. Solo `sent_at`. Eso es exactamente lo contrario del
  punto 7 de `CRITERIOS.md`.
- **El «✓ enviado» no comprueba nada.** `sendContractLink` (`contractActions.ts:477-493`) escribe
  `status: "enviado"` y `sent_at` **antes** de intentar el correo, y no los revierte si el webhook
  falla. La tarjeta sí avisa en el momento («El correo no salió, envíale este link…»,
  `ContractCard.tsx:652`), pero es un toast: mañana la base dice «enviado el 31 de agosto» y nadie
  puede distinguir un envío bueno de uno que reventó. Los otros tres correos sí guardan
  `estado: 'error'` con el mensaje.
- **Los recordatorios automáticos fallan en silencio.** El cron, ante un fallo, hace
  `console.error` y no marca el recordatorio para reintentar mañana (`route.ts:196`) — decisión
  correcta —, pero como tampoco escribe en `email_log`, un webhook caído cinco días seguidos no
  deja ni una línea que alguien vaya a mirar.

**[MEDIO] Propuesta:** llamar a `registrarEnvio` desde `enviarCorreoContrato` con
`tipo: 'contrato'`, igual que los otros tres, y mover `sent_at`/`status` a después de que el envío
confirme. Es el arreglo más barato de todo el bloque y desbloquea de paso la versión web
(`/correo/[token]`) para el contrato.

#### 4.2 · Un viaje pagado entero puede salir sin la firma de la mitad del grupo, y no se ve desde el listado

Los tres expedientes vivos con contrato están **los tres en `pago_completo`**, y en **dos de ellos
falta una firma**:

| expediente | sale | viajero | contrato | firmado |
|---|---|---|---|---|
| CS-2026-004 | 22-sep-2026 | Isabel Beatriz Londoño Cataño | firmado | 31-ago |
| CS-2026-004 | 22-sep-2026 | **Johana Marcela Giraldo** | **enviado** | **—** |
| CS-2026-019 | 13-oct-2026 | **Carlos Mario Serna Carmona** | **enviado** | **—** |
| CS-2026-019 | 13-oct-2026 | Marcela Villada Vargas | firmado | 2-sep |
| CS-2026-034 | 24-sep-2026 | Amalia Matallana | firmado | 28-jul |

El estado de venta llegó a **pago completo** sin que nadie firmara nada, y ningún estado, aviso ni
guarda lo comenta. Dentro del expediente la tarjeta sí lo dice bien (`ContractCard.tsx:234`:
«1 de 2 firmado(s) · N viajero(s) sin contrato») — eso está bien resuelto y hay que reconocerlo.
El problema es que **hay que entrar expediente por expediente para verlo**:
`seguimiento/page.tsx` **no consulta `contracts` en absoluto**, así que la lista de Seguimiento,
que es la pantalla donde se vive, no distingue un viaje firmado de uno que no.

Y el cron de recordatorios, que es la red, **ignora la fecha de salida**: su consulta filtra por
`status='enviado'` y `reminder_count < 5`, nada más (`route.ts:77-80`). La escalera se agota a los
~20 días del envío y después hay **silencio permanente**. En CS-2026-019 eso son 23 días de
silencio entre el último recordatorio (~20-sep) y la salida (13-oct), con el viaje pagado y sin
firmar. Si el contrato se manda tres meses antes, el silencio es de más de dos meses.

**[MEDIO] Propuesta** (dos cosas pequeñas, ninguna toca dinero):
1. Una columna o un punto en la lista de Seguimiento con «firmas: N/M», que es un `select` más en
   `seguimiento/page.tsx`.
2. Que el cron reabra la escalera cuando la salida se acerque —un recordatorio a T-15 y otro a
   T-5 aunque `reminder_count` esté al tope—, o al menos que mande el aviso interno. Hoy el
   límite de 5 es absoluto y no sabe si el viajero se va mañana.

#### 4.3 · Se puede reescribir el nombre y el documento de alguien que ya firmó

`saveTravelers` protege de **borrado** al viajero con contrato, pero el `update` de las filas que
sí se conservan (`contractActions.ts:126-128`) es incondicional: cambia `full_name`, `email`,
`phone` y `document_number` sin mirar el estado del contrato. El PDF firmado y su
`variables_json` son inmutables —la prueba legal aguanta, eso lo verificó B3.2—, pero a partir de
ese momento **el CRM enseña un nombre y un documento distintos de los del contrato que esa persona
firmó**, sin marca ni aviso. Un dedazo corrigiendo el apellido de la viajera 2 desalinea en
silencio el expediente respecto del documento con validez legal.

**[MENOR] Propuesta:** aplicar al `update` la misma lógica que ya existe para el borrado — si el
viajero está en `protegidos` y su contrato está `firmado`, o se rechaza el cambio de
`full_name`/`document_number`, o se avisa igual que con `bloqueados`. El `Set` ya está calculado
tres líneas más arriba.

#### 4.4 · `email_log` sobrevive al borrado, y su URL pública también

`email_log_quote_id_fkey` es `ON DELETE SET NULL` (los otros nueve hijos de `quotes` son
`CASCADE`). La decisión es deliberada y defendible —así el historial de correos no se evapora—,
pero al soltar el `quote_id` sobreviven **`code`, `destinatario`, `asunto`, `token` y `html`
completo**, y `/correo/[token]` (`route.ts:78`) sigue sirviendo ese HTML **para siempre**, sin
sesión, sin caducidad y sin comprobar que la cotización exista. El correo de cotización lleva
nombre, ruta, fechas y precios; el de documentación, el enlace a la documentación de viaje.

**Hoy no hay ni un caso**: las 12 filas de `email_log` son todas de septiembre —la tabla es de
esta semana— y ninguna tiene `quote_id` nulo. Pero en esta plataforma se han borrado **38
expedientes**, así que el primero que se borre a partir de ahora deja su rastro. Es exactamente la
misma promesa de supresión del contrato firmado que ya se le reprocha a Storage, en otra tabla.
No es exposición a terceros (el token es de 256 bits y solo lo tiene el destinatario), y por eso
no sube de etiqueta.

**[MENOR] Propuesta:** que `deleteQuote` anule `token` y `html` de las filas de `email_log` de esa
cotización antes de borrarla, dejando la fila (quién, qué, cuándo) que es lo que justifica el
`SET NULL`. Dos líneas, y encaja en el mismo sitio donde haya que meter el borrado de las rutas
hijas de Storage.

---

### 5. El listón del oficio: cuatro cosas que trae de serie un CRM de agencia y aquí no están

Filtradas contra `CRITERIOS.md`: nada de funciones de CRM corporativo, solo lo que **le cuesta
caro a una agencia de dos personas**. Cada una completa la frase «esto hace que se pierda ___».

#### 5.1 · Las condiciones del contrato viven en el código; las del documento de viaje, en la base

`lib/contracts/template.ts` son **330 líneas de TypeScript** con el articulado entero escrito
dentro: `contractClauses()` devuelve las dieciséis cláusulas, y la sexta —la política de
cancelación, con sus tramos de 60/16/15/11/10/6/5 días y sus penalidades del 15/50/80 %— está en
una plantilla de cadena en la línea 205. En Lemax, Tourwriter, Travefy o YouLi las condiciones
generales son **un documento editable con campos de fusión**, y cada contrato firmado guarda **qué
versión** se firmó.

Lo grave no es la incomodidad: es la **asimetría con el otro documento**. Los textos del Documento
de Viaje —incluidas sus `condiciones`— sí viven en `comercial.settings` y Nico los edita desde
Configuración sin desplegar (`lib/travelDocs/texts.ts:23`, migración 0030, y está documentado con
ese motivo). O sea que **Nico puede cambiar la mitad de las condiciones desde el CRM y la otra
mitad no**, y ya está anotado en el proyecto que las condiciones del documento tienen que cuadrar
con la cláusula sexta del contrato. La primera vez que Pilgrim mueva su política de cancelación,
lo que va a pasar es que se actualice el lado fácil y el contrato siga diciendo lo viejo. Eso es
«un dato, un sitio» roto en el peor sitio posible.

Y no hay `template_version` en `contracts`: dentro de dos años, la única forma de saber qué decía
la cláusula sexta el día que Amalia firmó es abrir su PDF de Storage —el mismo que, si alguien
borra el expediente, se queda ahí **sin una sola fila que diga de quién es** (los pasaportes se
guardan como `Pasaporte-CS-2026-004-<epoch>.jpg`, sin el nombre ni la posición del viajero, así
que en un grupo de cuatro solo la base sabe cuál es cuál… y la base es lo que se borra).
Se pierde: **la capacidad de cambiar sus propias condiciones sin programador**, y la trazabilidad
de qué se firmó.

**Propuesta:** mover el articulado a `settings` con la misma mecánica que `travel_doc` (misma
migración, misma pantalla de Configuración) y añadir `contracts.template_version`, que se sella al
generar el PDF. No es urgente; es lo primero que pediría un auditor externo.

#### 5.2 · No se guarda la caducidad del pasaporte, y es el dato que tumba un viaje entero

`comercial.quote_travelers` tiene once columnas y las de identidad son exactamente dos:
`document_type` y `document_number`. **No hay fecha de vencimiento del pasaporte, ni fecha de
nacimiento, ni nacionalidad.** Todos los CRM de la lista los piden, y todos avisan: un pasaporte
que caduca a menos de tres meses de la salida del espacio Schengen **no embarca**, y a un colombiano
volando a Madrid se lo dicen en el mostrador de El Dorado, no antes.

Lo que lo vuelve barato de arreglar es que **el dato ya está en casa**: el viajero sube la foto de
su pasaporte al firmar —es obligatorio, `contrato/[token]/actions.ts:98` lo exige y lo hace bien—.
Falta un campo, y falta que alguien lo mire. Hoy, si Johana firma en septiembre con un pasaporte
que vence en enero para un viaje de abril, en esta plataforma no hay absolutamente nada que lo
detecte.

Se pierde: **un viaje entero ya pagado**, y con él la relación con el cliente, porque el mostrador
de la aerolínea no distingue entre «no me lo pidieron» y «mi agencia no me avisó».

**Propuesta:** dos columnas en `quote_travelers` (`passport_expiry`, `birth_date`), pedidas en el
mismo formulario de firma donde ya se pide el número, y una alerta en el expediente cuando
`passport_expiry < start_date + 6 meses`. Es una migración, así que **se anota, no se toca**.

#### 5.3 · El cliente no tiene un sitio; tiene una colección de enlaces sueltos

Las tres rutas por token están bien construidas —eso ya lo dijo B3.1—, pero son **tres URL
distintas que llegan en tres momentos distintos**: `/contrato/<t>` en la venta, `/documentacion/<t>`
semanas después, `/correo/<t>` dentro de cada correo. Ninguna enlaza con las otras y ninguna tiene
puerta común. El punto 6 de `CRITERIOS.md` pide justo lo contrario: *«enlaces que no caducan, todo
en un sitio, sin pedirle que busque un correo de hace tres meses»*. La mitad está cumplida (los
enlaces de documentación no caducan, y eso es mérito); la otra mitad, no.

Travefy, YouLi y WeTravel dan un portal por reserva: un enlace, y dentro el contrato, los
documentos y los pagos. Aquí, el peregrino que en el aeropuerto no encuentra su documentación
tiene que buscar entre correos de meses atrás, y si no lo consigue **escribe a Nico o a Naty**, que
son dos personas y una de ellas está guiando. Ese es el coste medible: horas de soporte que se
podrían no gastar.

Se pierde: **tiempo de las dos únicas personas del negocio**, en el momento en que menos lo tienen.

**Propuesta barata (no es un portal):** que `/documentacion/[token]` —que ya es la página que el
cliente conserva— enseñe también su contrato firmado y el estado de sus pagos. El token del
expediente ya existe, es permanente y revocable. No hace falta nada nuevo.

#### 5.4 · No hay forma de modificar lo firmado: o miente el papel, o se pierde la firma

Un contrato firmado es inmutable —y bien, los siete guardas de `contractActions.ts` son de lo
mejor del bloque—. Pero **los viajes cambian**: se mueve la fecha, entra un acompañante, alguien
se cae del grupo, se añade una noche. Todo CRM de agencia resuelve esto con un **anexo o una
versión nueva del contrato** enlazada a la original, que se firma otra vez y deja el rastro de qué
cambió y cuándo.

Aquí no existe esa figura, y las tres salidas posibles son todas malas: (a) dejar el contrato
diciendo algo que ya no es cierto —que es exactamente el efecto del MEDIO de `variables_json`, la
«foto fija» que solo se refresca a mano—; (b) borrar y rehacer, que destruye la prueba de firma
(el GRAVE del punto 1); o (c) no cambiar nada y arreglarlo por WhatsApp, que es lo que de verdad
va a pasar. Y como `contracts.traveler_id` es **único** en toda la tabla, un mismo viajero no puede
tener nunca dos contratos: la puerta al anexo está cerrada también en el esquema.

Se pierde: **la confianza de alguien que ya pagó**, el día que reclame apoyándose en un papel que
dice lo que se acordó en marzo y no lo que se acordó en junio.

**Propuesta:** un `parent_contract_id` y un `version` en `contracts`, con el `traveler_id` único
sustituido por único-sobre-la-versión-vigente. Es una migración y toca estados de venta: **se
anota y se decide con Nico.** Lo que sí se puede hacer ya, y es la mitad del valor, es que la
tarjeta **avise cuando `variables_json` no cuadre con la cotización** en vez de esperar a que
alguien pulse el botón de refrescar.

---

## VEREDICTO: revisar

La auditoría de B3 es **buena y honesta**: los recuentos de Storage son exactos al archivo, las
cascadas están bien leídas, la firma como prueba está bien juzgada y los cinco generadores se
renderizaron de verdad. Pero cinco cosas no pueden quedarse como están.

**Huecos concretos para la ronda de revisión, en orden de daño:**

1. **Re-etiquetar tres hallazgos** (evidencia en los puntos 1 y 2 de esta crítica):
   - «Se puede borrar de un clic un expediente firmado y pagado» → **MEDIO a GRAVE**.
   - «El PDF de la cotización dice un día de regreso y la base dice otro» → **MEDIO a GRAVE**,
     y **reescrito**: el título describe el síntoma menor. Lo que hay es un PDF ya enviado
     (CS-2026-081, 2 personas × 1.450 €) que promete **dos noches y dos desayunos que nadie
     cotizó**, y **trece rutas del catálogo** armadas para repetirlo.
   - «Borrar una cotización deja atrás el pasaporte y el contrato firmado» → **GRAVE a MEDIO**.
2. **Corregir tres afirmaciones falsas o imprecisas del informe**, que son las que sostienen sus
   etiquetas:
   - **CS-2026-080 no tiene descuadre.** Su `start_date` es 2026-10-17 y todo cuadra. Hay que
     quitarla del hallazgo — y preguntarle a Nico por qué esa cotización se tocó el 2-sep 13:44,
     después de escrita la auditoría.
   - **La fórmula es `fin = salida + etapas + 1 + noches_extra`**, no la del informe.
   - **Ya no son «los 8 contratos de producción»** de B3.5: hoy la tabla tiene **5 contratos en
     3 expedientes, 3 firmados** (los de prueba se borraron entremedias). Quien revise que no se
     asuste al no encontrar los ocho.
   - **«La cabecera rota se repite en todas sus páginas» es falsa**: el bloque que se rompe es
     `clientBar` (`travelDocPdf.tsx:476`), que sale **una vez**. Y falta lo peor: por encima de
     ~74 caracteres el teléfono y el correo del cliente **se salen del papel**. Umbral exacto:
     entre **56 y 58** caracteres, no «unos 60».
3. **Subir a Hallazgos los cuatro nuevos del punto 4**, que no están en el informe:
   - **[MEDIO]** Los envíos de contrato no pasan por `email_log` — el único de los cuatro correos
     sin rastro, y el que más veces se manda.
   - **[MEDIO]** Nada avisa de que un viaje pagado sale sin firma: dos de los tres expedientes
     vivos están así, y `seguimiento/page.tsx` no consulta `contracts`.
   - **[MENOR]** `saveTravelers` reescribe nombre y documento de quien ya firmó.
   - **[MENOR]** `email_log` y su URL pública `/correo/[token]` sobreviven al borrado.
4. **Anotar los cuatro del punto 5** (oficio) donde corresponda: articulado del contrato en código
   mientras las condiciones del documento de viaje están en `settings`; sin caducidad de pasaporte;
   sin sitio único del cliente; sin anexos al contrato firmado.
5. **Los arreglos pequeños que quedan sin aplicar** (yo no los toqué: son código y el presupuesto
   se agota sin avisar). Por orden de relación coste/beneficio:
   - `registerHyphenationCallback(w => [w])` en los cinco generadores — una línea, mata el guionado.
   - `flexShrink: 1` + `maxWidth` en la columna derecha de `clientBar` — evita que los datos del
     cliente se salgan de la hoja.
   - `registrarEnvio(...)` dentro de `enviarCorreoContrato`, y mover `sent_at`/`status` a después
     de confirmar el envío.
   - Borrar el índice duplicado `travel_docs_token_idx` (ya existe `travel_docs_token_key`).
   - `Referrer-Policy` en las dos páginas públicas que no lo fijan.

Lo que **no** hay que tocar y conviene dejar dicho para que nadie lo "arregle": los dos `SET NULL`
de las cascadas son deliberados; que el enlace de documentación **no caduque** es correcto; el cron
de recordatorios está bien pensado (renueva el token en cada envío) y el aviso interno del último
recordatorio también; y `comercial-hotel-fotos` **no tiene huérfanos** — sus 32 objetos se
referencian desde el jsonb `hotels.photos`, y cualquier arqueo que no lo contemple dará 32 falsos
positivos.

---

## Revisión tras la crítica

`Estado: en curso` — una sola ronda, cerrando los cinco huecos del veredicto. Plan, en este
orden, escribiendo y commiteando por partes (el límite de gasto mata sin avisar):

1. **Subir a «Hallazgos» los ocho hallazgos nuevos** de la crítica (los cuatro de código del
   punto 4 y los cuatro de oficio del punto 5), con el formato del TABLERO, para que B8 los vea
   sin leerse la crítica entera.
2. **Aplicar los tres re-etiquetados**: borrado de expediente firmado MEDIO→GRAVE, fechas del PDF
   MEDIO→GRAVE (reescrito), huérfanos de Storage GRAVE→MEDIO. Cada uno con una línea de por qué
   cambia.
3. **Corregir las cuatro imprecisiones del informe**: CS-2026-080 no descuadra, la fórmula lleva
   `noches_extra`, la cabecera rota sale una vez (`clientBar`) y no en todas las páginas, y hoy
   hay 5 contratos y no 8. Los números que caducan van fechados «al 2-sep-2026».
4. **Los cinco arreglos pequeños**: guionado de los PDF, `flexShrink` en `clientBar`,
   `Referrer-Policy` en las dos páginas públicas, `registrarEnvio` en el emisor del contrato
   (comprobando antes que no lo esté tocando la ronda de B4, para no duplicarlo) y el índice
   duplicado `travel_docs_token_idx`, que **es migración: se anota, no se toca**.
5. **Sección «Para Nico»** con lo que no se toca y decide él: los dos expedientes en
   `pago_completo` con un viajero sin firmar (urgente: CS-2026-004 sale el 22-sep), el
   `sent_at`/`status` que se escribe antes del envío, el articulado en TypeScript frente a las
   condiciones del documento de viaje en `settings`, y por qué CS-2026-080 se tocó el 2-sep 13:44.

_(Solo si el veredicto fue `revisar`. Una ronda.)_
