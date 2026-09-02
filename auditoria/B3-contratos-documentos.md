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
  `Estado: en curso` — políticas RLS de los doce buckets, cruce de los objetos reales de Storage contra las
  rutas guardadas en la base para encontrar huérfanos, qué borra `deleteQuote`, y el ciclo de vida del
  pasaporte (quién llega, por cuánto tiempo, y si queda copia tras borrar el expediente).
- **B3.5 Coherencia entre los tres documentos.** Cotización, contrato y documentación de viaje salen de los mismos datos: comprueba que dicen lo mismo (precio, fechas, personas, condiciones) en un expediente real.
  `Estado: pendiente`
- **B3.6 Qué pasa al borrar.** Borrar una cotización con contratos firmados, documentación enviada y archivos de Pilgrim. ¿Cascadas correctas? ¿Se puede borrar algo que no debería borrarse?
  `Estado: pendiente`

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

`Estado: pendiente`

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
