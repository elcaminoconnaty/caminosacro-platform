# Estudio de Contenido — bitácora de construcción

Módulo para armar carruseles, portadas de reel, historias y piezas con gráficos para
`@caminosacro.agencia`, con la identidad de Camino Sacro ya puesta, copy sugerido y un motor
de ideas conectado a las métricas de Instagram.

**Fase 1 = Etapas 0–6 (crear y exportar). Fase 2 = Etapa 8 (publicar con un botón).**

---

## CONTRATO PARA QUIEN TRABAJE ACÁ (subagentes: leer completo antes de tocar nada)

1. Tu **primera** acción es leer este archivo entero.
2. Trabajas **UNA SOLA ETAPA**. No empieces la siguiente aunque te sobre contexto.
3. Tu **última** acción es, en este orden: correr la verificación → marcar la casilla →
   escribir en "Notas" las decisiones que tomaste y lo que te sorprendió → **commitear**.
   **Sin commit, la etapa no existe.**
4. Si te quedas sin contexto a mitad: escribe el estado parcial en Notas y **commitea igual**,
   dejando la app compilando aunque la funcionalidad esté a medias.
5. Antes de escribir Next.js, lee `node_modules/next/dist/docs/`. Es la regla #1 de `AGENTS.md`:
   esta es Next 16 y **no es el Next que te sabes** (middleware = `src/proxy.ts`,
   `params`/`searchParams` son `Promise`).
6. **Regla dura de Satori:** todo `div` con más de un hijo lleva `display:'flex'` explícito.
   Nada de CSS grid, `float` ni `position:sticky`. Es *el* error que quema horas.
7. Estilo del repo: nombres de dominio en español (`renderPieza`, `sugerirCopy`), infraestructura
   en inglés (`createPublicSchemaClient`). Comentarios en español explicando el **porqué**.
   Server Actions devuelven `{ error: string }` o `{ ok: true, aviso?: string }` — **nunca `throw`**.
   Los errores pasan por `mensajeError()` de `src/lib/errors.ts`.
   Patrón canónico a copiar: `src/app/(dashboard)/seguimiento/[id]/`.
8. Commits en español, indicativo, describiendo el efecto de negocio.

**Verificación, igual en todas las etapas:**
```bash
npx tsx scripts/contenido_smoke.tsx   # desde la Etapa 1 en adelante
npx tsc --noEmit
npm run build
```

**Retomar tras un corte:** leer esta bitácora → `git log --oneline -8` → seguir por la primera
casilla sin marcar.

---

## ⚠️ CINCO TRAMPAS QUE NO SE NEGOCIAN

1. **NUNCA insertar filas en `public.fotos`, ni escribir en el bucket `fotos-instagram`.**
   La Edge Function `publicar` (otro repo: `Camino Sacro/Automatizacion Facebook e instagram/
   caminosacro-ig-auto/`) elige de `public.fotos where status='disponible'` **sin mirar el bucket**,
   y publica a las 7pm en la cuenta real. Una fila ahí = un post no aprobado en producción.
   Además `registrar_fotos_nuevas()` escanea el bucket `fotos-instagram` y registra lo nuevo solo.
   → El estudio usa `public.contenido_fotos` y los buckets `contenido-fotos` / `contenido-piezas`.

2. **Las tablas del pipeline de Instagram devuelven `[]` sin error.** Tienen RLS activo y cero
   políticas; la app entra como `authenticated` y PostgREST responde vacío en vez de 403. Sin la
   migración `0024` el motor de sugerencias mentiría en silencio. Comprobación:
   `select count(*) from aprendizajes` debe dar **5**, no 0.

3. **Cero emoji dentro de las plantillas.** Medido: un emoji en el árbol lleva el render de 15 ms a
   1741 ms y agrega una dependencia de red (Satori busca el SVG en un CDN). La concha va como
   `<path>` SVG. En el *caption* sí van emoji: eso es texto, no imagen.

4. **La voz manda desde `_shared/estrategia.ts` del otro repo**, no desde los documentos de marca
   viejos. Ese archivo **prohíbe explícitamente** "sí puedes" y "el Camino sí es para ti si…".
   Pilares vigentes: `tips, ruta, prueba_social, latam, servicios, accion, objeciones`.

5. **Publicar desde el estudio apaga el post automático de ese día** (fase 2): `publicar` consulta
   `posts_log` por `fecha_local=hoy` y hace skip si ya hay algo. Es deseable, pero el botón avisa.

---

## Identidad visual (valores exactos)

```
bosque #1a3a2a · bosque-medio #2d5a3d · dorado #f0c060 · dorado-oscuro #e0a840
crema #f7f5f0 · taupe #e8e3d8 · tinta #2a2520 · muted #6b6258
```
Caladea (serif de marca, 400/700) + Inter (cuerpo). **Satori no ve los tokens de Tailwind v4**:
las plantillas usan `style` inline desde `PALETA` en `src/lib/contenido/marca.ts`, espejo
deliberado del objeto `C` de `src/lib/quotePdf.tsx`.
La concha es el único isotipo; no hay archivo de logo. Firma = "Camino Sacro" en Caladea Bold +
"AGENCIA DE PEREGRINACIONES" en Inter, oro, uppercase, tracking .12em.
Overlay sobre foto: `linear-gradient(180deg, rgba(26,58,42,.25), rgba(26,58,42,.72))`.
Bloque verde sólido en el tercio inferior. Cajas r=24, pills r=40. Separadores `—` y `·`.

---

## ETAPAS

- [x] **Etapa 0 — El módulo existe y hay bitácora**
      Archivos: `PLAN_CONTENIDO.md`, `src/components/shell/Sidebar.tsx`,
      `src/app/(dashboard)/contenido/page.tsx`.
      Terminado: `/contenido` carga logueado y la entrada sale en el menú.

- [x] **Etapa 1 — Identidad renderizable**
      Archivos: `src/lib/contenido/{marca,formatos,tipos,fuentes}.ts`,
      `src/lib/contenido/plantillas/_lockups.tsx`, `src/lib/fonts/Caladea-{Regular,Bold}.ttf`
      (descargar de Google Fonts, Apache 2.0), `scripts/contenido_smoke.tsx`.
      Terminado: el smoke escribe 5 PNG (uno por formato) con el lockup de marca completo —concha
      SVG, "Camino Sacro" en Caladea, eyebrow oro uppercase tracking .12em, pie con web y handle—
      y ninguno lanza excepción.
      *Sub-paso opcional, **commit aparte**: con Caladea en disco, cambiar `SERIF` en
      `src/lib/quotePdf.tsx` de `Times-Roman` a Caladea. Cambia el PDF que ve el cliente, por eso
      va separado y revertible solo.*

- [x] **Etapa 2 — Motor de render, base de datos y endpoint**
      Archivos: migraciones `0023_contenido_estudio.sql` y `0024_contenido_lectura_instagram.sql`
      (aplicar por MCP de Supabase, proyecto `yvytzquewjsjsmgiwmaa`),
      `src/lib/contenido/plantillas/{registry.ts,portadaRuta.tsx,cierreCta.tsx}`,
      `src/lib/contenido/render.ts`,
      `src/app/api/contenido/piezas/[id]/[slide]/route.ts`, `src/lib/storage/paths.ts`.
      Terminado: (a) `select count(*) from public.contenido_piezas` responde;
      (b) una fila semilla sale como PNG 1080×1350 por `GET /api/contenido/piezas/<id>/0`;
      (c) el smoke renderiza las 2 plantillas en los 5 formatos;
      (d) **`select count(*) from aprendizajes` como `authenticated` devuelve 5, no 0.**

