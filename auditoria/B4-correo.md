# B4 — Correo

**Cubre:** `lib/email/**`, `lib/quotes/{clientEmail,emailHtml,pilgrimEmail,sendPilgrimEmail}.ts`, `lib/contracts/email.ts`, `lib/travelDocs/{email,html}.ts`, `correo/[token]`, `api/cron/**`

**Por qué importa:** Todo el correo de la plataforma sale por un solo workflow de n8n. Si eso falla, no sale nada.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B4.1 El punto único de fallo.** Si n8n o Brevo caen, ¿qué ve quien pulsa enviar? ¿Hay reintento, cola o se pierde? Un `ok` que no prueba nada ya causó tres solicitudes dadas por enviadas que nunca llegaron.
  `Estado: hecho` — el emisor único está muy bien resuelto (nunca lanza, 45 s justificados, `messageId`
  como única prueba real), pero **cuatro de sus siete llamadores ignoran `messageId`**, que es justo lo que
  su documentación prohíbe. El peor es el del contrato firmado: reduce el envío a un booleano y, cuando
  falla, **le promete al viajero un correo que nadie va a recordar mandarle**.
- **B4.2 `email_log` sirve para lo que se creó.** ¿Registra todos los caminos? ¿Se puede reconstruir qué se mandó, a quién y con qué? El HTML guardado hace crecer la tabla: mira cuánto y si importa.
  `Estado: hecho` — lo que registra **sí sirve y está muy bien diseñado**, pero solo lo alimentan **3 de
  los 7 caminos**: en producción hay únicamente `cliente` y `documentacion`. Los tipos `contrato`, `lead`
  y `pilgrim` están declarados en el propio tipo y nunca se escriben. Y el peso del HTML **no importa**:
  11 kB de media, 160 kB la tabla entera; ni con mil correos al año llega a molestar.
- **B4.3 Plantillas y variables.** Una `{{variable}}` sin valor deja un hueco en el correo del cliente. Busca las que puedan quedar vacías y los textos que afirman cosas que ya no son ciertas.
  `Estado: hecho` — una variable sin valor se sustituye por **cadena vacía**, así que deja el hueco en la
  frase. En la plantilla activa hay cinco que pueden quedar vacías, y `armarCorreoCotizacion` es el único
  sitio de la plataforma que resuelve la ruta **solo por `route_id`**, que falta en 33 de 45 cotizaciones.
  Salva el caso real que esas 33 se mandan desde la tarjeta del CRM, que enseña el texto antes. Y la
  plantilla `recordatorio_pago` usa `{{saldo_eur}}`, que **no existe en ningún constructor de variables**.
- **B4.4 Que llegue y no a spam.** Versión en texto plano, tamaño, enlaces, remitente. SPF/DKIM no se pueden comprobar desde aquí: anótalo como verificación pendiente de Nico.
  `Estado: pendiente`
- **B4.5 El secreto compartido.** `QUOTE_EMAIL_WEBHOOK_SECRET` está en claro dentro del nodo de n8n. Evalúa el riesgo real y qué costaría mitigarlo. No lo cambies.
  `Estado: pendiente`
- **B4.6 El cron de recordatorios.** Qué pasa si corre dos veces el mismo día, si no corre, o si el envío falla a mitad de la lista. ¿Manda duplicados?
  `Estado: pendiente`

---

## Hallazgos

### [MEDIO] Al firmante se le promete un correo que nadie va a recordar — `lib/contracts/email.ts:11-14` · `contrato/[token]/SignForm.tsx:254-256`

`enviarCorreoContrato` es el envío de **la copia del contrato firmado al viajero**, y esto es
entero:

```ts
export async function enviarCorreoContrato(payload: CorreoContratoPayload): Promise<boolean> {
  const { ok } = await enviarCorreoWebhook(payload);
  return ok;
}
```

Tira las tres cosas que devuelve el emisor: el **`messageId`** (la única prueba de que Brevo
envió), el **`error`** (el motivo del fallo) y, al no llamar a `registrarEnvio`, **la fila en
`email_log`**. Queda un `true`/`false` sin historia.

Lo que pasa cuando es `false` es lo que lo hace un hallazgo y no una deuda de estilo. La
pantalla de firma es honesta y le dice al viajero:

> «La copia firmada quedó registrada; **te la haremos llegar por correo**.»

