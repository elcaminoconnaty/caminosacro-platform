# Síntesis — hoja de ruta

`Estado: hecho`

Cierre de la auditoría de la Plataforma Comercial. **Se puede leer sola**: no hace falta abrir
ninguno de los siete informes para decidir qué se hace.

Reglas con las que está escrita: los números **se copian con su fecha**, no se recalculan —en
esta plataforma caducan en días, y varios cambiaron durante la propia auditoría—; lo que dos
bloques vieron por caminos distintos **se cuenta una vez**, diciendo que llegaron dos, porque eso
es justo lo que le da peso; lo ya arreglado va aparte de lo pendiente; y lo que no se pudo
comprobar se dice.

**Qué se auditó y cómo.** Siete bloques, cada uno con su auditoría, su crítica independiente y
su ronda de revisión. Todo verificado contra el código y contra la base de producción (solo
lectura). **Lo que nadie ha podido hacer es abrir el panel con datos**: el acceso es correo y
contraseña y ningún agente puede entrar. Todo lo visual de esta síntesis está verificado **por
reconstrucción** —los componentes reales montados sobre la hoja de estilos real, contrastes
medidos, tamaños en píxeles— **no por uso**. Es un método honesto y encontró cosas que leyendo
el código no se veían, pero no es lo mismo que abrirlo desde un teléfono. Al final hay cuatro
comprobaciones de diez minutos que solo puede hacer Nico.

---

## 1. El veredicto en un párrafo

La plataforma está **más sana de lo que sugiere el titular** —34.552 líneas, 33 migraciones y
cero tests—: el dinero se calcula y no se copia (los totales los deriva la base, no una
pantalla), el catálogo guarda precios por año con su bitácora, la firma electrónica aguanta como
prueba, los documentos cuentan todos la misma historia, los archivos están bien organizados y
protegidos, y las trece puertas de entrada al sistema están cerradas con llave. Nada de eso es
suerte: está bien hecho y conviene no tocarlo. Lo que falla se concentra en **tres sitios y se
puede describir sin tecnicismos**. Primero, **la plataforma no mira el reloj**: no persigue una
cotización que nadie contestó, ni un saldo que vence, ni avisa de que un viaje sale sin
contratos firmados —lo único que persigue es la firma, y eso está bien hecho—. Segundo, **no hay
red debajo de un error irreversible**: no existe ninguna copia de seguridad de nada, y borrar un
expediente con contrato firmado y dinero cobrado es un clic sin preguntas. Y tercero, **la
pantalla del expediente tiene un segundo editor de cotizaciones que no sigue las reglas del
primero** y puede pisar el precio tecleado a mano y dejar viejo el reparto de habitaciones que
después viaja al pedido a Pilgrim y al contrato. Encima de todo eso, y por delante, hay un asunto
que no es de código: **dos viajes pagados enteros salen con un viajero sin firmar, y el primero
sale el 22 de septiembre**. Resumido en una frase: es una plataforma que **vende bien, calcula
bien, y no recuerda ni respalda**.

---

## 2. Lo que hay que arreglar ya

En orden de lo que cuesta dejarlo. Cada punto dice **qué se pierde**. Los números llevan pegada
la fecha en que se midieron.

### 2.0 — Lo primero no es de código: dos viajes pagados enteros con un viajero sin firmar

**Sale el 22 de septiembre.** Al 3-sep-2026:

| expediente | sale | cobrado | firmó | **no ha firmado** |
|---|---|---|---|---|
| **CS-2026-004** · Francés desde Sarria · 2 pers. | **22-sep-2026** | 970,00 € (`pago_completo`) | Isabel Beatriz Londoño Cataño | **Johana Marcela Giraldo** |
| **CS-2026-019** · Francés desde Sarria · 2 pers. | **13-oct-2026** | 932,00 € (`pago_completo`) | Marcela Villada Vargas | **Carlos Mario Serna Carmona** |

Los dos contratos están en «enviado» desde el **31-ago** y al 3-sep **ninguno ha recibido
todavía un recordatorio**. El robot que recuerda manda 5 avisos cada 4 días: el primero cae el
**4-sep** y la escalera se agota alrededor del **20-sep** — dos días antes de que salga
CS-2026-004—. A partir de ahí **silencio permanente**, porque el robot cuenta recordatorios y
**no mira la fecha de salida**.

**Qué se pierde:** un viaje cobrado que sale sin contrato firmado. Si algo va mal en el camino,
no hay papel que diga qué se acordó con esa persona. Y nadie se entera desde la plataforma: la
lista de Seguimiento **no consulta los contratos en absoluto**, hay que entrar expediente por
expediente para ver quién firmó.

**Qué hacer esta semana:** escribir o llamar tú a esas dos personas, sin esperar al robot. Y
decidir si Camino Sacro acepta que alguien viaje pagado y sin firmar, que es lo que hoy pasa por
defecto. Del lado de la plataforma hay dos arreglos que no deciden nada de dinero: una columna
«firmas: 1/2» en la lista de Seguimiento, y que el robot reabra los avisos a 15 y a 5 días de la
salida.

