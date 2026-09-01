# Guía de la Plataforma Comercial — Camino Sacro

Documento de mantenimiento. Cómo correr la app, hacer cambios, y desplegar.

---

## 1. Correr en local

```bash
cd "Plataforma Comercial/app"
npm run dev
```

Abre **http://localhost:3000** en el navegador. Login con `elcaminoconnaty@gmail.com` (te llega magic link al correo).

Para detener: Ctrl+C en la terminal.

### Si algo está raro
- **Cambios no aparecen:** hard refresh (Cmd+Shift+R) o reiniciar `npm run dev`.
- **Error de tipos al iniciar:** corré `npx tsc --noEmit` para ver el error real.
- **TRM no carga:** las APIs externas (exchangerate.host / frankfurter) pueden caerse. Refrescá en 1 hora.

---

## 2. Estructura del proyecto

```
app/
├── src/app/                      ← páginas y rutas
│   ├── (dashboard)/              ← todo lo que está dentro requiere login
│   │   ├── clara/                ← dashboard Clara (lee public.conversations + messages)
│   │   ├── isabel/               ← placeholder Isabel (próximamente)
│   │   ├── cotizaciones/nueva/   ← wizard nueva cotización
│   │   ├── seguimiento/          ← lista de cotizaciones
│   │   │   └── [id]/             ← vista detalle (editar, pagos, opcionales, PDF)
│   │   ├── catalogo/             ← editor de precios + etapas + cartas bienvenida
│   │   ├── hoteles/              ← catálogo de alojamientos con fotos (doc. de viaje)
│   │   ├── tokens/               ← consumo de tokens IA y costo USD
│   │   └── configuracion/        ← firma, Pilgrim, textos de la documentación de viaje
│   ├── contrato/[token]/         ← firma pública del contrato (sin sesión)
│   ├── documentacion/[token]/    ← documentación de viaje del peregrino (sin sesión)
│   ├── login/                    ← magic link sign in
│   └── auth/                     ← callback OAuth y signout
├── src/components/shell/         ← Sidebar y Topbar
├── src/lib/                      ← código compartido
│   ├── supabase/                 ← clientes Supabase (client/server/admin)
│   ├── trm.ts                    ← TRM EUR↔COP del día con cache
│   ├── format.ts                 ← formateo de eur/cop/fechas
│   ├── seasons.ts                ← detección temporada alta + Semana Santa
│   ├── tokens.ts                 ← cálculo de costos por bot
│   ├── pdfChrome.tsx             ← fuentes, paleta y cabecera/pie comunes de los PDF
│   ├── quotePdf.tsx              ← generador PDF de cotización
│   ├── travelDocPdf.tsx          ← generador del Documento de Viaje
│   ├── asistenciaPdf.tsx         ← generador de la Asistencia en Viaje (genérica)
│   ├── travelDocs/               ← datos, render y correo de la documentación de viaje
│   └── cover.jpg                 ← foto de portada del PDF (NO borrar)
├── src/proxy.ts                  ← protección de rutas (era middleware en Next 15)
├── supabase/migrations/          ← migraciones SQL versionadas
└── scripts/
    ├── seed.ts                   ← seed inicial (catálogo, opcionales, PDFs Abril)
    ├── enrich.ts                 ← rellenar nombres/teléfonos desde xlsx
    ├── add_routes.ts             ← cargar rutas master con etapas
    ├── docs_smoke.tsx            ← render de prueba de los PDF de documentación
    ├── seed_hoteles_sarria_santiago.ts  ← alta de los alojamientos del Francés
    └── cleanup_orphans.ts        ← borrar archivos huérfanos de Storage
```

### Bases de datos en Supabase

- Schema **`public`**: tablas existentes (Clara, Baymax, blog, instagram, token_usage). Solo lectura desde la plataforma.
- Schema **`comercial`**: tablas nuevas de la plataforma (rutas, precios, cotizaciones, pagos, opcionales, etapas, etc.).

---

## 3. Cambios comunes (sin tocar código)

### A. Cambiar precios del catálogo
1. `/catalogo` → arriba a la derecha, elegí el **año de tarifa** (2026, 2027…)
2. Click en cualquier celda de Pilgrim € o Mi precio €
3. Cambiá el número, salí del campo (Tab o click afuera) → se guarda solo
4. Cada cambio queda en `comercial.pricing_history` (audit log)
5. Botón **"Aplicar regla automática"** recalcula CS = max(Pilgrim+100, Pilgrim÷0.85) **del año activo**

### A2. Catálogo por año (2026 vs 2027)
Pilgrim sube tarifas cada año, así que `comercial.pricing` tiene columna `year` (migración
0017) y cada año es un juego de precios independiente. La regla clave:

> **La tarifa que aplica es la del año de SALIDA del viaje**, no la del año en que se cotiza.

- **Arrancar un año nuevo**: `/catalogo?year=2027` → botón **"Copiar tarifas de 2026"**.
  Crea solo las filas que faltan (nunca pisa una ya cargada) para editar encima con los
  precios reales. También podés dejarlo vacío y teclear cada tarifa.
