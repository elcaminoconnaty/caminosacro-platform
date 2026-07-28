# n8n — el aviso interno se puede apagar (ya no salen dos correos)

> **APLICADO Y VERIFICADO en producción el 2026-07-28.** Este documento queda como
> registro de cómo se hizo y de lo que hay que cuidar si se vuelve a tocar.

Cada envío dispara las **dos ramas** del workflow: "Enviar por Brevo" (al destinatario) y
"Aviso Lead a Reservas" (a `reservas@caminosacro.com`). Por eso salían dos correos por
acción. La app manda un campo `aviso` (booleano) y ahora el workflow lo respeta gracias a un
nodo `If` ("¿Avisar a Reservas?") delante de la segunda rama.

Verificación en producción, leyendo las ejecuciones de n8n:

| Caso | Ejecución | Resultado |
|---|---|---|
| Cotización enviada desde el CRM (`aviso:false`) | 29414 | El `If` se fue por **false**; "Aviso Lead a Reservas" no se ejecutó. Un solo correo. |
| Contrato enviado para firma (`aviso:false`) | 29415 | Igual: un solo correo. |
| **Contrato firmado** (`aviso:true`) | 29417 | Corrieron **las dos** ramas, cada una con su `messageId` de Brevo. |

Las tres ejecuciones terminaron en `success` y "Enviar por Brevo" devolvió `messageId`, que
es la prueba de que la credencial quedó bien puesta después de rehacer el workflow.

**Sobre aplicarlo por SDK — probado el 2026-07-28, y la advertencia vieja se confirma.**
`validate_workflow` **acepta** `credentials: { httpHeaderAuth: { id: 'adVh190atfVSI1dP',
name: 'Brevo API key' } }` y da `valid: true`, así que parece que se puede. Pero al aplicar,
`update_workflow` **descarta ese bloque** y responde:

> HTTP Request nodes (Enviar por Brevo, Aviso Lead a Reservas) were skipped during
> credential auto-assignment. Their credentials must be configured manually.

O sea: el borrador queda con la topología correcta pero **con los dos nodos HTTP sin
credencial**. Publicar así tumba todo el correo de la plataforma.

Lo que sí ayuda: `update_workflow` escribe el **borrador**, no la versión activa. Se puede
generar la estructura por SDK sin tocar producción, y luego —en la UI— abrir los dos nodos
HTTP, seleccionar la credencial **"Brevo API key"** y recién ahí publicar.

**Nunca publicar un borrador hecho por SDK sin volver a poner las credenciales a mano.**

Workflow: **"Correo Cotización — Camino Sacro"** (`HgErNCbopi95CdiI`).

## Cómo quedó (los pasos que se siguieron)

### Paso 1 — exponer el campo en "Validar y Preparar"

Al final del nodo Code está esta línea:

```js
return [{ json: { code, email, subject, numAdjuntos, brevoBody, avisoBody } }];
```

Reemplázala por estas dos:

```js
// `aviso: false` lo manda la app cuando la acción la disparó alguien del equipo
// desde el CRM: ahí el aviso interno solo duplicaba el correo. Si no viene el
// campo, se avisa igual que siempre.
const aviso = body.aviso !== false;
return [{ json: { code, email, subject, numAdjuntos, aviso, brevoBody, avisoBody } }];
```

### Paso 2 — cortar la rama del aviso

1. Borra la conexión que va de **"Validar y Preparar"** a **"Aviso Lead a Reservas"**
   (la de abajo; la de "Enviar por Brevo" no se toca).
2. Agrega un nodo **If** entre los dos y llámalo **"¿Avisar a Reservas?"**.
3. Condición: **Boolean → is true**, con el valor izquierdo `{{ $json.aviso }}`.
4. Conecta "Validar y Preparar" → "¿Avisar a Reservas?", y la salida **true** del If →
   "Aviso Lead a Reservas". La salida **false** se deja suelta.
5. Guarda y publica.

## Qué avisa y qué no

| Acción | ¿Avisa a reservas@? | Por qué |
|---|---|---|
| Cotización enviada desde el CRM | No | La mandó alguien del equipo |
| Contrato enviado para firma | No | Ídem |
| Correo a Pilgrim | No | Ídem |
| **Contrato firmado por el cliente** | **Sí** | Pasa solo, sin nadie mirando |
| **Último recordatorio sin firmar** | **Sí** | Pide entrar a llamar |
| Recordatorios intermedios | No | Los manda el cron, no hay nada que hacer |
| Lead del cotizador web | Sí | Es el propósito original de la rama |

## Cómo comprobarlo

Sin entrar a la bandeja de reservas@: manda algo desde el CRM y abre la ejecución en n8n.
En "¿Avisar a Reservas?" se ve por cuál salida se fue. Con `aviso: false` el nodo "Aviso
Lead a Reservas" queda sin ejecutar y sale un solo correo.

Prueba mínima recomendada, en modo prueba:

1. Reenviar un contrato desde el CRM → **un** correo, sin aviso.
2. Firmar ese contrato → **dos**: la copia al viajero y el aviso `[CRM] Firmó …` a
   reservas@. Este es el que sí se conserva a propósito.