- [x] **Etapa 3 — Editor de una pieza**
      Archivos: `src/app/(dashboard)/contenido/[id]/{page,actions,Editor,Lienzo,PanelCampos,TiraSlides}.tsx`.
      Decisiones fijas: autoguardado debounced 600 ms con `useTransition`; el preview se refresca
      cambiando `?v=<hash del slide>`; `Cache-Control: immutable` para que navegar entre slides sea
      gratis; el formulario se **genera** desde `registry[plantilla].campos`, jamás a mano.
      Terminado: cambiar un texto actualiza la imagen en <1.5 s; F5 conserva lo escrito;
      añadir/duplicar/borrar/reordenar slides funciona.

- [x] **Etapa 4 — Catálogo completo de plantillas y gráficos**
      Archivos: las 7 plantillas restantes, `src/lib/contenido/graficos/*`, `src/lib/contenido/datos.ts`.
      Gráficos: `<svg>` inline (Satori lo soporta) con `viewBox` + `width`/`height` explícitos y
      **cero `<text>` dentro** —resvg lo rasteriza con su propia base de fuentes y saldría con
      tipografía ajena a la marca—; los rótulos van como divs de Satori encima.
      Cargar la skill `dataviz` antes de escribir los gráficos y reemplazar su paleta por la nuestra.
      Terminado: el smoke cubre el 100% del registry × sus formatos declarados (≥25 PNG); elegir
      "Camino Francés desde Sarria" autollena km/etapas/días/"desde 505 €" y las barras de
      `comercial.route_stages`.
      *Ojo: no hay datos de desnivel (`route_stages` = day, from_place, to_place, km,
      accommodation, notes). Nada de "perfil de elevación": barras de km, que es lo que hay.*

- [x] **Etapa 5 — Fotos, de las cuatro fuentes**
      Archivos: `src/app/(dashboard)/contenido/[id]/SelectorFoto.tsx`, `src/lib/contenido/fotos.ts`.
      Decisión clave: la subida va **navegador → Supabase Storage** con `createPublicClient()` de
      `src/lib/supabase/client.ts`, no por Server Action (el `bodySizeLimit` es 15 MB y una carpeta
      de fotos lo revienta). Carpetas locales con `<input type="file" webkitdirectory multiple>`.
      **Sin carga masiva previa: la foto se sube en el momento de armar el post.**
      Terminado: las 4 fuentes funcionan (banco `fotos-instagram` de 177 · subida suelta · carpeta ·
      sin foto) **y `select count(*) from public.fotos` sigue en 177 después de subir.**

- [x] **Etapa 6 — Exportar**  ← *aquí termina la Fase 1: el módulo ya cumple el encargo*
      Archivos: `src/app/(dashboard)/contenido/[id]/Exportar.tsx`, `src/lib/contenido/export.ts`,
      `src/app/(dashboard)/contenido/{actions.ts,PiezasGrid.tsx}`.
      Decisión clave: el navegador convierte PNG→JPEG en `<canvas>` (2.6 MB → ~250 KB) y sube el
      JPEG a `contenido-piezas`; el servidor solo registra `export_paths`. Sin `sharp`, sin ZIP de
      servidor. El JPEG es además lo único que acepta la Graph API en la fase 2.
      Terminado: exportar un carrusel de 4 slides descarga 4 JPG de 1080×1350 <500 KB y quedan en
      el bucket; la lista de piezas muestra miniaturas.

- [x] **Etapa 7 — Copy e ideas con Claude**
      Archivos: migración `0025_contenido_ideas.sql`, `src/lib/contenido/{estrategia,claude,copy,ideas,vozLint}.ts`,
      `src/app/(dashboard)/contenido/{ideasActions.ts,IdeasPanel.tsx,ResumenMetricas.tsx}`,
      `src/app/(dashboard)/contenido/[id]/BarraCopy.tsx`, `.env.example`, `GUIA.md`.
      Requiere `ANTHROPIC_API_KEY` en `.env.local` y en Railway. Sin SDK: copiar el `fetch` plano
      con *tool use* de `caminosacro-ig-auto/supabase/functions/_shared/claude.ts`.
      **Honestidad estadística obligatoria:** hay 18 posts y 15 filas de métricas. Cada idea trae
      `evidencia` con **la n visible**; bajo n=5 se etiqueta "señal débil" y no se afirma nada. El
      peso real lo llevan `aprendizajes.resumen`, `blog_calendario` (365 filas) y sobre todo
      `comercial.quotes` (qué rutas pide la gente de verdad, sin depender de Instagram).
      Terminado: "Sugerir copy" devuelve caption+hashtags que pasan `vozLint`; "Sugerir qué
      publicar" crea ≥3 ideas con razón y evidencia; **aparece la fila `contenido` en `/tokens`
      sin haber tocado esa página** (loguear en `public.token_usage` con `bot:'contenido'`, dentro
      de `try/catch` que nunca haga fallar la acción del usuario).

- [ ] **Etapa 8 — Fase 2: publicar a Instagram**
      Archivos: migración `0026_contenido_publicacion.sql`, `src/lib/contenido/instagram.ts`,
      acción `publicarPieza`, botón en la pieza.
      Reusar `_shared/instagram.ts` del otro repo (contenedor por slide → contenedor `CAROUSEL` →
      `media_publish`, con el polling de `status_code` ya resuelto ahí) y el token permanente de
      `public.ig_tokens`. Se escribe en `public.posts_log` (no tabla nueva) para que el cron
      `metricas` recoja las métricas gratis.
      Alcance: foto única, carrusel e historia. **La portada de reel NO se publica por API** —es el
      `cover_url` de un media `REELS`—: se exporta y se sube a mano.
      Terminado: `posts_log` con `permalink`, `origen='estudio'` y `pieza_id`; el post existe en la
      cuenta; a las 24–48 h el cron deja su fila en `post_metricas`.

---

## Notas

### Etapa 0 — 2026-08-24
- Entrada `Contenido` agregada al array `NAV` de `src/components/shell/Sidebar.tsx` con el icono
  `Images` de lucide, entre `Catálogo` y `Tokens & Costo`: es una herramienta de trabajo diario,
  no de configuración.
- `/contenido` es por ahora un Server Component con la portada del módulo y el estado de las
  etapas. Se reemplaza entero en la Etapa 3.
- Decisión confirmada al planear: las tablas van en el schema `public` con prefijo `contenido_`,
  **no** en un schema nuevo. Un schema nuevo exige agregarlo a mano en Settings → API → Exposed
  schemas (lo dice la cabecera de `supabase/migrations/0001_init_comercial.sql`), y eso no viaja
  en git. Se reusa `createPublicSchemaClient()`; no hace falta cliente nuevo.

### Etapa 1 — 2026-08-24
- Caladea 400/700 descargada del repo de Google Fonts (`github.com/google/fonts/ofl/caladea`)
  en **TTF**, no woff2: **Satori acepta ttf/otf/woff y NO acepta woff2.**
- `fuentes.ts` memoiza los cuatro TTF a nivel de módulo. Si falta un archivo, lanza con
  mensaje explícito en vez de dejar que Satori caiga en Geist — una pieza fuera de marca
  que no avisa es peor que un error.
- **El script se llama `contenido_smoke.tsx`, no `.ts`**: necesita JSX para importar los
  lockups. Corregido en la bitácora.
- **Trampa nueva encontrada, para quien siga:** la concha salió mal dos veces y ninguna
  lanzó error.
  1. Con un radio único, el abanico se **clipa contra el viewBox** por los lados. Se
     arregló usando radio elíptico (`RADIO_X` 45 / `RADIO_Y` 74 sobre viewBox 100×100).
  2. Los surcos se dibujaban en `PALETA.bosque` sobre una concha también bosque:
     invisibles. Ahora `Concha` recibe `colorSurcos` aparte y **tiene que contrastar**
     con `color`, o la concha se lee como una mancha.
  Moraleja: el smoke solo prueba que *no lanza*. **Hay que abrir los PNG y mirarlos.**
