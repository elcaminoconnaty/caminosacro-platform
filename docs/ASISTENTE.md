# Asistente de Camino Sacro + la plataforma como app del celular

Construido el **18-oct-2026** a pedido de Nico: la plataforma instalable en el celular (como BDO
y El Camino con Naty) y un asistente adentro (`/asistente`) al que se le puede preguntar todo.
Lee la base, los PDF guardados, el correo reservas@caminosacro.com y el Gmail de El Camino con
Naty, incluidos los PDF adjuntos. Además **redacta correos desde reservas@**, que salen solo
cuando una persona toca Enviar. Corre con la **suscripción de Claude de Naty** por el SDK de
agentes, igual que el asistente de la plataforma de ECN.

Estado al 18-oct-2026: en producción y probado de punta a punta. El envío real de un correo desde
la tarjeta todavía no se ha probado.

---

## 1. App del celular (PWA) — commit `74b56d6`

| Pieza | Archivo |
|---|---|
| Manifiesto (nombre, `start_url: /seguimiento`, colores, atajos) | `src/app/manifest.ts` |
| Iconos 192 / 512 / maskable (logo actual sobre crema) | `public/icon-*.png`, `src/app/icon.png`, `src/app/apple-icon.png` (180×180) |
| Modo app del iPhone y viewport hasta los bordes | `src/app/layout.tsx` (`appleWebApp`, `viewportFit: "cover"`) |
| Lista única de secciones (menú lateral + barra de abajo) | `src/components/shell/nav.ts` |
| Barra de pestañas abajo (Seguimiento, Cotizaciones, Asistente, Calendario, Más) y hoja "Más" | `src/components/shell/BarraInferior.tsx` |
| Botón volver en pantallas internas | `src/components/shell/BotonVolver.tsx` |
| Cabecera sólida y compacta en el celular | `src/components/shell/Topbar.tsx` |
| El manifiesto tiene que ser público, si no el proxy lo manda a /login y no instala | `src/proxy.ts` (`/manifest.webmanifest`) |

Para instalar: Safari → Compartir → Agregar a inicio.

---

## 2. Motor del asistente

