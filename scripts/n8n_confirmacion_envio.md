# Que el webhook confirme el envío

> ✅ **APLICADO Y VERIFICADO EN PRODUCCIÓN el 28-ago-2026.** El workflow quedó en
> `responseMode: responseNode` con un nodo **Respond to Webhook** colgado de
> "Enviar por Brevo", que responde `{ messageId }`. Verificado con tres POST reales
> al webhook de producción: envío bueno → `HTTP 200` con
> `{"messageId":"<...@smtp-relay.mailin.fr>"}` en 1,4 s; secreto inválido → `HTTP 500`;
> payload sin correo válido → `HTTP 500`. La credencial de Brevo sobrevivió al cambio
> (si no, Brevo habría respondido 401 y el nodo habría fallado).
>
> Lo que sigue abajo queda como registro de por qué se hizo y cómo rehacerlo.

**Qué se gana:** hoy la plataforma no puede saber si un correo salió. El nodo trigger
del workflow `Correo Cotización — Camino Sacro` (id `HgErNCbopi95CdiI`) está en
`responseMode: onReceived`: n8n responde *"Workflow got started"* **antes** de llamar a
Brevo. Un 400 de Brevo —adjunto muy pesado, extensión no admitida, credencial vencida—
le llega a la app como éxito, y el CRM escribe `pilgrim_email_sent_at` y muestra
"✓ Enviado". Las ejecuciones de n8n se purgan a los pocos días, así que después no hay
dónde mirar.

El código de la app acompaña el cambio:

- `src/lib/email/webhook.ts` lee el `messageId` de la respuesta si viene.
- `src/lib/email/log.ts` escribe un renglón por envío en `comercial.email_log`
  (migración `0028`), con estado `confirmado` cuando hay `messageId` y `aceptado`
  cuando no.
- La tarjeta de Pilgrim dice "⏳ En cola" en vez de "✓ Enviado" mientras no haya
  confirmación.

**El efecto secundario que hay que tener presente:** ahora el webhook responde *después*
de llamar a Brevo, y Brevo se descarga los adjuntos de Supabase antes de enviar. Un correo
a Pilgrim con 20 pasaportes puede tardar. Por eso el timeout de `enviarCorreoWebhook` subió
de 10 s a **45 s** — con 10 s, un envío lento abortaba del lado de la app y se reportaba
como fallido aunque el correo hubiera salido, que es el peor error posible porque invita a
reenviarlo. El nodo HTTP de n8n corta a los 30 s, así que 45 lo cubre con margen.

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
