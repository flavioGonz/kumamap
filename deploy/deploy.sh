#!/usr/bin/env bash
# ============================================================
# KumaMap - Remote Deployment Script (Node.js directo en LXC)
# ============================================================
# Actualiza instancias remotas via SSH: git pull + build + restart
#
# Uso:
#   ./deploy/deploy.sh              # Deploy a TODOS los hosts
#   ./deploy/deploy.sh ies          # Deploy a un host específico
#   ./deploy/deploy.sh ies st       # Deploy a varios hosts
#   ./deploy/deploy.sh --status     # Ver estado de todos
#   ./deploy/deploy.sh --logs ies   # Ver logs de un host
# ============================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOSTS_FILE="$SCRIPT_DIR/hosts.conf"
REPO_URL="https://github.com/flavioGonz/kumamap.git"
BRANCH="master"

# --------------------------------------------------------
# Helper functions
# --------------------------------------------------------
log()   { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()    { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
fail()  { echo -e "${RED}[ FAIL ]${NC} $*"; }

banner() {
  echo -e "${CYAN}"
  echo "╔══════════════════════════════════════╗"
  echo "║  KumaMap Remote Deploy v2            ║"
  echo "║  Node.js directo (LXC/Proxmox)      ║"
  echo "╚══════════════════════════════════════╝"
  echo -e "${NC}"
}

# Parse hosts.conf
declare -A HOST_SSH_HOST HOST_SSH_PORT HOST_SSH_USER HOST_REMOTE_PATH
ALL_HOSTS=()

load_hosts() {
  while IFS='|' read -r name host port user path; do
    [[ "$name" =~ ^#.*$ || -z "$name" ]] && continue
    name=$(echo "$name" | xargs)
    host=$(echo "$host" | xargs)
    port=$(echo "$port" | xargs)
    user=$(echo "$user" | xargs)
    path=$(echo "$path" | xargs)
    ALL_HOSTS+=("$name")
    HOST_SSH_HOST[$name]="$host"
    HOST_SSH_PORT[$name]="$port"
    HOST_SSH_USER[$name]="$user"
    HOST_REMOTE_PATH[$name]="$path"
  done < "$HOSTS_FILE"
}

ssh_cmd() {
  local name="$1"
  shift
  ssh -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=accept-new \
      -p "${HOST_SSH_PORT[$name]}" \
      "${HOST_SSH_USER[$name]}@${HOST_SSH_HOST[$name]}" \
      "$@"
}

# --------------------------------------------------------
# Ensure local git is clean and pushed
# --------------------------------------------------------
ensure_git_pushed() {
  log "Verificando estado de git local..."
  cd "$PROJECT_DIR"

  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "Tenés cambios sin commitear:"
    git status --short
    echo ""
    read -p "¿Commitear y pushear antes de deployar? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git add -A
      git commit -m "pre-deploy: auto-commit $(date +%Y-%m-%d_%H:%M)"
      git push origin "$BRANCH"
      ok "Cambios commiteados y pusheados"
    else
      fail "Abortando: commiteá primero."
      exit 1
    fi
  fi

  # Check if ahead of remote
  git fetch origin "$BRANCH" --quiet 2>/dev/null || true
  local LOCAL_HEAD REMOTE_HEAD
  LOCAL_HEAD=$(git rev-parse HEAD)
  REMOTE_HEAD=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "none")

  if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
    warn "Branch local está adelantado de origin/$BRANCH"
    read -p "¿Pushear ahora? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git push origin "$BRANCH"
      ok "Push a origin/$BRANCH completado"
    else
      fail "Abortando: pusheá primero."
      exit 1
    fi
  fi

  ok "Git actualizado ($(git rev-parse --short HEAD))"
}

# --------------------------------------------------------
# Deploy to a single host
# --------------------------------------------------------
deploy_host() {
  local name="$1"
  local host="${HOST_SSH_HOST[$name]}"
  local port="${HOST_SSH_PORT[$name]}"
  local user="${HOST_SSH_USER[$name]}"
  local remote_path="${HOST_REMOTE_PATH[$name]}"

  echo ""
  log "═══ Deployando a ${CYAN}$name${NC} ($user@$host:$port) ═══"

  # Test SSH
  if ! ssh_cmd "$name" "echo ok" &>/dev/null; then
    fail "$name: Conexión SSH falló"
    fail "  Intentá: ssh -p $port $user@$host"
    return 1
  fi
  ok "$name: SSH conectado"

  # Deploy on remote
  ssh_cmd "$name" bash -s "$remote_path" "$REPO_URL" "$BRANCH" << 'REMOTE_SCRIPT'
    set -euo pipefail
    REMOTE_PATH="$1"
    REPO_URL="$2"
    BRANCH="$3"

    echo "[remote] Deployando en $REMOTE_PATH ..."

    # Clone if first time
    if [ ! -d "$REMOTE_PATH/.git" ]; then
      echo "[remote] Primera vez: clonando repo..."
      mkdir -p "$(dirname "$REMOTE_PATH")"
      git clone -b "$BRANCH" "$REPO_URL" "$REMOTE_PATH"
    fi

    cd "$REMOTE_PATH"

    # Save current commit for rollback
    git rev-parse HEAD > .last-deploy-commit 2>/dev/null || true
    PREV_COMMIT=$(cat .last-deploy-commit 2>/dev/null || echo "none")

    # Pull latest
    echo "[remote] Bajando últimos cambios de $BRANCH..."
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"

    NEW_COMMIT=$(git rev-parse --short HEAD)
    echo "[remote] Ahora en commit: $NEW_COMMIT (anterior: $(echo $PREV_COMMIT | cut -c1-7))"

    # Check .env
    if [ ! -f ".env.production" ] && [ ! -f ".env.local" ] && [ ! -f ".env" ]; then
      echo "[remote] ⚠ AVISO: No hay archivo .env!"
      echo "[remote] Creá $REMOTE_PATH/.env con:"
      echo "  KUMA_URL=http://localhost:3001"
      echo "  KUMA_USER=tu_usuario"
      echo "  KUMA_PASS=tu_password"
      echo "  NEXT_PUBLIC_BASE_PATH="
    fi

    # Install dependencies (only if package-lock changed)
    if git diff "$PREV_COMMIT" HEAD --name-only 2>/dev/null | grep -q "package-lock.json"; then
      echo "[remote] package-lock.json cambió → instalando dependencias..."
      npm ci
    else
      # Quick check: node_modules exists?
      if [ ! -d "node_modules" ]; then
        echo "[remote] node_modules no existe → instalando dependencias..."
        npm ci
      else
        echo "[remote] Dependencias sin cambios, skip npm install"
      fi
    fi

    # Build Next.js
    echo "[remote] Compilando Next.js..."
    npm run build 2>&1 | tail -5

    # Restart service - detect how it's running
    echo "[remote] Reiniciando servicio..."

    # Try systemd first
    if systemctl is-active kumamap &>/dev/null || systemctl list-unit-files kumamap.service &>/dev/null; then
      echo "[remote] Reiniciando via systemd..."
      sudo systemctl restart kumamap
      sleep 3
      if systemctl is-active kumamap &>/dev/null; then
        echo "[remote] ✓ Servicio kumamap activo (systemd)"
      else
        echo "[remote] ⚠ El servicio podría no haber arrancado:"
        sudo systemctl status kumamap --no-pager -l | tail -10
      fi

    # Try pm2
    elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "kumamap"; then
      echo "[remote] Reiniciando via pm2..."
      pm2 restart kumamap
      sleep 2
      pm2 status kumamap

    # Kill and restart manually
    else
      echo "[remote] No se detectó systemd ni pm2. Reiniciando proceso..."
      # Find and kill existing process
      pkill -f "tsx server.ts" 2>/dev/null || true
      sleep 1

      # Start in background
      echo "[remote] Arrancando servidor..."
      nohup npx tsx server.ts > /tmp/kumamap.log 2>&1 &
      sleep 3

      if pgrep -f "tsx server.ts" &>/dev/null; then
        echo "[remote] ✓ Servidor arrancado (PID: $(pgrep -f 'tsx server.ts'))"
        echo "[remote] ⚠ RECOMENDACIÓN: Instalá el systemd service con setup-remote.sh"
      else
        echo "[remote] ⚠ El servidor podría no haber arrancado. Revisá: tail -50 /tmp/kumamap.log"
      fi
    fi

    echo ""
    echo "[remote] ✓ Deploy completado — commit: $NEW_COMMIT"
REMOTE_SCRIPT

  if [ $? -eq 0 ]; then
    ok "$name: Deploy exitoso"
  else
    fail "$name: Deploy FALLÓ"
    return 1
  fi
}

# --------------------------------------------------------
# Check status of all hosts
# --------------------------------------------------------
check_status() {
  echo ""
  log "Estado de las instancias remotas:"
  echo ""
  printf "%-10s %-12s %-12s %-10s %-8s\n" "HOST" "SSH" "SERVICIO" "COMMIT" "NODE"
  printf "%-10s %-12s %-12s %-10s %-8s\n" "----" "---" "--------" "------" "----"

  for name in "${ALL_HOSTS[@]}"; do
    local ssh_ok svc commit node_ver

    if ! ssh_cmd "$name" "echo ok" &>/dev/null; then
      printf "%-10s %-12b %-12s %-10s %-8s\n" "$name" "${RED}failed${NC}" "-" "-" "-"
      continue
    fi

    read -r svc commit node_ver < <(ssh_cmd "$name" bash -s "${HOST_REMOTE_PATH[$name]}" << 'STATUS_SCRIPT'
      REMOTE_PATH="$1"
      cd "$REMOTE_PATH" 2>/dev/null || { echo "no-repo - -"; exit 0; }

      # Detect service type and status
      if systemctl is-active kumamap &>/dev/null; then
        SVC="systemd:up"
      elif systemctl list-unit-files kumamap.service &>/dev/null 2>&1; then
        SVC="systemd:down"
      elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "kumamap"; then
        SVC="pm2:up"
      elif pgrep -f "tsx server.ts" &>/dev/null; then
        SVC="manual:up"
      else
        SVC="stopped"
      fi

      COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
      NODE_VER=$(node --version 2>/dev/null || echo "?")

      echo "$SVC $COMMIT $NODE_VER"
STATUS_SCRIPT
    ) || { svc="error"; commit="-"; node_ver="-"; }

    # Colorize
    local svc_color
    case "$svc" in
      *:up)   svc_color="${GREEN}$svc${NC}" ;;
      *:down) svc_color="${RED}$svc${NC}" ;;
      *)      svc_color="${YELLOW}$svc${NC}" ;;
    esac

    printf "%-10s %-12b %-22b %-10s %-8s\n" "$name" "${GREEN}ok${NC}" "$svc_color" "$commit" "$node_ver"
  done
  echo ""
}

