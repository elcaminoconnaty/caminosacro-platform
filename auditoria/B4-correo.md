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
  `Estado: hecho` — la higiene de entregabilidad está bien: siempre viaja texto plano, el HTML es liviano
  (11 kB), sin imágenes remotas y con enlaces absolutos que no caducan. Dos cosas: el respaldo del dominio
  público es la URL de **Railway**, no `caminosacro.com`, y `scripts/n8n_correo_html.md` —la guía del único
  emisor de correo— **quedó desactualizada y su prueba de regresión hoy fallaría por diseño**. Al final,
  la lista de verificaciones que solo puede hacer Nico.
- **B4.5 El secreto compartido.** `QUOTE_EMAIL_WEBHOOK_SECRET` está en claro dentro del nodo de n8n. Evalúa el riesgo real y qué costaría mitigarlo. No lo cambies.
  `Estado: hecho` — el secreto en claro no es el problema principal: lo es **el radio de acción de quien lo
  tenga**. El nodo toma destinatario, asunto, cuerpo HTML y la **URL del adjunto** tal cual vienen del
  payload, sin ninguna lista blanca, así que ese secreto no abre «mandar cotizaciones»: abre **mandar
  cualquier correo, a cualquiera, desde `reservas@caminosacro.com`, con cualquier adjunto**. Y hoy es
  legible por API. Mitigación: dos cambios pequeños, ninguno tocado.
- **B4.6 El cron de recordatorios.** Qué pasa si corre dos veces el mismo día, si no corre, o si el envío falla a mitad de la lista. ¿Manda duplicados?
  `Estado: hecho` — **no manda duplicados en ninguno de los tres escenarios de la pregunta** y está
  claramente pensado: correrlo dos veces al día no repite, no correr no provoca una avalancha, y un
  contrato problemático no frena a los demás. El hueco es otro: **el marcado no está atado al envío**, así
  que si la escritura falla justo después de mandar, ese peregrino recibe el mismo correo **todos los días**
  y el tope de 5 nunca lo corta.

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

### [MENOR] La guía para parchear el único emisor de correo quedó desactualizada — `scripts/n8n_correo_html.md`

El workflow de n8n es el emisor único de **todo** el correo, y `update_workflow` por SDK
«descarta las credenciales de los dos nodos HTTP», así que los parches se pegan a mano
siguiendo esa guía. Es, literalmente, el procedimiento sobre el punto único de fallo de la
plataforma. Su apartado «Después de aplicarlo — probar la regresión» dice, en el paso 2:

> «Reenviar una **cotización** desde el CRM → debe seguir llegando **en texto plano**, con
> `Cotizacion-….pdf` adjunto.»

y remata: «Los tres últimos no mandan `html`, así que **si alguno cambia de aspecto, el parche
quedó mal pegado**.»

Eso ya no es cierto. El commit `bba0277` («El correo de la cotización también va maquetado,
con versión web») hizo que `clientEmail.ts:121` mande `html`, igual que el de documentación.
Con el parche bien pegado, la cotización **llega maquetada** — y la guía dice que eso
significa que está mal.

O sea: quien siga el procedimiento al pie de la letra concluirá que rompió el emisor único y
revertirá un parche correcto, apagando el HTML de los dos correos. **Propuesta:** actualizar
el paso 2 (la cotización ahora también va maquetada) y dejar la lista de «los que no mandan
`html`» reducida a contrato y Pilgrim. Es editar dos frases de un documento, no código.

### [MENOR] El dominio público de respaldo es el de Railway, no el de la marca — `lib/email/versionWeb.ts:25-28` · `contrato/[token]/actions.ts:258`

`baseUrlApp()` toma `APP_BASE_URL` y, si no está, cae en un literal:

```ts
return "https://caminosacro-platform-production.up.railway.app";
```

Y el aviso interno de la firma trae ese mismo host **escrito a fuego** en el cuerpo del
correo (`actions.ts:258`), sin pasar por ninguna función.

El correo sale de `reservas@caminosacro.com` y sus enlaces —la versión web, y en el flujo de
firma el enlace donde se pide **subir el pasaporte**— apuntarían a un `*.up.railway.app`. Un
dominio de enlace distinto al del remitente es una de las señales que pesan en los filtros de
correo, y para una persona que pasa el ratón por encima antes de subir su documento de
identidad, es exactamente la pinta de un fraude.

