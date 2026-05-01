import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-crema">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-bosque">Camino Sacro</h1>
          <p className="text-muted text-sm mt-2">Plataforma Comercial</p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-8 shadow-sm">
          <Suspense fallback={<div className="text-muted text-sm">Cargando…</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
