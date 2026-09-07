#!/usr/bin/env bash
# Aplica una migración de supabase/migrations/ contra la base de Supabase.
#
# Hasta ahora las migraciones se pegaban a mano en el SQL Editor del Dashboard porque en
# esta máquina no había credenciales de base. Con `SUPABASE_DB_URL` en .env.local (la
# cadena de "Connect → PSQL" del proyecto) se pueden aplicar desde acá.
#
#   ./scripts/migrar.sh 0036_contratante_empresa.sql        aplica la migración
#   ./scripts/migrar.sh --sql "select 1"                    corre una consulta suelta
#   ./scripts/migrar.sh --check                             solo comprueba la conexión
#
# Todo va dentro de una transacción: si algo falla, no queda nada a medias.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "No encuentro app/.env.local" >&2; exit 1
fi

# `source .env.local` falla (hay una línea con &), así que se extraen solo estas variables.
# El `|| true` importa: con `set -e`, un grep sin resultado mataría el script aquí mismo
# y la ayuda de abajo no llegaría a imprimirse nunca.
leer() { grep -m1 "^$1=" .env.local | cut -d= -f2- | sed 's/^["'\'']//; s/["'\'']$//' || true; }
DB_URL="$(leer SUPABASE_DB_URL)"
DB_PASSWORD="$(leer SUPABASE_DB_PASSWORD)"

if [ -z "${DB_URL:-}" ]; then
  cat >&2 <<'AYUDA'
Falta SUPABASE_DB_URL en app/.env.local.

Datos del proyecto (Session pooler, el que funciona sobre IPv4):
  host      aws-1-us-east-1.pooler.supabase.com
  port      5432
  database  postgres
  user      postgres.yvytzquewjsjsmgiwmaa

Poné en app/.env.local estas dos líneas:
  SUPABASE_DB_URL=postgresql://postgres.yvytzquewjsjsmgiwmaa@aws-1-us-east-1.pooler.supabase.com:5432/postgres
  SUPABASE_DB_PASSWORD=la-contrasena-tal-cual

La contraseña va APARTE y no dentro del URI: así no hay que percent-encodear los
caracteres especiales, que es donde siempre se rompe esto. El script la pasa por PGPASSWORD.
AYUDA
  exit 1
fi

# La contraseña dentro del URI obliga a percent-encodear; por PGPASSWORD viaja tal cual.
[ -n "${DB_PASSWORD:-}" ] && export PGPASSWORD="$DB_PASSWORD"

case "$DB_URL" in
  *"[YOUR-PASSWORD]"*|*"YOUR-PASSWORD"*|*"CONTRASENA"*)
    echo "La cadena todavía tiene el marcador de contraseña sin reemplazar." >&2
    echo "Dejá el URI sin contraseña y poné SUPABASE_DB_PASSWORD aparte." >&2
    exit 1;;
esac

# El transaction pooler (6543) no sirve para migraciones: no mantiene la sesión y una
# transacción con varios ALTER se le cae a la mitad.
case "$DB_URL" in
  *:6543/*)
    echo "Esa es la cadena del transaction pooler (puerto 6543) y no sirve para migraciones." >&2
    echo "Usá la de \"Session pooler\" (puerto 5432) o la conexión directa." >&2
    exit 1;;
esac

case "${1:-}" in
  --check)
    psql "$DB_URL" -Atc "select 'conexión OK · ' || current_database() || ' · ' || version();"
    ;;
  --sql)
    [ -n "${2:-}" ] || { echo "Uso: ./scripts/migrar.sh --sql \"select 1\"" >&2; exit 1; }
    psql "$DB_URL" -v ON_ERROR_STOP=1 -c "$2"
    ;;
  "")
    echo "Uso: ./scripts/migrar.sh <archivo.sql> | --sql \"...\" | --check" >&2; exit 1
    ;;
  *)
    ARCHIVO="supabase/migrations/$1"
    [ -f "$ARCHIVO" ] || ARCHIVO="$1"
    [ -f "$ARCHIVO" ] || { echo "No encuentro la migración: $1" >&2; exit 1; }
    echo "→ aplicando $ARCHIVO"
    psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$ARCHIVO"
    echo "✓ aplicada"
    ;;
esac
