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
  `Estado: hecho` — son **once tarjetas** (trece con bicis y documentación), y **el orden está bien pensado
  y documentado**: sigue el recorrido real de la venta. Lo que falta no es orden, es **resumen**: en los
  primeros diez segundos solo se ven el chip de estado y cinco cifras de dinero, y esta auditoría demostró
  que **esos dos son justamente los que pueden mentir**. Todo lo accionable —si el correo salió, cuántos
  contratos hay firmados, si se pidió el cupo— vive del sexto scroll para abajo.
- **B7.5 Los módulos pequeños.** `finanzas` (134 líneas), `calendario`, `tokens`, `clara`, `isabel` (un placeholder). Cuáles aportan, cuáles estorban y cuál merece crecer.
  `Estado: hecho` — **el que más aporta por línea es `/calendario`** (33 líneas y es lo único que responde
  «¿qué sale y cuándo»). **El que merece crecer es `/finanzas`**: es el sitio natural de la conciliación con
  Pilgrim que B2 echó en falta. **El único que estorba es `/isabel`**, una entrada de menú que no lleva a
  nada. Y un desequilibrio que dice algo: **`/tokens` (219 líneas) mide el gasto en IA con más detalle del
  que `/finanzas` (134) mide el dinero del negocio.**
- **B7.6 Clics por tarea.** Cuenta los de las tres tareas de todos los días: cotizar, cobrar, mandar documentación. Di dónde sobran.
  `Estado: hecho` — contados los tres flujos. **Los clics que sobran no son de diseño: son los hallazgos de
  esta auditoría vistos desde el lado de quien trabaja** (por eso el crítico le quitó la etiqueta de hallazgo:
  es lectura transversal, no suma al recuento). Cotizar pide 2 clics de más porque el asistente no
  genera el PDF; cobrar pide 2 de más porque cobrar no mueve el estado; y mandar la documentación pide
  primero **cambiar el estado a mano para que la tarjeta aparezca**.
- **B7.7 Accesibilidad de lo básico.** Foco visible, etiquetas en los campos, objetivos tocables, y que no se dependa solo del color para decir algo.
  `Estado: hecho` — **mejor de lo que parecía al contar en crudo.** Se quita el contorno del foco 26 veces,
  pero **24 lo sustituyen** por un cambio de borde visible y **ningún botón** se queda sin indicador, así que
  la navegación con teclado no se pierde. Los campos están etiquetados. Lo que sí falla es depender del
  color: los avisos ámbar del suplemento van a 10 px con contraste 1,96 (B7.1) y sin icono ni texto que los
  marque como aviso.

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

### [MEDIO] Lo primero que se ve del expediente son las dos cosas que pueden estar mal — `seguimiento/[id]/page.tsx:407-418`

El expediente es, en este orden: cabecera con el chip de estado → cinco tarjetas de dinero →
**once tarjetas** apiladas (editor, opcionales, bicis, documentos, correo al cliente,
contratos, correo a Pilgrim, archivos de Pilgrim, documentación de viaje, pagos de cliente,
pagos a Pilgrim).

**El orden no es el problema, y conviene decirlo**: está elegido a conciencia y comentado en
el código —«la cotización con su correo → el contrato → el correo a Pilgrim → los hoteles →
los pagos. Sigue el recorrido real de una venta: los contratos se firman ANTES del correo a
Pilgrim, que es justo cuando entran los números de pasaporte que ese correo necesita»—. Es
una decisión de oficio, no un apilamiento casual.

El problema es **qué cabe en los primeros diez segundos**, que es exactamente lo que pregunta
la tarea. Lo que se ve sin bajar es:

1. **El chip de estado.** B2 demostró que miente en 33 de 39 casos (`enviada` sin
   `email_sent_at`) y que CS-2026-004 dice `pago_parcial` con los 970 € cobrados.
2. **Cinco cifras de dinero.** B2 demostró que dos de ellas —«Margen real» y, por dentro,
   «Saldo proveedor»— se calculan restando pagos a Pilgrim que casi nunca se registran, y B7.1
   que las destacadas se pintan con un contraste de 2,13.

Y lo que **no** se ve sin recorrer once tarjetas es todo lo accionable:

| pregunta | dónde está hoy |
|---|---|
| ¿el correo llegó de verdad? | tarjeta 5 de 11 (`EmailPreviewCard`) |
| ¿cuántos contratos hay firmados? | tarjeta 6 — CS-2026-058 tiene 1 de 3 y no se ve |
| ¿se le pidió el cupo a Pilgrim? | tarjeta 7 |
| ¿se mandó la documentación de viaje? | tarjeta 9, y **está oculta** salvo que el estado diga pagado (el GRAVE de B2) |
| ¿hasta cuándo vale la cotización? | dentro del editor |

O sea: la respuesta a «¿se sabe en diez segundos qué falta por hacer?» es **no**, y el motivo
no es el desorden sino que **la cabecera resume el pasado (cuánto vale) y no el futuro (qué
toca)**.

**Propuesta — una franja «Qué falta», debajo de la cabecera y antes del dinero.** Es la
hermana de la columna «Falta» que proponen B2.6 y B2.7, aplicada a un expediente, y se calcula
con datos que **la página ya tiene cargados** (los trae en su `Promise.all` de 20 consultas):
no hace falta ni una consulta nueva.

Cuatro señales, en este orden:

