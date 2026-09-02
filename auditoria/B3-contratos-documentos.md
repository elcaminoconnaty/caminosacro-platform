# B3 — Contratos y documentos

**Cubre:** `ContractCard`, `contractActions`, `lib/contracts/**`, `contrato/[token]/**`, `TravelDocCard`, `travelDocActions`, `lib/travelDocs/**`, `documentacion/[token]/**`, `PilgrimFilesCard`, `lib/{quotePdf,travelDocPdf,asistenciaPdf,receiptPdf,pdfChrome}`

**Por qué importa:** Aquí está lo que el cliente firma y lo que se lleva al Camino. Y las tres rutas públicas sin sesión.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B3.1 Las rutas por token.** `/contrato`, `/documentacion`, `/correo`: entropía del token, caducidad, revocación, y **qué se filtra** — mira qué datos de terceros aparecen en cada página y en los nombres de archivo.
  `Estado: en curso` — leyendo cómo se generan y se validan los tres tokens (entropía, unicidad,
  caducidad, revocación), qué expone cada página pública sin sesión y qué datos personales viajan
  en los nombres de archivo de Storage. Comprobación cruzada contra `PUBLIC_PATHS` de `proxy.ts`.
- **B3.2 La firma como prueba.** Qué se guarda de la firma y si serviría en una disputa: quién, cuándo, desde dónde, sobre qué texto exacto. Ojo al límite de peticiones (ya se supo que va por token y no por IP).
  `Estado: pendiente`
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