### 2.1 — Hay una oferta en el correo de una clienta que promete dos noches que nadie cotizó

**CS-2026-081**, Costero desde Porto, 2 personas × 1.450 € = **2.900 €**, salida 1-abr-2027,
estado «enviada» (3-sep-2026). El PDF que se le mandó dice **15 días / 14 noches**, con «14
noches en acomodación privada» y «14 desayunos», y el hotel de cada noche en la tabla. Lo
cotizado y lo pedido a Pilgrim son **13 días / 12 noches**. La culpa no es del PDF: a esa ruta le
faltan en el catálogo las etapas de llegada y de fin de servicios, y el generador las inventa
para cuadrar. **Trece rutas del catálogo están en la misma situación** y repetirían el error.
Ojo con `Portugués desde Porto`: nunca se ha cotizado, y su primer PDF prometería **cuatro días
de Camino más** de los que se cobran.

**Qué se pierde:** dos noches de hotel y dos desayunos para dos personas, si la clienta acepta y
hay que cumplir lo prometido. O la clienta, si se entera después. Multiplicado por trece rutas.

**Qué decides tú:** si se le avisa **antes** de que acepte y con qué palabras; si acepta antes de
corregirlo, quién pone las dos noches; y cuándo se completan las etapas de las trece rutas —eso
es dato de catálogo, no programación—.

### 2.2 — No existe ninguna copia de seguridad. De nada

Verificado: el proyecto está en el **plan gratuito de Supabase**, que **no incluye copias
automáticas**. No hay ningún respaldo propio: ni volcado de la base, ni exportación, ni nada en
n8n que saque datos. Y aunque el plan fuera de pago, **los archivos nunca entran** en esas
copias: las fotos de pasaporte, los contratos firmados, los recibos y los PDF **no tienen copia
en ninguna hipótesis**. La guía del proyecto afirmaba que Supabase hacía copias diarias; **eso ya
está corregido** durante la auditoría, porque un plan de recuperación falso es peor que ninguno:
impide que alguien monte uno de verdad.

**Qué se pierde:** todo. Clientes, cotizaciones, pagos, contratos firmados y pasaportes. La base
entera pesa **2,5 MB** — cabe en un correo—, así que lo que se está arriesgando por no montar la
copia es desproporcionado.

**Qué hacer:** un volcado semanal fuera de Supabase, disparado por el mismo programador de n8n
que ya manda los recordatorios. Y una copia, aunque sea manual y trimestral, de los dos cubos
irreemplazables —pasaportes y contratos, 10 MB entre los dos—. Detalle y trampas en la
«Decisión 1» de B6.

### 2.3 — Borrar un expediente firmado y pagado es un clic, sin preguntas

`deleteQuote` no comprueba nada: borra igual una cotización con contrato firmado, dinero cobrado
y documentación enviada, tras un «¿seguro?» genérico que no menciona ni una cosa ni la otra. Se
lleva por delante pagos, contratos, viajeros y la prueba completa de la firma electrónica. Y
**borrar es rutina**: se han emitido **84 códigos** y quedan **44 cotizaciones** (3-sep-2026; el
2-sep eran 83 y 45 — en 24 horas se creó una y se borró otra). Hoy hay **tres expedientes** con
contrato firmado o dinero cobrado que se borrarían igual.

Lo peor es lo que **sí** sobrevive: los archivos quedan sueltos en el almacenamiento —ya hay **dos
pasaportes** de cotizaciones borradas, `CS-2026-048` y `CS-2026-044`—. Se pierde el registro y se
conserva el dato personal, exactamente al revés de lo deseable.

**Qué se pierde:** una venta entera y su prueba legal, sin vuelta atrás porque tampoco hay copia
(2.2). Este punto y el anterior se agravan mutuamente.

**Qué hacer:** que borrar se niegue cuando haya contratos firmados o pagos registrados, y usar el
estado «cancelada», que ya existe. Toca estados de venta: se decide contigo.

### 2.4 — El editor del expediente pisa el precio tecleado a mano y deja viejo el reparto de habitaciones

Hay **dos editores de cotización** en la plataforma. El bueno —el que usan los otros caminos— solo
vuelve a tarifar si cambia la ruta, la modalidad, la fecha o el número de personas; respeta el
precio a mano y reescribe el reparto de habitaciones. El de la pantalla de Seguimiento **no hace
ninguna de las tres cosas**:

- **Pisa el precio a mano.** El autorrelleno se dispara al abrir el expediente, no solo al editar,
  y devuelve la base al precio de catálogo. Casos vivos y ya enviados al cliente (1-sep-2026):
  **CS-2026-077** (585 € tecleados contra 625 € de catálogo) y **CS-2026-060** (800 € contra 790 €).
