<p align="center">
  <img src="https://img.shields.io/badge/KumaMap-Visualizaci%C3%B3n%20de%20Red-3b82f6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiMzYjgyZjYiLz48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI2IiBmaWxsPSIjMGEwYTBhIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMyIgZmlsbD0iIzYwYTVmYSIvPjwvc3ZnPg==&logoColor=white" alt="KumaMap" />
</p>

<h1 align="center">KumaMap</h1>

<p align="center">
  <strong>Plataforma de mapeo interactivo de infraestructura de red con monitoreo en tiempo real via Uptime Kuma</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.3.0-3b82f6?style=flat-square" alt="v2.3.0" />
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=flat-square&logo=socket.io" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Leaflet-Mapas-199900?style=flat-square&logo=leaflet" alt="Leaflet" />
  <img src="https://img.shields.io/badge/SQLite%20%2F%20MariaDB-Dual--DB-003B57?style=flat-square&logo=sqlite" alt="SQLite / MariaDB" />
  <img src="https://img.shields.io/badge/Licencia-MIT-green?style=flat-square" alt="MIT License" />
</p>

<p align="center">
  <a href="#-qué-es-kumamap">Qué es</a> &bull;
  <a href="#-capturas">Capturas</a> &bull;
  <a href="#-funcionalidades">Funcionalidades</a> &bull;
  <a href="#-stack-tecnológico">Stack</a> &bull;
  <a href="#-arquitectura">Arquitectura</a> &bull;
  <a href="#-base-de-datos">Base de Datos</a> &bull;
  <a href="#-instalación">Instalación</a> &bull;
  <a href="#-deploy-y-actualización">Deploy</a> &bull;
  <a href="#-api-reference">API</a> &bull;
  <a href="#-changelog">Changelog</a>
</p>

---

## Qué es KumaMap?

