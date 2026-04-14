<p align="center">
  <img src="https://img.shields.io/badge/KumaMap-Visualizaci%C3%B3n%20de%20Red-3b82f6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiMzYjgyZjYiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI2IiBmaWxsPSIjMGEwYTBhIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMyIgZmlsbD0iIzYwYTVmYSIvPjwvc3ZnPg==&logoColor=white" alt="KumaMap" />
</p>

<img width="1914" height="945" alt="image" src="https://github.com/user-attachments/assets/d0978c8a-4529-4f12-9de8-4344fc60fc1f" />

<h1 align="center">KumaMap</h1>

<p align="center">
  <strong>Mapeo interactivo de infraestructura de red con monitoreo en tiempo real via Uptime Kuma</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.2.0-3b82f6?style=flat-square" alt="v2.2.0" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=flat-square&logo=socket.io" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Leaflet-Mapas-199900?style=flat-square&logo=leaflet" alt="Leaflet" />
  <img src="https://img.shields.io/badge/SQLite%20%2F%20MariaDB-Dual--DB-003B57?style=flat-square&logo=sqlite" alt="SQLite / MariaDB" />
  <img src="https://img.shields.io/badge/Licencia-MIT-green?style=flat-square" alt="MIT License" />
</p>

<p align="center">
  <a href="#-que-es-kumamap">Qué es</a> &bull;
  <a href="#-funcionalidades">Funcionalidades</a> &bull;
  <a href="#-inicio-rapido">Inicio Rápido</a> &bull;
  <a href="#-instalacion">Instalación</a> &bull;
  <a href="#-deteccion-de-entorno-kuma">Detección de Entorno</a> &bull;
  <a href="#-actualizacion">Actualización</a> &bull;
  <a href="#-rack-designer">Rack Designer</a> &bull;
  <a href="#-arquitectura">Arquitectura</a> &bull;
  <a href="#-changelog">Changelog</a>
</p>

---

## Qué es KumaMap?