**Honestidad sobre el alcance:** no pude comprobar qué vale `APP_BASE_URL` en producción —leer
las variables de Railway está bloqueado desde aquí— así que **puede que hoy ya apunte a
`caminosacro.com` y esto sea solo el respaldo**. Lo que sí es seguro es que el literal del
aviso interno es la URL de Railway y que el respaldo del código también. Queda como
verificación de Nico, abajo. **Propuesta:** que el respaldo sea el dominio de marca y que el
aviso interno use `baseUrlApp()` en vez del literal.

### Verificaciones que solo puede hacer Nico

No se pueden comprobar desde aquí y conviene que queden apuntadas en un solo sitio:

1. **SPF, DKIM y DMARC de `caminosacro.com`** delegados a Brevo. Sin DKIM firmado por el
   dominio propio, Gmail marca «enviado por sendinblue.com» bajo el remitente, que es la
   pinta clásica de suplantación. Es la comprobación de más valor de esta lista.
2. **`APP_BASE_URL` en Railway**: que apunte al dominio de marca y no al `*.up.railway.app`
   (ver el hallazgo de arriba).
3. **Reputación del remitente en Brevo**: si `reservas@caminosacro.com` está verificado como
   remitente y qué tasa de rebote/spam lleva.
4. **Si el parche de HTML del workflow está pegado o no** (`scripts/n8n_correo_html.md`). De
   eso depende que el correo de documentación y el de cotización salgan maquetados o como un
   muro de texto. Se ve entrando al nodo «Validar y Preparar».

### [MEDIO] El secreto del webhook no protege «mandar cotizaciones»: protege «mandar cualquier correo como Camino Sacro» — nodo «Validar y Preparar» del workflow `HgErNCbopi95CdiI`

Leí el workflow en producción. La comprobación del secreto es la primera línea del nodo y
está bien puesta —si no coincide, lanza y la petición se rechaza—, pero lo que hay **después**
es lo que define el riesgo. Del payload se toman **tal cual**, sin validar contra nada:

| campo del payload | a dónde va |
|---|---|
| `email` | el destinatario (`to`), cualquier dirección |
| `subject` | el asunto, texto libre |
| `body` / `html` | el cuerpo, **HTML arbitrario** |
| `attachments[].url` o `pdf_url` | **la URL de la que Brevo se descarga el adjunto**, sin lista blanca de dominio |

El remitente sí es fijo (`Camino Sacro <reservas@caminosacro.com>`) y eso es lo que convierte
esto en un problema en vez de en una curiosidad: quien tenga el secreto puede mandar **un
correo cualquiera, a quien quiera, con el HTML que quiera y un adjunto traído de donde quiera,
firmado con la reputación y —si el DKIM está puesto, que es la verificación pendiente de
B4.4— con la autenticación de dominio de la agencia**. Es un relé de phishing con la marca
puesta. El daño no sería para la plataforma: sería para los clientes de Camino Sacro y para la
reputación del dominio, que es lo que tarda meses en recuperarse.

**Dónde está hoy el secreto**, que es lo que hay que sopesar:

1. **En claro dentro del nodo de código** (`const SECRET = '…'`), o sea visible para cualquiera
   que abra el workflow en el canvas de n8n.
2. **En el JSON del workflow**, que se puede leer por la API de n8n. Lo comprobé sin querer al
   hacer esta auditoría: pedir el detalle del workflow **me devolvió el secreto en texto
   plano**. Cualquier integración, agente o token con acceso de lectura a ese n8n lo tiene.
3. En las variables de Railway de la app y en el `.env.local` de la máquina de desarrollo, que
   es donde sí corresponde.

No hay ningún indicio de que se haya usado indebidamente y el n8n está detrás de su propio
login. El hallazgo no es «esto está comprometido», es que **el radio de acción es mucho mayor
de lo que el nombre del secreto sugiere** y que hoy vive en el sitio más fácil de leer de los
tres.

**Propuesta (no se tocó nada, como pide la tarea). Dos cambios, en este orden:**

