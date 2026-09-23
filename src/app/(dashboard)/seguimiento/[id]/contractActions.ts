"use server";

// Acciones del contrato de servicios (card Contrato en Seguimiento).
// El flujo público de firma vive en /contrato/[token] con sus propias acciones.
//
// Una cotización tiene N viajeros y N contratos, uno por persona. Por eso las
// acciones operan por `contractId` y no por cotización: la cotización ya no
// identifica un contrato único.
//
// DOS MODALIDADES (migración 0036). Si la cotización tiene `company_id`, quien contrata es
// una empresa y el contrato es UNO SOLO (`kind = 'empresa'`), a su nombre, firmado por su
// representante legal, con la relación de viajeros congelada en `travelers_json`. Ahí nadie
// firma individualmente, así que los pasaportes los carga el equipo desde el CRM
// (`subirPasaporteViajero`). Las dos modalidades son excluyentes y hay guardas para que no
// se mezclen: dos contratos vivos por el mismo viaje es un problema legal, no de UI.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createCommercialClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/errors";
import {
  buildDefaultVariables,
  buildTravelersAnexo,
  getFirmante,
  renderContractPdfBuffer,
  newContractToken,
} from "@/lib/contracts/render";
import {
  esEmpresa,
  esConjunto,
  FIRMANTE_POR_DEFECTO,
  PLAZO_FIRMA_CONJUNTO_DIAS,
  destinatarioContrato,
  refClausula,
  saludoContrato,
  type ContractVariables,
  type PaymentPlan,
  type ViajeroAnexo,
  type ParteContrato,
} from "@/lib/contracts/template";
import { sellarContratoConjunto } from "@/lib/contracts/conjunto";
import { enviarCorreoContrato } from "@/lib/contracts/email";
import { correoContratoParaFirma, correoFichaViajero } from "@/lib/contracts/correos";
import { adjuntosContrato } from "@/lib/contracts/adjuntos";
import { FICHA_TTL_DAYS, newFichaToken } from "@/lib/travelers/ficha";
import { rutaContrato, rutaContratoConjunto, rutaContratoEmpresa, rutaPasaporte, sinBucket } from "@/lib/storage/paths";

const TOKEN_TTL_DAYS = 21;

export type TravelerRow = {
  id: string;
  quote_id: string;
  position: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  is_holder: boolean;
  /** Pasaporte del viajero. Lo sube él al firmar, en su ficha, o el equipo desde el CRM. */
  passport_path: string | null;
  /** null = todavía no respondió la ficha. Distinto de false, que es "dijo que no". */
  autoriza_imagen: boolean | null;
  marketing_optin: boolean | null;
  ficha_sent_at: string | null;
  ficha_completed_at: string | null;
};

export type ContractRow = {
  id: string;
  quote_id: string;
  kind: "viajero" | "empresa" | "conjunto";
  org_signer: string;
  company_id: string | null;
  travelers_json: ViajeroAnexo[];
  traveler_id: string | null;
  variables_json: ContractVariables;
  payment_plan_json: PaymentPlan;
  status: "borrador" | "enviado" | "firmado" | "anulado";
  token: string | null;
  token_expires_at: string | null;
  pdf_path: string | null;
  signed_pdf_path: string | null;
  passport_path: string | null;
  signer_name: string | null;
  signer_document: string | null;
  signed_at: string | null;
  signer_ip: string | null;
  doc_hash: string | null;
  sent_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
};

/** Entrada del editor de viajeros: lo que el equipo teclea en el CRM. */
export type TravelerInput = {
  id?: string | null;
  full_name: string;
  email: string | null;
  phone?: string | null;
  document_number?: string | null;
};

// =============================================================
// Modalidad
// =============================================================

/**
 * ¿Esta cotización ya tiene un contrato de la otra modalidad?
 *
 * Las dos son excluyentes: un viaje no puede estar amparado a la vez por un contrato de
 * empresa y por contratos individuales — serían dos acuerdos vivos sobre el mismo objeto,
 * con dos obligados al pago. Se corta acá y no en la pantalla.
 */
async function contratoDeOtraModalidad(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  quoteId: string,
  quiero: "viajero" | "empresa" | "conjunto",
): Promise<string | null> {
  const { data } = await supabase
    .from("contracts")
    .select("kind")
    .eq("quote_id", quoteId)
    .neq("kind", quiero)
    .limit(1);
  if (!data?.length) return null;
  const otra = data[0].kind as string;
  const nombre: Record<string, string> = {
    empresa: "un contrato de empresa",
    viajero: "contratos por viajero",
    conjunto: "un contrato conjunto",
  };
  return `Esta cotización ya tiene ${nombre[otra] ?? "otro contrato"}. Anúlalo antes de cambiar de modalidad.`;
}

/** ¿Ya firmó alguien este contrato conjunto? Entonces su texto no puede cambiar. */
async function conjuntoConFirmas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contractId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("contract_signers")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", contractId)
    .not("signed_at", "is", null);
  return (count ?? 0) > 0;
}

const YA_FIRMO_ALGUIEN =
  "Ya firmó al menos una persona este contrato conjunto: cambiar el texto invalidaría su firma. " +
  "Si de verdad hay que cambiarlo, anula el contrato y créalo de nuevo; todos vuelven a firmar.";

/**
 * Sella en las variables quién firma por Camino Sacro, leyéndolo de `contracts.org_signer`.
 *
 * La columna manda, NO lo que llegue del formulario. La tarjeta manda el juego completo de
 * variables en cada guardado, y «Recargar desde cotización» las rearma desde cero — sin
 * `org_*`, porque la cotización no sabe quién firma. Sin esto, guardar o aplicar a todos
 * borraba el nombre del firmante y el PDF se iba al de por defecto, mientras `org_signer`
 * seguía diciendo Nathalia: su firma dibujada bajo el nombre de Nico. Es el mismo daño que
 * ya se corrigió en `getOrgSignature`, entrando por la otra puerta.
 */
async function conFirmante(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  slug: string | null | undefined,
  v: ContractVariables,
): Promise<ContractVariables> {
  const f = await getFirmante(supabase, slug);
  return { ...v, org_nombre: f.nombre, org_tipo_documento: f.documento_tipo, org_documento: f.documento };
}

async function persistirDatosEmpresa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  v: ContractVariables,
) {
  // `legal_name` y `nit` son NOT NULL: si el snapshot llegara sin ellos no se tocan, en
  // vez de tumbar el update entero.
  await supabase
    .from("companies")
    .update({
      ...(v.empresa_razon_social ? { legal_name: v.empresa_razon_social } : {}),
      ...(v.empresa_nit ? { nit: v.empresa_nit } : {}),
      address: v.empresa_direccion || null,
      city: v.empresa_ciudad || null,
      email: v.empresa_email || null,
      phone: v.empresa_telefono || null,
      rep_name: v.rep_nombre || null,
      rep_document_type: v.rep_tipo_documento || null,
      rep_document_number: v.rep_documento || null,
    })
    .eq("id", companyId);
}

// =============================================================
// Viajeros
// =============================================================

/**
 * Reemplaza la lista de viajeros de la cotización por la recibida.
 *
 * Los que ya tienen contrato NO se borran aunque desaparezcan de la lista: eso
 * arrastraría el contrato por el `on delete cascade` y, si estaba firmado,
 * destruiría una prueba legal. En ese caso se avisa y se conservan.
 */