- Tiempos medidos (portada completa sobre bosque, sin foto): 4x5 894 ms el primero
  —arranque de los wasm— y 39-67 ms los siguientes. Peso 47-102 KB sin foto.
- `scripts/out/` agregado a `.gitignore`: los PNG no se commitean.
- Pendiente opcional que NO hice (va en commit aparte cuando se quiera): con Caladea ya
  en disco, cambiar `SERIF`/`SERIF_BOLD` en `src/lib/quotePdf.tsx` de `Times-Roman` a
  Caladea. Cambia el PDF que ve el cliente, por eso no lo mezclo con esta etapa.

### Etapa 2 — 2026-08-24
- Migraciones `0023` y `0024` **aplicadas en producción** (`yvytzquewjsjsmgiwmaa`).
  Comprobación crítica pasada: como `authenticated`, `select count(*) from aprendizajes`
  devuelve **5, no 0** → la trampa de RLS del pipeline de IG queda desactivada. Y
  `public.fotos` sigue en **177**: el estudio no le tocó la cola al bot.
- Tablas nuevas: `public.contenido_piezas` y `public.contenido_fotos`. Buckets nuevos
  `contenido-fotos` y `contenido-piezas`, públicos (Instagram tiene que poder descargar
  la imagen por URL en la fase 2, y no hay dato sensible).
- **El render vive en `render.tsx`, no `.ts`** — necesita JSX para la pieza de error.
- **Pieza de error en vez de 500:** si la plantilla no existe o el slide está corrupto, el
  endpoint devuelve una imagen que DICE qué pasó. El editor la muestra en el preview y el
  usuario entiende el problema sin abrir la consola.
- **Bug de maqueta que costó una vuelta, y que se repetirá en las plantillas de la Etapa 4:**
  con `justifyContent: space-between` sobre el alto completo, el titular queda flotando en
  el medio de la foto y el bloque verde sale VACÍO. La solución es que el bloque verde sea
  a la vez el fondo y el **contenedor** del titular (`position:absolute; bottom:0` con su
  propio padding). Vale para toda plantilla con bloque inferior.
- Zona segura verificada a ojo en la portada de reel: cabecera, titular, datos y pie caen
  dentro de y ∈ [420,1500], que es lo único que sobrevive al recorte 1:1 de la grilla.
- Herramienta nueva: `npx tsx scripts/contenido_verifica_pieza.tsx <id>` renderiza una
  pieza real de la base sin servidor ni sesión. Sirve para depurar una pieza concreta.
- Pieza semilla en la base para la Etapa 3:
  `8065d1ba-106d-481d-a74c-f4143590a4e6` — "Semilla — Francés desde Sarria", 4x5, 2 slides
  (portada-ruta con foto del banco + cierre-cta).
- Tiempos con foto remota: primer render 2.3 s (descarga la foto), luego 320-390 ms. Peso
  1.2-1.7 MB en PNG — que es justo por lo que la Etapa 6 exporta JPEG desde el navegador.

### Etapa 3 — 2026-08-24
- Editor de tres columnas: tira de slides · lienzo · panel de campos. El panel se **genera**
  desde `registry[plantilla].campos`, así que agregar una plantilla no toca ninguna pantalla.
- Autoguardado debounced 600 ms con `useTransition`. Detalles que importan:
  - `version` es la huella de lo **guardado**, no de lo que se está escribiendo: el preview
    pinta lo que hay en la base, así que solo se refresca cuando el guardado termina. Es lo
    honesto — enseñar algo que todavía no está guardado sería mentir.
  - Al cambiar de slide se fuerza el guardado pendiente para no perderlo.
  - `beforeunload` avisa si se cierra la pestaña con algo sin guardar.
- `hashSlide` se reescribió como djb2 a mano (sin `node:crypto`): lo llama el editor, que
  corre en el navegador. No es criptografía, es un cache-buster.
- El preview pide `?escala=0.5`: pesa cuatro veces menos y a tamaño de pantalla no se nota.
  La exportación pedirá el tamaño real por el mismo endpoint.
- **Trampa de Next 16 que costó un build:** `<form action={serverAction}>` exige que la
  acción no devuelva nada, y la convención del repo es devolver `{error}`. Solución: el
  alta va por componente cliente (`NuevaPieza.tsx`) llamando la acción dentro de una
  transición, que es el mismo patrón del Wizard de cotizaciones.
- Verificado con el servidor levantado: `/contenido`, `/contenido/[id]` y
  `/api/contenido/piezas/[id]/[slide]` devuelven **307 → /login** sin sesión, o sea que
  `src/proxy.ts` las protege sin haber tocado `PUBLIC_PATHS`.
- **Lo que NO pude verificar:** la interacción del editor a golpe de clic, porque exige
  iniciar sesión por magic link. El cableado (rutas, acciones, tipos, build) sí está
  comprobado. Queda para la prueba manual de punta a punta.

### Etapa 5 — 2026-08-24  (se adelantó a la Etapa 4)
- **Reordené a propósito:** fotos y exportar van ANTES que las siete plantillas que
  faltan. Con dos plantillas y sin fotos ni exportación el módulo no sirve para nada;
  con fotos y exportación ya es una herramienta usable, aunque tenga pocas plantillas.
  La Etapa 4 (resto del catálogo y gráficos) queda de siguiente.
- Cuatro fuentes de foto: **Banco** (las 177 de `public.fotos`, marcando las ya
  publicadas), **Mis fotos** (`contenido_fotos`), **Subir** (archivos sueltos o una
  carpeta entera con `webkitdirectory`) y **Sin foto** (fondo verde de marca).
- **La subida va navegador → Storage directo**, con `createPublicClient()`, no por Server
  Action: el `bodySizeLimit` es de 15 MB y una carpeta de fotos de cámara lo revienta sin
  decir por qué. La Server Action solo registra la fila después.
- Sin carga masiva previa, como pediste: la foto se sube en el momento de armar el post.
- Control de la trampa pasado: después de todo esto `public.fotos` **sigue en 177** y los
  buckets `contenido-fotos` / `contenido-piezas` existen. El estudio no le tocó la cola
  al bot.
- La foto no se guarda con debounce sino de una: no se escribe letra a letra.

### Etapa 6 — 2026-08-24
- El navegador convierte el PNG del endpoint a JPEG con `<canvas>` y lo hace dos cosas a
  la vez: lo descarga y lo sube a `contenido-piezas`. El servidor solo registra
  `export_paths` + `exportado_at`.
- **Peso medido de verdad** (no estimado): portada 4:5 con foto **1493 KB en PNG → 207 KB
  en JPEG q92**. La 9:16 igual: 1460 KB → 208 KB. Bien por debajo del objetivo de 500 KB.
- **Dato contraintuitivo:** en un slide de color plano sin foto (`cierre-cta`) el JPEG
  pesa MÁS que el PNG (84 KB → 94 KB), porque PNG gana en color plano. Da igual: 94 KB no
  es nada, y **JPEG es lo único que acepta la Graph API de Instagram**, así que exportar
  todo en JPEG deja la fase 2 resuelta. No vale la pena mezclar formatos por 10 KB.
- El canvas se pinta con fondo blanco antes de dibujar: el JPEG no tiene transparencia y
  sin eso los bordes salen negros.
- Si la subida a Storage falla, la descarga **igual se completa** y se avisa aparte: el
  usuario ya tiene su archivo, que es lo que vino a buscar.
- El botón se bloquea mientras hay un guardado en vuelo, para no exportar la versión vieja.

### Etapa 4 — 2026-08-24
- Ocho plantillas en el registry: `portada-ruta`, `tip-numerado`, `dato-grande`,
  `etapas-ruta`, `comparativa-precio`, `mito-realidad`, `testimonio`, `cierre-cta`.
  El smoke renderiza **34 combinaciones** (plantilla × formato) sin un solo fallo.
