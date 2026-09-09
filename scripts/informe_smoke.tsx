// Humo: renderiza un contrato firmado CON Informe de Firmas, sin tocar la base, y lo deja
// en $SMOKE_OUT (o /tmp). Sirve para revisar la última página contra la muestra de ZapSign.
//   npx tsx --tsconfig scripts/tsconfig.json scripts/informe_smoke.tsx
//
// Importa el componente directo (no `renderContractPdfBuffer`): fuera de Next, el `import()`
// dinámico de render.ts carga una segunda copia de @react-pdf y revienta con "Font family
// not registered". Dentro de Next el paquete es externo y hay una sola instancia.
import { writeFileSync } from "node:fs";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ContractPDF } from "../src/lib/contracts/contractPdf";
import { sha256Hex, contarPaginas } from "../src/lib/contracts/render";
import { huellaLegible } from "../src/lib/contracts/firma";
import type { ContractVariables, PaymentPlan } from "../src/lib/contracts/template";
import type { InformeFirmasProps } from "../src/lib/contracts/informeFirmas";

const OUT = process.env.SMOKE_OUT || "/tmp";
const vars: ContractVariables = {
  codigo_cotizacion: "CS-2026-099", viajero_nombre: "AMALIA MATALLANA GÓMEZ", viajero_tipo_documento: "Pasaporte",
  viajero_documento: "AS748091", viajero_email: "amalia@ejemplo.com", viajero_telefono: "+57 350 567 0378",
  viajero_direccion: "Calle 10 # 20-30, Medellín", ruta_nombre: "Camino Francés — Sarria a Santiago", origen: "Sarria",
  destino: "Santiago de Compostela", fecha_inicio: "2026-09-24", fecha_fin: "2026-09-30", num_personas: "1",
  modalidad: "Pensión individual", habitaciones: "1 habitación individual", valor_total_eur: "1.234", valor_total_cop: "—",
  trm: "—", moneda: "EUR", fecha_cotizacion: "2026-09-01", validez: "15", incluye: "Alojamiento, desayunos, traslado de mochila",
  no_incluye: "Vuelos", opcionales: "", autoriza_imagen: "sí",
};
const plan: PaymentPlan = { type: "contado" } as PaymentPlan;
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const ID = "155f23eb-bdfb-492e-9d59-d8021e194453";

function renderContractPdfBuffer(
  variables: ContractVariables, plan: PaymentPlan, signature: unknown, orgSignature: string | null,
  travelers: unknown, extras?: { informe?: InformeFirmasProps | null; numero?: string | null },
): Promise<Buffer> {
  return renderToBuffer(React.createElement(ContractPDF as never, {
    variables, plan, signature, orgSignature, travelers: travelers ?? [], informe: extras?.informe ?? null, numero: extras?.numero ?? null,
  }) as never);
}

async function main() {
  const firma = { signer_name: vars.viajero_nombre, signer_document: vars.viajero_documento, signature_image: png,
    signed_at: "2026-09-09T15:41:06.000Z", signer_ip: "179.15.132.12",
    signer_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1",
    doc_hash: null };
  const original = await renderContractPdfBuffer(vars, plan, firma, null, null, { numero: ID });
  const informe: InformeFirmasProps = {
    numero: ID, documento: "Acuerdo de Prestación de Servicios Turísticos · Contrato No. CS-2026-099",
    creadoEn: "9 de septiembre de 2026, 10:38:29 a. m.", actualizadoEn: "9 de septiembre de 2026, 10:41:06 a. m.",
    huellaOriginal: huellaLegible(sha256Hex(original)), urlVerificacion: "https://caminosacro-platform-production.up.railway.app/verificar",
    paginas: contarPaginas(original) + 1,
    firmantes: [
      { rol: "camino_sacro", rolTexto: "Camino Sacro", token: ID, nombre: "NICOLÁS VILLA POSADA", documento: "Cédula de ciudadanía 1.017.126.076",
        email: "reservas@caminosacro.com", telefono: null, firmadoEn: "9 de septiembre de 2026, 10:38:29 a. m.", ip: null, dispositivo: null,
        ubicacion: null, metodo: "Firmado desde la plataforma al aprobar y enviar, con sesión autenticada", trazo: null },
      { rol: "contratante", rolTexto: "El Viajero", token: "df2957d4-7982-47c5-91ec-92dc594cb5ee", nombre: vars.viajero_nombre,
        documento: `Pasaporte ${vars.viajero_documento}`, email: vars.viajero_email, telefono: vars.viajero_telefono,
        firmadoEn: "9 de septiembre de 2026, 10:41:06 a. m.", ip: firma.signer_ip, dispositivo: firma.signer_user_agent,
        ubicacion: "6.244203, -75.581212", metodo: "Validado por código único enviado por correo electrónico", trazo: png },
    ],
  };
  let sellado = await renderContractPdfBuffer(vars, plan, firma, null, null, { informe, numero: ID });
  if (contarPaginas(sellado) !== informe.paginas) {
    informe.paginas = contarPaginas(sellado);
    sellado = await renderContractPdfBuffer(vars, plan, firma, null, null, { informe, numero: ID });
  }
  writeFileSync(`${OUT}/contrato-informe.pdf`, sellado);
  console.log("original", contarPaginas(original), "páginas → sellado", contarPaginas(sellado), "·", sellado.length, "bytes");
}
main().catch((e) => { console.error(e); process.exit(1); });
