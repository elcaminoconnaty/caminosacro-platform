/**
 * La franja «Hoy» del Seguimiento: qué cotizaciones piden trabajo, y cuál.
 *
 * Existe por un hallazgo que levantaron dos bloques de la auditoría por caminos distintos
 * (B2 y B7): el listado contesta muy bien «cómo va esta venta», pero no contesta nunca
 * «cuál abro». Está ordenado por número de cotización —o sea, por antigüedad— y ninguna de
 * sus columnas dice qué falta hacer. Una cotización que venció hace tres meses se ve igual
 * que una que se mandó ayer.
 *
 * Este módulo es la definición ÚNICA de los cuatro cubos: de aquí salen tanto los contadores
 * de la franja como el filtro que se aplica al pulsarlos. Si divergieran, el contador diría
 * una cosa y la tabla mostraría otra, que es peor que no tener franja.
 *
 * Las fechas se comparan como cadenas `YYYY-MM-DD` a propósito: `start_date` y `valid_until`
 * son DATE en Postgres (sin hora ni zona) y pasarlas por `new Date()` las corre un día en
 * cualquier huso al oeste de UTC — Bogotá, sin ir más lejos. El «hoy» lo calcula el servidor
 * en zona Bogotá y baja como prop, para que el render del servidor y el del navegador digan
 * lo mismo (si cada uno mirara su propio reloj, la hidratación no cuadraría).
 */

export const FOCOS = ["vencidas", "vencen", "saldo", "firma"] as const;
export type Foco = (typeof FOCOS)[number];

/** Días que miran hacia adelante los dos cubos de «se acerca». */
const DIAS_VENCE_PRONTO = 7;
const DIAS_SALIDA_CON_SALDO = 15;
const DIAS_SALIDA_SIN_FIRMA = 30;

/** Lo mínimo que necesita una fila para clasificarse. Lo cumple `QuoteRow`. */
export type FilaClasificable = {
  status: string | null;
  valid_until: string | null;
  start_date: string | null;
  saldo: number;
  cobrado: number;
  /** Contratos de la cotización que todavía no tienen firma. */
  sin_firmar: number;
};

/** Suma días a un `YYYY-MM-DD` sin salir de esa representación. */
function masDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  // Date.UTC evita que el huso local corra el día; solo se usa para hacer la aritmética.
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Una venta que de verdad está en marcha, para no dar la alarma por un presupuesto muerto.
 *
 * Mira el dinero además del estado porque cobrar NO mueve el estado en esta plataforma
 * (hallazgo §2.6 de la síntesis): hay cotizaciones con plata dentro que siguen diciendo
 * «enviada». Si alguna vez el estado se mueve solo al cobrar, esta función sigue valiendo.
 */
function esVentaViva(f: FilaClasificable): boolean {
  if (f.cobrado > 0) return true;
  return f.status === "aceptada" || f.status === "pago_parcial" || f.status === "pago_completo";
}

/** ¿Esta fila cae en este cubo? */
export function enFoco(f: FilaClasificable, foco: Foco, hoy: string): boolean {
  switch (foco) {
    // Precio caducado y nadie ha contestado: o se re-tarifa, o se cierra. Hoy son la mayor
    // bolsa de plata quieta de la plataforma y no aparecen por ningún lado.
    case "vencidas":
      return f.status === "enviada" && !!f.valid_until && f.valid_until < hoy;

    // Todavía está viva pero se apaga esta semana: es la única de las cuatro donde llamar
    // hoy en vez de mañana cambia el resultado.
    case "vencen":
      return (
        f.status === "enviada" &&
        !!f.valid_until &&
        f.valid_until >= hoy &&
        f.valid_until <= masDias(hoy, DIAS_VENCE_PRONTO)
      );

    // Viaja pronto y todavía debe. El orden de magnitud importa: cobrar después de la
    // salida es mucho más difícil que cobrar antes.
    case "saldo":
      return (
        esVentaViva(f) &&
        f.saldo > 0 &&
        !!f.start_date &&
        f.start_date >= hoy &&
        f.start_date <= masDias(hoy, DIAS_SALIDA_CON_SALDO)
      );

    // Sale pronto y alguien no ha firmado. Es el caso que abrió la síntesis —un viaje
    // pagado entero cuyo segundo viajero no firmó— y que era invisible desde esta pantalla
    // porque el listado no consultaba los contratos en absoluto.
    case "firma":
      return (
        f.sin_firmar > 0 &&
        !!f.start_date &&
        f.start_date >= hoy &&
        f.start_date <= masDias(hoy, DIAS_SALIDA_SIN_FIRMA)
      );
  }
}

export type ResumenFoco = {
  foco: Foco;
  /** Texto del chip. Corto: la franja se lee de reojo, no se estudia. */
  titulo: string;
  /** Qué hacer con estas, en voz de quien trabaja. */
  pie: string;
  cuantas: number;
  /** Plata en juego. `null` cuando sumarla no significaría nada. */
  eur: number | null;
  /** Cubo que pide acción inmediata: se pinta en rojo en vez de en ámbar. */
  urgente: boolean;
};

/** Los cuatro cubos con sus cuentas, en el orden en que conviene atacarlos. */
export function resumirFranja(filas: FilaClasificable[], hoy: string): ResumenFoco[] {
  const de = (foco: Foco) => filas.filter((f) => enFoco(f, foco, hoy));

  const firma = de("firma");
  const saldo = de("saldo");
  const vencen = de("vencen");
  const vencidas = de("vencidas");

  return [
    {
      foco: "firma",
      titulo: "Falta una firma",
      pie: `sale dentro de ${DIAS_SALIDA_SIN_FIRMA} días`,
      cuantas: firma.length,
      eur: null, // el dinero ya está cobrado o no; lo que falta acá es el papel
      urgente: firma.length > 0,
    },
    {
      foco: "saldo",
      titulo: "Sale y debe",
      pie: `sale dentro de ${DIAS_SALIDA_CON_SALDO} días con saldo`,
      cuantas: saldo.length,
      eur: saldo.reduce((s, f) => s + f.saldo, 0),
      urgente: saldo.length > 0,
    },
    {
      foco: "vencen",
      titulo: "Vence esta semana",
      pie: "el precio caduca en 7 días",
      cuantas: vencen.length,
      eur: vencen.reduce((s, f) => s + f.saldo, 0),
      urgente: false,
    },
    {
      foco: "vencidas",
      titulo: "Vencidas y quietas",
      pie: "precio caducado, sin respuesta",
      cuantas: vencidas.length,
      eur: vencidas.reduce((s, f) => s + f.saldo, 0),
      urgente: false,
    },
  ];
}