- **Nunca reescribe el reparto de habitaciones.** Y de ese campo salen tres cosas: la línea
  «Habitaciones» del **pedido a Pilgrim**, la acomodación del **contrato firmado** y las tarjetas
  del PDF. Caso vivo: **CS-2026-080**, 14 personas con un reparto de 8 dobles —16 camas—, estado
  «enviada» (1-sep-2026). Es la única fila donde las camas no cuadran con las personas.
- **Guardar sin cambiar nada regenera el PDF** que el cliente ya tiene en su correo, y con él se
  quema el único rastro que había de la versión anterior.

**Qué se pierde:** dinero cobrado de menos sin que nadie lo note (40 € y 10 € en los dos casos
vivos, y lo que venga), y un pedido al proveedor con dos camas de más que se factura igual.

**Qué hacer:** que la pantalla llame al editor bueno en vez de tener el suyo. **Los bloques 1 y 2
llegaron a esta misma propuesta por caminos distintos** —B1 por el precio y las habitaciones, B2
por lo que pasa con dos pestañas abiertas—, y eso es reuso, no obra nueva. Queda un cabo: el
editor bueno no acepta un precio a mano, y la pantalla lo necesita para el año sin tarifa cargada.

**Y ya que se toca:** revisar **CS-2026-080** antes de que salga su pedido a Pilgrim.

### 2.5 — El importe en euros de un pago no lo garantiza nada, y ya hay uno que es ficción

Cuando se registra un cobro en pesos o en dólares, el euro que queda guardado depende de que
alguien escriba bien la tasa, y **nada lo obliga**. Hay tres agujeros: los dólares no tienen ni
campo de tasa, los pesos aceptan la tasa vacía o en cero, y la moneda de la cuenta a la que entra
la plata **no la mira nadie**, aunque la función que la sabe leer está escrita y sin usar. Caso
vivo (1-sep-2026): **CS-2026-019** tiene un pago de **20,00 EUR** contra una cuenta en pesos y sin
tasa. Y la misma expresión está en la edición: **un pago hoy correcto se corrompe al editarlo**.

**Qué se pierde:** el saldo de un cliente deja de ser cierto. Se le puede reclamar plata que ya
pagó, o darle por pagado lo que no.

### 2.6 — Cobrar no mueve el estado, y por eso un cliente que pagó todo no recibe su documentación

Registrar un pago **no cambia el estado de la venta**. Hay que acordarse de moverlo a mano en un
desplegable. Y la tarjeta que genera la documentación de viaje **solo se dibuja si el estado dice
«pago completo»**: si a nadie se le ocurrió cambiarlo, la tarjeta ni existe. Firmar el contrato
tampoco mueve nada, y dos de los seis estados posibles no los ha usado nunca nadie.

**Qué se pierde:** la confianza de alguien que ya pagó y no recibe sus documentos, porque la
plataforma cree que no ha pagado. Le pasa hoy a **CS-2026-004** —970 € de 970 cobrados, salida el
22 de septiembre—: para mandarle la documentación hay que ir al desplegable, cambiar el estado y
recargar.

**Qué hacer:** que la puerta sea **el saldo y no la etiqueta**, y que al cobrar el estado se mueva
solo. Toca estados de venta: se decide contigo.

### 2.7 — Un opcional puede cotizarse a 0 € con un clic, sin ningún aviso

El sistema decide si un año tiene tarifa **contando filas, no precios**. Una fila creada y vacía
cuenta como año cargado, así que no se dispara el respaldo al año anterior ni sale el aviso ámbar
de «precio de respaldo»: el opcional se pinta a «0 € — 0 €» como si ese fuera su precio. Al
3-sep-2026 hay **exactamente dos filas así**: `Casco de bicicleta` y `Seguro a todo riesgo para la
bicicleta`, ambas de 2027, con los dos precios vacíos. Y hay **13 cotizaciones vivas con salida en
2027**.

**Qué se pierde:** con las tarifas de 2026 y dos personas, **188 € de venta regalados y 144 € de
costo real que Pilgrim factura igual**. Y como el costo también entra a cero, la utilidad del
expediente sale **inflada** justo en la línea que la destruye. Hoy no ha mordido —no hay ninguna
línea a 0 € en la base—, pero basta un clic en el camino normal de trabajo.

**Qué hacer, hoy mismo:** borrar esas dos filas vacías de 2027. Un minuto y reversible; los dos
opcionales vuelven al respaldo en ámbar de los otros catorce. Después, el arreglo de fondo: que un
año con la fila vacía se comporte como un año sin fila. El módulo de bicis **ya tiene esa guarda**
y por eso sus 35 filas sin precio no cotizan nada.

### 2.8 — Nadie persigue una cotización que no contestan, ni un saldo que vence