Es una promesa a una persona que acaba de firmar un contrato y de subir su pasaporte. Y
**no hay nada en la plataforma que la registre**: no queda fila en `email_log` (verificado:
cero filas de tipo `contrato` en producción), no hay columna en `contracts` que lo marque, no
hay aviso en el expediente y no hay cola de reintento. El único rastro es un `console.error`
en Railway que se pierde con el despliegue. Nadie va a enterarse nunca de que ese correo hay
que mandarlo a mano.

Y el fallo no es exótico: el propio `log.ts:63-73` documenta que Brevo rechaza con **400** los
adjuntos `heic`/`heif`/`webp` —«fotos de iPhone y de Android»— y que ese 400 «se lleva el
correo ENTERO por delante». El pasaporte del firmante puede ser exactamente uno de esos: la
lista blanca de `PASSPORT_TYPES` en `contrato/[token]/actions.ts:22-30` **acepta heic y heif**
a propósito. O sea que el camino está abierto de punta a punta: el viajero sube un HEIC, la
firma se registra bien, y el correo con su copia muere en Brevo sin que quede rastro.

**Propuesta:** que `enviarCorreoContrato` devuelva el resultado completo y llame a
`registrarEnvio` con `tipo: "contrato"` —que **ya está declarado** en `EnvioRegistrado`
(`log.ts:20`) y nunca se usa—, y que el expediente muestre en ámbar «la copia firmada no se
pudo enviar» mientras no haya una fila confirmada. Además, pasar los adjuntos por
`adjuntosNoSoportados()`, que ya existe y aquí no se llama.

### [MEDIO] Cuatro de los siete emisores dan por enviado lo que el módulo dice que no lo prueba — `cotizar/actions.ts:197`, `webQuote.ts:158`, `api/wp/lead/route.ts:151`, `contracts/email.ts:12`

`lib/email/webhook.ts` deja escrito, en mayúsculas, cuál es el contrato:

> «**OJO CON `ok`**: `ok: true` significa que el workflow terminó sin error. Lo que prueba que
> el correo salió es `messageId`. […] Si algún día vuelve a llegar `undefined`, quien llame
> debe registrarlo como **NO confirmado** en vez de dar el envío por hecho.»

Tres llamadores lo respetan y pasan el `messageId` a `registrarEnvio`, que lo convierte en el
estado correcto —`confirmado` si Brevo devolvió id, `aceptado` si no, `error` si falló
(`log.ts:41`)—. Es un diseño exacto y es lo mejor de este bloque.

Los otros cuatro desestructuran **solo `ok`** y tiran el resto:

| llamador | qué manda | qué hace con `ok: true` sin `messageId` |
|---|---|---|
| `webQuote.ts:158` | la cotización al cliente de WordPress | llama a `marcarCotizacionEnviada()` → el expediente queda **✓ Enviada** |
| `cotizar/actions.ts:197` | la cotización al visitante de la web | idem, y le dice al visitante que se la mandó |
| `contracts/email.ts:12` | la copia del contrato firmado | ver el hallazgo de arriba |
| `api/wp/lead/route.ts:151` | el aviso de lead a reservas@ | responde `emailSent: true` a WordPress |

Los dos primeros son los que B1 ya señaló por otro motivo (el PDF que falla y aun así se marca
`enviada`). Aquí el agujero es distinto y más fino: aunque el PDF esté perfecto, `ok: true`
solo dice que el workflow no reventó. La plataforma tiene la prueba en la mano —viene en la
respuesta— y estos cuatro la tiran a la basura.

**Propuesta:** que los cuatro pasen por `registrarEnvio` con su `tipo` (`cliente`, `contrato`
y `lead` ya están declarados), y que `marcarCotizacionEnviada()` distinga «enviada y
confirmada» de «aceptada sin confirmar», que es la diferencia entre saber y creer.

### [MEDIO] `email_log` solo ve la mitad del correo que sale — `lib/email/log.ts:20` vs los siete emisores

La tabla se creó (migración 0028) porque «"enviado" en el CRM no significaba nada
verificable». Cumple ese objetivo **para los caminos que la usan**, y el propio tipo
`EnvioRegistrado` declara los cinco que debería cubrir:

```ts
tipo: "cliente" | "pilgrim" | "contrato" | "lead" | "documentacion";
```

