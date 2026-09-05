# Para retomar — después de la auditoría

`Estado al 5-sep-2026` · Escrito para que al volver no haya que reconstruir nada.

La auditoría está **terminada** (ver `TABLERO.md`) y su resultado se lee en `SINTESIS.md`.
Este archivo es lo que vino **después**: qué se arregló, qué falta, y qué está esperando a
Nico. Si retomas esto, empieza aquí y no por la síntesis.

---

## Cómo está el árbol

`main` está en **`7841ef1`**, empujado y desplegado. Nada sin commitear.

**El despliegue está confirmado por evidencia**, no por suposición: el 4-sep a las 7:57 el
reenvío del contrato de Johana dejó una fila en `comercial.email_log`, y el código anterior
no registraba los correos de contrato. Si vuelve a hacer falta comprobarlo, esa es la prueba
—una fila nueva en `email_log` con `tipo` distinto de `cliente`— porque **desde fuera no hay
forma de distinguir el build viejo del nuevo**: todo lo que cambió en páginas públicas es
código de servidor y no deja huella visible. El otro camino es abrir Seguimiento y ver si
está la franja «Hoy».

---

## Lo que se hizo (3 y 4 de septiembre)

Todo commiteado, empujado y desplegado.

| Commit | Qué |
|---|---|
| `545d65d` | Los tres archivos de estado del panel (`loading` / `error` / `not-found` en `(dashboard)`), que cubren las 15 pantallas |
| `cba2b39` | `{{saldo_eur}}` y `{{pagado_eur}}` en los dos constructores de variables de correo |
| `1c0b900` | La franja «Hoy» de Seguimiento (4 cubos que filtran la tabla) y la columna **Firmas** |
| `7545086` | El editor del expediente deja de pisar el precio a mano y de dejar viejo el reparto de habitaciones |
| `4fa57ce` | El lead de la web se guarda **antes** de intentar el correo (migración `0035_web_leads`) |
| `30ba3c2` | El pagaré del contrato se elige (`payment_plan_json.con_pagare`), ya no lo decide el plan |
| `19b33d9` | `scripts/n8n_cuatro_apuntes.md` — los cuatro cambios de n8n, listos para pegar |
| `17342ff` | Una fila de precio vacía ya no cuenta como año cargado (cierra §2.7 **sin borrar nada**) |
| `2448217` | El contrato se marca «enviado» solo cuando el correo salió de verdad |
| `3da8b35` | Guardar sin cambios ya no regenera el PDF que el cliente tiene |
| `362221f` | El botón «Intentar de nuevo» usa `unstable_retry()`, no `reset()` |
| `09df2e5` | Duplicar una cotización que ya existe |
| `0d58efe` | Borrar se niega si hay firma o dinero · cobrar mueve el estado · las tres guardas de la moneda |
| `7841ef1` | El robot de firmas mira la fecha de salida: reabre a 15 y 5 días, y calla al salir |

Con esto quedan cerrados de la síntesis: **§2.4 entero**, **§2.3**, **§2.5**, **§2.6**,
**§2.7**, y los puntos 1, 3, 7, 9, 12, 14 y 15 de la tabla «lo que más rinde».

### Dos migraciones aplicadas a producción

- **`0029_contenido_pedidos`** — ensancha el CHECK de `contenido_trabajos` y añade
  `contenido_ideas.pedido`. Era lo que le faltaba a «Pídelo tú» para no reventar.
- **`0035_web_leads`** — tabla nueva. Probada con la forma exacta que manda el endpoint y
  dejada en 0 filas.

Las dos son aditivas. Se aplicaron **antes** del push, que es el orden que no rompe al
código viejo mientras compila el nuevo.

---

## Cuatro decisiones que Nico ya tomó (4-sep) y están construidas

No hay que volver a preguntarlas:

1. **Borrar** → negarse si hay contratos firmados o pagos, y ofrecer «Cancelada».
2. **Cobrar** → mueve el estado solo, **y** la documentación de viaje se habilita por el
   saldo, no por la etiqueta.
3. **Moneda del pago** → las tres guardas (tasa obligatoria si no es EUR, campo de tasa
   también para dólares, y la moneda de la cuenta se respeta).
4. **Recordatorios** → reabren a 15 y a 5 días de la salida, avisando también a `reservas@`.

---

## Lo que falta, y de quién es

### Bloqueado por Nico — nada de esto puede avanzar sin él

**1. Rotar el secreto del webhook de n8n.** Es lo primero de todo. Está en claro dentro del
nodo Code y sale por dos rutas de la API de n8n (el workflow y cada ejecución guardada), y
además viajó a una sesión de Claude al leer el workflow. Todo escrito en
`scripts/n8n_cuatro_apuntes.md`, punto (c). **Los tres correos que faltan van por esa misma
tubería, así que hasta que no se rote no tiene sentido montarlos.**

**2. Los otros tres apuntes de n8n** — lista blanca del host del adjunto, orden de las dos
ramas, y un Error Workflow. Mismo documento, puntos (a), (b) y (d). Son de pegar a mano:
`update_workflow` por SDK **descarta las credenciales de los dos nodos HTTP** y publicar así
tumba todo el correo de la plataforma.

**3. La copia de seguridad.** Sigue sin existir ninguna: plan gratuito de Supabase, y los
archivos no entran en esas copias en ninguna hipótesis. Falta que Nico diga **dónde** vive;
el volcado semanal por n8n se monta después. Base ~2,5 MB; pasaportes y contratos 11,1 MB.