El único perseguidor automático del proyecto es el de la firma del contrato, y está bien hecho.
**Antes de la firma no hay nada.** Al 1-sep-2026: **16 de 39 cotizaciones estaban vencidas y
quietas**, con **3 aceptadas en total**. Y la plantilla de correo del aviso de saldo está escrita,
guardada y activa… **sin un solo llamador**, y usando una variable que no existe: si alguien la
enchufa hoy, sale un correo que dice «Saldo pendiente: **.**» — a un cliente, pidiéndole plata—.

**Qué se pierde:** esto es lo que **más plata deja sobre la mesa** de toda la auditoría. No es un
error que rompa nada; es una venta que se enfría sola. Por eso encabeza la parte 3, que es la de
lo que más rinde.

---

## 3. Lo que más rendiría

No por gravedad: **por lo que devuelve frente a lo que cuesta**. Las horas son las que estimó
cada bloque comparando con trabajo ya hecho en la plataforma; donde el bloque no estimó, se dice.

| # | Qué | Cuesta | Qué gana | Bloque |
|---|---|---|---|---|
| 1 | **Borrar las dos filas de precio vacías de 2027** (casco y seguro de bici) | **1 minuto**, reversible | Cierra hoy la fuga de los opcionales a 0 € (§2.7). Lo más barato de toda la auditoría | B5 |
| 2 | **Activar el rechazo de contraseñas filtradas** en Supabase | **1 clic** | La cuenta que abre pasaportes y contratos deja de admitir una contraseña ya publicada | B6 |
| 3 | **Los tres archivos de estado del panel** (cargando / error / no encontrado) | **30 min** | Cubre **las 15 pantallas de golpe**. Hoy el «no encontrado» del panel sale en inglés y sin salida | B7 |
| 4 | **Los cuatro apuntes del correo en n8n** (lista blanca del servidor del adjunto, orden de las dos ramas, secreto a variable, aviso de fallo) | **1,5 h**, a mano en n8n | Acota el daño si el secreto se filtra; y evita que un adjunto rechazado apague **a la vez** la copia al viajero y el aviso a Nico | B4 |
| 5 | **La franja «Hoy» en Seguimiento**: vencen esta semana · salen en 15 días con saldo · enviadas hace 7 días sin respuesta | **media jornada**; sin migración, sin consulta nueva, sin campo nuevo | Convierte el listado en **cola de trabajo**. Es la mitad barata de §2.8 y **la pidieron dos bloques por caminos distintos** | B2 + B7 |
| 6 | **La copia semanal de la base fuera de Supabase**, por n8n | pocas horas de montaje (no estimado) | La única red que hay debajo de §2.2 y §2.3. **Lo de más valor de toda la auditoría** | B6 |
| 7 | **Guardar el lead de la web antes de intentar el correo** | **3 h** | Hoy el correo *es* el único registro: si el envío falla, el lead desaparece. Y aparece por primera vez la cifra de **cuánta demanda de 2027 se está perdiendo**, que hoy es inaveriguable. **Lo encontraron B4 y B5 por separado** | B4 + B5 |
| 8 | **El aviso de saldo** (la plantilla ya está escrita) | **30 min** de arreglar la variable rota **+ 3 h** | Deja de depender de que Nico se acuerde. **La variable rota va primero**: hoy ese correo saldría diciendo «Saldo pendiente: .» | B4 |
| 9 | **Que la pantalla del expediente use el editor bueno** | no estimado | Cierra §2.4 entero —precio pisado, habitaciones viejas y la carrera de dos pestañas— con reuso, no con código nuevo | B1 + B2 |
| 10 | **Seguimiento de la cotización sin respuesta** (correo automático) | **3 h** | La otra mitad de §2.8. El robot de la firma ya es la plantilla exacta de cómo se hace | B4 |
| 11 | **Confirmación de pago recibido** | **2 h** | Corta la llamada de «¿les llegó?», que con clientes transfiriendo desde otro país está garantizada | B4 |
| 12 | **Marcar el contrato «enviado» solo cuando el correo haya salido de verdad** | **1 h** | Hoy se marca antes de enviar y no se revierte: un contrato que nunca salió entra igual en la escalera de recordatorios. Pasó de teórico a una hora al cablearse el registro de correos | B4 |
| 13 | **Un buzón para los rebotes de Brevo** | **4 h** | Hoy «enviada» significa «Brevo lo aceptó», no «llegó». Un correo mal tecleado desde un WhatsApp deja un ✓ verde y un cliente que cree que no le contestaron | B4 |
| 14 | **Guardas al borrar** (negarse si hay firma o pagos) | no estimado | Evita necesitar la copia de seguridad (§2.3) | B3 + B6 |

**Y tres cosas que no son programación, son catálogo.** Rinden porque hoy se están pagando en
cotizaciones a mano y en ofertas que no cuadran:

