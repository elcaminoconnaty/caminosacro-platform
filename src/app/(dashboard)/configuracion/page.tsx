import { createCommercialClient } from "@/lib/supabase/server";
import { getOrgSignature } from "@/lib/contracts/render";
import { getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";
import { getAsistenciaTexts, getTravelDocTexts } from "@/lib/travelDocs/texts";
import { rutaAsistencia } from "@/lib/storage/paths";
import OrgSignatureForm from "./OrgSignatureForm";
import PilgrimForm from "./PilgrimForm";
import TravelDocTextsForm, { type TravelDocTextsValue } from "./TravelDocTextsForm";
import AsistenciaForm, { type AsistenciaValue } from "./AsistenciaForm";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const supabase = await createCommercialClient();
  const [orgSignature, pilgrim, travelDocTexts, asistenciaTexts, asistenciaFiles] = await Promise.all([
    getOrgSignature(supabase),
    getPilgrimSettings(supabase),
    getTravelDocTexts(supabase),
    getAsistenciaTexts(supabase),
    supabase.storage.from("comercial-docs").list("generico", { search: rutaAsistencia().split("/").pop() }),
  ]);
  const asistenciaGenerada = (asistenciaFiles.data || []).length > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="font-display text-3xl text-bosque">Configuración</h1>
        <p className="text-muted text-sm mt-1">Firma del organizador, proveedor Pilgrim, textos de la documentación de viaje, plantillas de correo.</p>
      </header>

      <OrgSignatureForm current={orgSignature} />

      <PilgrimForm current={pilgrim} />

      <TravelDocTextsForm current={travelDocTexts as TravelDocTextsValue} />

      <AsistenciaForm current={asistenciaTexts as AsistenciaValue} generado={asistenciaGenerada} />

      <div className="bg-bg-card border border-border rounded-xl p-8 text-muted text-sm max-w-xl">
        Más ajustes (plantillas de correo, markup, asistentes) — disponibles en próximas fases.
      </div>
    </div>
  );
}
