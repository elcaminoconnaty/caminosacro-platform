// Ficha del viajero: /viajero/[token]
//
// Cada viajero de un grupo recibe su enlace y completa sus datos. NO ve el contrato: en la
// modalidad de empresa lo firma el representante legal. Lo que se responde acá es lo que
// después sale en el Anexo No. 2 del contrato.
// Sin sesión: el token único con expiración hace de autenticación (patrón /contrato).

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerFichaPorToken } from "@/lib/travelers/ficha";
import Aviso from "@/app/contrato/[token]/Aviso";
import FichaForm from "./FichaForm";

export const metadata: Metadata = {
  title: "Tus datos de viaje — Camino Sacro",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const fechaLarga = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(iso + "T00:00:00"),
    );
  } catch {
    return iso;
  }
};

export default async function FichaViajeroPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 32) {
    return <Aviso titulo="Enlace no válido" detalle="Revisa que el enlace esté completo o pídenos uno nuevo." />;
  }

  const supabase = createAdminClient("comercial");
  const ficha = await leerFichaPorToken(supabase, token);
  if (!ficha) {
    return (
      <Aviso
        titulo="Enlace no válido"
        detalle="Este enlace no existe o fue anulado. Escríbenos y te enviamos uno nuevo."
      />
    );
  }

  const { viajero, contexto, vencida } = ficha;
  if (vencida) {
    return (
      <Aviso
        titulo="Enlace vencido"
        detalle="Por seguridad los enlaces vencen. Escríbenos a reservas@caminosacro.com y te enviamos uno nuevo."
      />
    );
  }

  const primerNombre = viajero.full_name.trim().split(/\s+/)[0] || "peregrino";
  const salida = fechaLarga(contexto.fecha_inicio);

  return (
    <main className="min-h-screen bg-crema">
      <header className="bg-bosque px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-dorado">Camino Sacro</p>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl">Tus datos para el Camino</h1>
          <p className="mt-3 text-sm text-white/75 max-w-xl mx-auto">
            Hola {primerNombre}: necesitamos estos datos para reservar tus alojamientos, emitir tu seguro y prepararte
            la documentación del viaje. Te toma dos minutos.
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 -mt-6">
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-display text-lg text-bosque">{contexto.ruta || "Tu viaje"}</h2>
            <p className="text-xs text-muted mt-0.5">
              Reserva {contexto.code}
              {salida ? ` · salida el ${salida}` : ""}
              {contexto.empresa ? ` · a través de ${contexto.empresa}` : ""}
            </p>
          </div>

          {viajero.ficha_completed_at && (
            <p className="px-6 pt-4 text-[12px] text-bosque">
              Ya habías enviado tus datos. Puedes corregir lo que necesites y volver a guardar.
            </p>
          )}

          <FichaForm token={token} viajero={viajero} />
        </div>

        <p className="text-center text-[11px] text-muted mt-6">
          Este enlace es personal. Tus datos se tratan según la Ley 1581 de 2012 · reservas@caminosacro.com
        </p>
      </div>
    </main>
  );
}