- **Cargar las etapas de las tres rutas publicadas que no tienen ninguna** (`Portugués Bici
  Oporto`, `Portugués desde Vigo`, `Primitivo Bici Oviedo`) y **completar las trece rutas
  descuadradas** que producen el error de §2.1. Hoy un cliente que pide una de esas tres recibe
  una cotización **sin itinerario**, que es justo lo que se compara entre agencias.
- **Pedirle a Pilgrim las tarifas de las cuatro rutas que se venden sin ninguna**: `Francés desde
  Saint Jean Pied de Port`, `Portugués desde Porto`, `Costero desde Porto` y `Norte desde
  Vilalba`. Son **32 precios** (4 modalidades × 4 rutas × 2 años) y hay **12.180 € ya cotizados**
  sobre ellas (3-sep-2026). En tres de esas cotizaciones el «costo Pilgrim» grabado es el precio
  de venta × 0,85: **no es un costo, es la regla de margen aplicada al revés**, así que su
  utilidad sale «15,0 %» pase lo que pase con la factura real.
- **Cargar las tarifas de 2027.** Al 3-sep-2026 solo **2 de las 11 rutas web** tienen algo de
  2027 (Sarria completa; Tui, 2 de 4 modalidades). El 1 de enero **todas las demás caen a la
  vez**.

### Lo que ya se arregló durante la auditoría — no hay que hacer nada

Buena parte de lo pequeño se corrigió sobre la marcha. Está desplegado o commiteado, y **no se
mezcla con lo pendiente de arriba**:

- **Los correos del contrato ya dejan rastro.** Era el único de los cuatro correos sin registro y
  el que más veces se manda: **once correos reales se habían perdido** sin dejar fila. Lo
  encontraron **B3 y B4 por separado**; se arregló una vez. Ahora los siete emisores y los nueve
  flujos registran.
- **Los PDF ya no parten las palabras** («per-sonalizada», «2 individ-uales» salían en
  documentos reales) y el teléfono y el correo del cliente **ya no se salen de la hoja** del
  Documento de Viaje con un nombre de ruta largo (medido: antes se desbordaba a partir de 74
  caracteres).
- **Las tres páginas públicas por enlace** ya no filtran su dirección al navegar fuera ni las
  indexan los buscadores.
- **Dos formularios que se quedaban mudos** si algo reventaba ahora dicen qué pasó; `/cotizar`
  dejó de prometer una descarga que no existía; y el asistente ya distingue «el catálogo está
  vacío» de «el catálogo falló» —que era peligroso, porque invitaba a teclear un precio a mano
  dando por hecho que no había tarifa—.
- **Seguimiento y Calendario dejaron de enseñar ceros y «sin cotizaciones»** cuando la consulta
  falla: antes el aviso de error convivía con un vacío que mentía.
- **La tarjeta de correo respeta el interruptor «activa»** de la plantilla (antes apagarla la
  seguía enviando desde el CRM), **el desempate entre dos hoteles de la misma localidad ya es
  estable** (decidía Postgres, y hoy hay dos hoteles en las 6 localidades), el botón de borrar
  pasó de 15×15 a 27×27 píxeles, volvió el contorno de foco a dos campos, los avisos de error se
  anuncian a los lectores de pantalla y se unificaron sus cinco versiones distintas.
- **La guía del proyecto dejó de afirmar que Supabase hace copias diarias**, y el mensaje de
  estado inválido dejó de decir que «Sin enviar» no es un estado válido, siendo el estado inicial
  de toda cotización.

---

## 4. Lo que un CRM de agencia trae y aquí falta

Contra los ocho puntos de `CRITERIOS.md`, y **solo lo que le aplica a una agencia de dos
personas**. Los ocho, con su nota:

**1. Cotizar rápido y sin equivocarse — casi entero.** El asistente autocarga tarifa, días,
fecha de fin, etapas y las tarjetas del PDF en cuanto se elige ruta, alojamiento y fecha; el
buscador de cliente por teléfono evita reteclear; los precios están por año y con bitácora.
Faltan dos cosas: **no se puede duplicar una cotización que ya existe** —el motor para hacerlo ya
está escrito, se usa en otro sitio— y **las tarifas no tienen vigencia, tienen año**. Las
columnas «desde» y «hasta» existen en la base y están **vacías en las 51 filas** (3-sep-2026), y
la «temporada» tiene un único valor. O sea: no se puede cargar una subida a mitad de año ni una
temporada alta sin pisar el precio del año entero. Y ese mismo mecanismo es el que produce el
opcional a 0 € de §2.7.

**2. Saber en qué va cada venta sin preguntar — a medias.** El expediente contesta muy bien «cómo
va esta venta». Lo que no contesta nunca es **«cuál abro»**: la lista está ordenada por número de
cotización, o sea por antigüedad, y ninguna de sus siete columnas dice **qué falta hacer**. No
consulta los contratos, así que quién firmó y quién no es invisible desde ahí. Y la etiqueta
«enviada» no prueba que se haya enviado nada: **33 de 39 no tenían fecha de envío** (1-sep-2026).

