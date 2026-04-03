#!/bin/bash
# =============================================================
# KumaMap - Configuración de acceso a la base de datos de Kuma
# =============================================================
# Este script detecta qué tipo de base de datos usa tu instancia
# de Uptime Kuma y configura el acceso correspondiente.
#
# Uptime Kuma v1.x   → SQLite  (acceso directo al archivo)
# Uptime Kuma v2.0+  → MariaDB embebido o MySQL externo
# =============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
info() { echo -e "${BLUE}  →${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; }
step() { echo -e "\n${CYAN}── $* ──${NC}"; }

# Load .env if exists (to respect already configured values)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"
[ -f "$ENV_FILE" ] || ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  # Export only KUMA_DB_* vars to avoid overriding shell environment
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^KUMA_DB_ ]] && export "$key=${val//\"/}"
  done < <(grep -v '^#' "$ENV_FILE" 2>/dev/null || true)
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  KumaMap - Configuración de Base de Datos        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ──────────────────────────────────────────────────────────────
# PASO 1: Detectar qué motor usa Uptime Kuma
# ──────────────────────────────────────────────────────────────
step "Detectando instalación de Uptime Kuma"

KUMA_CONTAINER=""
KUMA_SQLITE_PATH=""
KUMA_DB_TYPE="unknown"

# 1a) Buscar contenedor Docker con MariaDB embebida (Kuma 2.0)
#     Prueba varios patrones de nombres comunes
for CANDIDATE in uptime-kuma uptime-kuma-uptime-kuma-1 kuma uptime_kuma; do
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CANDIDATE}$"; then
    # Verificar si tiene socket de MariaDB (Kuma 2.0 embedded)
    if docker exec "$CANDIDATE" test -S /app/data/run/mariadb.sock 2>/dev/null; then
      KUMA_CONTAINER="$CANDIDATE"
      KUMA_DB_TYPE="mariadb-embedded"
      ok "Uptime Kuma 2.0 con MariaDB embebida (Docker: $KUMA_CONTAINER)"
      break
    fi
  fi
done

# 1b) Si no encontramos MariaDB embebida, buscar SQLite (Kuma v1.x o 2.0 sin MySQL)
if [ "$KUMA_DB_TYPE" = "unknown" ]; then
  # Buscar en rutas comunes de instalación
  SQLITE_CANDIDATES=(
    "/opt/uptime-kuma/data/kuma.db"
    "$HOME/uptime-kuma/data/kuma.db"
    "/home/kuma/uptime-kuma/data/kuma.db"
    "/var/lib/uptime-kuma/data/kuma.db"
    "/app/data/kuma.db"
  )

  # También buscar si hay un contenedor Docker con SQLite montado
  if [ -n "$(docker ps -q 2>/dev/null)" ]; then
    for CANDIDATE in uptime-kuma uptime-kuma-uptime-kuma-1 kuma uptime_kuma; do
      if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CANDIDATE}$"; then
        # Get the data volume mount point
        MOUNT=$(docker inspect "$CANDIDATE" --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)
        if [ -n "$MOUNT" ] && [ -f "$MOUNT/kuma.db" ]; then
          SQLITE_CANDIDATES=("$MOUNT/kuma.db" "${SQLITE_CANDIDATES[@]}")
          KUMA_CONTAINER="$CANDIDATE"
        fi
      fi
    done
  fi

  for CANDIDATE_PATH in "${SQLITE_CANDIDATES[@]}"; do
    if [ -f "$CANDIDATE_PATH" ]; then
      KUMA_SQLITE_PATH="$CANDIDATE_PATH"
      KUMA_DB_TYPE="sqlite"
      ok "Uptime Kuma con SQLite: $KUMA_SQLITE_PATH"
      break
    fi
  done
fi

# 1c) MySQL/MariaDB externo ya configurado en .env
if [ "$KUMA_DB_TYPE" = "unknown" ] && [ -n "${KUMA_DB_HOST:-}" ]; then
  KUMA_DB_TYPE="mysql-external"
  ok "MySQL/MariaDB externo ya configurado: $KUMA_DB_HOST"
fi

# 1d) Fallback: MySQL local sin Docker
if [ "$KUMA_DB_TYPE" = "unknown" ]; then
  if command -v mysql &>/dev/null || command -v mariadb &>/dev/null; then
    KUMA_DB_TYPE="mysql-local"
    ok "MySQL/MariaDB local detectado"
  fi
fi

if [ "$KUMA_DB_TYPE" = "unknown" ]; then
  warn "No se pudo detectar automáticamente la instalación de Uptime Kuma."
  echo ""
  echo "  Por favor elegí manualmente tu caso:"
  echo "    1) SQLite (Kuma v1.x — lo más común)"
  echo "    2) MariaDB embebida (Docker Kuma 2.0)"
  echo "    3) MySQL/MariaDB externo"
  echo ""
  read -r -p "  Opción [1/2/3]: " MANUAL_CHOICE
  case "$MANUAL_CHOICE" in
    1) KUMA_DB_TYPE="sqlite-manual" ;;
    2) KUMA_DB_TYPE="mariadb-manual" ;;
    3) KUMA_DB_TYPE="mysql-manual" ;;
    *) fail "Opción inválida"; exit 1 ;;
  esac
