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
  `Estado: hecho` — RLS **activo en las 27 tablas**, una policy por tabla, todas para `authenticated`, sin
  una sola excepción; y el cliente de servicio se usa **solo donde no hay sesión** (los 23 sitios
  revisados uno a uno, ninguno sobra). Con las 2 cuentas de hoy el modelo es correcto. La respuesta a la
  pregunta de la tarea: una tercera cuenta **no se puede acotar**, entraría viendo los pasaportes.
- **B6.3 Rendimiento.** El expediente lanza dieciséis consultas por carga. Listados sin paginar, N+1, imágenes sin optimizar. Mide antes de opinar.
  `Estado: hecho` — **sin hallazgos de rendimiento.** Medido: el expediente lanza **20** consultas, no 16,
  pero **las 20 en un solo `Promise.all`**, así que cuestan lo que la más lenta, no la suma. No hay ningún
  N+1: el único bucle sospechoso resuelve los hoteles con un `.in()` y cachea las fotos, con el incidente
  que lo motivó anotado al lado. Las imágenes están optimizadas a conciencia. La base entera pesa 2,5 MB.
- **B6.4 Secretos y configuración.** Qué claves llegan al navegador, qué hay en `.env`, qué pasa si falta `APP_BASE_URL` en producción.
  `Estado: hecho` — **al navegador solo llegan las dos claves que deben llegar** (la URL de Supabase y la
  publishable), ningún secreto lleva el prefijo `NEXT_PUBLIC_` y los tres módulos que leen claves son
  `server-only`. Pero **`AGENTE_API_SECRET` no está en `.env.example` ni en `.env.local`**, y como se lee
  con acceso dinámico es invisible a un grep: los once endpoints de BayMax devuelven 401 sin que nada diga
  por qué. Y `APP_BASE_URL` se comporta de **tres maneras distintas** cuando falta.
- **B6.5 Los endpoints públicos.** `/api/wp`, `/api/agente`, `/api/cron`: autenticación, límite de peticiones, validación del cuerpo, y qué devuelven cuando algo va mal.
  `Estado: hecho` — **los 13 endpoints del CRM tienen autenticación, sin excepción**, y los topes de página
  están acotados donde importa. El hueco es de validación de fechas: `/api/agente/cotizaciones` pasa `desde`
  y `hasta` sin comprobar a la consulta, y una fecha mal formada acaba en un **500 «interno»** — y el
  consumidor de ese endpoint es **BayMax**, o sea un modelo que no puede corregirse con ese mensaje.
- **B6.6 Cero tests.** No pidas «más tests». Di **las tres cosas** cuya rotura silenciosa costaría más caro y qué prueba mínima las cubriría.
  `Estado: hecho` — las tres, con el criterio de «se rompe sin que nadie se entere»: **(1)** que las cinco
  aritméticas del precio den el mismo número, **(2)** que los cinco PDF rendericen, **(3)** que ninguna
  plantilla de correo use una variable que nadie produce. Las tres ya se han roto de verdad —están
  documentadas en B1, B3 y B4— y las tres se cubren con **una tarde y un solo `npm i -D vitest`**.
- **B6.7 Copias y recuperación.** Qué pasa si alguien borra una cotización por error o se pierde un bucket. Qué hay hoy y qué falta.
  `Estado: hecho` — **el plan de recuperación de la plataforma es una frase de la GUIA que probablemente no
  es cierta.** Dice que el plan gratuito de Supabase hace backups diarios con 7 días de retención; el propio
  `next.config.ts` deja escrito que este proyecto **no tiene funciones de plan pago** («comprobado»), y en el
  plan gratuito los backups automáticos no existen. Además, **Storage nunca entra** en la copia de la base,
  en ningún plan: los pasaportes y los contratos firmados no tienen copia. Primera verificación de Nico.

---

## Hallazgos

### [MENOR] No hay forma de dar acceso limitado: una tercera cuenta lo ve todo, incluidos los pasaportes — las 27 policies de `comercial` + las de Storage

> **Etiqueta corregida en la revisión: MEDIO → MENOR.** El análisis y la propuesta se conservan
> íntegros; lo que cambia es la gravedad. Motivo, del crítico: `CRITERIOS.md:63-64` excluye
> literalmente los «permisos por rol» de lo que es un hallazgo; no se puede completar la frase
> «esto hace que se pierda ___» (hoy: nada — dos usuarios, los dos dueños, con derecho a ver
> todo lo que ven); y no se cumple ninguna de las tres condiciones de MEDIO del TABLERO (no
> engaña, no se rompe en un caso realista —hace falta contratar a alguien, que es un cambio de
> negocio, no un uso de la plataforma— y no cuesta el triple). Es «deuda que hoy no muerde» con
> un disparador conocido: MENOR de libro. La distinción importa porque B8 ordena por gravedad, y
> un MEDIO aquí desplazaría hacia abajo cosas que sí muerden hoy.

El modelo es de una sola pieza y perfectamente uniforme: **RLS activo en las 27 tablas**,
**una policy en cada una**, y las 27 conceden a `authenticated` sin más condición que estar
autenticado. Lo mismo en Storage (B3.4): los nueve buckets `comercial-*` dan
SELECT/INSERT/UPDATE/DELETE a `authenticated`. No hay ni una columna de rol, ni un
`owner_id`, ni un `auth.uid()` en ninguna condición.

**Con dos cuentas es la decisión correcta** —hoy hay exactamente 2 usuarios en `auth.users`,
los dos dueños del negocio, y montar permisos finos para ellos sería burocracia—. La
pregunta de la tarea es qué pasa con un tercero, y la respuesta es concreta: **no hay término
medio**. Crear una cuenta para una asistente, un contador o un practicante le da, desde el
primer minuto y sin poder evitarlo:

- las **fotos de pasaporte** de todos los viajeros (bucket `comercial-passports`);
- todos los contratos firmados, con su `signer_ip` y su firma manuscrita;
- todos los pagos, saldos y márgenes, y el costo que se le paga a Pilgrim —o sea la
  estructura de márgenes completa del negocio;
- capacidad de **borrar** cualquier cotización, con las consecuencias que documenta B3.6.

Y al revés: alguien que solo tenga que cargar precios o preparar documentación de viaje no
puede tener una cuenta que haga solo eso.

Va como MENOR porque **hoy no hay daño**: son dos usuarios y los dos son dueños. Lo
anoto porque el coste de arreglarlo crece con el tiempo —cada tabla nueva hereda el patrón— y
porque el disparador no es hipotético: la primera contratación lo activa. **Propuesta:** no
hace falta un sistema de roles. Con una tabla `perfiles(user_id, rol)` y **dos** policies
distintas en las tres tablas sensibles —`contracts`, `client_payments`, `provider_payments`—
más el bucket de pasaportes, se cubre el 90 % del riesgo. **Decidirlo antes de crear la tercera
cuenta, no después** — y el motivo de oficio que añade el crítico: en Lemax o Tourwriter el rol se
define al alta y nadie lo piensa; aquí el momento de pensarlo es el día que Nico le pase una clave
a alguien para que cargue tarifas, y ese día se decide en treinta segundos y mal si no está
escrito antes.

### [NOTA PARA B8] El MEDIO de los tests no es un hallazgo independiente: son tres hallazgos de B1, B3 y B4 contados otra vez

El MEDIO de más abajo —«Las tres roturas silenciosas que hay que cubrir, y su prueba mínima»— **no
se baja de etiqueta**: el contenido es de lo mejor del bloque (tres roturas concretas, cada una con
su prueba mínima y su coste en líneas, que es exactamente lo que pedía B6.6 y lo contrario de
«falta un test»). Pero **las tres roturas ya están levantadas en B1, B3 y B4** con sus propias
etiquetas. Si la síntesis suma este MEDIO a aquellos, el mismo problema cuenta dos veces y la
lista de gravedad queda inflada.

**Para B8:** tratarlo como **la respuesta a la tarea B6.6 y el plan de arreglo** de esos tres
hallazgos, no como una entrada más de la lista de gravedad.

### [MENOR] `AGENTE_API_SECRET` es obligatoria, no está documentada y no se puede encontrar con un grep — `api/agente/auth.ts:11` vs `.env.example`

Los once endpoints de `/api/agente/*` —los que usa BayMax— se autentican con
`autorizadoCon(request, "AGENTE_API_SECRET")`. Esa variable:

- **no está en `.env.example`**, que es el único inventario de configuración del proyecto;
- **no está en el `.env.local`** de la máquina de desarrollo;
- y **no aparece buscando `process.env.AGENTE_API_SECRET`**, porque `auth.ts:13` la lee con
  acceso dinámico —`process.env[envVar]`— para poder compartir la función entre WordPress y
  el agente. La única forma de descubrirla es leer `api/agente/auth.ts`.

Lo que pasa cuando falta está bien resuelto y es lo que lo vuelve difícil de diagnosticar:
`autorizado()` devuelve `false` si el secreto no está (**falla cerrado**, que es lo
correcto), así que los once endpoints responden un `401 no_autorizado` idéntico al de una
clave equivocada. Quien clone el repositorio y siga `.env.example` al pie de la letra tendrá
todo funcionando **menos** BayMax, con un 401 que parece un problema de credenciales y es de
configuración.

Al revés también hay ruido: `.env.example` lista `WP_QUOTER_SECRET` —esa sí se usa, como
valor por defecto de la misma función— pero ninguna de las dos aparece con el patrón habitual,
así que el inventario y el código no se pueden contrastar automáticamente.

**Propuesta:** añadir `AGENTE_API_SECRET` a `.env.example` con un comentario de para qué es, y
—ya que se toca— que `autorizado()` registre un `console.warn` cuando la variable pedida no
exista, para distinguir «clave mal puesta» de «clave sin configurar». Las dos cosas son
pequeñas y no tocan la seguridad.

### [MENOR] Una fecha mal formada le devuelve a BayMax un 500 que no le dice nada — `api/agente/cotizaciones/route.ts:32-33,50-54`

`GET /api/agente/cotizaciones` acepta `desde` y `hasta` y los mete directamente en la
consulta:

```ts
const desde = (url.searchParams.get("desde") ?? "").trim();
…
if (desde) consulta = consulta.gte("start_date", desde);
```

