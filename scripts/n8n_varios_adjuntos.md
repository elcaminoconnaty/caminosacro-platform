# n8n — permitir varios adjuntos (para el correo a Pilgrim)

El correo a Pilgrim lleva **un pasaporte por viajero**. Hoy el workflow solo arma un
adjunto. La API de Brevo ya acepta un array; solo falta que el workflow lo pase.

**No lo apliqué automáticamente a propósito.** El SDK de n8n no permite referenciar una
credencial existente por su ID, y `get_workflow_details` no la expone. Reescribir el
workflow desde código habría dejado los dos nodos HTTP con una credencial vacía, y ese
workflow es el **único emisor de correo de toda la plataforma**: se habrían caído en
silencio las cotizaciones, los contratos y los recordatorios de firma. Pegarlo a mano
toma 30 segundos y no toca las credenciales.

## Cómo aplicarlo

1. Abre el workflow **“Correo Cotización — Camino Sacro”** (`HgErNCbopi95CdiI`).
2. Entra al nodo **“Validar y Preparar”**.
3. Busca este bloque (está más o menos a la mitad, justo después de `const brevoBody = {...}`):

```js
if (pdfUrl) {
  const adjunto = String(body.attachment_name || '') || ('Cotizacion-' + (code || 'CaminoSacro') + '.pdf');
  brevoBody.attachment = [{ url: pdfUrl, name: adjunto }];
}
```

4. Reemplázalo por este:

```js
// Varios adjuntos (correo a Pilgrim: un pasaporte por viajero). Si no vienen, se
// mantiene el comportamiento de siempre con pdf_url + attachment_name, así que las
// cotizaciones, los contratos y los recordatorios siguen igual.
const adjuntos = Array.isArray(body.attachments) ? body.attachments : [];
if (adjuntos.length > 0) {
  brevoBody.attachment = adjuntos
    .filter(function (a) { return a && a.url; })
    .map(function (a, i) {
      return { url: String(a.url), name: String(a.name || ('Adjunto-' + (i + 1) + '.pdf')) };
    });
} else if (pdfUrl) {
  const adjunto = String(body.attachment_name || '') || ('Cotizacion-' + (code || 'CaminoSacro') + '.pdf');
  brevoBody.attachment = [{ url: pdfUrl, name: adjunto }];
}
```

5. Guarda y publica.

## Mientras tanto

La app ya manda `attachments`, y además sigue mandando `pdf_url` con el **primer**
pasaporte. Así que sin este cambio el correo a Pilgrim sale igual, pero con un solo
pasaporte adjunto en vez de todos. Nada se rompe; solo van incompletos los adjuntos.

## Después de aplicarlo — probar la regresión

Es obligatorio, porque este nodo lo usan todos los correos:

1. Reenviar una **cotización** desde el CRM → debe llegar con `Cotizacion-….pdf`.
2. Reenviar un **contrato** para firma → debe llegar con `Contrato-….pdf`.
3. Enviar el **correo a Pilgrim** en modo prueba de `CS-TEST-03` → deben llegar los
   pasaportes de los que ya firmaron.