export async function saveTravelers(
  quoteId: string,
  filas: TravelerInput[],
): Promise<{ ok?: true; aviso?: string; error?: string }> {
  const supabase = await createCommercialClient();

  const limpias = filas
    .map((f) => ({ ...f, full_name: (f.full_name || "").trim(), email: (f.email || "").trim() || null }))
    .filter((f) => f.full_name.length > 0);
  if (limpias.length === 0) return { error: "Hace falta al menos un viajero con nombre." };

  const { data: actuales } = await supabase
    .from("quote_travelers")
    .select("id,position")
    .eq("quote_id", quoteId);
  const { data: conContrato } = await supabase
    .from("contracts")
    .select("id,traveler_id,kind,status")
    .eq("quote_id", quoteId);
  const protegidos = new Set(
    (conContrato || []).map((c) => c.traveler_id as string | null).filter(Boolean) as string[],
  );
  // En el contrato conjunto cada viajero es firmante: tampoco se le puede borrar sin más.
  const conjunto = (conContrato || []).find((c) => c.kind === "conjunto");
  if (conjunto) {
    const { data: firmantes } = await supabase
      .from("contract_signers")
      .select("traveler_id")
      .eq("contract_id", conjunto.id);
    for (const f of firmantes || []) protegidos.add(f.traveler_id as string);
  }

  // Con contrato de empresa NINGÚN viajero tiene contrato propio, así que la guarda de
  // arriba no protege a nadie — y la lista está dentro de un anexo firmado. Firmado el
  // contrato, la relación de viajeros queda cerrada: se cambia con una sustitución (el
  // parágrafo de la cláusula de cesión), no borrando la fila.
  const empresaFirmada = (conContrato || []).some((c) => c.kind === "empresa" && c.status === "firmado");
  const conjuntoFirmado = conjunto?.status === "firmado";

  const conservados = new Set(limpias.map((f) => f.id).filter(Boolean) as string[]);
  const aBorrar = (actuales || [])
    .map((t) => t.id as string)
    .filter((id) => !conservados.has(id));

  // Firmado el anexo, no se quita ni se agrega gente: quien viaje sin estar en él viaja
  // sin contrato. Editar los datos de los que ya están (el pasaporte llega tarde) sí se
  // permite, que es justo lo que hace falta.
  const altas = limpias.filter((f) => !f.id).length;
  if (conjuntoFirmado && (aBorrar.length > 0 || altas > 0)) {
    return {
      error:
        "El contrato conjunto ya está firmado y estas son sus partes. " +
        `Para cambiar a alguien hay que tramitar una cesión (${refClausula(false, "cesion", true)}), no editar la lista.`,
    };
  }
  if (empresaFirmada && (aBorrar.length > 0 || altas > 0)) {
    return {
      error:
        "El contrato de empresa ya está firmado y esta es la lista de su Anexo No. 2. " +
        `Para cambiar a alguien hay que tramitar una sustitución (${refClausula(true, "cesion")}), no editar la lista.`,
    };
  }
  const bloqueados = aBorrar.filter((id) => protegidos.has(id));
  const borrables = aBorrar.filter((id) => !protegidos.has(id));

  if (borrables.length > 0) {
    const { error } = await supabase.from("quote_travelers").delete().in("id", borrables);
    if (error) return { error: mensajeError(error) };
  }

  // La posición se reasigna por orden de la lista para que quede densa (1..N).
  let posicion = 0;
  for (const f of limpias) {
    posicion++;
    const patch = {
      quote_id: quoteId,
      position: posicion,
      full_name: f.full_name,
      email: f.email,
      phone: f.phone ?? null,
      document_number: f.document_number?.trim() || null,
      is_holder: posicion === 1,
      updated_at: new Date().toISOString(),
    };
    if (f.id) {
      const { error } = await supabase.from("quote_travelers").update(patch).eq("id", f.id);
      if (error) return { error: mensajeError(error) };
    } else {
      const { error } = await supabase.from("quote_travelers").insert(patch);
      if (error) return { error: mensajeError(error) };
    }
  }

  revalidatePath(`/seguimiento/${quoteId}`);
  return {
    ok: true,
    aviso: bloqueados.length
      ? `${bloqueados.length} viajero(s) no se eliminaron porque ya tienen contrato. Anula su contrato primero si de verdad quieres quitarlos.`
      : conjunto && !conjuntoFirmado
        ? "Si cambiaste nombres, correos o pasaportes, dale a «Actualizar las partes del contrato» antes de enviarlo."
        : undefined,
  };
}

/** Precarga tantas filas vacías como personas tenga la cotización. */
export async function seedTravelersFromQuote(quoteId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("people,client_name,client_email,client_phone")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { error: "No encontré la cotización." };

  const personas = Math.max(1, Number(quote.people) || 1);
  const { data: existentes } = await supabase
    .from("quote_travelers")
    .select("id,position")
    .eq("quote_id", quoteId)
    .order("position");

  const yaHay = existentes?.length ?? 0;
  if (yaHay >= personas) return { ok: true };

  const nuevas = [];
  for (let p = yaHay + 1; p <= personas; p++) {
    nuevas.push({
      quote_id: quoteId,
      position: p,
      // Nombre provisional: el equipo lo reemplaza. No se deja vacío porque la
      // columna es NOT NULL y así la fila se ve en la tabla para editarla.
      full_name: p === 1 ? String(quote.client_name || "Viajero 1") : `Viajero ${p}`,
      email: p === 1 ? quote.client_email : null,
      phone: p === 1 ? quote.client_phone : null,
      is_holder: p === 1,
    });
  }
  const { error } = await supabase.from("quote_travelers").insert(nuevas);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}


/**
 * Cambia quién firma por Camino Sacro en este contrato (Nico o Nathalia).
 *
 * Escribe también el nombre y el documento dentro de `variables_json`: el articulado los
 * usa para nombrar a EL ORGANIZADOR, y tienen que quedar congelados con el resto del
 * contrato y no resolverse tarde contra los ajustes.
 */
export async function setOrgSigner(
  contractId: string,
  slug: string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id,variables_json")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado: no se puede cambiar quién firmó." };

  const f = await getFirmante(supabase, slug);
  const variables: ContractVariables = {
    ...(c.variables_json as ContractVariables),
    org_nombre: f.nombre,
    org_tipo_documento: f.documento_tipo,
    org_documento: f.documento,
  };
  const { error } = await supabase
    .from("contracts")
    .update({ org_signer: f.slug, variables_json: variables })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}

// =============================================================
// Ficha del viajero
// =============================================================
// El enlace que le pide a cada persona del grupo su pasaporte y sus autorizaciones. Nació
// con el contrato de empresa: ahí firma el representante legal y los viajeros no entran a
// ninguna pantalla, así que sus datos no había cómo pedírselos y el Anexo No. 2 salía con
// "pendiente" en todas las filas.

export async function enviarFichaViajero(
  travelerId: string,
  opts: { pruebaEmail?: string | null } = {},
): Promise<{ ok?: true; url?: string; emailEnviado?: boolean; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: t } = await supabase
    .from("quote_travelers")
    .select("id,quote_id,full_name,email,token")
    .eq("id", travelerId)
    .maybeSingle();
  if (!t) return { error: "No encontré el viajero." };

  const { data: q } = await supabase
    .from("quotes")
    .select("code,route_name,start_date,company_id")
    .eq("id", t.quote_id)
    .maybeSingle();

  let empresa: string | null = null;
  if (q?.company_id) {
    const { data: c } = await supabase.from("companies").select("legal_name").eq("id", q.company_id).maybeSingle();
    empresa = (c?.legal_name as string | null) ?? null;
  }

  // El token se conserva si ya existía: así un enlace que el viajero ya tiene guardado
  // sigue sirviendo aunque se le reenvíe el correo.
  const token = (t.token as string | null) || newFichaToken();
  const expires = new Date(Date.now() + FICHA_TTL_DAYS * 86400000).toISOString();
  const { error: errToken } = await supabase
    .from("quote_travelers")
    .update({ token, token_expires_at: expires })
    .eq("id", t.id);
  if (errToken) return { error: mensajeError(errToken) };

  const h = await headers();
  const url = `${baseUrl(h)}/viajero/${token}`;

  const esPrueba = !!opts.pruebaEmail;
  const destino = opts.pruebaEmail || (t.email as string | null);
  if (!destino) {
    return { ok: true, url, emailEnviado: false, error: `${t.full_name} no tiene correo.` };
  }

  const primerNombre = String(t.full_name || "").trim().split(/\s+/)[0] || "";
  const code = String(q?.code || "");
  // Texto y HTML del mismo correo, escritos una sola vez en `@/lib/contracts/correos`.
  const correo = correoFichaViajero({
    code,
    saludo: primerNombre,
    ruta: (q?.route_name as string | null) ?? null,
    fechaInicio: (q?.start_date as string | null) ?? null,
    empresa: empresa || null,
    url,
    dias: FICHA_TTL_DAYS,
    avisoPrueba: esPrueba ? `(Correo de PRUEBA. El destinatario real sería ${t.email || "—"}.)` : null,
  });
  const envio = await enviarCorreoContrato(
    {
      code,
      nombre: String(t.full_name || ""),
      email: destino,
      telefono: null,
      ruta: (q?.route_name as string | null) ?? null,
      fecha_inicio: (q?.start_date as string | null) ?? null,
      personas: 1,
      alojamiento: null,
      total_eur: null,
      pdf_url: null,
      subject: `${esPrueba ? "[PRUEBA] " : ""}${primerNombre}, necesitamos tus datos para el Camino - ${code}`,
      body: correo.texto,
      html: correo.html,
      // Sin aviso interno: lo dispara alguien del equipo desde el CRM.
      aviso: false,
    },
    { supabase, quoteId: t.quote_id as string, prueba: esPrueba, tipo: "ficha" },
  );

  if (envio.ok && !esPrueba) {
    await supabase.from("quote_travelers").update({ ficha_sent_at: new Date().toISOString() }).eq("id", t.id);
  }

  revalidatePath(`/seguimiento/${t.quote_id}`);
  return {
    ok: true,
    url,
    emailEnviado: envio.ok,
    error: envio.ok ? undefined : (envio.error ?? "No se pudo enviar el correo."),
  };
}

