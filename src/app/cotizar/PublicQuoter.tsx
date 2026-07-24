"use client";

import { useMemo, useState, useTransition } from "react";
import { detectSeason, type SeasonSupplements } from "@/lib/seasons";
import { crearCotizacionPublica, type ResultadoCotizacion } from "./actions";
import { MODALIDADES, WHATSAPP_VENTAS } from "./constants";

export type PublicRoute = {
  id: string;
  name: string;
  family: string | null;
  origin: string | null;
  days: number | null;
  km: number | null;
  modality: string | null; // senderismo | bici | mixto
  /** Solo price_cs (precio al cliente). El costo del proveedor nunca llega acá. */
  prices: Record<string, number>;
};

const hoyMas = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const eur = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}€`;

export default function PublicQuoter({
  routes,
  seasonConfig,
  trmEurCop,
  whatsappNico,
}: {
  routes: PublicRoute[];
  seasonConfig: SeasonSupplements;
  trmEurCop: number | null;
  whatsappNico: string;
}) {
  const [routeId, setRouteId] = useState("");
  const [modality, setModality] = useState("");
  const [startDate, setStartDate] = useState("");
  const [people, setPeople] = useState(2);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<Extract<ResultadoCotizacion, { ok: true }> | null>(null);
  const [rutaAMedida, setRutaAMedida] = useState<PublicRoute | null>(null);

  const conPrecio = useMemo(() => routes.filter((r) => Object.keys(r.prices).length > 0), [routes]);
  const sinPrecio = useMemo(() => routes.filter((r) => Object.keys(r.prices).length === 0), [routes]);

  const route = useMemo(() => routes.find((r) => r.id === routeId) ?? null, [routes, routeId]);

  const endDate = useMemo(() => {
    if (!startDate || !route?.days) return startDate;
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + route.days - 1);
    return d.toISOString().slice(0, 10);
  }, [startDate, route]);

  const season = useMemo(
    () => detectSeason(startDate || null, endDate || null, seasonConfig),
    [startDate, endDate, seasonConfig],
  );

  const precioPersona = route && modality ? route.prices[modality] ?? 0 : 0;
  const base = precioPersona * people;
  const suplemento = season.surcharge_per_person_cs * people;
  const total = base + suplemento;
  const totalCop = trmEurCop ? Math.round(total * trmEurCop) : null;

  const listo = Boolean(routeId && modality && startDate && precioPersona > 0);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await crearCotizacionPublica({
        route_id: routeId,
        modality: modality as "pension_doble" | "pension_single" | "hotel_doble" | "hotel_single",
        start_date: startDate,
        people,
        full_name: fullName,
        email,
        phone,
        country: country || null,
        website,
      });
      if (r.ok) setExito(r);
      else setError(r.error);
    });
  }

  if (exito) {
    return (
      <main className="min-h-screen bg-crema px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Cotización {exito.code}</p>
          <h1 className="font-display mt-3 text-3xl text-bosque">Tu Camino ya está cotizado</h1>
          <p className="mt-3 text-muted">
            {exito.emailEnviado ? (
              <>
                Te enviamos el PDF a <b className="text-fg">{email}</b>. Si no aparece en unos minutos, mira en spam.
              </>
            ) : (
              <>Descarga tu cotización aquí abajo. Si prefieres, te la reenviamos por WhatsApp.</>
            )}
          </p>
          <p className="font-display mt-6 text-4xl text-bosque">{eur(exito.totalEur)}</p>
          <p className="text-xs text-muted">total para {people} {people === 1 ? "persona" : "personas"}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {exito.pdfUrl && (
              <a
                href={exito.pdfUrl}
                target="_blank"
                rel="noopener"
                className="rounded-full bg-bosque px-6 py-3 font-medium text-white transition hover:bg-bosque-medio"
              >
                Descargar el PDF
              </a>
            )}
            <a
              href={`https://wa.me/${WHATSAPP_VENTAS}?text=${encodeURIComponent(`Hola, acabo de cotizar el ${exito.code} y quiero reservar.`)}`}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-bosque px-6 py-3 font-medium text-bosque transition hover:bg-bosque hover:text-white"
            >
              Reservar por WhatsApp
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-crema">
      <header className="bg-bosque px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs uppercase tracking-[0.18em] text-dorado">Camino Sacro</p>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl">Cotiza tu Camino en 2 minutos</h1>
          <p className="mt-2 max-w-xl text-white/80">
            Elige tu ruta y te enviamos el PDF con todo lo que incluye: alojamiento con baño privado,
            traslado de equipaje y asistencia 24h.
          </p>
        </div>
      </header>

      <form onSubmit={enviar} className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        {/* 1. RUTA */}
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-xl text-bosque">1 · ¿Qué Camino quieres hacer?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {conPrecio.map((r) => {
              const desde = Math.min(...Object.values(r.prices));
              const activa = r.id === routeId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRouteId(r.id);
                    if (modality && !r.prices[modality]) setModality("");
                  }}
                  className={`rounded-xl border p-4 text-left transition ${
                    activa ? "border-bosque bg-bosque/5 ring-1 ring-bosque" : "border-border hover:border-bosque/50"
                  }`}
                >
                  <span className="block font-display text-lg text-bosque">{r.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {[r.days ? `${r.days} días` : null, r.km ? `${r.km} km` : null, r.modality === "bici" ? "en bici" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="mt-2 block text-sm text-bosque">desde {eur(desde)} por persona</span>
                </button>
              );
            })}
          </div>

          {sinPrecio.length > 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-border p-4">
              <p className="text-sm font-medium text-bosque">¿Buscas otra ruta?</p>
              <p className="mt-1 text-xs text-muted">
                Estas las armamos a tu medida, según fechas y grupo:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sinPrecio.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRutaAMedida(r)}
                    className="rounded-full border border-border bg-crema px-3 py-1.5 text-xs text-bosque transition hover:border-bosque"
                  >
                    {r.name} →
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 2. VIAJE */}
        <section className={`rounded-2xl border border-border bg-white p-6 ${route ? "" : "opacity-50"}`}>
          <h2 className="font-display text-xl text-bosque">2 · Tu viaje</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs text-muted">¿Cuándo empiezas?</span>
              <input
                type="date"
                required
                disabled={!route}
                min={hoyMas(7)}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2"
              />
              {route?.days && startDate && (
                <span className="mt-1 block text-[11px] text-muted">
                  Termina el {endDate} ({route.days} días)
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted">¿Cuántos van?</span>
              <input
                type="number"
                min={1}
                max={12}
                disabled={!route}
                value={people}
                onChange={(e) => setPeople(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
          </div>

          <p className="mt-5 text-xs text-muted">Alojamiento</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {MODALIDADES.map((m) => {
              const precio = route?.prices[m.slug] ?? 0;
              if (!route || precio <= 0) return null;
              const activa = modality === m.slug;
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => setModality(m.slug)}
                  className={`rounded-xl border p-4 text-left transition ${
                    activa ? "border-bosque bg-bosque/5 ring-1 ring-bosque" : "border-border hover:border-bosque/50"
                  }`}
                >
                  <span className="block text-sm font-medium text-bosque">{m.label}</span>
                  <span className="block text-[11px] text-muted">{m.hint}</span>
                  <span className="mt-1 block text-sm text-bosque">{eur(precio)} por persona</span>
                </button>
              );
            })}
          </div>

          {listo && (
            <div className="mt-6 rounded-xl bg-crema p-5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">
                  {eur(precioPersona)} × {people} {people === 1 ? "persona" : "personas"}
                </span>
                <span className="text-fg">{eur(base)}</span>
              </div>
              {suplemento > 0 && (
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span className="text-muted">
                    {season.label} (+{season.surcharge_per_person_cs}€ por persona)
                  </span>
                  <span className="text-fg">{eur(suplemento)}</span>
                </div>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="font-medium text-bosque">Total</span>
                <span className="font-display text-2xl text-bosque">{eur(total)}</span>
              </div>
              {totalCop && (
                <p className="mt-1 text-right text-[11px] text-muted">
                  ≈ {totalCop.toLocaleString("es-CO")} COP (referencia del día)
                </p>
              )}
            </div>
          )}
        </section>

        {/* 3. DATOS */}
        <section className={`rounded-2xl border border-border bg-white p-6 ${listo ? "" : "opacity-50"}`}>
          <h2 className="font-display text-xl text-bosque">3 · ¿A dónde te enviamos la cotización?</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs text-muted">Nombre y apellido</span>
              <input
                required
                disabled={!listo}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted">Correo</span>
              <input
                type="email"
                required
                disabled={!listo}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted">WhatsApp (con indicativo)</span>
              <input
                required
                disabled={!listo}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+57 300 000 0000"
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted">País (opcional)</span>
              <input
                disabled={!listo}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2"
              />
            </label>
          </div>

          {/* Honeypot: invisible para personas, irresistible para bots. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
            aria-hidden="true"
          />

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          <button
            type="submit"
            disabled={!listo || pending}
            className="mt-6 w-full rounded-full bg-dorado px-6 py-3.5 font-bold text-bosque transition hover:bg-dorado-oscuro disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Preparando tu cotización…" : "Recibir mi cotización en PDF"}
          </button>
          <p className="mt-3 text-center text-[11px] text-muted">
            Sin compromiso. Usamos tus datos solo para enviarte esta cotización.
          </p>
        </section>
      </form>

      {rutaAMedida && (
        <RutaAMedida ruta={rutaAMedida} whatsappNico={whatsappNico} onClose={() => setRutaAMedida(null)} />
      )}
    </main>
  );
}

function RutaAMedida({
  ruta,
  whatsappNico,
  onClose,
}: {
  ruta: PublicRoute;
  whatsappNico: string;
  onClose: () => void;
}) {
  const texto = encodeURIComponent(
    `Hola Nico, quiero una cotización personalizada para ${ruta.name}.`,
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs uppercase tracking-[0.18em] text-dorado-oscuro">Ruta a medida</p>
        <h3 className="font-display mt-2 text-2xl text-bosque">{ruta.name}</h3>
        <p className="mt-3 text-sm text-muted">
          Esta ruta la armamos una por una, según tus fechas y tu grupo. Escríbele a Nico y te
          prepara la cotización personalizada.
        </p>
        <a
          href={`https://wa.me/${whatsappNico}?text=${texto}`}
          target="_blank"
          rel="noopener"
          className="mt-6 block rounded-full bg-bosque px-6 py-3 font-medium text-white transition hover:bg-bosque-medio"
        >
          Escribirle a Nico por WhatsApp
        </a>
        <button type="button" onClick={onClose} className="mt-3 text-xs text-muted hover:text-fg">
          Volver a las rutas
        </button>
      </div>
    </div>
  );
}