# --------------------------------------------------------
# Tail logs
# --------------------------------------------------------
tail_logs() {
  local name="$1"
  local remote_path="${HOST_REMOTE_PATH[$name]}"

  log "Logs de $name..."

  ssh_cmd "$name" bash -s "$remote_path" << 'LOGS_SCRIPT'
    REMOTE_PATH="$1"
    # Try journalctl first (systemd)
    if systemctl list-unit-files kumamap.service &>/dev/null 2>&1; then
      sudo journalctl -u kumamap -f --no-pager -n 50
    # Try pm2
    elif command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "kumamap"; then
      pm2 logs kumamap --lines 50
    # Manual log file
    elif [ -f "/tmp/kumamap.log" ]; then
      tail -f -n 50 /tmp/kumamap.log
    else
      echo "No se encontraron logs. El servicio puede no estar configurado."
    fi
LOGS_SCRIPT
}

# --------------------------------------------------------
# Main
# --------------------------------------------------------
main() {
  banner
  load_hosts

  case "${1:-}" in
    --status|-s)
      check_status
      exit 0
      ;;
    --logs|-l)
      [ -z "${2:-}" ] && { fail "Uso: deploy.sh --logs <host>"; exit 1; }
      tail_logs "$2"
      exit 0
      ;;
    --help|-h)
      echo "Uso:"
      echo "  deploy.sh                  Deploy a TODOS los hosts"
      echo "  deploy.sh <host> [host2]   Deploy a hosts específicos"
      echo "  deploy.sh --status         Estado de todos los hosts"
      echo "  deploy.sh --logs <host>    Ver logs de un host"
      echo ""
      echo "Hosts disponibles: ${ALL_HOSTS[*]}"
      exit 0
      ;;
  esac

  # Determine targets
  local targets=()
  if [ $# -gt 0 ]; then
    targets=("$@")
  else
    targets=("${ALL_HOSTS[@]}")
  fi

  # Validate
  for t in "${targets[@]}"; do
    if [[ -z "${HOST_SSH_HOST[$t]:-}" ]]; then
      fail "Host desconocido: $t (disponibles: ${ALL_HOSTS[*]})"
      exit 1
    fi
  done

  ensure_git_pushed

  local success=0 failed=0
  for name in "${targets[@]}"; do
    if deploy_host "$name"; then
      ((success++))
    else
      ((failed++))
    fi
  done

  # Summary
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  Resumen del Deploy                  ${CYAN}║${NC}"
  echo -e "${CYAN}╠══════════════════════════════════════╣${NC}"
  echo -e "${CYAN}║${NC}  ${GREEN}Exitosos: $success${NC}                         ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  ${RED}Fallidos: $failed${NC}                         ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  Commit:  $(cd "$PROJECT_DIR" && git rev-parse --short HEAD)                     ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"

  [ $failed -gt 0 ] && exit 1
  exit 0
}

main "$@"
