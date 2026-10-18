#!/usr/bin/env bash
# Conecta el Gmail de El Camino con Naty al asistente reutilizando la autorización de BayMax
# (su cliente OAuth de Google y el refresh token de la cuenta `elcamino`).
# Copia los tres valores al .env.local de la plataforma y a las variables de Railway, sin
# mostrarlos en pantalla. Se corre una vez; si algún día se reconecta la cuenta en BayMax
# (npm run correo -- elcamino), se vuelve a correr.
#
#   ./scripts/conectar_gmail_ecn.sh

set -euo pipefail
cd "$(dirname "$0")/.."
BAYMAX="../../../Agentes/BayMax"

python3 - "$BAYMAX" <<'PY'
import json, re, sys
b = sys.argv[1] + "/"
env = {}
for l in open(b + ".env"):
    m = re.match(r'^(GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)=(.*)$', l.strip())
    if m: env[m[1]] = m[2].strip().strip('"\'')
rt = json.load(open(b + "datos/correo-tokens.json"))["elcamino"]["refresh_token"]
if not (env.get("GOOGLE_CLIENT_ID") and env.get("GOOGLE_CLIENT_SECRET") and rt):
    sys.exit("Faltan datos en BayMax (.env o datos/correo-tokens.json).")
p = ".env.local"
lineas = [l for l in open(p).read().split("\n") if not l.startswith(("GMAIL_ECN_", "# Asistente: Gmail"))]
while lineas and lineas[-1] == "": lineas.pop()
lineas += ["", "# Asistente: Gmail de ECN directo a la API, con la autorización de BayMax (cuenta elcamino)",
           "GMAIL_ECN_CLIENT_ID=" + env["GOOGLE_CLIENT_ID"],
           "GMAIL_ECN_CLIENT_SECRET=" + env["GOOGLE_CLIENT_SECRET"],
           "GMAIL_ECN_REFRESH_TOKEN=" + rt, ""]
open(p, "w").write("\n".join(lineas))
PY
echo "✓ .env.local actualizado"

leer() { grep -m1 "^$1=" .env.local | cut -d= -f2-; }
railway variables --skip-deploys \
  --set "GMAIL_ECN_CLIENT_ID=$(leer GMAIL_ECN_CLIENT_ID)" \
  --set "GMAIL_ECN_CLIENT_SECRET=$(leer GMAIL_ECN_CLIENT_SECRET)" \
  --set "GMAIL_ECN_REFRESH_TOKEN=$(leer GMAIL_ECN_REFRESH_TOKEN)" >/dev/null
echo "✓ Railway actualizado (se aplica en el próximo despliegue)"
