"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/clara";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createPublicClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <p className="text-bosque font-medium">Revisá tu correo</p>
        <p className="text-muted text-sm">
          Te enviamos un enlace mágico a <span className="font-medium">{email}</span>. Hacé clic ahí para entrar.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-fg">Correo</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-white focus:outline-none focus:ring-2 focus:ring-bosque/40"
          placeholder="tu@correo.com"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 rounded-md bg-bosque text-white font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
      >
        {loading ? "Enviando…" : "Enviar enlace mágico"}
      </button>
      <p className="text-xs text-muted text-center">
        Sin contraseñas. Te llega un enlace al correo y entrás directo.
      </p>
    </form>
  );
}