**KumaMap** transforma los datos de monitoreo de [Uptime Kuma](https://github.com/louislam/uptime-kuma) en mapas de red interactivos y visualmente impactantes. Arrastrá monitores sobre mapas satelitales o imágenes de planos, dibujá enlaces de fibra/cobre/wireless/VPN entre ellos, agregá cámaras de seguridad con conos de visión, y observá todo actualizándose en tiempo real via WebSocket.

Construido para **equipos NOC**, **MSPs**, **ISPs** e **ingenieros de infraestructura** que necesitan topología visual de red con monitoreo de estado en vivo.

---

## Funcionalidades

### Visualización de Red en Tiempo Real
- Mapas geolocalizados (tiles satelitales, OSM) o basados en imagen (planos de planta, diagramas)
- Nodos arrastrables asociados a monitores de Uptime Kuma con estado UP/DOWN/PENDING en vivo
- Links entre nodos con estilos diferenciados: fibra óptica, cobre, wireless, VPN, MPLS
- Jerarquía de mapas: mapa principal con submapas por sitio — click en un nodo abre el submapa
- Modo de vista pública (`/view/:id`) sin autenticación para displays NOC

### Integración con Uptime Kuma
- Conexión Socket.IO en tiempo real al servidor Kuma (sin API key — usa credenciales de Kuma)
- Acceso opcional a base de datos Kuma (SQLite o MariaDB) para:
  - Historial de uptime extendido y gráficos de disponibilidad
  - Tiempo exacto de inicio de downtime por monitor (badge de tiempo real)
  - Calendario de incidentes con detalle por día
- Proxy de autenticación integrado — el browser nunca se conecta directamente a Kuma

### Diseñador de Infraestructura (Rack Designer)
- Editor visual de racks de piso con arrastrar y soltar
- Tipos: Switch, Patch Panel, Router, Servidor, PDU, Bandeja de Fibra, Organizador de Cable, UPS, genérico
- Configuración por dispositivo con accordion inline de puertos (ver sección Rack Designer)
- Reporte exportable a PDF o Excel (.xlsx) con 4 hojas detalladas
- Soporte de racks de 3U a 48U (incluyendo 9U)

### Cámaras IP y RTSP Liveview
- Proxy de snapshot con autenticación HTTP Digest (Hikvision, Dahua, Axis)
- RTSP Liveview: transcoding server-side RTSP → MJPEG via ffmpeg con FPS configurable
- Templates de URL por fabricante: Hikvision, Dahua, Axis con presets para RTSP, MJPEG y Snapshot
- Cono de visión configurable con rotación, ángulo y alcance ajustables via drag handles
- Click en cámara abre popup PiP flotante con stream en vivo

### PWA Mobile (/mobile)
- App instalable en celular — abrir `http://server:3000/mobile` y "Add to Home Screen"
- Lista de mapas con estado global UP/DOWN y barra de salud por mapa
- Visor de mapa con Leaflet, marcadores coloreados por estado, filtros y detalle de nodo
- Service worker para caché offline y modo sin conexión
- Auto-refresh cada 15 segundos

### Herramientas de Mapa
- Node Templates: 17 plantillas predefinidas en 6 categorías para crear nodos rápidamente
- Auto-Discovery: escaneo de subred con ICMP ping sweep y DNS reverse lookup
- Time Machine: reproducción histórica del estado de monitores
- Portapapeles cross-mapa: copiá un nodo de un mapa y pegalo en otro conservando todos sus datos
- Menú contextual (click derecho) en nodos, racks, cámaras y espacio vacío del mapa
- Ocultar etiquetas: también oculta los tooltips de nombres de nodos

### Operaciones
- Health Check (`/api/health`): verifica conexión Kuma, DB, disco, memoria y frescura de heartbeats — monitoreable por Uptime Kuma
- Deploy automático: botón en la UI para desplegar a múltiples servidores remotos via SSH (git pull → build → pm2 restart)
- Métricas de rendimiento del servidor en tiempo real

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router + Turbopack) |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui |
| Mapa | Leaflet + React-Leaflet + leaflet-contextmenu |
| Diagramas | ReactFlow |
| Tiempo Real | Socket.IO client ↔ Uptime Kuma |
| Base de Datos | SQLite (better-sqlite3) + MariaDB/MySQL (mysql2) |
| Validación | Zod 4 |
| Animaciones | Framer Motion |
| Reportes | html2canvas + jsPDF + ExcelJS |
| Servidor | Custom server.ts (tsx) |
| Deploy | PM2 / systemd en LXC Proxmox |

---

## Inicio Rápido

```bash
git clone https://github.com/flavioGonz/kumamap.git
cd kumamap
npm install

# Crear .env con tus datos
cat > .env << 'EOF'
KUMA_URL=http://localhost:3001
KUMA_USER=admin
KUMA_PASS=changeme
PORT=3000
EOF

npm run build
npm start
```

Navegá a `http://localhost:3000`.

---

## Instalación

### Requisitos Previos

- Node.js 20+ y npm 10+
- Git
- Uptime Kuma corriendo en la misma red o servidor

### Paso 1: Clonar

```bash
git clone https://github.com/flavioGonz/kumamap.git
cd kumamap
npm install
```

### Paso 2: Configurar Variables de Entorno

Creá un archivo `.env` en la raíz:

```env
# ── Conexión a Uptime Kuma (obligatorio) ───────────────────────
KUMA_URL=http://localhost:3001
KUMA_USER=admin
KUMA_PASS=changeme
PORT=3000
NEXT_PUBLIC_BASE_PATH=

# ── Acceso a base de datos de Kuma (opcional pero recomendado) ──
# Habilita: historial de uptime, tiempo real de downtime,
# calendario de incidentes.
#
# Opción A — SQLite (Kuma v1.x, instalación local/bare metal):
KUMA_DB_PATH=/opt/uptime-kuma/data/kuma.db
#
# Opción B — MariaDB/MySQL (Docker Kuma 2.0 o MySQL externo):
# KUMA_DB_HOST=127.0.0.1
# KUMA_DB_PORT=3306
# KUMA_DB_USER=kuma
# KUMA_DB_PASSWORD=
# KUMA_DB_NAME=kuma
```

