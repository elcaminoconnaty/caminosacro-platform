// Página pública de firma del contrato: /contrato/[token]
// El viajero llega desde el link enviado por el CRM, lee el contrato con sus
// datos, lo firma electrónicamente y sube la foto de su pasaporte.
// Sin sesión: el token único + expiración hacen de autenticación (patrón /cotizar).

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  contractIntro,
  contractConsideraciones,
  contractClauses,
  anexosTexto,
  pagareSections,
  type ContractVariables,
  type PaymentPlan,
} from "@/lib/contracts/template";
import SignForm from "./SignForm";
import Aviso from "./Aviso";

export const metadata: Metadata = {
  title: "Firma de contrato — Camino Sacro",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FirmaContrato({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 32) return <Aviso titulo="Enlace no válido" detalle="Revisa que el enlace esté completo o pídenos uno nuevo." />;

  const supabase = createAdminClient("comercial");
  const { data: contract } = await supabase
    .from("contracts")
    .select("id,status,token_expires_at,variables_json,payment_plan_json,signed_at,signer_name")
    .eq("token", token)
    .maybeSingle();

  if (!contract) {
    return <Aviso titulo="Enlace no válido" detalle="Este enlace de firma no existe o fue anulado. Escríbenos y te enviamos uno nuevo." />;
  }
  if (contract.status === "firmado") {
    return (
      <Aviso
        titulo="¡Contrato ya firmado!"
        detalle={`Este contrato fue firmado el ${contract.signed_at ? new Date(contract.signed_at).toLocaleDateString("es-CO") : ""}. Te enviamos la copia a tu correo. ¡Buen Camino!`}
      />
    );
  }
  if (contract.status !== "enviado") {
    return <Aviso titulo="Enlace inactivo" detalle="Este contrato aún no está habilitado para firma. Escríbenos si crees que es un error." />;
  }
  if (contract.token_expires_at && new Date(contract.token_expires_at).getTime() < Date.now()) {
    return <Aviso titulo="Enlace vencido" detalle="Por seguridad, los enlaces de firma vencen. Escríbenos a reservas@caminosacro.com y te enviamos uno nuevo." />;
  }

  const v = contract.variables_json as ContractVariables;
  const plan = contract.payment_plan_json as PaymentPlan;
  const clauses = contractClauses(v, plan);
  const hoyBogota = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date());
  const pagare = plan.type === "financiado" ? pagareSections(v, hoyBogota) : [];

  return (
    <main className="min-h-screen bg-crema">
      {/* Header de marca — mismo ADN del cotizador público */}
      <header className="bg-bosque px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-dorado">Camino Sacro</p>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl">Tu contrato de servicios</h1>
          <p className="mt-3 text-sm text-white/75 max-w-xl mx-auto">
            Hola {v.viajero_nombre.split(/\s+/)[0] || "peregrino"}: revisa tu contrato, fírmalo y sube la foto de tu
            pasaporte. Es el último paso antes de que gestionemos tus reservas.
          </p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 -mt-6">
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg text-bosque">Acuerdo de Prestación de Servicios Turísticos</h2>
            <p className="text-xs text-muted">
              Contrato No. {v.codigo_cotizacion} · {v.ruta_nombre}
            </p>
          </div>

          {/* Texto del contrato */}
          <article className="px-6 py-6 text-[13px] leading-relaxed text-fg max-h-[26rem] overflow-y-auto border-b border-border space-y-3">
            {contractIntro(v).map((p, i) => (
              <p key={`i${i}`}>{p}</p>
            ))}
            <h2 className="font-semibold uppercase text-xs tracking-wide pt-2">Consideraciones</h2>
            {contractConsideraciones(v).map((p, i) => (
              <p key={`c${i}`}>{p}</p>
            ))}
            <h2 className="font-semibold uppercase text-xs tracking-wide pt-2">Cláusulas</h2>
            {clauses.map((cl, i) => (
              <div key={`cl${i}`}>
                <h3 className="font-semibold text-xs uppercase">{cl.title}</h3>
                {cl.paragraphs.map((p, j) => (
                  <p key={`p${j}`} className="mt-1">{p}</p>
                ))}
              </div>
            ))}
            <p className="pt-2 text-muted">{anexosTexto(v, plan)}</p>
            {pagare.map((sec, i) => (
              <div key={`px${i}`} className="pt-2">
                <h3 className="font-semibold text-xs uppercase">{sec.title}</h3>
                {sec.paragraphs.map((p, j) => (
                  <p key={`pp${j}`} className="mt-1">{p}</p>
                ))}
              </div>
            ))}
          </article>

          <SignForm
            token={token}
            defaultName={v.viajero_nombre}
            defaultDocument={v.viajero_documento}
            docType={v.viajero_tipo_documento}
            financiado={plan.type === "financiado"}
          />
        </div>

        <p className="text-center text-[11px] text-muted mt-6">
          Firma electrónica conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012 (Colombia). Tus datos se tratan
          según nuestra política de datos (Ley 1581 de 2012) · reservas@caminosacro.com
        </p>
      </div>
    </main>
  );
}