**3. No dejar caer a nadie — es la pata más floja, y `CRITERIOS.md` dice que es la que más plata
deja sobre la mesa.** De las tres piezas del oficio, la plataforma tiene **una**: el recordatorio
de la firma del contrato, que además está bien hecho. Faltan el seguimiento de la cotización sin
respuesta, el aviso de saldo y la confirmación de pago. En los tres casos **el dato ya está en la
base y el patrón ya está escrito**.

**4. Los números cuadran solos — media contabilidad.** El lado del cliente está bien montado y la
tasa que se guarda es la del día del movimiento, que es lo correcto. Pero **al CRM no entra lo
que se le paga a Pilgrim**: al 1-sep-2026 había **6 pagos al proveedor por 2.617 €** contra
**47.750 € de costo**, y **15 salidas a menos de 60 días con 23.992 € sin registrar**. Lo más
probable es que a Pilgrim se le pague por fuera del CRM — y precisamente por eso «Margen real» y
«Saldo proveedor» son hoy **dos cifras sin respaldo** que ninguna pantalla advierte. Añádase el
euro del pago que nada garantiza (§2.5) y esto: **la agencia cobra en pesos y el cotizador
público no pinta ni un peso**. La tabla de tasas de cambio lleva **0 filas** desde que existe el
proyecto, el fallo se traga en silencio, y la cotización que se le promete al cliente por 30 días
**no archiva ningún peso**: lo que aguanta 30 días es el euro.

**5. Documentos y firma dentro — está, y es de lo mejor de la plataforma.** Cotización, contrato
y documentación salen de los mismos datos, sin reteclear; la firma aguanta como prueba; el
almacenamiento está bien pensado; los cinco generadores de PDF aguantan lo que se les eche. Lo
que falta es **poder modificar lo firmado**: un viajero no puede tener dos contratos, así que si
cambia algo, o miente el papel o se pierde la firma. Y una incoherencia que va a doler: las
condiciones del **Documento de Viaje** las cambias tú desde Configuración, pero **el articulado
del contrato vive en el código** —incluida la cláusula sexta, la de cancelación, con sus tramos
de días y sus penalidades del 15/50/80 %—. Las dos tienen que decir lo mismo. La primera vez que
Pilgrim mueva su política, lo natural es que se actualice el lado fácil y el contrato siga
diciendo lo viejo. Y no se guarda qué versión firmó cada quien: dentro de dos años, la única
forma de saberlo es abrir su PDF.

**6. El cliente se atiende solo — no.** No tiene un sitio: tiene **tres enlaces sueltos** que le
llegan en tres momentos distintos (la oferta, el contrato, la documentación). Para una agencia de
dos personas no hace falta un portal, pero sí que los tres enlaces lleven al mismo sitio.

**7. Rastro de lo que pasó — es el hueco más transversal de toda la auditoría.** **Ninguna de las
tres tablas de dinero tiene autor ni bitácora**: ni las cotizaciones, ni los pagos de cliente, ni
los del proveedor. Hay una columna «creado por» en cotizaciones que está **vacía en todas las
filas y no la escribe ni la lee nadie**: finge un rastro que no existe. Y hay un caso concreto:
**borrar un pago no deja rastro y hace que el siguiente recibo reutilice un número ya
entregado**. En la bitácora del catálogo, que sí existe, **40 de 67 entradas no dicen quién**
—son los cambios hechos desde el editor SQL—. Cuando llegue una queja, esto es la diferencia
entre saber y creer.

**8. Un proveedor no es texto libre — la mitad sí, la mitad no.** Los precios, los opcionales y
las bicis son datos por año con su bitácora: ahí está resuelto. Pero **el alojamiento del
itinerario es texto escrito a mano**: de **289 etapas, 280 traen el alojamiento como texto
libre** —**94 formas distintas de escribirlo**— frente a **12 fichas de hotel**, y entre unos y
otros **no hay ninguna relación en la base**: el prellenado del Documento de Viaje une las dos
cosas **comparando cadenas de texto**, y acierta **74 de 280 noches, el 26,4 %** (3-sep-2026).
El resto se escribe a mano cada vez, y una tilde de más rompe el emparejado sin avisar. Lo mismo
con la ruta del expediente: **vacía en 32 de 44 cotizaciones**, guardada como nombre. Y falta lo
que en el oficio se da por hecho: **no hay cupo ni «confirmado con el proveedor»** —la
disponibilidad solo existe como prosa en un correo— y **el costo estimado nunca se enfrenta a la
factura real**.

**Y dos cosas del uso diario que también son del listón:** en el **celular no hay navegación**
—la barra lateral desaparece y no la sustituye nada, así que desde el teléfono solo se puede ir
hacia atrás—, y **los números de dinero están pintados en un dorado que no se lee**: 2,13 de
contraste donde hace falta 3,0. Los dos, verificados por reconstrucción y no por uso (ver la
lista final).

