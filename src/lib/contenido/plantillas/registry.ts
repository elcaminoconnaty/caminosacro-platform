// El registry: ÚNICO lugar que conoce todas las plantillas.
//
// De acá salen dos cosas y por eso importa que sea uno solo:
//   - el formulario del editor, que se GENERA a partir de `campos` (nunca se escribe a
//     mano una pantalla por plantilla), y
//   - la prueba de humo, que recorre el registry × los formatos declarados de cada una.
//
// Agregar una plantilla = crear su .tsx con `definicion` + componente, e inscribirla acá.

import type { Formato, FormatoId } from "../formatos";
import type { DefinicionPlantilla, Slide } from "../tipos";

import { definicion as defPortadaRuta, PortadaRuta } from "./portadaRuta";
import { definicion as defCierreCta, CierreCta } from "./cierreCta";
import { definicion as defDatoGrande, DatoGrande } from "./datoGrande";
import { definicion as defTipNumerado, TipNumerado } from "./tipNumerado";
import { definicion as defMitoRealidad, MitoRealidad } from "./mitoRealidad";
import { definicion as defTestimonio, Testimonio } from "./testimonio";
import { definicion as defEtapasRuta, EtapasRuta } from "./etapasRuta";
import { definicion as defComparativaPrecio, ComparativaPrecio } from "./comparativaPrecio";
import { definicion as defListaEmpaque, ListaEmpaque } from "./listaEmpaque";

export type ComponentePlantilla = (props: { f: Formato; slide: Slide }) => React.ReactElement;

export type EntradaRegistry = {
  definicion: DefinicionPlantilla;
  Componente: ComponentePlantilla;
};

export const PLANTILLAS: Record<string, EntradaRegistry> = {
  [defPortadaRuta.id]: { definicion: defPortadaRuta, Componente: PortadaRuta },
  [defTipNumerado.id]: { definicion: defTipNumerado, Componente: TipNumerado },
  [defDatoGrande.id]: { definicion: defDatoGrande, Componente: DatoGrande },
  [defEtapasRuta.id]: { definicion: defEtapasRuta, Componente: EtapasRuta },
  [defComparativaPrecio.id]: { definicion: defComparativaPrecio, Componente: ComparativaPrecio },
  [defMitoRealidad.id]: { definicion: defMitoRealidad, Componente: MitoRealidad },
  [defTestimonio.id]: { definicion: defTestimonio, Componente: Testimonio },
  [defCierreCta.id]: { definicion: defCierreCta, Componente: CierreCta },
  [defListaEmpaque.id]: { definicion: defListaEmpaque, Componente: ListaEmpaque },
};

export const PLANTILLAS_LISTA: EntradaRegistry[] = Object.values(PLANTILLAS);

export function plantilla(id: string): EntradaRegistry | null {
  return PLANTILLAS[id] ?? null;
}

/** Las plantillas que tienen sentido en un formato dado (para los selectores del editor). */
export function plantillasDeFormato(formato: FormatoId): DefinicionPlantilla[] {
  return PLANTILLAS_LISTA.filter((p) => p.definicion.formatos.includes(formato)).map((p) => p.definicion);
}

/** Los valores por defecto de una plantilla, para estrenar un slide ya con algo escrito. */
export function valoresPorDefecto(id: string): Record<string, string> {
  const p = plantilla(id);
  if (!p) return {};
  const out: Record<string, string> = {};
  for (const campo of p.definicion.campos) {
    if (campo.porDefecto !== undefined) out[campo.id] = campo.porDefecto;
  }
  return out;
}
