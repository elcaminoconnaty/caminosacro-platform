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

- [ ] **Etapa 2 — Motor de render, base de datos y endpoint**
      Archivos: migraciones `0023_contenido_estudio.sql` y `0024_contenido_lectura_instagram.sql`
      (aplicar por MCP de Supabase, proyecto `yvytzquewjsjsmgiwmaa`),
      `src/lib/contenido/plantillas/{registry.ts,portadaRuta.tsx,cierreCta.tsx}`,
      `src/lib/contenido/render.ts`,
      `src/app/api/contenido/piezas/[id]/[slide]/route.ts`, `src/lib/storage/paths.ts`.
      Terminado: (a) `select count(*) from public.contenido_piezas` responde;
      (b) una fila semilla sale como PNG 1080×1350 por `GET /api/contenido/piezas/<id>/0`;
      (c) el smoke renderiza las 2 plantillas en los 5 formatos;
      (d) **`select count(*) from aprendizajes` como `authenticated` devuelve 5, no 0.**

- [ ] **Etapa 3 — Editor de una pieza**
      Archivos: `src/app/(dashboard)/contenido/[id]/{page,actions,Editor,Lienzo,PanelCampos,TiraSlides}.tsx`.
      Decisiones fijas: autoguardado debounced 600 ms con `useTransition`; el preview se refresca
      cambiando `?v=<hash del slide>`; `Cache-Control: immutable` para que navegar entre slides sea
      gratis; el formulario se **genera** desde `registry[plantilla].campos`, jamás a mano.
      Terminado: cambiar un texto actualiza la imagen en <1.5 s; F5 conserva lo escrito;
      añadir/duplicar/borrar/reordenar slides funciona.

- [ ] **Etapa 4 — Catálogo completo de plantillas y gráficos**
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

- [ ] **Etapa 5 — Fotos, de las cuatro fuentes**
      Archivos: `src/app/(dashboard)/contenido/[id]/SelectorFoto.tsx`, `src/lib/contenido/fotos.ts`.
      Decisión clave: la subida va **navegador → Supabase Storage** con `createPublicClient()` de
      `src/lib/supabase/client.ts`, no por Server Action (el `bodySizeLimit` es 15 MB y una carpeta
      de fotos lo revienta). Carpetas locales con `<input type="file" webkitdirectory multiple>`.
      **Sin carga masiva previa: la foto se sube en el momento de armar el post.**
      Terminado: las 4 fuentes funcionan (banco `fotos-instagram` de 177 · subida suelta · carpeta ·
      sin foto) **y `select count(*) from public.fotos` sigue en 177 después de subir.**

- [ ] **Etapa 6 — Exportar**  ← *aquí termina la Fase 1: el módulo ya cumple el encargo*
      Archivos: `src/app/(dashboard)/contenido/[id]/Exportar.tsx`, `src/lib/contenido/export.ts`,
      `src/app/(dashboard)/contenido/{actions.ts,PiezasGrid.tsx}`.
      Decisión clave: el navegador convierte PNG→JPEG en `<canvas>` (2.6 MB → ~250 KB) y sube el
      JPEG a `contenido-piezas`; el servidor solo registra `export_paths`. Sin `sharp`, sin ZIP de
      servidor. El JPEG es además lo único que acepta la Graph API en la fase 2.
      Terminado: exportar un carrusel de 4 slides descarga 4 JPG de 1080×1350 <500 KB y quedan en
      el bucket; la lista de piezas muestra miniaturas.

- [ ] **Etapa 7 — Copy e ideas con Claude**
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