/** Manda la ficha a todos los que todavía no la han completado. */
export async function enviarFichasATodos(
  quoteId: string,
  opts: { pruebaEmail?: string | null } = {},
): Promise<{ ok?: true; enviados?: number; fallos?: string[]; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: travelers } = await supabase
    .from("quote_travelers")
    .select("id,full_name,ficha_completed_at")
    .eq("quote_id", quoteId)
    .order("position");
  if (!travelers?.length) return { error: "Primero carga los viajeros." };

  let enviados = 0;
  const fallos: string[] = [];
  for (const t of travelers) {
    if (t.ficha_completed_at) continue; // ya respondió: no se le insiste
    const r = await enviarFichaViajero(t.id as string, opts);
    if (r.error || !r.emailEnviado) {
      fallos.push(`${t.full_name}: ${r.error ?? "el servicio de correo no aceptó el envío"}`);
      continue;
    }
    enviados++;
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, enviados, fallos };
}

/** Cambia el firmante en todos los contratos sin firmar de la cotización. */
export async function setOrgSignerForQuote(
  quoteId: string,
  slug: string,
): Promise<{ ok?: true; actualizados?: number; omitidos?: number; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: contratos } = await supabase
    .from("contracts")
    .select("id,status")
    .eq("quote_id", quoteId);
  if (!contratos?.length) return { ok: true, actualizados: 0, omitidos: 0 };

  let actualizados = 0;
  let omitidos = 0;
  for (const c of contratos) {
    if (c.status === "firmado") { omitidos++; continue; }
    const r = await setOrgSigner(c.id as string, slug);
    if (r.error) return { error: r.error };
    actualizados++;
  }
  return { ok: true, actualizados, omitidos };
}

// =============================================================
// Pasaportes cargados desde el CRM
// =============================================================
// En el contrato por viajero cada uno sube el suyo al firmar. Con contrato de empresa
// nadie firma individualmente: la empresa manda los pasaportes y el equipo los carga acá.
// Se guardan en `quote_travelers.passport_path`, que es de donde el correo a Pilgrim saca
// los adjuntos en las dos modalidades.

const PASAPORTE_MAX_BYTES = 12 * 1024 * 1024;
const PASAPORTE_TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export async function subirPasaporteViajero(
  travelerId: string,
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const archivo = formData.get("pasaporte") as File | null;
  if (!archivo || archivo.size === 0) return { error: "No llegó ningún archivo." };
  const ext = PASAPORTE_TIPOS[archivo.type];
  if (!ext) return { error: "El pasaporte debe ser una imagen (JPG, PNG, WebP) o un PDF." };
  if (archivo.size > PASAPORTE_MAX_BYTES) return { error: "El archivo supera 12 MB." };

  const { data: t } = await supabase
    .from("quote_travelers")
    .select("id,quote_id,full_name")
    .eq("id", travelerId)
    .maybeSingle();
  if (!t) return { error: "No encontré el viajero." };

  const { data: q } = await supabase.from("quotes").select("code").eq("id", t.quote_id).maybeSingle();
  const code = String(q?.code || t.quote_id);

  // `rutaPasaporte` ya lleva marca de tiempo: subir uno nuevo no pisa el anterior.
  const ruta = rutaPasaporte(code, ext);
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from("comercial-passports")
    .upload(sinBucket(ruta), buffer, { contentType: archivo.type, upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr, "No se pudo guardar el pasaporte.") };

  const { error } = await supabase
    .from("quote_travelers")
    .update({ passport_path: ruta, updated_at: new Date().toISOString() })
    .eq("id", travelerId);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${t.quote_id}`);
  return { ok: true };
}

/**
 * Desvincula el pasaporte de un viajero. El archivo NO se borra de Storage a propósito: si
 * el viajero ya firmó, ese archivo es parte de la evidencia de su firma
 * (`contracts.passport_path` sigue apuntándole).
 */
export async function quitarPasaporteViajero(travelerId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: t } = await supabase
    .from("quote_travelers")
    .select("id,quote_id")
    .eq("id", travelerId)
    .maybeSingle();
  if (!t) return { error: "No encontré el viajero." };
  const { error } = await supabase
    .from("quote_travelers")
    .update({ passport_path: null, updated_at: new Date().toISOString() })
    .eq("id", travelerId);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${t.quote_id}`);
  return { ok: true };
}

// =============================================================
// Contrato de empresa
// =============================================================

/**
 * Crea el contrato único de la empresa. Idempotente: si ya existe, no hace nada (el índice
 * parcial `contracts_empresa_unica` lo garantiza también en la base).
 */
export async function createCompanyContract(
  quoteId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
  signerSlug?: string | null,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();

  const { data: quote } = await supabase.from("quotes").select("company_id").eq("id", quoteId).maybeSingle();
  if (!quote?.company_id) {
    return { error: "Esta cotización no tiene empresa contratante. Agrégala en «Editar cotización»." };
  }

  const choque = await contratoDeOtraModalidad(supabase, quoteId, "empresa");
  if (choque) return { error: choque };

  const { data: existing } = await supabase
    .from("contracts")
    .select("id")
    .eq("quote_id", quoteId)
    .eq("kind", "empresa")
    .maybeSingle();
  if (existing) return { ok: true };

  const viajeros = await buildTravelersAnexo(supabase, quoteId);
  if (viajeros.length === 0) {
    return { error: "Carga primero los viajeros: son el Anexo No. 2 del contrato." };
  }

  // Sin representante legal el contrato sale con líneas en blanco justo donde va quien
  // obliga a la empresa, y quien lo firme no queda identificado. Mejor no dejarlo nacer.
  const { data: emp } = await supabase
    .from("companies")
    .select("legal_name,nit,rep_name,rep_document_number,email,address")
    .eq("id", quote.company_id)
    .maybeSingle();
  const faltan = [
    !emp?.rep_name && "el nombre del representante legal",
    !emp?.rep_document_number && "su número de documento",
    !emp?.email && "el correo de notificaciones",
    !emp?.address && "la dirección de notificaciones",
  ].filter(Boolean) as string[];
  if (faltan.length > 0) {
    return {
      error:
        `Faltan datos de la empresa para el contrato: ${faltan.join(", ")}. ` +
        `Complétalos en «Editar cotización» → «Contrata una empresa». ` +
        `El representante legal y su cédula salen del certificado de existencia y representación legal, no del RUT.`,
    };
  }

  // Las variables de la empresa mandan sobre lo que traiga el formulario: si alguien las
  // editó en la cotización después de abrir la tarjeta, gana la cotización.
  const defaults = await buildDefaultVariables(supabase, quoteId);
  const variables: ContractVariables = defaults.ok
    ? { ...shared, ...datosEmpresaDe(defaults.variables) }
    : shared;

  // El firmante lo elige la tarjeta ANTES de que exista el contrato. Si aquí se quemara el
  // de por defecto, elegir a Nathalia y darle a «Crear» dejaba el contrato a nombre de Nico
  // con la pantalla diciendo lo contrario.
  const firmante = await getFirmante(supabase, signerSlug || FIRMANTE_POR_DEFECTO.slug);
  Object.assign(variables, {
    org_nombre: firmante.nombre,
    org_tipo_documento: firmante.documento_tipo,
    org_documento: firmante.documento,
  });

  const { error } = await supabase.from("contracts").insert({
    quote_id: quoteId,
    kind: "empresa",
    org_signer: firmante.slug,
    company_id: quote.company_id,
    traveler_id: null,
    variables_json: variables,
    payment_plan_json: plan,
    travelers_json: viajeros,
    status: "borrador",
  });
  if (error) return { error: mensajeError(error, "No se pudo crear el contrato de empresa.") };

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Solo las claves de empresa de un juego de variables. */
function datosEmpresaDe(v: ContractVariables): Partial<ContractVariables> {
  return {
    contratante_tipo: v.contratante_tipo,
    empresa_razon_social: v.empresa_razon_social,
    empresa_nit: v.empresa_nit,
    empresa_direccion: v.empresa_direccion,
    empresa_ciudad: v.empresa_ciudad,
    empresa_email: v.empresa_email,
    empresa_telefono: v.empresa_telefono,
    rep_nombre: v.rep_nombre,
    rep_tipo_documento: v.rep_tipo_documento,
    rep_documento: v.rep_documento,
  };
}

/**
 * Vuelve a congelar la relación de viajeros del anexo desde `quote_travelers`.
 *
 * Hace falta porque la lista se completa DESPUÉS de crear el contrato (los pasaportes van
 * llegando). Un contrato firmado no se toca: su anexo es parte de lo que se firmó.
 */
export async function refreshCompanyTravelers(
  contractId: string,
): Promise<{ ok?: true; viajeros?: number; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,kind,status,quote_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe." };
  if (c.kind !== "empresa") return { error: "Solo el contrato de empresa lleva anexo de viajeros." };
  if (c.status === "firmado") {
    return { error: "El contrato ya está firmado: su anexo no puede cambiar." };
  }

  const viajeros = await buildTravelersAnexo(supabase, c.quote_id as string);
  const { error } = await supabase.from("contracts").update({ travelers_json: viajeros }).eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true, viajeros: viajeros.length };
}

