// Página pública de la documentación de viaje: /documentacion/[token]
//
// Es la respuesta a "que quede para siempre". Una URL firmada de Supabase caduca (siete
// días como mucho), y el peregrino abre esta documentación durante el viaje y meses
// después. Acá el enlace es estable: la firma se hace al vuelo en cada descarga.
//
// Sin sesión: el token único hace de autenticación, igual que en /contrato/[token].

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { rutaAsistencia } from "@/lib/storage/paths";
import Aviso from "./Aviso";

export const metadata: Metadata = {
  title: "Documentación de viaje — Camino Sacro",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fechaLarga(d: string | null): string {
  if (!d) return "";
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} de ${MES[dt.getMonth()]} de ${dt.getFullYear()}`;
}

export default async function DocumentacionViaje({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 32) {
    return <Aviso titulo="Enlace no válido" detalle="Revisa que el enlace esté completo o pídenos uno nuevo." />;
  }

  const supabase = createAdminClient("comercial");
  const { data: doc } = await supabase
    .from("travel_docs")
    .select("quote_id,doc_pdf_path,insurance_pdf_path,luggage_tag_pdf_path,revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!doc) {
    return <Aviso titulo="Enlace no válido" detalle="Este enlace no existe o fue reemplazado. Escríbenos y te enviamos uno nuevo." />;
  }
  if (doc.revoked_at) {
    return <Aviso titulo="Enlace anulado" detalle="Este enlace ya no está activo. Escríbenos y te enviamos el actualizado." />;
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select("code,client_name,route_name,start_date,end_date")
    .eq("id", doc.quote_id)
    .maybeSingle();

  // La asistencia es genérica y vive fuera del expediente: se ofrece si ya se generó.
  const { data: asistencia } = await supabase.storage
    .from("comercial-docs")
    .list("generico", { search: rutaAsistencia().split("/").pop() });
  const hayAsistencia = (asistencia || []).length > 0;

  const rango = [fechaLarga(quote?.start_date ?? null), fechaLarga(quote?.end_date ?? null)]
    .filter(Boolean)
    .join(" — ");

  const documentos = [
    doc.doc_pdf_path && {
      clave: "documento",
      titulo: "Documento de viaje",
      detalle: "Tus alojamientos noche a noche, los servicios incluidos y las condiciones de la reserva.",
    },
    hayAsistencia && {
      clave: "asistencia",
      titulo: "Asistencia en viaje",
      detalle: "A quién llamar y qué hacer ante cualquier incidencia durante el Camino.",
    },
    doc.insurance_pdf_path && {
      clave: "seguro",
      titulo: "Seguro de viaje",
      detalle: "Tu póliza, con las coberturas detalladas.",
    },
    doc.luggage_tag_pdf_path && {
      clave: "etiqueta",
      titulo: "Etiqueta de transporte de equipaje",
      detalle: "Imprímela y pégala en tu mochila antes de la primera etapa.",
    },
  ].filter(Boolean) as { clave: string; titulo: string; detalle: string }[];

  return (
    <main className="min-h-screen bg-crema">
      <header className="bg-bosque px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <p className="font-display text-xl text-white">Camino Sacro</p>
          <p className="text-xs text-white/70 mt-1">Agencia del Camino de Santiago</p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-dorado mt-7">Documentación de viaje</p>
          <h1 className="font-display text-3xl text-white mt-2">
            {quote?.route_name || "Camino de Santiago"}
          </h1>
          {rango && <p className="text-sm text-dorado mt-3">{rango}</p>}
          <div className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-white/80">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Peregrino</p>
              <p className="text-sm mt-1">{quote?.client_name || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Reserva</p>
              <p className="text-sm mt-1">{quote?.code || "—"}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-10">
        {documentos.length === 0 ? (
          <div className="bg-white border border-border rounded-xl px-6 py-10 text-center">
            <p className="text-sm text-muted">
              Todavía estamos preparando tu documentación. En cuanto esté lista te avisamos por correo.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {documentos.map((d) => (
              <li
                key={d.clave}
                className="bg-white border border-border rounded-xl px-5 py-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg text-bosque">{d.titulo}</p>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{d.detalle}</p>
                </div>
                <a
                  href={`/documentacion/${token}/descargar/${d.clave}`}
                  className="shrink-0 rounded-full bg-bosque px-5 py-2.5 text-xs font-medium tracking-wide text-white transition hover:bg-bosque-medio"
                >
                  DESCARGAR
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 rounded-xl bg-white border border-border px-5 py-4">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">¿Alguna duda?</p>
          <p className="text-sm text-bosque mt-2">
            Escríbenos a{" "}
            <a className="underline" href="mailto:reservas@caminosacro.com">reservas@caminosacro.com</a>{" "}
            y te respondemos. Guarda este enlace: estará disponible durante todo tu viaje.
          </p>
        </div>

        <p className="mt-8 text-center text-[11px] text-muted">
          Camino Sacro · Respaldado por El Camino con Naty
        </p>
      </section>
    </main>
  );
}