1. **Envío** — «sin registro de envío» / «enviada el 3 de sep» (de `email_log`, ver B4).
2. **Firma** — «1 de 3 contratos firmados» (de `contractRows`, ya cargado).
3. **Cobro** — «faltan 485 € de 970» (de `saldoCliente`, ya calculado en la línea 283).
4. **Siguiente paso** — «pedir cupo a Pilgrim» / «generar documentación» / «vence en 4 días».

Con eso, y **usando el saldo en vez de la etiqueta** para decidir qué se muestra —que es lo
que ya propone el GRAVE de B2—, el expediente contesta la pregunta sin bajar. No hace falta
reordenar ni una tarjeta.: la barra lateral desaparece y no la sustituye nada — `components/shell/Sidebar.tsx:32` · `(dashboard)/layout.tsx`

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

### [LECTURA TRANSVERSAL — no es un hallazgo propio] Los clics que sobran son los hallazgos de esta auditoría, vistos desde el trabajo diario

> **Etiqueta corregida por el crítico (era `[MEDIO]`).** Los cinco pasos de más que se cuentan aquí
> ya están levantados como hallazgo en B1, B2 y en el MEDIO de B7.4; dejarlo con etiqueta de hallazgo
> hacía que B8 contara cuatro cosas dos veces. Se queda como lectura transversal —que es de lo más
> útil del bloque para priorizar—, no suma al recuento. Detalle en «Crítica del experto».

Contados los tres flujos de todos los días. Lo interesante no es el total, es **por qué**
existe cada paso de más: los tres coinciden con hallazgos ya levantados en B1, B2 y B3.

**1. Cotizar** — asistente → expediente → cliente.

El asistente en sí está bien: ruta, alojamiento, fecha y personas autocargan tarifa, días,
fecha fin, etapas y las tarjetas del PDF; el buscador de cliente por teléfono evita
retecleado. Pero después de «Crear» quedan **dos pasos que los otros tres caminos de alta no
piden**:

- **«Generar PDF»**, porque el asistente es el único que no lo genera al crear (MENOR de B1).
  Sin ese clic, el correo saldría sin adjunto.
- **«Enviar»** desde la tarjeta de correo, que es correcto que sea manual.

El primero sobra. Es un paso obligatorio, siempre el mismo, que existe solo porque falta una
línea en `nueva/actions.ts`.

**2. Cobrar** — es el flujo con más grasa.

Abrir `/seguimiento` → abrir el expediente → **bajar hasta la décima tarjeta** → «Añadir
pago» → fecha, monto, moneda, cuenta, referencia → Guardar. Y entonces:

- **hay que cambiar el estado a mano** en el desplegable, porque cobrar no lo mueve (el GRAVE
  de B2), y
- si el pago completa el total, **hay que acordarse** de ponerlo en «Pago completo» o la
  documentación de viaje no se podrá generar.

Son **dos clics y una decisión** que el sistema podría tomar solo: ya tiene el saldo calculado
dos secciones más arriba. Y el bajar hasta la décima tarjeta es lo que resuelve la franja «Qué
falta» de B7.4.

**3. Mandar la documentación de viaje** — el peor, porque empieza con un rodeo.

La tarjeta **no se dibuja** salvo que el estado diga pagado (`isFullyPaid`), así que el primer
«clic» del flujo es **arreglar la etiqueta del punto anterior**. Con CS-2026-004 —970 € de
970 cobrados, salida el 22 de septiembre— hoy hay que ir al desplegable, cambiar el estado, y
recargar para que la tarjeta exista. Después sí: prellenar noches → revisar hotel por hotel →
generar → enviar.

El prellenado está bien pensado (propone hotel por localidad, B5.6) y revisar noche por noche
**debe** ser manual. Lo que sobra es el rodeo del principio, y su arreglo es el mismo que ya
propone B2: **que la puerta sea el saldo y no la etiqueta**.

**Conclusión, que es lo que pide la tarea:** no hay clics de más por mal diseño de pantalla.
Los tres flujos están ordenados como el trabajo real. Lo que sobra son **cinco pasos
mecánicos** que existen porque tres piezas no se enteran de lo que ya sabe la base de datos:
el PDF que no se genera, el estado que no se mueve al cobrar, y la tarjeta que se esconde
detrás de una etiqueta en vez de detrás de un saldo. Arreglados esos tres, el trabajo diario
pierde cinco clics y dos oportunidades de olvido.

### [MENOR] Dos elementos se quedan sin indicador de foco, y los avisos dependen solo del color — `focus:outline-none` (26 usos)

Medido, porque el número en crudo asusta más de lo que debe: **`focus:outline-none` aparece
42 veces**, pero solo **26** de esas no llevan `focus:ring-*` al lado — y de esas 26, **24
cambian el borde a bosque** (`focus:border-bosque`), que sobre blanco es un cambio de
contraste de 1,17 a más de 15: se ve. Quedan **2** que quitan el contorno y no ponen nada.

Y lo más importante: **ningún `<button>` está entre ellos**. La navegación con teclado por los
controles no pierde el foco, que era el fallo grave que fui a buscar.

Lo que sí falla es la otra mitad de la tarea, **no depender solo del color**:

- Los avisos del suplemento de temporada son texto de **10 px en `text-dorado-oscuro`**, con
  contraste **1,96** (B7.1) y **sin icono ni palabra** que los marque como aviso. Quien no
  distinga bien ese dorado del gris no tiene ninguna otra señal de que ahí dice algo
  importante.