fi

# ──────────────────────────────────────────────────────────────
# PASO 2: Configurar según tipo detectado
# ──────────────────────────────────────────────────────────────

case "$KUMA_DB_TYPE" in

  # ---- SQLite (detectado o manual) ----
  sqlite|sqlite-manual)
    step "Configuración SQLite"

    if [ "$KUMA_DB_TYPE" = "sqlite-manual" ] || [ -z "$KUMA_SQLITE_PATH" ]; then
      echo ""
      echo "  Rutas comunes de la base de datos SQLite de Kuma:"
      echo "    - /opt/uptime-kuma/data/kuma.db"
      echo "    - ~/uptime-kuma/data/kuma.db"
      echo "    - /app/data/kuma.db  (dentro del volumen Docker)"
      echo ""
      read -r -p "  Ruta al archivo kuma.db: " KUMA_SQLITE_PATH
    fi

    if [ ! -f "$KUMA_SQLITE_PATH" ]; then
      fail "No se encontró el archivo: $KUMA_SQLITE_PATH"
      exit 1
    fi

    # Verify read permission
    if [ ! -r "$KUMA_SQLITE_PATH" ]; then
      warn "Sin permisos de lectura en $KUMA_SQLITE_PATH"
      echo ""
      echo "  Para dar acceso de lectura al usuario actual:"
      echo "    sudo chmod o+r \"$KUMA_SQLITE_PATH\""
      echo "    sudo chmod o+rx \"$(dirname "$KUMA_SQLITE_PATH")\""
      echo ""
      read -r -p "  ¿Ejecutar ahora? [y/N] " -n 1
      echo ""
      if [[ "$REPLY" =~ ^[Yy]$ ]]; then
        sudo chmod o+r "$KUMA_SQLITE_PATH"
        sudo chmod o+rx "$(dirname "$KUMA_SQLITE_PATH")"
        ok "Permisos aplicados"
      else
        warn "Deberás aplicar los permisos manualmente antes de iniciar KumaMap."
      fi
    else
      ok "Archivo accesible con permisos de lectura"
    fi

    echo ""
    echo -e "${GREEN}✅ Configuración SQLite lista.${NC}"
    echo ""
    echo "  Agregá esta línea a tu .env.local (o .env):"
    echo ""
    echo -e "    ${CYAN}KUMA_DB_PATH=${KUMA_SQLITE_PATH}${NC}"
    echo ""

    # Auto-write to .env if it exists and doesn't already have KUMA_DB_PATH
    if [ -f "$ENV_FILE" ]; then
      if grep -q "^KUMA_DB_PATH=" "$ENV_FILE" 2>/dev/null; then
        # Update existing line
        sed -i "s|^KUMA_DB_PATH=.*|KUMA_DB_PATH=${KUMA_SQLITE_PATH}|" "$ENV_FILE"
        ok "KUMA_DB_PATH actualizado en $ENV_FILE"
      else
        echo "" >> "$ENV_FILE"
        echo "# KumaMap DB — SQLite directo (agrega acceso al historial)" >> "$ENV_FILE"
        echo "KUMA_DB_PATH=${KUMA_SQLITE_PATH}" >> "$ENV_FILE"
        ok "KUMA_DB_PATH agregado a $ENV_FILE"
      fi
    fi
    ;;

  # ---- MariaDB embebida en Docker (Kuma 2.0) ----
  mariadb-embedded|mariadb-manual)
    step "Configuración MariaDB embebida (Kuma 2.0 Docker)"

    if [ "$KUMA_DB_TYPE" = "mariadb-manual" ] || [ -z "$KUMA_CONTAINER" ]; then
      # List running containers to help user
      echo ""
      echo "  Contenedores Docker en ejecución:"
      docker ps --format "    {{.Names}}" 2>/dev/null || echo "    (no se pudo listar)"
      echo ""
      read -r -p "  Nombre del contenedor de Uptime Kuma: " KUMA_CONTAINER
    fi

    # Verify MariaDB socket
    SOCKET_PATH="/app/data/run/mariadb.sock"
    if ! docker exec "$KUMA_CONTAINER" test -S "$SOCKET_PATH" 2>/dev/null; then
      fail "No se encontró socket de MariaDB en $KUMA_CONTAINER:$SOCKET_PATH"
      echo ""
      warn "Esto puede significar que tu Kuma 2.0 aún no inició MariaDB, o que usas SQLite."
      echo "  Verificá los logs: docker logs $KUMA_CONTAINER | tail -20"
      exit 1
    fi
    ok "Socket MariaDB encontrado en $KUMA_CONTAINER"

    # Ask for password
    DB_USER="${KUMA_DB_USER:-kumamap_reader}"
    DB_NAME="${KUMA_DB_NAME:-kuma}"
    echo ""
    read -s -r -p "  Contraseña para el usuario '$DB_USER' (nueva o existente): " DB_PASS
    echo ""
    [ -z "$DB_PASS" ] && { fail "La contraseña no puede estar vacía."; exit 1; }

    # Create user inside container
    SQL="CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASS}';