- **Los gráficos NO llevan SVG.** Cargué la skill `dataviz` y su primera consecuencia fue
  descartar el SVG: unas barras horizontales de una serie se hacen con divs de flexbox, y
  así el problema del `<text>` con fuente ajena ni se plantea. El SVG queda reservado para
  formas que los divs no pueden (dona, línea), si algún día hacen falta.
- **El validador de paleta descartó un color.** `node scripts/validate_palette.js` sobre
  fondo bosque: **`#3d7a52` (verde claro) da 2.44:1 de contraste y falla el piso de croma
  — "lee gris"**. No sirve como color de marca en gráficos sobre verde. Las barras van en
  dorado `#f0c060`, que sí pasa, y el carril es blanco al 10%.
- Una sola serie ⇒ un solo tono: la magnitud ya la codifica el largo de la barra, y pintar
  cada barra distinta sería inventar categorías que no existen. Sin rejilla ni ejes: en una
  pieza social son ruido. Rótulo directo en todas las barras porque es una imagen fija —
  no hay hover posible— y son pocas.
- `comparativa-precio` **no es un gráfico a propósito**: dos precios son dos cifras, y la
  forma correcta son dos tarjetas contrastadas, la misma maqueta de la página 2 del PDF.
- **Los datos del catálogo se COPIAN dentro del slide**, no se leen al dibujar. Dos razones:
  el render queda puro (el smoke corre sin base de datos) y una pieza publicada no cambia
  sola si mañana sube un precio. Para refrescar, se vuelve a elegir la ruta.
- Verificado contra la base: "Francés desde Sarria" autollena **112 km · 7 días · 5 etapas
  · desde 505 €**, todo real. Las etapas sin km (la fila "Llegada a Sarria") se filtran.
- Con más de 7-9 etapas los rótulos se apelmazan: se muestran las primeras y se dice
  cuántas faltan, en vez de encoger todo hasta que no se lea.

#### ⚠️ Dato malo encontrado en el catálogo comercial (NO lo toqué)
En la ruta **"Frances desde Sarria 6 etapas (Melide)"**, la etapa Sarria → Portomarín
tiene **`km = 221`** en `comercial.route_stages`. Debería ser 22.1. No es cosa de este
módulo: esa columna alimenta el itinerario del **PDF de cotización que ve el cliente**.
No lo corregí porque es dato comercial y no me corresponde cambiarlo por mi cuenta.
Conviene revisarlo y de paso mirar si hay más comas corridas en esa tabla.

### Etapa 7 — 2026-08-24
- **Dos cosas cambiaron respecto al plan aprobado, y ambas a mejor:**
  1. **Modelo `claude-opus-5`**, no el `claude-sonnet-4-6` del bot. El bot publica una vez
     al día sin nadie mirando; acá el uso es a demanda y con humano en el medio, y lo
     difícil de acertar es justamente la voz de marca.
  2. **Se usa el SDK oficial `@anthropic-ai/sdk`**, no `fetch` pelado. Rompe la promesa de
     "cero dependencias nuevas" del plan, pero es lo correcto para un proyecto TypeScript:
     da salida estructurada validada con zod (`messages.parse` + `zodOutputFormat`),
     errores tipados y caché de prompt. Verificado que el helper de zod funciona con la
     zod v4 que ya tenía el proyecto.
- **Salida estructurada con zod**, no el truco de tool-use del bot viejo: el modelo
  devuelve un objeto ya validado, así que no hay JSON dentro de texto que parsear — de
  ahí salían los fallos cuando el copy traía comillas o saltos de línea.
- El system prompt va con `cache_control` (es estable entre llamadas y es la parte larga)
  y con `thinking: adaptive`.
- Costo registrado en `public.token_usage` con `bot:'contenido'`, **dentro de try/catch que
  nunca hace fallar la acción del usuario**: perder el registro de costo molesta, perder el
  copy que acaban de pedir, mucho más. Añadida la entrada `contenido` a
  `comercial.settings.token_pricing` (`claude-opus-5`, 5/25 USD por millón), así que el
  gasto aparece en `/tokens` **sin haber tocado esa página**.
- **`vozLint` probado y funcionando** (esto sí se puede verificar sin clave): sobre un copy
  malo caza las 9 infracciones —markdown, lista con viñetas, cuatro frases prohibidas, tres
  emojis, hashtag inventado—; sobre uno rioplatense caza "vos", "querés" y "usted"; y deja
  pasar limpio un copy que cumple. Corre siempre, también sobre lo que devuelve Claude.
- El motor de ideas cruza cinco fuentes y **el peso lo llevan las que aguantan la muestra**:
  aprendizajes destilados, calendario editorial y sobre todo **cotizaciones** (qué rutas
  pide la gente de verdad, sin depender de Instagram). Toda evidencia lleva su n y por
  debajo de n=5 se marca "señal débil" en el prompt y en la interfaz.
- El smoke ahora avisa si `estrategia.ts` se separó de la del otro repo (largos de
  HASHTAGS, RUTAS y PILARES).

#### Lo que NO pude verificar y hace falta para cerrar
**`ANTHROPIC_API_KEY` no existe en la app** (vive como secreto de las Edge Functions). Hay
que agregarla a `.env.local` y a Railway — es la misma clave que ya usa el bot. Sin ella,
diseñar y exportar funciona igual; solo "Sugerir copy" y "Sugerir ideas" avisan que falta.
Queda sin comprobar de punta a punta: que salgan ≥3 ideas con razón, y que aparezca la
fila `contenido` en `/tokens`.

#### ⚠️ Segundo dato desactualizado encontrado (NO lo toqué)
En `comercial.settings.token_pricing`, los bots `blog` y `blog_naty` están cargados como
`claude-opus-4-7` a **15/75 USD por millón**. El precio real de Opus 4.7 es **5/25**. El
reporte de costos del blog está inflado unas 3 veces. No lo corregí porque cambia cifras
históricas que quizá estén siguiendo.

### Revisión 2026-08-24 (2ª) — suscripción en vez de API, y el catálogo como fuente única

**1. Copy e ideas van por la SUSCRIPCIÓN, no por la API.**
Se quitó `@anthropic-ai/sdk` y entró `@anthropic-ai/claude-agent-sdk`, que se apoya en el
CLI de Claude Code ya instalado y logueado. Cero claves, cero cobro por token.
- **La contrapartida hay que tenerla presente:** esa sesión vive en el computador. En
  Railway no hay CLI ni sesión, así que "Sugerir copy" y "Sugerir ideas" **no funcionan
  allá** y avisan con un mensaje claro (`ClaudeNoDisponible`). Todo lo demás —diseñar,
  elegir ruta, fotos, exportar— funciona igual en los dos lados.
- El agente corre **aislado**: `allowedTools: []`, `permissionMode: 'dontAsk'`,
  `settingSources: []`. Sin esto cargaría los CLAUDE.md del repo y mezclaría las
  instrucciones del proyecto con la voz de la marca. Y sin `dontAsk`, un permiso pedido
  dentro de una Server Action se quedaría esperando una respuesta que nadie va a dar.
- `@anthropic-ai/claude-agent-sdk` va en `serverExternalPackages`: lanza un binario nativo
  como subproceso y empaquetarlo rompe la resolución.
- **Trampa que costó media hora:** zod v4 mete `$schema` (draft 2020-12) en el JSON Schema
  y el CLI lo rechaza con *"no schema with key or ref…"*. Hay que quitárselo. Queda escrito
  en el código.
- Probado de verdad contra la sesión local: respuesta estructurada correcta en **5,5 s**.
- `comercial.settings.token_pricing.contenido` queda a **precio 0**: los tokens se siguen
  registrando (sirven para ver volumen) pero mostrar dólares que nadie cobra sería mentir
  en el informe de `/tokens`.