// =============================================================
// Contratos
// =============================================================

/** Variables precargadas para el contrato de un viajero concreto. */
export async function refreshContractVariables(
  quoteId: string,
  travelerId?: string | null,
): Promise<{ variables?: ContractVariables; error?: string }> {
  const supabase = await createCommercialClient();
  let seed = null;
  if (travelerId) {
    const { data } = await supabase
      .from("quote_travelers")
      .select("full_name,email,phone,document_type,document_number")
      .eq("id", travelerId)
      .maybeSingle();
    seed = data;
  }
  const defaults = await buildDefaultVariables(supabase, quoteId, seed);
  if (!defaults.ok) return { error: defaults.error };
  return { variables: defaults.variables };
}

/**
 * Crea el contrato de un viajero. Las variables compartidas (el viaje, los valores,
 * los textos del anexo) llegan revisadas desde la tarjeta; las del firmante se
 * sobrescriben con las del viajero para que cada contrato salga a su nombre.
 */
export async function createContractForTraveler(
  quoteId: string,
  travelerId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
  signerSlug?: string | null,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();

  const choque = await contratoDeOtraModalidad(supabase, quoteId, "viajero");
  if (choque) return { error: choque };

  const { data: existing } = await supabase
    .from("contracts")
    .select("id")
    .eq("traveler_id", travelerId)
    .maybeSingle();
  if (existing) return { ok: true }; // ya lo tenía: crear en lote es idempotente

  const { data: t } = await supabase
    .from("quote_travelers")
    .select("full_name,email,phone,document_type,document_number,is_holder")
    .eq("id", travelerId)
    .maybeSingle();
  if (!t) return { error: "No encontré el viajero." };

  const firmante = await getFirmante(supabase, signerSlug || FIRMANTE_POR_DEFECTO.slug);
  const variables: ContractVariables = {
    ...shared,
    org_nombre: firmante.nombre,
    org_tipo_documento: firmante.documento_tipo,
    org_documento: firmante.documento,
    viajero_nombre: t.full_name,
    viajero_email: t.email || "",
    viajero_telefono: t.phone || "",
    viajero_tipo_documento: t.document_type || "Pasaporte",
    viajero_documento: t.document_number || "",
    // La dirección del titular sí viene de la cotización; la de un acompañante no
    // se conoce hasta que firma.
    viajero_direccion: t.is_holder ? shared.viajero_direccion : "",
  };

  const { error } = await supabase.from("contracts").insert({
    quote_id: quoteId,
    kind: "viajero",
    org_signer: firmante.slug,
    traveler_id: travelerId,
    company_id: null,
    variables_json: variables,
    payment_plan_json: plan,
    status: "borrador",
  });
  if (error) return { error: mensajeError(error, "No se pudo crear el contrato.") };

  if (t.is_holder) await persistirDatosCliente(supabase, quoteId, variables);

  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true };
}

/** Crea de una vez los contratos que falten para todos los viajeros cargados. */
export async function createAllContracts(
  quoteId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
  signerSlug?: string | null,
): Promise<{ ok?: true; creados?: number; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: travelers } = await supabase
    .from("quote_travelers")
    .select("id")
    .eq("quote_id", quoteId)
    .order("position");
  if (!travelers?.length) return { error: "Primero carga los viajeros." };

  let creados = 0;
  for (const t of travelers) {
    const r = await createContractForTraveler(quoteId, t.id as string, shared, plan, signerSlug);
    if (r.error) return { error: r.error };
    creados++;
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, creados };
}

/** Guarda variables + plan de pago de un contrato. Un contrato firmado es inmutable. */
export async function saveContract(
  contractId: string,
  variables: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id,traveler_id,kind,company_id,org_signer")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe todavía." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado y no puede modificarse." };

  // Conjunto: las partes están congeladas en el contrato y ahí se quedan, llegue lo que
  // llegue del formulario; y con una firma adentro, el texto ya no se toca.
  if (c.kind === "conjunto") {
    if (await conjuntoConFirmas(supabase, c.id as string)) return { error: YA_FIRMO_ALGUIEN };
    const { data: actual } = await supabase.from("contracts").select("variables_json").eq("id", c.id).maybeSingle();
    const previas = (actual?.variables_json ?? {}) as ContractVariables;
    const selladas = await conFirmante(supabase, c.org_signer as string | null, {
      ...variables,
      ...datosConjuntoDe(previas),
    });
    const { error } = await supabase
      .from("contracts")
      .update({ variables_json: selladas, payment_plan_json: plan })
      .eq("id", c.id);
    if (error) return { error: mensajeError(error) };
    revalidatePath(`/seguimiento/${c.quote_id}`);
    return { ok: true };
  }

  const selladas = await conFirmante(supabase, c.org_signer as string | null, variables);
  const { error } = await supabase
    .from("contracts")
    .update({ variables_json: selladas, payment_plan_json: plan })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  // En el contrato de empresa lo editado vuelve a la ficha de la empresa, que es el
  // equivalente de lo que abajo se hace con el viajero y el cliente.
  if (c.kind === "empresa") {
    if (c.company_id) await persistirDatosEmpresa(supabase, c.company_id as string, selladas);
    revalidatePath(`/seguimiento/${c.quote_id}`);
    return { ok: true };
  }

  // El nombre/documento editados aquí también actualizan la ficha del viajero,
  // que es de donde salen los datos del correo a Pilgrim.
  await supabase
    .from("quote_travelers")
    .update({
      full_name: variables.viajero_nombre,
      email: variables.viajero_email || null,
      phone: variables.viajero_telefono || null,
      document_type: variables.viajero_tipo_documento || null,
      document_number: variables.viajero_documento || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.traveler_id as string);

  const { data: t } = await supabase
    .from("quote_travelers")
    .select("is_holder")
    .eq("id", c.traveler_id as string)
    .maybeSingle();
  if (t?.is_holder) await persistirDatosCliente(supabase, c.quote_id as string, variables);

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}

/** Aplica las variables compartidas a todos los borradores, respetando los datos
 *  propios de cada firmante. Útil tras cambiar fechas o valores del viaje. */
export async function applySharedToAll(
  quoteId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
): Promise<{ ok?: true; actualizados?: number; omitidos?: number; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: contratos } = await supabase
    .from("contracts")
    .select("id,status,variables_json,kind,org_signer")
    .eq("quote_id", quoteId);
  if (!contratos?.length) return { ok: true, actualizados: 0, omitidos: 0 };

  let actualizados = 0;
  let omitidos = 0;
  for (const c of contratos) {
    if (c.status === "firmado") { omitidos++; continue; }
    if (c.kind === "conjunto" && (await conjuntoConFirmas(supabase, c.id as string))) { omitidos++; continue; }
    const previas = c.variables_json as ContractVariables;
    // Se refresca lo común del viaje y se conservan los datos del firmante. Los de la
    // empresa NO se conservan a propósito: su verdad es la cotización, así que corregir
    // ahí un NIT y darle a "Recargar desde cotización" + "Aplicar" tiene que arreglarlo.
    const merged: ContractVariables = {
      ...shared,
      viajero_nombre: previas.viajero_nombre,
      viajero_email: previas.viajero_email,
      viajero_telefono: previas.viajero_telefono,
      viajero_tipo_documento: previas.viajero_tipo_documento,
      viajero_documento: previas.viajero_documento,
      viajero_direccion: previas.viajero_direccion,
      ...(c.kind === "conjunto" ? datosConjuntoDe(previas) : {}),
    };
    const { error } = await supabase
      .from("contracts")
      .update({
        variables_json: await conFirmante(supabase, c.org_signer as string | null, merged),
        payment_plan_json: plan,
      })
      .eq("id", c.id);
    if (error) return { error: mensajeError(error) };
    actualizados++;
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, actualizados, omitidos };
}