- **CRM (asistente y editor)**: exige el año exacto. Si no hay tarifas del año de salida
  avisa en ámbar — *"No hay tarifas 2027 cargadas para esta ruta"* — y **no autocarga nada**.
  Hay que teclear los precios a mano. Es a propósito: así nunca se cuela una tarifa 2026 en
  un viaje 2027.
- **Cotizador público** (`/cotizar` y caminosacro.com): sí cae al año cargado más reciente,
  porque necesita dar un número, y lo dice — la cotización sale con la nota *"Precio de
  referencia 2026. Para salidas en 2027 queda sujeto a confirmación."* en pantalla y en el
  PDF (`quotes.price_note`).
- `GET /api/wp/pricing` acepta `?year=` y responde `year` + `is_fallback`; sin el parámetro
  usa el año en curso, igual que antes.
- **Servicios opcionales**: también van por año, en `comercial.optional_prices` (migración
  0019). El servicio en sí (nombre, categoría, unidad) sigue siendo único en
  `optional_services` — lo que cambia por año es solo la plata. En `/catalogo` se editan con
  el mismo selector de año, y el botón "Copiar tarifas" copia rutas **y** opcionales.
  Diferencia con las rutas: al marcar un opcional en una cotización de un año sin precios,
  el CRM **sí** usa el del año anterior y lo avisa en ámbar ("precio 2026"), porque ahí no
  hay dónde teclear el precio a mano y bloquear dejaría sin extras a las cotizaciones nuevas.
- **Ojo**: los suplementos de temporada (`settings.season_supplements`) **no** tienen
  dimensión de año todavía: son únicos para todos los años.

### B. Agregar un servicio opcional nuevo
Hoy se agrega vía SQL Editor en Supabase Dashboard:
1. Abrí: <https://supabase.com/dashboard/project/yvytzquewjsjsmgiwmaa/sql/new>
2. Pegá:
```sql
insert into comercial.optional_services (slug, category, name, unit, price_pilgrim, price_cs)
values ('mi_nuevo_servicio', 'tour', 'Tour Catedral de Santiago', 'por persona', 30, 40);
```
3. Refrescá `/catalogo` y `/seguimiento/[id]` → aparece en la lista

Categorías válidas: `seguro`, `noche_extra`, `meal`, `transfer`, `tour`, `gift`.

### B2. El Camino en bici (bicicletas de alquiler)

Una ruta con `modality = 'bici'` habilita el módulo de alquiler. Migración **0021**.

**El flujo es de dos pasos, a propósito:**
1. Cotizás la ruta como siempre. El alojamiento y la logística salen de la verdad de
   siempre (`comercial.pricing`) — el alquiler no cambia nada de eso.
2. El PDF sale con **la flota completa y el precio de cada bici** en servicios opcionales.
   Nada de eso suma al total: es para que el peregrino compare y elija.
3. Cuando elige, en Seguimiento marcás su bici en la card **"Alquiler de bicicleta"** y
   das **"Crear cotización con la bici elegida"**.
4. Nace una cotización **nueva** con la bici dentro del total. En el resumen de inversión
   sale nombrada ("Eléctrica · E-Bike — Lapierre Overvolt HT 7.6 · 5 días de alquiler").
   Las dos quedan enlazadas por `parent_quote_id`: en el encabezado de cada una hay un
   "← Viene de CS-…" / "Continúa en CS-… →".

**Por qué una cotización nueva y no editar la primera:** la primera es la prueba de qué
flota le ofreciste y a qué precio. Si se pisa, esa evidencia se pierde.

#### Tarifas
Viven en `comercial.bike_prices`, que es **(bici × ruta × año)** — no es un opcional normal
porque la tarifa cubre los *días* de la ruta: la misma MTB vale 265 € en Ponferrada (5 días)
y otra cosa en Oviedo (8 días).

- Se editan en `/catalogo` → **"Tarifas de alquiler de bicicleta"**, con el mismo selector
  de año que el resto. Igual que las rutas: **coincidencia exacta de año**, sin caer al
  anterior. Una celda vacía se ve en ámbar y dice "sin cargar" — no es un precio de 0.
- Botón **"Aplicar regla automática"**: `precio CS = Pilgrim ÷ 0,85` (comisión de agencia
  del 15 %). **Ojo: NO es la regla de las rutas** (`max(pilgrim+100, pilgrim÷0,85)`). Ese
  +100 sobre un alquiler de 265 € sería un 27 % de margen, fuera de mercado.
- El botón "Copiar tarifas de {año}" arrastra también las bicis.
- Una bici sin tarifa del año **no sale en el PDF** y no se puede marcar en el CRM. Es a
  propósito: en un documento que va al cliente no se inventa una cifra.

#### La fianza NO es parte del total
200 € por bicicleta, obligatoria y reembolsable en máximo 20 días tras la entrega. Sale
como aviso ámbar aparte, fuera del recuadro del total, en la card y en el PDF. Meterla
dentro del total sería cobrarle de más al peregrino.