**4. Activar el rechazo de contraseñas filtradas** en Supabase (Authentication → Providers).
Comprobado el 4-sep a las 18:13: sigue apagado.

**5. Datos que solo él puede arreglar:** los 25 pasaportes `CS-TEST` del cubo (25 de 32, y 2
huérfanos reales: `CS-2026-048` y `CS-2026-044`); las camas de **CS-2026-080** (13 personas
con 8 dobles, modalidad de texto libre «Doble + Triple», hay que usar «Habitaciones a
medida»); las tarifas de 2027 (6 de 51); el pago de 20 € de CS-2026-019; y lo que hay que
pedirle a Pilgrim.

**6. Comprobaciones que ningún agente puede hacer:** abrir el panel desde el celular (nadie
ha visto nunca el CRM con datos) y revisar DKIM/SPF/DMARC y la reputación en Brevo.

El paso a paso con enlaces está en el artifact:
https://claude.ai/code/artifact/c5615f50-b646-4ee5-b673-424ba25b71ac

### Mío, en cuanto el secreto esté rotado

Los tres correos que faltan de `CRITERIOS.md` §3. En los tres **el dato ya está en la base y
el patrón ya está escrito** — `api/cron/recordatorios-contrato` es la plantilla exacta:

- **Aviso de saldo.** La plantilla `recordatorio_pago` ya existe, está activa y no tiene
  llamador. Su `{{saldo_eur}}` ya está arreglado (`cba2b39`), así que solo falta el cron.
- **Seguimiento de la cotización sin respuesta.** Hoy hay **18 cotizaciones vencidas y
  quietas** (medido el 4-sep). Es lo que más plata deja sobre la mesa de toda la auditoría.
- **Confirmación de pago recibido.**

Y después, el **buzón de rebotes de Brevo**: hoy «enviada» significa «Brevo lo aceptó», no
«llegó», y un correo mal tecleado deja un ✓ verde.

### Dos decisiones grandes, sin prisa

- **¿El articulado del contrato se mueve a Configuración?** Hoy vive en el código —incluida
  la cláusula sexta, la de cancelación— mientras las condiciones del Documento de Viaje las
  edita Nico. Las dos tienen que decir lo mismo.
- **¿Las tarifas van por año o por vigencia?** La base promete `desde`/`hasta` y el código
  mira el año natural; esas dos columnas están vacías en las 51 filas.

---

## Cosas que cuestan caro redescubrir

- **`update_workflow` de n8n descarta las credenciales** de los nodos HTTP. Nunca publicar
  un borrador hecho por SDK sin volver a ponerlas a mano.
- **`AGENTS.md` no es decorativo.** Este Next tiene APIs cambiadas: `error.tsx` usa
  `unstable_retry()`, no `reset()`. Se coló un error por copiar un archivo viejo del propio
  proyecto en vez de leer `node_modules/next/dist/docs/`. Leerlos antes de escribir.
- **Desde fuera no se puede saber si un despliegue salió.** La sonda que compara los chunks
  de `/login` **no sirve**: esa página es estática y cacheada un año en el borde. Usar
  `email_log` o la franja «Hoy».
- **`next_quote_code` gasta un número de cotización de verdad**, y Nico los lleva contados.
  No probar el duplicador «a ver si funciona»: la primera vez que se use es la prueba.
- **Las fechas `DATE` de Postgres se comparan como cadenas `YYYY-MM-DD`.** Pasarlas por
  `new Date()` las corre un día en Bogotá.
- **Los `numeric` vuelven como cadena** (`"585.00"`), así que comparar con un número del
  formulario da siempre «cambió».

---

## Dos correcciones a la síntesis, verificadas contra producción

La síntesis se escribió con datos del 3-sep y **dos de sus hallazgos no sobrevivieron**:

1. **CS-2026-081 estaba bien y el informe mal.** La cotización tenía adjunta la de Pilgrim
   (`C703461`), que cotiza **14 noches con alojamiento cada una** — exactamente lo que decía
   el PDF que se le mandó a la clienta. Lo que estaba mal era la **ficha de la ruta**
   (`13 días / 12 noches`), corregida el 3-sep a `15 / 14` junto con la `end_date` de la 081.
   Y su «costo Pilgrim» **no** es venta × 0,85 inventado: son 2 × 1.233 €, el precio real.
   De las tres que señalaba el informe, la única que encaja en ese patrón es **CS-2026-033**.

2. **El complemento del lado de la app para el punto (b) de n8n ya no hace falta.** El único
   envío que lleva pasaportes es el correo a Pilgrim, y `sendPilgrimEmail.ts:63` ya frena con
   `adjuntosNoSoportados()`. El defecto de n8n sigue en pie, pero lo dispara cualquier 400 de
   Brevo, no el HEIC que citaba el informe.

---

## Números al 4-sep-2026 (caducan rápido)

44 cotizaciones · 18 vencidas y quietas · 6 de 51 tarifas son de 2027 · 13 cotizaciones con
salida en 2027 · 1 contrato sin firmar de un viaje futuro (Johana, CS-2026-004, reenviado el
4-sep con enlace hasta el 25-sep) · 4 expedientes protegidos por la guarda de borrado · 25 de
32 pasaportes son `CS-TEST` · 0 copias de seguridad.