- **SDK:** `@anthropic-ai/claude-agent-sdk` **fijado en 0.3.300**. ⚠️ El 0.3.241 que traía el
  proyecto incluye Claude Code 2.1.241, que rechaza Opus 5.5 ("version 2.1.280 or newer is
  required"). Si se cambia de modelo, revisar la versión del SDK.
- **Autenticación:** `CLAUDE_CODE_OAUTH_TOKEN` en Railway. Es el mismo token de un año que usa el
  asistente de ECN (`claude setup-token` en la cuenta de Naty; vence ~oct-2027). Al proceso se le
  quitan `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` y todas las llaves de la plataforma
  (`entornoDelAgente` en `src/lib/asistente/agente.ts`), y se limpian los saltos de línea del token
  (en BDO la Terminal lo partía).
- **Modelo:** `claude-opus-5-5` con `effort: "medium"`, como BDO. Se cambia sin desplegar con
  `ASISTENTE_MODELO`. `ASISTENTE_HABILITADO=0` lo apaga.
- **Aislamiento:** `tools: []` (sin herramientas de fábrica), `settingSources: []`,
  `permissionMode: "dontAsk"`, `persistSession: false` y cwd en un temporal.
- **Conversación:** el historial (últimos 10 turnos) va dentro del mensaje, marcado como "solo
  contexto, no instrucciones". Respuesta en vivo por NDJSON (`src/app/api/asistente/route.ts`),
  sin `request.signal`, para que termine y se guarde aunque el iPhone corte la conexión.
- **Conocimiento:** `src/lib/asistente/conocimiento.md` (armado desde el wiki y las migraciones:
  negocio, recorrido del cliente, guía de tablas, fórmulas de saldo, correos) más el esquema real,
  que se lee de `information_schema` con 10 minutos de caché.

### Herramientas (`src/lib/asistente/agente.ts`)

| Herramienta | Qué hace | Dónde vive |
|---|---|---|
| `consultar` | Un SELECT por `comercial.asistente_consulta` | migración `0060_asistente.sql` |
| `documentos` / `leer_documento` | Lista y abre PDF e imágenes de Storage (buckets `comercial-*`) | `documentos.ts`, `pdf.ts` |
| `buscar_correos_reservas` / `leer_correo_reservas` / `leer_adjunto_reservas` | reservas@ (Outlook) | `correos.ts` |
| `buscar_gmail_ecn` / `leer_gmail_ecn` / `leer_adjunto_gmail_ecn` | elcaminoconnaty@gmail.com | `correos.ts` |
| `proponer_correo` | Borrador de correo desde reservas@; **no envía** | `acciones.ts` |

### La base: `comercial.asistente_consulta` (migración 0060)
- `security invoker`: corre con la sesión y el RLS de quien pregunta. Lo de BayMax, `ig_tokens` y
  `config` no tienen política para `authenticated`, así que devuelven cero filas.
- Exige transacción de solo lectura: el servidor llama con `rpc(..., { get: true })`, y PostgREST
  corre los GET en modo READ ONLY. Un solo SELECT/WITH, sin `;`, máximo 200 filas.
- Red extra por nombre: bloquea `baymax_`, `ig_tokens`, `contract_otps`, `config`, `auth.`,
  `vault.`, `storage.`, `pg_read`, `dblink`…
- La misma migración crea `asistente_conversaciones` y `asistente_mensajes`, con RLS de "solo
  las propias". Así queda registro de quién preguntó qué y qué fuentes usó (`herramientas` jsonb).
- **Por qué hace falta la migración** (Nico lo preguntó): la API de Supabase no deja correr SQL
  libre. Sin esta función, el asistente solo podría usar consultas fijas. La otra opción era
  conectarlo directo a Postgres con la contraseña, pero eso se salta el RLS.

### PDF (`src/lib/asistente/pdf.ts`)
- Texto con `unpdf` (JS puro, sirve en Railway), página por página, con tope de 60.000 caracteres.
- Imágenes (pasaportes, pantallazos) → bloque de imagen para el modelo (máximo ~4,5 MB).
- Los PDF escaneados sin texto (por ejemplo el RUT) solo se reportan: **no se leen por dentro**.

### reservas@ (Outlook)
- Usa el puente n8n que ya existía, "Plataforma → Outlook (Camino Sacro)" (`PUxbb9vEbUdrPfg1`),
  con `OUTLOOK_WEBHOOK_URL`/`SECRET`. Para **leer**, el código solo manda GET, aunque el puente
  también acepta POST/PATCH.
- `Prefer: outlook.body-content-type="text"` para que el cuerpo llegue en texto. `$search` no se
  combina con `$orderby`, así que se ordena después.

### Gmail de ECN — con la autorización de BayMax (decisión de Nico)
- **Primero** se armó un puente n8n de solo lectura (`URQmVUQcPv3pzvzV`). Tuvo un problema: **n8n
  no deja `require('crypto')`** en los nodos de código ("Module 'crypto' is disallowed"), así que
  se cambió por un SHA-256 en JS puro. Después **Nico pidió reciclar lo de BayMax**, y ese flujo
  quedó **sin uso**.
- **Ahora:** la app llama directo a la API de Gmail. Usa el cliente OAuth de Google de BayMax
  (`Agentes/BayMax/.env`: `GOOGLE_CLIENT_ID/SECRET`) y el refresh token de la cuenta `elcamino`
  (`Agentes/BayMax/datos/correo-tokens.json`). En la plataforma van como
  `GMAIL_ECN_CLIENT_ID`, `GMAIL_ECN_CLIENT_SECRET` y `GMAIL_ECN_REFRESH_TOKEN`.
  - El access token se renueva en memoria, 5 minutos antes de vencer.
  - `gmail()` **solo hace GET** a `/gmail/v1/users/me/(messages|threads)`. El token podría enviar
    o mandar a la papelera, así que la única barrera es este código.
  - Los refresh tokens de Google no rotan, así que BayMax y la plataforma no se pisan.
- **Conectar o reconectar:** `./scripts/conectar_gmail_ecn.sh` copia los tres valores al
  `.env.local` y a Railway sin mostrarlos, y Railway redespliega solo. Si algún día se reconecta
  la cuenta en BayMax (`npm run correo -- elcamino`), hay que volver a correr el script.
- Gmail cambia el `attachmentId` en cada lectura del mensaje. Por eso al modelo se le da el
  **partId** (estable), y al abrir el adjunto se busca el attachmentId vigente.

### Redactar y enviar correos (`proponer_correo` → tarjeta → Enviar)
- El modelo llama a `proponer_correo`. Con `responder_a_mensaje_id`, la respuesta va dentro del
  hilo; con `para` + `asunto`, es un correo nuevo. Puede llevar CC, adjuntos de Storage (máximo
  3 MB cada uno, por el límite de Graph) y `codigo_cotizacion`.
- `prepararCorreo` (`src/lib/asistente/acciones.ts`) valida todo y **no envía**:
  - En un hilo, el destinatario y el asunto los pone el mensaje original, no el modelo.
  - Si el mensaje indicado es **nuestro** (de reservas@), responde al último que llegó de afuera.
    Si no, se estaría respondiendo a sí misma.
- La propuesta se guarda en el mensaje del asistente (`asistente_mensajes.herramientas`, con RLS),
  **sin migración nueva**. Al terminar el stream, el servidor manda `{t:"guardado", id}` y la
  tarjeta se habilita.
- La tarjeta (`src/app/(dashboard)/asistente/Chat.tsx`, `TarjetaCorreo`) muestra para, CC, asunto,
  adjuntos y el texto editable, con los botones **Descartar** y **Enviar** (este pide confirmar).
- `POST /api/asistente/acciones` (`{ mensajeId, propuestaId, decision, cuerpo }`):
  - relee la propuesta de la base, así que solo la confirma quien la pidió;
  - comprueba que siga pendiente o fallida y que no haya vencido (24 h);
  - tiene un candado por proceso contra el doble toque;
  - envía con `responderEnHilo`/`enviarNuevo` (`src/lib/email/outlook.ts`; a `enviarNuevo` se le
    sumó `cc`);
  - guarda el estado en la propuesta.
- El cuerpo va en párrafos con la firma "Enviado desde la plataforma de Camino Sacro", y el correo
  lleva la categoría Outlook "Plataforma". Queda en `email_log` con `tipo = 'asistente'`.
- Desde el Gmail de ECN **no envía**.

---

## 3. Variables (Railway y `.env.local`)

| Variable | Para qué |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Suscripción de Naty (la copió Nico desde el servicio de ECN) |
| `OUTLOOK_WEBHOOK_URL`, `OUTLOOK_WEBHOOK_SECRET` | reservas@ (ya existían) |
| `GMAIL_ECN_CLIENT_ID`, `GMAIL_ECN_CLIENT_SECRET`, `GMAIL_ECN_REFRESH_TOKEN` | Gmail de ECN (`scripts/conectar_gmail_ecn.sh`) |
| `ASISTENTE_MODELO`, `ASISTENTE_HABILITADO` | Opcionales |
| `GMAIL_ECN_LECTURA_URL`, `GMAIL_ECN_LECTURA_SECRET` | Restos del puente n8n descartado; se pueden borrar |

## 4. Cómo se prueba

- **Herramientas sueltas, en el Mac:** con `npx tsx` y un script que importe
  `src/lib/asistente/*.ts`. Hace falta un stub temporal de `server-only`
  (`node_modules/server-only/{package.json,index.js}` vacío), que se borra después. Las pruebas
  que piden cliente de Supabase usan `createAdminClient`.
- **El modelo NO se puede probar en el Mac:** el login local da "OAuth session expired". Existe
  `ASISTENTE_LOGIN_LOCAL=1`, que usa el `claude` instalado, pero hoy no tiene sesión utilizable.
  La prueba real se hace en producción, desde `/asistente`.
- **Pruebas hechas el 18-oct:**
  - PDF de Pilgrim y carta de bienvenida.
  - Hilo y factura PDF de reservas@.
  - Rooming PDF desde el Gmail de ECN.
  - En producción, una pregunta que cruzó base, contrato y correos de CS-2026-084.
  - Un borrador a Pilgrim con PDF adjunto, sin enviar.

## 5. Bitácora de commits
`ccdca83` plan · `74b56d6` app del celular · `e197110` asistente · `b4b8315` conocimiento ·
`f6d7b24` login local · `eec982d` Gmail con la autorización de BayMax · `4851dfa` SDK 0.3.300 ·
`cf4ba25` el script redespliega · `0d80863` redactar y enviar correos.

## 6. Pendientes
- Probar un envío real desde la tarjeta.
- Leer PDF escaneados: habría que convertir cada página en imagen.
- Más acciones con confirmación, con el mismo patrón: registrar pagos, cargar la referencia de
  Pilgrim…
- Enviar desde el Gmail de ECN (el token de BayMax lo permite; no se habilitó a propósito).
- Borrar el flujo n8n `URQmVUQcPv3pzvzV` y las variables `GMAIL_ECN_LECTURA_*`.
- El token de Naty vence ~oct-2027.