---

## 5. Lo que se decidió no hacer

Vale tanto como lo anterior: es donde **no** hay que volver a gastar tiempo.

**Sitios donde se buscó un problema y no lo había.** Están medidos, no supuestos:

- **Las cuatro puertas de cotización: no hay ningún GRAVE ahí.** Se recorrieron una por una
  buscando el desastre que se temía —cobrar una salida de 2027 con tarifa de 2026, en silencio—.
  **No ocurre por ninguna** (3-sep-2026): WordPress y BayMax comparten el mismo cálculo y exigen
  coincidencia exacta de año —si falta, devuelven error y **no crean nada**—; `/cotizar` sí
  caería al año anterior, pero **nadie la ha usado jamás** (0 cotizaciones); y el asistente del
  CRM, por donde entra el 89 %, **avisa en ámbar** antes de dejar teclear. Que nadie repita este
  recorrido.
- **Los márgenes.** Barridas 74 filas: **ninguna por debajo del costo**.
- **Los estados de la base.** No hay ni un estado imposible en ninguna cotización.
- **Cobrar mientras otro edita no choca**, y los filtros, la búsqueda y el orden de Seguimiento
  están bien resueltos.
- **Las cascadas de borrado están pensadas**, no puestas por defecto, y los dos casos que dejan
  el dato en blanco en vez de borrarlo son deliberados.
- **El cubo de fotos de hoteles no tiene huérfanos**: sus 32 objetos se referencian desde la
  ficha del hotel. Cualquier arqueo que no lo contemple dará 32 falsos positivos.
- **Al navegador no llega ni un secreto**, los 13 endpoints están cerrados uno por uno, el uso
  de la llave de servicio está justificado en los 23 sitios donde aparece, y el esquema de la
  base aguanta el escrutinio. El rendimiento está **medido**, no supuesto.
- **El robot de recordatorios de la firma está bien pensado** (renueva el enlace en cada envío) y
  **que el enlace de documentación no caduque es correcto**, no un descuido.
- **El módulo de bicis es el mejor cerrado del catálogo**, aunque esté a medio nacer: tiene la
  guarda que le falta a los opcionales.

**Cosas que se descartaron a propósito, con el motivo:**

- **Plantillas de cotización por ruta.** El asistente ya autocarga todo; una plantilla encima
  ahorraría dos clics. El hueco real es **duplicar una cotización que ya existe**.
- **Versionado completo con historial navegable.** Maquinaria de más para dos personas: con no
  pisar el PDF ya enviado y una bitácora de los campos de dinero se cubre el problema real.
- **Una máquina de estados.** El problema no es que falte: es que cobrar y firmar no mueven nada.
- **Recibir dentro del CRM las respuestas del cliente.** El «responder a» está bien puesto y las
  respuestas caen en `reservas@`, que en una agencia de dos personas es donde tienen que caer.
- **Permisos por rol.** La propia vara lo excluye: son dos personas. Se anota que hoy una tercera
  cuenta lo vería todo, incluidos los pasaportes — pero no es un hallazgo, es una consecuencia.
- **Embudos de veinte etapas, tableros arrastrables, panel de productividad, integraciones con
  sistemas de reservas aéreas.** No aplican.
- **Reescribir el editor de cotizaciones.** La propuesta no es hacer uno nuevo: es que la pantalla
  llame al que ya funciona.

**Dos cosas que dos bloques miraron y aquí se cuentan una sola vez**, porque contarlas dos infla
la lista y le quita credibilidad al resto:

- **«Faltan tests»** no entra como hallazgo propio. Lo que B6 escribió son **tres roturas
  concretas con su prueba mínima**, y esas tres roturas **ya están levantadas** en B1, B3 y B4 con
  su etiqueta. Es el plan de arreglo de aquellas, no una entrada más.
- **«Sobran clics»** tampoco. Los cinco pasos de más que se contaron son exactamente los
  hallazgos de §2.4, §2.6 y la franja «Hoy», vistos desde el trabajo diario. La lectura es útil
  para priorizar; el recuento sería doble.

**Y tres cosas que se anotaron y no se tocaron a propósito**, por la regla de la auditoría de no
meter mano en migraciones ni en estados de venta: el índice duplicado de la tabla de
documentación, la falta de fecha de caducidad del pasaporte, y que la versión web de un correo
(`/correo/[token]`) sea la única puerta pública **que no se puede apagar** —el contrato caduca y
la documentación se puede revocar; esa no—. Hoy es menor porque la tabla tiene 12 filas
(3-sep-2026), pero crece sola.

---

## Lo que tienes que decidir o hacer tú