1. **Acotar el daño antes que el secreto**, porque es lo que de verdad lo reduce: exigir que
   `attachments[].url` y `pdf_url` apunten al host de Supabase del proyecto. Son tres líneas
   en el mismo nodo (`if (!a.url.startsWith('https://<proyecto>.supabase.co/')) return null`).
   Con eso, quien tenga el secreto puede como mucho mandar texto en nombre de la agencia; no
   puede colgarle un adjunto arbitrario a un correo que parece nuestro. Y no rompe nada: todos
   los adjuntos que la plataforma manda hoy salen de ahí.
2. **Sacar el secreto del nodo**: leerlo de una variable de entorno del servicio de n8n
   (`$env.QUOTE_EMAIL_WEBHOOK_SECRET`) en vez de tenerlo literal. Deja de estar en el JSON del
   workflow y deja de salir por la API. Y, ya puestos, rotarlo cuando se haga —lleva tiempo
   siendo legible por API—, coordinando el cambio con la variable de Railway de la app, que es
   el único consumidor.

Un apunte menor, por coherencia y no por riesgo: la comparación es `recibido !== SECRET`, una
igualdad de cadenas normal, mientras que los endpoints propios de la plataforma usan
`timingSafeEqual` (`api/wp/auth.ts:12-20`, que B1 elogió). Contra un secreto de 48 caracteres
hexadecimales y por internet, un ataque de tiempo no es practicable, así que no lo cuento como
hallazgo; pero es la misma decisión resuelta de dos maneras en la misma plataforma.

### [MENOR] Si falla la marca justo después de enviar, el recordatorio se repite cada día sin tope — `api/cron/recordatorios-contrato/route.ts:196-201`

El orden dentro del bucle es: renovar el vencimiento del token → firmar la URL del PDF →
**enviar el correo** → marcar `last_reminder_at` y `reminder_count`.

```ts
const ok = await enviarCorreoContrato({ … });   // ya salió
if (!ok) { errores.push(…); continue; }
const { error: marcaErr } = await supabase.from("contracts")
  .update({ last_reminder_at: …, reminder_count: numero }).eq("id", c.id);
if (marcaErr) throw marcaErr;                    // ← el correo ya se fue
```

Si ese `update` falla, el `throw` lo recoge el `catch` del bucle y el contrato se apunta en
`errores`. Pero **el correo ya salió y el contador no subió**. Mañana ese contrato vuelve a
cumplir las dos condiciones —`reminder_count` sigue por debajo de 5 y `last_reminder_at`
sigue viejo—, así que se le manda otra vez. Y pasado mañana. **El tope de 5 nunca lo corta,
porque el tope se cuenta con el campo que no se está escribiendo.** Es el único camino del
endpoint que produce un bucle en vez de un reintento.

La probabilidad es baja —un `update` de una fila por id que falla— pero la consecuencia es
escribirle todos los días a un cliente que ya se cansó, que es justo lo que estos correos
deben evitar. **Propuesta:** marcar **antes** de enviar y revertir si el envío falla, o
—más simple y sin carrera— apoyarse en `email_log`: si ya hay una fila de tipo `contrato`
para ese contrato en las últimas 24 h, no reenviar. Eso además arregla el caso de abajo.

### [MENOR] Un envío lento se reintenta solo, y es el escenario que el propio proyecto documentó como el peor — `contracts/email.ts:11-14` desde el cron

`lib/email/webhook.ts` deja escrito el incidente y la lección: con un timeout corto, «un
envío lento abortaba acá y la app lo reportaba como fallido **aunque el correo hubiera
salido**: el peor error posible, porque **invita a reenviarlo**». Por eso el timeout subió a
45 s.

El cron es el único llamador que **acepta esa invitación sin que nadie decida**: si
`enviarCorreoContrato` devuelve `false`, no marca y mañana vuelve a mandar. Y como esa
función colapsa el resultado a un booleano (el hallazgo de B4.1), el cron **no puede
distinguir** «Brevo lo rechazó, no salió nada» de «tardó más de 45 s y probablemente sí
salió». En el primer caso reintentar es lo correcto; en el segundo es un duplicado.

Los 45 s hacen que sea improbable, y el recordatorio lleva un PDF de contrato de pocos
cientos de kB, no los 20 pasaportes del correo a Pilgrim. Va como MENOR por eso. **Propuesta:**
la misma de arriba —consultar `email_log` antes de reenviar—, que resuelve los dos casos con
una sola consulta y usa una tabla que ya existe.

