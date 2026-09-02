# B7 — Diseño y experiencia

**Cubre:** Todo el frontend del CRM: `globals.css`, `components/shell/**`, las tarjetas del expediente, y los módulos pequeños `finanzas`, `calendario`, `tokens`, `clara`, `isabel`

**Por qué importa:** Lo que Nico y Naty sufren o disfrutan cada día. Se juzga con CRITERIOS.md, no a gusto.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B7.1 El sistema visual.** Tokens de color y tipografía: ¿se usan o hay valores sueltos? Mide el contraste de los pares que de verdad se usan; no lo opines.
  `Estado: hecho` — **la disciplina de marca es excelente**: en todo el frontend del CRM hay **un solo
  archivo** con colores en hexadecimal, todo lo demás sale de los tokens. Y los contrastes calculados salen
  bien… **menos uno, que se usa 36 veces**: `text-dorado-oscuro` da **2,13** sobre tarjeta blanca donde hace
  falta 4,5 (o 3 si es grande). Y es el color de los KPI de dinero y de los avisos ámbar.
- **B7.2 Los tres estados que siempre faltan.** Vacío, cargando y error, pantalla por pantalla. Lista las que se quedan mudas.
  `Estado: hecho` — la mayoría de pantallas tiene los tres estados, y `/seguimiento` los tiene **muy** bien
  (distingue «sin cotizaciones» de «ninguna coincide con los filtros»). La que se queda muda es **`/finanzas`**,
  y es la peor de la lista: descarta el error de sus dos consultas y, si fallan, pinta **0 € cobrado, 0 €
  pagado, 0 € de margen** como si fuera la verdad.
- **B7.3 Desde el celular.** El expediente, las tablas anchas y el wizard en 390 px. Es donde Nico atiende cuando no está en el escritorio.
  `Estado: hecho` — **en el celular no hay navegación.** La barra lateral es `hidden md:flex`, o sea que
  desaparece por debajo de 768 px, y **no hay nada que la sustituya**: ni menú, ni cajón, ni pestañas. El
  único control de la barra superior es «Salir». En un teléfono se puede leer la pantalla en la que uno
  esté y salir; para ir a cualquier otra hay que teclear la URL. Las tablas sí desbordan con scroll, que
  es lo correcto.
- **B7.4 El expediente de un vistazo.** Abre uno: ¿se sabe en diez segundos qué falta por hacer? Hoy son doce tarjetas apiladas sin jerarquía. Propón el orden y el resumen que faltan.
  `Estado: pendiente`
- **B7.5 Los módulos pequeños.** `finanzas` (134 líneas), `calendario`, `tokens`, `clara`, `isabel` (un placeholder). Cuáles aportan, cuáles estorban y cuál merece crecer.
  `Estado: pendiente`
- **B7.6 Clics por tarea.** Cuenta los de las tres tareas de todos los días: cotizar, cobrar, mandar documentación. Di dónde sobran.
  `Estado: pendiente`
- **B7.7 Accesibilidad de lo básico.** Foco visible, etiquetas en los campos, objetivos tocables, y que no se dependa solo del color para decir algo.
  `Estado: pendiente`

---

## Hallazgos

### [MEDIO] El color de los números de dinero no se lee: 2,13 donde hace falta 4,5 — `globals.css:8` (`--color-dorado-oscuro`), 36 usos

Calculado, no opinado. `--color-dorado-oscuro` es `#e0a840`, y estos son los contrastes WCAG
en los fondos donde de verdad se pinta:

| uso real | contraste | mínimo | |
|---|---|---|---|
| **KPI de 24 px** («Utilidad proyectada», «Margen real») sobre tarjeta blanca | **2,13** | 3,0 (texto grande) | **falla** |
| **Aviso de 10 px** del suplemento de temporada, sobre blanco | **2,13** | 4,5 | **falla** |
| El mismo aviso sobre fondo crema | **1,96** | 4,5 | **falla** |
| Chip «Web» (`bg-dorado-oscuro/15`) | **1,92** | 4,5 | **falla** |
| Chip de contrato (`bg-dorado/30`) | **1,83** | 4,5 | **falla** |