**2. El catálogo de la plataforma es la ÚNICA fuente de verdad.**
Antes los datos de ruta se copiaban dentro del slide y ahí se quedaban. Ahora
`refrescarDesdeCatalogo()` los relee justo antes de dibujar y antes de pedir el copy: si
cambias un precio en Catálogo, la pieza lo refleja sola. Lo guardado en el slide queda solo
de respaldo por si la ruta desaparece del catálogo, para que una pieza vieja no se rompa.
Vive en la capa de servidor (endpoint y acciones), **no dentro del render**, para que el
smoke siga corriendo sin base de datos.

**3. `vozLint` reforzado: el voseo se colaba.**
El primer copy generado de verdad decía *"vivís"*, *"escribile"* y *"arrancá"* — voseo
argentino, que la estrategia prohíbe expresamente — y el revisor lo dejaba pasar con sus
siete formas iniciales. Ahora lleva ~50, y sobre todo cubre el patrón que más se cuela: el
**imperativo voseante** (`arrancá`, `vení`, `mirá`) y el **imperativo con pronombre pegado**
(`escribile`, `decile`, `mandale`).
**Trampa de JavaScript que hay que recordar:** `\b` se calcula sobre `[A-Za-z0-9_]`, así que
una vocal con tilde ya cuenta como "no palabra" y `\barrancá\b` **nunca casa**. Hay que usar
`(?<!\p{L})…(?!\p{L})` con la bandera `u`. Verificado que caza las tres formas y que no da
falsos positivos con "arranca", "mira", "deja" ni "Escríbele".

**4. Acceso desde otros dispositivos.**
`allowedDevOrigins` apuntaba a `192.168.1.101` y la IP real de la máquina ya era `.122`:
entrar desde el celular estaba roto y nada lo decía. Ahora lleva comodines de subred
(`192.168.1.*`, `192.168.0.*`, `10.0.0.*`), porque el router reparte la IP por DHCP y cambia.

**5. Datos malos del catálogo, corregidos.**
- `route_stages`: Sarria → Portomarín de "Frances desde Sarria 6 etapas (Melide)" pasó de
  **221 km a 22** (coma corrida). Con 22 la ruta suma 112 km contra los 113 declarados, y
  coincide con la ruta hermana de 5 etapas. Salía impreso en el PDF del cliente.
- Misma ruta: `"Santaigo de Compostela"` → `"Santiago de Compostela"`, también impreso.
- `token_pricing`: los bots de blog estaban a **15/75** USD por millón; Opus 4.7 cuesta
  **5/25**. El informe de costo del blog venía inflado ~3x.

### Revisión 2026-08-24 (3ª) — el puente: copy e ideas desde cualquier navegador

**El problema.** La suscripción de Claude Code vive en el llavero del computador de Nico.
Un servidor no puede usarla, y no es algo que se pueda programar alrededor. Pero el módulo
tiene que funcionar desde el enlace de siempre (Railway), para él y para su esposa, desde
donde estén y sin atarse a una IP.

**La solución: una cola, no un túnel.**
```
Quien sea, desde cualquier navegador  →  "Sugerir copy"
Plataforma (Railway)                  →  encola en public.contenido_trabajos
Puente (computador de Nico)           →  lo resuelve con la suscripción y responde
Plataforma                            →  la respuesta aparece sola
```
Lo que esto compra: **el computador SOLO HACE LLAMADAS SALIENTES**. Sin puertos abiertos,
sin IP fija, sin túnel, sin router. Funciona con el portátil en la wifi de un café. Y se
descartó el túnel a propósito: exigiría hostname estable, credenciales e inbound, y dejaría
la máquina de casa expuesta a internet para no ganar nada a cambio.

**Decisión tomada (Nico, explícita):** si el computador está apagado, el encargo **espera en
cola** y la pantalla lo dice. Nada sale por la API, ni como respaldo.

**Separación worker / plataforma.** El puente es deliberadamente TONTO: recibe
`{system, user, schema}` ya armados y solo los despacha. No sabe de rutas, ni de precios,
ni de la voz. Así toda la lógica de negocio se despliega con la app y
`scripts/worker_contenido.ts` puede quedarse quieto meses. Para lograrlo hubo que partir
`copy.ts` e `ideas.ts` en dos: `construirEncargo*()` (arma el prompt, vive en la app) e
`interpretar*()` (valida y revisa la voz al volver).

**Robustez de la cola.**
- `contenido_tomar_trabajo()` usa `for update skip locked`: dos computadores nunca se
  pelean el mismo encargo.
- `contenido_rescatar_trabajos()` devuelve a la cola lo que lleve más de 5 minutos
  "tomado" —un portátil que se cerró a mitad— y lo marca error definitivo a los 3 intentos.
- Latido cada 30 s en `contenido_worker`; la plataforma considera "encendido" por debajo de
  90 s. Con eso la pantalla puede decir la verdad ANTES de que alguien encargue nada.
- La pantalla sondea cada 2,5–3 s y distingue tres estados: *escribiendo en tu computador*,
  *en cola con N por delante*, y *esperando a que enciendan el computador*. Nada de spinner
  mudo.

**Arranca solo.** `npm run puente:instalar` lo registra en launchd (`RunAtLoad` +
`KeepAlive`): arranca al encender el computador y se reinicia si se cae. **Instalado y
verificado corriendo.** Log en `~/Library/Logs/caminosacro-puente.log`.
Detalle que rompe esto si se olvida: launchd arranca con un PATH mínimo y no encuentra
`node`; el plist lo inyecta explícitamente.

**Probado de punta a punta:** encargo encolado a mano → el puente lo tomó, lo resolvió con
la suscripción y escribió la respuesta. **13 segundos** en total. Latido visible y correcto.

---

# FASE 3 — Que sea rápido y que se pueda ajustar (2026-08-24)

Ocho cosas que salieron de usar el módulo de verdad. El norte no cambia: **hacer varios
posts en minutos, sin pensar mucho y sin tener que resolver nada**.

## Diagnóstico del "va lenta" — medido, no supuesto

Con la portada 4:5 y una foto del banco:

| Caso | ms | Peso |
|---|---|---|
| Sin foto | 119 | 99 KB |
| Foto por URL (lo que hace hoy) | 823 (1ª) · 582 (2ª) | **1493 KB** |
| Foto ya descargada (data URI) | 500 | 1493 KB |
| Foto en caché, preview a 0.5 | 344 | 588 KB |
| Foto en caché, preview a 0.35 | 320 | 312 KB |

**Tres causas, en orden de culpa:**
1. **Satori vuelve a descargar la foto en CADA render** (~250-320 ms cada vez). No la cachea.
2. **El PNG del preview pesa 588 KB a media resolución.** Eso viaja por la red en cada tecla.
3. **El preview espera al guardado**: escribir → 600 ms de espera → guardar en la base
   (ida y vuelta) → renderizar → transferir. **Un segundo y medio o dos por cada cambio.**
   Ahí está el "se vuelve muy complejo diseñar un post".

También: las transformaciones de imagen de Supabase (`/render/image/`) devuelven **403** —
son de plan pago. Esa vía está cerrada, hay que resolverlo en el servidor.

## Las ocho tareas

- [x] **T1 — Rendimiento del preview** *(la que más se nota)*
      **Objetivo:** que escribir y ver el cambio sea instantáneo.
      1. **Sacar el guardado del camino del preview.** Endpoint `POST /api/contenido/render`
         que recibe el slide tal como está en pantalla y devuelve el PNG. Sin base de datos,
         sin esperar a guardar. El guardado sigue ocurriendo aparte, en segundo plano.
      2. **Caché de fotos en memoria del proceso**: se descarga una vez y se le pasa a
         Satori como data URI. Ahorra 250-320 ms por render.
      3. **Preview a escala 0.35** (312 KB en vez de 588) y espera de 250 ms en vez de 600.
      4. **Miniaturas de la bandeja**: hoy cada pieza de la lista es un render completo. Usar
         el JPEG ya exportado si existe, y si no, escala 0.2.
      **Archivos:** `render.tsx`, `fotoCache.ts` (nuevo), `api/contenido/render/route.ts`
      (nuevo), `Lienzo.tsx`, `Editor.tsx`, `PiezasGrid.tsx`.
      **Terminado:** cambiar una letra se ve reflejado en menos de 400 ms.

