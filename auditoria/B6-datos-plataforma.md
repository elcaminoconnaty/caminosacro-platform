# B6 — Datos y plataforma

**Cubre:** Las 33 migraciones, RLS, Storage, `src/proxy.ts`, auth, `src/lib/supabase/**`, `api/**`

**Por qué importa:** Lo que no se ve y se lleva todo por delante cuando falla.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B6.1 El esquema real contra las migraciones.** Usa el MCP de Supabase: columnas muertas, tablas sin uso, índices que faltan en las consultas que sí se hacen, CHECK que ya no reflejan el código.
  `Estado: hecho` — **el esquema está sano y bien cuidado**: los siete CHECK coinciden exactamente con las
  constantes del código, los índices parciales están hechos a medida de las consultas reales, y las tres
  tablas «sin referencias» que encontré resultaron ser correctas (las alimentan triggers o un RPC). Dos
  cosas: `route_catalogs` tiene 7 filas y **no la lee nadie**, y `contracts` es la **única** tabla hija de
  `quotes` sin índice por `quote_id`. Arreglado de paso un mensaje de error que listaba mal los estados.
- **B6.2 Permisos.** Todas las tablas tienen una policy `auth_all` para cualquier autenticado. Con dos usuarios da igual; di qué se rompería con un tercero. Y dónde se usa `service_role` y si hace falta.
  `Estado: en curso` — inventario de las policies reales (¿RLS activo en las 27 tablas?), qué podría hacer
  una tercera cuenta, y los sitios donde se usa el cliente admin: si cada uno lo necesita de verdad.
- **B6.3 Rendimiento.** El expediente lanza dieciséis consultas por carga. Listados sin paginar, N+1, imágenes sin optimizar. Mide antes de opinar.
  `Estado: pendiente`
- **B6.4 Secretos y configuración.** Qué claves llegan al navegador, qué hay en `.env`, qué pasa si falta `APP_BASE_URL` en producción.
  `Estado: pendiente`
- **B6.5 Los endpoints públicos.** `/api/wp`, `/api/agente`, `/api/cron`: autenticación, límite de peticiones, validación del cuerpo, y qué devuelven cuando algo va mal.
  `Estado: pendiente`
- **B6.6 Cero tests.** No pidas «más tests». Di **las tres cosas** cuya rotura silenciosa costaría más caro y qué prueba mínima las cubriría.
  `Estado: pendiente`
- **B6.7 Copias y recuperación.** Qué pasa si alguien borra una cotización por error o se pierde un bucket. Qué hay hoy y qué falta.
  `Estado: pendiente`

---

## Hallazgos

### [MENOR] `route_catalogs` tiene datos y no la lee nadie — `comercial.route_catalogs` (migración `0001_init_comercial.sql:262`)

De las 27 tablas del esquema, cuatro no aparecen ni una vez en `src/`. Tres son correctas y
conviene decirlo para que nadie las borre por error:

- `pricing_history` y `bike_price_history` las alimentan **triggers** (`pricing_audit`,
  `bike_prices_audit`), así que no tienen por qué aparecer en el código.
- `quote_codes` la usa el RPC `next_quote_code()` desde dentro de la base.

La cuarta, **`route_catalogs`, no tiene esa excusa: tiene 7 filas y ninguna línea de código
la consulta**. Existe desde la migración inicial y quedó por el camino. Su hermana
`welcome_letters` (3 filas) sigue viva por un solo hilo: una consulta en
`catalogo/page.tsx:52`.

No hace daño —son 48 kB— pero es deuda que confunde: alguien que abra el esquema para
entender el modelo verá una tabla de catálogos por ruta con datos dentro y asumirá que el
producto tiene esa función. **Propuesta:** borrarla si el catálogo por ruta se abandonó, o
anotar en la migración que quedó en desuso. Decidirlo con Nico, que sabrá si esos 7 PDF
hacían falta.

### [MENOR] `contracts` es la única tabla hija de `quotes` sin índice por `quote_id` — `comercial.contracts`