#### La ficha de cada bici
`comercial.bikes`: gama, modelo, descripción, tallas, ruedas, alforjas, ficha técnica y
motor. Se siembra desde `src/lib/bikes/data.ts` con:
```bash
npx tsx scripts/seed_bicis.ts     # idempotente, nunca pisa un precio ya cargado
```
**Lo que se vende es la GAMA, no el modelo**: el proveedor solo garantiza una bicicleta de
prestaciones equivalentes en la talla disponible. Todos los textos lo dicen.

#### El catálogo comercial en PDF (sin precios)
Documento de 12 páginas con identidad Camino Sacro para mandarle al peregrino:
```bash
npx tsx scripts/generar_catalogo_bicis.ts               # local + sube a Storage
npx tsx scripts/generar_catalogo_bicis.ts --solo-local  # solo local
```
Queda en `scripts/out/` (ignorado por git) y en
`comercial-catalogs/bicicletas/catalogo-bicicletas-camino-sacro.pdf`.
Regeneralo cuando cambies una ficha en `comercial.bikes`.

**Solo bicicletas**: la ropa de ciclismo (maillots) y el resto de mercancía del dossier del
proveedor quedan fuera a propósito. Los únicos extras cargados son el **casco** (40 €) y el
**seguro a todo riesgo de la bici** (32 €), que son opcionales normales de categoría
`equipo_bici` porque su precio es plano y no depende de la ruta.

#### Etapas
Las rutas de bici necesitan sus etapas en `comercial.route_stages` o **el PDF sale con el
itinerario en blanco** (el conteo de días/noches se deriva de las etapas, no de
`routes.days`). Cargada la del Francés desde Ponferrada (migración 0022); **faltan Oporto y
Oviedo** — hay que pedirle el desglose al proveedor.

### C. Agregar una ruta nueva con sus etapas
Editá `app/scripts/add_routes.ts`, agregá un nuevo objeto al array `ROUTES` siguiendo el patrón existente. Después corré:
```bash
cd "Plataforma Comercial/app" && npx tsx scripts/add_routes.ts
```
Es idempotente — solo afecta la ruta nueva, las existentes no se tocan.

### D. Cambiar la plantilla de email
1. Abrí: <https://supabase.com/dashboard/project/yvytzquewjsjsmgiwmaa/sql/new>
2. Editá:
```sql
update comercial.email_templates
   set subject = 'TU NUEVO ASUNTO con {{code}}',
       body_md = E'Hola {{nombre}},\n\nTu nuevo cuerpo aquí...'
 where slug = 'cotizacion_enviada';
```
Variables disponibles: `{{nombre}}`, `{{nombre_completo}}`, `{{code}}`, `{{ruta}}`, `{{ruta_descripcion}}`, `{{fechas}}`, `{{fechas_largas}}`, `{{duracion}}`, `{{dias_camino}}`, `{{personas}}`, `{{alojamiento_descripcion}}`, `{{precio_total}}`, `{{total_eur}}`, `{{total_cop}}`, `{{trm}}`, `{{validez}}`.

### D2. Recordatorios de firma del contrato
Cuando un contrato queda "Aprobado · esperando firma", la plataforma le reenvía el enlace
al peregrino **cada 4 días, hasta 5 veces**, renovando el vencimiento del enlace en cada
envío. Al quinto le llega un aviso a `reservas@` para llamarlo y no se envía más.

- Lo despierta el workflow n8n **"Recordatorio de firma — Camino Sacro"** (Schedule diario
  9:00 am), que llama a `/api/cron/recordatorios-contrato`. Toda la lógica está en el
  código de la app, no en n8n; correrlo de más no duplica correos.
- **Para pausar los recordatorios:** desactivá ese workflow en n8n.
- **Para dejar de insistirle a un cliente en concreto:** en Seguimiento, "Anular enlace"
  (vuelve a borrador y sale del ciclo).
- **Reenviar a mano reinicia el contador** a 0: el siguiente automático sale 4 días después.
- Cambiar la cadencia o el tope: `DIAS_ENTRE_RECORDATORIOS` y `MAX_RECORDATORIOS` en
  `src/app/api/cron/recordatorios-contrato/route.ts` (y el rótulo del CRM en `ContractCard.tsx`).

En la tarjeta del contrato en Seguimiento se ve "Recordatorio 2 de 5 · último el 14 de agosto".

### D3. Contratos de un grupo (un contrato por viajero)
Una cotización de N personas tiene N **viajeros** (`comercial.quote_travelers`) y N
contratos, uno por cada uno: cada viajero recibe su propio enlace, firma a su nombre y
sube su pasaporte.

- En la card **"Contratos"**: botón "Crear las N filas" precarga tantas filas como
  personas tenga la cotización; se completan nombre y correo, "Guardar viajeros".
- Los datos del **viaje** (fechas, valores, textos del anexo, plan de pago) se editan
  **una sola vez** y se aplican a todos con "Aplicar a todos los contratos".
- "Crear los N contratos" y "Enviar todos para firma" hacen el lote. Cada fila también
  tiene sus acciones individuales.
