# Que el webhook confirme el envío (pendiente, hay que hacerlo a mano)

**Qué se gana:** hoy la plataforma no puede saber si un correo salió. El nodo trigger
del workflow `Correo Cotización — Camino Sacro` (id `HgErNCbopi95CdiI`) está en
`responseMode: onReceived`: n8n responde *"Workflow got started"* **antes** de llamar a
Brevo. Un 400 de Brevo —adjunto muy pesado, extensión no admitida, credencial vencida—
le llega a la app como éxito, y el CRM escribe `pilgrim_email_sent_at` y muestra
"✓ Enviado". Las ejecuciones de n8n se purgan a los pocos días, así que después no hay
dónde mirar.

El código de la app **ya está listo** para el cambio y no se rompe sin él:

- `src/lib/email/webhook.ts` lee el `messageId` de la respuesta si viene.
- `src/lib/email/log.ts` escribe un renglón por envío en `comercial.email_log`
  (migración `0028`), con estado `confirmado` cuando hay `messageId` y `aceptado`
  cuando no.
- La tarjeta de Pilgrim dice "⏳ En cola" en vez de "✓ Enviado" mientras no haya
  confirmación.

Mientras no se haga este cambio, todo queda registrado como `aceptado`. Es la verdad:
n8n recibió la petición y nadie sabe más.

## El cambio, en la interfaz de n8n (3 clics, ~2 minutos)

> ⚠️ **NO republicar el workflow desde el SDK ni desde el MCP.** Al regenerarlo, los
> nodos HTTP pierden la credencial "Brevo API key" y el correo deja de salir **en
> silencio**. Es la misma advertencia de `n8n_varios_adjuntos.md` y de
> `n8n_aviso_interno.md`. Esto se hace a mano, en el editor.

1. Abrir el workflow `Correo Cotización — Camino Sacro`.
2. Nodo **"Recibir Cotización"** (el webhook) → parámetro **Respond** →
   cambiar de `Immediately` a **`Using 'Respond to Webhook' Node`**.
3. Agregar un nodo **Respond to Webhook** conectado **después de "Enviar por Brevo"**
   (la rama del correo al destinatario, no la del aviso interno), con:
   - Respond With: **JSON**
   - Response Body: `={{ JSON.stringify({ messageId: $json.messageId }) }}`
4. Guardar y publicar desde el editor.

Por qué un nodo Respond y no `lastNode`: el workflow tiene dos ramas y con `lastNode`
la respuesta depende de cuál termine de última — a veces contestaría el aviso interno.
Con el nodo Respond se responde siempre desde la rama que importa.

## Cómo verificar que quedó

1. Mandar una cotización de prueba desde el CRM.
2. La tarjeta debe decir **"✓ Enviado"**, no "⏳ En cola".
3. En Supabase:
   ```sql
   select created_at, tipo, destinatario, estado, message_id
   from comercial.email_log
   order by created_at desc limit 5;
   ```
   El renglón nuevo debe tener `estado = 'confirmado'` y un `message_id` que termine
   en `@smtp-relay.mailin.fr`.

## Lo que sigue faltando después de esto

`messageId` prueba que **Brevo aceptó** el correo, no que llegó. Para eso hace falta el
webhook de eventos de Brevo (`delivered`, `soft_bounce`, `hard_bounce`, `spam`)
apuntando a un endpoint de la plataforma que actualice `email_log.estado`. Es el
siguiente paso, no está hecho.

## Aparte: el secreto está en texto plano

El nodo Code "Validar y Preparar" tiene el `x-webhook-secret` escrito dentro del
código (`const SECRET = '72da…'`), visible para cualquiera que abra el workflow o lo
lea por el MCP. Hay que rotarlo: generar uno nuevo, ponerlo en la variable
`QUOTE_EMAIL_WEBHOOK_SECRET` de Railway y leerlo en el nodo desde una credencial en
vez de tenerlo escrito.
