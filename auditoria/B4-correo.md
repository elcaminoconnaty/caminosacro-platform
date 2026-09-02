# B4 — Correo

**Cubre:** `lib/email/**`, `lib/quotes/{clientEmail,emailHtml,pilgrimEmail,sendPilgrimEmail}.ts`, `lib/contracts/email.ts`, `lib/travelDocs/{email,html}.ts`, `correo/[token]`, `api/cron/**`

**Por qué importa:** Todo el correo de la plataforma sale por un solo workflow de n8n. Si eso falla, no sale nada.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B4.1 El punto único de fallo.** Si n8n o Brevo caen, ¿qué ve quien pulsa enviar? ¿Hay reintento, cola o se pierde? Un `ok` que no prueba nada ya causó tres solicitudes dadas por enviadas que nunca llegaron.
  `Estado: en curso` — leyendo `lib/email/webhook.ts` de punta a punta: qué se considera éxito, qué pasa con
  un timeout o un 5xx de n8n, si hay reintento o cola, y qué ve en pantalla quien pulsó enviar. Cruce con
  `email_log` en producción para ver si el registro distingue enviado de intentado.
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

_(Vacío. Se escribe según se encuentra, nunca al final.)_

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
