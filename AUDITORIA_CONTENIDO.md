# Auditoría del Estudio de Contenido — tablero de trabajo

Auditoría completa del módulo tras construirlo en tres tandas. **Criticar cada cosa hecha y
arreglarla.** No es una revisión de cortesía: lo que se busca es lo que está mal.

---

## CONTRATO — leer entero antes de tocar nada

El límite de gasto de esta cuenta **se agota sin avisar** y ya ha matado a cuatro agentes a
mitad de tarea. Este tablero existe para que, al reiniciar, sepas exactamente dónde ibas.

1. **Tu primera acción es leer este archivo entero.**
2. Busca tu bloque (A, B o C). Dentro, ve a la primera tarea cuyo `Estado:` no sea `hecho`.
3. **Antes de empezar una tarea**, escribe en su `Estado:` la palabra `en curso` y qué vas a
   hacer. Commitea ese cambio solo. Cuesta diez segundos y es lo que te salva si mueres.
4. **Una tarea = un commit.** Verifica (`npx tsc --noEmit`) antes de cada uno.
5. Al terminar una tarea: `Estado: hecho` + una línea de qué encontraste (o `sin hallazgos`)
   + tus arreglos en la sección **Hallazgos**. Commitea.
6. Si mueres a mitad: el `Estado: en curso` con tu nota le dice al siguiente por dónde ibas.
7. **No hagas push.** Solo commits.

