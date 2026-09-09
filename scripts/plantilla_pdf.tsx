// Genera las dos plantillas del contrato (empresa y persona natural) con los campos en
// [CORCHETES], sin tocar la base, para mandarlas a revisión jurídica. Salida en
// $PLANTILLA_OUT (o /tmp), con sufijo $PLANTILLA_SUFIJO (por defecto la fecha yyyy-mm).
//   npx tsx --tsconfig scripts/tsconfig.json scripts/plantilla_pdf.tsx
//
// Igual que informe_smoke.tsx: importa el componente directo, porque fuera de Next el
// `import()` dinámico de render.ts carga otra copia de @react-pdf y revienta con fuentes.
import { writeFileSync } from "node:fs";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ContractPDF } from "../src/lib/contracts/contractPdf";
import type { ContractVariables, PaymentPlan, ViajeroAnexo } from "../src/lib/contracts/template";

const OUT = process.env.PLANTILLA_OUT || "/tmp";
const SUFIJO = process.env.PLANTILLA_SUFIJO || new Date().toISOString().slice(0, 7);

const base: ContractVariables = {
  codigo_cotizacion: "[No. DE COTIZACIÓN]",
  viajero_nombre: "[NOMBRE DEL VIAJERO]", viajero_tipo_documento: "[TIPO DE DOCUMENTO]", viajero_documento: "[NÚMERO]",
  viajero_email: "[CORREO DEL VIAJERO]", viajero_telefono: "[TELÉFONO]", viajero_direccion: "[DIRECCIÓN]",
  ruta_nombre: "[NOMBRE DE LA RUTA]", origen: "[ORIGEN]", destino: "[DESTINO]",
  fecha_inicio: "[FECHA DE INICIO]", fecha_fin: "[FECHA DE FIN]", num_personas: "[N]",
  modalidad: "[MODALIDAD]", habitaciones: "[ACOMODACIÓN]",
  valor_total_eur: "[VALOR TOTAL EN EUROS]", valor_total_cop: "[VALOR EN PESOS]", trm: "[TRM]", moneda: "EUR",
  fecha_cotizacion: "[FECHA DE LA COTIZACIÓN]", validez: "[N]",
  incluye: "[SERVICIOS INCLUIDOS SEGÚN COTIZACIÓN]", no_incluye: "[SERVICIOS NO INCLUIDOS SEGÚN COTIZACIÓN]",
  opcionales: "[OPCIONALES]", autoriza_imagen: "sí",
};

const empresa: ContractVariables = {
  ...base,
  contratante_tipo: "empresa",
  empresa_razon_social: "[RAZÓN SOCIAL]", empresa_nit: "[NIT]", empresa_direccion: "[DIRECCIÓN DE NOTIFICACIONES]",
  empresa_ciudad: "[CIUDAD]", empresa_email: "[CORREO DE NOTIFICACIONES]", empresa_telefono: "[TELÉFONO]",
  rep_nombre: "[NOMBRE DEL REPRESENTANTE LEGAL]", rep_tipo_documento: "[TIPO DE DOCUMENTO]", rep_documento: "[NÚMERO]",
};

// La versión financiada con pagaré es el texto más completo: es la que se imprime.
const plan: PaymentPlan = {
  type: "financiado",
  cuotas: [
    { n: 1, fecha: "2026-10-01", monto_eur: 500 },
    { n: 2, fecha: "2026-11-01", monto_eur: 500 },
    { n: 3, fecha: "2026-12-01", monto_eur: 234 },
  ],
  con_pagare: true,
};

const travelers: ViajeroAnexo[] = [
  { position: 1, nombre: "[VIAJERO 1]", documento_tipo: "Pasaporte", documento: "[NÚMERO]", autoriza_imagen: true },
  { position: 2, nombre: "[VIAJERO 2]", documento_tipo: "Pasaporte", documento: "[NÚMERO]", autoriza_imagen: null },
];

async function render(v: ContractVariables, t: ViajeroAnexo[]): Promise<Buffer> {
  return renderToBuffer(React.createElement(ContractPDF as never, {
    variables: v, plan, signature: null, orgSignature: null, travelers: t, informe: null, numero: null,
  }) as never);
}

async function main() {
  const salidas: Array<[string, ContractVariables, ViajeroAnexo[]]> = [
    [`Camino Sacro - Contrato plantilla - Empresa (${SUFIJO}).pdf`, empresa, travelers],
    [`Camino Sacro - Contrato plantilla - Persona natural (${SUFIJO}).pdf`, base, []],
  ];
  for (const [nombre, v, t] of salidas) {
    const pdf = await render(v, t);
    writeFileSync(`${OUT}/${nombre}`, pdf);
    console.log(nombre, "·", pdf.length, "bytes");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
