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
/**
 * Hitos que REABREN los avisos cuando el viaje ya está encima.
 *
 * La escalera de 5 recordatorios cada 4 días se agota en unos 20 días y después el robot se
 * callaba para siempre, porque contaba recordatorios y no miraba la fecha de salida. Con
 * CS-2026-004 se habría agotado dos días antes de que saliera el viaje: un viaje cobrado
 * entero, saliendo, con un viajero sin firmar y nadie diciendo nada.
 *
 * Se reabre a 15 y a 5 días, y no más. Cada hito manda como mucho un correo, por una regla
 * que no necesita guardar nada nuevo: solo dispara si el último contacto fue ANTES de entrar
 * en ese tramo. En cuanto sale el correo, `last_reminder_at` entra en el tramo y ese hito ya
 * no puede repetirse.
 */
const HITOS_SALIDA = [15, 5] as const;
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

/**
 * Asunto y primera línea según cuántas veces ya le hemos escrito — o según lo cerca que
 * esté la salida, que manda sobre todo lo demás: a cinco días de viajar, el número de
 * recordatorio que lleve da igual.
 */
function tono(numero: number, primerNombre: string, ruta: string | null, hito: number | null) {
  const deRuta = ruta ? ` del ${ruta}` : "";
  if (hito != null) {
    return {
      etiqueta: hito <= 5 ? "Tu viaje sale en días y falta tu firma" : "Falta tu firma y el viaje se acerca",
      entrada:
        `${primerNombre}, tu viaje${deRuta} sale en ${hito} días y todavía no tenemos tu contrato firmado. ` +
        `Es el último paso que falta de tu parte.`,
    };
  }
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

  // El tope de recordatorios ya NO va en la consulta: un contrato con la escalera agotada
  // sigue entrando por si le toca un hito de salida. El filtro se hace abajo.
  const { data: pendientes, error: consultaErr } = await supabase
    .from("contracts")
    .select("id,quote_id,token,pdf_path,variables_json,sent_at,created_at,last_reminder_at,reminder_count,quotes(start_date)")
    .eq("status", "enviado")
    .not("token", "is", null)
    .order("created_at", { ascending: true });

  if (consultaErr) {
    console.error("[recordatorios] no se pudo consultar los contratos:", consultaErr);
    return Response.json({ ok: false, error: "No se pudo consultar los contratos." }, { status: 500 });
  }

  // El filtro de los 4 días se hace acá y no en SQL porque la referencia es
  // "el último contacto": el recordatorio anterior o, si no hubo, el envío del enlace.
  //
  // Y encima va el hito de salida, que es lo que rescata a un contrato con la escalera ya
  // agotada. `motivo` viaja con cada uno para que el correo sepa qué tono usar.
  // El join anidado de supabase-js llega como objeto o como array de uno según el caso; se
  // aceptan las dos formas para no depender de eso.
  const salidaDe = (c: { quotes?: unknown }): string | null => {
    const q = Array.isArray(c.quotes) ? c.quotes[0] : c.quotes;
    const v = (q as { start_date?: unknown } | null | undefined)?.start_date;
    return typeof v === "string" ? v : null;
  };

  /** Días que faltan para la salida, o null si no hay fecha. */
  function diasParaSalir(startDate: string | null): number | null {
    if (!startDate) return null;
    const [a, m, d] = startDate.split("-").map(Number);
    if (!a || !m || !d) return null;
    return Math.ceil((Date.UTC(a, m - 1, d) - ahora) / 86400000);
  }

  /**
   * El hito de salida que le toca hoy a este contrato, si alguno.
   *
   * Solo dispara si el último contacto fue antes de entrar en el tramo, así que cada hito
   * manda un correo y se apaga solo. Se recorren de menor a mayor —5 antes que 15— para que
   * a cuatro días de salir mande el urgente y no el otro.
   */
  function hitoQueToca(startDate: string | null, ultimoContacto: string | null): number | null {
    const dias = diasParaSalir(startDate);
    if (dias == null || dias < 0) return null; // ya salió: no se le insiste más
    for (const hito of [...HITOS_SALIDA].sort((x, y) => x - y)) {
      if (dias > hito) continue;
      const entradaAlTramo = Date.UTC(
        Number(startDate!.slice(0, 4)),
        Number(startDate!.slice(5, 7)) - 1,
        Number(startDate!.slice(8, 10)),
      ) - hito * 86400000;
      if (!ultimoContacto || new Date(ultimoContacto).getTime() < entradaAlTramo) return hito;
      return null; // ya se le escribió dentro de este tramo
    }
    return null;
  }

  const toca = (pendientes ?? [])
    .map((c) => {
      const salida = salidaDe(c);
      const dias = diasParaSalir(salida);

      // El viaje ya salió: no se le insiste más a nadie. Es un fallo que ya estaba y que
      // solo se ve ahora que el cron conoce la fecha de salida — la escalera contaba hasta
      // cinco sin mirar el calendario, así que a un contrato enviado tarde le seguían
      // llegando recordatorios DESPUÉS de haber hecho el Camino. Pedirle a alguien que
      // firme el contrato de un viaje que ya hizo no arregla nada y queda fatal.
      if (dias != null && dias < 0) return null;

      const ultimoContacto = c.last_reminder_at ?? c.sent_at ?? c.created_at ?? null;
      const hito = hitoQueToca(salida, ultimoContacto);
      if (hito != null) return { ...c, hito };
      const dentroDeLaEscalera = (c.reminder_count ?? 0) < MAX_RECORDATORIOS;
      const leToca = !!ultimoContacto && ultimoContacto < limite;
      return dentroDeLaEscalera && leToca ? { ...c, hito: null as number | null } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

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
      const hito = c.hito;
      // Un aviso de salida no es "el último de la escalera": la escalera ya se acabó, o ni
      // siquiera aplica. Pero sí avisa a reservas@, porque es de los que piden llamar.
      const esUltimo = hito == null && numero >= MAX_RECORDATORIOS;
      const primerNombre = (vars.viajero_nombre || "").split(/\s+/).filter(Boolean)[0] || "peregrino";
      const { etiqueta, entrada } = tono(numero, primerNombre, vars.ruta_nombre, hito);
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

      const envio = await enviarCorreoContrato({
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
        // Avisan a reservas@ el último de la escalera y los dos de cerca de la salida:
        // los tres piden entrar a llamar. Los intermedios los manda el cron en silencio.
        aviso: esUltimo || hito != null,
        aviso_subject:
          hito != null
            ? `SALE EN ${hito} DIAS sin firmar: ${vars.viajero_nombre} - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`
            : esUltimo
              ? `ATENCION: ${vars.viajero_nombre} no ha firmado - ${code}${vars.ruta_nombre ? ` - ${vars.ruta_nombre}` : ""}`
              : `Recordatorio ${numero} de ${MAX_RECORDATORIOS} enviado - ${code} - ${vars.viajero_nombre}`,
        aviso_body: hito != null
          ? [
              `Este viaje sale en ${hito} días y el contrato sigue SIN FIRMAR.`,
              `Se le acaba de mandar un recordatorio, pero a esta altura conviene llamar.`,
              ``,
              `Contrato: ${code}`,
              `Cliente: ${vars.viajero_nombre}`,
              `Correo: ${vars.viajero_email}`,
              `WhatsApp: ${vars.viajero_telefono || "-"}`,
              `Ruta: ${vars.ruta_nombre || "-"}`,
              `Salida: ${vars.fecha_inicio || "-"}`,
              ``,
              `Enlace de firma (recién renovado):`,
              url,
            ].join("\n")
          : esUltimo
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
      }, { supabase, quoteId: c.quote_id });

      if (!envio.ok) {
        // No se marca el recordatorio: en la corrida de mañana se vuelve a intentar.
        // El motivo va también en la respuesta del cron, no solo en `email_log`: quien
        // mira la ejecución de n8n necesita saber si fue el secreto, un 400 de Brevo o
        // un timeout sin tener que entrar a la base.
        errores.push({ code, motivo: envio.error ?? "el servicio de correo no aceptó el envío" });
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
    // Separado para que quien mire la ejecución en n8n distinga la escalera normal de los
    // avisos de "sale en días y no ha firmado", que son los que piden actuar.
    por_salida_cercana: toca.filter((c) => c.hito != null).length,
    enviados,
    errores,
  });
}