- Los chips de estado (`statusColor`) se diferencian **solo por color de fondo**; el texto
  ayuda, pero dos estados vecinos como «Pago parcial» y «Pago completo» se distinguen por
  leer, no por ver.

**Propuesta:** un `focus:ring-2 focus:ring-bosque` en los dos casos huérfanos —es literalmente
copiar la clase de los otros 16— y, para los avisos, el token de aviso que propone el hallazgo
de los estados más un icono. Con eso, el aviso deja de depender del color y de paso se
arregla su contraste.

### Lo que sí está bien: lo básico de accesibilidad está puesto

- **Los campos tienen etiqueta.** 135 `<input>` contra 110 `<label>` más 13 `aria-label`; la
  diferencia se explica por los `<label>` que envuelven a varios controles y por los campos
  ocultos. No encontré un formulario donde haya que adivinar qué se pide.
- **El foco no se pierde en los botones** (arriba), y 16 controles tienen anillo explícito.
- **Los errores se anuncian**: la pantalla de firma usa `role="alert"` con `aria-live="assertive"`
  (`SignForm.tsx`), que es justo donde más falta hace porque el que la usa es un cliente y no
  puede preguntarle a nadie.
- **Los objetivos tocables de las acciones destructivas están bien**: el botón de borrar de la
  tabla usa `p-1.5` con `title="Borrar"` y confirma con el código y el nombre del cliente.
- **La jerarquía de encabezados es correcta** en las pantallas revisadas: un `h1` por página
  con el nombre de la sección y `h2` en las tarjetas.
- **El HTML del correo no lleva imágenes** (B4.4), así que quien tenga las imágenes
  desactivadas o use lector de pantalla recibe el mensaje completo en texto.

### Los módulos pequeños, uno por uno

| módulo | líneas | juicio |
|---|---|---|
| `/calendario` | **33** | **aporta, y es el mejor negocio del panel** |
| `/clara` | 160 | aporta |
| `/finanzas` | 134 | aporta, y **es el que merece crecer** |
| `/tokens` | **219** | aporta, pero desproporcionado |
| `/configuracion` | 44 | aporta |
| `/isabel` | 23 | **estorba** |

**`/calendario` es el que más da por lo que cuesta.** En 33 líneas resuelve la única pregunta
que ninguna otra pantalla contesta —«¿qué sale y cuándo?»— y encima está mejor filtrado que la
lista principal: **excluye las canceladas** (`.neq("status","cancelada")`), que es justo lo
que B2 encontró que los KPI de `/seguimiento` **no** hacen. Muestra el error de la consulta y
delega la vista a un componente. Si algo del panel merece que se le añada cosas —el saldo
pendiente sobre cada viaje, por ejemplo— es este.
Un matiz que hereda de B2: filtra `start_date not null`, así que las **11 cotizaciones sin
fecha de salida** tampoco aparecen aquí. No es culpa suya, pero confirma que ese hueco de
datos deja expedientes fuera de **todas** las vistas por fecha.

**`/finanzas` es el que merece crecer, y hoy está a medias.** Es el único sitio que agrega
dinero por cuenta y moneda, que es exactamente lo que hace falta para cuadrar contra los
extractos de Bancolombia y Santander. Pero: descarta sus errores (hallazgo de B7.2), es una
de las tres copias de la regla de «Cobrado» (B2), y su mitad de proveedor se alimenta de una
tabla que casi nadie llena (B2). **Es el sitio natural de la conciliación con Pilgrim** que
B2 pidió, y con 134 líneas está lejos de ser un módulo maduro.

**`/tokens` (219 líneas) es el más grande de los pequeños**, y mide el gasto en tokens de los
asistentes: precio por modelo, costo en USD, conversión con la TRM. Está bien hecho y sirve
—ese gasto es real y nadie más lo vigila—. Lo anoto por la comparación, que es la que dice
algo: **la plataforma tiene 219 líneas para saber cuánto cuesta la IA y 134 para saber cuánto
dinero entra y sale del negocio**, con la mitad proveedor sin alimentar. No propongo recortar
`/tokens`; propongo que la desproporción se lea como lo que es: una señal de dónde ha ido la
atención.

**`/clara` aporta** y es un tablero operativo de verdad: leads totales, activos en 24 h, no
leídos, sin respuesta en más de 24 h, y cuántos lleva Clara. Ese «Sin respuesta >24h» es
exactamente el tipo de señal que B2.7 echa en falta en el embudo de cotizaciones — o sea que
**el bot de WhatsApp tiene la vigilancia de seguimiento que las ventas no tienen**. Vale la
pena decirlo porque el patrón ya existe en casa.

**`/isabel` es el único que estorba, y por poco.** Son 23 líneas honestas: dice «Próximamente»,
explica qué mostrará y dónde se configurará, y no finge tener datos. No engaña a nadie. Lo
que cuesta es su sitio en la barra lateral: en un menú de una decena de entradas, una que no
lleva a ninguna parte se paga cada día, y más cuando —según B7.3— en el celular la barra ni
siquiera existe y hay que teclear las URL. **Propuesta:** sacarla del menú hasta que haga
algo, y dejar la página accesible por URL. Es un cambio de una línea en `Sidebar.tsx`.

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

### Vuelve el contorno de foco a los dos campos que lo habían perdido — `configuracion/AsistenciaForm.tsx:119`, `configuracion/TravelDocTextsForm.tsx:178`

