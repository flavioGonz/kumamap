#!/usr/bin/env bash
# ============================================================
# KumaMap - Rollback a Versión Anterior
# ============================================================
# Uso:
#   ./deploy/rollback.sh ies          # Rollback al commit anterior
#   ./deploy/rollback.sh st abc1234   # Rollback a commit específico
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTS_FILE="$SCRIPT_DIR/hosts.conf"

log()  { echo -e "${BLUE}[rollback]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL ]${NC} $*"; }

declare -A HOST_SSH_HOST HOST_SSH_PORT HOST_SSH_USER HOST_REMOTE_PATH
ALL_HOSTS=()

while IFS='|' read -r name host port user path; do
  [[ "$name" =~ ^#.*$ || -z "$name" ]] && continue
  name=$(echo "$name" | xargs); host=$(echo "$host" | xargs)
  port=$(echo "$port" | xargs); user=$(echo "$user" | xargs)
  path=$(echo "$path" | xargs)
  ALL_HOSTS+=("$name")
  HOST_SSH_HOST[$name]="$host"
  HOST_SSH_PORT[$name]="$port"
  HOST_SSH_USER[$name]="$user"
  HOST_REMOTE_PATH[$name]="$path"
done < "$HOSTS_FILE"

ssh_cmd() {
  local name="$1"; shift
  ssh -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=accept-new \
      -p "${HOST_SSH_PORT[$name]}" \
      "${HOST_SSH_USER[$name]}@${HOST_SSH_HOST[$name]}" \
      "$@"
}

if [ $# -lt 1 ]; then
  echo "Uso: rollback.sh <host> [commit]"
  echo "Hosts: ${ALL_HOSTS[*]}"
  exit 1
fi

NAME="$1"
TARGET_COMMIT="${2:-}"

if [[ -z "${HOST_SSH_HOST[$NAME]:-}" ]]; then
  fail "Host desconocido: $NAME (disponibles: ${ALL_HOSTS[*]})"
  exit 1
fi

log "Haciendo rollback en ${CYAN}$NAME${NC}..."

ssh_cmd "$NAME" bash -s "${HOST_REMOTE_PATH[$NAME]}" "$TARGET_COMMIT" << 'ROLLBACK_SCRIPT'
  set -euo pipefail
  REMOTE_PATH="$1"
  TARGET_COMMIT="$2"

  cd "$REMOTE_PATH"

  CURRENT=$(git rev-parse --short HEAD)

  if [ -z "$TARGET_COMMIT" ]; then
    if [ -f ".last-deploy-commit" ]; then
      TARGET_COMMIT=$(cat .last-deploy-commit)
      echo "Volviendo al deploy anterior: $(echo $TARGET_COMMIT | cut -c1-7)"
    else
      echo "ERROR: No hay .last-deploy-commit. Especificá un hash."
      echo "Últimos commits:"
      git log --oneline -10
      exit 1
    fi
  fi

  echo "Actual:   $CURRENT"
  echo "Objetivo: $(echo $TARGET_COMMIT | cut -c1-7)"

  if [ "$CURRENT" = "$(echo $TARGET_COMMIT | cut -c1-7)" ]; then
    echo "Ya estás en ese commit."
    exit 0
  fi

  # Checkout target
  git fetch origin
  git checkout "$TARGET_COMMIT"

  # Rebuild
  echo "Reinstalando dependencias..."
  npm ci
  echo "Recompilando Next.js..."
  npm run build 2>&1 | tail -5

  # Restart
  echo "Reiniciando servicio..."
  if systemctl is-active kumamap &>/dev/null || systemctl list-unit-files kumamap.service &>/dev/null 2>&1; then
    sudo systemctl restart kumamap
    sleep 3
    systemctl is-active kumamap && echo "✓ Servicio activo" || echo "⚠ El servicio podría no estar activo"
  elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "kumamap"; then
    pm2 restart kumamap
  else
    pkill -f "tsx server.ts" 2>/dev/null || true
    sleep 1
    nohup npx tsx server.ts > /tmp/kumamap.log 2>&1 &
    sleep 3
    pgrep -f "tsx server.ts" && echo "✓ Servidor arrancado" || echo "⚠ Error al arrancar"
  fi

  echo "Rollback completado → $(git rev-parse --short HEAD)"
ROLLBACK_SCRIPT

if [ $? -eq 0 ]; then
  ok "$NAME: Rollback exitoso"
else
  fail "$NAME: Rollback FALLÓ"
  exit 1
fi
