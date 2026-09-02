# B3 — Contratos y documentos

**Cubre:** `ContractCard`, `contractActions`, `lib/contracts/**`, `contrato/[token]/**`, `TravelDocCard`, `travelDocActions`, `lib/travelDocs/**`, `documentacion/[token]/**`, `PilgrimFilesCard`, `lib/{quotePdf,travelDocPdf,asistenciaPdf,receiptPdf,pdfChrome}`

**Por qué importa:** Aquí está lo que el cliente firma y lo que se lleva al Camino. Y las tres rutas públicas sin sesión.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B3.1 Las rutas por token.** `/contrato`, `/documentacion`, `/correo`: entropía del token, caducidad, revocación, y **qué se filtra** — mira qué datos de terceros aparecen en cada página y en los nombres de archivo.
  `Estado: hecho` — la parte de seguridad está bien resuelta (256 bits de entropía, buckets privados,
  la firma revalida todo en el servidor); lo que falla es de trato: el viajero que vuelve a abrir su
  enlace ya firmado ve **«Enlace no válido»**, porque firmar pone el token en `null` y deja
  inalcanzable la rama amable. Y dos de las tres páginas no fijan `Referrer-Policy`.
- **B3.2 La firma como prueba.** Qué se guarda de la firma y si serviría en una disputa: quién, cuándo, desde dónde, sobre qué texto exacto. Ojo al límite de peticiones (ya se supo que va por token y no por IP).
  `Estado: en curso` — revisando qué queda guardado de cada firma (firmante, sello de tiempo, IP,
  user-agent, hash del PDF), si el hash prueba **el texto exacto** que se firmó, si se puede firmar
  dos veces o fuera de plazo, y el rate limit por token e IP.
- **B3.3 Los cinco generadores de PDF.** Textos largos, nombres larguísimos, 20 viajeros, campos vacíos. Busca desbordes, solapes y datos que se quedan en blanco sin avisar. Renderiza de verdad con `scripts/docs_smoke.tsx`.
  `Estado: pendiente`
- **B3.4 Storage.** Rutas y políticas de los buckets, archivos huérfanos, qué se borra al borrar una cotización. **Pasaportes**: quién puede llegar a ellos y por cuánto tiempo.
  `Estado: pendiente`
- **B3.5 Coherencia entre los tres documentos.** Cotización, contrato y documentación de viaje salen de los mismos datos: comprueba que dicen lo mismo (precio, fechas, personas, condiciones) en un expediente real.
  `Estado: pendiente`
- **B3.6 Qué pasa al borrar.** Borrar una cotización con contratos firmados, documentación enviada y archivos de Pilgrim. ¿Cascadas correctas? ¿Se puede borrar algo que no debería borrarse?
  `Estado: pendiente`

---

## Hallazgos

### [MEDIO] El viajero que vuelve a abrir su contrato firmado ve «Enlace no válido» — `contrato/[token]/page.tsx:38-47` · `contrato/[token]/actions.ts:186`

`page.tsx` tiene escrita la rama amable para este caso, con su mensaje y su fecha:

```tsx
if (contract.status === "firmado") {
  return <Aviso titulo="¡Contrato ya firmado!" detalle={`Este contrato fue firmado el …`} />;
}
```

**Esa rama no se puede alcanzar nunca.** La página busca el contrato por `\.eq("token", token)`,
y `firmarContrato()` cierra la operación poniendo **`token: null`** (`actions.ts:186`, junto a
`token_expires_at: null`). Un contrato firmado ya no tiene token, así que la consulta no
devuelve fila y el flujo cae dos líneas antes, en el `if (!contract)`:

> «**Enlace no válido** — Este enlace de firma no existe o fue anulado. Escríbenos y te
> enviamos uno nuevo.»

Verificado en producción: los **3** contratos en estado `firmado` tienen los tres `token = null`.
O sea que hoy, si cualquiera de esas tres personas abre otra vez el enlace que tiene en su
correo —para comprobar que firmó, para enseñárselo a quien viaja con ella, o simplemente
porque le dio a «atrás»—, la plataforma le dice que su enlace **no existe o fue anulado** y la
manda a escribir a reservas@. Justo después de haber firmado un contrato y subido su
pasaporte. Es el momento de máxima desconfianza posible y el mensaje es el peor de los que
hay escritos.

No es un fallo de seguridad —anular el token al firmar está bien— es que la pantalla no
distingue «este token nunca existió» de «este token ya cumplió su función».