Sin comprobar que sean fechas. Un `desde=2026-9-1`, un `desde=hace un mes` o un
`desde=2026-13-45` hacen que Postgres rechace la consulta, y el manejo es:

```ts
if (error) return Response.json({ ok: false, error: "interno" }, { status: 500 });
```

Es el mismo patrón que B1 levantó en `/api/wp/quote` —un dato mal formado del que llama
convertido en error de servidor— pero aquí con un agravante propio: **quien consume este
endpoint es BayMax**, un modelo de lenguaje que arma la URL a partir de lo que Nico le
escribe por Telegram («las que salen el mes que viene»). Es exactamente el cliente que más
probablemente mande `2026-9-1` en vez de `2026-09-01`, y el que **más necesita un mensaje
accionable**: con `{"error":"interno"}` y un 500, el agente no puede saber que el problema es
suyo ni reintentar bien; lo más probable es que le diga a Nico que la plataforma falló.

Y es una lástima porque el resto del endpoint **sí** valida así de bien: `estado` se
comprueba con `isQuoteStatus` y devuelve un **422** con `«Estado desconocido: X»`. La pieza
está ahí al lado.

**Propuesta:** las mismas tres líneas que propone B1 —comprobar que el ISO existe de verdad—
y devolver 422 con el nombre del parámetro, igual que ya se hace con `estado`.

### [MENOR] `APP_BASE_URL` hace tres cosas distintas cuando falta — `email/versionWeb.ts:25` · `contractActions.ts:445` · `api/cron/recordatorios-contrato/route.ts:62`

Es la variable que decide a qué dirección apuntan los enlaces que se le mandan al cliente, y
cada uno de los tres sitios que la usa resuelve su ausencia de una manera:

| dónde | si falta `APP_BASE_URL` |
|---|---|
| `api/cron/recordatorios-contrato:62` | **se planta**: devuelve 500 con «sin ella el enlace de firma del correo saldría roto» |
| `contractActions.baseUrl(h):445` | la **deduce de las cabeceras** de la petición (`x-forwarded-host`) |
| `email/versionWeb.baseUrlApp():25` | cae en un **literal**: la URL de `*.up.railway.app` |

Las tres son defendibles por separado y las tres están comentadas. El problema es que juntas
significan que **no hay una respuesta única** a «¿cuál es nuestra dirección pública?», y que
un despliegue con esa variable mal puesta fallaría de forma distinta —y en un caso, en
silencio— según el flujo. El cron es el único que lo trata como lo que es: un requisito.

Va como MENOR porque hoy la variable está puesta y los tres caminos coinciden. Lo anoto junto
con lo de B4.4 —que el respaldo apunta al dominio de Railway y no al de la marca— porque el
arreglo es el mismo: una sola función que resuelva la base pública, que se plante si no está
configurada, y que use el dominio de marca.

### [GRAVE] No hay ninguna copia de seguridad propia, y la única que se da por hecha probablemente no existe — `GUIA.md:354-356,540`

La GUIA responde la pregunta de esta tarea en dos sitios, y las dos veces con la misma
afirmación:

> «Backup de la DB — Supabase hace **backups automáticos diarios** (free tier 7 días).»
> «Backup: Supabase tiene snapshot diario automático»

Esa frase es lo único que sostiene la recuperación de todo el negocio, y hay tres motivos
para no creerla:

1. **El plan gratuito de Supabase no incluye backups automáticos.** Los diarios con 7 días de
   retención son del plan Pro; en el gratuito la pantalla de Backups es una invitación a
   pagar.
2. **Este proyecto da todas las señales de estar en el gratuito**, y no es una suposición mía:
   `next.config.ts` lo deja escrito al explicar por qué no se usa el optimizador de imágenes
   de Supabase — «Las transformaciones de imagen de Supabase (`/render/image/`) devuelven 403
   porque son **de plan pago** — comprobado».
3. **Y aunque el plan fuera Pro, Storage no entra.** Las copias de Supabase son de la base de
   datos; los objetos de los buckets van por su lado. O sea que las **fotos de pasaporte**,
   los **contratos firmados**, los recibos y los PDF de cotización **no tienen copia en
   ninguna hipótesis**.

**Lo que sí es seguro, y lo comprobé:** la plataforma **no tiene ningún respaldo propio**. No
hay `pg_dump` en `scripts/`, no hay exportación a CSV, no hay un cron de copia —en
`api/cron/` sigue habiendo un solo endpoint, el de recordatorios— y no hay nada en n8n que
saque datos. Si mañana la base no está, no hay de dónde volver.

**Qué pasa hoy con un borrado por error**, juntando lo que ya documentaron B3.4 y B3.6:

- `deleteQuote` **no comprueba nada**: borra igual una cotización con contrato firmado y
  dinero cobrado, tras un `confirm()` que no menciona ni una cosa ni la otra. Hoy hay **tres
  expedientes así**.
- Las cascadas se llevan pagos, contratos, viajeros, documentación y líneas. **Nada de eso es
  recuperable** sin una copia.
- Y lo que **sí** sobrevive es lo peor: los archivos quedan huérfanos en Storage —ya hay dos
  pasaportes de cotizaciones borradas—, o sea que se pierde el registro y se conserva el dato
  personal. Exactamente al revés de lo que uno querría.

Es GRAVE por la definición del TABLERO —«se corrompen datos»— y porque el coste no es
proporcional al error: un clic de más sobre la fila equivocada de `/seguimiento` borra una
venta cobrada y firmada sin vuelta atrás.

**Propuesta, por orden de lo que cuesta:**

- **(a) Confirmar el plan hoy.** Dashboard → Database → Backups. Si dice que no hay, toda la
  sección de la GUIA está mintiendo y hay que corregirla en el mismo minuto: es peor un plan
  de recuperación falso que ninguno, porque impide que alguien monte uno.
- **(b) Un `pg_dump` semanal a un sitio que no sea Supabase**, disparado por el Schedule de
  n8n que ya existe. Con 2,5 MB de base, la copia entera cabe en un correo.
- **(c) Las guardas de borrado de B3.6** —no dejar borrar un expediente con contrato firmado
  o pagos—, que es lo que evita necesitar la copia.
- **(d) Una copia de los buckets sensibles**, aunque sea manual y trimestral:
  `comercial-passports` y `comercial-contracts` son 10 MB entre los dos y son los únicos
  irreemplazables.

### [MEDIO] Las tres roturas silenciosas que hay que cubrir, y su prueba mínima — no hay runner de tests en el proyecto

No hay ni infraestructura: `package.json` no tiene script `test` ni vitest ni jest. Así que el
primer paso no es «escribir tests», es `npm i -D vitest` y un script. Con eso puesto, estas
son las tres, elegidas por un criterio único —**si se rompe, ¿alguien se entera antes de que
cueste plata?**— y las tres tienen ya un caso real documentado en esta auditoría, o sea que
no son hipótesis.

---

**1. Que las cinco aritméticas del precio den el mismo número.**

*Por qué esta:* hay **cinco** implementaciones del precio de una cotización —`tarifarRuta()`,
la réplica en cliente del `Wizard`, la de `/cotizar`, la de `QuoteEditor` y la de
`editQuote`— y B1 demostró que **ya divergen**: el editor de Seguimiento cobra
`precio × personas` donde el resto reparte habitaciones, y `/cotizar` cobra una sola
modalidad a todo el grupo. Es la rotura más cara posible porque no produce ningún error: la
cotización sale, el PDF sale, el correo sale, y el número está mal. Se descubre cuadrando el
año.

*La prueba mínima:* una tabla de unos ocho casos —1, 2, 3 y 5 personas × pensión y hotel ×
todos-individuales— que pase por `tarifarRuta()` y compruebe tres cosas: la base
(`dobles×2×tarifa_doble + individuales×tarifa_single`), que el suplemento se sume **una sola
vez**, y la etiqueta que sale. Es una función pura con la base inyectada: se le pasa un doble
de `supabase` con cuatro filas de `pricing` y no hace falta ni red ni migraciones. **Unas 40
líneas.** Y la segunda mitad, que es la que habría cazado el GRAVE de B1: el mismo caso por
las otras cuatro puertas, comprobando que dan lo mismo.

---

**2. Que los cinco generadores de PDF rendericen.**

*Por qué esta:* el propio TABLERO lista la trampa —«`@react-pdf/renderer` … o el render
revienta con "Font family not registered"»— y B1 encontró la consecuencia: **si el PDF falla,
el correo sale igual y la cotización queda marcada «Enviada»**. O sea que la rotura no solo es
silenciosa: se disfraza de éxito, y el único rastro queda en los logs de Railway. Un cambio de
ruta de importación de un componente, o una fuente que se mueva, tumba los cinco documentos y
la plataforma sigue diciendo que todo salió.

*La prueba mínima:* la más barata de las tres, porque **el arnés ya está escrito**:
`scripts/docs_smoke.tsx` renderiza dos de los cinco. Basta ampliarlo a los cinco
—cotización, contrato, recibo, documento de viaje y asistencia— con dos casos cada uno: datos
normales y **todos los campos opcionales vacíos**. No hace falta comparar el resultado: basta
con que `renderToBuffer` no lance y devuelva más de N bytes. Lo hice a mano en B3.3 con siete
combinaciones y tardó segundos. **Convertirlo en `npm test` es media hora.**

---

**3. Que ninguna plantilla de correo use una variable que nadie produce.**

*Por qué esta:* B4 encontró que la plantilla `recordatorio_pago` —guardada, activa y lista
para enchufarse— usa `{{saldo_eur}}`, y **esa variable no existe en ninguno de los dos
constructores**. Como `renderTemplate` sustituye lo que no encuentra por cadena vacía, el
correo saldría diciendo «Saldo pendiente: **.**» a un cliente al que se le está pidiendo
dinero. Y las plantillas se editan **desde la base**, sin pasar por el código ni por un
despliegue: es el único texto que llega al cliente que nadie revisa antes de salir.

*La prueba mínima:* leer las plantillas activas de `comercial.email_templates`, sacar con un
regex todos los `{{...}}` de su asunto y su cuerpo, y comprobar que cada uno está entre las
claves que devuelven `buildTemplateVars` y `armarVariables`. **Diez líneas**, y de propina
verifica lo que hoy solo garantiza un comentario: que los dos constructores no han divergido
(«si se agrega una variable a las plantillas, hay que añadirla en ambos lados»).