Pero `registrarEnvio` se llama desde **tres** sitios: `clientEmail.ts:146`,
`travelDocs/email.ts:171` y `sendPilgrimEmail.ts:115`. Los cuatro emisores del hallazgo
anterior no la tocan. En producción, el recuento completo de la tabla:

| tipo | filas | de ellas, pruebas |
|---|---|---|
| `cliente` | 5 | 2 |
| `documentacion` | 4 | 3 |
| **`contrato`** | **0** | — |
| **`lead`** | **0** | — |
| `pilgrim` | 0 | — (todavía no se ha mandado ninguno; ese sí está cableado) |

Que `contrato` y `lead` estén **declarados en el tipo y sin una sola escritura** es la prueba
de que no es una decisión de diseño: es una migración que se quedó a medias. Y el hueco duele
en el sitio más caro, que es el que ya expliqué arriba: del correo con la copia del contrato
firmado —el único documento legal que la plataforma le manda a alguien— no queda ni una fila.

Un efecto secundario que conviene ver: `/correo/[token]` (la versión web del correo) se sirve
desde `email_log.html`. Los cuatro caminos que no registran **no pueden tener versión web**,
así que si su HTML no se ve bien en Outlook no hay plan B. Hoy no se nota porque tres de esos
cuatro mandan texto plano, pero es la misma causa.

**Propuesta:** cablear los cuatro. Es una llamada a `registrarEnvio` en cada uno, la tabla y
la función ya existen, y los tipos ya están escritos.

### [MENOR] `armarCorreoCotizacion` es el único sitio que busca la ruta solo por `route_id` — `lib/quotes/quoteEmail.ts:41-46`

`renderTemplate` sustituye una variable sin valor por **cadena vacía**
(`lib/emailTemplate.ts:6-8`: `if (v == null) return "";`). No hay marcador, no hay aviso: el
hueco se queda en la frase. Es una decisión razonable —mejor un hueco que un `{{duracion}}`
crudo en el correo de un cliente— pero exige que las variables lleguen llenas.

En la plantilla activa `cotizacion_enviada` hay **cinco** que pueden quedar vacías, y así
saldría el texto:

| variable | cuándo queda vacía | cómo se lee |
|---|---|---|
| `{{dias_camino}}` | sin metadatos de ruta | «los  días de camino» |
| `{{duracion}}` | idem | «• Duración: » |
| `{{fechas_largas}}` | sin `start_date` o `end_date` (12 filas) | «• Fechas: » |
| `{{validez}}` | sin `valid_until` (10 filas) | «la cotización está vigente hasta el **.**» |
| `{{alojamiento_descripcion}}` | sin `modality` | «• Alojamiento: » |

La causa de las dos primeras es concreta y es lo que merece el hallazgo:
`armarCorreoCotizacion` solo mira `quote.route_id` para traer días y noches
(`quoteEmail.ts:41`). Si es `null`, `routeMeta` queda en `null` y las dos salen vacías.
**`route_id` es `null` en 33 de las 45 cotizaciones.**

Y lo llamativo es que **el resto de la plataforma sí sabe hacerlo bien**. En el mismo flujo,
`agentQuoteStatus.ts:70-73` resuelve la ruta con el patrón correcto —por id, y si no hay, por
nombre—, igual que `pdf.ts` y `editQuote.ts`. Y la propia tarjeta del CRM la resuelve **por
nombre** (`seguimiento/[id]/page.tsx:40`: `routes.find((x) => x.name === routeName)`). Es la
única función de las cuatro que no tiene el respaldo.

**Por qué es MENOR y no más, dicho con los datos:** las 33 sin `route_id` son **todas**
`source = 'interna'` (del asistente), y el correo de una cotización interna se manda desde la
tarjeta del CRM, que **renderiza el cuerpo y lo enseña en un cuadro editable antes de
enviar** — y esa tarjeta resuelve la ruta por nombre, así que ahí el texto sale completo. Los
tres caminos que envían **sin que nadie mire** (`webQuote.ts`, `cotizar/actions.ts` y el
borrador de BayMax) trabajan con cotizaciones que ellos mismos crearon, y esas **sí** tienen
`route_id`: verificado, las 5 de `wordpress` y la 1 de `baymax` lo tienen, junto con sus
fechas y su validez. O sea: el agujero está en el código y hoy la costumbre lo tapa.