- El **número de pasaporte lo escribe cada viajero al firmar**; al firmar se copia a
  `quote_travelers.document_number`, que es de donde lo toma el correo a Pilgrim.
- Un viajero que ya tiene contrato **no se puede borrar** de la lista (arrastraría el
  contrato, y si está firmado destruiría una prueba legal): primero hay que anularlo.

### D4. Costo Pilgrim y utilidad
`quotes.cost_eur` es **derivado**, no se escribe a mano. Lo calcula
`comercial.recompute_quote_money()`, espejando el lado del cliente:

| Cliente | Pilgrim |
|---|---|
| `base_eur` | `cost_base_eur` |
| `season_supplement_eur` | `season_supplement_cost_eur` |
| `quote_lines.unit_price × quantity` | `quote_lines.cost_unit × quantity` |
| `total_eur` (derivado) | `cost_eur` (derivado) |

`recompute_quote_total()` quedó como envoltorio de `recompute_quote_money()`, así que
cualquier sitio que ya la llamara recalcula ambos lados. **Si agregas un flujo nuevo que
cree cotizaciones, escribe `cost_base_eur` + `season_supplement_cost_eur` y deja que el
RPC arme el total** — no escribas `cost_eur` directo.

### D5. Correo a Pilgrim
Card **"Correo a Pilgrim"** en el seguimiento: le manda la reserva a **precios de ellos**
(el TOTAL A PAGAR es exactamente el KPI "Costo Pilgrim"), con los pasaportes de los
viajeros adjuntos, pidiendo el link de pago. Asunto y cuerpo son editables antes de enviar.

- Destinatario: `/configuracion` → "Proveedor Pilgrim" (llave `pilgrim` en `settings`).
- **Modo prueba**: checkbox "Enviar como prueba a…" desvía el correo a otra dirección con
  el mismo contenido y adjuntos, y **no** marca `pilgrim_email_sent_at`. También existe en
  el envío masivo de contratos.
- Los adjuntos múltiples requieren un ajuste de una vez en n8n:
  ver `scripts/n8n_varios_adjuntos.md`.
- Para ensayar con 1, 2, 3 y 20 personas:
  `npx tsx scripts/seed_pruebas.ts tucorreo@gmail.com` (y `--limpiar` para borrarlas).

### E. Cambiar suplementos de temporada
```sql
update comercial.settings set value = jsonb_set(value, '{high_season,price_cs}', '90'::jsonb)
where key = 'season_supplements';
-- cambia +80 a +90 €/persona
```

### F. Cambiar precios de tokens (modelo de IA)
```sql
update comercial.settings set value = jsonb_set(value, '{bots,clara,in_per_mtok}', '4.00'::jsonb)
where key = 'token_pricing';
```

---

## 4. Cambios en el código

### Editar una página
1. Abrí el archivo correspondiente (ver árbol arriba)
2. Editá, guardá
3. Si `npm run dev` está corriendo, recargá en el navegador (cambios casi instantáneos con Turbopack)

### Las tarjetas de precio del PDF (pensión / hotel)
Las tarjetas grandes de la página 2 salen de **`comercial.quotes.price_blocks`** (migración
0016): un mapa `modalidad → precio de venta por persona`.

```json
{"pension_doble": 680}                       → una sola tarjeta
{"pension_doble": 680, "hotel_doble": 790}   → dos tarjetas, la elegida en verde
null                                          → se sacan del catálogo del año
```

Se llenan desde la grilla **"Precios que salen en el PDF (€ por persona)"** del asistente
(`/cotizaciones/nueva`) y del editor (`/seguimiento/[id]`). **Dejar un alojamiento en blanco
significa que esa tarjeta no se dibuja** — es la forma de cotizar solo pensión sin que el PDF
invente un precio de hotel. La tarjeta cobrada siempre muestra el precio real derivado de
`base_eur`, así que el override nunca puede contradecir la plata cotizada.

Antes de la 0016 el PDF armaba siempre la tarjeta del alojamiento no elegido leyendo el
catálogo. Con precios tecleados a mano eso producía comparaciones falsas (caso CS-2026-063:
pensión 680 € tecleada contra hotel 650 € del catálogo 2026 — hotel más barato que pensión).

### Cambiar el diseño del PDF
Archivo: `src/lib/quotePdf.tsx`
- Colores: variable `C` arriba (`C.verde`, `C.oro`, etc.)
- Fuentes: `SERIF` (Times-Roman) y `SANS` (Helvetica) — built-in, no requieren descarga
- Estilos: objeto `s` (StyleSheet)
- Estructura: cada `<Page>` es una página

Después de editar:
```bash
npx tsc --noEmit       # verificar tipos
npm run build          # build completo
```

Para probar el PDF: refrescá `/seguimiento/[id]` → "Regenerar PDF".

### Cambiar lógica de la app (validaciones, cálculos)
- Server Actions (lo que se ejecuta en servidor cuando das click en un botón): archivos `actions.ts` en cada carpeta
- Componentes cliente: archivos `*.tsx` con `"use client"` arriba