> **¿No sabés qué DB usa tu Kuma?** Usá la detección automática — ver [Detección de Entorno Kuma](#-deteccion-de-entorno-kuma).

### Paso 3: Compilar e Iniciar

```bash
npm run build
npm start
```

### Paso 4: Auto-inicio con PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # imprime el comando para registrarse en systemd
```

### Usar Base Path (subdirectorio)

Si KumaMap corre en `/maps` en vez de raíz:

```env
NEXT_PUBLIC_BASE_PATH=/maps
```

```bash
NEXT_PUBLIC_BASE_PATH=/maps npm run build
npm start
```

---

## Detección de Entorno Kuma

KumaMap incluye un script que detecta automáticamente cómo está instalado Uptime Kuma y configura el acceso a su base de datos. Ejecutalo en el servidor donde corre Kuma:

```bash
bash deploy/detect-kuma-env.sh
```

### Qué detecta

| Entorno | Cómo lo detecta | Configuración generada |
|---------|----------------|------------------------|
| **Docker + SQLite** (Kuma v1.x) | `docker inspect` busca volumen `kuma.db` | `KUMA_DB_PATH=<ruta-del-volumen>` |
| **Docker + MariaDB** (Kuma 2.0) | `docker inspect` + variables de entorno del container | `KUMA_DB_HOST/PORT/USER/PASS/NAME` |
| **Bare metal + SQLite** | busca `kuma.db` en paths conocidos | `KUMA_DB_PATH=/opt/uptime-kuma/data/kuma.db` |
| **Systemd** | `systemctl show uptime-kuma` para ruta del ejecutable | `KUMA_DB_PATH` desde el WorkingDirectory |
| **Sin acceso DB** | no encontró nada compatible | solo `KUMA_URL` + aviso |

El script:
1. Detecta el tipo de instalación
2. Verifica que el archivo/conexión sea accesible
3. Imprime las variables a agregar al `.env`
4. Opcionalmente las escribe directamente en `.env`

### Ejemplo de salida

```
[detect] Buscando instalación de Uptime Kuma...
[detect] ✓ Encontrado: Docker container 'uptime-kuma'
[detect] ✓ Tipo: MariaDB embebida (Kuma 2.0)
[detect] ✓ Conectividad DB verificada

Variables a agregar a .env:
  KUMA_DB_HOST=127.0.0.1
  KUMA_DB_PORT=3306
  KUMA_DB_USER=kuma
  KUMA_DB_PASSWORD=secret123
  KUMA_DB_NAME=kuma

¿Escribir en .env? [s/N]:
```

---

## Actualización

### Via Script (recomendado para múltiples instancias)

#### Configurar hosts (`deploy/hosts.conf`)

```
# Formato: NOMBRE|SSH_HOST|SSH_PORT|SSH_USER|RUTA_REMOTA
ies|servidor-ies.midominio.com|22|root|/opt/kumamap
st|servidor-st.midominio.com|62128|admin|/opt/kumamap
```

#### Actualizar

```bash
./deploy/update.sh ies           # una instancia
./deploy/update.sh all           # todas
./deploy/update.sh ies --skip-build  # solo git pull + restart
```

El script de actualización:
1. Conecta por SSH
2. Hace `git pull origin master`
3. Si cambiaron `package*.json` → corre `npm install`
4. Corre `npm run build`
5. Reinicia el servicio — **detecta automáticamente PM2 o systemd**

### Actualización Manual

```bash
cd /opt/kumamap
git pull origin master

# Si cambiaron dependencias
npm install

# Rebuild limpio (recomendado si hubo cambios grandes)
rm -rf .next
npm run build

# Reiniciar
pm2 restart kumamap --update-env
# o
sudo systemctl restart kumamap
```

> **Truco:** Siempre hacé `rm -rf .next && npm run build` si aparecen errores de chunk loading (`ChunkLoadError`, recursos con 404/500) después de actualizar. Es un artefacto del build incremental.

### Setup de Servidor Nuevo

```bash
# Agregar host a deploy/hosts.conf, luego:
./deploy/setup-remote.sh cliente1
```

Esto clona el repo, instala Node/dependencias, crea servicio systemd, corre el build y arranca el servicio. Al final muestra el comando para editar el `.env`.

### Rollback

```bash
./deploy/rollback.sh ies            # rollback al commit anterior
./deploy/rollback.sh ies abc1234    # rollback a commit específico
```

---

## Rack Designer

El Rack Designer es el módulo de documentación de infraestructura física integrado en KumaMap. Accedé desde el ícono de rack en la barra lateral del mapa.

### Tipos de Dispositivo

| Tipo | Descripción | Campos Especiales |
|------|-------------|-------------------|
| **Switch** | Switch de red | Puertos con velocidad (10/100/1G/10G), VLAN, PoE (W), Uplink |
| **Patch Panel** | Panel de parcheo | Puertos con destino, dispositivo, largo y color de cable |
| **Router** | Router/Firewall | Interfaces con IP, máscara, tipo (WAN/LAN/DMZ/VLAN) |
| **Servidor** | Servidor físico | CPU, RAM, almacenamiento, SO, dirección IP |
| **PDU** | Unidad de distribución | Cantidad de inputs, llave de corte (circuit breaker) |
| **Bandeja de Fibra** | Bandeja/Cassette | Tipo (Splice/Cassette/LGX), capacidad, conector (LC/SC/MTP), modo (SM/MM/OM3), empalmes |
| **Organizador de Cable** | Organizador horizontal | Campo libre para listar lo que tiene montado |
| **UPS** | Alimentación ininterrumpida | Capacidad VA/W, tiempo de autonomía |

### Accordion Inline de Puertos

Al hacer click en cualquier fila de la tabla de puertos (Switch o Patch Panel), el panel de edición se expande directamente **debajo de esa fila** — sin desplazarse al pie del modal. Click nuevamente en la fila o en la X cierra el accordion.

### Links Inteligentes desde Rack

Al crear un link desde un dispositivo de rack que tiene interfaces configuradas, el selector muestra las interfaces reales del dispositivo en lugar del modal genérico:
- Switch → puertos numerados con indicador de velocidad y estado
- Patch Panel → puertos con destino/dispositivo configurado
- Router → interfaces con nombre, tipo e IP

### Exportar Reportes

**PDF** — reporte con diseño visual del rack y ficha de cada equipo.

**Excel** — archivo `.xlsx` con 4 hojas estilizadas (encabezados navy, filas alternadas):
- **Resumen** — datos generales del rack (nombre, ubicación, UU totales/ocupadas)
- **Equipos** — inventario completo con todas las propiedades de cada dispositivo
- **Patch Panel** — puertos con destino, dispositivo conectado y estado (verde = conectado, gris = libre)
- **Puertos Switch** — velocidad, VLAN, PoE, Uplink y dispositivo conectado

---

## Arquitectura

```
kumamap/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Editor principal de mapas
│   │   ├── view/[id]/                # Vista pública sin autenticación
│   │   └── api/
│   │       ├── maps/                 # CRUD mapas (SQLite local)
│   │       ├── kuma/                 # Proxy + historial DB Kuma
│   │       │   ├── down-since/       # Tiempo de inicio de downtime
│   │       │   ├── history/[id]/     # Historial de uptime por monitor
│   │       │   ├── timeline/         # Timeline de incidentes
│   │       │   └── stream/           # SSE estado en tiempo real
│   │       ├── rack-report/          # Exportar rack a PDF
│   │       ├── rack-report-xlsx/     # Exportar rack a Excel (ExcelJS)
│   │       ├── camera/
│   │       │   ├── snapshot/         # Proxy snapshot (Digest Auth)
│   │       │   └── rtsp-stream/     # RTSP → MJPEG via ffmpeg
│   │       ├── discovery/            # Subnet auto-discovery (ping sweep)
│   │       ├── health/               # Health check endpoint
│   │       └── deploy/               # Remote deploy via SSH
│   ├── components/
│   │   └── network-map/
│   │       ├── LeafletMapView.tsx    # Mapa principal Leaflet
│   │       ├── RackDesignerDrawer.tsx# Diseñador de racks completo
│   │       ├── ContextMenu.tsx       # Menú contextual
│   │       ├── AlertBadge.tsx        # Alertas con timer real
│   │       └── ...
│   ├── hooks/
│   │   ├── useKumaMonitors.ts       # WebSocket de monitores Kuma
│   │   ├── useUndoHistory.ts        # Historial de undo genérico
│   │   ├── useMapVisibility.ts      # Toggles de visibilidad de capas
│   │   ├── useAnimationTimers.ts    # setTimeout con auto-limpieza
│   │   ├── useAlertSound.ts         # Beep de notificación Web Audio
│   │   └── useMapKeyboard.ts        # Atajos de teclado del editor
│   └── lib/
│       ├── db.ts                     # SQLite local (mapas)
│       ├── kuma-db.ts                # Acceso a DB Uptime Kuma
│       └── validation.ts             # Schemas Zod
├── deploy/
│   ├── hosts.conf                    # Inventario de instancias remotas
│   ├── update.sh                     # Actualizar instancias via SSH
│   ├── setup-remote.sh               # Setup inicial servidor nuevo
│   ├── detect-kuma-env.sh            # Detección de entorno Kuma
│   └── rollback.sh                   # Rollback a commit anterior
├── server.ts                         # Servidor HTTP personalizado
└── data/                             # SQLite local + uploads
```

### Flujo de Datos

```
Browser ←─── WebSocket/HTTP ───→ KumaMap Server (Next.js / server.ts)
                                          │
                              Socket.IO ──┤── HTTP proxy
                                          │
                                    Uptime Kuma
                                          │
                                 SQLite / MariaDB (opcional)
```

KumaMap actúa como proxy: el browser nunca se conecta directamente a Kuma. Toda la autenticación y comunicación pasa por el servidor de KumaMap.

---

## Changelog

### v2.2.0 — PWA Mobile, RTSP Liveview y Operaciones *(actual)*

- **PWA Mobile**: app instalable en celular con lista de mapas, visor interactivo con Leaflet, detalle de nodos y modo offline
- **RTSP Liveview**: transcoding RTSP → MJPEG via ffmpeg con templates Hikvision/Dahua/Axis y FPS configurable
- **Node Templates**: 17 plantillas predefinidas en 6 categorías para crear nodos rápidamente
- **Auto-Discovery**: escaneo de subred con ICMP ping sweep + DNS reverse lookup
- **Health Check** (`/api/health`): endpoint monitoreable por Uptime Kuma con checks de DB, disco, memoria y heartbeats
- **Deploy automático**: botón en UI para desplegar a servidores remotos via SSH
- **Métricas de rendimiento**: monitoreo en tiempo real del servidor
- **Fix**: timer de downtime mostraba 00:00:00 — ahora cada monitor muestra su tiempo real individual
- **Fix**: proxy de cámaras bloqueaba IPs privadas (las cámaras están en la red local)
- **Fix**: mobile PWA necesitaba Suspense boundary para Next.js App Router

---

### v2.1.0 — Robustez y Refactoring

- **safeFetch centralizado**: ~45 llamadas `fetch()` reemplazadas con wrapper unificado de manejo de errores y logging
- **safeJsonParse tipado**: 55+ `JSON.parse` inseguros reemplazados con parsing tipado (`NodeCustomData`, `EdgeCustomData`, `RackDeviceSummary`)
- **Fix navegación de mapas enlazados**: corregido bug donde la página parpadeaba sin abrir el mapa al hacer click en un nodo con mapa asignado
- **Custom hooks extraídos**: `useUndoHistory`, `useMapVisibility`, `useAnimationTimers`, `useAlertSound`, `useMapKeyboard` — reducen ~100 líneas de LeafletMapView
- **Reducción de `any`**: de ~60 a ~35 usos en el componente principal

---

### v2.0.0 — Centro de Alertas Profesional

- Nueva página completa de Centro de Alertas (/alerts) con modo NOC
- Hub de seguimiento de alertas en panel lateral
- Timer animado en tiempo real para caídas activas
- Notificación sonora para alertas GRAVE
- Aceptación masiva (ACK) de alertas por grupo
- KPIs en tiempo real: disponibilidad, graves, leves, seguidos
- Gráfico de tendencia de alertas por hora
- Filtros rápidos 15m / 30m / 1h / 6h / 24h / 3d / 7d / 30d

---

### v1.8.0 — Accordion de Puertos + 9U

- **Accordion inline de puertos**: panel de propiedades expandible directamente debajo de la fila seleccionada
- **Rack 9U**: agregado a las opciones de tamaño

---

### v1.7.0 — Rack Designer Avanzado + Mapa

#### Rack Designer
- **Bandeja de Fibra** (`tray-fiber`): campos de tipo de bandeja (Splice/Cassette/LGX), capacidad, conector (LC/SC/ST/FC/MTP), modo de fibra (SM/MM/OM3/OM4), conteo de empalmes
- **Organizador de Cable** (`cable-organizer`): nuevo tipo de dispositivo con campo de texto libre para documentar lo que tiene montado
- **PDU mejorado**: campo numérico de cantidad de inputs de energía + toggle de llave de corte (circuit breaker)
- **Links inteligentes con interfaces reales**: al crear un link desde un dispositivo de rack, muestra sus interfaces reales (puertos switch, puertos patch, interfaces router) con estado de conexión

#### Mapa
- **Copiar nodo cross-mapa**: click derecho → "Copiar nodo" / "Copiar Rack" → click derecho en espacio vacío de otro mapa → "Pegar nodo". Usa `localStorage` como portapapeles compartido (misma origin)
- **Tooltips siguen visibilidad de etiquetas**: al activar "Ocultar etiquetas" también desaparecen los tooltips de hover

#### Reportes
- **Excel con ExcelJS**: 4 hojas estilizadas con encabezados navy (`#1E3A5F`), filas alternadas, colores semánticos por estado de puerto
- **Alertas con timer real de DB**: el badge de tiempo de downtime usa `MIN(heartbeat.time)` de la DB Kuma — tiempo exacto desde la última bajada, no el aproximado del Socket.IO

---

### v1.6.0 — Rack Designer Base + Modularización

- Rack Designer: editor visual completo para Switch, Patch Panel, Router, Servidor, PDU, UPS, genérico
- Reporte de rack a PDF (html2canvas + jsPDF)
- Modularización de componentes principales (`NetworkMapEditor`, `LeafletMapView`, `page.tsx`)
- Validación Zod en todas las APIs
- Notificaciones Sonner con stack de toasts

---

### v1.5.0 — Cámaras RTSP + Time Machine

- Proxy de snapshot con soporte de autenticación HTTP Digest
- Time Machine: slider de reproducción histórica con velocidades 0.5x–10x
- Cono de visión de cámaras con gradiente hacia los bordes
- Handles de rotación de etiqueta on-select

---

### v1.4.0 — Historial y Calendario

- Soporte dual SQLite / MariaDB para datos históricos de Kuma
- Historial de uptime por monitor con barras diarias de disponibilidad
- Calendario de incidentes con detalle por día

---

### v1.3.0 — Submapas y Vista Pública

- Jerarquía de mapas: nodos vinculables a submapas
- Ruta pública `/view/:id` sin login para pantallas NOC
- Exportación de mapa a imagen PNG

---

## Licencia

MIT — libre para uso, modificación y distribución con atribución.