**Propuesta:** una línea — el mismo respaldo por nombre que ya usa el archivo de al lado. Y
de paso, que `renderTemplate` registre en el log qué variables resolvió vacías, para que un
hueco no dependa de que alguien lo vea.

### [MENOR] La plantilla del recordatorio de pago usa una variable que no existe — `comercial.email_templates` (`recordatorio_pago`)

B2 dejó anotado que la plantilla `recordatorio_pago` está escrita, guardada y **sin un solo
llamador** en `src/`. Al leerla se ve algo más, y conviene decirlo antes de que alguien la
enchufe:

> «Pasaba a recordarte sobre el pago de tu Camino. Saldo pendiente: `**{{saldo_eur}}**`.»

**`saldo_eur` no existe en ninguno de los dos constructores de variables.** Buscada en todo
`src/`: aparece una sola vez, en `api/agente/cotizaciones/route.ts:117`, que es un campo del
JSON que se le devuelve a BayMax, no una variable de plantilla. Ni `buildTemplateVars`
(`seguimiento/[id]/page.tsx:98-115`) ni `armarVariables` (`quoteEmail.ts:119-136`) la
producen.

Como `renderTemplate` sustituye lo que no encuentra por cadena vacía, el correo saldría
diciendo:

> «Saldo pendiente: ****.»

—los asteriscos de la negrita, vacíos, y el punto—. A un cliente, pidiéndole plata. Quien
implemente la propuesta (c) de B2.7 tiene que añadir `saldo_eur` a los dos constructores
antes de activar nada. **Propuesta:** añadirla ya a los dos, que es donde se calcula el saldo
en ambas pantallas, para que la plantilla quede lista y no sea una trampa.

### [MENOR] La descripción de alojamiento solo reconoce la mitad de las etiquetas — `quoteEmail.ts:95-107` y su gemela en `page.tsx`

`{{alojamiento_descripcion}}` traduce la modalidad a una frase de venta («Pensión mayormente;
en las localidades sin disponibilidad de pensión, alojamiento en hoteles · Habitación
doble»). El `if` encadenado busca las cadenas `"pensión doble"`, `"pensión single"`,
`"hotel doble"` y `"hotel single"`.

Pero las etiquetas que la plataforma escribe de verdad son otras, y B1 ya documentó que hay
varias familias: el asistente y el cotizador web ponen **«Pensión, habitación doble»** —que
**no** contiene la subcadena `"pensión doble"`— y los grupos impares llevan **«Pensión · 1
doble + 1 individual»**. Ninguna de las dos entra por las ramas buenas: caen en el `else` y
el correo repite la etiqueta cruda en vez de la frase.

No se rompe nada —el respaldo es correcto y dice algo cierto— pero dos clientes con el mismo
alojamiento reciben descripciones distintas según por dónde se creó su cotización, y la que
explica el matiz importante («pensión mayormente; donde no haya, hotel») es la que casi nunca
sale. **Propuesta:** comparar contra el tipo y la habitación por separado, como ya hace
`modalityToSlug()` en el editor, en vez de contra la etiqueta completa.

### Lo que sí está bien: las plantillas y sus dos constructores

- **La plantilla vive en la base y se edita sin desplegar.** `cotizacion_enviada` está en
  `comercial.email_templates` con su `active`, y el comentario de `quoteEmail.ts:10-13` deja
  claro el porqué: «es el MISMO mensaje que el equipo ve en la tarjeta de correo del CRM: si
  se edita la plantilla allá, este correo cambia solo». Un texto, un sitio.
- **Hay respaldo si la plantilla desaparece**: `page.tsx:463` cae en un cuerpo mínimo pero
  correcto en vez de mandar un correo vacío, y `armarCorreoCotizacion` devuelve `null` —y no
  se manda nada— si falta la plantilla o la cotización, «el envío del correo nunca debe tumbar
  la creación de la cotización».
- **Los dos constructores de variables no han divergido.** El comentario avisa de que son
  réplicas («si se agrega una variable a las plantillas, hay que añadirla en ambos lados»), y
  lo comprobé clave por clave: los dos devuelven las **mismas 17**, y las dos únicas
  diferencias —`total_cop` y `trm`, que en el envío automático van vacías— están documentadas
  en la cabecera. Es duplicación consciente y hoy sana; el riesgo es que nadie la vigila.