async function persistirDatosCliente(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  quoteId: string,
  variables: ContractVariables,
) {
  const { data: q } = await supabase.from("quotes").select("client_id").eq("id", quoteId).maybeSingle();
  if (!q?.client_id) return;
  await supabase
    .from("clients")
    .update({
      document_type: variables.viajero_tipo_documento || null,
      document_number: variables.viajero_documento || null,
      address: variables.viajero_direccion || null,
    })
    .eq("id", q.client_id);
}

/** Genera (o regenera) el PDF sin firmar del contrato, lo deja en Storage y
 *  devuelve un enlace firmado (10 min) para abrirlo de inmediato. */
export async function generateContractPdf(
  contractId: string,
): Promise<{ ok?: true; url?: string; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id,traveler_id,kind,travelers_json,variables_json,payment_plan_json,pdf_path")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe todavía." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado; descarga el firmado." };

  const empresa = c.kind === "empresa";

  let buffer: Buffer;
  try {
    buffer = await renderContractPdfBuffer(
      c.variables_json as ContractVariables,
      c.payment_plan_json as PaymentPlan,
      null,
      null,
      // El anexo sale del snapshot congelado, no de `quote_travelers`: el PDF tiene que
      // decir lo mismo que dirá el que se firme.
      empresa ? ((c.travelers_json as ViajeroAnexo[]) ?? []) : null,
    );
  } catch (e) {
    console.error("[generateContractPdf] render falló:", e);
    return { error: mensajeError(e as Error, "No se pudo generar el PDF del contrato.") };
  }

  // La posición del viajero entra en el nombre del archivo: si no, los contratos
  // de un mismo grupo se pisarían entre ellos en Storage.
  const { data: t } = c.traveler_id
    ? await supabase.from("quote_travelers").select("position").eq("id", c.traveler_id).maybeSingle()
    : { data: null };

  const vars = c.variables_json as ContractVariables;
  const code = vars.codigo_cotizacion || String(c.quote_id);
  const pdfPath = empresa
    ? rutaContratoEmpresa(code, false)
    : c.kind === "conjunto"
      ? rutaContratoConjunto(code, false)
      : rutaContrato(code, false, t?.position ?? null);
  const filePath = sinBucket(pdfPath);
  const { error: upErr } = await supabase.storage
    .from("comercial-contracts")
    .upload(filePath, buffer, { contentType: "application/pdf", upsert: true, cacheControl: "no-cache" });
  if (upErr) return { error: mensajeError(upErr) };

  const { error: dbErr } = await supabase
    .from("contracts")
    .update({ pdf_path: pdfPath })
    .eq("id", c.id);
  if (dbErr) return { error: mensajeError(dbErr) };

  const { data: signed } = await supabase.storage
    .from("comercial-contracts")
    .createSignedUrl(filePath, 60 * 10);

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true, url: signed?.signedUrl };
}

