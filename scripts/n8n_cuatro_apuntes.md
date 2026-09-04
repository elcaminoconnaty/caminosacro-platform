# n8n — los cuatro apuntes del correo (auditoría B4)

> **ESTADO: preparado, SIN APLICAR.** Todo lo de aquí se pega a mano en el canvas de n8n.
> Cada cambio dice qué resuelve, qué pegar y cómo comprobar que quedó.

Workflow: **«Correo Cotización — Camino Sacro»** (`HgErNCbopi95CdiI`), el **único emisor de
correo de toda la plataforma**. Estado leído el 4-sep-2026: activo, versión
`98e6311e-8c51-4c85-9cb1-871f1c515e4a`.

## Por qué esto no se aplica por SDK

`update_workflow` **descarta las credenciales de los dos nodos HTTP** («Enviar por Brevo» y
«Aviso Lead a Reservas»). Está probado y documentado en `n8n_aviso_interno.md`: el borrador
queda con la topología bien y los dos nodos sin credencial, y publicar así **tumba todo el
correo de la plataforma**.

**Regla:** nunca publicar un borrador hecho por SDK sin volver a poner a mano la credencial
«Brevo API key» en los dos nodos HTTP.

Por eso los cuatro cambios de abajo son de abrir el canvas y pegar.

---

## Orden recomendado

**(c) primero, y hoy.** Es el único con una ventana abierta ahora mismo. Los otros tres pueden
esperar a que tengas la tarde.

---

## (c) El secreto del webhook — HAZLO PRIMERO

### Qué pasa

El nodo Code «Validar y Preparar» empieza con el secreto compartido escrito en claro:

```js
const SECRET = '72da…';   // ← el valor literal, dentro del código del nodo
```

Eso sale del servidor por **dos** rutas distintas de la API de n8n: el JSON del workflow y
**cada ejecución guardada** (el workflow tiene `redaction: { policy: "none" }`). Cualquiera con
acceso de lectura a la API de n8n lo tiene.

**Y hay una razón nueva para rotarlo ya:** al preparar este documento leí el workflow por la
API, así que **el valor viajó a una sesión de Claude y quedó en su transcripción**. No es un
riesgo teórico ni grave —la transcripción es tuya—, pero es una copia más del secreto fuera de
n8n, y el arreglo es el mismo que ya tocaba hacer. No lo pego aquí a propósito.

Con ese secreto, quien lo tenga puede mandar **cualquier correo, a cualquiera, con cualquier
adjunto, desde `reservas@caminosacro.com`** — y si el DKIM está puesto, firmado con la
autenticación de tu dominio.

### Qué hacer

**1. Genera un secreto nuevo.** En tu terminal:

```bash
openssl rand -hex 24
```

**2. Ponlo como variable en el servicio de n8n** (Railway → el servicio de n8n → Variables):

```
QUOTE_EMAIL_WEBHOOK_SECRET=<el nuevo>
```

**3. En el nodo «Validar y Preparar»**, cambia la línea del secreto por:

```js
const SECRET = String($env.QUOTE_EMAIL_WEBHOOK_SECRET || '');
if (!SECRET) {
  throw new Error('Falta la variable QUOTE_EMAIL_WEBHOOK_SECRET en el servicio de n8n');
}
```

> **Compruébalo antes de confiar en ello.** Algunas instalaciones de n8n bloquean `$env`
> dentro de los nodos Code (`N8N_BLOCK_ENV_ACCESS_IN_NODE`). Haz una ejecución de prueba: si
> revienta con algo de «env access», hay que quitar esa variable de entorno del servicio de
> n8n y reiniciarlo. **Si no puedes habilitarlo, no dejes el secreto viejo**: pon el nuevo en
> claro igual que estaba. Rotarlo ya es la mitad del valor.

**4. Cambia la variable en la app** (Railway → servicio de la Plataforma Comercial):

```
QUOTE_EMAIL_WEBHOOK_SECRET=<el mismo nuevo>
```

La app es el **único** consumidor, así que no hay nada más que coordinar. Es la variable que
usa `src/lib/email/webhook.ts`.

**5. Los dos a la vez.** Entre que cambias uno y el otro, el correo queda caído: n8n rechaza
con «x-webhook-secret invalido». Hazlo seguido y en horario tranquilo.

**6. El histórico conserva el valor viejo.** Rotar no borra nada: las ejecuciones guardadas
siguen teniendo el secreto anterior. Si quieres cerrarlo del todo, borra las ejecuciones
viejas de ese workflow (n8n → Executions → filtra por el workflow → Delete), o al menos las
anteriores a la rotación.

### Cómo compruebas que quedó

