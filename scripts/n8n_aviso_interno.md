# n8n — que el aviso interno se pueda apagar (dejar de mandar dos correos)

Cada envío dispara las **dos ramas** del workflow: "Enviar por Brevo" (al destinatario) y
"Aviso Lead a Reservas" (siempre a `reservas@caminosacro.com`). Por eso salen dos correos
por acción. La app ya manda un campo `aviso` (booleano) diciendo cuál de los dos casos es;
falta que el workflow lo respete.

**Mientras no se aplique no se rompe nada**: el workflow ignora el campo y sigue mandando
el aviso siempre, como hasta ahora.

**Sobre aplicarlo por SDK — la nota vieja quedó desactualizada.** `n8n_varios_adjuntos.md`
dice que el SDK no puede referenciar una credencial existente, y eso **ya no es cierto**:
`list_credentials` da el ID (la de Brevo es `adVh190atfVSI1dP`) y el nodo lo acepta con
`credentials: { httpHeaderAuth: { id: 'adVh190atfVSI1dP', name: 'Brevo API key' } }`.
Validado con `validate_workflow`.

Además `update_workflow` escribe sobre el **borrador**, no sobre la versión activa: se puede
actualizar, comprobar que la credencial quedó pegada y publicar solo si está bien. O sea que
el riesgo que motivó hacerlo a mano ya no existe.

Workflow: **"Correo Cotización — Camino Sacro"** (`HgErNCbopi95CdiI`).

## Paso 1 — exponer el campo en "Validar y Preparar"

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

## Paso 2 — cortar la rama del aviso

1. Borra la conexión que va de **"Validar y Preparar"** a **"Aviso Lead a Reservas"**
   (la de abajo; la de "Enviar por Brevo" no se toca).
2. Agrega un nodo **If** entre los dos y llámalo **"¿Avisar a Reservas?"**.
3. Condición: **Boolean → is true**, con el valor izquierdo `{{ $json.aviso }}`.
4. Conecta "Validar y Preparar" → "¿Avisar a Reservas?", y la salida **true** del If →
   "Aviso Lead a Reservas". La salida **false** se deja suelta.
5. Guarda y publica.

## Qué avisa y qué no, después de esto

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