- [x] **T2 — Letra más grande**
      La línea de datos y el cuerpo se leen pequeños en el celular. Subir la escala
      tipográfica base y revisar las ocho plantillas en los cinco formatos.
      **Archivos:** `marca.ts` (`ESCALA`), `plantillas/*`.
      **Terminado:** el smoke redibuja las 34 y se ven a ojo, sin texto cortado.

- [x] **T3 — Poder ajustar el diseño** *(lo que pidió como "diseñar")*
      **Alcance decidido: controles acotados, NO un lienzo libre.** Ver la nota de abajo.
      Cada slide gana un bloque `ajustes`:
      - `escalaTexto` (0.8 – 1.4): agranda o achica todo el texto del slide.
      - `altoBloque` (0 – 0.45 del alto): sube o baja la franja verde, o la quita del todo.
      - `encuadreFoto` (arriba / centro / abajo) y `zoomFoto` (1 – 1.6).
      - `velo` (0 – 0.85): cuánto tapa el degradado verde a la foto.
      **Archivos:** `tipos.ts` (esquema `AjustesSlide`), `plantillas/*`, `PanelCampos.tsx`,
      `Editor.tsx`.
      **Terminado:** en una historia 9:16 se puede bajar la franja verde hasta ver la foto
      casi entera, y el texto sigue dentro de la zona segura.

- [x] **T4 — Fotos en todas las plantillas**
      Hoy solo `portada-ruta` y `testimonio` aceptan foto. Que la acepten también
      `tip-numerado`, `dato-grande`, `mito-realidad`, `cierre-cta` y las de gráfico, con la
      foto de fondo y el velo regulable de T3.
      **Archivos:** `plantillas/*`, `registry.ts` (`usaFoto`).
      **Terminado:** cualquier slide del carrusel puede llevar foto.

- [x] **T5 — Que las sugerencias crezcan con los datos**
      Nico lo dijo bien: *"sé que al inicio vas a ser torpe"*. Que la pantalla **muestre de
      qué datos está saliendo cada idea** y cuántos posts medidos hay detrás, y que el peso
      de las métricas de Instagram suba solo a medida que haya más. Con 15 filas manda el
      catálogo y las cotizaciones; a partir de ~40 posts medidos, mandan las métricas.
      **Archivos:** `ideas.ts`, `IdeasPanel.tsx`, `ResumenMetricas.tsx`.
      **Terminado:** cada idea dice de dónde salió, y el panel dice cuánta data hay.

- [x] **T6 — Buscador de fotos de verdad**
      La rejilla actual es de 3 columnas y 256 px de alto: no se ve nada. Hacerlo un
      buscador: más grande, en modal o panel ancho, con búsqueda por `ruta_tag` y por
      nombre, miniaturas más grandes y scroll infinito.
      **Archivos:** `SelectorFoto.tsx`, `fotos.ts`.
      **Terminado:** se encuentra una foto concreta entre las 177 sin desesperarse.

- [x] **T7 — Historias que respiren**
      En 9:16 la franja verde se come casi toda la imagen. Lo resuelve T3 (bajar la franja),
      pero además hay que **cambiar el valor por defecto por formato**: un tercio del alto
      está bien en 4:5 y es demasiado en 9:16.
      **Archivos:** `marca.ts`, `plantillas/*`. **Depende de T3.**

- [x] **T8 — La idea llega con el carrusel entero escrito**
      Hoy aceptar una idea crea 3 slides con los textos de ejemplo. Que Claude devuelva los
      **5 o 6 slides ya redactados** —titular, cuerpo, dato, cierre— y que la pieza se arme
      completa. Es lo que convierte "una idea" en "un post listo en minutos".
      **Archivos:** `ideas.ts` (esquema con slides), `ideasActions.ts`, `IdeasPanel.tsx`.
      **Terminado:** aceptar una idea abre un carrusel de 5-6 slides con texto real, no de
      relleno.

## Sobre "quiero poder diseñar" — la respuesta honesta

Un lienzo libre de verdad (arrastrar la foto con el ratón, tiradores para redimensionar el
texto, capas) es **mucho más trabajo** y, sobre todo, **empuja en contra del objetivo**: es
volverse un Canva pequeño, y Canva es justo lo que se quería dejar de usar. Cada post
volvería a costar decisiones.

Por eso T3 es la vía media: **cuatro perillas por slide** que cubren lo que Nico pidió de
verdad —agrandar la letra, mover el encuadre de la foto, bajar la franja verde, poner
transparencia— sin abrir la puerta a maquetar a mano. Se ajusta en segundos y la pieza no
se puede "romper" ni salirse de la marca.

Si después de usar T3 se echa de menos mover cosas píxel a píxel, eso sí es una fase 4 y
conviene decidirlo con el módulo ya rodado.

### T1 — 2026-08-24 · HECHA. Y el estado de las demás tras un corte de límite

**Resultado medido del preview** (portada 4:5 con foto del banco):

| | Antes | Ahora |
|---|---|---|
| Render | 823 ms (1ª) · 582 ms | **2281 ms la 1ª · 223-231 ms el resto** |
| Peso | 588 KB (a 0.5) | **312 KB** (a 0.35) |
| ¿Espera al guardado? | **Sí**, ida y vuelta a Supabase | **No** |
| Percibido por tecla | 1,5 – 2 s | **~0,5 s** (250 ms de espera + 230 de dibujo) |

La primera vez sigue costando 2,3 s porque baja la foto; a partir de ahí está en caché.

**Los cuatro cambios:**
1. **`POST /api/contenido/render`** dibuja el slide que viene en el cuerpo, sin tocar la
   base. El preview dejó de pasar por "guardar y luego leer". El endpoint por id sigue
   existiendo y sigue mandando para exportar y para las miniaturas: ahí sí queremos lo
   guardado de verdad.
2. **`fotoCache.ts`**: Satori vuelve a descargar la foto en CADA render y no cachea nada.
   Ahora se baja una vez y se le pasa como data URI. Es el ahorro grande (250-320 ms).
   *La vía obvia estaba cerrada:* las transformaciones de imagen de Supabase
   (`/render/image/`) devuelven **403**, son de plan pago. Comprobado.
3. **Preview a 0.35 y espera de 250 ms** (antes 0.5 y 600 ms). Además el dibujo anterior se
   queda visible mientras redibuja —un punto dorado avisa— en vez de parpadear en blanco,
   y las peticiones que quedan viejas se cancelan con `AbortController`.
4. **Miniaturas de la bandeja desde el JPG exportado.** Antes, abrir la lista con diez
   piezas disparaba diez renders completos en el servidor. Ahora sale de Storage; sin
   exportar todavía, cae al render pero a escala 0.2.

**Detalle que costó una vuelta:** `fotoCache.ts` llevaba `import "server-only"`, y eso rompe
`contenido_smoke.tsx` y `contenido_verifica_pieza.tsx`, que importan `render.tsx` desde Node
pelado. Se quitó: ahí no aporta —solo hay `fetch` y `Buffer`— y sí rompe la verificación.

---

## ⚠️ ESTADO REAL TRAS EL CORTE DE LÍMITE (leer antes de seguir)

Los dos subagentes lanzados en paralelo **murieron a mitad** por el tope de gasto. Su
trabajo NO se perdió: se rescató, se dejó compilando y va commiteado. Pero está **a medias**.