Los dos únicos controles del CRM con `focus:outline-none` y **ninguna** sustitución (ni
`focus:ring-*` ni `focus:border-*`). Son los dos campos de título de apartado del editor de
Asistencia y del de textos del Documento de Viaje: `bg-transparent`, sin borde propio, así que al
tabular hacia ellos el foco desaparecía sin dejar rastro. Quitado el `focus:outline-none` a secas
—dos tokens de clase menos— con lo que vuelve el anillo de foco del navegador. Es el arreglo más
reversible posible y no toca ni la maqueta ni el color. `npx tsc --noEmit` limpio.

---

## Crítica del experto

`Estado: en curso` — crítico independiente. **Plan de verificación** (se tacha según avanza):

1. Levantar la app en local y abrirla con Chrome. Si no arranca, decirlo y verificar por código.
2. **Móvil (390 px)**: entrar al panel, buscar CUALQUIER forma de navegar (hamburguesa, cajón,
   enlaces del pie, breadcrumb, logo enlazado, atajos dentro de las tarjetas). Decidir si MEDIO
   se queda corto.
3. **Contrastes de B7.1**: recalcular `--color-dorado-oscuro` sobre blanco y crema con la fórmula
   WCAG, y verificar si los KPI de 24 px califican como «texto grande» (18,66 px bold / 24 px normal).
   Comprobar el peso real de la fuente en pantalla.
4. **B7.6 (clics)**: decidir si es hallazgo propio o resumen de B1/B2/B3. Corregir la etiqueta.
5. **Tres estados**: muestra en pantalla (no en código) de vacío/cargando/error, y coherencia entre
   pantallas.
6. **Oficio**: qué le falta a esto para sentirse un CRM de agencia en el día a día — el «vistazo»
   del punto 1 de «Cómo se juzga el diseño».
7. Revisar si el auditor dedujo cosas del código que la pantalla desmiente (o al revés).

**Por dónde voy (2º crítico, retoma tras la muerte del primero por el límite):** cerrados los
puntos 1, 2 y 3 por el antecesor, y escritos ya el juicio del punto 4 y la parte del 7 que toca a
B7.7. En esta sesión: **(a) hecho** —bajada la etiqueta del hallazgo de B7.6 en Hallazgos, que
seguía diciendo `[MEDIO]`—; **(b) hecho** el punto 5, los tres estados vistos en pantalla, con dos
hallazgos nuevos escritos (el vacío que miente cuando falla la consulta, y las doce formas para
tres ideas). **Ahora mismo: (c) el punto 6, el «vistazo» de oficio.** Falta después **(d)** cerrar
el punto 7. Método: el del antecesor —los componentes reales sobre la hoja de estilos compilada,
servida por el dev server, medidos con `getComputedStyle` en Chrome—; sigo **sin poder
autenticarme**, así que las pantallas **con datos reales** siguen siendo hueco declarado.

### Cómo verifiqué (importante para quien venga detrás)

`npm run dev` levanta bien (Next 16.2.4, Turbopack, listo en <1 s). **No pude entrar al panel**:
el login es correo + contraseña —no el magic link que dice `GUIA.md:14`— y no me está permitido
autenticarme. Tampoco pude abrir producción. Así que verifiqué **en el navegador de verdad**, no
con grep, montando el shell real (`layout.tsx` + `Sidebar` + `Topbar`, copiados tal cual) dentro
de un **iframe de 390 px sobre la hoja de estilos compilada de la propia app**, servida por el
dev server. Los media queries, los tokens, los tamaños y los colores son los reales, resueltos
por Chrome. Lo que no pude ver son las pantallas **con datos**: eso queda como hueco declarado.

---

### [CONFIRMADO · MEDIO] En el celular no hay navegación — pero el mapa del auditor está a medias

Verificado con los ojos, en un viewport de 386 px: `<aside class="hidden md:flex w-60">` da
**`display: none`, ancho 0**. La `Topbar` se dibuja con **TRM + correo + «Salir»** y nada más.
El auditor tiene razón en el hecho.

Pero su descripción —«para pasar de `/seguimiento` a cualquier otra hay que escribir la URL»— es
**demasiado dura en una mitad y demasiado blanda en la otra**, y las dos correcciones importan
porque cambian cuál es el arreglo:

**Se le escapó que el bucle de venta sí se navega en móvil.** Hay enlaces dentro de las páginas:

| desde | hasta | dónde |
|---|---|---|
| expediente | Seguimiento | `seguimiento/[id]/page.tsx:372` — «← Volver al seguimiento» |
| Nueva cotización | Seguimiento | `cotizaciones/nueva/page.tsx:40` — mismo enlace |
| Seguimiento | Nueva cotización | `seguimiento/page.tsx:94` |
| Seguimiento | expediente | las filas de la tabla |
| `/cotizaciones` | Seguimiento | `cotizaciones/page.tsx:20` |

O sea que **seguimiento ⇄ expediente ⇄ nueva cotización —el trabajo de todos los días— sí se
recorre desde el teléfono** sin tocar la barra de direcciones. Eso rebaja el hallazgo bastante.

**Y se le escapó lo que lo empeora: la pantalla en la que aterrizas es un callejón sin salida.**
`src/app/page.tsx` hace `redirect("/clara")`, y el proxy manda a `/clara` a quien ya tiene sesión
(`proxy.ts:57`). Así que **abrir la app en el celular te deja en `/clara`**, cuya única salida son
los enlaces a `/clara/[userId]`: **cero enlaces hacia el resto del CRM**. Para entrar al bucle de
venta desde el arranque hay que **teclear `/seguimiento` a mano, cada vez**.