---

## 5. Cambios al schema de la base de datos

**No edites tablas vía Dashboard directamente** — perdés el historial. Mejor usar migraciones.

### Crear una migración nueva
1. Crear archivo `app/supabase/migrations/000X_descripcion.sql` con tu SQL
2. Aplicar via Supabase MCP o Dashboard SQL Editor:
   - **Dashboard**: <https://supabase.com/dashboard/project/yvytzquewjsjsmgiwmaa/sql/new> → pegás el SQL → Run
   - **MCP** (si Claude Code está corriendo): pedile a Claude que la aplique

Ejemplo migración nueva:
```sql
-- 0010_add_provider_invoice_url.sql
alter table comercial.provider_payments add column if not exists invoice_url text;
```

### Backup de la DB
Supabase hace **backups automáticos diarios** (free tier 7 días). Si necesitás más:
- Dashboard → Database → Backups → Create backup

---

## 6. Push a GitHub

### Primera vez (crear repo)
1. **Crear repo nuevo** en GitHub: <https://github.com/new>
   - Nombre: `caminosacro-platform` (o el que quieras)
   - **Private** (recomendado — tiene tu key publishable visible en el código, mejor mantenerlo privado)
   - **NO** marques "Initialize this repository with a README" — el repo local ya tiene archivos
2. Copiá la URL HTTPS del repo, ej.: `https://github.com/tuusuario/caminosacro-platform.git`
3. En tu terminal:
```bash
cd "Plataforma Comercial/app"
git remote add origin https://github.com/tuusuario/caminosacro-platform.git
git branch -M main
git push -u origin main
```
GitHub te puede pedir tu usuario/password. Si tenés 2FA, usá un **Personal Access Token** (Settings → Developer settings → Tokens en GitHub).

### Pushes siguientes (después de hacer cambios)
```bash
cd "Plataforma Comercial/app"
git status                          # ver qué cambió
git add .                           # stagear todo
git commit -m "Describe el cambio"  # commit
git push                            # enviar a GitHub
```

### Verificar antes de pushear
```bash
npx tsc --noEmit    # pasa los tipos
npm run build       # build OK
```

---

## 7. Desplegar a producción (Railway)

**Estado**: en producción → <https://caminosacro-platform-production.up.railway.app>

Cada `git push origin main` dispara redeploy automático (1–2 min). No hace falta tocar Railway para cambios de código.

### Acceso al dashboard
- Proyecto: <https://railway.com/project/79452da2-37dd-4e9e-a105-0c9c4eeaa8de>
- Servicio: `caminosacro-platform` (rama `main` del repo `elcaminoconnaty/caminosacro-platform`)
- Builder: Railpack (auto-detecta Next.js, Node 22)

