import "server-only";

import { firmarPdf, firmarRuta } from "@/lib/quotes/pdfUrl";
import { congelarEntrega } from "@/lib/quotes/entregas";
import type { ComercialClient } from "@/lib/quotes/pdf";

// Adjuntos de los correos del contrato: el contrato y, con él, la cotización.
//
// El contrato dice que la cotización "hace parte integral de este Contrato como Anexo
// No. 1" y que el cliente "declara haber recibido copia". Hasta el 9-sep-2026 ningún
// correo del contrato la adjuntaba: iba solo el PDF del contrato, y el Anexo 1 quedaba
// en una frase. La relación de viajeros (Anexo 2) y el pagaré (Anexo 2 o 3) sí van
// dentro del propio PDF del contrato, así que no hay que adjuntarlos aparte.
//
// El workflow de n8n ("Correo Cotización — Camino Sacro") lee `attachments` y manda todos;
// `pdf_url` + `attachment_name` se siguen enviando con el contrato por compatibilidad.

export type AdjuntosContrato = {
  pdf_url: string | null;
  attachment_name?: string;
  attachments?: { url: string; name: string }[];
  /** Si la cotización quedó adjunta, para que el cuerpo del correo pueda decirlo. */
  conCotizacion: boolean;
};

export async function adjuntosContrato(
  supabase: ComercialClient,
  quoteId: string | null | undefined,
  contrato: { url: string | null; name: string },
  codigo: string,
): Promise<AdjuntosContrato> {
  const lista: { url: string; name: string }[] = [];
  if (contrato.url) lista.push({ url: contrato.url, name: contrato.name });

  // El Anexo 1 va CONGELADO (migración 0049), no leyendo el archivo vivo.
  //
  // El contrato dice que la cotización "hace parte integral de este Contrato" y que el
  // cliente "declara haber recibido copia". Adjuntando el PDF vivo, una regeneración
  // posterior a la firma dejaba el contrato apuntando a un documento distinto del que se
  // firmó. Ahora se adjunta la copia entregada, que no la toca nadie.
  //
  // `soloSiCambia` para que los recordatorios —que reenvían el mismo contrato cada pocos
  // días— no llenen el historial de entregas idénticas.
  //
  // Si la cotización no tiene PDF (o el enlace no se pudo firmar) el correo sale igual,
  // solo con el contrato: un anexo que falta no puede frenar una copia firmada.
  const entrega = quoteId
    ? await congelarEntrega(supabase, quoteId, { canal: "contrato", soloSiCambia: true }).catch(() => null)
    : null;
  const cotizacionUrl = entrega
    ? await firmarRuta(supabase, entrega.pdf_path).catch(() => null)
    : quoteId
      ? await firmarPdf(supabase, quoteId).catch(() => null)
      : null;
  if (cotizacionUrl) lista.push({ url: cotizacionUrl, name: `Anexo-1-Cotizacion-${codigo}.pdf` });

  return {
    pdf_url: contrato.url,
    attachment_name: contrato.url ? contrato.name : undefined,
    attachments: lista.length > 1 ? lista : undefined,
    conCotizacion: !!cotizacionUrl,
  };
}
