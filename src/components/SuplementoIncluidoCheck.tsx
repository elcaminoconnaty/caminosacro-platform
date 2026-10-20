"use client";

import type { SeasonResult } from "@/lib/seasons";

/**
 * La pregunta que aparece cuando el precio por persona se puso a mano y el viaje cae en
 * temporada alta o Semana Santa: ¿el suplemento se suma aparte o ya está dentro de ese
 * precio? Uso interno (migración 0061): el cliente solo ve el precio final.
 */
export default function SuplementoIncluidoCheck({
  season,
  incluido,
  onChange,
}: {
  season: SeasonResult;
  incluido: boolean;
  onChange: (v: boolean) => void;
}) {
  if (season.type === "regular") return null;
  return (
    <label className="flex items-start gap-2 rounded-md border border-dorado-oscuro/40 bg-dorado-oscuro/5 px-3 py-2 text-xs cursor-pointer">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={incluido}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium text-dorado-oscuro">
          El precio que puse ya incluye el suplemento de {season.label.toLowerCase()}
        </span>
        <span className="block text-muted">
          {incluido
            ? `No se suma nada aparte: la venta y el costo Pilgrim por persona ya traen los ${season.surcharge_per_person_cs} € (Pilgrim ${season.surcharge_per_person_pilgrim} €).`
            : `Sin marcar, se suman ${season.surcharge_per_person_cs} €/persona a la venta y ${season.surcharge_per_person_pilgrim} €/persona al costo Pilgrim.`}
          {" "}Solo uso interno.
        </span>
      </span>
    </label>
  );
}
