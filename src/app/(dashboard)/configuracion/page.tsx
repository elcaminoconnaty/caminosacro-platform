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
import CartaBienvenidaForm from "./CartaBienvenidaForm";
import { getTextosCarta } from "@/lib/bienvenida/render";
import Plegable from "@/components/Plegable";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const supabase = await createCommercialClient();
  const [firmantes, pilgrim, travelDocTexts, asistenciaTexts, asistenciaFiles, mensajes, plantillas, textosCarta] = await Promise.all([
    getFirmantes(supabase),
    getPilgrimSettings(supabase),
    getTravelDocTexts(supabase),
    getAsistenciaTexts(supabase),
    supabase.storage.from("comercial-docs").list("generico", { search: rutaAsistencia().split("/").pop() }),
    getMensajes(supabase),
    supabase.from("email_templates").select("slug,subject,body_md,active").order("slug"),
    getTextosCarta(supabase),
  ]);
  const asistenciaGenerada = (asistenciaFiles.data || []).length > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="font-display text-3xl text-bosque">Configuración</h1>
        <p className="text-muted text-sm mt-1">Firma del organizador, proveedor Pilgrim, los textos de los mensajes, los correos, la carta de bienvenida y la documentación de viaje. Toca un título para abrirlo.</p>
      </header>

      {/* Todas plegadas de entrada: la página es larga y casi siempre se viene a UNA cosa.
          Lo que se abre queda abierto en este navegador (ver components/Plegable). */}
      <Plegable ambito="configuracion" seccion="firmas" titulo="las firmas" abiertoInicial={false}>
        <OrgSignatureForm firmantes={firmantes} />
      </Plegable>

      <Plegable ambito="configuracion" seccion="pilgrim" titulo="el proveedor Pilgrim" abiertoInicial={false}>
        <PilgrimForm current={pilgrim} />
      </Plegable>

      <Plegable ambito="configuracion" seccion="mensajes" titulo="los mensajes" abiertoInicial={false}>
        <MensajesForm guardados={mensajes} />
      </Plegable>

      <Plegable ambito="configuracion" seccion="correos" titulo="los correos al cliente" abiertoInicial={false}>
        <PlantillasCorreoForm plantillas={((plantillas.data as PlantillaCorreo[] | null) ?? [])} />
      </Plegable>

      <Plegable ambito="configuracion" seccion="carta-bienvenida" titulo="la carta de bienvenida" abiertoInicial={false}>
        <CartaBienvenidaForm current={textosCarta} />
      </Plegable>

      <Plegable ambito="configuracion" seccion="documento-viaje" titulo="los textos del documento de viaje" abiertoInicial={false}>
        <TravelDocTextsForm current={travelDocTexts as TravelDocTextsValue} />
      </Plegable>

      <Plegable ambito="configuracion" seccion="asistencia" titulo="la asistencia en viaje" abiertoInicial={false}>
        <AsistenciaForm current={asistenciaTexts as AsistenciaValue} generado={asistenciaGenerada} />
      </Plegable>

      <div className="bg-bg-card border border-border rounded-xl p-8 text-muted text-sm max-w-xl">
        Más ajustes (markup, asistentes) — disponibles en próximas fases.
      </div>
    </div>
  );
}