Fuera del bucle quedan sin ninguna puerta en móvil: `/calendario`, `/finanzas`, `/catalogo`,
`/hoteles`, `/tokens`, `/configuracion`. No hay manifest ni PWA, ni un solo `md:hidden` de
navegación en todo el proyecto (comprobado).

**Sobre la etiqueta: MEDIO se queda, y no se queda corto.** El auditor escribió que «por impacto
diario es lo más grande de B7»; con los enlaces internos a la vista, eso ya no se sostiene: lo que
falla no es *usar* el CRM en el celular, es **entrar** a él y salirse del bucle de venta. Y por la
letra del TABLERO no hay dinero perdido ni algo que vea el cliente. MEDIO es exacto.

**Corrección a la propuesta, con la pantalla delante.** El auditor propone «una fila de enlaces en
la `Topbar`, visible solo en móvil». **En 390 px la `Topbar` ya va llena**: con `h-14` fija, el
bloque de la TRM envuelve en dos líneas y deja justo el hueco del botón «Salir» (lo vi
renderizado). Meterle cuatro enlaces más ahí revienta la barra. Dos arreglos que sí caben, en
orden de coste:

1. **Una línea, hoy:** que `/clara` y la `Topbar` dejen de ser un callejón — basta con envolver el
   «Camino Sacro» de la marca en la `Topbar` en móvil, o añadir a `/clara` los tres enlaces del
   bucle. Quita el «teclear la URL» del arranque, que es el 80 % del dolor.
2. **La fila `md:hidden`, pero debajo del header**, no dentro, y ocultando la TRM en móvil
   (`hidden sm:inline-flex`): la TRM es un dato de consulta, no de navegación, y en el teléfono
   está ocupando el sitio de lo único que hace falta.

**Propuesta**, no aplicada: es cambiar el shell, y eso no entra en «pequeño y reversible».

---

### [CORREGIDO · MEDIO se mantiene] El contraste del dorado está bien calculado; el recuento de usos está inflado

Recalculado en Chrome, con la hoja de estilos compilada de la app y `getComputedStyle`, no sobre
el hexadecimal del archivo. **La aritmética del auditor es correcta, dígito a dígito:**

| par | auditor | medido |
|---|---|---|
| `dorado-oscuro` sobre blanco | 2,13 | **2,13** |
| `dorado-oscuro` sobre crema | 1,96 | **1,96** |
| `muted` sobre blanco | 5,98 | **5,98** |
| `bosque` sobre blanco | 12,48 | **12,48** |
| su candidato `#8a6410` sobre blanco | ~5,3 | **5,37** |
| su candidato `#8a6410` sobre crema | ~5,0 | **4,93** (pasa, pero por poco) |

**El criterio de «texto grande» está bien aplicado, y lo verifiqué en píxeles renderizados.** El
KPI sale de `font-display text-2xl` → Chrome computa **24 px, peso 400, Caladea (serif)**. WCAG
llama grande a 18 pt = 24 px en peso normal, así que el mínimo **sí es 3,0** y no 4,5. El auditor
usó 3,0. Correcto. Y falla igual: 2,13 < 3,0.

**Lo que el auditor no dijo y agrava el caso:** ese KPI no es solo 24 px, es **24 px de una serif
en peso 400**. Las astas finas de una Caladea a ese contraste se pierden más que las de una
sans del mismo tamaño; el umbral de 3,0 asume trazo normal, no serif de contraste alto. En el
render de 390 px se ve: el «3.480 €» queda claramente más pálido que su propia etiqueta gris
(`muted`, 5,98). **El número más importante de la pantalla se lee peor que su rótulo.** Ese es el
argumento de verdad, y es más fuerte que el ratio a secas.

**Lo que sí hay que corregir: «36 usos» no es cierto para este bloque.** Contado:

| ámbito | usos de `text-dorado-oscuro` |
|---|---|
| todo `src` | 42 |
| de esos, en `contenido/**` — **fuera del alcance** (TABLERO, línea 7) | 19 |
| **dentro del alcance** | **23** |
| …de los cuales, en páginas públicas del cliente (`/cotizar`, `/contrato`, `/documentacion`) | 8 |
| …en el CRM propiamente dicho | **15** |

O sea que la cifra del titular está inflada **2,4×** respecto del CRM y **1,6×** respecto del
alcance total. No cambia la etiqueta —los 15 que quedan son los que importan: los dos KPI con
`accent`, los avisos de temporada y los chips— pero un número inflado en el titular es justo lo
que el TABLERO pide no hacer. **Los 8 de las páginas públicas, además, no son un detalle menor:
esos los lee el cliente, en su propio teléfono, y ahí el argumento sube de tono.**

**Propuesta:** la del auditor sirve tal cual (token nuevo `--color-dorado-texto ≈ #8a6410`), con
dos matices: sobre crema da 4,93, que pasa AA pero sin margen —conviene bajarlo un punto más si el
aviso va a vivir sobre crema— y el reemplazo debe **empezar por las páginas públicas**, no por el CRM.

---

### [NUEVO · MEDIO] Los tres estados que faltan de verdad son los del framework, y B7.2 los dio por buenos — `src/app/(dashboard)/**`

Este es el que se le escapó al auditor por mirar el código de cada página y no el árbol de rutas.
B7.2 recorrió las 15 pantallas contando `if (error)` y mensajes de vacío, y concluyó que «solo una
se queda muda». Contado el árbol de `app/`:

