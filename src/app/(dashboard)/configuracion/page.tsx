import { createCommercialClient } from "@/lib/supabase/server";
import { getFirmantes } from "@/lib/contracts/render";
import { getPilgrimSettings } from "@/lib/quotes/pilgrimEmail";
import { getAsistenciaTexts, getTravelDocTexts } from "@/lib/travelDocs/texts";
import { rutaAsistencia } from "@/lib/storage/paths";
import OrgSignatureForm from "./OrgSignatureForm";
import PilgrimForm from "./PilgrimForm";
import TravelDocTextsForm, { type TravelDocTextsValue } from "./TravelDocTextsForm";
import AsistenciaForm, { type AsistenciaValue } from "./AsistenciaForm";
import MensajesForm from "./MensajesForm";
import PlantillasCorreoForm, { type PlantillaCorreo } from "./PlantillasCorreoForm";
import { getMensajes } from "@/lib/mensajes/settings";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const supabase = await createCommercialClient();
  const [firmantes, pilgrim, travelDocTexts, asistenciaTexts, asistenciaFiles, mensajes, plantillas] = await Promise.all([
    getFirmantes(supabase),
    getPilgrimSettings(supabase),
    getTravelDocTexts(supabase),
    getAsistenciaTexts(supabase),
    supabase.storage.from("comercial-docs").list("generico", { search: rutaAsistencia().split("/").pop() }),
    getMensajes(supabase),
    supabase.from("email_templates").select("slug,subject,body_md,active").order("slug"),
  ]);
  const asistenciaGenerada = (asistenciaFiles.data || []).length > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="font-display text-3xl text-bosque">Configuración</h1>
        <p className="text-muted text-sm mt-1">Firma del organizador, proveedor Pilgrim, los textos de los mensajes y los correos, y la documentación de viaje.</p>
      </header>

      <OrgSignatureForm firmantes={firmantes} />

      <PilgrimForm current={pilgrim} />

      <MensajesForm guardados={mensajes} />

      <PlantillasCorreoForm plantillas={((plantillas.data as PlantillaCorreo[] | null) ?? [])} />

      <TravelDocTextsForm current={travelDocTexts as TravelDocTextsValue} />

      <AsistenciaForm current={asistenciaTexts as AsistenciaValue} generado={asistenciaGenerada} />

      <div className="bg-bg-card border border-border rounded-xl p-8 text-muted text-sm max-w-xl">
        Más ajustes (markup, asistentes) — disponibles en próximas fases.
      </div>
    </div>
  );
}
