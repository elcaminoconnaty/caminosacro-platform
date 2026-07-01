"use client";

import { useState } from "react";
import { MapPin, ListOrdered, Pencil } from "lucide-react";
import CreateRoutePanel from "./CreateRoutePanel";
import CreateItineraryPanel from "./CreateItineraryPanel";
import EditRoutePanel from "./EditRoutePanel";

export default function CatalogToolbar({
  families,
  routes,
}: {
  families: string[];
  routes: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState<"route" | "itinerary" | "edit" | null>(null);

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
        <button
          onClick={() => setOpen((o) => (o === "edit" ? null : "edit"))}
          className={`inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-md border transition ${
            open === "edit" ? "bg-bosque text-white border-bosque" : "border-border bg-bg-card hover:bg-taupe/40"
          }`}
        >
          <Pencil size={15} /> Editar / eliminar ruta
        </button>
      </div>

      {open === "route" && <CreateRoutePanel families={families} onClose={() => setOpen(null)} />}
      {open === "itinerary" && <CreateItineraryPanel routes={routes} onClose={() => setOpen(null)} />}
      {open === "edit" && <EditRoutePanel families={families} routes={routes} onClose={() => setOpen(null)} />}
    </div>
  );
}