---

**Lo que NO haría:** tests de componentes de React, cobertura como objetivo, ni pruebas de
extremo a extremo con navegador. Para dos personas y un producto que se despliega a mano, eso
es maquinaria que se abandona en un mes. Estas tres son ficheros sueltos, corren en segundos
sin base de datos —salvo la tercera, que solo lee dos filas— y cubren exactamente los tres
sitios donde esta auditoría **ya encontró** roturas que nadie había visto.

### [MENOR] `anon` tiene INSERT/UPDATE/DELETE concedidos sobre 16 tablas de `comercial`; lo único que lo frena es la policy — `supabase/migrations/0001_init_comercial.sql` (grants)

_(Lo levantó el crítico verificando el recuento de RLS; se sube aquí para que B8 lo vea sin leer
la crítica.)_

Los **GRANT** de tabla y las **policies** son dos capas distintas, y aquí solo la segunda está
puesta:

| rol | tablas de `comercial` con `SELECT,INSERT,UPDATE,DELETE` concedidos |
|---|---|
| `authenticated` | las 27 (correcto) |
| **`anon`** | **16**, entre ellas `quotes`, `clients`, `client_payments`, `provider_payments`, `pricing`, `quote_lines`, `settings` y `quote_codes` |

`anon` también tiene `USAGE` sobre el esquema `comercial` y `EXECUTE` sobre las seis funciones del
esquema, incluida `next_quote_code()`. **Hoy no se puede explotar** —está comprobado a mano contra
PostgREST con la publishable key: no hay ninguna policy para `anon`, así que RLS devuelve vacío y
rechaza toda escritura— y por eso es MENOR y no más. Pero el margen es de **una sola línea**: el
día que alguien haga un `disable row level security` para depurar, o cree una policy `TO public`
para que el cotizador lea tarifas sin pasar por el servidor, **el permiso de escritura ya está
concedido** y la publishable key está en el navegador de cualquiera. Es la diferencia entre «no se
puede» y «no se puede *todavía*».

La señal de que es un descuido y no una decisión: las 11 tablas que **no** tienen el grant a `anon`
son justamente las que llegaron en migraciones posteriores —`contracts`, `quote_travelers`,
`quote_pilgrim_files`, `travel_docs`, `email_log`, `quote_hotels`, `bikes`…—. La migración inicial
repartió `grant ... to anon` a lo ancho y las siguientes ya no. Nadie decidió que `anon` pudiera
escribir en `client_payments`.

**Propuesta (no se toca — son permisos de producción, regla 9 del TABLERO):** un `revoke` sobre
todas las tablas y funciones del esquema, en una migración propia. Está desarrollado como decisión
en **«Decisiones para Nico» → Decisión 2**.

### [MEDIO] El rastro de auditoría no existe donde más falta, y una columna finge que sí — `comercial.quotes.created_by` (NULL en las 45 filas, sin una sola referencia en `src/`)

_(Hallazgo nuevo del crítico, contra el punto 7 de `CRITERIOS.md`; se sube aquí para B8.)_

| lo que pide el criterio | qué hay hoy |
|---|---|
| **qué versión aceptó el cliente** | **cubierto, y bien**: `contracts` guarda `doc_hash`, `signed_pdf_path`, `variables_json`, `signature_image`, `signed_at`, `signer_ip`, `signer_user_agent`. |
| **cuándo salió el correo** | **cubierto desde el 1-sep-2026**: `email_log` guarda destinatario, asunto, adjuntos, `message_id`, estado y el HTML exacto que se envió. Pero **tiene 9 filas y 5 son de prueba**: la bitácora nació anteayer, mientras hay **6 cotizaciones con `email_sent_at`** y **6 contratos con `sent_at`**. Del correo anterior no queda rastro. |
| **quién cambió el precio de una cotización** | **no existe**. `quotes` no tiene `updated_by` ni historial de `total_eur` / `base_eur` / `price_blocks`. `pricing_history` es del **catálogo de tarifas**, no del precio pactado en un expediente. |
| **quién creó la cotización** | **`quotes.created_by` existe y está en NULL en las 45 filas**, y no aparece ni una vez en `src/`. Una columna que promete trazabilidad y no la da. |
| **quién registró un pago** | **no existe**: `client_payments` no tiene autor ni `updated_at`. Es la edición de más valor del sistema. |
| **quién borró un expediente** | **no existe**. `deleteQuote` borra en cascada y no deja lápida. Sumado al plan gratuito sin copias, un borrado es una desaparición completa y silenciosa. |

Y la bitácora que sí existe está a medias: de las **67 filas de `pricing_history`, 40 tienen
`changed_by` en NULL**. El trigger guarda `auth.uid()`, que es NULL cuando la tarifa se toca desde
el SQL Editor o con el cliente de servicio — que es como se han hecho seis de cada diez cambios.
Una bitácora anónima al 60 % no responde la pregunta para la que se hizo.

**Por qué importa en una agencia de dos personas**, y no es pedir funciones corporativas: el caso
es la reclamación. Un cliente dice «a mí me cotizaron 1.850 €» y en pantalla pone 2.050 €. Hoy la
plataforma **no puede decir si el precio cambió, cuándo ni por quién**; solo cuánto vale ahora. Con
dos socios esa conversación no es entre jefe y empleado: es entre Nico y Naty, y no tener el dato
es peor, no mejor.

**Propuesta, en orden de coste** (los cuatro son cambios de migración: **se anotan, no se tocan**):

1. **Rellenar `created_by`** en el alta desde el panel (`auth.uid()`), o **borrar la columna**. Lo
   que no puede quedarse es una columna de auditoría vacía.
2. **Un `quotes_history` por trigger**, calcado del de `pricing`: `quote_id, field, old_value,
   new_value, changed_by, changed_at`, limitado a `total_eur`, `base_eur`, `status`, `start_date`
   y `people`. El patrón ya está escrito dos veces en el esquema.
3. **`created_by` en `client_payments`** y `updated_at` con el `touch_updated_at` que ya existe.
4. **Una lápida al borrar**: `deleted_quotes(code, snapshot_json, deleted_by, deleted_at)` con el
   JSON del expediente. Es lo único que hace reversible el clic de B3.6 **sin** depender de una
   copia que no existe.

### [MEDIO] 27 de los 31 objetos de `comercial-passports` no los reclama nadie, y ninguno se borra nunca — bucket `comercial-passports` (31 objetos)

_(Hallazgo nuevo del crítico; se sube aquí para B8. **No se borró nada**: ver «Decisiones para
Nico» → Decisión 3.)_

Cruzando `storage.objects` contra `contracts.passport_path`:

- **31 objetos** en `comercial-passports`; **solo 4** están referenciados por un contrato.
- **2** son huérfanos de cotizaciones borradas: `CS-2026-048` y `CS-2026-044`, códigos reales sin
  fila que los reclame.
- **25 son de la ronda de pruebas del 28-jul**: carpetas `CS-TEST-01/02/03/20`, con archivos de
  500-700 kB que **no parecen imágenes de relleno**. Si en esas pruebas se usó la foto de un
  pasaporte real —lo habitual—, hay documentos de identidad de personas concretas guardados en
  producción, sin dueño, sin expediente y sin nadie que sepa que están ahí.

Y por encima de eso, lo estructural: **nada borra un pasaporte, nunca**. No hay rutina de
retención, no hay borrado al cerrar el expediente, no hay caducidad. El viaje más antiguo de la
base salió el **10-jun-2026** y su documentación sigue entera. Un pasaporte sirve para una cosa
—mandárselo a Pilgrim antes del viaje— y después es solo riesgo acumulado: en Colombia es dato
personal bajo la Ley 1581, y el deber de suprimirlo cuando ya no se necesita la finalidad no
depende del tamaño de la agencia.

Junto con el GRAVE de las copias compone la peor combinación posible, y es justo lo que señala
B3.4: **los datos personales sobreviven al expediente que los justificaba, y el expediente no
sobrevive a nada.**

**Propuesta:** (a) decidir qué se hace con las cuatro carpetas `CS-TEST-*` —25 archivos—; es una
decisión de Nico y no la ejecuta un agente, con la consulta y el criterio en «Decisiones para
Nico» → Decisión 3; (b) que el borrado de una cotización borre también su carpeta en
`comercial-passports` (hoy no lo hace, B3.4); (c) una regla escrita de retención —«el pasaporte se
borra a los 30 días de terminado el viaje»— aunque al principio se ejecute a mano una vez por
temporada. No hace falta automatizar nada para tener la regla; hace falta tenerla.

### [MENOR] `/correo/[token]` es la única puerta pública sin revocación ni caducidad — `src/app/correo/[token]/route.ts` · `lib/email/versionWeb.ts:17`

_(Apunte del crítico que «no exigía ronda»; se anota para que no se pierda.)_

De las tres puertas públicas por token, dos tienen freno de emergencia y una no: el descargador de
documentación comprueba `revoked_at` **antes** de firmar la URL de Storage (y devuelve 410), y el
contrato tiene `token_expires_at`. La versión web del correo, no. Un correo con la oferta comercial
y los datos del cliente queda accesible **para siempre** a quien tenga el enlace — y ese enlace
viaja por correo, se reenvía y acaba en cadenas de WhatsApp. El token en sí está bien hecho
(`randomBytes(24)`, criptográfico, no `Math.random()`); lo que falta es poder apagarlo.

**MENOR hoy** porque `email_log` tiene 9 filas y 5 son de prueba. **Propuesta:** con el índice
`email_log_token_idx` ya existente, añadir un `revoked_at` es una columna y un `if`. Cambio de
migración: se anota, no se toca.

### [MENOR] `auth_leaked_password_protection` está desactivado en Supabase Auth — Dashboard → Authentication → Policies

_(Apunte del crítico que «no exigía ronda»; se anota para que no se pierda.)_

Supabase puede rechazar contraseñas que aparezcan en filtraciones conocidas (comprobación contra
HaveIBeenPwned) y en este proyecto está **apagado**. En una cuenta de dos personas que custodia
fotos de pasaporte y contratos firmados, y cuyo panel entero es accesible con cualquiera de las dos
credenciales, activarlo es **un clic en el Dashboard** y no requiere ni código ni migración. No lo
toca un agente porque es configuración de producción.

