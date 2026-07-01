"use client";

import { useState } from "react";
import { MapPin, ListOrdered } from "lucide-react";
import CreateRoutePanel from "./CreateRoutePanel";
import CreateItineraryPanel from "./CreateItineraryPanel";

export default function CatalogToolbar({
  families,
  routes,
}: {
  families: string[];
  routes: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState<"route" | "itinerary" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setOpen((o) => (o === "route" ? null : "route"))}
          className={`inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-md border transition ${
            open === "route" ? "bg-bosque text-white border-bosque" : "border-border bg-bg-card hover:bg-taupe/40"
          }`}
        >
          <MapPin size={15} /> Crear ruta
        </button>
        <button
          onClick={() => setOpen((o) => (o === "itinerary" ? null : "itinerary"))}
          className={`inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-md border transition ${
            open === "itinerary" ? "bg-bosque text-white border-bosque" : "border-border bg-bg-card hover:bg-taupe/40"
          }`}
        >
          <ListOrdered size={15} /> Crear itinerario
        </button>
      </div>

      {open === "route" && <CreateRoutePanel families={families} onClose={() => setOpen(null)} />}
      {open === "itinerary" && <CreateItineraryPanel routes={routes} onClose={() => setOpen(null)} />}
    </div>
  );
}