GRANT SELECT ON ${DB_NAME}.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;"

    echo ""
    info "Creando usuario '$DB_USER' en MariaDB dentro del contenedor..."
    docker exec "$KUMA_CONTAINER" mariadb -u root \
      --socket="$SOCKET_PATH" \
      -e "$SQL" "$DB_NAME"

    # Need to expose MariaDB via TCP from inside the container
    echo ""
    warn "MariaDB está dentro del contenedor. Para que KumaMap se conecte,"
    echo "  necesitás exponer el puerto TCP de MariaDB."
    echo ""
    echo "  Opción A — Exponerlo al host (editar docker-compose.yml):"
    echo "    ports:"
    echo "      - '127.0.0.1:3307:3306'  # MariaDB de Kuma"
    echo ""
    echo "  Opción B — Conectar via red Docker (si KumaMap también corre en Docker):"
    echo "    KUMA_DB_HOST=nombre-del-contenedor  # por red de Docker"
    echo ""

    # Get the container's IP on the Docker network as a convenience
    CONTAINER_IP=$(docker inspect "$KUMA_CONTAINER" \
      --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null | head -1)
    if [ -n "$CONTAINER_IP" ]; then
      info "IP interna del contenedor en la red Docker: $CONTAINER_IP"
      echo "  Si KumaMap corre en el mismo host (fuera de Docker), podés usar:"
      echo "    KUMA_DB_HOST=$CONTAINER_IP"
    fi

    echo ""
    echo -e "${GREEN}✅ Usuario MySQL creado. Agregá a tu .env.local:${NC}"
    echo ""
    echo -e "    ${CYAN}KUMA_DB_HOST=${CONTAINER_IP:-127.0.0.1}${NC}"
    echo -e "    ${CYAN}KUMA_DB_PORT=3306${NC}"
    echo -e "    ${CYAN}KUMA_DB_USER=${DB_USER}${NC}"
    echo -e "    ${CYAN}KUMA_DB_PASSWORD=<la contraseña que ingresaste>${NC}"
    echo -e "    ${CYAN}KUMA_DB_NAME=${DB_NAME}${NC}"
    ;;

  # ---- MySQL local ----
  mysql-local|mysql-manual)
    step "Configuración MySQL/MariaDB local"

    CMD=$(command -v mariadb 2>/dev/null || command -v mysql 2>/dev/null)
    DB_USER="${KUMA_DB_USER:-kumamap_reader}"
    DB_NAME="${KUMA_DB_NAME:-kuma}"

    echo ""
    read -s -r -p "  Contraseña para el usuario '$DB_USER': " DB_PASS
    echo ""
    [ -z "$DB_PASS" ] && { fail "La contraseña no puede estar vacía."; exit 1; }

    SQL="CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT SELECT ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;"

    echo ""
    read -r -p "  Usuario root de MySQL [root]: " ROOT_USER
    ROOT_USER="${ROOT_USER:-root}"

    echo "$SQL" | $CMD -u "$ROOT_USER" -p

    echo ""
    echo -e "${GREEN}✅ Usuario MySQL creado. Agregá a tu .env.local:${NC}"
    echo ""
    echo -e "    ${CYAN}KUMA_DB_HOST=127.0.0.1${NC}"
    echo -e "    ${CYAN}KUMA_DB_USER=${DB_USER}${NC}"
    echo -e "    ${CYAN}KUMA_DB_PASSWORD=<la contraseña que ingresaste>${NC}"
    echo -e "    ${CYAN}KUMA_DB_NAME=${DB_NAME}${NC}"
    ;;

  # ---- MySQL externo ya configurado ----
  mysql-external)
    step "MySQL externo ya configurado"
    ok "Usando: $KUMA_DB_USER@$KUMA_DB_HOST/${KUMA_DB_NAME:-kuma}"
    echo ""
    info "Si necesitás crear el usuario, conectate al MySQL externo y ejecutá:"
    echo ""
    echo "    CREATE USER IF NOT EXISTS '${KUMA_DB_USER:-kumamap_reader}'@'%'"
    echo "      IDENTIFIED BY 'tu_contraseña';"
    echo "    GRANT SELECT ON ${KUMA_DB_NAME:-kuma}.* TO '${KUMA_DB_USER:-kumamap_reader}'@'%';"
    echo "    FLUSH PRIVILEGES;"
    ;;

esac

echo ""
echo "  Después de actualizar el .env, reiniciá KumaMap:"
echo "    sudo systemctl restart kumamap"
echo "    # o: pm2 restart kumamap"
echo ""