Son **36 usos de `text-dorado-oscuro`** en el CRM, y no están en decoración: son
- **las cifras destacadas de las cuatro pantallas de números** —`seguimiento/page.tsx:128`,
  `finanzas/page.tsx:122`, `clara/page.tsx:157`, `tokens/page.tsx:216`—, que usan el mismo
  componente `Card` con `accent`;
- **los avisos del suplemento de temporada** en el asistente (`Wizard.tsx:568`) y en el editor
  (`QuoteEditor.tsx:382,412,428`), que además van a 10 px;
- los chips de origen «Web» en la lista y en el expediente.

O sea que el color que la interfaz usa para decir «mira esto» es justamente el que menos se
ve. El dorado funciona **muy bien** donde nació —sobre el verde bosque de la cabecera da
**7,38** y pasa AA de sobra— y falla al mudarse a fondo claro, que es un error clásico y
fácil de no notar porque en una pantalla buena y con buena luz se lee.

**Propuesta:** no tocar el token de marca; añadir uno **para texto sobre fondo claro**. Un
`--color-dorado-texto` alrededor de `#8a6410` da ~5,3 sobre blanco y ~5,0 sobre crema, sigue
leyéndose como dorado y pasa AA. Cambiar las 36 clases es un buscar-y-reemplazar. El dorado
actual se queda para fondos oscuros, rellenos y bordes, donde ya cumple.

### [MEDIO] En el celular no hay forma de navegar: la barra lateral desaparece y no la sustituye nada — `components/shell/Sidebar.tsx:32` · `(dashboard)/layout.tsx`

El shell del panel tiene **dos** componentes y nada más:

```tsx
<div className="min-h-screen flex bg-crema text-fg">
  <Sidebar />                    {/* className="hidden md:flex w-60 …" */}
  <div className="flex-1 flex flex-col min-w-0">
    <Topbar email={…} />         {/* TRM · correo · botón Salir */}
    <main …>{children}</main>
  </div>
</div>
```

`Sidebar` es **`hidden md:flex`**: por debajo de 768 px no se dibuja. Y `Topbar` no tiene
navegación — contiene la TRM del día, el correo del usuario y un botón **«Salir»**. Buscado
en todo el shell y en el layout: **no hay hamburguesa, ni cajón, ni pestañas, ni un solo
`md:hidden` de navegación**.

O sea que en un teléfono de 390 px, dentro del CRM:

- se ve la pantalla en la que uno haya entrado;
- el único control de navegación disponible es **cerrar sesión**;
- para pasar de `/seguimiento` a `/catalogo`, a `/finanzas` o a crear una cotización hay que
  **escribir la URL a mano**.

Y CRITERIOS dice que el celular es donde Nico atiende cuando no está en el escritorio. B2 ya
había rozado esto al anotar que las once columnas de la tabla obligan a arrastrar de lado;
el problema real es anterior: **no se puede llegar a la tabla**.

Va como MEDIO por la letra del TABLERO —no se pierde plata ni lo ve un cliente— pero **por
impacto diario es lo más grande de B7**: no es que una pantalla se vea apretada, es que el
producto no se puede usar en el dispositivo donde se atiende.

**Propuesta:** la más barata que resuelve el 90 % es una fila de enlaces en la `Topbar`,
visible solo en móvil (`md:hidden`), con las cuatro pantallas de todos los días —Seguimiento,
Nueva cotización, Catálogo, Finanzas—. Son unas quince líneas y no toca el escritorio. Un
cajón con hamburguesa es mejor y cuesta una tarde; la fila de enlaces se puede tener hoy.

### [MEDIO] La pantalla de finanzas descarta sus errores y enseña ceros como si fueran datos — `finanzas/page.tsx:18-21`

Es la pantalla que responde «¿cuánto entró y cuánto salió?», y sus dos únicas consultas se
leen así:

```ts
const [{ data: cpRaw }, { data: ppRaw }] = await Promise.all([
  supabase.from("client_payments").select("amount,currency,amount_eur,account"),
  supabase.from("provider_payments").select("amount_eur,account"),
]);
const clientPays = (cpRaw ?? []) as ClientPay[];
const providerPays = (ppRaw ?? []) as ProviderPay[];
```

Ni una de las dos desestructura `error`. Si una falla —sesión caducada, RLS, la base sin
responder— `?? []` la convierte en una lista vacía y la página **se pinta igual**, sin un
solo aviso.