```
src/app/(dashboard)/contenido/[id]/not-found.tsx   ← fuera de alcance
src/app/(dashboard)/contenido/error.tsx            ← fuera de alcance
src/app/contrato/[token]/error.tsx                 ← página pública
```

**En todo el CRM no hay ni un `loading.tsx`, ni un `error.tsx`, ni un `not-found.tsx`.** Los tres
que existen están en el Estudio de Contenido (fuera de alcance) y en la firma pública. O sea que el
patrón se conocía y **no se aplicó al panel**. Tres agujeros concretos:

**1. Cargando: no existe donde más tarda.** Todas las páginas del panel son componentes de
servidor `async`. Sin `loading.tsx`, Next **bloquea la transición**: el navegador se queda en la
página anterior, sin spinner ni esqueleto, hasta que el servidor termina. Y el expediente hace
**21 consultas** (`seguimiento/[id]/page.tsx:142`, 19 en el `Promise.all` + 2 en el de la línea
224) antes de devolver un byte. El auditor certificó que «el estado cargando está donde tarda»
citando el botón «Creando…» y `QuotesTable.tsx:229`; pero ese `opacity-50` está atado a
`busyId && pending`, que es el **borrado**, no la navegación (`QuotesTable.tsx:66,229`). Hacer clic
en el código de una cotización desde `/seguimiento` **no produce ninguna señal**: en el escritorio
son unas décimas, en el celular de Nico con datos móviles son segundos de pantalla congelada, que
es exactamente cuando la gente vuelve a hacer clic.

**2. Error: la pantalla muda que B7.2 fue a buscar está aquí.** Sin `error.tsx` en `(dashboard)`
ni `global-error.tsx`, cualquier excepción lanzada dentro de un componente de servidor del panel
—no un `error` devuelto por Supabase, que eso sí se recoge— cae en la pantalla por defecto de
Next. El aviso rojo bien redactado que el bloque celebra solo cubre los errores **devueltos**; los
**lanzados** no tienen dónde caer.

**3. `notFound()` sin `not-found.tsx`: comprobado en pantalla.** `seguimiento/[id]/page.tsx:212` y
`clara/[userId]/page.tsx:33` llaman a `notFound()`, y no hay `not-found.tsx` en `(dashboard)` ni en
la raíz de `app/`. Abrí una ruta inexistente en el navegador y esto es lo que sale, literal:

> **404** │ This page could not be found.

Negro sobre blanco, **en inglés**, sin la marca y **sin un solo enlace**. Y ahora júntalo con C1:
en el celular la barra lateral no existe, así que quien llega ahí —una cotización borrada, un
código mal tecleado, un enlace viejo de WhatsApp— **se queda sin salida que no sea el botón atrás
del navegador**. Es la definición de «pantalla muda» del CRITERIOS, y está en el sitio donde más
duele.

**Justo lo contrario pasa en lo que ve el cliente, y hay que decirlo:** probé
`/documentacion/token-inventado-abc` y responde con la marca, «**Enlace no válido** — Revisa que el
enlace esté completo o pídenos uno nuevo» y un botón «Escríbenos». Impecable. El cuidado está
puesto donde mira el cliente y no donde trabajan Nico y Naty.

**Propuesta** (no lo hago: son pantallas nuevas y el encargo dice proponer, no rediseñar):
tres archivos pequeños en `src/app/(dashboard)/` —`loading.tsx` con un esqueleto, `error.tsx` con el
mismo aviso rojo que ya usa el resto y un botón «Reintentar», y `not-found.tsx` con la marca y
«← Volver al seguimiento»—. Cubren de golpe las 15 pantallas. Es media hora y cierra el hueco que
B7.2 dio por cerrado.

---

### [NUEVO · MEDIO] Cuando la consulta falla, la pantalla enseña el aviso **y** un vacío que miente — `seguimiento/page.tsx:111`, `calendario/page.tsx:31`

Esto es el punto 5 del plan —los tres estados **vistos en pantalla**— y es donde la revisión por
código de B7.2 se queda corta. B7.2 recorrió las 15 pantallas contando `if (error)`, encontró el
aviso en casi todas y concluyó que **«solo una se queda muda»** (`/finanzas`). Es cierto que el
aviso está. Lo que no vio es **qué se dibuja debajo del aviso**, porque eso no se ve leyendo el
`if`: se ve mirando la pantalla.

Monté `/seguimiento` en su estado de error a 390 px, con la hoja de estilos compilada. Esto es
literalmente lo que ve Nico cuando Supabase no responde:

| lo que se ve | qué dice |
|---|---|
| franja ámbar pálida | «No se pudo cargar el seguimiento.» |
| **Total cotizado** | **0,00 €** |
| **Costo Pilgrim total** | **0,00 €** |
| **Utilidad proyectada** | **0,00 €** |
| **Cobrado al cliente** | **0,00 €** |
| la tabla | **«Sin cotizaciones aún.»** |
| el pie de la tabla | «Mostrando 0 de 0 cotizaciones» |

Las cinco `Card` y la `QuotesTable` están **fuera** del `{error && …}` (`page.tsx:111-118` y `:120`),
así que se pintan igual con `rows = []`. Y el vacío de la tabla es el que B7.2 celebra —«Sin
cotizaciones aún» frente a «Ninguna coincide con los filtros»—: **esa distinción tan bien hecha
tiene dos casos y hacen falta tres.** El tercero, «no lo sé porque falló la consulta», hoy se
cuenta como el primero. La frase le está diciendo a Nico, con todas las letras, que no tiene
cotizaciones.