_(De paso, y esto **no** es hallazgo: los advisors marcan las seis funciones de `comercial` con
`search_path` mutable, pero **las seis son `SECURITY INVOKER`**, así que no hay escalada posible y
el aviso es cosmético.)_

### Verificación urgente para Nico

Solo se puede hacer desde la cuenta de Supabase y es la de más valor de toda la auditoría:

1. **Dashboard → Database → Backups**: ¿hay backups automáticos o no? De la respuesta depende
   si la plataforma tiene plan de recuperación o no tiene ninguno.
2. Si no los hay: corregir `GUIA.md:354-356` y `:540` antes que nada, y montar el (b) de
   arriba.
3. Y en cualquier caso, asumir que **Storage no está cubierto** y decidir qué se hace con
   `comercial-passports` y `comercial-contracts`.

### Lo que sí está bien: los 13 endpoints, uno por uno

Inventario completo, leído endpoint por endpoint y no por muestreo. Lo que B1 ya cubrió
(`/api/wp/quote`, `/api/agente/cotizacion`) no se repite aquí; lo que sigue es el mapa entero:

| endpoint | método | auth | tope | validación | al fallar |
|---|---|---|---|---|---|
| `/api/wp/quote` | POST | `x-cs-api-key` | 60/h por IP del cuerpo ⚠ (B1) | zod completo | 422 / 409 / 500 (B1) |
| `/api/wp/lead` | POST | `x-cs-api-key` | sí | zod completo | JSON con motivo |
| `/api/wp/pricing` | GET | `x-cs-api-key` | — | sin cuerpo | JSON |
| `/api/agente/cotizacion` | POST | `AGENTE_API_SECRET` | — | zod completo | 422 / 409 / 404 |
| `/api/agente/cotizacion/[id]` | GET · PATCH | idem | — | zod (10 reglas) | 404 / 422 / 409 |
| `/api/agente/cotizacion/[id]/opcionales` | POST | idem | — | zod | mensaje accionable |
| `/api/agente/cotizacion/[id]/bicis` | GET · POST | idem | — | zod | idem |
| `/api/agente/cotizacion/[id]/correo-cliente` | POST | idem | — | zod | idem |
| `/api/agente/cotizacion/[id]/correo-pilgrim` | POST | idem | — | zod | idem |
| `/api/agente/cotizacion/[id]/pdf` | POST | idem | — | sin cuerpo | JSON |
| `/api/agente/catalogo` | GET | idem | — | sin cuerpo | JSON |
| `/api/agente/cotizaciones` | GET | idem | `limite` acotado 1..100 | parcial ⚠ (arriba) | 422 / 500 |
| `/api/cron/recordatorios-contrato` | POST | `CRON_SECRET` | — | sin cuerpo | 401 / 500 con motivo |

- **Autenticación en los 13, sin ninguna excepción**, y las tres familias con secretos
  **distintos**, con el motivo escrito: «filtrar uno no abre la puerta del otro». Las tres
  comparan con `timingSafeEqual` y **deniegan si la variable de entorno falta**.
- **Los topes de página están puestos donde se puede pedir mucho**: `/api/agente/cotizaciones`
  acota `limite` entre 1 y 100 aunque le manden `999999`, y limita a `MAX_FILAS = 1000` lo que
  trae de la base, con el razonamiento comentado.
- **La búsqueda del agente reusa `coincideCotizacion`**, la misma función que el buscador del
  CRM, «si algo aparece en la pantalla tiene que aparecer por Telegram». Un dato, un sitio.
- **Los mensajes de error de los endpoints del agente son accionables**, que es lo que un
  modelo necesita: `sin_tarifas_ano` con el año, `ruta_sin_precio`, `personas_fuera_de_rango`
  con el rango, `modalidad_desconocida` listando las cuatro válidas. Es una API pensada para
  que quien la llame pueda corregirse solo — por eso duele más el 500 «interno» de arriba.
- **`/api/contenido/*` no tiene autenticación propia** y está fuera de alcance (Estudio de
  Contenido), pero lo comprobé porque cuelga de `/api`: **no está en `PUBLIC_PATHS`**
  (`proxy.ts:19-22`), así que el proxy de sesión lo protege como cualquier página del panel.
  No es un agujero.

### Lo que sí está bien: al navegador no llega ni un secreto