**Propuesta:** que la página, cuando no encuentre contrato por token, mire si hay uno firmado
para ese mismo enlace antes de dar el mensaje duro. La forma barata sin tocar el borrado del
token es guardar el token usado en otra columna (`token_used`) al firmar, o no anularlo y
apoyarse en el `status !== "enviado"` que ya se comprueba —el flujo de firma revalida estado y
expiración por su cuenta en el servidor (`actions.ts:79-84`), así que dejar el token vivo no
abre nada—. Con eso la rama que ya está escrita empieza a funcionar.

### [MENOR] Dos de las tres páginas públicas no fijan `Referrer-Policy` — `contrato/[token]/page.tsx` · `documentacion/[token]/page.tsx` vs `correo/[token]/route.ts:47`

`/correo/[token]` está cuidado al detalle: `Content-Security-Policy` restrictivo,
`X-Robots-Tag`, `Cache-Control: no-store` y **`Referrer-Policy: no-referrer`**. Las otras dos
rutas por token solo declaran `robots: { index: false, follow: false }` en su `metadata`, y no
hay ningún `headers()` global en `next.config.ts` que las cubra.

**Por qué es MENOR y no más:** el token va en el *path*, y el valor por defecto de los
navegadores modernos (`strict-origin-when-cross-origin`) manda solo el origen cuando el
destino es otro dominio — que es justo el caso del redirect a `*.supabase.co` del
descargador. Así que hoy el token no se filtra. Lo anoto porque la protección depende del
navegador y no de la plataforma, la página de documentación es **de token permanente** (no
caduca nunca, solo se revoca), y la vacuna es una entrada en `headers()` de `next.config.ts`
que además cubriría lo que se añada mañana. El propio proyecto ya demostró que sabe hacerlo,
en `/correo`.

### Lo que sí está bien: las tres rutas por token

Es el bloque mejor construido de lo auditado hasta ahora, y conviene dejarlo dicho con
detalle porque son las tres puertas sin sesión de la plataforma.

- **Entropía sobrada.** `randomBytes(32).toString("hex")` en los tres generadores
  (`contracts/render.ts:167`, `travelDocs/render.ts:22` y el de correo): **256 bits**, 64
  caracteres hex. No hay nada que adivinar, y las tres páginas rechazan de entrada cualquier
  token de menos de 32 caracteres antes de tocar la base.
- **Los tres buckets sensibles son privados.** Verificado en `storage.buckets`: los nueve
  `comercial-*` —incluido `comercial-passports`— tienen `public = false`. Los únicos públicos
  son los tres del Estudio de Contenido, que está fuera de alcance.
- **Nada se sirve desde Storage directamente.** El descargador
  (`documentacion/[token]/descargar/[doc]/route.ts`) valida el token, comprueba `revoked_at`,
  y **firma la URL en ese momento con 60 segundos de vida**, lo justo para el redirect. El
  enlace que el peregrino tiene en el correo es estable y no caduca; lo que caduca es la
  firma. Es la solución correcta al problema que el propio archivo explica en su cabecera.
- **`/correo/[token]` sirve el HTML exacto que se envió**, guardado en `email_log`, y no lo
  vuelve a armar — con el motivo escrito: si se regenerara, un cambio de plantilla haría que
  esa página dijera algo distinto de lo que el cliente tiene en su bandeja, y en el caso de la
  cotización ese correo **es la oferta comercial**. Encima lo sirve con `default-src 'none'`.
  Es criterio de oficio, no de programador.
- **Caducidad y revocación, cada una donde toca.** El contrato tiene `token_expires_at` y se
  puede anular a mano (`contractActions.ts:607` pone `token: null` y devuelve el contrato a
  `borrador`). La documentación de viaje **no caduca a propósito** —el peregrino la abre
  durante el viaje y meses después— y a cambio tiene `revoked_at`, que las dos rutas
  comprueban.
- **No se filtran datos de terceros.** `ContractVariables` es de **un** viajero: nombre,
  documento, correo, teléfono y dirección suyos, más los datos del viaje que comparte el
  grupo (ruta, fechas, personas, total). Un viajero de un grupo de 14 no ve el pasaporte, el
  correo ni el teléfono de los otros trece. Y los nombres de archivo de Storage no llevan
  datos personales: el pasaporte se guarda como
  `comercial-passports/2026/CS-2026-034/Pasaporte-CS-2026-034-{marca}.jpg` —código y marca de
  tiempo, ningún nombre— mientras la atribución al viajero vive en
  `contracts.passport_path`, que es donde debe estar.
- **`PUBLIC_PATHS` de `proxy.ts:19-22` está cuadrado** con las rutas que existen: `/contrato`,
  `/documentacion` y `/correo` están, y el `some()` compara `path === p || path.startsWith(p + "/")`,
  así que no hay prefijos colados de más.

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
