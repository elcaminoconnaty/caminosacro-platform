import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreoContrato } from "@/lib/contracts/email";
import type { ContractVariables } from "@/lib/contracts/template";
import { sinBucket } from "@/lib/storage/paths";

/**
 * POST /api/cron/recordatorios-contrato
 *
 * Le reenvía el enlace de firma al viajero cada 4 días mientras su contrato siga
 * esperando firma, hasta 5 veces. Lo despierta un Schedule de n8n
 * ("Recordatorio de firma — Camino Sacro") una vez al día; este endpoint decide
 * a quién le toca hoy, así que correrlo varias veces al día no duplica correos.
 *
 * En cada recordatorio se renueva el vencimiento del token: el enlace del último
 * correo siempre funciona, que era el riesgo de insistir cerca de los 21 días.
 */

export const dynamic = "force-dynamic";

const DIAS_ENTRE_RECORDATORIOS = 4;
const MAX_RECORDATORIOS = 5;
const TOKEN_TTL_DAYS = 21; // mismo que sendContractLink en contractActions.ts
const PDF_URL_TTL = 60 * 60 * 24 * 7; // 7 días: el correo sigue sirviendo toda la semana

function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const b = Buffer.from(secreto);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Asunto y primera línea según cuántas veces ya le hemos escrito. */
function tono(numero: number, primerNombre: string, ruta: string | null) {
  const deRuta = ruta ? ` del ${ruta}` : "";
  if (numero >= MAX_RECORDATORIOS) {
    return {
      etiqueta: "Último recordatorio",
      entrada: `Este es nuestro último recordatorio: tu contrato${deRuta} sigue pendiente de firma.`,
    };
  }
  if (numero === 1) {
    return {
      etiqueta: "Tu contrato te espera",
      entrada: `Te escribimos para recordarte que tu contrato${deRuta} está listo para firmar.`,
    };
  }
  return {
    etiqueta: "Recordatorio: falta tu firma",
    entrada: `${primerNombre}, aún nos falta tu firma para poder empezar a gestionar tus reservas${deRuta}.`,
  };
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return Response.json({ ok: false, error: "no_autorizado" }, { status: 401 });
  }

  // Sin request del navegador no hay host del que deducir la URL pública, a diferencia
  // de sendContractLink; aquí APP_BASE_URL es obligatorio o el enlace saldría roto.
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    return Response.json(
      { ok: false, error: "Falta APP_BASE_URL: sin ella el enlace de firma del correo saldría roto." },
      { status: 500 },
    );
  }

  const supabase = createAdminClient("comercial");
  const ahora = Date.now();
  const limite = new Date(ahora - DIAS_ENTRE_RECORDATORIOS * 86400000).toISOString();

  const { data: pendientes, error: consultaErr } = await supabase
    .from("contracts")
    .select("id,quote_id,token,pdf_path,variables_json,sent_at,created_at,last_reminder_at,reminder_count")
    .eq("status", "enviado")
    .not("token", "is", null)
    .lt("reminder_count", MAX_RECORDATORIOS)
    .order("created_at", { ascending: true });

  if (consultaErr) {
    console.error("[recordatorios] no se pudo consultar los contratos:", consultaErr);
    return Response.json({ ok: false, error: "No se pudo consultar los contratos." }, { status: 500 });
  }

  // El filtro de los 4 días se hace acá y no en SQL porque la referencia es
  // "el último contacto": el recordatorio anterior o, si no hubo, el envío del enlace.
  const toca = (pendientes ?? []).filter((c) => {
    const ultimoContacto = c.last_reminder_at ?? c.sent_at ?? c.created_at;
    return !!ultimoContacto && ultimoContacto < limite;
  });

  let enviados = 0;
  const errores: { code: string; motivo: string }[] = [];

  for (const c of toca) {
    const vars = (c.variables_json ?? {}) as ContractVariables;
    const code = vars.codigo_cotizacion || c.quote_id;
    try {
      if (!vars.viajero_email) {
        errores.push({ code, motivo: "el contrato no tiene correo del viajero" });
        continue;
      }

      const numero = (c.reminder_count ?? 0) + 1;
      const esUltimo = numero >= MAX_RECORDATORIOS;
      const primerNombre = (vars.viajero_nombre || "").split(/\s+/).filter(Boolean)[0] || "peregrino";
      const { etiqueta, entrada } = tono(numero, primerNombre, vars.ruta_nombre);
      const url = `${base}/contrato/${c.token}`;

      // El enlace del correo nunca debe salir vencido: se le renuevan los 21 días.
      const nuevoVencimiento = new Date(ahora + TOKEN_TTL_DAYS * 86400000).toISOString();
      const { error: tokenErr } = await supabase
        .from("contracts")
        .update({ token_expires_at: nuevoVencimiento })
        .eq("id", c.id)
        .eq("status", "enviado");
      if (tokenErr) throw tokenErr;

      // El contrato sin firmar va adjunto para que pueda leerlo sin abrir el enlace.
      let pdfUrl: string | null = null;
      if (c.pdf_path) {
        const { data: firmada } = await supabase.storage
          .from("comercial-contracts")
          .createSignedUrl(sinBucket(String(c.pdf_path)), PDF_URL_TTL);
        pdfUrl = firmada?.signedUrl ?? null;
      }

      const ok = await enviarCorreoContrato({
        code,
        nombre: vars.viajero_nombre,
        email: vars.viajero_email,
        telefono: vars.viajero_telefono || null,
        ruta: vars.ruta_nombre || null,
        fecha_inicio: vars.fecha_inicio || null,
        personas: Number(vars.num_personas) || 1,
        alojamiento: vars.modalidad || null,
        total_eur: null,
        pdf_url: pdfUrl,
        subject: `${etiqueta} - Contrato ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`,
        body: [
          `Hola ${primerNombre},`,
          ``,
          entrada,
          ``,
          `Acá puedes revisarlo, firmarlo y subir la foto de tu pasaporte. Toma dos minutos y se puede hacer desde el celular:`,
          ``,
          url,
          ``,
          `Al firmar te llega de inmediato una copia del contrato a este mismo correo.`,
          ``,
          esUltimo
            ? `Si prefieres que te acompañemos por teléfono o tienes alguna duda sobre el contrato, respóndenos y te llamamos.`
            : `Si algo no te cuadra o tienes dudas, respóndenos por aquí y lo resolvemos.`,
          ``,
          `Buen Camino,`,
          `Camino Sacro · reservas@caminosacro.com`,
        ].join("\n"),
        attachment_name: `Contrato-${code}.pdf`,
        // Solo el último recordatorio avisa, que es el que pide entrar a llamar.
        // Los intermedios los manda el cron sin que nadie tenga que hacer nada.
        aviso: esUltimo,
        aviso_subject: esUltimo
          ? `ATENCION: ${vars.viajero_nombre} no ha firmado - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`
          : `Recordatorio ${numero} de ${MAX_RECORDATORIOS} enviado - ${code} - ${vars.viajero_nombre}`,
        aviso_body: esUltimo
          ? [
              `Se envió el ÚLTIMO recordatorio (${MAX_RECORDATORIOS} de ${MAX_RECORDATORIOS}) y el contrato sigue sin firmar.`,
              `A partir de ahora no se envían más recordatorios automáticos.`,
              ``,
              `Contrato: ${code}`,
              `Cliente: ${vars.viajero_nombre}`,
              `Correo: ${vars.viajero_email}`,
              `WhatsApp: ${vars.viajero_telefono || "-"}`,
              `Ruta: ${vars.ruta_nombre || "-"}`,
              `Salida: ${vars.fecha_inicio || "-"}`,
              ``,
              `Conviene llamarlo. Enlace de firma (sigue vigente 21 días):`,
              url,
            ].join("\n")
          : [
              `Recordatorio automático de firma ${numero} de ${MAX_RECORDATORIOS}.`,
              ``,
              `Contrato: ${code}`,
              `Cliente: ${vars.viajero_nombre}`,
              `WhatsApp: ${vars.viajero_telefono || "-"}`,
              `Ruta: ${vars.ruta_nombre || "-"}`,
              ``,
              `Si ya hablaste con él por otro canal, puedes anular el enlace desde Seguimiento.`,
            ].join("\n"),
      });

      if (!ok) {
        // No se marca el recordatorio: en la corrida de mañana se vuelve a intentar.
        errores.push({ code, motivo: "el servicio de correo no aceptó el envío" });
        continue;
      }

      const { error: marcaErr } = await supabase
        .from("contracts")
        .update({ last_reminder_at: new Date(ahora).toISOString(), reminder_count: numero })
        .eq("id", c.id);
      if (marcaErr) throw marcaErr;

      enviados++;
    } catch (e) {
      // Un contrato problemático no debe frenar a los demás.
      console.error(`[recordatorios] falló el contrato ${code}:`, e);
      errores.push({ code, motivo: e instanceof Error ? e.message : "error inesperado" });
    }
  }

  return Response.json({
    ok: true,
    esperando_firma: pendientes?.length ?? 0,
    les_tocaba: toca.length,
    enviados,
    errores,
  });
}