Manda una cotización de prueba desde el CRM. La ejecución tiene que terminar en `success` y
«Enviar por Brevo» devolver `messageId`. Si devuelve 401/rechazo, las dos variables no
coinciden.

---

## (a) Lista blanca del servidor de los adjuntos

### Qué pasa

El nodo Code toma la URL del adjunto tal cual viene en el payload, sin mirar de dónde sale:

```js
return { url: String((a && a.url) || ''), name: String((a && a.name) || '') };
```

Sumado a (c): quien tenga el secreto puede adjuntar **cualquier archivo de cualquier
servidor** a un correo que sale de tu dominio. Con la lista blanca, como mucho puede mandar
texto. **Acota el daño antes que el secreto**, y por eso vale la pena aunque rotes.

No rompe nada: **todos los adjuntos de hoy son enlaces firmados de Supabase Storage**, sin
excepción. Lo verifiqué en el código el 4-sep-2026 — `sendPilgrimEmail` es el único que manda
lista de adjuntos, y los demás mandan un PDF generado por la propia plataforma.

### Qué pegar

En «Validar y Preparar», **justo antes** de `const lista = Array.isArray(body.attachments)…`:

```js
// Lista blanca: un adjunto solo puede salir de nuestro propio Storage. Sin esto, quien
// tenga el secreto del webhook puede colgar cualquier archivo de cualquier servidor en un
// correo que sale de reservas@caminosacro.com, firmado con el DKIM del dominio.
const HOST_ADJUNTOS = 'https://yvytzquewjsjsmgiwmaa.supabase.co/';
function adjuntoPermitido(u) {
  return typeof u === 'string' && u.indexOf(HOST_ADJUNTOS) === 0;
}
```

Después, cambia el filtro de `varios` para que además compruebe el host, y cuenta los que
descarta:

```js
const lista = Array.isArray(body.attachments) ? body.attachments : [];
const candidatos = lista
  .map(function (a) {
    return { url: String((a && a.url) || ''), name: String((a && a.name) || '') };
  })
  .filter(function (a) { return a.url.length > 0; });

const varios = candidatos.filter(function (a) { return adjuntoPermitido(a.url); });
const adjuntosRechazados = candidatos.length - varios.length;
```

Y en el `else if (pdfUrl)`, mismo criterio:

```js
} else if (pdfUrl && adjuntoPermitido(pdfUrl)) {
```

Por último, saca el contador en el `return` final para que se vea en la ejecución:

```js
return [{ json: { code, email, subject, numAdjuntos, adjuntosRechazados, aviso, brevoBody, avisoBody } }];
```

> **Por qué descartar y no reventar:** un adjunto legítimo nunca falla esta comprobación, así
> que si algo se descarta es que no era nuestro. Reventar convertiría un intento de abuso en
> una caída del correo. El contador `adjuntosRechazados` es para que no sea silencioso: si
> alguna vez sale distinto de 0 en una ejecución normal, es que cambió la URL del proyecto de
> Supabase y hay que actualizar `HOST_ADJUNTOS`.

### Cómo compruebas que quedó

Manda una cotización con PDF. En la ejecución, «Validar y Preparar» debe salir con
`numAdjuntos: 1` y `adjuntosRechazados: 0`, y el correo tiene que llegar **con** el PDF.

---

## (b) El aviso interno no puede morir con el correo del cliente

### Qué pasa

«Validar y Preparar» tiene **dos salidas en paralelo**: «Enviar por Brevo» y «¿Avisar a
Reservas?». Con `executionOrder: v1`, el orden lo decide la **posición vertical** de los
nodos, y hoy Brevo está más arriba (`y = 0`) que el If (`y = 192`), así que Brevo corre
primero. Brevo **no tiene `onError`**, así que un 400 aborta la ejecución entera y **la rama
del aviso nunca corre**.

Resultado: cuando Brevo rechaza algo —un adjunto que no admite, la credencial vencida, un
correo mal tecleado—, **ni el viajero recibe su copia ni tú recibes el aviso**. Los dos únicos
avisos del evento se apagan con el mismo error. Justo cuando más falta hace enterarse.

> **Un matiz sobre el caso que citaba la auditoría.** Decía que el disparador era un pasaporte
> **HEIC**, que la firma acepta y Brevo rechaza. Ese camino concreto **ya está cerrado**: el
> único envío que lleva pasaportes es el correo a Pilgrim, y `sendPilgrimEmail.ts:63` ya
> frena con `adjuntosNoSoportados()` antes de llamar al webhook. El correo del contrato
> firmado solo adjunta el PDF. O sea que el complemento del lado de la app que proponía la
> auditoría **ya no hace falta**. El defecto de n8n sigue en pie igual: cualquier otro 400 de
> Brevo produce el mismo apagón doble.

### Qué hacer

