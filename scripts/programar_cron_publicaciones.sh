#!/usr/bin/env bash
# Crea (o recrea) el job de pg_cron que publica las piezas programadas del Estudio de
# Contenido: cada 5 minutos pega a /api/cron/publicar-contenido con el CRON_SECRET.
#
# Va en un script y no en la migración 0041 porque el secreto no puede viajar en git.
# Lee CRON_SECRET y la conexión de app/.env.local (los mismos que usa scripts/migrar.sh).
#
#   ./scripts/programar_cron_publicaciones.sh          crea o reemplaza el job
#   ./scripts/programar_cron_publicaciones.sh --quitar  lo elimina
#
# Nota: el secreto tiene que ser el MISMO que tiene Railway en CRON_SECRET, si no el
# endpoint responde 401 y nada se publica. Comprobación sin exponerlo:
#   curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-cron-secret: $CRON_SECRET" \
#     https://caminosacro-platform-production.up.railway.app/api/cron/publicar-contenido
#   → 202 si coincide, 401 si no.

set -euo pipefail
cd "$(dirname "$0")/.."

leer() { grep -m1 "^$1=" .env.local | cut -d= -f2- | sed 's/^["'\'']//; s/["'\'']$//' || true; }
DB_URL="$(leer SUPABASE_DB_URL)"
DB_PASSWORD="$(leer SUPABASE_DB_PASSWORD)"
SECRETO="$(leer CRON_SECRET)"
BASE="$(leer APP_BASE_URL)"
BASE="${BASE:-https://caminosacro-platform-production.up.railway.app}"
BASE="${BASE%/}"

[ -n "$DB_URL" ] || { echo "Falta SUPABASE_DB_URL en .env.local (ver scripts/migrar.sh)." >&2; exit 1; }
[ -n "$DB_PASSWORD" ] && export PGPASSWORD="$DB_PASSWORD"

JOB="camino-sacro-publicar-contenido"

if [ "${1:-}" = "--quitar" ]; then
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atc "select cron.unschedule('$JOB');"
  echo "✓ job $JOB eliminado"
  exit 0
fi

[ -n "$SECRETO" ] || { echo "Falta CRON_SECRET en .env.local." >&2; exit 1; }

# cron.schedule con el mismo nombre reemplaza el job existente (pg_cron ≥ 1.4).
# El secreto viaja por una variable de psql (-v), nunca en la línea de comandos del SQL.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q \
  -v secreto="$SECRETO" -v url="$BASE/api/cron/publicar-contenido" -v job="$JOB" <<'SQL'
select cron.schedule(
  :'job',
  '*/5 * * * *',
  format($f$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body    := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $f$, :'url', :'secreto')
);
SQL

psql "$DB_URL" -Atc "select 'job ' || jobname || ' · ' || schedule || ' · activo=' || active from cron.job where jobname = '$JOB';"
echo "✓ listo"
