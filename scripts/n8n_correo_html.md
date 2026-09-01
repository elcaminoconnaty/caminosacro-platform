# n8n — permitir correo en HTML (para la documentación de viaje)

El correo de **documentación de viaje** va maquetado: cabecera de marca, un bloque de
descarga por documento con su botón, el contacto y el aviso legal. Hoy el workflow solo
arma `textContent`, así que ese correo sale como un muro de texto plano.

**No lo apliqué automáticamente, a propósito.** Es la misma razón de siempre
(ver `n8n_varios_adjuntos.md` y `n8n_aviso_interno.md`): `update_workflow` **descarta las
credenciales** de los dos nodos HTTP, y ese workflow es el **único emisor de correo de toda
la plataforma**. Publicar un borrador hecho por SDK tumbaría en silencio las cotizaciones,
los contratos y los recordatorios de firma. Pegarlo a mano toma 30 segundos.

## Cómo aplicarlo

1. Abre el workflow **“Correo Cotización — Camino Sacro”** (`HgErNCbopi95CdiI`).
2. Entra al nodo **“Validar y Preparar”**.
3. Busca este bloque (está justo después de `const cuerpo = ...`):

```js
const brevoBody = {
  sender: { name: 'Camino Sacro', email: 'reservas@caminosacro.com' },
  to: [ nombre ? { email: email, name: nombre } : { email: email } ],
  replyTo: { email: 'reservas@caminosacro.com' },
  subject: subject,
  textContent: cuerpo,
};
```

4. Agrega **debajo** estas tres líneas:

```js
// Correo de documentación de viaje: viene maquetado en HTML. `textContent` se queda
// igual como respaldo (es lo que ve quien tenga el HTML desactivado). Si el payload no
// trae `html`, el correo sale exactamente como siempre.
const html = String(body.html || '');
if (html) brevoBody.htmlContent = html;
```

5. Guarda y publica.

## Mientras tanto

La app ya manda `html` **y** `body`. Sin este cambio, el correo de documentación sale en
texto plano, con los cuatro enlaces completos y legibles. Se ve peor; no se rompe nada, y
el cliente puede descargar igual.

## Después de aplicarlo — probar la regresión

Es obligatorio, porque este nodo lo usan **todos** los correos:

1. Enviar la **documentación de viaje** en modo prueba → debe llegar maquetada, con los
   botones DESCARGAR funcionando.
2. Reenviar una **cotización** desde el CRM → debe seguir llegando en texto plano, con
   `Cotizacion-….pdf` adjunto.
3. Reenviar un **contrato** para firma → igual, en texto plano y con su PDF.
4. Enviar el **correo a Pilgrim** en modo prueba → con los pasaportes adjuntos.

Los tres últimos no mandan `html`, así que si alguno cambia de aspecto, el parche quedó
mal pegado.

## Verificación del envío

Como siempre: `messageId` es la única prueba real de que Brevo tomó el correo. Se ve en
`comercial.email_log`, con `tipo = 'documentacion'` para estos envíos.