**KumaMap** transforma los datos de monitoreo de [Uptime Kuma](https://github.com/louislam/uptime-kuma) en mapas de red interactivos y visualmente impactantes. Arrastrá monitores sobre mapas satelitales o imágenes de planos, dibujá enlaces de fibra/cobre/wireless/VPN entre ellos, agregá cámaras de seguridad con liveview RTSP, diseñá racks completos con documentación de puertos, y observá todo actualizándose en tiempo real via WebSocket.

Construido para **equipos NOC**, **MSPs**, **ISPs** e **ingenieros de infraestructura** que necesitan topología visual de red con monitoreo de estado en vivo.

### Casos de uso

- **MSP multi-cliente**: un mapa por cliente con sus equipos, cámaras y racks. Dashboard centralizado de cámaras por cliente.
- **NOC**: vista pública en pantalla grande (`/view/:id`) con auto-refresh y estado en tiempo real.
- **Documentación de datacenter**: racks con puertos detallados, exportables a PDF y Excel para auditorías.
- **Videovigilancia**: integración ONVIF para descubrimiento automático de cámaras, liveview RTSP con grilla configurable.

---

## Capturas

<!-- Agregar capturas de pantalla aquí -->

### Editor de Mapas
<!-- ![Editor de Mapas](docs/screenshots/map-editor.png) -->
> _Captura del editor principal con mapa satelital, nodos con estado UP/DOWN, enlaces y panel lateral._

### Rack Designer
<!-- ![Rack Designer](docs/screenshots/rack-designer.png) -->
> _Captura del diseñador de racks con accordion de puertos inline y preview visual._

### Centro de Alertas
<!-- ![Centro de Alertas](docs/screenshots/alert-center.png) -->
> _Captura del centro de alertas con KPIs, timeline, y filtros._

### Dashboard de Cámaras
<!-- ![Dashboard de Cámaras](docs/screenshots/camera-dashboard.png) -->
> _Selector de cliente/mapa y grilla de cámaras en vivo (2x2, 3x3, 4x4)._

### ONVIF Discovery
<!-- ![ONVIF Discovery](docs/screenshots/onvif-discovery.png) -->
> _Modal de descubrimiento ONVIF con dispositivos detectados en la red._

### PWA Mobile
<!-- ![PWA Mobile](docs/screenshots/pwa-mobile.png) -->
> _App móvil instalable con mapas, racks, cámaras, alertas y modo offline._

### MikroTik Integration
<!-- ![MikroTik](docs/screenshots/mikrotik-panel.png) -->
> _Panel de estado MikroTik en el rack designer con interfaces, ARP, rutas, DHCP leases._

### Vista Pública (Kiosk)
<!-- ![Vista Pública](docs/screenshots/public-view.png) -->
> _Vista sin autenticación para pantallas NOC con auto-refresh._

---

## Funcionalidades

### Visualización de Red en Tiempo Real
- Mapas geolocalizados (tiles satelitales, OSM, ArcGIS) o basados en imagen (planos de planta, diagramas)
- Nodos arrastrables asociados a monitores de Uptime Kuma con estado UP/DOWN/PENDING en vivo
- Links entre nodos con estilos diferenciados: fibra óptica, cobre, wireless, VPN, MPLS — click en un link muestra tooltip con información del enlace
- Jerarquía de mapas: mapa principal con submapas por sitio — click en un nodo abre el submapa
- Modo de vista pública (`/view/:id`) sin autenticación para displays NOC
- Etiquetas de texto flotantes en el mapa (independientes de nodos)

### Integración con Uptime Kuma
- Conexión Socket.IO en tiempo real al servidor Kuma (sin API key — usa credenciales de Kuma)
- Acceso opcional a base de datos Kuma (SQLite o MariaDB) para historial de uptime, tiempo real de downtime, calendario de incidentes
- Proxy de autenticación integrado — el browser nunca se conecta directamente a Kuma
- Push notifications (Web Push via VAPID) cuando un monitor cambia de estado UP/DOWN

### Cámaras IP y RTSP Liveview
- **Dashboard de cámaras** (`/cameras`): selector de mapa/cliente → grilla de video en vivo con layouts 1x1, 2x2, 3x3, 4x4
- **ONVIF Auto-Discovery**: escaneo de red con WS-Discovery UDP multicast, detección automática de fabricante/modelo, obtención de URI RTSP y snapshot
- Proxy de snapshot con autenticación HTTP Digest (Hikvision, Dahua, Axis)
- RTSP Liveview: transcoding server-side RTSP → MJPEG via ffmpeg con FPS configurable
- Templates de URL por fabricante: Hikvision, Dahua, Axis con presets para RTSP, MJPEG y Snapshot
- Cono de visión configurable con rotación, ángulo y alcance ajustables via drag handles
- Ventanas PiP redimensionables con multi-view simultáneo (hasta 4 cámaras) y posicionamiento por cuadrantes

### Diseñador de Infraestructura (Rack Designer)
- Editor visual de racks de piso con arrastrar y soltar (3U a 48U, incluyendo 9U)
- 8 tipos de dispositivo: Switch, Patch Panel, Router, Servidor, PDU, Bandeja de Fibra, Organizador de Cable, UPS
- Configuración por dispositivo con accordion inline de puertos
- **MikroTik Integration**: panel de estado en tiempo real para routers MikroTik (interfaces, ARP, rutas, DHCP, system resources) via RouterOS REST API
- **SNMP Polling**: consultas SNMP para switches, NVRs (Hikvision ISAPI), PBX con caché y auto-refresh
- Selector de marca por dispositivo (MikroTik, Cisco, Ubiquiti, Juniper, Huawei, TP-Link)
- Links inteligentes con interfaces reales del dispositivo
- Exportación a PDF y Excel (.xlsx con 4 hojas detalladas)

### PWA Mobile (`/mobile`)
- App instalable en celular — abrir `http://server:3000/mobile` y "Agregar a pantalla de inicio"
- 5 tabs: Mapas, Racks, Cámaras, Alertas, Config
- Visor de mapa con Leaflet, marcadores coloreados por estado, filtros y detalle de nodo
- Dashboard de cámaras por cliente con grilla móvil optimizada
- Push notifications para cambios de estado UP/DOWN
- Service worker para caché offline y modo sin conexión

### Herramientas de Mapa
- Node Templates: 17 plantillas predefinidas en 6 categorías
- Auto-Discovery: escaneo de subred con ICMP ping sweep y DNS reverse lookup
- ONVIF Discovery: detección automática de cámaras en la red
- Time Machine: reproducción histórica del estado de monitores
- Portapapeles cross-mapa: copiá un nodo de un mapa y pegalo en otro
- Menú contextual (click derecho) en nodos, racks, cámaras y espacio vacío

### Operaciones
- Health Check (`/api/health`): endpoint monitoreable por Uptime Kuma con checks de DB, disco, memoria y heartbeats
- Deploy automático: botón en UI para desplegar a múltiples servidores remotos via SSH
- Métricas de rendimiento del servidor en tiempo real
- Changelog integrado con badge de novedades y modal de versión

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Framework** | Next.js 16 (App Router + Turbopack) |
| **UI** | React 19 + Tailwind CSS 4 |
| **Mapa** | Leaflet + React-Leaflet |
| **Diagramas** | ReactFlow (@xyflow/react) |
| **Tiempo Real** | Socket.IO 4 (client ↔ Uptime Kuma) + WebSocket propio |
| **Base de Datos** | SQLite (better-sqlite3) para datos propios + MariaDB/MySQL (mysql2) para Kuma DB |
| **Validación** | Zod 4 |
| **Animaciones** | Framer Motion |
| **Reportes** | html2canvas + jsPDF + ExcelJS |
| **Cámaras** | ONVIF (onvif npm) + ffmpeg (RTSP transcoding) |
| **Monitoreo SNMP** | net-snmp |
| **MikroTik** | RouterOS REST API (HTTPS con TLS scoped) |
| **Push** | web-push (VAPID) |
| **Servidor** | Custom server.ts (tsx) con Socket.IO integrado |
| **Deploy** | PM2 / systemd en LXC Proxmox |
| **Iconos** | Lucide React |

---

## Arquitectura

### Estructura del Proyecto

```
kumamap/
├── server.ts                         # Servidor HTTP custom con Socket.IO
├── ecosystem.config.js               # Configuración PM2
├── next.config.ts                     # Config Next.js (basePath, security headers, CSP)
├── data/                              # SQLite DB + uploads (generado en runtime)
│   ├── kumamap.db                     # Base de datos principal
│   └── uploads/                       # Imágenes de fondo y fotos de racks
├── src/
│   ├── proxy.ts                       # Middleware de autenticación (HMAC-SHA256)
│   ├── app/
│   │   ├── page.tsx                   # Editor principal de mapas (desktop)
│   │   ├── alerts/page.tsx            # Centro de alertas con timeline
│   │   ├── cameras/page.tsx           # Dashboard de cámaras (selector + grilla)
│   │   ├── metrics/page.tsx           # Métricas de rendimiento del servidor
│   │   ├── view/[id]/page.tsx         # Vista pública sin autenticación (kiosk)
│   │   ├── mobile/                    # PWA Mobile
│   │   │   ├── page.tsx               # Lista de mapas
│   │   │   ├── map/page.tsx           # Visor de mapa Leaflet
│   │   │   ├── racks/page.tsx         # Lista de racks
│   │   │   ├── rack/page.tsx          # Visor de rack individual
│   │   │   ├── cameras/page.tsx       # Dashboard de cámaras móvil
│   │   │   ├── camera/page.tsx        # Visor de cámara individual
│   │   │   ├── alerts/page.tsx        # Alertas
│   │   │   ├── settings/page.tsx      # Configuración
│   │   │   └── offline/page.tsx       # Modo sin conexión
│   │   └── api/                       # 33+ endpoints REST (ver API Reference)
│   │       ├── auth/                  # Login/sesión
│   │       ├── maps/                  # CRUD mapas + nodos + edges
│   │       ├── kuma/                  # Proxy a Uptime Kuma + historial DB
│   │       ├── cameras/               # Listado de cámaras cross-mapa
│   │       ├── camera/                # Proxy snapshot + RTSP transcoding
│   │       ├── onvif/                 # ONVIF WS-Discovery
│   │       ├── mikrotik/              # MikroTik REST API proxy
│   │       ├── snmp/                  # SNMP polling con caché
│   │       ├── discovery/             # Auto-discovery (ping sweep + DNS)
│   │       ├── rack-report*/          # Exportación PDF/Excel
│   │       ├── health/                # Health check
│   │       ├── metrics/               # Server metrics
│   │       ├── deploy/                # Remote deploy SSH
│   │       ├── push/                  # Web Push subscriptions
│   │       └── version/               # App version info
│   ├── components/
│   │   ├── network-map/               # Componentes del editor de mapas
│   │   │   ├── NetworkMapEditor.tsx   # Orquestador principal
│   │   │   ├── LeafletMapView.tsx     # Mapa Leaflet (224KB - componente más grande)
│   │   │   ├── RackDesignerDrawer.tsx # Diseñador de racks
│   │   │   ├── CameraStreamViewer.tsx # Visor de stream PiP
│   │   │   ├── OnvifDiscoveryModal.tsx# Modal ONVIF discovery
│   │   │   ├── rack/                  # Sub-módulos del rack designer
│   │   │   │   ├── rack-types.ts      # Tipos compartidos
│   │   │   │   ├── RackDeviceEditor.tsx
│   │   │   │   ├── MikrotikStatusPanel.tsx
│   │   │   │   ├── SnmpStatusPanel.tsx
│   │   │   │   └── ...
│   │   │   └── ...
│   │   ├── mobile/                    # Componentes PWA
│   │   │   └── BottomTabBar.tsx       # Dock liquid glass estilo iOS
│   │   ├── MapListView.tsx            # Lista de mapas (desktop)
│   │   ├── LoginPage.tsx              # Autenticación
│   │   └── ChangelogModal.tsx         # Modal de novedades
│   ├── hooks/                         # Custom hooks
│   │   ├── useKumaMonitors.ts         # WebSocket de monitores Kuma
│   │   ├── useMonitorCounts.ts        # Conteo UP/DOWN para badges
│   │   ├── useUndoHistory.ts          # Historial de undo genérico
│   │   └── ...
│   ├── lib/
│   │   ├── db.ts                      # SQLite local (better-sqlite3)
│   │   ├── kuma.ts                    # Cliente Socket.IO a Uptime Kuma
│   │   ├── kuma-db.ts                 # Acceso a DB de Kuma (SQLite/MariaDB)
│   │   ├── mikrotik-client.ts         # Cliente MikroTik REST API
│   │   ├── changelog.ts               # Changelog y versión
│   │   ├── api.ts                     # Helper apiUrl() para basePath
│   │   ├── push-store.ts              # Almacén de suscripciones push
│   │   ├── types.ts                   # Interfaces compartidas
│   │   └── error-handler.ts           # safeFetch, safeJsonParse
│   └── types/
│       └── onvif.d.ts                 # Type declarations para módulo ONVIF
└── deploy/
    ├── hosts.conf                     # Inventario de instancias remotas
    ├── update.sh                      # Actualizar instancias via SSH
    ├── setup-remote.sh                # Setup inicial servidor nuevo
    ├── detect-kuma-env.sh             # Detección automática de entorno Kuma
    └── rollback.sh                    # Rollback a commit anterior
```

### Flujo de Datos

```
                    ┌─────────────────────────────────────────────────┐
                    │                  KumaMap Server                  │
Browser ◄──────────►│  server.ts (HTTP + Socket.IO)                   │
(Desktop/PWA)       │       │                                         │
                    │       ├── Next.js App Router (pages + API)      │
                    │       ├── proxy.ts (auth middleware HMAC-SHA256) │
                    │       └── Socket.IO → forward Kuma events       │
                    └───────┬──────────────┬──────────────┬───────────┘
                            │              │              │
                    ┌───────▼──────┐ ┌─────▼──────┐ ┌────▼──────────┐
                    │  SQLite DB   │ │ Uptime Kuma│ │  Dispositivos │
                    │  kumamap.db  │ │  Socket.IO │ │  de Red       │
                    │              │ │  + DB      │ │               │
                    │  - maps      │ │  (SQLite/  │ │  - Cámaras    │
                    │  - nodes     │ │   MariaDB) │ │    (ONVIF/    │
                    │  - edges     │ │            │ │     RTSP)     │
                    └──────────────┘ └────────────┘ │  - MikroTik   │
                                                    │    (REST API) │
                                                    │  - SNMP       │
                                                    └───────────────┘
```

KumaMap actúa como proxy centralizado: el browser nunca se conecta directamente a Uptime Kuma ni a los dispositivos de red. Toda la autenticación y comunicación pasa por el servidor de KumaMap.

---

## Base de Datos

KumaMap utiliza **dos bases de datos** con propósitos distintos:

### 1. Base de datos propia — SQLite (`data/kumamap.db`)

Almacena toda la información de mapas, nodos y enlaces. Se crea automáticamente al primer inicio. Ubicada en `data/kumamap.db` relativa al directorio de la aplicación.

**Configuración**: `PRAGMA journal_mode = WAL` (Write-Ahead Logging para mejor concurrencia), `PRAGMA foreign_keys = ON`.

#### Tabla `network_maps`

Almacena los mapas de red. Cada mapa representa un sitio, cliente o topología.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | TEXT PK | UUID generado al crear |
| `name` | TEXT NOT NULL | Nombre del mapa (ej: "Oficina Central", "Cliente ABC") |
| `background_type` | TEXT | `'grid'` / `'image'` / `'livemap'` — tipo de fondo |
| `background_image` | TEXT | Path de imagen de fondo (cuando `background_type = 'image'`) |
| `background_scale` | REAL | Escala de la imagen de fondo (default 1.0) |
| `background_offset_x` | REAL | Offset X de la imagen de fondo |
| `background_offset_y` | REAL | Offset Y de la imagen de fondo |
| `kuma_group_id` | INTEGER | ID del grupo de Uptime Kuma asociado (filtra monitores) |
| `parent_id` | TEXT FK → `network_maps(id)` | Mapa padre para jerarquía de submapas |
| `width` | INTEGER | Ancho del canvas (default 1920) |
| `height` | INTEGER | Alto del canvas (default 1080) |
| `view_state` | TEXT | Estado de vista serializado en JSON (zoom, posición) |
| `created_at` | TEXT | Timestamp de creación |
| `updated_at` | TEXT | Timestamp de última modificación |

#### Tabla `network_map_nodes`

Cada nodo es un elemento visual en un mapa: un equipo de red, una cámara, un rack, un label de texto, etc.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | TEXT PK | UUID del nodo |
| `map_id` | TEXT FK → `network_maps(id)` CASCADE | Mapa al que pertenece |
| `kuma_monitor_id` | INTEGER | ID del monitor de Uptime Kuma vinculado (opcional) |
| `label` | TEXT | Etiqueta visible del nodo |
| `x` | REAL NOT NULL | Posición X en el canvas |
| `y` | REAL NOT NULL | Posición Y en el canvas |
| `width` | REAL | Ancho del nodo (default 120) |
| `height` | REAL | Alto del nodo (default 80) |
| `icon` | TEXT | Tipo de ícono: `server`, `router`, `switch`, `camera`, `ap`, `firewall`, `cloud`, `label`, etc. |
| `color` | TEXT | Color personalizado del nodo |
| `custom_data` | TEXT | **JSON extensible** con toda la metadata del nodo (ver abajo) |

**`custom_data` JSON** — Contiene campos dinámicos según el tipo de nodo:

```jsonc
// Nodo genérico
{ "ip": "192.168.1.1", "description": "Router principal", "monitors": [1, 2] }

// Nodo tipo cámara
{ "icon": "camera", "ip": "10.0.0.50", "streamType": "rtsp",
  "streamUrl": "rtsp://admin:pass@10.0.0.50:554/stream1",
  "snapshotInterval": 2, "rtspFps": 5, "description": "Hikvision DS-2CD2143" }

// Nodo con rack
{ "rack": { "name": "Rack A", "height": 42, "devices": [...] } }

// Nodo con submapa vinculado
{ "linkedMapId": "uuid-del-submapa" }
```

#### Tabla `network_map_edges`

Enlaces entre nodos. Representan conexiones físicas o lógicas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | TEXT PK | UUID del enlace |
| `map_id` | TEXT FK → `network_maps(id)` CASCADE | Mapa al que pertenece |
| `source_node_id` | TEXT NOT NULL | Nodo origen |
| `target_node_id` | TEXT NOT NULL | Nodo destino |
| `label` | TEXT | Etiqueta del enlace (ej: "FO 12 hilos") |
| `style` | TEXT | Estilo visual: `solid`, `dashed`, `dotted` |
| `color` | TEXT | Color del enlace (default `#6b7280`) |
| `animated` | INTEGER | 1 = animación de flujo activa |
| `custom_data` | TEXT | JSON con tipo de link, velocidad, interfaces, etc. |

**Índices**: `idx_nodes_map` en `network_map_nodes(map_id)`, `idx_edges_map` en `network_map_edges(map_id)`.

**Relaciones**: los nodos y edges se eliminan en cascada al borrar un mapa. Los submapas (`parent_id`) se desvinculan (`SET NULL`) al borrar el padre.

### 2. Base de datos de Uptime Kuma (solo lectura, opcional)

KumaMap puede conectarse a la base de datos de Uptime Kuma para acceder a datos históricos que no están disponibles via Socket.IO. Soporta tanto **SQLite** (Kuma v1.x, bare metal) como **MariaDB/MySQL** (Kuma 2.0, Docker).

**Datos que se obtienen de la DB de Kuma:**

- Historial de heartbeats por monitor (gráficos de disponibilidad diaria)
- Timestamp exacto de inicio de cada downtime (para los timers en vivo)
- Calendario de incidentes con detalle por día
- Estadísticas de uptime por período

**Configuración** (en `.env`):

```env
# SQLite (Kuma v1.x)
KUMA_DB_PATH=/opt/uptime-kuma/data/kuma.db

# MariaDB/MySQL (Kuma 2.0)
KUMA_DB_HOST=127.0.0.1
KUMA_DB_PORT=3306
KUMA_DB_USER=kumamap_reader
KUMA_DB_PASSWORD=secret
KUMA_DB_NAME=kuma
```

> **Nota de seguridad**: se recomienda crear un usuario de solo lectura para KumaMap en MariaDB (ver `scripts/setup-db-user.sh`).

---

## Instalación

### Requisitos Previos

- Node.js 20+ y npm 10+
- Git
- Uptime Kuma corriendo en la misma red o servidor
- ffmpeg (solo si se usa RTSP liveview)

### Paso 1: Clonar e instalar

```bash
git clone https://github.com/flavioGonz/kumamap.git
cd kumamap
npm install
```

### Paso 2: Configurar variables de entorno

Crear archivo `.env.local` en la raíz del proyecto:

```env
# ── Conexión a Uptime Kuma (obligatorio) ─────────────────────────
KUMA_URL=http://localhost:3001
KUMA_USER=admin
KUMA_PASS=changeme

# ── Servidor ──────────────────────────────────────────────────────
PORT=3000
NEXT_PUBLIC_BASE_PATH=              # dejar vacío si corre en raíz

# ── Secreto de sesión ─────────────────────────────────────────────
SESSION_SECRET=una-clave-segura-aleatoria    # si no se define, usa KUMA_PASS

# ── Acceso a base de datos de Kuma (opcional, recomendado) ────────
# SQLite:
KUMA_DB_PATH=/opt/uptime-kuma/data/kuma.db
# MariaDB:
# KUMA_DB_HOST=127.0.0.1
# KUMA_DB_PORT=3306
# KUMA_DB_USER=kumamap_reader
# KUMA_DB_PASSWORD=secret
# KUMA_DB_NAME=kuma

# ── Push Notifications (opcional) ─────────────────────────────────
# Generar con: npx web-push generate-vapid-keys
# VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
```

> **¿No sabés qué DB usa tu Kuma?** Ejecutá `bash deploy/detect-kuma-env.sh` en el servidor — detecta automáticamente y genera la configuración.

### Paso 3: Compilar e iniciar

```bash
npm run build
npm start
```

### Paso 4: Auto-inicio con PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # genera el comando para registrar en systemd
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

## Deploy y Actualización

### Deploy automático desde la UI

KumaMap incluye un botón de deploy en la interfaz que ejecuta remotamente via SSH: `git pull → npm install → npm run build → pm2 restart`. Configurar los hosts en `deploy/hosts.conf`.

### Via script (múltiples instancias)

```bash
# Configurar hosts
# Formato: NOMBRE|SSH_HOST|SSH_PORT|SSH_USER|RUTA_REMOTA
echo "cliente1|10.0.0.250|22|root|/opt/kumamap" >> deploy/hosts.conf

# Actualizar
./deploy/update.sh cliente1          # una instancia
./deploy/update.sh all               # todas
./deploy/update.sh cliente1 --skip-build  # solo git pull + restart
```

### Setup de servidor nuevo

```bash
./deploy/setup-remote.sh cliente1
```

Clona el repo, instala Node/dependencias, crea servicio, compila y arranca.

### Rollback

```bash
./deploy/rollback.sh cliente1            # al commit anterior
./deploy/rollback.sh cliente1 abc1234    # a commit específico
```

### Actualización manual

```bash
cd /opt/kumamap
git pull origin master
npm install              # si cambiaron dependencias
rm -rf .next             # recomendado si hubo cambios grandes
npm run build
pm2 restart kumamap --update-env
```

---

## API Reference

KumaMap expone 33+ endpoints REST. Los endpoints marcados con 🔓 requieren autenticación (cookie `kumamap_session`). Los marcados con 🌐 son públicos.

### Mapas

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/maps` | 🌐 | Listar todos los mapas |
| POST | `/api/maps` | 🔓 | Crear mapa |
| GET | `/api/maps/:id` | 🌐 | Obtener mapa con nodos y edges |
| PATCH | `/api/maps/:id` | 🔓 | Actualizar mapa |
| DELETE | `/api/maps/:id` | 🔓 | Eliminar mapa |
| PUT | `/api/maps/:id/state` | 🔓 | Guardar nodos y edges |
| POST | `/api/maps/:id/background` | 🔓 | Subir imagen de fondo |
| GET | `/api/maps/:id/export` | 🔓 | Exportar mapa a PNG |
| POST | `/api/maps/import` | 🔓 | Importar mapas desde JSON |

### Uptime Kuma

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/kuma` | 🌐 | Estado de monitores (proxy Socket.IO) |
| GET | `/api/kuma/monitors` | 🌐 | Lista completa de monitores |
| GET | `/api/kuma/stream` | 🌐 | SSE real-time events |
| GET | `/api/kuma/down-since` | 🌐 | Timestamps de inicio de downtime |
| GET | `/api/kuma/history/:id` | 🌐 | Historial de heartbeats |
| GET | `/api/kuma/timeline` | 🔓 | Timeline de incidentes |
| GET | `/api/kuma/report/:id` | 🔓 | Reporte detallado de monitor |
| GET | `/api/kuma/config` | 🔓 | Test de conexión a Kuma |

### Cámaras

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/cameras` | 🌐 | Listar cámaras con stream de todos los mapas |
| GET | `/api/camera/snapshot` | 🌐 | Proxy snapshot (HTTP Digest Auth) |
| GET | `/api/camera/rtsp-stream` | 🌐 | RTSP → MJPEG transcoding (ffmpeg) |
| POST | `/api/onvif/discover` | 🔓 | ONVIF WS-Discovery scan |

### Dispositivos de Red

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/mikrotik/poll` | 🔓 | Poll MikroTik system resources |
| POST | `/api/mikrotik/query` | 🔓 | Query MikroTik REST API (whitelist) |
| POST | `/api/snmp/poll` | 🔓 | SNMP OID queries con caché |
| POST | `/api/discovery` | 🔓 | Subnet auto-discovery (ping + DNS) |

### Exportación

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/rack-report` | 🔓 | Rack report PDF |
| POST | `/api/rack-report-pdf` | 🔓 | Rack report PDF (alternativo) |
| POST | `/api/rack-report-xlsx` | 🔓 | Rack report Excel (4 hojas) |

### Operaciones

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/health` | 🌐 | Health check (Kuma, DB, disco, memoria) |
| GET | `/api/metrics` | 🔓 | Server CPU/memory/uptime |
| POST | `/api/deploy` | 🔓 | Remote deploy via SSH |
| GET | `/api/version` | 🌐 | App version |
| GET/POST | `/api/push` | 🌐/🔓 | Web Push subscriptions |

---

## Changelog

### v2.3.0 — ONVIF Discovery, Dashboard de Cámaras y MikroTik Refactoring *(actual)*

- **Dashboard de Cámaras** (`/cameras`): selector de mapa/cliente → grilla de video en vivo con layouts 1x1, 2x2, 3x3, 4x4
- **PWA Cámaras**: nuevo tab en la barra inferior con selector de cliente y grilla móvil optimizada
- **ONVIF Auto-Discovery**: escaneo de red con WS-Discovery UDP multicast para detectar cámaras automáticamente
- **Agregar cámara desde ONVIF**: un click crea el nodo en el mapa con icono, IP, stream RTSP y fabricante pre-configurados
- **MikroTik seguridad**: credenciales movidas de URL a POST body, TLS scoped por request, módulo compartido con whitelist de paths
- **Selector de marca** en rack device editor: MikroTik, Cisco, Ubiquiti, Juniper, Huawei, TP-Link
- **Ventanas de video redimensionables**: multi-view hasta 4 cámaras simultáneas con posicionamiento por cuadrantes
- **Link tooltip**: click en un enlace muestra tooltip con información del link
- **Fix PWA**: proxy auth permite /api/maps GET sin autenticación para la app móvil

### v2.2.0 — PWA Mobile, RTSP Liveview y Operaciones

- **PWA Mobile**: app instalable con lista de mapas, visor Leaflet, modo offline
- **RTSP Liveview**: transcoding RTSP → MJPEG via ffmpeg con templates Hikvision/Dahua/Axis
- **Node Templates**: 17 plantillas en 6 categorías
- **Auto-Discovery**: subnet scan con ping sweep + DNS reverse
- **Health Check**, **Deploy automático**, **Métricas en tiempo real**

### v2.1.0 — Robustez y Refactoring

- **safeFetch/safeJsonParse**: manejo de errores centralizado y tipado
- **Autenticación**: tokens HMAC-SHA256, rate limiting en login
- **Modularización**: RackDesignerDrawer -67% líneas, custom hooks extraídos

### v2.0.0 — Centro de Alertas Profesional

- Página `/alerts` con modo NOC, KPIs en tiempo real, timeline, filtros, ACK masivo

### v1.9.0 — Rack Designer y Exportaciones

- Diseñador de racks con exportación PNG, PDF y Excel

### v1.8.0 — Accordion de Puertos + 9U

### v1.7.0 — Rack Designer Avanzado + Mapa

- Bandeja de Fibra, Organizador de Cable, PDU mejorado, links inteligentes, cross-map clipboard

### v1.6.0 — Rack Designer Base + Modularización

### v1.5.0 — Cámaras RTSP + Time Machine

### v1.4.0 — Historial y Calendario

### v1.3.0 — Submapas y Vista Pública

---

## Licencia

MIT — libre para uso, modificación y distribución con atribución.
