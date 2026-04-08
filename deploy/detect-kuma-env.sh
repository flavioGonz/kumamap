#!/usr/bin/env bash
# ============================================================
# KumaMap — Detección de Entorno Uptime Kuma
# ============================================================
# Detecta automáticamente cómo está instalado Uptime Kuma
# y genera la configuración de base de datos para .env
#
# Uso:
#   bash deploy/detect-kuma-env.sh           # Detectar y mostrar
#   bash deploy/detect-kuma-env.sh --write   # Detectar y escribir en .env
#   bash deploy/detect-kuma-env.sh --test    # Solo verificar conectividad
# ============================================================

set -uo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

WRITE_ENV=0
TEST_ONLY=0
ENV_FILE=".env"

for arg in "$@"; do
  case "$arg" in
    --write) WRITE_ENV=1 ;;
    --test)  TEST_ONLY=1 ;;
    --env=*) ENV_FILE="${arg#--env=}" ;;
  esac
done

log()  { echo -e "${BLUE}[detect]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL ]${NC} $*"; }
info() { echo -e "${CYAN}        ${NC} $*"; }

# Resultado final
DB_TYPE=""      # sqlite | mariadb | none
DB_VARS=()      # líneas listas para agregar al .env

# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────

docker_available() {
  command -v docker &>/dev/null && docker info &>/dev/null 2>&1
}

find_kuma_container() {
  # Busca contenedores que usen la imagen louislam/uptime-kuma o con nombre kuma
  docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | \
    grep -i "uptime.kuma\|kuma" | head -1 | awk '{print $1}'
}

test_sqlite() {
  local path="$1"
  if [ ! -f "$path" ]; then return 1; fi
  if command -v sqlite3 &>/dev/null; then
    sqlite3 "$path" "SELECT COUNT(*) FROM monitor LIMIT 1;" &>/dev/null 2>&1
    return $?
  fi
  # Si no hay sqlite3, verificar que sea un archivo SQLite por magic bytes
  file "$path" 2>/dev/null | grep -qi "sqlite" && return 0
  head -c 6 "$path" 2>/dev/null | grep -q "SQLite" && return 0
  return 0  # Asumir válido si existe y no podemos verificar
}

test_mariadb() {
  local host="$1" port="$2" user="$3" pass="$4" db="$5"
  if command -v mysql &>/dev/null; then
    mysql -h "$host" -P "$port" -u "$user" --password="$pass" \
      -e "USE \`$db\`; SELECT 1;" &>/dev/null 2>&1
    return $?
  fi
  if command -v nc &>/dev/null || command -v ncat &>/dev/null; then
    local nc_cmd="nc"
    command -v ncat &>/dev/null && nc_cmd="ncat"
    echo "" | timeout 3 $nc_cmd -z "$host" "$port" &>/dev/null 2>&1
    return $?
  fi
  # Si no hay forma de testear, reportar como alcanzable
  warn "No se puede verificar conexión MariaDB (mysql/nc no disponible)"
  return 0
}

write_to_env() {
  local vars=("$@")
  if [ ! -f "$ENV_FILE" ]; then
    warn "No existe $ENV_FILE — se creará"
    touch "$ENV_FILE"
  fi

  # Remover variables DB existentes para evitar duplicados
  local tmpfile
  tmpfile=$(mktemp)
  grep -v "^KUMA_DB_" "$ENV_FILE" > "$tmpfile" || true
  echo "" >> "$tmpfile"
  echo "# ── Base de datos Kuma (detectado automáticamente) ──" >> "$tmpfile"
  for v in "${vars[@]}"; do
    echo "$v" >> "$tmpfile"
  done
  mv "$tmpfile" "$ENV_FILE"
  ok "Variables escritas en $ENV_FILE"
}

# ────────────────────────────────────────────────────────────
# Estrategia 1: Docker
# ────────────────────────────────────────────────────────────