### Variables de entorno
Cargadas en Railway → Service → Variables. Si rotás la `service_role` key, actualizá ahí:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRM_API_PRIMARY`
- `TRM_API_FALLBACK`
- `WP_QUOTER_SECRET` — secreto compartido con WordPress para `/api/wp/*`
- `QUOTE_EMAIL_WEBHOOK_URL` — webhook n8n "Correo Cotización — Camino Sacro"
- `QUOTE_EMAIL_WEBHOOK_SECRET` — header `x-webhook-secret` que valida ese workflow
- `APP_BASE_URL` — URL pública de la plataforma; la usa el cron de recordatorios para
  armar el enlace de firma (sin ella el endpoint responde 500)
- `CRON_SECRET` — header `x-cron-secret` con el que n8n llama a `/api/cron/*`

Sin `QUOTE_EMAIL_WEBHOOK_URL` y `QUOTE_EMAIL_WEBHOOK_SECRET` **no sale ningún correo**
(cotizaciones del CRM, cotizador público y contratos usan el mismo webhook → Brevo →
`reservas@caminosacro.com`).

Cambiar una variable redespliega automáticamente.

### Flujo de cambios
```bash
git add .
git commit -m "Mi cambio"
git push                 # Railway buildea y deploya solo
```
Ver progreso del build: dashboard → Service → Deployments.

### Custom domain (pendiente)
Cuando quieras `app.caminosacro.com`:
1. Dashboard → Service → Settings → Networking → "Custom Domain"
2. Pegá `app.caminosacro.com`. Railway te da un `CNAME` para apuntar desde tu DNS.
3. Esperá propagación DNS (~5 min) y Railway emite el cert TLS solo.

### Si un deploy falla
- Dashboard → Service → Deployments → click el deploy rojo → "View Logs"
- Build logs: errores de compilación (tipos, imports)
- Deploy logs: errores en runtime (variables faltantes, crashes)

### Región
Servicio actual en `asia-southeast1` (Singapur). Edge sirve global desde Virginia (us-east4). Si necesitás bajar latencia hacia España/Colombia, cambiá región en Settings → Region.

---

## 8. Tareas comunes

| Tarea | Dónde |
|---|---|
| Crear cotización nueva | `/cotizaciones/nueva` |
| Editar datos de cotización | `/seguimiento/[id]` → Editar |
| Registrar pago de cliente | `/seguimiento/[id]` → "+ Pago" en card cliente |
| Registrar pago a Pilgrim | `/seguimiento/[id]` → "+ Pago" en card Pilgrim |
| Marcar opcionales que va el cliente | `/seguimiento/[id]` → checkbox en "Servicios opcionales" |
| Generar PDF | `/seguimiento/[id]` → "Generar PDF" |
| Copiar email para cliente | `/seguimiento/[id]` → botones "Copiar..." en card de email |
| Cargar los viajeros de un grupo | `/seguimiento/[id]` → card "Contratos" → "Crear las N filas" |
| Enviar los contratos a firmar | `/seguimiento/[id]` → card "Contratos" → "Enviar todos para firma" |
| Enviarle la reserva a Pilgrim | `/seguimiento/[id]` → card "Correo a Pilgrim" |
| Cambiar el correo de Pilgrim | `/configuracion` → "Proveedor Pilgrim" |
| Subir PDF manual (override) | `/seguimiento/[id]` → "Subir manual" |
| Cotizar el Camino en bici | `/seguimiento/[id]` → card "Alquiler de bicicleta" |
| Emitir la cotización con la bici elegida | `/seguimiento/[id]` → "Crear cotización con la bici elegida" |
| Cambiar tarifa de alquiler de bici | `/catalogo` → "Tarifas de alquiler de bicicleta" |
| Regenerar el catálogo de bicis en PDF | `npx tsx scripts/generar_catalogo_bicis.ts` |
| Cambiar precio en catálogo | `/catalogo` → click en celda |
| Ver etapas de una ruta | `/catalogo` → sección "Itinerarios y etapas" → click en ruta |
| Ver costo en tokens IA | `/tokens` |

---

## 9. Datos sensibles y seguridad

- **`.env.local`** está en `.gitignore` → nunca se sube. Contiene la `service_role` key.
- Si por error pushas la `service_role` key a GitHub: <https://supabase.com/dashboard/project/yvytzquewjsjsmgiwmaa/settings/api> → "Roll service_role key" para revocarla, y actualizá tu `.env.local` con la nueva.
- La `publishable` key (`sb_publishable_*`) es pública por diseño, no es un secreto.
- RLS está activo en `comercial.*` — solo usuarios autenticados ven datos.
- Storage buckets son privados, accesibles vía URLs firmadas (10 min de validez).

---

## 9b. Cómo se organizan los archivos en Storage

Todos los documentos se guardan por **expediente**: año y código de cotización.
Así, todo lo de un cliente queda junto y navegable desde el explorador de Supabase.

```
comercial-quotes/     2026/CS-2026-034/CS-2026-034_Amalia_Matallana_Frances.pdf
comercial-docs/       2026/CS-2026-034/Documento-Viaje-CS-2026-034_Amalia_....pdf
comercial-docs/       2026/CS-2026-034/Seguro-Viaje-CS-2026-034.pdf
comercial-docs/       2026/CS-2026-034/Etiqueta-Equipaje-CS-2026-034.pdf
comercial-docs/       generico/Asistencia-en-Viaje-Camino-Sacro.pdf
comercial-hotel-fotos/ siete-en-el-camino/1.jpg
comercial-receipts/   2026/CS-2026-034/REC-CS-2026-034-1_Amalia.pdf
comercial-contracts/  2026/CS-2026-034/Contrato-CS-2026-034.pdf  (+ -firmado)
comercial-passports/  2026/CS-2026-034/Pasaporte-CS-2026-034-<ts>.jpg
comercial-catalogs/   fichas-de-viaje/...
comercial-welcome/    cartas-bienvenida/...
fotos-instagram/      camino-sacro/2026/06/DDC_3232.jpg
```

- `comercial-docs/generico/` es la única carpeta fuera del patrón año/código: la
  Asistencia en Viaje es genérica y hay UNA sola, para que corregir un teléfono valga
  también para los viajes ya enviados.
- `comercial-hotel-fotos` (fotos del catálogo de hoteles) **no** es `comercial-hotels`.
  Ese último es el bucket del PDF viejo de tabla de hoteles; ya no se escribe y se
  conserva solo para no perder lo generado antes de la migración 0030.
- **Quién decide la ruta**: `src/lib/storage/paths.ts`, único lugar. Si hay que
  cambiar la estructura, se cambia ahí y se recorre el script de abajo.
- En la BD las rutas se guardan **con el bucket adelante** (`comercial-quotes/2026/...`).
  Los lectores (`getSignedUrl`, `getResourceUrl`, `removeStoragePath`) parten por
  el primer `/` y rearman el resto, así que soportan subcarpetas.
- **Reorganizar archivos ya existentes**:
  ```bash
  npx tsx scripts/reorganize_storage.ts            # dry-run: muestra de → a
  npx tsx scripts/reorganize_storage.ts --apply    # ejecuta
  npx tsx scripts/reorganize_storage.ts --apply --fotos   # incluye fotos-instagram
  ```
  Es idempotente (se puede correr las veces que sea) y mueve con la API de Storage,
  nunca con `UPDATE storage.objects` (esta versión mantiene además `storage.prefixes`).
  Tras mover, actualiza las columnas de rutas en la BD y hace un repaso final por si
  quedó alguna desalineada.
- **Cuidado con `fotos-instagram`**: `public.registrar_fotos_nuevas()` compara
  `storage.objects.name` contra `fotos.storage_path`. Si se mueven fotos sin
  actualizar esa columna, el pipeline de Instagram las re-registra como nuevas y
  puede republicar fotos ya usadas. Por eso `--fotos` va aparte y conviene correrlo
  lejos del pg_cron `camino-sacro-publicar-diario` (`0 0 * * *` UTC = 7pm Bogotá).

---

## 10. Si algo se rompe

1. Mirá la consola donde corre `npm run dev` — ahí salen los errores reales
2. Mirá la consola del navegador (Cmd+Option+I → Console)
3. Si es un error de DB: <https://supabase.com/dashboard/project/yvytzquewjsjsmgiwmaa/logs/postgres-logs>
4. Si es un error de Auth: <https://supabase.com/dashboard/project/yvytzquewjsjsmgiwmaa/logs/auth-logs>
5. Backup: Supabase tiene snapshot diario automático

---

## 11. Comandos útiles

```bash
# Desarrollo
npm run dev                       # arrancar dev server (http://localhost:3000)
npm run build                     # build de producción local
npx tsc --noEmit                  # verificar tipos sin generar archivos
npm run lint                      # verificar estilo (eslint)

# Scripts de datos
npx tsx scripts/seed.ts           # seed inicial (no correr de nuevo a menos que necesites)
npx tsx scripts/enrich.ts         # enriquecer cotizaciones desde xlsx
npx tsx scripts/add_routes.ts     # cargar rutas master + etapas

# Git
git status                        # estado
git diff                          # diferencias antes de commit
git add .                         # stagear todo
git commit -m "mensaje"           # commit
git push                          # subir a GitHub
git log --oneline -10             # últimos 10 commits
```

---

## 12. Documentación de viaje

Lo que recibe el peregrino cuando ya pagó: cuatro documentos y un enlace que no caduca.
Vive en la tarjeta **Documentación de viaje** del expediente (`/seguimiento/[id]`), que
solo aparece si la cotización está en `pago_completo` o `completada`.

### Los cuatro documentos

| Documento | De dónde sale |
|---|---|
| **Documento de viaje** | Lo genera la plataforma. Alojamientos noche a noche con fotos, servicios incluidos, condiciones y contacto. |
| **Asistencia en viaje** | Lo genera la plataforma, **una sola vez para todos** (Configuración → Asistencia en Viaje). |
| **Seguro de viaje** | Lo emite la aseguradora. Se sube con el botón «Cargar PDF». |
| **Etiqueta de transporte de equipaje** | La emite el transportista. Se sube igual. |

### La regla: un dato, un lugar

| Dato | Vive en |
|---|---|
| Nombre, dirección, teléfono, email, fotos y observaciones **fijas** del hotel | `comercial.hotels` — el módulo **/hoteles** |
| Qué hotel toca cada noche, fecha, etapa, km, habitación, régimen, observación **de esa noche** | `comercial.quote_hotels` |
| Servicios, condiciones y contacto del documento | `comercial.settings`, clave `travel_doc` |
| Textos y teléfonos de la asistencia | `comercial.settings`, clave `asistencia_viaje` |

