// /verificar — pegar la huella SHA-256 que aparece en el Informe de Firmas y comprobarla.
// La comprobación real vive en /verificar/[hash]; esta página solo arma esa URL.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Verificar un documento — Camino Sacro",
  robots: { index: false, follow: false },
};

async function irAVerificar(formData: FormData) {
  "use server";
  const hash = String(formData.get("hash") || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  redirect(`/verificar/${hash || "0"}`);
}

export default function PaginaVerificarInicio() {
  return (
    <main className="min-h-screen bg-crema">
      <header className="bg-bosque px-4 py-10 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-dorado">Camino Sacro</p>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl">Verificar un documento</h1>
          <p className="mt-3 text-sm text-white/75 max-w-xl mx-auto">
            Pega la huella SHA-256 que aparece en el Informe de Firmas o en el correo con tu contrato firmado.
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 -mt-6">
        <form action={irAVerificar} className="bg-white border border-border rounded-2xl shadow-sm px-6 py-6 space-y-4">
          <label className="text-xs block">
            <span className="text-muted">Huella SHA-256 (64 caracteres; los espacios no importan)</span>
            <textarea
              name="hash"
              rows={3}
              required
              className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm font-mono bg-white"
              placeholder="c7a9 0988 fd96 6beb …"
            />
          </label>
          <button
            type="submit"
            className="w-full py-3 rounded-full bg-bosque text-white font-medium hover:bg-bosque-medio transition"
          >
            Verificar
          </button>
          <p className="text-[11px] text-muted">
            Para calcular la huella de un archivo en tu computador: en Mac, <code>shasum -a 256 archivo.pdf</code>; en
            Windows, <code>certutil -hashfile archivo.pdf SHA256</code>.
          </p>
        </form>
      </div>
    </main>
  );
}