El expediente lee los contratos de una cotización con `.eq("quote_id", id)` en cada carga, y
esa columna no tiene índice. Es la **única** que se lo salta: de las nueve tablas con clave
foránea a `quotes`, ocho tienen su índice por `quote_id` y `contracts` no.

| tabla hija | índice por `quote_id` |
|---|---|
| `client_payments`, `provider_payments`, `quote_lines`, `quote_hotels`, `quote_travelers`, `quote_pilgrim_files`, `travel_docs`, `email_log` | **sí** |
| **`contracts`** | **no** |

Con 8 contratos en la base da exactamente igual, y por eso es MENOR. Lo anoto por dos
razones: porque es una **incoherencia** con el patrón que el resto del esquema sí sigue —o
sea, un olvido, no una decisión—, y porque `contracts` es la tabla más pesada de las hijas
(536 kB con 8 filas, por las imágenes de firma en `signature_image`), así que un barrido
secuencial ahí cuesta más que en las demás. **Propuesta:** `create index contracts_quote_idx
on comercial.contracts (quote_id)`. Una línea, sin riesgo.

### Lo que sí está bien: el esquema aguanta el escrutinio

Fui a buscar las cuatro cosas de la tarea y tres salieron limpias:

- **Los CHECK reflejan el código exactamente.** El caso que importa es
  `quotes_status_check`, y sus siete valores coinciden **uno a uno y en el mismo orden** con
  `QUOTE_STATUSES` de `src/lib/quoteStatus.ts`, que además lleva escrito «debe coincidir con
  el CHECK de comercial.quotes.status (migración 0033)». Igual los otros seis:
  `contracts_status_check`, `quote_lines_type_check`, `quotes_source_check`,
  `quotes_season_kind_check`, `routes_modality_check` y `client_payments_currency_check`
  cuadran con las constantes y los literales que usa la aplicación. No encontré ni un CHECK
  desfasado.
- **Los índices están hechos a medida de las consultas reales, no puestos por si acaso.** Dos
  son de libro: `contracts_recordatorios_idx` es **parcial** —`(status, reminder_count) WHERE
  status = 'enviado'`— y es exactamente la consulta del cron de recordatorios; y
  `email_log_token_idx` es único y parcial sobre `token IS NOT NULL`, que es como se resuelve
  `/correo/[token]`. `quotes` tiene los suyos por `status`, `source`, `client_id`,
  `parent_quote_id` y `code`.
- **Las bitácoras son triggers, no llamadas desde la aplicación**, tanto en `pricing` como en
  `bike_prices`. Que `bike_price_history` esté vacía no es un cableado que falte: es que las
  tarifas de bici se insertaron en agosto y **todavía no se ha modificado ninguna** (el
  trigger es `AFTER UPDATE`). Lo comprobé antes de darlo por roto.
- **El tamaño no es un problema hoy ni de lejos**: las 27 tablas suman unos 2,5 MB, y la más
  grande es `contracts` con 536 kB. Cualquier hallazgo de rendimiento en este bloque es sobre
  el futuro, no sobre el presente.

Lo único que **sí** faltaría mirar a futuro: `quotes.start_date` no tiene índice, y es la
columna por la que ordena `/seguimiento` y por la que preguntarían los recordatorios que
proponen B2.7 y B5.1. Con 45 filas es irrelevante; lo dejo dicho junto con el de `contracts`
para cuando se toque el tema.

---

## Arreglos aplicados

### El mensaje de estado inválido no listaba todos los estados — `src/lib/errors.ts:14-16`

`CONSTRAINT_MESSAGES.quotes_status_check` es el texto que ve el usuario cuando la base
rechaza un estado, y enumeraba **seis**: «Enviada, Aceptada, Pago parcial, Pago completo,
Completada o Cancelada». La migración 0033 añadió **`sin_enviar`** al CHECK y a
`QUOTE_STATUSES`, pero este mensaje se quedó atrás: le decía a quien lo leyera que un estado
que sí es válido no lo era, y encima es el estado **inicial** de toda cotización nueva.
Añadido «Sin enviar» y anotado de qué dos sitios depende, para que la próxima vez se muevan
juntos. `npx tsc --noEmit` limpio.

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
