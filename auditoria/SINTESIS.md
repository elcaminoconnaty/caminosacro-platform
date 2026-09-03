# Síntesis — hoja de ruta

`Estado: en curso`

> **Por dónde voy (3-sep-2026):** partes 1 y 2 escritas. Faltan 3, 4, 5 y la lista final.
>
> Reglas de esta síntesis: los números **se copian con su fecha**, no se recalculan —en esta
> plataforma caducan en días—; lo que dos bloques vieron por caminos distintos **se cuenta una
> vez**, diciendo que llegaron dos; lo ya arreglado va aparte de lo pendiente; y lo que no se
> pudo comprobar se dice.

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