`quote_hotels.hotel_id` **manda siempre**. Las columnas de texto libre que quedan
(`hotel_name`, `address`, `contact`) son archivo de lo generado antes de la migración
0030: la tarjeta obliga a elegir del catálogo. Si el Hostal Suso cambia de teléfono, se
corrige en `/hoteles` y queda bien en todos los viajes, pasados y futuros.

### Cómo se arma un viaje

1. **/hoteles** — cargar los alojamientos con sus datos y hasta 3 fotos (las que dibuja
   el documento). El campo **Ciudad** debe parecerse a la localidad de la etapa: es lo
   que usa el prellenado. No hace falta que sea idéntico — «Pedrouzo» empareja con
   «O Pedrouzo (O Pino)» y «Santiago» con «Santiago de Compostela»
   (`src/lib/travelDocs/lugares.ts`).
2. En el expediente, **Prellenar desde itinerario**: trae día, etapa y km de
   `route_stages` y propone el hotel de cada noche. Las que quedan sin hotel se marcan
   en ámbar.
3. Revisar habitación, régimen y notas puntuales, marcar los **servicios incluidos**
   («Proponer según opcionales» los deduce de las líneas contratadas) y **Generar documento**.
4. Subir el seguro y la etiqueta cuando lleguen.
5. **Enviar documentación**. Antes conviene una prueba: la casilla «Enviar a otra
   dirección» no marca el expediente como enviado.

### El enlace que no caduca