- **Solo dos variables llevan el prefijo `NEXT_PUBLIC_`**: `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Las dos son públicas por diseño —la publishable key
  está pensada para el navegador y va sujeta a RLS— y no hay ninguna más. Ninguna de las ocho
  restantes (`SUPABASE_SERVICE_ROLE_KEY`, `QUOTE_EMAIL_WEBHOOK_SECRET`, `CRON_SECRET`,
  `WP_QUOTER_SECRET`, `AGENTE_API_SECRET`, `APP_BASE_URL`, `TRM_API_*`) tiene el prefijo, así
  que Next no puede inlinarlas en el bundle del cliente aunque alguien se despistara.
- **Los tres módulos que leen claves están marcados `server-only`**: `lib/email/webhook.ts`,
  `api/wp/auth.ts` y —por su cadena de importación— `lib/supabase/admin.ts`, que además
  **lanza** si la service key no está en vez de devolver un cliente degradado.
- **El cotizador público cuida lo suyo**: `cotizar/page.tsx` selecciona solo `price_cs` y pone
  a cero los suplementos del lado proveedor antes de pasar los datos al componente, «de lo
  contrario viajarían en el HTML». El costo que se le paga a Pilgrim no cruza al navegador ni
  por el HTML inicial.
- **`.env.example` existe y está casi completo** (falta la de arriba), con comentarios que
  explican las trampas —el de `APP_BASE_URL` avisa de que en local debe apuntar a la máquina
  «si apunta a producción, el correo te manda a firmar al servidor de producción»—. Ese
  comentario vale más que la variable.

### Lo que sí está bien: el rendimiento, medido y no supuesto

La tarea pide medir antes de opinar, así que aquí van las medidas y no hay hallazgo que
levantar.

**El expediente hace 20 consultas, no 16 — y da igual, porque van en paralelo.** Conté los
elementos del `Promise.all` de `seguimiento/[id]/page.tsx:142`: son **20**. Después hay una
segunda tanda de 2 (línea 224), un `list` a Storage y una consulta condicional para la
cotización madre. En total unas 24 por carga, en **tres oleadas paralelas**, no en serie: el
coste es el de la consulta más lenta de cada oleada, no la suma de las 24. Con una base de
2,5 MB y todos los índices en su sitio (B6.1), eso es ruido. Traerlas en una sola oleada es,
además, lo que permite que la página sea un componente de servidor sin cascadas de carga.

**No hay N+1.** Fui a buscarlo al sitio más probable, el render del Documento de Viaje con
sus fotos de hotel, y está resuelto **dos veces**:

- los hoteles de todas las noches se traen con **una sola consulta** `.in("id", ids)` sobre
  el conjunto de ids únicos (`travelDocs/render.ts:119-126`), no uno por noche;
- las fotos tienen **caché por hotel** y las tres de cada uno se bajan en `Promise.all`, con
  el motivo escrito: «el Hostal Suso sale dos veces en un Sarria-Santiago típico. Sin esta
  caché, un viaje de 7 noches con repetición bajaba el mismo JPG dos veces».

Lo único que queda en serie ahí es el bucle exterior, que espera las fotos de un hotel antes
de pasar al siguiente. Con 6 hoteles distintos son 6 esperas encadenadas en una operación que
se hace una vez por viaje: no lo cuento como hallazgo, pero es lo único que quedaría por
paralelizar si algún día molesta.

**Las imágenes están optimizadas, y con la cicatriz documentada.** `next.config.ts` configura
el optimizador con `imageSizes` acotado a los cuatro tamaños que de verdad se piden,
`qualities: [75]` y un mes de `minimumCacheTTL`, y el comentario cuenta el problema real que
resolvió: sin eso, el selector de fotos «cargaba las 48 miniaturas A TAMAÑO COMPLETO: 320 KB
cada una, unos 15 MB por abrir el modal». También queda anotada la trampa de Next 16 con el
parámetro `q`, que dejó todas las fotos en blanco. Eso no es configuración copiada: es
alguien que midió.

**Los listados**: `/seguimiento` hace 3 consultas en paralelo. Su tope de 500 filas y el
hecho de que se traiga `client_payments` y `provider_payments` **enteras** ya están levantados
en B2 con su plazo («con 500 cotizaciones son mil filas por la red para calcular 500 sumas que
la base hace con un `group by`»), así que no lo repito aquí. Hoy son 12 pagos.

### Lo que sí está bien: el uso del cliente de servicio está justificado en los 23 sitios

Revisé uno a uno los archivos que llaman a `createAdminClient()` y **ninguno sobra**: todos
son caminos donde, por definición, no hay sesión de usuario que pueda pasar por RLS.

| dónde | por qué no hay sesión |
|---|---|
| `/contrato/[token]`, `/documentacion/[token]`, `/correo/[token]` y el descargador | el viajero no tiene cuenta; el token es la autenticación (B3.1) |
| `/cotizar` (página y acción) | visitante anónimo de la web |
| `api/wp/**`, `api/agente/**` | servidor a servidor con secreto compartido |
| `api/cron/recordatorios-contrato` | lo despierta n8n, no una persona |
| `lib/trm.ts` | lo llama la página pública del cotizador |
| `lib/quotes/{webQuote,agentQuote}.ts` | los usan los dos anteriores |

Dos comprobaciones que hice esperando encontrar algo y salieron limpias:

- **`lib/quotes/pdf.ts` importa `createAdminClient` pero no lo instancia**: lo usa solo para
  construir el tipo `ComercialClient`, que es la unión del cliente de sesión y el de servicio.
  Todas sus funciones **reciben** el cliente por parámetro, así que desde el CRM corre con la
  sesión de quien lo pidió, y desde el cotizador público con el de servicio. Es el patrón
  correcto y está bien hecho.
- **`createAdminClient` falla cerrado**: si `SUPABASE_SERVICE_ROLE_KEY` no está, **lanza**
  (`admin.ts:5`) en vez de devolver un cliente anónimo que fallaría más tarde con un error
  incomprensible. Y no persiste sesión ni refresca token, que es lo que toca en un cliente de
  servidor.

Y el reparto general es sano: **el panel usa `createCommercialClient()`** (sesión, sujeto a
RLS) y el servicio queda para las puertas públicas. No encontré ni un sitio del dashboard que
se salte RLS por comodidad.

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

## Decisiones para Nico

Tres cosas de este bloque **no las puede aplicar un agente**: son respaldo, permisos y datos
personales en producción —la regla 9 del TABLERO—. Van aquí las tres, cada una con lo mismo:
qué resuelve, qué cuesta y qué pasa si no se hace. Ninguna necesita que se escriba código para
decidirse; las tres necesitan un sí o un no. Al final van **dos apuntes de un minuto** que
tampoco toca un agente porque son configuración de producción.

_(La «Verificación urgente para Nico» de más arriba ya tiene respondido su punto 1: el crítico
confirmó por MCP que la organización está en plan `free` con coste 0 USD/mes, y `GUIA.md` ya
está corregida. Lo que quedaba de aquella lista es exactamente lo que sigue.)_

---

### Decisión 1 — Montar un `pg_dump` semanal fuera de Supabase, disparado por n8n

**Es lo de más valor de toda la auditoría.** Hoy la plataforma **no tiene ninguna copia**: el
plan es `free`, no hay backups automáticos de ningún tipo, no hay `pg_dump` en `scripts/`, no
hay exportación a CSV y no hay nada en n8n que saque datos.

**Qué resuelve.** Que exista un sitio del que volver. Cubre las tres formas realistas de perder
todo, que hoy no tienen red debajo:

- El clic de más en `/seguimiento`: `deleteQuote` borra en cascada una cotización con contrato
  firmado y dinero cobrado sin comprobar nada (B3.6). Hoy hay tres expedientes en ese estado.
- Un `delete` o un `update` mal escrito desde el SQL Editor, que es como se han hecho seis de
  cada diez cambios de tarifa (B6, rastro de auditoría).
- Que el proyecto se pierda, se suspenda o se pause y no vuelva.

**Qué cuesta.** Poco, y esa es la gracia: la base entera son **2,5 MB**. El Schedule de n8n que
dispara los recordatorios de contrato ya existe y ya sabe hablar con esta plataforma, así que
es un workflow más, no una infraestructura nueva. Dos cosas que hay que comprobar al montarlo,
para que no sorprendan:

- **Que ese n8n pueda ejecutar `pg_dump`.** Si es autoalojado, es un nodo de comando y la
  cadena de conexión de Supabase. Si es n8n Cloud, no hay binario que ejecutar: la alternativa
  equivalente es un nodo Postgres que exporte las 27 tablas a JSON/CSV y las adjunte. Mismo
  resultado, mismo tamaño.
- **Dónde se deja la copia.** Un `pg_dump` de esta base contiene **todo el dato personal del
  negocio**: clientes, correos, teléfonos, pagos y márgenes. Mandarlo por correo cada semana es
  cómodo y cabe, pero es sacar la base entera a un buzón. Lo razonable es un destino privado
  (Drive de la agencia, o un bucket de otro proveedor) y una retención corta —ocho semanas—, no
  un histórico infinito de copias con datos personales.
- **Storage va aparte, y a mano.** Los backups de Supabase no incluyen los buckets **en ningún
  plan**. `comercial-passports` y `comercial-contracts` son unos 10 MB entre los dos y son los
  únicos activos irreemplazables: una descarga manual por temporada ya es infinitamente mejor
  que nada.

**Cómo se prueba que sirve.** Lo que se decide, en una línea: **una copia por semana**, a un
**destino privado que no sea Supabase** (el Drive de la agencia vale), **ocho semanas de
retención**, y los **dos buckets a mano una vez por temporada**. Y después lo que casi nadie
hace, que es lo único que convierte el archivo en un respaldo: comprobarlo. **Una copia que
nunca se ha restaurado no es una copia, es un archivo del que nos fiamos.** La prueba se hace
una vez al montarlo y otra al empezar cada temporada, y es media hora:

1. **Que pese lo que debe.** Bajar el archivo de la última copia y mirar el tamaño: el orden de
   magnitud de esta base es 2,5 MB. Un archivo de 0 bytes o de 3 kB es un fallo de credenciales
   o de conexión que el workflow dio por bueno — es la forma más común de tener una copia falsa.
2. **Que tenga datos y no solo el esqueleto.** Abrirlo y buscar dentro un código que se sepa de
   memoria, un `CS-2026-0XX`, y su precio. Si aparece, la copia trae contenido; un dump de solo
   esquema también pesa y también parece correcto.
3. **Restaurarla de verdad, y nunca sobre producción.** En un proyecto gratuito de Supabase
   creado para esto, o en un Postgres local. Y contar tres cosas contra lo que hay hoy: **27
   tablas, 45 cotizaciones y 8 contratos**. Hasta que eso no se hace una vez, no se sabe si la
   copia sirve; se supone.
4. **Que el workflow avise cuando falla, no cuando funciona.** Un Schedule de n8n que lleva tres
   semanas cayendo en silencio es **peor** que no tener copia, porque uno cree que la tiene y
   deja de tener cuidado. Un correo solo en caso de error es suficiente.

**Qué pasa si no se hace.** Sigue siendo cierto lo que dice hoy `GUIA.md`: si mañana la base no
está, no hay de dónde volver. No es un riesgo abstracto —45 cotizaciones, 8 contratos firmados
con su firma manuscrita y su `signer_ip`, y los pagos— y no es proporcional al error: un clic
equivocado cuesta lo mismo que un desastre.

---

### Decisión 2 — `revoke ... from anon` sobre el esquema `comercial`

**Qué resuelve.** Quita un permiso que nadie decidió dar. `anon` —el rol con el que corre la
publishable key que está en el navegador de cualquiera— tiene hoy
`SELECT, INSERT, UPDATE, DELETE` sobre **16 tablas** de `comercial` (entre ellas `quotes`,
`clients`, `client_payments`, `provider_payments`, `pricing` y `settings`), `USAGE` sobre el
esquema y `EXECUTE` sobre sus seis funciones. Es el reparto a lo ancho de la migración inicial:
las 11 tablas posteriores no lo tienen, o sea que fue un descuido, no una decisión.

**Hoy no se puede explotar** —no hay ninguna policy para `anon`, así que RLS devuelve vacío y
rechaza toda escritura, comprobado a mano contra PostgREST—. Lo que arregla el `revoke` es el
margen: que dejar de estar protegido no dependa de **una sola línea** escrita por descuido un
día de depuración (`disable row level security`, o una policy `TO public` para que el cotizador
lea tarifas sin pasar por el servidor).

**Qué es «defensa en profundidad», en llano.** Es no dejar que la seguridad dependa de una sola
puerta. Sobre cada tabla hay **dos cerraduras distintas**: el **permiso** (`grant`) dice quién
tiene derecho a tocarla, y la **policy** de RLS dice qué filas puede ver o escribir el que ya
tiene ese derecho. Hoy la primera está abierta para `anon` y solo cierra la segunda. Con las dos
puestas, para que se filtre algo tendrían que fallar **dos** cosas a la vez en vez de una — y la
que hoy aguanta sola todo el peso, la policy, es justamente la que se toca a mano cuando se
depura un domingo. Quitarle a `anon` un permiso que no usa nadie no le añade una función de
seguridad al sistema: le quita la dependencia de que nadie se equivoque **ni una sola vez**.

**Qué cuesta.** Una migración de cinco líneas y ningún cambio de código:

```sql
-- 00XX_revoke_anon_comercial.sql
revoke all on all tables    in schema comercial from anon;
revoke all on all sequences in schema comercial from anon;
revoke all on all functions in schema comercial from anon;
revoke usage on schema comercial from anon;
alter default privileges in schema comercial revoke all on tables from anon;
```

**Qué se rompería:** por lo que se ve en el código, **nada**. Lo comprobé antes de proponerlo:
los dos únicos sitios del navegador que hablan con Supabase —`login/LoginForm.tsx` y el
selector de fotos del Estudio de Contenido— usan `createPublicClient()`, que **no** apunta al
esquema `comercial`; y `createClient()`, el que sí lo hace, **no lo importa nadie**. Todo lo
público (`/cotizar`, `/contrato`, `/documentacion`, `/correo`, `api/wp/**`, `api/agente/**`)
pasa por el **cliente de servicio en el servidor**, que es `service_role` y no `anon`. Quien
entra al panel es `authenticated`, no `anon`. Aun así se aplica en una migración propia y se
comprueba el cotizador público justo después: es un permiso de producción y el coste de
equivocarse es que se caiga la puerta de entrada de los clientes.

**Qué pasa si no se hace.** No pasa nada hoy, y por eso el hallazgo es MENOR. Pasa el día que
alguien toque RLS para depurar algo: en ese momento la escritura ya está concedida y la clave
está en el navegador de cualquiera. Es la diferencia entre «no se puede» y «no se puede
*todavía*».

---

### Decisión 3 — Qué se hace con los 25 archivos `CS-TEST-*` de `comercial-passports`

**No se ha borrado nada, y no debe borrarlo un agente.** Son posibles documentos de identidad
de personas reales: el borrado es irreversible (no hay copia de Storage, Decisión 1) y quien
sabe qué se subió el 28-jul es Nico, no un modelo mirando nombres de archivo.

**El estado exacto del bucket:** 31 objetos, **4** reclamados por un contrato, **2** huérfanos
de cotizaciones borradas (`CS-2026-048`, `CS-2026-044`, códigos reales) y **25** en las carpetas
`CS-TEST-01/02/03/20`, de 500-700 kB cada uno.

**La consulta exacta para listarlos** (SQL Editor de Supabase, solo lectura):

```sql
-- El inventario entero, con quién reclama cada archivo.
select o.name,
       round((o.metadata->>'size')::numeric / 1024) as kb,
       o.created_at,
       (c.id is not null) as reclamado
from storage.objects o
left join comercial.contracts c
       on c.passport_path = 'comercial-passports/' || o.name
where o.bucket_id = 'comercial-passports'
order by reclamado, o.name;

-- Solo los de la ronda de pruebas.
select name, round((metadata->>'size')::numeric / 1024) as kb, created_at
from storage.objects
where bucket_id = 'comercial-passports'
  and name like '%CS-TEST-%'
order by name;
```

**La trampa del cruce, para que no se repita:** `contracts.passport_path` guarda la ruta **con
el bucket delante** (`comercial-passports/2026/CS-2026-034/Pasaporte-…`) y `storage.objects.name`
la guarda **sin él**. Si se cruzan a pelo con `=`, salen los 31 como huérfanos y el susto es
falso. De ahí la concatenación de la consulta.

**El criterio para distinguir prueba de real**, en orden de lo que cuesta mirarlo:

1. **El nombre de la carpeta no decide nada.** `CS-TEST-*` dice que el *expediente* era de
   prueba —no lo emitió `next_quote_code()`, que produce `CS-AAAA-NNN`—, no que la *foto* lo
   fuera. Es lo que hay que resistirse a asumir.
2. **El peso es la señal fuerte, y apunta a real.** 500-700 kB es una foto de cámara o de
   celular. Una imagen de relleno (un PNG de color plano, un recorte de internet) pesa decenas
   de kB. Ninguno de los 25 se parece a relleno.
3. **La fecha ubica la ronda:** 28-jul-2026, que es cuando se probaron los contratos por
   viajero, incluido el grupo de 20 —de ahí `CS-TEST-20`, que por sí sola tiene la mayoría de
   los archivos—. En esa prueba se firmó veinte veces, y firmar exige subir un pasaporte.
4. **Lo único que zanja la duda es abrir cuatro o cinco.** Son privadas, así que se miran desde
   Dashboard → Storage → `comercial-passports`, o con una URL firmada a 60 segundos. Diez
   minutos.

**La decisión, según lo que se vea:**

- **Si son fotos de relleno** → se borran igual, sin más trámite: no las reclama ningún
  expediente y solo ensucian el inventario.
- **Si son pasaportes reales de Nico o de Naty** → se borran, y con eso se acaba.
- **Si hay el pasaporte de un tercero** (un amigo, un cliente que prestó la foto para la
  prueba) → se borra **ya**, porque es un dato personal en producción sin ninguna finalidad que
  lo justifique (Ley 1581), y conviene decírselo a esa persona.

**Aparte, los 2 huérfanos reales.** `CS-2026-048` y `CS-2026-044` **sí** son pasaportes de
clientes: sus cotizaciones se borraron y las fotos sobrevivieron. Es la misma decisión pero con
más filo, porque borrarlos es irreversible y no hay copia. Lo estructural que hay detrás no lo
arregla borrar: **el borrado de una cotización no borra su carpeta de pasaportes** (B3.4), así
que el problema se vuelve a producir con el próximo expediente que se elimine.

**Qué cuesta.** Diez minutos de mirar y un borrado manual desde el Dashboard. Cero código.

**Qué pasa si no se hace.** El bucket sigue acumulando documentos de identidad que no reclama
nadie, sin caducidad y sin copia — y conviene decidir de paso la regla que hoy no existe: **el
pasaporte se borra a los 30 días de terminado el viaje**. Aunque al principio se ejecute a mano
una vez por temporada, tener la regla escrita ya cambia el resultado; automatizarla puede
esperar.

---

### Y dos apuntes de un minuto, que tampoco los toca un agente

No son decisiones de las gordas, pero necesitan la clave de producción y se pierden si no quedan
escritos aquí:

- **`/correo/[token]` es la única puerta pública que no se puede apagar.** De las tres puertas
  por token, el contrato **caduca** y la documentación se puede **revocar**; la versión web del
  correo, no. Un correo con la oferta y los datos del cliente queda accesible **para siempre** a
  quien tenga el enlace, y ese enlace se reenvía. Hoy es MENOR porque `email_log` tiene 9 filas
  y 5 son de prueba, pero crece solo. Arreglarlo es una columna `revoked_at` y un `if`: cambio
  de migración, así que **se anota, no se toca**.
- **`auth_leaked_password_protection` está desactivado: es un clic.** Supabase puede rechazar
  contraseñas que ya aparecen en filtraciones conocidas, y está apagado. Dashboard →
  Authentication → Policies. Sin código, sin migración y sin riesgo, en una cuenta de dos
  personas cuyas credenciales abren pasaportes y contratos firmados.

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

`Estado: hecho` — crítico independiente (veterano de CRMs de agencia + oficio de datos).
**Veredicto al final de esta sección.** Plan de verificación que se siguió, en este orden:

1. **Plan de Supabase** (MCP: `list_organizations`, `get_organization`, `get_project`,
   `get_cost`; Railway como respaldo) para confirmar o tumbar el GRAVE de las copias. Y
   juzgar qué etiqueta merece «Storage sin copia + sin respaldo propio» aunque el plan fuera Pro.
2. **RLS y policies**: contar de verdad tablas con RLS y policies (`pg_policies`,
   `pg_class.relrowsecurity`), incluidas las de `storage.objects`. Buscar tablas sin policy
   (RLS activo y cero policies = tabla muerta para el panel) o con `USING (true)` a `public`/`anon`.
3. **Muestra hostil del cliente de servicio**: 3-4 sitios de `createAdminClient()` donde un
   token o un id de la URL decida qué se lee/escribe, buscando IDOR.
4. **Recuento de endpoints**: enumerar `route.ts` bajo `src/app/api/` y contrastar con los 13.
5. **Rastro de auditoría** (punto 7 de CRITERIOS) y **protección de pasaportes**: qué queda
   registrado de quién cambió el precio, cuándo salió el correo, qué versión aceptó el cliente;
   y retención/exposición de `comercial-passports`.
6. Juicio sobre el MEDIO de permisos con dos dueños.

---

### [CONFIRMADO · sube a GRAVE con evidencia dura] El plan **es** gratuito: no hay backups y nunca los ha habido — `GUIA.md:354-356,540`

El auditor no pudo verificarlo y dejó el GRAVE apoyado en una pista indirecta (el 403 de las
transformaciones de imagen). **Lo verifiqué por MCP y la pista era correcta:**

```
get_organization("rtahmicsjvbvlpazxlyc") → {"name":"Camino SAcro Agencia","plan":"free"}
get_cost(project, rtahmicsjvbvlpazxlyc)  → 0 USD/mes
```

El proyecto de la plataforma es `yvytzquewjsjsmgiwmaa` (el de `.env.local:1` y el de todos
los enlaces de la GUIA) y cuelga de esa organización. **Plan `free`, coste cero.** En el plan
gratuito de Supabase **no existen los backups automáticos**: ni diarios, ni de 7 días, ni
point-in-time. La frase de `GUIA.md:354` no es «probablemente falsa»: **es falsa**, y hoy es
lo único escrito que responde «¿qué pasa si se pierde la base?».

La etiqueta **GRAVE se confirma y se refuerza**, y añado tres cosas que el auditor no vio y
que empeoran el cuadro:

1. **Cero copias de la base, no «copias sin Storage».** El auditor formuló el hallazgo como
   «Storage no entra en la copia». Con el plan confirmado, es peor: **tampoco entra la base**.
   Las 45 cotizaciones, los contratos firmados, los pagos y las tarifas viven en una sola
   copia, la de producción, sin ninguna otra en ningún sitio.
2. **El plan gratuito pausa el proyecto tras 7 días de inactividad**, y un proyecto pausado
   deja de servir las rutas públicas por token (`/contrato`, `/documentacion`, `/correo`).
   Con la temporada del Camino concentrada en primavera-verano, una racha de invierno sin
   entrar es un escenario realista, no de laboratorio: un cliente que abra el enlace de firma
   que le llegó por correo se encuentra la plataforma caída. Se anota, no se toca.
3. **Y hay dos proyectos en la misma organización gratuita** (`yvytzquewjsjsmgiwmaa` y `El
   Camino con Naty`), que es justo el tope del plan: cualquier proyecto nuevo de la casa
   obliga a decidir el pago igualmente. El salto a Pro tiene, entonces, una segunda razón.

**Lo que corrijo del hallazgo, aun confirmándolo:** la propuesta (a) —«confirmar el plan en el
Dashboard»— **ya está hecha aquí y sobra**. Lo que queda es (a') **corregir hoy `GUIA.md:354`
y `:540`**, que es un arreglo de texto, pequeño y reversible, pero lo dejo anotado y no lo
aplico porque toca la GUIA, que es documento de Nico y está fuera de mi archivo de bloque.
La prioridad real es (b): un `pg_dump` semanal fuera de Supabase. Con 2,5 MB, el Schedule de
n8n que ya existe lo resuelve en una tarde, y es lo único que convierte «GRAVE» en «molestia».

Sobre la pregunta que dejó el auditor —«si el plan fuera Pro, ¿bajaría la etiqueta?»—: la
respuesta es **no del todo**. Aun en Pro, con los pasaportes y los contratos firmados fuera de
toda copia y sin respaldo propio, esto seguiría siendo **MEDIO como mínimo**: son los dos
únicos activos irreemplazables del negocio (un contrato firmado con su `signer_ip` no se puede
volver a generar) y viven en un único sitio. La pregunta es discutible; el hecho, no.

### [CONFIRMADO] El recuento de RLS es exacto, y lo probé también por fuera — `comercial` (27 tablas) + `storage.objects` (34 policies)

No me fié del informe y lo consulté yo. **El auditor acertó al dígito**:

- **27 tablas** en `comercial`, **las 27 con `relrowsecurity = true`**, **una sola policy cada
  una**, todas llamadas `auth_all`, todas `FOR ALL`, todas `TO authenticated`, todas con
  `USING (true) WITH CHECK (true)`. Ni una excepción, ni una tabla olvidada, ni un `TO public`
  colado. Es raro encontrar un esquema tan uniforme; aquí lo está.
- **Storage:** los **9 buckets `comercial-*` son privados** (`storage.buckets.public = false`
  en los nueve) y tienen **34 policies** sobre `storage.objects`, todas `TO authenticated` y
  todas acotadas por `bucket_id`. Ningún bucket del CRM es público. Los tres públicos que hay
  (`contenido-fotos`, `contenido-piezas`, `fotos-instagram`) son de otros productos y fuera de
  alcance.
- **Prueba hostil, no solo lectura del catálogo.** Con la *publishable key* del navegador
  —que va en el JS de cada página y cualquiera puede copiar— pedí directamente a PostgREST:
  ```
  GET /rest/v1/quotes?select=id,code,total_eur   Accept-Profile: comercial  → 200 []
  GET /rest/v1/clients?select=*                  Accept-Profile: comercial  → 200 []
  ```
  **RLS aguanta**: 200 con lista vacía, que es exactamente lo que debe pasar. El esquema
  `comercial` sí está expuesto a PostgREST (el cliente del navegador lo usa con
  `db:{schema:"comercial"}`, `lib/supabase/client.ts:6`), así que esta era la comprobación que
  faltaba y sale limpia.

### [MENOR · lo que al auditor se le escapó] `anon` tiene INSERT/UPDATE/DELETE concedidos sobre 16 tablas de `comercial`; lo único que lo frena es la policy — `grants de la migración 0001`

Verificando lo anterior encontré algo que el informe no menciona. Los **GRANT** de tabla y las
**policies** son dos capas distintas, y aquí solo la segunda está puesta:

| rol | tablas de `comercial` con `SELECT,INSERT,UPDATE,DELETE` concedidos |
|---|---|
| `authenticated` | las 27 (correcto) |
| **`anon`** | **16**, entre ellas `quotes`, `clients`, `client_payments`, `provider_payments`, `pricing`, `quote_lines`, `settings` y `quote_codes` |

`anon` también tiene `USAGE` sobre el esquema `comercial` y `EXECUTE` sobre las seis funciones
del esquema, incluida `next_quote_code()`. **Hoy no se puede explotar** —lo acabo de
comprobar arriba: no hay ninguna policy para `anon`, así que RLS devuelve vacío y rechaza toda
escritura— y por eso es MENOR y no más. Pero el margen es de **una sola línea**: el día que
alguien haga un `disable row level security` para depurar, o cree una policy `TO public` para
que el cotizador lea tarifas sin pasar por el servidor, **el permiso de escritura ya está
concedido** y la publishable key está en el navegador de cualquiera. Es la diferencia entre
«no se puede» y «no se puede *todavía*».

La señal de que es un descuido y no una decisión: las 11 tablas que **no** tienen el grant a
`anon` son justamente las que llegaron en migraciones posteriores —`contracts`,
`quote_travelers`, `quote_pilgrim_files`, `travel_docs`, `email_log`, `quote_hotels`,
`bikes`…—. O sea, la migración inicial repartió `grant ... to anon` a lo ancho y las
siguientes ya no. Nadie decidió que `anon` pudiera escribir en `client_payments`.

**Propuesta (no se toca, se anota — son permisos de producción):** un
`revoke all on all tables in schema comercial from anon;` más el `revoke ... on all functions`,
en una migración propia y con una prueba antes de aplicarla (hay que confirmar que la ruta
pública `/cotizar` no usa la publishable key contra `comercial` — por lo que vi usa el cliente
de servicio en el servidor, así que no debería romper nada). Es la corrección más barata de
toda esta crítica y sube el suelo de seguridad de un escalón a dos.

De paso, dos apuntes de los *advisors* de Supabase que el auditor no consultó y que **no**
levanto como hallazgo, con el motivo: (a) las seis funciones de `comercial` salen marcadas con
`search_path` mutable, pero **las seis son `SECURITY INVOKER`**, así que no hay escalada
posible y el aviso es cosmético; (b) `auth_leaked_password_protection` está **desactivado** —
en una cuenta de dos personas que guarda pasaportes, activarlo es un clic en el Dashboard y lo
dejo dicho en el veredicto, no como hallazgo.

### [CONFIRMADO con una enmienda] Los 13 endpoints están bien contados, pero el inventario no es «completo»: faltan dos manejadores públicos fuera de `/api` — `correo/[token]/route.ts` · `documentacion/[token]/descargar/[doc]/route.ts`

Conté los `route.ts` del proyecto: **15**. Trece son los de la tabla del auditor y dos son de
`/api/contenido/*`, que él mismo declara fuera de alcance. **El recuento es exacto**, no se le
escapó ninguno de `/api` y la tabla endpoint por endpoint es de las cosas mejor hechas de esta
auditoría.

La enmienda es de encuadre, no de aritmética. La tabla se titula «los endpoints públicos» y
dice «inventario completo», pero está filtrada por `src/app/api/`. Fuera de esa carpeta hay
**dos manejadores HTTP más que sí son públicos** —están en `PUBLIC_PATHS`, no piden sesión y
corren con el cliente de servicio—:

| endpoint | auth | validación | al fallar |
|---|---|---|---|
| `GET /correo/[token]` | token de 24 bytes en `email_log` | `token.length >= 32` | 404 con página maquetada |
| `GET /documentacion/[token]/descargar/[doc]` | token de 32 bytes en `travel_docs` | longitud + `doc` contra lista blanca de 4 | 404 / 410 anulado / 502 |

**Los revisé de forma hostil buscando IDOR y no lo hay**, y conviene dejarlo escrito porque
es donde estaría el agujero si lo hubiera: en el descargador, el `[doc]` de la URL **no elige
una ruta**, elige una **columna de la fila que ya se localizó por token**
(`descargar/[doc]/route.ts:42-46`); no hay forma de pedir el PDF de otra cotización cambiando
el segmento. La firma de Storage se emite en el momento y dura **60 segundos**, el `revoked_at`
se comprueba **antes** de firmar (410), y los tokens salen de `randomBytes(24|32)` —
`versionWeb.ts:17`, `travelDocs/render.ts:22`, `contracts/render.ts:166` —, o sea criptográficos,
no de `Math.random()`. Está bien hecho.

Lo único que anoto de ellos: **`/correo/[token]` no tiene revocación ni caducidad**. El
descargador tiene su `revoked_at` y el contrato su `token_expires_at`; la versión web del
correo, no. Un correo con la oferta comercial y los datos del cliente queda accesible para
siempre a quien tenga el enlace —y ese enlace viaja por correo, se reenvía y acaba en cadenas
de WhatsApp—. Con `email_log.token` indexado ya existente, añadir un `revoked_at` es una
columna y un `if`. **MENOR hoy** (9 filas, 5 de prueba), pero es la única de las tres puertas
públicas sin freno de emergencia.

### [MEDIO · hallazgo nuevo] El rastro de auditoría no existe donde más falta, y una columna finge que sí — `comercial.quotes.created_by` (NULL en las 45 filas, sin una sola referencia en `src/`)

Esto es el punto 7 de `CRITERIOS.md` («quién cambió el precio, cuándo salió el correo, qué
versión aceptó el cliente») y el bloque no lo evalúa. Lo medí contra la base:

| lo que pide el criterio | qué hay hoy |
|---|---|
| **qué versión aceptó el cliente** | **cubierto, y bien**: `contracts` guarda `doc_hash`, `signed_pdf_path`, `variables_json`, `signature_image`, `signed_at`, `signer_ip`, `signer_user_agent`. Esto es mejor que lo que traen de serie Travefy o TravelJoy. |
| **cuándo salió el correo** | **cubierto desde el 1-sep-2026**: `email_log` guarda destinatario, asunto, adjuntos, `message_id`, estado y **el HTML exacto que se envió**. Excelente… pero **tiene 9 filas y 5 son de prueba**: la bitácora nació anteayer, mientras hay **6 cotizaciones con `email_sent_at`** y **6 contratos con `sent_at`**. Del correo anterior a esa fecha no queda rastro. |
| **quién cambió el precio de una cotización** | **no existe**. `quotes` no tiene `updated_by` ni historial de `total_eur` / `base_eur` / `price_blocks`. La única bitácora de precios es `pricing_history`, que es del **catálogo de tarifas**, no del precio pactado en un expediente. |
| **quién creó la cotización** | **`quotes.created_by` existe, y está en NULL en las 45 filas**. No aparece **ni una vez** en `src/` (`grep -rn created_by src/` → 0 resultados). Es una columna que promete trazabilidad y no la da. |
| **quién registró un pago** | **no existe**: `client_payments` no tiene autor ni `updated_at`. Es la edición de más valor del sistema. |
| **quién borró un expediente** | **no existe**. `deleteQuote` borra en cascada y **no deja lápida**: ni fila, ni log, ni nada. Sumado al plan gratuito sin copias, un borrado es una desaparición completa y silenciosa. |

Y la bitácora que sí existe está a medias: de las **67 filas de `pricing_history`, 40 tienen
`changed_by` en NULL**. El trigger guarda `auth.uid()`, que es NULL cuando la tarifa se toca
desde el SQL Editor o con el cliente de servicio — que es como se han hecho seis de cada diez
cambios de tarifa. Una bitácora anónima al 60 % no responde la pregunta para la que se hizo.

**Por qué esto importa en una agencia de dos personas** (y no es pedir funciones corporativas):
el caso es la reclamación. Un cliente dice «a mí me cotizaron 1.850 €» y en pantalla pone
2.050 €. Hoy la plataforma **no puede decir si el precio cambió, cuándo ni por quién**; solo
puede decir cuánto vale ahora. Con dos socios, esa conversación no es entre jefe y empleado:
es entre Nico y Naty, y no tener el dato es peor, no mejor. Lo mismo con un pago mal
registrado.

**Propuesta, en orden de coste:**
1. **Rellenar `created_by`** en el alta desde el panel (una línea: `auth.uid()`), o **borrar
   la columna**. Lo que no puede quedarse es una columna de auditoría vacía: la próxima
   persona que abra el esquema creerá que hay trazabilidad.
2. **Un `quotes_history` por trigger**, calcado del de `pricing`: `quote_id, field, old_value,
   new_value, changed_by, changed_at`, limitado a `total_eur`, `base_eur`, `status`,
   `start_date` y `people`. El patrón ya está escrito dos veces en el esquema y funciona.
3. **`created_by` en `client_payments`** y `updated_at` con el `touch_updated_at` que ya existe.
4. **Una lápida al borrar**: una fila en una tabla `deleted_quotes(code, snapshot_json,
   deleted_by, deleted_at)` con el JSON del expediente. Con 45 cotizaciones cabe entera y es
   lo único que hace reversible el clic de B3.6 **sin** depender de una copia que no existe.

Los cuatro son cambios de migración: **se anotan, no se tocan**, según la regla 9 del TABLERO.

### [MEDIO · hallazgo nuevo] 27 de los 31 pasaportes del bucket no los reclama nadie, y ninguno se borra nunca — `comercial-passports` (31 objetos)

El auditor dijo «ya hay dos pasaportes de cotizaciones borradas». Lo comprobé cruzando
`storage.objects` contra `contracts.passport_path` y el número real es peor:

- **31 objetos** en `comercial-passports`; **solo 4** están referenciados por un contrato.
- **2** son los que él señaló: `CS-2026-048` y `CS-2026-044`, códigos reales sin fila que los
  reclame. Ahí acertó.
- **25 son de la ronda de pruebas del 28-jul**: carpetas `CS-TEST-01/02/03/20`, con archivos
  de 500-700 kB que **no parecen imágenes de relleno**. Si en esas pruebas se usó la foto de un
  pasaporte real —lo habitual—, hay documentos de identidad de personas concretas guardados en
  producción, sin dueño, sin expediente y sin nadie que sepa que están ahí.

Y por encima de eso, lo estructural: **nada borra un pasaporte, nunca**. No hay rutina de
retención, no hay borrado al cerrar el expediente, no hay caducidad. El viaje más antiguo de la
base salió el **10-jun-2026** y su documentación sigue entera. Un pasaporte sirve para una cosa
—mandárselo a Pilgrim antes del viaje— y después es solo riesgo acumulado: en Colombia es dato
personal bajo la Ley 1581, y el deber de suprimirlo cuando ya no se necesita la finalidad no
depende del tamaño de la agencia.

Junto con el GRAVE de las copias esto compone la peor combinación posible, y es justo lo que
señala B3.4: **los datos personales sobreviven al expediente que los justificaba, y el
expediente no sobrevive a nada.**

**Propuesta:** (a) borrar hoy las cuatro carpetas `CS-TEST-*` del bucket de pasaportes —25
archivos, es un borrado manual de dos minutos y no toca código—; (b) que el borrado de una
cotización borre también su carpeta en `comercial-passports` (hoy no lo hace, B3.4); (c) una
regla escrita de retención —«el pasaporte se borra a los 30 días de terminado el viaje»— aunque
al principio se ejecute a mano una vez por temporada. No hace falta automatizar nada para
tener la regla; hace falta tenerla.

---

<!-- nota del auditor, se conserva -->
Lo que el auditor pidió que le revisen:

- El **GRAVE de las copias**: se apoya en que el proyecto está en el plan gratuito de
  Supabase, que **no pude verificar** desde aquí (leer las variables de Railway está
  bloqueado y el MCP no expone el plan). La evidencia es indirecta —el 403 de las
  transformaciones de imagen, anotado en `next.config.ts`— y si el plan resultara ser Pro, la
  etiqueta habría que bajarla. Lo que **no** cambia es que Storage no entra en la copia y que
  no hay respaldo propio.
- El **MEDIO de los permisos**: si merece esa etiqueta cuando hoy hay dos usuarios y los dos
  son dueños.

---

### [ETIQUETA CORREGIDA · MEDIO → MENOR] El de los permisos: la propia vara dice que esto no es un hallazgo — `CRITERIOS.md:63-64`

El auditor preguntó y la respuesta es **no, no merece MEDIO**. El análisis es correcto y la
propuesta —dos policies en tres tablas antes de crear la tercera cuenta, no un sistema de
roles— está bien dimensionada; lo que no encaja es la etiqueta, por tres razones:

1. **`CRITERIOS.md` lo excluye literalmente.** En «Lo que NO es un hallazgo»: *«Funciones de un
   CRM corporativo que aquí no aplican: equipos, **permisos por rol**, embudos con veinte
   etapas, integraciones con GDS»*. No se puede levantar como MEDIO exactamente lo que la vara
   nombra como no-hallazgo.
2. **No se puede completar la frase.** La vara pide poder decir *«esto hace que se pierda
   ___»*. Hoy: nada. Dos usuarios, los dos dueños del negocio, con derecho a ver todo lo que
   ven. No hay dinero perdido, ni cliente perdido, ni hora perdida, ni confianza rota.
3. **La definición de MEDIO del TABLERO no se cumple**: no «engaña» (nadie cree que haya roles),
   no «se rompe en un caso realista» (el caso requiere contratar a alguien, que es un cambio de
   negocio, no un uso de la plataforma) y no «cuesta el triple».

Es un **MENOR** de libro: «deuda que hoy no muerde», con un disparador conocido y anotado. La
distinción no es burocracia: B8 va a ordenar por gravedad, y un MEDIO aquí desplaza hacia abajo
cosas que sí muerden hoy —los pasaportes de prueba en producción, el rastro que no existe—.

**Lo que sí conservo íntegro** es la parte accionable, que el auditor escribió bien: *decidir
los permisos antes de crear la tercera cuenta, no después*. Y añado el motivo de oficio: en
Lemax o Tourwriter el rol se define al alta y nadie lo piensa; aquí el momento de pensarlo es
el día que Nico le pase una clave a alguien para que cargue tarifas, y ese día se decide en
treinta segundos y mal si no está escrito antes.

### [NOTA PARA B8] El MEDIO de los tests no es un hallazgo independiente: son tres hallazgos de otros bloques contados otra vez

No lo bajo de etiqueta porque el contenido es de lo mejor del bloque —tres roturas concretas,
cada una con su prueba mínima y su coste en líneas, exactamente lo que pedía B6.6 y lo
contrario de «falta un test»—. Pero **las tres roturas ya están levantadas en B1, B3 y B4** con
sus propias etiquetas; si B8 suma este MEDIO a aquellas, el mismo problema cuenta dos veces.
Sugerencia para la síntesis: tratarlo como **la respuesta a la tarea B6.6 y el plan de arreglo**
de esos tres, no como una entrada más de la lista de gravedad.

---

## VEREDICTO: revisar

El bloque es **sólido y honesto**: comprobé al dígito los tres recuentos que sostiene (27
tablas con RLS, 13 endpoints de `/api`, 23 usos del cliente de servicio) y **los tres son
correctos**; la tabla endpoint por endpoint y la sección de rendimiento medido están por encima
de lo que se suele ver, y el GRAVE de las copias, que el auditor solo pudo sospechar, **queda
confirmado con evidencia dura**. No hay ni un hallazgo inflado ni ninguno inventado.

Va a `revisar` y no a `aprobado` por cinco huecos concretos, todos acotados:

1. **`GUIA.md:354-356` y `:540` afirman algo falso** —que Supabase hace copias diarias— y ya
   está verificado que el plan es `free`. Es «un texto que miente» de la regla 9 del TABLERO:
   pequeño, reversible y urgente, porque un plan de recuperación falso impide que alguien monte
   uno de verdad. No lo toqué porque la GUIA no es mi archivo de bloque. **Que lo haga la ronda.**
2. **Mover el hallazgo de permisos de MEDIO a MENOR** en la sección de Hallazgos, con el
   argumento de `CRITERIOS.md:63-64`, y anotar la nota para B8 sobre el MEDIO de los tests.
3. **Incorporar a la sección de Hallazgos los tres nuevos** que levanté aquí, para que B8 los
   vea sin leer la crítica: el grant a `anon` sobre 16 tablas (MENOR), el rastro de auditoría
   inexistente con `quotes.created_by` en NULL (MEDIO), y los 27 pasaportes sin dueño con cero
   retención (MEDIO).
4. **Borrar las cuatro carpetas `CS-TEST-*` de `comercial-passports`** —25 archivos— o
   confirmar con Nico que son imágenes de relleno. Es lo único de esta crítica que se puede
   resolver hoy mismo y sin código, y mientras no se resuelva hay documentos de identidad
   posiblemente reales en producción sin expediente que los justifique.
5. **Decidir con Nico dos cosas que no se tocan solas**, y dejarlas escritas en el bloque: el
   `pg_dump` semanal por n8n (propuesta (b) del GRAVE, que sigue siendo lo de más valor de toda
   la auditoría) y el `revoke ... from anon` sobre `comercial`. Ninguna de las dos la aplica un
   agente: son permisos y respaldo de producción.

Dos apuntes menores que **no** exigen ronda, para que no se pierdan: la versión web del correo
(`/correo/[token]`) es la única puerta pública sin revocación ni caducidad, y
`auth_leaked_password_protection` está desactivado en Supabase Auth (un clic en el Dashboard,
razonable en una cuenta de dos personas que custodia pasaportes).

`Estado: hecho`

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: en curso` — cerrando los cinco huecos del veredicto, en este orden y commiteando por
partes. **Por dónde voy:** huecos **1, 2 y 3 hechos y commiteados** (`525bf55`, `6da0108`,
`b5385e2`); el 1 lo verifiqué entero en esta ronda —`GUIA.md:354-372` y `:557-562` dicen ya que
no hay backups, que Storage no entra en ninguna hipótesis y que el proyecto se pausa a los 7 días
sin actividad, con las rutas públicas por token cayéndose detrás—. **Quedan el 4 y el 5**, que se
resuelven juntos en la sección «Decisiones para Nico».

1. Corregir `GUIA.md:354-356` y `:540` (dicen que Supabase hace copias diarias; el plan es `free`
   y no las hay) y añadir la pausa a los 7 días sin actividad.
2. Bajar el hallazgo de permisos de MEDIO a MENOR con el argumento de `CRITERIOS.md:63-64` y
   dejar la nota para B8 sobre el solapamiento del MEDIO de los tests con B1/B3/B4.
3. Subir a Hallazgos los tres nuevos del crítico: grant a `anon` (MENOR), rastro de auditoría
   inexistente (MEDIO), pasaportes sin dueño ni retención (MEDIO). Más los dos apuntes sueltos
   como MENOR: `/correo/[token]` sin revocación y `auth_leaked_password_protection` desactivado.
4. **No se borra nada de Storage**: los `CS-TEST-*` quedan como decisión pendiente de Nico, con
   la consulta exacta para listarlos y el criterio para distinguir prueba de real.
5. Sección «Decisiones para Nico» con el `pg_dump` semanal por n8n y el `revoke ... from anon`:
   qué resuelve, qué cuesta, qué pasa si no se hace. No se aplican.

_(Solo si el veredicto fue `revisar`. Una ronda.)_