detect_docker() {
  if ! docker_available; then
    return 1
  fi

  log "Buscando contenedor Docker de Uptime Kuma..."
  local container
  container=$(find_kuma_container)

  if [ -z "$container" ]; then
    log "No se encontró contenedor Docker de Kuma"
    return 1
  fi

  ok "Contenedor encontrado: ${CYAN}$container${NC}"

  # Obtener variables de entorno del contenedor
  local db_type
  db_type=$(docker exec "$container" sh -c 'echo "${DATABASE_TYPE:-sqlite}"' 2>/dev/null || echo "sqlite")
  db_type=$(echo "$db_type" | tr '[:upper:]' '[:lower:]')

  if [ "$db_type" = "mariadb" ] || [ "$db_type" = "mysql" ]; then
    # Kuma 2.0 con MariaDB embebida o externa
    log "Tipo de DB detectado: MariaDB/MySQL"

    local db_host db_port db_user db_pass db_name
    db_host=$(docker exec "$container" sh -c 'echo "${DB_HOST:-127.0.0.1}"' 2>/dev/null || echo "127.0.0.1")
    db_port=$(docker exec "$container" sh -c 'echo "${DB_PORT:-3306}"' 2>/dev/null || echo "3306")
    db_user=$(docker exec "$container" sh -c 'echo "${DB_USERNAME:-kuma}"' 2>/dev/null || echo "kuma")
    db_pass=$(docker exec "$container" sh -c 'echo "${DB_PASSWORD:-}"' 2>/dev/null || echo "")
    db_name=$(docker exec "$container" sh -c 'echo "${DB_NAME:-kuma}"' 2>/dev/null || echo "kuma")

    # Si el host es localhost/127.0.0.1, puede ser que la DB corra dentro
    # del mismo contenedor o en un sidecar — necesitamos la IP del contenedor
    if [ "$db_host" = "localhost" ] || [ "$db_host" = "127.0.0.1" ]; then
      # Intentar obtener la IP del contenedor (para acceso desde el host)
      local container_ip
      container_ip=$(docker inspect "$container" \
        --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null | head -1)
      if [ -n "$container_ip" ] && [ "$container_ip" != "127.0.0.1" ]; then
        info "IP del contenedor: $container_ip"
        info "Si KumaMap corre fuera del contenedor, usá esta IP en KUMA_DB_HOST"
        info "(si corre dentro del mismo contenedor, mantené 127.0.0.1)"
      fi
    fi

    if test_mariadb "$db_host" "$db_port" "$db_user" "$db_pass" "$db_name"; then
      ok "Conectividad MariaDB verificada"
    else
      warn "No se pudo verificar conectividad MariaDB (puede seguir funcionando)"
    fi

    DB_TYPE="mariadb"
    DB_VARS=(
      "KUMA_DB_HOST=$db_host"
      "KUMA_DB_PORT=$db_port"
      "KUMA_DB_USER=$db_user"
      "KUMA_DB_PASSWORD=$db_pass"
      "KUMA_DB_NAME=$db_name"
    )
    return 0
  fi

  # SQLite — buscar el archivo kuma.db en los volúmenes
  log "Tipo de DB: SQLite — buscando kuma.db..."

  # Intentar desde dentro del contenedor
  local kuma_db_inside
  kuma_db_inside=$(docker exec "$container" \
    find /app/data /data /opt/uptime-kuma/data -name "kuma.db" 2>/dev/null | head -1)

  if [ -n "$kuma_db_inside" ]; then
    # Encontrar el path del host que mapea a ese path del contenedor
    local host_path
    host_path=$(docker inspect "$container" \
      --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)

    if [ -z "$host_path" ]; then
      host_path=$(docker inspect "$container" \
        --format '{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}' 2>/dev/null | \
        tr ' ' '\n' | grep "$(dirname "$kuma_db_inside")" | cut -d: -f1 | head -1)
    fi

    if [ -n "$host_path" ]; then
      local full_path="${host_path}/kuma.db"
      if test_sqlite "$full_path"; then
        ok "kuma.db en host: ${CYAN}$full_path${NC}"
        DB_TYPE="sqlite"
        DB_VARS=("KUMA_DB_PATH=$full_path")
        return 0
      fi
    fi

    # No encontramos el path del host — usar el del contenedor directamente
    # (funciona si KumaMap también corre en Docker con acceso al mismo volumen)
    warn "kuma.db en contenedor: $kuma_db_inside"
    warn "No se pudo mapear al path del host — revisá los volúmenes de Docker"
    DB_TYPE="sqlite"
    DB_VARS=("KUMA_DB_PATH=$kuma_db_inside  # ← verificar este path desde el host")
    return 0
  fi

  warn "No se encontró kuma.db dentro del contenedor"
  return 1
}

# ────────────────────────────────────────────────────────────
# Estrategia 2: Systemd
# ────────────────────────────────────────────────────────────

detect_systemd() {
  if ! systemctl is-enabled uptime-kuma &>/dev/null 2>&1 && \
     ! systemctl is-active uptime-kuma &>/dev/null 2>&1; then
    return 1
  fi

  log "Servicio systemd uptime-kuma encontrado"

  local working_dir
  working_dir=$(systemctl show uptime-kuma --property=WorkingDirectory \
    --value 2>/dev/null | grep -v '^$' | head -1)

  if [ -z "$working_dir" ]; then
    working_dir="/opt/uptime-kuma"
  fi

  local candidates=(
    "${working_dir}/data/kuma.db"
    "${working_dir}/kuma.db"
    "/opt/uptime-kuma/data/kuma.db"
    "$HOME/.uptime-kuma/kuma.db"
  )

  for path in "${candidates[@]}"; do
    if test_sqlite "$path"; then
      ok "kuma.db encontrado (systemd): ${CYAN}$path${NC}"
      DB_TYPE="sqlite"
      DB_VARS=("KUMA_DB_PATH=$path")
      return 0
    fi
  done

  warn "Servicio systemd encontrado pero no se ubicó kuma.db"
  warn "WorkingDirectory: $working_dir"
  return 1
}

