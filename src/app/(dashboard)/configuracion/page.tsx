import { createCommercialClient } from "@/lib/supabase/server";
import { getOrgSignature } from "@/lib/contracts/render";
import OrgSignatureForm from "./OrgSignatureForm";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const supabase = await createCommercialClient();
  const orgSignature = await getOrgSignature(supabase);

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="font-display text-3xl text-bosque">Configuración</h1>
        <p className="text-muted text-sm mt-1">Firma del organizador, plantillas de correo, regla de markup, datos de empresa.</p>
      </header>

      <OrgSignatureForm current={orgSignature} />

      <div className="bg-bg-card border border-border rounded-xl p-8 text-muted text-sm max-w-xl">
        Más ajustes (plantillas de correo, markup, asistentes) — disponibles en próximas fases.
      </div>
    </div>
  );
}
