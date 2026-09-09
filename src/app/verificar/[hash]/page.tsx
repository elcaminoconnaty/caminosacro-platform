// La comprobación pública de integridad: /verificar/[hash]
//
// Cualquiera con la huella que aparece en el Informe de Firmas (o en el correo) puede
// entrar acá y confirmar que ese documento existe, cuándo se firmó y quiénes lo firmaron.
// Es lo que sostiene el requisito legal de "poder detectar cualquier alteración": si
// alguien cambia un carácter del PDF, su huella deja de coincidir con esta.
//
// No muestra el contrato ni datos de contacto — solo lo justo para acreditar. Quien tiene
// derecho a leerlo ya lo tiene. Sin sesión: la huella misma es la llave (256 bits).

import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFirmante } from "@/lib/contracts/render";
import { huellaLegible } from "@/lib/contracts/firma";
import { esEmpresa, type ContractVariables } from "@/lib/contracts/template";

export const metadata: Metadata = {
  title: "Verificación de documento — Camino Sacro",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const fecha = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short",
});

export default async function PaginaVerificar({ params }: { params: Promise<{ hash: string }> }) {
  const { hash: crudo } = await params;
  const hash = (crudo ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
  const valido = /^[0-9a-f]{64}$/.test(hash);

  const supabase = createAdminClient("comercial");
  const { data: c } = valido
    ? await supabase
        .from("contracts")
        .select("id, signed_at, signer_name, signer_document, signer_auth_method, variables_json, kind, org_signer, created_at")
        .eq("doc_hash", hash)
        .eq("status", "firmado")
        .maybeSingle()
    : { data: null };

  const vars = (c?.variables_json ?? {}) as ContractVariables;
  const empresa = !!c && (c.kind === "empresa" || esEmpresa(vars));
  const org = c ? await getFirmante(supabase, c.org_signer as string | null) : null;
  const tipoDoc = empresa ? vars.rep_tipo_documento || "Documento" : "Pasaporte";

  return (
    <main className="min-h-screen bg-crema">
      <header className="bg-bosque px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-dorado">Camino Sacro</p>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl">Verificación de documento</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 -mt-6">
        <div className="bg-white border border-border rounded-2xl shadow-sm px-6 py-6">
          {c ? (
            <>
              <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Documento auténtico</p>
              <h2 className="font-display text-2xl text-bosque mt-1">Esta huella corresponde a un contrato firmado</h2>
              <p className="text-sm text-muted mt-3">
                El documento fue firmado electrónicamente en la plataforma de Camino Sacro conforme a la Ley 527 de
                1999 y el Decreto 2364 de 2012. Si el archivo que tienes produce esta misma huella, es exactamente el
                que se firmó.
              </p>

              <dl className="mt-5 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-y-2 gap-x-4 text-sm">
                <dt className="text-muted text-xs uppercase tracking-wide pt-0.5">Contrato</dt>
                <dd>Acuerdo de Prestación de Servicios Turísticos No. {vars.codigo_cotizacion || "—"}{empresa ? " (empresa)" : ""}</dd>
                <dt className="text-muted text-xs uppercase tracking-wide pt-0.5">Número</dt>
                <dd className="font-mono text-xs break-all">{c.id}</dd>
                <dt className="text-muted text-xs uppercase tracking-wide pt-0.5">Firmado el</dt>
                <dd>{c.signed_at ? fecha.format(new Date(c.signed_at)) : "—"} (America/Bogota)</dd>
                <dt className="text-muted text-xs uppercase tracking-wide pt-0.5">Camino Sacro</dt>
                <dd>{org ? `${org.nombre} · ${org.documento_tipo} ${org.documento}` : "—"}</dd>
                <dt className="text-muted text-xs uppercase tracking-wide pt-0.5">{empresa ? "Representante legal" : "El Viajero"}</dt>
                <dd>
                  {c.signer_name} · {tipoDoc} {c.signer_document}
                  {empresa && vars.empresa_razon_social ? ` · por ${vars.empresa_razon_social}` : ""}
                </dd>
                <dt className="text-muted text-xs uppercase tracking-wide pt-0.5">Verificación</dt>
                <dd>
                  {c.signer_auth_method === "otp_email"
                    ? "Validado por código único enviado por correo electrónico"
                    : "Identidad declarada con documento de viaje"}
                </dd>
              </dl>

              <div className="mt-6">
                <p className="text-[11px] uppercase tracking-[0.18em] text-dorado-oscuro">Huella SHA-256 del documento firmado</p>
                <code className="block mt-1 text-xs break-all text-fg">{huellaLegible(hash)}</code>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Sin coincidencia</p>
              <h2 className="font-display text-2xl text-bosque mt-1">No encontramos ese documento</h2>
              <p className="text-sm text-muted mt-3">
                {valido
                  ? "Ninguno de nuestros contratos firmados tiene esa huella. Puede que el archivo haya cambiado desde que se firmó, o que la huella se haya copiado con algún error."
                  : "Una huella SHA-256 son 64 caracteres entre 0-9 y a-f. Revisa que la hayas copiado completa."}
              </p>
              <p className="text-sm text-muted mt-3">
                Si crees que es un error, escríbenos a reservas@caminosacro.com.
              </p>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-muted mt-6">
          ¿Tienes otra huella? <Link href="/verificar" className="underline">Verificar otro documento</Link>
        </p>
      </div>
    </main>
  );
}