**T6 (buscador de fotos) — BACKEND HECHO, INTERFAZ PENDIENTE.**
`src/lib/contenido/fotos.ts` ya tiene `buscarFotos()` con paginación y filtros,
`listarRutasDeFotos()` para los chips, `TANDA_FOTOS`, y los tipos `FotoBuscada`,
`ConsultaFotos`, `PaginaFotos`, `FiltroEstado`. `fotoActions.ts` ya expone
`buscarFotosAccion()` y `rutasDeFotos()`.
**Falta:** reescribir `SelectorFoto.tsx` para que use todo eso (modal grande, buscador,
chips, scroll infinito). Hoy sigue con la rejilla apretada de 3 columnas y **no llama a las
funciones nuevas**. Quien retome: la parte difícil ya está, es puro trabajo de interfaz.

**T8 (carrusel entero) — SOLO LA MIGRACIÓN.**
`0027_contenido_ideas_slides.sql` está escrita **y aplicada**: `contenido_ideas` ya tiene
las columnas `slides` (jsonb) y `fuente_dato` (con su check).
**Falta todo lo demás:** el esquema de respuesta en `ideas.ts` no pide slides, el prompt no
le pasa a Claude el catálogo de plantillas con sus campos, y `aceptarIdea()` sigue armando
tres slides de relleno. Las columnas están ahí sin que nada las use todavía.

**T2, T3, T4, T5, T7 — SIN EMPEZAR.**

**Orden recomendado para retomar** (de más a menos valor por esfuerzo):
1. **T8** — es lo que convierte "una idea" en "un post en minutos". La base ya está lista.
2. **T2** (letra más grande) — media hora, se nota en cada pieza.
3. **T3 + T7 + T4** — van juntas: los `ajustes` por slide resuelven de un golpe el
   "quiero diseñar", la franja verde que ahoga las historias, y las fotos en todas las
   plantillas.
4. **T6 interfaz** — el backend ya espera.
5. **T5** — la que menos urge: mejora sola a medida que entren métricas.

### T8 — 2026-08-24

**HECHA**, en los tres archivos permitidos (`ideas.ts`, `ideasActions.ts`, `IdeasPanel.tsx`)
más el único cambio autorizado fuera de ellos (el `select` de `page.tsx`). La migración
0027 ya estaba aplicada; no hizo falta ninguna nueva.

**Qué cambié:**
- `RespuestaIdeas` (en `ideas.ts`) gana `slides` (3 a 6, `{plantilla, valores}`) y
  `fuente_dato` (`metricas|catalogo|cotizaciones|calendario`) por idea.
- El prompt de `construirEncargoIdeas()` arma el catálogo de plantillas **recorriendo
  `PLANTILLAS_LISTA`** (nunca a mano): id, rol y campos con su `maxLargo` exacto. Se le
  dice a Claude que use solo esos ids/campos y que estructure el carrusel como
  portada → 1-4 de cuerpo → `cierre-cta`.
- `interpretarIdeas()` valida los slides contra el registry con la nueva función
  `validarSlides()`: descarta plantillas que no existen, filtra los campos que la
  plantilla no declara, y si tras filtrar quedan menos de 2 slides deja `slides: []`
  (mejor vacío que un carrusel roto a medias).
- `recogerIdeas()` guarda `slides` y `fuente_dato` al insertar. `aceptarIdea()` usa
  `idea.slides` tal cual (vía `leerSlides()`, que ya valida la forma y rellena `foto:
  null`) cuando vienen no vacíos; si vienen vacíos —worker viejo, o Claude no dio
  suficientes slides válidos— cae al relleno de siempre, ahora extraído a la función
  `slidesDeRelleno()`.
- `IdeasPanel.tsx` muestra una chapita con `fuente_dato` en español y un `<details>`
  "Ver los N slides" con plantilla + titular de cada uno (el primer campo de la
  plantilla que traiga texto, buscado con `plantilla()` del registry).

**Verificación:** `npx tsc --noEmit` limpio en los tres pasos; `npm run build` limpio al
cierre (compila y prerrenderiza las 15 páginas, incluida `/contenido`). No probé en el
navegador contra el worker real —el puente sigue sin tocarse, así que no hay forma de
encolar un encargo real desde este entorno—, así que la primera tanda de ideas que
Claude devuelva conviene mirarla con el `<details>` antes de confiar del todo en que el
worker respeta `maxLargo` y la estructura pedida.

**Pendiente / no verificado:**
- No hay prueba end-to-end con el worker de Nico resolviendo un encargo real de ideas
  con el prompt nuevo (más largo, con el catálogo completo). Si el worker tiene algún
  límite de tokens de entrada/salida más estricto que antes, convendría vigilarlo la
  primera vez que se use.
- `validarSlides()` descarta campos no declarados en silencio; si Claude insiste en
  inventar campos, las ideas seguirán llegando pero con menos texto del esperado — no
  hay aviso visible de cuánto se filtró, solo el resultado final en el `<details>`.

### T5 — 2026-08-24
- **El peso de las métricas de Instagram sube solo con el volumen**, en una constante con
  nombre (`PESO_METRICAS`) y su porqué escrito: por debajo de **20 posts medidos** casi
  ningún pilar llega a 5 observaciones, así que el prompt le **prohíbe** a Claude basar una
  idea solo en métricas y lo manda al catálogo y a las cotizaciones; entre 20 y 40 puede
  apoyarse en ellas diciendo sobre cuántos posts; por encima de 40 son la señal principal.
- La cuenta de posts medidos sale de los que **de verdad tienen métricas**, no de
  `posts_log` entero.
- `ResumenMetricas` dice en qué punto está la cuenta y **cambia solo** al crecer. Nico sabe
  que al principio va a ser torpe; decírselo es más honesto que un mensaje fijo, y deja ver
  que el módulo mejora sin que nadie lo toque.

### T6 interfaz — 2026-08-24

El backend (`fotos.ts`, `fotoActions.ts`) ya estaba hecho de una vuelta anterior; esta era
pura interfaz, solo tocando `SelectorFoto.tsx`.

- **Modal casi a pantalla completa** en vez de la rejilla de 3 columnas y 256px metida en la
  barra lateral. Fuera del modal solo queda una miniatura de 64px de la foto elegida y un
  botón «Cambiar foto» / «Elegir foto». Cierra con Escape, con clic fuera, o al elegir una
  foto (elegir = terminar el flujo). Bloquea el scroll del fondo mientras está abierto.
- **Cuatro pestañas** dentro del modal: Banco, Mis fotos, Subir, Sin foto — las mismas cuatro
  fuentes de siempre, la subida de archivos sueltos o carpeta (`webkitdirectory`) ahora vive
  en su propia pestaña en vez de estar siempre visible encima de la rejilla.
- **Buscador y filtros**: campo de texto con espera de 300ms antes de llamar a
  `buscarFotosAccion` (busca por nombre y `ruta_tag`), chips de ruta desde `rutasDeFotos`
  (cacheados por fuente, no hay lista fija), y el filtro de estado
  (todas/disponibles/usadas) solo para el banco — las fotos subidas nunca están "usadas",
  no las publica el bot.
- **Decisión de rendimiento:** sin ningún filtro activo la rejilla sigue mostrando
  directamente `banco`/`subidasIniciales`, las props que ya trae el editor (la primera
  tanda). Abrir el modal **no dispara ninguna consulta**. Solo se llama al servidor cuando
  hay un término de búsqueda, un chip de ruta o un filtro de estado activo, o al pedir más
  fotos.
