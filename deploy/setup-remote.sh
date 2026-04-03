#!/usr/bin/env bash
# ============================================================
# KumaMap - Setup Inicial para Instancias Remotas (LXC/Proxmox)
# ============================================================
# Ejecutar UNA VEZ por host para prepararlo para deployments.
# Clona el repo, instala deps, crea systemd service.
#
# Uso:
#   ./deploy/setup-remote.sh ies
#   ./deploy/setup-remote.sh st
#   ./deploy/setup-remote.sh all
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

log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL]${NC} $*"; }

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

setup_host() {
  local name="$1"
  local remote_path="${HOST_REMOTE_PATH[$name]}"
  local user="${HOST_SSH_USER[$name]}"

  echo ""
  log "═══ Configurando ${CYAN}$name${NC} ═══"
  log "Host: ${user}@${HOST_SSH_HOST[$name]}:${HOST_SSH_PORT[$name]}"
  log "Path: $remote_path"

  # Test SSH
  log "Probando conexión SSH..."
  if ! ssh_cmd "$name" "echo ok" 2>/dev/null; then
    fail "No se puede conectar por SSH."
    echo ""
    echo "  Para copiar tu clave SSH:"
    echo "  ssh-copy-id -p ${HOST_SSH_PORT[$name]} ${user}@${HOST_SSH_HOST[$name]}"
    return 1
  fi
  ok "SSH conectado"

  ssh_cmd "$name" bash -s "$remote_path" "$REPO_URL" "$BRANCH" "$user" << 'SETUP_SCRIPT'
    set -euo pipefail
    REMOTE_PATH="$1"
    REPO_URL="$2"
    BRANCH="$3"
    RUN_USER="$4"

    echo "=== Verificando prerequisitos ==="

    # Check Node.js
    if ! command -v node &>/dev/null; then
      echo "ERROR: Node.js no está instalado!"
      echo "Instalá: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
      exit 1
    fi
    echo "Node.js: $(node --version)"
    echo "npm: $(npm --version)"

    # Check Git
    if ! command -v git &>/dev/null; then
      echo "ERROR: Git no está instalado!"
      echo "Instalá: sudo apt install git"
      exit 1
    fi
    echo "Git: $(git --version)"

    # Clone repo
    echo ""
    echo "=== Clonando repositorio ==="
    if [ -d "$REMOTE_PATH/.git" ]; then
      echo "Repo ya existe en $REMOTE_PATH"
      cd "$REMOTE_PATH"
      git fetch origin "$BRANCH"
      git reset --hard "origin/$BRANCH"
    else
      echo "Clonando $REPO_URL -> $REMOTE_PATH"
      mkdir -p "$(dirname "$REMOTE_PATH")"
      git clone -b "$BRANCH" "$REPO_URL" "$REMOTE_PATH"
      cd "$REMOTE_PATH"
    fi
    echo "Commit: $(git rev-parse --short HEAD)"

    # Create data directory
    mkdir -p "$REMOTE_PATH/data"

    # Create .env template if missing
    echo ""
    echo "=== Configuración de entorno ==="
    if [ ! -f ".env.production" ] && [ ! -f ".env.local" ] && [ ! -f ".env" ]; then
      cat > .env << 'ENVTEMPLATE'
# KumaMap - Configuración de instancia
# Editá estos valores para tu Uptime Kuma local

# ── Conexión a Uptime Kuma (Socket.IO) ─────────────────────────
KUMA_URL=http://localhost:3001
KUMA_USER=admin
KUMA_PASS=changeme
NEXT_PUBLIC_BASE_PATH=
PORT=3000

# ── Acceso directo a la base de datos de Kuma (opcional) ───────
# Habilita el historial de uptime y el calendario de incidentes.
# Elegí UNA opción según tu instalación de Uptime Kuma:
#
# Opción A — SQLite (Kuma v1.x — lo más común):
#   KUMA_DB_PATH=/opt/uptime-kuma/data/kuma.db
#
# Opción B — MariaDB embebida (Docker Kuma 2.0) o MySQL externo:
#   KUMA_DB_HOST=127.0.0.1
#   KUMA_DB_PORT=3306
#   KUMA_DB_USER=kumamap_reader
#   KUMA_DB_PASSWORD=
#   KUMA_DB_NAME=kuma
#
# Si no configurás ninguna opción, KumaMap funciona igual pero
# sin historial extendido (usa solo los datos del Socket.IO).
#
# Para configurar automáticamente, ejecutá:
#   npm run setup-db
ENVTEMPLATE
      echo "⚠ Archivo .env creado con valores por defecto"
      echo "  IMPORTANTE: editá $REMOTE_PATH/.env con tus credenciales de Kuma!"
      echo "  Para configurar acceso a la DB: npm run setup-db"
    else
      echo "Archivo de entorno ya existe"
    fi

    # Install dependencies
    echo ""
    echo "=== Instalando dependencias ==="
    npm ci
    echo "Dependencias instaladas"

    # Build Next.js
    echo ""
    echo "=== Compilando Next.js ==="
    npm run build 2>&1 | tail -5
    echo "Build completado"

    # Create systemd service
    echo ""
    echo "=== Configurando servicio systemd ==="

    # Detect node path
    NODE_PATH=$(which node)
    NPX_PATH=$(which npx)

    SERVICE_FILE="/etc/systemd/system/kumamap.service"

    if [ -f "$SERVICE_FILE" ]; then
      echo "Servicio systemd ya existe, actualizando..."
    fi

    sudo tee "$SERVICE_FILE" > /dev/null << SERVICEEOF
[Unit]
Description=KumaMap Network Monitor
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REMOTE_PATH
EnvironmentFile=$REMOTE_PATH/.env
ExecStart=$NPX_PATH tsx server.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kumamap

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$REMOTE_PATH/data $REMOTE_PATH/.next

[Install]
WantedBy=multi-user.target
SERVICEEOF

    sudo systemctl daemon-reload
    sudo systemctl enable kumamap
    echo "Servicio systemd creado y habilitado"

    # Start service
    echo ""
    echo "=== Iniciando servicio ==="
    # Kill any existing manual process
    pkill -f "tsx server.ts" 2>/dev/null || true
    sleep 1

    sudo systemctl start kumamap
    sleep 3

    if systemctl is-active kumamap &>/dev/null; then
      echo "✓ Servicio kumamap ACTIVO"
      echo ""
      echo "Comandos útiles:"
      echo "  sudo systemctl status kumamap    # Estado"
      echo "  sudo journalctl -u kumamap -f    # Logs en vivo"
      echo "  sudo systemctl restart kumamap   # Reiniciar"
    else
      echo "⚠ El servicio no arrancó. Revisá:"
      sudo systemctl status kumamap --no-pager -l | tail -15
    fi

    echo ""
    echo "=== Setup completado ==="
    echo "Commit: $(git rev-parse --short HEAD)"
    echo "Path:   $REMOTE_PATH"
SETUP_SCRIPT

  if [ $? -eq 0 ]; then
    ok "$name: Setup completado"
    echo ""
    warn "Recordá editar el .env en el servidor remoto:"
    echo "  ssh -p ${HOST_SSH_PORT[$name]} ${user}@${HOST_SSH_HOST[$name]}"
    echo "  nano ${remote_path}/.env"
    echo "  sudo systemctl restart kumamap"
  else
    fail "$name: Setup FALLÓ"
    return 1
  fi
}

# --------------------------------------------------------
# Main
# --------------------------------------------------------
if [ $# -eq 0 ]; then
  echo "Uso: setup-remote.sh <host|all>"
  echo "Hosts disponibles: ${ALL_HOSTS[*]}"
  exit 1
fi

if [ "$1" = "all" ]; then
  for name in "${ALL_HOSTS[@]}"; do
    setup_host "$name"
  done
else
  for name in "$@"; do
    if [[ -z "${HOST_SSH_HOST[$name]:-}" ]]; then
      fail "Host desconocido: $name (disponibles: ${ALL_HOSTS[*]})"
      exit 1
    fi
    setup_host "$name"
  done
fi
