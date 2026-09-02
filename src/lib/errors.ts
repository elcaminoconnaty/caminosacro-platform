// Traductor de errores a español claro para el usuario.
// Toma errores de Supabase/Postgres (u otros) y devuelve un mensaje entendible.
// Úsalo en cualquier acción del servidor antes de devolver { error } a la UI.

type AnyError = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

// Restricciones CHECK / UNIQUE conocidas → mensaje en español.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  // Debe seguir a QUOTE_STATUSES (src/lib/quoteStatus.ts) y al CHECK de la migración 0033,
  // que añadió "sin_enviar" y este mensaje no recogió.
  quotes_status_check:
    "El estado de la cotización no es válido. Estados permitidos: Sin enviar, Enviada, Aceptada, Pago parcial, Pago completo, Completada o Cancelada.",
  quotes_code_key: "Ya existe una cotización con ese código.",
  clients_phone_key: "Ya existe un cliente con ese teléfono.",
};

// Códigos de error de Postgres → mensaje genérico en español.
const PG_CODE_MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos (valor duplicado).",
  "23503": "No se puede completar: hay un dato relacionado que no existe.",
  "23502": "Falta completar un campo obligatorio.",
  "23514": "Alguno de los datos no cumple las reglas de validación.",
  "22001": "Un valor es demasiado largo para el campo.",
  "22007": "Una fecha tiene un formato incorrecto.",
  "42501": "No tenés permisos para realizar esta acción.",
  PGRST301: "Tu sesión expiró. Volvé a iniciar sesión.",
};

/**
 * Convierte cualquier error en un mensaje claro en español para mostrar al usuario.
 * @param error error de Supabase/Postgres u objeto con `.message`
 * @param fallback mensaje a usar si no se reconoce el error
 */
export function mensajeError(
  error: AnyError,
  fallback = "Ocurrió un error inesperado. Intentá de nuevo en unos minutos."
): string {
  if (!error) return fallback;

  const raw = `${error.message ?? ""} ${error.details ?? ""}`.trim();

  // 1) Buscar por nombre de restricción dentro del texto del error.
  for (const [name, msg] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (raw.includes(name)) return msg;
  }

  // 2) Buscar por código de Postgres.
  if (error.code && PG_CODE_MESSAGES[error.code]) {
    return PG_CODE_MESSAGES[error.code];
  }

  // 3) Mensajes comunes en inglés de Supabase Auth.
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials"))
    return "Correo o contraseña incorrectos.";
  if (lower.includes("email not confirmed"))
    return "Tenés que confirmar tu correo antes de iniciar sesión.";
  if (lower.includes("jwt") && lower.includes("expired"))
    return "Tu sesión expiró. Volvé a iniciar sesión.";

  // 4) Si el error ya viene en español (sin jerga técnica), mostrarlo tal cual.
  if (raw && !/violates|constraint|relation|null value|syntax|duplicate key/i.test(raw)) {
    return raw;
  }

  return fallback;
}