- **Carga por tandas**: botón «Ver más» al fondo de la rejilla más un centinela con
  `IntersectionObserver` que dispara la misma carga con el scroll (el botón queda de
  respaldo, por si el navegador bloquea el observer o la ventana no da para hacer scroll).
  Pagina tanto la lista sin filtro (con un heurístico de "hay más" basado en si la semilla
  llegó a `TANDA_FOTOS`, que se corrige con la respuesta real del primer "ver más") como el
  resultado de una búsqueda (sigue desde `resultado.desde`).
- **Trampa de build que costó una vuelta:** `fotos.ts` lleva `import "server-only"` — un
  Client Component no puede importar nada de valor real de ese módulo aunque solo use una
  constante (`TANDA_FOTOS`), Next.js revienta el build ("server-only cannot be imported from
  a Client Component"). La solución fue mover el `import` de ese módulo a `import type`
  (los tipos se borran en build, no arrastran el módulo) y duplicar `TANDA_FOTOS = 48`
  localmente en `SelectorFoto.tsx` con un comentario explicando por qué no se importa.
- **Riesgo de repo compartido, anotado para quien siga:** hubo otro agente trabajando en
  paralelo sobre T3/T5/T8 en los mismos minutos. En el paso 2 un `git commit` suyo con
  `git add -A` corrió a mitad de mi propio `git add <archivo> && git commit` y se llevó mis
  cambios de `SelectorFoto.tsx` dentro de *su* commit (`52b98a7 — "Cada slide se puede
  ajustar sin salirse de la marca"`) en vez de uno propio de T6. El código quedó bien y
  compilando (nada se perdió), solo el historial de ese paso queda mezclado con T3. Pasos 1
  y 3 sí quedaron en commits propios.
- **No verificado en el navegador de verdad:** todo pasa `tsc --noEmit` y `next build`, pero
  nadie abrió el modal a mano todavía. Vale la pena probar con las 177 fotos reales del
  banco: que el `IntersectionObserver` dispare bien dentro de un contenedor con scroll
  propio (no la ventana), y que los chips de ruta no se desborden feo con muchos tags.
- La chapita de `fuente_dato` en cada idea la dejó el agente de T8.

### T3, T4 y T7 — 2026-08-25 · TERMINADAS (rescatando un agente caído)

Las 8 plantillas aceptan foto de fondo y respetan las cuatro perillas. **La fase 3 queda
completa: las ocho tareas hechas.**

**Cómo se repartió:** un agente hizo `tip-numerado`, `dato-grande`, `mito-realidad` y
`cierre-cta` (un commit cada una) y murió por el límite con `testimonio` a medio commitear.
Se rescató ese archivo —estaba completo y compilando— y se terminaron a mano `etapas-ruta`
y `comparativa-precio`.

**El hallazgo que obligó a rehacer dos plantillas.** Con foto, el cuerpo de texto se perdía
sobre las zonas claras de la imagen. El velo por defecto estaba calibrado para
`portada-ruta`, donde el texto va sobre el bloque verde sólido; en las plantillas de CUERPO
el texto va directo sobre la foto y necesita mucha más tapa. Regla que quedó:

> Con foto y sin velo elegido por el usuario, las plantillas de cuerpo usan un velo **plano
> fuerte** (`rgba(26,58,42,0.72)`, y `0.78` en `etapas-ruta`, donde las barras son lo más
> frágil), no el degradado de marca. Si el usuario mueve la perilla, manda su valor.

Esto **no lo caza `tsc` ni el smoke**: solo se ve abriendo el PNG. Es la razón por la que
cada plantilla se revisó a ojo antes de commitear.

**Detalle de implementación:** `comparativa-precio` dibuja las tarjetas en un
sub-componente que no ve los ajustes del slide, así que hay que pasarle `ut` como prop.
Cualquier plantilla que se parta en sub-componentes tendrá el mismo problema.

**Sin verificar:** nadie ha abierto el editor en un navegador para mover las perillas de
verdad. El render está comprobado pieza por pieza; la interacción no.

### Ajustes del 2026-08-25 · velocidad del selector y garantía de 4-6 slides

**1. El selector de fotos seguía lento: cargaba 15 MB para mostrar miniaturas.**
Pedía cada foto **a tamaño completo** (320 KB) para pintarla en un cuadrito. Con 48 en
pantalla, ~15 MB por abrir el modal.
Ahora pasan por el **optimizador de imágenes de Next**, que redimensiona con `sharp` —ya
estaba instalado, lo trae Next— y devuelve WebP. **Medido: 319.957 → 10.838 bytes (29×
menos)**, y 9 ms cuando ya está cacheada. Hizo falta declarar el host de Supabase en
`images.remotePatterns` de `next.config.ts`; sin eso el optimizador rechaza las URLs
remotas.
El helper es `src/lib/contenido/miniatura.ts`. Construye la URL de `/_next/image` a mano en
vez de usar el componente `next/image` a propósito: el componente exige `fill` o medidas y
cambiaría la maqueta de las rejillas que ya funcionan.
*Recordatorio: las transformaciones de Supabase (`/render/image/`) dan **403**, son de plan
pago. No volver a intentarlo.*

**2. Las ideas garantizan entre 4 y 6 slides, siempre.**
Nico: *"mínimo 4 slides, máximo 6, nunca menos de 4, y que entregue bien la idea"*.

El cambio de fondo no es el número, es **dónde se impone la regla**. Antes el esquema zod
exigía `.min(3)` y `validarSlides()` devolvía vacío si la validación tumbaba slides: o sea
que una desviación pequeña del modelo tiraba **toda** la respuesta, o abría una pieza de
relleno. Eso es lo que hacía sentir que la idea "no venía bien entregada".

Ahora:
- **El esquema es tolerante al recibir** (`slides` 1-8, `ideas` 1-8): nunca se pierde una
  respuesta entera por un slide de más o de menos.
- **`completarSlides()` garantiza al entregar**: siempre 4-6, siempre portada primero y
  `cierre-cta` último, y si faltan intermedios los completa rotando plantillas de cuerpo.
  Descarta plantillas inventadas y campos vacíos o que la plantilla no declara.
- El prompt además lo pide explícito y exige que **cada slide intermedio diga algo
  distinto y concreto**, sin textos de ejemplo ni marcadores.

**Probado con cinco casos límite** (2 slides, plantillas inventadas, 8 slides, sin portada
ni cierre, campos vacíos): los cinco salen con 4-6 slides y estructura correcta.

*Nota para quien pruebe módulos `server-only` desde un script: hay que crear un stub de
`server-only` en `node_modules`. Se usó y se borró; no queda en el repo.*

### Corrección urgente 2026-08-25 · las miniaturas salieron en blanco

Al pasar las fotos por el optimizador se pidió `q=70` y **todas las miniaturas quedaron en
blanco con el icono de imagen rota**. Culpa mía, y la causa es una trampa de Next 16 que
conviene tener escrita:

> **`/_next/image` solo acepta las calidades declaradas en `images.qualities`, y la lista
> por defecto es SOLO `[75]`.** Cualquier otra devuelve
> `400 — "q" parameter (quality) of 70 is not allowed`. El navegador no dice nada: pinta el
> icono de imagen rota.

Lo mismo vale para el ancho: un `w=` que no esté en `imageSizes` ni en `deviceSizes` también
da 400.

Arreglado fijando la calidad en 75 (la única declarada) y declarándola explícitamente en
`next.config.ts` con el aviso al lado. `miniatura()` ya **no acepta calidad como parámetro**
para que nadie vuelva a pasarle una no declarada.

**Verificados los cuatro anchos que usa el código**, no solo uno: `w=96` → 2.485 B,
`w=160` → 5.606 B, `w=240` → 10.838 B, `w=320` → 17.202 B. Los tres sitios que llaman a
`miniatura()` usan anchos de esa lista.

**Lección de método:** probé un solo tamaño y una sola calidad antes de subir, y di por
bueno el resto. Con parámetros que el servidor valida contra una lista blanca hay que
probar **todas** las combinaciones que el código usa de verdad.