- **Ningún texto de las dos plantillas afirma algo falso.** Repasadas frase por frase: el
  «Traslado de mochila incluido» del resumen es cierto para las rutas del catálogo (es parte
  del servicio base, no un opcional), y no hay promesas de plazos ni de condiciones que la
  plataforma no cumpla.

### Lo que sí está bien: lo que `email_log` registra, lo registra bien

Contestando directo a las tres preguntas de la tarea, dos son buenas noticias:

- **¿Se puede reconstruir qué se mandó, a quién y con qué?** Para los tres caminos cableados,
  sí y con detalle: destinatario, asunto, número de adjuntos, `message_id` de Brevo, estado,
  error, si fue una prueba, el token de la versión web y **el HTML exacto que salió**. El
  expediente lo lee y lo pinta (`seguimiento/[id]/page.tsx:190`). Es más de lo que suele haber.
- **El estado dice exactamente lo que se sabe**: `confirmado` solo cuando Brevo devolvió un
  `messageId`, `aceptado` cuando el workflow terminó pero no hay prueba, `error` cuando falló
  (`log.ts:41`). Esa distinción de tres valores es precisamente la lección del incidente que
  originó la tabla, y está bien implementada.
- **`registrarEnvio` nunca lanza** y lo dice: «un fallo del registro no puede tumbar un envío
  ni la operación que lo disparó». Si la migración no estuviera aplicada, sería un warning y
  nada más.
- **`adjuntosNoSoportados()`** es un acierto: lista blanca de las extensiones que Brevo acepta,
  con el motivo escrito —un `heic` devuelve un 400 que «se lleva el correo ENTERO por delante,
  no solo el adjunto», y con el webhook respondiendo antes de enviar eso se veía como
  «✓ Enviado»—. La función existe y está bien; lo que falta es que la llame el flujo de
  contrato (arriba).

**¿El HTML hace crecer la tabla? No, y con margen.** Medido en producción: 9 filas, **160 kB**
de tabla, HTML de **11 kB de media** y 14 kB el mayor. Aunque se manden mil correos al año,
son unos 11 MB anuales en una base que hoy pesa una fracción de eso. Guardar el HTML exacto
compra trazabilidad y la versión web; el coste es despreciable. **No hay que hacer nada**, y
conviene que quede dicho para que a nadie le entren ganas de podarla.

`lib/email/webhook.ts` es de lo mejor escrito de la plataforma y casi todo lo que uno iría a
buscarle ya está resuelto, con la fecha y el incidente que lo motivó anotados al lado:

- **Nunca lanza.** Devuelve `{ ok: false, error }` con un motivo legible, «el envío jamás debe
  tumbar la operación que lo dispara». Correcto: una cotización guardada con el correo caído
  es mejor que una cotización perdida.
- **El timeout es de 45 s y está justificado con el caso real**: el webhook responde *después*
  de llamar a Brevo, y Brevo se descarga los adjuntos de Supabase antes de enviar —el correo a
  Pilgrim puede llevar 20 pasaportes—. Con los 10 s de antes, «un envío lento abortaba acá y
  la app lo reportaba como fallido aunque el correo hubiera salido: el peor error posible,
  porque invita a reenviarlo». Es exactamente el razonamiento correcto.
- **`extraerMessageId` es tolerante a propósito** —objeto, arreglo de items, o el «Workflow got
  started» de siempre— y envuelto en `try/catch`: un cambio en la forma de la respuesta de n8n
  no puede romper un envío.
- **El aviso interno tiene un criterio escrito, no una casilla**: avisa lo que ocurre sin nadie
  mirando (una firma, el último recordatorio, un lead web) y calla lo que dispara una persona
  desde el CRM, que ya lo sabe. El prefijo `[CRM]` vive en el emisor único «para que ningún
  flujo nuevo pueda volver a chocar con el asunto del correo del cliente».
- **Si falta la variable de entorno o el correo del destinatario, no se intenta y se dice.**
- **Quien pulsa enviar ve el fallo.** Los mensajes llegan a pantalla y son legibles («El
  servicio de correo no respondió a tiempo»), y el firmante recibe un texto honesto cuando su
  copia no sale. No hay ningún camino que muestre «enviado» sobre un `ok: false`.

**No hay reintento ni cola, y para este tamaño está bien**: lo que dispara una persona falla a
la vista y se vuelve a pulsar. Donde eso no vale es en lo que corre solo —el cron— y eso lo
mira B4.6.

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