function baseUrl(h: Headers): string {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Activa (o renueva) el link público de firma y opcionalmente lo envía por correo.
 *
 * `pruebaEmail` desvía el correo a esa dirección sin tocar el destinatario real:
 * sirve para ensayar un envío de 20 contratos sin escribirle a nadie de verdad.
 */
export async function sendContractLink(
  contractId: string,
  opts: { email: boolean; pruebaEmail?: string | null },
): Promise<{ ok?: true; url?: string; emailEnviado?: boolean; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,token,quote_id,kind,travelers_json,variables_json,payment_plan_json,pdf_path")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe todavía. Guárdalo primero." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado." };

  // Asegura que el PDF de preview exista y refleje lo último guardado.
  const gen = await generateContractPdf(contractId);
  if (gen.error) return { error: gen.error };

  const esPrueba = !!opts.pruebaEmail;
  const token = c.token || newContractToken();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000).toISOString();

  // Primero SOLO el token: hace falta para construir el enlace que va dentro del correo.
  //
  // El estado se movía aquí también, ANTES de intentar el envío, y no se revertía si el
  // correo fallaba. Un contrato que nunca salió quedaba en «enviado» y entraba igual en la
  // escalera de recordatorios —el cron coge `status = 'enviado'` y, a falta de `sent_at`,
  // toma `created_at` como último contacto—: cinco correos recordándole a alguien que firme
  // algo que nunca recibió. Ahora el estado se mueve abajo, y solo si el correo salió.
  //
  // Cuando se pide el enlace SIN correo (`opts.email` falso) sí se marca «enviado» de una
  // vez: ahí el envío lo hace Nico a mano por WhatsApp, y el enlace ya está en la calle.
  //
  // Y un envío de PRUEBA ya no mueve el estado en absoluto —antes sí lo movía—: el correo
  // fue a la dirección de ensayo, así que el viajero sigue sin recibir nada y el contrato
  // no puede figurar como enviado.
  const { error } = await supabase
    .from("contracts")
    .update({
      token,
      token_expires_at: expires,
      ...(opts.email ? {} : { status: "enviado" }),
    })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  const h = await headers();
  const url = `${baseUrl(h)}/contrato/${token}`;

  let emailEnviado = false;
  let errorEmail: string | undefined;
  if (opts.email) {
    const vars = c.variables_json as ContractVariables;
    const empresa = esEmpresa(vars);
    // Quién recibe: el viajero, o la empresa por su correo de notificaciones.
    const { email: correoParte, nombre: nombreParte } = destinatarioContrato(vars);
    const destino = opts.pruebaEmail || correoParte;
    if (!destino) {
      return {
        ok: true,
        url,
        emailEnviado: false,
        error: empresa
          ? `${nombreParte || "La empresa"} no tiene correo de notificaciones. Agrégalo en «Editar cotización».`
          : `${nombreParte} no tiene correo.`,
      };
    }
    const viajerosAnexo = ((c.travelers_json as ViajeroAnexo[]) ?? []).length;
    // Enlace firmado al PDF de preview para que el viajero pueda leerlo desde el correo.
    let pdfUrl: string | null = null;
    const { data: fresh } = await supabase.from("contracts").select("pdf_path").eq("id", c.id).maybeSingle();
    if (fresh?.pdf_path) {
      const { data: signed } = await supabase.storage
        .from("comercial-contracts")
        .createSignedUrl(sinBucket(String(fresh.pdf_path)), 60 * 60 * 24 * 7);
      pdfUrl = signed?.signedUrl ?? null;
    }
    // Contrato + cotización (Anexo 1), para que lea los dos antes de firmar.
    const adjuntos = await adjuntosContrato(
      supabase,
      c.quote_id as string,
      { url: pdfUrl, name: `Contrato-${vars.codigo_cotizacion}${empresa ? "-empresa" : ""}.pdf` },
      vars.codigo_cotizacion,
    );
    const prefijo = esPrueba ? "[PRUEBA] " : "";
    // Texto y HTML del mismo correo, escritos una sola vez en `@/lib/contracts/correos`.
    const correo = correoContratoParaFirma({
      code: vars.codigo_cotizacion,
      empresa,
      saludo: saludoContrato(vars),
      razonSocial: vars.empresa_razon_social,
      nit: vars.empresa_nit,
      ruta: vars.ruta_nombre,
      fechaInicio: vars.fecha_inicio,
      personas: Number(vars.num_personas) || 1,
      viajerosAnexo,
      url,
      dias: TOKEN_TTL_DAYS,
      conCotizacion: adjuntos.conCotizacion,
      avisoPrueba: esPrueba ? `(Correo de PRUEBA. El destinatario real sería ${correoParte || "—"}.)` : null,
    });
    const envio = await enviarCorreoContrato({
      code: vars.codigo_cotizacion,
      nombre: nombreParte,
      email: destino,
      telefono: empresa ? vars.empresa_telefono || null : vars.viajero_telefono,
      ruta: vars.ruta_nombre,
      fecha_inicio: vars.fecha_inicio,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad,
      total_eur: null,
      pdf_url: adjuntos.pdf_url,
      attachments: adjuntos.attachments,
      subject: `${prefijo}${nombreParte} - Contrato para firma - ${vars.codigo_cotizacion}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      body: correo.texto,
      html: correo.html,
      attachment_name: adjuntos.attachment_name,
      // Sin aviso interno: lo dispara alguien del equipo desde el CRM. El aviso de
      // verdad llega cuando el cliente firma, que es lo que nadie está mirando.
      aviso: false,
      aviso_subject: `${prefijo}${nombreParte} - Contrato enviado para firma - ${vars.codigo_cotizacion}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      aviso_body: [
        esPrueba ? `PRUEBA: se envió a ${destino} en vez del viajero.` : `Se envió un contrato para firma.`,
        ``,
        `Contrato: ${vars.codigo_cotizacion}${empresa ? " (empresa)" : ""}`,
        `Cliente: ${nombreParte}`,
        `Ruta: ${vars.ruta_nombre || "-"}`,
        ``,
        `Cuando el cliente firme, te llegará el aviso de "Contrato firmado".`,
      ].join("\n"),
    }, { supabase, quoteId: c.quote_id as string, prueba: esPrueba });
    emailEnviado = envio.ok;
    errorEmail = envio.ok ? undefined : (envio.error ?? "No se pudo enviar el correo.");

    // El correo salió: ahora sí «enviado». Reenviar reinicia el ciclo de recordatorios —el
    // siguiente sale 4 días después de ESTE envío, no del anterior—. En modo prueba no se
    // toca ninguna de las dos cosas, para no meter contratos de ensayo en el cron.
    if (envio.ok && !esPrueba) {
      const { error: errEstado } = await supabase
        .from("contracts")
        .update({
          status: "enviado",
          sent_at: new Date().toISOString(),
          last_reminder_at: null,
          reminder_count: 0,
        })
        .eq("id", c.id);
      // Que esto falle no invalida un correo que ya salió: se avisa y se sigue. Lo peor que
      // pasa es que el contrato se quede sin entrar en la escalera de recordatorios.
      if (errEstado) console.error("[sendContractLink] el correo salió pero no pude marcar enviado:", errEstado);
    }
  }

  revalidatePath(`/seguimiento/${c.quote_id}`);
  // El motivo sube con `ok: true` a propósito, igual que el caso de "no tiene correo": el
  // enlace SÍ quedó creado y sirve, lo que falló es el correo. Enviar en lote lo usa para
  // decir por qué falló cada uno en vez de repetir "el servicio no aceptó el envío".
  return { ok: true, url, emailEnviado, error: errorEmail };
}

/** Envía para firma todos los contratos que aún no estén firmados. */
export async function sendAllContractLinks(
  quoteId: string,
  opts: { pruebaEmail?: string | null },
): Promise<{ ok?: true; enviados?: number; fallos?: string[]; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: contratos } = await supabase
    .from("contracts")
    .select("id,status,variables_json")
    .eq("quote_id", quoteId);
  if (!contratos?.length) return { error: "Todavía no hay contratos creados." };

  let enviados = 0;
  const fallos: string[] = [];
  for (const c of contratos) {
    if (c.status === "firmado") continue;
    const vars = c.variables_json as ContractVariables;
    // El conjunto no tiene un destinatario: cada firmante que no ha firmado recibe el suyo.
    if (esConjunto(vars)) {
      const { data: firmantes } = await supabase
        .from("contract_signers")
        .select("id,nombre,signed_at")
        .eq("contract_id", c.id)
        .order("position");
      for (const f of firmantes ?? []) {
        if (f.signed_at) continue;
        const r = await sendJointLink(f.id as string, { email: true, pruebaEmail: opts.pruebaEmail });
        if (r.error || !r.emailEnviado) {
          fallos.push(`${f.nombre}: ${r.error ?? "el servicio de correo no aceptó el envío"}`);
          continue;
        }
        enviados++;
      }
      continue;
    }
    const r = await sendContractLink(c.id as string, { email: true, pruebaEmail: opts.pruebaEmail });
    if (r.error || !r.emailEnviado) {
      fallos.push(`${destinatarioContrato(vars).nombre}: ${r.error ?? "el servicio de correo no aceptó el envío"}`);
      continue;
    }
    enviados++;
  }
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, enviados, fallos };
}

/** Anula el link de firma (invalida el token). */
export async function revokeContractLink(contractId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado." };
  const { error } = await supabase
    .from("contracts")
    .update({ token: null, token_expires_at: null, status: "borrador" })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}

// =============================================================
// Contrato conjunto (migración 0054)
// =============================================================
//
// Un solo contrato con todos los viajeros como parte, obligados solidariamente por el
// total, y un enlace de firma POR PERSONA (`contract_signers`). Es opcional: se elige en
// la tarjeta cuando el grupo compra un único plan y quiere un solo documento. Las reglas
// que salen de la revisión legal (sep-2026) se hacen cumplir acá, no en la pantalla:
//
//   - cada viajero con su propio correo (el código prueba quién firmó; dos con el mismo
//     correo no se distinguen), su nombre y su documento — sin blancos en el contrato;
//   - tantos firmantes como personas cotizadas: si alguien viaja sin firmar, no sirve;
//   - sin pagaré;
//   - desde la primera firma el texto queda congelado;
//   - plazo de PLAZO_FIRMA_CONJUNTO_DIAS días desde el primer envío para que firmen todos.

/** Solo las claves del conjunto de un juego de variables: quién contrata y las partes. */
function datosConjuntoDe(v: ContractVariables): Partial<ContractVariables> {
  return {
    contratante_tipo: v.contratante_tipo,
    partes: v.partes,
    viajero_nombre: v.viajero_nombre,
    viajero_email: v.viajero_email,
    viajero_telefono: v.viajero_telefono,
    viajero_tipo_documento: v.viajero_tipo_documento,
    viajero_documento: v.viajero_documento,
    viajero_direccion: v.viajero_direccion,
  };
}

/** El conjunto no lleva pagaré, aunque el plan sea financiado. */
function sinPagare(plan: PaymentPlan): PaymentPlan {
  return plan.type === "financiado" ? { ...plan, con_pagare: false } : plan;
}

type ViajeroConjunto = {
  id: string;
  position: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  autoriza_imagen: boolean | null;
};

/**
 * Los viajeros de la cotización, listos para ser parte de un contrato conjunto, o el
 * motivo por el que todavía no pueden serlo.
 */