Y hay dos formas de que mienta, la segunda peor que la primera:

1. **Si fallan las dos**: «Cobrado 0 €», «Pagado a Pilgrim 0 €», «Margen de caja 0 €». Es
   evidentemente falso para quien sabe que entró dinero, así que se nota.
2. **Si falla solo la de proveedores**: `totalPagadoEur = 0` y el **margen de caja pasa a ser
   igual a todo lo cobrado**. Un número grande, redondo y creíble, que nadie tiene motivo
   para dudar. Ese es el modo de fallo caro.

Es exactamente el patrón que B1 ya encontró en el asistente —«un catálogo que no responde se
veía igual que un catálogo vacío», y allí **sí se arregló**— pero aquí sobre la pantalla de
dinero. Y se junta con lo que B2 dejó dicho: que `finanzas` es una de las tres copias de la
regla de «Cobrado», y que los pagos a Pilgrim casi no se registran, así que esa pantalla ya
parte de una base frágil.

**Propuesta:** la misma que se aplicó en `cotizaciones/nueva/page.tsx`: recoger los dos
`error` y, si alguno falla, un aviso rojo arriba diciendo qué no se pudo leer — y **no pintar
los KPI**, porque un cero es una afirmación. Es el arreglo más barato de todo B7 y protege el
número más caro.

### [MENOR] Los estados (error, aviso, neutro) no están en el sistema: son clases sueltas de Tailwind — todo el frontend del CRM

La paleta **de marca** está perfectamente tokenizada: bosque, dorado, crema, taupe, tinta,
más los semánticos `bg`, `fg`, `muted`, `border`, `primary`, `accent`, y las dos familias
tipográficas. Y se respeta: en todo `src/app/(dashboard)` y `src/components` hay **un solo
archivo** con colores hexadecimales sueltos (dos valores). Eso es mejor disciplina de la
habitual.

Lo que **no** está en el sistema son los estados, que se pintan con la paleta cruda de
Tailwind repartida por los archivos:

| | apariciones |
|---|---|
| `text-red-700` / `bg-red-50` / `border-red-200` | 31 / 31 / 29 |
| `text-amber-700` / `bg-amber-50` / `border-amber-300` | 27 / 11 / 6 |
| `text-red-800`, `text-red-600` | 15, 14 |
| `bg-zinc-100` | 7 |

Hay **tres rojos distintos** para texto de error (`red-600`, `red-700`, `red-800`) según el
archivo, y el ámbar convive con el `dorado-oscuro` del hallazgo anterior para decir lo mismo:
«ojo con esto». No hay un sitio donde esté escrito qué significa cada uno ni cómo se ve un
aviso, así que cada pantalla nueva lo decide otra vez —y por eso B2 encontró avisos ámbar que
no se parecen entre sí.

No rompe nada y por eso es MENOR. **Propuesta:** cuatro tokens más —`--color-error`,
`--color-error-bg`, `--color-aviso`, `--color-aviso-bg`— elegidos con el contraste ya
calculado, y sustituir. Es el mismo trabajo que ya se hizo bien con la marca.

### Lo que sí está bien: lo demás del móvil está contemplado

Salvo la navegación, el trabajo responsive está hecho y no es de adorno:

- **Las tablas anchas desbordan con scroll propio, no rompen la página**: `overflow-x-auto`
  en la tabla de Seguimiento (`QuotesTable.tsx:210`), en la de bicis, en la de noches del
  Documento de Viaje y en los dos paneles de itinerario. El `min-w-0` del contenedor del
  layout está puesto, que es justo lo que evita que un hijo ancho estire toda la página —un
  detalle que casi siempre falta.
- **Hay 80 usos de breakpoints** repartidos (44 `md:`, 19 `sm:`, 15 `lg:`, 2 `xl:`), o sea que
  las pantallas se pensaron en más de un tamaño, no se dejaron al azar.
- **Los campos que no deben encogerse tienen ancho mínimo declarado** (`min-w-[220px]` en el
  buscador, `min-w-[10rem]`/`[14rem]` en los selectores del contrato y del correo a Pilgrim),
  así que en móvil se apilan en vez de aplastarse.