Mensajes de commit en español, en indicativo, describiendo el efecto. Termina cada uno con:
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TiYzFSjqmPMebgT5ehSo4o
```

## Contexto imprescindible
- `PLAN_CONTENIDO.md` tiene la historia completa, las decisiones y las trampas ya conocidas.
  **Léelo**: te ahorra repetir errores que ya costaron horas.
- Trampas de Satori ya documentadas: revienta si `transform`/`backgroundImage` existen con
  valor `undefined` (hay que omitir la propiedad); no apila hijos de un `Fragment` dentro de
  un `flex-column`; todo `div` con más de un hijo necesita `display:'flex'`.
- **Regla dura aprendida hoy:** ninguna decisión de maqueta puede depender de un número de
  píxeles — el preview dibuja a 0.35 y cualquier umbral absoluto miente. Solo proporciones.
- ⚠️ Nunca insertar en `public.fotos` ni escribir en el bucket `fotos-instagram`.
- Verificación estándar:
  ```bash
  npx tsc --noEmit
  CONTENIDO_FOTO_PRUEBA="https://yvytzquewjsjsmgiwmaa.supabase.co/storage/v1/object/public/fotos-instagram/camino-sacro/2026/06/DDC_3232.jpg" npx tsx scripts/contenido_smoke.tsx
  npm run build
  ```

---

## BLOQUE A — Render, plantillas y marca
Archivos: `src/lib/contenido/plantillas/**`, `graficos/**`, `marca.ts`, `ajustes.ts`,
`formatos.ts`, `render.tsx`, `fuentes.ts`, `fotoCache.ts`.

- **A1. Coherencia visual entre las 14 plantillas.** ¿Mismos márgenes, mismos tamaños para
  el mismo papel, la cabecera y el pie siempre en el mismo sitio? Renderiza una hoja de
  contactos y compáralas de verdad.
  `Estado: hecho` — margen, Cabecera y Pie sí son consistentes en las 14 (verificado por
  grep, no solo a ojo). Tres bugs reales encontrados y arreglados; detalle en Hallazgos.
- **A2. Texto largo en todas las plantillas.** Prueba cada campo con el texto más largo que
  permite su `maxLargo`. Busca desbordes y solapamientos.
  `Estado: pendiente — el agente murió justo al lanzar el lote de renders. Empezar de cero esta tarea.`
  sin foto) con todos los campos al maxLargo exacto, en hojas de contacto a escala 1.
- **A3. Contraste medido, no opinado.** Todo texto sobre todo fondo (claro, oscuro, foto
  clara, foto oscura). Mínimo 4.5:1. Ya se corrigió el oro sobre crema (daba 1.55:1);
  busca los que queden.
  `Estado: pendiente`
- **A4. Los cinco formatos.** Cada plantilla en cada formato que declara, con y sin foto.
  Zona segura respetada en 9:16 y reel.
  `Estado: pendiente`
- **A5. Las perillas de ajuste en sus extremos.** `escalaTexto` a 0.75 y a 1.5, `altoBloque`
  a 0 y a 0.75, `zoomFoto` a 1.6, `velo` a 0 y a 0.85. Que nada se rompa ni se salga.
  `Estado: pendiente`

## BLOQUE B — Editor, bandeja y experiencia de uso
Archivos: `src/app/(dashboard)/contenido/**`.

- **B1. Estados de error y de vacío.** ¿Qué se ve si falla el guardado, si la foto ya no
  existe, si la pieza no tiene slides, si el catálogo no responde? Que nunca haya una
  pantalla muda ni un error críptico.
  `Estado: hecho — pantalla de error propia para todo /contenido, not-found de pieza, y estados de error/vacío en las acciones. Rescatado tras caerse el agente por el límite; el recorrido a ojo quedó sin hacer.`
  Exportar.tsx, PiezasGrid.tsx y los page.tsx del bloque B en busca de catch mudos, estados
  vacíos sin mensaje y pantallas en blanco.`
- **B2. Carreras del autoguardado.** Editar y cambiar de slide, editar y exportar, editar y
  salir, dos pestañas abiertas. Busca pérdidas de datos.
  `Estado: pendiente`
- **B3. Coherencia preview ↔ exportación.** Ya se arreglaron dos divergencias (decisiones
  por píxeles, y la caché envenenada al exportar). Busca las que queden: cualquier cosa que
  el preview enseñe distinto del archivo final.
  `Estado: hecho — sin divergencias nuevas; las dos que había ya estaban arregladas.`
- **B4. Recorrido completo de uso.** Crear desde cada uno de los 6 arranques, editar, poner
  foto, ajustar, exportar. Anota cada fricción: clics de más, cosas que no se entienden,
  esperas sin aviso.
  `Estado: pendiente`
- **B5. Accesibilidad y teclado.** Foco visible, Escape cierra el modal, botones con nombre
  legible, nada que solo se pueda hacer con el ratón.
  `Estado: pendiente`

## BLOQUE C — Datos, cola, puente y guiones
Archivos: `src/lib/contenido/{cola,ideas,copy,claude,vozLint,datos,fotos,export,tipos,encargo,hashSlide,miniatura}.ts`,
`scripts/**`, `supabase/migrations/0023–0027`.

- **C1. Fallos silenciosos.** Busca todo `catch` que se trague un error, todo `?? []` que
  convierta un fallo en "no hay datos", toda consulta cuyo error no se muestre. Un módulo
  que miente en silencio es peor que uno que se cae.
  `Estado: hecho — el más grave era fotos.ts: buscarFotos()/listarRutasDeFotos() convertían
  cualquier fallo de consulta en "0 resultados", con try/catch ya escritos y esperando en
  fotoActions.ts que nunca se disparaban porque nunca llegaba una excepción. Arreglado, más
  ideas.ts (5 funciones), datos.ts, cola.ts y worker_contenido.ts. Detalle en Hallazgos.`
- **C2. La cola y el puente.** ¿Qué pasa si el worker muere a mitad, si hay dos trabajos a
  la vez, si el trabajo tarda más de 5 minutos, si el JSON de vuelta viene mal? Verifica el
  rescate de trabajos colgados.
  `Estado: pendiente — el agente alcanzó a insertar dos trabajos colgados (ids 7 y 8) para probar el rescate y murió antes de comprobarlo. Revisar que la cola quedó limpia antes de seguir.`
  'tomado' con tomado_at viejo (contenido_rescatar_trabajos), JSON de vuelta inválido, y
  revisando el log del puente en ~/Library/Logs/caminosacro-puente.log.`
- **C3. `vozLint` contra la estrategia.** ¿Cubre TODAS las reglas duras del bloque `TONO` de
  `estrategia.ts`? Lista las que falten y añádelas. Prueba con copys reales.
  `Estado: hecho — faltaban cuatro reglas duras, añadidas y probadas.`
- **C4. Integridad de datos.** Piezas con `ruta_id` de rutas desactivadas, `export_paths`
  apuntando a archivos que ya no existen, fotos en `contenido_fotos` sin archivo detrás,
  trabajos viejos acumulándose. Limpia lo que sobre.
  `Estado: pendiente`
- **C5. Los guiones sembradores.** ¿Siguen siendo idempotentes? Córrelos dos veces y
  comprueba que no duplican ni ensucian.
  `Estado: pendiente`

---

## Hallazgos

### B3 · Coherencia preview ↔ exportación — sin hallazgos nuevos

Comprobado renderizando **8 combinaciones** de plantilla × formato × con y sin foto, cada
una a escala 0.35 (preview) y 1 (exportación), con el texto al límite de su `maxLargo` —
que es donde el corte de línea se vuelve frágil.

**Aviso sobre la medición, porque casi me engaña:** comparar píxeles da un 5-9% de
diferencia en todos los casos, y parece grave. No lo es: al ampliar el preview de 378 a
1080 el texto se difumina y *cada* píxel de letra cambia. Mirando las imágenes lado a lado,
los cortes de línea, las posiciones y la maqueta son **idénticos**. La métrica de píxeles no
sirve para esto; hay que mirar.

Las dos divergencias reales que había ya estaban arregladas antes de esta auditoría: las
decisiones de maqueta por píxeles absolutos y la caché envenenada al exportar.

**Diferencia que queda y es por diseño:** la miniatura de la bandeja se dibuja desde lo
GUARDADO, mientras el preview del editor dibuja lo que hay en pantalla. Con cambios sin
guardar, la bandeja enseña la versión anterior. Es correcto —la bandeja muestra el estado
persistido— pero conviene saberlo.

### C3 · `vozLint` contra el bloque TONO — cuatro reglas duras faltaban

El revisor cubría markdown, listas, frases prohibidas, voseo, usted, número de emojis,
exclamaciones, hashtags y largo. Comparado línea por línea contra `TONO`, **faltaban**:

1. **Describir la imagen.** `TONO` lo prohíbe expresamente: *"nada de 'en esta foto', 'esta
   vista', 'este paisaje', 'mira cómo', el clima, la hora, la persona, lo que hace"*. **No se
   comprobaba en absoluto.** Es la más importante de las cuatro y la razón es de negocio: un
   caption que narra la foto se queda sin nada que decir en cuanto la foto cambia.
2. **El emoji 🎒**, prohibido por su nombre junto al checklist con viñetas — son las dos
   marcas del post-folleto de la competencia. Se contaban los emojis pero no se miraba cuál.
3. **El emoji va SOLO en el cierre.** Se contaba que hubiera uno, no dónde estaba.
4. **La prueba social solo admite "+200".** `TONO`: *"no inventes nombres propios ni cifras
   distintas a +200"*. Un "+500 peregrinos" pasaba sin más.

Añadidas y probadas con cinco casos: los cuatro incumplimientos se cazan y un copy correcto
pasa limpio.

**Lo que `vozLint` NO puede comprobar, y conviene tenerlo escrito** para no confiarse: que
el post venda en prosa, que sea específico y no genérico, que no siga la plantilla rígida de
marketing, que no invente precios o fechas, y que la urgencia sea real. Eso es juicio, no
forma, y se queda del lado del modelo y de quien revisa.


### 🔴 EL BUG MÁS CARO DE TODOS — el puente reintentaba en bucle infinito (2026-08-26)

Encontrado revisando la cola después de que los tres auditores murieran por el límite
**semanal**. En `public.contenido_trabajos` había un encargo con **4.647 intentos**.

**El worker llamó a Claude en bucle toda la noche.** Con toda probabilidad es lo que se
llevó por delante el límite de gasto de la semana — no los agentes.

**La causa, y el bug es mío.** El worker devolvía el trabajo a `'pendiente'` en cada fallo,
con este comentario al lado:

> *"a los 3 intentos la función de rescate lo marca como error definitivo"*

**Falso.** `contenido_rescatar_trabajos()` solo rescata trabajos atascados en `'tomado'` más
de 5 minutos. Un trabajo devuelto a `'pendiente'` lo recoge el propio worker a los 3
segundos, así que **nunca llegaba a estar `'tomado'` el tiempo suficiente** y el tope no se
aplicaba jamás. Un fallo reproducible = reintentos infinitos a ~1 cada 3 segundos.

Peor todavía: el error que lo hacía fallar era el propio tope de gasto. O sea que
reintentaba precisamente aquello que no se arregla insistiendo, alimentando el problema.

**Arreglado, en tres capas:**
1. **El tope lo aplica el worker**, no el rescate: a los 3 intentos marca `error` y para.
2. **Errores definitivos se cortan a la primera**: tope de gasto, sesión caducada, esquema
   inválido. Reintentarlos es justo lo que quema el límite.
3. **Espera creciente** entre reintentos (3s, 9s, 27s) en vez de volver a la carga de
   inmediato.

Cola limpiada y puente reiniciado con el arreglo.

**Lección de método:** un comentario que afirma una garantía ("a los 3 intentos se corta")
sin que el código de al lado la implemente es peor que no tener comentario — me lo creí al
releerlo. **La garantía y quien la aplica tienen que estar en el mismo sitio.**


*(Cada agente añade aquí lo que encuentra: qué estaba mal, cómo se destapó, qué se arregló y
qué se decidió dejar y por qué. Si una tarea no dio hallazgos, dilo — un informe donde todo
está bien es sospechoso.)*

### A1 — 2026-08-25

Método: hoja de contactos (`sharp`) de las 14 plantillas en 4x5, con y sin foto, abierta con
Read; luego muestreo de píxeles con Python en vez de fiarme de la impresión visual del
contacto reducido (dos veces creí ver una diferencia de tono a ojo entre plantillas y las dos
veces el muestreo demostró que eran el mismo color — la "diferencia" era un efecto óptico del
texto/cajas alrededor, no del velo).

**Margen, Cabecera y Pie sí son consistentes en las 14** — confirmado por grep, no solo a
ojo: las 14 usan `u(MEDIDAS.margen, w)` para el margen y comparten `<Cabecera>`/`<Pie>` de
`_lockups.tsx`. `cierre-cta` no lleva `<Cabecera>` (usa solo la Concha + "Siguiente paso") a
propósito: es el slide de cierre, no repite el lockup completo. Los fondos "sin foto" se
dividen a propósito entre bosque oscuro (8 plantillas) y claro (6): las que llevan cajas de
color (`comparativa-precio`, `comparativa-dos`, `mito-realidad`) van sobre BLANCO puro,
imitando la página 2 del PDF de cotización de la que copian la maqueta; las de texto plano
sin cajas (`dato-grande`, `pasos-preparacion`, `tip-numerado`) van sobre CREMA. Decidido
dejarlo así: no es azar, es coherente con su propio precedente (el PDF también pone tarjetas
claras sobre página blanca) y cambiarlo forzaría un blanco/crema uniforme sin necesidad.

**Tres bugs reales, arreglados en la raíz:**
1. **El WhatsApp de Clara estaba duplicado.** `cierreCta.tsx` tenía su propio
   `WHATSAPP_CLARA = "+57 304 663 7964"` en vez de leer `MARCA.whatsapp` de `estrategia.ts`
   (la fuente de verdad vendorizada). Dos copias del mismo dato solo pueden desincronizarse
   — el mismo riesgo que ya vigila el smoke para HASHTAGS/RUTAS/PILARES, pero nadie lo vigilaba
   acá. Ahora importa `MARCA as MARCA_VOZ` de `../estrategia` y usa `.whatsapp` y
   `.asistente` ("Clara"), así que si el número cambia en la fuente de verdad, el cierre lo
   hereda solo.
2. **La perilla "tamaño del texto" no llegaba a los rótulos del gráfico de barras.**
   `graficos/barras.tsx` calculaba su tipografía con `u(25, w)` directo, ignorando
   `escalaTexto`; `etapasRuta.tsx` nunca le pasaba `aj.ut`. Con la perilla al mínimo o al
   máximo, todo el slide de "Etapas de la ruta" cambiaba de tamaño MENOS los nombres de
   etapa y los km. Arreglado: `Barras` acepta `ut` opcional (con `u(·,w)` de respaldo) y
   `etapasRuta.tsx` se lo pasa. Verificado renderizando `escalaTexto` 0.75 y 1.5 uno junto
   al otro.
3. **El degradado de marca "sin foto" quedaba invisible en `testimonio` y `pregunta-grande`.**
   Las dos aplicaban el velo verde plano (0.72) SIEMPRE, incluso sin foto — a diferencia de
   `portada-ruta`/`cierre-cta`/`ficha-bici`, que solo lo aplican `{foto ? ... : null}`. Medido:
   dos esquinas opuestas del degradado `FONDO_SIN_FOTO` daban (27,61,44) y (28,62,45) —
   prácticamente el mismo color, el degradado se leía como bosque sólido. Arreglado
   condicionando el velo a que haya foto; verificado que ahora las esquinas dan (34,71,50) y
   (37,77,53), un contraste real entre ellas.

No se tocó la duplicación de `ROSA_FONDO`/`ROSA_TEXTO`/`VERDE_FONDO`/`VERDE_TEXTO` entre
`mitoRealidad.tsx` y `comparativaDos.tsx` (cuatro constantes hex idénticas, copiadas dos
veces con el mismo comentario "los mismos valores que quotePdf.tsx"): es duplicación real,
pero moverla a un tercer archivo (¿`marca.ts`? ¿un archivo nuevo?) es una decisión de
alcance mayor a esta tarea y ninguna de las dos copias ha derivado todavía. Queda anotado
para quien toque estas dos plantillas otra vez.

### C1 — Fallos silenciosos (Bloque C) — 2026-08-25

Revisé `cola.ts`, `ideas.ts`, `copy.ts`, `claude.ts`, `vozLint.ts`, `datos.ts`, `fotos.ts`,
`tipos.ts`, `encargo.ts`, `hashSlide.ts`, `miniatura.ts`, los scripts de `scripts/**` y las
migraciones 0023–0027. `export.ts` **no existe** con ese nombre — la lógica de exportar vive
en `src/app/(dashboard)/contenido/[id]/exportActions.ts`, que es territorio de Bloque B, así
que no lo toqué; queda como nota para corregir el nombre del archivo en este tablero.

**El hallazgo más grave — `fotos.ts` mentía con la mayor tranquilidad, y es EXACTAMENTE el
patrón del precedente de Instagram.** `buscarFotos()` y `listarRutasDeFotos()` capturaban el
`error` de la consulta y devolvían `{ fotos: [], total: 0 }` / `[]` en silencio. Lo que hace
esto especialmente grave: **`fotoActions.ts` (Bloque B) ya tenía try/catch escrito y listo
para convertir una excepción en un `{error}` legible para la interfaz** — pero el catch nunca
se disparaba porque `fotos.ts` nunca lanzaba nada. Si RLS se rompiera hoy en `contenido_fotos`
o en `fotos`, el buscador del editor mostraría "no se encontraron fotos" con el mismo tono
tranquilo que "está vacío el filtro", y nadie lo notaría hasta que alguien se preguntara por
qué el banco de 177 fotos aparece vacío. Arreglado: las dos funciones ahora lanzan sobre
`error`; los tres llamadores (`listarBanco`/`listarSubidas` en el Server Component de la
página, `buscarFotosAccion`/`rutasDeFotos` en `fotoActions.ts`) ya estaban preparados.

**`ideas.ts`: la honestidad estadística que promete la Etapa 7 dependía de que las 5
consultas de evidencia SIEMPRE tuvieran éxito.** `rendimientoPorPilar`, `aprendizajeVigente`,
`demandaComercial`, `rutasSinPublicar` y `temaDeLaSemana` seguían de largo con `data ?? []`
sin mirar `error`. Una consulta rota se leía igual que "todavía no hay datos" — y
`demandaComercial()` es justo la fuente que el prompt llama "señal fuerte, no depende de
Instagram": si esa consulta fallara, Claude seguiría proponiendo ideas creyendo que no hay
ninguna cotización, sin que nadie avisara. Las cinco ahora lanzan; el único llamador
(`encargarIdeas()` en `ideasActions.ts`) ya envuelve `construirEncargoIdeas()` en try/catch,
así que el cambio es seguro y no rompe la convención de "las Server Actions nunca lanzan".

**`datos.ts`: dos decisiones distintas, y las dos escritas ahora.**
- `listarRutas()` **sí pasa a lanzar**: su único llamador es el Server Component de la
  página del editor (sin try/catch propio, como el resto de esa carga inicial), así que no
  es una Server Action y lanzar es seguro — mejor la pantalla de error de Next que un
  selector de rutas vacío indistinguible de "no hay rutas activas".
- `precioDesde`, `etapasDeRuta`, `datosDeRuta` **NO lanzan**: los llama sin try/catch
  `aplicarRuta()` en `rutaActions.ts`, una Server Action, y el contrato del repo (Nota del
  Contrato de `PLAN_CONTENIDO.md`, punto 7) es que esas nunca deben hacer `throw`. Arreglar
  esto de raíz significa envolver `aplicarRuta()` en try/catch, que es un archivo de Bloque
  B. Dejé logging (`console.error`) en su lugar, y lo mismo en el catch, antes mudo, de
  `refrescarDesdeCatalogo()` (la estrategia de "sirve con datos de ayer" seguía siendo
  correcta; solo le faltaba dejar rastro).

**`cola.ts`: mismo patrón — no puede lanzar porque `copyActions.ts` la llama sin try/catch,
así que se quedó en logging.** `estadoDelWorker()`, `consultarTrabajo()` (dos consultas) y
`marcarConsumido()` ignoraban por completo el `error` de Supabase; ahora lo registran.
**Hueco real que queda para Bloque B**: hoy "el trabajo no existe" y "la consulta para
preguntar por el trabajo falló" devuelven el mismo estado (`desconocido` → "Ese encargo ya
no existe"), y "el computador está apagado" y "no se pudo saber si está encendido" también
se ven idénticos en pantalla. Arreglarlo de raíz toca `EstadoTrabajo`/`EstadoWorker` y sus
consumidores en `ideasActions.ts`/`copyActions.ts`/`BarraCopy.tsx` — fuera de mi bloque.

**`marcarConsumido()` destapó un riesgo de duplicado real, no solo teórico.** Si ese update
falla (nunca se comprobaba el resultado), el trabajo se queda en `'listo'` y una segunda
llamada a `recogerCopy`/`recogerIdeas` con el mismo `trabajoId` —dos pestañas, un reintento
del polling del cliente— vuelve a **insertar el copy o las ideas por segunda vez**, porque
ninguno de los dos hace el insert condicionado a que el trabajo siga en `'listo'`. Dejé
logging y la explicación completa en el comentario de la función; el arreglo de raíz (un
`update ... where estado = 'listo'` que confirme una sola fila afectada, más que los
llamadores revisen esa confirmación) toca Bloque B y queda anotado para quien pueda tocarlo.

**`worker_contenido.ts`: los dos `update()` que cierran un trabajo no comprobaban su propio
resultado.** Si el update a `'listo'` fallaba justo después de resolver con éxito con Claude,
el log decía "listo" pero la fila se quedaba `'tomado'` — `contenido_rescatar_trabajos()` la
habría devuelto a la cola a los 5 minutos y Claude habría vuelto a trabajar en un encargo YA
resuelto, gastando la respuesta (y el tiempo) por nada. Ahora ambos updates comprueban su
`error` y lo registran.

**`sembrar_posts_bicis.ts`: `existente()` ignoraba el error de su propia consulta.** Trataba
"la búsqueda falló" igual que "no existe todavía", que es el camino que dispara un INSERT en
vez de un UPDATE. El script está pensado para correrse más de una vez —es literalmente la
prueba de idempotencia que pide C5— así que un fallo transitorio ahí podía duplicar una
pieza. `sembrar_posts_rutas.ts` ya tenía el patrón correcto (comprueba el error y hace
`continue`); apliqué el mismo criterio: ahora `existente()` lanza y `main()` ya tiene su
propio `.catch()` para detener el sembrado entero en vez de arriesgarse a sembrar de más.

**Revisado y considerado ya correcto, sin cambios:**
- `registrarConsumo()` en `claude.ts` — el `catch` que traga el fallo de registrar tokens
  está documentado y es la decisión correcta: perder el registro de costo molesta, perder
  el copy que el usuario acaba de pedir es mucho peor.
- `vozLint.ts` — es puro (sin I/O), no hay nada que pueda fallar en silencio.
- `tipos.ts` (`leerSlides`) — la función SÍ devuelve `{slides, error}` correctamente. El
  problema está en que **sus 6 llamadores** (todos en Bloque B / `src/app/api/contenido/`,
  ninguno en mi lista de archivos) destructuran solo `{ slides }` y tiran el `error` al
  piso. Si un slide guardado no valida contra el esquema zod, el editor lo trata como "0
  slides" sin decir por qué. No lo pude arreglar (fuera de mi bloque); queda anotado para
  quien tenga esos archivos.
- `sembrar_posts_rutas.ts` y `subir_fotos_bicis.ts` — ya comprobaban todos sus errores
  correctamente antes de esta revisión.
- Las políticas RLS de las tablas `contenido_*`, `aprendizajes`, `posts_log`,
  `post_metricas`, `blog_calendario` (schema `public`) y `routes`/`route_stages`/`pricing`/
  `quotes`/`bikes`/`bike_prices` (schema `comercial`) están todas presentes para
  `authenticated` — comprobado con `pg_policies` contra la base real. El precedente de
  Instagram (RLS activo sin política) **no está reproducido hoy**; lo que arreglé es que el
  código ya no se comportaría igual de mudo si algún día sí lo estuviera.
