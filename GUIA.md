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
│   │   ├── tokens/               ← consumo de tokens IA y costo USD
│   │   └── configuracion/        ← (placeholder) plantillas email, suplementos
│   ├── login/                    ← magic link sign in
│   └── auth/                     ← callback OAuth y signout
├── src/components/shell/         ← Sidebar y Topbar
├── src/lib/                      ← código compartido
│   ├── supabase/                 ← clientes Supabase (client/server/admin)
│   ├── trm.ts                    ← TRM EUR↔COP del día con cache
│   ├── format.ts                 ← formateo de eur/cop/fechas
│   ├── seasons.ts                ← detección temporada alta + Semana Santa
│   ├── tokens.ts                 ← cálculo de costos por bot
│   ├── quotePdf.tsx              ← generador PDF de cotización
│   └── cover.jpg                 ← foto de portada del PDF (NO borrar)
├── src/proxy.ts                  ← protección de rutas (era middleware en Next 15)
├── supabase/migrations/          ← migraciones SQL versionadas
└── scripts/
    ├── seed.ts                   ← seed inicial (catálogo, opcionales, PDFs Abril)
    ├── enrich.ts                 ← rellenar nombres/teléfonos desde xlsx
    ├── add_routes.ts             ← cargar rutas master con etapas
    └── cleanup_orphans.ts        ← borrar archivos huérfanos de Storage
```

### Bases de datos en Supabase

- Schema **`public`**: tablas existentes (Clara, Baymax, blog, instagram, token_usage). Solo lectura desde la plataforma.
- Schema **`comercial`**: tablas nuevas de la plataforma (rutas, precios, cotizaciones, pagos, opcionales, etapas, etc.).

---

## 3. Cambios comunes (sin tocar código)

### A. Cambiar precios del catálogo
1. `/catalogo` → Click en cualquier celda de Pilgrim € o Mi precio €
2. Cambiá el número, salí del campo (Tab o click afuera) → se guarda solo
3. Cada cambio queda en `comercial.pricing_history` (audit log)
4. Botón **"Aplicar regla automática"** recalcula CS = max(Pilgrim+100, Pilgrim÷0.85)

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

Sin las dos últimas **no sale ningún correo** (cotizaciones del CRM, cotizador
público y contratos usan el mismo webhook → Brevo → `reservas@caminosacro.com`).

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
| Subir PDF manual (override) | `/seguimiento/[id]` → "Subir manual" |
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
comercial-hotels/     2026/CS-2026-034/CS-2026-034_hoteles_Amalia.pdf
comercial-receipts/   2026/CS-2026-034/REC-CS-2026-034-1_Amalia.pdf
comercial-contracts/  2026/CS-2026-034/Contrato-CS-2026-034.pdf  (+ -firmado)
comercial-passports/  2026/CS-2026-034/Pasaporte-CS-2026-034-<ts>.jpg
comercial-catalogs/   fichas-de-viaje/...
comercial-welcome/    cartas-bienvenida/...
fotos-instagram/      camino-sacro/2026/06/DDC_3232.jpg
```

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
