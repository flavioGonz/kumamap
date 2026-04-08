#!/usr/bin/env bash
# ============================================================
# KumaMap - Actualización de Instancias Remotas
# ============================================================
# Uso:
#   ./deploy/update.sh ies            # Actualiza instancia IES
#   ./deploy/update.sh st             # Actualiza instancia ST
#   ./deploy/update.sh all            # Actualiza todas
#   ./deploy/update.sh ies --skip-build  # Solo git pull + restart
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
REPO_URL="https://github.com/flavioGonz/kumamap.git"
BRANCH="master"
SKIP_BUILD=0

log()  { echo -e "${BLUE}[update]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL]${NC} $*"; }

# Parse flags
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    *) ARGS+=("$arg") ;;
  esac
done

# Parse hosts
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
  ssh -o ConnectTimeout=15 \
      -o StrictHostKeyChecking=accept-new \
      -p "${HOST_SSH_PORT[$name]}" \
      "${HOST_SSH_USER[$name]}@${HOST_SSH_HOST[$name]}" \
      "$@"
}

update_host() {
  local name="$1"
  local remote_path="${HOST_REMOTE_PATH[$name]}"
  local user="${HOST_SSH_USER[$name]}"

  echo ""
  log "═══ Actualizando ${CYAN}$name${NC} ═══"
  log "Host: ${user}@${HOST_SSH_HOST[$name]}:${HOST_SSH_PORT[$name]}"
  log "Commit actual en remoto:"
  ssh_cmd "$name" "cd $remote_path && git rev-parse --short HEAD 2>/dev/null || echo '(sin git)'" 2>/dev/null || true

  ssh_cmd "$name" bash -s "$remote_path" "$BRANCH" "$SKIP_BUILD" << 'UPDATE_SCRIPT'
    set -euo pipefail
    REMOTE_PATH="$1"
    BRANCH="$2"
    SKIP_BUILD="$3"

    cd "$REMOTE_PATH"

    echo ""
    echo "=== git pull (origin/$BRANCH) ==="
    OLD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "?")

    # Stash any local changes that shouldn't be there (e.g. from manual edits)
    git stash -q 2>/dev/null || true

    git fetch origin "$BRANCH" --quiet
    git reset --hard "origin/$BRANCH"

    NEW_COMMIT=$(git rev-parse --short HEAD)
    echo "  $OLD_COMMIT → $NEW_COMMIT"

    if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
      echo "  (ya estaba en el commit más reciente)"
    fi

    # Check if package.json changed → npm install needed
    PACKAGES_CHANGED=0
    if git diff "${OLD_COMMIT}..HEAD" --name-only 2>/dev/null | grep -q "package.*json"; then
      PACKAGES_CHANGED=1
      echo "package.json cambió — instalando dependencias..."
    fi

    if [ "$SKIP_BUILD" = "1" ]; then
      echo ""
      echo "=== --skip-build activo, omitiendo npm y build ==="
    else
      if [ "$PACKAGES_CHANGED" = "1" ]; then
        echo ""
        echo "=== npm install ==="
        npm install --prefer-offline 2>&1 | tail -5
      fi

      echo ""
      echo "=== Build Next.js ==="
      # Detect basePath from .env.local or .env
      BASE_PATH=""
      for env_file in .env.local .env; do
        if [ -f "$env_file" ]; then
          val=$(grep "^NEXT_PUBLIC_BASE_PATH=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
          if [ -n "$val" ]; then
            BASE_PATH="$val"
            break
          fi
        fi
      done

      if [ -n "$BASE_PATH" ]; then
        echo "  basePath: $BASE_PATH"
        NEXT_PUBLIC_BASE_PATH="$BASE_PATH" npm run build 2>&1 | tail -10
      else
        npm run build 2>&1 | tail -10
      fi
      echo "Build OK"
    fi

    echo ""
    echo "=== Reiniciando servicio ==="

    # Detect process manager: PM2 or systemd
    if command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "kumamap"; then
      echo "  Modo: PM2"
      pm2 restart kumamap --update-env
      sleep 3
      pm2 list | grep kumamap | head -1
    elif systemctl is-enabled kumamap &>/dev/null 2>&1; then
      echo "  Modo: systemd"
      sudo systemctl restart kumamap
      sleep 3
      systemctl is-active kumamap && echo "  ✓ kumamap ACTIVO" || echo "  ✗ kumamap FALLIDO"
    else
      echo "  ⚠ No se encontró PM2 ni systemd. Reiniciá manualmente."
    fi

    echo ""
    echo "=== Actualización completada ==="
    echo "  Commit: $NEW_COMMIT"
    echo "  Fecha:  $(date)"
UPDATE_SCRIPT

  if [ $? -eq 0 ]; then
    ok "$name: ✓ Actualizado"
  else
    fail "$name: ✗ Falló"
    return 1
  fi
}

# --------------------------------------------------------
# Main
# --------------------------------------------------------
if [ ${#ARGS[@]} -eq 0 ]; then
  echo "Uso: update.sh <host|all> [--skip-build]"
  echo "Hosts disponibles: ${ALL_HOSTS[*]}"
  exit 1
fi

if [ "${ARGS[0]}" = "all" ]; then
  for name in "${ALL_HOSTS[@]}"; do
    update_host "$name"
  done
else
  for name in "${ARGS[@]}"; do
    update_host "$name"
  done
fi

echo ""
ok "Proceso de actualización completado"
