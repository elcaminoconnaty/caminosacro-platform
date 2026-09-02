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
  `Estado: pendiente`
- **B4.3 Plantillas y variables.** Una `{{variable}}` sin valor deja un hueco en el correo del cliente. Busca las que puedan quedar vacías y los textos que afirman cosas que ya no son ciertas.
  `Estado: pendiente`
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

### Lo que sí está bien: el emisor único está bien construido

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
