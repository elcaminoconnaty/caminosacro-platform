"use client";

import { useState } from "react";
import { createPublicClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createPublicClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
      setLoading(false);
      return;
    }
    // Recarga completa para que el servidor tome la sesión y aplique el layout autenticado.
    window.location.assign("/");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-muted mb-1">Correo electrónico</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="w-full px-3 py-2 rounded-md border border-border bg-white"
        />
      </div>
      <div>
        <label className="block text-sm text-muted mb-1">Contraseña</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2 rounded-md border border-border bg-white"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 rounded-md bg-bosque text-white text-sm font-medium hover:bg-bosque-medio disabled:opacity-50 transition"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
