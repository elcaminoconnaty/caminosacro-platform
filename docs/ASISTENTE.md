# Asistente de Camino Sacro + la plataforma como app del celular

Pedido de Nico (18-oct-2026): la plataforma comercial instalable en el celular como las de BDO
y El Camino con Naty, y un asistente adentro al que se le pueda preguntar todo: la base, los
correos de reservas@caminosacro.com y del Gmail de El Camino con Naty, los PDF que genera la
plataforma y los PDF adjuntos en esos correos. Corre con la **suscripción de Claude de Naty**
por el SDK de agentes, igual que el asistente de la plataforma de ECN.

## Etapa 1 — App del celular (PWA)
- `src/app/manifest.ts`, iconos desde `Camino Sacro/Logo Camino Sacro/`, `appleWebApp` y
  `viewportFit: cover` en `layout.tsx`.
- En el celular hoy no hay menú (la barra lateral es `hidden md:flex`): barra de pestañas abajo
  (Seguimiento, Cotizaciones, Asistente, Calendario, Más) y una hoja "Más" con el resto.
- Topbar compacta en el celular, áreas seguras del iPhone.

## Etapa 2 — Asistente (`/asistente`)
- **Motor:** `@anthropic-ai/claude-agent-sdk` (ya está en el proyecto). En Railway con
  `CLAUDE_CODE_OAUTH_TOKEN` = token de un año de la cuenta de Naty (`claude setup-token`); se le
  quitan `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` al proceso. Sin herramientas de fábrica,
  `settingSources: []`, `permissionMode: "dontAsk"`.
- **Herramientas (todas de solo lectura en esta etapa):**
  - `consultar`: un SELECT sobre el esquema `comercial` por `comercial.asistente_consulta`
    (security invoker, transacción de solo lectura, máx. 200 filas).
  - `documentos_de_cotizacion` / `leer_pdf`: lista y lee los PDF de Storage (cotizaciones,
    contratos, recibos, documentación de viaje, cartas, pasaportes). Texto con `unpdf`; si el
    PDF es escaneado o es una imagen, se le pasa como imagen.
  - `buscar_correos_reservas` / `leer_correo_reservas` / `leer_adjunto_reservas`: buzón
    reservas@ por el puente de Outlook que ya existe (n8n `PUxbb9vEbUdrPfg1`).
  - `buscar_gmail_ecn` / `leer_gmail_ecn` / `leer_adjunto_gmail_ecn`: elcaminoconnaty@gmail.com
    por un puente NUEVO de solo lectura en n8n (credencial Gmail de ECN).
- **Conocimiento:** `src/lib/asistente/conocimiento.md`, armado desde el wiki y las carpetas
  de Camino Sacro (rutas, precios, Pilgrim, políticas, cómo funciona la plataforma).
- **Registro:** `comercial.asistente_preguntas` (quién preguntó qué, cuánto tardó, qué consultó).
- Migración `0060_asistente.sql` (la corre Nico con `./scripts/migrar.sh`).

## Pendientes para después
- Acciones con confirmación (proponer → botón Confirmar), como en ECN.
- El token de Naty vence en un año: regenerarlo con `claude setup-token`.