# ────────────────────────────────────────────────────────────
# Estrategia 3: Búsqueda directa de kuma.db
# ────────────────────────────────────────────────────────────

detect_bare_metal() {
  log "Buscando kuma.db en paths conocidos..."

  local candidates=(
    "/opt/uptime-kuma/data/kuma.db"
    "$HOME/uptime-kuma/data/kuma.db"
    "/home/*/uptime-kuma/data/kuma.db"
    "/var/lib/uptime-kuma/kuma.db"
    "/app/data/kuma.db"
    "/data/kuma.db"
  )

  for pattern in "${candidates[@]}"; do
    # Expandir glob
    for path in $pattern; do
      if test_sqlite "$path" 2>/dev/null; then
        ok "kuma.db encontrado: ${CYAN}$path${NC}"
        DB_TYPE="sqlite"
        DB_VARS=("KUMA_DB_PATH=$path")
        return 0
      fi
    done
  done

  # Búsqueda más amplia (puede tardar)
  log "Búsqueda amplia (puede tomar unos segundos)..."
  local found
  found=$(find /opt /home /var /app /data -name "kuma.db" -type f 2>/dev/null | head -3)
  if [ -n "$found" ]; then
    local first_path
    first_path=$(echo "$found" | head -1)
    ok "kuma.db encontrado: ${CYAN}$first_path${NC}"
    if [ "$(echo "$found" | wc -l)" -gt 1 ]; then
      warn "Se encontraron múltiples archivos kuma.db:"
      echo "$found" | while read -r p; do info "  $p"; done
      warn "Se usará el primero — editá .env si no es el correcto"
    fi
    DB_TYPE="sqlite"
    DB_VARS=("KUMA_DB_PATH=$first_path")
    return 0
  fi

  return 1
}

# ────────────────────────────────────────────────────────────
# Estrategia 4: Proceso en ejecución
# ────────────────────────────────────────────────────────────

detect_process() {
  log "Buscando proceso de Uptime Kuma en ejecución..."

  local kuma_pid
  kuma_pid=$(pgrep -f "server/server.js\|uptime-kuma" 2>/dev/null | head -1)

  if [ -z "$kuma_pid" ]; then
    return 1
  fi

  ok "Proceso Kuma encontrado (PID: $kuma_pid)"

  # Leer el CWD del proceso
  local cwd
  cwd=$(readlink -f "/proc/$kuma_pid/cwd" 2>/dev/null)
  if [ -n "$cwd" ]; then
    local db_path="${cwd}/data/kuma.db"
    if test_sqlite "$db_path"; then
      ok "kuma.db en CWD del proceso: ${CYAN}$db_path${NC}"
      DB_TYPE="sqlite"
      DB_VARS=("KUMA_DB_PATH=$db_path")
      return 0
    fi
  fi

  return 1
}

# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   KumaMap — Detección de Entorno Kuma        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

log "Iniciando detección..."
echo ""

# Correr estrategias en orden de prioridad
if detect_docker; then
  :
elif detect_process; then
  :
elif detect_systemd; then
  :
elif detect_bare_metal; then
  :
else
  DB_TYPE="none"
  warn "No se detectó instalación de Uptime Kuma accesible"
  info "KumaMap funcionará sin acceso a DB (solo Socket.IO)"
  info "Si querés habilitarlo manualmente, agregá a .env:"
  info "  # SQLite:  KUMA_DB_PATH=/ruta/a/kuma.db"
  info "  # MariaDB: KUMA_DB_HOST/PORT/USER/PASS/NAME"
fi

echo ""

# ── Mostrar resultado ─────────────────────────────────────────

if [ "$DB_TYPE" = "none" ]; then
  warn "Sin configuración de DB — KumaMap funcionará en modo básico"
  exit 0
fi

echo -e "${GREEN}═══ Variables detectadas ═══${NC}"
echo ""
for v in "${DB_VARS[@]}"; do
  echo "  $v"
done
echo ""

if [ "$TEST_ONLY" = "1" ]; then
  ok "Prueba completada"
  exit 0
fi

# ── Preguntar si escribir en .env ──────────────────────────────

if [ "$WRITE_ENV" = "1" ]; then
  write_to_env "${DB_VARS[@]}"
else
  echo -e "${YELLOW}¿Escribir estas variables en ${ENV_FILE}? [s/N]:${NC} \c"
  read -r answer </dev/tty 2>/dev/null || answer="n"
  if [[ "$answer" =~ ^[sS]$ ]]; then
    write_to_env "${DB_VARS[@]}"
  else
    info "No se modificó $ENV_FILE"
    info "Agregá las variables manualmente para habilitar el acceso a DB"
  fi
fi

echo ""
ok "Detección completada"