async function partesDeLaCotizacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  quoteId: string,
): Promise<{ viajeros: ViajeroConjunto[]; partes: ParteContrato[] } | { error: string }> {
  const [{ data: quote }, { data: filas }] = await Promise.all([
    supabase.from("quotes").select("people").eq("id", quoteId).maybeSingle(),
    supabase
      .from("quote_travelers")
      .select("id,position,full_name,email,phone,document_type,document_number,autoriza_imagen")
      .eq("quote_id", quoteId)
      .order("position"),
  ]);
  const viajeros = (filas ?? []) as ViajeroConjunto[];
  const personas = Number(quote?.people) || 0;

  if (viajeros.length < 2) return { error: "El contrato conjunto es para dos o más viajeros. Carga la lista primero." };
  if (personas && viajeros.length !== personas) {
    return {
      error:
        `La cotización es de ${personas} persona(s) y la lista tiene ${viajeros.length}. ` +
        `En el contrato conjunto firman todos los que viajan: iguala la lista antes de crearlo.`,
    };
  }
  const faltan: string[] = [];
  for (const t of viajeros) {
    const que = [
      !t.full_name?.trim() && "nombre",
      !t.email?.trim() && "correo",
      !t.document_number?.trim() && "número de pasaporte",
    ].filter(Boolean);
    if (que.length) faltan.push(`${t.position}. ${t.full_name || "sin nombre"}: ${que.join(", ")}`);
  }
  if (faltan.length) {
    return {
      error:
        `Al contrato no pueden ir espacios en blanco. Falta: ${faltan.join(" · ")}. ` +
        `Complétalo en la lista de viajeros y guarda.`,
    };
  }
  const correos = viajeros.map((t) => String(t.email).trim().toLowerCase());
  if (new Set(correos).size !== correos.length) {
    return {
      error:
        "Cada viajero necesita su propio correo: el código para firmar llega ahí y es lo que prueba " +
        "quién firmó. Con un correo compartido, este contrato no se puede usar; hazlos por viajero.",
    };
  }
  return {
    viajeros,
    partes: viajeros.map((t) => ({
      position: Number(t.position),
      nombre: String(t.full_name).trim(),
      documento_tipo: t.document_type || "Pasaporte",
      documento: String(t.document_number).trim(),
      email: String(t.email).trim(),
      telefono: t.phone || "",
      autoriza_imagen: t.autoriza_imagen ?? null,
    })),
  };
}

/** Las variables del contrato conjunto: lo común del viaje + las partes congeladas. */
function variablesConjunto(shared: ContractVariables, partes: ParteContrato[]): ContractVariables {
  const primera = partes[0];
  return {
    ...shared,
    contratante_tipo: "conjunto",
    partes,
    // Respaldo para lo que pide un solo destinatario; el contrato no las imprime.
    viajero_nombre: primera.nombre,
    viajero_email: primera.email,
    viajero_telefono: primera.telefono,
    viajero_tipo_documento: primera.documento_tipo,
    viajero_documento: primera.documento,
    num_personas: String(partes.length),
  };
}

/**
 * Crea el contrato conjunto de la cotización.
 *
 * Los contratos por viajero que haya en borrador (nunca enviados, o con el enlace anulado)
 * se borran: eran el mismo acuerdo escrito de otra forma y no llegaron a nadie. Si alguno
 * salió o está firmado, no se toca nada y se pide anularlo primero.
 */
export async function createJointContract(
  quoteId: string,
  shared: ContractVariables,
  plan: PaymentPlan,
  signerSlug?: string | null,
): Promise<{ ok?: true; borrados?: number; error?: string }> {
  const supabase = await createCommercialClient();

  const { data: quote } = await supabase.from("quotes").select("company_id").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "La cotización no existe." };
  if (quote.company_id) return { error: "Esta cotización la contrata una empresa: su contrato es el de empresa." };

  const { data: existentes } = await supabase
    .from("contracts")
    .select("id,kind,status,token")
    .eq("quote_id", quoteId);
  if ((existentes ?? []).some((c) => c.kind === "conjunto")) return { ok: true };
  if ((existentes ?? []).some((c) => c.kind === "empresa")) {
    return { error: "Esta cotización ya tiene un contrato de empresa. Anúlalo antes de cambiar de modalidad." };
  }
  const vivos = (existentes ?? []).filter((c) => c.status === "enviado" || c.status === "firmado" || c.token);
  if (vivos.length > 0) {
    return {
      error:
        `Hay ${vivos.length} contrato(s) por viajero enviado(s) o firmado(s). ` +
        `Anula sus enlaces primero; los firmados no se pueden reemplazar desde aquí.`,
    };
  }

  const r = await partesDeLaCotizacion(supabase, quoteId);
  if ("error" in r) return { error: r.error };

  const firmante = await getFirmante(supabase, signerSlug || FIRMANTE_POR_DEFECTO.slug);
  const variables: ContractVariables = {
    ...variablesConjunto(shared, r.partes),
    org_nombre: firmante.nombre,
    org_tipo_documento: firmante.documento_tipo,
    org_documento: firmante.documento,
  };

  const borradores = (existentes ?? []).map((c) => c.id as string);
  if (borradores.length > 0) {
    const { error: delErr } = await supabase.from("contracts").delete().in("id", borradores);
    if (delErr) return { error: mensajeError(delErr, "No pude quitar los borradores por viajero.") };
  }

  const { data: nuevo, error } = await supabase
    .from("contracts")
    .insert({
      quote_id: quoteId,
      kind: "conjunto",
      org_signer: firmante.slug,
      traveler_id: null,
      company_id: null,
      variables_json: variables,
      payment_plan_json: sinPagare(plan),
      status: "borrador",
    })
    .select("id")
    .single();
  if (error || !nuevo) return { error: mensajeError(error, "No se pudo crear el contrato conjunto.") };

  const { error: sigErr } = await supabase.from("contract_signers").insert(
    r.viajeros.map((t) => ({
      contract_id: nuevo.id,
      traveler_id: t.id,
      position: Number(t.position),
      nombre: String(t.full_name).trim(),
      email: String(t.email).trim(),
    })),
  );
  if (sigErr) {
    await supabase.from("contracts").delete().eq("id", nuevo.id);
    return { error: mensajeError(sigErr, "No se pudieron registrar los firmantes.") };
  }

  await persistirDatosCliente(supabase, quoteId, variables);
  revalidatePath(`/seguimiento/${quoteId}`);
  return { ok: true, borrados: borradores.length };
}

/**
 * Vuelve a copiar la lista de viajeros al contrato conjunto (nombres, documentos, correos,
 * autorización de imagen) y ajusta los firmantes. Solo mientras nadie haya firmado.
 */
export async function refreshJointParties(contractId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,kind,status,quote_id,variables_json")
    .eq("id", contractId)
    .maybeSingle();
  if (!c || c.kind !== "conjunto") return { error: "El contrato conjunto no existe." };
  if (c.status === "firmado" || (await conjuntoConFirmas(supabase, c.id as string))) return { error: YA_FIRMO_ALGUIEN };

  const r = await partesDeLaCotizacion(supabase, c.quote_id as string);
  if ("error" in r) return { error: r.error };

  const previas = c.variables_json as ContractVariables;
  const { error } = await supabase
    .from("contracts")
    .update({ variables_json: variablesConjunto(previas, r.partes) })
    .eq("id", c.id);
  if (error) return { error: mensajeError(error) };

  const { data: actuales } = await supabase
    .from("contract_signers")
    .select("id,traveler_id")
    .eq("contract_id", c.id);
  const porViajero = new Map((actuales ?? []).map((s) => [s.traveler_id as string, s.id as string]));
  const siguen = new Set(r.viajeros.map((t) => t.id));
  const sobran = (actuales ?? []).filter((s) => !siguen.has(s.traveler_id as string)).map((s) => s.id as string);
  if (sobran.length) await supabase.from("contract_signers").delete().in("id", sobran);
  for (const t of r.viajeros) {
    const fila = { position: Number(t.position), nombre: String(t.full_name).trim(), email: String(t.email).trim() };
    const id = porViajero.get(t.id);
    const { error: e } = id
      ? await supabase.from("contract_signers").update(fila).eq("id", id)
      : await supabase.from("contract_signers").insert({ ...fila, contract_id: c.id, traveler_id: t.id });
    if (e) return { error: mensajeError(e) };
  }

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}

/** Borra el contrato conjunto para volver a los contratos por viajero. Solo si nadie firmó. */
export async function deleteJointContract(contractId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id,kind,status,quote_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!c || c.kind !== "conjunto") return { error: "El contrato conjunto no existe." };
  if (c.status === "firmado" || (await conjuntoConFirmas(supabase, c.id as string))) {
    return { error: "Ya firmó al menos una persona: el contrato no se puede borrar desde aquí." };
  }
  const { error } = await supabase.from("contracts").delete().eq("id", c.id);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}

