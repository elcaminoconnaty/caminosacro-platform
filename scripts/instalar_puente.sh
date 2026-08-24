#!/usr/bin/env bash
# Registra el puente en launchd para que arranque solo al encender el computador y se
# reinicie si se cae. Solo macOS.
#
#   Instalar:    npm run puente:instalar
#   Ver estado:  launchctl list | grep caminosacro
#   Ver el log:  tail -f ~/Library/Logs/caminosacro-puente.log
#   Quitarlo:    launchctl bootout gui/$(id -u)/com.caminosacro.puente
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ETIQUETA="com.caminosacro.puente"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
LOG="$HOME/Library/Logs/caminosacro-puente.log"

# launchd arranca con un PATH mínimo: no encuentra node ni npm si no se le dice dónde están.
NODE_BIN="$(dirname "$(command -v node)")"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLISTFIN
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN/npx</string>
    <string>tsx</string>
    <string>$APP_DIR/scripts/worker_contenido.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_BIN:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTFIN

launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$ETIQUETA"

echo "Puente instalado."
echo "  Arranca solo al encender el computador y se reinicia si se cae."
echo "  Log:      tail -f $LOG"
echo "  Quitarlo: launchctl bootout gui/$(id -u)/$ETIQUETA"
