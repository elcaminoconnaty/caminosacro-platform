/**
 * Lo que la carta de bienvenida dice de la ruta: el título ("Camino Francés desde Sarria")
 * y el párrafo de presentación.
 *
 * Las cartas originales se escribieron a mano, una por ruta (Francés desde Sarria y
 * Portugués desde Tui). Esos dos párrafos se conservan palabra por palabra; para el resto
 * de familias hay uno con el mismo tono. Los km y las etapas salen del itinerario de la
 * cotización, no del catálogo, para que el párrafo no contradiga la tabla de abajo.
 *
 * Todo esto es la SUGERENCIA: el seguimiento deja corregir título y párrafo antes de
 * generar la carta, sin guardar nada.
 */

export type DatosRuta = {
  /** `routes.family`: Francés, Portugués, Costero, Norte, Primitivo, Inglés, Fisterra. */
  familia: string | null;
  /** `routes.name` o, si la ruta no está en el catálogo, `quotes.route_name`. */
  nombre: string | null;
  /** Pueblo donde empieza a caminar: la primera etapa del itinerario, o el catálogo. */
  origen: string | null;
  enBici: boolean;
  km: number;
  etapas: number;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** "Camino Francés desde Sarria", "Camino Primitivo en bici desde Oviedo"… */
export function tituloRuta(r: DatosRuta): string {
  const f = norm(r.familia);
  const bici = r.enBici ? " en bici" : "";
  const desde = r.origen ? ` desde ${r.origen}` : "";

  if (f === "fisterra") return "Camino a Fisterra";
  const camino =
    f === "frances" ? "Camino Francés"
    : f === "portugues" ? (norm(r.nombre).includes("espiritual") ? "Camino Portugués · Variante Espiritual" : "Camino Portugués")
    : f === "costero" ? "Camino Portugués por la Costa"
    : f === "norte" ? "Camino del Norte"
    : f === "primitivo" ? "Camino Primitivo"
    : f === "ingles" ? "Camino Inglés"
    : null;

  if (camino) return `${camino}${bici}${desde}`;
  // Familia desconocida: el nombre de la ruta tal cual, sin inventar.
  return r.nombre?.trim() || "Camino de Santiago";
}

/** El párrafo de "TU RUTA". */
export function introRuta(r: DatosRuta): string {
  const f = norm(r.familia);
  const o = norm(r.origen);
  const km = `${Math.round(r.km)} km`;
  const n = `${r.etapas} ${r.etapas === 1 ? "etapa" : "etapas"}`;

  if (f === "frances" && o === "sarria") {
    return `Vas a recorrer los últimos ${km} del Camino más famoso del mundo. En ${n} atravesarás los paisajes más emblemáticos de Galicia — bosques de eucaliptos, aldeas de piedra, viñedos y caminos empedrados — hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral de Santiago por primera vez.`;
  }
  if (f === "frances") {
    return `Vas a recorrer ${km} del Camino más famoso del mundo. En ${n} cruzarás pueblos con siglos de historia, aldeas de piedra y caminos que han pisado millones de peregrinos antes que tú, hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral de Santiago por primera vez.`;
  }
  if (f === "portugues" && o === "tui") {
    return `Vas a recorrer ${km} desde la frontera con Portugal hasta Santiago de Compostela. Un camino más tranquilo e íntimo que el Francés, cruzando la Galicia interior por pueblos con encanto, puentes medievales y paisajes verdes que te acompañarán en cada etapa.`;
  }
  if (f === "portugues") {
    return `Vas a recorrer ${km} del Camino Portugués hasta Santiago de Compostela. Un camino más tranquilo e íntimo que el Francés, por pueblos con encanto, puentes medievales y paisajes verdes que te acompañarán en cada etapa.`;
  }
  if (f === "costero") {
    return `Vas a recorrer ${km} del Camino Portugués por la Costa hasta Santiago de Compostela. En ${n} caminarás junto al Atlántico, entre playas, pueblos de pescadores y paseos marítimos, antes de adentrarte en la Galicia verde que te llevará hasta la Plaza del Obradoiro.`;
  }
  if (f === "norte") {
    return `Vas a recorrer ${km} del Camino del Norte hasta Santiago de Compostela. Un camino sereno y menos transitado que en ${n} atraviesa la Galicia rural de prados, bosques y aldeas, hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral por primera vez.`;
  }
  if (f === "primitivo") {
    return `Vas a recorrer ${km} del Camino Primitivo, el más antiguo de todos: la ruta que siguió el rey Alfonso II en el siglo IX. Entre montañas, bosques y aldeas de piedra, en ${n} llegarás a la Plaza del Obradoiro y verás las torres de la Catedral de Santiago por primera vez.`;
  }
  if (f === "ingles") {
    return `Vas a recorrer ${km} del Camino Inglés, la ruta de los peregrinos que llegaban por mar a los puertos de Ferrol y A Coruña. En ${n} cruzarás rías, bosques y pueblos gallegos hasta llegar a la Plaza del Obradoiro y ver las torres de la Catedral de Santiago.`;
  }
  if (f === "fisterra") {
    return `Vas a recorrer ${km} desde Santiago de Compostela hasta Fisterra, el lugar que durante siglos se creyó el fin del mundo. En ${n} cruzarás la Galicia más auténtica hasta llegar al faro y ver el sol ponerse sobre el Atlántico.`;
  }
  return `Vas a recorrer ${km} en ${n} hasta Santiago de Compostela, por caminos, pueblos y paisajes que te acompañarán en cada paso hasta llegar a la Plaza del Obradoiro.`;
}