/**
 * Activa (o renueva) el enlace de firma de UNO de los firmantes del contrato conjunto y,
 * si se pide, se lo manda por correo. Mismo contrato de comportamiento que
 * `sendContractLink`: el estado solo se mueve si el correo salió, y la prueba no mueve nada.
 *
 * El primer envío real arranca el plazo de firma del contrato; los reenvíos no lo alargan.
 */
export async function sendJointLink(
  signerId: string,
  opts: { email: boolean; pruebaEmail?: string | null },
): Promise<{ ok?: true; url?: string; emailEnviado?: boolean; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: s } = await supabase
    .from("contract_signers")
    .select("id,contract_id,nombre,email,token,signed_at")
    .eq("id", signerId)
    .maybeSingle();
  if (!s) return { error: "Ese firmante no existe." };
  if (s.signed_at) return { error: `${s.nombre} ya firmó.` };

  const { data: c } = await supabase
    .from("contracts")
    .select("id,status,quote_id,variables_json,sent_at,token_expires_at")
    .eq("id", s.contract_id)
    .maybeSingle();
  if (!c) return { error: "El contrato no existe." };
  if (c.status === "firmado") return { error: "El contrato ya está firmado." };

  const ahora = Date.now();
  const plazo = c.token_expires_at ? new Date(c.token_expires_at as string).getTime() : null;
  if (c.sent_at && plazo && plazo < ahora) {
    return {
      error:
        `Venció el plazo de ${PLAZO_FIRMA_CONJUNTO_DIAS} días para que firmaran todos: según el contrato, ` +
        `las firmas quedan sin efecto. Anula el contrato conjunto y créalo de nuevo; todos vuelven a firmar.`,
    };
  }
  const vence = new Date(plazo && c.sent_at ? plazo : ahora + PLAZO_FIRMA_CONJUNTO_DIAS * 86400000).toISOString();

  const gen = await generateContractPdf(c.id as string);
  if (gen.error) return { error: gen.error };

  const esPrueba = !!opts.pruebaEmail;
  const token = s.token || newContractToken();
  const { error: tokErr } = await supabase
    .from("contract_signers")
    .update({ token, token_expires_at: vence })
    .eq("id", s.id);
  if (tokErr) return { error: mensajeError(tokErr) };

  const arrancarPlazo = async () => {
    await supabase
      .from("contracts")
      .update({
        status: "enviado",
        sent_at: (c.sent_at as string | null) ?? new Date(ahora).toISOString(),
        token_expires_at: vence,
      })
      .eq("id", c.id);
  };
  // Sin correo el enlace lo manda Nico a mano: ya está en la calle, así que corre el plazo.
  if (!opts.email) await arrancarPlazo();

  const h = await headers();
  const url = `${baseUrl(h)}/contrato/${token}`;

  let emailEnviado = false;
  let errorEmail: string | undefined;
  if (opts.email) {
    const vars = c.variables_json as ContractVariables;
    const destino = opts.pruebaEmail || (s.email as string | null);
    if (!destino) return { ok: true, url, emailEnviado: false, error: `${s.nombre} no tiene correo.` };

    let pdfUrl: string | null = null;
    const { data: fresh } = await supabase.from("contracts").select("pdf_path").eq("id", c.id).maybeSingle();
    if (fresh?.pdf_path) {
      const { data: signed } = await supabase.storage
        .from("comercial-contracts")
        .createSignedUrl(sinBucket(String(fresh.pdf_path)), 60 * 60 * 24 * 7);
      pdfUrl = signed?.signedUrl ?? null;
    }
    const adjuntos = await adjuntosContrato(
      supabase,
      c.quote_id as string,
      { url: pdfUrl, name: `Contrato-${vars.codigo_cotizacion}.pdf` },
      vars.codigo_cotizacion,
    );
    const prefijo = esPrueba ? "[PRUEBA] " : "";
    const dias = Math.max(1, Math.ceil((new Date(vence).getTime() - ahora) / 86400000));
    const correo = correoContratoParaFirma({
      code: vars.codigo_cotizacion,
      empresa: false,
      saludo: String(s.nombre).trim().split(/\s+/)[0] || "",
      ruta: vars.ruta_nombre,
      fechaInicio: vars.fecha_inicio,
      personas: Number(vars.num_personas) || 1,
      url,
      dias,
      conCotizacion: adjuntos.conCotizacion,
      avisoPrueba: esPrueba ? `(Correo de PRUEBA. El destinatario real sería ${s.email || "—"}.)` : null,
      cofirmantes: (vars.partes ?? []).map((p) => p.nombre).filter((n) => n !== s.nombre),
    });
    const envio = await enviarCorreoContrato({
      code: vars.codigo_cotizacion,
      nombre: String(s.nombre),
      email: destino,
      telefono: (vars.partes ?? []).find((p) => p.nombre === s.nombre)?.telefono || null,
      ruta: vars.ruta_nombre,
      fecha_inicio: vars.fecha_inicio,
      personas: Number(vars.num_personas) || 1,
      alojamiento: vars.modalidad,
      total_eur: null,
      pdf_url: adjuntos.pdf_url,
      attachments: adjuntos.attachments,
      subject: `${prefijo}${s.nombre} - Contrato para firma - ${vars.codigo_cotizacion}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
      body: correo.texto,
      html: correo.html,
      attachment_name: adjuntos.attachment_name,
      aviso: false,
    }, { supabase, quoteId: c.quote_id as string, prueba: esPrueba });
    emailEnviado = envio.ok;
    errorEmail = envio.ok ? undefined : (envio.error ?? "No se pudo enviar el correo.");

    if (envio.ok && !esPrueba) {
      await supabase
        .from("contract_signers")
        .update({ sent_at: new Date().toISOString(), last_reminder_at: null, reminder_count: 0 })
        .eq("id", s.id);
      await arrancarPlazo();
    }
  }

  revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true, url, emailEnviado, error: errorEmail };
}

/** Anula el enlace de un firmante. Si ya nadie tiene enlace, el contrato vuelve a revisión. */
export async function revokeJointLink(signerId: string): Promise<{ ok?: true; error?: string }> {
  const supabase = await createCommercialClient();
  const { data: s } = await supabase
    .from("contract_signers")
    .select("id,contract_id,signed_at")
    .eq("id", signerId)
    .maybeSingle();
  if (!s) return { error: "Ese firmante no existe." };
  if (s.signed_at) return { error: "Ya firmó: su enlace se queda para que pueda ver su firma." };
  const { error } = await supabase
    .from("contract_signers")
    .update({ token: null, token_expires_at: null })
    .eq("id", s.id);
  if (error) return { error: mensajeError(error) };

  const { count } = await supabase
    .from("contract_signers")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", s.contract_id)
    .not("token", "is", null);
  if (!count) await supabase.from("contracts").update({ status: "borrador" }).eq("id", s.contract_id).eq("status", "enviado");

  const { data: c } = await supabase.from("contracts").select("quote_id").eq("id", s.contract_id).maybeSingle();
  if (c) revalidatePath(`/seguimiento/${c.quote_id}`);
  return { ok: true };
}

/**
 * Reintenta el cierre del contrato conjunto cuando ya firmaron todos pero el sellado no
 * terminó (se cayó el render o la subida). Es la misma función que corre al firmar el último.
 */
export async function sealJointContract(contractId: string): Promise<{ ok?: true; mensaje?: string; error?: string }> {
  const supabase = await createCommercialClient();
  const r = await sellarContratoConjunto(supabase, contractId);
  if (!r.ok) return { error: r.error };
  const { data: c } = await supabase.from("contracts").select("quote_id").eq("id", contractId).maybeSingle();
  if (c) revalidatePath(`/seguimiento/${c.quote_id}`);
  if (!r.sellado) {
    return r.faltan > 0 ? { error: `Todavía faltan ${r.faltan} firma(s).` } : { ok: true, mensaje: "El contrato ya estaba cerrado." };
  }
  return { ok: true, mensaje: `Contrato sellado. Copia enviada a ${r.correos} firmante(s).` };
}