- **El `main` reduce su margen en pantallas pequeñas** (`px-6 lg:px-10`), que es el detalle que
  hace que en 390 px no se pierda un tercio del ancho en aire.
- **Y el proyecto ya probó de verdad en un teléfono**: `next.config.ts` tiene
  `allowedDevOrigins` con las redes locales y el comentario cuenta por qué —«imprescindible
  para probar la firma en un celular de verdad»—, y el `bodySizeLimit` de 15 MB salió de que
  «la foto de pasaporte de un celular pesa 3-8 MB». La página pública de firma, que es la que
  usa el cliente, sí está pensada para móvil.

### Lo que sí está bien: los tres estados, pantalla por pantalla

Recorridas las 15 pantallas del panel. El resumen honesto es que **solo una se queda muda**, y
que la principal es un ejemplo de cómo se hace:

- **`/seguimiento` tiene los tres, y el vacío está partido en dos**: «Sin cotizaciones aún» y
  «Ninguna cotización coincide con los filtros» (`QuotesTable.tsx:277-281`). Esa distinción es
  la que casi nadie hace y es justo la que evita que alguien crea que perdió los datos cuando
  lo que tiene es un filtro puesto. Además el error de carga tiene mensaje **específico** para
  el caso del schema no expuesto (`page.tsx:101-109`), que es el fallo real que se sufrió.
- **`/catalogo`, `/hoteles`, `/clara`, `/tokens` y `/calendario`** recogen y muestran el error
  de sus consultas.
- **`cotizaciones/nueva`** lo tiene desde el arreglo de B1: distingue «el catálogo está
  vacío» de «el catálogo falló», y avisa expresamente de que no se teclee un precio a mano
  dando por hecho que la tarifa no existe.
- **El estado «cargando» está donde tarda**: el botón de crear se deshabilita y cambia a
  «Creando…» (`Wizard.tsx:710-713`), las filas ocupadas van en opacidad
  (`QuotesTable.tsx:229`), y el buscador de cliente por teléfono tiene sus tres estados
  («Buscando…», «✓ Cliente existente», «Cliente nuevo»).
- **`/cotizaciones` no necesita los tres estados**: son 24 líneas sin datos, una portada que
  manda a `/seguimiento` y explica por qué («el listado completo vive en Seguimiento»). Está
  bien resuelta, no es un hueco.
- **`/isabel` es un placeholder declarado**, no una pantalla a medias: dice lo que es.

### Lo que sí está bien: los contrastes de todo lo demás

Calculados con la fórmula WCAG sobre los pares que de verdad aparecen en pantalla:

| par | contraste | |
|---|---|---|
| tinta sobre tarjeta blanca (texto normal) | **15,17** | AA holgado |
| tinta sobre crema | **13,93** | AA |
| blanco sobre bosque (botones primarios) | **12,48** | AA |
| bosque sobre crema (títulos) | **11,46** | AA |
| blanco sobre bosque-medio (hover) | **7,95** | AA |
| dorado sobre bosque (cabecera de marca) | **7,38** | AA |
| muted sobre tarjeta blanca (texto secundario) | **5,98** | AA |
| muted sobre crema | **5,49** | AA |

**El texto secundario pasa AA con margen**, que es donde más veces falla un diseño con esta
estética: `--color-muted: #6b6258` está bien elegido, no es el gris claro de costumbre.

- **Los tokens son de verdad, no decorativos**: los siete de marca se declaran una vez y los
  semánticos se derivan de ellos (`--color-bg: var(--color-crema)`, `--color-border:
  var(--color-taupe)`), así que cambiar la marca cambia la interfaz entera desde un sitio.
- **La tipografía también está tokenizada** en dos familias con sus respaldos completos
  (`--font-sans` con `ui-sans-serif, system-ui`; `--font-display` con `Georgia, serif`), y se
  usan por token en todo el CRM.

Lo único que anoto sin llamarlo hallazgo: el borde `taupe` sobre fondo crema da **1,17**, así
que las separaciones entre tarjetas son casi invisibles. Para el criterio de texto no aplica,
y estéticamente es deliberado; lo menciono porque es parte de por qué el expediente se lee
como «doce tarjetas apiladas» (B7.4).

_(Vacío. Se escribe según se encuentra, nunca al final.)_

---

## Arreglos aplicados

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