**En `/calendario` es peor todavía, porque el texto acusa a algo que no fue:** el error deja
`events = []` y `CalendarView` (`CalendarView.tsx:173`) escribe **«No hay salidas próximas con los
filtros actuales.»** No hay ningún filtro puesto; lo que hay es una consulta caída. El usuario va a
tocar los filtros.

Y **la jerarquía está al revés**: medido en el navegador, el fondo del aviso (`bg-amber-50`,
#FFFBEB) contra el fondo de página (crema, #F7F5F0) da **1,05**, y su borde (`amber-200`) **1,14**.
O sea que **la caja del aviso es prácticamente invisible**: solo lo distingue el color de la letra,
a 14 px, sin icono, sin negrita y sin título. Al lado, cuatro cifras de dinero a 24 px que se leen
como un hecho. **Lo falso se ve más que lo verdadero.** Es el mismo pecado que B7.2 le señaló a
`/finanzas` —enseñar ceros como si fueran datos— solo que aquí con una nota al pie que casi nadie
va a leer. Afecta a `/seguimiento`, `/calendario`, `/catalogo`, `/clara` y `/hoteles`.

**Propuesta** (no lo hago: cambia qué se dibuja en cinco pantallas, no es «pequeño y reversible»):
cuando `error` venga con contenido, **no pintar los números ni el vacío**. Un `if (error) return
<AvisoDeCarga/>` antes de las tarjetas resuelve las cinco, y el aviso —ese sí— con icono, borde
visible y botón «Reintentar». Mientras eso no pase, el mínimo honesto es cambiar el texto del vacío
por «No se pudieron cargar las cotizaciones» cuando hay error, y pintar los KPI con «—» en vez de
«0,00 €».

---

### [NUEVO · MENOR] Los tres estados existen, pero cada pantalla los dibuja a su manera — 12 formas para 3 ideas

Del mismo montaje del punto 5, con todos los estados reales uno debajo del otro sobre la hoja de
estilos compilada. La conclusión de B7.2 —«los tres estados están»— se sostiene. Lo que no se
sostiene es el criterio de **coherencia** de CRITERIOS («el mismo elemento se ve y se comporta
igual en todas las pantallas»). Contado y medido:

**El mismo ámbar dice dos cosas opuestas.** El error de carga de página (`seguimiento:101`,
`catalogo:210`, `calendario:25`) y el **vacío** de tarifas de bici (`BikesTable.tsx:147`) usan la
misma caja: `bg-amber-50` + `text-amber-900` + `rounded-md px-4 py-3 text-sm`. Puestas una encima
de otra no se distinguen más que por el borde (`amber-200` vs `amber-300`, que a 1,14 y 1,2 sobre
crema no se ve). **«Se cayó la consulta» y «todavía no cargaste tarifas» se pintan igual**, y la
que se pinta más suave es la grave.

**Y el error de acción tiene cinco trajes**, todos rojos y ninguno igual:

| dónde | forma | texto |
|---|---|---|
| `Wizard.tsx:775`, `clara/page.tsx:82` | tarjeta redondeada con borde | `red-800`, 14 px |
| `HotelsManager.tsx:158` | franja a sangre, borde arriba | `red-700`, **12 px** |
| `HotelsManager.tsx:322` | franja a sangre, borde arriba | `red-700`, 14 px |
| `TravelDocTextsForm.tsx:137` | franja al pie del formulario | `red-700`, 14 px |
| `RouteStagesEditor.tsx:147` | franja, borde **abajo** | `red-700`, **12 px** |

Dos tonos (`red-700` da 5,87 sobre `red-50`; `red-800`, 7,64), dos tamaños y tres colocaciones para
**el mismo suceso**. Los de 12 px son los que menos se ven y están en los sitios donde se guarda
—hoteles y etapas—, o sea donde el usuario se va creyendo que guardó.

**Y los vacíos, siete formas**: celda de tabla a 14 px centrada (`QuotesTable:275`), tarjeta con
icono `py-14` (`HotelsManager:85`), tarjeta sin icono `py-12` (`clara:97`), tarjeta `py-10`
(`BikesTable:121`), fila de lista `py-10` (`CalendarView:173`), texto **a la izquierda** a 12 px
(`RouteStagesEditor:228`), y texto pelado sin caja (`ResourcesList:27`). El tono de la redacción
también baila: unos explican qué hacer («Crea el primero y ve cargándolos a medida que Pilgrim
confirme alojamientos», que es de los mejores que he visto en un CRM de este tamaño) y otros son
un punto final («Sin apartados.», «Sin recursos cargados.»).

**Un detalle que se cuela aquí y es de accesibilidad:** en todo el CRM no hay **ni un**
`role="alert"` ni un `aria-live`. El único del proyecto está en `contrato/[token]/SignForm.tsx:349`
—la firma pública, la que ve el cliente—. Un error que aparece tras pulsar «Guardar», sin anuncio y
sin mover el foco, no existe para quien no esté mirando ese trozo de pantalla. Tercera vez que
aparece el mismo patrón en este bloque: **el cuidado está donde mira el cliente, no donde trabajan
Nico y Naty.**

**Propuesta:** tres componentes en `components/` —`<Aviso tono="error|atencion|info">`, `<Vacio>` y
el `<AvisoDeCarga>` del hallazgo anterior— y sustituir. Es exactamente el mismo trabajo que B7.1
elogia con los colores de marca, que ahí sí se hizo bien: un sitio, un dato. Aquí hay doce sitios
para tres ideas.

---

### [ETIQUETA CORREGIDA · de MEDIO a no-hallazgo] Los clics (B7.6) son una lectura transversal, no un hallazgo propio

El auditor preguntó por esto y la respuesta es clara: **no es un hallazgo suyo, y él mismo lo
escribe dos veces.** El titular dice «los clics que sobran **no son de diseño**: son los hallazgos
de esta auditoría vistos desde el lado de quien trabaja», y la conclusión remata: «**no hay clics
de más por mal diseño de pantalla**». Los cinco pasos que enumera son, uno a uno:

| paso de más | ya está levantado en |
|---|---|
| «Generar PDF» tras el asistente | MENOR de B1 |
| cambiar el estado a mano tras cobrar | GRAVE de B2 |
| acordarse de poner «Pago completo» | GRAVE de B2 |
| la tarjeta de documentación escondida tras la etiqueta | GRAVE de B2 |
| bajar a la décima tarjeta para cobrar | el MEDIO de B7.4, en este mismo bloque |

Dejarlo como `[MEDIO]` **cuenta cuatro hallazgos dos veces**, y B8 (Síntesis) los va a sumar. La
etiqueta baja: pasa a ser una **lectura transversal**, que es lo que es y además es de las cosas
más útiles del bloque —cruzar tres bloques técnicos con el trabajo real es justo lo que hace falta
para priorizar—. Solo no es un hallazgo nuevo.

**Lo único que sí es de B7 y merece quedarse en el hallazgo de B7.4**: la franja «Qué falta» que el
auditor propone es **informativa**, y el clic que sobra es de **desplazamiento**. Que cada señal de
la franja sea un ancla al bloque correspondiente (`#pagos`, `#contratos`, `#documentacion`) convierte
el resumen en el atajo, y ahí sí desaparece el «bajar hasta la décima tarjeta». Es una línea por
señal.

---

### [CORREGIDO · MENOR se mantiene] B7.7 acierta en el fondo y falla en tres números y en un color

La conclusión es correcta —ningún botón se queda sin indicador de foco— pero el camino no. Contado
con el mismo criterio de alcance del TABLERO (sin `contenido/**`):

| | auditor | real |
|---|---|---|
| `focus:outline-none` en `src` completo | 42 | **42** ✓ |
| …dentro del alcance del bloque | (no lo separa) | **26** |
| de esos, **con** `focus:ring-*` | «16 controles» | **16** ✓ |
| de esos, con `focus:border-bosque` y sin ring | **24** | **8** |
| huérfanos, sin ninguna sustitución | **2** | **2** ✓ |

El «26 sin ring → 24 con borde → 2 huérfanos» no cuadra: 26 es el **total en alcance**, no los que
van sin ring. El desglose real es 16 + 8 + 2 = 26. Las dos cifras del titular y de la conclusión
sobreviven; la del medio no.

**Y hay una confusión de color que sí importa,** porque manda el arreglo a la pantalla equivocada.
B7.7 dice: «los avisos **ámbar** del suplemento van a 10 px con contraste 1,96 y sin icono ni
palabra». Son dos cosas distintas mezcladas:

- Los avisos **ámbar** (`text-amber-700`) son los de tarifa que falta —`Wizard.tsx:559`,
  `QuoteEditor.tsx:375`— y **sí llevan icono y palabra**: «⚠ No hay tarifas 2026 cargadas…». Su
  contraste sobre blanco está bien. No les pasa nada.
- Los del suplemento de temporada son **dorados**, y de los cuatro, dos —`Wizard.tsx:568` y
  `QuoteEditor.tsx:382`— **también llevan icono**: empiezan por «⚡» y el nombre de la temporada.
  Medido en el navegador, además, van a **16 px**, no a 10.
- Los únicos que van a **10 px sin icono** son `QuoteEditor.tsx:412` y `:428` —el «+ 240,00€
  suplemento → total cliente…» debajo de cada campo—, y esos no son avisos: son la cuenta del
  número que tienes al lado.

Así que el hallazgo real, más pequeño y más exacto, es: **dos notas de 10 px en dorado a 2,13 de
contraste, pegadas a los dos campos de dinero del editor**. Se arregla solo con el token de
`--color-dorado-texto` del hallazgo de B7.1; no hace falta ningún icono nuevo. La parte de los
chips de estado que dependen solo del color sí se sostiene tal como está escrita.

---

**Nota del auditor (se conserva):** sin empezar a propósito, como en B3, B4, B5 y B6: la auditoría la
escribió este mismo agente. Lo que más agradecería que revisen:

- El **MEDIO de la navegación en móvil**: comprobar en un teléfono de verdad que no hay
  ninguna forma de navegar que se me haya escapado (lo deduje del shell y del layout, no
  abriendo el navegador).
- Los **contrastes de B7.1**: los calculé con la fórmula WCAG sobre los tokens; conviene
  contrastar el criterio de «texto grande» aplicado a los KPI de 24 px.
- Si el **MEDIO de los clics** (B7.6) es un hallazgo propio o solo un resumen de B1, B2 y B3
  visto desde otro ángulo. Lo escribí como lo segundo pero le puse etiqueta de hallazgo.

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