### Lo que sí está bien: el cron contesta que no a las tres preguntas de la tarea

Fui a buscar duplicados y no los hay. Las tres respuestas, con el mecanismo:

- **¿Corre dos veces el mismo día? No duplica.** El endpoint no recibe una lista: **decide él**
  a quién le toca, filtrando por «último contacto hace más de 4 días»
  (`ultimoContacto = last_reminder_at ?? sent_at ?? created_at`). Tras un envío exitoso,
  `last_reminder_at` es *ahora*, así que en la segunda corrida del día ese contrato ya no
  entra. La cabecera lo promete y el código lo cumple.
- **¿Si no corre en varios días? No hay avalancha.** El filtro es un umbral, no un calendario:
  un contrato al que le tocaba el martes recibe **un** correo el viernes, no tres. No intenta
  recuperar el tiempo perdido, que es exactamente lo que uno quiere de un recordatorio.
- **¿Si falla a mitad de la lista? No frena a los demás.** Cada contrato va en su `try/catch`
  con `continue` («un contrato problemático no debe frenar a los demás»), y **si el correo no
  sale, no se marca**: «en la corrida de mañana se vuelve a intentar». El valor por defecto es
  el correcto —reintentar— y el endpoint devuelve el detalle (`esperando_firma`, `les_tocaba`,
  `enviados`, `errores[]`) para que la ejecución de n8n diga qué pasó.

Y lo demás también está cuidado:

- **Autenticación con `timingSafeEqual`** sobre `CRON_SECRET`, con comprobación de longitud
  previa, y **si la variable falta se deniega** en vez de dejar pasar (`autorizado()` devuelve
  `false`). Mismo criterio que los endpoints de B1.
- **`APP_BASE_URL` es obligatoria y el 500 lo explica**: «sin ella el enlace de firma del
  correo saldría roto». Sin petición del navegador no hay host del que deducirla, y en vez de
  adivinar, se planta. Correcto.
- **El enlace del último correo siempre funciona**: cada recordatorio renueva el vencimiento
  del token a 21 días, «que era el riesgo de insistir cerca de los 21 días».
- **El tono escala y el último cambia de destinatario efectivo**: los intermedios no molestan a
  nadie internamente (`aviso: esUltimo`), y el quinto manda a reservas@ un «ATENCIÓN: X no ha
  firmado… Conviene llamarlo» con el teléfono y el enlace. La automatización sabe cuándo
  devolverle el problema a una persona, que es lo que casi nunca se hace.
- **Verificado en n8n y en la base**: el Schedule «Recordatorio de firma — Camino Sacro»
  (`QhAMT1jIxyFmEasm`) está **activo**; de los 4 contratos en `enviado`, uno agotó sus 5
  recordatorios el 21-ago y queda correctamente excluido por `.lt("reminder_count", 5)`, y los
  otros tres se enviaron el 31-ago, así que todavía no les toca. El estado real coincide con lo
  que el código dice que debe pasar.
- **`reminder_count` es `NOT NULL DEFAULT 0`** (comprobado en el esquema), así que el filtro
  `.lt()` no se come ninguna fila por un nulo — que era el fallo silencioso que fui a buscar.

### Lo que sí está bien: el workflow hace lo que dice y lo deja escrito

Leído entero, no por confianza:

- **El secreto se comprueba antes que nada** y el fallo **lanza**, así que la petición muere
  ahí: no hay camino en que un payload sin secreto llegue a Brevo.
- **Valida el destinatario** (`if (!email || email.indexOf('@') === -1) throw`) antes de armar
  nada, con el código de la cotización en el mensaje de error.
- **El `Respond to Webhook` cuelga de «Enviar por Brevo»**, no del nodo de preparación. Eso es
  exactamente lo que hace que el `messageId` signifique algo, tal como promete
  `lib/email/webhook.ts`: si Brevo falla, el nodo HTTP lanza, no hay respuesta y el webhook
  devuelve 500. La cadena de confianza está bien montada de punta a punta.
- **El parche de HTML está aplicado y bien aplicado**: `textContent` se conserva y
  `htmlContent` solo se añade `if (html)`. El correo sale multiparte, como debe.
