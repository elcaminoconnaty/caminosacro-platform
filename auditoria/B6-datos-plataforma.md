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
  `Estado: pendiente`

---

## Hallazgos

### [MEDIO] No hay forma de dar acceso limitado: una tercera cuenta lo ve todo, incluidos los pasaportes — las 27 policies de `comercial` + las de Storage

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

Va como MEDIO y no más porque **hoy no hay daño**: son dos usuarios y los dos son dueños. Lo
anoto porque el coste de arreglarlo crece con el tiempo —cada tabla nueva hereda el patrón— y
porque el disparador no es hipotético: la primera contratación lo activa. **Propuesta:** no
hace falta un sistema de roles. Con una tabla `perfiles(user_id, rol)` y **dos** policies
distintas en las tres tablas sensibles —`contracts`, `client_payments`, `provider_payments`—
más el bucket de pasaportes, se cubre el 90 % del riesgo. Decidirlo antes de crear la tercera
cuenta, no después.

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
