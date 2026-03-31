#!/bin/bash
# =============================================================
# KumaMap - Setup DB Read User
# Creates the kumamap_reader user in Uptime Kuma's MariaDB/MySQL
# =============================================================

set -e

# Load .env.local if it exists
if [ -f "$(dirname "$0")/../.env.local" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env.local" | xargs)
fi

# Defaults
DB_USER="${KUMA_DB_USER:-kumamap_reader}"
DB_PASS="${KUMA_DB_PASSWORD:-}"
DB_NAME="${KUMA_DB_NAME:-kuma}"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  KumaMap - Configuracion de Usuario MySQL    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Ask for password if not set
if [ -z "$DB_PASS" ] || [ "$DB_PASS" = "tu_password_mysql" ]; then
  read -s -p "Ingresa una contraseña para el usuario '$DB_USER': " DB_PASS
  echo ""
  if [ -z "$DB_PASS" ]; then
    echo "❌ La contraseña no puede estar vacía."
    exit 1
  fi
fi

SQL="CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASS}';
GRANT SELECT ON ${DB_NAME}.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SELECT CONCAT('✅ Usuario creado: ', user, '@', host) as resultado FROM mysql.user WHERE user='${DB_USER}';"

echo ""
echo "Detectando instalacion de Uptime Kuma..."
echo ""

# ──────────────────────────────────────────────────────────
# MODO 1: Uptime Kuma 2.0 en Docker con MariaDB embebido
# ──────────────────────────────────────────────────────────
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "uptime-kuma"; then
  SOCKET_PATH="/app/data/run/mariadb.sock"
  if docker exec uptime-kuma test -S "$SOCKET_PATH" 2>/dev/null; then
    echo "✅ Detectado: Uptime Kuma 2.0 con MariaDB embebido (Docker)"
    echo "   Contenedor: uptime-kuma"
    echo "   Socket: $SOCKET_PATH"
    echo ""
    docker exec uptime-kuma mariadb -u root --socket="$SOCKET_PATH" -e "$SQL" "$DB_NAME"
    echo ""
    echo "✅ Listo! Ahora actualiza tu .env.local con:"
    echo "   KUMA_DB_USER=$DB_USER"
    echo "   KUMA_DB_PASSWORD=<la contraseña que ingresaste>"
    echo "   KUMA_DB_HOST=127.0.0.1"
    echo "   KUMA_DB_NAME=$DB_NAME"
    exit 0
  fi
fi

# ──────────────────────────────────────────────────────────
# MODO 2: MySQL/MariaDB local en el mismo servidor
# ──────────────────────────────────────────────────────────
if command -v mysql &>/dev/null || command -v mariadb &>/dev/null; then
  CMD=$(command -v mariadb || command -v mysql)
  echo "✅ Detectado: MySQL/MariaDB local"
  echo ""
  read -p "Usuario root de MySQL [root]: " ROOT_USER
  ROOT_USER="${ROOT_USER:-root}"
  echo "$SQL" | $CMD -u "$ROOT_USER" -p "$DB_NAME"
  echo ""
  echo "✅ Listo! Ahora actualiza tu .env.local con:"
  echo "   KUMA_DB_USER=$DB_USER"
  echo "   KUMA_DB_PASSWORD=<la contraseña que ingresaste>"
  echo "   KUMA_DB_HOST=127.0.0.1"
  echo "   KUMA_DB_NAME=$DB_NAME"
  exit 0
fi

# ──────────────────────────────────────────────────────────
# MODO 3: No se detectó ninguna instalación
# ──────────────────────────────────────────────────────────
echo "⚠️  No se pudo detectar una instalacion de Uptime Kuma automaticamente."
echo ""
echo "Opciones manuales:"
echo ""
echo "  Kuma 2.0 Docker embebido:"
echo "    docker exec -it uptime-kuma mariadb -u root --socket=/app/data/run/mariadb.sock"
echo ""
echo "  MySQL externo:"
echo "    mysql -h <IP> -u root -p"
echo ""
echo "  Luego ejecuta:"
echo "    CREATE USER '${DB_USER}'@'%' IDENTIFIED BY 'tu_password';"
echo "    GRANT SELECT ON ${DB_NAME}.* TO '${DB_USER}'@'%';"
echo "    FLUSH PRIVILEGES;"
exit 1
