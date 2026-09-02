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
  `Estado: en curso` — pantalla por pantalla del panel: si tiene estado vacío con texto propio, si el error de
  la consulta se muestra o se descarta, y si hay señal de «cargando» en las acciones que tardan.
- **B7.3 Desde el celular.** El expediente, las tablas anchas y el wizard en 390 px. Es donde Nico atiende cuando no está en el escritorio.
  `Estado: pendiente`
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
