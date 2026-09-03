# n8n — permitir correo en HTML (para la documentación de viaje)

> **Estado a 3-sep-2026: el parche YA ESTÁ APLICADO** en el workflow de producción
> (`HgErNCbopi95CdiI`, nodo «Validar y Preparar»), verificado leyendo el nodo: `textContent`
> se conserva y `htmlContent` solo se añade `if (html)`. Lo de abajo se conserva porque hay
> que volver a pegarlo cada vez que el nodo se reescriba, y porque la prueba de regresión
> sigue siendo obligatoria. **Antes de rehacerlo, comprueba si ya está.**

Los correos **maquetados** —la documentación de viaje y, desde el commit `bba0277`, también
la cotización al cliente— llevan cabecera de marca, bloques con botón, contacto y aviso
legal. Sin este parche el workflow solo arma `textContent` y esos dos correos salen como un
muro de texto plano.

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
// Correos maquetados (documentación de viaje y cotización al cliente): vienen en HTML.
// `textContent` se queda igual como respaldo (es lo que ve quien tenga el HTML
// desactivado, y ayuda a que el correo no puntúe como spam). Si el payload no trae
// `html`, el correo sale exactamente como siempre.
const html = String(body.html || '');
if (html) brevoBody.htmlContent = html;
```

5. Guarda y publica.

## Si el parche NO está puesto

La app manda `html` **y** `body` siempre. Sin el parche, la documentación de viaje y la
cotización salen en texto plano, con los enlaces completos y legibles. Se ve peor; no se
rompe nada, y el cliente puede descargar igual.

## Después de aplicarlo — probar la regresión

Es obligatorio, porque este nodo lo usan **todos** los correos. Qué debe llegar:

| # | Prueba | Cómo debe llegar |
|---|---|---|
| 1 | **Documentación de viaje** en modo prueba | **Maquetada**, con los botones DESCARGAR funcionando |
| 2 | **Cotización** reenviada desde el CRM | **Maquetada**, con `Cotizacion-….pdf` adjunto y su enlace de versión web |
| 3 | **Contrato** para firma | En **texto plano**, con su PDF |
| 4 | **Correo a Pilgrim** en modo prueba | En **texto plano**, con los pasaportes adjuntos |

> **Ojo, esto cambió.** Hasta el commit `bba0277` la cotización iba en texto plano y esta
> guía decía que si cambiaba de aspecto era señal de parche mal pegado. **Ya no.** Hoy la
> cotización maquetada es la señal de que el parche está **bien** puesto; si llegara en
> texto plano, es que falta. Los que **no** mandan `html` son solo dos: **contrato y
> Pilgrim**; si alguno de esos dos cambia de aspecto, el parche quedó mal pegado.

## Verificación del envío

Como siempre: `messageId` es la única prueba real de que Brevo tomó el correo. Se ve en
`comercial.email_log`, donde desde la revisión de B4 quedan fila **todos** los flujos:
`documentacion`, `cliente` (los tres cotizadores), `contrato` (los tres flujos del embudo),
`pilgrim` y `lead`. Estado `confirmado` = Brevo devolvió `messageId`; `aceptado` = el
workflow terminó pero no hay prueba; `error` = falló.

**`confirmado` significa «Brevo lo aceptó», no «llegó».** Los rebotes y los bloqueos ocurren
después y hoy no vuelven a la plataforma (ver la propuesta del endpoint de eventos de Brevo
en `auditoria/B4-correo.md`).