Los botones del correo NO apuntan a Supabase: apuntan a
`/documentacion/<token>/descargar/<documento>`, que firma la URL **en cada clic**. Una
URL firmada de Storage caduca a los pocos días y el peregrino abre esto durante el viaje
y meses después. El token vive en `comercial.travel_docs` y se puede anular («Anular») o
rotar («Generar enlace nuevo»); anularlo deja muerto el enlace que ya tiene el cliente.

La ruta `/documentacion` es pública en `src/proxy.ts`: autentica por el token, no por
sesión. Si se saca de esa lista, el cliente termina en la pantalla de login del CRM.

### Ojo con las condiciones

Los porcentajes y los gastos de gestión de `settings.travel_doc` tienen que decir **lo
mismo** que la cláusula sexta del contrato (`src/lib/contracts/template.ts`): hoy, 150 €
por persona y 15/50/80 %. **No** son los de Pilgrim (100 € y 5/10/30/50 %). Si se cambia
la política, hay que cambiarla en los dos sitios; si no, al cliente le llega un documento
que contradice lo que firmó.

### El correo va en HTML

Requiere un parche de una línea en el nodo «Validar y Preparar» del workflow de n8n —
ver `scripts/n8n_correo_html.md`. Sin él, el correo sale en texto plano con los enlaces
completos: se ve peor, no se rompe nada.

### Probar los PDF sin navegador

```bash
SMOKE_OUT=/tmp npx tsx --env-file=.env.local scripts/docs_smoke.tsx
```

Renderiza el Documento de Viaje y la Asistencia con los textos reales de `settings` y
datos de ejemplo. Sirve para ver un cambio de maquetación sin tocar una cotización.

Para sembrar los seis alojamientos del Sarria → Santiago:

```bash
FOTOS_DIR=/ruta/con/fotos npx tsx --env-file=.env.local scripts/seed_hoteles_sarria_santiago.ts
```

---

## Estudio de Contenido — cómo abrirlo desde el celular u otro computador

El módulo vive en `/contenido`, dentro de esta misma plataforma, y usa el catálogo como
única fuente de verdad: si cambias un precio en **Catálogo**, la pieza lo refleja sola.

### Dónde funciona cada cosa

|  | En Railway (siempre disponible) | En tu computador |
|---|---|---|
| Diseñar, elegir ruta, poner fotos, exportar | ✅ | ✅ |
| **Sugerir copy** y **Sugerir ideas** | ❌ avisa que no puede | ✅ |

La razón: esos dos botones usan **tu suscripción de Claude Code**, no una clave de API que
se paga aparte. Esa sesión vive en tu computador, y en el servidor no existe.

### Abrirlo desde el celular estando en la misma WiFi

1. En el computador: `cd "Plataforma Comercial/app" && npm run dev`
2. Mira la línea **Network** que imprime — algo como `http://192.168.1.122:3000`
3. Escribe esa dirección en el navegador del celular y entra con el magic link de siempre.

El computador tiene que estar prendido y con el servidor corriendo. La IP la reparte el
router y **cambia sola**, así que fíjate en la que imprime cada vez (por eso
`allowedDevOrigins` en `next.config.ts` lleva comodines de subred y no una IP fija: estuvo
clavada en `.101` cuando la real ya era `.122`, y entrar desde el celular quedaba roto sin
que nada lo dijera).

### Desde fuera de la casa

**Ya funciona: se usa el enlace de siempre**, el de Railway. No hace falta túnel ni estar
en la misma red. Copy e ideas también, gracias al puente.

## El puente: cómo funcionan copy e ideas sin clave de API

La suscripción de Claude Code vive en el llavero del computador de Nico. Un servidor no
puede usarla. Así que la plataforma no habla con Claude: **deja el encargo en una cola** y
un programita que corre en ese computador lo resuelve y escribe la respuesta.

```
Quien sea, desde cualquier navegador  →  aprieta "Sugerir copy"
Plataforma (Railway)                  →  deja el encargo en contenido_trabajos
Puente (computador de Nico)           →  lo resuelve con la suscripción y responde
Plataforma                            →  la respuesta aparece sola en pantalla
```

Lo importante: **el computador solo hace llamadas salientes**. Sin puertos abiertos, sin
IP fija, sin túnel. Funciona con el portátil en la wifi de un café.

- **Está instalado y arranca solo** al encender el computador (launchd).
- Ver el log: `tail -f ~/Library/Logs/caminosacro-puente.log`
- Arrancarlo a mano: `npm run puente` · Reinstalarlo: `npm run puente:instalar`
- Quitarlo: `launchctl bootout gui/$(id -u)/com.caminosacro.puente`
- La pantalla dice si el computador está escuchando. Si está apagado, el encargo **queda
  en cola** y se resuelve solo cuando se encienda; nada sale por la API.
- Medido de punta a punta: **13 segundos** desde que se aprieta el botón.

El puente es deliberadamente tonto: el prompt ya viene armado desde la plataforma, así que
toda la lógica de voz y de negocio se despliega con la app y `scripts/worker_contenido.ts`
puede quedarse quieto meses.
