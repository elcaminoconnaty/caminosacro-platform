"use client";

// Formulario de la ficha del viajero. NO muestra ni firma el contrato: eso lo firma la
// empresa. Acá solo se recogen los datos de cada persona y sus dos autorizaciones.

import { useState, useTransition } from "react";
import { guardarFicha } from "./actions";
import { comprimeImagen } from "@/lib/comprimeImagen";
import type { FichaViajero } from "@/lib/travelers/ficha";

const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Las autorizaciones son sí/no explícito, sin opción preseleccionada.
 *
 * Una casilla marcada por defecto no es consentimiento bajo la Ley 1581: obliga a que la
 * persona elija. Por eso son dos botones y no un checkbox, y por eso el valor arranca en
 * null y el servidor rechaza el envío si no se respondió.
 */
function Autorizacion({
  nombre,
  titulo,
  detalle,
  valor,
  onChange,
  invalido,
}: {
  nombre: string;
  titulo: string;
  detalle: string;
  valor: boolean | null;
  onChange: (v: boolean) => void;
  invalido: boolean;
}) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${invalido ? "border-red-300 bg-red-50" : "border-border"}`}>
      <p className="text-sm font-medium text-fg">{titulo}</p>
      <p className="text-[12px] text-muted mt-1">{detalle}</p>
      {valor !== null && <input type="hidden" name={nombre} value={valor ? "si" : "no"} />}
      <div className="flex gap-2 mt-2.5">
        {[
          { v: true, txt: "Sí, autorizo" },
          { v: false, txt: "No autorizo" },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`text-xs px-3.5 py-1.5 rounded-full border transition ${
              valor === o.v
                ? "bg-bosque text-white border-bosque"
                : "border-border text-fg hover:bg-taupe/40"
            }`}
          >
            {o.txt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FichaForm({ token, viajero }: { token: string; viajero: FichaViajero }) {
  const [pending, startTransition] = useTransition();
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [faltantes, setFaltantes] = useState<Record<string, boolean>>({});
  const [imagen, setImagen] = useState<boolean | null>(viajero.autoriza_imagen);
  const [marketing, setMarketing] = useState<boolean | null>(viajero.marketing_optin);

  const yaTienePasaporte = !!viajero.passport_path;

  function claseCampo(campo: string) {
    return `mt-1 w-full px-3 py-2 rounded-md border bg-white text-sm ${
      faltantes[campo] ? "border-red-300 ring-1 ring-red-300" : "border-border"
    }`;
  }

  if (listo) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="font-display text-2xl text-bosque">¡Listo, gracias!</p>
        <p className="text-sm text-muted mt-3 max-w-md mx-auto">
          Ya tenemos tus datos. Si necesitas corregir algo, vuelve a abrir este mismo enlace y guárdalo de nuevo.
        </p>
        <p className="text-sm text-muted mt-3">Buen Camino 🐚</p>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        const faltas: Record<string, boolean> = {};
        const req = (campo: string, min = 1) => {
          const v = String(fd.get(campo) || "").trim();
          if (v.length < min) faltas[campo] = true;
        };
        req("full_name", 5);
        req("document_number", 4);
        const correo = String(fd.get("email") || "").trim();
        if (!correo.includes("@")) faltas.email = true;
        if (imagen === null) faltas.autoriza_imagen = true;
        if (marketing === null) faltas.marketing_optin = true;

        const archivo = fd.get("passport");
        const file = archivo instanceof File && archivo.size > 0 ? archivo : null;
        if (!file && !yaTienePasaporte) faltas.passport = true;
        if (file && !TIPOS_OK.includes(file.type)) faltas.passport = true;
        if (file && file.type === "application/pdf" && file.size > MAX_BYTES) faltas.passport = true;

        if (Object.keys(faltas).length > 0) {
          setFaltantes(faltas);
          setError("Faltan algunos datos. Revisa lo que quedó marcado en rojo.");
          return;
        }

        setFaltantes({});
        setError(null);
        startTransition(async () => {
          if (file) {
            setPreparando(true);
            const listoArchivo = await comprimeImagen(file);
            setPreparando(false);
            if (listoArchivo.size > MAX_BYTES) {
              setFaltantes({ passport: true });
              setError("La foto quedó demasiado pesada incluso después de reducirla. Tómala de nuevo con menos resolución.");
              return;
            }
            fd.set("passport", listoArchivo);
          }
          const r = await guardarFicha(token, fd);
          if (r.ok) setListo(true);
          else setError(r.error);
        });
      }}
      className="px-6 py-6 space-y-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs md:col-span-2">
          <span className="text-muted">Nombre completo, como aparece en el pasaporte</span>
          <input name="full_name" defaultValue={viajero.full_name} className={claseCampo("full_name")} />
        </label>
        <label className="text-xs">
          <span className="text-muted">Número de pasaporte</span>
          <input
            name="document_number"
            defaultValue={viajero.document_number ?? ""}
            placeholder="Ej: AS748091"
            className={claseCampo("document_number")}
          />
        </label>
        <label className="text-xs">
          <span className="text-muted">Nacionalidad</span>
          <input name="nationality" defaultValue={viajero.nationality ?? ""} placeholder="Colombiana" className={claseCampo("nationality")} />
        </label>
        <label className="text-xs">
          <span className="text-muted">Fecha de nacimiento</span>
          <input type="date" name="birth_date" defaultValue={viajero.birth_date ?? ""} className={claseCampo("birth_date")} />
        </label>
        <label className="text-xs">
          <span className="text-muted">Tu correo</span>
          <input type="email" name="email" defaultValue={viajero.email ?? ""} className={claseCampo("email")} />
        </label>
        <label className="text-xs">
          <span className="text-muted">Tu celular (con indicativo)</span>
          <input name="phone" defaultValue={viajero.phone ?? ""} placeholder="+57 300 000 0000" className={claseCampo("phone")} />
        </label>
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-4">
          <p className="md:col-span-2 text-[12px] text-muted -mb-2">
            ¿A quién llamamos si te pasa algo durante el Camino?
          </p>
          <label className="text-xs">
            <span className="text-muted">Contacto de emergencia</span>
            <input name="emergency_name" defaultValue={viajero.emergency_name ?? ""} className={claseCampo("emergency_name")} />
          </label>
          <label className="text-xs">
            <span className="text-muted">Su teléfono</span>
            <input name="emergency_phone" defaultValue={viajero.emergency_phone ?? ""} className={claseCampo("emergency_phone")} />
          </label>
        </div>
      </div>

      <label className="text-xs block border-t border-border pt-4">
        <span className="text-muted">
          Foto o escaneo de tu pasaporte (la página de los datos)
          {yaTienePasaporte && <span className="text-bosque"> · ya tenemos uno, súbelo solo si quieres cambiarlo</span>}
        </span>
        <input
          name="passport"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          className={`mt-1.5 block w-full text-xs rounded-md file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-bosque file:text-white file:cursor-pointer hover:file:bg-bosque-medio ${
            faltantes.passport ? "ring-1 ring-red-300 p-1" : ""
          }`}
        />
        <span className="block text-[11px] text-muted mt-1">
          Tómala con el celular; la reducimos sola antes de enviarla, así que no importa que la foto sea grande.
        </span>
      </label>

      <div className="space-y-3 border-t border-border pt-4">
        <Autorizacion
          nombre="autoriza_imagen"
          titulo="Uso de tus fotos y videos"
          detalle="¿Nos autorizas a usar las imágenes o videos en los que aparezcas durante el viaje, para la memoria del viaje y para los canales de Camino Sacro? Es independiente del servicio y puedes revocarla cuando quieras."
          valor={imagen}
          onChange={setImagen}
          invalido={!!faltantes.autoriza_imagen}
        />
        <Autorizacion
          nombre="marketing_optin"
          titulo="Información sobre nuestros viajes"
          detalle="¿Quieres que usemos tu correo para contarte sobre próximos Caminos y novedades? Nada que ver con la gestión de este viaje, que te llegará igual."
          valor={marketing}
          onChange={setMarketing}
          invalido={!!faltantes.marketing_optin}
        />
        <p className="text-[11px] text-muted">
          Tus datos se tratan conforme a la Ley 1581 de 2012 para gestionar tu viaje, lo que incluye transmitirlos al
          operador en España y a los alojamientos. Puedes conocerlos, actualizarlos, corregirlos o pedir que los
          borremos escribiendo a reservas@caminosacro.com.
        </p>
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || preparando}
        className="w-full rounded-full bg-bosque px-6 py-3 text-sm font-medium text-white transition hover:bg-bosque-medio disabled:opacity-60"
      >
        {preparando ? "Preparando tu pasaporte…" : pending ? "Guardando…" : "Enviar mis datos"}
      </button>
    </form>
  );
}
