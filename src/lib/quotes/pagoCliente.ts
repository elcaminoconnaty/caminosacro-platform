import { accountCurrency, accountLabel } from "@/lib/accounts";

/**
 * Las tres guardas del importe en euros de un cobro.
 *
 * El euro que queda guardado en `client_payments.amount_eur` es lo que decide el saldo del
 * cliente, y hasta ahora no lo garantizaba nada (§2.5 de la auditoría). Había tres agujeros
 * y los tres siguen el mismo patrón —el dato entra sin que nadie lo mire—:
 *
 *  1. **Los dólares no tenían ni campo de tasa.** `amount_eur` salía `null` y el cobro
 *     desaparecía del saldo: al cliente se le podía reclamar plata que ya pagó.
 *  2. **Los pesos aceptaban la tasa vacía o en cero**, con el mismo resultado.
 *  3. **La moneda de la cuenta no la miraba nadie**, aunque `accountCurrency()` estaba
 *     escrita desde el principio y sin usar. Caso vivo al 4-sep-2026: CS-2026-019 tiene un
 *     pago de 20,00 EUR contra `bancolombia_naty`, que es una cuenta en pesos. O de verdad
 *     entraron 20 €, o entraron 20.000 COP y el euro guardado es ficción.
 *
 * La misma expresión estaba en el alta y en la edición, así que **un pago hoy correcto se
 * corrompía al editarlo**. Por eso esto vive aparte: para que los dos caminos usen
 * exactamente la misma regla y no puedan volver a separarse.
 *
 * Lo que NO hace: convertir a la fuerza ni adivinar una tasa. Si falta, se pide.
 */

export type MonedaPago = "EUR" | "COP" | "USD";

export const MONEDAS_PAGO: readonly MonedaPago[] = ["EUR", "COP", "USD"];

export function esMonedaPago(v: unknown): v is MonedaPago {
  return typeof v === "string" && (MONEDAS_PAGO as readonly string[]).includes(v);
}

export type EntradaPago = {
  amount: number;
  currency: MonedaPago;
  /** Cuántas unidades de `currency` vale un euro. Para EUR no aplica. */
  trm: number | null;
  account: string | null;
};

export type ResultadoPago =
  | { ok: true; amountEur: number; aviso?: string }
  | { ok: false; error: string };

/**
 * Valida un cobro y devuelve su importe en euros, o el motivo por el que no se puede
 * guardar. El aviso es para lo que huele mal pero puede ser legítimo.
 */
export function resolverPagoCliente(p: EntradaPago): ResultadoPago {
  if (!(p.amount > 0)) {
    return { ok: false, error: "El importe del pago tiene que ser mayor que cero." };
  }

  const monedaCuenta = accountCurrency(p.account);

  if (p.currency === "EUR") {
    // Una cuenta en pesos no recibe euros. Si de verdad entraron euros, la cuenta está mal
    // elegida; y si la cuenta está bien, el importe está en pesos y le falta su tasa. En
    // los dos casos el saldo del cliente sale mintiendo, así que se para acá.
    if (monedaCuenta && monedaCuenta !== "EUR") {
      return {
        ok: false,
        error:
          `La cuenta «${accountLabel(p.account)}» está en ${monedaCuenta}, así que un cobro en EUR no cuadra. ` +
          `Si el dinero entró en ${monedaCuenta}, cambia la moneda del pago y pon la tasa del día; ` +
          `si de verdad entró en euros, elige la cuenta en euros.`,
      };
    }
    return { ok: true, amountEur: p.amount };
  }

  // Moneda distinta del euro: la tasa deja de ser opcional. Sin ella el cobro entraba con
  // `amount_eur` en null y desaparecía del saldo, que es peor que no registrarlo.
  if (!p.trm || !(p.trm > 0)) {
    return {
      ok: false,
      error:
        `Falta la tasa de cambio para un cobro en ${p.currency}. ` +
        `Escribe cuántos ${p.currency} valía un euro el día del pago: sin eso el saldo del cliente sale mal.`,
    };
  }

  const amountEur = p.amount / p.trm;
  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    return { ok: false, error: "Con esa tasa el importe en euros no da un número válido. Revísala." };
  }

  // Aquí se avisa en vez de parar: puede ser un cobro real en pesos que entró a la cuenta
  // en euros por una transferencia internacional, y eso pasa.
  const aviso =
    monedaCuenta && monedaCuenta !== p.currency
      ? `Ojo: el cobro es en ${p.currency} y la cuenta «${accountLabel(p.account)}» está en ${monedaCuenta}. ` +
        `Se guardó igual; revisa que la cuenta sea la correcta.`
      : undefined;

  // Dos decimales: es plata, y arrastrar la cola del float hace que dos pagos iguales
  // sumen distinto según el orden.
  return { ok: true, amountEur: Math.round(amountEur * 100) / 100, ...(aviso ? { aviso } : {}) };
}