Recogido de las secciones «Para Nico» de los siete bloques. **No se repite aquí lo que ya está
en la parte 2** —llamar a los dos viajeros sin firmar, avisar a la clienta de CS-2026-081, montar
la copia de seguridad, poner guardas al borrar, borrar las dos filas de precio vacías de 2027, y
decidir si cobrar mueve el estado—.

1. **¿Alguien movió la fecha de salida de CS-2026-080 el 2 de septiembre a las 13:44?** Hoy esa
   cotización (Costero desde Baiona, 13 personas, 8.350 €) cuadra: sale el 17-oct y termina el
   24-oct, y eso es lo que dice su PDF. Pero la auditoría la leyó saliendo el 18-oct. **Si la
   fecha se movió, hay un PDF con las fechas viejas en manos de un grupo de 13 personas** y hay
   que reenviarlo. Si fue un error de lectura, no hay nada que hacer.

2. **Mira cuatro o cinco de los 25 archivos `CS-TEST-*` del cubo de pasaportes** (Dashboard →
   Storage, diez minutos) y decide. Son 500-700 kB cada uno, o sea fotos de cámara o de celular,
   no imágenes de relleno; son del 28-jul, la ronda de pruebas de contratos por viajero. Si son
   de relleno, se borran sin más. Si son tuyos o de Naty, se borran. **Si hay el pasaporte de un
   tercero, se borra ya**: es un dato personal en producción sin ninguna finalidad que lo
   justifique. Aparte están **los 2 huérfanos reales** —`CS-2026-048` y `CS-2026-044`, pasaportes
   de clientes cuyas cotizaciones se borraron—. Y de paso, escribe la regla que hoy no existe:
   **el pasaporte se borra a los 30 días de terminado el viaje**, aunque al principio se ejecute
   a mano una vez por temporada.

3. **Activa el rechazo de contraseñas filtradas** en Supabase (Authentication → Policies). Un
   clic, sin código y sin riesgo, en una cuenta cuyas credenciales abren pasaportes y contratos
   firmados.

4. **Decide el cierre de permisos de la base** (la «Decisión 2» de B6). Hoy hay dos cerraduras
   posibles y solo una está echada: si algún día una regla se relaja por error, la otra puerta
   está abierta. No rompe nada, pero es producción y necesita tu sí.

5. **Pídele a Pilgrim dos cosas.** (a) Las **32 tarifas** de las cuatro rutas que se venden sin
   ninguna —4 modalidades × 4 rutas × 2026 y 2027—. (b) **La factura o la tarifa real de
   CS-2026-008, CS-2026-033 y CS-2026-081**, donde el «costo Pilgrim» grabado es el precio de
   venta × 0,85 y por tanto su margen sale «15,0 %» pase lo que pase.

6. **Decide cómo se guardan las tarifas.** Hoy la base promete «vigencias» (desde / hasta) y el
   código mira el año natural; esas dos columnas están vacías en las 51 filas. O se pasa a
   tarifar por vigencia, o se asume el año y **se borran esas columnas** para que no engañen. Lo
   que no puede quedarse es lo de ahora.

7. **Decide si el articulado del contrato se mueve a Configuración**, como ya están las
   condiciones del Documento de Viaje. Es lo que evita que un día digan cosas distintas sobre la
   misma política de cancelación. Es la letra de un contrato: no se toca sin ti.

8. **Decide qué se hace con `Norte desde Vilalba`**: está activa y vendida por 870 €, y no tiene
   días, ni noches, ni kilómetros, ni una sola tarifa. O se completa la ficha, o sale de
   circulación.

9. **Comprueba tres cosas del correo** que desde aquí no se pueden ver: que el dominio tenga
   puestas sus tres firmas de autenticación (DKIM, SPF y DMARC), que la dirección pública
   configurada en Railway sea la de la marca y no la de Railway, y la reputación de la cuenta en
   Brevo. Hoy **Statistics → Transactional de Brevo es el único sitio donde se ve si un correo
   rebotó**.

10. **Abre el panel desde tu teléfono y mira cuatro cosas.** Es el único hueco que la auditoría no
    pudo cerrar: **nadie ha visto el CRM con datos**, porque ningún agente puede iniciar sesión.
    Todo lo visual está verificado por reconstrucción. Con cuatro capturas se cierra: (a) un
    expediente con sus once tarjetas —cuánto hay que bajar para llegar al cobro—; (b) los números
    en dorado **a la luz del día, fuera de casa**; (c) Seguimiento con todas sus filas y la tabla
    desplazándose de lado; y (d) un error de carga provocado —quita la red y recarga— para ver que
    el aviso nuevo se lee y que no aparece ningún 0,00 €.

11. **Una pregunta pequeña:** ¿quieres que el asistente del CRM genere el PDF al crear la
    cotización, como hacen los otros tres caminos? Hoy es el único que no lo hace, y puede ser
    deliberado —tú revisas antes de mandar nada—. Si lo es, se deja como está y deja de figurar
    como pendiente.

---

`Estado: hecho`