- **El `If` del aviso interno está puesto y con el criterio escrito** en la nota adhesiva del
  canvas, que además coincide con el comentario del código de la app. Es el arreglo que ya
  estaba documentado en la memoria del proyecto y quedó bien cerrado.
- **La nota del canvas es documentación de verdad**: explica las dos ramas, el criterio del
  aviso, los adjuntos múltiples y hasta el resultado de la prueba con 20 pasaportes (4,7 MB) y
  la advertencia de que los PDF no se comprimen.

### Lo que sí está bien: la higiene de entregabilidad

Casi todo lo que suele fallar aquí está resuelto, y con el motivo escrito:

- **Siempre viaja una versión en texto plano.** El payload lleva `body` (texto) y `html`
  aparte, con el comentario correcto en `clientEmail.ts:118-119`: «es lo que ve quien tenga el
  HTML desactivado, y **ayuda a que el correo no puntúe como spam**». Y el parche del
  workflow está redactado para **añadir** `htmlContent` dejando `textContent` intacto, no para
  sustituirlo: el correo sale multiparte, que es lo correcto.
- **El HTML es liviano y sin imágenes remotas.** Medido en `email_log`: 11 kB de media, 14 kB
  el mayor — muy por debajo de los ~102 kB donde Gmail recorta el mensaje. Y **cero etiquetas
  `<img>`** en los dos generadores (`emailHtml.ts` y `travelDocs/html.ts`): todo es texto,
  tablas y estilos en línea, así que no hay hotlinking, ni píxeles de seguimiento, ni imágenes
  que el cliente tenga que «mostrar» para entender el correo.
- **Los enlaces son absolutos y no caducan.** La versión web y las descargas van a rutas
  propias por token (`/correo/[token]`, `/documentacion/[token]`), no a URL firmadas de
  Supabase que expirarían: la firma se emite fresca en cada clic (ver B3). Un correo de hace
  seis meses sigue funcionando.
- **Remitente único y coherente**: `Camino Sacro <reservas@caminosacro.com>` con `replyTo` a
  la misma dirección, definido en un solo sitio (el nodo «Validar y Preparar»). No hay flujos
  mandando desde direcciones distintas.
- **El modo prueba desvía sin tocar al destinatario real** (`pruebaEmail`), y queda marcado
  como `prueba` en `email_log`: se puede ensayar un envío de 20 contratos sin escribirle a
  nadie.

Lo único que **no** hay, y va sin llamarlo hallazgo porque hoy es correcto: ninguna cabecera
`List-Unsubscribe` ni enlace de baja. Estos correos son transaccionales —una cotización que
el cliente pidió, un contrato que firmó, su documentación de viaje— y ahí no corresponde. El
día que salga el primer envío comercial a una lista, sí hará falta.

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

`Estado: en curso` — el agente crítico está verificando el bloque contra el código, contra
`comercial.email_log` / `comercial.email_templates` en producción y contra el workflow
`HgErNCbopi95CdiI` en n8n. Orden: (1) los siete emisores y quién ignora `messageId`, (2) la
etiqueta del secreto del webhook, (3) la rebaja a MENOR de `armarCorreoCotizacion`, (4) lo que
falta en un CRM de agencia (rebotes, respuestas, correos que no existen). Si muero, lo escrito
más abajo ya es definitivo.

_(nota original del auditor, se conserva)_ — **sin empezar a propósito**, por lo mismo que en B3: la auditoría la
escribió este agente y criticarse a uno mismo no tiene independencia. Lo que más agradecería
que le miren:

- El **MEDIO del secreto del webhook**: si la etiqueta aguanta dado que no hay indicio de
  compromiso y el n8n está tras su login. Mi argumento es el radio de acción (destinatario,
  HTML y URL de adjunto libres con remitente fijo de la marca), no una filtración.
- Los **cuatro emisores que ignoran `messageId`**: comprobar que no me dejé ninguno y si el de
  `api/wp/lead` merece el mismo peso que los otros tres.
- El **MENOR de `armarCorreoCotizacion`**: lo bajé de MEDIO porque la vista previa del CRM tapa
  el caso real. Segunda opinión bienvenida sobre esa rebaja.

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