**1. Que el aviso corra primero.** En el canvas, arrastra **«¿Avisar a Reservas?» por encima
de «Enviar por Brevo»** — basta con que su `y` sea menor. Con eso el aviso interno sale antes
de que Brevo pueda tumbar la ejecución.

**2. Que un fallo del aviso no tumbe el correo del cliente.** Abre **«Aviso Lead a Reservas»**
→ pestaña **Settings** → **On Error** → **«Continue (using regular output)»**. Es la vuelta
del mismo problema: ahora que el aviso va primero, su fallo bloquearía a Brevo.

> **Ojo con esto dentro de un año.** El orden depende de la posición en el canvas, así que
> **si alguien arrastra los nodos, el orden puede volver a cambiar sin que nadie lo note.** Si
> quieres que sea a prueba de eso, la alternativa es encadenarlos: que «Validar y Preparar»
> vaya **solo** a «¿Avisar a Reservas?», y que las **dos** salidas del If (true y false)
> lleguen a «Enviar por Brevo». Es más trabajo de cableado y no depende de dónde esté cada
> caja.

**Lo que NO conviene hacer:** poner `onError: continueRegularOutput` en **«Enviar por Brevo»**.
Parece la solución obvia, pero entonces «Respond to Webhook» responde `{}` y la app registra
el envío como `aceptado` en vez de `error`: un correo que no salió quedaría como si hubiera
salido. Hoy, al abortar, la app sí se entera. Eso hay que conservarlo.

### Cómo compruebas que quedó

En una ejecución normal —de las que llevan `aviso: true`, como un contrato firmado— las dos
ramas tienen que aparecer en verde, y el aviso **antes** que Brevo en la lista de nodos
ejecutados.

---

## (d) Un Error Workflow que avise cuando algo revienta

### Qué pasa

`settings` de `HgErNCbopi95CdiI` no tiene `errorWorkflow` (leído el 4-sep-2026: solo
`executionOrder`, `availableInMCP` y `binaryMode`). Un rechazo de Brevo o un secreto mal
puesto deja hoy **una ejecución en rojo que nadie mira**. Y el rechazo de un secreto inválido
es justamente la señal que uno querría ver llegar.

### Qué hacer

**1. Crea un workflow nuevo** llamado **«Error — Correo Camino Sacro»** con dos nodos:

- **Error Trigger** (`n8n-nodes-base.errorTrigger`), sin parámetros.
- **HTTP Request** hacia Brevo, con la credencial **«Brevo API key»** puesta **a mano**
  (`Generic Credential Type` → `Header Auth`), método `POST`,
  URL `https://api.brevo.com/v3/smtp/email`, `Send Body` → `JSON`, y este cuerpo:

```
={{ JSON.stringify({
  sender: { name: 'Camino Sacro', email: 'reservas@caminosacro.com' },
  to: [{ email: 'reservas@caminosacro.com', name: 'Reservas Camino Sacro' }],
  subject: '[n8n] Falló ' + $json.workflow.name,
  textContent:
    'Un envío de correo falló en n8n.\n\n' +
    'Workflow: ' + $json.workflow.name + '\n' +
    'Nodo:     ' + ($json.execution.lastNodeExecuted || '-') + '\n' +
    'Error:    ' + ($json.execution.error && $json.execution.error.message || '-') + '\n' +
    'Cuándo:   ' + $json.execution.startedAt + '\n\n' +
    'Ver la ejecución: ' + $json.execution.url
}) }}
```

**2. Actívalo.**

**3. Engánchalo:** abre «Correo Cotización — Camino Sacro» → **Settings** → **Error Workflow**
→ elige «Error — Correo Camino Sacro» → guarda y publica.

> Esto último **hazlo desde la UI**, no por SDK: tocar los `settings` del workflow por API
> pasa por `update_workflow`, que es justo lo que descarta las credenciales de los nodos HTTP.

### Cómo compruebas que quedó

Manda una petición al webhook con un secreto equivocado (por ejemplo con `curl`, cambiando una
letra del header `x-webhook-secret`). Tienes que recibir el correo de aviso en `reservas@`. Es
la misma prueba que valida (c).

---

## Resumen para marcar

| | Cambio | Dónde | Rato |
|---|---|---|---|
| c | Secreto a `$env` **y rotado** en los dos Railway | nodo Code + 2 variables | 45 min |
| a | Lista blanca del host del adjunto | nodo Code | 20 min |
| b | Aviso primero + `onError` en el nodo del aviso | canvas + Settings | 15 min |
| d | Error Workflow nuevo y enganchado | workflow nuevo + Settings | 10 min |

Lo del lado de la app que proponía la auditoría (llamar a `adjuntosNoSoportados()` antes del
contrato firmado) **no hace falta**: ver el matiz del punto (b).
